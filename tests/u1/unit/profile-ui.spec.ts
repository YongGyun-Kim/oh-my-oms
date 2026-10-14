import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { SyntheticHttpClient } from '../fixtures/http-client.js';
const state = vi.hoisted(() => ({
  calls: [] as string[],
  fail: false,
  enabled: true,
  cookies: [] as unknown[],
  closed: 0,
}));
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      newContext: async () => ({
        addCookies: async (cookies: unknown) => {
          state.cookies.push(cookies);
        },
        newPage: async () => {
          const locator = {
            waitFor: async () => {
              if (state.fail) throw new Error('내용 미준비');
            },
            locator: () => locator,
            nth: () => locator,
            first: () => locator,
            selectOption: async () => {
              state.calls.push('explicit-context');
            },
            click: async () => {},
            isEnabled: async () => state.enabled,
          };
          return {
            setDefaultTimeout: () => {},
            goto: async () => {},
            reload: async () => {},
            getByLabel: (name: string) => {
              state.calls.push(name);
              return locator;
            },
            getByRole: (role: string, { name }: { name: string }) => {
              state.calls.push(role + ':' + name);
              return locator;
            },
          };
        },
      }),
      close: async () => {
        state.closed++;
      },
    }),
  },
}));
import { ProfileUi } from '../../../scripts/u1/profile-ui.js';
const clients = () =>
  Array.from(
    { length: 100 },
    (_, index) =>
      ({
        origin: 'http://127.0.0.1:' + (index < 90 ? '3100' : '3200'),
        cookieSnapshot: () => [{ name: 'private-fixture', value: 'opaque' }],
      }) as SyntheticHttpClient,
  );
beforeEach(() => {
  state.calls = [];
  state.fail = false;
  state.enabled = true;
  state.cookies = [];
  state.closed = 0;
});
describe('PC 부하 내용/필수 조작 측정(자동화 포트 단위 시험)', () => {
  it('새 로그인 없이 기존 고객/직원 세션 두 개를 PC1280 context에 재사용한다', async () => {
    const ui = new ProfileUi();
    await ui.start(clients());
    expect(state.cookies).toHaveLength(2);
    expect(state.cookies[0]).toMatchObject([{ httpOnly: true, secure: true, sameSite: 'Strict' }]);
    await ui.close();
  });
  it('상품 표 실제 행과 주문/등록 조작이 준비돼야 NORMAL 성공이다', async () => {
    const ui = new ProfileUi();
    await ui.start(clients());
    await ui.probe('NORMAL');
    expect(ui.report()).toMatchObject({
      passed: true,
      normalSamples: 2,
      html200OrLcpIsNotReadiness: true,
    });
    expect(state.calls).toContain('table:현재 권한의 판매 상품');
    expect(state.calls).toContain('button:주문에 추가');
    expect(state.calls).toContain('button:판매 상품 등록');
  });
  it('고객의 현재 기업 선택을 생략하지 않는다', async () => {
    const ui = new ProfileUi();
    await ui.start(clients());
    await ui.probe('NORMAL');
    expect(state.calls).toContain('explicit-context');
  });
  it('HTML만 준비되고 내용 관측이 실패하면 실패 표본을 보존한다', async () => {
    const ui = new ProfileUi();
    await ui.start(clients());
    state.fail = true;
    await ui.probe('NORMAL');
    expect(ui.report().passed).toBe(false);
    expect(ui.samples.every((sample) => !sample.ready)).toBe(true);
  });
  it('필수 조작이 비활성인 경우 준비 통과가 아니다', async () => {
    const ui = new ProfileUi();
    await ui.start(clients());
    state.enabled = false;
    await ui.probe('NORMAL');
    expect(ui.report().passed).toBe(false);
  });
  it('PEAK 표본으로 NORMAL 0건을 성공으로 대체하지 않는다', async () => {
    const ui = new ProfileUi();
    await ui.start(clients());
    await ui.probe('PEAK');
    expect(ui.report()).toMatchObject({ passed: false, normalSamples: 0 });
  });
  it('NORMAL p95 3초를 넘으면 성공 내용도 지연 기준에 실패한다', () => {
    const ui = new ProfileUi();
    ui.samples.push({
      phase: 'NORMAL',
      audience: 'CUSTOMER',
      observedAt: new Date().toISOString(),
      milliseconds: 3001,
      ready: true,
    });
    expect(ui.report().passed).toBe(false);
  });
  it('close는 실제 browser를 종료하고 재호출이 새 작업을 만들지 않는다', async () => {
    const ui = new ProfileUi();
    await ui.start(clients());
    await ui.close();
    await ui.close();
    expect(state.closed).toBe(1);
  });
});
