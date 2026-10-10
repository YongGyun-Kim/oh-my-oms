import { EventEmitter } from 'node:events';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ mode: 'normal', calls: [] as unknown[][], kill: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    spawn: (...args: unknown[]) => {
      state.calls.push(args);
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: (signal: string) => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = (signal: string) => {
        state.kill(signal);
        queueMicrotask(() => child.emit('exit', null, signal));
      };
      queueMicrotask(() => {
        if (state.mode === 'interrupt')
          child.stdout.emit(
            'data',
            Buffer.from(JSON.stringify({ phase: 'PARTIAL_REPLAY_READY', rss: 100 }) + '\n'),
          );
        else if (state.mode === 'error') child.emit('error', new Error('spawn failed'));
        else if (state.mode === 'invalid') child.stdout.emit('data', Buffer.from('{\n'));
        else if (state.mode === 'oversize') child.stdout.emit('data', Buffer.alloc(65537));
        else if (state.mode === 'stderr') child.stderr.emit('data', Buffer.alloc(65537));
        else if (state.mode !== 'wait') {
          const line = JSON.stringify({ phase: 'RESTORED', rss: 200 }) + '\n';
          if (state.mode === 'chunks') {
            child.stdout.emit('data', Buffer.from(line.slice(0, 5)));
            child.stdout.emit('data', Buffer.from(line.slice(5)));
          } else child.stdout.emit('data', Buffer.from(line));
          child.emit('exit', state.mode === 'failure' ? 1 : 0, null);
        }
      });
      return child;
    },
  };
});
import { runRestore } from '../../../scripts/u1/large-restore-runner.js';
beforeEach(() => {
  state.mode = 'normal';
  state.calls = [];
  state.kill.mockReset();
});
afterEach(() => vi.useRealTimers());
describe('큰 복구 프로세스 제어·원래 t0·유한 관측(포트 단위)', () => {
  it('정상 restore 종료와 실제 child 관측 최대 RSS를 반환한다', async () => {
    expect(await runRestore(false, new Date().toISOString())).toMatchObject({
      exit: { code: 0, signal: null },
      peakRss: 200,
      interrupted: false,
    });
    expect(state.calls[0]![2]).toMatchObject({ shell: false });
  });
  it('지정된 partial replay 관측에만 SIGKILL하고 종료 signal을 대조한다', async () => {
    state.mode = 'interrupt';
    expect(await runRestore(true, new Date().toISOString())).toMatchObject({
      interrupted: true,
      exit: { signal: 'SIGKILL' },
    });
    expect(state.kill).toHaveBeenCalledWith('SIGKILL');
  });
  it('interrupt 관측 없이 정상 종료해도 실제 kill 시험 성공이 아니다', async () => {
    await expect(runRestore(true, new Date().toISOString())).rejects.toThrow('종료/재시작');
  });
  it('복구 child 오류·실패 exit는 정상 완료로 만들지 않는다', async () => {
    for (const mode of ['error', 'failure']) {
      state.mode = mode;
      await expect(runRestore(false, new Date().toISOString())).rejects.toThrow();
    }
  });
  it('원래 t0가 없거나 미래 값이면 child를 시작하지 않는다', async () => {
    for (const date of ['invalid', new Date(Date.now() + 3600000).toISOString()])
      await expect(runRestore(false, date)).rejects.toThrow('t0');
    expect(state.calls).toHaveLength(0);
  });
  it('깨진 JSON/stdout·stderr 한도를 넘으면 성공 관측이 아니다', async () => {
    for (const mode of ['invalid', 'oversize', 'stderr']) {
      state.mode = mode;
      await expect(runRestore(false, new Date().toISOString())).rejects.toThrow('관측 오류');
    }
  });
  it('새 attempt에서30분을 재설정하지 않고 원래 장애 기한으로 종료한다', async () => {
    vi.useFakeTimers();
    state.mode = 'wait';
    const request = runRestore(false, new Date(Date.now() - 30 * 60000).toISOString());
    const rejected = expect(request).rejects.toThrow('종료/재시작');
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(state.kill).toHaveBeenCalledWith('SIGKILL');
  });
  it('출력 중간 chunk도 개행 전 누락 없이 JSON을 합친다', async () => {
    state.mode = 'chunks';
    expect((await runRestore(false, new Date().toISOString())).peakRss).toBe(200);
  });
});
