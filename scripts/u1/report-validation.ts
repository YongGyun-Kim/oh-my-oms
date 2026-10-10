interface VitestReport {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testResults: { name: string }[];
}
export function validateTestReport(report: VitestReport, expectedFiles: readonly string[]): void {
  if (
    report.success !== true ||
    !Number.isInteger(report.numTotalTests) ||
    report.numTotalTests <= 0 ||
    ![
      report.numPassedTests,
      report.numFailedTests,
      report.numPendingTests,
      report.numTodoTests,
    ].every((value) => Number.isInteger(value) && value >= 0) ||
    report.numTotalTests !== report.numPassedTests ||
    report.numFailedTests ||
    report.numPendingTests ||
    report.numTodoTests ||
    !Array.isArray(report.testResults)
  )
    throw new Error('필수 시험 실패/미실행/skip이 있습니다.');
  for (const path of expectedFiles)
    if (!report.testResults.some((result) => result.name.endsWith('/' + path)))
      throw new Error('선택 실행 보고서는 전체 필수 시험 증거가 아닙니다: ' + path);
}
export function validateCoverage(report: {
  total: { lines: { pct: number; total: number; covered: number } };
}): void {
  const line = report.total.lines;
  if (
    !Number.isInteger(line.total) ||
    line.total <= 0 ||
    !Number.isInteger(line.covered) ||
    line.covered < 0 ||
    !Number.isFinite(line.pct) ||
    line.pct < 80 ||
    line.pct > 100 ||
    line.covered > line.total
  )
    throw new Error('전체 handwritten 제품 line coverage80% 증거가 필요합니다.');
}
export function validatePerformance(report: {
  finished: boolean;
  passed: boolean;
  workerRecoveryVerified?: unknown;
  phases: {
    phase: string;
    requests: number;
    durationSeconds: number;
    targetRate: number;
    accuracyFailures: number;
    passed: boolean;
  }[];
}): void {
  const profiles = [
    ['NORMAL', 20, 1800],
    ['PEAK', 100, 300],
    ['RECOVERY', 20, 300],
    ['HOLD', 20, 600],
  ] as const;
  if (
    report.finished !== true ||
    report.passed !== true ||
    report.workerRecoveryVerified !== true ||
    !Array.isArray(report.phases) ||
    report.phases.length !== profiles.length
  )
    throw new Error('전체50분 부하/회복/유지 증거가 필요합니다.');
  for (let index = 0; index < profiles.length; index++) {
    const [name, rate, seconds] = profiles[index]!;
    const phase = report.phases[index]!;
    if (
      phase.phase !== name ||
      phase.targetRate !== rate ||
      phase.durationSeconds !== seconds ||
      phase.requests !== rate * seconds ||
      phase.passed !== true ||
      phase.accuracyFailures !== 0
    )
      throw new Error('부하/회복/정확성 기준이 다릅니다.');
  }
}
