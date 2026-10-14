import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import type { VaultBinding } from '@oms/persistence';
import type { Ref } from '@oms/contracts';
import { ref } from '@oms/core';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedVerifiedRecoveryParty, seedSyntheticAccount } from '../fixtures/identity.js';
import { u2Meta } from '../fixtures/enterprise.js';
import { u2HttpHost } from '../fixtures/http.js';
import { StatefulRecoveryProvider, syntheticPassword } from '../fixtures/provider.js';
describe('실제 HTTP 당사자→단회 claim→제한 목적 cookie', () => {
  const sources = u2Sources(),
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  let host: Awaited<ReturnType<typeof u2HttpHost>> | undefined;
  beforeAll(async () => {
    await initializeU2Databases();
    for (const s of Object.values(sources)) await s.initialize();
  });
  beforeEach(async () => resetU2Databases(sources.primaryAdmin, sources.journalAdmin));
  afterEach(async () => {
    await host?.app.close();
    host = undefined;
    vi.useRealTimers();
  });
  afterAll(async () => {
    for (const s of Object.values(sources)) if (s.isInitialized) await s.destroy();
  });
  async function setup(provider?: StatefulRecoveryProvider) {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    host = await u2HttpHost(store, f, 'CUSTOMER', true, provider);
    await host.client.refreshCsrf();
    return { f, ...host };
  }
  async function party(provider?: StatefulRecoveryProvider) {
    const h = await setup(provider),
      challenge = await h.client.request<{ challengeId: string }>('/identity/party-challenges', {});
    expect(challenge.response.status).toBe(200);
    const created = await h.client.request<{
      partyContextRef: Ref;
      challengeId: string;
      partySecret?: string;
    }>(
      `/identity/recovery-cases/${h.f.source.caseId}/party-contexts`,
      { caseRef: ref('RecoveryCase', h.f.source), challengeId: challenge.body.challengeId },
      { 'X-Target-Revision': '1' },
    );
    expect(created.response.status).toBe(200);
    expect(created.body.partySecret).toBeUndefined();
    expect(
      created.response.headers
        .getSetCookie()
        .some(
          (value) =>
            value.startsWith('__Host-oms-customer-party=') &&
            value.includes('Secure; HttpOnly; SameSite=Strict'),
        ),
    ).toBe(true);
    await h.client.refreshCsrf();
    return { ...h, created: created.body };
  }
  async function issued(provider?: StatefulRecoveryProvider, advanceBeforeClaim = false) {
    const h = await party(provider),
      evidence = {
        ...h.f.evidence,
        revision: 2,
        partyContextRef: h.created.partyContextRef,
        challengeId: h.created.challengeId,
      };
    await h.f.execute('fixture-http-confirmed-party-observation', async (tx) =>
      tx.put('VerificationEvidence', evidence, 1),
    );
    await h.f.handoffs.verifyParty(h.f.staff, {
      ...h.f.verifyInput,
      partyContextRef: h.created.partyContextRef,
      evidenceRefs: [ref('VerificationEvidence', evidence)],
    });
    const verified = (await store.currentProtected('RecoveryCase', h.f.source.caseId))!,
      receipt = await h.f.handoffs.issue(h.f.staff, {
        meta: u2Meta(2),
        caseRef: ref('RecoveryCase', verified),
        verificationRef: verified.verificationRef as Ref,
        partyContextRef: verified.partyContextRef as Ref,
        deliveryRouteRef: ref('RegisteredContact', h.f.contact),
      }),
      grant = (await store.currentProtected('RecoveryHandoffGrant', receipt.targetRef!.id))!,
      binding = (
        await sources.vault.query('SELECT binding FROM u2_vault.material WHERE id=$1', [
          grant.vaultRef,
        ])
      )[0].binding as VaultBinding,
      bytes = await h.f.vault.read(binding, {
        authorityRef: receipt.targetRef!,
        targetRef: receipt.targetRef!,
        purpose: 'HANDOFF',
        operation: 'identity.handoff.deliver',
        epoch: String(grant.epoch),
        deadlineAt: new Date(Date.now() + 10000).toISOString(),
      }),
      code = bytes.toString();
    bytes.fill(0);
    if (advanceBeforeClaim) vi.setSystemTime(Date.now() + 120000);
    return {
      ...h,
      grant,
      code,
      input: {
        meta: u2Meta(1),
        grantRef: receipt.targetRef!,
        caseRef: grant.caseRef as Ref,
        challengeId: h.created.challengeId,
        code,
      },
    };
  }
  async function claimed(provider?: StatefulRecoveryProvider, advanceBeforeClaim = false) {
    const h = await issued(provider, advanceBeforeClaim),
      result = await h.client.request<{
        claimReceiptRef: Ref;
        authorityRef: Ref;
        expiresAt: string;
        phase: string;
        handle?: string;
      }>(`/identity/handoffs/${h.grant.grantId}/claims`, h.input, {
        'Idempotency-Key': h.input.meta.clientRequestId,
        'X-Target-Revision': '1',
      });
    expect(result.response.status).toBe(200);
    expect(result.body.phase).toBe('ENROLMENT_ONLY');
    expect(result.body.handle).toBeUndefined();
    await h.client.refreshCsrf();
    return { ...h, result };
  }
  it('서버에 없는 challenge는 당사자/보안 세대/일반 세션을 변경하지 않는다', async () => {
    const h = await setup(),
      before = (await store.list('AccountSecurityState'))[0]!,
      count = (await store.list('PartyClaimContext')).length;
    const result = await h.client.request(
      `/identity/recovery-cases/${h.f.source.caseId}/party-contexts`,
      { caseRef: ref('RecoveryCase', h.f.source), challengeId: randomUUID() },
      { 'X-Target-Revision': '1' },
    );
    expect(result.response.status).toBe(401);
    expect(await store.list('PartyClaimContext')).toHaveLength(count);
    expect(
      (await store.currentProtected('AccountSecurityState', String(before.securityStateId)))!
        .securityGeneration,
    ).toBe(before.securityGeneration);
  });
  it('실제 보호 claim은 원래 cookie/당사자에서 단회이며 handle·party secret는 JSON/일반 session에 없다', async () => {
    const h = await claimed();
    expect(
      h.result.response.headers
        .getSetCookie()
        .some(
          (value) =>
            value.startsWith('__Host-oms-customer-purpose=') &&
            value.includes('Secure; HttpOnly; SameSite=Strict'),
        ),
    ).toBe(true);
    expect(h.client.cookieSnapshot().some((cookie) => cookie.name === '__Host-oms-customer')).toBe(
      false,
    );
    const own = await h.client.request<{ authorityRef: Ref }>(
      `/identity/claims/${h.result.body.claimReceiptRef.id}`,
    );
    expect(own.response.status).toBe(200);
    expect(own.body.authorityRef.id).toBe(h.result.body.authorityRef.id);
    expect((await h.client.request('/identity')).response.status).toBe(401);
    expect((await h.client.request(`/identity/claims/${randomUUID()}`)).response.status).toBe(404);
    expect(JSON.stringify(h.result.body)).not.toContain(h.code);
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
  });
  it('복사한 목적 cookie는 다른 browser/접점에서 권위가 되지 않는다', async () => {
    const h = await claimed(),
      snapshot = h.client.cookieSnapshot(),
      onlyPurpose = snapshot
        .filter((c) => c.name.endsWith('-purpose'))
        .map((c) => c.name + '=' + c.value)
        .join('; ');
    const other = await fetch('http://127.0.0.1:34782/security/csrf');
    const browser = other.headers.getSetCookie()[0]!.split(';')[0]!;
    const response = await fetch(
      `http://127.0.0.1:34782/identity/claims/${h.result.body.claimReceiptRef.id}`,
      { headers: { Cookie: onlyPurpose + '; ' + browser } },
    );
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(h.result.body.authorityRef.id);
  });
  it('클라이언트 partySecret나 다른 challenge는 code를 소비하지 않는다', async () => {
    const h = await issued();
    for (const extra of [{ partySecret: 'a'.repeat(43) }, { challengeId: randomUUID() }])
      expect(
        (
          await h.client.request(
            `/identity/handoffs/${h.grant.grantId}/claims`,
            { ...h.input, ...extra },
            { 'Idempotency-Key': h.input.meta.clientRequestId, 'X-Target-Revision': '1' },
          )
        ).response.status,
      ).toBeLessThan(500);
    expect(
      (await store.currentProtected('RecoveryHandoffGrant', String(h.grant.grantId)))!.attemptCount,
    ).toBe(0);
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
  it('HOLD는 자신의 원래 상태 읽기만 허용하고 완료/새 effect는 차단한다', async () => {
    const h = await claimed(),
      authority = (await store.currentProtected(
        'EnrollmentAuthority',
        h.result.body.authorityRef.id,
      ))!,
      source = (await store.currentProtected('RecoveryCase', h.f.source.caseId))!;
    await h.f.execute('fixture-http-original-unknown', async (tx) => {
      await tx.put(
        'EnrollmentAuthority',
        { ...authority, state: 'HOLD', revision: Number(authority.revision) + 1 },
        Number(authority.revision),
      );
      await tx.put(
        'RecoveryCase',
        {
          ...source,
          state: 'HOLD',
          holdReason: 'ORIGINAL_EFFECT_UNKNOWN',
          revision: Number(source.revision) + 1,
        },
        Number(source.revision),
      );
    });
    const view = await h.client.request<{ knowledge: string; actualEffect: string }>(
      `/identity/recovery-cases/${h.f.source.caseId}`,
    );
    expect(view.response.status).toBe(200);
    expect(view.body).toMatchObject({ knowledge: 'UNKNOWN', actualEffect: 'UNCONFIRMED' });
    const current = (await store.currentProtected('RecoveryCase', h.f.source.caseId))!,
      input = {
        meta: u2Meta(Number(current.revision)),
        caseRef: ref('RecoveryCase', current),
        providerResultRefs: [],
      };
    expect(
      (
        await h.client.request(`/identity/recovery-cases/${h.f.source.caseId}/completions`, input, {
          'Idempotency-Key': input.meta.clientRequestId,
          'X-Target-Revision': String(current.revision),
        })
      ).response.status,
    ).toBe(401);
    expect(await store.list('IdentityOperationResult')).toHaveLength(0);
  });
  it('늦은 이전 당사자 응답은 새 로그인 cookie를 덮어쓰지 않는다', async () => {
    const h = await setup(),
      challenge = await h.client.request<{ challengeId: string }>('/identity/party-challenges', {});
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      original = h.owners.identity.createPartyContext.bind(h.owners.identity),
      spy = vi
        .spyOn(h.owners.identity, 'createPartyContext')
        .mockImplementation(async (...args) => {
          const result = await original(...args);
          entered();
          await gate;
          return result;
        });
    const pending = h.client.request(
      `/identity/recovery-cases/${h.f.source.caseId}/party-contexts`,
      { caseRef: ref('RecoveryCase', h.f.source), challengeId: challenge.body.challengeId },
      { 'X-Target-Revision': '1' },
    );
    await Promise.race([
      ready,
      pending.then(() => {
        throw new Error('당사자 owner에 진입하지 않았습니다.');
      }),
    ]);
    try {
      const id = randomUUID();
      await seedSyntheticAccount(store, id, 'CUSTOMER');
      await h.client.authenticate(id);
      const current = h.client.cookieSnapshot();
      release();
      const result = await pending;
      expect(result.response.status).toBe(409);
      expect(result.response.headers.getSetCookie()).toEqual([]);
      expect(h.client.cookieSnapshot()).toEqual(current);
    } finally {
      release();
      spy.mockRestore();
    }
  });
  it('현재 source의 실제 HTTP password→새 TOTP→10코드 보관→완료 conjunction 후에만 새 일반 MFA가 성립한다', async () => {
    const provider = new StatefulRecoveryProvider(),
      h = await claimed(provider);
    let source = (await store.currentProtected('RecoveryCase', h.f.source.caseId))!;
    const prepare = { meta: u2Meta(Number(source.revision)), caseRef: ref('RecoveryCase', source) };
    expect(
      (
        await h.client.request(
          `/identity/recovery-cases/${h.f.source.caseId}/provider-work`,
          prepare,
          {
            'Idempotency-Key': prepare.meta.clientRequestId,
            'X-Target-Revision': String(source.revision),
          },
        )
      ).response.status,
    ).toBe(202);
    const work = await store.list('WorkItem', {
      equals: { owner: 'IdentityRecovery', targetRef: { id: h.f.source.caseId } },
    });
    for (const row of work) await h.owners.identityConsumer!.consume(String(row.workId));
    source = (await store.currentProtected('RecoveryCase', h.f.source.caseId))!;
    const start = await h.client.request<{ challengeId: string }>('/identity/challenges', {
        loginIdentifier: h.f.customer.principalId + '@example.invalid',
      }),
      password = await h.client.request<{ challengeId: string; phase: string }>(
        `/identity/challenges/${start.body.challengeId}/responses`,
        { challengeId: start.body.challengeId, response: syntheticPassword },
      );
    expect(password.response.status).toBe(200);
    expect(password.body.phase).toBe('MFA_REQUIRED');
    await h.client.refreshCsrf();
    expect(
      (await h.client.request(`/identity/claims/${h.result.body.claimReceiptRef.id}`)).response
        .status,
    ).toBe(200);
    const began = await h.client.request<{ enrollmentRef: Ref; secret: string }>(
      `/identity/recovery-cases/${h.f.source.caseId}/enrollments`,
      { caseRef: ref('RecoveryCase', source), passwordChallengeId: password.body.challengeId },
      { 'X-Target-Revision': String(source.revision) },
    );
    expect(began.response.status).toBe(202);
    expect(typeof began.body.secret).toBe('string');
    const target = provider.calls[0]!.target;
    const verified = await h.client.request<{ enrollmentRef: Ref; providerResultRef: Ref }>(
      `/identity/recovery-cases/${h.f.source.caseId}/enrollment-verifications`,
      {
        caseRef: ref('RecoveryCase', source),
        enrollmentRef: began.body.enrollmentRef,
        response: provider.code(target),
      },
      { 'X-Target-Revision': String(source.revision) },
    );
    expect(verified.response.status).toBe(202);
    const codes = await h.client.request<{ codeSetRef: Ref; codes: string[] }>(
      `/identity/recovery-cases/${h.f.source.caseId}/recovery-code-issues`,
      { caseRef: ref('RecoveryCase', source), enrollmentRef: verified.body.enrollmentRef },
      { 'X-Target-Revision': String(source.revision) },
    );
    expect(codes.response.status).toBe(202);
    expect(codes.body.codes.length).toBe(10);
    expect(new Set(codes.body.codes).size).toBe(10);
    expect((await h.client.request('/identity')).response.status).toBe(401);
    const ack = await h.client.request<Ref>(
      `/identity/recovery-cases/${h.f.source.caseId}/recovery-code-acknowledgements`,
      {
        caseRef: ref('RecoveryCase', source),
        enrollmentRef: verified.body.enrollmentRef,
        codeSetRef: codes.body.codeSetRef,
        stored: true,
      },
      { 'X-Target-Revision': String(source.revision) },
    );
    expect(ack.response.status).toBe(202);
    const results = await Promise.all(
        work.map(async (row) =>
          ref(
            'IdentityOperationResult',
            (await store.currentProtected('IdentityOperationResult', String(row.workId)))!,
          ),
        ),
      ),
      input = {
        meta: u2Meta(Number(source.revision)),
        caseRef: ref('RecoveryCase', source),
        enrollmentRef: verified.body.enrollmentRef,
        codeSetRef: ack.body,
        providerResultRefs: [...results, verified.body.providerResultRef],
      };
    const complete = await h.client.request(
      `/identity/recovery-cases/${h.f.source.caseId}/completions`,
      input,
      {
        'Idempotency-Key': input.meta.clientRequestId,
        'X-Target-Revision': String(source.revision),
      },
    );
    expect(complete.response.status).toBe(202);
    expect((await store.currentProtected('RecoveryCase', h.f.source.caseId))!.state).toBe(
      'COMPLETED',
    );
    expect((await h.client.request('/identity')).response.status).toBe(401);
    const fresh = await h.client.request<{ challengeId: string; type?: string }>(
      '/identity/challenges',
      { loginIdentifier: h.f.customer.principalId + '@example.invalid' },
    );
    if (fresh.response.status !== 200)
      throw new Error('새 로그인 시작 ' + fresh.response.status + ' ' + fresh.body.type);
    const proof = await h.client.request<{ challengeId: string; type?: string }>(
      `/identity/challenges/${fresh.body.challengeId}/responses`,
      { challengeId: fresh.body.challengeId, response: syntheticPassword },
    );
    if (proof.response.status !== 200)
      throw new Error('새 password 응답 ' + proof.response.status + ' ' + proof.body.type);
    await h.client.refreshCsrf();
    const factor = await h.client.request<{ phase: string; type?: string }>(
      `/identity/challenges/${proof.body.challengeId}/responses`,
      { challengeId: proof.body.challengeId, response: provider.code(target) },
    );
    if (factor.response.status !== 200)
      throw new Error('새 MFA 응답 ' + factor.response.status + ' ' + factor.body.type);
    expect(factor.body.phase).toBe('MFA_VERIFIED');
    expect((await h.client.request('/identity')).response.status).toBe(200);
  });
  it('응답 유실 뒤 expired Party는 원래 보호 claim의 남은5분 결과만 재관측하고 새 claim/handle/업무 session을 만들지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const initial = Date.now(),
      h = await claimed(undefined, true),
      authority = (await store.currentProtected(
        'EnrollmentAuthority',
        h.result.body.authorityRef.id,
      ))!,
      originalExpiry = authority.expiresAt,
      count = (await store.list('ClaimReceipt')).length;
    const cookies = h.client
      .cookieSnapshot()
      .filter((cookie) => !cookie.name.endsWith('-purpose'))
      .map((cookie) => cookie.name + '=' + cookie.value)
      .join('; ');
    vi.setSystemTime(initial + 300001);
    const read = await h.client.request<{
      claimReceiptRef: Ref;
      authorityRef: Ref;
      expiresAt: string;
      handle?: string;
    }>('/identity/handoff-result', undefined, { Cookie: cookies });
    expect(read.response.status).toBe(200);
    expect(read.body.claimReceiptRef).toEqual(h.result.body.claimReceiptRef);
    expect(read.body.authorityRef).toEqual(h.result.body.authorityRef);
    expect(read.body.expiresAt).toBe(originalExpiry);
    expect(read.body.handle).toBeUndefined();
    expect(await store.list('ClaimReceipt')).toHaveLength(count);
    expect(
      (await store.currentProtected('EnrollmentAuthority', h.result.body.authorityRef.id))!
        .expiresAt,
    ).toBe(originalExpiry);
    expect((await h.client.request('/identity')).response.status).toBe(401);
    await h.client.refreshCsrf();
    const mutation = await h.client.request(
      `/identity/handoffs/${h.grant.grantId}/claims`,
      h.input,
      { 'Idempotency-Key': h.input.meta.clientRequestId, 'X-Target-Revision': '1' },
    );
    expect(mutation.response.status).toBe(401);
    expect(
      (
        await h.client.request('/identity/handoff-result?grantId=another', undefined, {
          Cookie: cookies,
        })
      ).response.status,
    ).toBe(400);
    expect(
      (
        await h.client.request('/identity/handoff-result', undefined, {
          Cookie: cookies,
          Origin: 'https://attacker.invalid',
        })
      ).response.status,
    ).toBe(403);
    const holder = h.client.cookieSnapshot().find((cookie) => cookie.name.endsWith('-party'))!,
      other = await fetch('http://127.0.0.1:34782/security/csrf'),
      browser = other.headers.getSetCookie()[0]!.split(';')[0]!;
    expect(
      (
        await fetch('http://127.0.0.1:34782/identity/handoff-result', {
          headers: {
            Cookie: holder.name + '=' + holder.value + '; ' + browser,
            Origin: 'http://127.0.0.1:34782',
          },
        })
      ).status,
    ).toBe(401);
    vi.setSystemTime(Date.parse(String(originalExpiry)));
    expect(
      (await h.client.request('/identity/handoff-result', undefined, { Cookie: cookies })).response
        .status,
    ).toBe(403);
  });
  it('원래 claim 없는 expired Party는 continuation을 새 권위로 승격하지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const at = Date.now(),
      h = await party(),
      cookies = h.client
        .cookieSnapshot()
        .map((cookie) => cookie.name + '=' + cookie.value)
        .join('; ');
    vi.setSystemTime(at + 300001);
    expect(
      (await h.client.request('/identity/handoff-result', undefined, { Cookie: cookies })).response
        .status,
    ).toBe(401);
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
  for (const state of ['HOLD', 'REVOKED'] as const)
    it(
      '현재 ' + state + ' Authority는 원래 continuation의 handle 재관측을 허용하지 않는다',
      async () => {
        const h = await claimed(),
          authority = (await store.currentProtected(
            'EnrollmentAuthority',
            h.result.body.authorityRef.id,
          ))!;
        await h.f.execute('fixture-continuation-current-' + state, async (tx) =>
          tx.put(
            'EnrollmentAuthority',
            { ...authority, state, revision: Number(authority.revision) + 1 },
            Number(authority.revision),
          ),
        );
        const result = await h.client.request('/identity/handoff-result');
        expect(result.response.status).toBe(state === 'HOLD' ? 401 : 403);
        expect(result.response.headers.getSetCookie()).toEqual([]);
        expect(await store.list('ClaimReceipt')).toHaveLength(1);
      },
    );
  it('새 generation과 vault 읽기 뒤 현재성 변경은 원래 continuation 응답의 secret cookie도 반환하지 않는다', async () => {
    const h = await claimed(),
      read = h.f.vault.read.bind(h.f.vault);
    let changed = false;
    h.f.vault.read = async (...args) => {
      const bytes = await read(...args);
      if (args[0].purpose === 'ENROLLMENT_HANDLE' && !changed) {
        changed = true;
        const security = (
          await store.list('AccountSecurityState', {
            equals: { accountRef: { id: h.f.customer.principalId } },
            limit: 2,
          })
        )[0]!;
        await h.f.execute('fixture-continuation-generation-race', async (tx) =>
          tx.put(
            'AccountSecurityState',
            {
              ...security,
              securityGeneration: Number(security.securityGeneration) + 1,
              revision: Number(security.revision) + 1,
            },
            Number(security.revision),
          ),
        );
      }
      return bytes;
    };
    try {
      const result = await h.client.request('/identity/handoff-result');
      expect(result.response.status).toBe(401);
      expect(result.response.headers.getSetCookie()).toEqual([]);
      expect(await store.list('ClaimReceipt')).toHaveLength(1);
    } finally {
      h.f.vault.read = read;
    }
  });
});
