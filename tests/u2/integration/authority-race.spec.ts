import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import { AuthorizationFence, ref } from '@oms/core';
import type { OrderingPolicy } from '@oms/core';
import type { ProtectedTransaction } from '@oms/persistence';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2Enterprise, u2Meta } from '../fixtures/enterprise.js';
describe('실제 MFA/current owner와 권위 fence 경합', () => {
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
  const request = async (operation: string) => ({
    principalId: 'synthetic-current-owner',
    audience: 'SYSTEM' as const,
    owner: 'EnterpriseAccess',
    operation,
    target: null,
    idempotencyKey: randomUUID(),
    input: { operation },
    correlationId: randomUUID(),
    epoch: await store.currentEpoch(),
  });
  it('실제 password+TOTP/코드 확인을 거친 현재 tuple을 capture/assert한다', async () => {
    const graph = await seedU2Enterprise(store),
      fence = new AuthorizationFence(graph.access.authorization);
    const snapshot = await fence.capture(graph.customer, graph.enterpriseRef.id);
    await fence.assert(graph.customer, snapshot);
    expect(snapshot.sources.map((source) => source.entity)).toEqual(
      expect.arrayContaining([
        'AccountSecurityState',
        'EnterpriseAccessFence',
        'EnterpriseMembership',
        'CustomerRole',
        'CustomerRoleGrant',
      ]),
    );
  });
  it('역할 회수 뒤 stale allow는 commit할 수 없고 원래 ACK/effect를 만들지 않는다', async () => {
    const graph = await seedU2Enterprise(store),
      fence = new AuthorizationFence(graph.access.authorization),
      snapshot = await fence.capture(graph.customer, graph.enterpriseRef.id);
    const grant = (
      await store.list('CustomerRoleGrant', {
        equals: { membershipRef: { id: graph.member.membershipId }, revokedAt: null },
      })
    )[0]!;
    await store.execute(await request('fixture-revoke'), async (tx) => {
      await tx.put(
        'CustomerRoleGrant',
        { ...grant, revokedAt: new Date().toISOString(), revision: 2 },
        1,
      );
      const counter = (await tx.get('EnterpriseAccessFence', graph.fenceId))!;
      await tx.put(
        'EnterpriseAccessFence',
        {
          ...counter,
          accessRevision: Number(counter.accessRevision) + 1,
          revision: Number(counter.revision) + 1,
        },
        Number(counter.revision),
      );
    });
    let effects = 0;
    await expect(
      store.execute(await request('attempt-stale-business'), async (tx) => {
        await fence.assert(graph.customer, snapshot, tx);
        effects++;
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_FENCE_CHANGED' });
    expect(effects).toBe(0);
  });
  it('새 current 역할의 unprotected 개정도 오래된 allow로 대체하지 않는다', async () => {
    const graph = await seedU2Enterprise(store),
      fence = new AuthorizationFence(graph.access.authorization),
      snapshot = await fence.capture(graph.customer, graph.enterpriseRef.id);
    const role = snapshot.sources.find((source) => source.entity === 'CustomerRole')!;
    await sources.primaryAdmin
      .getRepository('CustomerRole')
      .update({ roleId: role.id }, { label: '미보호 변경' });
    await expect(fence.assert(graph.customer, snapshot)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
  });
  it('snapshot 이후 security generation/enterprise membership 변경은 실행을 거절한다', async () => {
    const graph = await seedU2Enterprise(store),
      fence = new AuthorizationFence(graph.access.authorization),
      snapshot = await fence.capture(graph.customer, graph.enterpriseRef.id),
      securityRef = snapshot.sources.find((source) => source.entity === 'AccountSecurityState')!;
    const security = (await store.read(securityRef.entity, securityRef.id))!;
    await store.execute(await request('fixture-security-fence'), async (tx) =>
      tx.put(securityRef.entity, { ...security, securityGeneration: 2, revision: 2 }, 1),
    );
    await expect(fence.assert(graph.customer, snapshot)).rejects.toMatchObject({
      code: 'AUTHORIZATION_FENCE_CHANGED',
    });
  });
  it('정렬된 원래 권위 검사 후 commit이 먼저 끝난 경합에서는 회수만 뒤따른다', async () => {
    const graph = await seedU2Enterprise(store),
      fence = new AuthorizationFence(graph.access.authorization),
      snapshot = await fence.capture(graph.customer, graph.enterpriseRef.id);
    const grant = (
      await store.list('CustomerRoleGrant', {
        equals: { membershipRef: { id: graph.member.membershipId }, revokedAt: null },
      })
    )[0]!;
    let release!: () => void, entered!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve)),
      ready = new Promise<void>((resolve) => (entered = resolve));
    let effects = 0;
    const first = store.execute(await request('original-current-effect'), async (tx) => {
      await fence.assert(graph.customer, snapshot, tx);
      entered();
      await barrier;
      effects++;
      const counter = (await tx.get('EnterpriseAccessFence', graph.fenceId))!;
      await tx.put(
        'EnterpriseAccessFence',
        {
          ...counter,
          accessRevision: Number(counter.accessRevision) + 1,
          revision: Number(counter.revision) + 1,
        },
        Number(counter.revision),
      );
    });
    await ready;
    const revoke = store.execute(await request('concurrent-current-revoke'), async (tx) => {
      await tx.put(
        'CustomerRoleGrant',
        { ...grant, revokedAt: new Date().toISOString(), revision: 2 },
        1,
      );
      const counter = (await tx.get('EnterpriseAccessFence', graph.fenceId))!;
      await tx.put(
        'EnterpriseAccessFence',
        {
          ...counter,
          accessRevision: Number(counter.accessRevision) + 1,
          revision: Number(counter.revision) + 1,
        },
        Number(counter.revision),
      );
    });
    release();
    await Promise.all([first, revoke]);
    expect(effects).toBe(1);
    expect(
      (await store.currentProtected('CustomerRoleGrant', String(grant.grantId)))?.revokedAt,
    ).not.toBeNull();
  });
  it('한 역할 비활성화가 다른 명시 거래 grant/기업 이용을 지우지 않는다', async () => {
    const graph = await seedU2Enterprise(store);
    const extra = await graph.access.defineCustomerRole(graph.customer, graph.enterpriseRef, {
      meta: u2Meta(),
      label: '별도 조회',
      actionScopes: [
        {
          enterpriseRef: graph.enterpriseRef,
          action: 'order.read',
          kind: 'ENTERPRISE_ALL',
          departmentRefs: [],
          siteRefs: [],
        },
      ],
    });
    await graph.access.grantCustomerRole(graph.customer, graph.enterpriseRef, {
      meta: u2Meta(),
      accountRef: graph.customer.actorAccountRef!,
      roleRef: extra.targetRef!,
      decision: 'GRANT',
    });
    const management = (await store.list('CustomerRole', { equals: { label: '명시 관리' } }))[0]!;
    await store.execute(await request('fixture-deactivate-management'), async (tx) => {
      await tx.put('RoleRevisionState', {
        roleStateId: randomUUID(),
        roleRef: ref('CustomerRole', management),
        staffRoleRef: null,
        active: false,
        scopeRefs: [],
        actions: [],
        revision: 1,
      });
      const counter = (await tx.get('EnterpriseAccessFence', graph.fenceId))!;
      await tx.put(
        'EnterpriseAccessFence',
        {
          ...counter,
          accessRevision: Number(counter.accessRevision) + 1,
          revision: Number(counter.revision) + 1,
        },
        Number(counter.revision),
      );
    });
    await expect(
      graph.access.authorization.requireCustomer(
        graph.customer,
        'order.read',
        graph.access.managementTarget(graph.enterprise),
        graph.enterprise.orderingContextPolicy as OrderingPolicy,
      ),
    ).resolves.toMatchObject({ active: true });
    await expect(
      graph.access.authorization.requireCustomer(
        graph.customer,
        'role.manage',
        graph.access.managementTarget(graph.enterprise),
        graph.enterprise.orderingContextPolicy as OrderingPolicy,
      ),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    expect((await store.currentProtected('Enterprise', graph.enterpriseRef.id))?.usageEnabled).toBe(
      true,
    );
  });
  it('새 scope 원본의 상태/개정과 직원 별도 fence도 current source를 검사한다', async () => {
    const graph = await seedU2Enterprise(store),
      fence = new AuthorizationFence(graph.access.authorization),
      snapshot = await fence.capture(graph.staff, null);
    const source = snapshot.sources.find((source) => source.entity === 'StaffAuthorityFence')!,
      current = (await store.read(source.entity, source.id))!;
    await store.execute(await request('fixture-staff-fence'), async (tx: ProtectedTransaction) =>
      tx.put(source.entity, { ...current, authorityRevision: 2, revision: 2 }, 1),
    );
    await expect(fence.assert(graph.staff, snapshot)).rejects.toMatchObject({
      code: 'AUTHORIZATION_FENCE_CHANGED',
    });
  });
});
