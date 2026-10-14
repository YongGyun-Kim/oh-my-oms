import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import type { VaultBinding } from '@oms/persistence';
import { RecoveryHandoffs, IdentityBrowser, generatePurposeSecret, ref } from '@oms/core';
import type { Ref } from '@oms/contracts';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { u2Meta } from '../fixtures/enterprise.js';
import { seedVerifiedRecoveryParty } from '../fixtures/identity.js';
describe('인계 확인/발급의 현재 당사자 원본과 보호 ACK', () => {
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
  async function setup(
    registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED' = 'LOCAL_SYNTHETIC',
    manualNow?: () => Date,
  ) {
    return seedVerifiedRecoveryParty(store, sources.vault, registration, manualNow);
  }
  it('새 PENDING 문맥은 계정 세대/기존 MFA session을 잠그거나 verified case에 연결하지 않는다', async () => {
    const f = await setup(),
      security = (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]!;
    expect(security.securityGeneration).toBe(1);
    expect(
      (await store.currentProtected('RecoveryCase', f.source.caseId))?.partyContextRef,
    ).toBeNull();
    expect(
      (await store.currentProtected('PartyClaimContext', f.created.partyContextRef.id))?.state,
    ).toBe('PENDING');
    await expect(f.access.authorization.identity(f.customer)).resolves.toMatchObject({
      active: true,
    });
  });
  it('확인 결정은 원래 IdentityRecovery receipt/history와 실제 선택 party에만 결합한다', async () => {
    const f = await setup(),
      receipt = await f.handoffs.verifyParty(f.staff, f.verifyInput),
      source = (await store.currentProtected('RecoveryCase', f.source.caseId))!;
    expect(receipt.owner).toBe('IdentityRecovery');
    expect(receipt.resultRefs.map((r) => r.entity)).toContain('IdentityHistory');
    expect(source.state).toBe('VERIFYING');
    expect((source.partyContextRef as Ref).id).toBe(f.created.partyContextRef.id);
    expect(
      (await store.currentProtected('PartyClaimContext', f.created.partyContextRef.id))?.state,
    ).toBe('VERIFIED');
    expect((await f.handoffs.verifyParty(f.staff, f.verifyInput)).requestId).toBe(
      receipt.requestId,
    );
  });
  it('잘못 선택한 먼저 접수한 익명 challenge는 존재하는 Ref만으로 승격되지 않는다', async () => {
    const f = await setup(),
      challengeId = randomUUID(),
      otherBrowser = generatePurposeSecret('PARTY_BROWSER'),
      other = (await IdentityBrowser.run({ current: f.oldBrowser, next: otherBrowser }, () =>
        f.parties.create(
          {
            attemptId: challengeId,
            audience: 'CUSTOMER',
            correlationId: randomUUID(),
            deadlineAt: new Date(Date.now() + 10000).toISOString(),
          },
          { caseRef: ref('RecoveryCase', f.source), challengeId },
        ),
      )) as { partyContextRef: Ref };
    const result = await f.handoffs.verifyParty(f.staff, {
      ...f.verifyInput,
      partyContextRef: other.partyContextRef,
    });
    expect(result.requestState).toBe('REVIEW_REQUIRED');
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
    expect(
      (await store.currentProtected('PartyClaimContext', other.partyContextRef.id))?.state,
    ).toBe('PENDING');
  });
  it('미등록 actual 확인 정책은 CONFIRM 입력이어도 HOLD이고 grant를 발급하지 않는다', async () => {
    const f = await setup('UNREGISTERED'),
      receipt = await f.handoffs.verifyParty(f.staff, f.verifyInput);
    expect(receipt.requestState).toBe('REVIEW_REQUIRED');
    expect(await store.list('RecoveryHandoffGrant')).toHaveLength(0);
  });
  it('원래 실제 확인 이후 96bit 코드만 별도 vault에 쓰고 같은 key는 새 grant를 만들지 않는다', async () => {
    const f = await setup();
    await f.handoffs.verifyParty(f.staff, f.verifyInput);
    const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      input = {
        meta: u2Meta(2),
        caseRef: ref('RecoveryCase', source),
        verificationRef: source.verificationRef as Ref,
        partyContextRef: source.partyContextRef as Ref,
        deliveryRouteRef: ref('RegisteredContact', f.contact),
      },
      receipt = await f.handoffs.issue(f.staff, input),
      grant = (await store.currentProtected('RecoveryHandoffGrant', receipt.targetRef!.id))!,
      binding = (
        await sources.vault.query('SELECT binding FROM u2_vault.material WHERE id=$1', [
          grant.vaultRef,
        ])
      )[0].binding as VaultBinding,
      code = (
        await f.vault.read(binding, {
          authorityRef: receipt.targetRef!,
          targetRef: receipt.targetRef!,
          purpose: 'HANDOFF',
          operation: 'identity.handoff.deliver',
          epoch: String(grant.epoch),
          deadlineAt: new Date(Date.now() + 30000).toISOString(),
        })
      ).toString();
    expect(code).toHaveLength(16);
    expect(Buffer.from(code, 'base64url')).toHaveLength(12);
    expect((await f.handoffs.issue(f.staff, input)).requestId).toBe(receipt.requestId);
    expect(await store.list('RecoveryHandoffGrant')).toHaveLength(1);
    const payloads = await sources.journalAdmin.query(
      'SELECT payload_text FROM u1_protected_entry',
    );
    expect(JSON.stringify(payloads).includes(code)).toBe(false);
    expect(JSON.stringify(payloads).includes(f.created.partySecret)).toBe(false);
  });
  it('발급 뒤 확인자 현재 권위 회수는 전달을 차단한다', async () => {
    const f = await setup();
    await f.handoffs.verifyParty(f.staff, f.verifyInput);
    const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      issued = await f.handoffs.issue(f.staff, {
        meta: u2Meta(2),
        caseRef: ref('RecoveryCase', source),
        verificationRef: source.verificationRef as Ref,
        partyContextRef: source.partyContextRef as Ref,
        deliveryRouteRef: ref('RegisteredContact', f.contact),
      }),
      role = (await store.list('StaffRole'))[0]!;
    await f.access.reviseStaffRole(f.staff, {
      meta: u2Meta(2),
      roleRef: ref('StaffRole', role),
      label: '확인 권위 회수',
      actions: ['staff.role.manage'],
    });
    await expect(f.handoffs.assertDelivery(issued.targetRef!)).rejects.toMatchObject({
      code: 'HANDOFF_CURRENT_SOURCE',
    });
  });
  async function issued(manualNow?: () => Date) {
    const f = await setup('LOCAL_SYNTHETIC', manualNow);
    await f.handoffs.verifyParty(f.staff, f.verifyInput);
    const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!;
    const receipt = await f.handoffs.issue(f.staff, {
      meta: u2Meta(2),
      caseRef: ref('RecoveryCase', source),
      verificationRef: source.verificationRef as Ref,
      partyContextRef: source.partyContextRef as Ref,
      deliveryRouteRef: ref('RegisteredContact', f.contact),
    });
    const grant = (await store.currentProtected('RecoveryHandoffGrant', receipt.targetRef!.id))!;
    const binding = (
      await sources.vault.query('SELECT binding FROM u2_vault.material WHERE id=$1', [
        grant.vaultRef,
      ])
    )[0].binding as VaultBinding;
    const code = (
      await f.vault.read(binding, {
        authorityRef: receipt.targetRef!,
        targetRef: receipt.targetRef!,
        purpose: 'HANDOFF',
        operation: 'identity.handoff.deliver',
        epoch: String(grant.epoch),
        deadlineAt: new Date(Date.now() + 30000).toISOString(),
      })
    ).toString();
    const input = {
      meta: u2Meta(1),
      grantRef: receipt.targetRef!,
      caseRef: ref('RecoveryCase', source),
      challengeId: f.created.challengeId,
      code,
      partySecret: f.created.partySecret,
    };
    const pre = {
      attemptId: f.created.challengeId,
      audience: 'CUSTOMER' as const,
      correlationId: randomUUID(),
      deadlineAt: new Date(Date.now() + 10000).toISOString(),
    };
    const claim = (selected = input, browser = f.browser) =>
      IdentityBrowser.run({ current: browser, next: browser }, () =>
        f.handoffs.claim(
          { ...pre, deadlineAt: new Date(f.now().getTime() + 10000).toISOString() },
          selected,
        ),
      );
    return { ...f, grant, input, pre, claim };
  }
  it('claim 단회 소비는 보안 세대와 auth fence를 함께 전환하고 별도 5분 제한 권위만 만든다', async () => {
    const f = await issued(),
      result = await f.claim(),
      claimed = (await store.currentProtected('RecoveryHandoffGrant', f.input.grantRef.id))!;
    expect(claimed.state).toBe('CLAIMED');
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
    const authority = (await store.list('EnrollmentAuthority'))[0]!,
      claim = (await store.list('ClaimReceipt'))[0]!;
    expect(authority.state).toBe('ACTIVE');
    expect(authority.purpose).toBe('MFA_REENROLMENT');
    expect(Date.parse(String(authority.expiresAt)) - Date.parse(String(claim.consumedAt))).toBe(
      300000,
    );
    expect(
      (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]?.securityGeneration,
    ).toBe(2);
    await expect(f.access.authorization.identity(f.customer)).rejects.toMatchObject({
      code: 'BINDING_CHANGED',
    });
    const sets = await store.list('RecoveryCodeSet', {
      equals: { accountRef: { id: f.customer.principalId } },
    });
    expect(sets.every((set) => set.invalidated === true)).toBe(true);
    expect(
      await store.list('IdentityExecutionSlot', {
        equals: { accountRef: { id: f.customer.principalId }, state: 'ACTIVE' },
      }),
    ).toHaveLength(1);
    expect(result.handle).toHaveLength(43);
    expect(Object.prototype.hasOwnProperty.call(result.outcome, 'handle')).toBe(false);
    const text = JSON.stringify(
      await sources.journalAdmin.query('SELECT payload_text FROM u1_protected_entry'),
    );
    expect(
      [f.input.code, f.input.partySecret, result.handle].some((secret) => text.includes(secret)),
    ).toBe(false);
    expect(
      (
        await sources.vault.query('SELECT count(*)::int AS n FROM u2_vault.material WHERE id=$1', [
          f.grant.vaultRef,
        ])
      )[0].n,
    ).toBe(0);
  });
  it('원래 같은 요청 재관측은 동일 handle/기한을 돌려주며 다른 key는 두 번째 소비를 만들지 않는다', async () => {
    const f = await issued(),
      first = await f.claim(),
      again = await f.claim();
    expect(first.handle === again.handle).toBe(true);
    expect(again.outcome).toEqual(first.outcome);
    await expect(f.claim({ ...f.input, meta: u2Meta(1) })).rejects.toMatchObject({
      code: 'HANDOFF_NOT_CLAIMABLE',
    });
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
  });
  it('code만 아는 다른 브라우저와 다른 party secret은 실패수를 소비하거나 권위를 만들지 않는다', async () => {
    const f = await issued();
    await expect(f.claim(f.input, generatePurposeSecret('PARTY_BROWSER'))).rejects.toMatchObject({
      code: 'PARTY_CONTEXT_REQUIRED',
    });
    await expect(
      f.claim({ ...f.input, partySecret: generatePurposeSecret('PARTY_CONTEXT') }),
    ).rejects.toMatchObject({ code: 'PARTY_CONTEXT_REQUIRED' });
    expect(
      (await store.currentProtected('RecoveryHandoffGrant', f.grant.grantId as string))
        ?.attemptCount,
    ).toBe(0);
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
  it('당사자의 잘못된 code는 보호 실패수를 단회 기록하며 다섯째에서 영구 소진한다', async () => {
    const f = await issued(),
      wrong = { ...f.input, code: generatePurposeSecret('HANDOFF') };
    await expect(f.claim(wrong)).rejects.toMatchObject({ code: 'HANDOFF_CODE_INVALID' });
    await expect(f.claim(wrong)).rejects.toMatchObject({ code: 'HANDOFF_CODE_INVALID' });
    expect(
      (await store.currentProtected('RecoveryHandoffGrant', f.input.grantRef.id))?.attemptCount,
    ).toBe(1);
    for (let n = 2; n <= 5; n++)
      await expect(f.claim({ ...wrong, meta: u2Meta(1) })).rejects.toMatchObject({
        code: 'HANDOFF_CODE_INVALID',
      });
    expect(await store.currentProtected('RecoveryHandoffGrant', f.input.grantRef.id)).toMatchObject(
      { attemptCount: 5, state: 'EXHAUSTED' },
    );
    await expect(f.claim({ ...f.input, meta: u2Meta(1) })).rejects.toMatchObject({
      code: 'HANDOFF_NOT_CLAIMABLE',
    });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
    expect(
      await store.list('SecurityTombstone', { equals: { targetRef: { id: f.input.grantRef.id } } }),
    ).toHaveLength(1);
    expect(
      (
        await sources.vault.query('SELECT count(*)::int AS n FROM u2_vault.material WHERE id=$1', [
          f.grant.vaultRef,
        ])
      )[0].n,
    ).toBe(0);
  });
  it('오류로 grant 개정이 바뀌어도 원래 코드의 HMAC 문맥을 유지하고 정상 claim은 한 번만 적용한다', async () => {
    const f = await issued();
    await expect(
      f.claim({ ...f.input, code: generatePurposeSecret('HANDOFF') }),
    ).rejects.toMatchObject({ code: 'HANDOFF_CODE_INVALID' });
    await f.claim({ ...f.input, meta: u2Meta(1) });
    expect((await store.currentProtected('RecoveryHandoffGrant', f.input.grantRef.id))?.state).toBe(
      'CLAIMED',
    );
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
  });
  it('발급 후 확인자 권위 회수는 claim 세대 전환 전 차단한다', async () => {
    const f = await issued(),
      role = (await store.list('StaffRole'))[0]!;
    await f.access.reviseStaffRole(f.staff, {
      meta: u2Meta(2),
      roleRef: ref('StaffRole', role),
      label: 'claim 권위 회수',
      actions: ['staff.role.manage'],
    });
    await expect(f.claim()).rejects.toMatchObject({ code: 'HANDOFF_CURRENT_SOURCE' });
    expect((await store.currentProtected('RecoveryHandoffGrant', f.input.grantRef.id))?.state).toBe(
      'ISSUED',
    );
    expect(
      (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]?.securityGeneration,
    ).toBe(1);
  });
  it('primary commit 이후 ACK 전 crash는 handle을 공개하지 않으며 prefix 복구 후 원래 암호 자료를 재관측한다', async () => {
    const f = await issued();
    let failed = false;
    const crashed = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'PRIMARY_COMMITTED' && !failed) {
          failed = true;
          throw new Error('synthetic-claim-crash');
        }
      },
    );
    const handoffs = new RecoveryHandoffs(
      crashed,
      f.verifier,
      f.vault,
      f.now,
      'LOCAL_SYNTHETIC',
      f.parties,
    );
    await expect(
      IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
        handoffs.claim(f.pre, f.input),
      ),
    ).rejects.toThrow('synthetic-claim-crash');
    const prepared = (
      await sources.vault.query(
        "SELECT binding FROM u2_vault.material WHERE binding->>'purpose'='ENROLLMENT_HANDLE'",
      )
    )[0].binding as VaultBinding;
    await expect(
      f.vault.read(prepared, {
        authorityRef: prepared.targetRef,
        targetRef: prepared.targetRef,
        purpose: 'ENROLLMENT_HANDLE',
        operation: 'identity.enrollment.handle',
        epoch: await store.currentEpoch(),
        deadlineAt: new Date(Date.now() + 30000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
    await store.protectPending(await store.currentEpoch());
    const result = await f.claim(),
      again = await f.claim();
    expect(result.handle === again.handle).toBe(true);
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
    expect(
      (
        await sources.vault.query(
          "SELECT count(*)::int AS n FROM u2_vault.material WHERE binding->>'purpose'='ENROLLMENT_HANDLE'",
        )
      )[0].n,
    ).toBe(1);
  });
  it('동시 claim은 한 세대 전환과 한 ClaimReceipt만 남긴다', async () => {
    const f = await issued(),
      results = await Promise.allSettled([f.claim(), f.claim({ ...f.input, meta: u2Meta(1) })]);
    expect(results.filter((result) => result.status === 'fulfilled').length).toBe(1);
    expect(results.filter((result) => result.status === 'rejected').length).toBe(1);
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
    expect(
      (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]?.securityGeneration,
    ).toBe(2);
  });
  it('claim 후 새로운 보안 세대는 원래 재관측 handle 공개도 차단한다', async () => {
    const f = await issued();
    await f.claim();
    const security = (
      await store.list('AccountSecurityState', {
        equals: { accountRef: { id: f.customer.principalId } },
      })
    )[0]!;
    await f.execute('fixture-newer-security', async (tx) =>
      tx.put(
        'AccountSecurityState',
        { ...security, securityGeneration: 3, revision: Number(security.revision) + 1 },
        Number(security.revision),
      ),
    );
    await expect(f.claim()).rejects.toMatchObject({ code: 'PURPOSE_SECURITY_CHANGED' });
    expect(await store.list('ClaimReceipt')).toHaveLength(1);
  });
  it('고정 주입 시각의 발급 기한 직전 claim은 별도 5분을 가지며 원래 재관측은 TTL을 연장하지 않는다', async () => {
    let at: number | null = null;
    const f = await issued(() => new Date(at ?? Date.now()));
    at = Date.parse(String(f.grant.expiresAt)) - 1;
    const first = await f.claim(),
      authority = (await store.list('EnrollmentAuthority'))[0]!,
      expiry = Date.parse(String(authority.expiresAt));
    expect(expiry - at).toBe(300000);
    at += 1000;
    const repeated = await f.claim();
    expect(first.handle === repeated.handle).toBe(true);
    expect(repeated.outcome).toEqual(first.outcome);
    expect((await store.list('EnrollmentAuthority'))[0]?.expiresAt).toBe(authority.expiresAt);
    at = expiry;
    await expect(f.claim()).rejects.toMatchObject({ code: 'PARTY_CONTEXT_REQUIRED' });
  });
  for (const offset of [0, 1])
    it('고정 주입 시각의 발급 만료 ' + offset + 'ms에서는 첫 claim을 소비하지 않는다', async () => {
      let at: number | null = null;
      const f = await issued(() => new Date(at ?? Date.now()));
      at = Date.parse(String(f.grant.expiresAt)) + offset;
      await expect(f.claim()).rejects.toMatchObject({ code: 'PARTY_CONTEXT_REQUIRED' });
      expect(
        (await store.currentProtected('RecoveryHandoffGrant', f.input.grantRef.id))?.attemptCount,
      ).toBe(0);
      expect(await store.list('ClaimReceipt')).toHaveLength(0);
    });
});
