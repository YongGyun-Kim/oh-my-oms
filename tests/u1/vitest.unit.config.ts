import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/u1/unit/**/*.spec.ts', 'tests/u1/unit/**/*.spec.tsx'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    reporters: ['default', 'json'],
    outputFile: '.reports/u1/unit.json',
  },
});
