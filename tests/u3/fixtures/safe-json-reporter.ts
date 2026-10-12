import { JsonReporter } from 'vitest/node';
import type { JsonOptions, TestCase } from 'vitest/node';
import { observedError, safeFailure } from '../../../scripts/u3/pilot-safe-diagnostics.js';

// meta 입력은 unknown으로 받아 닫힌 투영에서 검증한다. 임의 key/index signature는 추가하지 않는다.
declare module 'vitest' {
  interface TaskMeta {
    u3SafeFailure?: unknown;
    u3BudgetPhases?: unknown;
    u3HttpResponses?: unknown;
  }
}

// 원래 JSON reporter의 counts/output을 그대로 사용하고 최종 실패 meta만 추가한다.
export default class SafeJsonReporter extends JsonReporter {
  constructor(options: JsonOptions = {}) {
    super(options);
  }
  onTestCaseResult(test: TestCase): void {
    const result = test.result(),
      meta = test.meta();
    delete meta.u3SafeFailure;
    if (result.state === 'failed') {
      const observed = safeFailure({
        version: 1,
        errors: [],
        phases: meta.u3BudgetPhases ?? [],
        http: meta.u3HttpResponses ?? [],
      });
      meta.u3SafeFailure = {
        version: 1,
        errors: result.errors.slice(0, 3).map(observedError),
        phases: observed?.phases ?? [],
        http: observed?.http ?? [],
      };
    }
    delete meta.u3BudgetPhases;
    delete meta.u3HttpResponses;
  }
}
