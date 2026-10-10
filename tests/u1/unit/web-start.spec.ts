import { beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  options: null as null | Record<string, unknown>,
  listener: null as null | ((request: unknown, response: unknown) => void),
  prepare: vi.fn(),
  handle: vi.fn(),
  close: vi.fn(),
  serverClose: vi.fn(),
  port: 0,
}));
vi.mock('node:module', () => ({
  createRequire: () => () => (options: Record<string, unknown>) => {
    state.options = options;
    return { prepare: state.prepare, getRequestHandler: () => state.handle, close: state.close };
  },
}));
vi.mock('@oms/integrations', () => ({
  tlsConfiguration: () => ({ key: 'fixture', cert: 'fixture' }),
}));
vi.mock('node:https', () => ({
  createServer: (_options: unknown, listener: (request: unknown, response: unknown) => void) => {
    state.listener = listener;
    return {
      listen: (port: number, _host: string, done: () => void) => {
        state.port = port;
        done();
      },
      close: (done: () => void) => {
        state.serverClose();
        done();
      },
      closeAllConnections: vi.fn(),
    };
  },
}));
import { startWeb } from '../../../packages/ui/src/server.js';
const env = () => ({
  NODE_ENV: 'production' as const,
  OMS_WEB_ORIGIN: 'https://customer.example.invalid',
  PORT: '8443',
});
const response = () => ({
  setHeader: vi.fn(),
  writeHead: vi.fn(),
  end: vi.fn(),
  headersSent: false,
});
beforeEach(() => {
  state.options = null;
  state.listener = null;
  state.port = 0;
  for (const fn of [state.prepare, state.handle, state.close, state.serverClose])
    fn.mockReset().mockResolvedValue(undefined);
});
describe('실제 TLS Next custom server 고정 origin/listener 경계', () => {
  it('advertised origin443과 실제 task listener8443을 구분한다', async () => {
    const host = await startWeb('CUSTOMER', '/app/customer', env());
    expect(state.options).toMatchObject({
      hostname: 'customer.example.invalid',
      port: 443,
      dev: false,
    });
    expect(state.port).toBe(8443);
    await host.close();
  });
  it('production이 아닌 profile/로컬 bypass는 시작 전에 거절한다', async () => {
    for (const change of [{ NODE_ENV: 'test' as const }, { OMS_LOCAL_SYNTHETIC: '1' }])
      await expect(startWeb('CUSTOMER', '/app', { ...env(), ...change })).rejects.toThrow('TLS');
    expect(state.prepare).not.toHaveBeenCalled();
  });
  it('HTTP/다른 path origin과 무한 listener 값은 거절한다', async () => {
    for (const change of [
      { OMS_WEB_ORIGIN: 'http://customer.invalid' },
      { OMS_WEB_ORIGIN: 'https://customer.invalid/path' },
      { PORT: 'Infinity' },
      { PORT: '80' },
    ])
      await expect(startWeb('CUSTOMER', '/app', { ...env(), ...change })).rejects.toThrow();
  });
  it('클라이언트 forwarded spoof를 실제 고정TLS·host 문맥으로 대체한다', async () => {
    const host = await startWeb('CUSTOMER', '/app', env());
    const req = {
      url: '/',
      headers: {
        host: 'customer.example.invalid',
        'x-forwarded-host': 'attacker.invalid',
        'x-forwarded-proto': 'http',
        'x-forwarded-port': '999',
        'x-forwarded-for': 'attacker',
        'x-real-ip': 'attacker',
      },
    };
    state.listener!(req, response());
    expect(req.headers).toMatchObject({
      'x-forwarded-host': 'customer.example.invalid',
      'x-forwarded-proto': 'https',
      'x-forwarded-port': '443',
    });
    expect(req.headers).not.toHaveProperty('x-real-ip');
    await host.close();
  });
  it('다른 Host는 Next/BFF를 실행하지 않고403이다', async () => {
    const host = await startWeb('CUSTOMER', '/app', env());
    const res = response();
    state.listener!({ url: '/', headers: { host: 'attacker.invalid' } }, res);
    expect(res.writeHead).toHaveBeenCalledWith(403);
    expect(state.handle).not.toHaveBeenCalled();
    await host.close();
  });
  it('liveness는 업무/실provider 준비를 반환하지 않는다', async () => {
    const host = await startWeb('STAFF', '/app', env());
    const res = response();
    state.listener!({ url: '/health/live', headers: {} }, res);
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ state: 'LIVE', audience: 'STAFF' }));
    expect(state.handle).not.toHaveBeenCalled();
    await host.close();
  });
  it('Next 핸들러 오류는503과 원래 결과 확인으로 종료한다', async () => {
    state.handle.mockRejectedValue(new Error('uncertain'));
    const host = await startWeb('CUSTOMER', '/app', env());
    const res = response();
    state.listener!({ url: '/', headers: { host: 'customer.example.invalid' } }, res);
    await Promise.resolve();
    expect(res.writeHead).toHaveBeenCalledWith(503);
    await host.close();
  });
  it('현재 listener와 Next를 종료하고 이미 전송된 응답 상태를 덮지 않는다', async () => {
    state.handle.mockRejectedValue(new Error('late'));
    const host = await startWeb('CUSTOMER', '/app', env());
    const res = { ...response(), headersSent: true };
    state.listener!({ url: '/', headers: { host: 'customer.example.invalid' } }, res);
    await Promise.resolve();
    expect(res.writeHead).not.toHaveBeenCalled();
    await host.close();
    expect(state.serverClose).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
  });
});
