import { defineConfig } from 'vitest/config';
import type { PilotUnit } from '../../scripts/u3/runtime-source.js';

const selected = process.env.OMS_PILOT_COVERAGE_UNIT;
if (selected !== 'u1' && selected !== 'u2' && selected !== 'u3')
  throw new Error('PILOT_COVERAGE_UNIT: 명시한 현재 U1/U2/U3 기여만 실행합니다.');
const unit: PilotUnit = selected;
if (process.env['OMS_' + unit.toUpperCase() + '_DATABASE_PROFILE'] !== 'verification-isolated')
  throw new Error('PILOT_COVERAGE_PROFILE: 격리 검증 DB profile만 사용합니다.');
export default defineConfig({
  test: {
    include: [
      'tests/' + unit + '/unit/**/*.spec.{ts,tsx}',
      'tests/' + unit + '/integration/**/*.spec.{ts,tsx}',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: [
      'default',
      unit === 'u3' ? './tests/u3/fixtures/safe-json-reporter.ts' : 'json',
      ['./scripts/u3/coverage-evidence.ts', { unit }],
    ],
    outputFile: '.reports/u3/pilot/' + unit + '-coverage-tests.json',
    coverage: {
      provider: 'v8',
      include: [
        'apps/**/*.{ts,tsx,js,mjs,cjs}',
        'packages/**/src/**/*.{ts,tsx,js,mjs,cjs}',
        'infra/cdk/**/*.ts',
        'scripts/u1/**/*.{ts,js,mjs,cjs}',
        'scripts/u2/**/*.{ts,js,mjs,cjs}',
        'scripts/u3/**/*.{ts,js,mjs,cjs}',
      ],
      exclude: ['**/*.d.ts', '**/.next/**', '**/dist/**', '**/cdk.out/**'],
      cleanOnRerun: false,
      reporter: ['json', 'json-summary', 'lcov'],
      reportsDirectory: '.reports/u3/pilot/' + unit + '-coverage',
    },
  },
});
