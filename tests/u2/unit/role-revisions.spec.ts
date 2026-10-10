import { describe, it, expect } from 'vitest';
import { currentRolePredicates } from '@oms/core';
import type { EnterpriseAccess } from '@oms/core';
import type { Ref, ScopeV2 } from '@oms/contracts';
const r = (entity: string, id = entity): Ref => ({
  owner: 'EnterpriseAccess',
  entity,
  id,
  revision: 1,
});
const predicate: ScopeV2 = {
  enterpriseRef: r('Enterprise'),
  action: 'order.read',
  kind: 'ENTERPRISE_ALL',
  departmentSelector: { kind: 'ALL' },
  siteSelector: { kind: 'ALL' },
  sourcePolicyRevision: 1,
};
const role = {
  roleId: 'role',
  enterpriseRef: r('Enterprise'),
  actionScopeRefs: [r('ActionScope')],
  revision: 1,
};
function fixture(
  state: unknown = null,
  scope: unknown = { predicate, revision: 1 },
  origin: unknown = {
    revision: 1,
    orderingContextPolicy: { departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
  },
  legacy: unknown = { ...predicate, departmentRefs: [], siteRefs: [] },
) {
  return {
    authorization: {
      currentRoleState: async () => state,
      lookup: async (model: string) => (model === 'ScopeV2' ? scope : legacy),
    },
    store: { readRevision: async () => origin },
  } as unknown as EnterpriseAccess;
}
describe('역할 전체의 원래 scope 원본 해석', () => {
  it('명시 U2 state를 기준으로 단일 완성 술어를 읽는다', async () =>
    expect(await currentRolePredicates(fixture({ scopeRefs: [r('ScopeV2')] }), role)).toEqual([
      predicate,
    ]));
  it('inactive state도 개정 전 관리 대상 전체 술어를 유지한다', async () =>
    expect(
      await currentRolePredicates(fixture({ active: false, scopeRefs: [r('ScopeV2')] }), role),
    ).toEqual([predicate]));
  it('빈 U2 scope는 legacy 거래 권한으로 fallback하지 않는다', async () =>
    expect(await currentRolePredicates(fixture({ scopeRefs: [] }), role)).toEqual([]));
  it('없거나 stale인 새 scope 원본을 거절한다', async () => {
    for (const scope of [null, { predicate, revision: 2 }])
      await expect(
        currentRolePredicates(fixture({ scopeRefs: [r('ScopeV2')] }, scope), role),
      ).rejects.toMatchObject({ code: 'SCOPE_REVISION' });
  });
  it('원래 legacy policy revision을 사용한다', async () =>
    expect(await currentRolePredicates(fixture(), role)).toEqual([predicate]));
  it('원래 policy가 없으면 최신 policy를 추측하지 않는다', async () => {
    await expect(currentRolePredicates(fixture(null, undefined, null), role)).rejects.toMatchObject(
      { code: 'LEGACY_SCOPE_POLICY' },
    );
  });
  it('원래 legacy scope 누락은 empty allow로 대체하지 않는다', async () => {
    await expect(
      currentRolePredicates(fixture(null, undefined, undefined, null), role),
    ).rejects.toMatchObject({ code: 'SCOPE_REQUIRED' });
  });
  it('등록되지 않은 U2 행위/축은 decoder에서 닫는다', async () => {
    await expect(
      currentRolePredicates(
        fixture(
          { scopeRefs: [r('ScopeV2')] },
          { predicate: { ...predicate, action: 'root.*' }, revision: 1 },
        ),
        role,
      ),
    ).rejects.toThrow();
  });
});
