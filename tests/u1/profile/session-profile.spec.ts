import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Authorization, EnterpriseQuery, EnterpriseAccess, IdentityRecovery } from '@oms/core';
import { ProtectedStore } from '@oms/persistence';
import { localSources } from '../fixtures/databases.js';
import { SyntheticIdentityProvider } from '../fixtures/identity.js';
import { SyntheticEnterpriseVerification } from '../fixtures/enterprise.js';
// Explicit no-reset probe of the prepared profile. Normal full integration uses
// its own smaller fixture suite; this probe preserves every earlier ACK/source.
const sources = localSources();
let store: ProtectedStore;
let identity: IdentityRecovery;
let token: string;
let time = Date.now();
beforeAll(async () => {
  const profile = JSON.parse(readFileSync('.runtime/u1/performance-profile.json', 'utf8'));
  await sources.primaryApp.initialize();
  await sources.journalAppend.initialize();
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  identity = new IdentityRecovery(
    store,
    new SyntheticIdentityProvider(false, profile.credentials),
    {
      synthetic: true,
      verifierKey: Buffer.from(profile.verifier, 'hex'),
      now: () => new Date(time),
      staffIngress: async (proof) => proof === 'synthetic-private-ingress',
    },
  );
  const start = await identity.login(
    'STAFF',
    'nfr-staff-9@example.invalid',
    profile.credentials.password,
    randomUUID(),
    'synthetic-private-ingress',
  );
  const result = await identity.verifyFactor(
    start.challengeId!,
    profile.credentials.factor,
    randomUUID(),
    'synthetic-private-ingress',
  );
  if (result.phase !== 'MFA_VERIFIED')
    throw new Error('준비된 profile의 정상 MFA 경로를 확인해야 합니다.');
  token = result.sessionToken!;
});
afterAll(async () => {
  if (token) await identity.logout(token);
  await sources.primaryApp.destroy();
  await sources.journalAppend.destroy();
});
const context = () =>
  identity.authenticate(token, 'STAFF', randomUUID(), 'synthetic-private-ingress');
describe('100k 자료를 보존하는 정상 idle 병렬 조회/회수 PG 회귀', () => {
  it('원래 보호된 context는 정상 heartbeat 개정 뒤에도 현재 권위를 확인한다', async () => {
    const original = await context();
    time += 1000;
    await identity.recordRegisteredActivity(
      token,
      'STAFF',
      'registerProduct',
      randomUUID(),
      'synthetic-private-ingress',
    );
    await expect(
      new Authorization(store, () => new Date(time)).requireStaff(original, 'application.read'),
    ).resolves.toBeUndefined();
  });
  it('실제25개 기업신청 목록의 병렬 읽기와 정상 활동이 인증을 오거절하지 않는다', async () => {
    const query = new EnterpriseQuery(
      new EnterpriseAccess(
        store,
        new SyntheticEnterpriseVerification(),
        () => new Date(time),
        true,
      ),
      () => new Date(time),
    );
    const original = await context();
    const pending = Promise.all(
      Array.from({ length: 5 }, () =>
        query.applications(original, { status: null, cursor: null, pageSize: 25 }),
      ),
    );
    time += 1000;
    await identity.recordRegisteredActivity(
      token,
      'STAFF',
      'registerProduct',
      randomUUID(),
      'synthetic-private-ingress',
    );
    const results = await pending;
    expect(results).toHaveLength(5);
  });
  it('같은 revision의 primary Account 회수도 즉시 거절하고 원래 자료를 보존한다', async () => {
    const original = await context();
    await sources.primaryApp.query('UPDATE u1_account SET active=false WHERE "accountId"=$1', [
      original.principalId,
    ]);
    try {
      await expect(
        new Authorization(store, () => new Date(time)).requireStaff(original, 'application.read'),
      ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    } finally {
      await sources.primaryApp.query('UPDATE u1_account SET active=true WHERE "accountId"=$1', [
        original.principalId,
      ]);
    }
  });
  it('미보호 binding authRevision 변경은 정상 heartbeat로 허용하지 않는다', async () => {
    const original = await context();
    const id = original.principalId + '-binding';
    await sources.primaryApp.query(
      'UPDATE u1_provider_binding SET "authRevision"="authRevision"+1 WHERE "bindingId"=$1',
      [id],
    );
    try {
      await expect(
        new Authorization(store, () => new Date(time)).requireStaff(original, 'application.read'),
      ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    } finally {
      await sources.primaryApp.query(
        'UPDATE u1_provider_binding SET "authRevision"="authRevision"-1 WHERE "bindingId"=$1',
        [id],
      );
    }
  });
  it('primary-only heartbeat는 보호되기 전15분 staff idle을 연장하지 않는다', async () => {
    const original = await context();
    const visible = (await store.read('IdentitySession', original.identityAssertionRef.id))!;
    const previousTime = time;
    await sources.primaryApp.query(
      'UPDATE u1_identity_session SET "lastActiveAt"=$2 WHERE "sessionId"=$1',
      [original.identityAssertionRef.id, new Date(time + 3600000)],
    );
    time += 16 * 60000;
    try {
      await expect(context()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    } finally {
      time = previousTime;
      await sources.primaryApp.query(
        'UPDATE u1_identity_session SET "lastActiveAt"=$2 WHERE "sessionId"=$1',
        [original.identityAssertionRef.id, visible.lastActiveAt],
      );
    }
  });
  it('같은 revision의 primary session 무효화는 즉시 거절한다', async () => {
    const original = await context();
    await sources.primaryApp.query(
      'UPDATE u1_identity_session SET phase=\'INVALIDATED\' WHERE "sessionId"=$1',
      [original.identityAssertionRef.id],
    );
    try {
      await expect(context()).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    } finally {
      await sources.primaryApp.query(
        'UPDATE u1_identity_session SET phase=\'MFA_VERIFIED\' WHERE "sessionId"=$1',
        [original.identityAssertionRef.id],
      );
    }
  });
  it('같은 revision의 현재 staff grant 회수도 오래된 protected grant로 허용하지 않는다', async () => {
    const original = await context();
    const grants = await store.list('StaffRoleGrant', {
      equals: { accountRef: { id: original.principalId }, revokedAt: null },
      limit: 1,
    });
    const id = grants[0]!.staffGrantId;
    await sources.primaryApp.query(
      'UPDATE u1_staff_role_grant SET "revokedAt"=now() WHERE "staffGrantId"=$1',
      [id],
    );
    try {
      await expect(
        new Authorization(store, () => new Date(time)).requireStaff(original, 'application.read'),
      ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    } finally {
      await sources.primaryApp.query(
        'UPDATE u1_staff_role_grant SET "revokedAt"=NULL WHERE "staffGrantId"=$1',
        [id],
      );
    }
  });
  it('정상 idle 활동을 해도8시간 절대 deadline을 새로 만들지 않는다', async () => {
    const original = await context();
    const visible = (await store.read('IdentitySession', original.identityAssertionRef.id))!;
    const previousTime = time;
    time = Date.parse(String(visible.deadlineAt)) + 1;
    try {
      await expect(context()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    } finally {
      time = previousTime;
    }
  });
});
