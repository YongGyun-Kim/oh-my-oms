import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { JsonReporter } from 'vitest/node';
import type { TestModule } from 'vitest/node';
import { safeU4Error } from './safe-error.js';

// Do not serialize assertion errors, console output, arbitrary meta, or payloads.
// This report is a contribution; process exit and required inventory still gate CI.
export default class SafeJsonReporter extends JsonReporter {
  constructor() {
    super({});
  }
  override async onTestRunEnd(modules: ReadonlyArray<TestModule>): Promise<void> {
    const results = modules.map((module) => ({
      name: /^tests\/u4\/[a-zA-Z0-9_./-]+\.spec\.tsx?$/.test(module.relativeModuleId)
        ? module.relativeModuleId
        : 'UNRECOGNIZED_TEST_FILE',
      status: module.state() === 'passed' ? 'passed' : 'failed',
      collectionErrorCount: module.errors().length,
      collectionErrors: module.errors().slice(0, 3).map(safeU4Error),
      assertionResults: [...module.children.allTests()].map((test, index) => ({
        title: 'case-' + (index + 1),
        status: test.result().state,
        failureMessages: test.result().state === 'failed' ? ['U4_TEST_FAILED'] : [],
        errors:
          test.result().state === 'failed'
            ? (test.result().errors ?? []).slice(0, 3).map(safeU4Error)
            : [],
      })),
    }));
    const assertions = results.flatMap((result) => result.assertionResults);
    const report = {
      success: results.length > 0 && results.every((result) => result.status === 'passed'),
      numTotalTestSuites: results.length,
      numPassedTestSuites: results.filter((result) => result.status === 'passed').length,
      numFailedTestSuites: results.filter((result) => result.status !== 'passed').length,
      numTotalTests: assertions.length,
      numPassedTests: assertions.filter((result) => result.status === 'passed').length,
      numFailedTests: assertions.filter((result) => result.status === 'failed').length,
      numPendingTests: assertions.filter((result) => !['passed', 'failed'].includes(result.status))
        .length,
      testResults: results,
    };
    const output = this.ctx.config.outputFile;
    if (
      typeof output !== 'string' ||
      !/^\.reports\/u4\/(unit|integration|coverage)\.json$/.test(output)
    )
      throw new Error('U4 보고서의 정확한 출력 경로가 필요합니다.');
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, JSON.stringify(report) + '\n', { mode: 0o600 });
    this.ctx.logger.log(
      `U4 tests: ${report.numPassedTests}/${report.numTotalTests}; failed=${report.numFailedTests}; pending=${report.numPendingTests}`,
    );
  }
}
