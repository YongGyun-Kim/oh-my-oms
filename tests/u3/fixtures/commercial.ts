import type {
  CommandMeta,
  ConditionBinding,
  U3OrderInput,
  U3OrderView,
  U3ProductInput,
} from '@oms/contracts';
import { fixtureRef, fixtureScope } from './identity.js';

export function fixtureMeta(expectedRevision: number | null = null): CommandMeta {
  return {
    clientRequestId: 'u3-synthetic-request',
    expectedRevision,
    reason: '로컬 합성 검증',
    evidenceRefs: [],
  };
}
export function productFixture(): U3ProductInput {
  return {
    meta: fixtureMeta(),
    productType: 'HARDWARE',
    softwareTermKind: null,
    label: '합성 하드웨어',
    salesDescription: '실제 판매 상품이 아닌 검증 자료',
    commonPrice: { currency: 'KRW', value: '1000' },
    salesConditionRefs: [],
  };
}
export function orderFixture(count = 1): U3OrderInput {
  return {
    meta: fixtureMeta(),
    targetScope: fixtureScope(),
    productType: 'HARDWARE',
    provisionChoice: 'FULL',
    partialConsentRef: null,
    lines: Array.from({ length: count }, (_, index) => {
      const sourceRef = fixtureRef('ProductCatalog', 'CommonOfferRevision', 'offer-' + index);
      const corporate = fixtureRef(
        'CommercialAgreement',
        'AgreementRevision',
        'agreement-' + index,
      );
      const basis = {
        effectiveWindow: {
          startAt: '2026-10-01T00:00:00.000Z',
          endAt: null,
          startInclusive: true,
          endInclusive: false,
        },
        evidenceRefs: [fixtureRef('CommercialAgreement', 'AgreementApproval', 'approval-' + index)],
      };
      const conditionBindings: ConditionBinding[] = [
        {
          ...basis,
          conditionKey: 'PRICE',
          sourceRef: { ...corporate },
          value: { currency: 'KRW', value: '1000' },
        },
        {
          ...basis,
          conditionKey: 'PAYMENT',
          sourceRef: { ...sourceRef },
          value: { mode: 'PREPAY', termsRef: { ...sourceRef } },
        },
      ];
      return {
        productRef: fixtureRef('ProductCatalog', 'Product', 'product-' + index),
        commonOfferRevisionRef: sourceRef,
        agreementRevisionRefs: [corporate],
        conditionBindings,
        quantity: 1,
        paymentMode: 'PREPAY',
        requestedActivationDate: null,
      };
    }),
  };
}
export function orderViewFixture(count = 1): U3OrderView {
  const input = orderFixture(count);
  return {
    orderRef: fixtureRef('OrderAcceptance', 'Order'),
    targetScope: input.targetScope,
    productType: input.productType,
    provisionChoice: 'FULL',
    consentRef: null,
    acceptance: 'REVIEW_REQUIRED',
    basisRefs: [],
    purchaseTermsSnapshotRef: fixtureRef('OrderAcceptance', 'PurchaseTermsSnapshot'),
    commonOfferRevisionRefs: input.lines.map((line) => line.commonOfferRevisionRef),
    agreementRevisionRefs: input.lines.flatMap((line) => line.agreementRevisionRefs),
    conditionBindings: input.lines.flatMap((line) => line.conditionBindings),
    lines: input.lines.map((line, index) => ({
      orderLineRef: fixtureRef('OrderAcceptance', 'OrderLine', 'line-' + index),
      productRef: line.productRef,
      quantity: line.quantity,
      purchasePrice: { currency: 'KRW', value: '1000' },
      paymentTermsRef: line.commonOfferRevisionRef,
      agreedPeriod: null,
      completionBasisRef: line.commonOfferRevisionRef,
      commonOfferRevisionRef: line.commonOfferRevisionRef,
      agreementRevisionRefs: line.agreementRevisionRefs,
      conditionBindings: line.conditionBindings,
    })),
  };
}
