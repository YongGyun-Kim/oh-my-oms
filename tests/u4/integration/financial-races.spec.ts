import { beforeEach, describe, expect, it } from 'vitest';
import type { Receipt } from '@oms/contracts';
import { U4CommercialAdapter, U4FinancialAccess, U4FinancialCommands } from '@oms/core';
import { ProtectedStore } from '@oms/persistence';
import { u4Sources } from '../fixtures/databases.js';
import { persistenceFixture, barrier } from '../fixtures/persistence.js';
import { seedU4FinancialFlow } from '../fixtures/financial-flow.js';

describe('독립 DB 연결에서 실제 금융 명령의 동시 소비', () => {
  const { store } = persistenceFixture();
  let f: Awaited<ReturnType<typeof seedU4FinancialFlow>>;
  beforeEach(async () => {
    f = await seedU4FinancialFlow(store);
  });
  async function compete(
    run: (commands: U4FinancialCommands, participant: number) => Promise<Receipt>,
  ) {
    const second = u4Sources();
    await second.primaryApp.initialize();
    await second.journalAppend.initialize();
    try {
      const otherStore = new ProtectedStore(second.primaryApp, second.journalAppend);
      const other = new U4FinancialCommands(
        new U4FinancialAccess(
          new U4CommercialAdapter(
            otherStore,
            f.seller.now,
            async (proof) => proof === f.ingress,
            f.adapter.registration,
          ),
        ),
        f.financial.source,
      );
      const meet = barrier(2);
      return await Promise.allSettled(
        [f.financial, other].map(async (commands, participant) => {
          await meet();
          return run(commands, participant);
        }),
      );
    } finally {
      await second.primaryApp.destroy();
      await second.journalAppend.destroy();
    }
  }
  function oneApplied(results: PromiseSettledResult<Receipt>[], codes: string[]) {
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(
      (result) => result.status === 'rejected',
    )! as PromiseRejectedResult;
    // 예상 밖 실패는 원래 안전 코드/위치로 진단한다. 임의 오류를 업무 한도 거절로 통과시키지 않는다.
    if (!codes.includes((failure.reason as { code: string }).code)) throw failure.reason;
    expect(codes).toContain((failure.reason as { code: string }).code);
  }
  it('동일 입금100에 독립 요청80+80 중 하나만 적용하고 패자 원본을 남기지 않는다', async () => {
    const invoice = (await f.invoices())[0]!,
      paid = await f.payment();
    const contexts = [await f.actor(), await f.actor()];
    const inputs = [0, 1].map(() =>
      f.allocationInput(paid.confirmed.targetRef!, [invoice], ['80']),
    );
    const results = await compete((commands, participant) =>
      commands.allocatePaymentBatch(contexts[participant]!, inputs[participant]!, f.ingress),
    );
    oneApplied(results, [
      'STALE_U4_REFERENCE',
      'CURRENT_U4_NOT_PROTECTED',
      'U4_PAYMENT_LIMIT',
      'U4_FINANCIAL_BUSY',
    ]);
    const loser = results.findIndex((result) => result.status === 'rejected');
    expect(
      await store.list('RequestReceipt', {
        equals: { idempotencyKey: inputs[loser]!.meta.clientRequestId },
      }),
    ).toHaveLength(0);
    // 같은 원래 키/내용은 현재 개정 재확인이 필요하며 새 효과를 자동 생성하지 않는다.
    await expect(
      f.financial.allocatePaymentBatch(await f.actor(), inputs[loser]!, f.ingress),
    ).rejects.toMatchObject({ code: 'STALE_U4_REFERENCE' });
    const currentPayment = {
      ...paid.confirmed.targetRef!,
      revision: Number(
        (await store.currentProtected('PaymentEvidence', paid.confirmed.targetRef!.id))!.revision,
      ),
    };
    await expect(
      f.financial.allocatePaymentBatch(
        await f.actor(),
        f.allocationInput(currentPayment, [invoice], ['80']),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_PAYMENT_LIMIT' });
    expect(
      await store.currentProtected('FinancialPaymentBalance', paid.confirmed.targetRef!.id),
    ).toMatchObject({ principal: { value: '100' }, allocatedPrincipal: { value: '80' } });
    expect(await store.currentProtected('FinancialInvoiceBalance', invoice.id)).toMatchObject({
      allocatedPrincipal: { value: '80' },
    });
    expect(await store.list('PaymentAllocation')).toHaveLength(1);
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'allocatePaymentBatch' } }),
    ).toHaveLength(1);
  });
  it('서로 다른 입금이 청구 잔여100에80+80을 소비해도 합계180을 넘지 않는다', async () => {
    const invoice = (await f.invoices())[0]!;
    const baseline = await f.payment('baseline', f.identity('baseline'));
    await f.financial.allocatePaymentBatch(
      await f.actor(),
      f.allocationInput(baseline.confirmed.targetRef!, [invoice], ['100']),
      f.ingress,
    );
    const payments = [
      await f.payment('race-a', f.identity('race-a')),
      await f.payment('race-b', f.identity('race-b')),
    ];
    const contexts = [await f.actor(), await f.actor()];
    const inputs = payments.map((paid) =>
      f.allocationInput(paid.confirmed.targetRef!, [invoice], ['80']),
    );
    const results = await compete((commands, participant) =>
      commands.allocatePaymentBatch(contexts[participant]!, inputs[participant]!, f.ingress),
    );
    // counter 직렬화 뒤 선행 보호가 미확인이면 HOLD, 보호 확인 뒤에는 실제 잔여20으로 거절한다.
    oneApplied(results, ['CURRENT_U4_NOT_PROTECTED', 'U4_INVOICE_LIMIT', 'U4_FINANCIAL_BUSY']);
    const loser = results.findIndex((result) => result.status === 'rejected');
    expect(
      await store.list('RequestReceipt', {
        equals: { idempotencyKey: inputs[loser]!.meta.clientRequestId },
      }),
    ).toHaveLength(0);
    // 보호 확인 뒤 같은 원래 요청을 재확인해 실제 잔여20 거절도 별도로 입증한다.
    await expect(
      f.financial.allocatePaymentBatch(await f.actor(), inputs[loser]!, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_INVOICE_LIMIT' });
    expect(await store.currentProtected('FinancialInvoiceBalance', invoice.id)).toMatchObject({
      amount: { value: '200' },
      allocatedPrincipal: { value: '180' },
    });
    for (const [index, paid] of payments.entries()) {
      expect(
        await store.currentProtected('FinancialPaymentBalance', paid.confirmed.targetRef!.id),
      ).toMatchObject({
        principal: { value: '100' },
        allocatedPrincipal: { value: results[index]!.status === 'fulfilled' ? '80' : '0' },
      });
      expect(
        await store.currentProtected('PaymentEvidence', paid.confirmed.targetRef!.id),
      ).toMatchObject({ revision: results[index]!.status === 'fulfilled' ? 3 : 2 });
    }
    expect(await store.list('PaymentAllocation')).toHaveLength(2);
  });
  it('같은 실제 거래를 독립 후보·요청에서 동시에 확인해도 실제 현금은 하나다', async () => {
    const reviews = [];
    for (const document of ['duplicate-a', 'duplicate-b']) {
      f.registerTruth(document);
      reviews.push(
        await f.financial.recordPaymentEvidence(
          await f.actor(),
          f.recordInput(document),
          f.ingress,
        ),
      );
    }
    const inputs = reviews.map((receipt, index) =>
      f.confirmInput(receipt.targetRef!, ['duplicate-a', 'duplicate-b'][index]!),
    );
    const contexts = [await f.actor(), await f.actor()];
    const results = await compete((commands, participant) =>
      commands.confirmPaymentEvidence(contexts[participant]!, inputs[participant]!, f.ingress),
    );
    const success = results.filter(
      (result) => result.status === 'fulfilled',
    ) as PromiseFulfilledResult<Receipt>[];
    expect(
      success.filter((result) => result.value.requestState === 'RESULT_RECORDED'),
    ).toHaveLength(1);
    for (const result of results)
      if (result.status === 'rejected')
        expect(['CURRENT_U4_NOT_PROTECTED', 'U4_TRANSACTION_CONFLICT', '23505']).toContain(
          (result.reason as { code: string }).code,
        );
    expect(await store.list('FinancialPaymentBalance')).toHaveLength(1);
    expect(await store.list('FinancialIdentityClaim')).toHaveLength(2);
    const payments = await store.list('PaymentEvidence');
    expect(payments.filter((payment) => payment.lifecycle === 'CONFIRMED')).toHaveLength(1);
    expect(
      payments.filter((payment) => ['REVIEW', 'DISPUTED'].includes(String(payment.lifecycle))),
    ).toHaveLength(1);
  });
});
