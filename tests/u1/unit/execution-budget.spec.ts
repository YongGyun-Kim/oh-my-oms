import { describe, expect, it } from 'vitest';
import { ExecutionBudget } from '@oms/contracts';
describe('요청 전체 deadline/abort 전파', () => {
  it('유한 예산 이외 설정을 거절한다', () => {
    for (const value of [0, -1, 30001, 0.5]) expect(() => new ExecutionBudget(value)).toThrow();
  });
  it('원래 clock/deadline을 보존하고 남은 예산만 반환한다', () => {
    let now = 1000;
    const budget = new ExecutionBudget(100, () => now);
    now += 70;
    expect(budget.remaining()).toBe(30);
    expect(budget.deadlineAt).toBe(new Date(1100).toISOString());
  });
  it('후속 단계가 새 예산을 만들지 못하고 deadline에 실패한다', () => {
    let now = 1000;
    const budget = new ExecutionBudget(100, () => now);
    now = 1100;
    expect(() => budget.signalWithin(5000)).toThrow();
  });
  it('caller abort는 모든 하위signal에 전달한다', () => {
    const controller = new AbortController();
    const budget = new ExecutionBudget(1000, Date.now, controller.signal);
    const signal = budget.signalWithin(500);
    controller.abort();
    expect(signal.aborted).toBe(true);
    expect(() => budget.check()).toThrow();
  });
  it('owner/DB가 같은 AsyncLocalStorage 예산을 사용한다', async () => {
    const budget = new ExecutionBudget(1000);
    await budget.run(async () => {
      await Promise.resolve();
      expect(ExecutionBudget.current()).toBe(budget);
    });
    expect(ExecutionBudget.current()).toBeUndefined();
  });
  it('서로 다른 동시 요청의 예산은 합쳐지지 않는다', async () => {
    const a = new ExecutionBudget(1000);
    const b = new ExecutionBudget(2000);
    await Promise.all([
      a.run(async () => {
        await Promise.resolve();
        expect(ExecutionBudget.current()).toBe(a);
      }),
      b.run(async () => {
        await Promise.resolve();
        expect(ExecutionBudget.current()).toBe(b);
      }),
    ]);
  });
  it('끝난 underlying 결과도 기한 후 성공으로 반환하지 않는다', async () => {
    let now = 1000;
    const budget = new ExecutionBudget(100, () => now);
    await expect(
      budget.run(async () => {
        now = 1100;
        return 'late success';
      }),
    ).rejects.toMatchObject({ code: 'EXECUTION_DEADLINE' });
  });
  it('원래 signal의 실제 timeout은 하위 예산도 종료한다', async () => {
    const budget = new ExecutionBudget(10);
    const signal = budget.signalWithin(1000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(signal.aborted).toBe(true);
  });
});
