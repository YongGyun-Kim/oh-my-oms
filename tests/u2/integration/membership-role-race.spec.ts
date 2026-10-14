import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import {
  EnterpriseMemberships,
  EnterpriseRoleRevisions,
  EnterpriseOrganisation,
  EnterpriseAccess,
  StaffAccess,
  ref,
} from '@oms/core';
import type { Ref, ScopeV2 } from '@oms/contracts';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2Enterprise, u2Meta, loginU2SyntheticAccount } from '../fixtures/enterprise.js';
import { seedSyntheticAccount } from '../../u1/fixtures/identity.js';
describe('소속/역할 개정의 실제 현재 권위와 보호 commit', () => {
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
  const predicates = (enterpriseRef: Ref, action = 'order.read'): ScopeV2[] => [
    {
      enterpriseRef,
      action,
      kind: 'ENTERPRISE_ALL',
      departmentSelector: { kind: 'ALL' },
      siteSelector: { kind: 'ALL' },
      sourcePolicyRevision: enterpriseRef.revision,
    },
  ];
  async function trade(graph: Awaited<ReturnType<typeof seedU2Enterprise>>) {
    const role = await graph.access.defineCustomerRole(graph.customer, graph.enterpriseRef, {
      meta: u2Meta(),
      label: '명시 별도 거래',
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
      roleRef: role.targetRef!,
      decision: 'GRANT',
    });
    return role.targetRef!;
  }
  it('마지막 관리자 0을 허용하며 own 결과/다른 grant/이용 상태를 보존한다', async () => {
    const graph = await seedU2Enterprise(store),
      role = await trade(graph),
      input = {
        meta: u2Meta(Number(graph.member.revision)),
        membershipRef: ref('EnterpriseMembership', graph.member),
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      };
    const before = Number(
      (await store.currentProtected('EnterpriseAccessFence', graph.fenceId))?.accessRevision,
    );
    const result = await new EnterpriseMemberships(graph.access).update(graph.customer, input);
    expect(result.requestState).toBe('RESULT_RECORDED');
    expect(
      (await store.currentProtected('Enterprise', graph.enterpriseRef.id))?.administratorCount,
    ).toBe(0);
    expect((await store.currentProtected('Enterprise', graph.enterpriseRef.id))?.usageEnabled).toBe(
      true,
    );
    expect(
      await store.list('CustomerRoleGrant', {
        equals: { roleRef: { id: role.id }, revokedAt: null },
      }),
    ).toHaveLength(1);
    expect(
      (await store.currentProtected('EnterpriseAccessFence', graph.fenceId))?.accessRevision,
    ).toBe(before + 1);
  });
  it('자기 소속 비활성화 뒤 같은 원래 요청은 effect 없이 own receipt만 재관측한다', async () => {
    const graph = await seedU2Enterprise(store),
      input = {
        meta: u2Meta(Number(graph.member.revision)),
        membershipRef: ref('EnterpriseMembership', graph.member),
        departmentRef: null,
        siteRef: null,
        active: false,
        administrator: false,
      },
      service = new EnterpriseMemberships(graph.access);
    const first = await service.update(graph.customer, input),
      second = await service.update(graph.customer, input);
    expect(second).toEqual(first);
    expect(
      (await store.read('EnterpriseMembership', String(graph.member.membershipId)))?.revision,
    ).toBe(2);
    await expect(
      service.update(graph.customer, {
        ...input,
        meta: u2Meta(2),
        membershipRef: { ...input.membershipRef, revision: 2 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('stale/타인/다른 audience 소속 변경은 쓰기 및 ACK를 만들지 않는다', async () => {
    const graph = await seedU2Enterprise(store),
      service = new EnterpriseMemberships(graph.access),
      input = {
        meta: u2Meta(1),
        membershipRef: ref('EnterpriseMembership', graph.member),
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      };
    await expect(
      service.update(graph.customer, {
        ...input,
        membershipRef: { ...input.membershipRef, revision: 99 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.update(graph.staff, input)).rejects.toMatchObject({
      code: 'CUSTOMER_REQUIRED',
    });
    expect(
      (await store.read('EnterpriseMembership', String(graph.member.membershipId)))?.revision,
    ).toBe(1);
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'updateMembership' } }),
    ).toHaveLength(0);
  });
  it('관리자가 자신에게 거래 역할을 개정해 명시 부여할 수 있고 관리 권한만으로 거래를 얻지 않는다', async () => {
    const graph = await seedU2Enterprise(store),
      role = await trade(graph),
      service = new EnterpriseRoleRevisions(graph.access);
    await expect(
      graph.access.authorization.requireCustomer(
        graph.customer,
        'payment.read',
        graph.access.managementTarget(graph.enterprise),
        graph.enterprise.orderingContextPolicy as never,
      ),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    const result = await service.customer(graph.customer, {
      meta: u2Meta(role.revision),
      roleRef: role,
      label: '대금 조회',
      predicates: predicates(graph.enterpriseRef, 'payment.read'),
    });
    expect(result.targetRef?.revision).toBe(2);
    await expect(
      graph.access.authorization.requireCustomer(
        graph.customer,
        'payment.read',
        graph.access.managementTarget(graph.enterprise),
        graph.enterprise.orderingContextPolicy as never,
      ),
    ).resolves.toMatchObject({ active: true });
    await expect(
      graph.access.authorization.requireCustomer(
        graph.customer,
        'order.read',
        graph.access.managementTarget(graph.enterprise),
        graph.enterprise.orderingContextPolicy as never,
      ),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
  it('역할 비활성화가 다른 거래 역할/기존 grant를 지우거나 개정으로 부활시키지 않는다', async () => {
    const graph = await seedU2Enterprise(store),
      role = await trade(graph),
      service = new EnterpriseRoleRevisions(graph.access),
      result = await service.deactivateCustomer(graph.customer, {
        meta: u2Meta(role.revision),
        roleRef: role,
      });
    expect(
      await store.list('CustomerRoleGrant', {
        equals: { roleRef: { id: role.id }, revokedAt: null },
      }),
    ).toHaveLength(1);
    await service.customer(graph.customer, {
      meta: u2Meta(2),
      roleRef: result.targetRef!,
      label: '비활성 유지',
      predicates: predicates(graph.enterpriseRef),
    });
    await expect(
      graph.access.authorization.requireCustomer(
        graph.customer,
        'order.read',
        graph.access.managementTarget(graph.enterprise),
        graph.enterprise.orderingContextPolicy as never,
      ),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    await expect(
      graph.access.authorization.requireCustomer(
        graph.customer,
        'role.manage',
        graph.access.managementTarget(graph.enterprise),
        graph.enterprise.orderingContextPolicy as never,
      ),
    ).resolves.toMatchObject({ active: true });
  });
  it('역할 전체의 타기업 확장과 stale 개정은 transaction 전에 닫는다', async () => {
    const graph = await seedU2Enterprise(store),
      role = await trade(graph),
      service = new EnterpriseRoleRevisions(graph.access);
    await expect(
      service.customer(graph.customer, {
        meta: u2Meta(1),
        roleRef: role,
        label: '타기업',
        predicates: predicates({ ...graph.enterpriseRef, id: randomUUID() }),
      }),
    ).rejects.toMatchObject({ code: 'ROLE_MANAGEMENT_SCOPE' });
    await expect(
      service.customer(graph.customer, {
        meta: u2Meta(2),
        roleRef: role,
        label: 'stale',
        predicates: predicates(graph.enterpriseRef),
      }),
    ).rejects.toMatchObject({ code: 'ROLE_REVISION' });
    expect((await store.read('CustomerRole', role.id))?.revision).toBe(1);
  });
  it('직원 새 12행위는 새 state만 권위이고 구형 consumer는 명시 거절한다', async () => {
    const graph = await seedU2Enterprise(store),
      original = (await store.list('StaffRole'))[0]!,
      service = new EnterpriseRoleRevisions(graph.access);
    await service.staff(graph.staff, {
      meta: u2Meta(1),
      roleRef: ref('StaffRole', original),
      label: '명시 복구',
      actions: ['staff.role.manage', 'identity.recovery.verify'],
    });
    await expect(
      graph.access.authorization.requireStaff(graph.staff, 'identity.recovery.verify'),
    ).resolves.toBeUndefined();
    await expect(
      new StaffAccess(store, graph.now).readRoles(graph.staff, { cursor: null, pageSize: 25 }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_ROLE_PROFILE' });
    await expect(
      graph.access.authorization.requireStaff(graph.staff, 'enterprise.approve'),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    const state = (
      await store.list('RoleRevisionState', {
        equals: { staffRoleRef: { id: original.staffRoleId } },
      })
    )[0]!;
    expect(state.actions).toEqual(['staff.role.manage', 'identity.recovery.verify']);
  });
  it('기존 upsertMembership도 자기 비활성화의 원래 operation/target/own 결과를 보존한다', async () => {
    const g = await seedU2Enterprise(store),
      service = new EnterpriseOrganisation(g.access, g.now),
      input = {
        meta: u2Meta(1),
        accountRef: g.customer.actorAccountRef!,
        departmentRef: null,
        siteRef: null,
        active: false,
        administrator: false,
      };
    const first = await service.membership(g.customer, g.enterpriseRef, input),
      replay = await service.membership(g.customer, g.enterpriseRef, input);
    expect(replay).toEqual(first);
    const receipt = (await store.read('RequestReceipt', first.requestId))!;
    expect(receipt.operation).toBe('upsertMembership');
    expect(receipt.targetIdentity).toEqual({ kind: 'ENTERPRISE', enterpriseRef: g.enterpriseRef });
    expect(
      (await store.currentProtected('Enterprise', g.enterpriseRef.id))?.administratorCount,
    ).toBe(0);
  });
  it('bounded 조직 관리자는 같은 부서만 개정하고 완성 술어 밖 생성은 거절된다', async () => {
    const g = await seedU2Enterprise(store),
      service = new EnterpriseOrganisation(g.access, g.now),
      created = await service.upsert(g.customer, g.enterpriseRef, {
        meta: u2Meta(),
        entityKind: 'DEPARTMENT',
        label: '합성 부서',
        active: true,
        changeKind: 'CREATE',
        organisationRef: null,
      });
    let enterprise = (await store.read('Enterprise', g.enterpriseRef.id))!;
    await g.access.setOrderingPolicy(g.customer, ref('Enterprise', enterprise), {
      meta: u2Meta(Number(enterprise.revision)),
      departmentUsage: 'USED',
      siteUsage: 'NOT_USED',
    });
    enterprise = (await store.read('Enterprise', g.enterpriseRef.id))!;
    await service.membership(g.customer, ref('Enterprise', enterprise), {
      meta: u2Meta(1),
      accountRef: g.customer.actorAccountRef!,
      departmentRef: created.targetRef!,
      siteRef: null,
      active: true,
      administrator: true,
    });
    enterprise = (await store.read('Enterprise', g.enterpriseRef.id))!;
    const role = (await store.list('CustomerRole', { equals: { label: '명시 관리' } }))[0]!;
    await g.access.reviseCustomerRole(g.customer, {
      meta: u2Meta(1),
      roleRef: ref('CustomerRole', role),
      label: '부서 관리',
      predicates: ['organisation.manage', 'user.manage', 'role.manage'].map((action) => ({
        enterpriseRef: ref('Enterprise', enterprise),
        action,
        kind: 'DEPARTMENT_ALL_SITES',
        departmentSelector: { kind: 'EXACT', ref: created.targetRef! },
        siteSelector: { kind: 'ALL' },
        sourcePolicyRevision: Number(enterprise.revision),
      })),
    });
    const revised = await service.upsert(g.customer, ref('Enterprise', enterprise), {
      meta: u2Meta(1),
      entityKind: 'DEPARTMENT',
      label: '새 합성 이름',
      active: true,
      changeKind: 'UPDATE',
      organisationRef: created.targetRef,
    });
    expect(revised.targetRef?.revision).toBe(2);
    enterprise = (await store.read('Enterprise', g.enterpriseRef.id))!;
    await expect(
      service.upsert(g.customer, ref('Enterprise', enterprise), {
        meta: u2Meta(),
        entityKind: 'DEPARTMENT',
        label: '범위 밖',
        active: true,
        changeKind: 'CREATE',
        organisationRef: null,
      }),
    ).rejects.toMatchObject({ code: 'MANAGEMENT_TARGET' });
    const traded = await g.access.defineCustomerRole(g.customer, ref('Enterprise', enterprise), {
      meta: u2Meta(),
      label: '직접 업무권 없는 명시 부여',
      actionScopes: [
        {
          enterpriseRef: ref('Enterprise', enterprise),
          action: 'order.read',
          kind: 'DEPARTMENT_ALL_SITES',
          departmentRefs: [revised.targetRef!],
          siteRefs: [],
        },
      ],
    });
    await g.access.grantCustomerRole(g.customer, ref('Enterprise', enterprise), {
      meta: u2Meta(),
      accountRef: g.customer.actorAccountRef!,
      roleRef: traded.targetRef!,
      decision: 'GRANT',
    });
    await expect(
      g.access.authorization.requireCustomer(
        g.customer,
        'order.read',
        { ...g.access.managementTarget(enterprise), departmentRef: revised.targetRef! },
        enterprise.orderingContextPolicy as never,
      ),
    ).resolves.toMatchObject({ active: true });
  });
  it('두 마지막 관리자 경합은 미보호 구간을 거절하고 원래 재대조 뒤 0을 허용한다', async () => {
    const g = await seedU2Enterprise(store),
      secondId = randomUUID();
    await seedSyntheticAccount(store, secondId, 'CUSTOMER');
    const second = await loginU2SyntheticAccount(g.identity, secondId),
      created = await new EnterpriseOrganisation(g.access, g.now).membership(
        g.customer,
        g.enterpriseRef,
        {
          meta: u2Meta(),
          accountRef: second.actorAccountRef!,
          departmentRef: null,
          siteRef: null,
          active: true,
          administrator: true,
        },
      ),
      enterprise = (await store.read('Enterprise', g.enterpriseRef.id))!,
      role = (await store.list('CustomerRole', { equals: { label: '명시 관리' } }))[0]!;
    await g.access.grantCustomerRole(g.customer, ref('Enterprise', enterprise), {
      meta: u2Meta(),
      accountRef: second.actorAccountRef!,
      roleRef: ref('CustomerRole', role),
      decision: 'GRANT',
    });
    expect(enterprise.administratorCount).toBe(2);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve)),
      ready = new Promise<void>((resolve) => (entered = resolve));
    let once = true;
    const delayed = new ProtectedStore(
        sources.primaryApp,
        sources.journalAppend,
        async (boundary) => {
          if (boundary === 'PRIMARY_COMMITTED' && once) {
            once = false;
            entered();
            await gate;
          }
        },
      ),
      access = new EnterpriseAccess(delayed, g.access.verification, g.now, true),
      service = new EnterpriseMemberships(access, g.now),
      firstInput = {
        meta: u2Meta(1),
        membershipRef: ref('EnterpriseMembership', g.member),
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      },
      secondInput = {
        meta: u2Meta(1),
        membershipRef: created.targetRef!,
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      };
    const first = service.update(g.customer, firstInput);
    await ready;
    await expect(service.update(second, secondInput)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    release();
    await first;
    await service.update(second, secondInput);
    expect(
      (await store.currentProtected('Enterprise', g.enterpriseRef.id))?.administratorCount,
    ).toBe(0);
    expect((await store.currentProtected('Enterprise', g.enterpriseRef.id))?.usageEnabled).toBe(
      true,
    );
    expect(await store.list('CustomerRoleGrant', { equals: { revokedAt: null } })).toHaveLength(2);
  });
});
