import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore, restoreFromJournal } from '@oms/persistence';
import type { VaultBinding } from '@oms/persistence';
import {
  RecoveryHandoffs,
  IdentityRecovery,
  EnrollmentAuthorities,
  IdentityBrowser,
  generatePurposeSecret,
  ref,
} from '@oms/core';
import { SyntheticIdentityProvider } from '../../u1/fixtures/identity.js';
import { syntheticPassword, syntheticFactor } from '../../u1/fixtures/identity.js';
import type { Ref } from '@oms/contracts';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedVerifiedRecoveryParty } from '../fixtures/identity.js';
import { u2Meta } from '../fixtures/enterprise.js';

describe('인계 발급/소비/원래 불명 효과의 재기동·복원', () => {
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
  async function verified() {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    await f.handoffs.verifyParty(f.staff, f.verifyInput);
    const current = (await store.currentProtected('RecoveryCase', f.source.caseId))!;
    return {
      ...f,
      issueInput: {
        meta: u2Meta(2),
        caseRef: ref('RecoveryCase', current),
        verificationRef: current.verificationRef as Ref,
        partyContextRef: current.partyContextRef as Ref,
        deliveryRouteRef: ref('RegisteredContact', f.contact),
      },
    };
  }
  async function issued() {
    const f = await verified(),
      receipt = await f.handoffs.issue(f.staff, f.issueInput),
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
      ).toString(),
      input = {
        meta: u2Meta(1),
        grantRef: receipt.targetRef!,
        caseRef: f.issueInput.caseRef,
        challengeId: f.created.challengeId,
        code,
        partySecret: f.created.partySecret,
      };
    const claim = (selected = input) =>
      IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
        f.handoffs.claim(
          {
            attemptId: f.created.challengeId,
            audience: 'CUSTOMER',
            correlationId: randomUUID(),
            deadlineAt: new Date(Date.now() + 10000).toISOString(),
          },
          selected,
        ),
      );
    return { ...f, grant, input, claim };
  }

  it('실제 claim의 소비/세대/receipt/tombstone은 복원 뒤 그대로이고 옛 접점은 새 epoch에서 거절한다', async () => {
    const f = await issued();
    await f.claim();
    const claim = (await store.list('ClaimReceipt'))[0]!,
      security = (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]!,
      binding = (
        await store.list('ProviderBinding', {
          equals: {
            accountRef: { id: f.customer.principalId },
            audience: 'CUSTOMER',
            active: true,
          },
        })
      )[0]!;
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect((await store.read('RecoveryHandoffGrant', f.input.grantRef.id))?.state).toBe('CLAIMED');
    expect(await store.read('ClaimReceipt', String(claim.claimReceiptId))).toEqual(claim);
    expect(await store.read('AccountSecurityState', String(security.securityStateId))).toEqual(
      security,
    );
    expect(await store.read('ProviderBinding', String(binding.bindingId))).toEqual(binding);
    expect((await store.read('Account', f.customer.principalId))?.accountId).toBe(
      f.customer.principalId,
    );
    expect(
      await store.list('SecurityTombstone', { equals: { targetRef: { id: f.input.grantRef.id } } }),
    ).toHaveLength(1);
    await expect(f.claim()).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_UNCONFIRMED' });
    expect(
      (
        await sources.vault.query('SELECT count(*)::int AS n FROM u2_vault.material WHERE id=$1', [
          f.grant.vaultRef,
        ])
      )[0].n,
    ).toBe(0);
  });
  it('실제 다섯 실패와 파기 marker는 복원에서 ISSUED로 되돌아가지 않는다', async () => {
    const f = await issued();
    for (let n = 0; n < 5; n++)
      await expect(
        f.claim({ ...f.input, meta: u2Meta(1), code: generatePurposeSecret('HANDOFF') }),
      ).rejects.toMatchObject({ code: 'HANDOFF_CODE_INVALID' });
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(await store.read('RecoveryHandoffGrant', f.input.grantRef.id)).toMatchObject({
      state: 'EXHAUSTED',
      attemptCount: 5,
    });
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
    expect(
      await store.list('SecurityTombstone', { equals: { targetRef: { id: f.input.grantRef.id } } }),
    ).toHaveLength(1);
  });
  it('오류 개정 후 대체 발급은 원래 암호 세대도 파기하고 옛 grant를 새 claim으로 재사용하지 않는다', async () => {
    const f = await issued();
    await expect(
      f.claim({ ...f.input, code: generatePurposeSecret('HANDOFF') }),
    ).rejects.toMatchObject({ code: 'HANDOFF_CODE_INVALID' });
    const next = await f.handoffs.issue(f.staff, { ...f.issueInput, meta: u2Meta(2) });
    expect((await store.currentProtected('RecoveryHandoffGrant', f.input.grantRef.id))?.state).toBe(
      'REVOKED',
    );
    expect(
      (
        await sources.vault.query('SELECT count(*)::int AS n FROM u2_vault.material WHERE id=$1', [
          f.grant.vaultRef,
        ])
      )[0].n,
    ).toBe(0);
    const grant = (await store.currentProtected('RecoveryHandoffGrant', next.targetRef!.id))!;
    expect((grant.replacesGrantRef as Ref).id).toBe(f.input.grantRef.id);
    expect((await store.list('RecoveryHandoffGrant', { equals: { state: 'ISSUED' } })).length).toBe(
      1,
    );
    await expect(f.claim({ ...f.input, meta: u2Meta(1) })).rejects.toMatchObject({
      code: 'HANDOFF_NOT_CLAIMABLE',
    });
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect((await store.read('RecoveryHandoffGrant', f.input.grantRef.id))?.state).toBe('REVOKED');
  });
  it('원래 UNKNOWN slot은 새 claim이 소비돼도 종료로 꾸미거나 새 ACTIVE slot으로 교체하지 않는다', async () => {
    const f = await issued(),
      slotId = randomUUID(),
      original = {
        slotId,
        revision: 1,
        accountRef: f.customer.actorAccountRef,
        bindingRef: f.grant.bindingRef,
        caseRef: f.issueInput.caseRef,
        state: 'UNKNOWN',
        originalOperationRef: null,
        deadlineAt: new Date(Date.now() + 300000).toISOString(),
        epoch: await store.currentEpoch(),
      };
    await f.execute('fixture-original-unknown-slot', async (tx) =>
      tx.put('IdentityExecutionSlot', original),
    );
    await f.claim();
    expect(await store.currentProtected('IdentityExecutionSlot', slotId)).toEqual(original);
    expect((await store.list('EnrollmentAuthority'))[0]?.state).toBe('HOLD');
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.holdReason).toBe(
      'ORIGINAL_EFFECT_UNCONFIRMED',
    );
    expect(
      await store.list('IdentityExecutionSlot', {
        equals: { accountRef: { id: f.customer.principalId } },
      }),
    ).toHaveLength(1);
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(await store.read('IdentityExecutionSlot', slotId)).toEqual(original);
    expect((await store.list('EnrollmentAuthority'))[0]?.state).toBe('HOLD');
  });
  it('발급 primary commit 뒤 crash의 prepared code는 보호 전 전달 불가이고 원래 retry가 같은 자료를 사용한다', async () => {
    const f = await verified();
    let failed = false;
    const crash = new ProtectedStore(
        sources.primaryApp,
        sources.journalAppend,
        async (boundary) => {
          if (boundary === 'PRIMARY_COMMITTED' && !failed) {
            failed = true;
            throw new Error('synthetic-issue-crash');
          }
        },
      ),
      handoffs = new RecoveryHandoffs(
        crash,
        f.verifier,
        f.vault,
        f.now,
        'LOCAL_SYNTHETIC',
        f.parties,
      );
    await expect(handoffs.issue(f.staff, f.issueInput)).rejects.toThrow('synthetic-issue-crash');
    const prepared = (
        await sources.vault.query(
          "SELECT binding FROM u2_vault.material WHERE binding->>'purpose'='HANDOFF'",
        )
      )[0].binding as VaultBinding,
      permit = {
        authorityRef: prepared.targetRef,
        targetRef: prepared.targetRef,
        purpose: 'HANDOFF' as const,
        operation: 'identity.handoff.deliver',
        epoch: await store.currentEpoch(),
        deadlineAt: new Date(Date.now() + 30000).toISOString(),
      };
    await expect(f.vault.read(prepared, permit)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    await store.protectPending(await store.currentEpoch());
    const receipt = await f.handoffs.issue(f.staff, f.issueInput);
    expect(receipt.targetRef?.id).toBe(prepared.targetRef.id);
    expect((await f.vault.read(prepared, permit)).length).toBe(16);
    expect(
      (
        await sources.vault.query(
          "SELECT count(*)::int AS n FROM u2_vault.material WHERE binding->>'purpose'='HANDOFF'",
        )
      )[0].n,
    ).toBe(1);
  });
  it('다른 case/challenge 및 malformed code는 타인 grant의 실패수를 소비하지 않는다', async () => {
    const f = await issued();
    for (const changed of [
      { caseRef: { ...f.input.caseRef, id: randomUUID() } },
      { challengeId: randomUUID() },
      { code: ' ' + f.input.code },
    ])
      await expect(f.claim({ ...f.input, ...changed })).rejects.toThrow();
    expect(
      (await store.currentProtected('RecoveryHandoffGrant', f.input.grantRef.id))?.attemptCount,
    ).toBe(0);
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
  it('등록된 IdentityRecovery facade는 목적 handle만 인증하고 미등록/다른 보호 store는 거절한다', async () => {
    const f = await issued(),
      authorities = new EnrollmentAuthorities(store, f.verifier, f.now, async () => false),
      runtime = {
        synthetic: true,
        verifierKey: Buffer.alloc(32, 7),
        now: f.now,
        staffIngress: async () => false,
      },
      u2 = { parties: f.parties, handoffs: f.handoffs, authorities };
    expect(() => f.identity.issueHandoff(f.staff, f.issueInput)).toThrow(
      expect.objectContaining({ code: 'IDENTITY_U2_UNREGISTERED' }),
    );
    const identity = new IdentityRecovery(store, new SyntheticIdentityProvider(), runtime, u2),
      result = await IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
        identity.claimHandoff(
          {
            attemptId: f.created.challengeId,
            audience: 'CUSTOMER',
            correlationId: randomUUID(),
            deadlineAt: new Date(Date.now() + 10000).toISOString(),
          },
          f.input,
        ),
      );
    const authority = (await store.list('EnrollmentAuthority'))[0]!,
      context = await identity.authenticatePurpose(
        ref('EnrollmentAuthority', authority),
        result.handle,
        'MFA_REENROLMENT',
        randomUUID(),
      );
    expect(context.identityAssertionRef.entity).toBe('EnrollmentAuthority');
    await expect(f.access.authorization.identity(context)).rejects.toThrow();
    expect(
      () =>
        new IdentityRecovery(
          new ProtectedStore(sources.primaryApp, sources.journalAppend),
          new SyntheticIdentityProvider(),
          runtime,
          u2,
        ),
    ).toThrow(expect.objectContaining({ code: 'IDENTITY_U2_STORE_BINDING' }));
  });
  it('진행 중 claim의 새 password/옛 TOTP challenge는 legacy code 발급 경로로 우회하지 않는다', async () => {
    const f = await issued();
    await f.claim();
    const challenge = await f.identity.login(
      'CUSTOMER',
      f.customer.principalId + '@example.invalid',
      syntheticPassword,
      'synthetic-u2-peer',
      null,
    );
    await f.identity.verifyFactor(
      challenge.challengeId!,
      syntheticFactor,
      'synthetic-u2-peer',
      null,
      true,
    );
    const before = (
      await store.list('RecoveryCodeSet', {
        equals: { accountRef: { id: f.customer.principalId } },
      })
    ).length;
    await expect(f.identity.issueRecoveryCodes(challenge.challengeId!, null)).rejects.toMatchObject(
      { code: 'RECOVERY_PURPOSE_REQUIRED' },
    );
    expect(
      (
        await store.list('RecoveryCodeSet', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      ).length,
    ).toBe(before);
  });
});
