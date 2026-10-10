import { AxeBuilder } from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
const credentials = JSON.parse(readFileSync('.runtime/u1/login-fixture.json', 'utf8')) as {
  password: string;
  factor: string;
};
async function login(page: Page, audience: 'customer' | 'staff', account?: string) {
  await page.goto('http://127.0.0.1:' + (audience === 'staff' ? '3200' : '3100'));
  await page
    .getByLabel('로그인 이메일')
    .fill((account ?? (audience === 'staff' ? 'staff' : 'customer')) + '@example.invalid');
  await page.getByLabel('비밀번호').fill(credentials.password);
  await page.getByRole('button', { name: '로그인 확인', exact: true }).click();
  await page.getByLabel('인증 앱 코드').fill(credentials.factor);
  await page.getByRole('button', { name: '추가 인증 확인', exact: true }).click();
  const stored = page.getByRole('checkbox', { name: '복구 코드를 안전한 장소에 보관했습니다.' });
  const logout = page.getByRole('button', { name: '로그아웃', exact: true });
  await expect(logout.or(stored)).toBeVisible();
  if (await stored.isVisible()) {
    await stored.check();
    await page.getByRole('button', { name: '보관 확인 후 업무 시작', exact: true }).click();
  }
  await expect(logout).toBeVisible();
}
async function protectedCommand(page: Page, button: ReturnType<Page['getByRole']>, path: string) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (value) =>
        new URL(value.url()).pathname === '/api' + path && value.request().method() === 'POST',
    ),
    button.click(),
  ]);
  expect(response.status()).toBe(202);
  await response.finished();
  await expect(button).toBeEnabled();
}
function form(page: Page, button: string) {
  return page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: button, exact: true }) });
}
test.use({ actionTimeout: 15000 });
for (const profile of ['APPLICANT', 'DIFFERENT', 'ROLE_ONLY', 'USER_ONLY']) {
  const differentAdministrator = profile !== 'APPLICANT';
  test(
    (profile === 'ROLE_ONLY'
      ? 'role.manage 단독 '
      : profile === 'USER_ONLY'
        ? 'user.manage 단독 '
        : differentAdministrator
          ? '신청자와다른관리자/일반구매자 '
          : '') + '1280 PC 실제UI→BFF→API→두PG의기업승인/별도지정/명시권한/상품/주문전체대기',
    async ({ browser }) => {
      test.setTimeout(120000);
      const customerContext = await browser.newContext();
      const staffContext = await browser.newContext();
      const customer = await customerContext.newPage();
      const staff = await staffContext.newPage();
      try {
        const diagnostics: unknown[] = [];
        customer.on('response', (response) => {
          if (
            new URL(response.url()).pathname.includes('customer-enterprise-contexts') ||
            new URL(response.url()).pathname === '/api/identity'
          )
            void response
              .json()
              .then((body) => {
                diagnostics.push({
                  path: new URL(response.url()).pathname,
                  status: response.status(),
                  problemType: body.type ?? null,
                });
                writeFileSync(
                  '.reports/u1/context-http-diagnostics.json',
                  JSON.stringify(diagnostics),
                );
              })
              .catch(() => undefined);
        });
        customer.on('pageerror', (error) => {
          diagnostics.push({ event: 'browser-pageerror', message: error.message });
          writeFileSync('.reports/u1/context-http-diagnostics.json', JSON.stringify(diagnostics));
        });
        await login(customer, 'customer');
        await login(staff, 'staff');
        const companyName = '합성 PC기업 ' + Date.now();
        const staffRoleName = '명시 PC 업무 ' + Date.now();
        const productName = '합성 PC하드웨어 ' + Date.now();
        const application = form(customer, '기업 이용 신청 제출');
        await application.getByLabel('기업명', { exact: true }).fill(companyName);
        await application.getByLabel('기업 연락 담당자').fill('합성 담당자');
        await application.getByLabel('자료 번호').fill('synthetic-business-basis');
        await application.getByLabel('사유').fill('명시적 합성 기업 이용 신청');
        await application.getByRole('button', { name: '기업 이용 신청 제출', exact: true }).click();
        await expect(
          customer.getByRole('status').filter({ hasText: '신청을 접수했습니다' }),
        ).toBeVisible();
        await staff.getByRole('button', { name: '내부 역할', exact: true }).click();
        const define = form(staff, '직원 행위 검토');
        await define.getByLabel('직원 역할 이름').fill(staffRoleName);
        for (const name of [
          '기업 신청 조회',
          '기업 이용 승인',
          '별도 최초 관리자 지정',
          '상품 등록',
          '상품 조회',
          '주문 판단 정보 조회',
        ])
          await define.getByRole('checkbox', { name, exact: true }).check();
        await define.getByLabel('사유').fill('합성 업무 역할 명시');
        await define.getByRole('button', { name: '직원 행위 검토', exact: true }).click();
        await staff.getByRole('button', { name: '검토한 직원 역할 등록', exact: true }).click();
        const grant = form(staff, '선택한 역할을 현재 직원에게 부여');
        await expect(
          grant.getByLabel('역할 선택').locator('option').filter({ hasText: staffRoleName }),
        ).toHaveCount(1);
        await grant.getByLabel('역할 선택').selectOption({ label: staffRoleName });
        await grant.getByLabel('사유').fill('역할 별도 부여');
        await protectedCommand(
          staff,
          grant.getByRole('button', { name: '선택한 역할을 현재 직원에게 부여', exact: true }),
          '/staff-role-grant-changes',
        );
        await staff.getByRole('button', { name: '기업 이용 확인', exact: true }).click();
        const staffApplicationRow = staff
          .getByRole('row')
          .filter({ has: staff.getByRole('cell', { name: companyName, exact: true }) });
        await expect(staffApplicationRow).toHaveCount(1);
        await staffApplicationRow.getByRole('button', { name: '신청 상세', exact: true }).click();
        const decide = form(staff, '기업 이용 판단 기록');
        await decide.getByLabel('자료 번호').fill('synthetic-business-basis');
        await decide.getByLabel('사유').fill('합성 기업 확인 근거 대조');
        const [approvalResponse] = await Promise.all([
          staff.waitForResponse(
            (value) => value.url().endsWith('/decisions') && value.request().method() === 'POST',
          ),
          decide.getByRole('button', { name: '기업 이용 판단 기록', exact: true }).click(),
        ]);
        expect(approvalResponse.status()).toBe(202);
        await approvalResponse.finished();
        await expect(
          staffApplicationRow.getByRole('cell', { name: '기업 이용 승인', exact: true }),
        ).toBeVisible();
        await staffApplicationRow.getByRole('button', { name: '신청 상세', exact: true }).click();
        const designate = form(staff, '별도 최초 관리자 지정');
        if (differentAdministrator)
          await designate.getByLabel('확인된 관리자 후보 계정 번호').fill('other');
        await designate.getByLabel('자료 번호').fill('synthetic-business-basis');
        await designate.getByLabel('사유').fill('합성 인물·기업 관계·위임 확인');
        await designate.getByLabel('최초 관리 역할 이름').fill('명시적 기업 관리');
        for (const label of profile === 'ROLE_ONLY'
          ? ['역할 관리']
          : profile === 'USER_ONLY'
            ? ['담당자 관리']
            : ['조직 관리', '담당자 관리', '역할 관리'])
          await designate.getByRole('checkbox', { name: label, exact: true }).check();
        const [designationResponse] = await Promise.all([
          staff.waitForResponse(
            (value) =>
              value.url().endsWith('/initial-administrator-designations') &&
              value.request().method() === 'POST',
          ),
          designate.getByRole('button', { name: '별도 최초 관리자 지정', exact: true }).click(),
        ]);
        expect(designationResponse.status()).toBe(202);
        await designationResponse.finished();
        await customer.getByRole('button', { name: '신청 결과 재확인', exact: true }).click();
        const customerApplicationRow = customer
          .getByRole('row')
          .filter({ has: customer.getByRole('cell', { name: companyName, exact: true }) });
        await expect(
          customerApplicationRow.getByRole('cell', { name: '기업 이용 승인', exact: true }),
        ).toBeVisible();
        await customerApplicationRow
          .getByRole('button', { name: '신청 상세', exact: true })
          .click();
        if (differentAdministrator) {
          await customer.getByRole('button', { name: '로그아웃', exact: true }).click();
          await expect(customer.getByLabel('로그인 이메일')).toBeVisible();
          await login(customer, 'customer', 'other');
          await expect(customer.getByRole('cell', { name: companyName, exact: true })).toHaveCount(
            0,
          );
          await customer.getByLabel('현재 업무 기업 선택').selectOption({ label: companyName });
          await customer
            .getByRole('button', { name: '선택 기업의 허용 관리 업무 열기', exact: true })
            .click();
        } else
          await customer
            .getByRole('button', { name: '기업 조직·권한 설정 열기', exact: true })
            .click();
        if (profile === 'ROLE_ONLY' || profile === 'USER_ONLY') {
          await expect(
            customer.getByRole('button', { name: '조직 기준 변경 제출', exact: true }),
          ).toHaveCount(0);
          await expect(
            customer.getByRole('button', { name: '조직 등록 제출', exact: true }),
          ).toHaveCount(0);
          if (profile === 'ROLE_ONLY') {
            await expect(
              customer.getByRole('button', { name: '행위별 범위 검토', exact: true }),
            ).toBeVisible();
            await expect(
              customer.getByRole('button', { name: '선택한 역할 부여', exact: true }),
            ).toBeVisible();
            await expect(
              customer.getByRole('button', { name: '확인된 담당자 소속 변경 제출', exact: true }),
            ).toHaveCount(0);
          } else {
            await expect(
              customer.getByRole('button', { name: '확인된 담당자 소속 변경 제출', exact: true }),
            ).toBeVisible();
            await expect(
              customer.getByRole('button', { name: '행위별 범위 검토', exact: true }),
            ).toHaveCount(0);
            await expect(
              customer.getByRole('button', { name: '선택한 역할 부여', exact: true }),
            ).toHaveCount(0);
          }
          expect(
            (
              await new AxeBuilder({ page: customer })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
                .analyze()
            ).violations,
          ).toEqual([]);
          return;
        }
        const policy = form(customer, '조직 기준 변경 제출');
        await policy.locator('select[name=departmentUsage]').selectOption('NOT_USED');
        await policy.locator('select[name=siteUsage]').selectOption('NOT_USED');
        await policy.getByLabel('사유').fill('이 기업의 명시적 미사용 조직 기준');
        const [policyResponse] = await Promise.all([
          customer.waitForResponse(
            (value) =>
              value.url().endsWith('/ordering-context-policy-changes') &&
              value.request().method() === 'POST',
          ),
          policy.getByRole('button', { name: '조직 기준 변경 제출', exact: true }).click(),
        ]);
        expect(policyResponse.status()).toBe(202);
        await policyResponse.finished();
        await expect(
          policy.getByRole('button', { name: '조직 기준 변경 제출', exact: true }),
        ).toBeEnabled();
        if (differentAdministrator) {
          const membership = form(customer, '확인된 담당자 소속 변경 제출');
          await membership.getByLabel('확인된 소속 계정 번호').fill('customer');
          await membership.getByLabel('자료 번호').fill('synthetic-business-basis');
          await membership.getByLabel('사유').fill('관리자가 확인한 별도 일반 구매자 소속');
          await protectedCommand(
            customer,
            membership.getByRole('button', { name: '확인된 담당자 소속 변경 제출', exact: true }),
            '/enterprises/' +
              (await customer.getByLabel('현재 업무 기업 선택').inputValue()) +
              '/membership-changes',
          );
        }
        const role = form(customer, '행위별 범위 검토');
        await role.getByLabel('역할 이름', { exact: true }).fill('명시적 주문 담당');
        for (const [label, action] of [
          ['상품 조회', 'product.read'],
          ['주문 제출', 'order.submit'],
          ['주문 조회', 'order.read'],
        ]) {
          const fieldset = role.getByRole('group', { name: label!, exact: true });
          await fieldset.getByRole('checkbox', { name: label!, exact: true }).check();
          await fieldset
            .locator('select[name="kind-' + action + '"]')
            .selectOption('ENTERPRISE_ALL');
        }
        await role.getByLabel('사유').fill('조회·제출을 각각 명시');
        await role.getByRole('button', { name: '행위별 범위 검토', exact: true }).click();
        await customer.getByRole('button', { name: '검토한 역할 정의 제출', exact: true }).click();
        const customerGrant = form(customer, '선택한 역할 부여');
        await customerGrant.getByLabel('부여할 역할').selectOption({ label: '명시적 주문 담당' });
        await customerGrant.getByLabel('현재 기업 담당자').selectOption({ label: '합성 customer' });
        await customerGrant.getByLabel('사유').fill('주문 역할 별도 부여');
        const [tradeGrantResponse] = await Promise.all([
          customer.waitForResponse(
            (value) =>
              value.url().endsWith('/role-grant-changes') && value.request().method() === 'POST',
          ),
          customerGrant.getByRole('button', { name: '선택한 역할 부여', exact: true }).click(),
        ]);
        expect(tradeGrantResponse.status()).toBe(202);
        await tradeGrantResponse.finished();
        await expect(
          customerGrant.getByRole('button', { name: '선택한 역할 부여', exact: true }),
        ).toBeEnabled();
        if (differentAdministrator) {
          await customer.getByRole('button', { name: '로그아웃', exact: true }).click();
          await expect(customer.getByLabel('로그인 이메일')).toBeVisible();
          await login(customer, 'customer', 'customer');
          await customer.getByLabel('현재 업무 기업 선택').selectOption({ label: companyName });
          await expect(
            customer.getByRole('button', { name: '선택 기업의 허용 관리 업무 열기', exact: true }),
          ).toHaveCount(0);
        }
        await staff.getByRole('button', { name: '판매 상품 관리', exact: true }).click();
        const product = form(staff, '판매 상품 등록');
        await product.getByLabel('상품 이름').fill(productName);
        await product.getByLabel('판매 설명').fill('실제 외부 재고/납기 확인 전');
        await product.getByLabel('공통 가격 (원)').fill('123.45');
        await product.getByLabel('사유').fill('합성 상품 명시 등록');
        await protectedCommand(
          staff,
          product.getByRole('button', { name: '판매 상품 등록', exact: true }),
          '/products',
        );
        await customer.getByRole('button', { name: '판매 상품', exact: true }).click();
        await customer.getByRole('button', { name: '현재 판매 상품 조회', exact: true }).click();
        await expect(
          customer.getByRole('cell', { name: '미확인 · 담당자 조건 확인 필요' }).first(),
        ).toBeVisible();
        await customer
          .getByRole('row')
          .filter({ hasText: productName })
          .getByRole('button', { name: '주문에 추가', exact: true })
          .click();
        const order = form(customer, '전체 주문 검토');
        await order.getByLabel('사유').fill('모든 상품 준비 시 구매 희망');
        await order.getByRole('button', { name: '전체 주문 검토', exact: true }).click();
        await customer.getByRole('button', { name: '검토한 전체 주문 제출', exact: true }).click();
        await expect(
          customer.getByRole('heading', { name: '전체 확인 대기 사유', exact: true }),
        ).toBeVisible();
        await expect(customer.getByText('남은 조치: 담당자의 모든 상품 조건 확인')).toBeVisible();
        await expect(customer.getByText('구매 기업:', { exact: false })).toContainText(companyName);
        await expect(customer.getByText('부서 기준:', { exact: false })).toContainText(
          '이 기업은 부서를 사용하지 않음',
        );
        await expect(
          customer.getByRole('button', { name: '검토한 전체 주문 제출', exact: true }),
        ).toBeDisabled();
        await customer.screenshot({
          path: '.reports/u1/screenshots/customer-order-pending-1280.png',
          fullPage: true,
        });
        await staff.screenshot({
          path: '.reports/u1/screenshots/staff-catalog-1280.png',
          fullPage: true,
        });
        const aa = [];
        for (const page of [customer, staff]) {
          const result = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze();
          aa.push({
            audience: page === customer ? 'CUSTOMER' : 'STAFF',
            violations: result.violations.map((value) => ({
              id: value.id,
              impact: value.impact,
              nodes: value.nodes.map((node) => node.target),
            })),
          });
          expect(result.violations).toEqual([]);
          const duplicates = await page.evaluate(() => {
            const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
            return ids.filter((id, index) => ids.indexOf(id) !== index);
          });
          expect(duplicates).toEqual([]);
        }
        await customer
          .getByRole('button', { name: '접수된 주문과 별도로 새 주문 작성', exact: true })
          .click();
        const swName = '합성 PC소프트웨어 ' + Date.now();
        await product.getByLabel('상품 타입').selectOption('SOFTWARE');
        await product.getByLabel('소프트웨어 이용형').selectOption('TERM');
        await product.getByLabel('상품 이름').fill(swName);
        await product.getByLabel('판매 설명').fill('실제 발급/실행/기간 확인 전');
        await product.getByLabel('공통 가격 (원)').fill('200');
        await product.getByLabel('사유').fill('합성 소프트웨어 상품 명시 등록');
        await protectedCommand(
          staff,
          product.getByRole('button', { name: '판매 상품 등록', exact: true }),
          '/products',
        );
        await customer.getByRole('button', { name: '판매 상품', exact: true }).click();
        await customer.getByRole('button', { name: '현재 판매 상품 조회', exact: true }).click();
        await customer
          .getByRole('row')
          .filter({ hasText: swName })
          .getByRole('button', { name: '주문에 추가', exact: true })
          .click();
        const swOrder = form(customer, '전체 주문 검토');
        await swOrder.getByLabel('요청 활성화 날짜').fill('2026-12-01');
        await swOrder.getByLabel('사유').fill('계약기간과 실제 이용기간은 별도 후속확인');
        await swOrder.getByRole('button', { name: '전체 주문 검토', exact: true }).click();
        const [swResponse] = await Promise.all([
          customer.waitForResponse(
            (value) =>
              new URL(value.url()).pathname === '/api/orders' &&
              value.request().method() === 'POST',
          ),
          customer.getByRole('button', { name: '검토한 전체 주문 제출', exact: true }).click(),
        ]);
        expect(swResponse.status()).toBe(202);
        const swReceipt = await swResponse.json();
        expect(swReceipt.requestState).toBe('REVIEW_REQUIRED');
        await expect(
          customer.getByRole('heading', { name: '전체 확인 대기 사유', exact: true }),
        ).toBeVisible();
        // Desktop zoom/reflow equivalence does not pretend CSS width establishes an approved PC.
        for (const width of [640, 320])
          for (const page of [customer, staff]) {
            await page.setViewportSize({ width, height: 900 });
            await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
            expect(
              await page.evaluate(
                () =>
                  document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
              ),
            ).toBe(true);
            await page.locator('a.skip').focus();
            await page.keyboard.press('Enter');
            await page.keyboard.press('Tab');
            expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
          }
        await customer.setViewportSize({ width: 1280, height: 900 });
        await staff.setViewportSize({ width: 1280, height: 900 });
        const timings: number[] = [];
        for (let i = 0; i < 5; i++)
          for (const page of [customer, staff]) {
            const start = Date.now();
            await page.reload();
            await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
            if (page === customer) {
              await expect(
                page.getByRole('cell', { name: companyName, exact: true }),
              ).toBeVisible();
              await expect(
                page.getByRole('button', { name: '기업 이용 신청 제출', exact: true }),
              ).toBeEnabled();
            } else {
              await expect(
                page.getByLabel('역할 선택').locator('option').filter({ hasText: staffRoleName }),
              ).toHaveCount(1);
              await expect(page.getByLabel('직원 역할 이름')).toBeEnabled();
            }
            timings.push(Date.now() - start);
          }
        const p95 = [...timings].sort((a, b) => a - b)[Math.ceil(timings.length * 0.95) - 1]!;
        expect(p95).toBeLessThanOrEqual(3000);
        writeFileSync(
          '.reports/u1/ui-readiness.json',
          JSON.stringify(
            {
              passed: true,
              synthetic: true,
              samples: timings.length,
              p95Milliseconds: p95,
              readiness: '허용기업신청행/신청조작 또는 현재직원역할/필수조작',
              timings,
            },
            null,
            2,
          ),
        );
        await customer.getByRole('button', { name: '로그아웃', exact: true }).click();
        await expect(customer.getByLabel('로그인 이메일')).toBeVisible();
        await login(customer, 'customer', 'unrelated');
        await expect(customer.getByRole('cell', { name: companyName, exact: true })).toHaveCount(0);
        await customer.getByRole('button', { name: '주문 작성·조회', exact: true }).click();
        await customer.getByLabel('원래 주문번호').fill(swReceipt.targetRef.id);
        const [hidden] = await Promise.all([
          customer.waitForResponse((value) => value.url().includes('/review-assessment')),
          customer.getByRole('button', { name: '원래 주문 결과 재확인', exact: true }).click(),
        ]);
        expect(hidden.status()).toBe(404);
        await expect(
          customer.getByRole('heading', { name: '전체 확인 대기 사유', exact: true }),
        ).toHaveCount(0);
        writeFileSync(
          '.reports/u1/accessibility.json',
          JSON.stringify(
            {
              passed: true,
              synthetic: true,
              axe: aa,
              keyboardSkip: true,
              duplicateIds: 0,
              reflowCssWidths: [640, 320],
              desktopBaseline: 1280,
              actualBrowserOsZoomManualProof: false,
            },
            null,
            2,
          ),
        );
      } finally {
        await customerContext.close();
        await staffContext.close();
      }
    },
  );
}
