import { beforeEach, expect, it, vi } from 'vitest';
import { ProfileUi } from '../../../scripts/u1/profile-ui.js';
import { PILOT_PROFILE, pilotActor } from '../../../scripts/u2/verification-profile.js';
import type { SyntheticHttpClient } from '../../u1/fixtures/http-client.js';

const driver = vi.hoisted(() => ({
  launch: vi.fn(),
  fault: '',
  browserClose: vi.fn(),
  contexts: [] as {
    addCookies: ReturnType<typeof vi.fn>;
    newPage: ReturnType<typeof vi.fn>;
    page: { goto: ReturnType<typeof vi.fn>; setDefaultTimeout: ReturnType<typeof vi.fn> };
  }[],
}));
vi.mock('@playwright/test', () => ({ chromium: { launch: driver.launch } }));
beforeEach(() => {
  driver.fault = '';
  driver.contexts = [];
  driver.launch.mockReset();
  driver.browserClose.mockReset();
  driver.browserClose.mockResolvedValue(undefined);
  driver.launch.mockImplementation(async () => ({
    close: driver.browserClose,
    newContext: vi.fn(async () => {
      const position = driver.contexts.length;
      const page = {
        goto: vi.fn(async () => {
          if (driver.fault === 'goto' && position === 1) throw Error('SYNTHETIC_GOTO_FAILURE');
        }),
        setDefaultTimeout: vi.fn(),
      };
      const context = {
        page,
        addCookies: vi.fn(async () => {
          if (driver.fault === 'cookies' && position === 1) throw Error('SYNTHETIC_COOKIE_FAILURE');
        }),
        newPage: vi.fn(async () => page),
      };
      driver.contexts.push(context);
      return context;
    }),
  }));
});
function clients(count: number, staffIndex: number) {
  return Array.from({ length: count }, (_, index) => ({
    origin: index >= staffIndex ? 'http://127.0.0.1:3301' : 'http://127.0.0.1:3300',
    cookieSnapshot: vi.fn(() => [
      { name: '__Host-unit-cookie', value: 'synthetic-unit-only', expires: 1 },
    ]),
  })) as unknown as SyntheticHttpClient[];
}
// The initial RED used this same boundary against the old one-argument method.
const start = (
  ui: ProfileUi,
  source: SyntheticHttpClient[],
  selection?: readonly [number, number],
) =>
  (
    ui.start as unknown as (
      source: SyntheticHttpClient[],
      selection?: readonly [number, number],
    ) => Promise<void>
  ).call(ui, source, selection);
it('기존 U1 기본100세션은 고객0/직원90과 PC1280·현재 timeout/cookie 경계를 유지한다', async () => {
  const source = clients(100, 90),
    ui = new ProfileUi();
  await ui.start(source);
  expect(source[0]!.cookieSnapshot).toHaveBeenCalledTimes(1);
  expect(source[90]!.cookieSnapshot).toHaveBeenCalledTimes(1);
  expect(
    source.filter((client) => vi.mocked(client.cookieSnapshot).mock.calls.length > 0),
  ).toHaveLength(2);
  expect(driver.contexts).toHaveLength(2);
  for (const context of driver.contexts) {
    expect(context.page.setDefaultTimeout).toHaveBeenCalledWith(5000);
    expect(context.page.goto).toHaveBeenCalledWith(expect.any(String), {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    expect(context.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
        domain: '127.0.0.1',
      }),
    ]);
  }
  await ui.close();
  expect(driver.browserClose).toHaveBeenCalledTimes(1);
});
it('현재20세션은 등록된 고객0/직원10을 명시 주입하며 마지막19를 자동 선택하지 않는다', async () => {
  const staffIndex = PILOT_PROFILE.activeSessions - PILOT_PROFILE.staff,
    source = clients(PILOT_PROFILE.activeSessions, staffIndex),
    ui = new ProfileUi();
  expect(pilotActor(0).audience).toBe('CUSTOMER');
  expect(pilotActor(staffIndex).audience).toBe('STAFF');
  await start(ui, source, [0, staffIndex]);
  expect(source[0]!.cookieSnapshot).toHaveBeenCalledTimes(1);
  expect(source[staffIndex]!.cookieSnapshot).toHaveBeenCalledTimes(1);
  expect(source[19]!.cookieSnapshot).not.toHaveBeenCalled();
  expect(driver.contexts[0]!.page.goto).toHaveBeenCalledWith(source[0]!.origin, expect.any(Object));
  expect(driver.contexts[1]!.page.goto).toHaveBeenCalledWith(
    source[staffIndex]!.origin,
    expect.any(Object),
  );
  await ui.close();
});
it('범위 밖·음수·소수·중복 representative는 browser 시작 전에 거절한다', async () => {
  for (const selection of [
    [0, 20],
    [-1, 10],
    [0, 10.5],
    [0, 0],
  ] as const) {
    const ui = new ProfileUi();
    await expect(start(ui, clients(20, 10), selection)).rejects.toThrow();
    await ui.close();
  }
  expect(driver.launch).not.toHaveBeenCalled();
});
for (const fault of ['cookies', 'goto'])
  it('부분 시작 ' + fault + ' 실패는 원래 실패를 전파하고 browser를 정리한다', async () => {
    driver.fault = fault;
    const ui = new ProfileUi();
    await expect(start(ui, clients(20, 10), [0, 10])).rejects.toThrow(
      fault === 'cookies' ? 'SYNTHETIC_COOKIE_FAILURE' : 'SYNTHETIC_GOTO_FAILURE',
    );
    expect(driver.browserClose).toHaveBeenCalledTimes(1);
    await ui.close();
    expect(driver.browserClose).toHaveBeenCalledTimes(1);
  });
it('startup과 cleanup 동시 실패는 둘 다 보존하고 정상 close는 반복 호출해도 누수 없이 종료한다', async () => {
  const broken = new ProfileUi();
  driver.fault = 'goto';
  driver.browserClose.mockRejectedValueOnce(Error('SYNTHETIC_CLOSE_FAILURE'));
  await expect(start(broken, clients(20, 10), [0, 10])).rejects.toBeInstanceOf(AggregateError);
  expect(driver.browserClose).toHaveBeenCalledTimes(1);
  await broken.close();
  expect(driver.browserClose).toHaveBeenCalledTimes(2);
  driver.fault = '';
  const clean = new ProfileUi();
  await start(clean, clients(20, 10), [0, 10]);
  await clean.close();
  await clean.close();
  expect(driver.browserClose).toHaveBeenCalledTimes(3);
});
