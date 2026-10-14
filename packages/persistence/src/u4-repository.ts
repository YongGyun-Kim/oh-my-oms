import {
  canonicalJson,
  fingerprint,
  requireCondition,
  U4_PROFILE,
  U4_REGISTRY_VERSION,
  type Ref,
} from '@oms/contracts';
import type { ProtectedStore, WriteRequest, CommitResult } from './protected-store.js';
import type { ProtectedTransaction } from './protected-transaction.js';
import {
  modelDefinition,
  storedModelData,
  validateModel,
  type ModelData,
} from './model-catalog.js';
import { U4_PERSISTENCE_MODELS, U4_U3_MODELS } from './u4-model-catalog.js';

export const U4_SOURCE_CONTRACT = Object.freeze({
  profile: U4_PROFILE,
  registryVersion: U4_REGISTRY_VERSION,
});
interface ProtectedBoundary {
  epoch: string;
  prefixes: { epoch: string; commitOrder: number }[];
}
const revision = (value: ModelData) =>
  Number(value.revision ?? value.aggregateVersion ?? value.sourceVersion ?? value.sourceRevision);
const shared = new Set([
  'RequestReceipt',
  'FactEnvelope',
  'WorkItem',
  'ExecutionPermit',
  'OutboxDelivery',
]);
function same(model: string, left: ModelData | null, right: ModelData | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    canonicalJson(storedModelData(model, left)) === canonicalJson(storedModelData(model, right))
  );
}

// All current-source reads below use the SAME manager that holds the epoch/counter.
// No independent protection connection or repository is awaited inside that lock.
export class U4Transaction {
  private readonly premises = new Map<
    string,
    { model: string; id: string; data: ModelData | null }
  >();
  constructor(
    readonly transaction: ProtectedTransaction,
    private readonly boundary: ProtectedBoundary,
  ) {}
  async current(reference: Ref): Promise<ModelData> {
    requireCondition(
      modelDefinition(reference.entity).owner === reference.owner,
      400,
      'U4_REFERENCE_OWNER',
      '등록된 소유자 원본이 필요합니다.',
    );
    const row = await this.optional(reference.entity, reference.id);
    requireCondition(
      row && revision(row) === reference.revision,
      409,
      'STALE_U4_REFERENCE',
      '현재 보호 원본의 정확한 개정이 필요합니다.',
    );
    return row;
  }
  async optional(model: string, id: string): Promise<ModelData | null> {
    const written = this.transaction.rows().find((row) => row.model === model && row.id === id);
    if (written) {
      const raw = await this.transaction.get(model, id);
      requireCondition(
        !written.deleted && same(model, raw, written.data),
        409,
        'U4_PREMISE_CHANGED',
        '같은 변경의 원본이 다릅니다.',
      );
      return raw;
    }
    const visible = await this.transaction.financialProtectedImage(
      model,
      id,
      this.boundary.prefixes,
    );
    const raw = await this.transaction.get(model, id);
    requireCondition(
      same(model, visible, raw),
      503,
      'CURRENT_U4_NOT_PROTECTED',
      '선행 원본의 보호 확인 후 다시 대조해야 합니다.',
    );
    this.premises.set(model + '/' + id, { model, id, data: visible });
    return raw;
  }
  async assertPremises(): Promise<void> {
    const changes = new Map(this.transaction.rows().map((row) => [row.model + '/' + row.id, row]));
    for (const [key, premise] of this.premises) {
      const change = changes.get(key);
      const current = await this.transaction.get(premise.model, premise.id);
      requireCondition(
        !change?.deleted && same(premise.model, current, change?.data ?? premise.data),
        409,
        'U4_PREMISE_CHANGED',
        '처리 중 원본 전제가 변경되었습니다.',
      );
    }
  }
  lock(
    paymentIds: readonly string[],
    invoiceIds: readonly string[],
    approvalRootIds: readonly string[],
  ): Promise<void> {
    return this.transaction.lockFinancialRows(paymentIds, invoiceIds, approvalRootIds);
  }
}

export class U4Repository {
  constructor(readonly store: ProtectedStore) {}
  private prepare(request: WriteRequest): WriteRequest {
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/SourceContract', request.sourceContract);
    requireCondition(
      ['FinancialSettlement', 'CommercialAgreement', 'OrderAcceptance'].includes(request.owner),
      403,
      'U4_WRITE_OWNER',
      '등록된 금융/약정 소유자만 변경할 수 있습니다.',
    );
    return { ...request, input: { canonicalInputDigest: fingerprint(request.input) } };
  }
  private async boundary(request: WriteRequest): Promise<ProtectedBoundary> {
    const epoch = await this.store.currentEpoch();
    requireCondition(epoch === request.epoch, 503, 'WRITER_FENCED', '현재 쓰기 세대가 아닙니다.');
    const rows = await this.store.primary.query(
      'SELECT epoch,commit_order FROM u1_protected_prefix ORDER BY epoch',
    );
    return {
      epoch,
      prefixes: rows.map((row: { epoch: string; commit_order: string }) => ({
        epoch: row.epoch,
        commitOrder: Number(row.commit_order),
      })),
    };
  }
  async mutate(
    request: WriteRequest,
    revalidate: (scope: U4Transaction) => Promise<void>,
    operation: (scope: U4Transaction, requestId: string) => Promise<void>,
  ): Promise<CommitResult> {
    const prepared = this.prepare(request),
      boundary = await this.boundary(prepared);
    return this.store.execute(
      prepared,
      async (transaction, requestId) => {
        const scope = new U4Transaction(transaction, boundary);
        await revalidate(scope);
        await operation(scope, requestId);
        await revalidate(scope);
        await scope.assertPremises();
        for (const row of transaction.rows()) {
          const own = [...U4_PERSISTENCE_MODELS, ...U4_U3_MODELS].some(
            (model) => model.name === row.model && model.owner === request.owner,
          );
          requireCondition(
            !row.deleted && (own || shared.has(row.model)),
            403,
            'U4_WRITE_OWNER',
            '다른 소유자 변경이나 금융 원본 삭제는 허용하지 않습니다.',
          );
          validateModel(row.model, row.data, this.store.schema);
        }
      },
      async (transaction) => {
        const scope = new U4Transaction(transaction, boundary);
        await revalidate(scope);
        await scope.assertPremises();
      },
    );
  }
  async current(reference: Ref): Promise<ModelData> {
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/Ref', reference);
    requireCondition(
      modelDefinition(reference.entity).owner === reference.owner,
      400,
      'U4_REFERENCE_OWNER',
      '정확한 소유자 참조가 필요합니다.',
    );
    const row = await this.store.currentProtected(reference.entity, reference.id);
    requireCondition(
      row && revision(row) === reference.revision,
      409,
      'STALE_U4_REFERENCE',
      '현재 보호 원본의 정확한 개정이 필요합니다.',
    );
    return row;
  }
  async original(
    request: WriteRequest,
  ): Promise<
    | { knowledge: 'KNOWN'; requestId: string; record: ModelData }
    | { knowledge: 'UNKNOWN'; requestId: string | null }
  > {
    const prepared = this.prepare(request);
    await this.store.currentEpoch();
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
    if (!rows[0]) return { knowledge: 'UNKNOWN', requestId: null };
    requireCondition(
      rows[0].data.inputFingerprint ===
        fingerprint({ sourceContract: prepared.sourceContract, input: prepared.input }),
      409,
      'IDEMPOTENCY_CONFLICT',
      '원래 요청과 입력이 다릅니다.',
    );
    const requestId = String(rows[0].request_id),
      record = await this.store.currentProtected('RequestReceipt', requestId);
    if (!record) return { knowledge: 'UNKNOWN', requestId };
    requireCondition(
      record.principalId === prepared.principalId &&
        record.audience === prepared.audience &&
        record.owner === prepared.owner &&
        record.operation === prepared.operation &&
        record.requestFingerprint === fingerprint(request.input) &&
        record.idempotencyKey === prepared.idempotencyKey &&
        canonicalJson(record.targetIdentity) === canonicalJson(prepared.target) &&
        canonicalJson(record.sourceContract) === canonicalJson(U4_SOURCE_CONTRACT),
      503,
      'U4_ORIGINAL_MISMATCH',
      '보호된 원래 접수/결과를 대조해야 합니다.',
    );
    return { knowledge: 'KNOWN', requestId, record };
  }
}
