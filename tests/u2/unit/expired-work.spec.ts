import { describe, it, expect } from 'vitest';
import { originalWorkExpired } from '../../../packages/core/src/worker-consumer.js';
describe('원래 Work 기한의 고정 주입 시각 경계', () => {
  const deadline = '2026-10-10T00:05:00Z',
    at = Date.parse(deadline);
  it('경계 직전은 만료로 승격하지 않는다', () =>
    expect(originalWorkExpired(deadline, new Date(at - 1))).toBe(false));
  it('정각은 effect 실행 가능 시간이 아니다', () =>
    expect(originalWorkExpired(deadline, new Date(at))).toBe(true));
  it('직후에도 원래 기한을 갱신하지 않는다', () =>
    expect(originalWorkExpired(deadline, new Date(at + 1))).toBe(true));
  it('동일 instant의 한국 offset도 같은 경계다', () =>
    expect(originalWorkExpired('2026-10-10T09:05:00+09:00', new Date(at))).toBe(true));
  it('미등록 시각/invalid Date를 만료 없는 허가로 만들지 않는다', () => {
    expect(() => originalWorkExpired('unknown', new Date(at))).toThrow();
    expect(() => originalWorkExpired(deadline, new Date(NaN))).toThrow();
  });
});
