import { canonicalJson, requireCondition, U3_PROFILE } from '@oms/contracts';
import type {
  Ref,
  U3AppliedTerms,
  U3CapturedLine,
  U3OrderPriceBreakdown,
  U3ProposalTerms,
} from '@oms/contracts';
import { decodeAppliedTerms, validateModel } from '@oms/persistence';
import type { ModelData, U3Transaction } from '@oms/persistence';
import type { U3CurrentBasis } from './u3-current-basis.js';
import { u3Ref } from './references.js';
import { recordedOperation } from './u3-recorded-operation.js';
import { validateProposalPrice } from './proposal-terms.js';

const exact = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const confirmed = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'ORDER_TERMS_CHAIN',
    '원래 구매 조건과 실제 한 번 적용한 보호 조건 체인이 필요합니다.',
  );
export async function historicalU3(scope: U3Transaction, reference: Ref): Promise<ModelData> {
  const data = await scope.repository.store.readRevision(
    reference.entity,
    reference.id,
    reference.revision,
  );
  confirmed(data?.modelVersion === 2);
  validateModel(reference.entity, data!, scope.repository.store.schema);
  confirmed(exact(u3Ref(reference.entity, data!, scope.repository.store.schema), reference));
  return data!;
}
export function termsFromCaptured(reference: Ref, captured: U3CapturedLine[]): U3ProposalTerms {
  return {
    termsRecordRef: reference,
    lines: captured.map((line) => ({
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
export interface CurrentOrderTerms {
  order: ModelData;
  snapshot: ModelData;
  choice: ModelData;
  lines: ModelData[];
  reference: Ref;
  terms: U3ProposalTerms;
  captured: U3CapturedLine[];
  price: U3OrderPriceBreakdown;
  application: ModelData | null;
  applied: U3AppliedTerms | null;
}
export async function currentOrderTerms(
  scope: U3Transaction,
  reference: Ref,
  basis: U3CurrentBasis,
): Promise<CurrentOrderTerms> {
  const store = scope.repository.store,
    order = await scope.current(reference),
    snapshotRef = order.purchaseTermsRef as Ref;
  confirmed(order.modelVersion === 2);
  await scope.current(snapshotRef);
  const snapshot = await scope.repository.current(snapshotRef),
    birth = await historicalU3(scope, snapshot.orderRef as Ref),
    choice = await scope.current(order.provisionChoiceRef as Ref);
  confirmed(
    (snapshot.orderRef as Ref).id === reference.id &&
      (snapshot.orderRef as Ref).revision === 1 &&
      exact(birth.purchaseTermsRef, snapshotRef) &&
      exact(birth.enterpriseRef, order.enterpriseRef) &&
      exact(birth.targetScope, order.targetScope) &&
      birth.submissionRequestId === order.submissionRequestId &&
      exact(choice.orderRef, snapshot.orderRef) &&
      choice.choice === 'FULL',
  );
  const captured = store.schema.validateUri<U3CapturedLine[]>(
      U3_PROFILE + '#/$defs/CapturedLines',
      snapshot.capturedLines,
    ),
    lines: ModelData[] = [];
  confirmed(
    captured.length === (order.lineRefs as Ref[]).length &&
      captured.every((line) => line.priceKnowledge === 'KNOWN' && line.purchasePrice !== null),
  );
  for (const [index, lineRef] of (order.lineRefs as Ref[]).entries()) {
    const line = await scope.current(lineRef),
      original = captured[index]!;
    confirmed(
      line.modelVersion === 2 &&
        line.position === index + 1 &&
        exact(line.orderRef, snapshot.orderRef) &&
        line.requestedPaymentMode === order.paymentKind &&
        [
          'productRef',
          'quantity',
          'purchasePrice',
          'paymentTermsRef',
          'agreedPeriod',
          'completionBasisRef',
          'commonOfferRevisionRef',
          'agreementRevisionRefs',
          'conditionBindings',
          'requestedActivationDate',
        ].every((field) => exact(line[field], original[field as keyof U3CapturedLine])),
    );
    lines.push(line);
  }
  const result: CurrentOrderTerms = {
    order,
    snapshot,
    choice,
    lines,
    reference: snapshotRef,
    captured,
    terms: termsFromCaptured(snapshotRef, captured),
    price: snapshot.priceBreakdown as U3OrderPriceBreakdown,
    application: null,
    applied: null,
  };
  const applications = order.changeApplicationRefs as Ref[];
  confirmed(new Set(applications.map(canonicalJson)).size === applications.length);
  for (const [index, applicationRef] of applications.entries()) {
    const application = await scope.current(applicationRef),
      applied = decodeAppliedTerms(application, store.schema),
      beforeRef = application.orderRef as Ref;
    confirmed(
      beforeRef.owner === 'OrderAcceptance' &&
        beforeRef.entity === 'Order' &&
        beforeRef.id === reference.id &&
        beforeRef.revision === application.expectedOrderRevision &&
        beforeRef.revision < reference.revision &&
        exact(application.previousTermsRef, result.reference) &&
        exact(applied.targetScope, order.targetScope),
    );
    const before = await historicalU3(scope, beforeRef),
      afterRef = { ...beforeRef, revision: beforeRef.revision + 1 },
      after = await historicalU3(scope, afterRef);
    confirmed(
      exact(before.changeApplicationRefs, applications.slice(0, index)) &&
        exact(after.changeApplicationRefs, applications.slice(0, index + 1)) &&
        exact(after.purchaseTermsRef, snapshotRef) &&
        exact(before.targetScope, order.targetScope) &&
        exact(after.targetScope, order.targetScope) &&
        exact(before.lineRefs, after.lineRefs) &&
        before.productType === after.productType &&
        before.paymentKind === after.paymentKind &&
        before.state === after.state &&
        (application.changeKind === 'REVIEW_PRICE_CHANGE'
          ? before.state === 'REVIEW'
          : before.state === 'ACCEPTED'),
    );
    await recordedOperation(scope, basis, {
      owner: 'OrderAcceptance',
      operation: 'applyApprovedChange',
      beforeRef,
      afterRef,
      resultRef: applicationRef,
      target: { kind: 'NONE' },
      targetScope: applied.targetScope,
      audience: 'STAFF',
    });
    const consent = await scope.current(application.consentRef as Ref),
      proposal = await historicalU3(scope, consent.proposalRef as Ref),
      consented = await historicalU3(scope, application.proposalRef as Ref);
    confirmed(
      consent.decision === 'ACCEPT' &&
        exact(consent.enterpriseRef, applied.targetScope.enterpriseRef) &&
        exact(proposal.targetOrderRef, beforeRef) &&
        proposal.proposalRevision === consent.proposalRevision &&
        proposal.proposalRevision === applied.proposalRevision &&
        proposal.termsFingerprint === applied.termsFingerprint &&
        exact(proposal.proposedTerms, applied.terms) &&
        exact(proposal.priceBreakdown, applied.priceBreakdown) &&
        consented.result === 'CONSENTED' &&
        consented.proposalRevision === proposal.proposalRevision &&
        consented.termsFingerprint === proposal.termsFingerprint &&
        (application.proposalRef as Ref).id === (consent.proposalRef as Ref).id &&
        (application.proposalRef as Ref).revision === (consent.proposalRef as Ref).revision + 1,
    );
    await recordedOperation(scope, basis, {
      owner: 'CommercialAgreement',
      operation: 'recordConsent',
      beforeRef: consent.proposalRef as Ref,
      afterRef: application.proposalRef as Ref,
      resultRef: application.consentRef as Ref,
      target: { kind: 'RECORD', recordRef: consent.proposalRef as Ref },
      targetScope: applied.targetScope,
      audience: 'CUSTOMER',
    });
    validateProposalPrice(applied.terms, applied.priceBreakdown, store.schema);
    result.reference = applicationRef;
    result.terms = { ...applied.terms, termsRecordRef: applicationRef };
    result.captured = applied.capturedLines;
    result.price = applied.priceBreakdown;
    result.application = application;
    result.applied = applied;
  }
  validateProposalPrice(result.terms, result.price, store.schema);
  return result;
}
