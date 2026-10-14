import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import {
  AdministratorRestoration,
  EnterpriseMemberships,
  EnterpriseRoleRevisions,
  EnterpriseAccess,
  ref,
} from '@oms/core';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2Enterprise, u2Meta } from '../fixtures/enterprise.js';
describe('현재 신원/기업 위임에 따른 관리자 재지정의 보호 원본', () => {
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
  async function setup() {
    const g = await seedU2Enterprise(store);
    await new EnterpriseMemberships(g.access).update(g.customer, {
      meta: u2Meta(1),
      membershipRef: ref('EnterpriseMembership', g.member),
      departmentRef: null,
      siteRef: null,
      active: true,
      administrator: false,
    });
    const member = (await store.currentProtected(
        'EnterpriseMembership',
        String(g.member.membershipId),
      ))!,
      enterprise = (await store.currentProtected('Enterprise', g.enterpriseRef.id))!,
      staffRole = (await store.list('StaffRole'))[0]!;
    await new EnterpriseRoleRevisions(g.access).staff(g.staff, {
      meta: u2Meta(1),
      roleRef: ref('StaffRole', staffRole),
      label: '합성 재지정 담당',
      actions: [...(staffRole.actions as string[]), 'enterprise.administrator.restore'],
    });
    const binding = (
        await store.list('ProviderBinding', {
          equals: {
            accountRef: { id: g.customer.principalId },
            audience: 'CUSTOMER',
            active: true,
          },
        })
      )[0]!,
      link = (
        await store.list('VerifiedPersonLink', {
          equals: { accountRefs: [{ id: g.customer.principalId }] },
        })
      )[0]!,
      role = (await store.list('CustomerRole', { equals: { label: '명시 관리' } }))[0]!,
      expires = new Date(Date.now() + 3600000).toISOString(),
      delegationPolicy = {
        policyId: randomUUID(),
        revision: 1,
        purpose: 'ADMINISTRATOR_RESTORATION',
        requiredSourceKinds: ['SYNTHETIC'],
        synthetic: true,
        active: true,
        expiresAt: expires,
        retentionSeconds: 300,
      },
      personPolicy = { ...delegationPolicy, policyId: randomUUID(), purpose: 'SAME_PERSON' },
      base = {
        revision: 1,
        accountRef: g.customer.actorAccountRef,
        bindingRef: ref('ProviderBinding', binding),
        sourceKind: 'SYNTHETIC',
        authorityRef: g.staff.actorAccountRef,
        observedAt: new Date().toISOString(),
        expiresAt: expires,
        synthetic: true,
        state: 'CONFIRMED',
        contactRef: null,
        contactVersion: null,
        enterpriseRef: null,
        caseRef: null,
        partyContextRef: null,
        challengeId: null,
      },
      delegation = {
        ...base,
        evidenceId: randomUUID(),
        purpose: 'ADMINISTRATOR_RESTORATION',
        policyRef: ref('VerificationPolicy', delegationPolicy),
        enterpriseRef: ref('Enterprise', enterprise),
      },
      personEvidence = {
        ...base,
        evidenceId: randomUUID(),
        purpose: 'SAME_PERSON',
        policyRef: ref('VerificationPolicy', personPolicy),
      },
      person = {
        personVerificationId: randomUUID(),
        revision: 1,
        personLinkRef: ref('VerifiedPersonLink', link),
        policyRef: ref('VerificationPolicy', personPolicy),
        evidenceRefs: [ref('VerificationEvidence', personEvidence)],
        verifiedBy: g.staff.actorAccountRef,
        verifiedAt: new Date().toISOString(),
        expiresAt: expires,
        state: 'CONFIRMED',
      };
    await store.execute(
      {
        principalId: 'synthetic-current-policy-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-restoration-basis',
        target: null,
        idempotencyKey: randomUUID(),
        input: { personId: person.personVerificationId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put('VerificationPolicy', delegationPolicy);
        await tx.put('VerificationPolicy', personPolicy);
        await tx.put('VerificationEvidence', delegation);
        await tx.put('VerificationEvidence', personEvidence);
        await tx.put('PersonVerification', person);
      },
    );
    const input = {
      meta: u2Meta(Number(member.revision)),
      enterpriseRef: ref('Enterprise', enterprise),
      membershipRef: ref('EnterpriseMembership', member),
      delegationRef: ref('VerificationEvidence', delegation),
      personVerificationRef: ref('PersonVerification', person),
      roleRefs: [ref('CustomerRole', role)],
    };
    return {
      ...g,
      member,
      enterprise,
      delegationPolicy,
      delegation,
      person,
      input,
      service: new AdministratorRestoration(g.access, g.now),
    };
  }
  it('관리자 0에서 실제 합성 근거를 재대조하고 기존 관리 grant를 중복 없이 보호한다', async () => {
    const f = await setup(),
      before = await store.list('CustomerRoleGrant'),
      result = await f.service.restore(f.staff, f.input);
    expect(result.requestState).toBe('RESULT_RECORDED');
    expect(
      (await store.currentProtected('AdministratorRestoration', result.targetRef!.id))?.state,
    ).toBe('APPLIED');
    expect(
      (await store.currentProtected('Enterprise', f.enterpriseRef.id))?.administratorCount,
    ).toBe(1);
    expect(
      (await store.currentProtected('EnterpriseMembership', String(f.member.membershipId)))
        ?.administrator,
    ).toBe(true);
    expect(await store.list('CustomerRoleGrant')).toHaveLength(before.length);
    expect((await f.service.restore(f.staff, f.input)).requestId).toBe(result.requestId);
  });
  it('현재 위임 정책이 미확인이면 HOLD이며 관리자/거래 권한을 만들지 않는다', async () => {
    const f = await setup();
    await store.execute(
      {
        principalId: 'synthetic-policy-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-policy-off',
        target: null,
        idempotencyKey: randomUUID(),
        input: { active: false },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) =>
        tx.put('VerificationPolicy', { ...f.delegationPolicy, active: false, revision: 2 }, 1),
    );
    const result = await f.service.restore(f.staff, f.input);
    expect(result.requestState).toBe('REVIEW_REQUIRED');
    expect(
      (await store.currentProtected('AdministratorRestoration', result.targetRef!.id))?.state,
    ).toBe('HOLD');
    expect(
      (await store.currentProtected('Enterprise', f.enterpriseRef.id))?.administratorCount,
    ).toBe(0);
  });
  it('실제 미등록 정책은 합성 fixture로 실활성되지 않는다', async () => {
    const f = await setup(),
      access = new EnterpriseAccess(
        store,
        {
          kind: 'UNREGISTERED',
          enterprise: async () => {
            throw new Error('unused');
          },
          administrator: async () => {
            throw new Error('미등록 실제 위임을 조회해서는 안 됩니다.');
          },
        },
        f.now,
        false,
      ),
      result = await new AdministratorRestoration(access, f.now).restore(f.staff, f.input);
    expect(result.requestState).toBe('REVIEW_REQUIRED');
    expect(
      (await store.read('EnterpriseMembership', String(f.member.membershipId)))?.administrator,
    ).toBe(false);
  });
  it('일반 최초 지정 권위/고객 MFA는 별도 restore 권위를 대체하지 않는다', async () => {
    const f = await setup();
    await expect(f.service.restore(f.customer, f.input)).rejects.toMatchObject({
      code: 'STAFF_REQUIRED',
    });
    const role = (await store.list('StaffRole'))[0]!;
    await new EnterpriseRoleRevisions(f.access).staff(f.staff, {
      meta: u2Meta(2),
      roleRef: ref('StaffRole', role),
      label: '최초 지정만',
      actions: ['staff.role.manage', 'enterprise.initial-administrator.designate'],
    });
    await expect(f.service.restore(f.staff, f.input)).rejects.toMatchObject({
      code: 'ACTION_DENIED',
    });
  });
  it('다른 기업/대상/stale 소속 개정은 변경을 만들지 않는다', async () => {
    const f = await setup();
    await expect(
      f.service.restore(f.staff, {
        ...f.input,
        membershipRef: { ...f.input.membershipRef, revision: 99 },
      }),
    ).rejects.toMatchObject({ code: 'RESTORATION_TARGET' });
    await expect(
      f.service.restore(f.staff, {
        ...f.input,
        enterpriseRef: { ...f.input.enterpriseRef, id: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'RESTORATION_TARGET' });
    expect(await store.list('AdministratorRestoration')).toHaveLength(0);
  });
  it('관리 재지정에 거래 역할을 섞으면 전체 요청을 거절한다', async () => {
    const f = await setup(),
      trade = await f.access.defineCustomerRole(f.customer, ref('Enterprise', f.enterprise), {
        meta: u2Meta(),
        label: '거래',
        actionScopes: [
          {
            enterpriseRef: ref('Enterprise', f.enterprise),
            action: 'order.read',
            kind: 'ENTERPRISE_ALL',
            departmentRefs: [],
            siteRefs: [],
          },
        ],
      });
    await expect(
      f.service.restore(f.staff, { ...f.input, roleRefs: [...f.input.roleRefs, trade.targetRef!] }),
    ).rejects.toMatchObject({ code: 'RESTORATION_MANAGEMENT_ONLY' });
    expect(
      (await store.read('EnterpriseMembership', String(f.member.membershipId)))?.administrator,
    ).toBe(false);
  });
  it('미보호 근거 변경은 이전 확인으로 fallback하지 않고 ACK를 차단한다', async () => {
    const f = await setup();
    await sources.primaryAdmin
      .getRepository('VerificationEvidence')
      .update({ evidenceId: f.delegation.evidenceId }, { state: 'REVOKED' });
    await expect(f.service.restore(f.staff, f.input)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(await store.list('AdministratorRestoration')).toHaveLength(0);
  });
  async function held() {
    const f = await setup(),
      unknown = new EnterpriseAccess(
        store,
        {
          kind: 'UNREGISTERED',
          enterprise: async () => {
            throw Error('unused');
          },
          administrator: async () => {
            throw Error('unused');
          },
        },
        f.now,
        false,
      ),
      receipt = await new AdministratorRestoration(unknown, f.now).restore(f.staff, f.input),
      source = (await store.currentProtected('AdministratorRestoration', receipt.targetRef!.id))!;
    return {
      ...f,
      source,
      review: {
        meta: { ...u2Meta(1), evidenceRefs: [ref('PersonVerification', f.person)] },
        sourceRef: ref('AdministratorRestoration', source),
        basisRef: ref('VerificationEvidence', f.delegation),
        reason: '현재 위임/동일인 재검토',
      },
    };
  }
  it('원래 HOLD 재검토는 VERIFIED만 만들며 기한/역할을 유지하고 관리 권한을 아직 부여하지 않는다', async () => {
    const f = await held(),
      receipt = await f.service.resume(f.staff, f.review),
      source = (await store.currentProtected(
        'AdministratorRestoration',
        String(f.source.restorationId),
      ))!;
    expect(source).toMatchObject({
      state: 'VERIFIED',
      deadlineAt: f.source.deadlineAt,
      roleRefs: f.source.roleRefs,
      revision: 2,
    });
    expect(
      (await store.currentProtected('Enterprise', f.enterpriseRef.id))?.administratorCount,
    ).toBe(0);
    expect((await f.service.resume(f.staff, f.review)).requestId).toBe(receipt.requestId);
  });
  it('VERIFIED 적용은 기존 restore profile에서 현재 근거를 다시 확인하고 같은 원본을 APPLIED로 확정한다', async () => {
    const f = await held();
    await f.service.resume(f.staff, f.review);
    const source = (await store.currentProtected(
        'AdministratorRestoration',
        String(f.source.restorationId),
      ))!,
      receipt = await f.service.restore(f.staff, {
        ...f.input,
        meta: {
          ...u2Meta(Number(f.member.revision)),
          evidenceRefs: [ref('AdministratorRestoration', source)],
        },
      });
    expect(receipt.targetRef?.id).toBe(String(f.source.restorationId));
    expect(
      (await store.currentProtected('AdministratorRestoration', String(f.source.restorationId)))
        ?.state,
    ).toBe('APPLIED');
    expect(await store.list('AdministratorRestoration')).toHaveLength(1);
    expect(
      (await store.currentProtected('Enterprise', f.enterpriseRef.id))?.administratorCount,
    ).toBe(1);
  });
  it('새 현재 근거가 없거나 고객/옛 개정은 원래 HOLD를 재개하지 않는다', async () => {
    const f = await held();
    await expect(f.service.resume(f.customer, f.review)).rejects.toMatchObject({
      code: 'STAFF_REQUIRED',
    });
    await expect(
      f.service.resume(f.staff, { ...f.review, meta: { ...f.review.meta, evidenceRefs: [] } }),
    ).rejects.toMatchObject({ code: 'RESTORATION_REVIEW_BASIS' });
    await expect(
      f.service.resume(f.staff, { ...f.review, meta: { ...f.review.meta, expectedRevision: 99 } }),
    ).rejects.toMatchObject({ code: 'RESTORATION_CONTROL_SOURCE' });
    expect(
      (await store.currentProtected('AdministratorRestoration', String(f.source.restorationId)))
        ?.state,
    ).toBe('HOLD');
  });
  it('종료는 원래 대상과 기한을 남기고 새 권한을 만들거나 다시 재개하지 않는다', async () => {
    const f = await held(),
      receipt = await f.service.close(f.staff, f.review),
      source = (await store.currentProtected(
        'AdministratorRestoration',
        String(f.source.restorationId),
      ))!;
    expect(source).toMatchObject({
      state: 'CLOSED',
      deadlineAt: f.source.deadlineAt,
      membershipRef: f.source.membershipRef,
      roleRefs: f.source.roleRefs,
    });
    expect((await f.service.close(f.staff, f.review)).requestId).toBe(receipt.requestId);
    await expect(
      f.service.resume(f.staff, {
        ...f.review,
        sourceRef: ref('AdministratorRestoration', source),
        meta: { ...f.review.meta, expectedRevision: 2 },
      }),
    ).rejects.toMatchObject({ code: 'RESTORATION_CONTROL_SOURCE' });
    expect(
      (await store.currentProtected('Enterprise', f.enterpriseRef.id))?.administratorCount,
    ).toBe(0);
  });
  it('만료된 검토 원본이나 적용 직전 회수된 실제 근거는 새 기한/권한으로 승격하지 않는다', async () => {
    const f = await held();
    await f.service.resume(f.staff, f.review);
    const source = (await store.currentProtected(
        'AdministratorRestoration',
        String(f.source.restorationId),
      ))!,
      input = {
        ...f.input,
        meta: {
          ...u2Meta(Number(f.member.revision)),
          evidenceRefs: [ref('AdministratorRestoration', source)],
        },
      },
      expired = new AdministratorRestoration(f.access, () => new Date(String(source.deadlineAt)));
    await expect(expired.restore(f.staff, input)).rejects.toMatchObject({
      code: 'RESTORATION_APPLY_UNCONFIRMED',
    });
    await store.execute(
      {
        principalId: 'synthetic-policy-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-after-review-revocation',
        target: null,
        idempotencyKey: randomUUID(),
        input: { active: false },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) =>
        tx.put('VerificationPolicy', { ...f.delegationPolicy, active: false, revision: 2 }, 1),
    );
    await expect(f.service.restore(f.staff, input)).rejects.toMatchObject({
      code: 'RESTORATION_APPLY_UNCONFIRMED',
    });
    expect(
      (await store.currentProtected('Enterprise', f.enterpriseRef.id))?.administratorCount,
    ).toBe(0);
  });
});
