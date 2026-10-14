import { describe, expect, it } from 'vitest';
import { SchemaValidator, U4_PROFILE } from '@oms/contracts';
import { paymentPlanMode, u4Ref as modelRef } from '@oms/core';
import { u4Plan } from '../fixtures/contracts.js';
import { modelFixture } from '../../u3/fixtures/models.js';
const schema = new SchemaValidator();
const draft = () => {
  const { planRevision, total, obligations, knowledge } = u4Plan();
  return { planRevision, total, obligations, knowledge };
};
const validate = (value: unknown) =>
  schema.validateUri(U4_PROFILE + '#/$defs/PaymentPlanDraft', value);
describe('U4 명시 지급 계획', () => {
  it('임의 명칭과 제공 전200·제공 후800을 혼합 계획으로 보존한다', () => {
    const plan = draft();
    plan.obligations[0]!.label = '검증 환경 사용분';
    expect(validate(plan)).toBe(plan);
    expect(paymentPlanMode(plan)).toBe('MIXED');
    expect(plan.obligations.map((value) => value.obligationKey)).toEqual(['first', 'second']);
  });
  it('승인 총액과 의무 합계 불일치를 거절하며 반올림하지 않는다', () => {
    const plan = draft();
    plan.total.value = '1001';
    expect(() => validate(plan)).toThrow();
    plan.total.value = '1000.5';
    expect(() => validate(plan)).toThrow();
  });
  it('Number 안전 정수보다 큰 원 단위 금액도 정확히 합산한다', () => {
    const plan = draft();
    plan.obligations[0]!.amount.value = '9007199254740993';
    plan.total.value = '9007199254741793';
    expect(validate(plan)).toBe(plan);
  });
  it('명시 전액후불과 전액선불을 구별한다', () => {
    const plan = draft();
    plan.obligations.forEach((value) => {
      value.requiredBeforeProvision = false;
    });
    expect(paymentPlanMode(plan)).toBe('POSTPAY');
    plan.obligations.forEach((value) => {
      value.requiredBeforeProvision = true;
    });
    expect(paymentPlanMode(plan)).toBe('PREPAY');
  });
  it('확인된0원 빈 의무와 미확인을 구분한다', () => {
    const plan = { ...draft(), total: { currency: 'KRW', value: '0' }, obligations: [] };
    expect(validate(plan)).toBe(plan);
    expect(paymentPlanMode(plan as ReturnType<typeof draft>)).toBe('POSTPAY');
    expect(() => validate({ ...plan, knowledge: 'UNKNOWN' })).toThrow();
    expect(() => validate({ ...plan, total: { currency: 'KRW', value: '1' } })).toThrow();
  });
  it('안정 의무 키의 중복이나 근거 없는 의무를 거절한다', () => {
    const plan = draft();
    plan.obligations[1]!.obligationKey = plan.obligations[0]!.obligationKey;
    expect(() => validate(plan)).toThrow();
    plan.obligations[1]!.obligationKey = 'different';
    plan.obligations[1]!.agreementEvidenceRefs = [];
    expect(() => validate(plan)).toThrow();
  });
  it('새 model3 원본 참조는 실제 개정을 발급하며 구형 원본을 승격하지 않는다', () => {
    const old = modelFixture('Order');
    expect(() => modelRef('Order', old, schema)).toThrow();
    const current = {
      ...old,
      modelVersion: 3,
      paymentPlan: u4Plan(),
      paymentKind: 'MIXED',
      revision: 7,
    };
    expect(modelRef('Order', current, schema).revision).toBe(7);
  });
  it('구형 주문 입력은 혼합 모드와 새 계획을 조용히 허용하지 않는다', () => {
    const line = { productRef: u4Plan().agreementRevisionRef, quantity: 1, paymentMode: 'MIXED' };
    expect(() =>
      schema.validateUri('urn:oms:contract:u3-commercial:2#/$defs/OrderLineInput', line),
    ).toThrow();
    expect(() => validate({ ...draft(), autoRenew: true })).toThrow();
  });
});
