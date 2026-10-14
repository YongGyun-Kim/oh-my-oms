import { beforeEach, describe, expect, it } from 'vitest';
import { StaffAccess } from '@oms/core';
import type { Ref } from '@oms/contracts';
import { U4Transaction, ProtectedTransaction } from '@oms/persistence';
import { persistenceFixture, financialRequest } from '../fixtures/persistence.js';
import { seedU4FinancialFlow } from '../fixtures/financial-flow.js';
import { u4Money, u4Ref } from '../fixtures/contracts.js';

describe('명시 잘못된 주문 연결 정정의 현재 원본·권한·원금 보존', () => {
  const { store, sources, repository } = persistenceFixture();
  let f: Awaited<ReturnType<typeof seedU4FinancialFlow>>;
  beforeEach(async () => {
    f = await seedU4FinancialFlow(store);
  });
  async function prepared() {
    const paid = await f.payment(),
      other = await f.acceptedOrder();
    const input = {
      meta: f.meta(2),
      targetScope: f.targetScope,
      paymentEvidenceRef: paid.confirmed.targetRef!,
      previousOrderRef: f.orderRef,
      orderRef: other,
      sourceEvidence: f.evidence('u4-synthetic-payment'),
    };
    return { paid, other, input };
  }
  it('정확한 명시 정정과 재전송은 현재 binding 하나·현금/claims 불변·이력 한 번을 보존한다', async () => {
    const { paid, other, input } = await prepared();
    const balance = await store.currentProtected(
      'FinancialPaymentBalance',
      paid.confirmed.targetRef!.id,
    );
    const claims = await store.list('FinancialIdentityClaim');
    const receipt = await f.financial.correctPaymentBinding(await f.actor(), input, f.ingress);
    expect(receipt.targetRef).toMatchObject({ id: paid.confirmed.targetRef!.id, revision: 3 });
    expect(await f.financial.correctPaymentBinding(await f.actor(), input, f.ingress)).toEqual(
      receipt,
    );
    expect(
      await store.currentProtected('FinancialPaymentBinding', receipt.targetRef!.id),
    ).toMatchObject({ orderRef: other, revision: 2 });
    expect(await store.currentProtected('PaymentEvidence', receipt.targetRef!.id)).toMatchObject({
      boundOrderRef: other,
      revision: 3,
    });
    expect(await store.currentProtected('FinancialPaymentBalance', receipt.targetRef!.id)).toEqual(
      balance,
    );
    expect(await store.list('FinancialIdentityClaim')).toEqual(claims);
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'correctPaymentBinding' } }),
    ).toHaveLength(1);
    const history = (await store.currentProtected(
      'FinancialHistory',
      receipt.resultRefs.find((reference) => reference.entity === 'FinancialHistory')!.id,
    ))!;
    const before = (await store.readRevision('PaymentEvidence', paid.confirmed.targetRef!.id, 2))!;
    expect(history).toMatchObject({
      beforeRef: paid.confirmed.targetRef,
      afterRef: receipt.targetRef,
      correctionOf: (before.historyRefs as Ref[]).at(-1),
    });
  });
  it('정상 반전 이력을 보존한 명시 정정 후 새 주문에 배분하고 과거 주문은 다시 소비하지 않는다', async () => {
    const invoices = await f.invoices(),
      paid = await f.payment();
    const allocated = await f.financial.allocatePaymentBatch(
      await f.actor(),
      f.allocationInput(paid.confirmed.targetRef!, invoices),
      f.ingress,
    );
    const allocations = allocated.resultRefs.filter(
      (reference) => reference.entity === 'PaymentAllocation',
    );
    for (const allocationRef of allocations)
      await f.financial.reverseAllocation(
        await f.actor(),
        {
          meta: f.meta(1),
          targetScope: f.targetScope,
          orderRef: f.orderRef,
          allocationRef,
          sourceEvidence: f.evidence(),
        },
        f.ingress,
      );
    const other = await f.acceptedOrder();
    const changed = await f.financial.correctPaymentBinding(
      await f.actor(),
      {
        meta: f.meta(3),
        targetScope: f.targetScope,
        paymentEvidenceRef: allocated.targetRef!,
        previousOrderRef: f.orderRef,
        orderRef: other,
        sourceEvidence: f.evidence('u4-synthetic-payment'),
      },
      f.ingress,
    );
    const newInvoice = (
      await f.financial.registerInvoice(await f.actor(), await f.invoiceInput(0, other), f.ingress)
    ).targetRef!;
    const result = await f.financial.allocatePaymentBatch(
      await f.actor(),
      f.allocationInput(changed.targetRef!, [newInvoice], ['1'], other),
      f.ingress,
    );
    expect(
      await store.currentProtected('FinancialPaymentBalance', result.targetRef!.id),
    ).toMatchObject({ principal: u4Money('100'), allocatedPrincipal: u4Money('1') });
    const history = await store.list('PaymentAllocation');
    expect(history).toHaveLength(3);
    expect(history.filter((row) => row.effect === 'REVERSED')).toHaveLength(2);
    for (const allocationRef of allocations)
      expect(await store.currentProtected('PaymentAllocation', allocationRef.id)).toMatchObject({
        orderRef: f.orderRef,
        effect: 'REVERSED',
        revision: 2,
      });
    await expect(
      f.financial.allocatePaymentBatch(
        await f.actor(),
        f.allocationInput(result.targetRef!, [invoices[0]!], ['1']),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_PAYMENT_BOUND_OTHER_ORDER' });
  });
  it('순지급0이어도 확정 환불의 원래 L/RA 소비를 연결 정정으로 지우지 않는다', async () => {
    const { paid, other } = await prepared();
    const invoice = (await f.invoices())[0]!;
    const allocated = await f.financial.allocatePaymentBatch(
      await f.actor(),
      f.allocationInput(paid.confirmed.targetRef!, [invoice], ['20']),
      f.ingress,
    );
    const allocationRef = allocated.resultRefs.find(
      (reference) => reference.entity === 'PaymentAllocation',
    )!;
    // 환불 구현 성공을 뜻하지 않는 보호된 합성 소비 원상이다. 순지급0과 원래 소비0을 구별한다.
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => {
        const current = await scope.optional(
          'FinancialPaymentBalance',
          paid.confirmed.targetRef!.id,
        );
        const invoiceBalance = await scope.optional('FinancialInvoiceBalance', invoice.id);
        await scope.transaction.put(
          'FinancialPaymentBalance',
          { ...current!, allocatedRefunded: u4Money('20'), revision: 3 },
          2,
        );
        await scope.transaction.put(
          'FinancialInvoiceBalance',
          { ...invoiceBalance!, refunded: u4Money('20'), revision: 3 },
          2,
        );
        await scope.transaction.put('RefundCase', {
          modelVersion: 1,
          refundCaseId: 'synthetic-binding-refund',
          approvalRootId: 'synthetic-root',
          afterSalesDecisionRef: u4Ref(
            'AfterSalesDecision',
            'AfterSalesDecisionRecord',
            'synthetic-decision',
          ),
          orderRef: f.orderRef,
          paymentEvidenceRefs: [allocated.targetRef!],
          allocationRefs: [allocationRef],
          agreedLimit: u4Money('20'),
          requestedAmount: u4Money('20'),
          portions: [
            {
              portionKey: 'portion',
              paymentEvidenceRef: allocated.targetRef!,
              allocationRef,
              invoiceRef: invoice,
              amount: u4Money('20'),
              operationId: 'operation',
              attemptId: 'attempt',
              currentResult: {
                portionKey: 'portion',
                operationId: 'operation',
                attemptId: 'attempt',
                succeeded: u4Money('20'),
                failed: u4Money('0'),
                unknown: u4Money('0'),
                pending: u4Money('0'),
                resultRevision: 1,
                actualResultIdentity: f.identity('synthetic-refund'),
              },
              priorAttempts: [],
            },
          ],
          actualResultRefs: [],
          lifecycle: 'COMPLETED',
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
          confirmed: u4Money('20'),
          reserved: u4Money('0'),
          revision: 1,
        });
      },
    );
    await expect(
      f.financial.correctPaymentBinding(
        await f.actor(),
        {
          meta: f.meta(3),
          targetScope: f.targetScope,
          paymentEvidenceRef: allocated.targetRef!,
          previousOrderRef: f.orderRef,
          orderRef: other,
          sourceEvidence: f.evidence('u4-synthetic-payment'),
        },
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_PAYMENT_CONSUMED' });
    expect(
      await store.currentProtected('FinancialPaymentBinding', paid.confirmed.targetRef!.id),
    ).toMatchObject({ orderRef: f.orderRef });
    expect(
      await store.currentProtected('FinancialPaymentBalance', paid.confirmed.targetRef!.id),
    ).toMatchObject({ allocatedPrincipal: u4Money('20'), allocatedRefunded: u4Money('20') });
  });
  it('현재 금융 권한이 회수되면 연결 정정을 기록하지 않는다', async () => {
    const { input } = await prepared();
    await new StaffAccess(store, f.seller.now).grantRole(await f.requestContext(f.seller.staff), {
      ...f.grantInput,
      meta: f.meta(f.grant.targetRef!.revision),
      decision: 'REVOKE',
    });
    await expect(
      f.financial.correctPaymentBinding(await f.actor(), input, f.ingress),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'correctPaymentBinding' } }),
    ).toHaveLength(0);
  });
  it('다른 기업 주문·범위는 명시 정정 입력으로도 연결하지 않는다', async () => {
    const { input } = await prepared();
    const targetScope = {
      ...f.targetScope,
      enterpriseRef: f.reviewer.enterpriseRef,
      contextPolicyRef: f.reviewer.enterpriseRef,
      organisationRevision: f.reviewer.enterpriseRef.revision,
    };
    await expect(
      f.financial.correctPaymentBinding(await f.actor(), { ...input, targetScope }, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_FINANCIAL_SCOPE' });
    expect(
      await store.currentProtected('FinancialPaymentBinding', input.paymentEvidenceRef.id),
    ).toMatchObject({ orderRef: f.orderRef });
  });
  it('미등록 실제 이행 영향·은행 원본은 연결 이동을 HOLD한다', async () => {
    const { input } = await prepared();
    await expect(
      f.commands(true, false).correctPaymentBinding(await f.actor(), input, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_IMPACT_UNVERIFIED' });
    await expect(
      f.commands(false).correctPaymentBinding(await f.actor(), input, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_SOURCE_UNVERIFIED' });
    expect(
      await store.currentProtected('PaymentEvidence', input.paymentEvidenceRef.id),
    ).toMatchObject({ boundOrderRef: f.orderRef, revision: 2 });
  });
  it('이전 주문·입금의 stale 개정은 직원 임의 추정으로 바꾸지 않는다', async () => {
    const { input } = await prepared();
    await expect(
      f.financial.correctPaymentBinding(
        await f.actor(),
        { ...input, previousOrderRef: { ...input.previousOrderRef, revision: 1 } },
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'STALE_U4_REFERENCE' });
    await expect(
      f.financial.correctPaymentBinding(
        await f.actor(),
        {
          ...input,
          meta: f.meta(1),
          paymentEvidenceRef: { ...input.paymentEvidenceRef, revision: 1 },
        },
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'STALE_U4_REFERENCE' });
  });
  it('과거 REVERSED 주문 귀속을 위조한 보호 응답도 원래 이력 대조에서 거절한다', async () => {
    const invoices = await f.invoices(),
      paid = await f.payment();
    const allocated = await f.financial.allocatePaymentBatch(
      await f.actor(),
      f.allocationInput(paid.confirmed.targetRef!, [invoices[0]!], ['20']),
      f.ingress,
    );
    const allocationRef = allocated.resultRefs.find(
      (reference) => reference.entity === 'PaymentAllocation',
    )!;
    await f.financial.reverseAllocation(
      await f.actor(),
      {
        meta: f.meta(1),
        targetScope: f.targetScope,
        orderRef: f.orderRef,
        allocationRef,
        sourceEvidence: f.evidence(),
      },
      f.ingress,
    );
    const other = await f.acceptedOrder();
    const changed = await f.financial.correctPaymentBinding(
      await f.actor(),
      {
        meta: f.meta(3),
        targetScope: f.targetScope,
        paymentEvidenceRef: allocated.targetRef!,
        previousOrderRef: f.orderRef,
        orderRef: other,
        sourceEvidence: f.evidence('u4-synthetic-payment'),
      },
      f.ingress,
    );
    await expect(
      sources.primaryApp.transaction('READ COMMITTED', async (manager) => {
        await manager.query('SET TRANSACTION READ ONLY');
        const prefix = await manager.query(
          'SELECT epoch,commit_order FROM u1_protected_prefix ORDER BY epoch',
        );
        const transaction = new ProtectedTransaction(manager, store.schema);
        const scope = new U4Transaction(
          transaction,
          {
            epoch: await store.currentEpoch(),
            prefixes: prefix.map((row: { epoch: string; commit_order: string }) => ({
              epoch: row.epoch,
              commitOrder: Number(row.commit_order),
            })),
          },
          store.schema,
        );
        const payment = await scope.current(changed.targetRef!);
        const collection = scope.financialCollection.bind(scope);
        // 실제 원장을 읽은 뒤 소비자 경계의 손상된 반전 원상만 주입한다. DB/보호를 모의하지 않는다.
        scope.financialCollection = async (model, equals, deadline) => {
          const rows = await collection(model, equals, deadline);
          return model === 'PaymentAllocation'
            ? rows.map((row) => ({ ...row, orderRef: other }))
            : rows;
        };
        // 같은 현재 주문으로 위장한 경우는 current binding만으로는 원래 반전 이력을 검증할 수 없다.
        return f.financial.ledger.payment(scope, payment);
      }),
    ).rejects.toMatchObject({ code: 'U4_LEDGER_UNCONFIRMED' });
  });
});
