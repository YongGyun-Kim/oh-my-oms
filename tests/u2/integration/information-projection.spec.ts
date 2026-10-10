import { randomUUID, randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import { CustomerContexts, U2AccessDirectory, ref } from '@oms/core';
import type { Ref, ScopeV2, Receipt } from '@oms/contracts';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2Enterprise } from '../fixtures/enterprise.js';
import { seedSyntheticAccount } from '../fixtures/identity.js';
describe('현재 권한으로 최소 정보 투영', () => {
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
  const query = {
    cursor: null,
    pageSize: 25,
    enterpriseRef: null,
    departmentCursor: null,
    siteCursor: null,
    scopeCursor: null,
  };
  it('현재 자신의 기업/관리 범위만 실제 current sources에서 투영한다', async () => {
    const graph = await seedU2Enterprise(store);
    const result = (await new CustomerContexts(graph.access, graph.now).list(
      graph.customer,
      query,
    )) as { items: unknown[] };
    expect(result.items).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('password');
  });
  it('타기업/없는기업 결과와 건수를 같은 빈 목록으로 반환한다', async () => {
    const graph = await seedU2Enterprise(store);
    for (const id of [randomUUID(), 'not-existing'])
      expect(
        (
          (await new CustomerContexts(graph.access, graph.now).list(graph.customer, {
            ...query,
            enterpriseRef: { owner: 'EnterpriseAccess', entity: 'Enterprise', id, revision: 1 },
          })) as { items: unknown[] }
        ).items,
      ).toHaveLength(0);
  });
  it('직원 MFA를 고객 소속 directory 조회로 승격하지 않는다', async () => {
    const graph = await seedU2Enterprise(store);
    await expect(
      new CustomerContexts(graph.access, graph.now).list(graph.staff, query),
    ).rejects.toMatchObject({ code: 'CUSTOMER_REQUIRED' });
  });
  it('새 active ScopeV2는 구형 소비자에 손실 없는 단일 predicate로만 투영한다', async () => {
    const graph = await seedU2Enterprise(store),
      role = (await store.list('CustomerRole', { equals: { label: '명시 관리' } }))[0]!,
      scopeId = randomUUID();
    await store.execute(
      {
        principalId: 'synthetic-u2-current-owner',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-scope-projection',
        target: graph.enterpriseRef,
        idempotencyKey: randomUUID(),
        input: { scopeId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        const predicate = {
          enterpriseRef: graph.enterpriseRef,
          action: 'role.manage',
          kind: 'ENTERPRISE_ALL',
          departmentSelector: { kind: 'ALL' },
          siteSelector: { kind: 'ALL' },
          sourcePolicyRevision: Number(graph.enterprise.revision),
        };
        await tx.put('ScopeV2', {
          scopeId,
          enterpriseRef: graph.enterpriseRef,
          action: 'role.manage',
          kind: 'ENTERPRISE_ALL',
          predicate,
          revision: 1,
        });
        await tx.put('RoleRevisionState', {
          roleStateId: randomUUID(),
          roleRef: ref('CustomerRole', role),
          staffRoleRef: null,
          active: true,
          scopeRefs: [{ owner: 'EnterpriseAccess', entity: 'ScopeV2', id: scopeId, revision: 1 }],
          actions: [],
          revision: 1,
        });
      },
    );
    const result = (await new CustomerContexts(graph.access, graph.now).list(
      graph.customer,
      query,
    )) as { items: { data: { availableActions: string[]; actionScopes: unknown[] } }[] };
    expect(result.items[0]?.data.availableActions).toEqual(['role.manage']);
    expect(result.items[0]?.data.actionScopes).toHaveLength(1);
  });
  it('조회 도중 역할 회수는 이미 만든 자료/건수도 응답하지 않는다', async () => {
    const graph = await seedU2Enterprise(store),
      original = store.read.bind(store);
    let revoked = false;
    // Instrument only the deterministic source-read boundary, never replace
    // authentication/authorization or the protected transaction.
    store.read = async (model, id) => {
      const rows = await original(model, id);
      if (model === 'EnterpriseApplication' && !revoked) {
        revoked = true;
        const grants = await store.list('CustomerRoleGrant', {
          equals: { membershipRef: { id: graph.member.membershipId }, revokedAt: null },
        });
        await store.execute(
          {
            principalId: 'synthetic-current-owner',
            audience: 'SYSTEM',
            owner: 'EnterpriseAccess',
            operation: 'fixture-revoke-during-query',
            target: null,
            idempotencyKey: randomUUID(),
            input: { revoked: true },
            correlationId: randomUUID(),
            epoch: await store.currentEpoch(),
          },
          async (tx) => {
            for (const grant of grants)
              await tx.put(
                'CustomerRoleGrant',
                { ...grant, revokedAt: new Date().toISOString(), revision: 2 },
                1,
              );
          },
        );
      }
      return rows;
    };
    try {
      await expect(
        new CustomerContexts(graph.access, graph.now).list(graph.customer, query),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_FENCE_CHANGED' });
    } finally {
      store.read = original;
    }
  });
  it('raw-only scope/role 개정은 보호된 이전 정보로 fallback하지 않는다', async () => {
    const graph = await seedU2Enterprise(store),
      role = (await store.list('CustomerRole'))[0]!;
    await sources.primaryAdmin
      .getRepository('CustomerRole')
      .update({ roleId: role.roleId }, { label: '원문 미보호 표식' });
    await expect(
      new CustomerContexts(graph.access, graph.now).list(graph.customer, query),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
  it('미등록 account/assertion·임의 current Ref는 404/401 경계로 닫는다', async () => {
    const graph = await seedU2Enterprise(store);
    await expect(
      new CustomerContexts(graph.access, graph.now).list(
        {
          ...graph.customer,
          principalId: 'other',
          actorAccountRef: { ...graph.customer.actorAccountRef!, id: 'other' },
        },
        query,
      ),
    ).rejects.toThrow();
    await expect(
      new CustomerContexts(graph.access, graph.now).list(graph.customer, {
        ...query,
        enterpriseRef: {
          owner: 'IdentityRecovery',
          entity: 'Enterprise',
          id: graph.enterpriseRef.id,
          revision: 1,
        } as Ref,
      }),
    ).rejects.toMatchObject({ code: 'CONTEXT_ENTERPRISE_REF' });
  });
  it('현재 관리 directory는 opaque cursor로 같은 사람/기업/필터/권위에만 이어지고 raw ID를 반환하지 않는다', async () => {
    const f = await seedU2Enterprise(store),
      directory = new U2AccessDirectory(f.access, randomBytes(32), f.now),
      query = { cursor: null, pageSize: 1, filter: 'ALL' },
      first = (await directory.read(f.customer, f.enterpriseRef, query, 'roles')) as {
        items: unknown[];
        nextCursor: string | null;
      };
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    expect(first.nextCursor).not.toContain((first.items[0] as { sourceRef: Ref }).sourceRef.id);
    await expect(
      directory.read(f.customer, f.enterpriseRef, { ...query, cursor: first.nextCursor }, 'roles'),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      directory.read(
        f.customer,
        f.enterpriseRef,
        { ...query, cursor: first.nextCursor, filter: 'ACTIVE' },
        'roles',
      ),
    ).rejects.toMatchObject({ code: 'DIRECTORY_CURSOR' });
    await expect(
      directory.read(
        f.customer,
        f.enterpriseRef,
        { ...query, cursor: first.nextCursor!.slice(0, -2) + 'aa' },
        'roles',
      ),
    ).rejects.toMatchObject({ code: 'DIRECTORY_CURSOR' });
  });
  it('현재 역할 개정은 이전 directory cursor의 권위 fingerprint를 무효화한다', async () => {
    const f = await seedU2Enterprise(store),
      role = (await store.list('CustomerRole'))[0]!,
      directory = new U2AccessDirectory(f.access, randomBytes(32), f.now),
      query = { cursor: null, pageSize: 1, filter: 'ALL' },
      first = (await directory.read(f.customer, f.enterpriseRef, query, 'roles')) as {
        nextCursor: string;
      };
    await f.access.reviseCustomerRole(f.customer, {
      meta: {
        clientRequestId: randomUUID(),
        expectedRevision: 1,
        reason: '합성 현재 역할 변경',
        evidenceRefs: [],
      },
      roleRef: ref('CustomerRole', role),
      label: '개정 역할',
      predicates: [],
    });
    await expect(
      directory.read(f.customer, f.enterpriseRef, { ...query, cursor: first.nextCursor }, 'roles'),
    ).rejects.toThrow();
  });
  it('SQL 전체 술어 OR는9개 이상의 scope와 두 축을 손실 없이 대조하고 축의 교차 곱집합을 만들지 않는다', async () => {
    const f = await seedU2Enterprise(store),
      departmentIds = Array.from({ length: 10 }, () => randomUUID()),
      siteIds = Array.from({ length: 10 }, () => randomUUID()),
      accountIds = Array.from({ length: 11 }, () => randomUUID());
    for (const id of accountIds) await seedSyntheticAccount(store, id, 'CUSTOMER');
    const members = Array.from({ length: 10 }, (_, i) => ({
        ...f.member,
        membershipId: randomUUID(),
        accountRef: {
          owner: 'IdentityRecovery',
          entity: 'Account',
          id: accountIds[i],
          revision: 1,
        },
        departmentRef: {
          owner: 'EnterpriseAccess',
          entity: 'Department',
          id: departmentIds[i],
          revision: 1,
        },
        siteRef: { owner: 'EnterpriseAccess', entity: 'BusinessSite', id: siteIds[i], revision: 1 },
      })),
      cross = {
        ...members[0]!,
        membershipId: randomUUID(),
        accountRef: {
          owner: 'IdentityRecovery',
          entity: 'Account',
          id: accountIds[10],
          revision: 1,
        },
        siteRef: members[1]!.siteRef,
      };
    await store.execute(
      {
        principalId: 'synthetic-scope-owner',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-sql-scope-rows',
        target: f.enterpriseRef,
        idempotencyKey: randomUUID(),
        input: { count: 11 },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        for (let i = 0; i < 10; i++) {
          await tx.put('Department', {
            departmentId: departmentIds[i],
            enterpriseRef: f.enterpriseRef,
            label: '합성 부서' + i,
            active: true,
            revision: 1,
          });
          await tx.put('BusinessSite', {
            siteId: siteIds[i],
            enterpriseRef: f.enterpriseRef,
            label: '합성 사업장' + i,
            active: true,
            revision: 1,
          });
        }
        for (const row of [...members, cross]) await tx.put('EnterpriseMembership', row);
      },
    );
    const clauses = members.slice(0, 9).map((row) => ({
      departmentRef: { id: row.departmentRef.id },
      siteRef: { id: row.siteRef.id },
    }));
    const result = await store.list('EnterpriseMembership', {
      equals: { enterpriseRef: { id: f.enterpriseRef.id } },
      u2ScopeClauses: clauses,
      limit: 100,
    });
    expect(new Set(result.map((row) => row.membershipId))).toEqual(
      new Set(members.slice(0, 9).map((row) => row.membershipId)),
    );
    expect(result.some((row) => row.membershipId === cross.membershipId)).toBe(false);
    await expect(
      store.list('EnterpriseMembership', {
        equals: { enterpriseRef: { id: f.enterpriseRef.id } },
        anyOf: clauses,
        limit: 100,
      }),
    ).rejects.toMatchObject({ code: 'FILTER_LIMIT' });
    const changed = { ...members[0]!, departmentRef: members[9]!.departmentRef, revision: 2 };
    await store.execute(
      {
        principalId: 'synthetic-scope-owner',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-sql-latest-change',
        target: f.enterpriseRef,
        idempotencyKey: randomUUID(),
        input: { id: changed.membershipId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => tx.put('EnterpriseMembership', changed, 1),
    );
    expect(
      (
        await store.list('EnterpriseMembership', {
          equals: { enterpriseRef: { id: f.enterpriseRef.id } },
          u2ScopeClauses: clauses,
          limit: 100,
        })
      ).some((row) => row.membershipId === changed.membershipId),
    ).toBe(false);
  });
  it('등록되지 않은 모델/기업 없는 filter/SQL 필드 위조와2000 초과 술어는 SQL 실행 전 거절한다', async () => {
    const f = await seedU2Enterprise(store);
    for (const [model, query] of [
      [
        'CustomerRole',
        { equals: { enterpriseRef: { id: f.enterpriseRef.id } }, u2ScopeClauses: [{}] },
      ],
      ['EnterpriseMembership', { u2ScopeClauses: [{}] }],
      [
        'EnterpriseMembership',
        {
          equals: { enterpriseRef: { id: f.enterpriseRef.id } },
          u2ScopeClauses: [{ 'departmentRef) OR true --': null }],
        },
      ],
      [
        'EnterpriseMembership',
        {
          equals: { enterpriseRef: { id: f.enterpriseRef.id } },
          u2ScopeClauses: Array.from({ length: 2001 }, () => ({})),
        },
      ],
    ] as const)
      await expect(
        store.list(model, query as import('@oms/persistence').ModelQuery),
      ).rejects.toMatchObject({ code: 'U2_SCOPE_FILTER' });
  });
  it('opaque cursor는 원래5분 정각에 거절되고 조회 기한은 새 요청의 남은 예산을 따른다', async () => {
    const f = await seedU2Enterprise(store);
    let clock = f.now().getTime();
    const now = () => new Date(clock),
      directory = new U2AccessDirectory(f.access, randomBytes(32), now),
      query = { cursor: null, pageSize: 1, filter: 'ALL' },
      first = (await directory.read(f.customer, f.enterpriseRef, query, 'roles')) as {
        nextCursor: string;
      };
    clock += 300000;
    await expect(
      directory.read(f.customer, f.enterpriseRef, { ...query, cursor: first.nextCursor }, 'roles'),
    ).rejects.toMatchObject({ code: 'DIRECTORY_CURSOR' });
  });
  it('역할 SQL predicate는 원래 legacy와 현재 V2의 전체 쌍을 OR하며 두 관리 축을 합성하지 않는다', async () => {
    const f = await seedU2Enterprise(store),
      departments = Array.from({ length: 2 }, () => randomUUID()),
      sites = Array.from({ length: 2 }, () => randomUUID());
    await store.execute(
      {
        principalId: 'synthetic-role-owner',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-role-axes',
        target: f.enterpriseRef,
        idempotencyKey: randomUUID(),
        input: { count: 4 },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        for (let i = 0; i < 2; i++) {
          await tx.put('Department', {
            departmentId: departments[i],
            enterpriseRef: f.enterpriseRef,
            label: '역할 부서' + i,
            active: true,
            revision: 1,
          });
          await tx.put('BusinessSite', {
            siteId: sites[i],
            enterpriseRef: f.enterpriseRef,
            label: '역할 사업장' + i,
            active: true,
            revision: 1,
          });
        }
      },
    );
    await f.access.setOrderingPolicy(f.customer, f.enterpriseRef, {
      meta: {
        clientRequestId: randomUUID(),
        expectedRevision: f.enterpriseRef.revision,
        reason: '합성 축 사용',
        evidenceRefs: [],
      },
      departmentUsage: 'USED',
      siteUsage: 'USED',
    });
    const enterprise = (await store.currentProtected('Enterprise', f.enterpriseRef.id))!,
      enterpriseRef = ref('Enterprise', enterprise),
      roles: Receipt[] = [];
    for (const [department, site] of [
      [0, 0],
      [1, 1],
      [0, 1],
    ])
      roles.push(
        await f.access.defineCustomerRole(f.customer, enterpriseRef, {
          meta: {
            clientRequestId: randomUUID(),
            expectedRevision: null,
            reason: '합성 후보 역할',
            evidenceRefs: [],
          },
          label: '후보' + department + site,
          actionScopes: [
            {
              enterpriseRef,
              action: 'order.submit',
              kind: 'DEPARTMENT_SITE',
              departmentRefs: [
                {
                  owner: 'EnterpriseAccess',
                  entity: 'Department',
                  id: departments[department]!,
                  revision: 1,
                },
              ],
              siteRefs: [
                {
                  owner: 'EnterpriseAccess',
                  entity: 'BusinessSite',
                  id: sites[site]!,
                  revision: 1,
                },
              ],
            },
          ],
        }),
      );
    const predicates: ScopeV2[] = Array.from({ length: 2 }, (_, i) => ({
      enterpriseRef,
      action: 'role.manage',
      kind: 'DEPARTMENT_SITE',
      departmentSelector: {
        kind: 'EXACT',
        ref: { owner: 'EnterpriseAccess', entity: 'Department', id: departments[i]!, revision: 1 },
      },
      siteSelector: {
        kind: 'EXACT',
        ref: { owner: 'EnterpriseAccess', entity: 'BusinessSite', id: sites[i]!, revision: 1 },
      },
      sourcePolicyRevision: Number(enterprise.revision),
    }));
    const admin = (await store.list('CustomerRole', { equals: { label: '명시 관리' } }))[0]!;
    await f.access.reviseCustomerRole(f.customer, {
      meta: {
        clientRequestId: randomUUID(),
        expectedRevision: 1,
        reason: '원래 두 쌍의 명시 관리',
        evidenceRefs: [],
      },
      roleRef: ref('CustomerRole', admin),
      label: '두 쌍 관리',
      predicates,
    });
    const result = (await new U2AccessDirectory(f.access, randomBytes(32), f.now).read(
      f.customer,
      enterpriseRef,
      { cursor: null, pageSize: 100, filter: 'ALL' },
      'roles',
    )) as { items: { sourceRef: Ref }[] };
    expect(new Set(result.items.map((row) => row.sourceRef.id))).toEqual(
      new Set([String(admin.roleId), roles[0]!.targetRef!.id, roles[1]!.targetRef!.id]),
    );
    expect(result.items.some((row) => row.sourceRef.id === roles[2]!.targetRef!.id)).toBe(false);
    const deactivate = {
      meta: {
        clientRequestId: randomUUID(),
        expectedRevision: 1,
        reason: '합성 역할 비활성',
        evidenceRefs: [],
      },
      roleRef: roles[0]!.targetRef!,
    };
    await f.access.deactivateCustomerRole(f.customer, deactivate);
    const inactive = (await new U2AccessDirectory(f.access, randomBytes(32), f.now).read(
      f.customer,
      enterpriseRef,
      { cursor: null, pageSize: 100, filter: 'INACTIVE' },
      'roles',
    )) as { items: { sourceRef: Ref; state: string }[] };
    expect(inactive.items).toHaveLength(1);
    expect(inactive.items[0]).toMatchObject({
      sourceRef: { id: roles[0]!.targetRef!.id },
      state: 'INACTIVE',
    });
  });
});
