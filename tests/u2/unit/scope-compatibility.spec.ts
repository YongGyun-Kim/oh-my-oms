import { describe, it, expect } from 'vitest';
import { decodeLegacyScope, projectV2ToLegacy, scopeIncludes, scopesV2Include } from '@oms/core';
import type { ActionScope, Ref, TargetScope } from '@oms/contracts';
const r = (entity: string, id = entity): Ref => ({
  owner: 'EnterpriseAccess',
  entity,
  id,
  revision: 1,
});
const e = r('Enterprise'),
  ds = [r('Department', 'IT'), r('Department', '총무')],
  ss = [r('BusinessSite', '서울'), r('BusinessSite', '부산')];
const policy = {
  departmentUsage: 'USED' as const,
  siteUsage: 'USED' as const,
  setBy: null,
  setAt: null,
  reason: '합성',
};
const basis = { profile: 'u1:2' as const, policyRevision: 1, policy };
const make = (
  kind: ActionScope['kind'],
  departmentRefs: Ref[],
  siteRefs: Ref[],
  action = 'order.read',
): ActionScope => ({ enterpriseRef: e, action, kind, departmentRefs, siteRefs });
const target = (d: Ref | null, s: Ref | null, enterpriseRef = e): TargetScope => ({
  enterpriseRef,
  departmentRef: d,
  siteRef: s,
  organisationRevision: 1,
  contextPolicyRef: e,
});
describe('구형 다중 scope의 손실 없는 명시 변환', () => {
  it('다중 site/dept 각각을 원래 같은 행위 OR로 분해한다', () => {
    expect(decodeLegacyScope(make('SITE_ALL_DEPARTMENTS', [], ss), basis)).toHaveLength(2);
    expect(decodeLegacyScope(make('DEPARTMENT_ALL_SITES', ds, []), basis)).toHaveLength(2);
  });
  it('15행위/4kind/두기업/원래 target의 허용집합이 변환 전후 동일하다', () => {
    const actions = [
      'product.read',
      'order.read',
      'order.submit',
      'payment.read',
      'entitlement.read',
      'renewal.request',
      'autoRenewal.request',
      'autoRenewal.cancel',
      'order.change.request',
      'order.cancel.request',
      'order.return.request',
      'organisation.manage',
      'user.manage',
      'role.manage',
      'contract.change.request',
    ];
    for (const action of actions)
      for (const scope of [
        make('DEPARTMENT_SITE', [ds[0]!], [ss[0]!], action),
        make('SITE_ALL_DEPARTMENTS', [], ss, action),
        make('DEPARTMENT_ALL_SITES', ds, [], action),
        make('ENTERPRISE_ALL', [], [], action),
      ])
        for (const enterprise of [e, r('Enterprise', 'other')])
          for (const d of [...ds, null])
            for (const s of [...ss, null]) {
              const t = target(d, s, enterprise);
              expect(scopesV2Include(decodeLegacyScope(scope, basis), action, t, policy)).toBe(
                scopeIncludes(scope, action, t, policy),
              );
            }
  });
  it('미사용 empty 축은 NOT_USED로만 바꾸고 UNSET를 추정하지 않는다', () => {
    const scope = make('DEPARTMENT_SITE', [], [ss[0]!]);
    expect(
      decodeLegacyScope(scope, { ...basis, policy: { ...policy, departmentUsage: 'NOT_USED' } })[0]
        ?.departmentSelector,
    ).toEqual({ kind: 'NOT_USED' });
    expect(() =>
      decodeLegacyScope(scope, { ...basis, policy: { ...policy, departmentUsage: 'UNSET' } }),
    ).toThrow();
  });
  it('명시 원래 쌍만 남기고 bare two arrays의 곱집합은 보류한다', () => {
    const scope = make('DEPARTMENT_SITE', ds, ss);
    expect(() => decodeLegacyScope(scope, basis)).toThrow();
    const v2 = decodeLegacyScope(scope, {
      ...basis,
      profile: 'common:1',
      knownPairs: [
        { departmentRef: ds[0]!, siteRef: ss[0]! },
        { departmentRef: ds[1]!, siteRef: ss[1]! },
      ],
    });
    expect(scopesV2Include(v2, 'order.read', target(ds[0]!, ss[1]!), policy)).toBe(false);
    expect(scopesV2Include(v2, 'order.read', target(ds[1]!, ss[1]!), policy)).toBe(true);
  });
  it('원래 축에 없는 pair/잘못된 개정/profile은 거절한다', () => {
    expect(() =>
      decodeLegacyScope(make('DEPARTMENT_SITE', ds, ss), {
        ...basis,
        profile: 'common:1',
        knownPairs: [{ departmentRef: r('Department', 'other'), siteRef: ss[0]! }],
      }),
    ).toThrow();
    expect(() =>
      decodeLegacyScope(make('ENTERPRISE_ALL', [], []), { ...basis, policyRevision: 0 }),
    ).toThrow();
    expect(() =>
      decodeLegacyScope(make('ENTERPRISE_ALL', [], []), { ...basis, profile: 'unknown' as 'u1:2' }),
    ).toThrow();
  });
  it('원래 등록된 단일 술어의 구형 projection은 의미를 보존한다', () => {
    const scope = make('DEPARTMENT_SITE', [ds[0]!], [ss[0]!]);
    expect(projectV2ToLegacy(decodeLegacyScope(scope, basis)[0]!)).toEqual(scope);
  });
  it('다른 행위/기업·과거 정책 변경을 현재 target으로 교체하지 않는다', () => {
    const v2 = decodeLegacyScope(make('SITE_ALL_DEPARTMENTS', [], ss), basis);
    expect(scopesV2Include(v2, 'order.submit', target(ds[0]!, ss[0]!), policy)).toBe(false);
    expect(
      scopesV2Include(v2, 'order.read', target(ds[0]!, ss[0]!, r('Enterprise', 'other')), policy),
    ).toBe(false);
    expect(v2.every((scope) => scope.sourcePolicyRevision === 1)).toBe(true);
  });
});
