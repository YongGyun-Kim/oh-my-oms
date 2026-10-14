import { describe, expect, it } from 'vitest';
import type { ConditionBinding, EffectiveWindow } from '@oms/contracts';
import {
  assertNoCommercialConflict,
  overlappingWindows,
  resolveConditionBindings,
} from '../../../packages/core/src/commercial-terms.js';
import { fixtureRef } from '../fixtures/identity.js';

const window: EffectiveWindow = {
  startAt: '2026-10-01T00:00:00.000Z',
  endAt: '2026-12-01T00:00:00.000Z',
  startInclusive: true,
  endInclusive: false,
};
const binding = (id: string, value = '1000', effectiveWindow = window): ConditionBinding => ({
  conditionKey: 'PRICE',
  sourceRef: fixtureRef(
    id === 'common' ? 'ProductCatalog' : 'CommercialAgreement',
    id === 'common' ? 'CommonOfferRevision' : 'AgreementRevision',
    id,
  ),
  value: { currency: 'KRW', value },
  effectiveWindow,
  evidenceRefs: [fixtureRef('IdentityRecovery', 'VerificationEvidence', 'proof')],
});
const agreement = (id: string, value = '900', effectiveWindow = window) => ({
  agreementRevisionId: id,
  state: 'APPROVED',
  productRefs: [fixtureRef('ProductCatalog', 'Product', 'product')],
  effectiveWindow,
  conditionBindings: [binding(id, value, effectiveWindow)],
});
describe('기업 조건의 구간 충돌과 조건별 원본 우선', () => {
  it('같은 상품·항목의 다른 값이 겹치면 차단한다', () => {
    expect(() => assertNoCommercialConflict(agreement('new', '800'), [agreement('old')])).toThrow();
  });
  it('동일 값·다른 상품·다른 항목·미승인은 상충한 적용으로 추정하지 않는다', () => {
    expect(() => assertNoCommercialConflict(agreement('new'), [agreement('old')])).not.toThrow();
    expect(() =>
      assertNoCommercialConflict(agreement('new', '800'), [
        { ...agreement('old'), productRefs: [fixtureRef('ProductCatalog', 'Product', 'other')] },
      ]),
    ).not.toThrow();
    expect(() =>
      assertNoCommercialConflict(agreement('new'), [{ ...agreement('old'), state: 'REGISTERED' }]),
    ).not.toThrow();
    expect(() =>
      assertNoCommercialConflict(agreement('new'), [
        {
          ...agreement('old'),
          conditionBindings: [{ ...binding('old'), conditionKey: 'VISIBILITY', value: true }],
        },
      ]),
    ).not.toThrow();
  });
  it('접하는 두 구간은 양쪽 포함일 때만 겹친다', () => {
    const next = { ...window, startAt: window.endAt!, endAt: null };
    expect(overlappingWindows(window, next)).toBe(false);
    expect(overlappingWindows({ ...window, endInclusive: true }, next)).toBe(true);
    expect(
      overlappingWindows({ ...window, endInclusive: true }, { ...next, startInclusive: false }),
    ).toBe(false);
  });
  it('명시 종료 없음은 뒤쪽 구간과 겹친다', () => {
    expect(
      overlappingWindows(
        { ...window, endAt: null },
        { ...window, startAt: '2028-01-01T00:00:00.000Z', endAt: null },
      ),
    ).toBe(true);
  });
  it('기업 조건이 공통 단가를 대체하며 정확한 sourceRef를 보존한다', () => {
    const resolved = resolveConditionBindings(
      [binding('common')],
      [agreement('corporate')],
      new Date('2026-10-12T00:00:00.000Z'),
    );
    expect(resolved).toEqual([binding('corporate', '900')]);
  });
  it('미래·만료·미승인 개정을 현재 기업 조건으로 사용하지 않는다', () => {
    expect(
      resolveConditionBindings(
        [binding('common')],
        [
          agreement('future', '800', { ...window, startAt: '2026-11-01T00:00:00.000Z' }),
          agreement('expired', '700', { ...window, endAt: '2026-10-11T00:00:00.000Z' }),
          { ...agreement('draft', '600'), state: 'CONFIRMATION_REQUIRED' },
        ],
        new Date('2026-10-12T00:00:00.000Z'),
      ),
    ).toEqual([binding('common')]);
  });
  it('같은 기업 조건 충돌을 공통 단가/최근 입력으로 덮지 않는다', () => {
    expect(() =>
      resolveConditionBindings(
        [binding('common')],
        [agreement('a'), agreement('b', '800')],
        new Date('2026-10-12T00:00:00.000Z'),
      ),
    ).toThrow();
  });
  it('서로 다른 조건 항목의 적용 개정을 하나로 축약하지 않는다', () => {
    const payment: ConditionBinding = {
      ...binding('payment'),
      conditionKey: 'PAYMENT',
      value: {
        mode: 'POSTPAY',
        termsRef: fixtureRef('ProductCatalog', 'CommonOfferRevision', 'terms'),
      },
    };
    const resolved = resolveConditionBindings(
      [binding('common')],
      [agreement('price'), { ...agreement('payment'), conditionBindings: [payment] }],
      new Date('2026-10-12T00:00:00.000Z'),
    );
    expect(resolved.map((value) => value.sourceRef.id)).toEqual(['price', 'payment']);
  });
});
