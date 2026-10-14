import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { SyntheticHttpClient } from '../../tests/u1/fixtures/http-client.js';
import { percentile } from './performance-statistics.js';
export interface UiProfileSample {
  phase: string;
  audience: string;
  observedAt: string;
  milliseconds: number;
  ready: boolean;
}
export class ProfileUi {
  private browser: Browser | null = null;
  private readonly contexts: BrowserContext[] = [];
  private readonly pages: Page[] = [];
  readonly samples: UiProfileSample[] = [];
  async start(
    clients: readonly SyntheticHttpClient[],
    representatives: readonly [number, number] = [0, 90],
  ): Promise<void> {
    if (this.browser) throw Error('UI_PROFILE_ALREADY_RUNNING');
    if (
      representatives.length !== 2 ||
      representatives[0] === representatives[1] ||
      representatives.some(
        (index) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= clients.length ||
          !clients[index] ||
          typeof clients[index]!.cookieSnapshot !== 'function',
      )
    )
      throw Error('UI_PROFILE_REPRESENTATIVES');
    try {
      this.browser = await chromium.launch({ headless: true });
      for (const index of representatives) {
        const context = await this.browser.newContext({ viewport: { width: 1280, height: 900 } });
        this.contexts.push(context);
        await context.addCookies(
          clients[index]!.cookieSnapshot().map((cookie) => ({
            ...cookie,
            domain: new URL(clients[index]!.origin).hostname,
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'Strict' as const,
          })),
        );
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        this.pages.push(page);
        await page.goto(clients[index]!.origin, { waitUntil: 'domcontentloaded', timeout: 10000 });
      }
    } catch (startupError) {
      try {
        await this.close();
      } catch (cleanupError) {
        throw new AggregateError([startupError, cleanupError], 'UI_PROFILE_START_CLEANUP_FAILED');
      }
      throw startupError;
    }
  }
  async probe(phase: string): Promise<void> {
    for (const [index, page] of this.pages.entries()) {
      const at = new Date().toISOString();
      const started = performance.now();
      let ready = false;
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
        await page
          .getByRole('button', { name: '로그아웃', exact: true })
          .waitFor({ state: 'visible' });
        if (index === 0) {
          const select = page.getByLabel('현재 업무 기업 선택');
          await select.locator('option').nth(1).waitFor({ state: 'attached' });
          await select.selectOption({ index: 1 });
        }
        await page
          .getByRole('button', { name: index === 0 ? '판매 상품' : '판매 상품 관리', exact: true })
          .click();
        await page.getByRole('button', { name: '현재 판매 상품 조회', exact: true }).click();
        await page
          .getByRole('table', { name: '현재 권한의 판매 상품' })
          .locator('tbody tr')
          .first()
          .waitFor({ state: 'visible' });
        ready =
          index === 0
            ? await page
                .getByRole('button', { name: '주문에 추가', exact: true })
                .first()
                .isEnabled()
            : await page.getByRole('button', { name: '판매 상품 등록', exact: true }).isEnabled();
      } catch {
        /* A real content/control failure remains a failed sample, never HTML success. */
      }
      this.samples.push({
        phase,
        audience: index === 0 ? 'CUSTOMER' : 'STAFF',
        observedAt: at,
        milliseconds: performance.now() - started,
        ready,
      });
    }
  }
  report() {
    const normal = this.samples.filter((sample) => sample.phase === 'NORMAL');
    const p95 = percentile(
      normal.map((sample) => sample.milliseconds),
      0.95,
    );
    return {
      passed:
        normal.length > 0 && normal.every((sample) => sample.ready) && p95 !== null && p95 <= 3000,
      profile: '부하 중 실제 PC1280 현재 허용 상품 원본·필수 조작 준비',
      normalSamples: normal.length,
      normalP95Milliseconds: p95,
      samples: this.samples,
      additionalProbeTrafficDisclosed: true,
      html200OrLcpIsNotReadiness: true,
    };
  }
  async close() {
    await this.browser?.close();
    this.browser = null;
    this.contexts.length = 0;
    this.pages.length = 0;
  }
}
