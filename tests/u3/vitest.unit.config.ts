import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/u3/unit/**/*.spec.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: ['default', 'json'],
    outputFile: '.reports/u3/unit.json',
  },
});
