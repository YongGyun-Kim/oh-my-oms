import { beforeEach, describe, expect, it } from 'vitest';
import type { Ref } from '@oms/contracts';
import { persistenceFixture, financialRequest } from '../fixtures/persistence.js';
import { seedU4FinancialFlow } from '../fixtures/financial-flow.js';
import { u4Money, u4Ref } from '../fixtures/contracts.js';

describe('실제 입금·청구 정정과 이미 소비한 원금 보존', () => {
  const { store, repository } = persistenceFixture();
  let f: Awaited<ReturnType<typeof seedU4FinancialFlow>>;
  beforeEach(async () => {
    f = await seedU4FinancialFlow(store);
  });
  async function allocated() {
    const invoices = await f.invoices(),
      paid = await f.payment();
    const receipt = await f.financial.allocatePaymentBatch(
      await f.actor(),
      f.allocationInput(paid.confirmed.targetRef!, invoices),
      f.ingress,
    );
    return {
      invoices,
      paid,
      receipt,
      allocation: receipt.resultRefs.find((reference) => reference.entity === 'PaymentAllocation')!,
    };
  }
  it('소비0이어도 주문A에 연결된 입금을 주문B의 첫 배분으로 이동하지 않는다', async () => {
    const paid = await f.payment();
    const other = await f.acceptedOrder();
    const invoice = await f.financial.registerInvoice(
      await f.actor(),
      await f.invoiceInput(0, other),
      f.ingress,
    );
    await expect(
      f.financial.allocatePaymentBatch(
        await f.actor(),
        f.allocationInput(paid.confirmed.targetRef!, [invoice.targetRef!], ['1'], other),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_PAYMENT_BOUND_OTHER_ORDER' });
    expect(
      await store.currentProtected('FinancialPaymentBinding', paid.confirmed.targetRef!.id),
    ).toMatchObject({ orderRef: f.orderRef });
    expect(
      await store.currentProtected('FinancialPaymentBalance', paid.confirmed.targetRef!.id),
    ).toMatchObject({ allocatedPrincipal: u4Money('0') });
    expect(await store.list('PaymentAllocation')).toHaveLength(0);
  });
  it('청구 정정은 원래 invoiceId·개정·이력 연결과 지급 원금을 보존한다', async () => {
    const invoice = (await f.invoices())[0]!;
    const input = await f.invoiceInput(0);
    input.correctionOf = invoice;
    input.meta = f.meta(invoice.revision);
    const receipt = await f.financial.correctInvoice(await f.actor(), input, f.ingress);
    expect(receipt.targetRef).toMatchObject({ id: invoice.id, revision: 2 });
    const original = (await store.readRevision('Invoice', invoice.id, 1))!;
    const history = (await store.currentProtected(
      'FinancialHistory',
      receipt.resultRefs.find((reference) => reference.entity === 'FinancialHistory')!.id,
    ))!;
    expect(history).toMatchObject({
      beforeRef: invoice,
      correctionOf: (original.historyRefs as Ref[]).at(-1),
      afterRef: receipt.targetRef,
    });
    expect(await store.list('Invoice')).toHaveLength(2);
    expect(await store.list('FinancialPaymentBalance')).toHaveLength(0);
  });
  it('확인 정정은 현재 실제 금액을 반영하고 옛 canonical/별칭 예약을 유지한다', async () => {
    const paid = await f.payment();
    const nextIdentity = f.identity('corrected');
    nextIdentity.aliases = [f.identity().canonicalIdentity, ...f.identity().aliases];
    const truth = f.registerTruth('corrected-document', '90', nextIdentity);
    const receipt = await f.financial.correctPaymentEvidence(
      await f.actor(),
      {
        meta: f.meta(2),
        targetScope: f.targetScope,
        paymentEvidenceRef: paid.confirmed.targetRef!,
        correctionKind: 'CONFIRM',
        sourceEvidence: f.evidence('corrected-document'),
        identity: nextIdentity,
        amount: u4Money('90'),
        actualPaidAt: truth.actualPaidAt,
      },
      f.ingress,
    );
    expect(receipt.targetRef).toMatchObject({ id: paid.confirmed.targetRef!.id, revision: 3 });
    expect(
      await store.currentProtected('FinancialPaymentBalance', receipt.targetRef!.id),
    ).toMatchObject({ principal: u4Money('90'), allocatedPrincipal: u4Money('0') });
    expect(await store.list('FinancialIdentityClaim')).toHaveLength(3);
    const old = await f.payment('old-identity-duplicate');
    expect(old.confirmed.requestState).toBe('REVIEW_REQUIRED');
    expect(await store.list('FinancialPaymentBalance')).toHaveLength(1);
  });
  it('확인 원본이 실제 REVOKED일 때만 반전하고 새 요청에도 옛 거래 중복을 막는다', async () => {
    const paid = await f.payment();
    const correction = {
      meta: f.meta(2),
      targetScope: f.targetScope,
      paymentEvidenceRef: paid.confirmed.targetRef!,
      correctionKind: 'REVERSE' as const,
      sourceEvidence: f.evidence('u4-synthetic-payment'),
      identity: null,
      amount: null,
      actualPaidAt: null,
    };
    await expect(
      f.financial.correctPaymentEvidence(await f.actor(), correction, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_SOURCE_UNVERIFIED' });
    const actual = f.registerTruth('u4-synthetic-payment');
    actual.state = 'REVOKED';
    actual.actualPaidAt = String(
      (await store.currentProtected('PaymentEvidence', paid.confirmed.targetRef!.id))!.actualPaidAt,
    );
    const reversed = await f.financial.correctPaymentEvidence(
      await f.actor(),
      correction,
      f.ingress,
    );
    expect(await store.currentProtected('PaymentEvidence', reversed.targetRef!.id)).toMatchObject({
      lifecycle: 'REVERSED',
      identity: f.identity(),
    });
    expect(
      await store.currentProtected('FinancialPaymentBalance', reversed.targetRef!.id),
    ).toMatchObject({ principal: u4Money('0'), allocatedPrincipal: u4Money('0') });
    expect(await store.list('FinancialIdentityClaim')).toHaveLength(2);
    const duplicate = await f.payment('after-reversal');
    expect(duplicate.confirmed.requestState).toBe('REVIEW_REQUIRED');
    expect(await store.list('FinancialPaymentBalance')).toHaveLength(1);
  });
  it('배분을 이미 소비한 입금은 확인 정정으로 원금을 재생성하지 않는다', async () => {
    const { receipt } = await allocated();
    f.registerTruth('claimed-correction', '200');
    await expect(
      f.financial.correctPaymentEvidence(
        await f.actor(),
        {
          meta: f.meta(3),
          targetScope: f.targetScope,
          paymentEvidenceRef: receipt.targetRef!,
          correctionKind: 'CONFIRM',
          sourceEvidence: f.evidence('claimed-correction'),
          identity: f.identity(),
          amount: u4Money('200'),
          actualPaidAt: f.seller.now().toISOString(),
        },
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_PAYMENT_CONSUMED' });
    expect(
      await store.currentProtected('FinancialPaymentBalance', receipt.targetRef!.id),
    ).toMatchObject({ principal: u4Money('100'), allocatedPrincipal: u4Money('100') });
  });
  async function consumedPortion(confirmed: boolean) {
    const result = await allocated();
    const portion = {
      portionKey: 'synthetic-portion',
      paymentEvidenceRef: result.receipt.targetRef!,
      allocationRef: result.allocation,
      invoiceRef: result.invoices[0]!,
      amount: u4Money('20'),
      operationId: 'synthetic-operation',
      attemptId: 'synthetic-attempt',
      currentResult: {
        portionKey: 'synthetic-portion',
        operationId: 'synthetic-operation',
        attemptId: 'synthetic-attempt',
        succeeded: u4Money(confirmed ? '20' : '0'),
        failed: u4Money('0'),
        unknown: u4Money(confirmed ? '0' : '20'),
        pending: u4Money('0'),
        resultRevision: 1,
        actualResultIdentity: confirmed ? f.identity('synthetic-refund-result') : null,
      },
      priorAttempts: [],
    };
    // 후속 환불 명령의 성공 시험이 아니다. 금융 원금 소비 경계용 보호된 합성 결과 원상만 준비한다.
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => {
        await scope.transaction.put('RefundCase', {
          modelVersion: 1,
          refundCaseId: 'synthetic-refund',
          approvalRootId: 'synthetic-root',
          afterSalesDecisionRef: u4Ref(
            'AfterSalesDecision',
            'AfterSalesDecisionRecord',
            'synthetic-decision',
          ),
          orderRef: f.orderRef,
          paymentEvidenceRefs: [result.receipt.targetRef!],
          allocationRefs: [result.allocation],
          agreedLimit: u4Money('20'),
          requestedAmount: u4Money('20'),
          portions: [portion],
          actualResultRefs: [],
          lifecycle: confirmed ? 'COMPLETED' : 'UNKNOWN',
          revision: 1,
          targetScope: f.targetScope,
          knowledge: 'KNOWN',
          historyRefs: [],
        });
        await scope.transaction.put('FinancialApprovalBalance', {
          modelVersion: 1,
          approvalRootId: 'synthetic-root',
          approvalRef: u4Ref(
            'AfterSalesDecision',
            'AfterSalesDecisionRecord',
            'synthetic-decision',
          ),
          limit: u4Money('20'),
          confirmed: u4Money(confirmed ? '20' : '0'),
          reserved: u4Money(confirmed ? '0' : '20'),
          revision: 1,
        });
        const payment = (await scope.optional(
          'FinancialPaymentBalance',
          result.receipt.targetRef!.id,
        ))!;
        const invoice = (await scope.optional('FinancialInvoiceBalance', result.invoices[0]!.id))!;
        await scope.transaction.put(
          'FinancialPaymentBalance',
          {
            ...payment,
            allocatedRefunded: u4Money(confirmed ? '20' : '0'),
            allocatedReserved: u4Money(confirmed ? '0' : '20'),
            revision: Number(payment.revision) + 1,
          },
          Number(payment.revision),
        );
        await scope.transaction.put(
          'FinancialInvoiceBalance',
          {
            ...invoice,
            refunded: u4Money(confirmed ? '20' : '0'),
            reserved: u4Money(confirmed ? '0' : '20'),
            revision: Number(invoice.revision) + 1,
          },
          Number(invoice.revision),
        );
      },
    );
    await expect(
      f.financial.reverseAllocation(
        await f.actor(),
        {
          meta: f.meta(1),
          targetScope: f.targetScope,
          orderRef: f.orderRef,
          allocationRef: result.allocation,
          sourceEvidence: f.evidence(),
        },
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_ALLOCATION_CONSUMED' });
    expect(await store.currentProtected('PaymentAllocation', result.allocation.id)).toMatchObject({
      effect: 'APPLIED',
      revision: 1,
    });
    expect(
      await store.currentProtected('FinancialPaymentBalance', result.receipt.targetRef!.id),
    ).toMatchObject({
      principal: u4Money('100'),
      allocatedPrincipal: u4Money('100'),
      allocatedRefunded: u4Money(confirmed ? '20' : '0'),
      allocatedReserved: u4Money(confirmed ? '0' : '20'),
    });
    expect(await store.list('FinancialIdentityClaim')).toHaveLength(2);
  }
  it('불명 환불로 예약된 원금을 배분 정정으로 가용 현금에 되돌리지 않는다', async () => {
    await consumedPortion(false);
  });
  it('확정 환불한 원금을 배분 정정으로 새 현금에 되돌리지 않는다', async () => {
    await consumedPortion(true);
  });
});
