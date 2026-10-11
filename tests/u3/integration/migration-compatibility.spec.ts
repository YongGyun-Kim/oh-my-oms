import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator } from '@oms/contracts';
import {
  ALL_MODELS,
  MODELS,
  U3_MODELS,
  U3_SUPPORT_MODELS,
  ProtectedStore,
  createDataSource,
  materialSchemas,
  migrateU3Models,
  migrateRecovery,
  physicalData,
  decodePayload,
  recordedSourceContract,
  storedModelData,
} from '@oms/persistence';
import type { ModelData, WriteRequest } from '@oms/persistence';
import { replayRows } from '../../../packages/persistence/src/recovery-replay.js';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { modernProduct, legacyProduct, legacyOffer, sourceContract } from '../fixtures/models.js';

const schema = new SchemaValidator();
const request = (key = randomUUID(), current = true): WriteRequest => ({
  principalId: 'synthetic-actor',
  audience: 'SYSTEM',
  owner: 'ProductCatalog',
  operation: 'synthetic-model-write',
  target: null,
  idempotencyKey: key,
  input: { synthetic: true },
  correlationId: randomUUID(),
  epoch: 'initial',
  ...(current ? { sourceContract } : {}),
});
describe('U3 명시 expand migration·과거 원상·최소 역할', () => {
  const sources = u3Sources();
  let store: ProtectedStore;
  beforeAll(async () => {
    // A fresh approved namespace starts with the actual U1 EntitySchema projection.
    // On a re-run we retain the expanded schema and test existing v1 rows below.
    await sources.primaryAdmin.initialize();
    const exists = await sources.primaryAdmin.query(
      "SELECT to_regclass('public.u1_product') AS name",
    );
    if (!exists[0].name) {
      await sources.primaryAdmin.query('GRANT USAGE,CREATE ON SCHEMA public TO u1_owner');
      const legacy = createDataSource(
        {
          url:
            sources.primaryAdmin.options.type === 'postgres'
              ? sources.primaryAdmin.options.url!
              : '',
          applicationName: 'u3-legacy-synthetic-ddl',
          localSynthetic: true,
          role: 'administrative',
        },
        materialSchemas(MODELS),
      );
      await legacy.initialize();
      try {
        const ddl = await legacy.driver.createSchemaBuilder().log();
        await legacy.transaction(async (manager) => {
          await manager.query('SET LOCAL ROLE u1_owner');
          for (const statement of ddl.upQueries)
            await manager.query(statement.query, statement.parameters);
          const product = legacyProduct('pre-expand');
          await manager.getRepository('Product').insert(physicalData('Product', product));
          await manager
            .getRepository('CommonOfferRevision')
            .insert(physicalData('CommonOfferRevision', legacyOffer(product)));
        });
      } finally {
        await legacy.destroy();
      }
    }
    await sources.primaryAdmin.destroy();
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
    const pre = await sources.primaryAdmin
      .getRepository('Product')
      .findOneBy({ productId: 'pre-expand' });
    if (pre) {
      expect(storedModelData('Product', pre)).toEqual(legacyProduct('pre-expand'));
      expect(pre.modelVersion).toBeNull();
      const offer = await sources.primaryAdmin
        .getRepository('CommonOfferRevision')
        .findOneBy({ offerRevisionId: 'pre-expand-offer' });
      expect(storedModelData('CommonOfferRevision', offer!)).toEqual(
        legacyOffer(legacyProduct('pre-expand')),
      );
    }
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  });
  beforeEach(async () => resetU3Databases(sources.primaryAdmin, sources.journalAdmin));
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });

  it('등록된18개 논리 모델의 모든 table·단일 이름·model marker를 실제 PG에 만든다', async () => {
    expect(MODELS).toHaveLength(43);
    expect(U3_MODELS).toHaveLength(18);
    expect(new Set(ALL_MODELS.map((model) => model.name)).size).toBe(ALL_MODELS.length);
    const columns = await sources.primaryAdmin.query(
      "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='modelVersion'",
    );
    expect(columns).toHaveLength(U3_MODELS.length + U3_SUPPORT_MODELS.length);
    expect(U3_SUPPORT_MODELS.map((model) => model.name)).toEqual([
      'StaffRole',
      'RoleRevisionState',
    ]);
    expect((await sources.primaryAdmin.query('SELECT current_database() AS name'))[0].name).toBe(
      'oms_u3_verification',
    );
    expect((await sources.journalAdmin.query('SELECT current_database() AS name'))[0].name).toBe(
      'oms_u3_journal_verification',
    );
  });
  it('명시 migration 재실행은 구형 보호 원상 bytes/hash와 새 current 원본을 보존한다', async () => {
    const old = legacyProduct();
    await store.execute(request(randomUUID(), false), async (tx) => {
      await tx.put('Product', old);
      await tx.put('CommonOfferRevision', legacyOffer(old));
    });
    await store.execute(request(), async (tx) => tx.put('Product', modernProduct()));
    const before = await sources.journalAdmin.query(
      'SELECT payload_text,digest FROM u1_protected_entry ORDER BY commit_order',
    );
    await migrateU3Models(sources.primaryAdmin);
    await migrateRecovery(sources.primaryAdmin, sources.journalAdmin);
    expect(
      await sources.journalAdmin.query(
        'SELECT payload_text,digest FROM u1_protected_entry ORDER BY commit_order',
      ),
    ).toEqual(before);
    expect(await store.currentProtected('Product', 'legacy-product')).toEqual(old);
    expect(await store.currentProtected('Product', 'modern-product')).toEqual(modernProduct());
    expect(
      (await store.currentProtected('CommonOfferRevision', 'legacy-product-offer'))?.commonPrice,
    ).toEqual({ currency: 'KRW', value: '1000.5' });
  });
  it('app/append는 DDL owner 승격·migration·원상 갱신·vault 원문을 허용받지 않는다', async () => {
    await expect(migrateU3Models(sources.primaryApp)).rejects.toMatchObject({
      code: 'DDL_AUTHORITY',
    });
    await expect(sources.primaryApp.query('SET ROLE u1_owner')).rejects.toThrow();
    await expect(sources.primaryApp.query('CREATE TABLE u3_forbidden(id int)')).rejects.toThrow();
    await expect(
      sources.journalAppend.query('UPDATE u1_protected_entry SET digest=digest'),
    ).rejects.toThrow();
    await expect(sources.journalAppend.query('SELECT * FROM u2_vault.material')).rejects.toThrow();
  });
  it('신규 U3 쓰기의 누락/위조 profile·registry/model downgrade는 commit 전 실패다', async () => {
    for (const source of [
      undefined,
      { ...sourceContract, registryVersion: 2 },
      { ...sourceContract, profile: 'urn:oms:contract:common:2' },
      { ...sourceContract, extra: true },
    ]) {
      let calls = 0;
      await expect(
        store.execute(
          { ...request(), sourceContract: source as WriteRequest['sourceContract'] },
          async (tx) => {
            calls++;
            await tx.put('Product', modernProduct());
          },
        ),
      ).rejects.toThrow();
      if (source !== undefined) expect(calls).toBe(0);
    }
    await expect(
      store.execute(request(), async (tx) => tx.put('Product', legacyProduct())),
    ).rejects.toMatchObject({ code: 'WRITE_MODEL_VERSION' });
    expect(await store.list('Product')).toHaveLength(0);
    expect(
      (await sources.primaryAdmin.query('SELECT count(*)::int AS n FROM u1_recovery_candidate'))[0]
        .n,
    ).toBe(0);
  });
  it('old→new 같은 ID 개정을 자동 변환하지 않고 구형 원본/보호 결과를 유지한다', async () => {
    const old = legacyProduct('existing');
    await store.execute(request(randomUUID(), false), async (tx) => {
      await tx.put('Product', old);
      await tx.put('CommonOfferRevision', legacyOffer(old));
    });
    await expect(
      store.execute(request(), async (tx) =>
        tx.put('Product', { ...modernProduct('existing'), revision: 2 }, 1),
      ),
    ).rejects.toMatchObject({ code: 'MODEL_UPGRADE_REQUIRED' });
    expect(await store.currentProtected('Product', 'existing')).toEqual(old);
    expect(
      (await sources.primaryAdmin.getRepository('Product').findOneBy({ productId: 'existing' }))
        ?.modelVersion,
    ).toBeNull();
  });
  it('native version CHECK/FK가 잘못된 raw marker·누락 current·없는 부모를 거절한다', async () => {
    await expect(
      sources.primaryApp.getRepository('Product').insert({ ...modernProduct(), modelVersion: 1 }),
    ).rejects.toThrow();
    const incomplete = { ...modernProduct() };
    delete incomplete.saleState;
    await expect(sources.primaryApp.getRepository('Product').insert(incomplete)).rejects.toThrow();
    await expect(
      sources.primaryApp.getRepository('EnterpriseContract').insert({
        modelVersion: 2,
        contractId: 'missing-parent',
        enterpriseRef: {
          owner: 'EnterpriseAccess',
          entity: 'Enterprise',
          id: 'absent',
          revision: 1,
        },
        enterpriseRefKey: 'absent',
        currentApprovedRevisionRef: null,
        currentApprovedRevisionRefKey: null,
        contractEvidenceRefs: [],
        revision: 1,
      }),
    ).rejects.toThrow();
  });
  it('과거 Receipt의 실제 version 미상과 원래 성공 결과를 migration 후 그대로 읽는다', async () => {
    const old: ModelData = {
      requestId: 'old-receipt',
      principalId: 'actor',
      audience: 'SYSTEM',
      operation: 'legacy-op',
      targetIdentity: { kind: 'NONE' },
      requestFingerprint: 'a'.repeat(64),
      idempotencyKey: 'legacy-key',
      owner: 'ProductCatalog',
      targetScope: null,
      requestState: 'RESULT_RECORDED',
      resultRefs: [],
      acceptedAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
      revision: 1,
      correlationId: 'legacy-correlation',
    };
    await store.execute(request(randomUUID(), false), async (tx) => tx.put('RequestReceipt', old));
    await migrateU3Models(sources.primaryAdmin);
    const visible = (await store.currentProtected('RequestReceipt', 'old-receipt'))!;
    expect(visible).toEqual(old);
    expect(recordedSourceContract(visible, schema)).toEqual({ knowledge: 'UNKNOWN' });
    expect(visible.requestState).toBe('RESULT_RECORDED');
  });
  it('기존 U1/U2 model1과 U3 model2의 혼합 보호 원상을 같은 명시 owner 재연으로 대조한다', async () => {
    const account = {
      accountId: 'mixed-account',
      loginIdentifier: 'mixed-login',
      displayName: '합성',
      contactAddress: 'mixed@example.invalid',
      active: true,
      identityBasis: [],
      revision: 1,
    };
    const u2 = {
      securityStateId: 'mixed-state',
      accountRef: {
        owner: 'IdentityRecovery',
        entity: 'Account',
        id: 'mixed-account',
        revision: 1,
      },
      securityGeneration: 1,
      epoch: 'initial',
      revision: 1,
    };
    await store.execute(request(), async (tx) => {
      await tx.put('Account', account);
      await tx.put('AccountSecurityState', u2);
      await tx.put('Product', modernProduct());
    });
    const row = (
      await sources.journalAdmin.query(
        'SELECT payload_text FROM u1_protected_entry WHERE commit_order=1',
      )
    )[0];
    const body = decodePayload(row.payload_text, schema);
    expect(body.schemaVersion).toBe(2);
    expect(body.sourceContract).toEqual(sourceContract);
    expect(body.rows.map((image) => image.schemaVersion)).toEqual([1, 1, 2, 1]);
    await sources.primaryAdmin.transaction(async (manager) => {
      await manager.query('SET CONSTRAINTS ALL DEFERRED');
      await manager.query('DELETE FROM u1_request_key; DELETE FROM u1_entity_version');
      await replayRows(manager, body);
    });
    expect(await store.currentProtected('Product', 'modern-product')).toEqual(modernProduct());
    expect(await store.currentProtected('Account', 'mixed-account')).toEqual(account);
    expect(await store.currentProtected('AccountSecurityState', 'mixed-state')).toEqual(u2);
    expect(
      (
        await sources.journalAdmin.query(
          'SELECT payload_text FROM u1_protected_entry WHERE commit_order=1',
        )
      )[0].payload_text,
    ).toBe(row.payload_text);
  });
  it('일반 app는 불변 판매 개정/이력을 갱신하지 못하고 owner 재연 권위와 구분한다', async () => {
    const old = legacyProduct();
    await store.execute(request(randomUUID(), false), async (tx) => {
      await tx.put('Product', old);
      await tx.put('CommonOfferRevision', legacyOffer(old));
    });
    await expect(
      sources.primaryApp
        .getRepository('CommonOfferRevision')
        .update(
          { offerRevisionId: 'legacy-product-offer' },
          { commonPrice: { currency: 'KRW', value: '0' } },
        ),
    ).rejects.toThrow();
    expect(
      (await store.currentProtected('CommonOfferRevision', 'legacy-product-offer'))?.commonPrice,
    ).toEqual({ currency: 'KRW', value: '1000.5' });
  });
  it('보호 DB append도 잘못된 wrapper/row downgrade를 hash가 맞아도 거절한다', async () => {
    await store.execute(request(), async (tx) => tx.put('Product', modernProduct()));
    const row = (
      await sources.journalAdmin.query(
        'SELECT payload_text FROM u1_protected_entry WHERE commit_order=1',
      )
    )[0];
    const body = decodePayload(row.payload_text, schema);
    for (const kind of ['wrong-wrapper', 'wrong-profile', 'wrong-model']) {
      const { contentDigest, ...base } = body;
      void contentDigest;
      const changed = structuredClone(base);
      changed.commitOrder = 2;
      changed.requestId = randomUUID();
      changed.previousDigest = body.contentDigest;
      if (kind === 'wrong-wrapper') changed.schemaVersion = 1;
      if (kind === 'wrong-profile')
        changed.sourceContract = {
          ...sourceContract,
          registryVersion: 2,
        } as unknown as typeof sourceContract;
      if (kind === 'wrong-model')
        changed.rows.find((image) => image.model === 'Product')!.data.modelVersion = 1;
      const { sealPayload } = await import('@oms/persistence');
      const bad = sealPayload(changed),
        { contentDigest: digest, ...unsigned } = bad;
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
      (await sources.journalAdmin.query('SELECT count(*)::int AS n FROM u1_protected_entry'))[0].n,
    ).toBe(1);
  });
});
