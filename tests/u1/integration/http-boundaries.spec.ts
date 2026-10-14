import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiOwners } from '@oms/api';
import { createApi } from '@oms/api';
import {
  Assessments,
  EnterpriseAccess,
  IdentityRecovery,
  NotificationDelivery,
  OrderAcceptance,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
} from '@oms/core';
import { HttpAttempts, ProtectedStore } from '@oms/persistence';
import { localSources } from '../fixtures/databases.js';
import { initializeDatabases } from '../fixtures/migrate.js';
import { resetSyntheticDatabases } from '../fixtures/reset.js';
import {
  seedSyntheticAccount,
  SyntheticIdentityProvider,
  syntheticPassword,
  syntheticFactor,
} from '../fixtures/identity.js';
import { SyntheticEnterpriseVerification, syntheticBasis } from '../fixtures/enterprise.js';
import type { HttpTestBody } from '../fixtures/http-client.js';
import { SyntheticHttpClient } from '../fixtures/http-client.js';
import { seedMinimumStaffManager } from '../fixtures/staff-bootstrap.js';
const sources = localSources();
const origin = 'http://127.0.0.1:34681';
let owners: ApiOwners;
let staffHost: Awaited<ReturnType<typeof createApi>> | undefined;
let host: Awaited<ReturnType<typeof createApi>>;
let cookies: Map<string, string>;
let csrf: string;
let store: ProtectedStore;
const now = () => new Date();
beforeAll(async () => {
  await initializeDatabases();
  for (const source of Object.values(sources)) await source.initialize();
});
beforeEach(async () => {
  if (staffHost) {
    await staffHost.app.close();
    staffHost = undefined;
  }
  if (host) await host.app.close();
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  const identity = new IdentityRecovery(store, new SyntheticIdentityProvider(), {
    synthetic: true,
    verifierKey: randomBytes(32),
    now,
    staffIngress: async () => false,
  });
  await seedSyntheticAccount(store, 'customer', 'CUSTOMER');
  await seedSyntheticAccount(store, 'other', 'CUSTOMER');
  owners = {
    store,
    identity,
    enterprise: new EnterpriseAccess(store, new SyntheticEnterpriseVerification(), now, true),
    catalog: new ProductCatalog(store, now),
    orders: new OrderAcceptance(store, new Assessments(now), now),
    staff: new StaffAccess(store, now),
    inquiry: new WorkInquiry(store, now),
    notices: new NotificationDelivery(store, now),
    now,
  };
  host = await createApi(owners, {
    audience: 'CUSTOMER',
    origin,
    cookieKey: randomBytes(32),
    localSynthetic: true,
    staffAdmission: async () => null,
  });
  await host.app.listen(34681, '127.0.0.1');
  cookies = new Map();
  csrf = '';
  await refreshCsrf();
});
afterAll(async () => {
  if (staffHost) await staffHost.app.close();
  if (host) await host.app.close();
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
});
async function request(path: string, data?: unknown, additional: Record<string, string> = {}) {
  const response = await fetch(origin + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      Cookie: [...cookies].map(([name, value]) => name + '=' + value).join('; '),
      Origin: origin,
      'X-CSRF-Token': csrf,
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...additional,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  for (const value of response.headers.getSetCookie()) {
    const [name, token] = value.split(';')[0]!.split('=');
    cookies.set(name!, token!);
  }
  return { response, body: (await response.json()) as HttpTestBody };
}
async function refreshCsrf() {
  const result = await request('/security/csrf');
  expect(result.response.status).toBe(200);
  csrf = result.body.csrfToken;
}
async function authenticate(id = 'customer') {
  const start = await request('/identity/challenges', { loginIdentifier: id + '@example.invalid' });
  expect(start.response.status).toBe(200);
  expect(start.body.phase).toBe('CHALLENGE_REQUIRED');
  const password = await request('/identity/challenges/' + start.body.challengeId + '/responses', {
    challengeId: start.body.challengeId,
    response: syntheticPassword,
  });
  expect(password.response.status).toBe(200);
  await refreshCsrf();
  const idMfa = password.body.challengeId;
  const factor = await request('/identity/challenges/' + idMfa + '/responses', {
    challengeId: idMfa,
    response: syntheticFactor,
  });
  expect(factor.response.status).toBe(200);
  if (factor.body.phase === 'MFA_VERIFIED') {
    await refreshCsrf();
    return factor;
  }
  const codes = await request('/identity/challenges/' + idMfa + '/recovery-code-issues', {
    challengeId: idMfa,
  });
  expect(codes.response.status).toBe(200);
  const finished = await request(
    '/identity/challenges/' + idMfa + '/recovery-code-acknowledgements',
    { challengeId: idMfa, setId: codes.body.setId, stored: true },
  );
  expect(finished.response.status).toBe(200);
  expect(finished.body.phase).toBe('MFA_VERIFIED');
  await refreshCsrf();
  return finished;
}
describe('실제 Nest Express·canonical·현재 신원 HTTP 경계', () => {
  it('확정 거절은 NOT_ACCEPTED이고 없는 키·타 계정·이전 epoch는 UNCONFIRMED다', async () => {
    await authenticate();
    const key = randomUUID();
    const input = {
      meta: {
        clientRequestId: key,
        expectedRevision: 1,
        reason: '새 원본 개정 충돌',
        evidenceRefs: [],
      },
      legalName: '합성 거절',
      designatedContact: 'a@example.invalid',
      registrationEvidenceRefs: [syntheticBasis],
    };
    expect(
      (await request('/enterprise-applications', input, { 'Idempotency-Key': key })).response
        .status,
    ).toBe(400);
    const query = new URLSearchParams({
      owner: 'EnterpriseAccess',
      operation: 'applyEnterprise',
      target: JSON.stringify({ kind: 'NONE' }),
      clientRequestId: key,
    });
    expect((await request('/requests/original-probe?' + query)).body.disposition).toBe(
      'NOT_ACCEPTED',
    );
    expect(
      (await store.list('RequestReceipt')).filter((value) => value.clientRequestId === key),
    ).toHaveLength(0);
    const otherClient = new SyntheticHttpClient(origin);
    await otherClient.authenticate('other');
    expect((await otherClient.request('/requests/original-probe?' + query)).body.disposition).toBe(
      'UNCONFIRMED',
    );
    query.set('clientRequestId', randomUUID());
    expect((await request('/requests/original-probe?' + query)).body.disposition).toBe(
      'UNCONFIRMED',
    );
    query.set('clientRequestId', key);
    await sources.primaryAdmin.query("UPDATE u1_http_attempt SET epoch='old-epoch'");
    expect((await request('/requests/original-probe?' + query)).body.disposition).toBe(
      'UNCONFIRMED',
    );
  });
  it('현재 권한 403은 실행 종료 뒤에만 미접수로 대조하며 진행·기술 실패는 불명이다', async () => {
    await authenticate();
    const key = randomUUID();
    const original = {
      owner: 'EnterpriseAccess',
      operation: 'setOrderingContextPolicy',
      target: {
        kind: 'ENTERPRISE' as const,
        enterpriseRef: {
          owner: 'EnterpriseAccess',
          entity: 'Enterprise',
          id: 'not-related',
          revision: 1,
        },
      },
      clientRequestId: key,
    };
    const epoch = await store.currentEpoch();
    const context = {
      principalId: 'customer',
      audience: 'CUSTOMER' as const,
      actorAccountRef: {
        owner: 'IdentityRecovery',
        entity: 'Account',
        id: 'customer',
        revision: 1,
      },
      verifiedPersonRef: null,
      identityAssertionRef: {
        owner: 'IdentityRecovery',
        entity: 'IdentitySession',
        id: String((await store.list('IdentitySession'))[0]!.sessionId),
        revision: 1,
      },
      accessEvaluationRef: null,
      executionPermitRef: null,
      correlationId: randomUUID(),
      deadlineAt: new Date(Date.now() + 10000).toISOString(),
    };
    const attempts = new HttpAttempts(sources.primaryApp);
    const id = await attempts.begin(context, original, epoch);
    expect(await attempts.provenNotAccepted(context, original, epoch)).toBe(false);
    await attempts.finish(id, 'ACTION_DENIED', true);
    expect(await attempts.provenNotAccepted(context, original, epoch)).toBe(true);
    const running = await attempts.begin(context, original, epoch);
    expect(await attempts.provenNotAccepted(context, original, epoch)).toBe(false);
    await attempts.finish(running, 'SQL_UNKNOWN', true);
    expect(await attempts.provenNotAccepted(context, original, epoch)).toBe(false);
    await attempts.finish(running, 'ACTION_DENIED', true);
    expect(await attempts.provenNotAccepted(context, original, epoch)).toBe(false);
  });
  it('비원자적 구현·시간 경과·조회만으로 미접수 증거를 만들지 않는다', async () => {
    await authenticate();
    const attempts = new HttpAttempts(sources.primaryApp);
    const context = {
      principalId: 'customer',
      audience: 'CUSTOMER' as const,
      actorAccountRef: {
        owner: 'IdentityRecovery',
        entity: 'Account',
        id: 'customer',
        revision: 1,
      },
      verifiedPersonRef: null,
      identityAssertionRef: {
        owner: 'IdentityRecovery',
        entity: 'IdentitySession',
        id: String((await store.list('IdentitySession'))[0]!.sessionId),
        revision: 1,
      },
      accessEvaluationRef: null,
      executionPermitRef: null,
      correlationId: randomUUID(),
      deadlineAt: new Date(Date.now() - 10000).toISOString(),
    };
    const original = {
      owner: 'OrderAcceptance',
      operation: 'submitOrder',
      target: { kind: 'NONE' as const },
      clientRequestId: randomUUID(),
    };
    const epoch = await store.currentEpoch();
    const id = await attempts.begin(context, original, epoch);
    expect(await attempts.provenNotAccepted(context, original, epoch)).toBe(false);
    await attempts.finish(id, 'ACTION_DENIED', false);
    expect(await attempts.provenNotAccepted(context, original, epoch)).toBe(false);
    const rows = await sources.primaryAdmin.query('SELECT state FROM u1_http_attempt WHERE id=$1', [
      id,
    ]);
    expect(rows[0].state).toBe('UNKNOWN');
  });
  it('원래clientRequestId와target로보호된접수를찾고다른주체키는비노출404다', async () => {
    await authenticate();
    const key = randomUUID();
    const input = {
      meta: { clientRequestId: key, expectedRevision: null, reason: '원래 요청', evidenceRefs: [] },
      legalName: '합성A',
      designatedContact: 'a@example.invalid',
      registrationEvidenceRefs: [syntheticBasis],
    };
    const applied = await request('/enterprise-applications', input, { 'Idempotency-Key': key });
    expect(applied.response.status).toBe(202);
    const query = new URLSearchParams({
      owner: 'EnterpriseAccess',
      operation: 'applyEnterprise',
      target: JSON.stringify({ kind: 'NONE' }),
      clientRequestId: key,
    });
    const result = await request('/requests/original?' + query);
    expect(result.response.status).toBe(200);
    expect(result.body.requestId).toBe(applied.body.requestId);
    const probed = await request('/requests/original-probe?' + query);
    expect(probed.body.disposition).toBe('RECEIPT');
    expect(probed.body.receipt.requestId).toBe(applied.body.requestId);
    const otherClient = new SyntheticHttpClient(origin);
    await otherClient.authenticate('other');
    expect((await otherClient.request('/requests/original?' + query)).response.status).toBe(404);
  });
  it('보호된로그아웃후원래세션은401이며고객신청목록은자기신청만조회한다', async () => {
    await authenticate();
    const key = randomUUID();
    await request(
      '/enterprise-applications',
      {
        meta: { clientRequestId: key, expectedRevision: null, reason: '합성', evidenceRefs: [] },
        legalName: '합성A',
        designatedContact: 'a@example.invalid',
        registrationEvidenceRefs: [syntheticBasis],
      },
      { 'Idempotency-Key': key },
    );
    const own = await request('/enterprise-applications');
    expect(own.response.status).toBe(200);
    const ended = await request('/identity/session-endings', {
      targetRef: null,
      scope: null,
      cursor: null,
      pageSize: 25,
      sourceRevision: null,
    });
    expect(ended.response.status).toBe(202);
    expect((await request('/identity')).response.status).toBe(401);
  });

  it('타기업과존재하지않는기업관리요청은같은비노출404이고판단owner를호출하지않는다', async () => {
    await seedSyntheticAccount(store, 'staff', 'STAFF');
    await seedMinimumStaffManager(store, 'staff', now());
    const staffIdentity = new IdentityRecovery(store, new SyntheticIdentityProvider(), {
      synthetic: true,
      verifierKey: randomBytes(32),
      now,
      staffIngress: async (value) => value === 'synthetic-private-ingress',
    });
    const staffOrigin = 'http://127.0.0.1:34682';
    staffHost = await createApi(
      { ...owners, identity: staffIdentity },
      {
        audience: 'STAFF',
        origin: staffOrigin,
        cookieKey: randomBytes(32),
        localSynthetic: true,
        staffAdmission: async (incoming) =>
          incoming.socket.remoteAddress === '127.0.0.1' ? 'synthetic-private-ingress' : null,
      },
    );
    await staffHost.app.listen(34682, '127.0.0.1');
    const staffClient = new SyntheticHttpClient(staffOrigin);
    await staffClient.authenticate('staff');
    const staffRoleKey = randomUUID();
    const role = await staffClient.request(
      '/staff-roles',
      {
        meta: {
          clientRequestId: staffRoleKey,
          expectedRevision: null,
          reason: '합성 명시 승인 역할',
          evidenceRefs: [],
        },
        label: '기업 승인',
        actions: ['application.read', 'enterprise.approve'],
      },
      { 'Idempotency-Key': staffRoleKey },
    );
    expect(role.response.status).toBe(202);
    const grantKey = randomUUID();
    const staffAccount = (await store.read('Account', 'staff'))!;
    expect(
      (
        await staffClient.request(
          '/staff-role-grant-changes',
          {
            meta: {
              clientRequestId: grantKey,
              expectedRevision: null,
              reason: '합성 역할 부여',
              evidenceRefs: [],
            },
            accountRef: {
              owner: 'IdentityRecovery',
              entity: 'Account',
              id: 'staff',
              revision: staffAccount.revision,
            },
            roleRef: role.body.targetRef,
            decision: 'GRANT',
          },
          { 'Idempotency-Key': grantKey },
        )
      ).response.status,
    ).toBe(202);
    const otherClient = new SyntheticHttpClient(origin);
    await otherClient.authenticate('other');
    const applicationKey = randomUUID();
    const application = await otherClient.request(
      '/enterprise-applications',
      {
        meta: {
          clientRequestId: applicationKey,
          expectedRevision: null,
          reason: '합성B',
          evidenceRefs: [],
        },
        legalName: '합성기업B',
        designatedContact: 'b@example.invalid',
        registrationEvidenceRefs: [syntheticBasis],
      },
      { 'Idempotency-Key': applicationKey },
    );
    expect(application.response.status).toBe(202);
    const approvalKey = randomUUID();
    const approved = await staffClient.request(
      '/enterprise-applications/' + application.body.targetRef.id + '/decisions',
      {
        meta: {
          clientRequestId: approvalKey,
          expectedRevision: 1,
          reason: '합성 기업 확인',
          evidenceRefs: [],
        },
        targetRef: application.body.targetRef,
        decision: 'APPROVE',
        basisRefs: [syntheticBasis],
      },
      { 'Idempotency-Key': approvalKey, 'X-Target-Revision': '1' },
    );
    expect(approved.response.status).toBe(202);
    const enterprise = approved.body.resultRefs.find((value) => value.entity === 'Enterprise')!;
    await authenticate('customer');
    const existing = await request('/enterprises/' + enterprise.id);
    const absent = await request('/enterprises/missing-enterprise');
    expect(existing.response.status).toBe(404);
    expect(absent.response.status).toBe(404);
    expect(existing.body.type).toBe(absent.body.type);
    expect(existing.body.detail).toBe(absent.body.detail);
    for (const id of [enterprise.id, 'missing-enterprise']) {
      const key = randomUUID();
      const result = await request(
        '/enterprises/' + id + '/ordering-context-policy-changes',
        {
          meta: { clientRequestId: key, expectedRevision: 1, reason: '관계 밖', evidenceRefs: [] },
          departmentUsage: 'NOT_USED',
          siteUsage: 'NOT_USED',
        },
        { 'Idempotency-Key': key, 'X-Target-Revision': '1' },
      );
      expect(result.response.status).toBe(404);
      expect(result.body.type).toBe(existing.body.type);
    }
  });

  it('늦은 이전logout HTTP 응답cookie가 다른현재로그인/접점을지우지않는다', async () => {
    await authenticate('customer');
    let started!: () => void;
    const ready = new Promise<void>((done) => {
      started = done;
    });
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const original = owners.identity.logout.bind(owners.identity);
    const spy = vi.spyOn(owners.identity, 'logout').mockImplementation(async (token) => {
      await original(token);
      started();
      await gate;
    });
    const oldCookies = new Map(cookies);
    const pending = request('/identity/session-endings', {
      targetRef: null,
      scope: null,
      cursor: null,
      pageSize: 25,
      sourceRevision: null,
    });
    await Promise.race([
      ready,
      pending.then((value) => {
        throw new Error('logout handler 미진입 status ' + value.response.status);
      }),
    ]);
    try {
      await authenticate('other');
      const currentCookies = new Map(cookies);
      release();
      const ended = await pending;
      expect(ended.response.status).toBe(202);
      expect(ended.response.headers.getSetCookie()).toEqual([]);
      expect(cookies).toEqual(currentCookies);
      expect(cookies).not.toEqual(oldCookies);
      const identity = await request('/identity');
      expect(identity.response.status).toBe(200);
      expect(identity.body.data.accountRef.id).toBe('other');
      const current = new Map(cookies);
      cookies = oldCookies;
      expect((await request('/identity')).response.status).toBe(401);
      cookies = current;
      expect((await request('/identity')).body.data.accountRef.id).toBe('other');
    } finally {
      release();
      spy.mockRestore();
    }
  });
  it('늦은 이전 MFA 완료 응답이 새 계정의 쿠키를 되돌리지 않는다', async () => {
    await authenticate('customer');
    const first = await request('/identity/challenges', {
      loginIdentifier: 'customer@example.invalid',
    });
    const password = await request(
      '/identity/challenges/' + first.body.challengeId + '/responses',
      { challengeId: first.body.challengeId, response: syntheticPassword },
    );
    await refreshCsrf();
    let started!: () => void;
    const ready = new Promise<void>((done) => {
      started = done;
    });
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const original = owners.identity.publicView.bind(owners.identity);
    const spy = vi.spyOn(owners.identity, 'publicView').mockImplementation(async (outcome) => {
      if (outcome.phase === 'MFA_VERIFIED' && outcome.accountId === 'customer') {
        started();
        await gate;
      }
      return original(outcome);
    });
    const pending = request('/identity/challenges/' + password.body.challengeId + '/responses', {
      challengeId: password.body.challengeId,
      response: syntheticFactor,
    });
    await Promise.race([
      ready,
      pending.then((value) => {
        throw new Error('MFA hold 전 응답 ' + value.response.status);
      }),
    ]);
    try {
      await authenticate('other');
      const currentCookies = new Map(cookies);
      release();
      const stale = await pending;
      expect(stale.response.headers.getSetCookie()).toEqual([]);
      expect(cookies).toEqual(currentCookies);
      expect((await request('/identity')).body.data.accountRef.id).toBe('other');
    } finally {
      release();
      spy.mockRestore();
    }
  });
  it('이전 MFA 쿠키의 실제 늦은 수신은 옛 Account로 HTTP 인증하지 못한다', async () => {
    await authenticate('customer');
    const previous = new Map(cookies);
    await authenticate('other');
    const current = new Map(cookies);
    cookies = previous;
    const stale = await request('/identity');
    expect(stale.response.status).toBe(401);
    expect(stale.body.type).toBe('urn:oms:problem:browser_session_superseded');
    cookies = current;
    expect((await request('/identity')).body.data.accountRef.id).toBe('other');
  });
  it('password/MFA/코드 보관 확인을 실제HTTP로 연결하고 토큰은JSON에 노출하지 않는다', async () => {
    const finished = await authenticate();
    expect(finished.body.sessionToken).toBeUndefined();
    expect(cookies.has('__Host-oms-customer')).toBe(true);
    expect(
      finished.response.headers
        .getSetCookie()
        .every((value) => value.includes('Secure; HttpOnly; SameSite=Strict')),
    ).toBe(true);
    const current = await request('/identity');
    expect(current.response.status).toBe(200);
    expect(current.body.data.accountRef.id).toBe('customer');
    expect(current.response.headers.get('cache-control')).toContain('no-store');
    expect(current.response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    );
  });
  it('불완전 MFA는401이며 보호 업무 접수를 만들지 않는다', async () => {
    const input = {
      meta: {
        clientRequestId: randomUUID(),
        expectedRevision: null,
        reason: '합성',
        evidenceRefs: [],
      },
      legalName: '합성A',
      designatedContact: 'a@example.invalid',
      registrationEvidenceRefs: [syntheticBasis],
    };
    const result = await request('/enterprise-applications', input, {
      'Idempotency-Key': input.meta.clientRequestId,
    });
    expect(result.response.status).toBe(401);
    expect(await store.list('EnterpriseApplication')).toHaveLength(0);
  });
  it('Origin/CSRF 오류는403이고 client principal/MFA/망 위조는400이다', async () => {
    for (const headers of [
      { Origin: 'https://attacker.invalid' },
      { 'X-CSRF-Token': 'wrong' },
    ] as Record<string, string>[])
      expect(
        (
          await request(
            '/identity/challenges',
            { loginIdentifier: 'customer@example.invalid' },
            headers,
          )
        ).response.status,
      ).toBe(403);
    expect(
      (
        await request(
          '/identity/challenges',
          { loginIdentifier: 'customer@example.invalid' },
          { 'X-Principal-Id': 'admin' },
        )
      ).response.status,
    ).toBe(400);
    expect(await store.list('IdentitySession')).toHaveLength(0);
  });
  it('canonical 미등록 입력과 경로/challenge 불일치는400이다', async () => {
    expect(
      (
        await request('/identity/challenges', {
          loginIdentifier: 'customer@example.invalid',
          role: 'admin',
        })
      ).response.status,
    ).toBe(400);
    expect(
      (
        await request('/identity/challenges/original/responses', {
          challengeId: 'different',
          response: syntheticPassword,
        })
      ).response.status,
    ).toBe(400);
  });
  it('기업 신청→원래 접수/신청 조회는보호후202/200이며다른내용같은키409이다', async () => {
    await authenticate();
    const key = randomUUID();
    const input = {
      meta: { clientRequestId: key, expectedRevision: null, reason: '합성 가입', evidenceRefs: [] },
      legalName: '합성A',
      designatedContact: 'a@example.invalid',
      registrationEvidenceRefs: [syntheticBasis],
    };
    const applied = await request('/enterprise-applications', input, { 'Idempotency-Key': key });
    expect(applied.response.status).toBe(202);
    expect(applied.body.requestState).toBe('REVIEW_REQUIRED');
    const receipt = await request('/requests/' + applied.body.requestId);
    expect(receipt.response.status).toBe(200);
    expect(receipt.body.requestId).toBe(applied.body.requestId);
    const application = await request('/enterprise-applications/' + applied.body.targetRef.id);
    expect(application.response.status).toBe(200);
    expect(application.body.data.state).toBe('PENDING');
    expect(
      (
        await request(
          '/enterprise-applications',
          { ...input, legalName: '다른 내용' },
          { 'Idempotency-Key': key },
        )
      ).response.status,
    ).toBe(409);
  });
  it('CUSTOMER host에서직원operation을제공하지않으며등록안된경로404이다', async () => {
    await authenticate();
    expect((await request('/enterprise-applications')).response.status).toBe(200);
    expect((await request('/enterprise-applications/foreign/decisions', {})).response.status).toBe(
      404,
    );
    expect((await request('/products', { unexpected: true })).response.status).toBe(404);
    expect((await request('/internal/bootstrap', {})).response.status).toBe(404);
  });
  it('원장장애readiness는조회와보호변경을분리하고복구인증fence는503이다', async () => {
    expect((await request('/health/ready/read')).response.status).toBe(200);
    await sources.primaryAdmin.query('UPDATE u1_recovery_control SET auth_ready=false');
    const result = await request('/health/ready/read');
    expect(result.response.status).toBe(503);
    expect(result.response.headers.get('content-type')).toContain('application/problem+json');
    expect(result.body.status).toBe(503);
    expect(result.body.detail).not.toContain('u1_recovery_control');
  });
});
