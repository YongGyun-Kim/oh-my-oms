import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
// Supported runner switch: avoid automatically collecting secret-bearing DOM
// context. Boolean/metadata assertions remain fully enabled; traces stay off.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  outputDir: resolve(process.cwd(), '.reports/u2/e2e-artifacts', randomUUID()),
  use: { viewport: { width: 1280, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' },
  webServer: [
    {
      cwd: process.cwd(),
      command:
        'NODE_ENV=test OMS_U2_SYNTHETIC_PROFILE=approved-local-only OMS_U2_DATABASE_PROFILE=e2e-isolated node --import tsx tests/u2/fixtures/local-service.ts',
      url: 'http://127.0.0.1:34800/health/live',
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 60000,
    },
    {
      cwd: process.cwd(),
      command:
        'NODE_ENV=development OMS_LOCAL_SYNTHETIC=1 OMS_WEB_ORIGIN=http://127.0.0.1:3300 OMS_API_ORIGIN=http://127.0.0.1:34800 npx next dev apps/customer-web --hostname 127.0.0.1 --port 3300',
      url: 'http://127.0.0.1:3300',
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      cwd: process.cwd(),
      command:
        'NODE_ENV=development OMS_LOCAL_SYNTHETIC=1 OMS_WEB_ORIGIN=http://127.0.0.1:3301 OMS_API_ORIGIN=http://127.0.0.1:34801 npx next dev apps/staff-web --hostname 127.0.0.1 --port 3301',
      url: 'http://127.0.0.1:3301',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  reporter: [['list'], ['json', { outputFile: resolve(process.cwd(), '.reports/u2/e2e.json') }]],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
