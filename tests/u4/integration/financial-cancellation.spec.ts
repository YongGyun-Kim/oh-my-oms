import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ref, U4ApplyPlanInput } from '@oms/contracts';
import { CommercialAgreement, U4PlanProposal } from '@oms/core';
import type { U3AfterSalesRegistration } from '@oms/core';
import { persistenceFixture } from '../fixtures/persistence.js';
import { seedU4FinancialFlow } from '../fixtures/financial-flow.js';
import { syntheticCommercialEvidence } from '../../u3/fixtures/agreement.js';
import { agreementApprovalInput } from '../../u3/fixtures/agreement-input.js';
import { u4Money, u4Ref } from '../fixtures/contracts.js';

describe('처음 합의한 비중첩 유효 구간의 승인·동의 후 청구 취소', () => {
  const { store } = persistenceFixture();
  afterEach(() => vi.useRealTimers());
  async function changed(consumed = false) {
    // 기존 무기한 구간을 뒤에서 수정하지 않는다. 처음 등록할 때부터 종료를 합의한다.
    const endAt = new Date(Date.now() + 60000).toISOString();
    const f = await seedU4FinancialFlow(store, endAt);
    const agreementEvidence = f.plan.obligations[0]!.agreementEvidenceRefs;
    const invoice = (
      await f.financial.registerInvoice(await f.actor(), await f.invoiceInput(0), f.ingress)
    ).targetRef!;
    let payment: Ref | null = null;
    if (consumed) {
      const paid = await f.payment();
      payment = paid.confirmed.targetRef!;
      await f.financial.allocatePaymentBatch(
        await f.actor(),
        f.allocationInput(payment, [invoice], ['20']),
        f.ingress,
      );
    }
    const original = (await store.currentProtected('Invoice', invoice.id))!;
    const originalBalance = await store.currentProtected('FinancialInvoiceBalance', invoice.id);
    // Date만 바꾼 격리 clock이다. timer/DB/보호 저장과 원본 검증을 대체하지 않는다.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(endAt) + 1));
    const newInput = f.input();
    newInput.meta = f.meta();
    newInput.contractRef = null;
    newInput.effectiveWindow = {
      ...newInput.effectiveWindow,
      startAt: endAt,
      endAt: null,
      startInclusive: true,
      endInclusive: false,
    };
    newInput.productRefs = [f.productRef];
    newInput.commercialTermsRef = f.offerRef;
    newInput.provisionTermsRef = f.offerRef;
    newInput.conditions = [
      {
        conditionKey: 'PAYMENT',
        value: { mode: 'POSTPAY', termsRef: f.offerRef },
        effectiveWindow: newInput.effectiveWindow,
        evidenceRefs: agreementEvidence,
      },
    ];
    const registered = await new CommercialAgreement(
      store,
      f.seller.now,
      async (proof) => proof === f.ingress,
      syntheticCommercialEvidence,
    ).register(await f.actor(), newInput, f.ingress);
    const draft = f.planDraft();
    draft.obligations = [
      {
        ...draft.obligations[0]!,
        obligationKey: 'after-confirmation',
        label: '추후 합의 지급',
        amount: u4Money('1000'),
        requiredBeforeProvision: false,
      },
    ];
    const planned = await f.plans.register(
      await f.actor(),
      {
        meta: f.meta(registered.targetRef!.revision),
        enterpriseRef: f.seller.enterpriseRef,
        sourceAgreementRevisionRef: registered.targetRef!,
        planDraft: draft,
      },
      f.ingress,
    );
    const approved = await f.plans.approve(
      await f.requestContext(f.approver),
      agreementApprovalInput(planned.targetRef!, agreementEvidence),
      f.ingress,
    );
    const proposed = await f.proposals.create(
      await f.actor(),
      await f.proposalInput(f.orderRef, approved.targetRef!),
      f.ingress,
    );
    await f.grantConsent();
    const consented = await f.proposals.consent(
      await f.requestContext(f.seller.customer),
      await f.consentInput(proposed.targetRef!),
    );
    const consent = consented.resultRefs.find(
      (reference) => reference.entity === 'CustomerConsent',
    )!;
    const decision = u4Ref(
      'AfterSalesDecision',
      'AfterSalesDecisionRecord',
      'synthetic-cancel-change',
    );
    const registration: U3AfterSalesRegistration = {
      kind: 'LOCAL_SYNTHETIC',
      ownerRegistration: 'synthetic-cancel-u7',
      async readAfterSalesFacts(binding) {
        const request = u4Ref(
          'AfterSalesDecision',
          'AfterSalesRequest',
          'synthetic-cancel-request',
        );
        return {
          binding,
          facts: {
            knowledge: 'KNOWN',
            data: {
              requestRef: request,
              orderRef: binding.orderRef,
              decisionRef: binding.decisionRef,
              decision: 'ALLOW',
              holdBasisRef: null,
              actualResultRefs: [],
              remainingActionRefs: [],
            },
            sourceRefs: [request, binding.decisionRef, binding.orderRef],
            observedAt: f.seller.now().toISOString(),
          },
          expiresAt: new Date(f.seller.now().getTime() + 30000).toISOString(),
        };
      },
    };
    const application: U4ApplyPlanInput = {
      meta: f.meta(f.orderRef.revision),
      targetScope: f.targetScope,
      orderRef: f.orderRef,
      customerConsentRef: consent,
      newTermsRef: approved.targetRef!,
      changeKind: 'ACCEPTED_AFTERSALES_CHANGE',
      afterSalesDecisionRef: decision,
    };
    const applied = await new U4PlanProposal(f.adapter, registration).apply(
      await f.actor(),
      application,
      f.ingress,
    );
    const cancel = {
      meta: f.meta(invoice.revision),
      targetScope: f.targetScope,
      orderRef: applied.targetRef!,
      invoiceRef: invoice,
      sourceEvidence: f.evidence(),
    };
    return { ...f, invoice, original, originalBalance, payment, cancel };
  }
  it('새 승인·고객 동의·적용으로 제거된 미소비 의무만 같은 invoiceId로 취소한다', async () => {
    const f = await changed();
    await expect(
      f.commands(true, false).cancelInvoice(await f.actor(), f.cancel, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_IMPACT_UNVERIFIED' });
    const receipt = await f.financial.cancelInvoice(await f.actor(), f.cancel, f.ingress);
    expect(receipt.targetRef).toMatchObject({ id: f.invoice.id, revision: 2 });
    const current = (await store.currentProtected('Invoice', f.invoice.id))!;
    expect(current).toMatchObject({
      lifecycle: 'CANCELLED',
      correctionOf: f.invoice,
      amount: f.original.amount,
    });
    const bindings = await store.list('FinancialInvoiceBinding');
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      invoiceRef: null,
      obligationKey: f.original.obligationKey,
      revision: 2,
    });
    expect(await store.currentProtected('FinancialInvoiceBalance', f.invoice.id)).toEqual(
      f.originalBalance,
    );
    const history = (await store.currentProtected(
      'FinancialHistory',
      receipt.resultRefs.find((reference) => reference.entity === 'FinancialHistory')!.id,
    ))!;
    expect(history.correctionOf).toEqual((f.original.historyRefs as Ref[]).at(-1));
    expect(await store.list('PaymentEvidence')).toHaveLength(0);
    expect(await store.list('PaymentAllocation')).toHaveLength(0);
    expect(await store.list('Invoice')).toHaveLength(1);
    expect(
      (await store.currentProtected('Order', f.cancel.orderRef.id))!.paymentPlan,
    ).toMatchObject({ total: u4Money('1000') });
  });
  it('새 계획이 의무를 제거해도 이미 순배분한 원금이 있으면 취소하지 않는다', async () => {
    const f = await changed(true);
    await expect(
      f.financial.cancelInvoice(await f.actor(), f.cancel, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_INVOICE_CONSUMED' });
    expect(await store.currentProtected('Invoice', f.invoice.id)).toEqual(f.original);
    expect(await store.currentProtected('FinancialInvoiceBalance', f.invoice.id)).toEqual(
      f.originalBalance,
    );
    expect(await store.currentProtected('FinancialPaymentBalance', f.payment!.id)).toMatchObject({
      principal: u4Money('100'),
      allocatedPrincipal: u4Money('20'),
    });
    expect(await store.list('PaymentAllocation')).toHaveLength(1);
  });
});
