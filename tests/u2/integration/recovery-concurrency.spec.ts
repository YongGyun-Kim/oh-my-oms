import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import {
  ProtectedStore,
  PurposeSecretVault,
  authorizeProtectedVault,
  restoreFromJournal,
  u2CodeSecurityStateId,
} from '@oms/persistence';
import {
  RecoveryCases,
  SavedCodeRecoveries,
  IdentityRecovery,
  PartyClaimContexts,
  RecoveryHandoffs,
  EnrollmentAuthorities,
  PurposeVerifier,
  IdentityBrowser,
  generatePurposeSecret,
  ref,
} from '@oms/core';
import {
  SyntheticIdentityProvider,
  syntheticPassword,
  syntheticFactor,
} from '../../u1/fixtures/identity.js';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2Enterprise } from '../fixtures/enterprise.js';
describe('본인 확인 전 접수의 비노출/단회와 원본 보호', () => {
  const sources = u2Sources(),
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  beforeAll(async () => {
    await initializeU2Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => resetU2Databases(sources.primaryAdmin, sources.journalAdmin));
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  async function fixture() {
    const g = await seedU2Enterprise(store),
      seen: string[] = [],
      service = new RecoveryCases(
        store,
        randomBytes(32),
        g.now,
        async (proof) => proof === 'synthetic-private-ingress',
        async (digest) => {
          seen.push(digest);
        },
      ),
      context = {
        attemptId: randomUUID(),
        audience: 'CUSTOMER' as const,
        correlationId: randomUUID(),
        deadlineAt: new Date(Date.now() + 10000).toISOString(),
      },
      browser = generatePurposeSecret('PARTY_BROWSER'),
      input = { loginIdentifier: g.customer.principalId + '@example.invalid' },
      request = (selected = input, pre = context) =>
        IdentityBrowser.run({ current: browser }, () => service.request(pre, selected));
    return { ...g, service, seen, context, browser, input, request };
  }
  it('알려진 대상도 익명 접수자의 party/authority로 승격하지 않고 세대/업무 session을 유지한다', async () => {
    const f = await fixture(),
      receipt = await f.request(),
      source = (await store.list('RecoveryCase'))[0]!;
    expect(receipt).toMatchObject({ requestState: 'ACCEPTED', targetRef: null, resultRefs: [] });
    expect(source).toMatchObject({
      state: 'REQUESTED',
      verificationRef: null,
      partyContextRef: null,
      enrollmentAuthorityRef: null,
    });
    expect(await store.list('RecoveryHandoffGrant')).toHaveLength(0);
    expect(await store.list('PartyClaimContext')).toHaveLength(0);
    expect(
      (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]?.securityGeneration,
    ).toBe(1);
    await expect(f.access.authorization.identity(f.customer)).resolves.toMatchObject({
      active: true,
    });
  });
  it('없는 계정과 알려진 계정의 wire receipt는 같은 최소 형태이며 account/case Ref를 노출하지 않는다', async () => {
    const f = await fixture(),
      known = await f.request(),
      unknown = await f.request(
        { loginIdentifier: 'absent@example.invalid' },
        { ...f.context, attemptId: randomUUID() },
      );
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(known).sort());
    for (const receipt of [known, unknown])
      expect(receipt).toMatchObject({ requestState: 'ACCEPTED', targetRef: null, resultRefs: [] });
    expect(await store.list('RecoveryCase')).toHaveLength(1);
  });
  it('원래 요청 key의 재관측과 동시 요청은 한 접수 원본만 만든다', async () => {
    const f = await fixture(),
      results = await Promise.all([f.request(), f.request()]);
    expect(results[0]!.requestId).toBe(results[1]!.requestId);
    expect((await f.request()).requestId).toBe(results[0]!.requestId);
    expect(await store.list('RecoveryCase')).toHaveLength(1);
  });
  it('같은 요청 key의 다른 입력은 접수 내용을 몰래 교체하지 않는다', async () => {
    const f = await fixture();
    await f.request();
    await expect(f.request({ loginIdentifier: 'other@example.invalid' })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(await store.list('RecoveryCase')).toHaveLength(1);
  });
  it('STAFF 접수는 private ingress를 먼저 요구하며 고객 binding을 직원으로 재해석하지 않는다', async () => {
    const f = await fixture(),
      pre = { ...f.context, audience: 'STAFF' as const };
    await expect(
      IdentityBrowser.run({ current: f.browser }, () => f.service.request(pre, f.input)),
    ).rejects.toMatchObject({ code: 'STAFF_INGRESS_REQUIRED' });
    const receipt = await IdentityBrowser.run({ current: f.browser }, () =>
      f.service.request(pre, f.input, 'synthetic-private-ingress'),
    );
    expect(receipt.targetRef).toBeNull();
    expect(await store.list('RecoveryCase')).toHaveLength(0);
  });
  it('caller verified/system 속성·만료·브라우저 문맥 부재는 case를 만들지 않는다', async () => {
    const f = await fixture();
    await expect(f.request({ ...f.input, verified: true } as typeof f.input)).rejects.toMatchObject(
      { code: 'INVALID_INPUT' },
    );
    await expect(
      f.request(f.input, { ...f.context, deadlineAt: new Date(Date.now() - 1).toISOString() }),
    ).rejects.toMatchObject({ code: 'RECOVERY_REQUEST_EXPIRED' });
    await expect(f.service.request(f.context, f.input)).rejects.toMatchObject({
      code: 'BROWSER_BINDING_REQUIRED',
    });
    expect(await store.list('RecoveryCase')).toHaveLength(0);
  });
  it('raw response/identifier는 보호 후보나 admission 계측에 복제하지 않는다', async () => {
    const f = await fixture(),
      secret = randomBytes(32).toString('base64url');
    await f.request({ ...f.input, recoveryResponse: secret } as typeof f.input);
    const text = JSON.stringify(
      await sources.journalAdmin.query('SELECT payload_text FROM u1_protected_entry'),
    );
    expect(text.includes(secret)).toBe(false);
    expect(text.includes(f.input.loginIdentifier)).toBe(true);
    /* Account 원본 자체의 기존 식별자다. 접수 safe input은 digest만 가진다. */ const rows =
      await sources.primaryAdmin.query(
        "SELECT payload_text FROM u1_recovery_candidate WHERE payload_text LIKE '%requestRecovery%'",
      );
    expect(JSON.stringify(rows).includes(f.input.loginIdentifier)).toBe(false);
    expect(f.seen.every((digest) => /^[a-f0-9]{64}$/.test(digest))).toBe(true);
  });
  it('미보호 대상 변경은 옛 active source로 성공 접수하지 않는다', async () => {
    const f = await fixture();
    await sources.primaryAdmin
      .getRepository('Account')
      .update({ accountId: f.customer.principalId }, { active: false, revision: 2 });
    await expect(f.request()).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    expect(await store.list('RecoveryCase')).toHaveLength(0);
  });
  it('response를 바꿔도 같은 audience/identifier admission key를 우회하지 않는다', async () => {
    const f = await fixture();
    await f.request();
    await f.request({ ...f.input, recoveryResponse: randomUUID() } as typeof f.input, {
      ...f.context,
      attemptId: randomUUID(),
    });
    expect(f.seen).toHaveLength(2);
    expect(f.seen[0] === f.seen[1]).toBe(true);
  });
  async function direct(
    registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED' = 'LOCAL_SYNTHETIC',
    activeStore = store,
    audience: 'CUSTOMER' | 'STAFF' = 'CUSTOMER',
  ) {
    const g = await seedU2Enterprise(activeStore),
      account = audience === 'STAFF' ? g.staff : g.customer,
      ingress = audience === 'STAFF' ? 'synthetic-private-ingress' : null,
      browser = generatePurposeSecret('PARTY_BROWSER'),
      verifier = new PurposeVerifier(randomBytes(32), 'fixture-verifier');
    const vault = new PurposeSecretVault(
        sources.vault,
        randomBytes(32),
        'fixture-vault',
        async (b, p, a) => {
          await authorizeProtectedVault(activeStore, b, p, a);
          if (
            b.purpose === 'HANDOFF' &&
            a !== 'DESTROY' &&
            p.operation !== 'identity.handoff.prepare'
          )
            await handoffs.assertDelivery(b.targetRef);
        },
      ),
      parties = new PartyClaimContexts(activeStore, verifier, g.now, async () => false),
      authorities = new EnrollmentAuthorities(activeStore, verifier, g.now, async () => false),
      savedCodes = new SavedCodeRecoveries(activeStore, verifier, vault, g.now, registration);
    const handoffs = new RecoveryHandoffs(
      activeStore,
      verifier,
      vault,
      g.now,
      'LOCAL_SYNTHETIC',
      parties,
    );
    const identity = new IdentityRecovery(
      activeStore,
      new SyntheticIdentityProvider(),
      {
        synthetic: true,
        verifierKey: randomBytes(32),
        now: g.now,
        staffIngress: async (proof) => proof === 'synthetic-private-ingress',
      },
      { parties, handoffs, authorities, savedCodes },
    );
    const prepared = await IdentityBrowser.run({ current: browser, next: browser }, async () => {
      const login = await identity.login(
        audience,
        account.principalId + '@example.invalid',
        syntheticPassword,
        'synthetic-u2-peer',
        ingress,
      );
      await identity.verifyFactor(
        login.challengeId!,
        syntheticFactor,
        'synthetic-u2-peer',
        ingress,
        true,
      );
      const codes = await identity.issueRecoveryCodes(login.challengeId!, ingress);
      await identity.acknowledgeRecoveryCodes(login.challengeId!, codes.setId, true, ingress);
      const password = await identity.login(
          audience,
          account.principalId + '@example.invalid',
          syntheticPassword,
          'synthetic-u2-peer',
          ingress,
        ),
        caseRef = await identity.prepareSavedRecovery(password.challengeId!, ingress);
      return { codes, challengeId: password.challengeId!, caseRef };
    });
    const consume = (code = prepared.codes.codes[0]!, selectedBrowser = browser) =>
      IdentityBrowser.run({ current: selectedBrowser, next: selectedBrowser }, () =>
        identity.recoverSavedCode(
          prepared.caseRef,
          prepared.challengeId,
          prepared.codes.setId,
          code,
          'synthetic-u2-peer',
          ingress,
        ),
      );
    return { ...g, ...prepared, account, ingress, browser, identity, savedCodes, vault, consume };
  }
  it('실제 password+미사용 code의 단회 직접 복구는 별도 handoff code 없이 post-fence 권위만 발급한다', async () => {
    const f = await direct(),
      result = await f.consume(),
      claim = (await store.list('ClaimReceipt'))[0]!,
      authority = (await store.list('EnrollmentAuthority'))[0]!;
    expect(claim.grantRef).toBeNull();
    expect(authority).toMatchObject({
      purpose: 'MFA_REENROLMENT',
      securityGeneration: 2,
      state: 'ACTIVE',
    });
    expect(Date.parse(String(authority.expiresAt)) - Date.parse(String(claim.consumedAt))).toBe(
      300000,
    );
    const set = (await store.currentProtected('RecoveryCodeSet', f.codes.setId))!;
    expect(set.invalidated).toBe(true);
    expect((set.verifiers as { used: boolean }[]).filter((code) => code.used)).toHaveLength(1);
    expect(await store.list('RecoveryHandoffGrant')).toHaveLength(0);
    await expect(f.access.authorization.identity(f.customer)).rejects.toMatchObject({
      code: 'BINDING_CHANGED',
    });
    expect(result.handle).toHaveLength(43);
    const text = JSON.stringify(
      await sources.journalAdmin.query('SELECT payload_text FROM u1_protected_entry'),
    );
    expect([f.codes.codes[0]!, result.handle].some((secret) => text.includes(secret))).toBe(false);
  });
  it('등록된 U2 legacy recover 호출은 case/세대/제한 권위 절차를 우회하지 않는다', async () => {
    const f = await direct();
    await expect(
      IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
        f.identity.recover(
          f.challengeId,
          f.codes.setId,
          f.codes.codes[0]!,
          'synthetic-u2-peer',
          f.ingress,
        ),
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_PURPOSE_REQUIRED' });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
    expect((await store.currentProtected('RecoveryCodeSet', f.codes.setId))?.invalidated).toBe(
      false,
    );
    await expect(f.consume()).resolves.toHaveProperty('handle');
  });
  it('같은 직접 복구 원래 요청의 재관측은 같은 handle/기한이며 다른 입력은 새 소비가 아니다', async () => {
    const f = await direct(),
      first = await f.consume(),
      again = await f.consume();
    expect(first.handle === again.handle).toBe(true);
    expect(again.outcome).toEqual(first.outcome);
    await expect(f.consume(f.codes.codes[1]!)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
  });
  it('다른 cookie/잘못된 code는 password 근거나 code 소비를 만들지 않는다', async () => {
    const f = await direct();
    await expect(
      f.consume(f.codes.codes[0]!, generatePurposeSecret('PARTY_BROWSER')),
    ).rejects.toMatchObject({ code: 'CHALLENGE_BROWSER_MISMATCH' });
    await expect(f.consume(randomBytes(16).toString('hex'))).rejects.toMatchObject({
      code: 'RECOVERY_DENIED',
    });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
    expect((await store.currentProtected('RecoveryCodeSet', f.codes.setId))?.invalidated).toBe(
      false,
    );
  });
  it('동시 password challenge의 같은 code는 한 현재 보안 세대와 claim만 확정한다', async () => {
    const f = await direct(),
      other = await IdentityBrowser.run({ current: f.browser, next: f.browser }, async () => {
        const password = await f.identity.login(
          'CUSTOMER',
          f.customer.principalId + '@example.invalid',
          syntheticPassword,
          'synthetic-u2-peer',
          null,
        );
        return {
          challengeId: password.challengeId!,
          caseRef: await f.identity.prepareSavedRecovery(password.challengeId!),
        };
      });
    const results = await Promise.allSettled([
      f.consume(),
      IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
        f.identity.recoverSavedCode(
          other.caseRef,
          other.challengeId,
          f.codes.setId,
          f.codes.codes[0]!,
          'synthetic-u2-peer',
        ),
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
    expect(
      (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]?.securityGeneration,
    ).toBe(2);
  });
  it('회수/재발급·이미 사용한 코드 집합은 원래 case에서도 거절한다', async () => {
    const f = await direct(),
      set = (await store.currentProtected('RecoveryCodeSet', f.codes.setId))!;
    await store.execute(
      {
        principalId: 'fixture-code-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-revoke-set',
        target: ref('RecoveryCodeSet', set),
        idempotencyKey: randomUUID(),
        input: { setId: set.setId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) =>
        tx.put(
          'RecoveryCodeSet',
          { ...set, invalidated: true, revision: Number(set.revision) + 1 },
          Number(set.revision),
        ),
    );
    await expect(f.consume()).rejects.toMatchObject({ code: 'RECOVERY_DENIED' });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
  it('과거 보안 세대의 코드 매핑은 새 password case로 유효하게 추정하지 않는다', async () => {
    const f = await direct(),
      security = (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]!;
    await store.execute(
      {
        principalId: 'fixture-security-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-security-generation',
        target: ref('AccountSecurityState', security),
        idempotencyKey: randomUUID(),
        input: { securityId: security.securityStateId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) =>
        tx.put(
          'AccountSecurityState',
          { ...security, securityGeneration: 2, revision: Number(security.revision) + 1 },
          Number(security.revision),
        ),
    );
    const next = await IdentityBrowser.run({ current: f.browser, next: f.browser }, async () => {
      const password = await f.identity.login(
        'CUSTOMER',
        f.customer.principalId + '@example.invalid',
        syntheticPassword,
        'synthetic-u2-peer',
        null,
      );
      return {
        challengeId: password.challengeId!,
        caseRef: await f.identity.prepareSavedRecovery(password.challengeId!),
      };
    });
    await expect(
      IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
        f.identity.recoverSavedCode(
          next.caseRef,
          next.challengeId,
          f.codes.setId,
          f.codes.codes[0]!,
          'synthetic-u2-peer',
        ),
      ),
    ).rejects.toMatchObject({ code: 'CODE_SECURITY_GENERATION' });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
  it('원래 UNKNOWN slot과 effect는 직접 코드 소비 뒤 HOLD로 보존한다', async () => {
    const f = await direct(),
      source = (await store.currentProtected('RecoveryCase', f.caseRef.id))!,
      slot = {
        slotId: randomUUID(),
        revision: 1,
        accountRef: f.customer.actorAccountRef,
        bindingRef: source.bindingRef,
        caseRef: f.caseRef,
        state: 'UNKNOWN',
        originalOperationRef: null,
        deadlineAt: source.deadlineAt,
        epoch: source.epoch,
      };
    await store.execute(
      {
        principalId: 'fixture-slot-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-original-unknown-slot',
        target: f.caseRef,
        idempotencyKey: randomUUID(),
        input: { slotId: slot.slotId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => tx.put('IdentityExecutionSlot', slot),
    );
    await f.consume();
    expect(await store.currentProtected('IdentityExecutionSlot', slot.slotId)).toEqual(slot);
    expect((await store.list('EnrollmentAuthority'))[0]?.state).toBe('HOLD');
    expect((await store.currentProtected('RecoveryCase', f.caseRef.id))?.state).toBe('HOLD');
  });
  it('실제 준비 미등록은 password/code가 있어도 HOLD이며 직접 소비하지 않는다', async () => {
    const f = await direct('UNREGISTERED');
    expect((await store.currentProtected('RecoveryCase', f.caseRef.id))?.state).toBe('HOLD');
    await expect(f.consume()).rejects.toMatchObject({ code: 'REAL_ACTIVATION_UNVERIFIED' });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
    expect((await store.currentProtected('RecoveryCodeSet', f.codes.setId))?.invalidated).toBe(
      false,
    );
  });
  it('직접 소비와 보안 매핑의 restore는 used/회수 상태를 되살리지 않는다', async () => {
    const f = await direct();
    await f.consume();
    const mapping = (await store.currentProtected(
      'RecoveryCodeSecurityState',
      u2CodeSecurityStateId(f.codes.setId),
    ))!;
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(await store.read('RecoveryCodeSecurityState', String(mapping.codeSecurityId))).toEqual(
      mapping,
    );
    expect((await store.read('RecoveryCodeSet', f.codes.setId))?.invalidated).toBe(true);
    expect((await store.list('ClaimReceipt'))[0]?.grantRef).toBeNull();
    await expect(f.consume()).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_UNCONFIRMED' });
  });
  it('직접 consume의 primary crash는 handle ACK 전 차단하고 prefix 복구 후 같은 암호 자료를 재관측한다', async () => {
    let enabled = false,
      failed = false;
    const crashed = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (enabled && !failed && boundary === 'PRIMARY_COMMITTED') {
          const rows = await sources.primaryAdmin.query(
            'SELECT payload_text FROM u1_recovery_candidate ORDER BY commit_order DESC LIMIT 1',
          );
          const payload = JSON.parse(rows[0].payload_text) as {
            rows: { model: string; data: { operation?: string } }[];
          };
          if (
            payload.rows.some(
              (row) =>
                row.model === 'RequestReceipt' && row.data.operation === 'verifySavedCodeRecovery',
            )
          ) {
            failed = true;
            throw new Error('synthetic-direct-primary-crash');
          }
        }
      },
    );
    const f = await direct('LOCAL_SYNTHETIC', crashed);
    enabled = true;
    await expect(f.consume()).rejects.toThrow('synthetic-direct-primary-crash');
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
    const prepared = (
      await sources.vault.query(
        "SELECT binding FROM u2_vault.material WHERE binding->>'purpose'='ENROLLMENT_HANDLE'",
      )
    )[0].binding as import('@oms/persistence').VaultBinding;
    await expect(
      f.vault.read(prepared, {
        authorityRef: prepared.targetRef,
        targetRef: prepared.targetRef,
        purpose: 'ENROLLMENT_HANDLE',
        operation: 'identity.enrollment.handle',
        epoch: await store.currentEpoch(),
        deadlineAt: new Date(Date.now() + 10000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    await store.protectPending(await store.currentEpoch());
    const original = await f.consume(),
      again = await f.consume();
    expect(original.handle === again.handle).toBe(true);
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
    expect(
      (
        await sources.vault.query(
          "SELECT count(*)::int AS n FROM u2_vault.material WHERE binding->>'purpose'='ENROLLMENT_HANDLE'",
        )
      )[0].n,
    ).toBe(1);
  });
  it('누락된 보호 코드 매핑을 새 기본 세대로 채워 소비하지 않는다', async () => {
    const f = await direct(),
      id = u2CodeSecurityStateId(f.codes.setId),
      mapping = (await store.currentProtected('RecoveryCodeSecurityState', id))!;
    await store.execute(
      {
        principalId: 'fixture-code-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-missing-code-map',
        target: ref('RecoveryCodeSecurityState', mapping),
        idempotencyKey: randomUUID(),
        input: { id },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => tx.remove('RecoveryCodeSecurityState', id, Number(mapping.revision)),
    );
    await expect(f.consume()).rejects.toMatchObject({ code: 'CODE_SECURITY_GENERATION' });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
    expect((await store.currentProtected('RecoveryCodeSet', f.codes.setId))?.invalidated).toBe(
      false,
    );
  });
  it('직원 직접 복구도 실제 private proof가 없으면 소비/재관측하지 않는다', async () => {
    const f = await direct('LOCAL_SYNTHETIC', store, 'STAFF');
    await expect(
      IdentityBrowser.run({ current: f.browser }, () =>
        f.identity.recoverSavedCode(
          f.caseRef,
          f.challengeId,
          f.codes.setId,
          f.codes.codes[0]!,
          'synthetic-u2-peer',
          null,
        ),
      ),
    ).rejects.toMatchObject({ code: 'STAFF_INGRESS_REQUIRED' });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
    await f.consume();
    expect((await store.list('EnrollmentAuthority'))[0]?.audience).toBe('STAFF');
  });
  it('같은 stable Account의 다른 audience binding도 fence하고 원래 모든 연결 참조를 보존한다', async () => {
    const f = await direct(),
      customerBinding = (
        await store.list('ProviderBinding', {
          equals: {
            accountRef: { id: f.customer.principalId },
            audience: 'CUSTOMER',
            active: true,
          },
        })
      )[0]!,
      staffBinding = {
        ...customerBinding,
        bindingId: randomUUID(),
        audience: 'STAFF',
        issuer: 'urn:synthetic:identity:STAFF',
      };
    await store.execute(
      {
        principalId: 'fixture-binding-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-second-audience-binding',
        target: null,
        idempotencyKey: randomUUID(),
        input: { bindingId: staffBinding.bindingId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => tx.put('ProviderBinding', staffBinding),
    );
    const staff = await IdentityBrowser.run({ current: f.browser, next: f.browser }, async () => {
      const login = await f.identity.login(
        'STAFF',
        f.customer.principalId + '@example.invalid',
        syntheticPassword,
        'synthetic-u2-peer',
        'synthetic-private-ingress',
      );
      await f.identity.verifyFactor(
        login.challengeId!,
        syntheticFactor,
        'synthetic-u2-peer',
        'synthetic-private-ingress',
        true,
      );
      const codes = await f.identity.issueRecoveryCodes(
          login.challengeId!,
          'synthetic-private-ingress',
        ),
        done = await f.identity.acknowledgeRecoveryCodes(
          login.challengeId!,
          codes.setId,
          true,
          'synthetic-private-ingress',
        );
      return f.identity.authenticate(
        done.sessionToken!,
        'STAFF',
        randomUUID(),
        'synthetic-private-ingress',
      );
    });
    await f.consume();
    await expect(f.access.authorization.identity(staff)).rejects.toMatchObject({
      code: 'BINDING_CHANGED',
    });
    expect(
      (await store.currentProtected('ProviderBinding', staffBinding.bindingId))?.authRevision,
    ).toBe(2);
    const current = (await store.currentProtected('RecoveryCase', f.caseRef.id))!;
    expect(
      (current.originalBindingRefs as { id: string; revision: number }[])
        .map((source) => source.id)
        .sort(),
    ).toEqual([String(customerBinding.bindingId), staffBinding.bindingId].sort());
    expect(
      (current.originalBindingRefs as { revision: number }[]).every(
        (source) => source.revision === 1,
      ),
    ).toBe(true);
  });
});
