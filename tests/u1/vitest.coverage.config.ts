import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/u1/unit/**/*.spec.{ts,tsx}', 'tests/u1/integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    reporters: ['default', 'json'],
    outputFile: '.reports/u1/coverage.json',
    coverage: {
      provider: 'v8',
      include: [
        'apps/**/*.ts',
        'apps/**/*.tsx',
        'apps/**/*.js',
        'apps/**/*.mjs',
        'apps/**/*.cjs',
        'packages/**/src/**/*.ts',
        'packages/**/src/**/*.tsx',
        'packages/**/src/**/*.js',
        'packages/**/src/**/*.mjs',
        'packages/**/src/**/*.cjs',
        'infra/cdk/**/*.ts',
        'scripts/u1/**/*.ts',
        'scripts/u1/**/*.js',
        'scripts/u1/**/*.mjs',
        'scripts/u1/**/*.cjs',
      ],
      exclude: ['**/*.d.ts', '**/.next/**'],
      thresholds: {
        lines: 80,
      },
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: '.reports/u1/coverage',
    },
  },
});
