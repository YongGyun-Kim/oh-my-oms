import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore, U2Repository } from '@oms/persistence';
import { u2Sources, initializeU2Databases } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2RecoveryGraph } from '../fixtures/identity.js';
describe('U2 repository current/expected revision/primary logical change', () => {
  const sources = u2Sources();
  const store = new ProtectedStore(sources.primaryApp, sources.journalAppend),
    repository = new U2Repository(store);
  beforeAll(async () => {
    await initializeU2Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => resetU2Databases(sources.primaryAdmin, sources.journalAdmin));
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  const request = async () => ({
    principalId: 'synthetic-u2',
    audience: 'SYSTEM' as const,
    owner: 'IdentityRecovery',
    operation: 'test-current-state',
    target: null,
    idempotencyKey: randomUUID(),
    input: { change: 'fixture' },
    correlationId: randomUUID(),
    epoch: await store.currentEpoch(),
  });
  it('보호된 current source/세대를 읽는다', async () => {
    const graph = await seedU2RecoveryGraph(store);
    expect(await repository.current(graph.references.AccountSecurityState!)).toEqual(
      graph.rows.AccountSecurityState,
    );
  });
  it('stale 개정/잘못된 owner는 거절한다', async () => {
    const graph = await seedU2RecoveryGraph(store),
      r = graph.references.AccountSecurityState!;
    await expect(repository.current({ ...r, revision: 2 })).rejects.toMatchObject({
      code: 'STALE_U2_AUTHORITY',
    });
    await expect(repository.current({ ...r, owner: 'EnterpriseAccess' })).rejects.toThrow();
  });
  it('후보/prefix/현재원본을 한 논리 개정으로 연결한다', async () => {
    const graph = await seedU2RecoveryGraph(store),
      r = graph.references.AccountSecurityState!;
    const committed = await repository.mutate(
      await request(),
      async () => {},
      async (tx) =>
        tx.put(
          r.entity,
          { ...graph.rows.AccountSecurityState!, revision: 2, securityGeneration: 2 },
          1,
        ),
    );
    expect(committed.replay).toBe(false);
    expect((await store.currentProtected(r.entity, r.id))?.securityGeneration).toBe(2);
    const primary = await sources.primaryApp.query(
      'SELECT commit_order FROM u1_protected_prefix WHERE epoch=$1',
      [await store.currentEpoch()],
    );
    const journal = await sources.journalAppend.query(
      'SELECT commit_order FROM u1_journal_prefix WHERE epoch=$1',
      [await store.currentEpoch()],
    );
    expect(primary[0].commit_order).toBe(journal[0].commit_order);
  });
  it('같은 key/content retry는 원래 효과 한 번만이다', async () => {
    const graph = await seedU2RecoveryGraph(store),
      r = graph.references.AccountSecurityState!,
      req = await request();
    let effects = 0;
    const operation = async (tx: import('@oms/persistence').ProtectedTransaction) => {
      effects++;
      await tx.put(
        r.entity,
        { ...graph.rows.AccountSecurityState!, revision: 2, securityGeneration: 2 },
        1,
      );
    };
    const first = await repository.mutate(req, async () => {}, operation),
      second = await repository.mutate(req, async () => {}, operation);
    expect(second.requestId).toBe(first.requestId);
    expect(second.replay).toBe(true);
    expect(effects).toBe(1);
    await expect(
      repository.mutate({ ...req, input: { change: 'other' } }, async () => {}, operation),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('원본에 primary-only 변화가 있으면 old allow를 fallback하지 않는다', async () => {
    const graph = await seedU2RecoveryGraph(store),
      r = graph.references.AccountSecurityState!;
    await sources.primaryAdmin
      .getRepository(r.entity)
      .update({ securityStateId: r.id }, { securityGeneration: 2 });
    await expect(repository.current(r)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
  });
  it('authority recheck 실패는 업무 효과/candidate를 남기지 않는다', async () => {
    const graph = await seedU2RecoveryGraph(store),
      r = graph.references.AccountSecurityState!;
    await expect(
      repository.mutate(
        await request(),
        async () => {
          throw new Error('현재 권위 거절');
        },
        async (tx) =>
          tx.put(
            r.entity,
            { ...graph.rows.AccountSecurityState!, revision: 2, securityGeneration: 2 },
            1,
          ),
      ),
    ).rejects.toThrow('현재 권위 거절');
    expect((await store.read(r.entity, r.id))?.revision).toBe(1);
  });
  it('SQL filter 추가 field는 허용하지 않고 결과는 등록된 원본에 한정한다', async () => {
    await seedU2RecoveryGraph(store);
    await expect(
      store.list('RecoveryHandoffGrant', { equals: { "state' OR 1=1 --": 'ISSUED' } }),
    ).rejects.toMatchObject({ code: 'FILTER_FIELD' });
    expect(await store.list('RecoveryHandoffGrant', { equals: { state: 'ISSUED' } })).toHaveLength(
      1,
    );
  });
});
