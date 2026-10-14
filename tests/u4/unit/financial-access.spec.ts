import { describe, expect, it } from 'vitest';
import { QueryFailedError } from 'typeorm';
import { OmsError } from '@oms/contracts';
import { u4FinancialMutationError } from '../../../packages/core/src/u4-financial-access.js';

const databaseError = (code: string) =>
  new QueryFailedError(
    'synthetic-sql',
    ['synthetic-reference'],
    Object.assign(new Error('synthetic-secret'), { code, detail: 'synthetic-account' }),
  );
describe('금융의 닫힌 DB 진입 경합 오류 경계', () => {
  it('실제 TypeORM55P03만 안전한503 BUSY/원래 결과 확인으로 분류한다', () => {
    const result = u4FinancialMutationError(databaseError('55P03'));
    expect(result).toBeInstanceOf(OmsError);
    expect(result).toMatchObject({ status: 503, code: 'U4_FINANCIAL_BUSY' });
  });
  it('입력의 code/name 위장으로 DB 오류 분류를 획득하지 못한다', () => {
    const error = { code: '55P03', name: 'QueryFailedError', driverError: { code: '55P03' } };
    expect(u4FinancialMutationError(error)).toBe(error);
  });
  it('유일성·직렬화·statement timeout 등 다른 DB 원인을 BUSY로 삼키지 않는다', () => {
    for (const code of ['23505', '40001', '57014']) {
      const error = databaseError(code);
      expect(u4FinancialMutationError(error)).toBe(error);
    }
  });
  it('이미 분류한 현재 권한/원본/잔여 한도 오류는 그대로 보존한다', () => {
    const error = new OmsError(409, 'U4_PAYMENT_LIMIT', '현재 잔여액을 확인하세요.');
    expect(u4FinancialMutationError(error)).toBe(error);
    expect(u4FinancialMutationError(null)).toBeNull();
  });
  it('BUSY 응답 오류에 SQL·매개변수·driver 원문·cause를 붙이지 않는다', () => {
    const result = u4FinancialMutationError(databaseError('55P03')) as OmsError;
    expect(Object.keys(result).sort()).toEqual(['code', 'name', 'status']);
    for (const marker of [
      'synthetic-sql',
      'synthetic-reference',
      'synthetic-secret',
      'synthetic-account',
    ])
      expect(JSON.stringify(result).includes(marker)).toBe(false);
    expect(result).not.toHaveProperty('driverError');
    expect(result).not.toHaveProperty('cause');
  });
});
