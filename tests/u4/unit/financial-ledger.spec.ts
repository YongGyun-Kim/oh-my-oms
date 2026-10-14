import { describe, expect, it, vi } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import type { U4PaymentIdentity, U4RefundStatePortion } from '@oms/contracts';
import { u4IdentityClaimId } from '@oms/persistence';
import type { ModelData, ProtectedStore, U4Transaction } from '@oms/persistence';
import {
  U4FinancialLedger,
  financialAmount,
  financialMoney,
} from '../../../packages/core/src/u4-financial-ledger.js';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Money, u4Ref } from '../fixtures/contracts.js';

function fixture() {
  const identity: U4PaymentIdentity = {
    sourceProfileId: 'synthetic-source',
    sourceProfileRevision: 1,
    sourceNamespace: 'synthetic-receiver',
    canonicalIdentity: 'canonical',
    aliases: ['old'],
  };
  const order = u4Ref('OrderAcceptance', 'Order', 'order');
  const payment = {
    ...u4ModelFixture('PaymentEvidence', 'payment'),
    lifecycle: 'CONFIRMED',
    identity,
    boundOrderRef: order,
  };
  const invoice = { ...u4ModelFixture('Invoice', 'invoice'), orderRef: order };
  const balance = {
    ...u4ModelFixture('FinancialPaymentBalance', 'payment'),
    principal: u4Money('100'),
    allocatedPrincipal: u4Money('60'),
    allocatedRefunded: u4Money('10'),
    unallocatedRefunded: u4Money('5'),
    allocatedReserved: u4Money('20'),
    unallocatedReserved: u4Money('5'),
  };
  const invoiceBalance = {
    ...u4ModelFixture('FinancialInvoiceBalance', 'invoice'),
    allocatedPrincipal: u4Money('60'),
    refunded: u4Money('10'),
    reserved: u4Money('20'),
  };
  const allocation = {
    ...u4ModelFixture('PaymentAllocation', 'allocation'),
    paymentEvidenceRef: u4Ref('FinancialSettlement', 'PaymentEvidence', 'payment'),
    invoiceRef: u4Ref('FinancialSettlement', 'Invoice', 'invoice'),
    orderRef: order,
    amount: u4Money('60'),
    effect: 'APPLIED',
  };
  const portion = (
    key: string,
    allocated: boolean,
    succeeded: string,
    unknown: string,
  ): U4RefundStatePortion => ({
    portionKey: key,
    paymentEvidenceRef: u4Ref('FinancialSettlement', 'PaymentEvidence', 'payment'),
    allocationRef: allocated
      ? u4Ref('FinancialSettlement', 'PaymentAllocation', 'allocation')
      : null,
    invoiceRef: allocated ? u4Ref('FinancialSettlement', 'Invoice', 'invoice') : null,
    amount: u4Money(String(BigInt(succeeded) + BigInt(unknown))),
    operationId: 'operation-' + key,
    attemptId: 'attempt-' + key,
    currentResult: {
      portionKey: key,
      operationId: 'operation-' + key,
      attemptId: 'attempt-' + key,
      succeeded: u4Money(succeeded),
      failed: u4Money('0'),
      unknown: u4Money(unknown),
      pending: u4Money('0'),
      resultRevision: 1,
      actualResultIdentity: { ...identity, canonicalIdentity: 'refund-' + key, aliases: [] },
    },
    priorAttempts: [],
  });
  const refund = {
    ...u4ModelFixture('RefundCase', 'refund'),
    requestedAmount: u4Money('40'),
    orderRef: order,
    portions: [portion('allocated', true, '10', '20'), portion('unallocated', false, '5', '5')],
  };
  const rows = new Map<string, ModelData>([
    ['FinancialPaymentBalance/payment', balance],
    [
      'FinancialPaymentBinding/payment',
      { ...u4ModelFixture('FinancialPaymentBinding', 'payment'), orderRef: order },
    ],
    ['FinancialInvoiceBalance/invoice', invoiceBalance],
    ...[identity.canonicalIdentity, ...identity.aliases].map((alias): [string, ModelData] => [
      'FinancialIdentityClaim/' + u4IdentityClaimId(identity.sourceNamespace, alias),
      {
        modelVersion: 1,
        claimId: u4IdentityClaimId(identity.sourceNamespace, alias),
        canonicalPaymentId: 'payment',
        sourceNamespace: identity.sourceNamespace,
        canonicalIdentity: alias,
        revision: 1,
      },
    ]),
  ]);
  const allocations: ModelData[] = [allocation],
    refunds: ModelData[] = [refund];
  const put = vi.fn(async (model: string, data: ModelData) => {
    if (model === 'FinancialIdentityClaim') rows.set(model + '/' + data.claimId, data);
  });
  const scope = {
    optional: vi.fn(async (model: string, id: string) => rows.get(model + '/' + id) ?? null),
    financialCollection: vi.fn(async (model: string) =>
      model === 'PaymentAllocation' ? allocations : model === 'RefundCase' ? refunds : [],
    ),
    transaction: { put },
  } as unknown as U4Transaction;
  const ledger = new U4FinancialLedger({ schema: new SchemaValidator() } as ProtectedStore);
  return {
    identity,
    payment,
    invoice,
    balance,
    invoiceBalance,
    allocation,
    refund,
    rows,
    allocations,
    refunds,
    put,
    scope,
    ledger,
  };
}
describe('정확한 금융 원금·배분·환불 예약 ledger', () => {
  it('안전정수 밖 원 단위도 BigInt로 보존하고 음수·표현 상한 초과를 거절한다', () => {
    expect(financialMoney(financialAmount(u4Money('9007199254740993')) + 1n)).toEqual(
      u4Money('9007199254740994'),
    );
    expect(() => financialMoney(-1n)).toThrow();
    expect(() => financialMoney(BigInt('1' + '0'.repeat(4096)))).toThrow();
  });
  it('P=A+U+RA+RU와 HA/HU를 분리하여 새 배분 가용30원을 계산한다', async () => {
    const f = fixture(),
      actual = await f.ledger.payment(f.scope, f.payment);
    expect(actual).toMatchObject({
      principal: 100n,
      allocated: 60n,
      ra: 10n,
      ru: 5n,
      ha: 20n,
      hu: 5n,
      available: 30n,
    });
    expect(actual.byAllocation.get('allocation')).toEqual({ confirmed: 10n, reserved: 20n });
  });
  it('청구는 순지급50·남은50을 계산하고 환불 예약을 지급 완료로 더하지 않는다', async () => {
    const f = fixture();
    expect(await f.ledger.invoice(f.scope, f.invoice)).toMatchObject({
      allocated: 60n,
      refunded: 10n,
      reserved: 20n,
      net: 50n,
      remaining: 50n,
    });
  });
  it('첫 집계와 실제 전체 배분/부분 환불 원상이 다르면 추가 소비를 HOLD한다', async () => {
    const f = fixture();
    f.balance.allocatedPrincipal = u4Money('59');
    await expect(f.ledger.payment(f.scope, f.payment)).rejects.toMatchObject({
      code: 'U4_LEDGER_UNCONFIRMED',
    });
    const g = fixture();
    g.invoiceBalance.refunded = u4Money('0');
    await expect(g.ledger.invoice(g.scope, g.invoice)).rejects.toMatchObject({
      code: 'U4_LEDGER_UNCONFIRMED',
    });
  });
  it('다른 case/주문의 원금 참조와 이미 반전한 배분의 환불 예약을 숨기지 않는다', async () => {
    const f = fixture();
    f.refund.orderRef = u4Ref('OrderAcceptance', 'Order', 'other');
    await expect(f.ledger.payment(f.scope, f.payment)).rejects.toMatchObject({
      code: 'U4_LEDGER_UNCONFIRMED',
    });
    const g = fixture();
    g.allocation.effect = 'REVERSED';
    await expect(g.ledger.payment(g.scope, g.payment)).rejects.toMatchObject({
      code: 'U4_LEDGER_UNCONFIRMED',
    });
  });
  it('같은 namespace 별칭이 다른 canonical payment에 있으면 새 profile개정도 재등록하지 못한다', async () => {
    const f = fixture();
    expect(
      await f.ledger.identityAvailable(
        f.scope,
        { ...f.identity, sourceProfileRevision: 2 },
        'another-payment',
      ),
    ).toBe(false);
    expect(await f.ledger.identityAvailable(f.scope, f.identity, 'payment')).toBe(true);
    await expect(
      f.ledger.reserveIdentity(f.scope, f.identity, 'another-payment'),
    ).rejects.toMatchObject({ code: 'U4_TRANSACTION_CONFLICT' });
    expect(f.put).not.toHaveBeenCalled();
  });
  it('정정은 기존 별칭 claim을 덮어쓰지 않고 새 별칭만 같은 canonical payment에 예약한다', async () => {
    const f = fixture();
    await f.ledger.reserveIdentity(f.scope, { ...f.identity, aliases: ['old', 'new'] }, 'payment');
    expect(f.put).toHaveBeenCalledTimes(1);
    expect(f.put.mock.calls[0]![1]).toMatchObject({
      canonicalPaymentId: 'payment',
      canonicalIdentity: 'new',
    });
    expect(
      f.rows.has('FinancialIdentityClaim/' + u4IdentityClaimId(f.identity.sourceNamespace, 'old')),
    ).toBe(true);
  });
  it('입금 반전은 원금을0으로 보존해도 식별 예약을 해제하지 않으며 claim 누락은 HOLD한다', async () => {
    const f = fixture();
    f.payment.lifecycle = 'REVERSED';
    f.balance.principal = u4Money('0');
    f.balance.allocatedPrincipal = u4Money('0');
    f.balance.allocatedRefunded = u4Money('0');
    f.balance.unallocatedRefunded = u4Money('0');
    f.balance.allocatedReserved = u4Money('0');
    f.balance.unallocatedReserved = u4Money('0');
    f.allocations.length = 0;
    f.refunds.length = 0;
    expect((await f.ledger.payment(f.scope, f.payment)).available).toBe(0n);
    expect(await f.ledger.identityAvailable(f.scope, f.identity, 'another-payment')).toBe(false);
    f.rows.delete('FinancialIdentityClaim/' + u4IdentityClaimId(f.identity.sourceNamespace, 'old'));
    await expect(f.ledger.payment(f.scope, f.payment)).rejects.toMatchObject({
      code: 'U4_LEDGER_UNCONFIRMED',
    });
  });
});
