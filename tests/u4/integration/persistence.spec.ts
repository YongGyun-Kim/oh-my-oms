import { describe, expect, it } from 'vitest';
import { fingerprint } from '@oms/contracts';
import {
  ALL_MODELS,
  U4_MODELS,
  U4_SUPPORT_MODELS,
  migrateU4Models,
  physicalData,
} from '@oms/persistence';
import { persistenceFixture, financialRequest } from '../fixtures/persistence.js';
import { u4ModelFixture } from '../fixtures/models.js';

describe('U4 real PostgreSQL registration and physical safeguards', () => {
  const { sources, store, repository } = persistenceFixture();
  it('uses only the two U4 isolated databases with all financial tables', async () => {
    expect((await sources.primaryApp.query('SELECT current_database() AS name'))[0].name).toBe(
      'oms_u4_verification',
    );
    expect((await sources.journalAppend.query('SELECT current_database() AS name'))[0].name).toBe(
      'oms_u4_journal_verification',
    );
    const tables = await sources.primaryApp.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    );
    expect(tables.length).toBeGreaterThanOrEqual(ALL_MODELS.length);
    expect(U4_MODELS.length + U4_SUPPORT_MODELS.length).toBe(17);
  });
  it('enforces NOT NULL on identity material in actual PostgreSQL', async () => {
    const claim = u4ModelFixture('FinancialIdentityClaim');
    delete claim.canonicalIdentity;
    await expect(
      sources.primaryApp
        .getRepository('FinancialIdentityClaim')
        .insert(physicalData('FinancialIdentityClaim', claim)),
    ).rejects.toMatchObject({ code: '23502' });
  });
  it('enforces namespace/material uniqueness independently of a different digest key', async () => {
    const first = u4ModelFixture('FinancialIdentityClaim');
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => scope.transaction.putNewBatch('FinancialIdentityClaim', [first]),
    );
    await expect(
      sources.primaryApp
        .getRepository('FinancialIdentityClaim')
        .insert({ ...first, claimId: fingerprint('different') }),
    ).rejects.toMatchObject({ code: '23505' });
    expect(
      (
        await sources.primaryApp.query(
          'SELECT count(*)::integer AS count FROM u1_financial_identity_claim',
        )
      )[0].count,
    ).toBe(1);
  });
  it('preserves historical aliases against ordinary update/delete', async () => {
    const claim = u4ModelFixture('FinancialIdentityClaim');
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => scope.transaction.putNewBatch('FinancialIdentityClaim', [claim]),
    );
    await expect(
      sources.primaryApp.query('DELETE FROM u1_financial_identity_claim WHERE "claimId"=$1', [
        claim.claimId,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      sources.primaryApp.query(
        'UPDATE u1_financial_identity_claim SET "canonicalIdentity"=$1 WHERE "claimId"=$2',
        ['other', claim.claimId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await store.read('FinancialIdentityClaim', String(claim.claimId))).toBeDefined();
  });
  it('rolls back every original if any operation in the transaction fails', async () => {
    const row = u4ModelFixture('FinancialPaymentBalance', 'rollback');
    await expect(
      repository.mutate(
        financialRequest(),
        async () => {},
        async (scope) => {
          await scope.transaction.put('FinancialPaymentBalance', row);
          throw new Error('SYNTHETIC_ROLLBACK');
        },
      ),
    ).rejects.toThrow();
    expect(
      await sources.primaryApp
        .getRepository('FinancialPaymentBalance')
        .findOneBy({ paymentId: 'rollback' }),
    ).toBeNull();
    expect(
      (
        await sources.primaryApp.query(
          'SELECT count(*)::integer AS count FROM u1_recovery_candidate',
        )
      )[0].count,
    ).toBe(0);
  });
  it('repeated expand migration preserves exact protected source bytes', async () => {
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) =>
        scope.transaction.put(
          'FinancialPaymentBalance',
          u4ModelFixture('FinancialPaymentBalance', 'persist'),
        ),
    );
    const before = await sources.journalAdmin.query(
      'SELECT payload_text,digest FROM u1_protected_entry ORDER BY commit_order',
    );
    await migrateU4Models(sources.primaryAdmin);
    const after = await sources.journalAdmin.query(
      'SELECT payload_text,digest FROM u1_protected_entry ORDER BY commit_order',
    );
    expect(JSON.stringify(before) === JSON.stringify(after)).toBe(true);
  });
});
