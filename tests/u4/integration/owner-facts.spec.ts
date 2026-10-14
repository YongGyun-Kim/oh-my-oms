import { beforeEach, describe, expect, it } from 'vitest';
import type { Ref } from '@oms/contracts';
import { StaffAccess, U4Eligibility, U4InvoiceDue, U4OwnerSources, u4KstDueDate } from '@oms/core';
import { seedU4OwnerFacts } from '../fixtures/owner-facts.js';
import { persistenceFixture } from '../fixtures/persistence.js';

describe('현재 목적별 금융 판단·실제 완료 기산·직원 제한의 보호 경로', () => {
  const { store, sources, repository } = persistenceFixture();
  let f: Awaited<ReturnType<typeof seedU4OwnerFacts>>;
  beforeEach(async () => {
    f = await seedU4OwnerFacts(store);
  });
  const row = (model: string, reference: Ref) => store.currentProtected(model, reference.id);
  async function provisionPaid() {
    const invoices = await f.invoices();
    // payment의 첫 인수는 금액이 아니라 문서 식별자다. 실제200원 원본을 별도로 준비한다.
    const document = 'synthetic-provision-payment';
    f.registerTruth(document, '200', f.identity('synthetic-provision-transaction'));
    const input = f.recordInput(document);
    input.amount = { currency: 'KRW', value: '200' };
    const recorded = await f.financial.recordPaymentEvidence(await f.actor(), input, f.ingress);
    const confirmed = await f.financial.confirmPaymentEvidence(
      await f.actor(),
      f.confirmInput(recorded.targetRef!, document),
      f.ingress,
    );
    const payment = { input, recorded, confirmed };
    expect(await row('FinancialPaymentBalance', confirmed.targetRef!)).toMatchObject({
      principal: { value: '200' },
      allocatedPrincipal: { value: '0' },
    });
    await f.financial.allocatePaymentBatch(
      await f.actor(),
      f.allocationInput(payment.confirmed.targetRef!, [invoices[0]!], ['200']),
      f.ingress,
    );
    expect(await row('FinancialPaymentBalance', confirmed.targetRef!)).toMatchObject({
      principal: { value: '200' },
      allocatedPrincipal: { value: '200' },
    });
    return { invoices, payment };
  }
  async function currentRecord(reference: Ref, purpose: 'SALE_ACCEPTANCE' | 'PROVISION') {
    const input = await f.eligibilityInput(purpose);
    return repository.read((scope) => f.eligibility.currentRecorded(scope, reference, input));
  }
  it('직원 전체 수락 전 REVIEW 주문은 청구·입금 없이 SALE_ACCEPTANCE만 평가한다', async () => {
    const submitted = await f
      .orders()
      .submit(await f.requestContext(f.seller.customer), await f.orderInput(f.approved.targetRef!));
    const input = await f.eligibilityInput('SALE_ACCEPTANCE', submitted.targetRef!);
    const before = await sources.primaryAdmin.query(
      'SELECT count(*)::integer AS count FROM u1_request_receipt',
    );
    const view = await f.eligibility.assessEligibility(await f.actor(), input, f.ingress);
    expect(view).toMatchObject({
      decision: 'ALLOW',
      assessmentPurpose: 'SALE_ACCEPTANCE',
      orderRef: submitted.targetRef,
    });
    expect(view).not.toHaveProperty('sourceRevision');
    expect(view).not.toHaveProperty('eligibilityRef');
    expect(
      await sources.primaryAdmin.query('SELECT count(*)::integer AS count FROM u1_request_receipt'),
    ).toEqual(before);
    const result = await f.eligibility.evaluateFinancialEligibility(
      await f.actor(),
      input,
      f.ingress,
    );
    expect(await row('FinancialEligibility', result.targetRef!)).toMatchObject({
      sourceRevision: 1,
      revision: 1,
      decision: 'ALLOW',
    });
    expect((await row('Order', submitted.targetRef!))!.state).toBe('REVIEW');
    const provision = {
      ...input,
      meta: f.meta(submitted.targetRef!.revision),
      assessmentPurpose: 'PROVISION' as const,
    };
    expect(
      (await f.eligibility.assessEligibility(await f.actor(), provision, f.ingress)).decision,
    ).toBe('UNVERIFIED');
  });
  it('미발행 필수 의무는 HOLD이며 제공 전200만 충족하면 후불800과 구분한다', async () => {
    const input = await f.eligibilityInput('PROVISION');
    expect(
      (await f.eligibility.assessEligibility(await f.actor(), input, f.ingress)).decision,
    ).toBe('HOLD');
    await provisionPaid();
    expect(
      (await f.eligibility.assessEligibility(await f.actor(), input, f.ingress)).decision,
    ).toBe('ALLOW');
    expect((await row('Order', f.orderRef))!.revision).toBe(f.orderRef.revision);
  });
  it('주문 개정이 같아도 지급만 변경되면 과거 금융 판단 원본을 재사용하지 않는다', async () => {
    const original = await f.eligibility.evaluateFinancialEligibility(
      await f.actor(),
      await f.eligibilityInput('PROVISION'),
      f.ingress,
    );
    expect((await currentRecord(original.targetRef!, 'PROVISION')).decision).toBe('HOLD');
    await provisionPaid();
    await expect(currentRecord(original.targetRef!, 'PROVISION')).rejects.toMatchObject({
      code: 'U4_ELIGIBILITY_STALE',
    });
    const current = await f.eligibility.evaluateFinancialEligibility(
      await f.actor(),
      await f.eligibilityInput('PROVISION'),
      f.ingress,
    );
    expect((await currentRecord(current.targetRef!, 'PROVISION')).decision).toBe('ALLOW');
    expect((await row('Order', f.orderRef))!.revision).toBe(f.orderRef.revision);
  });
  it('제한의 목적·명시 해제·원래 이력을 보존하고 같은 주문 개정의 stale ALLOW를 거절한다', async () => {
    const { payment } = await provisionPaid();
    const recorded = await f.eligibility.evaluateFinancialEligibility(
      await f.actor(),
      await f.eligibilityInput('PROVISION'),
      f.ingress,
    );
    const before = await row('FinancialPaymentBalance', payment.confirmed.targetRef!);
    const restricted = await f.eligibility.recordRestriction(
      await f.actor(),
      f.restrictionInput('RESTRICT'),
      f.ingress,
    );
    expect(
      (
        await f.eligibility.assessEligibility(
          await f.actor(),
          await f.eligibilityInput('PROVISION'),
          f.ingress,
        )
      ).decision,
    ).toBe('HOLD');
    expect(
      (
        await f.eligibility.assessEligibility(
          await f.actor(),
          await f.eligibilityInput('SALE_ACCEPTANCE'),
          f.ingress,
        )
      ).decision,
    ).toBe('ALLOW');
    await expect(currentRecord(recorded.targetRef!, 'PROVISION')).rejects.toMatchObject({
      code: 'U4_ELIGIBILITY_STALE',
    });
    const released = await f.eligibility.recordRestriction(
      await f.actor(),
      f.restrictionInput('RELEASE'),
      f.ingress,
    );
    expect(released.targetRef!.id).toBe(restricted.targetRef!.id);
    expect(released.targetRef!.revision).toBe(2);
    const histories = released.resultRefs.filter(
      (reference) => reference.entity === 'FinancialHistory',
    );
    expect(await row('FinancialHistory', histories[0]!)).toMatchObject({
      beforeRef: restricted.targetRef,
      afterRef: released.targetRef,
    });
    expect(
      (
        await f.eligibility.assessEligibility(
          await f.actor(),
          await f.eligibilityInput('PROVISION'),
          f.ingress,
        )
      ).decision,
    ).toBe('ALLOW');
    expect(await row('FinancialPaymentBalance', payment.confirmed.targetRef!)).toEqual(before);
  });
  it('일반 수동 명령은 증빙을 생략하지 못하고 계산은 조작한 sourceEvidence를 받지 않는다', async () => {
    const restriction = f.restrictionInput('RESTRICT');
    const { sourceEvidence: _evidence, ...missing } = restriction;
    expect(_evidence).toBeDefined();
    await expect(
      f.eligibility.recordRestriction(await f.actor(), missing as typeof restriction, f.ingress),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const input = await f.eligibilityInput('PROVISION');
    await expect(
      f.eligibility.evaluateFinancialEligibility(
        await f.actor(),
        { ...input, sourceEvidence: f.evidence() } as typeof input,
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const result = await f.eligibility.evaluateFinancialEligibility(
      await f.actor(),
      input,
      f.ingress,
    );
    const history = await row(
      'FinancialHistory',
      result.resultRefs.find((reference) => reference.entity === 'FinancialHistory')!,
    );
    expect(history!.evidenceRefs).toEqual([]);
    expect(history!.verifiedPersonRef).toEqual(f.registrant.actorAccountRef);
    const facts = await store.list('FactEnvelope', { equals: { aggregateRef: result.targetRef } });
    expect(facts).toHaveLength(1);
    expect(
      (facts[0]!.evidenceRefs as Ref[]).some(
        (reference) => reference.entity === 'PersonVerification',
      ),
    ).toBe(true);
  });
  it('등록되지 않은 SYSTEM은 직원 확인으로 위장해 판단을 기록하지 않는다', async () => {
    const permit = {
      owner: 'EnterpriseAccess',
      entity: 'ExecutionPermit',
      id: 'unregistered-financial-system',
      revision: 1,
    };
    const context = {
      ...(await f.actor()),
      principalId: 'unregistered-financial-system',
      audience: 'SYSTEM' as const,
      actorAccountRef: null,
      verifiedPersonRef: null,
      identityAssertionRef: permit,
      executionPermitRef: permit,
    };
    const input = await f.eligibilityInput('PROVISION');
    await expect(
      f.eligibility.evaluateFinancialEligibility(context, input, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_FINANCIAL_ACCESS' });
    await expect(f.eligibility.assessEligibility(context, input, f.ingress)).rejects.toMatchObject({
      code: 'U4_ELIGIBILITY_ACCESS',
    });
  });
  it('다른 기업·누락 품목·잘못된 목적/회차를 현재 주문 판단으로 추정하지 않는다', async () => {
    const input = await f.eligibilityInput('PROVISION');
    await expect(
      f.eligibility.assessEligibility(await f.actor(), { ...input, orderLineRefs: [] }, f.ingress),
    ).rejects.toThrow();
    await expect(
      f.eligibility.assessEligibility(
        await f.actor(),
        {
          ...input,
          renewalCycleRefs: [
            { owner: 'SoftwareLifecycle', entity: 'RenewalCycle', id: 'old-cycle', revision: 1 },
          ],
        },
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_ELIGIBILITY_BASIS' });
    await expect(
      f.eligibility.assessEligibility(
        await f.actor(),
        {
          ...input,
          targetScope: {
            ...input.targetScope,
            enterpriseRef: { ...input.targetScope.enterpriseRef, id: 'other-enterprise' },
          },
        },
        f.ingress,
      ),
    ).rejects.toThrow();
  });
  it('실제 FULL 완료의 기한만 같은 Invoice에 기록하고 현금·배분·총액을 보존한다', async () => {
    const { invoices, payment } = await provisionPaid();
    const before = await row('FinancialPaymentBalance', payment.confirmed.targetRef!),
      invoice = await row('Invoice', invoices[1]!);
    const result = await f.due.reconcileInvoiceDue(
      await f.actor(),
      f.dueInput(invoices[1]!),
      f.ingress,
    );
    expect(result.targetRef!.id).toBe(invoices[1]!.id);
    expect(await row('Invoice', result.targetRef!)).toMatchObject({
      dueDate: u4KstDueDate(f.truth.providedTranches[0]!.completedAt!, 30),
      amount: invoice!.amount,
      planRevision: invoice!.planRevision,
      correctionOf: invoices[1],
    });
    expect(await row('FinancialPaymentBalance', payment.confirmed.targetRef!)).toEqual(before);
    expect((await row('Order', f.orderRef))!.paymentPlan).toEqual(f.plan);
    expect(await row('FinancialCompletionBasis', result.targetRef!)).toMatchObject({
      invoiceRef: result.targetRef,
      completionView: { latestSourceRevision: 1, aggregateRef: f.truth.aggregateRef },
    });
  });
  it('같은 원래 요청은 접수 재조회이고 다른 요청의 같은 사건은 기한 효과를 추가하지 않는다', async () => {
    const invoice = (await f.invoices())[1]!,
      input = f.dueInput(invoice);
    const result = await f.due.reconcileInvoiceDue(await f.actor(), input, f.ingress);
    expect(await f.due.reconcileInvoiceDue(await f.actor(), input, f.ingress)).toEqual(result);
    await expect(
      f.due.reconcileInvoiceDue(await f.actor(), f.dueInput(result.targetRef!), f.ingress),
    ).rejects.toMatchObject({ code: 'U4_DUE_ALREADY_CURRENT' });
    expect((await row('Invoice', result.targetRef!))!.revision).toBe(result.targetRef!.revision);
  });
  it('기한 기록 후 정상 청구 정정의 중간 원상을 보존하고 같은 실제 완료를 다시 대조한다', async () => {
    const { invoices, payment } = await provisionPaid();
    const calculated = await f.due.reconcileInvoiceDue(
      await f.actor(),
      f.dueInput(invoices[1]!),
      f.ingress,
    );
    const before = await row('Invoice', calculated.targetRef!);
    const originalBasis = await row('FinancialCompletionBasis', calculated.targetRef!);
    const cash = await row('FinancialPaymentBalance', payment.confirmed.targetRef!);
    const allocations = await store.list('PaymentAllocation');
    // 현재 승인 계획과 같은 의무·금액을 정상 정정 명령으로 재기록한다. 승인 원본을 변조하지 않는다.
    const input = {
      ...(await f.invoiceInput(1)),
      meta: f.meta(calculated.targetRef!.revision),
      correctionOf: calculated.targetRef!,
    };
    const corrected = await f.financial.correctInvoice(await f.actor(), input, f.ingress);
    expect(await row('Invoice', corrected.targetRef!)).toMatchObject({
      dueDate: null,
      providedTrancheRefs: [],
      correctionOf: calculated.targetRef,
    });
    expect(await row('FinancialCompletionBasis', corrected.targetRef!)).toEqual(originalBasis);
    const recomputed = await f.due.reconcileInvoiceDue(
      await f.actor(),
      f.dueInput(corrected.targetRef!),
      f.ingress,
    );
    expect(recomputed.targetRef).toMatchObject({
      id: invoices[1]!.id,
      revision: corrected.targetRef!.revision + 1,
    });
    expect(await row('Invoice', recomputed.targetRef!)).toMatchObject({
      dueDate: before!.dueDate,
      amount: before!.amount,
      correctionOf: corrected.targetRef,
    });
    expect(await row('FinancialCompletionBasis', recomputed.targetRef!)).toMatchObject({
      invoiceRef: recomputed.targetRef,
      revision: 2,
      completionView: { latestSourceRevision: 1 },
    });
    expect(
      await store.readRevision('Invoice', calculated.targetRef!.id, calculated.targetRef!.revision),
    ).toEqual(before);
    expect(
      await store.readRevision('FinancialCompletionBasis', calculated.targetRef!.id, 1),
    ).toEqual(originalBasis);
    expect(await row('FinancialPaymentBalance', payment.confirmed.targetRef!)).toEqual(cash);
    expect(await store.list('PaymentAllocation')).toEqual(allocations);
  });
  it('내부 위조 결과 Ref는 접수 쓰기 전에 거절하여 준비된 청구·이력·Fact도 롤백한다', async () => {
    const invoiceRef = (await f.invoices())[1]!;
    const original = await row('Invoice', invoiceRef);
    const counts = () =>
      sources.primaryAdmin.query(
        'SELECT (SELECT count(*) FROM u1_financial_history)::integer AS history, (SELECT count(*) FROM u1_request_receipt)::integer AS receipt, (SELECT count(*) FROM u1_fact_envelope)::integer AS fact',
      );
    const before = await counts();
    for (const { forged, code } of [
      {
        forged: {
          owner: 'FinancialSettlement',
          entity: 'UnregisteredBasis',
          id: 'forged',
          revision: 1,
        },
        code: 'U4_RESULT_NOT_WRITTEN',
      },
      {
        forged: {
          owner: 'HardwareFulfillment',
          entity: 'FinancialCompletionBasis',
          id: 'forged',
          revision: 1,
        },
        code: 'U4_RESULT_NOT_WRITTEN',
      },
      {
        forged: {
          ...invoiceRef,
          revision: invoiceRef.revision + 1,
          sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 },
        },
        code: 'INVALID_INPUT',
      },
    ]) {
      const input = f.dueInput(invoiceRef);
      await expect(
        f.access.run(
          await f.actor(),
          'reconcileInvoiceDue',
          { kind: 'RECORD', recordRef: invoiceRef },
          input,
          f.ingress,
          async (scope, mutation) => {
            const current = await scope.current(invoiceRef);
            await scope.transaction.put(
              'Invoice',
              {
                ...current,
                revision: invoiceRef.revision + 1,
                historyRefs: [...(current.historyRefs as Ref[]), mutation.historyRef],
              },
              invoiceRef.revision,
            );
            const target = { ...invoiceRef, revision: invoiceRef.revision + 1 };
            return { target, refs: [target, forged], before: invoiceRef };
          },
        ),
      ).rejects.toMatchObject({ code });
      expect(await row('Invoice', invoiceRef)).toEqual(original);
      expect(await counts()).toEqual(before);
    }
  });
  it('확인된 높은 정정은 원래 건/개정과 산출 전후를 보존한다', async () => {
    const original = await f.due.reconcileInvoiceDue(
      await f.actor(),
      f.dueInput((await f.invoices())[1]!),
      f.ingress,
    );
    const previous = await row('Invoice', original.targetRef!);
    const correctedAt = new Date(f.seller.now().getTime() - 2 * 86400000).toISOString();
    f.advance(correctedAt);
    const result = await f.due.reconcileInvoiceDue(
      await f.actor(),
      f.dueInput(original.targetRef!),
      f.ingress,
    );
    expect(await row('Invoice', result.targetRef!)).toMatchObject({
      dueDate: u4KstDueDate(correctedAt, 30),
      correctionOf: original.targetRef,
    });
    expect(
      await store.readRevision('Invoice', original.targetRef!.id, original.targetRef!.revision),
    ).toEqual(previous);
    expect(await row('FinancialCompletionBasis', result.targetRef!)).toMatchObject({
      revision: 2,
      completionView: { latestSourceRevision: 2 },
    });
  });
  it('동일 개정 다른 내용·역순/공백을 실제 기한 원상에 덮어쓰지 않는다', async () => {
    const original = await f.due.reconcileInvoiceDue(
      await f.actor(),
      f.dueInput((await f.invoices())[1]!),
      f.ingress,
    );
    const before = await row('Invoice', original.targetRef!);
    const old = structuredClone(f.truth);
    f.truth.providedTranches[0]!.completedAt = new Date(
      f.seller.now().getTime() - 2 * 86400000,
    ).toISOString();
    f.truth.providedTranches[0]!.hardwareDeliveredAt = f.truth.providedTranches[0]!.completedAt;
    await expect(
      f.due.reconcileInvoiceDue(await f.actor(), f.dueInput(original.targetRef!), f.ingress),
    ).rejects.toMatchObject({ code: 'U4_DUE_CONFLICT' });
    Object.assign(f.truth, old);
    f.advance();
    f.advance();
    await expect(
      f.due.reconcileInvoiceDue(await f.actor(), f.dueInput(original.targetRef!), f.ingress),
    ).rejects.toMatchObject({ code: 'U4_DUE_SEQUENCE' });
    expect(await row('Invoice', original.targetRef!)).toEqual(before);
  });
  it('미등록·UNKNOWN/GAP 원본·부분 완료는 실제 완료 기한을 만들지 않는다', async () => {
    const invoice = (await f.invoices())[1]!;
    await expect(
      new U4InvoiceDue(f.access).reconcileInvoiceDue(
        await f.actor(),
        f.dueInput(invoice),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'U4_OWNER_UNREGISTERED' });
    f.changeObservation((value) => ({ ...value, view: { ...value.view, coverage: 'GAP' } }));
    await expect(
      f.due.reconcileInvoiceDue(await f.actor(), f.dueInput(invoice), f.ingress),
    ).rejects.toMatchObject({ code: 'U4_OWNER_UNREGISTERED' });
    f.changeObservation((value) => value);
    f.truth.providedTranches[0]!.completionState = 'PENDING';
    f.truth.providedTranches[0]!.completedQuantity = 0;
    f.truth.providedTranches[0]!.completedAt = null;
    await expect(
      f.due.reconcileInvoiceDue(await f.actor(), f.dueInput(invoice), f.ingress),
    ).rejects.toMatchObject({ code: 'U4_DUE_UNVERIFIED' });
    expect((await row('Invoice', invoice))!.dueDate).toBeNull();
  });
  it('권한 회수·다른 금융 목적·근거 없는 제한 해제를 거절한다', async () => {
    await expect(
      f.eligibility.recordRestriction(await f.actor(), f.restrictionInput('RELEASE'), f.ingress),
    ).rejects.toMatchObject({ code: 'U4_RESTRICTION_BASIS' });
    await new StaffAccess(store, f.seller.now).grantRole(await f.requestContext(f.seller.staff), {
      ...f.grantInput,
      meta: f.meta(f.grant.targetRef!.revision),
      decision: 'REVOKE',
    });
    await expect(
      new U4Eligibility(f.access, new U4OwnerSources(store, f.seller.now)).assessEligibility(
        await f.actor(),
        await f.eligibilityInput('PROVISION'),
        f.ingress,
      ),
    ).rejects.toThrow();
  });
  it('미지원 요금 자동 조정은 원래 회차/기간 참조를 보존하고 금융 효과를 만들지 않는다', async () => {
    const input = {
      meta: f.meta(1),
      targetScope: f.targetScope,
      renewalCycleRef: {
        owner: 'SoftwareLifecycle',
        entity: 'RenewalCycle',
        id: 'synthetic-unsupported-cycle',
        revision: 1,
      },
      periodAdjustmentRef: {
        owner: 'SoftwareLifecycle',
        entity: 'PeriodAdjustment',
        id: 'synthetic-original-period',
        revision: 1,
      },
    };
    const original = structuredClone(input);
    await expect(
      f.eligibility.rejectRenewalFeeAdjustment(await f.actor(), input, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_FEE_ADJUSTMENT_UNSUPPORTED' });
    expect(input).toEqual(original);
    expect(await store.list('RenewalFeeAdjustment')).toEqual([]);
    expect((await store.currentProtected('Order', f.orderRef.id))!.paymentPlan).toEqual(f.plan);
  });
});
