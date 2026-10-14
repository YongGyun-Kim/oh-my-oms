import { beforeEach, describe, expect, it } from 'vitest';
import type { Ref } from '@oms/contracts';
import { ProtectedTransaction, U4Transaction, physicalData } from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import { persistenceFixture, financialRequest } from '../fixtures/persistence.js';
import { seedU4FinancialFlow } from '../fixtures/financial-flow.js';
import { u4Money } from '../fixtures/contracts.js';

describe('실제 PostgreSQL 금융 집합의 전체 원상·자체 변경·101번째 소비', () => {
  const { sources, store, repository } = persistenceFixture();
  let f: Awaited<ReturnType<typeof seedU4FinancialFlow>>;
  let paymentRef: Ref, invoiceRef: Ref, rows: ModelData[];
  beforeEach(async () => {
    f = await seedU4FinancialFlow(store);
    invoiceRef = (await f.invoices())[0]!;
    f.registerTruth('principal-200', '200');
    const input = f.recordInput('principal-200');
    input.amount = u4Money('200');
    const review = await f.financial.recordPaymentEvidence(await f.actor(), input, f.ingress);
    paymentRef = (
      await f.financial.confirmPaymentEvidence(
        await f.actor(),
        f.confirmInput(review.targetRef!, 'principal-200'),
        f.ingress,
      )
    ).targetRef!;
    const order = (await store.currentProtected('Order', f.orderRef.id))!;
    rows = Array.from({ length: 101 }, (_, index): ModelData => ({
      modelVersion: 1,
      allocationId: 'allocation-' + String(index).padStart(4, '0'),
      paymentEvidenceRef: paymentRef,
      invoiceRef,
      orderRef: f.orderRef,
      orderLineRefs: order.lineRefs,
      renewalCycleRefs: [],
      amount: u4Money('1'),
      effect: 'APPLIED',
      decisionEvidenceRefs: [f.evidence()],
      correctionOf: null,
      revision: 1,
      targetScope: f.targetScope,
      knowledge: 'KNOWN',
      historyRefs: [],
    }));
    // 원장 집합 경계용 명시 합성 seed다. 101개 배분 API가 성공한 것으로 표시하지 않는다.
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => {
        await scope.transaction.putNewBatch('PaymentAllocation', rows.slice(0, 100));
        await scope.transaction.putNewBatch('PaymentAllocation', rows.slice(100));
        const payment = (await scope.optional('FinancialPaymentBalance', paymentRef.id))!;
        const invoice = (await scope.optional('FinancialInvoiceBalance', invoiceRef.id))!;
        await scope.transaction.put(
          'FinancialPaymentBalance',
          { ...payment, allocatedPrincipal: u4Money('101'), revision: 2 },
          1,
        );
        await scope.transaction.put(
          'FinancialInvoiceBalance',
          { ...invoice, allocatedPrincipal: u4Money('101'), revision: 2 },
          1,
        );
      },
    );
  });
  async function inspect<T>(read: (scope: U4Transaction) => Promise<T>) {
    return sources.primaryApp.transaction('READ COMMITTED', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      const control = (
        await manager.query('SELECT epoch FROM u1_recovery_control WHERE singleton=true')
      )[0];
      const prefix = await manager.query(
        'SELECT epoch,commit_order FROM u1_protected_prefix ORDER BY epoch',
      );
      const transaction = new ProtectedTransaction(manager, store.schema);
      const scope = new U4Transaction(
        transaction,
        {
          epoch: control.epoch,
          prefixes: prefix.map((row: { epoch: string; commit_order: string }) => ({
            epoch: row.epoch,
            commitOrder: Number(row.commit_order),
          })),
        },
        store.schema,
      );
      const result = await read(scope);
      await scope.assertPremises();
      expect(transaction.rows()).toHaveLength(0);
      return result;
    });
  }
  const collection = (scope: U4Transaction, equals = {}) =>
    scope.financialCollection(
      'PaymentAllocation',
      equals,
      new Date(Date.now() + 5000).toISOString(),
    );
  it('101번째 배분까지 실제 cursor로 원금·청구 잔액에 반영한다', async () => {
    const actual = await inspect(async (scope) => {
      const payment = await scope.current(paymentRef),
        invoice = await scope.current(invoiceRef);
      return {
        payment: await f.financial.ledger.payment(scope, payment),
        invoice: await f.financial.ledger.invoice(scope, invoice),
      };
    });
    expect(actual.payment.allocations).toHaveLength(101);
    expect(actual.payment.allocated).toBe(101n);
    expect(actual.payment.available).toBe(99n);
    expect(actual.invoice.remaining).toBe(99n);
  });
  it('primary-only 추가 원본을 보호된 101개에 몰래 합산하지 않는다', async () => {
    await sources.primaryAdmin
      .getRepository('PaymentAllocation')
      .insert(physicalData('PaymentAllocation', { ...rows[0], allocationId: 'allocation-extra' }));
    await expect(inspect((scope) => collection(scope))).rejects.toMatchObject({
      code: 'CURRENT_U4_NOT_PROTECTED',
    });
  });
  it('101번째 원본의 primary-only 삭제를 첫100개 성공으로 오인하지 않는다', async () => {
    await sources.primaryAdmin
      .getRepository('PaymentAllocation')
      .delete({ allocationId: 'allocation-0100' });
    await expect(inspect((scope) => collection(scope))).rejects.toMatchObject({
      code: 'CURRENT_U4_NOT_PROTECTED',
    });
  });
  it('101번째 원본의 미보호 금액 변경을 차단한다', async () => {
    await sources.primaryAdmin
      .getRepository('PaymentAllocation')
      .update({ allocationId: 'allocation-0100' }, { amount: u4Money('2') });
    await expect(inspect((scope) => collection(scope))).rejects.toMatchObject({
      code: 'CURRENT_U4_NOT_PROTECTED',
    });
  });
  it('미보호 상태 변경으로 조회 조건 밖에 숨긴 원본도 차단한다', async () => {
    await sources.primaryAdmin
      .getRepository('PaymentAllocation')
      .update({ allocationId: 'allocation-0100' }, { effect: 'REVERSED' });
    await expect(
      inspect((scope) => collection(scope, { effect: 'APPLIED' })),
    ).rejects.toMatchObject({ code: 'CURRENT_U4_NOT_PROTECTED' });
  });
  it('정상 자체 after-image가 조건을 나가고 다시 들어와도 한 번만 집계한다', async () => {
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => {
        const current = await scope.current({
          owner: 'FinancialSettlement',
          entity: 'PaymentAllocation',
          id: 'allocation-0100',
          revision: 1,
        });
        await scope.transaction.put(
          'PaymentAllocation',
          { ...current, effect: 'REVERSED', revision: 2 },
          1,
        );
        expect(await collection(scope, { effect: 'APPLIED' })).toHaveLength(100);
        expect(await collection(scope, { effect: 'REVERSED' })).toMatchObject([
          { allocationId: 'allocation-0100', revision: 2 },
        ]);
        // 잔액도 같은 원자 변경으로 감소시켜 정상 원장 정합성을 보존한다.
        for (const [model, id] of [
          ['FinancialPaymentBalance', paymentRef.id],
          ['FinancialInvoiceBalance', invoiceRef.id],
        ]) {
          const balance = (await scope.optional(model!, id!))!;
          await scope.transaction.put(
            model!,
            { ...balance, allocatedPrincipal: u4Money('100'), revision: 3 },
            2,
          );
        }
      },
    );
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => {
        const current = await scope.current({
          owner: 'FinancialSettlement',
          entity: 'PaymentAllocation',
          id: 'allocation-0100',
          revision: 2,
        });
        await scope.transaction.put(
          'PaymentAllocation',
          { ...current, effect: 'APPLIED', revision: 3 },
          2,
        );
        expect(await collection(scope, { effect: 'APPLIED' })).toHaveLength(101);
        expect(await collection(scope, { effect: 'REVERSED' })).toHaveLength(0);
        for (const [model, id] of [
          ['FinancialPaymentBalance', paymentRef.id],
          ['FinancialInvoiceBalance', invoiceRef.id],
        ]) {
          const balance = (await scope.optional(model!, id!))!;
          await scope.transaction.put(
            model!,
            { ...balance, allocatedPrincipal: u4Money('101'), revision: 4 },
            3,
          );
        }
      },
    );
    expect(
      (
        await inspect(async (scope) =>
          f.financial.ledger.payment(scope, await scope.current(paymentRef)),
        )
      ).allocated,
    ).toBe(101n);
  });
});
