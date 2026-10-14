import { describe, expect, it } from 'vitest';
import { requireCondition } from '@oms/contracts';
import { ProtectedStore, U4Repository } from '@oms/persistence';
import { u4Sources } from '../fixtures/databases.js';
import { persistenceFixture, financialRequest, barrier } from '../fixtures/persistence.js';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Money } from '../fixtures/contracts.js';

describe('U4 real independent connection transaction races', () => {
  const { repository, sources } = persistenceFixture();
  async function compete(write: (repo: U4Repository, participant: number) => Promise<unknown>) {
    const second = u4Sources();
    await second.primaryApp.initialize();
    await second.journalAppend.initialize();
    try {
      const other = new U4Repository(new ProtectedStore(second.primaryApp, second.journalAppend));
      const meet = barrier(2);
      return await Promise.allSettled(
        [repository, other].map(async (repo, index) => {
          await meet();
          return write(repo, index);
        }),
      );
    } finally {
      await second.primaryApp.destroy();
      await second.journalAppend.destroy();
    }
  }
  it('creates one global identity for two independently keyed simultaneous registrations', async () => {
    const claim = u4ModelFixture('FinancialIdentityClaim');
    const results = await compete((repo) =>
      repo.mutate(
        financialRequest(),
        async () => {},
        async (scope) => scope.transaction.putNewBatch('FinancialIdentityClaim', [claim]),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await sources.primaryApp.query(
          'SELECT count(*)::integer AS count FROM u1_financial_identity_claim',
        )
      )[0].count,
    ).toBe(1);
  });
  it('serializes two eighty-unit consumptions of the same hundred-unit principal', async () => {
    const row = u4ModelFixture('FinancialPaymentBalance', 'principal');
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => scope.transaction.put('FinancialPaymentBalance', row),
    );
    const results = await compete((repo) =>
      repo.mutate(
        financialRequest(),
        async () => {},
        async (scope) => {
          await scope.lock(['principal'], [], []);
          const current = (await scope.optional('FinancialPaymentBalance', 'principal'))!;
          const used = BigInt((current.allocatedPrincipal as { value: string }).value);
          requireCondition(used + 80n <= 100n, 409, 'INSUFFICIENT_BALANCE', '합성 원금 한도');
          await scope.transaction.put(
            'FinancialPaymentBalance',
            {
              ...current,
              allocatedPrincipal: u4Money(String(used + 80n)),
              revision: Number(current.revision) + 1,
            },
            Number(current.revision),
          );
        },
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const saved = await sources.primaryApp
      .getRepository('FinancialPaymentBalance')
      .findOneBy({ paymentId: 'principal' });
    expect(saved!.allocatedPrincipal).toEqual(u4Money('80'));
  });
  it('serializes two different fund sources against one invoice balance', async () => {
    const row = u4ModelFixture('FinancialInvoiceBalance', 'invoice');
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => scope.transaction.put('FinancialInvoiceBalance', row),
    );
    const results = await compete((repo) =>
      repo.mutate(
        financialRequest(),
        async () => {},
        async (scope) => {
          await scope.lock([], ['invoice'], []);
          const current = (await scope.optional('FinancialInvoiceBalance', 'invoice'))!;
          const used = BigInt((current.allocatedPrincipal as { value: string }).value);
          requireCondition(used + 80n <= 100n, 409, 'INVOICE_REMAINDER', '합성 청구 한도');
          await scope.transaction.put(
            'FinancialInvoiceBalance',
            {
              ...current,
              allocatedPrincipal: u4Money(String(used + 80n)),
              revision: Number(current.revision) + 1,
            },
            Number(current.revision),
          );
        },
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
  it('uses one root budget across two independent refund cases', async () => {
    const row = u4ModelFixture('FinancialApprovalBalance', 'approval');
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => scope.transaction.put('FinancialApprovalBalance', row),
    );
    const results = await compete((repo) =>
      repo.mutate(
        financialRequest(),
        async () => {},
        async (scope) => {
          await scope.lock([], [], ['approval']);
          const current = (await scope.optional('FinancialApprovalBalance', 'approval'))!;
          const reserved = BigInt((current.reserved as { value: string }).value);
          requireCondition(reserved + 80n <= 100n, 409, 'ROOT_REMAINDER', '합성 공통 한도');
          await scope.transaction.put(
            'FinancialApprovalBalance',
            {
              ...current,
              reserved: u4Money(String(reserved + 80n)),
              revision: Number(current.revision) + 1,
            },
            Number(current.revision),
          );
        },
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
});
