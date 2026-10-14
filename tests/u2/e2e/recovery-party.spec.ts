import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { pcFixture, originalHandoff, totp, decodeBase32, pcSource } from '../fixtures/pc.js';
test('PC 실제 당사자→16문자 단회 claim→새 TOTP·10코드 보관·전체 conjunction 완료', async ({
  page,
}) => {
  const f = pcFixture();
  await page.goto('http://127.0.0.1:3300');
  const claim = page.getByTestId('recovery-claim');
  await claim.getByLabel('안내받은 확인 건 번호', { exact: true }).fill(f.sourceRef.id);
  await claim.getByLabel('안내받은 확인 건 차수', { exact: true }).fill('1');
  await claim.getByRole('button', { name: '새 본인 확인 진행 시작', exact: true }).click();
  await expect(claim.getByLabel('16문자 인계 코드', { exact: true })).toBeVisible();
  const handoff = await originalHandoff(
    f.sourceRef.id,
    (await claim.locator('output').textContent())!,
  );
  await claim.getByLabel('안내받은 인계 건 번호', { exact: true }).fill(handoff.grantRef.id);
  await claim
    .getByLabel('확인 완료 건 차수', { exact: true })
    .fill(String(handoff.caseRef.revision));
  await claim.getByLabel('16문자 인계 코드', { exact: true }).fill(handoff.code);
  await claim.getByRole('button', { name: '원래 인계 코드 확인', exact: true }).click();
  const recovery = page.getByTestId('recovery-status');
  await expect(recovery).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(0);
  await recovery.getByRole('button', { name: '원래 제공자 처리 준비', exact: true }).click();
  await expect
    .poll(async () =>
      pcSource(
        async (store) =>
          (
            await store.list('WorkItem', {
              equals: {
                owner: 'IdentityRecovery',
                targetRef: { id: f.sourceRef.id },
                state: 'RESULT_RECORDED',
              },
            })
          ).length,
      ),
    )
    .toBe(2);
  await recovery.getByRole('button', { name: '원래 상태 새로 확인', exact: true }).click();
  await recovery
    .getByLabel('복구 당사자의 로그인 이메일', { exact: true })
    .fill(f.customerId + '@example.invalid');
  await recovery.getByLabel('현재 확인할 비밀번호', { exact: true }).fill(f.password);
  await recovery
    .getByRole('button', { name: '비밀번호 확인 후 새 인증 앱 등록', exact: true })
    .click();
  await expect.poll(() => recovery.getByTestId('recovery-setup-key').isVisible()).toBe(true);
  const key = decodeBase32((await recovery.getByTestId('recovery-setup-key').textContent())!);
  try {
    await recovery
      .getByLabel('새 인증 앱의6자리 코드', { exact: true })
      .fill(totp(key, f.factorClockAt));
  } finally {
    key.fill(0);
  }
  await recovery.getByRole('button', { name: '새 인증 앱 확인', exact: true }).click();
  await expect.poll(() => recovery.getByTestId('recovery-codes').isVisible()).toBe(true);
  expect((await recovery.getByTestId('recovery-codes').textContent())!.split('\n').length).toBe(10);
  await recovery
    .getByRole('checkbox', { name: '본인이 새 복구 코드10개를 별도로 보관했습니다', exact: true })
    .check();
  await recovery
    .getByRole('button', { name: '모든 원래 효과 확인·코드 보관 후 완료 요청', exact: true })
    .click();
  await expect
    .poll(async () =>
      (await recovery.locator('p[role="status"]').textContent())?.includes('COMPLETED'),
    )
    .toBe(true);
  expect(await recovery.getByTestId('recovery-codes').count()).toBe(0);
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(0);
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
    expect((await store.currentProtected('RecoveryCase', f.sourceRef.id))?.state).toBe('COMPLETED');
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
  });
});
