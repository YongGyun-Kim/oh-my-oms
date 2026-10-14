import { describe, expect, it } from 'vitest';
import { NoticeWorker, retryDelay } from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import { SyntheticQueue } from '../fixtures/queue.js';
describe('추가 시도 및 worker 등록 경계', () => {
  it('추가1은0~5초 범위다', () => {
    expect(retryDelay(1, 0)).toBe(0);
    expect(retryDelay(1, 1)).toBe(5000);
  });
  it('추가2는0~20초 범위다', () => {
    expect(retryDelay(2, 0.5)).toBe(10000);
    expect(retryDelay(2, 1)).toBe(20000);
  });
  it('추가3은0~80초 범위다', () => {
    expect(retryDelay(3, 0.5)).toBe(40000);
    expect(retryDelay(3, 1)).toBe(80000);
  });
  it('최초 또는5번째 추가시도를 허용하지 않는다', () => {
    expect(() => retryDelay(0, 0.5)).toThrow();
    expect(() => retryDelay(4, 0.5)).toThrow();
  });
  it('비정수/음수/범위 밖 random을 거절한다', () => {
    expect(() => retryDelay(1.5, 0.5)).toThrow();
    expect(() => retryDelay(1, -0.1)).toThrow();
    expect(() => retryDelay(1, 1.1)).toThrow();
  });
  it('운영에서 합성 broker 등록은 실패한다', () =>
    expect(
      () => new NoticeWorker({} as ProtectedStore, new SyntheticQueue(), () => new Date(), false),
    ).toThrow());
  it('실제 broker 미등록은 생성만으로 큐 가능/발행완료를 주장하지 않는다', () =>
    expect(
      () => new NoticeWorker({} as ProtectedStore, null, () => new Date(), false),
    ).not.toThrow());
  it('알 수 없는consumer는 원본 조회/효과 전에 거절한다', async () => {
    const worker = new NoticeWorker({} as ProtectedStore, null, () => new Date(), false);
    await expect(
      worker.consume({ id: 'id', receiptHandle: 'handle', consumer: 'unknown', body: {} }),
    ).rejects.toMatchObject({ code: 'CONSUMER_NOT_REGISTERED' });
  });
});
