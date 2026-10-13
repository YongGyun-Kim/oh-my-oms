import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, fingerprint } from '@oms/contracts';
import type { ServiceContext } from '@oms/contracts';
import { Authorization, StaffAccess, U3StaffAccess, ref } from '@oms/core';
import { decodePayload, ProtectedStore } from '@oms/persistence';
import type { WriteRequest } from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedU3CommandAuthority } from '../fixtures/command-authority.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';
import { U3_SOURCE_CONTRACT } from '@oms/persistence';

describe('C01 새 역할의 등록·부여·현재 권위·취소', () => {
  const sources = u3Sources();
  let store: ProtectedStore,
    fixture: Awaited<ReturnType<typeof seedU3CommandAuthority>>,
    roles: U3StaffAccess,
    grants: StaffAccess,
    authorization: Authorization;
  const meta = (expectedRevision: number | null = null) => ({
    clientRequestId: randomUUID(),
    expectedRevision,
    reason: '합성 역할 경계',
    evidenceRefs: [],
  });
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    fixture = await seedU3CommandAuthority(store);
    roles = new U3StaffAccess(store, fixture.now);
    grants = new StaffAccess(store, fixture.now);
    authorization = new Authorization(store, fixture.now);
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  it('실제 model2 등록→기존 grant→현재 신규 행위→revoke가 연결된다', async () => {
    const created = await roles.defineRole(fixture.staff, {
      meta: meta(),
      label: '신규 행위만',
      actions: ['contract.propose'],
    });
    expect(await store.read('StaffRole', created.targetRef!.id)).toMatchObject({
      modelVersion: 2,
      actions: [],
      sourceContract: U3_SOURCE_CONTRACT,
    });
    await expect(
      authorization.requireStaff(fixture.staff, 'contract.propose'),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await grants.grantRole(fixture.staff, {
      meta: meta(),
      accountRef: fixture.staff.actorAccountRef!,
      roleRef: created.targetRef!,
      decision: 'GRANT',
    });
    await expect(
      authorization.requireStaff(fixture.staff, 'contract.propose'),
    ).resolves.toBeUndefined();
    await expect(
      authorization.requireStaffSource(fixture.staff.actorAccountRef!, 'contract.propose'),
    ).resolves.toBeUndefined();
    await grants.grantRole(fixture.staff, {
      meta: meta(1),
      accountRef: fixture.staff.actorAccountRef!,
      roleRef: created.targetRef!,
      decision: 'REVOKE',
    });
    await expect(
      authorization.requireStaff(fixture.staff, 'contract.propose'),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await expect(
      authorization.requireStaffSource(fixture.staff.actorAccountRef!, 'contract.propose'),
    ).rejects.toMatchObject({ code: 'ISSUER_AUTHORITY' });
  });
  it('역할 등록의 실제 보호 payload/row는 명시 version2와 등록3을 가진다', async () => {
    const created = await roles.defineRole(fixture.staff, {
      meta: meta(),
      label: '보호된 역할',
      actions: ['contract.approve'],
    });
    const saved = (
      await sources.primaryAdmin.query(
        'SELECT payload_text FROM u1_recovery_candidate WHERE request_id=$1',
        [created.requestId],
      )
    )[0];
    const payload = decodePayload(saved.payload_text, store.schema);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.sourceContract).toEqual(U3_SOURCE_CONTRACT);
    for (const model of ['StaffRole', 'RoleRevisionState'])
      expect(payload.rows.find((row) => row.model === model)).toMatchObject({
        schemaVersion: 2,
        data: { modelVersion: 2, sourceContract: U3_SOURCE_CONTRACT },
      });
    await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      created.requestId,
      store.schema,
    );
  });
  it('v3 역할 개정은 현재 행위를 교체하고 과거 모델2 개정을 보존한다', async () => {
    const created = await roles.defineRole(fixture.staff, {
      meta: meta(),
      label: '제안',
      actions: ['contract.propose'],
    });
    await grants.grantRole(fixture.staff, {
      meta: meta(),
      accountRef: fixture.staff.actorAccountRef!,
      roleRef: created.targetRef!,
      decision: 'GRANT',
    });
    const before = canonicalJson(await store.read('StaffRole', created.targetRef!.id));
    const revised = await roles.reviseRole(fixture.staff, {
      meta: meta(1),
      roleRef: created.targetRef!,
      label: '승인',
      actions: ['contract.approve'],
    });
    expect(revised.targetRef!.revision).toBe(2);
    await expect(
      authorization.requireStaff(fixture.staff, 'contract.propose'),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await expect(
      authorization.requireStaff(fixture.staff, 'contract.approve'),
    ).resolves.toBeUndefined();
    await expect(
      authorization.requireStaffSource(fixture.staff.actorAccountRef!, 'contract.propose'),
    ).rejects.toMatchObject({ code: 'ISSUER_AUTHORITY' });
    await expect(
      authorization.requireStaffSource(fixture.staff.actorAccountRef!, 'contract.approve'),
    ).resolves.toBeUndefined();
    expect(canonicalJson(await store.readRevision('StaffRole', created.targetRef!.id, 1))).toBe(
      before,
    );
    const page = (await roles.readRoles(fixture.staff, { cursor: null, pageSize: 100 })) as {
      items: { roleRef: { id: string }; actions: string[] }[];
    };
    expect(page.items.find((item) => item.roleRef.id === created.targetRef!.id)?.actions).toEqual([
      'contract.approve',
    ]);
    await expect(
      roles.reviseRole(fixture.staff, {
        meta: meta(1),
        roleRef: created.targetRef!,
        label: '오래된 입력',
        actions: ['contract.propose'],
      }),
    ).rejects.toMatchObject({ code: 'ROLE_REVISION' });
  });
  it('v3 비활성화는 부여가 남아 있어도 신규 행위 권위를 차단한다', async () => {
    const created = await roles.defineRole(fixture.staff, {
      meta: meta(),
      label: '비활성 대상',
      actions: ['contract.propose'],
    });
    await grants.grantRole(fixture.staff, {
      meta: meta(),
      accountRef: fixture.staff.actorAccountRef!,
      roleRef: created.targetRef!,
      decision: 'GRANT',
    });
    await roles.deactivateRole(fixture.staff, { meta: meta(1), roleRef: created.targetRef! });
    await expect(
      authorization.requireStaff(fixture.staff, 'contract.propose'),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await expect(
      authorization.requireStaffSource(fixture.staff.actorAccountRef!, 'contract.propose'),
    ).rejects.toMatchObject({ code: 'ISSUER_AUTHORITY' });
  });
  it('unknown 행위/관리 권한 없는 고객·SYSTEM·만료 신원은 등록하지 못한다', async () => {
    const before = (await store.list('StaffRole', { limit: 100 })).length;
    await expect(
      roles.defineRole(fixture.staff, {
        meta: meta(),
        label: '미등록',
        actions: ['arbitrary.action'],
      }),
    ).rejects.toThrow();
    for (const context of [
      fixture.customer,
      { ...fixture.staff, audience: 'SYSTEM' } as ServiceContext,
      { ...fixture.staff, deadlineAt: '2000-01-01T00:00:00.000Z' },
    ])
      await expect(
        roles.defineRole(context, { meta: meta(), label: '금지', actions: ['contract.approve'] }),
      ).rejects.toThrow();
    expect((await store.list('StaffRole', { limit: 100 })).length).toBe(before);
  });
  it('등록과 승인 행위는 별개이며 역할 부여로 동일인 확인 근거를 만들지 않는다', async () => {
    await expect(
      authorization.requireStaff(fixture.staff, 'contract.register'),
    ).resolves.toBeUndefined();
    await expect(
      authorization.requireStaff(fixture.staff, 'contract.approve'),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    const before = await store.list('VerifiedPersonLink');
    const created = await roles.defineRole(fixture.staff, {
      meta: meta(),
      label: '명시 행위 집합',
      actions: ['contract.register', 'contract.approve'],
    });
    await grants.grantRole(fixture.staff, {
      meta: meta(),
      accountRef: fixture.staff.actorAccountRef!,
      roleRef: created.targetRef!,
      decision: 'GRANT',
    });
    expect(await store.list('VerifiedPersonLink')).toEqual(before);
    // Grants do not establish that an approver is a different person. That
    // business precondition remains owned by U2 + CommercialAgreement.
  });
  it('구형 역할의 bytes를 새 profile로 자동 개정하지 않는다', async () => {
    const old = (await store.list('StaffRole', { limit: 100 })).find(
      (row) => row.modelVersion === undefined,
    )!;
    const before = canonicalJson(old);
    await expect(
      roles.reviseRole(fixture.staff, {
        meta: meta(Number(old.revision)),
        roleRef: ref('StaffRole', old),
        label: '자동 변환',
        actions: ['contract.approve'],
      }),
    ).rejects.toMatchObject({ code: 'ROLE_REVISION' });
    expect(canonicalJson(await store.read('StaffRole', String(old.staffRoleId)))).toBe(before);
  });
  it('현재 새 행위 원본의 primary-only profile 오염은 권위로 쓰지 않는다', async () => {
    const state = await authorization.currentRoleState(
      'StaffRole',
      String(fixture.staffRole.staffRoleId),
    );
    await sources.primaryAdmin
      .getRepository('RoleRevisionState')
      .update(
        { roleStateId: state!.roleStateId },
        { sourceContract: { ...U3_SOURCE_CONTRACT, registryVersion: 2 } },
      );
    await expect(
      authorization.requireStaff(fixture.staff, 'product.register'),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    await expect(
      authorization.requireStaffSource(fixture.staff.actorAccountRef!, 'product.register'),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
  it('보호된 직원 확인 뒤에도 다음 transaction 대조에서 역할 전체 원상의 변조를 거절한다', async () => {
    const account = fixture.staff.actorAccountRef!,
      roleId = String(fixture.staffRole.staffRoleId),
      before = canonicalJson(await store.currentProtected('StaffRole', roleId));
    await authorization.requireStaffSource(account, 'product.register');
    await sources.primaryAdmin
      .getRepository('StaffRole')
      .update({ staffRoleId: roleId }, { label: '합성 후단 미보호 변경' });
    const key = randomUUID(),
      request: WriteRequest = {
        principalId: 'synthetic-staff-source-test',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-staff-source-recheck',
        target: null,
        idempotencyKey: key,
        input: { synthetic: true },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      };
    await expect(
      store.execute(request, async (tx) =>
        authorization.requireStaffSource(account, 'product.register', tx),
      ),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    expect(canonicalJson(await store.read('StaffRole', roleId))).toBe(before);
    expect(
      await sources.primaryAdmin.query(
        'SELECT count(*)::integer AS count FROM u1_request_key WHERE scoped_key=$1',
        [
          fingerprint({
            principalId: request.principalId,
            audience: request.audience,
            owner: request.owner,
            operation: request.operation,
            target: request.target,
            key,
          }),
        ],
      ),
    ).toEqual([{ count: 0 }]);
  });
  it('새 역할의 현재 상태가 없으면 base 투영으로 권한을 되살리지 않는다', async () => {
    const state = await authorization.currentRoleState(
      'StaffRole',
      String(fixture.staffRole.staffRoleId),
    );
    await sources.primaryAdmin
      .getRepository('RoleRevisionState')
      .delete({ roleStateId: state!.roleStateId });
    await expect(
      authorization.requireStaff(fixture.staff, 'product.register'),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
  it('새 지원 model2의 NULL profile은 실제 DB에서도 수용하지 않는다', async () => {
    const state = await authorization.currentRoleState(
      'StaffRole',
      String(fixture.staffRole.staffRoleId),
    );
    await expect(
      sources.primaryAdmin
        .getRepository('RoleRevisionState')
        .update({ roleStateId: state!.roleStateId }, { sourceContract: null }),
    ).rejects.toThrow();
    await expect(
      sources.primaryAdmin
        .getRepository('StaffRole')
        .update({ staffRoleId: fixture.staffRole.staffRoleId }, { sourceContract: null }),
    ).rejects.toThrow();
    await expect(
      authorization.requireStaff(fixture.staff, 'product.register'),
    ).resolves.toBeUndefined();
  });
});
