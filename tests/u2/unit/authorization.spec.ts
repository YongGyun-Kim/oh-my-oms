import { beforeEach, describe, expect, it } from 'vitest';
import { Authorization } from '@oms/core';
import type { ServiceContext, Ref } from '@oms/contracts';
import { ExecutionBudget } from '@oms/contracts';
import { SyntheticModelStore } from '../fixtures/identity.js';
const now = new Date('2026-10-09T00:00:00Z'),
  r = (entity: string, id = entity): Ref => ({
    owner: entity.startsWith('Staff') ? 'EnterpriseAccess' : 'IdentityRecovery',
    entity,
    id,
    revision: 1,
  });
describe('현재 역할 상태와 실제 신원 판정의 부정 경계', () => {
  let source: SyntheticModelStore, authorization: Authorization;
  const context: ServiceContext = {
    principalId: 'Account',
    actorAccountRef: r('Account'),
    verifiedPersonRef: null,
    identityAssertionRef: r('IdentitySession'),
    audience: 'STAFF',
    accessEvaluationRef: null,
    executionPermitRef: null,
    correlationId: 'trace-fixture',
    deadlineAt: new Date(now.getTime() + 10000).toISOString(),
  };
  beforeEach(() => {
    source = new SyntheticModelStore();
    authorization = new Authorization(source.asStore(), () => now);
    source.fixture('Account', { accountId: 'Account', active: true, revision: 1 });
    source.fixture('IdentitySession', {
      sessionId: 'IdentitySession',
      accountRef: r('Account'),
      audience: 'STAFF',
      phase: 'MFA_VERIFIED',
      purpose: null,
      issuedAt: now.toISOString(),
      lastActiveAt: now.toISOString(),
      deadlineAt: new Date(now.getTime() + 8 * 3600000).toISOString(),
      mfaEnrollmentRef: r('MfaEnrollment'),
      bindingGeneration: 1,
      authRevision: 1,
      recoveryEpoch: 'initial',
      revision: 1,
    });
    source.fixture('ProviderBinding', {
      bindingId: 'binding',
      accountRef: r('Account'),
      audience: 'STAFF',
      active: true,
      generation: 1,
      authRevision: 1,
      revision: 1,
    });
    source.fixture('MfaEnrollment', {
      enrollmentId: 'MfaEnrollment',
      accountRef: r('Account'),
      state: 'VERIFIED',
      revision: 1,
    });
  });
  it('current tuple의 MFA/계정/binding을 모두 확인한다', async () =>
    expect(await authorization.identity(context)).toMatchObject({ accountId: 'Account' }));
  it('password-only phase는 업무 권위가 아니다', async () => {
    source.fixture('IdentitySession', {
      ...source.protectedRows.get('IdentitySession')!.get('IdentitySession')!,
      phase: 'PURPOSE_LIMITED',
    });
    await expect(authorization.identity(context)).rejects.toMatchObject({
      code: 'SESSION_REQUIRED',
    });
  });
  it('SYSTEM/타인 actor/다른 issuer assertion을 거절한다', async () => {
    for (const changed of [
      { audience: 'SYSTEM' as const },
      { actorAccountRef: r('Account', 'other') },
      { identityAssertionRef: { ...r('IdentitySession'), owner: 'EnterpriseAccess' } },
    ])
      await expect(authorization.identity({ ...context, ...changed })).rejects.toThrow();
  });
  it('미보호 최신 계정/연결 변경은 old session으로 fallback하지 않는다', async () => {
    source.fixture('Account', { accountId: 'Account', active: false, revision: 2 }, false);
    await expect(authorization.identity(context)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
  });
  it('binding 세대/권한 개정과 MFA 폐기를 현재 재대조한다', async () => {
    source.fixture('ProviderBinding', {
      ...source.protectedRows.get('ProviderBinding')!.get('binding')!,
      generation: 2,
    });
    await expect(authorization.identity(context)).rejects.toMatchObject({
      code: 'BINDING_CHANGED',
    });
  });
  it('새 role state의 미보호 추가도 old role grant로 fallback하지 않는다', async () => {
    source.fixture(
      'RoleRevisionState',
      {
        roleStateId: 'state-fixture',
        staffRoleRef: r('StaffRole', 'role-fixture'),
        roleRef: null,
        active: false,
        scopeRefs: [],
        actions: [],
        revision: 1,
      },
      false,
    );
    await expect(authorization.currentRoleState('StaffRole', 'role-fixture')).rejects.toMatchObject(
      { code: 'CURRENT_AUTH_NOT_PROTECTED' },
    );
  });
  it('단일 현재 role state만 허용하고 duplicate 상태는 거절한다', async () => {
    const state = {
      roleStateId: 'state-fixture',
      staffRoleRef: r('StaffRole', 'role-fixture'),
      roleRef: null,
      active: false,
      scopeRefs: [],
      actions: [],
      revision: 1,
    };
    source.fixture('RoleRevisionState', state);
    expect(await authorization.currentRoleState('StaffRole', 'role-fixture')).toEqual(state);
    source.fixture('RoleRevisionState', { ...state, roleStateId: 'other' });
    await expect(authorization.currentRoleState('StaffRole', 'role-fixture')).rejects.toThrow();
  });
  it('행위 grant가 없으면 정상 MFA 직원에게도 업무 권한을 만들지 않는다', async () =>
    await expect(
      authorization.requireStaff(context, 'identity.recovery.verify'),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' }));
  it('주입 신원 시각의 남은 기한을 실제 scan 시각에 변환하며5초 상한/만료를 유지한다', () => {
    const before = Date.now(),
      deadline = Date.parse(authorization.queryDeadline(context));
    expect(deadline).toBeGreaterThan(before);
    expect(deadline - before).toBeLessThanOrEqual(5001);
    expect(() =>
      authorization.queryDeadline({ ...context, deadlineAt: now.toISOString() }),
    ).toThrow('기한');
  });
  it('더 짧은 실제 실행 budget은 권위의 긴 잔여 시간으로 늘리지 않는다', async () => {
    const budget = new ExecutionBudget(250);
    await budget.run(async () => {
      const before = Date.now(),
        deadline = Date.parse(authorization.queryDeadline(context));
      expect(deadline - before).toBeLessThanOrEqual(250);
      expect(deadline).toBeGreaterThan(before);
    });
  });
});
