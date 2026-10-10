import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MODELS,
  U2_MODELS,
  migrateU2Models,
  modelDefinition,
  decodeU2Model,
  physicalData,
  ProtectedStore,
  backfillU2SecurityState,
  u2SecurityStateId,
  u2CodeSecurityStateId,
} from '@oms/persistence';
import { SchemaValidator } from '@oms/contracts';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedSyntheticAccount, seedClaimedRecovery } from '../fixtures/identity.js';
import type { DataSource } from 'typeorm';

describe('U2 expand/reentrant migration과 구형 원본 보존', () => {
  const sources = u2Sources();
  const schema = new SchemaValidator();
  const id = randomUUID();
  const old = {
    accountId: id,
    loginIdentifier: randomUUID(),
    displayName: '구형 합성 계정',
    contactAddress: 'old@example.invalid',
    active: true,
    identityBasis: [],
    revision: 1,
  };
  beforeAll(async () => {
    await initializeU2Databases();
    await sources.primaryAdmin.initialize();
    await sources.primaryApp.initialize();
    await sources.journalAppend.initialize();
    await sources.journalAdmin.initialize();
    await resetU2Databases(sources.primaryAdmin, sources.journalAdmin);
    await sources.primaryApp.getRepository('Account').insert(old);
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  it('재실행 전후 구형 stable ID와 원본 bytes/개정을 보존한다', async () => {
    const before = await sources.primaryApp.getRepository('Account').findOneBy({ accountId: id });
    await migrateU2Models(sources.primaryAdmin);
    expect(await sources.primaryApp.getRepository('Account').findOneBy({ accountId: id })).toEqual(
      before,
    );
  });
  it('기존 43개 모델 projection과 history 형태를 재명명하지 않는다', () => {
    expect(MODELS).toHaveLength(43);
    expect(U2_MODELS.some((model) => MODELS.some((old) => old.name === model.name))).toBe(false);
    expect(
      modelDefinition('IdentityHistory').attributes.map((attribute) => attribute.name),
    ).toContain('actorAccountRef');
    expect(modelDefinition('EnterpriseMembership').attributes[0]?.name).toBe('membershipId');
  });
  it('U2 rollback은 신규 행만 취소하고 구형 계정은 남긴다', async () => {
    const securityStateId = randomUUID();
    await expect(
      sources.primaryApp.transaction(async (manager) => {
        await manager.getRepository('AccountSecurityState').insert(
          physicalData('AccountSecurityState', {
            securityStateId,
            accountRef: { owner: 'IdentityRecovery', entity: 'Account', id, revision: 1 },
            securityGeneration: 1,
            epoch: 'initial',
            revision: 1,
          }),
        );
        throw new Error('합성 rollback');
      }),
    ).rejects.toThrow('합성 rollback');
    expect(
      await sources.primaryApp.getRepository('AccountSecurityState').findOneBy({ securityStateId }),
    ).toBeNull();
    expect(await sources.primaryApp.getRepository('Account').findOneBy({ accountId: id })).toEqual(
      old,
    );
  });
  it('U2 decoder는 unsupported 구형/미등록 model version을 추정하지 않는다', () => {
    expect(() => decodeU2Model('AccountSecurityState', 0, {}, schema)).toThrow();
    expect(() => decodeU2Model('Account', 1, old, schema)).toThrow();
  });
  it('기존 common profile는 새 entity Ref를 받지 않는다', () => {
    const value = { owner: 'IdentityRecovery', entity: 'RecoveryHandoffGrant', id, revision: 1 };
    expect(() => schema.validate('Ref', value)).toThrow();
    expect(schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Ref', value)).toEqual(
      value,
    );
  });
  it('활성 slot/단회 grant/동일 effect/membership unique 인덱스가 실제 존재한다', async () => {
    const indexes = await sources.primaryAdmin.query(
      "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'u2_%'",
    );
    for (const name of [
      'u2_membership_account_enterprise',
      'u2_customer_active_grant',
      'u2_staff_active_grant',
      'u2_claim_grant',
      'u2_active_handoff_case',
      'u2_recovery_execution_account',
      'u2_operation_identity',
    ])
      expect(
        indexes.find((index: { indexname: string }) => index.indexname === name)?.indexdef,
      ).toContain('UNIQUE INDEX');
  });
  it('신규 FK는 실제 기존 EnterpriseMembership ID를 참조한다', async () => {
    const fks = await sources.primaryAdmin.query(
      "SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE contype='f' AND conrelid='u1_membership_invitation'::regclass",
    );
    expect(fks.map((fk: { target: string }) => fk.target)).toContain('u1_enterprise_membership');
  });
  it('구형 보호 계정의 보안 backfill은 source/journal에 한 번 등록하고 과거 원본은 보존한다', async () => {
    const store = new ProtectedStore(sources.primaryApp, sources.journalAppend),
      id = randomUUID();
    const old = await seedSyntheticAccount(store, id, 'CUSTOMER');
    await backfillU2SecurityState(store);
    expect(
      (await store.currentProtected('AccountSecurityState', u2SecurityStateId(id)))
        ?.securityGeneration,
    ).toBe(1);
    expect(await backfillU2SecurityState(store)).toBe(0);
    expect(await store.currentProtected('Account', id)).toEqual(old.account);
  });
  for (const mode of [
    'valid',
    'revoked',
    'unconfirmed',
    'all-used',
    'partial-used',
    'unknown-binding',
    'old-generation',
    'stale-binding',
    'unprotected',
  ] as const)
    it('legacy code ' + mode + '는 현재 보호된 유효 집합만 신규 경계에 명시 매핑한다', async () => {
      const store = new ProtectedStore(sources.primaryApp, sources.journalAppend),
        legacy = await seedSyntheticAccount(store, randomUUID(), 'CUSTOMER'),
        setId = randomUUID(),
        set = {
          setId,
          accountRef: {
            owner: 'IdentityRecovery',
            entity: 'Account',
            id: legacy.account.accountId,
            revision: 1,
          },
          bindingRef: {
            owner: 'IdentityRecovery',
            entity: 'ProviderBinding',
            id: legacy.binding.bindingId,
            revision: 1,
          },
          generation: mode === 'old-generation' ? 2 : 1,
          verifiers: [
            { digest: 'a'.repeat(64), used: mode === 'all-used' || mode === 'partial-used' },
            { digest: 'b'.repeat(64), used: mode === 'all-used' },
          ],
          confirmed: mode !== 'unconfirmed',
          invalidated: mode === 'revoked',
          revision: 1,
        };
      await store.execute(
        {
          principalId: 'fixture-legacy-source',
          audience: 'SYSTEM',
          owner: 'IdentityRecovery',
          operation: 'fixture-current-legacy-code',
          target: null,
          idempotencyKey: randomUUID(),
          input: { setId },
          correlationId: randomUUID(),
          epoch: await store.currentEpoch(),
        },
        async (tx) => {
          await tx.put('RecoveryCodeSet', set);
          if (mode === 'unknown-binding' || mode === 'stale-binding')
            await tx.put(
              'ProviderBinding',
              {
                ...legacy.binding,
                revision: 2,
                ...(mode === 'unknown-binding' ? { removalState: 'UNKNOWN' } : { authRevision: 2 }),
              },
              1,
            );
        },
      );
      if (mode === 'unprotected')
        await sources.primaryAdmin
          .getRepository('RecoveryCodeSet')
          .update({ setId }, { revision: 2 });
      if (mode === 'unprotected') {
        await expect(backfillU2SecurityState(store)).rejects.toMatchObject({
          code: 'CURRENT_AUTH_NOT_PROTECTED',
        });
        expect(
          await store.read('RecoveryCodeSecurityState', u2CodeSecurityStateId(setId)),
        ).toBeNull();
        return;
      }
      await backfillU2SecurityState(store);
      const mapping = await store.currentProtected(
        'RecoveryCodeSecurityState',
        u2CodeSecurityStateId(setId),
      );
      if (mode === 'valid' || mode === 'partial-used')
        expect(mapping).toMatchObject({
          origin: 'CURRENT_LEGACY_ADMISSION',
          codeSetRef: { id: setId, revision: 1 },
          bindingRef: set.bindingRef,
          securityStateRef: { id: u2SecurityStateId(legacy.account.accountId), revision: 1 },
          securityGeneration: 1,
        });
      else expect(mapping).toBeNull();
      expect(await store.currentProtected('RecoveryCodeSet', setId)).toEqual(set);
      expect(await store.currentProtected('Account', legacy.account.accountId)).toEqual(
        legacy.account,
      );
    });
  it('반복 준비의 등록 reset은 exact U2 namespace에서만 보호 journal/vault/권위 원본을 비우고 같은 seed revision1을 새로 생성한다', async () => {
    await sources.vault.initialize();
    const store = new ProtectedStore(sources.primaryApp, sources.journalAppend),
      stableSeedId = randomUUID();
    for (const unrelated of ['oms_u1_verification', 'another_project']) {
      const query = async () => {
        throw Error('다른 namespace query 금지');
      };
      await expect(
        resetU2Databases(
          {
            options: { type: 'postgres', url: 'postgresql://fixture@127.0.0.1:15432/' + unrelated },
            query,
          } as unknown as DataSource,
          sources.journalAdmin,
        ),
      ).rejects.toThrow('다른 소유자');
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await resetU2Databases(sources.primaryAdmin, sources.journalAdmin);
      expect((await sources.primaryAdmin.query('SELECT current_database() AS name'))[0].name).toBe(
        'oms_u2_verification',
      );
      expect((await sources.journalAdmin.query('SELECT current_database() AS name'))[0].name).toBe(
        'oms_u2_journal_verification',
      );
      expect(
        (await sources.primaryAdmin.query('SELECT commit_order FROM u1_commit_counter'))[0]
          .commit_order,
      ).toBe('0');
      expect(
        (await sources.journalAdmin.query('SELECT count(*)::int AS n FROM u1_protected_entry'))[0]
          .n,
      ).toBe(0);
      expect(
        (await sources.journalAdmin.query('SELECT count(*)::int AS n FROM u2_vault.material'))[0].n,
      ).toBe(0);
      for (const model of ['ClaimReceipt', 'EnrollmentAuthority', 'RecoveryCase'])
        expect(await store.list(model)).toHaveLength(0);
      const seeded = await seedSyntheticAccount(store, stableSeedId, 'CUSTOMER');
      expect(await store.currentProtected('Account', stableSeedId)).toEqual(seeded.account);
      expect(seeded.account.revision).toBe(1);
      const claimed = await seedClaimedRecovery(store, sources.vault);
      expect(
        (await store.currentProtected('EnrollmentAuthority', String(claimed.authority.authorityId)))
          ?.state,
      ).toBe('ACTIVE');
      expect(
        (await sources.journalAdmin.query('SELECT count(*)::int AS n FROM u2_vault.material'))[0].n,
      ).toBeGreaterThan(0);
      expect(
        (await sources.journalAdmin.query('SELECT count(*)::int AS n FROM u1_protected_entry'))[0]
          .n,
      ).toBeGreaterThan(0);
    }
    await resetU2Databases(sources.primaryAdmin, sources.journalAdmin);
    expect(await store.currentProtected('Account', stableSeedId)).toBeNull();
    expect(await store.list('EnrollmentAuthority')).toHaveLength(0);
    expect(
      (await sources.journalAdmin.query('SELECT count(*)::int AS n FROM u2_vault.material'))[0].n,
    ).toBe(0);
  });
});
