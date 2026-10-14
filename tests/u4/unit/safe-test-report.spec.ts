import { describe, expect, it } from 'vitest';
import { safeU4TestReport } from '../fixtures/safe-test-report.js';

const moduleResult = (
  states = ['passed'],
  collectionErrors: unknown[] = [],
  assertionErrors: unknown[] = [],
) => ({
  relativeModuleId: 'tests/u4/unit/synthetic.spec.ts',
  state: () => 'passed',
  errors: () => collectionErrors,
  children: {
    allTests: () => states.map((state) => ({ result: () => ({ state, errors: assertionErrors }) })),
  },
});

describe('U4 전체 종료 결과의 안전한 보고', () => {
  it('오류와 미실행이 없는 실제 완료 집계만 성공으로 투영한다', () => {
    expect(safeU4TestReport([moduleResult(['passed', 'passed'])], [], 'passed')).toMatchObject({
      success: true,
      numPassedTests: 2,
      numPendingTests: 0,
      numUnhandledErrors: 0,
    });
  });
  it('전역 unhandled 오류는 suite가 통과해도 실패이며 원문 없이 세 개만 투영한다', () => {
    const errors = Array.from({ length: 5 }, () => ({
      code: '23503',
      name: 'QueryFailedError',
      message: 'synthetic-account',
      query: 'synthetic-query',
      parameters: ['synthetic-transaction'],
    }));
    const report = safeU4TestReport([moduleResult()], errors, 'passed');
    expect(report.success).toBe(false);
    expect(report.numUnhandledErrors).toBe(5);
    expect(report.unhandledErrors).toHaveLength(3);
    expect(report.unhandledErrors[0]?.code).toBe('23503');
    for (const value of ['synthetic-account', 'synthetic-query', 'synthetic-transaction'])
      expect(JSON.stringify(report).includes(value)).toBe(false);
  });
  it('중단과 실패 종료 이유를 완료된 assertion만으로 덮어쓰지 않는다', () => {
    for (const reason of ['interrupted', 'failed'] as const)
      expect(safeU4TestReport([moduleResult()], [], reason)).toMatchObject({
        success: false,
        runReason: reason,
      });
  });
  it('필터·skip·pending이 있으면 전체 성공으로 표시하지 않는다', () => {
    for (const state of ['skipped', 'pending'])
      expect(safeU4TestReport([moduleResult(['passed', state])], [], 'passed')).toMatchObject({
        success: false,
        numPassedTests: 1,
        numPendingTests: 1,
      });
  });
  it('빈 실행과 assertion이 없는 suite는 성공이 아니다', () => {
    expect(safeU4TestReport([], [], 'passed').success).toBe(false);
    expect(safeU4TestReport([moduleResult([])], [], 'passed').success).toBe(false);
    expect(safeU4TestReport([moduleResult(), moduleResult([])], [], 'passed').success).toBe(false);
  });
  it('collection 오류와 실패 assertion을 별도로 집계하고 원문을 버린다', () => {
    const report = safeU4TestReport(
      [
        moduleResult(
          ['failed'],
          [{ message: 'synthetic-collection-secret' }],
          [{ name: 'AssertionError', message: 'synthetic-assertion-secret' }],
        ),
      ],
      [],
      'failed',
    );
    expect(report).toMatchObject({
      success: false,
      numCollectionErrors: 1,
      numAssertionErrors: 1,
      numFailedTests: 1,
    });
    expect(JSON.stringify(report).includes('synthetic-collection-secret')).toBe(false);
    expect(JSON.stringify(report).includes('synthetic-assertion-secret')).toBe(false);
  });
  it('재시도 후 passed에 남은 최초 오류를 누락하거나 전체 성공으로 바꾸지 않는다', () => {
    const report = safeU4TestReport(
      [moduleResult(['passed'], [], [{ name: 'AssertionError' }])],
      [],
      'passed',
    );
    expect(report).toMatchObject({ success: false, numPassedTests: 1, numAssertionErrors: 1 });
  });
});
