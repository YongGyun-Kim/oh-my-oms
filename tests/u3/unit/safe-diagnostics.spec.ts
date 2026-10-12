import { describe, expect, it } from 'vitest';
import { OmsError } from '@oms/contracts';
import { QueryFailedError } from 'typeorm';
import {
  observedError,
  observedHttp,
  safeFailure,
} from '../../../scripts/u3/pilot-safe-diagnostics.js';
import SafeJsonReporter from '../fixtures/safe-json-reporter.js';
import type { TestCase } from 'vitest/node';

const failure = () => ({
  version: 1,
  errors: [observedError(new OmsError(503, 'EXECUTION_DEADLINE', 'private-message'))],
  phases: [
    {
      phase: 'READ_100',
      milliseconds: 2,
      requestRemainingAtEntry: 9998,
      methods: {
        transactionGet: {
          calls: 1,
          milliseconds: 1,
          entryRemainingMinimum: 9998,
          exitRemainingMinimum: 9997,
          rejectedCalls: 1,
          rejectedErrors: [
            observedError(
              new QueryFailedError(
                'private-query',
                ['private-param'],
                Object.assign(new Error('private-driver'), { code: '55P03' }),
              ),
            ),
          ],
        },
      },
    },
  ],
  http: [
    observedHttp(503, { type: 'urn:oms:problem:request_unavailable', token: 'private-token' }),
  ],
});
describe('실제 실패 코드·숫자의 닫힌 공개 투영', () => {
  it('실제 OmsError와 driverError만 읽고 원문·SQL·parameter를 복사하지 않는다', () => {
    const value = safeFailure(failure());
    expect(value).toMatchObject({
      errors: [{ kind: 'BUSINESS', code: 'EXECUTION_DEADLINE', sqlState: 'UNKNOWN' }],
      phases: [
        {
          methods: {
            transactionGet: {
              rejectedErrors: [{ kind: 'DATABASE', code: 'UNKNOWN', sqlState: '55P03' }],
            },
          },
        },
      ],
      http: [{ phase: 'HTTP_APPLY', status: 503, code: 'REQUEST_UNAVAILABLE' }],
    });
    expect(JSON.stringify(value)).not.toContain('private-');
    expect(
      observedError({ name: 'QueryRunnerAlreadyReleasedError', message: 'private' }).kind,
    ).toBe('QUERY_RUNNER_RELEASED');
  });
  it('actual/expected/message의 code와 임의 오류·HTTP code를 추측하지 않는다', () => {
    expect(
      observedError({
        name: 'AssertionError',
        actual: 'EXECUTION_DEADLINE',
        expected: { code: '55P03' },
        message: 'private',
        code: 'private-code',
        driverError: { code: 'private-driver' },
      }),
    ).toEqual({ kind: 'ASSERTION', code: 'UNKNOWN', sqlState: 'UNKNOWN' });
    expect(observedHttp(503, { type: 'urn:oms:problem:private-secret' }).code).toBe('UNKNOWN');
    expect(observedError(null)).toEqual({ kind: 'UNKNOWN', code: 'UNKNOWN', sqlState: 'UNKNOWN' });
  });
  it('미등록 field/enum·버전·범위 밖 숫자·무한대·너무 많은 관측을 전체 거절한다', () => {
    const valid = failure();
    for (const value of [
      { ...valid, version: 2 },
      { ...valid, secret: 'private' },
      { ...valid, errors: [{ kind: 'UNKNOWN', code: 'private', sqlState: 'UNKNOWN' }] },
      { ...valid, errors: Array.from({ length: 4 }, () => valid.errors[0]) },
      { ...valid, phases: Array.from({ length: 9 }, () => valid.phases[0]) },
      { ...valid, phases: [{ ...valid.phases[0], phase: 'private' }] },
      { ...valid, phases: [{ ...valid.phases[0], milliseconds: Infinity }] },
      { ...valid, phases: [{ ...valid.phases[0], requestRemainingAtEntry: 10001 }] },
      {
        ...valid,
        phases: [
          { ...valid.phases[0], methods: { private: valid.phases[0]!.methods.transactionGet } },
        ],
      },
      {
        ...valid,
        phases: [
          {
            ...valid.phases[0],
            methods: {
              transactionGet: {
                ...valid.phases[0]!.methods.transactionGet,
                calls: 0.5,
              },
            },
          },
        ],
      },
      {
        ...valid,
        phases: [
          {
            ...valid.phases[0],
            methods: {
              transactionGet: {
                ...valid.phases[0]!.methods.transactionGet,
                rejectedCalls: 2,
              },
            },
          },
        ],
      },
      { ...valid, http: [{ phase: 'HTTP_APPLY', status: 600, code: 'UNKNOWN' }] },
      { ...valid, http: Array.from({ length: 4 }, () => valid.http[0]) },
    ])
      expect(safeFailure(value)).toBeNull();
    expect(safeFailure(null)).toBeNull();
  });
  it('투영은 독립 복사본이며 phase 숫자와 최종 오류를 섞지 않는다', () => {
    const original = failure(),
      projected = safeFailure(original)!;
    projected.phases[0]!.milliseconds = 10;
    expect(original.phases[0]!.milliseconds).toBe(2);
    expect(projected.errors[0]!.code).toBe('EXECUTION_DEADLINE');
    expect(projected.phases[0]!.methods.transactionGet!.rejectedErrors[0]!.sqlState).toBe('55P03');
  });
  it('reporter는 최종 failed에서만 오류를 넣고 passed 예상 rejection을 제외한다', () => {
    const reporter = new SafeJsonReporter();
    const meta: Record<string, unknown> = {
      existing: 'preserved',
      u3BudgetPhases: failure().phases,
      u3HttpResponses: failure().http,
    };
    const test = {
      result: () => ({
        state: 'failed',
        errors: [new OmsError(503, 'EXECUTION_DEADLINE', 'private')],
      }),
      meta: () => meta,
    };
    reporter.onTestCaseResult(test as unknown as TestCase);
    expect(meta.existing).toBe('preserved');
    expect(safeFailure(meta.u3SafeFailure)).not.toBeNull();
    expect(meta).not.toHaveProperty('u3BudgetPhases');
    reporter.onTestCaseResult({
      result: () => ({ state: 'passed', errors: [new OmsError(403, 'ACTION_DENIED', 'private')] }),
      meta: () => meta,
    } as unknown as TestCase);
    expect(meta).toEqual({ existing: 'preserved' });
  });
});
