import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProtectedStore, decodePayload } from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import { localSources } from '../fixtures/databases.js';

const sources = localSources();
const ids: string[] = [];
let store: ProtectedStore;
let template: ModelData;
let epoch = 'initial';
const make = (): ModelData => {
  const id = 'u1-bulk-' + randomUUID();
  ids.push(id);
  return {
    ...template,
    accountId: id,
    loginIdentifier: id + '@example.invalid',
    contactAddress: id + '@example.invalid',
    revision: 1,
  };
};
const request = (key = randomUUID()) => ({
  principalId: 'synthetic-bulk-verification',
  audience: 'SYSTEM' as const,
  owner: 'IdentityRecovery',
  operation: 'synthetic-bulk-verification',
  target: null,
  idempotencyKey: key,
  input: { key },
  correlationId: key,
  epoch,
});
beforeAll(async () => {
  await sources.primaryApp.initialize();
  await sources.journalAppend.initialize();
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  epoch = await store.currentEpoch();
  template = (await store.read('Account', 'nfr-customer-0')) ?? {
    accountId: 'unused',
    loginIdentifier: 'unused@example.invalid',
    displayName: '명시적 합성 bulk 자료',
    contactAddress: 'unused@example.invalid',
    active: true,
    identityBasis: [
      {
        owner: 'OperationalAssurance',
        entity: 'OperationalEvidence',
        id: 'synthetic-bulk-basis',
        revision: 1,
      },
    ],
    revision: 1,
  };
});
afterAll(async () => {
  for (const id of ids)
    if (await store.read('Account', id))
      await store.execute(request(), async (transaction) => transaction.remove('Account', id, 1));
  await sources.primaryApp.destroy();
  await sources.journalAppend.destroy();
});
describe('같은 PG transaction의 새 원본 bulk·완전 after-image·원래 키 재개', () => {
  it('두 행의 실제 보호 원본과 원장 after-image를 모두 유지한다', async () => {
    const records = [make(), make()];
    const result = await store.execute(request(), async (transaction) =>
      transaction.putNewBatch('Account', records),
    );
    for (const row of records)
      expect(await store.read('Account', String(row.accountId))).toEqual(row);
    const journal = await sources.journalAppend.query(
      'SELECT payload_text FROM u1_protected_entry WHERE epoch=$1 AND commit_order=$2',
      [epoch, result.commitOrder],
    );
    const payload = decodePayload(journal[0].payload_text, store.schema);
    expect(payload.rows.filter((row) => row.model === 'Account').map((row) => row.id)).toEqual(
      records.map((row) => row.accountId),
    );
    expect(payload.rows.some((row) => row.model === 'RequestKey')).toBe(true);
  });
  it('같은 배치의 중복 ID는 전체 transaction을 거절한다', async () => {
    const row = make();
    await expect(
      store.execute(request(), async (transaction) =>
        transaction.putNewBatch('Account', [row, row]),
      ),
    ).rejects.toMatchObject({ code: 'NEW_BATCH_CONFLICT' });
    expect(await store.read('Account', String(row.accountId))).toBeNull();
  });
  it('기존 ID는 덮어쓰지 않고 unique 위반을 남긴다', async () => {
    const row = make();
    await store.execute(request(), async (transaction) =>
      transaction.putNewBatch('Account', [row]),
    );
    await expect(
      store.execute(request(), async (transaction) =>
        transaction.putNewBatch('Account', [{ ...row, displayName: '덮어쓰기 시도' }]),
      ),
    ).rejects.toThrow();
    expect((await store.read('Account', String(row.accountId)))?.displayName).toBe(row.displayName);
  });
  it('새 원본의 revision2와 unknown 필드는 저장 전 거절한다', async () => {
    await expect(
      store.execute(request(), async (transaction) =>
        transaction.putNewBatch('Account', [{ ...make(), revision: 2 }]),
      ),
    ).rejects.toMatchObject({ code: 'NEW_BATCH_CONFLICT' });
    await expect(
      store.execute(request(), async (transaction) =>
        transaction.putNewBatch('Account', [{ ...make(), unknown: true }]),
      ),
    ).rejects.toMatchObject({ code: 'UNKNOWN_MODEL_FIELD' });
  });
  it('유한100행 상한/빈 배치를 조용히 잘라 성공하지 않는다', async () => {
    for (const records of [[], Array.from({ length: 101 }, make)])
      await expect(
        store.execute(request(), async (transaction) =>
          transaction.putNewBatch('Account', records),
        ),
      ).rejects.toMatchObject({ code: 'BATCH_LIMIT' });
  });
  it('deferred FK 없는 참조는 COMMIT에서 전체 거절하고 보호 원장이 생기지 않는다', async () => {
    const bindingId = 'u1-bulk-binding-' + randomUUID();
    const command = request();
    await expect(
      store.execute(command, async (transaction) =>
        transaction.putNewBatch('ProviderBinding', [
          {
            bindingId,
            accountRef: {
              owner: 'IdentityRecovery',
              entity: 'Account',
              id: 'absent-bulk-account',
              revision: 1,
            },
            audience: 'CUSTOMER',
            issuer: 'urn:synthetic:identity:CUSTOMER',
            subject: bindingId,
            generation: 1,
            authRevision: 1,
            active: true,
            removalState: 'CLEAR',
            revision: 1,
          },
        ]),
      ),
    ).rejects.toThrow();
    expect(await store.read('ProviderBinding', bindingId)).toBeNull();
  });
  it('primary COMMIT 뒤 중단도 같은 키의 원래 request/ID로 보호하고 handler를 재실행하지 않는다', async () => {
    const row = make();
    const command = request();
    let once = true;
    const interrupted = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (point) => {
        if (point === 'PRIMARY_COMMITTED' && once) {
          once = false;
          throw new Error('합성 중단');
        }
      },
    );
    await expect(
      interrupted.execute(command, async (transaction) =>
        transaction.putNewBatch('Account', [row]),
      ),
    ).rejects.toThrow('합성 중단');
    expect(await store.read('Account', String(row.accountId))).toBeNull();
    const recovered = await store.execute(command, async () => {
      throw new Error('원래 handler 재실행 금지');
    });
    expect(recovered.replay).toBe(true);
    expect((await store.read('Account', String(row.accountId)))?.accountId).toBe(row.accountId);
    const again = await store.execute(command, async () => {
      throw new Error('중복 handler');
    });
    expect(again.requestId).toBe(recovered.requestId);
  });
});
