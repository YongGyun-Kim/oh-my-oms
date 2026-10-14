import type { CommonConditionDraft, Ref, U3ProductInput } from '@oms/contracts';
import { productFixture } from './commercial.js';

export function catalogInput(basis: Ref): U3ProductInput {
  const effectiveWindow = {
      startAt: '2026-10-01T00:00:00.000Z',
      endAt: null,
      startInclusive: true,
      endInclusive: false,
    },
    shared = { effectiveWindow, evidenceRefs: [basis] };
  const conditions: CommonConditionDraft[] = [
    { ...shared, conditionKey: 'PRICE', value: { currency: 'KRW', value: '1000' } },
    { ...shared, conditionKey: 'PAYMENT', value: { mode: 'PREPAY', termsRef: basis } },
    { ...shared, conditionKey: 'PROVISION', value: { choice: 'FULL', termsRef: basis } },
    { ...shared, conditionKey: 'COMPLETION', value: basis },
    { ...shared, conditionKey: 'VISIBILITY', value: true },
  ];
  return {
    ...productFixture(),
    salesConditionRefs: [basis],
    offerDraft: { effectiveWindow, conditions, revisionEvidenceRefs: [basis] },
  };
}
