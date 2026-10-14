import { randomUUID } from 'node:crypto';
import {
  canonicalJson,
  declareU4Operations,
  ExecutionBudget,
  fingerprint,
  OperationRegistry,
  requireCondition,
  U4_PROFILE,
  U4_REGISTRY_VERSION,
} from '@oms/contracts';
import type {
  CommandMeta,
  InvocationTarget,
  Receipt,
  Ref,
  ServiceContext,
  TargetScope,
} from '@oms/contracts';
import { U4Repository, U4_SOURCE_CONTRACT } from '@oms/persistence';
import type {
  ModelData,
  ProtectedReadSource,
  ProtectedStore,
  ProtectedTransaction,
  U4Transaction,
} from '@oms/persistence';
import { Authorization } from './authorization.js';
import { AuthorizationFence } from './authorization-fence.js';
import { U3CurrentBasis } from './u3-current-basis.js';
import type { U3EvidenceRegistration } from './u3-current-basis.js';
import { ref, u3Ref } from './references.js';
import type { OrderingPolicy } from './scopes.js';

export interface U4CommercialResult {
  target: Ref;
  refs: Ref[];
  before?: Ref | null;
  state?: Receipt['requestState'];
}
export interface U4CommercialAccess {
  scope: TargetScope | null;
  enterpriseRef: Ref;
}
export async function recordedU4CommercialOperation(
  adapter: U4CommercialAdapter,
  scope: U4Transaction,
  input: {
    owner: 'CommercialAgreement' | 'OrderAcceptance';
    operation: string;
    afterRef: Ref;
    beforeRef: Ref | null;
    resultRef: Ref;
    target: InvocationTarget;
    targetScope: TargetScope | null;
    audience: 'CUSTOMER' | 'STAFF';
  },
): Promise<{ history: ModelData; receipt: ModelData }> {
  const model = input.owner === 'CommercialAgreement' ? 'AgreementHistory' : 'OrderHistory';
  const histories = await adapter
    .basis(scope)
    .collection(scope, model, { afterRef: { id: input.afterRef.id } });
  const matches: { history: ModelData; receipt: ModelData }[] = [];
  for (const history of histories) {
    if (
      canonicalJson(history.afterRef) !== canonicalJson(input.afterRef) ||
      canonicalJson(history.beforeRef) !== canonicalJson(input.beforeRef) ||
      history.sourceRevision !== input.afterRef.revision
    )
      continue;
    const receipt = await scope
      .readSource()
      .currentProtected('RequestReceipt', String(history.requestId));
    requireCondition(
      receipt,
      503,
      'U4_RECORDED_SOURCE',
      '원래 보호 접수와 결과 이력이 필요합니다.',
    );
    if (receipt.operation !== input.operation) continue;
    requireCondition(
      history.owner === input.owner &&
        receipt.requestState ===
          (input.operation === 'submitPlannedOrder' ? 'REVIEW_REQUIRED' : 'RESULT_RECORDED') &&
        history.actorAccountRef &&
        receipt.owner === input.owner &&
        receipt.audience === input.audience &&
        receipt.principalId === (history.actorAccountRef as Ref).id &&
        canonicalJson(receipt.targetIdentity) === canonicalJson(input.target) &&
        canonicalJson(receipt.targetScope) === canonicalJson(input.targetScope) &&
        canonicalJson(receipt.sourceContract) === canonicalJson(U4_SOURCE_CONTRACT) &&
        [input.afterRef, input.resultRef].every((reference) =>
          (history.resultRefs as Ref[]).some(
            (value) => canonicalJson(value) === canonicalJson(reference),
          ),
        ) &&
        [input.afterRef, input.resultRef, u3Ref(model, history, adapter.store.schema)].every(
          (reference) =>
            (receipt.resultRefs as Ref[]).some(
              (value) => canonicalJson(value) === canonicalJson(reference),
            ),
        ),
      503,
      'U4_RECORDED_SOURCE',
      '실제 보호된 소유자 접수·이력·결과의 결합이 필요합니다.',
    );
    matches.push({ history, receipt });
  }
  requireCondition(
    matches.length === 1,
    503,
    'U4_RECORDED_SOURCE',
    '원래 접수와 이력 하나를 확인해야 합니다.',
  );
  return matches[0]!;
}
export class U4CommercialAdapter {
  readonly repository: U4Repository;
  private readonly registry: OperationRegistry;
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    readonly staffIngress: (proof: unknown) => Promise<boolean>,
    readonly registration?: U3EvidenceRegistration,
  ) {
    this.repository = new U4Repository(store);
    this.registry = new OperationRegistry(store.schema);
    declareU4Operations(this.registry);
  }
  basis(scope: U4Transaction): U3CurrentBasis {
    return new U3CurrentBasis(this.store, this.now, this.registration, scope.readSource());
  }
  consentAuthorityScope(scope: U4Transaction): import('./u3-current-basis.js').U3BasisScope {
    return {
      transaction: scope.transaction,
      current: async (reference) => {
        const data = await scope.readSource().currentProtected(reference.entity, reference.id);
        requireCondition(
          data &&
            canonicalJson(
              data.modelVersion === 2
                ? u3Ref(reference.entity, data, this.store.schema)
                : ref(reference.entity, data),
            ) === canonicalJson(reference),
          409,
          'U4_CONSENT_AUTHORITY_CHANGED',
          '동의한 고객의 현재 보호 권위 개정이 필요합니다.',
        );
        return data!;
      },
    };
  }
  async authorize(
    context: ServiceContext,
    action: string,
    access: U4CommercialAccess,
    proof: unknown,
    reads?: ProtectedReadSource,
    transaction?: ProtectedTransaction,
  ): Promise<Authorization> {
    const auth = new Authorization(this.store, this.now, reads);
    requireCondition(
      context.audience !== 'SYSTEM',
      403,
      'PERSON_AUTHORITY',
      '현재 사람 권위가 필요합니다.',
    );
    requireCondition(
      context.audience !== 'STAFF' || (await this.staffIngress(proof)),
      403,
      'STAFF_NETWORK_REQUIRED',
      '등록된 사내 망 경로가 필요합니다.',
    );
    const company = access.enterpriseRef;
    requireCondition(
      company.owner === 'EnterpriseAccess' && company.entity === 'Enterprise',
      400,
      'U4_TARGET_SCOPE',
      '정확한 기업 참조가 필요합니다.',
    );
    const enterprise = await auth.lookup('Enterprise', company.id, transaction);
    requireCondition(
      enterprise?.approvalState === 'APPROVED' && enterprise.usageEnabled,
      403,
      'ENTERPRISE_NOT_ENABLED',
      '현재 승인 기업이 필요합니다.',
    );
    if (access.scope === null) {
      requireCondition(
        enterprise.revision === company.revision && context.audience === 'STAFF',
        409,
        'U4_ENTERPRISE_CHANGED',
        '기업 전체 직원 명령의 현재 개정이 필요합니다.',
      );
      await auth.requireStaff(context, action, transaction);
      return auth;
    }
    const target = access.scope;
    requireCondition(
      canonicalJson(target.enterpriseRef) === canonicalJson(company),
      400,
      'U4_TARGET_SCOPE',
      '실제 대상 기업과 조회 범위가 같아야 합니다.',
    );
    const original = await auth.reads.readRevision(
      'Enterprise',
      target.enterpriseRef.id,
      target.organisationRevision,
    );
    requireCondition(
      enterprise?.approvalState === 'APPROVED' &&
        enterprise.usageEnabled &&
        original &&
        target.enterpriseRef.owner === 'EnterpriseAccess' &&
        target.enterpriseRef.entity === 'Enterprise' &&
        target.contextPolicyRef.entity === 'Enterprise' &&
        canonicalJson(target.contextPolicyRef) === canonicalJson(target.enterpriseRef) &&
        target.enterpriseRef.revision === target.organisationRevision,
      409,
      'U4_TARGET_SCOPE',
      '현재 승인 기업과 고정 조직 정책의 정확한 원본이 필요합니다.',
    );
    const policy = original.orderingContextPolicy as OrderingPolicy;
    for (const [field, model, usage] of [
      ['departmentRef', 'Department', 'departmentUsage'],
      ['siteRef', 'BusinessSite', 'siteUsage'],
    ] as const) {
      const reference = target[field];
      requireCondition(
        policy[usage] !== 'UNSET' &&
          (enterprise.orderingContextPolicy as OrderingPolicy)[usage] === policy[usage] &&
          (policy[usage] === 'NOT_USED' ? reference === null : reference !== null),
        409,
        'U4_ORGANISATION_POLICY',
        '원래 조직 사용 정책과 현재 문맥이 일치해야 합니다.',
      );
      if (reference) {
        const current = await auth.lookup(model, reference.id, transaction);
        requireCondition(
          current?.active &&
            current.revision === reference.revision &&
            (current.enterpriseRef as Ref).id === target.enterpriseRef.id,
          409,
          'U4_ORGANISATION_CHANGED',
          '해당 기업의 현재 활성 조직이 필요합니다.',
        );
      }
    }
    if (context.audience === 'STAFF') await auth.requireStaff(context, action, transaction);
    else await auth.requireCustomer(context, action, target, policy, transaction);
    return auth;
  }
  async run<T extends { meta: CommandMeta }>(
    context: ServiceContext,
    owner: 'CommercialAgreement' | 'OrderAcceptance',
    name: string,
    target: InvocationTarget,
    input: T,
    access: U4CommercialAccess,
    proof: unknown,
    change: (scope: U4Transaction, requestId: string) => Promise<U4CommercialResult>,
  ): Promise<Receipt> {
    const operation = this.registry.lookup(owner, name, U4_REGISTRY_VERSION);
    this.store.schema.validate('ServiceContext', context);
    this.store.schema.validate('InvocationTarget', target);
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/Ref', access.enterpriseRef);
    if (access.scope)
      this.store.schema.validateUri(U4_PROFILE + '#/$defs/TargetScope', access.scope);
    this.store.schema.validateUri(operation.input, input);
    const data = input as T & {
      targetScope?: unknown;
      enterpriseRef?: unknown;
      targetRef?: unknown;
      orderRef?: unknown;
      proposalRef?: unknown;
    };
    if (data.targetScope !== undefined)
      requireCondition(
        canonicalJson(data.targetScope) === canonicalJson(access.scope),
        400,
        'U4_TARGET_SCOPE',
        '입력과 실제 검증 범위가 같아야 합니다.',
      );
    if (data.enterpriseRef !== undefined)
      requireCondition(
        canonicalJson(data.enterpriseRef) === canonicalJson(access.enterpriseRef),
        400,
        'U4_TARGET_SCOPE',
        '입력과 실제 검증 기업이 같아야 합니다.',
      );
    requireCondition(
      operation.kind === 'command' &&
        operation.audience.includes(context.audience) &&
        operation.targetKind === target.kind &&
        operation.action,
      403,
      'U4_OPERATION_ACCESS',
      '등록된 사람 명령과 대상이 필요합니다.',
    );
    if (operation.targetSchema) this.store.schema.validateSchema(operation.targetSchema, target);
    if (target.kind === 'RECORD') {
      requireCondition(
        input.meta.expectedRevision === target.recordRef.revision,
        409,
        'STALE_REVISION',
        '정확한 예상 대상 개정이 필요합니다.',
      );
      const embedded = data.targetRef ?? data.orderRef ?? data.proposalRef;
      requireCondition(
        embedded && canonicalJson(embedded) === canonicalJson(target.recordRef),
        400,
        'U4_RECORD_TARGET',
        '입력과 등록된 실제 대상이 같아야 합니다.',
      );
    }
    const remaining = Math.min(
      10000,
      Date.parse(context.deadlineAt) - this.now().getTime(),
      ExecutionBudget.current()?.remaining() ?? 10000,
    );
    requireCondition(
      remaining > 0 && Number.isFinite(remaining),
      503,
      'EXECUTION_DEADLINE',
      '현재 요청 기한이 필요합니다.',
    );
    return new ExecutionBudget(
      Math.floor(remaining),
      () => this.now().getTime(),
      ExecutionBudget.current()?.signal,
    ).run(async () => {
      const authorization = await this.authorize(context, operation.action!, access, proof);
      const snapshot = await new AuthorizationFence(authorization).capture(
        context,
        access.enterpriseRef.id,
      );
      const request = {
        principalId: context.principalId,
        audience: context.audience,
        owner,
        operation: name,
        target,
        idempotencyKey: input.meta.clientRequestId,
        input,
        correlationId: context.correlationId,
        epoch: snapshot.epoch,
        sourceContract: U4_SOURCE_CONTRACT,
      };
      const commit = await this.repository.mutate(
        request,
        async (transaction) => {
          const auth = await this.authorize(
            context,
            operation.action!,
            access,
            proof,
            transaction.readSource(),
            transaction.transaction,
          );
          await new AuthorizationFence(auth).assert(context, snapshot, transaction.transaction);
        },
        async (transaction, requestId) => {
          if (target.kind === 'RECORD') await transaction.current(target.recordRef);
          const result = await change(transaction, requestId);
          for (const reference of result.refs) {
            this.store.schema.validateUri(U4_PROFILE + '#/$defs/Ref', reference);
            requireCondition(
              reference.owner === owner &&
                transaction.transaction
                  .rows()
                  .some(
                    (row) =>
                      row.model === reference.entity &&
                      row.id === reference.id &&
                      row.revision === reference.revision &&
                      !row.deleted,
                  ),
              503,
              'U4_RESULT_NOT_WRITTEN',
              '같은 소유자가 실제 원자 기록한 개정만 반환합니다.',
            );
          }
          requireCondition(
            result.target.owner === owner &&
              result.refs.some(
                (reference) => canonicalJson(reference) === canonicalJson(result.target),
              ),
            503,
            'U4_RESULT_TARGET',
            '실제 결과 대상이 필요합니다.',
          );
          const at = this.now().toISOString();
          const historyName = owner === 'CommercialAgreement' ? 'AgreementHistory' : 'OrderHistory';
          const history = {
            modelVersion: 2,
            historyId: randomUUID(),
            owner,
            actorAccountRef: context.actorAccountRef,
            verifiedPersonRef: context.verifiedPersonRef,
            occurredAt: at,
            reason: input.meta.reason,
            beforeRef: result.before ?? (target.kind === 'RECORD' ? target.recordRef : null),
            afterRef: result.target,
            evidenceRefs: input.meta.evidenceRefs,
            requestId,
            resultRefs: result.refs,
            correctionOf: null,
            sourceRevision: result.target.revision,
          };
          await transaction.transaction.put(historyName, history);
          await transaction.transaction.put('RequestReceipt', {
            requestId,
            principalId: context.principalId,
            audience: context.audience,
            operation: name,
            targetIdentity: target,
            requestFingerprint: fingerprint(input),
            idempotencyKey: input.meta.clientRequestId,
            owner,
            targetScope: access.scope,
            requestState: result.state ?? 'RESULT_RECORDED',
            resultRefs: [...result.refs, u3Ref(historyName, history, this.store.schema)],
            acceptedAt: at,
            updatedAt: at,
            revision: 1,
            correlationId: context.correlationId,
            sourceContract: U4_SOURCE_CONTRACT,
          });
          await transaction.transaction.put('FactEnvelope', {
            eventId: randomUUID(),
            sourceOwner: owner,
            aggregateRef: result.target,
            aggregateVersion: result.target.revision,
            sourceFactRef: result.target,
            targetScope: access.scope,
            causationRequestId: requestId,
            correlationId: context.correlationId,
            schemaVersion: U4_PROFILE,
            supersedesFactRef: null,
            evidenceRefs: input.meta.evidenceRefs,
            occurredAt: at,
            sourceContract: U4_SOURCE_CONTRACT,
          });
        },
      );
      await this.authorize(context, operation.action!, access, proof);
      const record = await this.store.currentProtected('RequestReceipt', commit.requestId);
      requireCondition(
        record && canonicalJson(record.sourceContract) === canonicalJson(U4_SOURCE_CONTRACT),
        503,
        'RECEIPT_NOT_PROTECTED',
        '원래 접수의 별도 보호 확인이 필요합니다.',
      );
      const refs = record.resultRefs as Ref[];
      return this.store.schema.validateUri<Receipt>(U4_PROFILE + '#/$defs/Receipt', {
        requestId: record.requestId,
        requestState: record.requestState,
        owner,
        targetRef: refs.find((reference) => !reference.entity.endsWith('History')) ?? null,
        resultRefs: refs,
        acceptedAt: record.acceptedAt,
        updatedAt: record.updatedAt,
        statusRevision: record.revision,
        retryAfterMilliseconds: null,
      });
    });
  }
}
