import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { EnrollmentAuthorities, PurposeVerifier, generatePurposeSecret } from '@oms/core';
import { SyntheticModelStore } from '../fixtures/identity.js';
import type { Ref } from '@oms/contracts';
const r = (entity: string, id = entity): Ref => ({
  owner: 'IdentityRecovery',
  entity,
  id,
  revision: 1,
});
const now = new Date('2026-10-09T00:00:00Z');
function fixture() {
  const source = new SyntheticModelStore(),
    verifier = new PurposeVerifier(randomBytes(32), 'fixture-key'),
    authority = new EnrollmentAuthorities(
      source.asStore(),
      verifier,
      () => now,
      async () => false,
    ),
    row = {
      authorityId: 'authority',
      accountRef: r('Account'),
      bindingRef: r('ProviderBinding'),
      bindingGeneration: 1,
      securityGeneration: 1,
      audience: 'CUSTOMER',
      purpose: 'INVITATION_ACCEPTANCE',
      invitationRef: {
        owner: 'EnterpriseAccess',
        entity: 'MembershipInvitation',
        id: 'invitation',
        revision: 1,
      },
      contactVerificationRef: r('VerificationEvidence'),
      challengeId: 'challenge',
      keyVersion: 'fixture-key',
      epoch: 'initial',
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 300000).toISOString(),
      state: 'ACTIVE',
      revision: 1,
      handleVerifier: '',
    },
    handle = generatePurposeSecret('ENROLLMENT_HANDLE');
  row.handleVerifier = verifier.digest(handle, authority.binding(row));
  source.fixture('EnrollmentAuthority', row);
  source.fixture('Account', { accountId: 'Account', active: true, revision: 1 });
  source.fixture('ProviderBinding', {
    bindingId: 'ProviderBinding',
    accountRef: r('Account'),
    active: true,
    audience: 'CUSTOMER',
    generation: 1,
    revision: 1,
  });
  source.fixture('AccountSecurityState', {
    securityStateId: 'security',
    accountRef: r('Account'),
    securityGeneration: 1,
    revision: 1,
  });
  source.fixture('MembershipInvitation', {
    invitationId: 'invitation',
    revision: 1,
    tokenGeneration: 1,
    contactRef: r('RegisteredContact'),
    contactVersion: 1,
  });
  source.fixture('RegisteredContact', {
    contactId: 'RegisteredContact',
    revision: 1,
    contactVersion: 1,
    state: 'VERIFIED',
    accountRef: null,
  });
  source.fixture('VerificationPolicy', {
    policyId: 'policy',
    revision: 1,
    active: true,
    synthetic: true,
    purpose: 'INVITATION_ACCEPTANCE',
    requiredSourceKinds: ['SYNTHETIC'],
    expiresAt: new Date(now.getTime() + 300000).toISOString(),
  });
  source.fixture('VerificationEvidence', {
    evidenceId: 'VerificationEvidence',
    revision: 1,
    state: 'CONFIRMED',
    purpose: 'INVITATION_ACCEPTANCE',
    accountRef: r('Account'),
    bindingRef: r('ProviderBinding'),
    contactRef: r('RegisteredContact'),
    contactVersion: 1,
    policyRef: r('VerificationPolicy', 'policy'),
    sourceKind: 'SYNTHETIC',
    synthetic: true,
    expiresAt: new Date(now.getTime() + 300000).toISOString(),
  });
  return { source, authority, row, handle };
}
describe('초대의 목적별 서버 권위', () => {
  it('실제 opaque handle을 검증한 context만 제한 권위가 된다', async () => {
    const f = fixture(),
      c = await f.authority.authenticate(
        r('EnrollmentAuthority', 'authority'),
        f.handle,
        'INVITATION_ACCEPTANCE',
        'trace',
      );
    expect((await f.authority.assert(c, 'INVITATION_ACCEPTANCE')).authorityId).toBe('authority');
  });
  it('Ref/boolean 복제 문맥은 권위를 만들지 않는다', async () => {
    const f = fixture(),
      c = await f.authority.authenticate(
        r('EnrollmentAuthority', 'authority'),
        f.handle,
        'INVITATION_ACCEPTANCE',
        'trace',
      );
    await expect(f.authority.assert({ ...c }, 'INVITATION_ACCEPTANCE')).rejects.toMatchObject({
      code: 'PURPOSE_AUTHORITY_REQUIRED',
    });
  });
  it('다른 후보 비밀과 다른 목적은 거절한다', async () => {
    const f = fixture();
    await expect(
      f.authority.authenticate(
        r('EnrollmentAuthority', 'authority'),
        generatePurposeSecret('ENROLLMENT_HANDLE'),
        'INVITATION_ACCEPTANCE',
        'trace',
      ),
    ).rejects.toThrow();
    await expect(
      f.authority.authenticate(
        r('EnrollmentAuthority', 'authority'),
        f.handle,
        'MFA_REENROLMENT',
        'trace',
      ),
    ).rejects.toThrow();
  });
  it('정각 만료는 5분을 연장하지 않는다', async () => {
    const f = fixture();
    f.source.fixture('EnrollmentAuthority', { ...f.row, expiresAt: now.toISOString() });
    await expect(
      f.authority.authenticate(
        r('EnrollmentAuthority', 'authority'),
        f.handle,
        'INVITATION_ACCEPTANCE',
        'trace',
      ),
    ).rejects.toThrow();
  });
  it('binding/security 세대 변경은 기존 handle을 거절한다', async () => {
    for (const model of ['ProviderBinding', 'AccountSecurityState']) {
      const f = fixture();
      f.source.fixture(model, {
        ...f.source.protectedRows.get(model)!.values().next().value!,
        [model === 'ProviderBinding' ? 'generation' : 'securityGeneration']: 2,
      });
      await expect(
        f.authority.authenticate(
          r('EnrollmentAuthority', 'authority'),
          f.handle,
          'INVITATION_ACCEPTANCE',
          'trace',
        ),
      ).rejects.toMatchObject({ code: 'PURPOSE_SECURITY_CHANGED' });
    }
  });
  it('회수 및 미보호 개정은 이전 handle로 fallback하지 않는다', async () => {
    for (const protectedImage of [true, false]) {
      const f = fixture();
      f.source.fixture(
        'EnrollmentAuthority',
        { ...f.row, state: 'REVOKED', revision: 2 },
        protectedImage,
      );
      await expect(
        f.authority.authenticate(
          r('EnrollmentAuthority', 'authority'),
          f.handle,
          'INVITATION_ACCEPTANCE',
          'trace',
        ),
      ).rejects.toThrow();
    }
  });
  it('직원 목적은 private ingress를 통과해야 한다', async () => {
    const f = fixture();
    f.source.fixture('EnrollmentAuthority', { ...f.row, audience: 'STAFF' });
    await expect(
      f.authority.authenticate(
        r('EnrollmentAuthority', 'authority'),
        f.handle,
        'INVITATION_ACCEPTANCE',
        'trace',
      ),
    ).rejects.toMatchObject({ code: 'STAFF_INGRESS_REQUIRED' });
  });
  it('완료된 목적은 own replay만 가능하고 새 변경에 재사용되지 않는다', async () => {
    const f = fixture();
    f.source.fixture('EnrollmentAuthority', { ...f.row, state: 'COMPLETED', revision: 2 });
    const c = await f.authority.authenticate(
      r('EnrollmentAuthority', 'authority'),
      f.handle,
      'INVITATION_ACCEPTANCE',
      'trace',
    );
    await expect(f.authority.assert(c, 'INVITATION_ACCEPTANCE')).rejects.toThrow();
    await expect(
      f.authority.assert(c, 'INVITATION_ACCEPTANCE', undefined, true),
    ).resolves.toMatchObject({ state: 'COMPLETED' });
  });
});
