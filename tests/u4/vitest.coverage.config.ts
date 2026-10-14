import { defineConfig } from 'vitest/config';
import { assertU4DatabaseProfile } from './fixtures/profile.js';

// Contribution only. The source-bound union of all four jobs owns the 80% gate.
assertU4DatabaseProfile();
export default defineConfig({
  test: {
    include: ['tests/u4/unit/**/*.spec.{ts,tsx}', 'tests/u4/integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: ['./tests/u4/fixtures/safe-json-reporter.ts'],
    outputFile: '.reports/u4/coverage.json',
    coverage: {
      provider: 'v8',
      include: [
        'apps/**/*.{ts,tsx,js,mjs,cjs}',
        'packages/**/src/**/*.{ts,tsx,js,mjs,cjs}',
        'infra/cdk/**/*.ts',
        'scripts/u1/**/*.{ts,js,mjs,cjs}',
        'scripts/u2/**/*.{ts,js,mjs,cjs}',
        'scripts/u3/**/*.{ts,js,mjs,cjs}',
        'scripts/u4/**/*.{ts,js,mjs,cjs}',
      ],
      exclude: ['**/*.d.ts', '**/.next/**', '**/dist/**', '**/cdk.out/**'],
      cleanOnRerun: false,
      reporter: ['json', 'json-summary', 'lcov', 'html'],
      reportsDirectory: '.reports/u4/coverage',
    },
  },
});
