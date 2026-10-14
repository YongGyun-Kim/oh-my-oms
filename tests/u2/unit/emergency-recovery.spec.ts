import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  EmergencyRecoveries,
  emergencyTransition,
  PurposeVerifier,
  generatePurposeSecret,
} from '@oms/core';
import type { Ref } from '@oms/contracts';
import { SyntheticModelStore } from '../fixtures/identity.js';
const r = (entity: string, id = entity): Ref => ({
  owner: 'IdentityRecovery',
  entity,
  id,
  revision: 1,
});
const at = new Date('2026-10-10T00:00:00Z'),
  expires = new Date(at.getTime() + 300000).toISOString();
function fixture(registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED' = 'LOCAL_SYNTHETIC') {
  const source = new SyntheticModelStore(),
    verifier = new PurposeVerifier(randomBytes(32), 'local-operator-key'),
    service = new EmergencyRecoveries(
      source.asStore(),
      verifier,
      () => at,
      registration,
      async (proof) => proof === 'separate-private-operator',
    ),
    operator = {
      operatorAuthorityId: 'operator',
      revision: 1,
      operatorId: 'private-operator',
      policyRef: r('VerificationPolicy', 'policy'),
      synthetic: true,
      active: true,
      expiresAt: expires,
      credentialVerifier: '',
    },
    credential = generatePurposeSecret('EMERGENCY_OPERATOR');
  operator.credentialVerifier = verifier.digest(credential, service.binding(operator, 'initial'));
  source.fixture('EmergencyOperatorAuthority', operator);
  source.fixture('VerificationPolicy', {
    policyId: 'policy',
    revision: 1,
    purpose: 'EMERGENCY_PRIVATE',
    synthetic: true,
    active: true,
    requiredSourceKinds: ['SYNTHETIC'],
    expiresAt: expires,
  });
  source.fixture('RecoveryCase', {
    caseId: 'case',
    revision: 1,
    accountRef: r('Account'),
    bindingRef: r('ProviderBinding'),
    bindingGeneration: 1,
    securityGeneration: 1,
    epoch: 'initial',
  });
  source.fixture('Account', { accountId: 'Account', active: true, revision: 1 });
  source.fixture('ProviderBinding', {
    bindingId: 'ProviderBinding',
    accountRef: r('Account'),
    active: true,
    audience: 'STAFF',
    generation: 1,
    revision: 1,
  });
  source.fixture('AccountSecurityState', {
    securityStateId: 'security',
    accountRef: r('Account'),
    securityGeneration: 1,
    revision: 1,
  });
  source.fixture('StaffRole', {
    staffRoleId: 'role',
    revision: 1,
    actions: ['identity.recovery.verify'],
  });
  source.fixture('StaffRoleGrant', {
    staffGrantId: 'grant',
    accountRef: r('Account'),
    roleRef: { owner: 'EnterpriseAccess', entity: 'StaffRole', id: 'role', revision: 1 },
    effectiveFrom: at.toISOString(),
    revokedAt: null,
    revision: 1,
  });
  return {
    source,
    service,
    operator,
    credential,
    authenticate: () =>
      service.authenticate(
        r('EmergencyOperatorAuthority', 'operator'),
        credential,
        r('RecoveryCase', 'case'),
        'trace',
        'separate-private-operator',
      ),
  };
}
describe('별도 비공개 운영 권위의 비상 복구 경계', () => {
  it('현재 실제 후보 비밀과 원래 직원 대상/별도 private proof를 확인한 서버 context만 허용한다', async () => {
    const f = fixture(),
      context = await f.authenticate();
    expect((await f.service.assert(context)).source.caseId).toBe('case');
  });
  it('일반 STAFF 문자열/고객 접점은 운영 private proof를 대신하지 않는다', async () => {
    const f = fixture();
    for (const proof of ['STAFF', true, { role: 'EMERGENCY' }])
      await expect(
        f.service.authenticate(
          r('EmergencyOperatorAuthority', 'operator'),
          f.credential,
          r('RecoveryCase', 'case'),
          'trace',
          proof,
        ),
      ).rejects.toMatchObject({ code: 'EMERGENCY_PRIVATE_REQUIRED' });
  });
  it('복제 context와 원래 context 기한 수정은 권위를 만들거나 연장하지 않는다', async () => {
    const f = fixture(),
      context = await f.authenticate();
    await expect(f.service.assert({ ...context })).rejects.toMatchObject({
      code: 'EMERGENCY_PRIVATE_REQUIRED',
    });
    context.deadlineAt = expires;
    await expect(f.service.assert(context)).rejects.toMatchObject({
      code: 'EMERGENCY_PRIVATE_REQUIRED',
    });
  });
  it('다른 후보 비밀/다른 case 개정은 확인을 통과하지 않는다', async () => {
    const f = fixture();
    await expect(
      f.service.authenticate(
        r('EmergencyOperatorAuthority', 'operator'),
        generatePurposeSecret('EMERGENCY_OPERATOR'),
        r('RecoveryCase', 'case'),
        'trace',
        'separate-private-operator',
      ),
    ).rejects.toMatchObject({ code: 'EMERGENCY_AUTHORITY_REQUIRED' });
    await expect(
      f.service.authenticate(
        r('EmergencyOperatorAuthority', 'operator'),
        f.credential,
        { ...r('RecoveryCase', 'case'), revision: 2 },
        'trace',
        'separate-private-operator',
      ),
    ).rejects.toThrow();
  });
  it('등록되지 않은 실제 정책은 local fixture를 실활성 자격으로 사용하지 않는다', async () => {
    const f = fixture('UNREGISTERED');
    await expect(f.authenticate()).rejects.toMatchObject({ code: 'EMERGENCY_POLICY_HOLD' });
  });
  it('운영 자격 회수/정각 만료/미보호 변경은 옛 context를 허용하지 않는다', async () => {
    for (const change of [{ active: false }, { expiresAt: at.toISOString() }]) {
      const f = fixture(),
        context = await f.authenticate();
      f.source.fixture('EmergencyOperatorAuthority', { ...f.operator, ...change, revision: 2 });
      await expect(f.service.assert(context)).rejects.toMatchObject({
        code: 'EMERGENCY_AUTHORITY_CHANGED',
      });
    }
    const f = fixture(),
      context = await f.authenticate();
    f.source.fixture(
      'EmergencyOperatorAuthority',
      { ...f.operator, active: false, revision: 2 },
      false,
    );
    await expect(f.service.assert(context)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
  });
  it('고객 binding/새 보안 세대/기존 부여 회수는 원래 직원 복구로 승격되지 않는다', async () => {
    for (const model of ['ProviderBinding', 'AccountSecurityState', 'StaffRoleGrant']) {
      const f = fixture(),
        row = f.source.protectedRows.get(model)!.values().next().value!;
      f.source.fixture(model, {
        ...row,
        ...(model === 'ProviderBinding'
          ? { audience: 'CUSTOMER' }
          : model === 'AccountSecurityState'
            ? { securityGeneration: 2 }
            : { revokedAt: at.toISOString() }),
      });
      await expect(f.authenticate()).rejects.toThrow();
    }
  });
  it('HOLD만 재검토하고 종료/완료를 되돌리지 않으며 종료가 effect 부재를 뜻하지 않는다', () => {
    expect(emergencyTransition('HOLD', 'resume')).toBe(true);
    for (const state of ['OPEN', 'VERIFYING', 'HOLD'])
      expect(emergencyTransition(state, 'close')).toBe(true);
    for (const state of ['CLOSED', 'COMPLETED', 'ENROLMENT_ONLY', 'OTHER'])
      for (const action of ['resume', 'close'] as const)
        expect(emergencyTransition(state, action)).toBe(false);
  });
});
