import { describe, it, expect } from 'vitest';
import {
  scopeV2Includes,
  scopesV2Include,
  scopeV2WithinManagement,
  requireManagedChange,
} from '@oms/core';
import type { Ref, ScopeV2, TargetScope } from '@oms/contracts';
const r = (entity: string, id = entity): Ref => ({
  owner: 'EnterpriseAccess',
  entity,
  id,
  revision: 1,
});
const enterprise = r('Enterprise'),
  d = r('Department', 'IT'),
  s = r('BusinessSite', '서울');
const target: TargetScope = {
  enterpriseRef: enterprise,
  departmentRef: d,
  siteRef: s,
  contextPolicyRef: enterprise,
  organisationRevision: 1,
};
const policy = {
  departmentUsage: 'USED' as const,
  siteUsage: 'USED' as const,
  setBy: null,
  setAt: null,
  reason: '합성',
};
const scope: ScopeV2 = {
  enterpriseRef: enterprise,
  action: 'order.read',
  kind: 'DEPARTMENT_SITE',
  departmentSelector: { kind: 'EXACT', ref: d },
  siteSelector: { kind: 'EXACT', ref: s },
  sourcePolicyRevision: 1,
};
describe('행위별 한 완성 술어의 OR', () => {
  it('동일 기업/행위/두 exact 축만 허용한다', () => {
    expect(scopeV2Includes(scope, 'order.read', target, policy)).toBe(true);
    expect(scopeV2Includes(scope, 'order.submit', target, policy)).toBe(false);
    expect(
      scopeV2Includes(
        scope,
        'order.read',
        { ...target, enterpriseRef: r('Enterprise', 'other') },
        policy,
      ),
    ).toBe(false);
  });
  it('네 kind의 명시 범위를 대조한다', () => {
    for (const candidate of [
      scope,
      { ...scope, kind: 'SITE_ALL_DEPARTMENTS', departmentSelector: { kind: 'ALL' } },
      { ...scope, kind: 'DEPARTMENT_ALL_SITES', siteSelector: { kind: 'ALL' } },
      {
        ...scope,
        kind: 'ENTERPRISE_ALL',
        departmentSelector: { kind: 'ALL' },
        siteSelector: { kind: 'ALL' },
      },
    ] as ScopeV2[])
      expect(scopeV2Includes(candidate, 'order.read', target, policy)).toBe(true);
  });
  it('서로 다른 행의 두 축을 조합하지 않는다', () => {
    const second = {
      ...scope,
      departmentSelector: { kind: 'EXACT' as const, ref: r('Department', '총무') },
      siteSelector: { kind: 'EXACT' as const, ref: r('BusinessSite', '부산') },
    };
    expect(
      scopesV2Include(
        [scope, second],
        'order.read',
        { ...target, siteRef: r('BusinessSite', '부산') },
        policy,
      ),
    ).toBe(false);
    expect(
      scopesV2Include(
        [scope, second],
        'order.read',
        { ...target, departmentRef: r('Department', '총무'), siteRef: r('BusinessSite', '부산') },
        policy,
      ),
    ).toBe(true);
  });
  it('NOT_USED는 실제 미사용 정책/빈 target과만 맞는다', () => {
    const unused = { ...scope, departmentSelector: { kind: 'NOT_USED' as const } },
      t = { ...target, departmentRef: null };
    expect(
      scopeV2Includes(unused, 'order.read', t, { ...policy, departmentUsage: 'NOT_USED' }),
    ).toBe(true);
    for (const usage of ['UNSET', 'USED'] as const)
      expect(scopeV2Includes(unused, 'order.read', t, { ...policy, departmentUsage: usage })).toBe(
        false,
      );
  });
  it('UNSET는 업무로 허용하지 않고 명시 기업관리만 조직 초기화할 수 있다', () => {
    const all = {
        ...scope,
        kind: 'ENTERPRISE_ALL' as const,
        departmentSelector: { kind: 'ALL' as const },
        siteSelector: { kind: 'ALL' as const },
      },
      unset = { ...policy, departmentUsage: 'UNSET' as const };
    expect(scopeV2Includes(all, 'order.read', target, unset)).toBe(false);
    expect(
      scopeV2Includes(
        { ...all, action: 'organisation.manage' },
        'organisation.manage',
        target,
        unset,
        'MANAGEMENT',
      ),
    ).toBe(true);
  });
  it('과거 target의 stable 조직 ID를 새 소속/다른 ID로 바꾸지 않는다', () => {
    expect(scopeV2Includes(scope, 'order.read', target, policy, 'HISTORICAL')).toBe(true);
    expect(
      scopeV2Includes(
        scope,
        'order.read',
        { ...target, departmentRef: r('Department', '새IT') },
        policy,
        'HISTORICAL',
      ),
    ).toBe(false);
  });
  it('명시 관리 범위에 포함된 역할은 거래 권한과 별도로 위임 가능하다', () => {
    const management = { ...scope, action: 'role.manage' };
    expect(scopeV2WithinManagement(scope, [management], 'role.manage')).toBe(true);
    expect(() =>
      requireManagedChange([management], 'role.manage', target, target, policy, [scope]),
    ).not.toThrow();
    expect(() =>
      requireManagedChange(
        [management],
        'role.manage',
        { ...target, siteRef: r('BusinessSite', '부산') },
        target,
        policy,
        [scope],
      ),
    ).toThrow();
    expect(
      scopeV2WithinManagement(
        { ...scope, siteSelector: { kind: 'EXACT', ref: r('BusinessSite', '부산') } },
        [management],
        'role.manage',
      ),
    ).toBe(false);
  });
  it('첫 allow 뒤의 미등록 predicate도 검사하며 잘못된 축 owner/무제한 목록을 거절한다', () => {
    expect(() =>
      scopesV2Include(
        [scope, { ...scope, action: 'system' as ScopeV2['action'] }],
        'order.read',
        target,
        policy,
      ),
    ).toThrow();
    expect(() =>
      scopeV2Includes(
        {
          ...scope,
          departmentSelector: { kind: 'EXACT', ref: { ...d, owner: 'IdentityRecovery' } },
        },
        'order.read',
        target,
        policy,
      ),
    ).toThrow();
    expect(() =>
      scopesV2Include(
        Array.from({ length: 201 }, () => scope),
        'order.read',
        target,
        policy,
      ),
    ).toThrow();
  });
});
