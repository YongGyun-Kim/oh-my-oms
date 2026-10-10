import { describe, expect, it } from 'vitest';
import { availabilityForPath } from '@oms/integrations';
import type { AvailabilityInterval } from '@oms/integrations';
const end = 2592000000;
const baseline: AvailabilityInterval = {
  start: 0,
  end,
  state: 'AVAILABLE',
  cause: 'VERIFIED_SYNTHETIC_PROBE',
  planned: false,
};
const calculate = (intervals: AvailabilityInterval[]) =>
  availabilityForPath('customer-order-accept', 0, end, intervals);
describe('업무별30일가용성 합집합/관측미확인: 합성interval검증', () => {
  it('명시전체관측 정상은정확한2592000초분모다', () =>
    expect(calculate([baseline])).toMatchObject({
      availability: 1,
      remainingSeconds: 2592,
      realOperationProof: false,
    }));
  it('계획중단도2592초예산에포함한다', () =>
    expect(
      calculate([
        baseline,
        { start: 1000, end: 601000, state: 'UNAVAILABLE', cause: 'PLANNED', planned: true },
      ]),
    ).toMatchObject({ unavailableSeconds: 600, remainingSeconds: 1992 }));
  it('겹친여러원인의실패시간을두번더하지않는다', () =>
    expect(
      calculate([
        baseline,
        { start: 1000, end: 11000, state: 'UNAVAILABLE', cause: 'DB', planned: false },
        { start: 5000, end: 15000, state: 'UNAVAILABLE', cause: 'PROVIDER', planned: false },
      ]).unavailableSeconds,
    ).toBe(14));
  it('정상관측이있어도같은경로의미확인은실패예산이다', () =>
    expect(
      calculate([
        baseline,
        { start: 0, end: 10000, state: 'UNCONFIRMED', cause: 'INGEST_GAP', planned: false },
      ]).unconfirmedSeconds,
    ).toBe(10));
  it('빈/부분관측을성공으로채우지않는다', () => {
    expect(calculate([]).availability).toBe(0);
    expect(calculate([{ ...baseline, end: 10000 }]).unconfirmedSeconds).toBe(2591990);
  });
  it('다른업무의성공은실패경로와합산되지않는다', () => {
    expect(calculate([]).availability).toBe(0);
    expect(availabilityForPath('staff-private-read', 0, end, [baseline]).availability).toBe(1);
  });
  it('관측범위밖부분은잘라서세며전체window를줄이지않는다', () =>
    expect(
      calculate([
        baseline,
        { start: -1000, end: 1000, state: 'UNAVAILABLE', cause: 'PARTIAL', planned: false },
      ]).unavailableSeconds,
    ).toBe(1));
  it('잘못된기간/상태/무한buffer는판정하지않는다', () => {
    expect(() => availabilityForPath('customer-order-accept', 0, 60000, [])).toThrow();
    expect(() => calculate([{ ...baseline, end: 0 }])).toThrow();
    expect(() => calculate(Array.from({ length: 10001 }, () => baseline))).toThrow();
  });
});
