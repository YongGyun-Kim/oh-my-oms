import { describe, expect, it } from 'vitest';
import { requireCondition } from '@oms/contracts';
import { ProtectedStore, U4Repository } from '@oms/persistence';
import { u4Sources } from '../fixtures/databases.js';
import { persistenceFixture, financialRequest, barrier } from '../fixtures/persistence.js';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Money } from '../fixtures/contracts.js';

describe('U4 real independent connection transaction races', () => {
  const { repository, sources } = persistenceFixture();
  function assertLoser(results: PromiseSettledResult<unknown>[], codes: readonly string[]) {
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.filter((result) => result.status === 'rejected');
    expect(failed).toHaveLength(1);
    expect(codes).toContain((failed[0]!.reason as { code?: string }).code);
  }
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
    assertLoser(results, ['23505']);
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
    assertLoser(results, ['CURRENT_U4_NOT_PROTECTED', 'INSUFFICIENT_BALANCE']);
    const saved = await sources.primaryApp
      .getRepository('FinancialPaymentBalance')
      .findOneBy({ paymentId: 'principal' });
    expect(saved!.allocatedPrincipal).toEqual(u4Money('80'));
  });
  it('serializes two different fund sources against one invoice balance', async () => {
    const row = u4ModelFixture('FinancialInvoiceBalance', 'invoice');
    const payments = [0, 1].map((participant) =>
      u4ModelFixture('FinancialPaymentBalance', 'source-' + participant),
    );
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => {
        await scope.transaction.put('FinancialInvoiceBalance', row);
        await scope.transaction.putNewBatch('FinancialPaymentBalance', payments);
      },
    );
    const results = await compete((repo, participant) =>
      repo.mutate(
        financialRequest(),
        async () => {},
        async (scope) => {
          const paymentId = 'source-' + participant;
          await scope.lock([paymentId], ['invoice'], []);
          const payment = (await scope.optional('FinancialPaymentBalance', paymentId))!;
          await scope.transaction.put(
            'FinancialPaymentBalance',
            { ...payment, allocatedPrincipal: u4Money('80'), revision: 2 },
            1,
          );
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
    // 보호가 아직 확인되지 않은 선행 소비는 HOLD이며, 현재 보호가 확인됐으면 잔여 한도로 거절한다.
    assertLoser(results, ['CURRENT_U4_NOT_PROTECTED', 'INVOICE_REMAINDER']);
    for (const [participant, result] of results.entries()) {
      const payment = await sources.primaryApp
        .getRepository('FinancialPaymentBalance')
        .findOneBy({ paymentId: 'source-' + participant });
      expect(payment!.allocatedPrincipal).toEqual(
        u4Money(result.status === 'fulfilled' ? '80' : '0'),
      );
      expect(payment!.revision).toBe(result.status === 'fulfilled' ? 2 : 1);
    }
    expect(
      (await sources.primaryApp
        .getRepository('FinancialInvoiceBalance')
        .findOneBy({ invoiceId: 'invoice' }))!.allocatedPrincipal,
    ).toEqual(u4Money('80'));
    expect(
      (
        await sources.primaryApp.query(
          'SELECT count(*)::integer AS count FROM u1_recovery_candidate',
        )
      )[0].count,
    ).toBe(2);
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
    assertLoser(results, ['CURRENT_U4_NOT_PROTECTED', 'ROOT_REMAINDER']);
    expect(
      (await sources.primaryApp
        .getRepository('FinancialApprovalBalance')
        .findOneBy({ approvalRootId: 'approval' }))!.reserved,
    ).toEqual(u4Money('80'));
  });
});
