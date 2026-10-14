import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/u2/integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: ['default', 'json'],
    outputFile: process.argv.some((arg) => arg.includes('/integration/') && arg.includes('.spec.'))
      ? '.reports/u2/selected-integration.json'
      : '.reports/u2/integration.json',
  },
});
