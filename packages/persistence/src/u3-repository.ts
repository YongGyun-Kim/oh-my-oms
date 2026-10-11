import {
  canonicalJson,
  fingerprint,
  requireCondition,
  U3_PROFILE,
  U3_REGISTRY_VERSION,
} from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import type { CommitResult, ProtectedStore, WriteRequest } from './protected-store.js';
import type { ProtectedTransaction } from './protected-transaction.js';
import {
  modelDefinition,
  modelForData,
  rowModelVersion,
  validateModel,
  type ModelData,
} from './model-catalog.js';
import { U3_MODELS } from './u3-model-catalog.js';
import { validateU3RecoveryImage } from './u3-recovery-payload.js';

export const U3_SOURCE_CONTRACT = Object.freeze({
  profile: U3_PROFILE,
  registryVersion: U3_REGISTRY_VERSION,
});
export type U3Owner = 'ProductCatalog' | 'CommercialAgreement' | 'OrderAcceptance';
const sharedModels = new Set([
  'RequestReceipt',
  'FactEnvelope',
  'WorkItem',
  'ExecutionPermit',
  'OutboxDelivery',
]);
const revision = (row: ModelData) =>
  Number(row.revision ?? row.aggregateVersion ?? row.sourceRevision ?? row.sourceVersion);

// DB NULL과 보호 원본의 생략은 등록된 선택·nullable 필드에서만 동등하다.
// 원본 검증 후 비교용 복사본만 정규화하며 보호 bytes와 반환값은 보존한다.
function sameCurrentImage(
  repository: U3Repository,
  model: string,
  left: ModelData,
  right: ModelData,
): boolean {
  const comparable = (image: ModelData) => {
    validateModel(model, image, repository.store.schema);
    const definition = modelForData(model, image);
    const nullableOptional = new Set(
      definition.attributes
        .filter(
          (attribute) =>
            !attribute.required &&
            attribute.nullable === true &&
            !['modelVersion', 'sourceContract'].includes(attribute.name),
        )
        .map((attribute) => attribute.name),
    );
    return Object.fromEntries(
      Object.entries(image).filter(
        ([name, value]) => !nullableOptional.has(name) || (value !== null && value !== undefined),
      ),
    );
  };
  return canonicalJson(comparable(left)) === canonicalJson(comparable(right));
}

// A scope is private to one primary transaction; concurrent callers never share premises.
export class U3Transaction {
  private readonly premises = new Map<string, { reference: Ref; data: ModelData }>();
  constructor(
    readonly repository: U3Repository,
    readonly transaction: ProtectedTransaction,
  ) {}
  async current(reference: Ref): Promise<ModelData> {
    const visible = await this.repository.current(reference);
    const raw = await this.transaction.get(reference.entity, reference.id);
    requireCondition(
      raw && sameCurrentImage(this.repository, reference.entity, raw, visible),
      503,
      'CURRENT_U3_NOT_PROTECTED',
      '현재 원본의 보호 bytes를 확인해야 합니다.',
    );
    const key = reference.entity + '/' + reference.id;
    const previous = this.premises.get(key);
    requireCondition(
      !previous || sameCurrentImage(this.repository, reference.entity, previous.data, visible),
      409,
      'U3_PREMISE_CHANGED',
      '같은 판단의 원본 전제가 변경됐습니다.',
    );
    this.premises.set(key, {
      reference: structuredClone(reference),
      data: structuredClone(visible),
    });
    return raw;
  }
  async assertPremises(): Promise<void> {
    for (const { reference, data } of this.premises.values()) {
      const visible = await this.repository.current(reference);
      requireCondition(
        sameCurrentImage(this.repository, reference.entity, visible, data),
        409,
        'U3_PREMISE_CHANGED',
        '원래 판단 전제의 보호 개정이 변경됐습니다.',
      );
      const raw = await this.transaction.get(reference.entity, reference.id);
      const written = this.transaction
        .rows()
        .find((row) => row.model === reference.entity && row.id === reference.id);
      requireCondition(
        raw &&
          !written?.deleted &&
          sameCurrentImage(this.repository, reference.entity, raw, written?.data ?? data),
        503,
        'CURRENT_U3_NOT_PROTECTED',
        '현재 원본 또는 예정된 변경과 일치하지 않습니다.',
      );
    }
  }
}

export type U3OriginalResult =
  | { knowledge: 'KNOWN'; requestId: string; record: ModelData }
  | {
      knowledge: 'UNKNOWN';
      requestId: string | null;
      reasonCode: 'NO_ORIGINAL' | 'PROTECTION_UNCONFIRMED';
    };

export class U3Repository {
  constructor(readonly store: ProtectedStore) {}
  async current(reference: Ref): Promise<ModelData> {
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', reference);
    requireCondition(
      modelDefinition(reference.entity).owner === reference.owner,
      400,
      'U3_REFERENCE_OWNER',
      '등록 원본 소유자와 참조가 다릅니다.',
    );
    const value = await this.store.currentProtected(reference.entity, reference.id);
    requireCondition(
      value && revision(value) === reference.revision,
      409,
      'STALE_U3_REFERENCE',
      '현재 보호 원본의 정확한 개정이 필요합니다.',
    );
    return value;
  }
  private request(request: WriteRequest): WriteRequest {
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/SourceContract', request.sourceContract);
    requireCondition(
      canonicalJson(request.sourceContract) === canonicalJson(U3_SOURCE_CONTRACT),
      400,
      'U3_SOURCE_CONTRACT',
      '실제 U3 등록 계약이 필요합니다.',
    );
    requireCondition(
      ['ProductCatalog', 'CommercialAgreement', 'OrderAcceptance'].includes(request.owner),
      400,
      'U3_OWNER',
      '등록된 U3 업무 소유자만 변경합니다.',
    );
    return { ...request, input: { canonicalInputDigest: fingerprint(request.input) } };
  }
  async mutate(
    request: WriteRequest,
    revalidate: (transaction: ProtectedTransaction) => Promise<void>,
    operation: (scope: U3Transaction, requestId: string) => Promise<void>,
  ): Promise<CommitResult> {
    const prepared = this.request(request);
    return this.store.execute(prepared, async (transaction, requestId) => {
      const scope = new U3Transaction(this, transaction);
      await revalidate(transaction);
      await operation(scope, requestId);
      await scope.assertPremises();
      await revalidate(transaction);
      for (const row of transaction.rows()) {
        requireCondition(
          sharedModels.has(row.model) ||
            U3_MODELS.some((model) => model.name === row.model && model.owner === request.owner),
          403,
          'U3_WRITE_OWNER',
          '다른 업무 소유자의 원본을 직접 변경할 수 없습니다.',
        );
        validateU3RecoveryImage(row.model, row.schemaVersion, row.data);
        requireCondition(
          !U3_MODELS.some((model) => model.name === row.model) ||
            rowModelVersion(row.model, row.data) === 2,
          400,
          'U3_LEGACY_WRITE',
          '구형 원본 자동 전환 경로는 제공하지 않습니다.',
        );
      }
    });
  }
  async original(request: WriteRequest): Promise<U3OriginalResult> {
    const prepared = this.request(request);
    await this.store.currentEpoch();
    // Must match ProtectedStore.execute's complete principal/audience/owner/operation/target/key scope.
    const scopedKey = fingerprint({
      principalId: prepared.principalId,
      audience: prepared.audience,
      owner: prepared.owner,
      operation: prepared.operation,
      target: prepared.target,
      key: prepared.idempotencyKey,
    });
    const rows = await this.store.primary.query(
      'SELECT request_id,data FROM u1_request_key WHERE scoped_key=$1',
      [scopedKey],
    );
    if (!rows[0]) return { knowledge: 'UNKNOWN', requestId: null, reasonCode: 'NO_ORIGINAL' };
    requireCondition(
      rows[0].data.inputFingerprint ===
        fingerprint({ sourceContract: prepared.sourceContract, input: prepared.input }),
      409,
      'IDEMPOTENCY_CONFLICT',
      '같은 원래 요청의 내용이 다릅니다.',
    );
    const requestId = String(rows[0].request_id);
    const record = await this.store.read('RequestReceipt', requestId);
    if (!record) return { knowledge: 'UNKNOWN', requestId, reasonCode: 'PROTECTION_UNCONFIRMED' };
    await this.store.currentProtected('RequestReceipt', requestId);
    requireCondition(
      record.principalId === prepared.principalId &&
        record.audience === prepared.audience &&
        record.owner === prepared.owner &&
        record.operation === prepared.operation &&
        record.requestFingerprint === fingerprint(request.input) &&
        record.idempotencyKey === prepared.idempotencyKey &&
        canonicalJson(record.targetIdentity) === canonicalJson(prepared.target) &&
        canonicalJson(record.sourceContract) === canonicalJson(U3_SOURCE_CONTRACT),
      503,
      'U3_ORIGINAL_MISMATCH',
      '보호된 원래 요청/결과/등록 계약을 대조해야 합니다.',
    );
    return { knowledge: 'KNOWN', requestId, record };
  }
}
