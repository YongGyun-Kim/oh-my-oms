import { performance } from 'node:perf_hooks';
import { vi } from 'vitest';
import type { TestContext } from 'vitest';
import { ExecutionBudget, SchemaValidator } from '@oms/contracts';
import type { ServiceContext } from '@oms/contracts';
import { ProtectedStore, ProtectedTransaction, U3Transaction } from '@oms/persistence';
import { observedError, observedHttp } from '../../../scripts/u3/pilot-safe-diagnostics.js';
import type {
  DiagnosticPhase,
  DiagnosticMethod,
  SafeAggregate,
  SafePhase,
} from '../../../scripts/u3/pilot-safe-diagnostics.js';

// 명시 선택한 시험에서만 숫자 집계를 출력한다. 원본/식별자/오류/SQL은 수집하지 않는다.
// 중첩 메서드의 시간은 포함 관계이므로 누적 시간을 합산한 총 시간으로 해석하지 않는다.
// spy/숫자 집계 overhead를 포함한다. 메서드 rejection은 최종 시험 오류와 별도 관측이다.
export async function profileU3Budget<T>(
  phase: DiagnosticPhase,
  context: Pick<ServiceContext, 'deadlineAt'> | null,
  operation: () => Promise<T>,
  test?: TestContext,
): Promise<T> {
  if (process.env.OMS_U3_BUDGET_PROFILE !== '1') return operation();
  const aggregates = new Map<DiagnosticMethod, SafeAggregate>();
  const remaining = () => ExecutionBudget.current()?.remaining() ?? null;
  const minimum = (before: number | null, next: number | null) =>
    next === null ? before : before === null ? next : Math.min(before, next);
  const begin = (method: DiagnosticMethod) => {
    const aggregate = aggregates.get(method) ?? {
      calls: 0,
      milliseconds: 0,
      entryRemainingMinimum: null,
      exitRemainingMinimum: null,
      rejectedCalls: 0,
      rejectedErrors: [],
    };
    aggregate.calls++;
    aggregate.entryRemainingMinimum = minimum(aggregate.entryRemainingMinimum, remaining());
    aggregates.set(method, aggregate);
    const started = performance.now();
    return () => {
      aggregate.milliseconds += performance.now() - started;
      aggregate.exitRemainingMinimum = minimum(aggregate.exitRemainingMinimum, remaining());
    };
  };
  const rejected = (method: DiagnosticMethod, error: unknown) => {
    const aggregate = aggregates.get(method)!;
    aggregate.rejectedCalls++;
    if (aggregate.rejectedErrors.length < 3) aggregate.rejectedErrors.push(observedError(error));
  };
  async function measured<R>(method: DiagnosticMethod, invoke: () => Promise<R>): Promise<R> {
    const finish = begin(method);
    try {
      return await invoke();
    } catch (error) {
      rejected(method, error);
      throw error;
    } finally {
      finish();
    }
  }
  function measuredSync<R>(method: DiagnosticMethod, invoke: () => R): R {
    const finish = begin(method);
    try {
      return invoke();
    } catch (error) {
      rejected(method, error);
      throw error;
    } finally {
      finish();
    }
  }
  const currentProtected = ProtectedStore.prototype.currentProtected;
  const get = ProtectedTransaction.prototype.get;
  const assertPremises = U3Transaction.prototype.assertPremises;
  const execute = ProtectedStore.prototype.execute;
  const protect = ProtectedStore.prototype.protect;
  const put = ProtectedTransaction.prototype.put;
  const putNewBatch = ProtectedTransaction.prototype.putNewBatch;
  const validateUri = SchemaValidator.prototype.validateUri;
  const validateSchema = SchemaValidator.prototype.validateSchema;
  // 기존 음성 시험의 spy는 덮어쓰거나 재귀 호출하지 않는다.
  const spies = [
    ...(vi.isMockFunction(ProtectedStore.prototype.currentProtected)
      ? []
      : [
          vi.spyOn(ProtectedStore.prototype, 'currentProtected').mockImplementation(function (
            this: ProtectedStore,
            ...args
          ) {
            return measured('currentProtected', () => currentProtected.apply(this, args));
          }),
        ]),
    ...(vi.isMockFunction(ProtectedTransaction.prototype.get)
      ? []
      : [
          vi.spyOn(ProtectedTransaction.prototype, 'get').mockImplementation(function (
            this: ProtectedTransaction,
            ...args
          ) {
            return measured('transactionGet', () => get.apply(this, args));
          }),
        ]),
    ...(vi.isMockFunction(U3Transaction.prototype.assertPremises)
      ? []
      : [
          vi.spyOn(U3Transaction.prototype, 'assertPremises').mockImplementation(function (
            this: U3Transaction,
          ) {
            return measured('assertPremises', () => assertPremises.call(this));
          }),
        ]),
    ...(vi.isMockFunction(ProtectedStore.prototype.execute)
      ? []
      : [
          vi.spyOn(ProtectedStore.prototype, 'execute').mockImplementation(function (
            this: ProtectedStore,
            ...args
          ) {
            return measured('protectedExecute', () => execute.apply(this, args));
          }),
        ]),
    ...(vi.isMockFunction(ProtectedStore.prototype.protect)
      ? []
      : [
          vi.spyOn(ProtectedStore.prototype, 'protect').mockImplementation(function (
            this: ProtectedStore,
            ...args
          ) {
            return measured('protect', () => protect.apply(this, args));
          }),
        ]),
    ...(vi.isMockFunction(ProtectedTransaction.prototype.put)
      ? []
      : [
          vi.spyOn(ProtectedTransaction.prototype, 'put').mockImplementation(function (
            this: ProtectedTransaction,
            ...args
          ) {
            return measured('transactionPut', () => put.apply(this, args));
          }),
        ]),
    ...(vi.isMockFunction(ProtectedTransaction.prototype.putNewBatch)
      ? []
      : [
          vi.spyOn(ProtectedTransaction.prototype, 'putNewBatch').mockImplementation(function (
            this: ProtectedTransaction,
            ...args
          ) {
            return measured('putNewBatch', () => putNewBatch.apply(this, args));
          }),
        ]),
    ...(vi.isMockFunction(SchemaValidator.prototype.validateUri)
      ? []
      : [
          vi.spyOn(SchemaValidator.prototype, 'validateUri').mockImplementation(function <R>(
            this: SchemaValidator,
            uri: string,
            data: unknown,
          ): R {
            const validate = validateUri.bind(this);
            return measuredSync('validateUri', () => validate<R>(uri, data));
          }),
        ]),
    ...(vi.isMockFunction(SchemaValidator.prototype.validateSchema)
      ? []
      : [
          vi.spyOn(SchemaValidator.prototype, 'validateSchema').mockImplementation(function <R>(
            this: SchemaValidator,
            schema: Parameters<SchemaValidator['validateSchema']>[0],
            data: unknown,
          ): R {
            const validate = validateSchema.bind(this);
            return measuredSync('validateSchema', () => validate<R>(schema, data));
          }),
        ]),
  ];
  const started = performance.now();
  const requestRemainingAtEntry = context ? Date.parse(context.deadlineAt) - Date.now() : null;
  try {
    return await operation();
  } finally {
    for (const spy of spies) spy.mockRestore();
    const observation: SafePhase = {
      phase,
      milliseconds: performance.now() - started,
      requestRemainingAtEntry:
        requestRemainingAtEntry !== null && Number.isFinite(requestRemainingAtEntry)
          ? requestRemainingAtEntry
          : null,
      methods: Object.fromEntries(aggregates),
    };
    if (test) {
      const previous: unknown[] = Array.isArray(test.task.meta.u3BudgetPhases)
        ? test.task.meta.u3BudgetPhases
        : [];
      test.task.meta.u3BudgetPhases = [...previous.slice(-7), observation];
    }
    console.log('U3_BUDGET_AGGREGATE ' + JSON.stringify(observation));
  }
}

export function recordHttpObservation(test: TestContext, status: number, body: unknown): void {
  const previous: unknown[] = Array.isArray(test.task.meta.u3HttpResponses)
    ? test.task.meta.u3HttpResponses
    : [];
  test.task.meta.u3HttpResponses = [...previous.slice(-2), observedHttp(status, body)];
}
