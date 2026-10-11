import { defineConfig } from 'vitest/config';
import { assertU3DatabaseProfile } from './fixtures/databases.js';

// Contribution only. The source-bound union of all three jobs owns the 80% gate.
assertU3DatabaseProfile();
export default defineConfig({
  test: {
    include: ['tests/u3/unit/**/*.spec.{ts,tsx}', 'tests/u3/integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: ['default', 'json'],
    outputFile: '.reports/u3/coverage.json',
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
      reporter: ['json', 'json-summary', 'lcov', 'html'],
      reportsDirectory: '.reports/u3/coverage',
    },
  },
});
