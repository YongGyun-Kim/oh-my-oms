import { canonicalJson, requireCondition, U4_PROFILE, ExecutionBudget } from '@oms/contracts';
import type { Money, Ref, U4PaymentIdentity, U4RefundStatePortion } from '@oms/contracts';
import { u4IdentityClaimId, validateModel } from '@oms/persistence';
import type { ModelData, ProtectedStore, U4Transaction } from '@oms/persistence';

export const financialAmount = (value: unknown): bigint => BigInt((value as Money).value);
export const financialMoney = (value: bigint): Money => {
  requireCondition(
    value >= 0n && value.toString().length <= 4096,
    409,
    'U4_LEDGER_RANGE',
    '정확한 원 단위 잔액 범위를 확인해야 합니다.',
  );
  return { currency: 'KRW', value: value.toString() };
};
const exact = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const hold = (value: unknown) =>
  requireCondition(
    value,
    503,
    'U4_LEDGER_UNCONFIRMED',
    '현재 금융 원금·배분·예약의 완전한 보호 원상을 대조해야 합니다.',
  );

export class U4FinancialLedger {
  constructor(private readonly store: ProtectedStore) {}
  collection(scope: U4Transaction, model: string, equals: Record<string, unknown>) {
    const remaining = Math.min(5000, ExecutionBudget.current()?.remaining() ?? 5000);
    return scope.financialCollection(model, equals, new Date(Date.now() + remaining).toISOString());
  }
  async identityAvailable(
    scope: U4Transaction,
    identity: U4PaymentIdentity,
    paymentId: string,
  ): Promise<boolean> {
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/PaymentIdentity', identity);
    for (const alias of [identity.canonicalIdentity, ...identity.aliases]) {
      const claim = await scope.optional(
        'FinancialIdentityClaim',
        u4IdentityClaimId(identity.sourceNamespace, alias),
      );
      if (
        claim &&
        (claim.sourceNamespace !== identity.sourceNamespace ||
          claim.canonicalIdentity !== alias ||
          claim.canonicalPaymentId !== paymentId)
      )
        return false;
    }
    return true;
  }
  async reserveIdentity(
    scope: U4Transaction,
    identity: U4PaymentIdentity,
    paymentId: string,
  ): Promise<void> {
    requireCondition(
      await this.identityAvailable(scope, identity, paymentId),
      409,
      'U4_TRANSACTION_CONFLICT',
      '이미 등록된 거래의 현재 근거 대조가 필요합니다.',
    );
    for (const alias of [identity.canonicalIdentity, ...identity.aliases]) {
      const id = u4IdentityClaimId(identity.sourceNamespace, alias);
      const original = await scope.optional('FinancialIdentityClaim', id);
      if (original) continue;
      await scope.transaction.put('FinancialIdentityClaim', {
        modelVersion: 1,
        claimId: id,
        canonicalPaymentId: paymentId,
        sourceNamespace: identity.sourceNamespace,
        canonicalIdentity: alias,
        revision: 1,
      });
    }
  }
  private async portions(
    scope: U4Transaction,
  ): Promise<{ portion: U4RefundStatePortion; refund: ModelData }[]> {
    // 같은 원금을 다른 주문/case에 잘못 연결한 원상도 누락하지 않는다. 사용자 응답에는 이 전역 원본을 투영하지 않는다.
    const cases = await this.collection(scope, 'RefundCase', {});
    return cases.flatMap((refund) =>
      (refund.portions as U4RefundStatePortion[]).map((portion) => ({ portion, refund })),
    );
  }
  private async reversedHistory(scope: U4Transaction, allocation: ModelData, payment: ModelData) {
    const before = allocation.correctionOf as Ref | null;
    const historyRef = (allocation.historyRefs as Ref[]).at(-1);
    hold(
      before?.owner === 'FinancialSettlement' &&
        before.entity === 'PaymentAllocation' &&
        before.id === allocation.allocationId &&
        before.revision + 1 === allocation.revision &&
        historyRef?.owner === 'FinancialSettlement' &&
        historyRef.entity === 'FinancialHistory',
    );
    const reads = scope.readSource();
    const original = await reads.readRevision('PaymentAllocation', before!.id, before!.revision);
    const invoiceRef = allocation.invoiceRef as Ref,
      orderRef = allocation.orderRef as Ref;
    const invoice = await reads.readRevision('Invoice', invoiceRef.id, invoiceRef.revision);
    const order = await reads.readRevision('Order', orderRef.id, orderRef.revision);
    hold(original && invoice && order);
    for (const [model, row] of [
      ['PaymentAllocation', original],
      ['Invoice', invoice],
      ['Order', order],
    ] as const)
      validateModel(model, row!, this.store.schema);
    const history = await scope.optional('FinancialHistory', historyRef!.id);
    const ownReversal = scope.transaction
      .rows()
      .some(
        (row) =>
          row.model === 'PaymentAllocation' &&
          row.id === allocation.allocationId &&
          row.revision === allocation.revision &&
          !row.deleted &&
          exact(row.data, allocation),
      );
    // 같은 명령의 새 반전은 FinancialAccess가 이어서 같은 원자 변경에 이력을 쓴다.
    // 기존 보호 반전은 반드시 실제 이력까지 대조하며 생략을 허용하지 않는다.
    hold(history || ownReversal);
    const after: Ref = {
      owner: 'FinancialSettlement',
      entity: 'PaymentAllocation',
      id: String(allocation.allocationId),
      revision: Number(allocation.revision),
    };
    hold(
      original!.effect === 'APPLIED' &&
        original!.allocationId === before!.id &&
        original!.revision === before!.revision &&
        invoice!.invoiceId === invoiceRef.id &&
        invoice!.revision === invoiceRef.revision &&
        order!.orderId === orderRef.id &&
        order!.revision === orderRef.revision &&
        (invoice!.orderRef as Ref).id === orderRef.id &&
        (invoice!.enterpriseRef as Ref).id === (payment.enterpriseRef as Ref).id &&
        (order!.enterpriseRef as Ref).id === (payment.enterpriseRef as Ref).id &&
        exact(invoice!.targetScope, payment.targetScope) &&
        exact(order!.targetScope, payment.targetScope) &&
        exact(allocation, {
          ...original,
          effect: 'REVERSED',
          correctionOf: before,
          revision: allocation.revision,
          historyRefs: [...(original!.historyRefs as Ref[]), historyRef],
        }) &&
        (!history ||
          (exact(history.beforeRef, before) &&
            exact(history.afterRef, after) &&
            exact(history.correctionOf, (original!.historyRefs as Ref[]).at(-1) ?? null) &&
            exact(history.targetScope, payment.targetScope))),
    );
  }
  async payment(scope: U4Transaction, payment: ModelData) {
    const id = String(payment.paymentEvidenceId),
      balance = await scope.optional('FinancialPaymentBalance', id),
      binding = await scope.optional('FinancialPaymentBinding', id);
    hold(balance && binding && exact(binding.orderRef, payment.boundOrderRef) && payment.identity);
    for (const alias of [
      (payment.identity as U4PaymentIdentity).canonicalIdentity,
      ...(payment.identity as U4PaymentIdentity).aliases,
    ]) {
      const claim = await scope.optional(
        'FinancialIdentityClaim',
        u4IdentityClaimId((payment.identity as U4PaymentIdentity).sourceNamespace, alias),
      );
      hold(
        claim &&
          claim.canonicalPaymentId === id &&
          claim.canonicalIdentity === alias &&
          claim.sourceNamespace === (payment.identity as U4PaymentIdentity).sourceNamespace,
      );
    }
    const allocations = await this.collection(scope, 'PaymentAllocation', {
      paymentEvidenceRef: { id },
    });
    let allocated = 0n;
    for (const allocation of allocations) {
      hold(
        (allocation.paymentEvidenceRef as Ref).owner === 'FinancialSettlement' &&
          exact(allocation.targetScope, payment.targetScope),
      );
      const sameOrder =
        !payment.boundOrderRef ||
        (allocation.orderRef as Ref).id === (payment.boundOrderRef as Ref).id;
      if (allocation.effect === 'REVERSED') {
        await this.reversedHistory(scope, allocation, payment);
      } else hold(sameOrder);
      if (allocation.effect === 'APPLIED') allocated += financialAmount(allocation.amount);
    }
    let ra = 0n,
      ru = 0n,
      ha = 0n,
      hu = 0n;
    const byAllocation = new Map<string, { confirmed: bigint; reserved: bigint }>();
    for (const { portion, refund } of await this.portions(scope)) {
      if (portion.paymentEvidenceRef.id !== id) continue;
      hold(
        payment.boundOrderRef &&
          (refund.orderRef as Ref).id === (payment.boundOrderRef as Ref).id &&
          exact(refund.targetScope, payment.targetScope),
      );
      const confirmed = financialAmount(portion.currentResult.succeeded),
        reserved =
          financialAmount(portion.currentResult.unknown) +
          financialAmount(portion.currentResult.pending);
      if (portion.allocationRef) {
        const allocation = allocations.find(
          (value) => value.allocationId === portion.allocationRef!.id,
        );
        hold(
          allocation &&
            allocation.effect === 'APPLIED' &&
            portion.invoiceRef?.id === (allocation.invoiceRef as Ref).id,
        );
        const previous = byAllocation.get(portion.allocationRef.id) ?? {
          confirmed: 0n,
          reserved: 0n,
        };
        byAllocation.set(portion.allocationRef.id, {
          confirmed: previous.confirmed + confirmed,
          reserved: previous.reserved + reserved,
        });
        ra += confirmed;
        ha += reserved;
      } else {
        hold(portion.invoiceRef === null);
        ru += confirmed;
        hu += reserved;
      }
    }
    for (const allocation of allocations) {
      const used = byAllocation.get(String(allocation.allocationId));
      if (used) hold(used.confirmed + used.reserved <= financialAmount(allocation.amount));
    }
    const principal = payment.lifecycle === 'REVERSED' ? 0n : financialAmount(payment.amount);
    hold(
      financialAmount(balance!.principal) === principal &&
        financialAmount(balance!.allocatedPrincipal) === allocated &&
        financialAmount(balance!.allocatedRefunded) === ra &&
        financialAmount(balance!.unallocatedRefunded) === ru &&
        financialAmount(balance!.allocatedReserved) === ha &&
        financialAmount(balance!.unallocatedReserved) === hu &&
        allocated >= ra + ha &&
        principal - allocated - ru >= hu,
    );
    return {
      balance: balance!,
      binding: binding!,
      allocations,
      byAllocation,
      principal,
      allocated,
      ra,
      ru,
      ha,
      hu,
      available: principal - allocated - ru - hu,
    };
  }
  async invoice(scope: U4Transaction, invoice: ModelData) {
    const id = String(invoice.invoiceId),
      balance = await scope.optional('FinancialInvoiceBalance', id);
    hold(balance && exact(balance.amount, invoice.amount));
    const allocations = await this.collection(scope, 'PaymentAllocation', { invoiceRef: { id } });
    let allocated = 0n,
      refunded = 0n,
      reserved = 0n;
    for (const allocation of allocations) {
      hold(
        (allocation.orderRef as Ref).id === (invoice.orderRef as Ref).id &&
          exact(allocation.targetScope, invoice.targetScope),
      );
      if (allocation.effect === 'APPLIED') allocated += financialAmount(allocation.amount);
    }
    for (const { portion, refund } of await this.portions(scope)) {
      if (portion.invoiceRef?.id !== id) continue;
      hold(
        (refund.orderRef as Ref).id === (invoice.orderRef as Ref).id &&
          exact(refund.targetScope, invoice.targetScope),
      );
      hold(
        portion.allocationRef &&
          allocations.some(
            (value) =>
              value.allocationId === portion.allocationRef!.id && value.effect === 'APPLIED',
          ),
      );
      refunded += financialAmount(portion.currentResult.succeeded);
      reserved +=
        financialAmount(portion.currentResult.unknown) +
        financialAmount(portion.currentResult.pending);
    }
    hold(
      financialAmount(balance!.allocatedPrincipal) === allocated &&
        financialAmount(balance!.refunded) === refunded &&
        financialAmount(balance!.reserved) === reserved &&
        allocated >= refunded + reserved &&
        allocated - refunded <= financialAmount(invoice.amount),
    );
    return {
      balance: balance!,
      allocations,
      allocated,
      refunded,
      reserved,
      net: allocated - refunded,
      remaining: financialAmount(invoice.amount) - allocated + refunded,
    };
  }
}
