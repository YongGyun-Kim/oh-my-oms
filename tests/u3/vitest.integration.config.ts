import { defineConfig } from 'vitest/config';
import { assertU3DatabaseProfile } from './fixtures/profile.js';

assertU3DatabaseProfile();
export default defineConfig({
  test: {
    include: ['tests/u3/integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    reporters: ['default', './tests/u3/fixtures/safe-json-reporter.ts'],
    outputFile: '.reports/u3/integration.json',
  },
});
