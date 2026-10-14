import { defineConfig } from 'vitest/config';
import { assertU4DatabaseProfile } from './fixtures/profile.js';

assertU4DatabaseProfile();
export default defineConfig({
  test: {
    include: ['tests/u4/integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: ['./tests/u4/fixtures/safe-json-reporter.ts'],
    outputFile: '.reports/u4/integration.json',
  },
});
