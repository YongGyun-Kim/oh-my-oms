import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import {
  ProtectedStore,
  U3_SOURCE_CONTRACT,
  decodeAppliedTerms,
  decodePayload,
  decodeU3Model,
  migrateU3Models,
  sealPayload,
  storedModelData,
} from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import { replayRows } from '../../../packages/persistence/src/recovery-replay.js';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { applicationGraph } from '../fixtures/applied-terms.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';

describe('적용 인라인 모델의 additive migration·보호 원상·owner 재연', () => {
  const sources = u3Sources();
  let store: ProtectedStore;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  const write = async (records: ModelData[]) =>
    store.execute(
      {
        principalId: 'synthetic-application-model',
        audience: 'SYSTEM',
        owner: 'OrderAcceptance',
        operation: 'fixture-application-model',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
        sourceContract: U3_SOURCE_CONTRACT,
      },
      async (tx) => {
        for (const record of records) await tx.put('OrderChangeApplication', record);
      },
    );
  it('nullable JSONB expand만 등록하고 과거 누락/null 기록과 보호 bytes를 반복 migration에서 보존한다', async () => {
    const f = await applicationGraph(store),
      old = { ...f.application };
    delete old.appliedTerms;
    const nullable = {
      ...old,
      orderChangeApplicationId: randomUUID(),
      actualApplicationResult: 'CONFIRMATION_REQUIRED',
      appliedTerms: null,
    };
    await write([old, nullable]);
    const bytes = await sources.journalAdmin.query(
      'SELECT payload_text,digest FROM u1_protected_entry ORDER BY commit_order',
    );
    expect(
      await sources.primaryAdmin.query(
        "SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='u1_order_change_application' AND column_name='appliedTerms'",
      ),
    ).toEqual([{ data_type: 'jsonb', is_nullable: 'YES' }]);
    const ddl = await sources.primaryAdmin.driver.createSchemaBuilder().log();
    expect(
      ddl.upQueries.some((statement) =>
        /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM)\b/i.test(statement.query),
      ),
    ).toBe(false);
    await migrateU3Models(sources.primaryAdmin);
    await migrateU3Models(sources.primaryAdmin);
    for (const record of [old, nullable]) {
      const visible = (await store.currentProtected(
        'OrderChangeApplication',
        String(record.orderChangeApplicationId),
      ))!;
      expect(decodeU3Model('OrderChangeApplication', 2, visible, store.schema)).toEqual(record);
      expect(() => decodeAppliedTerms(visible, store.schema)).toThrowError(
        expect.objectContaining({ code: 'APPLIED_TERMS_UNCONFIRMED' }),
      );
    }
    expect(
      await sources.journalAdmin.query(
        'SELECT payload_text,digest FROM u1_protected_entry ORDER BY commit_order',
      ),
    ).toEqual(bytes);
  });
  it('실제 주문/제안/동의 참조의 완전한 모델 값을 보호하고 원래 구매 원상과 immutable 권위를 보존한다', async () => {
    const f = await applicationGraph(store),
      snapshotBytes = canonicalJson(f.snapshot);
    const commit = await write([f.application]);
    const payload = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      commit.requestId,
      store.schema,
    );
    expect(payload.rows.find((row) => row.model === 'OrderChangeApplication')).toMatchObject({
      schemaVersion: 2,
      data: { appliedTerms: f.appliedTerms },
    });
    const visible = (await store.currentProtected(
      'OrderChangeApplication',
      String(f.application.orderChangeApplicationId),
    ))!;
    expect(decodeAppliedTerms(visible, store.schema)).toEqual(f.appliedTerms);
    const physical = (await sources.primaryAdmin
      .getRepository('OrderChangeApplication')
      .findOneBy({ orderChangeApplicationId: f.application.orderChangeApplicationId }))!;
    expect(storedModelData('OrderChangeApplication', physical)).toEqual(f.application);
    await expect(
      sources.primaryApp
        .getRepository('OrderChangeApplication')
        .update(
          { orderChangeApplicationId: f.application.orderChangeApplicationId },
          { appliedTerms: {} },
        ),
    ).rejects.toThrow();
    await expect(migrateU3Models(sources.primaryApp)).rejects.toMatchObject({
      code: 'DDL_AUTHORITY',
    });
    expect(
      canonicalJson(
        await store.currentProtected('PurchaseTermsSnapshot', String(f.snapshot.purchaseTermsId)),
      ),
    ).toBe(snapshotBytes);
    expect(await store.currentProtected('Order', f.receipt.targetRef!.id)).toEqual(f.original); // 모델 fixture는 실제 주문 적용 서비스가 아니다.
  });
  it('누락 역사와 새 적용 값의 혼합 원상을 owner가 재연하며 해시가 맞아도 wrapper/row/source downgrade는 거절한다', async () => {
    const f = await applicationGraph(store),
      old: ModelData = {
        ...f.application,
        orderChangeApplicationId: randomUUID(),
        actualApplicationResult: 'CONFIRMATION_REQUIRED',
      };
    delete old.appliedTerms;
    const commit = await write([old, f.application]),
      body = await assertProtectedCandidate(
        sources.primaryAdmin,
        sources.journalAdmin,
        commit.requestId,
        store.schema,
      );
    expect(body.rows.filter((row) => row.model === 'OrderChangeApplication')).toHaveLength(2);
    const bytes = await sources.journalAdmin.query(
      "SELECT payload_text,digest FROM u1_protected_entry WHERE payload_text::jsonb->>'requestId'=$1",
      [commit.requestId],
    );
    await sources.primaryAdmin.transaction(async (manager) => {
      await manager.query('SET LOCAL ROLE u1_owner');
      await manager.query('SET CONSTRAINTS ALL DEFERRED');
      await manager.query('DELETE FROM u1_order_change_application');
      await manager.query("DELETE FROM u1_entity_version WHERE model='OrderChangeApplication'");
      await manager.query('DELETE FROM u1_request_key WHERE request_id=$1', [commit.requestId]);
      await replayRows(manager, body);
    });
    const current = (await store.currentProtected(
      'OrderChangeApplication',
      String(f.application.orderChangeApplicationId),
    ))!;
    expect(decodeAppliedTerms(current, store.schema)).toEqual(f.appliedTerms);
    const historical = (await store.currentProtected(
      'OrderChangeApplication',
      String(old.orderChangeApplicationId),
    ))!;
    expect(historical).toEqual(old);
    expect(() => decodeAppliedTerms(historical, store.schema)).toThrow();
    for (const kind of ['wrapper', 'row', 'source']) {
      const { contentDigest, ...base } = body;
      void contentDigest;
      const changed = structuredClone(base);
      changed.commitOrder++;
      changed.requestId = randomUUID();
      changed.previousDigest = body.contentDigest;
      if (kind === 'wrapper') changed.schemaVersion = 1;
      if (kind === 'row')
        changed.rows.find((row) => row.model === 'OrderChangeApplication')!.schemaVersion = 1;
      if (kind === 'source') Reflect.set(changed.sourceContract!, 'registryVersion', 2);
      const bad = sealPayload(changed),
        { contentDigest: digest, ...unsigned } = bad;
      expect(() => decodePayload(canonicalJson(bad), store.schema)).toThrow();
      await expect(
        sources.journalAppend.query('SELECT u1_append_entry($1,$2,$3,$4,$5,$6)', [
          bad.epoch,
          bad.commitOrder,
          canonicalJson(bad),
          digest,
          bad.previousDigest,
          canonicalJson(unsigned),
        ]),
      ).rejects.toThrow();
    }
    expect(
      await sources.journalAdmin.query(
        "SELECT payload_text,digest FROM u1_protected_entry WHERE payload_text::jsonb->>'requestId'=$1",
        [commit.requestId],
      ),
    ).toEqual(bytes);
  });
});
