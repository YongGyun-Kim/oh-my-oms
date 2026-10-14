import { beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  cycle: null as null | (() => Promise<void>),
  failure: null as null | (() => void),
  signal: null as null | AbortSignal,
  resolve: null as null | (() => void),
  running: Promise.resolve(),
  messages: [{ id: 'one' }, { id: 'two' }],
  receive: vi.fn(),
  relay: vi.fn(),
  consume: vi.fn(),
  hostClose: vi.fn(),
  resourceClose: vi.fn(),
  telemetryClose: vi.fn(),
  configFail: false,
}));
vi.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: async () => ({ close: state.hostClose }) },
}));
vi.mock('@oms/core', () => ({
  NoticeWorker: class {
    relayBatch = state.relay;
    consume = state.consume;
  },
}));
vi.mock('@oms/integrations', async () => ({
  runWorkerCycle: (await import('../../../packages/integrations/src/worker-batch.js'))
    .runWorkerCycle,
  workerConfiguration: () => {
    if (state.configFail) throw new Error('운영 구성 미확인');
    return {
      queueUrls: { registered: 'https://queue.invalid' },
      telemetryEndpoint: 'https://collector.invalid',
    };
  },
  runtimeStore: async () => ({ store: {}, close: state.resourceClose }),
  RuntimeTelemetry: class {
    close = state.telemetryClose;
  },
  SqsBroker: class {
    receive = state.receive;
  },
  runWorkerLoop: (cycle: () => Promise<void>, signal: AbortSignal, failure: () => void) => {
    state.cycle = cycle;
    state.failure = failure;
    state.signal = signal;
    state.running = new Promise((done) => {
      state.resolve = done;
      signal.addEventListener('abort', () => done(), { once: true });
    });
    return state.running;
  },
}));
import { startWorker } from '../../../apps/worker/src/main.js';
beforeEach(() => {
  state.cycle = null;
  state.signal = null;
  state.failure = null;
  state.resolve = null;
  state.configFail = false;
  state.messages = [{ id: 'one' }, { id: 'two' }];
  for (const fn of [
    state.receive,
    state.relay,
    state.consume,
    state.hostClose,
    state.resourceClose,
    state.telemetryClose,
  ])
    fn.mockReset().mockResolvedValue(undefined);
  state.receive.mockImplementation(async () => state.messages);
});
describe('Nest standalone worker 실행·큐·현재 종료 연결', () => {
  it('구성 검증 전에는 worker/큐 loop를 시작하지 않는다', async () => {
    state.configFail = true;
    await expect(startWorker({ NODE_ENV: 'production' })).rejects.toThrow('구성');
    expect(state.cycle).toBeNull();
  });
  it('한 cycle은 relay 이후 원래 consumer 메시지를 유한 동시 처리에 전달한다', async () => {
    const host = await startWorker({ NODE_ENV: 'production' });
    await state.cycle!();
    expect(state.relay).toHaveBeenCalledOnce();
    expect(state.receive).toHaveBeenCalledWith('u1-in-app-notice', expect.any(AbortSignal));
    expect(state.consume.mock.calls.map((call) => call[0].id)).toEqual(['one', 'two']);
    await host.close();
  });
  it('빈 큐는 처리/성공 effect를 발명하지 않는다', async () => {
    state.messages = [];
    const host = await startWorker({ NODE_ENV: 'production' });
    await state.cycle!();
    expect(state.consume).not.toHaveBeenCalled();
    await host.close();
  });
  it('relay 실패는 receive/consumer를 실행하지 않고 불명으로 전파한다', async () => {
    state.relay.mockRejectedValue(new Error('relay unknown'));
    const host = await startWorker({ NODE_ENV: 'production' });
    await expect(state.cycle!()).rejects.toThrow('unknown');
    expect(state.receive).not.toHaveBeenCalled();
    await host.close();
  });
  it('한 consumer 실패를 기록하고 뒤 메시지의 독립 실행을 막지 않는다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.consume.mockRejectedValueOnce(new Error('current grant rejected'));
    const host = await startWorker({ NODE_ENV: 'production' });
    await state.cycle!();
    expect(state.consume).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]![0]).toContain('"acknowledged":false');
    await host.close();
    log.mockRestore();
  });
  it('drain은 loop 종료를 기다리며 뒤 메시지를 시작하지 않는다', async () => {
    const host = await startWorker({ NODE_ENV: 'production' });
    state.receive.mockImplementation(async () => {
      void host.close();
      return state.messages;
    });
    await expect(state.cycle!()).rejects.toMatchObject({ code: 'EXECUTION_DEADLINE' });
    await state.running;
    expect(state.consume).not.toHaveBeenCalled();
  });
  it('중복 종료는 호스트/DB/관측을 각각 한 번만 종료한다', async () => {
    const host = await startWorker({ NODE_ENV: 'production' });
    await host.close();
    await host.close();
    expect(state.signal?.aborted).toBe(true);
    for (const fn of [state.hostClose, state.resourceClose, state.telemetryClose])
      expect(fn).toHaveBeenCalledOnce();
  });
  it('cycle 오류·export 종료 실패는 업무 성공 로그로 바꾸지 않는다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.telemetryClose.mockRejectedValue(new Error('export unknown'));
    const host = await startWorker({ NODE_ENV: 'production' });
    state.failure!();
    await host.close();
    expect(log.mock.calls[0]![0]).toContain('ORIGINAL_WORK_RECONCILIATION_REQUIRED');
    expect(log.mock.calls).toHaveLength(2);
    log.mockRestore();
  });
});
