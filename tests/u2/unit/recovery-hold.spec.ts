import { describe, it, expect } from 'vitest';
import { recoveryHoldTransition } from '@oms/core';
describe('보류 재검토/종료의 닫힌 전이', () => {
  it('HOLD만 새 현재 검토로 재개한다', () =>
    expect(recoveryHoldTransition('HOLD', 'resume')).toBe(true));
  it('접수/검토 중에는 resume로 별도 claim 단계를 만들지 않는다', () => {
    for (const state of ['REQUESTED', 'VERIFYING'])
      expect(recoveryHoldTransition(state, 'resume')).toBe(false);
  });
  it('등록 중/외부 실행 중에는 resume로 기한을 갱신하지 않는다', () => {
    for (const state of ['ENROLMENT_ONLY', 'EXTERNAL_PENDING'])
      expect(recoveryHoldTransition(state, 'resume')).toBe(false);
  });
  it('종료/완료/거절 원본을 되돌리지 않는다', () => {
    for (const state of ['CLOSED', 'COMPLETED', 'REJECTED'])
      for (const operation of ['resume', 'close'] as const)
        expect(recoveryHoldTransition(state, operation)).toBe(false);
  });
  it('접수/현재 검토는 현재 권위의 종료 대상이다', () => {
    for (const state of ['REQUESTED', 'VERIFYING'])
      expect(recoveryHoldTransition(state, 'close')).toBe(true);
  });
  it('HOLD 종료는 원래 불명 효과의 부재를 뜻하지 않는다', () =>
    expect(recoveryHoldTransition('HOLD', 'close')).toBe(true));
  it('제한 등록/외부 대조 단계도 정당한 현재 종료 대상이다', () => {
    for (const state of ['ENROLMENT_ONLY', 'EXTERNAL_PENDING'])
      expect(recoveryHoldTransition(state, 'close')).toBe(true);
  });
  it('구형/미등록 enum을 새 상태로 추측하지 않는다', () => {
    for (const state of ['VERIFICATION_PENDING', 'CANCELLED', 'OTHER'])
      for (const operation of ['resume', 'close'] as const)
        expect(recoveryHoldTransition(state, operation)).toBe(false);
  });
});
