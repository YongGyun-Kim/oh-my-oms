import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/u4/unit/**/*.spec.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: ['./tests/u4/fixtures/safe-json-reporter.ts'],
    outputFile: '.reports/u4/unit.json',
  },
});
