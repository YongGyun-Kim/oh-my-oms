import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/u1/profile/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    reporters: ['default', 'json'],
    outputFile: '.reports/u1/profile-probes.json',
  },
});
