import { describe, expect, it, vi } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import { Authorization } from '@oms/core';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { U3_SOURCE_CONTRACT } from '@oms/persistence';
import { fixtureRef } from '../fixtures/identity.js';

const original: ModelData = {
  roleId: 'role',
  enterpriseRef: fixtureRef('EnterpriseAccess', 'Enterprise'),
  label: '구형 역할',
  actionScopeRefs: [],
  revision: 1,
};
const next: ModelData = { ...original, revision: 2 };
function fixture(
  data = next,
  current = data,
  before: ModelData | null = original,
  wrapperVersion = 1,
) {
  const host = {
    schema: new SchemaValidator(),
    primary: { query: vi.fn().mockResolvedValue([]) },
    list: vi.fn().mockResolvedValue([]),
    currentProtected: vi.fn().mockResolvedValue(before),
  };
  const transaction = {
    get: vi.fn().mockResolvedValue(current),
    rows: () => [
      {
        model: 'CustomerRole',
        id: 'role',
        data,
        revision: 2,
        schemaVersion: wrapperVersion,
        deleted: false,
      },
    ],
  } as unknown as ProtectedTransaction;
  return {
    authorization: new Authorization(host as unknown as ProtectedStore, () => new Date()),
    transaction,
    host,
  };
}
describe('현재 역할 profile의 검증된 자체 transaction 쓰기', () => {
  it('구형 단일 개정 after-image만 허용하며 새 동의 상태를 추정하지 않는다', async () => {
    const { authorization, transaction } = fixture();
    expect(await authorization.currentRoleState('CustomerRole', 'role', transaction)).toBeNull();
  });
  it.each([
    { name: '무보호 원상', before: null },
    { name: '미등록 실제 변경', current: { ...next, label: '원래 계획과 다른 값' } },
    {
      name: '다른 기업',
      data: { ...next, enterpriseRef: fixtureRef('EnterpriseAccess', 'Enterprise', 'other') },
    },
    { name: '다른 식별자', data: { ...next, roleId: 'other' } },
    { name: '추가 개정 증가', data: { ...next, revision: 3 } },
    { name: 'wrapper downgrade/혼합', wrapperVersion: 2 },
    { name: '구형 원본에 새 metadata', data: { ...next, sourceContract: U3_SOURCE_CONTRACT } },
  ])(
    '$name는 자체 변경이라는 이유로 보호 대조를 생략하지 않는다',
    async ({ data = next, current = data, before = original, wrapperVersion = 1 }) => {
      const { authorization, transaction } = fixture(data, current, before, wrapperVersion);
      await expect(
        authorization.currentRoleState('CustomerRole', 'role', transaction),
      ).rejects.toThrow();
    },
  );
  it('자체 쓰기가 없으면 원래 전체 lookup 대조를 유지한다', async () => {
    const { authorization, transaction } = fixture();
    vi.spyOn(transaction, 'rows').mockReturnValue([]);
    await expect(
      authorization.currentRoleState('CustomerRole', 'role', transaction),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
});
