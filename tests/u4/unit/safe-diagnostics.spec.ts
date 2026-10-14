import { describe, expect, it } from 'vitest';
import { safeU4Error } from '../fixtures/safe-error.js';

describe('U4 허용 오류 진단', () => {
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
});
