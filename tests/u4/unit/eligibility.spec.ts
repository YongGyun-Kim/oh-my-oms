import { describe, expect, it } from 'vitest';
import { u4PaymentCondition } from '@oms/core';
import { u4Money, u4Plan } from '../fixtures/contracts.js';

const first = () => ({
  obligationKey: u4Plan().obligations[0]!.obligationKey,
  amount: u4Money('200'),
  net: u4Money('200'),
  issued: true,
  confirmed: true,
});
describe('U4 목적별 현재 지급 조건 계산', () => {
  it('판매 수락은 아직 청구·입금이 없어도 유효 계획의 별도 준비 판단이 가능하다', () => {
    expect(u4PaymentCondition('SALE_ACCEPTANCE', u4Plan(), [], 'CLEAR')).toBe('ALLOW');
  });
  it('제공 전 필수 청구가 미발행이면 필요액을0원으로 만들지 않는다', () => {
    expect(u4PaymentCondition('PROVISION', u4Plan(), [], 'CLEAR')).toBe('HOLD');
    expect(
      u4PaymentCondition('PROVISION', u4Plan(), [{ ...first(), issued: false }], 'CLEAR'),
    ).toBe('HOLD');
  });
  it('제공 전200 충족은 후불800 미도래와 구분하며 일부 지급으로 전체를 허용하지 않는다', () => {
    expect(u4PaymentCondition('PROVISION', u4Plan(), [first()], 'CLEAR')).toBe('ALLOW');
    expect(
      u4PaymentCondition('PROVISION', u4Plan(), [{ ...first(), net: u4Money('199') }], 'CLEAR'),
    ).toBe('HOLD');
  });
  it('명시 전액 후불의 빈 선지급 집합과 미확인 계획을 구분한다', () => {
    const plan = u4Plan();
    plan.obligations = plan.obligations.map((value) => ({
      ...value,
      requiredBeforeProvision: false,
    }));
    expect(u4PaymentCondition('PROVISION', plan, [], 'CLEAR')).toBe('ALLOW');
    expect(u4PaymentCondition('PROVISION', null, [], 'CLEAR')).toBe('UNVERIFIED');
  });
  it('현재 목적의 확인 제한과 제한 근거 미확인을 별도로 유지한다', () => {
    expect(u4PaymentCondition('SALE_ACCEPTANCE', u4Plan(), [], 'RESTRICTED')).toBe('HOLD');
    expect(u4PaymentCondition('PROVISION', u4Plan(), [first()], 'UNVERIFIED')).toBe('UNVERIFIED');
  });
  it('중복 청구·다른 의무·확정되지 않은 배분을 정상 충족으로 합치지 않는다', () => {
    expect(u4PaymentCondition('PROVISION', u4Plan(), [first(), first()], 'CLEAR')).toBe('HOLD');
    expect(
      u4PaymentCondition(
        'PROVISION',
        u4Plan(),
        [{ ...first(), obligationKey: 'unrelated' }],
        'CLEAR',
      ),
    ).toBe('HOLD');
    expect(
      u4PaymentCondition('PROVISION', u4Plan(), [{ ...first(), confirmed: false }], 'CLEAR'),
    ).toBe('UNVERIFIED');
  });
  it('명시 약정 금액과 다른 청구·계획 합계 불일치·목적 누락을 허용하지 않는다', () => {
    expect(
      u4PaymentCondition('PROVISION', u4Plan(), [{ ...first(), amount: u4Money('201') }], 'CLEAR'),
    ).toBe('UNVERIFIED');
    expect(() =>
      u4PaymentCondition('PROVISION', { ...u4Plan(), total: u4Money('1001') }, [first()], 'CLEAR'),
    ).toThrow();
    expect(u4PaymentCondition(undefined as never, u4Plan(), [first()], 'CLEAR')).toBe('UNVERIFIED');
  });
  it('큰 원 단위 금액도 정확한 정수로 비교하고 한 원 부족을 반올림하지 않는다', () => {
    const plan = u4Plan(),
      value = '900719925474099312345';
    plan.total = u4Money(value);
    plan.obligations = [{ ...plan.obligations[0]!, amount: u4Money(value) }];
    expect(
      u4PaymentCondition(
        'PROVISION',
        plan,
        [{ ...first(), amount: u4Money(value), net: u4Money((BigInt(value) - 1n).toString()) }],
        'CLEAR',
      ),
    ).toBe('HOLD');
    expect(
      u4PaymentCondition(
        'PROVISION',
        plan,
        [{ ...first(), amount: u4Money(value), net: u4Money(value) }],
        'CLEAR',
      ),
    ).toBe('ALLOW');
  });
});
