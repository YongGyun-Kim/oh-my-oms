import { describe, expect, it } from 'vitest';
import { SchemaValidator, U3_PROFILE } from '@oms/contracts';
import { orderViewFixture } from '../fixtures/commercial.js';
import { appliedTermsFixture } from '../fixtures/applied-terms.js';
import { registeredOrderInput } from '../fixtures/order-input.js';
import { fixtureMeta } from '../fixtures/commercial.js';
import { fixtureRef } from '../fixtures/identity.js';
const schema = new SchemaValidator();
describe('실제 registry3 적용 입력·원래/현재 조회 출력 계약', () => {
  it('두 changeKind는 정확한 현재 개정·동의·U7분기를 유지한다', () => {
    const orderRef = fixtureRef('OrderAcceptance', 'Order'),
      input = {
        meta: fixtureMeta(orderRef.revision),
        targetScope: orderViewFixture().targetScope,
        orderRef,
        customerConsentRef: fixtureRef('CommercialAgreement', 'CustomerConsent'),
        newTermsRef: fixtureRef('CommercialAgreement', 'AgreementRevision'),
        changeKind: 'REVIEW_PRICE_CHANGE',
        afterSalesDecisionRef: null,
      };
    expect(() => registeredOrderInput('applyApprovedChange', input)).not.toThrow();
    const accepted = {
      ...input,
      changeKind: 'ACCEPTED_AFTERSALES_CHANGE',
      afterSalesDecisionRef: fixtureRef('AfterSalesDecision', 'AfterSalesDecisionRecord'),
    };
    expect(() => registeredOrderInput('applyApprovedChange', accepted)).not.toThrow();
    for (const change of [
      { afterSalesDecisionRef: null },
      { afterSalesDecisionRef: orderRef },
      { targetScope: undefined },
      { meta: fixtureMeta(null) },
      { approved: true },
    ])
      expect(() =>
        registeredOrderInput('applyApprovedChange', { ...accepted, ...change }),
      ).toThrow();
  });
  it('현재 적용 값은 원래 구매 행과 별도로 표시하며 다른 기업/상품/수량/기간 출력은 거절한다', () => {
    const view = {
      ...orderViewFixture(),
      appliedTerms: appliedTermsFixture(),
      currentTermsRef: fixtureRef('OrderAcceptance', 'OrderChangeApplication'),
    };
    expect(() => schema.validateUri(U3_PROFILE + '#/$defs/OrderView', view)).not.toThrow();
    for (const change of [
      (value: typeof view) => {
        value.appliedTerms.targetScope.enterpriseRef.id = 'foreign';
      },
      (value: typeof view) => {
        value.appliedTerms.capturedLines[0]!.productRef.id = 'foreign';
      },
      (value: typeof view) => {
        value.appliedTerms.terms.lines[0]!.quantity = 2;
        value.appliedTerms.capturedLines[0]!.quantity = 2;
        value.appliedTerms.priceBreakdown.lineAmounts[0] = { currency: 'KRW', value: '2000' };
        value.appliedTerms.priceBreakdown.productAmount = { currency: 'KRW', value: '2000' };
        value.appliedTerms.priceBreakdown.total = { currency: 'KRW', value: '2000' };
      },
    ]) {
      const changed = structuredClone(view);
      change(changed);
      expect(() => schema.validateUri(U3_PROFILE + '#/$defs/OrderView', changed)).toThrow();
    }
    expect(() => schema.validate('OrderView', view)).toThrow(); // 구형 wire에 새 profile 값을 전송하지 않는다.
  });
});
