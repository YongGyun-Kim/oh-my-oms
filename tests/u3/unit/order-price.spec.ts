import { describe, expect, it } from 'vitest';
import { SchemaValidator, U3_PROFILE } from '@oms/contracts';
import { unconfirmedOrderPrice } from '../../../packages/core/src/order-price.js';
import { proposalTerms } from '../fixtures/proposal-input.js';
import { fixtureRef, fixtureScope } from '../fixtures/identity.js';
import { registeredOrderInput, orderQuery } from '../fixtures/order-input.js';
import { orderFixture } from '../fixtures/commercial.js';

const schema = new SchemaValidator();
describe('주문 전체 금액의 확인 전 계산과 실제 닫힌 계약', () => {
  it('알려진 단가×수량·상품 합계는 정확 계산해도 비용 확인 없는 전체 합계는 UNKNOWN이다', () => {
    const terms = proposalTerms(fixtureRef('OrderAcceptance', 'PurchaseTermsSnapshot'));
    terms.lines[0]!.quantity = 2;
    terms.lines[0]!.price.value = '9007199254740993';
    expect(unconfirmedOrderPrice(terms, schema)).toEqual({
      lineAmounts: [{ currency: 'KRW', value: '18014398509481986' }],
      productAmount: { currency: 'KRW', value: '18014398509481986' },
      adjustments: [],
      total: null,
      knowledge: 'UNKNOWN',
    });
    terms.lines[0]!.price.value = '0';
    expect(unconfirmedOrderPrice(terms, schema)).toMatchObject({
      productAmount: { value: '0' },
      total: null,
      knowledge: 'UNKNOWN',
    });
  });
  it('허용 Money 표현 밖 곱·소수·잘못된 수량은 잘라 저장하지 않는다', () => {
    const terms = proposalTerms(fixtureRef('OrderAcceptance', 'PurchaseTermsSnapshot'));
    terms.lines[0]!.price.value = '9'.repeat(4096);
    terms.lines[0]!.quantity = 2;
    expect(() => unconfirmedOrderPrice(terms, schema)).toThrow();
    terms.lines[0]!.price.value = '1000.5';
    expect(() => unconfirmedOrderPrice(terms, schema)).toThrow();
    terms.lines[0]!.price.value = '1';
    terms.lines[0]!.quantity = 0;
    expect(() => unconfirmedOrderPrice(terms, schema)).toThrow();
  });
  it('실제 registry3 제출/조회와 전체 확인 자료의 폐쇄 필드/직원 참조를 연결하고 구형 URI를 유지한다', () => {
    expect(registeredOrderInput('submitOrder', orderFixture())).toEqual(orderFixture());
    const query = orderQuery(fixtureRef('OrderAcceptance', 'Order'), fixtureScope());
    expect(registeredOrderInput('readAcceptedOrder', query)).toEqual(query);
    expect(() =>
      registeredOrderInput('readAcceptedOrder', { ...query, acceptance: true }),
    ).toThrow();
    expect(() =>
      schema.validateUri(U3_PROFILE + '#/$defs/PriceConfirmation', {
        priceBreakdown: {},
        confirmedByRef: fixtureRef('ProductCatalog', 'Product'),
        evidenceRefs: [],
      }),
    ).toThrow();
    expect(() =>
      registeredOrderInput('submitOrder', { ...orderFixture(), autoConfirmed: true }),
    ).toThrow();
  });
});
