import { describe, expect, it } from 'vitest';
import { canonicalSecurityData, recoverySecurityChangeAllowed } from '@oms/persistence';
describe('현재보안재구성은원래연결/역할을유지하고회수/단회사용만반영한다', () => {
  it('Account비활성/개정은허용하지만복구로재활성화하거나타계정연결은못한다', () => {
    const old = { accountId: 'original', active: true, revision: 1 };
    expect(
      recoverySecurityChangeAllowed('Account', old, { ...old, active: false, revision: 2 }),
    ).toBe(true);
    expect(
      recoverySecurityChangeAllowed('Account', { ...old, active: false }, { ...old, revision: 2 }),
    ).toBe(false);
    expect(
      recoverySecurityChangeAllowed('Account', old, { ...old, accountId: 'other', revision: 2 }),
    ).toBe(false);
  });
  it('소속/관리자회수는허용하고새활성/관리자확대와부서이동은별도owner판단이다', () => {
    const old = {
      membershipId: 'original',
      active: true,
      administrator: true,
      departmentRef: null,
    };
    expect(
      recoverySecurityChangeAllowed('EnterpriseMembership', old, {
        ...old,
        active: false,
        administrator: false,
      }),
    ).toBe(true);
    expect(
      recoverySecurityChangeAllowed('EnterpriseMembership', { ...old, administrator: false }, old),
    ).toBe(false);
    expect(
      recoverySecurityChangeAllowed('EnterpriseMembership', old, {
        ...old,
        departmentRef: { id: 'different' },
      }),
    ).toBe(false);
  });
  it('기업이용회수/조건부거절은허용하지만새승인/조직정책확대는허용하지않는다', () => {
    const old = {
      enterpriseId: 'original',
      usageEnabled: true,
      approvalState: 'APPROVED',
      orderingContextPolicy: { departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
    };
    expect(
      recoverySecurityChangeAllowed('Enterprise', old, {
        ...old,
        usageEnabled: false,
        approvalState: 'DECLINED',
      }),
    ).toBe(true);
    expect(recoverySecurityChangeAllowed('Enterprise', { ...old, usageEnabled: false }, old)).toBe(
      false,
    );
    expect(
      recoverySecurityChangeAllowed('Enterprise', old, {
        ...old,
        orderingContextPolicy: { departmentUsage: 'USED', siteUsage: 'USED' },
      }),
    ).toBe(false);
  });
  it('직원/고객grant회수는반영하고회수취소/역할대체는복구로승인하지않는다', () => {
    for (const model of ['CustomerRoleGrant', 'StaffRoleGrant']) {
      const old = { revokedAt: null, roleRef: { id: 'original', revision: 1 } };
      expect(
        recoverySecurityChangeAllowed(model, old, { ...old, revokedAt: '2026-10-09T00:00:00Z' }),
      ).toBe(true);
      expect(
        recoverySecurityChangeAllowed(model, { ...old, revokedAt: '2026-10-09T00:00:00Z' }, old),
      ).toBe(false);
      expect(
        recoverySecurityChangeAllowed(model, old, {
          ...old,
          roleRef: { id: 'other', revision: 1 },
        }),
      ).toBe(false);
    }
  });
  it('MFA미완료를VERIFIED로올리지않고관측된수단무효화만반영한다', () => {
    const old = { state: 'VERIFIED', accountRef: { id: 'original' } };
    expect(
      recoverySecurityChangeAllowed('MfaEnrollment', old, { ...old, state: 'INVALIDATED' }),
    ).toBe(true);
    expect(recoverySecurityChangeAllowed('MfaEnrollment', { ...old, state: 'PENDING' }, old)).toBe(
      false,
    );
  });
  it('제공자세대회수는단조이며발급자/계정대체와재활성화를허용하지않는다', () => {
    const old = {
      bindingId: 'original',
      issuer: 'original-issuer',
      subject: 'original',
      generation: 2,
      authRevision: 3,
      active: true,
    };
    expect(
      recoverySecurityChangeAllowed('ProviderBinding', old, {
        ...old,
        active: false,
        authRevision: 4,
      }),
    ).toBe(true);
    for (const change of [{ subject: 'other' }, { generation: 1 }, { authRevision: 2 }])
      expect(recoverySecurityChangeAllowed('ProviderBinding', old, { ...old, ...change })).toBe(
        false,
      );
  });
  it('복구코드검증값/사용/폐기를되살리거나등록보관확인을조작하지않는다', () => {
    const old = {
      confirmed: true,
      invalidated: false,
      verifiers: [{ digest: 'original', usedAt: null }],
    };
    expect(
      recoverySecurityChangeAllowed('RecoveryCodeSet', old, {
        ...old,
        invalidated: true,
        verifiers: [{ digest: 'original', usedAt: '2026-10-09T00:00:00Z' }],
      }),
    ).toBe(true);
    expect(
      recoverySecurityChangeAllowed('RecoveryCodeSet', { ...old, invalidated: true }, old),
    ).toBe(false);
    expect(
      recoverySecurityChangeAllowed('RecoveryCodeSet', old, {
        ...old,
        verifiers: [{ digest: 'different', usedAt: null }],
      }),
    ).toBe(false);
    expect(
      recoverySecurityChangeAllowed('RecoveryCodeSet', { ...old, confirmed: false }, old),
    ).toBe(false);
  });
  it('역할행위/범위/동일인연결은개정외변경을확대하지않고nullable투영을일치시킨다', () => {
    expect(
      recoverySecurityChangeAllowed(
        'StaffRole',
        { actions: ['read'] },
        { actions: ['read', 'write'] },
      ),
    ).toBe(false);
    expect(
      recoverySecurityChangeAllowed(
        'ActionScope',
        { departmentRefs: [] },
        { departmentRefs: [{ id: 'new' }] },
      ),
    ).toBe(false);
    expect(recoverySecurityChangeAllowed('UnknownModel', {}, {})).toBe(false);
    expect(
      canonicalSecurityData('Account', {
        accountId: 'original',
        active: true,
        revision: 1,
        extra: 'notregistered',
      }),
    ).not.toHaveProperty('extra');
  });
});
