import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server.js';
import { proxy } from '@oms/ui/bff';
import { ProtectedStore, U2_STAFF_FENCE_ID } from '@oms/persistence';
import { U2RateAdmission } from '../../../apps/api/src/u2-authentication.js';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedVerifiedRecoveryParty } from '../fixtures/identity.js';
import { u2HttpHost } from '../fixtures/http.js';
import { SyntheticIdentityProvider } from '../../u1/fixtures/identity.js';
import { SyntheticHttpClient } from '../../u1/fixtures/http-client.js';
describe('합성 실제 HTTP/BFF·공유 보호 admission 공격 경계', () => {
  const sources = u2Sources(),
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend),
    origin = 'http://127.0.0.1:34782';
  let host: Awaited<ReturnType<typeof u2HttpHost>> | undefined;
  beforeAll(async () => {
    await initializeU2Databases();
    for (const s of Object.values(sources)) await s.initialize();
  });
  beforeEach(async () => {
    await resetU2Databases(sources.primaryAdmin, sources.journalAdmin);
    vi.stubEnv('OMS_LOCAL_SYNTHETIC', '1');
    vi.stubEnv('OMS_WEB_ORIGIN', origin);
    vi.stubEnv('OMS_API_ORIGIN', origin);
  });
  afterEach(async () => {
    await host?.app.close();
    host = undefined;
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    for (const s of Object.values(sources)) if (s.isInitialized) await s.destroy();
  });
  async function setup(audience: 'CUSTOMER' | 'STAFF' = 'CUSTOMER', admitted = true) {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    host = await u2HttpHost(store, f, audience, admitted);
    return { f, ...host };
  }
  function bffRequest(path: string, headers: Record<string, string>, data?: unknown) {
    return new NextRequest(origin + '/api/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        Host: new URL(origin).host,
        Origin: origin,
        ...headers,
        ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
  }
  it('이미 보호된 고정 revision1 fixture는 재seed로 덮어쓰지 않고 원래 fence를 보존한다', async () => {
    await setup();
    const original = await store.currentProtected('StaffAuthorityFence', U2_STAFF_FENCE_ID);
    // The seed writes revision1, then the normal role revision advances its fence to2.
    expect(original?.revision).toBe(2);
    await expect(seedVerifiedRecoveryParty(store, sources.vault)).rejects.toMatchObject({
      code: 'REVISION_SEQUENCE',
    });
    expect(await store.currentProtected('StaffAuthorityFence', U2_STAFF_FENCE_ID)).toEqual(
      original,
    );
  });
  it('명시 private 합성 credential이 실제 HTTP password/MFA와 일치하고 다른 프로세스 credential은401이다', async () => {
    const f = await seedVerifiedRecoveryParty(store, sources.vault),
      credentials = {
        password: randomBytes(24).toString('hex'),
        factor: randomBytes(12).toString('hex'),
      };
    host = await u2HttpHost(store, f, 'CUSTOMER', true, undefined, {
      port: 34782,
      origin,
      identityProvider: new SyntheticIdentityProvider(false, credentials),
    });
    await host.client.refreshCsrf();
    const start = await host.client.request('/identity/challenges', {
        loginIdentifier: f.customer.principalId + '@example.invalid',
      }),
      denied = await host.client.request(
        '/identity/challenges/' + start.body.challengeId + '/responses',
        { challengeId: start.body.challengeId, response: 'different-process-password' },
      );
    expect(start.response.status).toBe(200);
    expect(denied.response.status).toBe(401);
    expect(host.client.cookieSnapshot().some((c) => c.name === '__Host-oms-customer')).toBe(false);
    const client = new SyntheticHttpClient(origin, credentials);
    await client.authenticate(f.customer.principalId);
    const current = await client.request('/identity');
    expect(current.response.status).toBe(200);
    expect(current.body.data.accountRef.id).toBe(f.customer.principalId);
    const wrongFactor = new SyntheticHttpClient(origin, {
      ...credentials,
      factor: 'different-process-factor',
    });
    await expect(wrongFactor.authenticate(f.customer.principalId)).rejects.toThrow('MFA 확인 실패');
    expect(await store.list('EnrollmentAuthority')).toHaveLength(0);
  });
  it('BFF가 등록 U2 route와 목적별 allowlist cookie만 실제 API로 전달하고 응답은 no-store/no-referrer다', async () => {
    const h = await setup();
    await h.client.authenticate(h.f.customer.principalId);
    const cookies = h.client
        .cookieSnapshot()
        .map((c) => c.name + '=' + c.value)
        .join('; '),
      path = ['enterprises', h.f.enterpriseRef.id, 'memberships'],
      request = bffRequest(path.join('/'), { Cookie: cookies + '; forged-role=admin' }),
      result = await proxy(request, path, 'CUSTOMER');
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toContain('no-store');
    expect(result.headers.get('referrer-policy')).toBe('no-referrer');
    expect((await result.json()).items).toHaveLength(1);
  });
  it('BFF의 Origin/Host/URL 비밀/등록 밖 경로를 API 호출 없이 거절한다', async () => {
    const path = ['identity', 'party-challenges'];
    for (const request of [
      bffRequest(path.join('/'), { Origin: 'https://attacker.invalid' }, {}),
      bffRequest('identity?token=synthetic-private-url', {}),
      new NextRequest('http://attacker.invalid/api/identity', {
        headers: { Host: 'attacker.invalid' },
      }),
    ])
      expect([400, 403]).toContain((await proxy(request, path, 'CUSTOMER')).status);
    expect(
      (await proxy(bffRequest('internal/bootstrap', {}), ['internal', 'bootstrap'], 'CUSTOMER'))
        .status,
    ).toBe(404);
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
  it('직원 BFF/클라이언트 header는 실제 회사망 근거로 승격되지 않는다', async () => {
    await setup('STAFF', false);
    const result = await proxy(
      bffRequest('security/csrf', { 'X-Staff-Network': 'true', 'X-MFA-Verified': 'true' }),
      ['security', 'csrf'],
      'STAFF',
    );
    expect(result.status).toBe(403);
    expect(await store.list('EnrollmentAuthority')).toHaveLength(0);
  });
  it('64KiB 초과 BFF 입력은 원래 owner/접수/effect를 시작하지 않는다', async () => {
    const h = await setup();
    await h.client.refreshCsrf();
    const csrf = await h.client.request<{ csrfToken: string }>('/security/csrf'),
      cookie = h.client
        .cookieSnapshot()
        .map((c) => c.name + '=' + c.value)
        .join('; '),
      before = (await store.list('RecoveryCase')).length,
      result = await proxy(
        bffRequest(
          'identity/recovery-requests',
          { Cookie: cookie, 'X-CSRF-Token': csrf.body.csrfToken },
          { loginIdentifier: 'a'.repeat(66000) },
        ),
        ['identity', 'recovery-requests'],
        'CUSTOMER',
      );
    expect(result.status).toBe(413);
    expect(await store.list('RecoveryCase')).toHaveLength(before);
  });
  it('known/unknown identifier는 같은10회/5분 보호 상한이고 raw 식별자/망은 window에 남지 않는다', async () => {
    let clock = Date.now();
    const key = randomBytes(32),
      rate = new U2RateAdmission(store, key, () => new Date(clock)),
      identifier = 'synthetic-secret-identifier-' + randomUUID(),
      network = 'synthetic-private-network-' + randomUUID();
    for (let i = 0; i < 10; i++) await rate.admit(network, identifier);
    await expect(rate.admit(network, identifier)).rejects.toMatchObject({ code: 'U2_RATE_LIMIT' });
    const encoded = JSON.stringify(await store.list('AuthAttemptWindow', { limit: 100 }));
    expect(encoded.includes(identifier) || encoded.includes(network)).toBe(false);
    clock += 300000;
    await expect(rate.admit(network, identifier)).resolves.toBeUndefined();
  });
  it('동일 보호 source/키를 쓰는 두 replica가 전역50req/s window를 원자 합산한다', async () => {
    const key = randomBytes(32),
      at = new Date(),
      first = new U2RateAdmission(store, key, () => at),
      second = new U2RateAdmission(store, key, () => at);
    for (let i = 0; i < 50; i++) await (i % 2 ? first : second).admit('synthetic-peer');
    await expect(second.admit('synthetic-peer')).rejects.toMatchObject({ code: 'U2_RATE_LIMIT' });
    const windows = await store.list('AuthAttemptWindow', { limit: 100 });
    expect(windows.some((row) => row.count === 51)).toBe(true);
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
  it('120회/분 network 상한은 초당 window 재설정과 무관하며 다른 network 영구 lock이 아니다', async () => {
    let clock = Date.now();
    const rate = new U2RateAdmission(store, randomBytes(32), () => new Date(clock)),
      start = clock;
    for (let i = 0; i < 50; i++) await rate.admit('synthetic-network');
    clock += 1000;
    for (let i = 0; i < 50; i++) await rate.admit('synthetic-network');
    clock += 1000;
    for (let i = 0; i < 20; i++) await rate.admit('synthetic-network');
    await expect(rate.admit('synthetic-network')).rejects.toMatchObject({ code: 'U2_RATE_LIMIT' });
    clock = start + 60001;
    await expect(rate.admit('synthetic-network')).resolves.toBeUndefined();
  });
  it('등록되지 않은 공유 key/원장 보호 실패는 신규 인증/effect를 허용하지 않는다', async () => {
    await expect(
      new U2RateAdmission(store, undefined, () => new Date()).admit('synthetic-peer'),
    ).rejects.toMatchObject({ code: 'U2_RATE_KEY_UNREGISTERED' });
    await sources.primaryAdmin.query('UPDATE u1_recovery_control SET enabled=false');
    await expect(
      new U2RateAdmission(store, randomBytes(32), () => new Date()).admit('synthetic-peer'),
    ).rejects.toMatchObject({ code: 'WRITER_FENCED' });
  });
  it('시계 역행은 보호 window/프로세스 근거와 대조해 새 민감 요청을 차단하고 이전 권위를 부활시키지 않는다', async () => {
    let clock = Date.now();
    const key = randomBytes(32),
      rate = new U2RateAdmission(store, key, () => new Date(clock));
    await rate.admit('synthetic-peer');
    clock -= 1;
    await expect(rate.admit('synthetic-peer')).rejects.toMatchObject({
      code: 'U2_CLOCK_UNCONFIRMED',
    });
    await expect(
      new U2RateAdmission(store, key, () => new Date(clock)).admit('synthetic-peer'),
    ).rejects.toMatchObject({ code: 'U2_CLOCK_UNCONFIRMED' });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
});
