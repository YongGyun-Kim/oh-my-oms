import { AsyncLocalStorage } from 'node:async_hooks';
import { requireCondition } from './errors.js';
const activeBudget = new AsyncLocalStorage<ExecutionBudget>();
export class ExecutionBudget {
  readonly deadlineAt: string;
  readonly signal: AbortSignal;
  constructor(
    milliseconds: number,
    readonly now = () => Date.now(),
    incoming?: AbortSignal,
  ) {
    requireCondition(
      Number.isInteger(milliseconds) && milliseconds > 0 && milliseconds <= 30000,
      503,
      'EXECUTION_BUDGET_CONFIGURATION',
      '유한 실행 예산이 필요합니다.',
    );
    this.deadlineAt = new Date(now() + milliseconds).toISOString();
    const timeout = AbortSignal.timeout(milliseconds);
    this.signal = incoming ? AbortSignal.any([incoming, timeout]) : timeout;
  }
  remaining(): number {
    return Date.parse(this.deadlineAt) - this.now();
  }
  check(): void {
    requireCondition(
      !this.signal.aborted && this.remaining() > 0,
      503,
      'EXECUTION_DEADLINE',
      '원래 요청 기한이 종료되어 결과 대조가 필요합니다.',
    );
  }
  signalWithin(maximum: number): AbortSignal {
    this.check();
    const remaining = this.remaining();
    return maximum >= remaining
      ? this.signal
      : AbortSignal.any([
          this.signal,
          AbortSignal.timeout(Math.min(maximum, Math.max(1, remaining))),
        ]);
  }
  static current(): ExecutionBudget | undefined {
    return activeBudget.getStore();
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    this.check();
    return activeBudget.run(this, async () => {
      const result = await operation();
      this.check();
      return result;
    });
  }
}
