import { canonicalJson, requireCondition, U4_PROFILE } from '@oms/contracts';
import type {
  Ref,
  U4AgreedPaymentPlan,
  U4AppliedTerms,
  U4CapturedLine,
  U3OrderPriceBreakdown,
} from '@oms/contracts';
import { validateModel } from '@oms/persistence';
import type { ModelData, U4Transaction } from '@oms/persistence';
import { u4Ref } from './references.js';
import { validateProposalPrice } from './proposal-terms.js';
import { recordedU4CommercialOperation, U4CommercialAdapter } from './u4-commercial-adapter.js';
import { paymentPlanMode } from './u4-payment-plan.js';

const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const check = (value: unknown) =>
  requireCondition(
    value,
    503,
    'U4_ORDER_TERMS_CHAIN',
    '원래 주문과 동의하여 실제 적용한 지급 계획의 보호 이력이 필요합니다.',
  );
export function u4Terms(reference: Ref, lines: U4CapturedLine[]) {
  // 지급 계획은 별도 필드로 고정한다. 상품·금액·기간 표현은 기존 계약을 재사용한다.
  return {
    termsRecordRef: reference,
    lines: lines.map((line) => ({
      productRef: line.productRef,
      quantity: line.quantity,
      price: line.purchasePrice!,
      period: line.agreedPeriod,
      conditionRefs: [
        ...new Map(
          line.conditionBindings.map((binding) => [
            canonicalJson(binding.sourceRef),
            binding.sourceRef,
          ]),
        ).values(),
      ],
    })),
  };
}
export async function historicalU4(
  adapter: U4CommercialAdapter,
  scope: U4Transaction,
  reference: Ref,
): Promise<ModelData> {
  const data = await scope
    .readSource()
    .readRevision(reference.entity, reference.id, reference.revision);
  check(data && data.modelVersion === 3);
  validateModel(reference.entity, data!, adapter.store.schema);
  check(exact(u4Ref(reference.entity, data!, adapter.store.schema), reference));
  return data!;
}
export async function currentU4OrderTerms(
  adapter: U4CommercialAdapter,
  scope: U4Transaction,
  reference: Ref,
) {
  const schema = adapter.store.schema;
  const order = await scope.current(reference);
  check(order.modelVersion === 3 && order.paymentPlan);
  const snapshotRef = order.purchaseTermsRef as Ref;
  const snapshot = await scope.current(snapshotRef);
  const birthRef = snapshot.orderRef as Ref;
  const birth = await historicalU4(adapter, scope, birthRef);
  const choice = await scope.current(order.provisionChoiceRef as Ref);
  check(
    snapshot.modelVersion === 3 &&
      birthRef.id === reference.id &&
      birthRef.revision === 1 &&
      exact(birth.purchaseTermsRef, snapshotRef) &&
      exact(birth.enterpriseRef, order.enterpriseRef) &&
      exact(birth.targetScope, order.targetScope) &&
      exact(birth.lineRefs, order.lineRefs) &&
      birth.submissionRequestId === order.submissionRequestId &&
      exact(choice.orderRef, birthRef) &&
      choice.choice === 'FULL' &&
      exact(choice.effectiveRevisionRef, snapshotRef),
  );
  const original = schema.validateUri<U4CapturedLine[]>(
    U4_PROFILE + '#/$defs/CapturedLines',
    snapshot.capturedLines,
  );
  check(
    original.length === (order.lineRefs as Ref[]).length &&
      exact(snapshot.paymentPlan, birth.paymentPlan),
  );
  const lines: ModelData[] = [];
  for (const [index, lineRef] of (order.lineRefs as Ref[]).entries()) {
    const line = await scope.current(lineRef);
    check(
      line.modelVersion === 3 &&
        line.position === index + 1 &&
        exact(line.orderRef, birthRef) &&
        exact(line.paymentPlan, birth.paymentPlan) &&
        line.requestedPaymentMode === birth.paymentKind &&
        [
          'productRef',
          'quantity',
          'purchasePrice',
          'priceKnowledge',
          'paymentTermsRef',
          'agreedPeriod',
          'completionBasisRef',
          'commonOfferRevisionRef',
          'agreementRevisionRefs',
          'conditionBindings',
          'requestedActivationDate',
        ].every((field) => exact(line[field], original[index]![field as keyof U4CapturedLine])),
    );
    lines.push(line);
  }
  const submitted = await recordedU4CommercialOperation(adapter, scope, {
    owner: 'OrderAcceptance',
    operation: 'submitPlannedOrder',
    beforeRef: null,
    afterRef: birthRef,
    resultRef: snapshotRef,
    target: { kind: 'NONE' },
    targetScope: order.targetScope as import('@oms/contracts').TargetScope,
    audience: 'CUSTOMER',
  });
  check(
    submitted.receipt.requestId === order.submissionRequestId &&
      exact(submitted.history.actorAccountRef, order.requesterAccountRef),
  );
  const result = {
    order,
    snapshot,
    choice,
    lines,
    reference: snapshotRef,
    captured: original,
    terms: u4Terms(snapshotRef, original),
    price: snapshot.priceBreakdown as U3OrderPriceBreakdown,
    plan: snapshot.paymentPlan as U4AgreedPaymentPlan,
    application: null as ModelData | null,
    applied: null as U4AppliedTerms | null,
    receipt: submitted.receipt,
  };
  const applications = order.changeApplicationRefs as Ref[];
  check(new Set(applications.map(canonicalJson)).size === applications.length);
  for (const [index, applicationRef] of applications.entries()) {
    const application = await scope.current(applicationRef);
    check(
      application.modelVersion === 3 &&
        application.actualApplicationResult === 'APPLIED' &&
        application.paymentPlan,
    );
    const applied = schema.validateUri<U4AppliedTerms>(
      U4_PROFILE + '#/$defs/AppliedTerms',
      application.appliedTerms,
    );
    const beforeRef = application.orderRef as Ref;
    const before = await historicalU4(adapter, scope, beforeRef);
    const afterRef = { ...beforeRef, revision: beforeRef.revision + 1 };
    const after = await historicalU4(adapter, scope, afterRef);
    check(
      beforeRef.id === reference.id &&
        beforeRef.revision === application.expectedOrderRevision &&
        beforeRef.revision < reference.revision &&
        exact(application.previousTermsRef, result.reference) &&
        exact(application.changedTermsRef, applied.terms.termsRecordRef) &&
        exact(applied.targetScope, order.targetScope) &&
        exact(before.paymentPlan, result.plan) &&
        exact(after.paymentPlan, application.paymentPlan) &&
        exact(before.changeApplicationRefs, applications.slice(0, index)) &&
        exact(after.changeApplicationRefs, applications.slice(0, index + 1)) &&
        exact(before.targetScope, order.targetScope) &&
        exact(after.targetScope, order.targetScope) &&
        [
          'enterpriseRef',
          'requesterAccountRef',
          'submissionRequestId',
          'submittedAt',
          'productType',
          'lineRefs',
          'purchaseTermsRef',
          'provisionChoiceRef',
          'renewalCycleRef',
        ].every(
          (field) => exact(before[field], birth[field]) && exact(after[field], birth[field]),
        ) &&
        before.paymentKind === paymentPlanMode(result.plan) &&
        after.paymentKind === paymentPlanMode(application.paymentPlan as U4AgreedPaymentPlan) &&
        exact(before.lineRefs, after.lineRefs) &&
        exact(after.purchaseTermsRef, snapshotRef) &&
        before.state === after.state &&
        (application.changeKind === 'REVIEW_PAYMENT_PLAN_CHANGE'
          ? before.state === 'REVIEW'
          : before.state === 'ACCEPTED'),
    );
    await recordedU4CommercialOperation(adapter, scope, {
      owner: 'OrderAcceptance',
      operation: 'applyPaymentPlanChange',
      beforeRef,
      afterRef,
      resultRef: applicationRef,
      target: { kind: 'RECORD', recordRef: beforeRef },
      targetScope: applied.targetScope,
      audience: 'STAFF',
    });
    const consentRef = application.consentRef as Ref;
    const consent = await scope.current(consentRef);
    const proposalRef = consent.proposalRef as Ref;
    const proposal = await historicalU4(adapter, scope, proposalRef);
    const consentedRef = application.proposalRef as Ref;
    const consented = await historicalU4(adapter, scope, consentedRef);
    check(
      consent.modelVersion === 2 &&
        consent.decision === 'ACCEPT' &&
        exact(consent.enterpriseRef, applied.targetScope.enterpriseRef) &&
        exact(proposal.targetOrderRef, beforeRef) &&
        proposal.proposalRevision === consent.proposalRevision &&
        proposal.proposalRevision === applied.proposalRevision &&
        proposal.termsFingerprint === applied.termsFingerprint &&
        exact(proposal.originalTerms, result.terms) &&
        exact(proposal.originalPriceBreakdown, result.price) &&
        exact(proposal.proposedTerms, applied.terms) &&
        exact(proposal.priceBreakdown, applied.priceBreakdown) &&
        exact(application.paymentPlan, {
          ...(proposal.paymentPlan as U4AgreedPaymentPlan),
          customerConsentRef: consentRef,
        }) &&
        consented.result === 'CONSENTED' &&
        consentedRef.id === proposalRef.id &&
        consentedRef.revision === proposalRef.revision + 1 &&
        exact(consented.paymentPlan, proposal.paymentPlan) &&
        consented.termsFingerprint === proposal.termsFingerprint,
    );
    const recorded = await recordedU4CommercialOperation(adapter, scope, {
      owner: 'CommercialAgreement',
      operation: 'recordPaymentPlanConsent',
      beforeRef: proposalRef,
      afterRef: consentedRef,
      resultRef: consentRef,
      target: { kind: 'RECORD', recordRef: proposalRef },
      targetScope: applied.targetScope,
      audience: 'CUSTOMER',
    });
    check(
      exact(recorded.history.actorAccountRef, consent.actorAccountRef) &&
        recorded.receipt.principalId === (consent.actorAccountRef as Ref).id,
    );
    validateProposalPrice(applied.terms, applied.priceBreakdown, schema);
    result.reference = applicationRef;
    result.captured = applied.capturedLines;
    result.terms = { ...applied.terms, termsRecordRef: applicationRef };
    result.price = applied.priceBreakdown;
    result.plan = application.paymentPlan as U4AgreedPaymentPlan;
    result.application = application;
    result.applied = applied;
  }
  check(
    exact(order.paymentPlan, result.plan) && order.paymentKind === paymentPlanMode(result.plan),
  );
  schema.validateUri(U4_PROFILE + '#/$defs/AgreedPaymentPlan', result.plan);
  validateProposalPrice(result.terms, result.price, schema);
  check(exact(result.plan.total, result.price.total));
  return result;
}
