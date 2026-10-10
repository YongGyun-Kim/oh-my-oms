import { describe, expect, it } from 'vitest';
import { OmsError } from '@oms/contracts';
import { QueuePublishFailure } from '@oms/core';
import { workerFailureOutcome } from '../../../packages/core/src/worker-observation.js';
describe('worker의 접근/업무/외부 불명/기술실패는 다른 분모다', () => {
  it('현재 권한 회수는 provider실패가 아니다', () =>
    expect(workerFailureOutcome(new OmsError(403, 'WORK_PERMIT', '합성'))).toBe('ACCESS_REFUSAL'));
  it('미등록 원래대상은 비노출 결과다', () =>
    expect(workerFailureOutcome(new OmsError(404, 'NOT_FOUND', '합성'))).toBe('NON_DISCLOSURE'));
  it('만료/중복대조 요구는 완료나 기술실패가 아니다', () =>
    expect(workerFailureOutcome(new OmsError(409, 'WORK_DEADLINE', '합성'))).toBe(
      'BUSINESS_REFUSAL',
    ));
  it('과부하는 별도다', () =>
    expect(workerFailureOutcome(new OmsError(429, 'OVERLOADED', '합성'))).toBe('OVERLOADED'));
  it('원래 외부호출 timeout은 효과불명이다', () =>
    expect(
      workerFailureOutcome(new OmsError(503, 'EXTERNAL_ORIGINAL_RECONCILIATION', '합성')),
    ).toBe('UNKNOWN_EXTERNAL'));
  it('SDK UNKNOWN은 실패가 곧 무효과임을 뜻하지 않는다', () =>
    expect(workerFailureOutcome(new QueuePublishFailure('UNKNOWN', '합성'))).toBe(
      'UNKNOWN_EXTERNAL',
    ));
  it('확인된무효과 throttling은 기술실패로 기록한다', () =>
    expect(workerFailureOutcome(new QueuePublishFailure('SAFE_TRANSIENT', '합성'))).toBe(
      'TECHNICAL_FAILURE',
    ));
  it('DB/예상하지 못한 예외는 기술실패다', () =>
    expect(workerFailureOutcome(new Error('합성 DB실패'))).toBe('TECHNICAL_FAILURE'));
});
