import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { IdentityRecovery, StaffAccess, ref } from '@oms/core';
import { ProtectedStore } from '@oms/persistence';
import { localSources } from './databases.js';
import { SyntheticIdentityProvider } from './identity.js';
if (
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
)
  throw new Error('명시적 합성 직원 profile만 준비할 수 있습니다.');
const profile = JSON.parse(readFileSync('.runtime/u1/performance-profile.json', 'utf8')) as {
  verifier: string;
  credentials: { password: string; factor: string };
};
const sources = localSources();
await sources.primaryApp.initialize();
await sources.journalAppend.initialize();
try {
  const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  const now = () => new Date();
  const ingress = 'synthetic-private-ingress';
  const identity = new IdentityRecovery(
    store,
    new SyntheticIdentityProvider(false, profile.credentials),
    {
      synthetic: true,
      verifierKey: Buffer.from(profile.verifier, 'hex'),
      now,
      staffIngress: async (proof) => proof === ingress,
    },
  );
  const start = await identity.login(
    'STAFF',
    'nfr-staff-0@example.invalid',
    profile.credentials.password,
    randomBytes(8).toString('hex'),
    ingress,
  );
  let authenticated = await identity.verifyFactor(
    start.challengeId!,
    profile.credentials.factor,
    'nfr-staff-role-profile',
    ingress,
  );
  if (authenticated.phase !== 'MFA_VERIFIED') {
    const codes = await identity.issueRecoveryCodes(start.challengeId!, ingress);
    authenticated = await identity.acknowledgeRecoveryCodes(
      start.challengeId!,
      codes.setId,
      true,
      ingress,
    );
  }
  const token = authenticated.sessionToken!;
  const roles = await store.list('StaffRole', {
    equals: { label: '합성 성능 준비 직원' },
    limit: 2,
  });
  if (roles.length !== 1) throw new Error('원래 최소 직원 역할을 확인해야 합니다.');
  const staff = new StaffAccess(store, now);
  for (let index = 1; index < 10; index++) {
    const account = (await store.read('Account', 'nfr-staff-' + index))!;
    const grants = await store.list('StaffRoleGrant', {
      equals: {
        accountRef: { id: account.accountId },
        roleRef: { id: roles[0]!.staffRoleId },
        revokedAt: null,
      },
      limit: 1,
    });
    if (grants.length) continue;
    const context = await identity.authenticate(token, 'STAFF', randomUUID(), ingress);
    await staff.grantRole(context, {
      meta: {
        clientRequestId: 'nfr-staff-profile-' + index,
        expectedRevision: null,
        reason: '100 활동 세션 중10개 직원의 명시적 합성 업무 역할',
        evidenceRefs: [],
      },
      accountRef: ref('Account', account),
      roleRef: ref('StaffRole', roles[0]!),
      decision: 'GRANT',
    });
    await identity.recordRegisteredActivity(
      token,
      'STAFF',
      'grantStaffRole',
      randomUUID(),
      ingress,
    );
  }
  await identity.logout(token);
  console.log('일반 직원 역할 관리 경로로10개 직원의 현재 업무 권한 준비 완료.');
} finally {
  await sources.primaryApp.destroy();
  await sources.journalAppend.destroy();
}
