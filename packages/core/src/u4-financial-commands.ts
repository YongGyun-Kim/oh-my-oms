import { randomUUID } from 'node:crypto';
import { canonicalJson, requireCondition } from '@oms/contracts';
import type {
  Ref,
  ServiceContext,
  TargetScope,
  U4InvoiceInput,
  U4PaymentEvidenceInput,
  U4ConfirmPaymentInput,
  U4PaymentCorrectionInput,
  U4AllocationBatchInput,
  U4AllocationCorrectionInput,
  U4PaymentIdentity,
  U4CancelInvoiceInput,
  U4PaymentBindingCorrectionInput,
} from '@oms/contracts';
import { u4ObligationBindingId, verifyU4InvoiceCompletionState } from '@oms/persistence';
import type { ModelData, U4Transaction } from '@oms/persistence';
import { u4Ref } from './references.js';
import { U4CommercialOrder } from './u4-commercial-order.js';
import { historicalU4 } from './u4-order-terms.js';
import { U4PaymentPlan } from './u4-payment-plan.js';
import { U4FinancialAccess } from './u4-financial-access.js';
import type { U4FinancialMutation, U4FinancialResult } from './u4-financial-access.js';
import {
  U4FinancialLedger,
  financialAmount as amount,
  financialMoney as money,
} from './u4-financial-ledger.js';
import { U4FinancialSource } from './u4-financial-source.js';

const exact = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const enforce = (condition: unknown, code = 'U4_FINANCIAL_BASIS') =>
  requireCondition(
    condition,
    409,
    code,
    '현재 주문·약정·금융 원본과 정확한 근거를 대조해야 합니다.',
  );
export class U4FinancialCommands {
  readonly ledger: U4FinancialLedger;
  private readonly orders: U4CommercialOrder;
  private readonly plans: U4PaymentPlan;
  constructor(
    readonly access: U4FinancialAccess,
    readonly source = new U4FinancialSource(access.adapter.store, access.adapter.now),
  ) {
    this.ledger = new U4FinancialLedger(access.adapter.store);
    this.orders = new U4CommercialOrder(access.adapter);
    this.plans = new U4PaymentPlan(access.adapter);
  }
  private reference(model: string, data: ModelData) {
    return u4Ref(model, data, this.access.adapter.store.schema);
  }
  private shared(targetScope: TargetScope, historyRef: Ref) {
    return {
      modelVersion: 1,
      revision: 1,
      targetScope,
      knowledge: 'KNOWN',
      historyRefs: [historyRef],
    };
  }
  private scope(data: ModelData, target: TargetScope) {
    enforce(exact(data.targetScope, target), 'U4_FINANCIAL_SCOPE');
  }
  private async order(scope: U4Transaction, reference: Ref, target: TargetScope) {
    const current = await this.orders.current(scope, reference);
    this.scope(current.order, target);
    enforce(current.order.state === 'ACCEPTED', 'U4_ORDER_NOT_ACCEPTED');
    const approved = await this.plans.current(
      scope,
      current.plan.agreementRevisionRef,
      current.price.total!,
    );
    enforce(exact(approved, { ...current.plan, customerConsentRef: null }));
    return current;
  }
  private async impact(
    scope: U4Transaction,
    orderRef: Ref,
    targetScope: TargetScope,
    mutation: U4FinancialMutation,
  ): Promise<Ref[]> {
    const order = await this.order(scope, orderRef, targetScope);
    return this.source.clearImpact({
      epoch: mutation.epoch,
      requestDigest: mutation.requestDigest,
      orderRef,
      targetScope,
      owner: order.order.productType === 'HARDWARE' ? 'HardwareFulfillment' : 'SoftwareLifecycle',
    });
  }
  registerInvoice(context: ServiceContext, input: U4InvoiceInput, proof: unknown) {
    return this.access.run(
      context,
      'registerInvoice',
      { kind: 'RECORD', recordRef: input.orderRef },
      input,
      proof,
      (scope, mutation) => this.invoice(scope, input, mutation, false),
    );
  }
  correctInvoice(context: ServiceContext, input: U4InvoiceInput, proof: unknown) {
    enforce(input.correctionOf !== null);
    return this.access.run(
      context,
      'correctInvoice',
      { kind: 'RECORD', recordRef: input.correctionOf! },
      input,
      proof,
      (scope, mutation) => this.invoice(scope, input, mutation, true),
    );
  }
  cancelInvoice(context: ServiceContext, input: U4CancelInvoiceInput, proof: unknown) {
    return this.access.run(
      context,
      'cancelInvoice',
      { kind: 'RECORD', recordRef: input.invoiceRef },
      input,
      proof,
      async (scope, mutation) => {
        const current = await this.order(scope, input.orderRef, input.targetScope);
        const original = await scope.current(input.invoiceRef);
        this.scope(original, input.targetScope);
        enforce(
          original.lifecycle === 'ISSUED' && (original.orderRef as Ref).id === input.orderRef.id,
          'U4_INVOICE_NOT_CURRENT',
        );
        await verifyU4InvoiceCompletionState(
          original,
          await scope.optional('FinancialCompletionBasis', input.invoiceRef.id),
          scope.readSource().readRevision,
        );
        // 독립 직원 면제가 아니다. 승인·동의하여 적용된 현재 계획에서 제거된 옛 의무만 취소한다.
        enforce(
          current.application &&
            current.plan.customerConsentRef &&
            !current.plan.obligations.some(
              (obligation) => obligation.obligationKey === original.obligationKey,
            ),
          'U4_OBLIGATION_STILL_REQUIRED',
        );
        const oldOrder = await historicalU4(this.access.adapter, scope, original.orderRef as Ref);
        const oldPlan = oldOrder.paymentPlan as import('@oms/contracts').U4AgreedPaymentPlan;
        enforce(
          oldPlan &&
            oldPlan.planRevision === original.planRevision &&
            !exact(oldPlan.agreementRevisionRef, current.plan.agreementRevisionRef) &&
            oldPlan.obligations.some(
              (obligation) =>
                obligation.obligationKey === original.obligationKey &&
                exact(obligation.amount, original.amount),
            ),
        );
        await scope.lock([], [input.invoiceRef.id], []);
        const ledger = await this.ledger.invoice(scope, original);
        enforce(ledger.net === 0n && ledger.reserved === 0n, 'U4_INVOICE_CONSUMED');
        const binding = await scope.optional(
          'FinancialInvoiceBinding',
          u4ObligationBindingId(input.orderRef.id, String(original.obligationKey)),
        );
        enforce(binding && exact(binding.invoiceRef, input.invoiceRef));
        const sourceRefs = await this.impact(scope, input.orderRef, input.targetScope, mutation);
        const next = {
          ...original,
          lifecycle: 'CANCELLED',
          correctionOf: input.invoiceRef,
          revision: Number(original.revision) + 1,
          historyRefs: [...(original.historyRefs as Ref[]), mutation.historyRef],
        };
        await scope.transaction.put('Invoice', next, Number(original.revision));
        await scope.transaction.put(
          'FinancialInvoiceBinding',
          {
            ...binding,
            invoiceRef: null,
            revision: Number(binding!.revision) + 1,
            historyRefs: [...(binding!.historyRefs as Ref[]), mutation.historyRef],
          },
          Number(binding!.revision),
        );
        const target = this.reference('Invoice', next);
        return { target, refs: [target], before: input.invoiceRef, sourceRefs };
      },
    );
  }
  private async invoice(
    scope: U4Transaction,
    input: U4InvoiceInput,
    mutation: U4FinancialMutation,
    correction: boolean,
  ): Promise<U4FinancialResult> {
    const current = await this.order(scope, input.orderRef, input.targetScope);
    enforce(
      exact(input.chargeTermsRef, current.order.purchaseTermsRef) &&
        input.planRevision === current.plan.planRevision,
    );
    const obligation = current.plan.obligations.find(
      (value) => value.obligationKey === input.obligationKey,
    );
    enforce(
      obligation &&
        exact(input.amount, obligation.amount) &&
        input.label === obligation.label &&
        exact(input.dueBasis, obligation.dueBasis),
    );
    const renewal = current.order.renewalCycleRef ? [current.order.renewalCycleRef] : [];
    enforce(exact(renewal, input.renewalCycleRefs));
    const bindingId = u4ObligationBindingId(input.orderRef.id, input.obligationKey);
    const binding = await scope.optional('FinancialInvoiceBinding', bindingId);
    let original: ModelData | null = null;
    let originalBalance: ModelData | null = null;
    let sourceRefs: Ref[] = [];
    if (correction) {
      original = await scope.current(input.correctionOf!);
      this.scope(original, input.targetScope);
      await verifyU4InvoiceCompletionState(
        original,
        await scope.optional('FinancialCompletionBasis', input.correctionOf!.id),
        scope.readSource().readRevision,
      );
      enforce(
        (original.orderRef as Ref).id === input.orderRef.id &&
          original.obligationKey === input.obligationKey &&
          binding &&
          exact(binding.invoiceRef, input.correctionOf),
      );
      await scope.lock([], [input.correctionOf!.id], []);
      const ledger = await this.ledger.invoice(scope, original);
      originalBalance = ledger.balance;
      enforce(amount(input.amount) >= ledger.net, 'U4_INVOICE_CONSUMED');
      sourceRefs = await this.impact(scope, input.orderRef, input.targetScope, mutation);
    } else enforce(input.correctionOf === null && !binding, 'U4_OBLIGATION_ALREADY_INVOICED');
    const invoiceId = original ? String(original.invoiceId) : randomUUID();
    const issued = await this.ledger.collection(scope, 'Invoice', {
      orderRef: { id: input.orderRef.id },
      lifecycle: 'ISSUED',
    });
    const issuedTotal = issued
      .filter((value) => value.invoiceId !== invoiceId)
      .reduce((sum, value) => sum + amount(value.amount), 0n);
    enforce(issuedTotal + amount(input.amount) <= amount(current.plan.total), 'U4_INVOICE_TOTAL');
    const invoice = {
      ...this.shared(input.targetScope, mutation.historyRef),
      ...(original ?? {}),
      invoiceId,
      orderRef: input.orderRef,
      enterpriseRef: input.targetScope.enterpriseRef,
      chargeTermsRef: input.chargeTermsRef,
      renewalCycleRefs: input.renewalCycleRefs,
      planRevision: input.planRevision,
      obligationKey: input.obligationKey,
      label: input.label,
      amount: input.amount,
      dueBasis: input.dueBasis,
      dueDate: input.dueBasis.kind === 'FIXED_DATE' ? input.dueBasis.date : null,
      requiredBeforeProvision: obligation!.requiredBeforeProvision,
      lifecycle: 'ISSUED',
      providedTrancheRefs: [],
      correctionOf: input.correctionOf,
      revision: original ? Number(original.revision) + 1 : 1,
      historyRefs: [...((original?.historyRefs as Ref[] | undefined) ?? []), mutation.historyRef],
    };
    await scope.transaction.put('Invoice', invoice, original ? Number(original.revision) : null);
    const reference = this.reference('Invoice', invoice);
    await scope.transaction.put(
      'FinancialInvoiceBinding',
      {
        modelVersion: 1,
        bindingId,
        orderId: input.orderRef.id,
        obligationKey: input.obligationKey,
        invoiceRef: reference,
        historyRefs: [...((binding?.historyRefs as Ref[] | undefined) ?? []), mutation.historyRef],
        revision: binding ? Number(binding.revision) + 1 : 1,
      },
      binding ? Number(binding.revision) : null,
    );
    const balance = originalBalance;
    await scope.transaction.put(
      'FinancialInvoiceBalance',
      {
        modelVersion: 1,
        invoiceId,
        amount: input.amount,
        allocatedPrincipal: balance?.allocatedPrincipal ?? money(0n),
        refunded: balance?.refunded ?? money(0n),
        reserved: balance?.reserved ?? money(0n),
        revision: balance ? Number(balance.revision) + 1 : 1,
      },
      balance ? Number(balance.revision) : null,
    );
    return { target: reference, refs: [reference], before: input.correctionOf, sourceRefs };
  }
  recordPaymentEvidence(context: ServiceContext, input: U4PaymentEvidenceInput, proof: unknown) {
    return this.access.run(
      context,
      'recordPaymentEvidence',
      { kind: 'ENTERPRISE', enterpriseRef: input.enterpriseRef },
      input,
      proof,
      async (scope, mutation) => {
        enforce(
          exact(input.enterpriseRef, input.targetScope.enterpriseRef) &&
            input.meta.expectedRevision === null &&
            input.correctionOf === null,
        );
        if (input.orderRef) await this.order(scope, input.orderRef, input.targetScope);
        // 문서 참조/입력 주장만 기록한 후보에는 검증된 실거래 identity나 가용 원금을 만들지 않는다.
        const payment = {
          ...this.shared(input.targetScope, mutation.historyRef),
          paymentEvidenceId: randomUUID(),
          enterpriseRef: input.enterpriseRef,
          sourceRef: input.sourceEvidence,
          externalReference: input.sourceEvidence.documentReference,
          identity: null,
          amount: input.amount,
          actualPaidAt: input.actualPaidAt,
          confirmationRef: null,
          boundOrderRef: input.orderRef,
          lifecycle: 'REVIEW',
          correctionRefs: [],
          knowledge: 'UNKNOWN',
        };
        await scope.transaction.put('PaymentEvidence', payment);
        const reference = this.reference('PaymentEvidence', payment);
        return { target: reference, refs: [reference], before: null, state: 'REVIEW_REQUIRED' };
      },
    );
  }
  confirmPaymentEvidence(context: ServiceContext, input: U4ConfirmPaymentInput, proof: unknown) {
    return this.access.run(
      context,
      'confirmPaymentEvidence',
      { kind: 'RECORD', recordRef: input.paymentEvidenceRef },
      input,
      proof,
      (scope, mutation) => this.confirm(scope, context, input, mutation, false),
    );
  }
  private async confirm(
    scope: U4Transaction,
    context: ServiceContext,
    input: U4ConfirmPaymentInput,
    mutation: U4FinancialMutation,
    correction: boolean,
  ): Promise<U4FinancialResult> {
    const original = await scope.current(input.paymentEvidenceRef);
    this.scope(original, input.targetScope);
    enforce(correction || original.lifecycle === 'REVIEW', 'U4_PAYMENT_ALREADY_CONFIRMED');
    await scope.lock([input.paymentEvidenceRef.id], [], []);
    const existing = original.identity ? await this.ledger.payment(scope, original) : null;
    if (correction) {
      enforce(
        !existing ||
          (existing.allocated === 0n &&
            existing.ra === 0n &&
            existing.ru === 0n &&
            existing.ha === 0n &&
            existing.hu === 0n),
        'U4_PAYMENT_CONSUMED',
      );
    }
    let impactSources: Ref[] = [];
    if (correction && original.boundOrderRef)
      impactSources = await this.impact(
        scope,
        original.boundOrderRef as Ref,
        input.targetScope,
        mutation,
      );
    const state = await this.source.payment({
      epoch: mutation.epoch,
      requestDigest: mutation.requestDigest,
      actorAccountRef: context.actorAccountRef!,
      enterpriseRef: original.enterpriseRef as Ref,
      targetScope: input.targetScope,
      evidence: input.sourceEvidence,
      identity: input.identity,
      amount: input.amount,
      actualPaidAt: input.actualPaidAt,
    });
    const available =
      state === 'CONFIRMED' &&
      (await this.ledger.identityAvailable(scope, input.identity, input.paymentEvidenceRef.id));
    if (state === 'DISPUTED' || (state === 'CONFIRMED' && !available))
      return this.dispute(scope, original, input, mutation, impactSources);
    if (state !== 'CONFIRMED') {
      if (original.identity) enforce(false, 'U4_SOURCE_UNVERIFIED');
      const review = {
        ...original,
        sourceRef: input.sourceEvidence,
        amount: input.amount,
        actualPaidAt: input.actualPaidAt,
        lifecycle: 'REVIEW',
        identity: null,
        confirmationRef: null,
        knowledge: 'UNKNOWN',
        revision: Number(original.revision) + 1,
        historyRefs: [...(original.historyRefs as Ref[]), mutation.historyRef],
      };
      await scope.transaction.put('PaymentEvidence', review, Number(original.revision));
      const reference = this.reference('PaymentEvidence', review);
      return {
        target: reference,
        refs: [reference],
        before: input.paymentEvidenceRef,
        state: 'REVIEW_REQUIRED',
      };
    }
    const previousIdentity = original.identity as U4PaymentIdentity | null;
    enforce(
      !previousIdentity || previousIdentity.sourceNamespace === input.identity.sourceNamespace,
      'U4_IDENTITY_NAMESPACE',
    );
    const identity = {
      ...input.identity,
      aliases: [
        ...new Set([
          ...(previousIdentity
            ? [previousIdentity.canonicalIdentity, ...previousIdentity.aliases]
            : []),
          ...input.identity.aliases,
        ]),
      ].filter((alias) => alias !== input.identity.canonicalIdentity),
    };
    await this.ledger.reserveIdentity(scope, identity, input.paymentEvidenceRef.id);
    const payment = {
      ...original,
      identity,
      amount: input.amount,
      actualPaidAt: input.actualPaidAt,
      sourceRef: input.sourceEvidence,
      confirmationRef: input.sourceEvidence,
      lifecycle: 'CONFIRMED',
      knowledge: 'KNOWN',
      revision: Number(original.revision) + 1,
      historyRefs: [...(original.historyRefs as Ref[]), mutation.historyRef],
      correctionRefs: correction
        ? [...(original.correctionRefs as Ref[]), mutation.historyRef]
        : original.correctionRefs,
    };
    await scope.transaction.put('PaymentEvidence', payment, Number(original.revision));
    const binding = await scope.optional('FinancialPaymentBinding', input.paymentEvidenceRef.id);
    enforce(!binding || exact(binding.orderRef, original.boundOrderRef));
    if (!binding)
      await scope.transaction.put('FinancialPaymentBinding', {
        modelVersion: 1,
        paymentId: input.paymentEvidenceRef.id,
        orderRef: original.boundOrderRef,
        historyRefs: [mutation.historyRef],
        revision: 1,
      });
    const balance = existing?.balance;
    await scope.transaction.put(
      'FinancialPaymentBalance',
      {
        modelVersion: 1,
        paymentId: input.paymentEvidenceRef.id,
        principal: input.amount,
        allocatedPrincipal: money(0n),
        allocatedRefunded: money(0n),
        unallocatedRefunded: money(0n),
        allocatedReserved: money(0n),
        unallocatedReserved: money(0n),
        revision: balance ? Number(balance.revision) + 1 : 1,
      },
      balance ? Number(balance.revision) : null,
    );
    const reference = this.reference('PaymentEvidence', payment);
    await this.ledger.payment(scope, payment);
    return {
      target: reference,
      refs: [reference],
      before: input.paymentEvidenceRef,
      sourceRefs: impactSources,
    };
  }
  private async dispute(
    scope: U4Transaction,
    original: ModelData,
    input: { sourceEvidence: import('@oms/contracts').U4Evidence },
    mutation: U4FinancialMutation,
    sourceRefs: Ref[] = [],
  ): Promise<U4FinancialResult> {
    const before = this.reference('PaymentEvidence', original);
    const next = {
      ...original,
      lifecycle: 'DISPUTED',
      knowledge: 'CONFLICT',
      revision: Number(original.revision) + 1,
      correctionRefs: [...(original.correctionRefs as Ref[]), mutation.historyRef],
      historyRefs: [...(original.historyRefs as Ref[]), mutation.historyRef],
    };
    await scope.transaction.put('PaymentEvidence', next, Number(original.revision));
    const target = this.reference('PaymentEvidence', next);
    const reconciliation = {
      ...this.shared(original.targetScope as TargetScope, mutation.historyRef),
      financialReconciliationId: randomUUID(),
      conflictingEvidenceRefs: [original.sourceRef, input.sourceEvidence],
      affectedFactsRefs: [target],
      dependentActionRefs: [],
      staffDecisionRef: null,
      remainingActionRefs: [target],
      knowledge: 'CONFLICT',
    };
    await scope.transaction.put('FinancialReconciliationCase', reconciliation);
    return {
      target,
      refs: [target, this.reference('FinancialReconciliationCase', reconciliation)],
      before,
      state: 'REVIEW_REQUIRED',
      sourceRefs,
    };
  }
  correctPaymentEvidence(context: ServiceContext, input: U4PaymentCorrectionInput, proof: unknown) {
    return this.access.run(
      context,
      'correctPaymentEvidence',
      { kind: 'RECORD', recordRef: input.paymentEvidenceRef },
      input,
      proof,
      async (scope, mutation) => {
        const original = await scope.current(input.paymentEvidenceRef);
        this.scope(original, input.targetScope);
        if (input.correctionKind === 'DISPUTE')
          return this.dispute(scope, original, input, mutation);
        if (input.correctionKind === 'CONFIRM') {
          enforce(input.identity && input.amount && input.actualPaidAt);
          return this.confirm(
            scope,
            context,
            {
              ...input,
              identity: input.identity!,
              amount: input.amount!,
              actualPaidAt: input.actualPaidAt!,
            },
            mutation,
            true,
          );
        }
        enforce(original.lifecycle !== 'REVERSED', 'U4_ALREADY_REVERSED');
        await scope.lock([input.paymentEvidenceRef.id], [], []);
        const ledger = original.identity ? await this.ledger.payment(scope, original) : null;
        enforce(
          !ledger ||
            (ledger.allocated === 0n &&
              ledger.ra === 0n &&
              ledger.ru === 0n &&
              ledger.ha === 0n &&
              ledger.hu === 0n),
          'U4_PAYMENT_CONSUMED',
        );
        if (original.identity) {
          const sourceState = await this.source.payment({
            epoch: mutation.epoch,
            requestDigest: mutation.requestDigest,
            actorAccountRef: context.actorAccountRef!,
            enterpriseRef: original.enterpriseRef as Ref,
            targetScope: input.targetScope,
            evidence: input.sourceEvidence,
            identity: original.identity as U4PaymentIdentity,
            amount: original.amount as import('@oms/contracts').Money,
            actualPaidAt: String(original.actualPaidAt),
          });
          enforce(sourceState === 'REVOKED', 'U4_SOURCE_UNVERIFIED');
        }
        const sources = original.boundOrderRef
          ? await this.impact(scope, original.boundOrderRef as Ref, input.targetScope, mutation)
          : [];
        const next = {
          ...original,
          lifecycle: 'REVERSED',
          revision: Number(original.revision) + 1,
          correctionRefs: [...(original.correctionRefs as Ref[]), mutation.historyRef],
          historyRefs: [...(original.historyRefs as Ref[]), mutation.historyRef],
        };
        await scope.transaction.put('PaymentEvidence', next, Number(original.revision));
        if (ledger)
          await scope.transaction.put(
            'FinancialPaymentBalance',
            {
              ...ledger.balance,
              principal: money(0n),
              revision: Number(ledger.balance.revision) + 1,
            },
            Number(ledger.balance.revision),
          );
        const reference = this.reference('PaymentEvidence', next);
        return {
          target: reference,
          refs: [reference],
          before: input.paymentEvidenceRef,
          sourceRefs: sources,
        };
      },
    );
  }
  correctPaymentBinding(
    context: ServiceContext,
    input: U4PaymentBindingCorrectionInput,
    proof: unknown,
  ) {
    return this.access.run(
      context,
      'correctPaymentBinding',
      { kind: 'RECORD', recordRef: input.paymentEvidenceRef },
      input,
      proof,
      async (scope, mutation) => {
        const original = await scope.current(input.paymentEvidenceRef);
        this.scope(original, input.targetScope);
        enforce(
          original.lifecycle === 'CONFIRMED' &&
            original.boundOrderRef &&
            (original.boundOrderRef as Ref).id === input.previousOrderRef.id &&
            input.previousOrderRef.id !== input.orderRef.id,
          'U4_BINDING_CORRECTION_TARGET',
        );
        await this.order(scope, input.previousOrderRef, input.targetScope);
        await this.order(scope, input.orderRef, input.targetScope);
        await scope.lock([input.paymentEvidenceRef.id], [], []);
        const ledger = await this.ledger.payment(scope, original);
        enforce(
          ledger.allocated === 0n &&
            ledger.ra === 0n &&
            ledger.ru === 0n &&
            ledger.ha === 0n &&
            ledger.hu === 0n,
          'U4_PAYMENT_CONSUMED',
        );
        const verified = await this.source.payment({
          epoch: mutation.epoch,
          requestDigest: mutation.requestDigest,
          actorAccountRef: context.actorAccountRef!,
          enterpriseRef: original.enterpriseRef as Ref,
          targetScope: input.targetScope,
          evidence: input.sourceEvidence,
          identity: original.identity as U4PaymentIdentity,
          amount: original.amount as import('@oms/contracts').Money,
          actualPaidAt: String(original.actualPaidAt),
        });
        enforce(verified === 'CONFIRMED', 'U4_SOURCE_UNVERIFIED');
        const sourceRefs = [
          ...(await this.impact(scope, input.previousOrderRef, input.targetScope, mutation)),
          ...(await this.impact(scope, input.orderRef, input.targetScope, mutation)),
        ];
        await scope.transaction.put(
          'FinancialPaymentBinding',
          {
            ...ledger.binding,
            orderRef: input.orderRef,
            historyRefs: [...(ledger.binding.historyRefs as Ref[]), mutation.historyRef],
            revision: Number(ledger.binding.revision) + 1,
          },
          Number(ledger.binding.revision),
        );
        const next = {
          ...original,
          boundOrderRef: input.orderRef,
          correctionRefs: [...(original.correctionRefs as Ref[]), mutation.historyRef],
          historyRefs: [...(original.historyRefs as Ref[]), mutation.historyRef],
          revision: Number(original.revision) + 1,
        };
        await scope.transaction.put('PaymentEvidence', next, Number(original.revision));
        await this.ledger.payment(scope, next);
        const target = this.reference('PaymentEvidence', next);
        return { target, refs: [target], before: input.paymentEvidenceRef, sourceRefs };
      },
    );
  }
  allocatePaymentBatch(context: ServiceContext, input: U4AllocationBatchInput, proof: unknown) {
    return this.access.run(
      context,
      'allocatePaymentBatch',
      { kind: 'RECORD', recordRef: input.paymentEvidenceRef },
      input,
      proof,
      async (scope, mutation) => {
        const order = await this.order(scope, input.orderRef, input.targetScope);
        const payment = await scope.current(input.paymentEvidenceRef);
        this.scope(payment, input.targetScope);
        enforce(
          payment.lifecycle === 'CONFIRMED' &&
            exact(payment.enterpriseRef, input.targetScope.enterpriseRef),
          'U4_PAYMENT_UNCONFIRMED',
        );
        const renewal = order.order.renewalCycleRef ? [order.order.renewalCycleRef] : [];
        enforce(exact(renewal, input.renewalCycleRefs));
        await scope.lock(
          [input.paymentEvidenceRef.id],
          input.items.map((item) => item.invoiceRef.id),
          [],
        );
        const current = await this.ledger.payment(scope, payment);
        // BR4.6: 배분은 기존 연결을 옮기는 정정 명령이 아니다. 소비0도 다른 주문이면 거절한다.
        enforce(
          !current.binding.orderRef || (current.binding.orderRef as Ref).id === input.orderRef.id,
          'U4_PAYMENT_BOUND_OTHER_ORDER',
        );
        const proofState = await this.source.payment({
          epoch: mutation.epoch,
          requestDigest: mutation.requestDigest,
          actorAccountRef: context.actorAccountRef!,
          enterpriseRef: payment.enterpriseRef as Ref,
          targetScope: input.targetScope,
          evidence: payment.confirmationRef as import('@oms/contracts').U4Evidence,
          identity: payment.identity as U4PaymentIdentity,
          amount: payment.amount as import('@oms/contracts').Money,
          actualPaidAt: String(payment.actualPaidAt),
        });
        enforce(proofState === 'CONFIRMED', 'U4_SOURCE_UNVERIFIED');
        const total = input.items.reduce((sum, item) => sum + amount(item.amount), 0n);
        enforce(total <= current.available, 'U4_PAYMENT_LIMIT');
        const targets: { invoice: ModelData; balance: ModelData; value: bigint }[] = [];
        for (const item of input.items) {
          const invoice = await scope.current(item.invoiceRef);
          this.scope(invoice, input.targetScope);
          enforce(
            invoice.lifecycle === 'ISSUED' &&
              (invoice.orderRef as Ref).id === input.orderRef.id &&
              invoice.planRevision === order.plan.planRevision &&
              exact(invoice.renewalCycleRefs, renewal),
            'U4_INVOICE_NOT_CURRENT',
          );
          const binding = await scope.optional(
            'FinancialInvoiceBinding',
            u4ObligationBindingId(input.orderRef.id, String(invoice.obligationKey)),
          );
          enforce(binding && exact(binding.invoiceRef, item.invoiceRef));
          const value = await this.ledger.invoice(scope, invoice);
          enforce(amount(item.amount) <= value.remaining, 'U4_INVOICE_LIMIT');
          targets.push({ invoice, balance: value.balance, value: amount(item.amount) });
        }
        const references: Ref[] = [];
        for (const target of targets) {
          const allocation = {
            ...this.shared(input.targetScope, mutation.historyRef),
            allocationId: randomUUID(),
            paymentEvidenceRef: input.paymentEvidenceRef,
            invoiceRef: this.reference('Invoice', target.invoice),
            orderRef: input.orderRef,
            orderLineRefs: order.order.lineRefs,
            renewalCycleRefs: input.renewalCycleRefs,
            amount: money(target.value),
            effect: 'APPLIED',
            decisionEvidenceRefs: [input.sourceEvidence],
            correctionOf: null,
          };
          await scope.transaction.put('PaymentAllocation', allocation);
          references.push(this.reference('PaymentAllocation', allocation));
          await scope.transaction.put(
            'FinancialInvoiceBalance',
            {
              ...target.balance,
              allocatedPrincipal: money(amount(target.balance.allocatedPrincipal) + target.value),
              revision: Number(target.balance.revision) + 1,
            },
            Number(target.balance.revision),
          );
        }
        await scope.transaction.put(
          'FinancialPaymentBalance',
          {
            ...current.balance,
            allocatedPrincipal: money(current.allocated + total),
            revision: Number(current.balance.revision) + 1,
          },
          Number(current.balance.revision),
        );
        await scope.transaction.put(
          'FinancialPaymentBinding',
          {
            ...current.binding,
            orderRef: input.orderRef,
            historyRefs: [...(current.binding.historyRefs as Ref[]), mutation.historyRef],
            revision: Number(current.binding.revision) + 1,
          },
          Number(current.binding.revision),
        );
        const next = {
          ...payment,
          boundOrderRef: input.orderRef,
          revision: Number(payment.revision) + 1,
          historyRefs: [...(payment.historyRefs as Ref[]), mutation.historyRef],
        };
        await scope.transaction.put('PaymentEvidence', next, Number(payment.revision));
        const target = this.reference('PaymentEvidence', next);
        await this.ledger.payment(scope, next);
        return {
          target,
          refs: [target, ...references],
          before: input.paymentEvidenceRef,
        };
      },
    );
  }
  reverseAllocation(context: ServiceContext, input: U4AllocationCorrectionInput, proof: unknown) {
    return this.access.run(
      context,
      'reverseAllocation',
      { kind: 'RECORD', recordRef: input.allocationRef },
      input,
      proof,
      async (scope, mutation) => {
        const order = await this.order(scope, input.orderRef, input.targetScope);
        const allocation = await scope.current(input.allocationRef);
        this.scope(allocation, input.targetScope);
        enforce(
          allocation.effect === 'APPLIED' && (allocation.orderRef as Ref).id === input.orderRef.id,
          'U4_ALLOCATION_ALREADY_REVERSED',
        );
        const paymentId = (allocation.paymentEvidenceRef as Ref).id,
          invoiceId = (allocation.invoiceRef as Ref).id;
        await scope.lock([paymentId], [invoiceId], []);
        const payment = await scope.optional('PaymentEvidence', paymentId),
          invoice = await scope.optional('Invoice', invoiceId);
        enforce(payment && invoice && payment.lifecycle === 'CONFIRMED');
        this.scope(payment!, input.targetScope);
        this.scope(invoice!, input.targetScope);
        const before = await this.ledger.payment(scope, payment!),
          invoiceBefore = await this.ledger.invoice(scope, invoice!);
        const used = before.byAllocation.get(input.allocationRef.id);
        enforce(!used || (used.confirmed === 0n && used.reserved === 0n), 'U4_ALLOCATION_CONSUMED');
        const sourceRefs = await this.impact(
          scope,
          input.orderRef,
          order.order.targetScope as TargetScope,
          mutation,
        );
        const next = {
          ...allocation,
          effect: 'REVERSED',
          correctionOf: input.allocationRef,
          revision: Number(allocation.revision) + 1,
          historyRefs: [...(allocation.historyRefs as Ref[]), mutation.historyRef],
        };
        await scope.transaction.put('PaymentAllocation', next, Number(allocation.revision));
        await scope.transaction.put(
          'FinancialPaymentBalance',
          {
            ...before.balance,
            allocatedPrincipal: money(before.allocated - amount(allocation.amount)),
            revision: Number(before.balance.revision) + 1,
          },
          Number(before.balance.revision),
        );
        await scope.transaction.put(
          'FinancialInvoiceBalance',
          {
            ...invoiceBefore.balance,
            allocatedPrincipal: money(invoiceBefore.allocated - amount(allocation.amount)),
            revision: Number(invoiceBefore.balance.revision) + 1,
          },
          Number(invoiceBefore.balance.revision),
        );
        const target = this.reference('PaymentAllocation', next);
        await this.ledger.payment(scope, payment!);
        await this.ledger.invoice(scope, invoice!);
        return { target, refs: [target], before: input.allocationRef, sourceRefs };
      },
    );
  }
}
