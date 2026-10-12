import { performance } from 'node:perf_hooks';
import { vi } from 'vitest';
import { ExecutionBudget, SchemaValidator } from '@oms/contracts';
import type { ServiceContext } from '@oms/contracts';
import { ProtectedStore, ProtectedTransaction, U3Transaction } from '@oms/persistence';

type Phase = 'SUBMISSION_100' | 'DECISION_SEED_SUBMISSION_100' | 'DECISION_100';
type Method =
  | 'currentProtected'
  | 'transactionGet'
  | 'assertPremises'
  | 'protectedExecute'
  | 'protect'
  | 'transactionPut'
  | 'putNewBatch'
  | 'validateUri'
  | 'validateSchema';
interface Aggregate {
  calls: number;
  milliseconds: number;
  entryRemainingMinimum: number | null;
  exitRemainingMinimum: number | null;
}

// 명시 선택한 시험에서만 숫자 집계를 출력한다. 원본/식별자/오류/SQL은 수집하지 않는다.
// 중첩 메서드의 시간은 포함 관계이므로 누적 시간을 합산한 총 시간으로 해석하지 않는다.
export async function profileU3Budget<T>(
  phase: Phase,
  context: ServiceContext,
  operation: () => Promise<T>,
): Promise<T> {
  if (process.env.OMS_U3_BUDGET_PROFILE !== '1') return operation();
  const aggregates = new Map<Method, Aggregate>();
  const remaining = () => ExecutionBudget.current()?.remaining() ?? null;
  const minimum = (before: number | null, next: number | null) =>
    next === null ? before : before === null ? next : Math.min(before, next);
  const begin = (method: Method) => {
    const aggregate = aggregates.get(method) ?? {
      calls: 0,
      milliseconds: 0,
      entryRemainingMinimum: null,
      exitRemainingMinimum: null,
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
  async function measured<R>(method: Method, invoke: () => Promise<R>): Promise<R> {
    const finish = begin(method);
    try {
      return await invoke();
    } finally {
      finish();
    }
  }
  function measuredSync<R>(method: Method, invoke: () => R): R {
    const finish = begin(method);
    try {
      return invoke();
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
  const spies = [
    vi.spyOn(ProtectedStore.prototype, 'currentProtected').mockImplementation(function (
      this: ProtectedStore,
      ...args
    ) {
      return measured('currentProtected', () => currentProtected.apply(this, args));
    }),
    vi.spyOn(ProtectedTransaction.prototype, 'get').mockImplementation(function (
      this: ProtectedTransaction,
      ...args
    ) {
      return measured('transactionGet', () => get.apply(this, args));
    }),
    vi.spyOn(U3Transaction.prototype, 'assertPremises').mockImplementation(function (
      this: U3Transaction,
    ) {
      return measured('assertPremises', () => assertPremises.call(this));
    }),
    vi.spyOn(ProtectedStore.prototype, 'execute').mockImplementation(function (
      this: ProtectedStore,
      ...args
    ) {
      return measured('protectedExecute', () => execute.apply(this, args));
    }),
    vi.spyOn(ProtectedStore.prototype, 'protect').mockImplementation(function (
      this: ProtectedStore,
      ...args
    ) {
      return measured('protect', () => protect.apply(this, args));
    }),
    vi.spyOn(ProtectedTransaction.prototype, 'put').mockImplementation(function (
      this: ProtectedTransaction,
      ...args
    ) {
      return measured('transactionPut', () => put.apply(this, args));
    }),
    vi.spyOn(ProtectedTransaction.prototype, 'putNewBatch').mockImplementation(function (
      this: ProtectedTransaction,
      ...args
    ) {
      return measured('putNewBatch', () => putNewBatch.apply(this, args));
    }),
    vi.spyOn(SchemaValidator.prototype, 'validateUri').mockImplementation(function <R>(
      this: SchemaValidator,
      uri: string,
      data: unknown,
    ): R {
      const validate = validateUri.bind(this);
      return measuredSync('validateUri', () => validate<R>(uri, data));
    }),
    vi.spyOn(SchemaValidator.prototype, 'validateSchema').mockImplementation(function <R>(
      this: SchemaValidator,
      schema: Parameters<SchemaValidator['validateSchema']>[0],
      data: unknown,
    ): R {
      const validate = validateSchema.bind(this);
      return measuredSync('validateSchema', () => validate<R>(schema, data));
    }),
  ];
  const started = performance.now();
  const requestRemainingAtEntry = Date.parse(context.deadlineAt) - Date.now();
  try {
    return await operation();
  } finally {
    for (const spy of spies) spy.mockRestore();
    console.log(
      'U3_BUDGET_AGGREGATE ' +
        JSON.stringify({
          phase,
          milliseconds: performance.now() - started,
          requestRemainingAtEntry: Number.isFinite(requestRemainingAtEntry)
            ? requestRemainingAtEntry
            : null,
          methods: Object.fromEntries(aggregates),
        }),
    );
  }
}
