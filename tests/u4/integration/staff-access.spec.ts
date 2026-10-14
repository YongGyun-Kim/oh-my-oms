import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { U4_PROFILE } from '@oms/contracts';
import { Authorization, StaffAccess, U3StaffAccess, U4StaffAccess } from '@oms/core';
import {
  decodePayload,
  reconcileRecoveredSecurity,
  restoreFromJournal,
  U4Repository,
  U4_SOURCE_CONTRACT,
} from '@oms/persistence';
import { persistenceFixture, financialRequest } from '../fixtures/persistence.js';
import { seedU2Enterprise, loginU2SyntheticAccount } from '../../u2/fixtures/enterprise.js';
import { captureSyntheticSecuritySnapshot } from '../../u1/fixtures/recovery-security-oracle.js';
import { U4SyntheticSecurityOracle } from '../fixtures/security-oracle.js';

describe('U2 소유 U4 직원 금융 역할의 정상 명령·현재 권위·짧은 복구', () => {
  const { sources, store } = persistenceFixture();
  const ingress = 'synthetic-private-ingress';
  let f: Awaited<ReturnType<typeof seedU2Enterprise>>, roles: U4StaffAccess;
  const meta = (expectedRevision: number | null = null) => ({
    clientRequestId: randomUUID(),
    expectedRevision,
    reason: '격리 금융 역할 검증',
    evidenceRefs: [],
  });
  beforeEach(async () => {
    f = await seedU2Enterprise(store);
    roles = new U4StaffAccess(store, f.now, async (proof) => proof === ingress);
  });
  const context = () => f.authenticateRequest('STAFF');
  const create = async (actions = ['financial.read']) =>
    roles.defineRole(await context(), { meta: meta(), label: '합성 금융 역할', actions }, ingress);
  const grant = async (
    roleRef: import('@oms/contracts').Ref,
    decision: 'GRANT' | 'REVOKE' = 'GRANT',
    revision: number | null = null,
  ) =>
    new StaffAccess(store, f.now).grantRole(await context(), {
      meta: meta(revision),
      roleRef,
      accountRef: f.staff.actorAccountRef!,
      decision,
    });
  const allowed = async (action: string) =>
    new Authorization(store, f.now).requireStaff(await context(), action);

  it('정상 정의→명시 부여→조회 권한, 재전송 접수와 빈 legacy 투영을 보존한다', async () => {
    const input = { meta: meta(), label: '금융 전용', actions: ['financial.read'] };
    const created = await roles.defineRole(await context(), input, ingress);
    const role = (await store.currentProtected('StaffRole', created.targetRef!.id))!;
    expect(role).toMatchObject({
      modelVersion: 3,
      sourceContract: U4_SOURCE_CONTRACT,
      actions: [],
    });
    await expect(allowed('financial.read')).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await grant(created.targetRef!);
    await expect(allowed('financial.read')).resolves.toBeUndefined();
    await expect(allowed('financial.manage')).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    const replay = await roles.defineRole(await context(), input, ingress);
    expect(replay.requestId).toBe(created.requestId);
    expect(replay.resultRefs).toEqual(created.resultRefs);
    expect(
      await roles.readRoles(await context(), { cursor: null, pageSize: 100 }, ingress),
    ).toMatchObject({
      items: [{ roleRef: created.targetRef, actions: ['financial.read'], active: true }],
    });
    await expect(
      new StaffAccess(store, f.now).readRoles(await context(), { cursor: null, pageSize: 100 }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_ROLE_PROFILE' });
  });
  it('정상 개정은 새 현재 행위만 적용하고 이전 대상 개정/구형 개정 명령을 거절한다', async () => {
    const created = await create();
    await grant(created.targetRef!);
    const changed = await roles.reviseRole(
      await context(),
      {
        meta: meta(1),
        roleRef: created.targetRef!,
        label: '확인 등록',
        actions: ['financial.manage'],
      },
      ingress,
    );
    await expect(allowed('financial.read')).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await expect(allowed('financial.manage')).resolves.toBeUndefined();
    await expect(
      roles.reviseRole(
        await context(),
        { meta: meta(1), roleRef: created.targetRef!, label: 'stale', actions: ['financial.read'] },
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'STALE_U4_REFERENCE' });
    await expect(
      new U3StaffAccess(store, f.now).reviseRole(await context(), {
        meta: meta(2),
        roleRef: changed.targetRef!,
        label: '구형 변경',
        actions: ['order.read'],
      }),
    ).rejects.toMatchObject({ code: 'ROLE_REVISION' });
    expect(await store.currentProtected('StaffRole', changed.targetRef!.id)).toMatchObject({
      revision: 2,
      modelVersion: 3,
      actions: [],
    });
  });
  it('기존 정상 grant 회수는 금융 권한을 즉시 제거하고 비활성 역할 새 부여를 금지한다', async () => {
    const created = await create(),
      granted = await grant(created.targetRef!);
    await grant(created.targetRef!, 'REVOKE', granted.targetRef!.revision);
    await expect(allowed('financial.read')).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    const disabled = await roles.deactivateRole(
      await context(),
      { meta: meta(1), roleRef: created.targetRef! },
      ingress,
    );
    await expect(grant(disabled.targetRef!)).rejects.toMatchObject({ code: 'ROLE_INACTIVE' });
  });
  it('미승인 직원망·고객·등록되지 않은 행위는 역할이나 접수를 만들지 않는다', async () => {
    const input = { meta: meta(), label: '거절', actions: ['financial.read'] };
    const before = (await store.list('StaffRole')).length;
    await expect(roles.defineRole(await context(), input, null)).rejects.toMatchObject({
      code: 'STAFF_NETWORK_REQUIRED',
    });
    await expect(
      roles.defineRole(await f.authenticateRequest('CUSTOMER'), input, ingress),
    ).rejects.toMatchObject({ code: 'STAFF_ONLY' });
    await expect(
      roles.defineRole(await context(), { ...input, actions: ['financial.admin'] }, ingress),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await store.list('StaffRole')).toHaveLength(before);
  });
  it('미보호 역할 상태 변경은 현재 금융 권위로 쓰지 않고 원래 보호 행위를 유지한다', async () => {
    const created = await create();
    await grant(created.targetRef!);
    const state = (await new Authorization(store, f.now).currentRoleState(
      'StaffRole',
      created.targetRef!.id,
    ))!;
    await sources.primaryAdmin
      .getRepository('RoleRevisionState')
      .update(
        { roleStateId: state.roleStateId },
        { actions: ['financial.read', 'financial.manage'] },
      );
    await expect(allowed('financial.manage')).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect((await store.read('RoleRevisionState', String(state.roleStateId)))!.actions).toEqual([
      'financial.read',
    ]);
    expect(
      (await sources.primaryAdmin
        .getRepository('RoleRevisionState')
        .findOneBy({ roleStateId: state.roleStateId }))!.actions,
    ).toEqual(['financial.read', 'financial.manage']);
  });
  it('역할 저장 중 예외는 역할·상태·fence·접수를 전체 롤백하고 금융 명령의 U2 쓰기를 거절한다', async () => {
    const repository = new U4Repository(store),
      request = financialRequest();
    const candidate = {
      modelVersion: 3,
      staffRoleId: randomUUID(),
      label: '롤백',
      actions: [],
      revision: 1,
      sourceContract: U4_SOURCE_CONTRACT,
    };
    await expect(
      repository.mutate(
        { ...request, owner: 'EnterpriseAccess', operation: 'registerInvoice' },
        async () => {},
        async () => {},
      ),
    ).rejects.toMatchObject({ code: 'U4_WRITE_OWNER' });
    await expect(
      repository.mutate(
        { ...request, owner: 'EnterpriseAccess', operation: 'defineStaffRole' },
        async () => {},
        async (scope) => {
          await scope.transaction.put('StaffRole', candidate);
          throw new Error('SYNTHETIC_ROLLBACK');
        },
      ),
    ).rejects.toThrow('SYNTHETIC_ROLLBACK');
    expect(await store.currentProtected('StaffRole', candidate.staffRoleId)).toBeNull();
    await expect(
      repository.mutate(
        request,
        async () => {},
        async (scope) => scope.transaction.put('StaffRole', candidate),
      ),
    ).rejects.toMatchObject({ code: 'U4_WRITE_OWNER' });
    expect(
      await sources.primaryAdmin
        .getRepository('StaffRole')
        .findOneBy({ staffRoleId: candidate.staffRoleId }),
    ).toBeNull();
    await expect(
      repository.mutate(
        { ...request, owner: 'EnterpriseAccess', operation: 'defineStaffRole' },
        async () => {},
        async (scope) => {
          await scope.transaction.put(
            'Enterprise',
            { ...f.enterprise, revision: Number(f.enterprise.revision) + 1 },
            Number(f.enterprise.revision),
          );
        },
      ),
    ).rejects.toMatchObject({ code: 'U4_WRITE_OWNER' });
  });
  it('구형 직원 역할·주문 행위는 금융 조회/등록으로 자동 승격하지 않는다', async () => {
    await expect(allowed('financial.read')).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await expect(allowed('financial.manage')).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await expect(
      new StaffAccess(store, f.now).defineRole(await context(), {
        meta: meta(),
        label: '구형 직접 등록 거절',
        actions: ['financial.read'],
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_STAFF_ACTION' });
    await expect(
      new U3StaffAccess(store, f.now).defineRole(await context(), {
        meta: meta(),
        label: '구형 금융 거절',
        actions: ['financial.read'],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const oldRole = (await store.list('StaffRole'))[0]!;
    await expect(
      roles.reviseRole(
        await context(),
        {
          meta: meta(Number(oldRole.revision)),
          roleRef: {
            owner: 'EnterpriseAccess',
            entity: 'StaffRole',
            id: String(oldRole.staffRoleId),
            revision: Number(oldRole.revision),
          },
          label: '묵시 전환',
          actions: ['financial.read'],
        },
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'ROLE_REVISION' });
  });
  it('원장 role3 재생과 명시 관측3의 현재 비활성 전이를 구분하고 재확인 뒤에도 금융을 차단한다', async () => {
    const created = await create();
    await grant(created.targetRef!);
    const state = (await new Authorization(store, f.now).currentRoleState(
      'StaffRole',
      created.targetRef!.id,
    ))!;
    await sources.primaryAdmin
      .getRepository('RoleRevisionState')
      .update({ roleStateId: state.roleStateId }, { active: false, revision: 2 });
    const snapshot = await captureSyntheticSecuritySnapshot(sources.primaryAdmin);
    const oracle = new U4SyntheticSecurityOracle(snapshot),
      faultAt = new Date().toISOString();
    const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(await store.read('StaffRole', created.targetRef!.id)).toMatchObject({
      modelVersion: 3,
      actions: [],
      sourceContract: U4_SOURCE_CONTRACT,
    });
    expect(await store.read('RoleRevisionState', String(state.roleStateId))).toMatchObject({
      modelVersion: 3,
      active: true,
      revision: 1,
    });
    expect(
      (await sources.primaryAdmin.query('SELECT auth_ready FROM u1_recovery_control'))[0]
        .auth_ready,
    ).toBe(false);
    const result = await reconcileRecoveredSecurity(
      sources.primaryAdmin,
      store,
      oracle,
      true,
      report.epoch,
      faultAt,
    );
    expect(result).toMatchObject({ changes: 1, realEnvironmentVerified: false });
    expect(
      await store.currentProtected('RoleRevisionState', String(state.roleStateId)),
    ).toMatchObject({
      modelVersion: 3,
      active: false,
      revision: 2,
      sourceContract: U4_SOURCE_CONTRACT,
    });
    const receipt = (
      await store.list('RequestReceipt', { equals: { operation: 'reconcileRecoveredSecurity' } })
    )[0]!;
    expect(receipt.sourceContract).toEqual(U4_SOURCE_CONTRACT);
    const protectedEntry = (
      await sources.journalAdmin.query(
        "SELECT payload_text FROM u1_protected_entry WHERE payload_text::jsonb->>'requestId'=$1",
        [receipt.requestId],
      )
    )[0];
    const payload = decodePayload(protectedEntry.payload_text, store.schema);
    expect(payload).toMatchObject({
      schemaVersion: 3,
      sourceContract: { profile: U4_PROFILE, registryVersion: 4 },
    });
    expect(payload.rows.find((row) => row.model === 'RoleRevisionState')).toMatchObject({
      schemaVersion: 3,
      data: { modelVersion: 3, active: false },
    });
    expect(
      (await sources.primaryAdmin.query('SELECT auth_ready FROM u1_recovery_control'))[0]
        .auth_ready,
    ).toBe(true);
    // 복구는 기존 세션을 되살리지 않는다. 정상 재로그인/MFA 후 새 문맥에서도 비활성 역할은 불허다.
    const fresh = await loginU2SyntheticAccount(f.identity, f.staff.principalId, 'STAFF');
    await expect(
      new Authorization(store, f.now).requireStaff(fresh, 'financial.read'),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
});
