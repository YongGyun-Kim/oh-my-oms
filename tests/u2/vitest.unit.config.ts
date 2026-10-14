import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/u2/unit/**/*.spec.ts', 'tests/u2/unit/**/*.spec.tsx'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: ['default', 'json'],
    outputFile: process.argv.some((arg) => arg.includes('/unit/') && arg.includes('.spec.'))
      ? '.reports/u2/selected-unit.json'
      : '.reports/u2/unit.json',
  },
});
