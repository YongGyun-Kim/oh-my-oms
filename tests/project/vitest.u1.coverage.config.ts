import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/u1/unit/**/*.spec.{ts,tsx}', 'tests/u1/integration/**/*.spec.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: [
      'default',
      'json',
      [
        './scripts/u2/coverage-evidence.ts',
        { unit: 'u1', output: '.reports/project/current-u1-coverage/evidence.json' },
      ],
    ],
    outputFile: '.reports/project/current-u1-coverage-tests.json',
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
      reportsDirectory: '.reports/project/current-u1-coverage',
    },
  },
});
