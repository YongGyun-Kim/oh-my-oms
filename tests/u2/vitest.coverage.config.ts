import { defineConfig } from 'vitest/config';

// This runner measures U2's contribution. The same-source project aggregate,
// including unexecuted product files, owns the unchanged 80% overall gate.
export default defineConfig({
  test: {
    include: ['tests/u2/unit/**/*.spec.{ts,tsx}', 'tests/u2/integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: [
      'default',
      'json',
      [
        './scripts/u2/coverage-evidence.ts',
        { unit: 'u2', output: '.reports/u2/coverage/evidence.json' },
      ],
    ],
    outputFile: '.reports/u2/coverage.json',
    coverage: {
      provider: 'v8',
      include: [
        'apps/**/*.{ts,tsx,js,mjs,cjs}',
        'packages/**/src/**/*.{ts,tsx,js,mjs,cjs}',
        'infra/cdk/**/*.ts',
        'scripts/u1/**/*.{ts,js,mjs,cjs}',
        'scripts/u2/**/*.{ts,js,mjs,cjs}',
      ],
      exclude: ['**/*.d.ts', '**/.next/**', '**/dist/**', '**/cdk.out/**'],
      cleanOnRerun: false,
      reporter: ['json', 'json-summary', 'lcov', 'html'],
      reportsDirectory: '.reports/u2/coverage',
    },
  },
});
