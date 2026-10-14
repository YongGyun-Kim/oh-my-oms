import { randomUUID, randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import {
  ProtectedStore,
  PurposeSecretVault,
  authorizeProtectedVault,
  backfillU2SecurityState,
} from '@oms/persistence';
import type { VaultBinding } from '@oms/persistence';
import {
  EnterpriseInvitations,
  EnrollmentAuthorities,
  PurposeVerifier,
  ref,
  generatePurposeSecret,
  U2Worker,
  PrivateU2Delivery,
  IdentityConsumer,
} from '@oms/core';
import { SyntheticQueue } from '../fixtures/queue.js';
import { StatefulRecoveryProvider } from '../fixtures/provider.js';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2Enterprise, u2Meta } from '../fixtures/enterprise.js';
import {
  seedSyntheticAccount,
  syntheticPassword,
  syntheticFactor,
} from '../../u1/fixtures/identity.js';
describe('등록 연락과 목적별 초대의 실제 보호 경합', () => {
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
  async function setup(activeStore = store) {
    const graph = await seedU2Enterprise(activeStore),
      verifier = new PurposeVerifier(randomBytes(32), 'fixture-key'),
      vault = new PurposeSecretVault(sources.vault, randomBytes(32), 'vault-key', (b, p, a) =>
        authorizeProtectedVault(activeStore, b, p, a),
      ),
      authorities = new EnrollmentAuthorities(activeStore, verifier, graph.now, async () => false),
      service = new EnterpriseInvitations(graph.access, verifier, vault, authorities, graph.now),
      guestId = randomUUID();
    const guest = await seedSyntheticAccount(activeStore, guestId, 'CUSTOMER');
    const challenge = await graph.identity.login(
      'CUSTOMER',
      guestId + '@example.invalid',
      syntheticPassword,
      'synthetic-peer',
      null,
    );
    await graph.identity.verifyFactor(
      challenge.challengeId!,
      syntheticFactor,
      'synthetic-peer',
      null,
      true,
    );
    const codes = await graph.identity.issueRecoveryCodes(challenge.challengeId!, null),
      completed = await graph.identity.acknowledgeRecoveryCodes(
        challenge.challengeId!,
        codes.setId,
        true,
        null,
      ),
      guestContext = await graph.identity.authenticate(
        completed.sessionToken!,
        'CUSTOMER',
        randomUUID(),
        null,
      );
    await backfillU2SecurityState(activeStore);
    const contact = {
        contactId: randomUUID(),
        accountRef: null,
        address: 'recipient@example.invalid',
        state: 'VERIFIED',
        contactVersion: 1,
        verifiedAt: new Date().toISOString(),
        revision: 1,
      },
      policy = {
        policyId: randomUUID(),
        purpose: 'INVITATION_ACCEPTANCE',
        requiredSourceKinds: ['SYNTHETIC'],
        synthetic: true,
        active: true,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        retentionSeconds: 300,
        revision: 1,
      },
      evidence = {
        evidenceId: randomUUID(),
        accountRef: ref('Account', guest.account),
        bindingRef: ref('ProviderBinding', guest.binding),
        policyRef: ref('VerificationPolicy', policy),
        purpose: 'INVITATION_ACCEPTANCE',
        sourceKind: 'SYNTHETIC',
        authorityRef: graph.staff.actorAccountRef,
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        synthetic: true,
        state: 'CONFIRMED',
        contactRef: ref('RegisteredContact', contact),
        contactVersion: 1,
        enterpriseRef: null,
        caseRef: null,
        partyContextRef: null,
        challengeId: null,
        revision: 1,
      };
    await activeStore.execute(
      {
        principalId: 'synthetic-contact-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-contact-evidence',
        target: null,
        idempotencyKey: randomUUID(),
        input: { contactId: contact.contactId },
        correlationId: randomUUID(),
        epoch: await activeStore.currentEpoch(),
      },
      async (tx) => {
        await tx.put('RegisteredContact', contact);
        await tx.put('VerificationPolicy', policy);
        await tx.put('VerificationEvidence', evidence);
      },
    );
    const issueInput = {
      meta: u2Meta(),
      enterpriseRef: graph.enterpriseRef,
      contactRef: ref('RegisteredContact', contact),
      contactVersion: 1,
      departmentRef: null,
      siteRef: null,
      roleRefs: [],
      expectedMembershipRevision: null,
      reactivate: false,
    };
    const receipt = await service.issue(graph.customer, issueInput),
      invitation = (await activeStore.currentProtected(
        'MembershipInvitation',
        receipt.targetRef!.id,
      ))!;
    const material = (
        await sources.vault.query('SELECT binding FROM u2_vault.material WHERE id=$1', [
          invitation.vaultRef,
        ])
      )[0].binding as VaultBinding,
      token = (
        await vault.read(material, {
          authorityRef: ref('MembershipInvitation', invitation),
          targetRef: ref('MembershipInvitation', invitation),
          purpose: 'INVITATION_TOKEN',
          operation: 'enterprise.invitation.deliver',
          epoch: String(invitation.epoch),
          deadlineAt: new Date(Date.now() + 30000).toISOString(),
        })
      ).toString();
    const limited = await authorities.issueInvitation(
        guestContext,
        ref('MembershipInvitation', invitation),
        token,
        ref('VerificationEvidence', evidence),
      ),
      purposeContext = await authorities.authenticate(
        limited.authorityRef,
        limited.handle,
        'INVITATION_ACCEPTANCE',
        randomUUID(),
      ),
      acceptInput = {
        meta: u2Meta(1),
        invitationRef: ref('MembershipInvitation', invitation),
        response: token,
        contactVerificationRef: ref('VerificationEvidence', evidence),
      };
    return {
      ...graph,
      guestContext,
      guest,
      service,
      authorities,
      vault,
      invitation,
      token,
      purposeContext,
      acceptInput,
      issueInput,
      evidence,
      receipt,
    };
  }
  it('새 소속이 없는 본인의 목적 수락을 보호하고 같은 key는 단회 원래 결과를 반환한다', async () => {
    const f = await setup(),
      first = await f.service.accept(f.purposeContext, f.acceptInput),
      second = await f.service.accept(f.purposeContext, f.acceptInput);
    expect(second).toEqual(first);
    expect(
      await store.list('EnterpriseMembership', {
        equals: {
          enterpriseRef: { id: f.enterpriseRef.id },
          accountRef: { id: f.guestContext.principalId },
        },
      }),
    ).toHaveLength(1);
    expect(
      (await store.currentProtected('MembershipInvitation', String(f.invitation.invitationId)))
        ?.state,
    ).toBe('ACCEPTED');
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [
        f.invitation.vaultRef,
      ]),
    ).toHaveLength(0);
    expect(
      await store.list('SecurityTombstone', {
        equals: { targetRef: { id: f.invitation.invitationId } },
      }),
    ).toHaveLength(1);
  });
  it('일반 business 문맥/타초대/다른 token은 목적 권위를 대체하지 못한다', async () => {
    const f = await setup();
    await expect(f.service.accept(f.guestContext, f.acceptInput)).rejects.toMatchObject({
      code: 'PURPOSE_AUTHORITY_REQUIRED',
    });
    await expect(
      f.service.accept(f.purposeContext, {
        ...f.acceptInput,
        response: generatePurposeSecret('INVITATION_TOKEN'),
      }),
    ).rejects.toMatchObject({ code: 'INVITATION_RESPONSE' });
    expect(
      await store.list('EnterpriseMembership', {
        equals: { accountRef: { id: f.guestContext.principalId } },
      }),
    ).toHaveLength(0);
  });
  it('재발송은 token만 회전하고 원래 정확 7일 기한을 보존한다', async () => {
    const f = await setup(),
      result = await f.service.resend(f.customer, {
        meta: u2Meta(1),
        sourceRef: ref('MembershipInvitation', f.invitation),
      }),
      current = (await store.read('MembershipInvitation', String(f.invitation.invitationId)))!;
    expect(current.expiresAt).toBe(f.invitation.expiresAt);
    expect(current.issuedAt).toBe(f.invitation.issuedAt);
    expect(current.tokenGeneration).toBe(2);
    expect(current.tokenVerifier).not.toBe(f.invitation.tokenVerifier);
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [
        f.invitation.vaultRef,
      ]),
    ).toHaveLength(0);
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [current.vaultRef]),
    ).toHaveLength(1);
    expect(result.requestState).toBe('ACCEPTED');
    await expect(
      f.service.accept(f.purposeContext, {
        ...f.acceptInput,
        invitationRef: { ...f.acceptInput.invitationRef, revision: 2 },
        meta: u2Meta(2),
      }),
    ).rejects.toMatchObject({ code: 'PURPOSE_SOURCE_CHANGED' });
  });
  it('회수 뒤 수락은 새 소속/권한을 만들지 않는다', async () => {
    const f = await setup();
    await f.service.revoke(f.customer, {
      meta: u2Meta(1),
      sourceRef: ref('MembershipInvitation', f.invitation),
    });
    await expect(
      f.service.accept(f.purposeContext, {
        ...f.acceptInput,
        meta: u2Meta(2),
        invitationRef: { ...f.acceptInput.invitationRef, revision: 2 },
      }),
    ).rejects.toMatchObject({ code: 'INVITATION_NOT_PENDING' });
    expect(
      await store.list('EnterpriseMembership', {
        equals: { accountRef: { id: f.guestContext.principalId } },
      }),
    ).toHaveLength(0);
  });
  it('연락 확인의 다른 account/버전/미확인 상태를 이메일 문자열로 대체하지 않는다', async () => {
    const f = await setup();
    await store.execute(
      {
        principalId: 'synthetic-evidence-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-unconfirmed-contact',
        target: null,
        idempotencyKey: randomUUID(),
        input: { state: 'UNCONFIRMED' },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) =>
        tx.put('VerificationEvidence', { ...f.evidence, state: 'UNCONFIRMED', revision: 2 }, 1),
    );
    await expect(
      f.service.accept(f.purposeContext, {
        ...f.acceptInput,
        contactVerificationRef: { ...f.acceptInput.contactVerificationRef, revision: 2 },
      }),
    ).rejects.toMatchObject({ code: 'CONTACT_VERIFICATION_REQUIRED' });
  });
  it('초대자 권위 원본 변경은 원래 초대 수락을 재확인으로 닫는다', async () => {
    const f = await setup(),
      grant = (
        await store.list('CustomerRoleGrant', {
          equals: { membershipRef: { id: f.member.membershipId }, revokedAt: null },
        })
      )[0]!;
    await store.execute(
      {
        principalId: 'synthetic-current-grant-owner',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-inviter-revoke',
        target: null,
        idempotencyKey: randomUUID(),
        input: { grantId: grant.grantId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) =>
        tx.put(
          'CustomerRoleGrant',
          { ...grant, revokedAt: new Date().toISOString(), revision: 2 },
          1,
        ),
    );
    await expect(f.service.accept(f.purposeContext, f.acceptInput)).resolves.toMatchObject({
      requestState: 'REVIEW_REQUIRED',
    });
    expect(
      (await store.currentProtected('MembershipInvitation', String(f.invitation.invitationId)))
        ?.state,
    ).toBe('RECONFIRMATION_REQUIRED');
  });
  it('accept와 revoke 경합은 한 보호 원본 결과만 만든다', async () => {
    const f = await setup();
    const results = await Promise.allSettled([
      f.service.accept(f.purposeContext, f.acceptInput),
      f.service.revoke(f.customer, {
        meta: u2Meta(1),
        sourceRef: ref('MembershipInvitation', f.invitation),
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const current = (await store.currentProtected(
      'MembershipInvitation',
      String(f.invitation.invitationId),
    ))!;
    expect(['ACCEPTED', 'REVOKED']).toContain(current.state);
    const members = await store.list('EnterpriseMembership', {
      equals: { accountRef: { id: f.guestContext.principalId } },
    });
    expect(members.length).toBe(current.state === 'ACCEPTED' ? 1 : 0);
  });
  it('기존 ACTIVE 소속을 덮어쓰지 않고 같은 발행 key는 비밀/Work를 다시 만들지 않는다', async () => {
    const f = await setup(),
      replay = await f.service.issue(f.customer, f.issueInput);
    expect(replay).toEqual(f.receipt);
    expect(await store.list('MembershipInvitation')).toHaveLength(1);
    await f.service.accept(f.purposeContext, f.acceptInput);
    await expect(
      f.service.accept(f.purposeContext, {
        ...f.acceptInput,
        meta: { ...f.acceptInput.meta, clientRequestId: randomUUID() },
      }),
    ).rejects.toThrow();
    expect(
      await store.list('EnterpriseMembership', {
        equals: { accountRef: { id: f.guestContext.principalId } },
      }),
    ).toHaveLength(1);
  });
  it('수락 전에 이미 ACTIVE인 원래 소속을 실제로 덮어쓰지 않는다', async () => {
    const f = await setup(),
      member = {
        membershipId: randomUUID(),
        accountRef: f.guestContext.actorAccountRef,
        enterpriseRef: f.enterpriseRef,
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
        designationBasis: null,
        revision: 1,
      };
    await store.execute(
      {
        principalId: 'synthetic-membership-owner',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-existing-member',
        target: null,
        idempotencyKey: randomUUID(),
        input: { membershipId: member.membershipId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => tx.put('EnterpriseMembership', member),
    );
    await expect(f.service.accept(f.purposeContext, f.acceptInput)).rejects.toMatchObject({
      code: 'MEMBERSHIP_INTENT',
    });
    expect(
      (await store.currentProtected('EnterpriseMembership', member.membershipId))?.revision,
    ).toBe(1);
  });
  it('INACTIVE의 정확한 재활성화 의도만 같은 stable membership으로 수락한다', async () => {
    const f = await setup(),
      member = {
        membershipId: randomUUID(),
        accountRef: f.guestContext.actorAccountRef,
        enterpriseRef: f.enterpriseRef,
        departmentRef: null,
        siteRef: null,
        active: false,
        administrator: false,
        designationBasis: null,
        revision: 1,
      };
    await store.execute(
      {
        principalId: 'synthetic-membership-owner',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-inactive-member',
        target: null,
        idempotencyKey: randomUUID(),
        input: { membershipId: member.membershipId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => tx.put('EnterpriseMembership', member),
    );
    await expect(f.service.accept(f.purposeContext, f.acceptInput)).rejects.toMatchObject({
      code: 'MEMBERSHIP_INTENT',
    });
    const issued = await f.service.issue(f.customer, {
        ...f.issueInput,
        meta: u2Meta(),
        reactivate: true,
        expectedMembershipRevision: 1,
      }),
      invitation = (await store.read('MembershipInvitation', issued.targetRef!.id))!,
      material = (
        await sources.vault.query('SELECT binding FROM u2_vault.material WHERE id=$1', [
          invitation.vaultRef,
        ])
      )[0].binding as VaultBinding,
      token = (
        await f.vault.read(material, {
          authorityRef: ref('MembershipInvitation', invitation),
          targetRef: ref('MembershipInvitation', invitation),
          purpose: 'INVITATION_TOKEN',
          operation: 'enterprise.invitation.deliver',
          epoch: String(invitation.epoch),
          deadlineAt: new Date(Date.now() + 30000).toISOString(),
        })
      ).toString(),
      limited = await f.authorities.issueInvitation(
        f.guestContext,
        ref('MembershipInvitation', invitation),
        token,
        ref('VerificationEvidence', f.evidence),
      ),
      context = await f.authorities.authenticate(
        limited.authorityRef,
        limited.handle,
        'INVITATION_ACCEPTANCE',
        randomUUID(),
      );
    const result = await f.service.accept(context, {
      meta: u2Meta(1),
      invitationRef: ref('MembershipInvitation', invitation),
      response: token,
      contactVerificationRef: ref('VerificationEvidence', f.evidence),
    });
    expect(result.targetRef?.id).toBe(member.membershipId);
    expect(
      (await store.currentProtected('EnterpriseMembership', member.membershipId))?.revision,
    ).toBe(2);
  });
  it('원래 본인 상태 조회는 제한 목적 안에서 연락/기업 자료를 노출하지 않는다', async () => {
    const f = await setup();
    const before = await f.service.readOwn(
      f.purposeContext,
      ref('MembershipInvitation', f.invitation),
    );
    expect(before).toMatchObject({ state: 'PENDING', actualEffect: 'UNCONFIRMED' });
    expect(JSON.stringify(before)).not.toContain('recipient@');
    expect(JSON.stringify(before)).not.toContain('legalName');
    await f.service.accept(f.purposeContext, f.acceptInput);
    await expect(
      f.service.readOwn(f.purposeContext, ref('MembershipInvitation', f.invitation)),
    ).resolves.toMatchObject({
      state: 'ACCEPTED',
      actualEffect: 'CONFIRMED',
      noticeDelivery: 'REQUESTED',
    });
    await expect(
      f.service.readOwn(f.guestContext, ref('MembershipInvitation', f.invitation)),
    ).rejects.toMatchObject({ code: 'PURPOSE_AUTHORITY_REQUIRED' });
  });
  it('발행 primary commit crash에도 원래 암호 준비 bytes가 보존되고 prefix 뒤 같은 Receipt만 재관측한다', async () => {
    let enabled = false,
      failed = false;
    const crashed = new ProtectedStore(
        sources.primaryApp,
        sources.journalAppend,
        async (boundary) => {
          if (enabled && !failed && boundary === 'PRIMARY_COMMITTED') {
            failed = true;
            throw Error('synthetic-invitation-primary-crash');
          }
        },
      ),
      f = await setup(crashed),
      input = { ...f.issueInput, meta: u2Meta() };
    enabled = true;
    await expect(f.service.issue(f.customer, input)).rejects.toThrow(
      'synthetic-invitation-primary-crash',
    );
    const raw = await sources.primaryAdmin.getRepository('MembershipInvitation').find(),
      unprotected = raw.find((row) => row.invitationId !== f.invitation.invitationId)!;
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [
        unprotected.vaultRef,
      ]),
    ).toHaveLength(1);
    await expect(
      f.service.deliveryMaterial(ref('MembershipInvitation', unprotected)),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    await store.protectPending(await store.currentEpoch());
    const replay = await f.service.issue(f.customer, input);
    expect(replay.targetRef?.id).toBe(unprotected.invitationId);
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [
        unprotected.vaultRef,
      ]),
    ).toHaveLength(1);
    expect(await store.list('MembershipInvitation')).toHaveLength(2);
    expect(await f.service.deliveryMaterial(replay.targetRef!)).toMatchObject({
      binding: { id: unprotected.vaultRef },
    });
  });
  it('정확 private 초대 전달 확인은 토큰 자료를 보호 파기하고7일 초대 수락 자체와 구별한다', async () => {
    const f = await setup(),
      queue = new SyntheticQueue(),
      seen: boolean[] = [],
      delivery = new PrivateU2Delivery(
        store,
        f.vault,
        {
          profile: 'LOCAL_SYNTHETIC',
          send: async (envelope, bytes) => {
            seen.push(bytes.toString() === f.token);
            return {
              deliveryId: envelope.deliveryId,
              routeRef: envelope.routeRef,
              knowledge: 'KNOWN',
            };
          },
        },
        f.now,
        true,
        undefined,
        f.service,
      ),
      identity = new IdentityConsumer(
        store,
        new StatefulRecoveryProvider(f.now),
        f.authorities,
        f.now,
        true,
      ),
      worker = new U2Worker(store, queue, identity, f.now, true, {
        'u2-invitation-delivery': delivery,
      }),
      outbox = (
        await store.list('OutboxDelivery', { equals: { consumer: 'u2-invitation-delivery' } })
      )[0]!;
    await worker.relayOne(String(outbox.outboxId));
    const message = (await queue.receive('u2-invitation-delivery'))[0]!;
    await worker.consume(message);
    expect(seen).toEqual([true]);
    expect(queue.acknowledgements).toEqual([message.id]);
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [
        f.invitation.vaultRef,
      ]),
    ).toHaveLength(0);
    expect(
      await store.currentProtected('MembershipInvitation', String(f.invitation.invitationId)),
    ).toMatchObject({ state: 'PENDING', expiresAt: f.invitation.expiresAt });
    await worker.consume(message);
    expect(seen).toHaveLength(1);
    await expect(f.service.accept(f.purposeContext, f.acceptInput)).resolves.toMatchObject({
      requestState: 'RESULT_RECORDED',
    });
  });
});
