import { randomUUID } from 'node:crypto';
import {
  canonicalJson,
  declareU3Operations,
  fingerprint,
  OperationRegistry,
  requireCondition,
  U3_PROFILE,
  U3_REGISTRY_VERSION,
} from '@oms/contracts';
import type {
  CommandMeta,
  InvocationTarget,
  Operation,
  Receipt,
  Ref,
  ServiceContext,
  TargetScope,
} from '@oms/contracts';
import { U3Repository, U3_SOURCE_CONTRACT } from '@oms/persistence';
import type {
  ModelData,
  ProtectedStore,
  ProtectedTransaction,
  U3Owner,
  U3Transaction,
  WriteRequest,
} from '@oms/persistence';
import { Authorization } from './authorization.js';
import { AuthorizationFence } from './authorization-fence.js';
import { enqueueMinimumNotice } from './pending-notification.js';
import type { OrderingPolicy } from './scopes.js';

export interface U3CommandAccess {
  scope: TargetScope | null;
  // Enterprise-only contract operations still verify their exact company.
  enterpriseRef?: Ref;
  customerAction?: string;
}
export interface U3ChangeResult {
  target: Ref;
  refs: Ref[];
  state: Receipt['requestState'];
  before?: Ref | null;
  notice?: boolean;
}
const histories: Record<U3Owner, string> = {
  ProductCatalog: 'CatalogHistory',
  CommercialAgreement: 'AgreementHistory',
  OrderAcceptance: 'OrderHistory',
};

// Used by U3 owners, not a replacement for the API's ingress/MFA admission.
export class U3Commands {
  readonly repository: U3Repository;
  readonly authorization: Authorization;
  private readonly fence: AuthorizationFence;
  private readonly registry: OperationRegistry;
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
  ) {
    this.repository = new U3Repository(store);
    this.authorization = new Authorization(store, now);
    this.fence = new AuthorizationFence(this.authorization);
    this.registry = new OperationRegistry(store.schema);
    declareU3Operations(this.registry);
  }
  private operation<T extends { meta: CommandMeta }>(
    context: ServiceContext,
    owner: U3Owner,
    name: string,
    target: InvocationTarget,
    input: T,
    access: U3CommandAccess,
  ): Operation {
    const operation = this.registry.lookup(owner, name, U3_REGISTRY_VERSION);
    requireCondition(
      operation.kind === 'command' &&
        operation.audience.includes(context.audience) &&
        context.audience !== 'SYSTEM',
      403,
      'U3_PERSON_COMMAND',
      '현재 사람 명령의 등록된 접근 경로가 필요합니다.',
    );
    this.store.schema.validate('ServiceContext', context);
    this.store.schema.validate('InvocationTarget', target);
    requireCondition(
      target.kind === operation.targetKind,
      400,
      'TARGET_MISMATCH',
      '등록된 명령 대상이 필요합니다.',
    );
    if (operation.targetSchema) this.store.schema.validateSchema(operation.targetSchema, target);
    this.store.schema.validateUri(operation.input, input);
    const data = input as unknown as ModelData;
    if (data.targetScope !== undefined)
      requireCondition(
        canonicalJson(data.targetScope) === canonicalJson(access.scope),
        400,
        'U3_TARGET_SCOPE',
        '입력과 실제 검증할 고정 TargetScope가 다릅니다.',
      );
    if (data.enterpriseRef !== undefined)
      requireCondition(
        canonicalJson(data.enterpriseRef) ===
          canonicalJson(access.enterpriseRef ?? access.scope?.enterpriseRef ?? null),
        400,
        'U3_ENTERPRISE_TARGET',
        '입력과 검증할 기업이 다릅니다.',
      );
    if (target.kind === 'RECORD') {
      requireCondition(
        input.meta.expectedRevision === target.recordRef.revision,
        409,
        'STALE_REVISION',
        '대상 참조와 예상 개정을 일치시켜야 합니다.',
      );
      const embedded = data.targetRef ?? data.proposalRef;
      if (embedded)
        requireCondition(
          canonicalJson(embedded) === canonicalJson(target.recordRef),
          400,
          'U3_RECORD_TARGET',
          '입력과 호출의 실제 대상이 다릅니다.',
        );
    }
    return operation;
  }
  private async targetScope(
    scope: TargetScope,
    transaction?: ProtectedTransaction,
  ): Promise<OrderingPolicy> {
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/TargetScope', scope);
    requireCondition(
      scope.contextPolicyRef.owner === 'EnterpriseAccess' &&
        scope.contextPolicyRef.entity === 'Enterprise' &&
        scope.contextPolicyRef.id === scope.enterpriseRef.id &&
        scope.contextPolicyRef.revision === scope.organisationRevision &&
        scope.enterpriseRef.revision === scope.organisationRevision,
      400,
      'U3_POLICY_REFERENCE',
      '고정 기업·조직정책의 원래 개정이 필요합니다.',
    );
    const enterprise = await this.authorization.lookup(
      'Enterprise',
      scope.enterpriseRef.id,
      transaction,
    );
    requireCondition(
      enterprise?.approvalState === 'APPROVED' && enterprise.usageEnabled,
      403,
      'ENTERPRISE_NOT_ENABLED',
      '현재 승인·이용 가능한 기업이 필요합니다.',
    );
    const original = await this.store.readRevision(
      'Enterprise',
      scope.enterpriseRef.id,
      scope.organisationRevision,
    );
    requireCondition(original, 409, 'U3_ORIGINAL_POLICY', '원래 고정 조직 정책을 확인해야 합니다.');
    const originalPolicy = original.orderingContextPolicy as OrderingPolicy;
    const currentPolicy = enterprise.orderingContextPolicy as OrderingPolicy;
    for (const [field, model, usage] of [
      ['departmentRef', 'Department', 'departmentUsage'],
      ['siteRef', 'BusinessSite', 'siteUsage'],
    ] as const) {
      const reference = scope[field];
      requireCondition(
        originalPolicy[usage] !== 'UNSET' &&
          currentPolicy[usage] === originalPolicy[usage] &&
          (originalPolicy[usage] === 'NOT_USED' ? reference === null : reference !== null),
        409,
        'U3_ORGANISATION_POLICY',
        '원래 문맥과 현재 조직 사용 정책을 다시 확인해야 합니다.',
      );
      if (reference) {
        const organisation = await this.authorization.lookup(model, reference.id, transaction);
        requireCondition(
          organisation?.active &&
            (organisation.enterpriseRef as Ref).id === scope.enterpriseRef.id &&
            organisation.revision === reference.revision,
          409,
          'U3_ORGANISATION_CHANGED',
          '해당 기업의 현재 활성 조직과 정확한 개정이 필요합니다.',
        );
      }
    }
    return originalPolicy;
  }
  private async authorize(
    context: ServiceContext,
    operation: Operation,
    access: U3CommandAccess,
    transaction?: ProtectedTransaction,
  ): Promise<void> {
    if (context.audience === 'STAFF') {
      requireCondition(
        operation.action,
        403,
        'U3_ACTION_REQUIRED',
        '직원 명령의 명시 행위가 필요합니다.',
      );
      await this.authorization.requireStaff(context, operation.action, transaction);
    } else {
      requireCondition(
        context.audience === 'CUSTOMER' && access.scope,
        403,
        'U3_CUSTOMER_SCOPE',
        '고객 명령의 정확한 대상 범위가 필요합니다.',
      );
      const policy = await this.targetScope(access.scope, transaction);
      const action = operation.action ?? access.customerAction;
      requireCondition(
        action && ['order.submit', 'order.read', 'contract.change.request'].includes(action),
        403,
        'U3_CUSTOMER_ACTION',
        '고객 대상의 명시 업무 행위가 필요합니다.',
      );
      await this.authorization.requireCustomer(context, action, access.scope, policy, transaction);
    }
    if (access.scope && context.audience === 'STAFF')
      await this.targetScope(access.scope, transaction);
    if (access.enterpriseRef) {
      this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', access.enterpriseRef);
      requireCondition(
        access.enterpriseRef.owner === 'EnterpriseAccess' &&
          access.enterpriseRef.entity === 'Enterprise',
        400,
        'U3_ENTERPRISE_TARGET',
        '실제 기업 참조가 필요합니다.',
      );
      const enterprise = await this.authorization.lookup(
        'Enterprise',
        access.enterpriseRef.id,
        transaction,
      );
      requireCondition(
        enterprise?.revision === access.enterpriseRef.revision &&
          enterprise.approvalState === 'APPROVED' &&
          enterprise.usageEnabled,
        409,
        'U3_ENTERPRISE_CHANGED',
        '현재 승인 기업의 정확한 개정이 필요합니다.',
      );
    }
  }
  private request<T extends { meta: CommandMeta }>(
    context: ServiceContext,
    owner: U3Owner,
    operation: string,
    target: InvocationTarget,
    input: T,
    epoch: string,
  ): WriteRequest {
    return {
      principalId: context.principalId,
      audience: context.audience,
      owner,
      operation,
      target,
      idempotencyKey: input.meta.clientRequestId,
      input,
      correlationId: context.correlationId,
      epoch,
      sourceContract: U3_SOURCE_CONTRACT,
    };
  }
  async run<T extends { meta: CommandMeta }>(
    context: ServiceContext,
    owner: U3Owner,
    name: string,
    target: InvocationTarget,
    input: T,
    access: U3CommandAccess,
    apply: (scope: U3Transaction, requestId: string) => Promise<U3ChangeResult>,
  ): Promise<Receipt> {
    const operation = this.operation(context, owner, name, target, input, access);
    await this.authorize(context, operation, access);
    const snapshot = await this.fence.capture(
      context,
      access.scope?.enterpriseRef.id ?? access.enterpriseRef?.id ?? null,
    );
    const request = this.request(context, owner, name, target, input, snapshot.epoch);
    const commit = await this.repository.mutate(
      request,
      async (transaction) => {
        await this.authorize(context, operation, access, transaction);
        await this.fence.assert(context, snapshot, transaction);
      },
      async (scope, requestId) => {
        if (target.kind === 'RECORD') await scope.current(target.recordRef);
        if (name === 'submitOrder') {
          const enterprise = await scope.current(access.scope!.enterpriseRef);
          requireCondition(
            enterprise.revision === access.scope!.organisationRevision,
            409,
            'U3_ORGANISATION_REVISION',
            '새 주문은 현재 기업 조직 개정에 제출해야 합니다.',
          );
        }
        const result = await apply(scope, requestId);
        this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', result.target);
        requireCondition(
          result.target.owner === owner &&
            result.refs.some((value) => canonicalJson(value) === canonicalJson(result.target)),
          503,
          'U3_RESULT_TARGET',
          '결과는 실제 같은 업무 소유자의 변경을 가리켜야 합니다.',
        );
        for (const reference of result.refs) {
          this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', reference);
          const written = scope.transaction
            .rows()
            .find(
              (row) =>
                row.model === reference.entity &&
                row.id === reference.id &&
                row.revision === reference.revision &&
                !row.deleted,
            );
          requireCondition(
            reference.owner === owner && written,
            503,
            'U3_RESULT_NOT_WRITTEN',
            '실제 원자 기록한 개정만 결과로 반환합니다.',
          );
        }
        const at = this.now().toISOString();
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
        await scope.transaction.put(histories[owner], history);
        const historyRef: Ref = {
          owner,
          entity: histories[owner],
          id: history.historyId,
          revision: history.sourceRevision,
        };
        await scope.transaction.put('RequestReceipt', {
          requestId,
          principalId: context.principalId,
          audience: context.audience,
          operation: name,
          targetIdentity: target,
          requestFingerprint: fingerprint(input),
          idempotencyKey: input.meta.clientRequestId,
          owner,
          targetScope: access.scope,
          requestState: result.state,
          resultRefs: [...result.refs, historyRef],
          acceptedAt: at,
          updatedAt: at,
          revision: 1,
          correlationId: context.correlationId,
          sourceContract: U3_SOURCE_CONTRACT,
        });
        if (result.notice) {
          requireCondition(
            result.target.owner === 'OrderAcceptance' && result.target.entity === 'Order',
            503,
            'U3_NOTICE_PURPOSE',
            '등록된 원래 주문 최소 통지만 전달합니다.',
          );
          await enqueueMinimumNotice(
            scope.transaction,
            context,
            requestId,
            result.target,
            access.scope,
            snapshot.epoch,
            this.now(),
            U3_SOURCE_CONTRACT,
          );
        } else {
          await scope.transaction.put('FactEnvelope', {
            eventId: randomUUID(),
            sourceOwner: owner,
            aggregateRef: result.target,
            aggregateVersion: result.target.revision,
            sourceFactRef: result.target,
            targetScope: access.scope,
            causationRequestId: requestId,
            correlationId: context.correlationId,
            schemaVersion: U3_PROFILE,
            supersedesFactRef: null,
            evidenceRefs: input.meta.evidenceRefs,
            occurredAt: at,
            sourceContract: U3_SOURCE_CONTRACT,
          });
        }
      },
    );
    await this.authorize(context, operation, access);
    const record = await this.store.currentProtected('RequestReceipt', commit.requestId);
    requireCondition(
      record && canonicalJson(record.sourceContract) === canonicalJson(U3_SOURCE_CONTRACT),
      503,
      'RECEIPT_NOT_PROTECTED',
      '원래 접수의 별도 보호 확인이 필요합니다.',
    );
    return this.receipt(record);
  }
  async original<T extends { meta: CommandMeta }>(
    context: ServiceContext,
    owner: U3Owner,
    name: string,
    target: InvocationTarget,
    input: T,
    access: U3CommandAccess,
  ): Promise<
    | { knowledge: 'KNOWN'; receipt: Receipt }
    | { knowledge: 'UNKNOWN'; requestId: string | null; reasonCode: string }
  > {
    const operation = this.operation(context, owner, name, target, input, access);
    await this.authorize(context, operation, access);
    const original = await this.repository.original(
      this.request(context, owner, name, target, input, await this.store.currentEpoch()),
    );
    await this.authorize(context, operation, access);
    return original.knowledge === 'KNOWN'
      ? { knowledge: 'KNOWN', receipt: this.receipt(original.record) }
      : original;
  }
  private receipt(record: ModelData): Receipt {
    const refs = record.resultRefs as Ref[];
    return this.store.schema.validateUri<Receipt>(U3_PROFILE + '#/$defs/Receipt', {
      requestId: record.requestId,
      requestState: record.requestState,
      owner: record.owner,
      targetRef: refs.find((value) => !value.entity.endsWith('History')) ?? null,
      resultRefs: refs,
      acceptedAt: record.acceptedAt,
      updatedAt: record.updatedAt,
      statusRevision: record.revision,
      retryAfterMilliseconds: null,
    });
  }
}
