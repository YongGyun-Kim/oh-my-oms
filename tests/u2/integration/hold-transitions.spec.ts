import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import {
  RecoveryHolds,
  RecoveryVerificationPolicies,
  EmergencyRecoveries,
  IdentityBrowser,
  generatePurposeSecret,
  ref,
} from '@oms/core';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedVerifiedRecoveryParty } from '../fixtures/identity.js';
import { u2Meta } from '../fixtures/enterprise.js';
describe('복구 HOLD의 현재 근거/권위와 원래 효과 보존', () => {
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
  async function held() {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    await f.handoffs.verifyParty(f.staff, { ...f.verifyInput, decision: 'HOLD' });
    const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      input = {
        meta: {
          ...u2Meta(Number(source.revision)),
          evidenceRefs: [ref('VerificationEvidence', f.evidence)],
        },
        sourceRef: ref('RecoveryCase', source),
        basisRef: ref('VerificationPolicy', f.policy),
        reason: '합성 현재 근거 재검토',
      },
      service = new RecoveryHolds(
        store,
        new RecoveryVerificationPolicies(store, f.now, 'LOCAL_SYNTHETIC'),
        f.now,
        f.vault,
      );
    return { ...f, current: source, input, service };
  }
  it('현재 정책/모든 출처 재대조 후 VERIFYING이며 옛 기한/세대를 늘리거나 grant를 발급하지 않는다', async () => {
    const f = await held(),
      receipt = await f.service.resume(f.staff, f.input),
      source = (await store.currentProtected('RecoveryCase', f.source.caseId))!;
    expect(receipt.owner).toBe('IdentityRecovery');
    expect(receipt.requestState).toBe('REVIEW_REQUIRED');
    expect(source).toMatchObject({
      state: 'VERIFYING',
      deadlineAt: f.current.deadlineAt,
      securityGeneration: f.current.securityGeneration,
      verificationRef: null,
      partyContextRef: null,
    });
    expect(await store.list('RecoveryHandoffGrant')).toHaveLength(0);
    expect((await f.service.resume(f.staff, f.input)).requestId).toBe(receipt.requestId);
  });
  it('실제 정책 미등록·근거 없음·다른 대상 근거는 HOLD에서 벗어나지 않는다', async () => {
    const f = await held(),
      unregistered = new RecoveryHolds(
        store,
        new RecoveryVerificationPolicies(store, f.now, 'UNREGISTERED'),
        f.now,
        f.vault,
      );
    await expect(unregistered.resume(f.staff, f.input)).rejects.toMatchObject({
      code: 'RECOVERY_POLICY_UNREGISTERED',
    });
    await expect(
      f.service.resume(f.staff, { ...f.input, meta: { ...f.input.meta, evidenceRefs: [] } }),
    ).rejects.toThrow();
    await f.execute('fixture-wrong-review-account', async (tx) =>
      tx.put(
        'VerificationEvidence',
        { ...f.evidence, accountRef: f.staff.actorAccountRef, revision: 2 },
        1,
      ),
    );
    await expect(
      f.service.resume(f.staff, {
        ...f.input,
        meta: {
          ...f.input.meta,
          evidenceRefs: [ref('VerificationEvidence', { ...f.evidence, revision: 2 })],
        },
      }),
    ).rejects.toMatchObject({ code: 'RECOVERY_REVIEW_EVIDENCE' });
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
  });
  it('issuer 회수/stale source/고객 업무 문맥은 재검토를 하지 못한다', async () => {
    const f = await held();
    await expect(f.service.resume(f.customer, f.input)).rejects.toThrow();
    await expect(
      f.service.resume(f.staff, { ...f.input, meta: { ...f.input.meta, expectedRevision: 1 } }),
    ).rejects.toMatchObject({ code: 'RECOVERY_HOLD_REVISION' });
    const role = (await store.list('StaffRole'))[0]!;
    await f.access.reviseStaffRole(f.staff, {
      meta: u2Meta(2),
      roleRef: ref('StaffRole', role),
      label: '검토 권위 회수',
      actions: ['staff.role.manage'],
    });
    await expect(f.service.resume(f.staff, f.input)).rejects.toMatchObject({
      code: 'ACTION_DENIED',
    });
  });
  it('원래 UNKNOWN slot은 재개와 종료 후에도 남고 CLOSED는 완료/효과 부재가 아니다', async () => {
    const f = await held(),
      slot = {
        slotId: randomUUID(),
        revision: 1,
        accountRef: f.customer.actorAccountRef,
        bindingRef: f.current.bindingRef,
        caseRef: ref('RecoveryCase', f.current),
        state: 'UNKNOWN',
        originalOperationRef: null,
        deadlineAt: f.current.deadlineAt,
        epoch: await store.currentEpoch(),
      };
    await f.execute('fixture-held-unknown', async (tx) => tx.put('IdentityExecutionSlot', slot));
    await f.service.resume(f.staff, f.input);
    const current = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      closed = await f.service.close(f.staff, {
        ...f.input,
        meta: u2Meta(Number(current.revision)),
        sourceRef: ref('RecoveryCase', current),
        reason: '원래 불명 효과를 남기고 검토 종료',
      });
    expect(closed.requestState).toBe('RESULT_RECORDED');
    expect(await store.currentProtected('IdentityExecutionSlot', slot.slotId)).toEqual(slot);
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('CLOSED');
    expect(await store.list('EnrollmentAuthority')).toHaveLength(0);
  });
  it('종료/완료 상태를 재개하거나 같은 종료를 새 key로 반복하지 않는다', async () => {
    const f = await held(),
      closed = await f.service.close(f.staff, f.input),
      current = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      input = {
        ...f.input,
        meta: u2Meta(Number(current.revision)),
        sourceRef: ref('RecoveryCase', current),
      };
    await expect(f.service.resume(f.staff, input)).rejects.toMatchObject({
      code: 'RECOVERY_HOLD_REVISION',
    });
    await expect(f.service.close(f.staff, input)).rejects.toMatchObject({
      code: 'RECOVERY_HOLD_REVISION',
    });
    expect((await f.service.close(f.staff, f.input)).requestId).toBe(closed.requestId);
  });
  it('원래 현재 binding/보안 세대가 바뀌면 옛 근거로 재검토하지 않는다', async () => {
    const f = await held(),
      security = (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]!;
    await f.execute('fixture-newer-held-security', async (tx) =>
      tx.put('AccountSecurityState', { ...security, securityGeneration: 2, revision: 2 }, 1),
    );
    await expect(f.service.resume(f.staff, f.input)).rejects.toMatchObject({
      code: 'RECOVERY_REVIEW_SOURCE',
    });
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
  });
  it('발급 후 현재 종료는 grant 회수/보호 파기와 실제 암호 자료 삭제를 연결한다', async () => {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    await f.handoffs.verifyParty(f.staff, f.verifyInput);
    const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      issued = await f.handoffs.issue(f.staff, {
        meta: u2Meta(2),
        caseRef: ref('RecoveryCase', source),
        verificationRef: source.verificationRef as import('@oms/contracts').Ref,
        partyContextRef: source.partyContextRef as import('@oms/contracts').Ref,
        deliveryRouteRef: ref('RegisteredContact', f.contact),
      }),
      grant = (await store.currentProtected('RecoveryHandoffGrant', issued.targetRef!.id))!,
      service = new RecoveryHolds(
        store,
        new RecoveryVerificationPolicies(store, f.now, 'LOCAL_SYNTHETIC'),
        f.now,
        f.vault,
      );
    await service.close(f.staff, {
      meta: u2Meta(Number(source.revision)),
      sourceRef: ref('RecoveryCase', source),
      basisRef: null,
      reason: '당사자 복구 진행 종료',
    });
    expect(
      (await store.currentProtected('RecoveryHandoffGrant', issued.targetRef!.id))?.state,
    ).toBe('REVOKED');
    expect(
      await store.list('SecurityTombstone', {
        equals: { targetRef: { id: issued.targetRef!.id } },
      }),
    ).toHaveLength(1);
    expect(
      (
        await sources.vault.query('SELECT count(*)::int AS n FROM u2_vault.material WHERE id=$1', [
          grant.vaultRef,
        ])
      )[0].n,
    ).toBe(0);
    expect(await store.list('ClaimReceipt')).toHaveLength(0);
  });
  async function emergency(includeUnknown = true) {
    const f = await seedVerifiedRecoveryParty(
        store,
        sources.vault,
        'LOCAL_SYNTHETIC',
        undefined,
        true,
      ),
      binding = (
        await store.list('ProviderBinding', {
          equals: { accountRef: { id: f.staff.principalId }, audience: 'STAFF', active: true },
        })
      )[0]!,
      source = {
        ...f.source,
        caseId: randomUUID(),
        accountRef: f.staff.actorAccountRef,
        bindingRef: ref('ProviderBinding', binding),
        bindingGeneration: binding.generation,
        method: 'EMERGENCY',
        state: 'HOLD',
      },
      policy = { ...f.policy, policyId: randomUUID(), purpose: 'EMERGENCY_PRIVATE' },
      service = f.operators!,
      operator = {
        operatorAuthorityId: randomUUID(),
        revision: 1,
        operatorId: 'synthetic-separate-operator',
        policyRef: ref('VerificationPolicy', policy),
        synthetic: true,
        active: true,
        expiresAt: policy.expiresAt,
        credentialVerifier: '',
      },
      credential = generatePurposeSecret('EMERGENCY_OPERATOR');
    operator.credentialVerifier = f.verifier.digest(
      credential,
      service.binding(operator, await store.currentEpoch()),
    );
    const evidence = {
        ...f.evidence,
        evidenceId: randomUUID(),
        accountRef: source.accountRef,
        bindingRef: source.bindingRef,
        caseRef: ref('RecoveryCase', source),
        policyRef: ref('VerificationPolicy', policy),
        purpose: 'EMERGENCY_PRIVATE',
        authorityRef: source.accountRef,
        operatorAuthorityRef: ref('EmergencyOperatorAuthority', operator),
        partyContextRef: null,
        challengeId: null,
        contactRef: null,
        contactVersion: null,
      },
      original = {
        emergencyCaseId: randomUUID(),
        revision: 1,
        caseRef: ref('RecoveryCase', source),
        accountRef: source.accountRef,
        operatorAuthorityRef: ref('EmergencyOperatorAuthority', operator),
        policyRef: ref('VerificationPolicy', policy),
        evidenceRefs: [],
        state: 'HOLD',
        reason: '별도 운영 검토 대기',
        deadlineAt: source.deadlineAt,
        epoch: source.epoch,
      },
      slot = {
        slotId: randomUUID(),
        revision: 1,
        accountRef: source.accountRef,
        bindingRef: source.bindingRef,
        caseRef: ref('RecoveryCase', source),
        state: 'UNKNOWN',
        originalOperationRef: null,
        deadlineAt: source.deadlineAt,
        epoch: source.epoch,
      };
    await f.execute('fixture-emergency-original', async (tx) => {
      await tx.put('RecoveryCase', source);
      await tx.put('VerificationPolicy', policy);
      await tx.put('EmergencyOperatorAuthority', operator);
      await tx.put('VerificationEvidence', evidence);
      await tx.put('EmergencyRecoveryCase', original);
      if (includeUnknown) await tx.put('IdentityExecutionSlot', slot);
    });
    const context = await service.authenticate(
        ref('EmergencyOperatorAuthority', operator),
        credential,
        ref('RecoveryCase', source),
        randomUUID(),
        'separate-operator-ingress',
      ),
      input = {
        meta: { ...u2Meta(1), evidenceRefs: [ref('VerificationEvidence', evidence)] },
        sourceRef: ref('EmergencyRecoveryCase', original),
        basisRef: ref('VerificationPolicy', policy),
        reason: '현재 별도 운영 근거 검토',
      };
    return { ...f, service, source, operator, context, input, original, slot, evidence, policy };
  }
  it('별도 운영 자격의 비상 HOLD 재검토도 원래 기한/UNKNOWN slot/일반 grant를 유지하며 claim 권위를 만들지 않는다', async () => {
    const f = await emergency(),
      grants = await store.list('StaffRoleGrant'),
      receipt = await f.service.resume(f.context, f.input),
      source = (await store.currentProtected('EmergencyRecoveryCase', f.original.emergencyCaseId))!;
    expect(receipt.owner).toBe('IdentityRecovery');
    expect(source).toMatchObject({
      state: 'VERIFYING',
      deadlineAt: f.original.deadlineAt,
      revision: 2,
    });
    expect(await store.currentProtected('IdentityExecutionSlot', f.slot.slotId)).toEqual(f.slot);
    expect(await store.list('StaffRoleGrant')).toEqual(grants);
    expect(await store.list('EnrollmentAuthority')).toHaveLength(0);
    expect((await f.service.resume(f.context, f.input)).requestId).toBe(receipt.requestId);
  });
  it('일반 직원 context/다른 확인 출처/옛 예상 개정은 비상 HOLD를 재개하지 않는다', async () => {
    const f = await emergency();
    await expect(
      f.service.resume(f.staff as unknown as Parameters<EmergencyRecoveries['resume']>[0], f.input),
    ).rejects.toMatchObject({ code: 'EMERGENCY_PRIVATE_REQUIRED' });
    await expect(
      f.service.resume(f.context, { ...f.input, meta: { ...f.input.meta, expectedRevision: 99 } }),
    ).rejects.toMatchObject({ code: 'EMERGENCY_CONTROL_SOURCE' });
    await f.execute('fixture-emergency-evidence-revoked', async (tx) =>
      tx.put('VerificationEvidence', { ...f.evidence, state: 'REVOKED', revision: 2 }, 1),
    );
    await expect(
      f.service.resume(f.context, {
        ...f.input,
        meta: {
          ...f.input.meta,
          evidenceRefs: [ref('VerificationEvidence', { ...f.evidence, revision: 2 })],
        },
      }),
    ).rejects.toMatchObject({ code: 'EMERGENCY_REVIEW_EVIDENCE' });
    expect(
      (await store.currentProtected('EmergencyRecoveryCase', f.original.emergencyCaseId))?.state,
    ).toBe('HOLD');
  });
  it('현재 비상 종료는 원래 외부 불명 링크를 남기며 종료 원본을 재개하지 않는다', async () => {
    const f = await emergency(),
      receipt = await f.service.close(f.context, f.input),
      source = (await store.currentProtected('EmergencyRecoveryCase', f.original.emergencyCaseId))!;
    expect(source).toMatchObject({
      state: 'CLOSED',
      deadlineAt: f.original.deadlineAt,
      caseRef: { ...f.original.caseRef, revision: 2 },
    });
    expect(await store.currentProtected('IdentityExecutionSlot', f.slot.slotId)).toEqual(f.slot);
    expect((await f.service.close(f.context, f.input)).requestId).toBe(receipt.requestId);
    await expect(
      f.service.resume(f.context, {
        ...f.input,
        sourceRef: ref('EmergencyRecoveryCase', source),
        meta: { ...f.input.meta, expectedRevision: 2 },
      }),
    ).rejects.toMatchObject({ code: 'EMERGENCY_CONTROL_SOURCE' });
  });
  async function privateVerified() {
    const f = await emergency(false),
      browser = generatePurposeSecret('PARTY_BROWSER'),
      challengeId = randomUUID(),
      created = (await IdentityBrowser.run(
        { current: generatePurposeSecret('PARTY_BROWSER'), next: browser },
        () =>
          f.parties.create(
            {
              attemptId: challengeId,
              audience: 'STAFF',
              correlationId: randomUUID(),
              deadlineAt: new Date(Date.now() + 10000).toISOString(),
            },
            { caseRef: ref('RecoveryCase', f.source), challengeId },
            'synthetic-private-ingress',
          ),
      )) as { partyContextRef: import('@oms/contracts').Ref; partySecret: string },
      contact = { ...f.contact, contactId: randomUUID(), accountRef: f.source.accountRef },
      evidence = {
        ...f.evidence,
        partyContextRef: created.partyContextRef,
        challengeId,
        contactRef: ref('RegisteredContact', contact),
        contactVersion: 1,
        revision: 2,
      };
    await f.execute('fixture-current-emergency-party', async (tx) => {
      await tx.put('RegisteredContact', contact);
      await tx.put('VerificationEvidence', evidence, 1);
    });
    await f.service.resume(f.context, {
      ...f.input,
      meta: { ...f.input.meta, evidenceRefs: [ref('VerificationEvidence', evidence)] },
    });
    const privateContext = await f.service.serviceContext(f.context),
      verifyInput = {
        meta: u2Meta(1),
        caseRef: ref('RecoveryCase', f.source),
        partyContextRef: created.partyContextRef,
        policyRef: ref('VerificationPolicy', f.policy),
        evidenceRefs: [ref('VerificationEvidence', evidence)],
        decision: 'CONFIRM' as const,
      };
    return { ...f, browser, challengeId, created, contact, evidence, privateContext, verifyInput };
  }
  it('별도 운영 확인도 직원 당사자 challenge에만 결합하며 일반 STAFF/복제 SYSTEM 문맥으로 비상 확인을 만들지 않는다', async () => {
    const f = await privateVerified();
    await expect(f.handoffs.verifyParty(f.staff, f.verifyInput)).rejects.toMatchObject({
      code: 'RECOVERY_CASE_REVISION',
    });
    await expect(
      f.handoffs.verifyParty({ ...f.privateContext }, f.verifyInput),
    ).rejects.toMatchObject({ code: 'EMERGENCY_PRIVATE_REQUIRED' });
    const receipt = await f.handoffs.verifyParty(f.privateContext, f.verifyInput),
      verification = (await store.list('RecoveryVerification'))[0]!;
    expect(receipt.requestState).toBe('RESULT_RECORDED');
    expect(verification.operatorAuthorityRef).toEqual(
      ref('EmergencyOperatorAuthority', f.operator),
    );
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'VERIFYING',
    );
    expect(
      (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.staff.principalId } },
        })
      )[0]?.securityGeneration,
    ).toBe(1);
  });
  it('비상 확인/발급 뒤에도 실제 private 직원 당사자의 단회 claim만 제한 권위와 세대를 전환한다', async () => {
    const f = await privateVerified();
    await f.handoffs.verifyParty(f.privateContext, f.verifyInput);
    const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      issued = await f.handoffs.issue(f.privateContext, {
        meta: u2Meta(2),
        caseRef: ref('RecoveryCase', source),
        verificationRef: source.verificationRef as import('@oms/contracts').Ref,
        partyContextRef: source.partyContextRef as import('@oms/contracts').Ref,
        deliveryRouteRef: ref('RegisteredContact', f.contact),
      }),
      grant = (await store.currentProtected('RecoveryHandoffGrant', issued.targetRef!.id))!,
      binding = (
        await sources.vault.query('SELECT binding FROM u2_vault.material WHERE id=$1', [
          grant.vaultRef,
        ])
      )[0].binding as import('@oms/persistence').VaultBinding,
      code = (
        await f.vault.read(binding, {
          authorityRef: issued.targetRef!,
          targetRef: issued.targetRef!,
          purpose: 'HANDOFF',
          operation: 'identity.handoff.deliver',
          epoch: String(grant.epoch),
          deadlineAt: new Date(Date.now() + 10000).toISOString(),
        })
      ).toString(),
      input = {
        meta: u2Meta(1),
        grantRef: issued.targetRef!,
        caseRef: ref('RecoveryCase', source),
        challengeId: f.challengeId,
        code,
        partySecret: f.created.partySecret,
      },
      pre = {
        attemptId: f.challengeId,
        audience: 'STAFF' as const,
        correlationId: randomUUID(),
        deadlineAt: new Date(Date.now() + 10000).toISOString(),
      };
    await expect(
      IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
        f.handoffs.claim(pre, input),
      ),
    ).rejects.toMatchObject({ code: 'STAFF_INGRESS_REQUIRED' });
    const result = await IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
      f.handoffs.claim(pre, input, 'synthetic-private-ingress'),
    );
    expect(result.handle).toHaveLength(43);
    expect((await store.list('EnrollmentAuthority'))[0]).toMatchObject({
      audience: 'STAFF',
      securityGeneration: 2,
      state: 'ACTIVE',
    });
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'ENROLMENT_ONLY',
    );
    expect(
      (await store.currentProtected('RecoveryHandoffGrant', issued.targetRef!.id))?.state,
    ).toBe('CLAIMED');
    expect(
      (await store.currentProtected('EmergencyRecoveryCase', f.original.emergencyCaseId))?.state,
    ).toBe('ENROLMENT_ONLY');
  });
  it('비상 result 수락은 당사자 전체 COMPLETED 원본 이전에 MFA/code Ref만으로 완료를 만들지 않는다', async () => {
    const f = await emergency(),
      input = {
        meta: u2Meta(1),
        caseRef: ref('RecoveryCase', f.source),
        enrollmentRef: {
          owner: 'IdentityRecovery',
          entity: 'MfaEnrollment',
          id: randomUUID(),
          revision: 1,
        },
        codeSetRef: {
          owner: 'IdentityRecovery',
          entity: 'RecoveryCodeSet',
          id: randomUUID(),
          revision: 1,
        },
        providerResultRefs: [],
      };
    await expect(f.service.applyVerifiedResult(f.context, input)).rejects.toMatchObject({
      code: 'EMERGENCY_COMPLETION_REQUIRED',
    });
    expect(
      (await store.currentProtected('EmergencyRecoveryCase', f.original.emergencyCaseId))?.state,
    ).toBe('HOLD');
    expect(await store.list('EnrollmentAuthority')).toHaveLength(0);
  });
});
