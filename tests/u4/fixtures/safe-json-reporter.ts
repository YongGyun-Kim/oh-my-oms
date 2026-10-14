import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { JsonReporter } from 'vitest/node';
import type { TestModule, SerializedError, TestRunEndReason } from 'vitest/node';
import { safeU4TestReport } from './safe-test-report.js';

// 진단 원문이나 임의 메타데이터는 저장하지 않는다. 프로세스 종료와 필수 목록도 별도로 대조한다.
export default class SafeJsonReporter extends JsonReporter {
  constructor() {
    super({});
  }
  override async onTestRunEnd(
    modules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError> = [],
    reason: TestRunEndReason = 'passed',
  ): Promise<void> {
    const report = safeU4TestReport(modules, unhandledErrors, reason);
    const output = this.ctx.config.outputFile;
    if (
      typeof output !== 'string' ||
      !/^\.reports\/u4\/(unit|integration|coverage)\.json$/.test(output)
    )
      throw new Error('U4 보고서의 정확한 출력 경로가 필요합니다.');
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, JSON.stringify(report) + '\n', { mode: 0o600 });
    this.ctx.logger.log(
      `U4 tests: ${report.numPassedTests}/${report.numTotalTests}; failed=${report.numFailedTests}; pending=${report.numPendingTests}; unhandled=${report.numUnhandledErrors}; reason=${report.runReason}`,
    );
  }
}
