import { describe, expect, it } from 'vitest';
import { scopeIncludes, validateActionScope, STAFF_ACTIONS } from '@oms/core';
import type { ActionScope, Ref, TargetScope } from '@oms/contracts';
const enterprise: Ref = { owner: 'EnterpriseAccess', entity: 'Enterprise', id: 'A', revision: 1 };
const d = (id: string): Ref => ({
  owner: 'EnterpriseAccess',
  entity: 'Department',
  id,
  revision: 1,
});
const s = (id: string): Ref => ({
  owner: 'EnterpriseAccess',
  entity: 'BusinessSite',
  id,
  revision: 1,
});
const target = (departmentRef: Ref | null, siteRef: Ref | null): TargetScope => ({
  enterpriseRef: enterprise,
  contextPolicyRef: enterprise,
  organisationRevision: 1,
  departmentRef,
  siteRef,
});
const policy = {
  departmentUsage: 'USED' as const,
  siteUsage: 'USED' as const,
  setBy: null,
  setAt: null,
  reason: '합성',
};
const scope = (
  kind: ActionScope['kind'],
  departmentRefs: Ref[],
  siteRefs: Ref[],
  action = 'order.read',
): ActionScope => ({ enterpriseRef: enterprise, kind, departmentRefs, siteRefs, action });
describe('완성된 행위 scope만 합집합', () => {
  it('한 scope의 정확한 두 축만 허용한다', () => {
    expect(
      scopeIncludes(
        scope('DEPARTMENT_SITE', [d('IT')], [s('SEOUL')]),
        'order.read',
        target(d('IT'), s('SEOUL')),
        policy,
      ),
    ).toBe(true);
  });
  it('서로 다른 scope의 Cartesian 조합을 만들지 않는다', () => {
    const scopes = [
      scope('DEPARTMENT_SITE', [d('IT')], [s('SEOUL')]),
      scope('DEPARTMENT_SITE', [d('GA')], [s('BUSAN')]),
    ];
    expect(
      scopes.some((value) =>
        scopeIncludes(value, 'order.read', target(d('IT'), s('BUSAN')), policy),
      ),
    ).toBe(false);
  });
  it('다른 행위나 기업의 넓은 범위를 가져오지 않는다', () => {
    expect(
      scopeIncludes(
        scope('ENTERPRISE_ALL', [], []),
        'order.submit',
        target(d('IT'), s('SEOUL')),
        policy,
      ),
    ).toBe(false);
    expect(
      scopeIncludes(
        { ...scope('ENTERPRISE_ALL', [], []), enterpriseRef: { ...enterprise, id: 'B' } },
        'order.read',
        target(null, null),
        policy,
      ),
    ).toBe(false);
  });
  it('빈 축은 NOT_USED의 정확한NULL만 의미한다', () => {
    const value = scope('DEPARTMENT_SITE', [], []);
    expect(scopeIncludes(value, 'order.read', target(null, null), policy)).toBe(false);
    expect(
      scopeIncludes(value, 'order.read', target(null, null), {
        ...policy,
        departmentUsage: 'NOT_USED',
        siteUsage: 'NOT_USED',
      }),
    ).toBe(true);
    expect(
      scopeIncludes(value, 'order.read', target(d('IT'), null), {
        ...policy,
        departmentUsage: 'NOT_USED',
        siteUsage: 'NOT_USED',
      }),
    ).toBe(false);
  });
  it('명시적 all axis는 선택한 다른 축만 허용한다', () => {
    expect(
      scopeIncludes(
        scope('SITE_ALL_DEPARTMENTS', [], [s('SEOUL')]),
        'order.read',
        target(d('ANY'), s('SEOUL')),
        policy,
      ),
    ).toBe(true);
    expect(
      scopeIncludes(
        scope('DEPARTMENT_ALL_SITES', [d('IT')], []),
        'order.read',
        target(d('IT'), s('ANY')),
        policy,
      ),
    ).toBe(true);
  });
  it('잘못된 axis/조직 종류/미등록 action은 거절한다', () => {
    for (const value of [
      scope('ENTERPRISE_ALL', [d('IT')], []),
      scope('SITE_ALL_DEPARTMENTS', [], []),
      scope('DEPARTMENT_ALL_SITES', [], []),
      scope('DEPARTMENT_SITE', [d('IT'), d('GA')], []),
      scope('DEPARTMENT_SITE', [s('wrong')], []),
      scope('ENTERPRISE_ALL', [], [], 'staff.role.manage'),
    ])
      expect(() => validateActionScope(value)).toThrow();
  });
  it('직원 승인과 최초 지정·상품 등록은 서로 다른 registry actions이다', () => {
    expect(new Set(STAFF_ACTIONS).size).toBe(9);
    expect(STAFF_ACTIONS).toContain('enterprise.approve');
    expect(STAFF_ACTIONS).toContain('enterprise.initial-administrator.designate');
  });
  it('폐지 조직의 기존 안정ID 접근은 action 범위에 남길 수 있다', () => {
    expect(
      scopeIncludes(
        scope('DEPARTMENT_SITE', [d('retired')], [s('old')]),
        'order.read',
        target(d('retired'), s('old')),
        policy,
      ),
    ).toBe(true);
  });
});
