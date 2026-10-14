import { randomUUID } from 'node:crypto';
import {
  canonicalJson,
  declareU4Operations,
  ExecutionBudget,
  fingerprint,
  OperationRegistry,
  OmsError,
  requireCondition,
  SchemaValidator,
  U4_PROFILE,
} from '@oms/contracts';
import type {
  Money,
  Receipt,
  Ref,
  ServiceContext,
  U4AgreedPaymentPlan,
  U4AssessmentPurpose,
  U4EligibilityInput,
  U4EligibilityView,
  U4CurrentEligibilityView,
  U4RestrictionInput,
  U4UnsupportedAdjustmentInput,
} from '@oms/contracts';
import type { ModelData, U4Transaction } from '@oms/persistence';
import { u4ObligationBindingId } from '@oms/persistence';
import { AuthorizationFence } from './authorization-fence.js';
import { U4CommercialOrder } from './u4-commercial-order.js';
import { U4FinancialAccess } from './u4-financial-access.js';
import { U4FinancialLedger } from './u4-financial-ledger.js';
import { U4OwnerSources } from './u4-owner-sources.js';
import { u4Ref } from './references.js';

const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const schema = new SchemaValidator();
export interface U4ObligationCoverage {
  obligationKey: string;
  amount: Money;
  net: Money;
  issued: boolean;
  confirmed: boolean;
}
export function u4PaymentCondition(
  purpose: U4AssessmentPurpose,
  plan: U4AgreedPaymentPlan | null,
  coverage: U4ObligationCoverage[],
  restriction: 'CLEAR' | 'RESTRICTED' | 'UNVERIFIED',
): U4EligibilityView['decision'] {
  if (!['SALE_ACCEPTANCE', 'PROVISION'].includes(purpose) || !plan || restriction === 'UNVERIFIED')
    return 'UNVERIFIED';
  schema.validateUri(U4_PROFILE + '#/$defs/AgreedPaymentPlan', plan);
  if (restriction === 'RESTRICTED') return 'HOLD';
  if (purpose === 'SALE_ACCEPTANCE') return 'ALLOW';
  const required = plan.obligations.filter((obligation) => obligation.requiredBeforeProvision);
  for (const obligation of required) {
    const values = coverage.filter((value) => value.obligationKey === obligation.obligationKey);
    if (values.length !== 1 || !values[0]!.issued) return 'HOLD';
    const value = values[0]!;
    schema.validateUri(U4_PROFILE + '#/$defs/Money', value.net);
    if (!value.confirmed || !exact(value.amount, obligation.amount)) return 'UNVERIFIED';
    if (BigInt(value.net.value) < BigInt(obligation.amount.value)) return 'HOLD';
  }
  return 'ALLOW';
}

export class U4Eligibility {
  private readonly orders: U4CommercialOrder;
  private readonly ledger: U4FinancialLedger;
  constructor(
    readonly access: U4FinancialAccess,
    readonly owners = new U4OwnerSources(access.adapter.store, access.adapter.now),
  ) {
    this.orders = new U4CommercialOrder(access.adapter);
    this.ledger = new U4FinancialLedger(access.adapter.store);
  }
  private reference(model: string, value: ModelData) {
    return u4Ref(model, value, this.access.adapter.store.schema);
  }
  async rejectRenewalFeeAdjustment(
    context: ServiceContext,
    input: U4UnsupportedAdjustmentInput,
    proof: unknown,
  ): Promise<never> {
    const { adapter } = this.access;
    adapter.store.schema.validate('ServiceContext', context);
    adapter.store.schema.validateUri(U4_PROFILE + '#/$defs/UnsupportedAdjustmentInput', input);
    requireCondition(
      context.audience === 'STAFF' &&
        input.meta.expectedRevision === input.renewalCycleRef.revision,
      403,
      'U4_ELIGIBILITY_ACCESS',
      '현재 직원과 정확한 회차 참조가 필요합니다.',
    );
    await adapter.authorize(
      context,
      'financial.manage',
      { scope: input.targetScope, enterpriseRef: input.targetScope.enterpriseRef },
      proof,
    );
    // 미지원 거절은 U6 기간 변경·금융 조정 원본이나 실제 원본 확인을 생성하지 않는다.
    throw new OmsError(
      409,
      'U4_FEE_ADJUSTMENT_UNSUPPORTED',
      '자동 보상 중첩·갱신 요금 조정은 지원하지 않습니다. 원래 회차와 기간 정정 근거를 보존해 별도 확인하세요.',
    );
  }
  private async current(scope: U4Transaction, input: U4EligibilityInput) {
    const current = await this.orders.current(scope, input.orderRef);
    requireCondition(
      exact(current.order.targetScope, input.targetScope) &&
        exact(current.plan.agreementRevisionRef, input.agreementRevisionRef) &&
        current.plan.planRevision === input.planRevision &&
        exact(current.order.lineRefs, input.orderLineRefs),
      409,
      'U4_ELIGIBILITY_BASIS',
      '현재 전체 주문·승인 약정·계획의 정확한 개정이 필요합니다.',
    );
    const cycles = current.order.renewalCycleRef ? [current.order.renewalCycleRef] : [];
    requireCondition(
      exact(cycles, input.renewalCycleRefs),
      409,
      'U4_ELIGIBILITY_BASIS',
      '현재 주문의 정확한 회차가 필요합니다.',
    );
    await this.orders.commercial(scope, current);
    return current;
  }
  private async calculate(
    scope: U4Transaction,
    input: U4EligibilityInput,
  ): Promise<U4CurrentEligibilityView> {
    const current = await this.current(scope, input);
    const basisRefs = [
      input.orderRef,
      current.reference,
      input.agreementRevisionRef,
      current.plan.agreementApprovalRef,
      ...input.orderLineRefs,
      ...input.renewalCycleRefs,
    ];
    const restrictions = await this.ledger.collection(scope, 'FinancialRestriction', {
      orderRef: { id: input.orderRef.id },
      assessmentPurpose: input.assessmentPurpose,
      active: true,
    });
    let restricted: 'CLEAR' | 'RESTRICTED' | 'UNVERIFIED' = 'CLEAR';
    if (!['REVIEW', 'ACCEPTED'].includes(String(current.order.state))) restricted = 'UNVERIFIED';
    for (const restriction of restrictions) {
      basisRefs.push(this.reference('FinancialRestriction', restriction));
      if (
        !exact(restriction.targetScope, input.targetScope) ||
        !exact(restriction.agreementRevisionRef, input.agreementRevisionRef)
      )
        restricted = 'UNVERIFIED';
      else if (restricted !== 'UNVERIFIED') restricted = 'RESTRICTED';
    }
    if (current.order.renewalCycleRef) {
      try {
        basisRefs.push(
          ...(await this.owners.currentRenewal(
            {
              orderRef: input.orderRef,
              renewalCycleRef: current.order.renewalCycleRef as Ref,
              targetScope: input.targetScope,
              epoch: await scope.readSource().currentEpoch(),
              requestDigest: fingerprint(input),
            },
            scope.readSource(),
          )),
        );
      } catch (error) {
        if ((error as { code?: string }).code !== 'U4_OWNER_UNREGISTERED') throw error;
        restricted = 'UNVERIFIED';
      }
    }
    const coverage: U4ObligationCoverage[] = [];
    if (input.assessmentPurpose === 'PROVISION') {
      if (current.order.state !== 'ACCEPTED') restricted = 'UNVERIFIED';
      const invoices = await this.ledger.collection(scope, 'Invoice', {
        orderRef: { id: input.orderRef.id },
        lifecycle: 'ISSUED',
      });
      const checkedPayments = new Set<string>();
      for (const obligation of current.plan.obligations.filter(
        (value) => value.requiredBeforeProvision,
      )) {
        const matches = invoices.filter(
          (invoice) => invoice.obligationKey === obligation.obligationKey,
        );
        if (matches.length !== 1) continue;
        const invoice = matches[0]!,
          invoiceRef = this.reference('Invoice', invoice);
        const bindingId = u4ObligationBindingId(input.orderRef.id, obligation.obligationKey);
        const binding = await scope.optional('FinancialInvoiceBinding', bindingId);
        requireCondition(
          binding &&
            exact(binding.invoiceRef, invoiceRef) &&
            exact(invoice.targetScope, input.targetScope) &&
            invoice.planRevision === input.planRevision &&
            exact(invoice.amount, obligation.amount) &&
            invoice.requiredBeforeProvision === true &&
            exact(invoice.dueBasis, obligation.dueBasis),
          503,
          'U4_ELIGIBILITY_BASIS',
          '현재 의무별 유효 청구 원상이 필요합니다.',
        );
        const ledger = await this.ledger.invoice(scope, invoice);
        basisRefs.push(invoiceRef);
        let confirmed = ledger.reserved === 0n;
        for (const allocation of ledger.allocations.filter((value) => value.effect === 'APPLIED')) {
          const paymentRef = allocation.paymentEvidenceRef as Ref;
          const payment = await scope.optional('PaymentEvidence', paymentRef.id);
          requireCondition(
            payment &&
              exact(payment.targetScope, input.targetScope) &&
              (payment.boundOrderRef as Ref | null)?.id === input.orderRef.id,
            503,
            'U4_ELIGIBILITY_BASIS',
            '현재 같은 주문의 확인된 입금이 필요합니다.',
          );
          if (payment.lifecycle !== 'CONFIRMED' || payment.knowledge !== 'KNOWN') confirmed = false;
          if (!checkedPayments.has(paymentRef.id)) {
            await this.ledger.payment(scope, payment);
            checkedPayments.add(paymentRef.id);
          }
          basisRefs.push(
            this.reference('PaymentEvidence', payment),
            this.reference('PaymentAllocation', allocation),
          );
        }
        coverage.push({
          obligationKey: obligation.obligationKey,
          amount: invoice.amount as Money,
          net: { currency: 'KRW', value: ledger.net.toString() },
          issued: true,
          confirmed,
        });
      }
    }
    // 순수 계산은 금융 원본 Ref나 개정을 생성하지 않는다. 실제 근거와 관측 시점만 반환한다.
    return this.access.adapter.store.schema.validateUri<U4CurrentEligibilityView>(
      U4_PROFILE + '#/$defs/CurrentEligibilityView',
      {
        orderRef: input.orderRef,
        assessmentPurpose: input.assessmentPurpose,
        planRevision: input.planRevision,
        agreementRevisionRef: input.agreementRevisionRef,
        decision: u4PaymentCondition(input.assessmentPurpose, current.plan, coverage, restricted),
        basisRefs: [
          ...new Map(basisRefs.map((reference) => [canonicalJson(reference), reference])).values(),
        ],
        evaluatedAt: this.access.adapter.now().toISOString(),
      },
    );
  }
  async assessEligibility(
    context: ServiceContext,
    input: U4EligibilityInput,
    proof: unknown,
  ): Promise<U4CurrentEligibilityView> {
    const { adapter } = this.access;
    adapter.store.schema.validate('ServiceContext', context);
    const registry = new OperationRegistry(adapter.store.schema);
    declareU4Operations(registry);
    const operation = registry.lookup('FinancialSettlement', 'assessEligibility', 4);
    adapter.store.schema.validateUri(operation.input, input);
    requireCondition(
      context.audience === 'STAFF' && input.meta.expectedRevision === input.orderRef.revision,
      403,
      'U4_ELIGIBILITY_ACCESS',
      '현재 직원의 정확한 금융 조회 권한이 필요합니다.',
    );
    const budget = Math.min(
      5000,
      Date.parse(context.deadlineAt) - adapter.now().getTime(),
      ExecutionBudget.current()?.remaining() ?? 5000,
    );
    requireCondition(
      Number.isFinite(budget) && budget > 0,
      503,
      'EXECUTION_DEADLINE',
      '현재 판단 조회 기한이 필요합니다.',
    );
    return new ExecutionBudget(
      Math.floor(budget),
      () => adapter.now().getTime(),
      ExecutionBudget.current()?.signal,
    ).run(async () => {
      const authorize = (scope?: U4Transaction) =>
        adapter.authorize(
          context,
          'financial.read',
          { scope: input.targetScope, enterpriseRef: input.targetScope.enterpriseRef },
          proof,
          scope?.readSource(),
          scope?.transaction,
        );
      const auth = await authorize();
      const snapshot = await new AuthorizationFence(auth).capture(
        context,
        input.targetScope.enterpriseRef.id,
      );
      return adapter.repository.read(async (scope) => {
        await new AuthorizationFence(await authorize(scope)).assert(
          context,
          snapshot,
          scope.transaction,
        );
        const view = await this.calculate(scope, input);
        await new AuthorizationFence(await authorize(scope)).assert(
          context,
          snapshot,
          scope.transaction,
        );
        return view;
      });
    });
  }
  evaluateFinancialEligibility(
    context: ServiceContext,
    input: U4EligibilityInput,
    proof: unknown,
  ): Promise<Receipt> {
    return this.access.run(
      context,
      'evaluateFinancialEligibility',
      { kind: 'RECORD', recordRef: input.orderRef },
      input,
      proof,
      async (scope, mutation) => {
        const view = await this.calculate(scope, input);
        const record = {
          modelVersion: 1,
          financialEligibilityId: randomUUID(),
          orderRef: input.orderRef,
          agreementRevisionRef: input.agreementRevisionRef,
          renewalCycleRefs: input.renewalCycleRefs,
          assessmentPurpose: input.assessmentPurpose,
          planRevision: input.planRevision,
          paymentBasisRefs: view.basisRefs.filter(
            (reference) => reference.entity === 'PaymentAllocation',
          ),
          restrictionBasisRef: null,
          decision: view.decision,
          allowedQuantityBasisRef: null,
          sourceRevision: 1,
          revision: 1,
          targetScope: input.targetScope,
          knowledge: view.decision === 'UNVERIFIED' ? 'UNKNOWN' : 'KNOWN',
          historyRefs: [mutation.historyRef],
        };
        await scope.transaction.put('FinancialEligibility', record);
        const reference = this.reference('FinancialEligibility', record);
        return {
          target: reference,
          refs: [reference],
          before: null,
          sourceRefs: view.basisRefs,
          state: view.decision === 'ALLOW' ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED',
        };
      },
    );
  }
  async currentRecorded(
    scope: U4Transaction,
    reference: Ref,
    input: U4EligibilityInput,
  ): Promise<ModelData> {
    requireCondition(
      reference.owner === 'FinancialSettlement' && reference.entity === 'FinancialEligibility',
      400,
      'U4_ELIGIBILITY_BASIS',
      '실제 금융 판단 원본이 필요합니다.',
    );
    const recorded = await scope.current(reference);
    const current = await this.calculate(scope, input);
    const historyRef = (recorded.historyRefs as Ref[]).at(-1);
    requireCondition(
      exact(recorded.orderRef, input.orderRef) &&
        exact(recorded.targetScope, input.targetScope) &&
        recorded.assessmentPurpose === input.assessmentPurpose &&
        recorded.planRevision === input.planRevision &&
        exact(recorded.agreementRevisionRef, input.agreementRevisionRef) &&
        exact(recorded.renewalCycleRefs, input.renewalCycleRefs) &&
        recorded.sourceRevision === reference.revision &&
        recorded.decision === current.decision &&
        historyRef,
      503,
      'U4_ELIGIBILITY_STALE',
      '현재 목적·계획·금융 근거로 다시 확인한 판단 원본이 필요합니다.',
    );
    const facts = await scope.readSource().list('FactEnvelope', {
      equals: { aggregateRef: reference, sourceFactRef: historyRef },
      limit: 2,
    });
    requireCondition(
      facts.length === 1,
      503,
      'U4_ELIGIBILITY_STALE',
      '판단 원본과 함께 보호한 단일 근거 사실이 필요합니다.',
    );
    const financialBasis = (facts[0]!.evidenceRefs as Ref[]).filter(
      (value) => value.owner !== 'IdentityRecovery',
    );
    const ordered = (values: Ref[]) => values.map(canonicalJson).sort();
    requireCondition(
      exact(ordered(financialBasis), ordered(current.basisRefs)),
      503,
      'U4_ELIGIBILITY_STALE',
      '지급·제한 변경 전의 과거 판단을 재사용하지 않습니다.',
    );
    return recorded;
  }
  recordRestriction(
    context: ServiceContext,
    input: U4RestrictionInput,
    proof: unknown,
  ): Promise<Receipt> {
    return this.access.run(
      context,
      'recordRestriction',
      { kind: 'RECORD', recordRef: input.orderRef },
      input,
      proof,
      async (scope) => {
        const current = await this.orders.current(scope, input.orderRef);
        requireCondition(
          exact(current.order.targetScope, input.targetScope) &&
            exact(current.plan.agreementRevisionRef, input.agreementRevisionRef),
          409,
          'U4_RESTRICTION_BASIS',
          '현재 같은 계약과 목적의 제한 근거가 필요합니다.',
        );
        await this.orders.commercial(scope, current);
        const id = fingerprint({
          orderId: input.orderRef.id,
          purpose: input.assessmentPurpose,
          restrictionKey: input.restrictionKey,
        });
        const original = await scope.optional('FinancialRestriction', id);
        requireCondition(
          input.effect !== 'RELEASE' ||
            (original &&
              original.active === true &&
              exact(original.targetScope, input.targetScope) &&
              exact(original.agreementRevisionRef, input.agreementRevisionRef)),
          409,
          'U4_RESTRICTION_BASIS',
          '같은 현재 제한의 명시 해제만 기록합니다.',
        );
        const record = {
          modelVersion: 1,
          restrictionId: id,
          orderRef: input.orderRef,
          assessmentPurpose: input.assessmentPurpose,
          active: input.effect === 'RESTRICT',
          agreementRevisionRef: input.agreementRevisionRef,
          sourceEvidence: input.sourceEvidence,
          targetScope: input.targetScope,
          revision: original ? Number(original.revision) + 1 : 1,
        };
        await scope.transaction.put(
          'FinancialRestriction',
          record,
          original ? Number(original.revision) : null,
        );
        const reference = this.reference('FinancialRestriction', record);
        return {
          target: reference,
          refs: [reference],
          before: original ? this.reference('FinancialRestriction', original) : null,
          sourceRefs: [input.orderRef, input.agreementRevisionRef],
        };
      },
    );
  }
}
