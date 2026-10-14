import { describe, expect, it } from 'vitest';
import { ExecutionBudget } from '@oms/contracts';
import { processWorkerMessages, runWorkerCycle } from '@oms/integrations';
import type { QueueMessage, QueueBroker } from '@oms/core';
const messages = (count: number): QueueMessage[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i),
    receiptHandle: 'handle-' + i,
    consumer: 'u1-in-app-notice',
    body: { originalWork: i },
  }));
describe('유한 worker 배치의 독립 실패·종료·원래 예산', () => {
  it('앞 메시지 실패가 뒤의 원래 메시지 처리를 막지 않는다', async () => {
    const seen: string[] = [];
    const failures: string[] = [];
    const result = await processWorkerMessages(
      messages(7),
      async (message) => {
        seen.push(message.id);
        if (message.id === '0') throw new Error('원래 기한 만료');
      },
      new AbortController().signal,
      (_error, message) => failures.push(message.id),
    );
    expect(result).toEqual({ attempted: 7, succeeded: 6, failed: 1, unstarted: 0 });
    expect(seen).toHaveLength(7);
    expect(failures).toEqual(['0']);
  });
  it('동시에 처리하는 메시지는 최대4개다', async () => {
    let active = 0;
    let maximum = 0;
    await processWorkerMessages(
      messages(10),
      async () => {
        maximum = Math.max(maximum, ++active);
        await new Promise((done) => setTimeout(done, 5));
        active--;
      },
      new AbortController().signal,
      () => {},
    );
    expect(maximum).toBe(4);
  });
  it('등록 batch10개를 넘긴 입력은 한 메시지도 실행하지 않는다', async () => {
    let called = 0;
    await expect(
      processWorkerMessages(
        messages(11),
        async () => {
          called++;
        },
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow();
    expect(called).toBe(0);
  });
  it('종료된 signal에서는 미실행을 성공으로 바꾸지 않는다', async () => {
    const stop = new AbortController();
    stop.abort();
    expect(
      await processWorkerMessages(
        messages(3),
        async () => {
          throw new Error();
        },
        stop.signal,
        () => {},
      ),
    ).toEqual({ attempted: 0, succeeded: 0, failed: 0, unstarted: 3 });
  });
  it('진행 중 종료되면 다음 메시지부터 시작하지 않는다', async () => {
    const stop = new AbortController();
    const result = await processWorkerMessages(
      messages(10),
      async () => {
        stop.abort();
      },
      stop.signal,
      () => {},
    );
    expect(result.attempted).toBe(1);
    expect(result.unstarted).toBe(9);
  });
  it('관측 실패도 원래 실패를 성공이나 ACK로 만들지 않는다', async () => {
    const result = await processWorkerMessages(
      messages(2),
      async () => {
        throw new Error();
      },
      new AbortController().signal,
      () => {
        throw new Error('관측 불명');
      },
    );
    expect(result.failed).toBe(2);
    expect(result.succeeded).toBe(0);
  });
  it('relay·receive·consume는 같은30초예산을 계승한다', async () => {
    const captured: ExecutionBudget[] = [];
    const remember = () => {
      captured.push(ExecutionBudget.current()!);
    };
    const broker = {
      kind: 'SYNTHETIC',
      receive: async (_consumer: string, signal: AbortSignal) => {
        remember();
        expect(signal.aborted).toBe(false);
        return messages(1);
      },
    } as QueueBroker;
    await runWorkerCycle(
      {
        relayBatch: async () => {
          remember();
          return 0;
        },
        consume: async () => remember(),
      },
      broker,
      new AbortController().signal,
      () => {},
    );
    expect(captured).toHaveLength(3);
    expect(captured.every((value) => value === captured[0])).toBe(true);
    expect(captured[0]!.remaining()).toBeLessThanOrEqual(30000);
  });
  it('이미 종료된 cycle은 relay·receive도 실행하지 않는다', async () => {
    const stop = new AbortController();
    stop.abort();
    let called = 0;
    await expect(
      runWorkerCycle(
        {
          relayBatch: async () => {
            called++;
            return 0;
          },
          consume: async () => {},
        },
        {} as QueueBroker,
        stop.signal,
        () => {},
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_DEADLINE' });
    expect(called).toBe(0);
  });
});
