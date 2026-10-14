import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import { ref } from '@oms/core';
import type { Ref } from '@oms/contracts';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedVerifiedRecoveryParty } from '../fixtures/identity.js';
import { u2Meta } from '../fixtures/enterprise.js';
import { u2HttpHost } from '../fixtures/http.js';
describe('현재 U2 directory/개정의 실제 HTTP', () => {
  const sources = u2Sources(),
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  let host: Awaited<ReturnType<typeof u2HttpHost>> | undefined;
  beforeAll(async () => {
    await initializeU2Databases();
    for (const s of Object.values(sources)) await s.initialize();
  });
  beforeEach(async () => resetU2Databases(sources.primaryAdmin, sources.journalAdmin));
  afterEach(async () => {
    await host?.app.close();
    host = undefined;
    vi.useRealTimers();
  });
  afterAll(async () => {
    for (const s of Object.values(sources)) if (s.isInitialized) await s.destroy();
  });
  async function setup(audience: 'CUSTOMER' | 'STAFF' = 'CUSTOMER', admitted = true) {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    host = await u2HttpHost(store, f, audience, admitted);
    return { f, ...host };
  }
  it('현재 관리자의 closed v1 directory/page cursor를 actual HTTP로 조회한다', async () => {
    const { f, client } = await setup();
    await client.authenticate(f.customer.principalId);
    const result = await client.request<{ items: { sourceRef: unknown }[]; nextCursor: string }>(
      `/enterprises/${f.enterpriseRef.id}/customer-roles?pageSize=1`,
    );
    expect(result.response.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.nextCursor).toBeTruthy();
    expect(result.response.headers.get('cache-control')).toContain('no-store');
    expect(result.response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(JSON.stringify(result.body)).not.toContain('verifier');
  });
  it('직원 U2 조회는 현재 추가 행위를 보존하고 구형 common2 소비자를 확장하지 않는다', async () => {
    const { f, client } = await setup('STAFF');
    await client.authenticate(f.staff.principalId);
    const page = await client.request<{
      items: { roleRef: Ref; actions: string[]; active: boolean }[];
    }>('/staff-role-directory');
    expect(page.response.status).toBe(200);
    expect(page.body.items[0]!.actions).toContain('identity.recovery.verify');
    expect(page.body.items[0]!.active).toBe(true);
    expect((await client.request('/staff-roles')).response.status).toBe(503);
    for (const suffix of ['?pageSize=101', '?filter=HOLD', '?principal=other'])
      expect((await client.request('/staff-role-directory' + suffix)).response.status).toBe(400);
  });
  it('직원 역할 명시 개정 뒤 현재 directory는 새3행위와 current revision을 반환한다', async () => {
    const { f, client } = await setup('STAFF');
    await client.authenticate(f.staff.principalId);
    const role = (await store.list('StaffRole'))[0]!,
      state = await f.access.authorization.currentRoleState('StaffRole', String(role.staffRoleId)),
      input = {
        meta: u2Meta(Number(role.revision)),
        roleRef: ref('StaffRole', role),
        label: '합성 명시 전체 확인',
        actions: [
          ...(state!.actions as string[]),
          'identity.person.verify',
          'enterprise.administrator.restore',
        ],
      };
    expect(
      (
        await client.request(`/staff-roles/${role.staffRoleId}/revisions`, input, {
          'Idempotency-Key': input.meta.clientRequestId,
          'X-Target-Revision': String(role.revision),
        })
      ).response.status,
    ).toBe(202);
    const page = await client.request<{ items: { roleRef: Ref; actions: string[] }[] }>(
      '/staff-role-directory',
    );
    expect(page.response.status).toBe(200);
    expect(page.body.items[0]!.roleRef.revision).toBe(Number(role.revision) + 1);
    expect(page.body.items[0]!.actions).toEqual(input.actions);
    expect(await store.list('StaffRoleGrant')).toHaveLength(1);
  });
  it('직원 U2 cursor는 조건/기한/현재 권위가 달라지면 재사용하지 않는다', async () => {
    const { f, client } = await setup('STAFF');
    await client.authenticate(f.staff.principalId);
    const page = await client.request<{ nextCursor: string }>('/staff-role-directory?pageSize=1');
    expect(page.response.status).toBe(200);
    expect(page.body.nextCursor).toBeTruthy();
    const [iv, encrypted, originalTag] = page.body.nextCursor.split('.');
    for (const length of [4, 8, 15, 17]) {
      const changed = Buffer.alloc(length);
      Buffer.from(originalTag!, 'base64url').copy(changed);
      const cursor = [iv, encrypted, changed.toString('base64url')].join('.');
      expect(
        (
          await client.request(
            '/staff-role-directory?pageSize=1&cursor=' + encodeURIComponent(cursor),
          )
        ).response.status,
      ).toBe(400);
    }
    const alteredTag = Buffer.from(originalTag!, 'base64url');
    alteredTag[0] = alteredTag[0]! ^ 1;
    expect(
      (
        await client.request(
          '/staff-role-directory?pageSize=1&cursor=' +
            encodeURIComponent([iv, encrypted, alteredTag.toString('base64url')].join('.')),
        )
      ).response.status,
    ).toBe(400);
    expect(
      (
        await client.request(
          '/staff-role-directory?pageSize=2&cursor=' + encodeURIComponent(page.body.nextCursor),
        )
      ).response.status,
    ).toBe(400);
    expect(
      (
        await client.request(
          '/staff-role-directory?pageSize=1&filter=INACTIVE&cursor=' +
            encodeURIComponent(page.body.nextCursor),
        )
      ).response.status,
    ).toBe(400);
    expect(
      (
        await client.request(
          '/staff-role-directory?pageSize=1&cursor=' + encodeURIComponent(page.body.nextCursor),
        )
      ).response.status,
    ).toBe(200);
  });
  it('잘못된 query/page/target는 보호 업무 effect를 만들지 않는다', async () => {
    const { f, client } = await setup();
    await client.authenticate(f.customer.principalId);
    for (const query of ['pageSize=101', 'filter=ACTIVE%27%20OR%201%3D1', 'principalId=admin'])
      expect(
        (await client.request(`/enterprises/${f.enterpriseRef.id}/memberships?${query}`)).response
          .status,
      ).toBe(400);
    const before = (await store.list('CustomerRole')).length,
      role = (await store.list('CustomerRole'))[0]!,
      input = {
        meta: u2Meta(1),
        roleRef: { ...ref('CustomerRole', role), id: randomUUID() },
        label: '잘못된 경로',
        predicates: [],
      };
    expect(
      (
        await client.request(`/customer-roles/${role.roleId}/revisions`, input, {
          'Idempotency-Key': input.meta.clientRequestId,
          'X-Target-Revision': '1',
        })
      ).response.status,
    ).toBe(400);
    expect(await store.list('CustomerRole')).toHaveLength(before);
  });
  it('Origin/CSRF/클라이언트 MFA·역할 위조는 owner 호출 전에 거절한다', async () => {
    const { f, client } = await setup();
    await client.authenticate(f.customer.principalId);
    const role = (await store.list('CustomerRole'))[0]!,
      input = {
        meta: u2Meta(1),
        roleRef: ref('CustomerRole', role),
        label: '원래 역할',
        predicates: [],
      };
    for (const bad of [
      { Origin: 'https://attacker.invalid' },
      { 'X-CSRF-Token': 'wrong' },
      { 'X-MFA-Verified': 'true' },
    ] as Record<string, string>[]) {
      const result = await client.request(`/customer-roles/${role.roleId}/revisions`, input, {
        'Idempotency-Key': input.meta.clientRequestId,
        'X-Target-Revision': '1',
        ...bad,
      });
      expect([400, 403]).toContain(result.response.status);
    }
    expect((await store.currentProtected('CustomerRole', String(role.roleId)))!.revision).toBe(1);
  });
  it('STAFF의 health/CSRF/직원 역할/복구 접점 전체가 실제 ingress 없이는 닫힌다', async () => {
    const { client } = await setup('STAFF', false);
    for (const path of ['/health/live', '/security/csrf', '/health/ready/read', '/identity'])
      expect((await client.request(path)).response.status).toBe(403);
    expect((await client.request('/identity/party-challenges', {})).response.status).toBe(403);
  });
  it('CUSTOMER transport는 SYSTEM 비상·STAFF 개정 경로를 등록하지 않는다', async () => {
    const { client } = await setup();
    await client.refreshCsrf();
    for (const path of [
      '/identity/emergency-cases/x/applications',
      '/staff-roles/x/revisions',
      '/administrator-restorations/x/resumes',
    ])
      expect((await client.request(path, {})).response.status).toBe(404);
  });
  it('raw-only 현재 역할 변경은 이전 허용/자료로 fallback하지 않는다', async () => {
    const { f, client } = await setup();
    await client.authenticate(f.customer.principalId);
    const role = (await store.list('CustomerRole'))[0]!;
    await sources.primaryAdmin
      .getRepository('CustomerRole')
      .update({ roleId: role.roleId }, { label: '미보호 HTTP 표식' });
    const result = await client.request(`/enterprises/${f.enterpriseRef.id}/memberships`);
    expect(result.response.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain('미보호 HTTP 표식');
  });
  it('성공한 U2 명시 업무 개정만 일반 세션 idle 활동을 갱신하고 조회/거절은 갱신하지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const at = Date.now();
    const { f, client } = await setup('STAFF');
    await client.authenticate(f.staff.principalId);
    const sessions = async () =>
      store.list('IdentitySession', {
        equals: { accountRef: { id: f.staff.principalId }, phase: 'MFA_VERIFIED' },
        limit: 20,
      });
    const before = await sessions();
    vi.setSystemTime(at + 60000);
    expect((await client.request('/staff-role-directory')).response.status).toBe(200);
    expect((await client.request('/staff-role-directory?filter=forged')).response.status).toBe(400);
    expect((await sessions()).map((s) => s.lastActiveAt)).toEqual(
      before.map((s) => s.lastActiveAt),
    );
    const role = (await store.list('StaffRole'))[0]!,
      state = await f.access.authorization.currentRoleState('StaffRole', String(role.staffRoleId));
    const input = {
      meta: u2Meta(Number(role.revision)),
      roleRef: ref('StaffRole', role),
      label: '실제 명시 변경 활동',
      actions: state!.actions,
    };
    expect(
      (
        await client.request('/staff-roles/' + role.staffRoleId + '/revisions', input, {
          'Idempotency-Key': input.meta.clientRequestId,
          'X-Target-Revision': String(role.revision),
        })
      ).response.status,
    ).toBe(202);
    expect(
      (await sessions()).some((s) => s.lastActiveAt === new Date(at + 60000).toISOString()),
    ).toBe(true);
    expect((await store.list('EnrollmentAuthority')).length).toBe(0);
  });
});
