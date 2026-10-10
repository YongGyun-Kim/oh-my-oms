import { beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  compositions: [] as {
    app: { close: ReturnType<typeof vi.fn> };
    server: ReturnType<typeof vi.fn>;
  }[],
  close: vi.fn(),
  telemetryClose: vi.fn(),
  listener: null as null | ((request: unknown, response: unknown) => void),
  server: null as null | {
    listen: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    closeAllConnections: ReturnType<typeof vi.fn>;
  },
  fail: false,
}));
vi.mock('@oms/core', () => {
  class Owner {
    constructor(..._args: unknown[]) {
      void _args;
    }
  }
  return {
    Assessments: Owner,
    EnterpriseAccess: Owner,
    IdentityRecovery: Owner,
    NotificationDelivery: Owner,
    OrderAcceptance: Owner,
    ProductCatalog: Owner,
    StaffAccess: Owner,
    WorkInquiry: Owner,
  };
});
vi.mock('@oms/integrations', () => ({
  CognitoProvider: class {},
  UnregisteredEnterpriseVerification: class {},
  runtimeApiConfiguration: () => ({
    customer: {
      origin: 'https://customer.example.invalid',
      tls: { key: 'fixture', cert: 'fixture' },
      cookieKey: Buffer.alloc(32),
      verifierKey: Buffer.alloc(32),
      telemetryEndpoint: 'https://collector.example.invalid',
      port: 8443,
    },
    staff: {
      origin: 'https://staff.example.invalid',
      tls: { key: 'fixture', cert: 'fixture' },
      cookieKey: Buffer.alloc(32),
    },
  }),
  runtimeStore: async () => ({ store: {}, close: state.close }),
  RuntimeTelemetry: class {
    close = state.telemetryClose;
  },
}));
vi.mock('../../../apps/api/src/application.js', () => ({
  createApi: async (_owners: unknown, options: Record<string, unknown>) => {
    state.options.push(options);
    if (state.fail && state.options.length === 2) throw new Error('staff composition 실패');
    const value = { app: { close: vi.fn() }, server: vi.fn() };
    state.compositions.push(value);
    return value;
  },
}));
vi.mock('node:https', () => ({
  createServer: (_tls: unknown, listener: (request: unknown, response: unknown) => void) => {
    state.listener = listener;
    const server = {
      listen: vi.fn((_port: number, _host: string, done: () => void) => done()),
      close: vi.fn((done: () => void) => done()),
      closeAllConnections: vi.fn(),
    };
    state.server = server;
    return server;
  },
}));
import { startApi } from '../../../apps/api/src/main.js';
beforeEach(() => {
  state.options = [];
  state.compositions = [];
  state.close.mockReset().mockResolvedValue(undefined);
  state.telemetryClose.mockReset().mockResolvedValue(undefined);
  state.listener = null;
  state.server = null;
  state.fail = false;
});
const response = () => ({ writeHead: vi.fn(), end: vi.fn() });
describe('실제 API 시작 composition·운영 활성화 차단·종료 연결', () => {
  it('한 API role에서 고객/직원 audience와 origin을 각각 연결한다', async () => {
    const host = await startApi({ NODE_ENV: 'production' });
    expect(state.options.map((value) => value.audience)).toEqual(['CUSTOMER', 'STAFF']);
    expect(state.options.every((value) => value.localSynthetic === false)).toBe(true);
    await host.close();
  });
  it('고객 Origin은 고객 composition으로만 라우팅한다', async () => {
    const host = await startApi({ NODE_ENV: 'production' });
    const res = response();
    state.listener!(
      { url: '/identity', headers: { origin: 'https://customer.example.invalid' } },
      res,
    );
    expect(state.compositions[0]!.server).toHaveBeenCalledOnce();
    expect(state.compositions[1]!.server).not.toHaveBeenCalled();
    await host.close();
  });
  it('직원 Origin 선택은 신원/회사망 인증이 아니며 admission은 미등록이다', async () => {
    const host = await startApi({ NODE_ENV: 'production' });
    state.listener!(
      { url: '/identity', headers: { origin: 'https://staff.example.invalid' } },
      response(),
    );
    expect(state.compositions[1]!.server).toHaveBeenCalledOnce();
    expect(await (state.options[1]!.staffAdmission as () => Promise<unknown>)()).toBeNull();
    await host.close();
  });
  it('미등록/Origin 누락은 403이고 공개 직원 fallback이 없다', async () => {
    const host = await startApi({ NODE_ENV: 'production' });
    for (const origin of [undefined, 'https://other.invalid']) {
      const res = response();
      state.listener!({ url: '/identity', headers: { origin } }, res);
      expect(res.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
    }
    expect(state.compositions.every((value) => value.server.mock.calls.length === 0)).toBe(true);
    await host.close();
  });
  it('liveness 라우팅만으로 업무 활성화 성공을 만들지 않는다', async () => {
    const host = await startApi({ NODE_ENV: 'production' });
    state.listener!({ url: '/health/live', headers: {} }, response());
    expect(state.compositions[0]!.server).toHaveBeenCalledOnce();
    await expect(
      (state.options[0]!.activationAdmission as () => Promise<void>)(),
    ).rejects.toMatchObject({ code: 'REAL_ACTIVATION_UNVERIFIED' });
    await host.close();
  });
  it('중복 종료는 listener·두 API·DB·telemetry를 한 번만 종료한다', async () => {
    const host = await startApi({ NODE_ENV: 'production' });
    await host.close();
    await host.close();
    expect(state.close).toHaveBeenCalledOnce();
    expect(state.telemetryClose).toHaveBeenCalledOnce();
    expect(state.compositions.every((value) => value.app.close.mock.calls.length === 1)).toBe(true);
  });
  it('관측 종료 실패는 업무/DB 종료 성공과 구분한다', async () => {
    state.telemetryClose.mockRejectedValue(new Error('export 종료 불명'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const host = await startApi({ NODE_ENV: 'production' });
    await host.close();
    expect(state.close).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it('staff composition 실패도 열린 customer/DB/telemetry를 정리한다', async () => {
    state.fail = true;
    await expect(startApi({ NODE_ENV: 'production' })).rejects.toThrow('staff composition');
    expect(state.compositions[0]!.app.close).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
    expect(state.telemetryClose).toHaveBeenCalledOnce();
  });
});
