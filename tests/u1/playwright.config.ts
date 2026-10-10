import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  use: { viewport: { width: 1280, height: 900 }, trace: 'off' },
  webServer: [
    {
      cwd: process.cwd(),
      command:
        'NODE_ENV=test OMS_U1_SYNTHETIC_PROFILE=approved-local-only OMS_U1_DATABASE_PROFILE=e2e-isolated node --import tsx tests/u1/fixtures/local-service.ts --reset-synthetic',
      url: 'http://127.0.0.1:3400/health/live',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      cwd: process.cwd(),
      command:
        'NODE_ENV=development OMS_LOCAL_SYNTHETIC=1 OMS_WEB_ORIGIN=http://127.0.0.1:3100 OMS_API_ORIGIN=http://127.0.0.1:3400 npm run dev:u1:customer',
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      cwd: process.cwd(),
      command:
        'NODE_ENV=development OMS_LOCAL_SYNTHETIC=1 OMS_WEB_ORIGIN=http://127.0.0.1:3200 OMS_API_ORIGIN=http://127.0.0.1:3401 npm run dev:u1:staff',
      url: 'http://127.0.0.1:3200',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  reporter: [['list'], ['json', { outputFile: resolve(process.cwd(), '.reports/u1/e2e.json') }]],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
