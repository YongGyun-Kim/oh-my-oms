import { describe, expect, it } from 'vitest';
import { safeU4Error } from '../fixtures/safe-error.js';

describe('U4 허용 오류 진단', () => {
  it('driverError에서도 정적 SQLSTATE만 읽고 원문/임의 코드를 버린다', () => {
    expect(
      safeU4Error({
        name: 'QueryFailedError',
        driverError: { code: '55P03', message: 'synthetic-secret', detail: 'synthetic-secret' },
      }),
    ).toEqual({
      code: '55P03',
      name: 'QueryFailedError',
      locations: [],
      sqlStateFields: { code: 'MISSING', driverCode: 'STRING' },
    });
    expect(safeU4Error({ driverError: { code: 'synthetic-secret' } }).code).toBe(
      'UNCLASSIFIED_ERROR',
    );
    for (const code of ['25P02', '08P01', '42P01', '42703', '54000', '54001']) {
      const result = safeU4Error({
        name: 'QueryFailedError',
        driverError: { code, message: 'synthetic-secret', detail: 'synthetic-secret' },
      });
      expect(result.code).toBe(code);
      expect(JSON.stringify(result).includes('synthetic-secret')).toBe(false);
    }
    expect(safeU4Error({ driverError: { code: '25P02-synthetic-secret' } }).code).toBe(
      'UNCLASSIFIED_ERROR',
    );
  });
  it('DB/업무 코드만 정적 허용 목록으로 투영한다', () => {
    expect(safeU4Error({ code: '22023', name: 'QueryFailedError' }).code).toBe('22023');
    expect(safeU4Error({ code: 'arbitrary-sensitive', name: 'arbitrary-sensitive' })).toMatchObject(
      { code: 'UNCLASSIFIED_ERROR', name: 'Error' },
    );
  });
  it('메시지·SQL·매개변수·환경·임의 속성을 보존하지 않는다', () => {
    const result = JSON.stringify(
      safeU4Error({
        code: '22023',
        message: 'synthetic-secret',
        query: 'synthetic-sql',
        parameters: ['synthetic-reference'],
        env: 'synthetic-token',
        custom: 'synthetic-account',
      }),
    );
    for (const marker of [
      'synthetic-secret',
      'synthetic-sql',
      'synthetic-reference',
      'synthetic-token',
      'synthetic-account',
    ])
      expect(result.includes(marker)).toBe(false);
  });
  it('스택에서 허용 상대 파일/행/열만 추출한다', () => {
    const result = safeU4Error({
      stack:
        'Error: synthetic-reference\n at /private/synthetic/packages/persistence/src/protected-store.ts:145:7\n at /private/secret.ts:1:2',
    });
    expect(result.locations).toEqual([
      { file: 'packages/persistence/src/protected-store.ts', line: 145, column: 7 },
    ]);
    expect(JSON.stringify(result).includes('/private/')).toBe(false);
  });
  it('널·문자열 오류에 원문 없이 고정 결과를 반환한다', () => {
    for (const value of [null, undefined, 'synthetic-reference'])
      expect(safeU4Error(value)).toEqual({
        code: 'UNCLASSIFIED_ERROR',
        name: 'Error',
        locations: [],
      });
  });
  it('스택 위치 개수를 다섯 곳으로 제한한다', () => {
    const stack = Array.from(
      { length: 20 },
      (_, index) => `packages/persistence/src/protected-write.ts:${index + 1}:1`,
    ).join('\n');
    expect(safeU4Error({ stack }).locations).toHaveLength(5);
  });
  it('설치된 Vitest의 정확한120초 timeout만 분류하고 변형 원문은 버린다', () => {
    const message =
      'Test timed out in 120000ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".';
    expect(safeU4Error({ name: 'Error', message }).code).toBe('VITEST_TEST_TIMEOUT');
    for (const value of [message + 'synthetic-secret', message.replace('120000', '120001')]) {
      const result = safeU4Error({ name: 'Error', message: value });
      expect(result.code).toBe('UNCLASSIFIED_ERROR');
      expect(JSON.stringify(result).includes('timed out')).toBe(false);
      expect(JSON.stringify(result).includes('synthetic-secret')).toBe(false);
    }
    expect(safeU4Error({ name: 'OmsError', message }).code).toBe('UNCLASSIFIED_ERROR');
  });
  it('QueryFailedError의 구조화5자리 SQLSTATE와 고정 필드형식만 보존한다', () => {
    expect(
      safeU4Error({
        name: 'QueryFailedError',
        code: '25P04',
        driverError: { code: '25P04', message: 'synthetic-secret' },
      }),
    ).toMatchObject({
      code: '25P04',
      sqlStateFields: { code: 'STRING', driverCode: 'STRING' },
    });
    expect(safeU4Error({ name: 'QueryFailedError', code: null, driverError: {} })).toMatchObject({
      code: 'UNCLASSIFIED_ERROR',
      sqlStateFields: { code: 'OTHER', driverCode: 'MISSING' },
    });
    for (const code of ['25P04-secret', '25p04', '25P0', '25P040', 'synthetic-secret']) {
      const result = safeU4Error({
        name: 'QueryFailedError',
        code,
        driverError: { code, message: 'synthetic-secret', query: 'synthetic-sql' },
      });
      expect(result.code).toBe('UNCLASSIFIED_ERROR');
      expect(JSON.stringify(result).includes('synthetic-secret')).toBe(false);
      expect(JSON.stringify(result).includes('synthetic-sql')).toBe(false);
    }
    for (const name of ['Error', 'OmsError', 'synthetic-secret'])
      expect(safeU4Error({ name, code: '25P04', driverError: { code: '25P04' } })).toMatchObject({
        code: 'UNCLASSIFIED_ERROR',
      });
  });
  it('설치된 pg의 정확한 연결종료 문구만 분류하며 다른 Error나 변형문구는 버린다', () => {
    for (const message of [
      'Connection terminated',
      'Connection terminated unexpectedly',
      'Client has encountered a connection error and is not queryable',
      'Client was closed and is not queryable',
    ]) {
      expect(safeU4Error({ name: 'QueryFailedError', message }).code).toBe('PG_TRANSPORT_CLOSED');
      expect(safeU4Error({ name: 'QueryFailedError', driverError: { message } }).code).toBe(
        'PG_TRANSPORT_CLOSED',
      );
      for (const error of [
        { name: 'Error', message },
        { name: 'OmsError', driverError: { message } },
        { name: 'QueryFailedError', message: message + 'synthetic-secret' },
      ]) {
        const result = safeU4Error(error);
        expect(result.code).toBe('UNCLASSIFIED_ERROR');
        expect(JSON.stringify(result).includes('synthetic-secret')).toBe(false);
        expect(JSON.stringify(result).includes(message)).toBe(false);
      }
    }
  });
});
