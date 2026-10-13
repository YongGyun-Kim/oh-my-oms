import { describe, expect, it, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readSync,
  rmSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { OmsError } from '@oms/contracts';
import { QueryFailedError } from 'typeorm';
import {
  observedError,
  observedHttp,
  MAX_DIAGNOSTIC_REPORT_BYTES,
  readCoverageTestDiagnostic,
  safeFailure,
  U3_COVERAGE_TEST_REPORT,
} from '../../../scripts/u3/pilot-safe-diagnostics.js';
import SafeJsonReporter from '../fixtures/safe-json-reporter.js';
import type { TestCase } from 'vitest/node';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readSync: vi.fn(actual.readSync) };
});

describe('coverage 보조 시험 파일의 소유·기한·유한 읽기 경계', () => {
  it('고정 경로의 fresh regular bytes만 읽고 파일을 바꾸지 않는다', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'oms-u3-diagnostic-')),
      file = resolve(root, U3_COVERAGE_TEST_REPORT),
      bytes = Buffer.from('{"success":false,"private":"never-public"}');
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes, { mode: 0o600 });
      const start = new Date(Date.now() - 1000).toISOString(),
        end = new Date(Date.now() + 1000).toISOString();
      expect(readCoverageTestDiagnostic(start, end, root)).toEqual(bytes);
      expect(readCoverageTestDiagnostic(start, end, root)).toEqual(bytes);
      expect(readCoverageTestDiagnostic('invalid', end, root)).toBeNull();
      expect(readCoverageTestDiagnostic(end, start, root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    'missing',
    'foreign-name',
    'stale',
    'future',
    'directory',
    'oversized',
    'leaf-link',
    'parent-link',
  ])('%s 산출물을 새 실행의 관측으로 읽지 않는다', (mode) => {
    const root = mkdtempSync(resolve(tmpdir(), 'oms-u3-diagnostic-')),
      foreign = mkdtempSync(resolve(tmpdir(), 'oms-u3-foreign-')),
      file = resolve(root, U3_COVERAGE_TEST_REPORT),
      start = new Date(Date.now() - 1000).toISOString(),
      end = new Date(Date.now() + 1000).toISOString();
    try {
      mkdirSync(dirname(file), { recursive: true });
      if (mode === 'parent-link') {
        rmSync(dirname(file), { recursive: true });
        writeFileSync(resolve(foreign, 'u3-coverage-tests.json'), '{}', { mode: 0o600 });
        symlinkSync(foreign, dirname(file), 'dir');
      } else if (mode === 'leaf-link') {
        const target = resolve(foreign, 'private.json');
        writeFileSync(target, '{}', { mode: 0o600 });
        symlinkSync(target, file);
      } else if (mode === 'directory') mkdirSync(file);
      else if (mode === 'foreign-name')
        writeFileSync(resolve(dirname(file), 'u2-coverage-tests.json'), '{}', { mode: 0o600 });
      else if (mode !== 'missing') {
        writeFileSync(file, '{}', { mode: 0o600 });
        if (mode === 'oversized') truncateSync(file, MAX_DIAGNOSTIC_REPORT_BYTES + 1);
        if (mode === 'stale' || mode === 'future') {
          const time = new Date(Date.now() + (mode === 'stale' ? -3600000 : 3600000));
          utimesSync(file, time, time);
        }
      }
      expect(readCoverageTestDiagnostic(start, end, root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(foreign, { recursive: true, force: true });
    }
  });

  it.each(['grow', 'replace'])('읽는 동안 %s된 원본 bytes를 투영하지 않는다', (mode) => {
    const root = mkdtempSync(resolve(tmpdir(), 'oms-u3-diagnostic-')),
      file = resolve(root, U3_COVERAGE_TEST_REPORT),
      originalRead = vi.mocked(readSync).getMockImplementation()!;
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, '{"before":1}', { mode: 0o600 });
      vi.mocked(readSync).mockImplementationOnce((descriptor, ...args) => {
        const length = originalRead(descriptor, ...args);
        if (mode === 'replace') rmSync(file);
        writeFileSync(file, '{"changed":123456789}', { mode: 0o600 });
        return length;
      });
      expect(
        readCoverageTestDiagnostic(
          new Date(Date.now() - 1000).toISOString(),
          new Date(Date.now() + 1000).toISOString(),
          root,
        ),
      ).toBeNull();
    } finally {
      vi.mocked(readSync).mockImplementation(originalRead);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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
