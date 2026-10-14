import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson, OmsError, U3_PROFILE } from '@oms/contracts';
import type { SchemaValidator } from '@oms/contracts';
import type { Ref, TargetScope } from '@oms/contracts';
import {
  Authorization,
  U3CustomerAccess,
  U2AccessDirectory,
  ref,
  U3_CONSENT_ACTION,
} from '@oms/core';
import {
  decodePayload,
  ProtectedStore,
  ProtectedTransaction,
  U3_SOURCE_CONTRACT,
} from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedU3CommandAuthority } from '../fixtures/command-authority.js';
import {
  consentRoleInput,
  consentPredicate,
  registeredConsentRoleInput,
} from '../fixtures/consent-role.js';
import { fixtureScope } from '../fixtures/identity.js';
import { fixtureMeta } from '../fixtures/commercial.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';
import type { OrderingPolicy } from '../../../packages/core/src/scopes.js';

describe('실제 C01 동의 역할 생산·기존 grant/revoke·현재 권위', () => {
  const sources = u3Sources();
  let store: ProtectedStore,
    f: Awaited<ReturnType<typeof seedU3CommandAuthority>>,
    roles: U3CustomerAccess,
    authorization: Authorization;
  const meta = (revision: number | null = null) => ({
    ...fixtureMeta(revision),
    clientRequestId: randomUUID(),
  });
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    f = await seedU3CommandAuthority(store);
    roles = new U3CustomerAccess(f.access, f.now);
    authorization = new Authorization(store, f.now);
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  const target = (): TargetScope => ({
    ...fixtureScope(),
    enterpriseRef: f.enterpriseRef,
    contextPolicyRef: f.enterpriseRef,
    organisationRevision: f.enterpriseRef.revision,
  });
  const permission = () =>
    authorization.requireCustomer(
      f.customer,
      U3_CONSENT_ACTION,
      target(),
      f.enterprise.orderingContextPolicy as OrderingPolicy,
    );
  const grant = (roleRef: Ref, decision: 'GRANT' | 'REVOKE' = 'GRANT') =>
    f.access.grantCustomerRole(f.customer, f.enterpriseRef, {
      meta: meta(decision === 'GRANT' ? null : 1),
      accountRef: f.customer.actorAccountRef!,
      roleRef,
      decision,
    });

  it('관리/읽기/제출은 동의를 부여하지 않으며 실제 새 역할→별도 grant→권위→revoke가 연결된다', async () => {
    await expect(permission()).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    const input = consentRoleInput(f.enterpriseRef),
      created = await roles.defineRole(f.customer, input);
    await expect(permission()).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    expect(await store.currentProtected('CustomerRole', created.targetRef!.id)).toMatchObject({
      modelVersion: 2,
      sourceContract: U3_SOURCE_CONTRACT,
      actionScopeRefs: [],
    });
    await grant(created.targetRef!);
    await expect(permission()).resolves.toMatchObject({ membershipId: f.member.membershipId });
    await grant(created.targetRef!, 'REVOKE');
    await expect(permission()).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
  it('같은 생성 요청/내용은 원래 결과·이력만 재사용하며 보호 payload는 실제 혼합 버전을 가진다', async () => {
    const input = consentRoleInput(f.enterpriseRef),
      created = await roles.defineRole(f.customer, input);
    expect(await roles.defineRole(f.customer, input)).toEqual(created);
    const candidates = await store.list('CustomerRole', { equals: { modelVersion: 2 } });
    expect(candidates).toHaveLength(1);
    await expect(
      roles.defineRole(f.customer, { ...input, label: '다른 합성 입력' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const payload = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      created.requestId,
      store.schema,
    );
    for (const name of ['CustomerRole', 'RoleRevisionState', 'ScopeV2'])
      expect(payload.rows.find((row) => row.model === name)).toMatchObject({
        schemaVersion: 2,
        data: { modelVersion: 2, sourceContract: U3_SOURCE_CONTRACT },
      });
    expect(payload.rows.find((row) => row.model === 'AccessHistory')).toMatchObject({
      schemaVersion: 1,
    });
    expect(payload.rows.find((row) => row.model === 'RequestReceipt')).toMatchObject({
      data: { sourceContract: U3_SOURCE_CONTRACT },
    });
    const recovered = structuredClone(payload),
      scope = recovered.rows.find((row) => row.model === 'ScopeV2')!;
    scope.schemaVersion = 1;
    expect(() => decodePayload(canonicalJson(recovered), store.schema)).toThrow();
  });
  it('명시 개정/비활성은 과거 bytes를 보존하고 현재 동의 권위를 갱신·회수한다', async () => {
    const created = await roles.defineRole(f.customer, consentRoleInput(f.enterpriseRef));
    await grant(created.targetRef!);
    const bytes = canonicalJson(
        await store.currentProtected('CustomerRole', created.targetRef!.id),
      ),
      input = registeredConsentRoleInput('reviseCustomerRole', {
        meta: meta(1),
        roleRef: created.targetRef!,
        label: '개정한 합성 동의 역할',
        predicates: [consentPredicate(f.enterpriseRef)],
      }),
      revised = await roles.reviseRole(f.customer, input);
    expect(revised.targetRef!.revision).toBe(2);
    expect(canonicalJson(await store.readRevision('CustomerRole', created.targetRef!.id, 1))).toBe(
      bytes,
    );
    expect(await roles.reviseRole(f.customer, input)).toEqual(revised);
    await expect(permission()).resolves.toBeTruthy();
    const deactivated = await roles.deactivateRole(
      f.customer,
      registeredConsentRoleInput('deactivateCustomerRole', {
        meta: meta(2),
        roleRef: revised.targetRef!,
      }),
    );
    expect(deactivated.targetRef!.revision).toBe(3);
    await expect(permission()).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
  it('구형 역할의 직접 비활성화·개정·현재 조회는 모델1 의미와 다른 역할 권위를 보존한다', async () => {
    const created = await f.access.defineCustomerRole(f.customer, f.enterpriseRef, {
      meta: meta(),
      label: '구형 지급 조회',
      actionScopes: [
        {
          enterpriseRef: f.enterpriseRef,
          action: 'payment.read',
          kind: 'ENTERPRISE_ALL',
          departmentRefs: [],
          siteRefs: [],
        },
      ],
    });
    await grant(created.targetRef!);
    const original = canonicalJson(
      await store.currentProtected('CustomerRole', created.targetRef!.id),
    );
    await expect(
      authorization.requireCustomer(
        f.customer,
        'payment.read',
        target(),
        f.enterprise.orderingContextPolicy as OrderingPolicy,
      ),
    ).resolves.toBeTruthy();
    const deactivated = await f.access.deactivateCustomerRole(f.customer, {
      meta: meta(1),
      roleRef: created.targetRef!,
    });
    expect(canonicalJson(await store.readRevision('CustomerRole', created.targetRef!.id, 1))).toBe(
      original,
    );
    expect(await store.currentProtected('CustomerRole', created.targetRef!.id)).not.toHaveProperty(
      'modelVersion',
    );
    await expect(
      authorization.requireCustomer(
        f.customer,
        'payment.read',
        target(),
        f.enterprise.orderingContextPolicy as OrderingPolicy,
      ),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    const revised = await f.access.reviseCustomerRole(f.customer, {
      meta: meta(2),
      roleRef: deactivated.targetRef!,
      label: '구형 비활성 유지',
      predicates: [{ ...consentPredicate(f.enterpriseRef), action: 'payment.read' }],
    });
    expect(revised.targetRef!.revision).toBe(3);
    expect(
      await authorization.currentRoleState('CustomerRole', created.targetRef!.id),
    ).toMatchObject({ active: false, roleRef: revised.targetRef });
    const page = await new U2AccessDirectory(f.access, Buffer.alloc(32, 7), f.now).read(
      f.customer,
      f.enterpriseRef,
      { cursor: null, pageSize: 100, filter: 'INACTIVE' },
      'roles',
    );
    expect(page).toMatchObject({ items: [{ sourceRef: revised.targetRef, state: 'INACTIVE' }] });
    await expect(
      authorization.requireCustomer(
        f.customer,
        'role.manage',
        target(),
        f.enterprise.orderingContextPolicy as OrderingPolicy,
      ),
    ).resolves.toBeTruthy();
    await expect(permission()).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
  it('자기에게 실제 부여된 동의 역할의 개정 rollback·재시도·비활성은 원본/권위 fence를 보존한다', async () => {
    const created = await roles.defineRole(f.customer, consentRoleInput(f.enterpriseRef));
    await grant(created.targetRef!);
    const original = canonicalJson(
        await store.currentProtected('CustomerRole', created.targetRef!.id),
      ),
      fenceBefore = await store.currentProtected('EnterpriseAccessFence', f.fenceId),
      input = registeredConsentRoleInput('reviseCustomerRole', {
        meta: meta(1),
        roleRef: created.targetRef!,
        label: '동의 역할 rollback 경계',
        predicates: [consentPredicate(f.enterpriseRef)],
      }),
      put = ProtectedTransaction.prototype.put;
    const failure = vi
      .spyOn(ProtectedTransaction.prototype, 'put')
      .mockImplementation(async function (
        this: ProtectedTransaction,
        model,
        data,
        expectedRevision,
      ) {
        await put.call(this, model, data, expectedRevision);
        if (
          model === 'RoleRevisionState' &&
          data.modelVersion === 2 &&
          (data.roleRef as Ref | null)?.id === created.targetRef!.id &&
          data.revision === 2
        )
          throw new OmsError(503, 'SYNTHETIC_ROLLBACK', '합성 상태 저장 이후 rollback');
      });
    try {
      await expect(roles.reviseRole(f.customer, input)).rejects.toMatchObject({
        code: 'SYNTHETIC_ROLLBACK',
      });
    } finally {
      failure.mockRestore();
    }
    expect(canonicalJson(await store.currentProtected('CustomerRole', created.targetRef!.id))).toBe(
      original,
    );
    expect(await store.currentProtected('EnterpriseAccessFence', f.fenceId)).toEqual(fenceBefore);
    expect(
      await store.list('RequestReceipt', {
        equals: { idempotencyKey: input.meta.clientRequestId },
      }),
    ).toHaveLength(0);
    await expect(permission()).resolves.toBeTruthy();
    const revised = await roles.reviseRole(f.customer, input);
    expect(
      await authorization.currentRoleState('CustomerRole', created.targetRef!.id),
    ).toMatchObject({
      modelVersion: 2,
      roleRef: revised.targetRef,
      sourceContract: U3_SOURCE_CONTRACT,
    });
    await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      revised.requestId,
      store.schema,
    );
    const deactivated = await roles.deactivateRole(f.customer, {
      meta: meta(2),
      roleRef: revised.targetRef!,
    });
    expect(
      await authorization.currentRoleState('CustomerRole', created.targetRef!.id),
    ).toMatchObject({ active: false, roleRef: deactivated.targetRef });
    await expect(permission()).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await expect(
      authorization.requireCustomer(
        f.customer,
        'role.manage',
        target(),
        f.enterprise.orderingContextPolicy as OrderingPolicy,
      ),
    ).resolves.toBeTruthy();
  });
  it('별도 보호 후 응답 유실은 원래 접수/schema 결과를 재사용하며 역할/이력을 중복 생성하지 않는다', async () => {
    const input = consentRoleInput(f.enterpriseRef),
      validate: SchemaValidator['validateUri'] = store.schema.validateUri.bind(store.schema);
    let responseLost = false;
    const response = vi
      .spyOn(store.schema, 'validateUri')
      .mockImplementation(<T>(uri: string, data: unknown): T => {
        if (uri === U3_PROFILE + '#/$defs/Receipt' && !responseLost) {
          responseLost = true;
          throw new OmsError(503, 'SYNTHETIC_RESPONSE_LOST', '합성 응답 유실');
        }
        return validate<T>(uri, data);
      });
    try {
      await expect(roles.defineRole(f.customer, input)).rejects.toMatchObject({
        code: 'SYNTHETIC_RESPONSE_LOST',
      });
    } finally {
      response.mockRestore();
    }
    const rows = await store.list('CustomerRole', { equals: { modelVersion: 2 } });
    expect(rows).toHaveLength(1);
    const receipts = await store.list('RequestReceipt', {
      equals: { operation: 'defineCustomerRole', idempotencyKey: input.meta.clientRequestId },
    });
    expect(receipts).toHaveLength(1);
    const requestId = String(receipts[0]!.requestId),
      payload = await assertProtectedCandidate(
        sources.primaryAdmin,
        sources.journalAdmin,
        requestId,
        store.schema,
      ),
      replayed = await roles.defineRole(f.customer, input);
    expect(replayed.requestId).toBe(requestId);
    expect(replayed.targetRef).toEqual(ref('CustomerRole', rows[0]!));
    expect(store.schema.validateUri(U3_PROFILE + '#/$defs/Receipt', replayed)).toEqual(replayed);
    expect(
      (await store.list('CustomerRole', { equals: { modelVersion: 2 } })).map((row) => row.roleId),
    ).toEqual(rows.map((row) => row.roleId));
    const after = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      requestId,
      store.schema,
    );
    expect(after).toEqual(payload);
    expect(await store.list('AccessHistory', { equals: { requestId } })).toHaveLength(1);
  });
  it('서로 다른 관리/거래 source와 새·구형 역할이 공존할 때 동의 전용 v3 목록은 실제 버전을 밝힌다', async () => {
    const oldRoles = await store.list('CustomerRole', {
        equals: { enterpriseRef: { id: f.enterpriseRef.id } },
      }),
      created = await roles.defineRole(f.customer, consentRoleInput(f.enterpriseRef)),
      query = registeredConsentRoleInput('readCustomerRoles', {
        enterpriseRef: f.enterpriseRef,
        cursor: null,
        pageSize: 100,
      }),
      page = await roles.readRoles(f.customer, query);
    expect(page).toMatchObject({
      profile: 'urn:oms:contract:u3-commercial:2',
      viewKind: 'CONSENT_ROLES',
      items: [
        {
          roleRef: created.targetRef,
          modelVersion: 2,
          sourceContract: U3_SOURCE_CONTRACT,
          predicates: [consentPredicate(f.enterpriseRef)],
        },
      ],
    });
    expect(
      await store.list('CustomerRole', { equals: { enterpriseRef: { id: f.enterpriseRef.id } } }),
    ).toHaveLength(oldRoles.length + 1);
    await expect(
      new U2AccessDirectory(f.access, Buffer.alloc(32, 7), f.now).read(
        f.customer,
        f.enterpriseRef,
        { cursor: null, pageSize: 100, filter: 'ALL' },
        'roles',
      ),
    ).rejects.toMatchObject({ code: 'U3_ROLE_READ_PROFILE_REQUIRED' });
  });
  it('직원·잘못된 기업/정책·기존 역할 개정에 새 의미 부여는 차단한다', async () => {
    const input = consentRoleInput(f.enterpriseRef);
    await expect(roles.defineRole(f.staff, input)).rejects.toMatchObject({
      code: 'CUSTOMER_REQUIRED',
    });
    const wrongEnterprise = { ...f.enterpriseRef, id: 'other-enterprise' };
    await expect(
      roles.defineRole(f.customer, { ...input, predicates: [consentPredicate(wrongEnterprise)] }),
    ).rejects.toThrow();
    await expect(
      roles.defineRole(f.customer, {
        ...input,
        predicates: [
          { ...input.predicates[0]!, sourcePolicyRevision: f.enterpriseRef.revision + 1 },
        ],
      }),
    ).rejects.toThrow();
    const legacy = (
      await store.list('CustomerRole', { equals: { enterpriseRef: { id: f.enterpriseRef.id } } })
    )[0]!;
    await expect(
      roles.reviseRole(f.customer, {
        meta: meta(Number(legacy.revision)),
        roleRef: ref('CustomerRole', legacy),
        label: '임의 upgrade',
        predicates: [consentPredicate(f.enterpriseRef)],
      }),
    ).rejects.toMatchObject({ code: 'U3_ROLE_STATE_REQUIRED' });
    expect(await store.list('CustomerRole', { equals: { modelVersion: 2 } })).toHaveLength(0);
  });
  it('현재 권위의 primary-only source 회수와 역할/상태 profile 혼합은 failclosed다', async () => {
    const created = await roles.defineRole(f.customer, consentRoleInput(f.enterpriseRef));
    await grant(created.targetRef!);
    const state = (
      await store.list('RoleRevisionState', { equals: { roleRef: { id: created.targetRef!.id } } })
    )[0]!;
    await sources.primaryAdmin
      .getRepository('RoleRevisionState')
      .update({ roleStateId: state.roleStateId }, { active: false, revision: 2 });
    await expect(permission()).rejects.toThrow();
    expect(await store.currentProtected('CustomerRole', created.targetRef!.id)).toMatchObject({
      modelVersion: 2,
    });
  });
  it('조직 정책 개정이 달라진 대상과 같은 조직의 다른 기업을 동의 범위에 포함하지 않는다', async () => {
    const created = await roles.defineRole(f.customer, consentRoleInput(f.enterpriseRef));
    await grant(created.targetRef!);
    await expect(
      authorization.requireCustomer(
        f.customer,
        U3_CONSENT_ACTION,
        { ...target(), organisationRevision: f.enterpriseRef.revision + 1 },
        f.enterprise.orderingContextPolicy as OrderingPolicy,
      ),
    ).rejects.toMatchObject({ code: 'U3_CONSENT_POLICY' });
    await expect(
      authorization.requireCustomer(
        f.customer,
        U3_CONSENT_ACTION,
        { ...target(), enterpriseRef: { ...f.enterpriseRef, id: 'other-enterprise' } },
        f.enterprise.orderingContextPolicy as OrderingPolicy,
      ),
    ).rejects.toThrow();
  });
});
