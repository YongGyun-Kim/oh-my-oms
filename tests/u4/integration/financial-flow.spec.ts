import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Ref } from '@oms/contracts';
import { StaffAccess } from '@oms/core';
import { persistenceFixture } from '../fixtures/persistence.js';
import { seedU4FinancialFlow } from '../fixtures/financial-flow.js';

describe('실제 금융 명령·직원 권위·원장/보호 저장 흐름', () => {
  const { store, sources } = persistenceFixture();
  let f: Awaited<ReturnType<typeof seedU4FinancialFlow>>;
  beforeEach(async () => {
    f = await seedU4FinancialFlow(store);
  });
  const balance = (payment: Ref) => store.currentProtected('FinancialPaymentBalance', payment.id);
  async function allocated() {
    const invoiceRefs = await f.invoices(),
      paid = await f.payment();
    const input = f.allocationInput(paid.confirmed.targetRef!, invoiceRefs);
    const receipt = await f.financial.allocatePaymentBatch(await f.actor(), input, f.ingress);
    return { invoiceRefs, paid, input, receipt };
  }
  it('미연결 확인 입금은 첫 수동 배분과 같은 변경에서 주문 하나에 결합한다', async () => {
    const invoices = await f.invoices(),
      paid = await f.payment('unbound', f.identity('unbound'), null);
    expect(
      await store.currentProtected('FinancialPaymentBinding', paid.confirmed.targetRef!.id),
    ).toMatchObject({ orderRef: null });
    const receipt = await f.financial.allocatePaymentBatch(
      await f.actor(),
      f.allocationInput(paid.confirmed.targetRef!, invoices),
      f.ingress,
    );
    expect(await store.currentProtected('PaymentEvidence', receipt.targetRef!.id)).toMatchObject({
      boundOrderRef: f.orderRef,
      revision: 3,
    });
    expect(
      await store.currentProtected('FinancialPaymentBinding', receipt.targetRef!.id),
    ).toMatchObject({ orderRef: f.orderRef });
    expect(await balance(receipt.targetRef!)).toMatchObject({
      principal: { value: '100' },
      allocatedPrincipal: { value: '100' },
    });
  });
  it('두 정상 기업의 새 후보도 같은 전역 실제 거래를 두 번 현금으로 만들지 않는다', async () => {
    const first = await f.payment('enterprise-a');
    const document = 'enterprise-b';
    f.registerTruth(document, '100', f.identity(), f.reviewer.enterpriseRef.id);
    const targetScope = {
      ...f.targetScope,
      enterpriseRef: f.reviewer.enterpriseRef,
      contextPolicyRef: f.reviewer.enterpriseRef,
      organisationRevision: f.reviewer.enterpriseRef.revision,
    };
    const input = {
      ...f.recordInput(document, null),
      enterpriseRef: f.reviewer.enterpriseRef,
      targetScope,
    };
    const review = await f.financial.recordPaymentEvidence(await f.actor(), input, f.ingress);
    const result = await f.financial.confirmPaymentEvidence(
      await f.actor(),
      { ...f.confirmInput(review.targetRef!, document), targetScope },
      f.ingress,
    );
    expect(result.requestState).toBe('REVIEW_REQUIRED');
    expect(await store.currentProtected('PaymentEvidence', review.targetRef!.id)).toMatchObject({
      enterpriseRef: f.reviewer.enterpriseRef,
      lifecycle: 'DISPUTED',
      identity: null,
    });
    expect(await balance(review.targetRef!)).toBeNull();
    expect(await store.list('FinancialPaymentBalance')).toHaveLength(1);
    expect(
      result.resultRefs.some((reference) => reference.id === first.confirmed.targetRef!.id),
    ).toBe(false);
    const reconciliation = (await store.currentProtected(
      'FinancialReconciliationCase',
      result.resultRefs.find((reference) => reference.entity === 'FinancialReconciliationCase')!.id,
    ))!;
    expect(reconciliation.affectedFactsRefs).toEqual([result.targetRef]);
    expect(await balance(first.confirmed.targetRef!)).toMatchObject({
      principal: { value: '100' },
      allocatedPrincipal: { value: '0' },
    });
  });
  it('청구200/800→입금100→60/40배분→원래 후보 접수 재전송을 정확히 보존한다', async () => {
    const { invoiceRefs, paid, receipt } = await allocated();
    expect(receipt.requestState).toBe('RESULT_RECORDED');
    expect(
      receipt.resultRefs.filter((reference) => reference.entity === 'PaymentAllocation'),
    ).toHaveLength(2);
    expect(await balance(paid.confirmed.targetRef!)).toMatchObject({
      principal: { value: '100' },
      allocatedPrincipal: { value: '100' },
    });
    for (const [index, expected] of ['60', '40'].entries())
      expect(
        await store.currentProtected('FinancialInvoiceBalance', invoiceRefs[index]!.id),
      ).toMatchObject({
        allocatedPrincipal: { value: expected },
        refunded: { value: '0' },
        reserved: { value: '0' },
      });
    const replay = await f.financial.recordPaymentEvidence(await f.actor(), paid.input, f.ingress);
    expect(replay).toEqual(paid.recorded);
    expect(replay.requestState).toBe('REVIEW_REQUIRED');
    expect(
      await store.currentProtected('PaymentEvidence', paid.recorded.targetRef!.id),
    ).toMatchObject({ lifecycle: 'CONFIRMED', revision: 3 });
    expect(await store.list('PaymentAllocation')).toHaveLength(2);
  });
  it('확인한 Account·실제 사람 검증 원본과 원자 접수/사실 이력을 연결한다', async () => {
    const input = await f.invoiceInput(0);
    const receipt = await f.financial.registerInvoice(await f.actor(), input, f.ingress);
    const historyRef = receipt.resultRefs.find(
      (reference) => reference.entity === 'FinancialHistory',
    )!;
    const history = (await store.currentProtected('FinancialHistory', historyRef.id))!;
    expect(history).toMatchObject({
      actorAccountId: f.registrant.actorAccountRef!.id,
      verifiedPersonRef: f.registrant.actorAccountRef,
      requestRef: receipt.requestId,
      beforeRef: null,
      afterRef: receipt.targetRef,
    });
    const facts = await store.list('FactEnvelope', {
      equals: { causationRequestId: receipt.requestId },
    });
    expect(facts).toHaveLength(1);
    const refs = facts[0]!.evidenceRefs as Ref[];
    expect(refs).toEqual(
      expect.arrayContaining([f.registrant.actorAccountRef, f.registrant.verifiedPersonRef]),
    );
    expect(refs.some((reference) => reference.entity === 'PersonVerification')).toBe(true);
    expect(await store.currentProtected('RequestReceipt', receipt.requestId)).toMatchObject({
      operation: 'registerInvoice',
      sourceContract: { registryVersion: 4 },
    });
  });
  it('미등록 은행 원본의 확인 요청은 REVIEW이며 원금/식별 예약이 없다', async () => {
    f.registerTruth('unregistered');
    const recorded = await f.financial.recordPaymentEvidence(
      await f.actor(),
      f.recordInput('unregistered'),
      f.ingress,
    );
    const receipt = await f
      .commands(false)
      .confirmPaymentEvidence(
        await f.actor(),
        f.confirmInput(recorded.targetRef!, 'unregistered'),
        f.ingress,
      );
    expect(receipt.requestState).toBe('REVIEW_REQUIRED');
    expect(await store.currentProtected('PaymentEvidence', recorded.targetRef!.id)).toMatchObject({
      lifecycle: 'REVIEW',
      identity: null,
      revision: 2,
    });
    expect(await balance(recorded.targetRef!)).toBeNull();
    expect(await store.list('FinancialIdentityClaim')).toHaveLength(0);
  });
  it('같은 실제 거래의 별도 요청·채널profile개정은 새 입금 대신 분쟁 기록이 된다', async () => {
    const first = await f.payment('original');
    const identity = f.identity();
    identity.sourceProfileRevision = 2;
    const second = await f.payment('different-channel', identity);
    expect(second.confirmed.requestState).toBe('REVIEW_REQUIRED');
    expect(
      await store.currentProtected('PaymentEvidence', second.confirmed.targetRef!.id),
    ).toMatchObject({ lifecycle: 'DISPUTED', identity: null });
    expect(await balance(second.confirmed.targetRef!)).toBeNull();
    expect(await balance(first.confirmed.targetRef!)).toMatchObject({
      principal: { value: '100' },
      allocatedPrincipal: { value: '0' },
    });
    expect(await store.list('FinancialPaymentBalance')).toHaveLength(1);
    expect(await store.list('FinancialReconciliationCase')).toHaveLength(1);
  });
  it('한 배분 항목의 한도 오류는 전체 배분·잔액·binding을 롤백한다', async () => {
    const invoiceRefs = await f.invoices(),
      paid = await f.payment();
    // 두 번째 청구에 이미 800원을 배분한 별도 실제 입금으로 잔여 한도를 만든다.
    f.registerTruth('large', '800', f.identity('large'));
    const record = f.recordInput('large');
    record.amount = { currency: 'KRW', value: '800' };
    const review = await f.financial.recordPaymentEvidence(await f.actor(), record, f.ingress);
    const large = await f.financial.confirmPaymentEvidence(
      await f.actor(),
      f.confirmInput(review.targetRef!, 'large'),
      f.ingress,
    );
    await f.financial.allocatePaymentBatch(
      await f.actor(),
      f.allocationInput(large.targetRef!, [invoiceRefs[1]!], ['800']),
      f.ingress,
    );
    const before = await balance(paid.confirmed.targetRef!);
    await expect(
      f.financial.allocatePaymentBatch(
        await f.actor(),
        f.allocationInput(paid.confirmed.targetRef!, invoiceRefs),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_INVOICE_LIMIT' });
    expect(await balance(paid.confirmed.targetRef!)).toEqual(before);
    expect(
      await store.currentProtected('FinancialInvoiceBalance', invoiceRefs[0]!.id),
    ).toMatchObject({ allocatedPrincipal: { value: '0' } });
    expect(await store.list('PaymentAllocation')).toHaveLength(1);
    expect(
      await store.currentProtected('PaymentEvidence', paid.confirmed.targetRef!.id),
    ).toMatchObject({ revision: 2 });
  });
  it('한 주문에 소비한 입금을 다른 주문으로 나눠 배분하지 않는다', async () => {
    const { receipt } = await allocated();
    const other = await f.acceptedOrder();
    const invoice = await f.financial.registerInvoice(
      await f.actor(),
      await f.invoiceInput(0, other),
      f.ingress,
    );
    await expect(
      f.financial.allocatePaymentBatch(
        await f.actor(),
        f.allocationInput(receipt.targetRef!, [invoice.targetRef!], ['1'], other),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_PAYMENT_BOUND_OTHER_ORDER' });
    expect(await store.list('PaymentAllocation')).toHaveLength(2);
  });
  it('다른 기업 범위를 입력으로 덮어써도 청구·대금을 변경하지 않는다', async () => {
    const paid = await f.payment();
    const forged = f.confirmInput(paid.confirmed.targetRef!);
    forged.targetScope = {
      ...f.targetScope,
      enterpriseRef: f.reviewer.enterpriseRef,
      contextPolicyRef: f.reviewer.enterpriseRef,
      organisationRevision: f.reviewer.enterpriseRef.revision,
    };
    await expect(
      f.financial.confirmPaymentEvidence(await f.actor(), forged, f.ingress),
    ).rejects.toThrow();
    expect(
      await store.currentProtected('PaymentEvidence', paid.confirmed.targetRef!.id),
    ).toMatchObject({ revision: 2, enterpriseRef: f.seller.enterpriseRef });
  });
  it('현재 금융 권한을 회수하면 원래 성공 접수의 재전송도 거절한다', async () => {
    const paid = await f.payment();
    await new StaffAccess(store, f.seller.now).grantRole(await f.requestContext(f.seller.staff), {
      ...f.grantInput,
      meta: f.meta(f.grant.targetRef!.revision),
      decision: 'REVOKE',
    });
    await expect(
      f.financial.recordPaymentEvidence(await f.actor(), paid.input, f.ingress),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    expect(await store.list('PaymentEvidence')).toHaveLength(1);
  });
  it('실제 사람 검증이 철회되면 현재 역할이 있어도 금융을 기록하지 않는다', async () => {
    const checks = await store.list('PersonVerification', {
      equals: { personLinkRef: { id: f.registrant.verifiedPersonRef!.id } },
    });
    const check = checks[0]!;
    await store.execute(
      {
        principalId: 'synthetic-person-authority',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'synthetic-proof-revoke',
        target: null,
        idempotencyKey: randomUUID(),
        input: { synthetic: true },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (transaction) => {
        await transaction.put(
          'PersonVerification',
          { ...check, state: 'REVOKED', revision: Number(check.revision) + 1 },
          Number(check.revision),
        );
      },
    );
    await expect(
      f.financial.registerInvoice(await f.actor(), await f.invoiceInput(0), f.ingress),
    ).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    expect(await store.list('Invoice')).toHaveLength(0);
  });
  it('배분 정정은 원래 이력·식별을 보존하고 원금은 늘리지 않는다', async () => {
    const { receipt, paid } = await allocated();
    const allocationRef = receipt.resultRefs.find(
      (reference) => reference.entity === 'PaymentAllocation',
    )!;
    const original = (await store.currentProtected('PaymentAllocation', allocationRef.id))!;
    const corrected = await f.financial.reverseAllocation(
      await f.actor(),
      {
        meta: f.meta(allocationRef.revision),
        targetScope: f.targetScope,
        orderRef: f.orderRef,
        allocationRef,
        sourceEvidence: f.evidence(),
      },
      f.ingress,
    );
    expect(corrected.targetRef).toMatchObject({ id: allocationRef.id, revision: 2 });
    expect(await store.currentProtected('PaymentAllocation', allocationRef.id)).toMatchObject({
      effect: 'REVERSED',
      correctionOf: allocationRef,
    });
    expect(await balance(paid.confirmed.targetRef!)).toMatchObject({
      principal: { value: '100' },
      allocatedPrincipal: { value: '40' },
    });
    const history = (await store.currentProtected(
      'FinancialHistory',
      corrected.resultRefs.find((reference) => reference.entity === 'FinancialHistory')!.id,
    ))!;
    expect(history.correctionOf).toEqual((original.historyRefs as Ref[]).at(-1));
    expect(await store.list('FinancialIdentityClaim')).toHaveLength(2);
  });
  it('미등록 실제 제공 영향은 배분 정정을 HOLD하고 원래 소비를 보존한다', async () => {
    const { receipt, paid } = await allocated();
    const allocationRef = receipt.resultRefs.find(
      (reference) => reference.entity === 'PaymentAllocation',
    )!;
    await expect(
      f.commands(true, false).reverseAllocation(
        await f.actor(),
        {
          meta: f.meta(1),
          targetScope: f.targetScope,
          orderRef: f.orderRef,
          allocationRef,
          sourceEvidence: f.evidence(),
        },
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_IMPACT_UNVERIFIED' });
    expect(await store.currentProtected('PaymentAllocation', allocationRef.id)).toMatchObject({
      effect: 'APPLIED',
      revision: 1,
    });
    expect(await balance(paid.confirmed.targetRef!)).toMatchObject({
      allocatedPrincipal: { value: '100' },
    });
  });
  it('현재 승인 계획의 의무를 직원 취소로 면제하지 않는다', async () => {
    const invoiceRefs = await f.invoices();
    await expect(
      f.financial.cancelInvoice(
        await f.actor(),
        {
          meta: f.meta(1),
          targetScope: f.targetScope,
          orderRef: f.orderRef,
          invoiceRef: invoiceRefs[0]!,
          sourceEvidence: f.evidence(),
        },
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_OBLIGATION_STILL_REQUIRED' });
    expect(await store.currentProtected('Invoice', invoiceRefs[0]!.id)).toMatchObject({
      lifecycle: 'ISSUED',
      revision: 1,
    });
  });
  it('primary의 미보호 금액 변경은 배분 원금으로 쓰지 않는다', async () => {
    const invoices = await f.invoices(),
      paid = await f.payment();
    await sources.primaryAdmin
      .getRepository('PaymentEvidence')
      .update(
        { paymentEvidenceId: paid.confirmed.targetRef!.id },
        { amount: { currency: 'KRW', value: '200' } },
      );
    await expect(
      f.financial.allocatePaymentBatch(
        await f.actor(),
        f.allocationInput(paid.confirmed.targetRef!, invoices),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'CURRENT_U4_NOT_PROTECTED' });
    expect(await store.list('PaymentAllocation')).toHaveLength(0);
  });
});
