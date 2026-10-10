import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { HttpAdmission } from '@oms/api';
function response() {
  const value = new EventEmitter() as EventEmitter & {
    status: ReturnType<typeof vi.fn>;
    type: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  value.status = vi.fn(() => value);
  value.type = vi.fn(() => value);
  value.json = vi.fn(() => value);
  return value;
}
const invoke = (
  admission: HttpAdmission,
  reply: ReturnType<typeof response>,
  next: ReturnType<typeof vi.fn>,
) => admission.handle({} as Request, reply as unknown as Response, next as NextFunction);
describe('API 프로세스 전체 유한 admission·응답/이탈 해제', () => {
  it('유한 최대가 아닌 설정은 시작하지 않는다', () => {
    for (const maximum of [0, 101, Infinity, 1.5])
      expect(() => new HttpAdmission(maximum)).toThrow();
  });
  it('동시 슬롯 안의 요청만 handler를 시작한다', () => {
    const admission = new HttpAdmission(1);
    const first = response();
    const next = vi.fn();
    invoke(admission, first, next);
    invoke(admission, response(), next);
    expect(next).toHaveBeenCalledOnce();
  });
  it('초과 요청은 업무 성공/ACK가 아닌503 backpressure다', () => {
    const admission = new HttpAdmission(1);
    invoke(admission, response(), vi.fn());
    const rejected = response();
    invoke(admission, rejected, vi.fn());
    expect(rejected.status).toHaveBeenCalledWith(503);
    expect(rejected.json.mock.calls[0]![0]).not.toHaveProperty('requestId');
  });
  it('정상 finish는 슬롯을 해제하며 listener를 남기지 않는다', () => {
    const admission = new HttpAdmission(1);
    const first = response();
    invoke(admission, first, vi.fn());
    first.emit('finish');
    const next = vi.fn();
    invoke(admission, response(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(first.listenerCount('close')).toBe(0);
  });
  it('client close도 슬롯을 해제하며 이후finish로 이중 해제하지 않는다', () => {
    const admission = new HttpAdmission(1);
    const first = response();
    invoke(admission, first, vi.fn());
    first.emit('close');
    first.emit('finish');
    const next = vi.fn();
    invoke(admission, response(), next);
    invoke(admission, response(), next);
    expect(next).toHaveBeenCalledOnce();
  });
  it('서로 다른 audience handler도 같은 admission을 쓰면 합산 한도를 지킨다', () => {
    const admission = new HttpAdmission(2);
    const next = vi.fn();
    for (let i = 0; i < 3; i++) invoke(admission, response(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
