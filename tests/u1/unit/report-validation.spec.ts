import { describe, expect, it } from 'vitest';
import {
  validateCoverage,
  validatePerformance,
  validateTestReport,
} from '../../../scripts/u1/report-validation.js';
const report = () => ({
  success: true,
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [{ name: '/workspace/tests/u1/unit/one.spec.ts' }],
});
describe('필터 실행/누락/skip·전체 coverage·전체50분 보고서 완료 차단', () => {
  it('문자열true/false·null·음수count를실제boolean/실행량으로강제변환하지않는다', () => {
    for (const change of [
      { success: 'false' },
      { success: 'true' },
      { numFailedTests: null },
      { numPassedTests: '1' },
      { numTotalTests: -1 },
    ])
      expect(() =>
        validateTestReport({ ...report(), ...change } as never, ['tests/u1/unit/one.spec.ts']),
      ).toThrow();
    expect(() =>
      validateCoverage({ total: { lines: { pct: 80, total: '100', covered: 80 } } } as never),
    ).toThrow();
    expect(() =>
      validatePerformance({ finished: 'true', passed: true, phases: [] } as never),
    ).toThrow();
  });
  it('정확한 전체 file/report의 실제pass만 인정한다', () =>
    expect(() => validateTestReport(report(), ['tests/u1/unit/one.spec.ts'])).not.toThrow());
  it('필터 실행으로 빠진 필수 파일을 green으로 인정하지 않는다', () =>
    expect(() => validateTestReport(report(), ['tests/u1/unit/two.spec.ts'])).toThrow('선택 실행'));
  it('실패·pending·todo·빈 보고서는 완료를 막는다', () => {
    for (const change of [
      { success: false },
      { numFailedTests: 1 },
      { numPendingTests: 1 },
      { numTodoTests: 1 },
      { numTotalTests: 0 },
    ])
      expect(() => validateTestReport({ ...report(), ...change }, [])).toThrow();
  });
  it('unexecuted까지 포함한80% 경계를 낮추지 않는다', () => {
    expect(() =>
      validateCoverage({ total: { lines: { pct: 79.99, total: 10000, covered: 7999 } } }),
    ).toThrow();
    expect(() =>
      validateCoverage({ total: { lines: { pct: 80, total: 10000, covered: 8000 } } }),
    ).not.toThrow();
  });
  it('빈 source분모를100%라고 표시해도 거절한다', () =>
    expect(() =>
      validateCoverage({ total: { lines: { pct: 100, total: 0, covered: 0 } } }),
    ).toThrow());
  it('짧은 smoke나 finished=false를50분 성공으로 만들지 않는다', () => {
    expect(() => validatePerformance({ finished: false, passed: true, phases: [] })).toThrow();
    expect(() =>
      validatePerformance({
        finished: true,
        passed: true,
        phases: [
          {
            phase: 'NORMAL',
            requests: 20,
            durationSeconds: 1,
            targetRate: 20,
            accuracyFailures: 0,
            passed: true,
          },
        ],
      }),
    ).toThrow();
  });
  it('정확한30/5/5/10분도 정확성 실패 하나를 허용하지 않는다', () => {
    const phases = [
      ['NORMAL', 20, 1800],
      ['PEAK', 100, 300],
      ['RECOVERY', 20, 300],
      ['HOLD', 20, 600],
    ].map(([phase, rate, seconds]) => ({
      phase: String(phase),
      requests: Number(rate) * Number(seconds),
      targetRate: Number(rate),
      durationSeconds: Number(seconds),
      accuracyFailures: 0,
      passed: true,
    }));
    expect(() =>
      validatePerformance({ finished: true, passed: true, workerRecoveryVerified: true, phases }),
    ).not.toThrow();
    phases[0]!.accuracyFailures = 1;
    expect(() =>
      validatePerformance({ finished: true, passed: true, workerRecoveryVerified: true, phases }),
    ).toThrow();
  });
});
