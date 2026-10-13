import { describe, expect, it, vi } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import { Authorization } from '@oms/core';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { U3_SOURCE_CONTRACT } from '@oms/persistence';
import { fixtureRef } from '../fixtures/identity.js';
import { SyntheticModelStore } from '../../u2/fixtures/identity.js';

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

function staffFixture() {
  const source = new SyntheticModelStore(),
    accountRef = fixtureRef('IdentityRecovery', 'Account', 'issuer'),
    roleRef = fixtureRef('EnterpriseAccess', 'StaffRole', 'staff-role'),
    role: ModelData = {
      staffRoleId: roleRef.id,
      label: '합성 직원 역할',
      actions: [],
      revision: 1,
      modelVersion: 2,
      sourceContract: U3_SOURCE_CONTRACT,
    },
    state: ModelData = {
      roleStateId: 'staff-state',
      staffRoleRef: roleRef,
      roleRef: null,
      active: true,
      actions: ['contract.approve'],
      scopeRefs: [],
      revision: 1,
      modelVersion: 2,
      sourceContract: U3_SOURCE_CONTRACT,
    },
    grant: ModelData = {
      staffGrantId: 'staff-grant',
      accountRef,
      roleRef,
      effectiveFrom: '2026-10-01T00:00:00.000Z',
      revokedAt: null,
      revision: 1,
    };
  source.fixture('Account', { accountId: accountRef.id, active: true, revision: 1 });
  source.fixture('ProviderBinding', {
    bindingId: 'issuer-binding',
    accountRef,
    audience: 'STAFF',
    active: true,
    generation: 1,
    authRevision: 1,
    revision: 1,
  });
  source.fixture('StaffRole', role);
  source.fixture('RoleRevisionState', state);
  source.fixture('StaffRoleGrant', grant);
  const transaction = {
    get: vi.fn(async (model: string, id: string) => source.rawRows.get(model)?.get(id) ?? null),
    rows: () => [],
  } as unknown as ProtectedTransaction;
  return {
    source,
    role,
    state,
    grant,
    accountRef,
    transaction,
    authorization: new Authorization(source.asStore(), () => new Date('2026-10-12T00:00:00Z')),
  };
}

describe('직원 확인 원본의 같은 검사 내 역할 대조', () => {
  it('정확한 model2 역할/상태로 허용하지만 다른 행위나 다른 직원은 허용하지 않는다', async () => {
    const f = staffFixture();
    await expect(
      f.authorization.requireStaffSource(f.accountRef, 'contract.approve', f.transaction),
    ).resolves.toBeUndefined();
    await expect(
      f.authorization.requireStaffSource(f.accountRef, 'contract.propose', f.transaction),
    ).rejects.toMatchObject({ code: 'ISSUER_AUTHORITY' });
    await expect(
      f.authorization.requireStaffSource(
        fixtureRef('IdentityRecovery', 'Account', 'other-issuer'),
        'contract.approve',
        f.transaction,
      ),
    ).rejects.toMatchObject({ code: 'ISSUER_AUTHORITY' });
  });
  it.each(['StaffRole', 'RoleRevisionState', 'StaffRoleGrant'])(
    '%s의 primary-only 전체 이미지 변경은 현재 권위가 아니다',
    async (model) => {
      const f = staffFixture(),
        value = model === 'StaffRole' ? f.role : model === 'RoleRevisionState' ? f.state : f.grant;
      f.source.fixture(model, { ...value, revision: 2 }, false);
      await expect(
        f.authorization.requireStaffSource(f.accountRef, 'contract.approve', f.transaction),
      ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    },
  );
  it.each([
    { name: '다른 역할 대상', staffRoleRef: fixtureRef('EnterpriseAccess', 'StaffRole', 'other') },
    {
      name: '다른 역할 개정',
      staffRoleRef: { ...fixtureRef('EnterpriseAccess', 'StaffRole', 'staff-role'), revision: 2 },
    },
    { name: '구형 상태', modelVersion: undefined, sourceContract: undefined },
    { name: '다른 profile', sourceContract: { ...U3_SOURCE_CONTRACT, registryVersion: 2 } },
  ])('$name를 현재 역할과 혼합하지 않는다', async (change) => {
    const f = staffFixture();
    const changed: ModelData = { ...f.state, ...change };
    delete changed.name;
    f.source.fixture('RoleRevisionState', changed);
    await expect(
      f.authorization.requireStaffSource(f.accountRef, 'contract.approve', f.transaction),
    ).rejects.toThrow();
  });
  it('허용 grant를 찾은 뒤에도 뒤쪽 grant의 미보호 역할을 검사한다', async () => {
    const f = staffFixture(),
      secondRole = { ...f.role, staffRoleId: 'second-role' };
    f.source.fixture('StaffRole', secondRole);
    f.source.fixture('StaffRoleGrant', {
      ...f.grant,
      staffGrantId: 'second-grant',
      roleRef: fixtureRef('EnterpriseAccess', 'StaffRole', 'second-role'),
    });
    f.source.fixture('StaffRole', { ...secondRole, revision: 2 }, false);
    await expect(
      f.authorization.requireStaffSource(f.accountRef, 'contract.approve', f.transaction),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
  it('다음 검사에서 보호된 역할 비활성화/부여 회수를 다시 확인한다', async () => {
    const f = staffFixture();
    await f.authorization.requireStaffSource(f.accountRef, 'contract.approve', f.transaction);
    f.source.fixture('RoleRevisionState', { ...f.state, revision: 2, active: false });
    await expect(
      f.authorization.requireStaffSource(f.accountRef, 'contract.approve', f.transaction),
    ).rejects.toMatchObject({ code: 'ISSUER_AUTHORITY' });
    f.source.fixture('RoleRevisionState', { ...f.state, revision: 3 });
    f.source.fixture('StaffRoleGrant', {
      ...f.grant,
      revision: 2,
      revokedAt: '2026-10-12T00:00:00Z',
    });
    await expect(
      f.authorization.requireStaffSource(f.accountRef, 'contract.approve', f.transaction),
    ).rejects.toMatchObject({ code: 'ISSUER_AUTHORITY' });
  });
  it('공개 3인수 상태 조회는 이전 직원 확인 결과를 재사용하지 않는다', async () => {
    const f = staffFixture();
    await f.authorization.requireStaffSource(f.accountRef, 'contract.approve', f.transaction);
    f.source.fixture('StaffRole', { ...f.role, label: '후단 원상 변조' }, false);
    await expect(
      f.authorization.currentRoleState('StaffRole', String(f.role.staffRoleId), f.transaction),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
});
