import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { pcFixture, pcLogin } from '../fixtures/pc.js';
import { ProfileUi } from '../../../scripts/u1/profile-ui.js';
import { PILOT_PROFILE, pilotActor } from '../../../scripts/u2/verification-profile.js';
import type { SyntheticHttpClient } from '../../u1/fixtures/http-client.js';
import type { Browser } from '@playwright/test';
test('PC1280 내부 직원 MFA·명시 U2 역할과 고객/SYSTEM 경계·키보드', async ({ page, request }) => {
  const f = pcFixture();
  await pcLogin(page, f.staffId, 'STAFF');
  await page.getByRole('button', { name: '내부 역할', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '현재 역할의 명시 행위 개정', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('직원의 모든 접점은 승인된 회사망', { exact: false })).toBeVisible();
  await expect(page.getByTestId('invitation-acceptance')).toHaveCount(0);
  await page.locator('a.skip').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 1280)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect((await request.get('http://127.0.0.1:3300/api/staff-role-directory')).status()).toBe(404);
  expect(
    (
      await request.post('http://127.0.0.1:3301/api/identity/emergency-cases/x/applications', {
        headers: { Origin: 'http://127.0.0.1:3301' },
        data: {},
      })
    ).status(),
  ).toBe(404);
});
test('파일럿 대표 고객/직원의 실제 MFA cookie 이관은 PC1280 두 문맥을 시작하고 연결을 정리한다', async ({
  page,
  browser,
}) => {
  const f = pcFixture(),
    staffContext = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
    staffPage = await staffContext.newPage(),
    ui = new ProfileUi();
  const staffIndex = PILOT_PROFILE.activeSessions - PILOT_PROFILE.staff;
  let ownedBrowser: Browser | null = null;
  try {
    // Use the already registered invitee as an independent representative.
    // The recovery scenario legitimately replaces customerId's initial MFA;
    // never restore it or reuse that account's stale bootstrap secret here.
    await pcLogin(page, f.inviteeId, 'CUSTOMER');
    await pcLogin(staffPage, f.staffId, 'STAFF');
    const customerCookies = await page.context().cookies('http://127.0.0.1:3300'),
      staffCookies = await staffContext.cookies('http://127.0.0.1:3301');
    // Two genuine representatives in the registered twenty-slot shape. This
    // focused startup check is not proof of twenty distinct load sessions.
    const clients = new Array<SyntheticHttpClient>(PILOT_PROFILE.activeSessions);
    clients[0] = {
      origin: 'http://127.0.0.1:3300',
      cookieSnapshot: () => customerCookies.map(({ name, value }) => ({ name, value })),
    } as unknown as SyntheticHttpClient;
    clients[staffIndex] = {
      origin: 'http://127.0.0.1:3301',
      cookieSnapshot: () => staffCookies.map(({ name, value }) => ({ name, value })),
    } as unknown as SyntheticHttpClient;
    expect(pilotActor(0).audience).toBe('CUSTOMER');
    expect(pilotActor(staffIndex).audience).toBe('STAFF');
    await ui.start(clients, [0, staffIndex]);
    // Observe the real Playwright connection; do not replace the owned browser.
    ownedBrowser = Reflect.get(ui, 'browser') as Browser;
    expect(ownedBrowser.isConnected()).toBe(true);
    expect(ownedBrowser.contexts()).toHaveLength(2);
    for (const context of ownedBrowser.contexts()) {
      const transferred = context.pages()[0]!;
      expect(transferred.viewportSize()?.width).toBe(1280);
      await expect(
        transferred.getByRole('button', { name: '로그아웃', exact: true }),
      ).toBeVisible();
    }
    await ui.close();
    expect(ownedBrowser.isConnected()).toBe(false);
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    await expect(staffPage.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  } finally {
    await ui.close();
    await staffContext.close();
  }
});
