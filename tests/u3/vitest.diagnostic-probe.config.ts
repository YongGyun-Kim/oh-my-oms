import { defineConfig } from 'vitest/config';

const mode = process.env.OMS_U3_REPORTER_PROBE ?? 'SAFE';
if (mode !== 'SAFE' && mode !== 'BASELINE') throw new Error('명시한 reporter probe만 실행합니다.');
export default defineConfig({
  test: {
    include: ['tests/u3/probes/safe-json-reporter.probe.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    passWithNoTests: false,
    // 기본 console reporter는 원문 오류를 출력하므로 이 private probe에서는 사용하지 않는다.
    reporters: [mode === 'SAFE' ? './tests/u3/fixtures/safe-json-reporter.ts' : 'json'],
    outputFile: '.reports/u3/diagnostic-probe/' + mode.toLowerCase() + '.json',
  },
});
