import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { pcFixture, pcLogin, originalInvitation, pcSource } from '../fixtures/pc.js';
test('PC1280의 실제 초대 landing→본인 MFA→목적 조회→명시 수락 및 보호된 소속 단회', async ({
  page,
}) => {
  const f = pcFixture(),
    invite = await originalInvitation();
  const login = await pcLogin(page, f.inviteeId);
  expect(login.recoveryCodeAcknowledged).toBe(true);
  await page.goto('http://127.0.0.1:3300/?invitationToken=' + encodeURIComponent(invite.token));
  const section = page.getByTestId('invitation-acceptance');
  await expect(section).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await section.getByLabel('원래 초대 번호', { exact: true }).fill(invite.invitationRef.id);
  await section
    .getByLabel('원래 초대 차수', { exact: true })
    .fill(String(invite.invitationRef.revision));
  await section.getByLabel('본인 연락 확인 자료 번호', { exact: true }).fill(invite.evidenceRef.id);
  await section
    .getByLabel('연락 확인 자료 차수', { exact: true })
    .fill(String(invite.evidenceRef.revision));
  const exchange = page.waitForResponse(
    (r) => r.url().includes('/purpose-authorities') && r.request().method() === 'POST',
  );
  await section.getByRole('button', { name: '본인 목적의 원래 초대 조회', exact: true }).click();
  expect((await exchange).status()).toBe(202);
  await expect(section.getByRole('status')).toContainText('PENDING');
  await section.getByRole('button', { name: '원래 기업 초대 수락', exact: true }).focus();
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
  const accept = page.waitForResponse(
    (r) => r.url().endsWith('/acceptances') && r.request().method() === 'POST',
  );
  await page.keyboard.press('Enter');
  expect((await accept).status()).toBe(202);
  await expect(section.getByRole('status')).toContainText('ACCEPTED');
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
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
  await pcSource(async (store) => {
    expect(
      (await store.currentProtected('MembershipInvitation', invite.invitationRef.id))?.state,
    ).toBe('ACCEPTED');
    expect(
      await store.list('EnterpriseMembership', { equals: { accountRef: { id: f.inviteeId } } }),
    ).toHaveLength(1);
  });
});
test('진단 CDP body 실패는 명시 관측되며 실제 MFA·업무 UI gate로 검증한다', async ({ page }) => {
  const f = pcFixture();
  const login = await pcLogin(page, f.inviteeId, 'CUSTOMER', 'MFA_BODY_UNAVAILABLE');
  expect(login.mfaStatus).toBe(200);
  expect(login.mfaBodyObserved).toBe(false);
  expect(login.mfaBodyUnavailableReason).toBe('CDP_RESPONSE_BODY');
  expect(login.businessCookiePresent && login.authenticatedUi).toBe(true);
  await pcSource(async (store) => {
    expect(
      (await store.list('EnterpriseMembership', { equals: { accountRef: { id: f.inviteeId } } }))[0]
        ?.active,
    ).toBe(true);
  });
});
