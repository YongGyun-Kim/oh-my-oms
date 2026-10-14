import { describe, expect, it } from 'vitest';
import { u4DueFromFact, u4FullCompletion, u4IsDelayCandidate, u4KstDueDate } from '@oms/core';
import type { U4ProvisionTranche } from '@oms/core';
import { u4Ref } from '../fixtures/contracts.js';

const orderRef = u4Ref('OrderAcceptance', 'Order'),
  lineRef = u4Ref('OrderAcceptance', 'OrderLine'),
  termsSnapshotRef = u4Ref('OrderAcceptance', 'PurchaseTermsSnapshot'),
  completionBasisRef = u4Ref('ProductCatalog', 'CommonOfferRevision');
const expected = {
  orderRef,
  termsSnapshotRef,
  productType: 'HARDWARE' as const,
  lines: [{ lineRef, quantity: 2, completionBasisRef }],
};
const tranche = (): U4ProvisionTranche => ({
  trancheId: 'synthetic-full-tranche',
  trancheRef: u4Ref('HardwareFulfillment', 'ShipmentTranche'),
  orderRef,
  orderLineRef: lineRef,
  termsSnapshotRef,
  completionBasis: 'HW_CUSTOMER_ACCEPTANCE',
  completionState: 'COMPLETED',
  completedQuantity: 2,
  completedAt: '2026-12-01T01:00:00.000Z',
  hardwareDeliveredAt: null,
  customerAcceptedAt: '2026-12-01T01:00:00.000Z',
  softwareIssuedAt: null,
  resultAvailableAt: null,
  contractualStartAt: null,
  sourceRevision: 1,
  correctionOf: null,
  correctedAt: null,
  evidenceRefs: [u4Ref('HardwareFulfillment', 'HardwareHistory')],
});
describe('U4 실제 완료일과 한국 달력 기한', () => {
  it('12월1일에30일을 더하면12월31일이며 청구일을 기산하지 않는다', () => {
    expect(u4KstDueDate('2026-12-01T01:00:00.000Z', 30)).toBe('2026-12-31');
  });
  it('N0은 실제 한국 날짜이고 한국 자정 경계를 보존한다', () => {
    expect(u4KstDueDate('2026-11-30T14:59:59.999Z', 0)).toBe('2026-11-30');
    expect(u4KstDueDate('2026-11-30T15:00:00.000Z', 0)).toBe('2026-12-01');
  });
  it('윤일·평년 월말·연말을 달력 날짜로 계산한다', () => {
    expect(u4KstDueDate('2028-02-28T00:00:00.000Z', 1)).toBe('2028-02-29');
    expect(u4KstDueDate('2027-02-28T00:00:00.000Z', 1)).toBe('2027-03-01');
    expect(u4KstDueDate('2026-12-31T00:00:00.000Z', 1)).toBe('2027-01-01');
  });
  it('기한일 전체까지 허용하며 다음 한국 날짜부터 지연 후보로 구분한다', () => {
    expect(u4IsDelayCandidate('2026-12-31', '2026-12-31T14:59:59.999Z')).toBe(false);
    expect(u4IsDelayCandidate('2026-12-31', '2026-12-31T15:00:00.000Z')).toBe(true);
  });
  it('잘못된 날짜·음수/소수 일수·유한 날짜 범위 초과를 보정하지 않는다', () => {
    for (const days of [-1, 0.5, Number.MAX_SAFE_INTEGER])
      expect(() => u4KstDueDate('2026-12-01T01:00:00.000Z', days)).toThrow();
    expect(() => u4IsDelayCandidate('2026-02-30', '2026-03-01T00:00:00.000Z')).toThrow();
    expect(() => u4KstDueDate('9999-12-31T14:00:00.000Z', 1)).toThrow();
  });
  it('실제 고객 인수는 별도 배송 증거를 일률 요구하지 않고 FULL 수량을 확인한다', () => {
    expect(u4FullCompletion(expected, [tranche()]).completedAt).toBe('2026-12-01T01:00:00.000Z');
    const delivered = {
      ...tranche(),
      completionBasis: 'HW_DELIVERY' as const,
      hardwareDeliveredAt: tranche().completedAt,
      customerAcceptedAt: null,
    };
    expect(u4FullCompletion(expected, [delivered]).completedAt).toBe(delivered.hardwareDeliveredAt);
  });
  it('부분·미완료·다른 품목과 조기 SW 발급을 계약상 FULL 완료로 추정하지 않는다', () => {
    for (const invalid of [
      { ...tranche(), completedQuantity: 1 },
      {
        ...tranche(),
        completionState: 'PENDING' as const,
        completedQuantity: 0,
        completedAt: null,
      },
      { ...tranche(), orderLineRef: { ...lineRef, id: 'another-line' } },
    ])
      expect(() => u4FullCompletion(expected, [invalid])).toThrow();
    const software: U4ProvisionTranche = {
      ...tranche(),
      trancheRef: u4Ref('SoftwareLifecycle', 'IssuanceAttempt'),
      completionBasis: 'SW_ISSUANCE_AVAILABLE_AND_START',
      softwareIssuedAt: '2026-11-01T00:00:00.000Z',
      resultAvailableAt: '2026-12-01T01:00:00.000Z',
      contractualStartAt: '2026-12-02T00:00:00.000Z',
      hardwareDeliveredAt: null,
      customerAcceptedAt: null,
    };
    expect(() => u4FullCompletion({ ...expected, productType: 'SOFTWARE' }, [software])).toThrow();
    expect(
      u4FullCompletion({ ...expected, productType: 'SOFTWARE' }, [
        { ...software, completedAt: software.contractualStartAt },
      ]).completedAt,
    ).toBe(software.contractualStartAt);
  });
  it('고정일과 확인 사건 기산을 구분하고 미확인 사건을 임의 날짜로 채우지 않는다', () => {
    expect(u4DueFromFact({ kind: 'FIXED_DATE', date: '2027-01-10' }, null)).toBe('2027-01-10');
    const basis = {
      kind: 'CONFIRMED_FACT_PLUS_DAYS' as const,
      sourceOwner: 'HardwareFulfillment' as const,
      event: 'AGREED_CONFIRMED_FACT' as const,
      ruleRef: completionBasisRef,
      calendar: 'KST_CALENDAR_DAYS' as const,
      days: 30,
    };
    expect(u4DueFromFact(basis, null)).toBeNull();
    expect(u4DueFromFact(basis, tranche().completedAt)).toBe('2026-12-31');
  });
});
