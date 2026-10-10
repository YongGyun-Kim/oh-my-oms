import { journalEntries } from '../fixtures/journal-entries.js';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityBrowser, IdentityRecovery } from '@oms/core';
import { ProtectedStore, restoreFromJournal } from '@oms/persistence';
import { initializeDatabases } from '../fixtures/migrate.js';
import { localSources } from '../fixtures/databases.js';
import { resetSyntheticDatabases } from '../fixtures/reset.js';
import {
  seedSyntheticAccount,
  SyntheticIdentityProvider,
  syntheticPassword,
  syntheticFactor,
} from '../fixtures/identity.js';
const sources = localSources();
const verifierKey = randomBytes(32);
let now: Date;
let identity: IdentityRecovery;
let store: ProtectedStore;
beforeAll(async () => {
  await initializeDatabases();
  for (const source of Object.values(sources)) await source.initialize();
});
beforeEach(async () => {
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
  now = new Date('2026-10-08T10:00:00Z');
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  identity = new IdentityRecovery(store, new SyntheticIdentityProvider(), {
    synthetic: true,
    verifierKey,
    now: () => now,
    staffIngress: async (proof) => proof === 'synthetic-private-ingress',
  });
  await seedSyntheticAccount(store, 'customer', 'CUSTOMER');
  await seedSyntheticAccount(store, 'staff', 'STAFF');
});
afterAll(async () => {
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
});
async function login(
  id = 'customer',
  audience: 'CUSTOMER' | 'STAFF' = 'CUSTOMER',
  ingress: unknown = null,
) {
  return identity.login(
    audience,
    id + '@example.invalid',
    syntheticPassword,
    'synthetic-peer',
    ingress,
  );
}
async function session(
  id = 'customer',
  audience: 'CUSTOMER' | 'STAFF' = 'CUSTOMER',
  ingress: unknown = null,
) {
  const challenge = await login(id, audience, ingress);
  await identity.verifyFactor(
    challenge.challengeId!,
    syntheticFactor,
    'synthetic-peer',
    ingress,
    true,
  );
  const issued = await identity.issueRecoveryCodes(challenge.challengeId!, ingress);
  const outcome = await identity.acknowledgeRecoveryCodes(
    challenge.challengeId!,
    issued.setId,
    true,
    ingress,
  );
  return { token: outcome.sessionToken!, issued, challenge };
}
describe('MFA·코드·현재 binding·세션 실제 PG 경계', () => {
  it('공개 password 준비와 MFA challenge는 같은 브라우저에 결합하고 password 뒤 결합을 회전한다', async () => {
    const first = randomBytes(32).toString('base64url');
    const rotated = randomBytes(32).toString('base64url');
    const other = randomBytes(32).toString('base64url');
    const prepared = await IdentityBrowser.run({ current: first }, () =>
      identity.startLogin('CUSTOMER', 'customer@example.invalid', null),
    );
    expect(prepared.phase).toBe('PASSWORD_REQUIRED');
    await expect(
      IdentityBrowser.run({ current: other }, () =>
        identity.completePassword(prepared.challengeId, syntheticPassword, 'peer', null),
      ),
    ).rejects.toMatchObject({ code: 'CHALLENGE_BROWSER_MISMATCH' });
    await expect(
      IdentityBrowser.run({ current: first }, () =>
        identity.verifyFactor(prepared.challengeId, syntheticFactor, 'peer', null),
      ),
    ).rejects.toMatchObject({ code: 'CHALLENGE_BROWSER_MISMATCH' });
    const mfa = await IdentityBrowser.run({ current: first, next: rotated }, () =>
      identity.completePassword(prepared.challengeId, syntheticPassword, 'peer', null),
    );
    await expect(
      IdentityBrowser.run({ current: first }, () =>
        identity.verifyFactor(mfa.challengeId!, syntheticFactor, 'peer', null),
      ),
    ).rejects.toMatchObject({ code: 'CHALLENGE_BROWSER_MISMATCH' });
    await expect(
      IdentityBrowser.run({ current: rotated }, () =>
        identity.verifyFactor(mfa.challengeId!, syntheticFactor, 'peer', null),
      ),
    ).resolves.toHaveProperty('phase', 'MFA_REQUIRED');
    await expect(
      IdentityBrowser.run({ current: first }, () =>
        identity.completePassword(prepared.challengeId, syntheticPassword, 'peer', null),
      ),
    ).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' });
    expect(await store.list('IdentitySession')).toHaveLength(0);
  });
  it('공개 password 준비도 직원 ingress와5분 기한을 적용하며 원장에 로그인 자료를 복제하지 않는다', async () => {
    await expect(identity.startLogin('STAFF', 'staff@example.invalid', null)).rejects.toMatchObject(
      { code: 'STAFF_INGRESS_REQUIRED' },
    );
    const before = await journalEntries(store, 'initial');
    const prepared = await identity.startLogin('CUSTOMER', 'customer@example.invalid', null);
    now = new Date(now.getTime() + 5 * 60000);
    await expect(
      identity.completePassword(prepared.challengeId, syntheticPassword, 'peer', null),
    ).rejects.toThrow();
    expect(await journalEntries(store, 'initial')).toEqual(before);
    expect(JSON.stringify(before)).not.toContain(syntheticPassword);
  });

  it('password만으로 업무 세션이 없으며 factor와 보관 확인 뒤에만 업무 세션을 발급한다', async () => {
    const attempt = await login();
    expect(attempt.phase).toBe('MFA_REQUIRED');
    expect(attempt.sessionToken).toBeUndefined();
    await expect(identity.issueRecoveryCodes(attempt.challengeId!, null)).rejects.toMatchObject({
      code: 'MFA_REQUIRED',
    });
    const verified = await identity.verifyFactor(
      attempt.challengeId!,
      syntheticFactor,
      'peer',
      null,
    );
    expect(verified.sessionToken).toBeUndefined();
    const issued = await identity.issueRecoveryCodes(attempt.challengeId!, null);
    await expect(
      identity.acknowledgeRecoveryCodes(attempt.challengeId!, issued.setId, false, null),
    ).rejects.toThrow();
    const success = await identity.acknowledgeRecoveryCodes(
      attempt.challengeId!,
      issued.setId,
      true,
      null,
    );
    expect(
      (await identity.authenticate(success.sessionToken!, 'CUSTOMER', 'correlation', null))
        .principalId,
    ).toBe('customer');
    const text = JSON.stringify(await journalEntries(store, 'initial'));
    expect(text).not.toContain(syntheticPassword);
    expect(text).not.toContain(syntheticFactor);
    for (const code of issued.codes) expect(text).not.toContain(code);
    expect(text).not.toContain(success.sessionToken!);
  });
  it('틀린 password/MFA, 위조 audience와 직원 ingress를 거절한다', async () => {
    await expect(
      identity.login('CUSTOMER', 'customer@example.invalid', 'wrong', 'peer', null),
    ).rejects.toThrow();
    await expect(login('staff', 'STAFF')).rejects.toMatchObject({ code: 'STAFF_INGRESS_REQUIRED' });
    const result = await session();
    await expect(
      identity.authenticate(result.token, 'STAFF', 'corr', 'synthetic-private-ingress'),
    ).rejects.toThrow();
    const challenge = await login();
    await expect(
      identity.verifyFactor(challenge.challengeId!, 'wrong', 'peer', null),
    ).rejects.toThrow();
  });
  it('직원 MFA와 ingress도 확인하지만 그것으로 업무 grant를 만들지 않는다', async () => {
    const result = await session('staff', 'STAFF', 'synthetic-private-ingress');
    expect(
      (await identity.authenticate(result.token, 'STAFF', 'corr', 'synthetic-private-ingress'))
        .audience,
    ).toBe('STAFF');
    expect(await store.list('StaffRoleGrant')).toEqual([]);
  });
  it('polling은 idle을 연장하지 않고 고객30분/직원15분 및8시간을 강제한다', async () => {
    const result = await session();
    now = new Date(now.getTime() + 29 * 60000);
    await identity.authenticate(result.token, 'CUSTOMER', 'poll', null);
    now = new Date(now.getTime() + 60000);
    await expect(
      identity.authenticate(result.token, 'CUSTOMER', 'poll', null),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    now = new Date('2026-10-08T10:00:00Z');
    const staff = await session('staff', 'STAFF', 'synthetic-private-ingress');
    now = new Date(now.getTime() + 15 * 60000);
    await expect(
      identity.authenticate(staff.token, 'STAFF', 'poll', 'synthetic-private-ingress'),
    ).rejects.toThrow();
    now = new Date('2026-10-08T10:00:00Z');
    const absolute = await session();
    now = new Date(now.getTime() + 8 * 3600000);
    await expect(identity.authenticate(absolute.token, 'CUSTOMER', 'poll', null)).rejects.toThrow();
  });
  it('로그아웃 원본 보호 후 원래 cookie와 challenge를 재사용하지 않는다', async () => {
    const result = await session();
    await identity.logout(result.token);
    await expect(identity.authenticate(result.token, 'CUSTOMER', 'corr', null)).rejects.toThrow();
    await expect(
      identity.verifyFactor(result.challenge.challengeId!, syntheticFactor, 'peer', null),
    ).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' });
  });
  it('code는 password확인 뒤 단회 소비하고 업무 세션 대신 재등록 목적만 준다', async () => {
    const result = await session();
    const challenge = await login();
    const recovery = await identity.recover(
      challenge.challengeId!,
      result.issued.setId,
      result.issued.codes[0]!,
      'peer',
      null,
    );
    expect(recovery.phase).toBe('RECOVERY_REVIEW');
    expect(recovery.sessionToken).toBeUndefined();
    await expect(
      identity.recover(
        challenge.challengeId!,
        result.issued.setId,
        result.issued.codes[0]!,
        'peer',
        null,
      ),
    ).rejects.toThrow();
    await expect(identity.beginEnrolment(challenge.challengeId!, null)).rejects.toMatchObject({
      code: 'FACTOR_REMOVAL_UNKNOWN',
    });
    await expect(
      identity.authenticate(result.token, 'CUSTOMER', 'corr', null),
    ).rejects.toMatchObject({ code: 'BINDING_CHANGED' });
  });
  it('같은 code의 동시 소비는 하나만 성공한다', async () => {
    const result = await session();
    const a = await login();
    const b = await login();
    const results = await Promise.allSettled([
      identity.recover(a.challengeId!, result.issued.setId, result.issued.codes[0]!, 'peer', null),
      identity.recover(b.challengeId!, result.issued.setId, result.issued.codes[0]!, 'peer', null),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
  it('재발급은 이전 세대의 모든 미사용 code를 무효화한다', async () => {
    const result = await session();
    const challenge = await login();
    await identity.verifyFactor(challenge.challengeId!, syntheticFactor, 'peer', null, true);
    const reissued = await identity.issueRecoveryCodes(challenge.challengeId!, null);
    expect((await store.read('RecoveryCodeSet', result.issued.setId))?.invalidated).toBe(true);
    await identity.acknowledgeRecoveryCodes(challenge.challengeId!, reissued.setId, true, null);
    const recovery = await login();
    await expect(
      identity.recover(
        recovery.challengeId!,
        result.issued.setId,
        result.issued.codes[1]!,
        'peer',
        null,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_DENIED' });
  });
  it('challenge는5분에 만료하고 분산 시도도 주체 한도를 공유한다', async () => {
    const challenge = await login();
    now = new Date(now.getTime() + 5 * 60000);
    await expect(
      identity.verifyFactor(challenge.challengeId!, syntheticFactor, 'peer', null),
    ).rejects.toThrow();
    now = new Date(now.getTime() + 60000);
    for (let i = 0; i < 10; i++) await login();
    await expect(
      identity.login(
        'CUSTOMER',
        'customer@example.invalid',
        syntheticPassword,
        'different-peer',
        null,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_ATTEMPT_LIMIT' });
    now = new Date(now.getTime() + 60000);
    await expect(login()).resolves.toHaveProperty('phase', 'MFA_REQUIRED');
  });
  it('미보호 최신 계정 회수는 기존 protected session으로 허용하지 않는다', async () => {
    const result = await session();
    const account = await store.read('Account', 'customer');
    const failed = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'PRIMARY_COMMITTED') throw new Error('unprotected revoke');
      },
    );
    await expect(
      failed.execute(
        {
          principalId: 'staff',
          audience: 'STAFF',
          owner: 'IdentityRecovery',
          operation: 'revoke',
          target: null,
          idempotencyKey: 'revoke',
          input: { active: false },
          correlationId: 'corr',
          epoch: 'initial',
        },
        (transaction) => transaction.put('Account', { ...account, active: false, revision: 2 }, 1),
      ),
    ).rejects.toThrow();
    await expect(
      identity.authenticate(result.token, 'CUSTOMER', 'corr', null),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    await expect(
      identity.authenticate(result.token, 'CUSTOMER', 'corr', null),
    ).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_UNCONFIRMED' });
  });
  it('복구 중 조회/로그인을 막고 복구 뒤 현재 보안 근거 미확인도 허용하지 않는다', async () => {
    await sources.primaryAdmin.query('UPDATE u1_recovery_control SET enabled=false');
    await expect(store.read('Account', 'customer')).rejects.toMatchObject({
      code: 'WRITER_FENCED',
    });
    await expect(store.list('Account')).rejects.toThrow();
    await expect(login()).rejects.toThrow();
    await sources.primaryAdmin.query('UPDATE u1_recovery_control SET enabled=true');
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    await expect(login()).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_UNCONFIRMED' });
  });
  it('서로 다른 API instance와 재시작은 동일 공유 challenge를 완료하며 중복 완료는 하나만 성공한다', async () => {
    const replica = new IdentityRecovery(store, new SyntheticIdentityProvider(), {
      synthetic: true,
      verifierKey,
      now: () => now,
      staffIngress: async () => false,
    });
    const challenge = await login();
    await replica.verifyFactor(challenge.challengeId!, syntheticFactor, 'peer', null);
    const issued = await identity.issueRecoveryCodes(challenge.challengeId!, null);
    const results = await Promise.allSettled([
      identity.acknowledgeRecoveryCodes(challenge.challengeId!, issued.setId, true, null),
      replica.acknowledgeRecoveryCodes(challenge.challengeId!, issued.setId, true, null),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await store.list('IdentitySession', { equals: { accountRef: { id: 'customer' } } }),
    ).toHaveLength(1);
    expect(await sources.primaryAdmin.query('SELECT * FROM u1_auth_ephemeral')).toHaveLength(0);
  });
  it('공유 challenge 자료는 암호화되고 변조/다른 키는 업무 세션을 만들지 않는다', async () => {
    const challenge = await login();
    const rows = (await sources.primaryAdmin.query(
      'SELECT ciphertext,iv,tag FROM u1_auth_ephemeral',
    )) as Record<string, string>[];
    expect(JSON.stringify(rows)).not.toContain('customer@example.invalid');
    expect(rows[0]!.iv).toHaveLength(16);
    const wrong = new IdentityRecovery(store, new SyntheticIdentityProvider(), {
      synthetic: true,
      verifierKey: randomBytes(32),
      now: () => now,
      staffIngress: async () => false,
    });
    await expect(
      wrong.verifyFactor(challenge.challengeId!, syntheticFactor, 'peer', null),
    ).rejects.toThrow();
    expect(await store.list('IdentitySession')).toHaveLength(0);
  });
  it('등록된 실제 업무 활동은 idle을 갱신하지만8시간 deadline은 늘리지 않는다', async () => {
    const result = await session('staff', 'STAFF', 'synthetic-private-ingress');
    const initial = await identity.authenticate(
      result.token,
      'STAFF',
      'corr',
      'synthetic-private-ingress',
    );
    const before = await store.read('IdentitySession', initial.identityAssertionRef.id);
    now = new Date(now.getTime() + 14 * 60000);
    await identity.recordRegisteredActivity(
      result.token,
      'STAFF',
      'registerProduct',
      'corr',
      'synthetic-private-ingress',
    );
    now = new Date(now.getTime() + 14 * 60000);
    await expect(
      identity.authenticate(result.token, 'STAFF', 'corr', 'synthetic-private-ingress'),
    ).resolves.toHaveProperty('principalId', 'staff');
    const after = await store.read('IdentitySession', initial.identityAssertionRef.id);
    expect(after?.deadlineAt).toBe(before?.deadlineAt);
    expect(after?.lastActiveAt).not.toBe(before?.lastActiveAt);
  });
  it('poll/preload/health 및 임의 activity 문자열은 idle을 연장하지 않는다', async () => {
    const result = await session();
    now = new Date(now.getTime() + 29 * 60000);
    for (const operation of ['readReceipt', 'heartbeat', 'preload', 'health', 'activity:true'])
      await identity.recordRegisteredActivity(result.token, 'CUSTOMER', operation, 'poll', null);
    now = new Date(now.getTime() + 60000);
    await expect(
      identity.authenticate(result.token, 'CUSTOMER', 'poll', null),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
});
