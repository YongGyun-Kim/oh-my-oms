import { preservationManifest } from '../fixtures/recovery-preservation.js';
import { journalEntries } from '../fixtures/journal-entries.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProtectedStore, restoreFromJournal } from '@oms/persistence';
import type { WriteRequest, FaultBoundary } from '@oms/persistence';
import { initializeDatabases } from '../fixtures/migrate.js';
import { localSources } from '../fixtures/databases.js';
import { resetSyntheticDatabases } from '../fixtures/reset.js';
const sources = localSources();
let store: ProtectedStore;
const request = (key = 'key'): WriteRequest => ({
  principalId: 'person',
  audience: 'CUSTOMER',
  owner: 'IdentityRecovery',
  operation: 'registerAccount',
  target: null,
  idempotencyKey: key,
  input: { name: key },
  correlationId: 'correlation',
  epoch: 'initial',
});
const account = (id = 'person', revision = 1, active = true) => ({
  accountId: id,
  loginIdentifier: id + '@example.invalid',
  displayName: '합성 ' + id,
  contactAddress: id + '@example.invalid',
  active,
  identityBasis: [],
  revision,
});
async function create(key = 'key', id = 'person') {
  return store.execute(request(key), (transaction) => transaction.put('Account', account(id)));
}
beforeAll(async () => {
  await initializeDatabases();
  for (const source of Object.values(sources)) await source.initialize();
});
beforeEach(async () => {
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
});
afterAll(async () => {
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
});
describe('별도 PostgreSQL 보호·접수·복구', () => {
  it('보존 manifest는 삭제·현재보호·미보호최신·페이지경계를 전수 대조한다', async () => {
    for (let i = 0; i < 30; i++) await create('key-' + i, 'person-' + String(i).padStart(2, '0'));
    const before = await preservationManifest(sources.primaryAdmin);
    expect(before.models.Account?.rows).toBe(30);
    expect(before.tombstones.rows).toBe(0);
    await store.execute(request('delete-first'), (transaction) =>
      transaction.remove('Account', 'person-00', 1),
    );
    await store.execute(request('delete-last'), (transaction) =>
      transaction.remove('Account', 'person-29', 1),
    );
    const deleted = await preservationManifest(sources.primaryAdmin);
    expect(deleted.models.Account?.rows).toBe(28);
    expect(deleted.tombstones.rows).toBe(2);
    expect(deleted.tombstones.digest).not.toBe(before.tombstones.digest);
    const unprotected = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'PRIMARY_COMMITTED') throw new Error('protection pending');
      },
    );
    await expect(
      unprotected.execute(request('unprotected-delete'), (transaction) =>
        transaction.remove('Account', 'person-01', 1),
      ),
    ).rejects.toThrow('protection pending');
    expect((await preservationManifest(sources.primaryAdmin)).tombstones).toEqual(
      deleted.tombstones,
    );
    await store.protectPending('initial', 25);
    expect((await preservationManifest(sources.primaryAdmin)).tombstones.rows).toBe(3);
  });
  it('동일 transaction 원본/키/after-image와 독립 durable prefix 이후에만 공개한다', async () => {
    const result = await create();
    expect(result.replay).toBe(false);
    expect(await store.read('Account', 'person')).toEqual(account());
    const payloads = await journalEntries(store, 'initial');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.requestId).toBe(result.requestId);
    expect(payloads[0]!.rows.map((row) => row.model)).toEqual(['Account', 'RequestKey']);
    expect(await sources.journalAppend.query('SELECT commit_order FROM u1_journal_prefix')).toEqual(
      [{ commit_order: '1' }],
    );
  });
  it('업무 transaction 실패는 키/원장/원본을 남기지 않는다', async () => {
    await expect(
      store.execute(request(), async (transaction) => {
        await transaction.put('Account', account());
        throw new Error('synthetic failure');
      }),
    ).rejects.toThrow('synthetic failure');
    expect(await sources.primaryAdmin.query('SELECT * FROM u1_account')).toHaveLength(0);
    expect(await journalEntries(store, 'initial')).toHaveLength(0);
    expect(await sources.primaryAdmin.query('SELECT * FROM u1_request_key')).toHaveLength(0);
  });
  for (const boundary of [
    'PRIMARY_COMMITTED',
    'JOURNAL_PROTECTED',
    'VISIBILITY_UPDATED',
  ] as FaultBoundary[]) {
    it(boundary + ' 강제 실패 후 동일 원래 key 대조는 재실행/중복 없이 보존한다', async () => {
      let calls = 0;
      const faultStore = new ProtectedStore(
        sources.primaryApp,
        sources.journalAppend,
        async (reached) => {
          if (reached === boundary) throw new Error('forced termination');
        },
      );
      await expect(
        faultStore.execute(request(), async (transaction) => {
          calls++;
          await transaction.put('Account', account());
        }),
      ).rejects.toThrow();
      if (boundary !== 'VISIBILITY_UPDATED')
        expect(await store.read('Account', 'person')).toBeNull();
      const recovered = await store.execute(request(), async () => {
        calls++;
        throw new Error('must not replay handler');
      });
      expect(calls).toBe(1);
      expect(recovered.replay).toBe(true);
      expect(await store.read('Account', 'person')).toEqual(account());
      expect(await journalEntries(store, 'initial')).toHaveLength(1);
    });
  }
  it('동일 principal/audience/owner/operation/target/key의 내용 변경은 전체 거절한다', async () => {
    await create();
    await expect(
      store.execute({ ...request(), input: { changed: true } }, async () => {}),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await journalEntries(store, 'initial')).toHaveLength(1);
  });
  it('동시 같은 key는 원본 하나와 동일 request ID만 만든다', async () => {
    const results = await Promise.all([create(), create(), create()]);
    expect(new Set(results.map((result) => result.requestId)).size).toBe(1);
    expect(results.filter((result) => !result.replay)).toHaveLength(1);
  });
  it('앞 공백은 뒤 ACK/공개를 막고 순서대로 대조하면 전진한다', async () => {
    const failed = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'PRIMARY_COMMITTED') throw new Error('gap');
      },
    );
    await expect(
      failed.execute(request('first'), (transaction) =>
        transaction.put('Account', account('first')),
      ),
    ).rejects.toThrow();
    await expect(create('second', 'second')).rejects.toMatchObject({ code: 'PROTECTION_GAP' });
    expect(await store.list('Account')).toEqual([]);
    expect(await store.protectPending('initial')).toBe(2);
    expect(await store.list('Account')).toHaveLength(2);
    await expect(store.protectPending('initial', 101)).rejects.toThrow();
  });
  it('미보호 최신 원본은 공개하지 않고 현재 권한은 이전 버전으로 폴백하지 않는다', async () => {
    await create();
    const failed = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'PRIMARY_COMMITTED') throw new Error('journal unavailable');
      },
    );
    await expect(
      failed.execute(request('revoke'), (transaction) =>
        transaction.put('Account', account('person', 2, false), 1),
      ),
    ).rejects.toThrow();
    expect((await store.read('Account', 'person'))?.active).toBe(true);
    await expect(store.currentProtected('Account', 'person')).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    await store.protectPending('initial');
    expect((await store.currentProtected('Account', 'person'))?.active).toBe(false);
  });
  it('정상 app은 원장 수정/삭제/DDL/epoch/후보 수정 및 writer 재개를 할 수 없다', async () => {
    await create();
    for (const sql of [
      'DELETE FROM u1_protected_entry',
      'UPDATE u1_journal_prefix SET commit_order=99',
      "INSERT INTO u1_journal_epoch VALUES('forged',2)",
      'TRUNCATE u1_protected_entry',
    ])
      await expect(sources.journalAppend.query(sql)).rejects.toMatchObject({
        driverError: { code: '42501' },
      });
    for (const sql of [
      'UPDATE u1_recovery_control SET enabled=true',
      'DELETE FROM u1_recovery_candidate',
      "UPDATE u1_request_key SET data='{}'",
      'TRUNCATE u1_entity_version',
    ])
      await expect(sources.primaryApp.query(sql)).rejects.toMatchObject({
        driverError: { code: '42501' },
      });
    await expect(
      sources.journalAppend.query("SELECT u1_append_entry('initial',2,'{}','bad',NULL,'{}')"),
    ).rejects.toThrow();
  });
  it('잘못된 expectedRevision·중복 revision·빈 변경은 보호하지 않는다', async () => {
    await create();
    await expect(
      store.execute(request('stale'), (transaction) =>
        transaction.put('Account', account('person', 2), 3),
      ),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    await expect(
      store.execute(request('same'), (transaction) => transaction.put('Account', account(), 1)),
    ).rejects.toMatchObject({ code: 'REVISION_SEQUENCE' });
    await expect(store.execute(request('empty'), async () => {})).rejects.toMatchObject({
      code: 'EMPTY_COMMIT',
    });
    expect(await journalEntries(store, 'initial')).toHaveLength(1);
  });
  it('논리 손상 뒤 나중 ACK/회수/삭제를 full after-image로 복원하고 old writer를 막는다', async () => {
    const first = await create();
    const second = await store.execute(request('later'), (transaction) =>
      transaction.put('Account', account('later')),
    );
    const revoked = await store.execute(request('revoke'), (transaction) =>
      transaction.put('Account', account('person', 2, false), 1),
    );
    await store.execute(request('delete'), (transaction) =>
      transaction.remove('Account', 'later', 1),
    );
    await sources.primaryAdmin.query(
      'DELETE FROM u1_account; DELETE FROM u1_recovery_candidate; DELETE FROM u1_entity_version; DELETE FROM u1_request_key',
    );
    const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(report.requestIdSample.length).toBeLessThanOrEqual(64);
    expect(report.requestManifestDigest).toMatch(/^[a-f0-9]{64}$/);
    for (const requestId of [first.requestId, second.requestId, revoked.requestId])
      expect(
        await sources.primaryAdmin.query(
          'SELECT request_id FROM u1_request_key WHERE request_id=$1',
          [requestId],
        ),
      ).toEqual([{ request_id: requestId }]);
    expect((await store.read('Account', 'person'))?.active).toBe(false);
    expect(await store.read('Account', 'later')).toBeNull();
    await expect(create('old', 'old')).rejects.toMatchObject({ code: 'WRITER_FENCED' });
    const replay = await store.execute({ ...request(), epoch: report.epoch }, async () => {
      throw new Error('no handler replay');
    });
    expect(replay.requestId).toBe(first.requestId);
    await store.execute({ ...request('new'), epoch: report.epoch }, (transaction) =>
      transaction.put('Account', account('new')),
    );
    expect(await store.read('Account', 'new')).toEqual(account('new'));
  });
  it('독립 원장 내용 손상은 복구 실패와 쓰기 fence를 유지한다', async () => {
    await create();
    await sources.journalAdmin.query(
      "UPDATE u1_protected_entry SET payload_text=replace(payload_text,'합성','훼손')",
    );
    await expect(
      restoreFromJournal(sources.primaryAdmin, sources.journalAdmin),
    ).rejects.toMatchObject({ code: 'RECOVERY_DIGEST' });
    await expect(store.currentEpoch()).rejects.toMatchObject({ code: 'WRITER_FENCED' });
  });
  it('payload 재생 중 중단은 부분원본을 공개/ACK하지 않고 같은 고정원장으로 재시작한다', async () => {
    const original = await create('first', 'first');
    const later = await create('later', 'later');
    let handlers = 0;
    let replayed = 0;
    await expect(
      restoreFromJournal(sources.primaryAdmin, sources.journalAdmin, async (event) => {
        if (event.phase === 'REPLAYED' && ++replayed === 1)
          throw new Error('synthetic process interruption');
      }),
    ).rejects.toThrow('synthetic process interruption');
    expect(
      await sources.primaryAdmin.query('SELECT enabled,auth_ready FROM u1_recovery_control'),
    ).toEqual([{ enabled: false, auth_ready: false }]);
    for (const read of [
      () => store.read('Account', 'first'),
      () => store.list('Account'),
      () => store.currentProtected('Account', 'first'),
    ])
      await expect(read()).rejects.toThrow();
    await expect(
      store.execute(request('no-ack'), async () => {
        handlers++;
      }),
    ).rejects.toMatchObject({ code: 'WRITER_FENCED' });
    expect(handlers).toBe(0);
    const restored = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(
      await sources.primaryAdmin.query('SELECT request_id FROM u1_request_key ORDER BY request_id'),
    ).toEqual([original.requestId, later.requestId].sort().map((request_id) => ({ request_id })));
    expect(await store.read('Account', 'first')).toEqual(account('first'));
    expect(await store.read('Account', 'later')).toEqual(account('later'));
    await expect(store.currentProtected('Account', 'first')).rejects.toMatchObject({
      code: 'RECOVERY_SECURITY_UNCONFIRMED',
    });
    const same = await store.execute({ ...request('first'), epoch: restored.epoch }, async () => {
      handlers++;
      throw new Error('must not replay external/business handler');
    });
    expect(same.requestId).toBe(original.requestId);
    expect(handlers).toBe(0);
  });
  it('전수검증 중 중단은 기존원본/원장을 유지하지만 인증/조회/새ACK은 fence한다', async () => {
    const original = await create();
    await expect(
      restoreFromJournal(sources.primaryAdmin, sources.journalAdmin, async (event) => {
        if (event.phase === 'VERIFIED') throw new Error('synthetic validation interruption');
      }),
    ).rejects.toThrow('synthetic validation interruption');
    expect(await sources.primaryAdmin.query('SELECT "accountId" FROM u1_account')).toEqual([
      { accountId: 'person' },
    ]);
    expect(await sources.journalAdmin.query('SELECT commit_order FROM u1_journal_prefix')).toEqual([
      { commit_order: '1' },
    ]);
    await expect(store.read('Account', 'person')).rejects.toThrow();
    await expect(store.currentProtected('Account', 'person')).rejects.toThrow();
    const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(report.requestIdSample).toContain(original.requestId);
    expect((await store.read('Account', 'person'))?.accountId).toBe('person');
  });
});
