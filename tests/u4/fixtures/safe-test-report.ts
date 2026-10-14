import { safeU4Error } from './safe-error.js';

interface ReportModule {
  readonly relativeModuleId: string;
  state(): string;
  errors(): readonly unknown[];
  children: {
    allTests(): Iterable<{
      result(): { state: string; errors?: readonly unknown[] };
    }>;
  };
}
type RunReason = 'passed' | 'failed' | 'interrupted';

// Vitest 전체 종료 결과를 원문 없이 투영한다. 선택 실행의 필터도 전체 성공으로 표시하지 않는다.
export function safeU4TestReport(
  modules: readonly ReportModule[],
  unhandledErrors: readonly unknown[],
  reason: RunReason,
) {
  const results = modules.map((module) => ({
    name: /^tests\/u4\/[a-zA-Z0-9_./-]+\.spec\.tsx?$/.test(module.relativeModuleId)
      ? module.relativeModuleId
      : 'UNRECOGNIZED_TEST_FILE',
    status: module.state() === 'passed' ? 'passed' : 'failed',
    collectionErrorCount: module.errors().length,
    collectionErrors: module.errors().slice(0, 3).map(safeU4Error),
    assertionResults: [...module.children.allTests()].map((test, index) => {
      const result = test.result();
      const status = ['passed', 'failed', 'pending', 'skipped'].includes(result.state)
        ? result.state
        : 'pending';
      return {
        title: 'case-' + (index + 1),
        status,
        failureMessages: status === 'failed' ? ['U4_TEST_FAILED'] : [],
        errorCount: result.errors?.length ?? 0,
        errors: (result.errors ?? []).slice(0, 3).map(safeU4Error),
      };
    }),
  }));
  const assertions = results.flatMap((result) => result.assertionResults);
  const numPendingTests = assertions.filter(
    (result) => !['passed', 'failed'].includes(result.status),
  ).length;
  const numAssertionErrors = assertions.reduce((sum, result) => sum + result.errorCount, 0);
  const numCollectionErrors = results.reduce((sum, result) => sum + result.collectionErrorCount, 0);
  return {
    success:
      reason === 'passed' &&
      unhandledErrors.length === 0 &&
      results.length > 0 &&
      assertions.length > 0 &&
      numPendingTests === 0 &&
      numAssertionErrors === 0 &&
      numCollectionErrors === 0 &&
      results.every((result) => result.status === 'passed' && result.assertionResults.length > 0) &&
      assertions.every((result) => result.status === 'passed'),
    runReason: reason,
    numUnhandledErrors: unhandledErrors.length,
    unhandledErrors: unhandledErrors.slice(0, 3).map(safeU4Error),
    numCollectionErrors,
    numAssertionErrors,
    numTotalTestSuites: results.length,
    numPassedTestSuites: results.filter((result) => result.status === 'passed').length,
    numFailedTestSuites: results.filter((result) => result.status !== 'passed').length,
    numTotalTests: assertions.length,
    numPassedTests: assertions.filter((result) => result.status === 'passed').length,
    numFailedTests: assertions.filter((result) => result.status === 'failed').length,
    numPendingTests,
    testResults: results,
  };
}
