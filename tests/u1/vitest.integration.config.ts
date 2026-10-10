import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/u1/integration/**/*.spec.ts', 'tests/u1/integration/**/*.spec.tsx'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    reporters: ['default', 'json'],
    outputFile: '.reports/u1/integration.json',
  },
});
