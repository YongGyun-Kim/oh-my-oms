import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator } from '@oms/contracts';
import { decodePayload, sealPayload } from '@oms/persistence';
import type { RecoveryRow } from '@oms/persistence';
import { replayRows } from '../../../packages/persistence/src/recovery-replay.js';
import { localSources } from '../fixtures/databases.js';
const source = localSources().primaryAdmin;
const runner = source.createQueryRunner();
const schema = new SchemaValidator();
const account = (id: string, revision = 1, active = true): RecoveryRow => ({
  model: 'Account',
  schemaVersion: 1,
  id,
  revision,
  deleted: false,
  data: {
    accountId: id,
    loginIdentifier: id + '@example.invalid',
    displayName: '합성 복구 자료',
    contactAddress: id + '@example.invalid',
    active,
    identityBasis: [],
    revision,
  },
});
function payload(rows: RecoveryRow[], sequence = 1) {
  return decodePayload(
    canonicalJson(
      sealPayload({
        schemaVersion: 1,
        epoch: 'synthetic-replay',
        commitOrder: sequence,
        requestId: randomUUID(),
        correlationId: '원래:복구.요청',
        previousDigest: null,
        rows,
      }),
    ),
    schema,
  );
}
beforeAll(async () => {
  await source.initialize();
  await runner.connect();
  for (const table of ['u1_account', 'u1_entity_version', 'u1_request_key'])
    await runner.query('CREATE TEMP TABLE ' + table + ' (LIKE public.' + table + ' INCLUDING ALL)');
  await runner.query('SET search_path TO pg_temp,public');
});
beforeEach(async () => {
  await runner.startTransaction();
});
afterEach(async () => {
  if (runner.isTransactionActive) await runner.rollbackTransaction();
});
afterAll(async () => {
  await runner.release();
  await source.destroy();
});
describe('실제PG TEMP 격리 복구bulk: 준비된100k public 원본은 변경하지 않음', () => {
  it('원래 after-image·ID·개정·epoch/순번을 함께 재생한다', async () => {
    const row = account(randomUUID());
    await replayRows(runner.manager, payload([row]));
    expect(
      (await runner.query('SELECT "accountId",revision,active FROM pg_temp.u1_account'))[0],
    ).toMatchObject({ accountId: row.id, revision: '1', active: true });
    expect(
      (
        await runner.query(
          'SELECT model,id,revision,epoch,commit_order,data FROM pg_temp.u1_entity_version',
        )
      )[0],
    ).toMatchObject({
      model: 'Account',
      id: row.id,
      revision: '1',
      epoch: 'synthetic-replay',
      commit_order: '1',
      data: row.data,
    });
  });
  it('같은 원본의 나중 전체이미지는 old active를 부활시키지 않는다', async () => {
    const id = randomUUID();
    await replayRows(runner.manager, payload([account(id)]));
    await replayRows(runner.manager, payload([account(id, 2, false)], 2));
    expect((await runner.query('SELECT revision,active FROM pg_temp.u1_account'))[0]).toEqual({
      revision: '2',
      active: false,
    });
    expect(await runner.query('SELECT * FROM pg_temp.u1_entity_version')).toHaveLength(2);
  });
  it('삭제 marker는 원본을 지우고 원래 after-image/이력은 남긴다', async () => {
    const row = account(randomUUID());
    await replayRows(runner.manager, payload([row]));
    await replayRows(runner.manager, payload([{ ...row, deleted: true }], 2));
    expect(await runner.query('SELECT * FROM pg_temp.u1_account')).toHaveLength(0);
    expect(
      (
        await runner.query('SELECT deleted FROM pg_temp.u1_entity_version ORDER BY commit_order')
      ).map((value: { deleted: boolean }) => value.deleted),
    ).toEqual([false, true]);
  });
  it('101개도100chunk와나머지를 모두 재생하며 앞부분만 읽지 않는다', async () => {
    const rows = Array.from({ length: 101 }, () => account(randomUUID()));
    await replayRows(runner.manager, payload(rows));
    expect(await runner.query('SELECT * FROM pg_temp.u1_account')).toHaveLength(101);
    expect(await runner.query('SELECT * FROM pg_temp.u1_entity_version')).toHaveLength(101);
  });
  it('잘못된/중복/unknown 자료는 decoder에서 차단한다', () => {
    const row = account(randomUUID());
    expect(() => payload([row, row])).toThrow();
    expect(() => payload([{ ...row, data: { ...row.data, unknown: true } }])).toThrow();
    expect(() => payload([{ ...row, id: 'wrong' }])).toThrow();
  });
  it('원래 접수key를 새key로 만들지 않고 그대로 복원한다', async () => {
    const id = 'a'.repeat(64);
    const requestId = randomUUID();
    const data = {
      scopedKey: id,
      requestId,
      inputFingerprint: 'b'.repeat(64),
      principalId: 'synthetic',
      audience: 'SYSTEM',
      owner: 'IdentityRecovery',
      operation: 'synthetic',
      target: null,
    };
    await replayRows(
      runner.manager,
      payload([{ model: 'RequestKey', schemaVersion: 1, id, revision: 1, data, deleted: false }]),
    );
    expect((await runner.query('SELECT * FROM pg_temp.u1_request_key'))[0]).toMatchObject({
      scoped_key: id,
      request_id: requestId,
      data,
    });
  });
  it('DB unique 실패는 transaction rollback 뒤 모든 부분이미지를 없앤다', async () => {
    const requestId = randomUUID();
    const key = (id: string): RecoveryRow => ({
      model: 'RequestKey',
      schemaVersion: 1,
      id,
      revision: 1,
      deleted: false,
      data: {
        scopedKey: id,
        requestId,
        inputFingerprint: 'b'.repeat(64),
        principalId: 'synthetic',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'synthetic',
        target: null,
      },
    });
    await expect(
      replayRows(
        runner.manager,
        payload([account(randomUUID()), key('c'.repeat(64)), key('d'.repeat(64))]),
      ),
    ).rejects.toThrow();
    await runner.rollbackTransaction();
    expect(await runner.query('SELECT * FROM pg_temp.u1_account')).toHaveLength(0);
    expect(await runner.query('SELECT * FROM pg_temp.u1_entity_version')).toHaveLength(0);
  });
});
