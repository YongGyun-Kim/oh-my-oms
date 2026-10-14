import { randomUUID } from 'node:crypto';
import {
  canonicalJson,
  declareU4Operations,
  ExecutionBudget,
  fingerprint,
  OperationRegistry,
  requireCondition,
  U4_PROFILE,
  OmsError,
} from '@oms/contracts';
import { QueryFailedError } from 'typeorm';
import type {
  CommandMeta,
  InvocationTarget,
  Receipt,
  Ref,
  ServiceContext,
  TargetScope,
  U4Evidence,
} from '@oms/contracts';
import { U4_SOURCE_CONTRACT } from '@oms/persistence';
import type { U4Transaction } from '@oms/persistence';
import { AuthorizationFence } from './authorization-fence.js';
import { ref, u4Ref } from './references.js';
import { U4CommercialAdapter } from './u4-commercial-adapter.js';

export interface U4FinancialResult {
  target: Ref;
  refs: Ref[];
  before: Ref | null;
  state?: Receipt['requestState'];
  sourceRefs?: Ref[];
}
export interface U4FinancialMutation {
  historyRef: Ref;
  epoch: string;
  requestDigest: string;
  personSources: Ref[];
}
export function u4FinancialMutationError(error: unknown): unknown {
  // DB의 유한 lock 진입 실패만 분류하며 원래 예외를 응답 속성으로 보존하지 않는다.
  return error instanceof QueryFailedError &&
    (error.driverError as { code?: unknown }).code === '55P03'
    ? new OmsError(
        503,
        'U4_FINANCIAL_BUSY',
        '금융 원본이 처리 중입니다. 원래 요청의 결과를 재확인하세요.',
      )
    : error;
}
export class U4FinancialAccess {
  private readonly registry: OperationRegistry;
  constructor(readonly adapter: U4CommercialAdapter) {
    this.registry = new OperationRegistry(adapter.store.schema);
    declareU4Operations(this.registry);
  }
  async run<T extends { meta: CommandMeta; targetScope: TargetScope; sourceEvidence?: U4Evidence }>(
    context: ServiceContext,
    name: string,
    target: InvocationTarget,
    input: T,
    proof: unknown,
    change: (scope: U4Transaction, mutation: U4FinancialMutation) => Promise<U4FinancialResult>,
  ): Promise<Receipt> {
    const { adapter } = this,
      { store, now } = adapter;
    const operation = this.registry.lookup('FinancialSettlement', name, 4);
    store.schema.validate('ServiceContext', context);
    store.schema.validateUri(operation.input, input);
    store.schema.validate('InvocationTarget', target);
    requireCondition(
      operation.audience.includes(context.audience) &&
        context.audience === 'STAFF' &&
        operation.action === 'financial.manage' &&
        operation.kind === 'command' &&
        target.kind === operation.targetKind,
      403,
      'U4_FINANCIAL_ACCESS',
      '현재 직원 금융 등록 행위와 정확한 대상이 필요합니다.',
    );
    if (operation.targetSchema) store.schema.validateSchema(operation.targetSchema, target);
    if (target.kind === 'RECORD')
      requireCondition(
        input.meta.expectedRevision === target.recordRef.revision,
        409,
        'STALE_REVISION',
        '정확한 금융 대상 개정이 필요합니다.',
      );
    if (target.kind === 'RECORD') {
      const field = (
        {
          registerInvoice: 'orderRef',
          correctInvoice: 'correctionOf',
          cancelInvoice: 'invoiceRef',
          confirmPaymentEvidence: 'paymentEvidenceRef',
          correctPaymentEvidence: 'paymentEvidenceRef',
          correctPaymentBinding: 'paymentEvidenceRef',
          allocatePaymentBatch: 'paymentEvidenceRef',
          reverseAllocation: 'allocationRef',
          evaluateFinancialEligibility: 'orderRef',
          recordRestriction: 'orderRef',
          reconcileInvoiceDue: 'invoiceRef',
        } as Record<string, string>
      )[name];
      requireCondition(
        field &&
          canonicalJson((input as unknown as Record<string, unknown>)[field]) ===
            canonicalJson(target.recordRef),
        400,
        'U4_RECORD_TARGET',
        '등록된 금융 대상과 실제 입력 원본이 같아야 합니다.',
      );
    }
    requireCondition(
      name === 'evaluateFinancialEligibility' ||
        (input.sourceEvidence &&
          canonicalJson(input.sourceEvidence.verifiedByRef) ===
            canonicalJson(context.actorAccountRef) &&
          Date.parse(input.sourceEvidence.verifiedAt) <= now().getTime()),
      400,
      'U4_EVIDENCE_ACTOR',
      '현재 확인 직원과 실제 근거 확인 시각이 필요합니다.',
    );
    const access = { scope: input.targetScope, enterpriseRef: input.targetScope.enterpriseRef };
    const authorize = (scope?: U4Transaction) =>
      adapter.authorize(
        context,
        operation.action!,
        access,
        proof,
        scope?.readSource(),
        scope?.transaction,
      );
    const remaining = Math.min(
      10000,
      Date.parse(context.deadlineAt) - now().getTime(),
      ExecutionBudget.current()?.remaining() ?? 10000,
    );
    requireCondition(
      Number.isFinite(remaining) && remaining > 0,
      503,
      'EXECUTION_DEADLINE',
      '현재 금융 요청 기한이 필요합니다.',
    );
    return new ExecutionBudget(
      Math.floor(remaining),
      () => now().getTime(),
      ExecutionBudget.current()?.signal,
    ).run(async () => {
      const authorization = await authorize();
      const snapshot = await new AuthorizationFence(authorization).capture(
        context,
        access.enterpriseRef.id,
      );
      const historyRef: Ref = {
        owner: 'FinancialSettlement',
        entity: 'FinancialHistory',
        id: randomUUID(),
        revision: 1,
      };
      const mutation: U4FinancialMutation = {
        historyRef,
        epoch: snapshot.epoch,
        requestDigest: fingerprint({ operation: name, input, actor: context.actorAccountRef }),
        personSources: [],
      };
      const validatePerson = async (scope: U4Transaction) => {
        const basis = adapter.basis(scope);
        const person = await basis.person(
          adapter.consentAuthorityScope(scope),
          context.actorAccountRef!,
          context.verifiedPersonRef,
          {
            epoch: snapshot.epoch,
            targetEnterpriseRef: access.enterpriseRef,
            approvalDigest: mutation.requestDigest,
          },
        );
        const linkRef = ref('VerifiedPersonLink', person.link);
        const checks = await basis.collection(scope, 'PersonVerification', {
          personLinkRef: { id: linkRef.id },
        });
        requireCondition(
          checks.length === 1,
          503,
          'U4_PERSON_UNVERIFIED',
          '현재 확인된 단일 사람 검증 원본이 필요합니다.',
        );
        const check = checks[0]!;
        return [
          context.actorAccountRef!,
          linkRef,
          ref('PersonVerification', check),
          check.policyRef as Ref,
          ...(check.evidenceRefs as Ref[]),
          ...(person.link.evidenceRefs as Ref[]),
        ];
      };
      const commit = await adapter.repository
        .mutate(
          {
            principalId: context.principalId,
            audience: context.audience,
            owner: 'FinancialSettlement',
            operation: name,
            target,
            idempotencyKey: input.meta.clientRequestId,
            input,
            correlationId: context.correlationId,
            epoch: snapshot.epoch,
            sourceContract: U4_SOURCE_CONTRACT,
          },
          async (scope) => {
            const current = await authorize(scope);
            await new AuthorizationFence(current).assert(context, snapshot, scope.transaction);
            const sources = await validatePerson(scope);
            if (mutation.personSources.length > 0)
              requireCondition(
                canonicalJson(sources) === canonicalJson(mutation.personSources),
                409,
                'AUTHORIZATION_FENCE_CHANGED',
                '확인한 실제 사람 근거의 현재 개정이 변경됐습니다.',
              );
            mutation.personSources = sources;
          },
          async (scope, requestId) => {
            if (target.kind === 'RECORD') await scope.current(target.recordRef);
            const result = await change(scope, mutation);
            for (const reference of result.refs)
              requireCondition(
                reference.owner === 'FinancialSettlement' &&
                  scope.transaction
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
                '금융 소유자가 실제 기록한 원본만 반환합니다.',
              );
            requireCondition(
              result.refs.some(
                (reference) => canonicalJson(reference) === canonicalJson(result.target),
              ),
              503,
              'U4_RESULT_TARGET',
              '실제 금융 결과 대상이 필요합니다.',
            );
            const at = now().toISOString();
            // 승인 entities/model은 Account FK다. VerifiedPersonLink를 이 필드에 임의 치환하지 않는다.
            let correctionOf: Ref | null = null;
            if (result.before && name === 'recordRestriction') {
              const rows = await scope.financialCollection(
                'FinancialHistory',
                { afterRef: result.before },
                new Date(
                  Date.now() + Math.min(5000, ExecutionBudget.current()?.remaining() ?? 5000),
                ).toISOString(),
              );
              requireCondition(
                rows.length === 1,
                503,
                'U4_HISTORY_REF',
                '원래 제한 개정의 단일 불변 이력이 필요합니다.',
              );
              correctionOf = u4Ref('FinancialHistory', rows[0]!, store.schema);
            }
            if (
              result.before &&
              [
                'correctInvoice',
                'cancelInvoice',
                'correctPaymentEvidence',
                'correctPaymentBinding',
                'reverseAllocation',
                'reconcileInvoiceDue',
              ].includes(name)
            ) {
              const original = await scope
                .readSource()
                .readRevision(result.before.entity, result.before.id, result.before.revision);
              correctionOf = (original?.historyRefs as Ref[] | undefined)?.at(-1) ?? null;
              requireCondition(
                correctionOf?.owner === 'FinancialSettlement' &&
                  correctionOf.entity === 'FinancialHistory',
                503,
                'U4_HISTORY_REF',
                '정정 전 원래 금융 이력의 실제 참조가 필요합니다.',
              );
              await scope.current(correctionOf);
            }
            const history = {
              modelVersion: 1,
              historyId: historyRef.id,
              actorAccountId: context.actorAccountRef!.id,
              verifiedPersonRef: context.actorAccountRef,
              occurredAt: at,
              reason: input.meta.reason,
              beforeRef: result.before,
              afterRef: result.target,
              evidenceRefs: input.sourceEvidence ? [input.sourceEvidence] : [],
              requestRef: requestId,
              correctionOf,
              revision: 1,
              targetScope: input.targetScope,
              knowledge: 'KNOWN',
              historyRefs: [],
            };
            await scope.transaction.put('FinancialHistory', history);
            requireCondition(
              canonicalJson(u4Ref('FinancialHistory', history, store.schema)) ===
                canonicalJson(historyRef),
              503,
              'U4_HISTORY_REF',
              '실제 이력 원본 개정이 필요합니다.',
            );
            await scope.transaction.put('RequestReceipt', {
              requestId,
              principalId: context.principalId,
              audience: context.audience,
              operation: name,
              targetIdentity: target,
              requestFingerprint: fingerprint(input),
              idempotencyKey: input.meta.clientRequestId,
              owner: 'FinancialSettlement',
              targetScope: input.targetScope,
              requestState: result.state ?? 'RESULT_RECORDED',
              resultRefs: [...result.refs, historyRef],
              acceptedAt: at,
              updatedAt: at,
              revision: 1,
              correlationId: context.correlationId,
              sourceContract: U4_SOURCE_CONTRACT,
            });
            const sources = [
              ...new Map(
                [...mutation.personSources, ...(result.sourceRefs ?? [])].map((reference) => [
                  canonicalJson(reference),
                  reference,
                ]),
              ).values(),
            ];
            for (const reference of sources)
              store.schema.validateUri(U4_PROFILE + '#/$defs/Ref', reference);
            await scope.transaction.put('FactEnvelope', {
              eventId: randomUUID(),
              sourceOwner: 'FinancialSettlement',
              aggregateRef: result.target,
              aggregateVersion: result.target.revision,
              sourceFactRef: historyRef,
              targetScope: input.targetScope,
              causationRequestId: requestId,
              correlationId: context.correlationId,
              schemaVersion: U4_PROFILE,
              supersedesFactRef: null,
              evidenceRefs: sources,
              occurredAt: at,
              sourceContract: U4_SOURCE_CONTRACT,
            });
          },
        )
        .catch((error: unknown) => {
          // 현재 명령의 유한 DB 진입 경합만 분류한다. SQL/원문/매개변수나 재실행 성공을 노출하지 않는다.
          throw u4FinancialMutationError(error);
        });
      await authorize();
      const receipt = await store.currentProtected('RequestReceipt', commit.requestId);
      requireCondition(
        receipt && canonicalJson(receipt.sourceContract) === canonicalJson(U4_SOURCE_CONTRACT),
        503,
        'RECEIPT_NOT_PROTECTED',
        '원래 금융 접수의 별도 보호 확인이 필요합니다.',
      );
      const references = receipt.resultRefs as Ref[];
      return store.schema.validateUri<Receipt>(operation.output, {
        requestId: receipt.requestId,
        requestState: receipt.requestState,
        owner: receipt.owner,
        targetRef: references.find((reference) => reference.entity !== 'FinancialHistory') ?? null,
        resultRefs: references,
        acceptedAt: receipt.acceptedAt,
        updatedAt: receipt.updatedAt,
        statusRevision: receipt.revision,
        retryAfterMilliseconds: null,
      });
    });
  }
}
