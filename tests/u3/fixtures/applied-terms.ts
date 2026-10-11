import { randomUUID } from 'node:crypto';
import { canonicalJson, SchemaValidator, U3_PROFILE } from '@oms/contracts';
import type {
  Ref,
  U3AppliedTerms,
  U3CapturedLine,
  U3ProposalInput,
  U3ProposalView,
} from '@oms/contracts';
import { CommercialProposal } from '@oms/core';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { capturedLine, modelFixture } from './models.js';
import { fixtureScope } from './identity.js';
import { proposalPrice, registeredProposalInput } from './proposal-input.js';
import { seedDecisionOrder } from './order-decision.js';
import { syntheticCommercialEvidence } from './agreement.js';

const schema = new SchemaValidator();
export function appliedTermsFixture(): U3AppliedTerms {
  const line = schema.validateUri<U3CapturedLine>(
      U3_PROFILE + '#/$defs/CapturedLine',
      capturedLine(),
    ),
    application = modelFixture('OrderChangeApplication');
  return {
    terms: {
      termsRecordRef: application.changedTermsRef as Ref,
      lines: [
        {
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
        },
      ],
    },
    capturedLines: [line],
    priceBreakdown: proposalPrice(),
    targetScope: fixtureScope(),
    proposalRevision: 1,
    termsFingerprint: 'a'.repeat(64),
  };
}
// 실제 submit/제안/동의 생산자를 사용하지만 application 기록 자체는 모델 시험용 fixture다.
// 주문 변경 적용이나 U7 운영 확인이 구현됐다는 의미가 아니다.
export async function applicationGraph(store: ProtectedStore) {
  const f = await seedDecisionOrder(store),
    original = (await store.currentProtected('Order', f.receipt.targetRef!.id))!,
    snapshot = (await store.currentProtected(
      'PurchaseTermsSnapshot',
      (original.purchaseTermsRef as Ref).id,
    ))!;
  const proposals = new CommercialProposal(
    store,
    f.seller.now,
    async (proof) => proof === f.ingress,
    syntheticCommercialEvidence,
  );
  const captured = schema.validateUri<U3CapturedLine[]>(
      U3_PROFILE + '#/$defs/CapturedLines',
      snapshot.capturedLines,
    ),
    price = captured[0]!.conditionBindings.find((binding) => binding.conditionKey === 'PRICE');
  if (!price) throw new Error('현재 가격 조건이 필요합니다.');
  const input = registeredProposalInput<U3ProposalInput>('createProposal', {
    meta: f.meta(),
    targetScope: f.targetScope,
    targetOrderRef: f.receipt.targetRef!,
    targetEntitlementRef: null,
    targetRenewalCycleRef: null,
    originalTermsRef: original.purchaseTermsRef as Ref,
    proposedTermsRef: price.sourceRef,
    proposedTerms: {
      termsRecordRef: price.sourceRef,
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
    },
    priceBreakdown: f.input.priceConfirmation!.priceBreakdown,
    supersedesRef: null,
    agreementEvidenceRefs: f.evidence,
  });
  const created = await proposals.create(f.registrant, input, f.ingress),
    view = (await proposals.read(f.seller.customer, {
      targetRef: created.targetRef!,
      targetScope: f.targetScope,
    })) as { knowledge: 'KNOWN'; data: U3ProposalView };
  await f.grant();
  const consent = await proposals.recordConsent(f.seller.customer, {
    meta: f.meta(created.targetRef!.revision),
    targetScope: f.targetScope,
    proposalRef: created.targetRef!,
    proposalRevision: view.data.proposalRevision,
    termsFingerprint: view.data.termsFingerprint,
    decision: 'ACCEPT',
  });
  const appliedTerms: U3AppliedTerms = {
    terms: structuredClone(input.proposedTerms),
    capturedLines: schema.validateUri<U3CapturedLine[]>(
      U3_PROFILE + '#/$defs/CapturedLines',
      snapshot.capturedLines,
    ),
    priceBreakdown: structuredClone(input.priceBreakdown),
    targetScope: f.targetScope,
    proposalRevision: view.data.proposalRevision,
    termsFingerprint: view.data.termsFingerprint,
  };
  schema.validateUri(U3_PROFILE + '#/$defs/AppliedTerms', appliedTerms);
  const application: ModelData = {
    modelVersion: 2,
    orderChangeApplicationId: randomUUID(),
    orderRef: f.receipt.targetRef!,
    afterSalesDecisionRef: null,
    consentRef: consent.resultRefs.find((reference) => reference.entity === 'CustomerConsent')!,
    previousTermsRef: original.purchaseTermsRef,
    changedTermsRef: input.proposedTermsRef,
    actualApplicationResult: 'APPLIED',
    expectedOrderRevision: f.receipt.targetRef!.revision,
    proposalRef: consent.targetRef!,
    changeKind: 'REVIEW_PRICE_CHANGE',
    revision: 1,
    appliedTerms,
  };
  return { ...f, original, snapshot, application, appliedTerms };
}
