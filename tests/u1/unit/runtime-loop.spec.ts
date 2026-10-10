import { describe, expect, it, vi } from 'vitest';
import { abortableDelay, runWorkerLoop } from '../../../packages/integrations/src/runtime-loop.js';
describe('standalone worker 유한 실패 대기·종료·원래 작업 보존', () => {
  it('종료한 signal은 새 cycle을 시작하지 않는다', async () => {
    const stop = new AbortController();
    stop.abort();
    const cycle = vi.fn();
    await runWorkerLoop(cycle, stop.signal, vi.fn());
    expect(cycle).not.toHaveBeenCalled();
  });
  it('성공 cycle 뒤 종료하면 추가 receive/효과를 만들지 않는다', async () => {
    const stop = new AbortController();
    const cycle = vi.fn(async () => stop.abort());
    await runWorkerLoop(cycle, stop.signal, vi.fn());
    expect(cycle).toHaveBeenCalledOnce();
  });
  it('처리 실패를 침묵시키지 않고 제한된 대기 뒤 같은 loop를 진행한다', async () => {
    vi.useFakeTimers();
    const stop = new AbortController();
    let count = 0;
    const failure = vi.fn();
    const running = runWorkerLoop(
      async () => {
        if (++count === 1) throw new Error('실패');
        stop.abort();
      },
      stop.signal,
      failure,
    );
    await vi.advanceTimersByTimeAsync(1000);
    await running;
    expect(failure).toHaveBeenCalledOnce();
    expect(count).toBe(2);
    vi.useRealTimers();
  });
  it('실패 대기 중 drain은 즉시 중단하고 새 cycle을 시작하지 않는다', async () => {
    const stop = new AbortController();
    const cycle = vi.fn(async () => {
      throw new Error('실패');
    });
    const failure = vi.fn(() => stop.abort());
    await runWorkerLoop(cycle, stop.signal, failure);
    expect(cycle).toHaveBeenCalledOnce();
  });
  it('대기 종료마다 abort listener를 제거해 장기 실행 buffer를 늘리지 않는다', async () => {
    const stop = new AbortController();
    const remove = vi.spyOn(stop.signal, 'removeEventListener');
    await abortableDelay(1, stop.signal);
    expect(remove).toHaveBeenCalledOnce();
  });
  it('대기 중 abort는 남은 30초 타이머까지 기다리지 않는다', async () => {
    const stop = new AbortController();
    const pending = abortableDelay(30000, stop.signal);
    stop.abort();
    await pending;
  });
});
