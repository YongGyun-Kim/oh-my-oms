import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localSources } from '../fixtures/databases.js';
import { initializeDatabases } from '../fixtures/migrate.js';
import { physicalData } from '@oms/persistence';

describe('실제 독립 PostgreSQL 원본/권한', () => {
  const sources = localSources();
  const account = () => ({
    accountId: randomUUID(),
    loginIdentifier: randomUUID(),
    displayName: '합성 담당자',
    contactAddress: 'synthetic@example.invalid',
    active: true,
    identityBasis: [],
    revision: 1,
  });
  beforeAll(async () => {
    await initializeDatabases();
    await sources.primaryApp.initialize();
    await sources.journalAppend.initialize();
    await sources.primaryAdmin.initialize();
    await sources.journalAdmin.initialize();
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  it('서로 다른 store와 actual17.11·fsync/synchronous_commit을 확인한다', async () => {
    const p = await sources.primaryApp.query(
      "SELECT current_database() AS name, version() AS version, current_setting('fsync') AS fsync, current_setting('synchronous_commit') AS durable",
    );
    const j = await sources.journalAppend.query('SELECT current_database() AS name');
    expect(p[0]).toMatchObject({ name: 'oms_u1_verification', fsync: 'on', durable: 'on' });
    expect(p[0].version).toContain('17.11');
    expect(j[0].name).toBe('oms_u1_journal_verification');
  });
  it('같은 EntityManager transaction으로 원본을 저장·롤백한다', async () => {
    const data = account();
    await expect(
      sources.primaryApp.transaction(async (manager) => {
        await manager.getRepository('Account').insert(data);
        throw new Error('주입된 실패');
      }),
    ).rejects.toThrow('주입된 실패');
    expect(
      await sources.primaryApp.getRepository('Account').findOneBy({ accountId: data.accountId }),
    ).toBeNull();
  });
  it('정상 원본·정확 revision을 저장하고 unique key 중복을 거절한다', async () => {
    const data = account();
    await sources.primaryApp.getRepository('Account').insert(data);
    expect(
      await sources.primaryApp.getRepository('Account').findOneBy({ accountId: data.accountId }),
    ).toMatchObject(data);
    await expect(sources.primaryApp.getRepository('Account').insert(data)).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
  });
  it('native NOT NULL과 양수 revision CHECK를 적용한다', async () => {
    await expect(
      sources.primaryApp.getRepository('Account').insert({ ...account(), active: null }),
    ).rejects.toMatchObject({ driverError: { code: '23502' } });
    await expect(
      sources.primaryApp.getRepository('Account').insert({ ...account(), revision: 0 }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });
  it('없는 enterprise parent FK를 native commit에서 거절한다', async () => {
    const id = randomUUID();
    const data = {
      departmentId: id,
      enterpriseRef: {
        owner: 'EnterpriseAccess',
        entity: 'Enterprise',
        id: randomUUID(),
        revision: 1,
      },
      label: '합성 부서',
      active: true,
      revision: 1,
    };
    await expect(
      sources.primaryApp.getRepository('Department').insert(physicalData('Department', data)),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
  });
  it('일반 앱과 journal append에게 DDL/role 승격을 허용하지 않는다', async () => {
    await expect(
      sources.primaryApp.query('CREATE TABLE u1_unapproved_probe(id text)'),
    ).rejects.toMatchObject({ driverError: { code: '42501' } });
    await expect(sources.primaryApp.query('SET ROLE u1_owner')).rejects.toMatchObject({
      driverError: { code: '42501' },
    });
    await expect(
      sources.journalAppend.query('CREATE TABLE u1_unapproved_probe(id text)'),
    ).rejects.toMatchObject({ driverError: { code: '42501' } });
  });
  it('기존 물리 원본이 있는 migration 재실행은 같은 형태를 보존한다', async () => {
    const rows = await sources.primaryAdmin.query(
      "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'u1_%'",
    );
    expect(rows[0].count).toBeGreaterThanOrEqual(34);
    await initializeDatabases();
    expect(await sources.primaryApp.getRepository('Account').count()).toBeGreaterThanOrEqual(1);
  });
});
