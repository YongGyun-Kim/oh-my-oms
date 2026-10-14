import { canonicalJson, fingerprint, requireCondition } from '@oms/contracts';
import type { Ref, TargetScope, U4AgreedPaymentPlan } from '@oms/contracts';
import type { ModelData, U4Transaction } from '@oms/persistence';
import { U4CommercialAdapter, recordedU4CommercialOperation } from './u4-commercial-adapter.js';
import { historicalU4 } from './u4-order-terms.js';
import { Authorization } from './authorization.js';
import { proposalTermsFingerprint } from './proposal-terms.js';
import { U4PaymentPlan } from './u4-payment-plan.js';
export const u4ProposalFingerprint = (data: ModelData, adapter: U4CommercialAdapter) =>
  fingerprint({
    commercial: proposalTermsFingerprint(
      {
        proposalRevision: Number(data.proposalRevision),
        targetScope: data.targetScope as TargetScope,
        targetOrderRef: data.targetOrderRef as Ref,
        targetEntitlementRef: null,
        targetRenewalCycleRef: null,
        originalTerms: data.originalTerms as import('@oms/contracts').U3ProposalTerms,
        proposedTerms: data.proposedTerms as import('@oms/contracts').U3ProposalTerms,
        originalPriceBreakdown:
          data.originalPriceBreakdown as import('@oms/contracts').U3OrderPriceBreakdown,
        priceBreakdown: data.priceBreakdown as import('@oms/contracts').U3OrderPriceBreakdown,
        agreementEvidenceRefs: data.evidenceRefs as Ref[],
      },
      adapter.store.schema,
    ),
    paymentPlan: data.paymentPlan,
  });
export async function currentU4ProposalProof(
  adapter: U4CommercialAdapter,
  scope: U4Transaction,
  data: ModelData,
) {
  const check = (value: unknown) =>
    requireCondition(
      value,
      503,
      'U4_PROPOSAL_UNCONFIRMED',
      '원래 제안·직원·승인 계획·합의 근거의 현재 권위가 필요합니다.',
    );
  check(
    data.modelVersion === 3 &&
      data.paymentPlan &&
      canonicalJson(data.originalTermsRef) ===
        canonicalJson(
          (data.originalTerms as import('@oms/contracts').U3ProposalTerms).termsRecordRef,
        ) &&
      canonicalJson(data.proposedTermsRef) ===
        canonicalJson(
          (data.proposedTerms as import('@oms/contracts').U3ProposalTerms).termsRecordRef,
        ) &&
      canonicalJson(data.proposedTermsRef) ===
        canonicalJson((data.paymentPlan as U4AgreedPaymentPlan).agreementRevisionRef) &&
      data.termsFingerprint === u4ProposalFingerprint(data, adapter),
  );
  const originalRef: Ref = {
    owner: 'CommercialAgreement',
    entity: 'CommercialProposal',
    id: String(data.proposalId),
    revision: 1,
  };
  const original = await historicalU4(adapter, scope, originalRef);
  check(
    original.result === 'OPEN' &&
      original.termsFingerprint === data.termsFingerprint &&
      canonicalJson(original.paymentPlan) === canonicalJson(data.paymentPlan),
  );
  const recorded = await recordedU4CommercialOperation(adapter, scope, {
    owner: 'CommercialAgreement',
    operation: 'createPaymentPlanProposal',
    beforeRef: data.supersedesRef as Ref | null,
    afterRef: originalRef,
    resultRef: originalRef,
    target: { kind: 'NONE' },
    targetScope: data.targetScope as TargetScope,
    audience: 'STAFF',
  });
  const plan = data.paymentPlan as U4AgreedPaymentPlan;
  const approved = await new U4PaymentPlan(adapter).current(
    scope,
    plan.agreementRevisionRef,
    (data.priceBreakdown as import('@oms/contracts').U3OrderPriceBreakdown).total!,
  );
  check(canonicalJson(approved) === canonicalJson(plan));
  const actor = recorded.history.actorAccountRef as Ref;
  await new Authorization(adapter.store, adapter.now, scope.readSource()).requireStaffSource(
    actor,
    'contract.propose',
    scope.transaction,
  );
  const basis = adapter.basis(scope),
    proof = {
      epoch: await scope.readSource().currentEpoch(),
      targetEnterpriseRef: (data.targetScope as TargetScope).enterpriseRef,
      approvalDigest: String(data.termsFingerprint),
    };
  await basis.person(scope, actor, recorded.history.verifiedPersonRef as Ref | null, proof);
  await basis.evidence(
    scope,
    data.evidenceRefs as Ref[],
    basis.registration.agreementPurpose,
    actor,
    proof.targetEnterpriseRef,
    undefined,
    proof,
  );
  for (const adjustment of (data.priceBreakdown as import('@oms/contracts').U3OrderPriceBreakdown)
    .adjustments) {
    check(adjustment.confirmedByRef && adjustment.knowledge === 'KNOWN');
    await new Authorization(adapter.store, adapter.now, scope.readSource()).requireStaffSource(
      adjustment.confirmedByRef!,
      'contract.propose',
      scope.transaction,
    );
    await basis.evidence(
      scope,
      adjustment.evidenceRefs,
      basis.registration.agreementPurpose,
      adjustment.confirmedByRef!,
      proof.targetEnterpriseRef,
      undefined,
      proof,
    );
  }
}
