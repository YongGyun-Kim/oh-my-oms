import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Receipt, Ref, U4InvoiceInput } from '@oms/contracts';
import { requireCondition, SchemaValidator } from '@oms/contracts';
import {
  modelDefinition,
  primaryAttribute,
  u4ObligationBindingId,
  u4IdentityClaimId,
} from '@oms/persistence';
import type { ModelData, ProtectedStore, U4Transaction } from '@oms/persistence';
import {
  U4CommercialAdapter,
  U4CommercialOrder,
  U4FinancialAccess,
  U4FinancialCommands,
  U4PaymentPlan,
} from '@oms/core';
import { u4Evidence, u4Money, u4Plan, u4Ref, u4Scope } from '../fixtures/contracts.js';
import { u4ModelFixture } from '../fixtures/models.js';
import { fixtureContext } from '../../u3/fixtures/identity.js';

function fixture() {
  const schema = new SchemaValidator(),
    now = () => new Date('2026-12-01T00:00:00Z');
  const store = { schema } as ProtectedStore;
  const adapter = new U4CommercialAdapter(store, now, async () => true),
    access = new U4FinancialAccess(adapter);
  const financial = new U4FinancialCommands(access);
  const targetScope = u4Scope(),
    plan = u4Plan(),
    orderRef = u4Ref('OrderAcceptance', 'Order', 'order');
  const order: ModelData = {
    orderId: orderRef.id,
    modelVersion: 3,
    state: 'ACCEPTED',
    revision: 1,
    targetScope,
    purchaseTermsRef: u4Ref('OrderAcceptance', 'PurchaseTermsSnapshot', 'snapshot'),
    lineRefs: [u4Ref('OrderAcceptance', 'OrderLine', 'line')],
    productType: 'HARDWARE',
  };
  const current = { order, plan, price: { total: plan.total }, application: null };
  vi.spyOn(U4CommercialOrder.prototype, 'current').mockResolvedValue(
    current as unknown as Awaited<ReturnType<U4CommercialOrder['current']>>,
  );
  vi.spyOn(U4PaymentPlan.prototype, 'current').mockResolvedValue(plan);
  const rows = new Map<string, ModelData>();
  const put = vi.fn(async (model: string, data: ModelData) =>
    rows.set(model + '/' + data[primaryAttribute(modelDefinition(model)).name], data),
  );
  const scope = {
    current: async (reference: Ref) => {
      const value = rows.get(reference.entity + '/' + reference.id);
      requireCondition(
        value && value.revision === reference.revision,
        409,
        'STALE_U4_REFERENCE',
        '합성 현재 원본 필요',
      );
      return value!;
    },
    optional: async (model: string, id: string) => rows.get(model + '/' + id) ?? null,
    lock: vi.fn(async () => {}),
    transaction: { put },
    financialCollection: async (model: string, equals: Record<string, unknown>) =>
      [...rows]
        .filter(([key]) => key.startsWith(model + '/'))
        .map(([, data]) => data)
        .filter((data) =>
          Object.entries(equals).every(([key, value]) =>
            typeof value === 'object' && value !== null
              ? (data[key] as { id: string }).id === (value as { id: string }).id
              : data[key] === value,
          ),
        ),
  } as unknown as U4Transaction;
  // 이 시험은 업무 규칙만 분리한다. 실제 권한/원자성·보호는 DB/금융 흐름 시험으로 검증한다.
  vi.spyOn(access, 'run').mockImplementation(
    async (_context, _name, _target, _input, _proof, change) =>
      (await change(scope, {
        historyRef: u4Ref('FinancialSettlement', 'FinancialHistory', 'history'),
        epoch: 'initial',
        requestDigest: 'a'.repeat(64),
        personSources: [],
      })) as unknown as Receipt,
  );
  const meta = (expectedRevision: number | null = null) => ({
    clientRequestId: 'key',
    expectedRevision,
    reason: '합성 규칙 검증',
    evidenceRefs: [],
  });
  const invoice = (): U4InvoiceInput => ({
    meta: meta(1),
    orderRef,
    targetScope,
    chargeTermsRef: order.purchaseTermsRef as Ref,
    planRevision: 1,
    obligationKey: 'first',
    label: plan.obligations[0]!.label,
    amount: u4Money('200'),
    dueBasis: plan.obligations[0]!.dueBasis,
    renewalCycleRefs: [],
    sourceEvidence: u4Evidence(),
    correctionOf: null,
  });
  const paymentRef = u4Ref('FinancialSettlement', 'PaymentEvidence', 'payment');
  const payment: ModelData = {
    ...u4ModelFixture('PaymentEvidence', 'payment'),
    boundOrderRef: orderRef,
  };
  const seed = (model: string, data: ModelData) =>
    rows.set(model + '/' + data[primaryAttribute(modelDefinition(model)).name], data);
  return {
    schema,
    access,
    financial,
    scope,
    rows,
    put,
    targetScope,
    orderRef,
    order,
    plan,
    invoice,
    paymentRef,
    payment,
    meta,
    seed,
    context: fixtureContext('STAFF'),
  };
}
describe('청구·입금·정정의 업무 규칙', () => {
  afterEach(() => vi.restoreAllMocks());
  it('수락되지 않은 계획 초안을 유효 청구로 승격하지 않는다', async () => {
    const f = fixture();
    f.order.state = 'REVIEW';
    await expect(f.financial.registerInvoice(f.context, f.invoice(), null)).rejects.toMatchObject({
      code: 'U4_ORDER_NOT_ACCEPTED',
    });
    expect(f.put).not.toHaveBeenCalled();
  });
  it('직원 청구 입력으로 승인 의무 금액·기한·명칭을 바꾸지 못한다', async () => {
    const f = fixture();
    for (const patch of [
      { amount: u4Money('201') },
      { label: '직원 면제' },
      { dueBasis: { kind: 'FIXED_DATE' as const, date: '2026-12-02' } },
    ])
      await expect(
        f.financial.registerInvoice(f.context, { ...f.invoice(), ...patch }, null),
      ).rejects.toMatchObject({ code: 'U4_FINANCIAL_BASIS' });
    expect(f.put).not.toHaveBeenCalled();
  });
  it('같은 주문·불변 의무의 기존 청구는 새 ID/요청으로 복제하지 못한다', async () => {
    const f = fixture();
    f.seed('FinancialInvoiceBinding', {
      ...u4ModelFixture('FinancialInvoiceBinding'),
      bindingId: u4ObligationBindingId(f.orderRef.id, 'first'),
      orderId: f.orderRef.id,
      obligationKey: 'first',
      invoiceRef: u4Ref('FinancialSettlement', 'Invoice', 'existing'),
    });
    await expect(f.financial.registerInvoice(f.context, f.invoice(), null)).rejects.toMatchObject({
      code: 'U4_OBLIGATION_ALREADY_INVOICED',
    });
    expect(f.put).not.toHaveBeenCalled();
  });
  it('승인된 청구를 등록해도 입금 원금·배분을 증가시키지 않는다', async () => {
    const f = fixture(),
      result = await f.financial.registerInvoice(f.context, f.invoice(), null);
    expect(result.targetRef ?? (result as unknown as { target: Ref }).target).toMatchObject({
      entity: 'Invoice',
    });
    expect(f.put.mock.calls.map(([model]) => model)).toEqual([
      'Invoice',
      'FinancialInvoiceBinding',
      'FinancialInvoiceBalance',
    ]);
    expect(f.put.mock.calls[2]![1]).toMatchObject({
      amount: u4Money('200'),
      allocatedPrincipal: u4Money('0'),
      refunded: u4Money('0'),
      reserved: u4Money('0'),
    });
  });
  it('문서/identity 주장을 가진 입금 후보도 명시 확인 전 REVIEW이며 원금을 만들지 않는다', async () => {
    const f = fixture();
    const result = await f.financial.recordPaymentEvidence(
      f.context,
      {
        meta: f.meta(),
        targetScope: f.targetScope,
        enterpriseRef: f.targetScope.enterpriseRef,
        sourceEvidence: u4Evidence(),
        amount: u4Money('100'),
        actualPaidAt: '2026-12-01T00:00:00Z',
        identity: {
          sourceProfileId: 'claimed',
          sourceProfileRevision: 1,
          sourceNamespace: 'claimed',
          canonicalIdentity: 'claimed',
          aliases: [],
        },
        orderRef: null,
        correctionOf: null,
      },
      null,
    );
    expect(result).toMatchObject({ state: 'REVIEW_REQUIRED' });
    expect(f.put.mock.calls).toHaveLength(1);
    expect(f.put.mock.calls[0]![1]).toMatchObject({
      lifecycle: 'REVIEW',
      identity: null,
      confirmationRef: null,
      knowledge: 'UNKNOWN',
    });
  });
  it('미등록 원본의 확인 요청은 REVIEW로 남기고 식별 예약/입금 원금을 발행하지 않는다', async () => {
    const f = fixture();
    f.seed('PaymentEvidence', f.payment);
    await expect(
      f.financial.confirmPaymentEvidence(
        f.context,
        {
          meta: f.meta(1),
          paymentEvidenceRef: f.paymentRef,
          targetScope: f.targetScope,
          amount: u4Money('100'),
          actualPaidAt: '2026-12-01T00:00:00Z',
          identity: {
            sourceProfileId: 'unregistered',
            sourceProfileRevision: 1,
            sourceNamespace: 'unregistered',
            canonicalIdentity: 'transaction',
            aliases: [],
          },
          sourceEvidence: u4Evidence(),
        },
        null,
      ),
    ).resolves.toMatchObject({ state: 'REVIEW_REQUIRED' });
    expect(f.put.mock.calls.map(([model]) => model)).toEqual(['PaymentEvidence']);
  });
  it('다른 canonical payment의 실제 거래 중복은 새 현금 대신 대조 원본으로 남긴다', async () => {
    const f = fixture();
    f.seed('PaymentEvidence', f.payment);
    vi.spyOn(f.financial.source, 'payment').mockResolvedValue('CONFIRMED');
    vi.spyOn(f.financial.ledger, 'identityAvailable').mockResolvedValue(false);
    const result = await f.financial.confirmPaymentEvidence(
      f.context,
      {
        meta: f.meta(1),
        targetScope: f.targetScope,
        paymentEvidenceRef: f.paymentRef,
        amount: u4Money('100'),
        actualPaidAt: '2026-12-01T00:00:00Z',
        identity: {
          sourceProfileId: 'synthetic',
          sourceProfileRevision: 1,
          sourceNamespace: 'synthetic',
          canonicalIdentity: 'duplicate',
          aliases: [],
        },
        sourceEvidence: u4Evidence(),
      },
      null,
    );
    expect(result).toMatchObject({ state: 'REVIEW_REQUIRED' });
    expect(f.put.mock.calls.map(([model]) => model)).toEqual([
      'PaymentEvidence',
      'FinancialReconciliationCase',
    ]);
    expect(f.put.mock.calls[0]![1]).toMatchObject({ lifecycle: 'DISPUTED', identity: null });
  });
  it('이미 배분한 입금의 반전은 원금/별칭 예약을 복원하지 않고 차단한다', async () => {
    const f = fixture(),
      identity = {
        sourceProfileId: 'synthetic',
        sourceProfileRevision: 1,
        sourceNamespace: 'synthetic',
        canonicalIdentity: 'transaction',
        aliases: [],
      };
    f.payment.lifecycle = 'CONFIRMED';
    f.payment.identity = identity;
    f.seed('PaymentEvidence', f.payment);
    f.seed('FinancialPaymentBinding', {
      ...u4ModelFixture('FinancialPaymentBinding', 'payment'),
      orderRef: f.orderRef,
    });
    f.seed('FinancialPaymentBalance', {
      ...u4ModelFixture('FinancialPaymentBalance', 'payment'),
      allocatedPrincipal: u4Money('60'),
    });
    f.seed('FinancialIdentityClaim', {
      modelVersion: 1,
      claimId: u4IdentityClaimId(identity.sourceNamespace, identity.canonicalIdentity),
      canonicalPaymentId: 'payment',
      sourceNamespace: identity.sourceNamespace,
      canonicalIdentity: identity.canonicalIdentity,
      revision: 1,
    });
    f.seed('PaymentAllocation', {
      ...u4ModelFixture('PaymentAllocation', 'allocation'),
      orderRef: f.orderRef,
      paymentEvidenceRef: f.paymentRef,
      amount: u4Money('60'),
    });
    await expect(
      f.financial.correctPaymentEvidence(
        f.context,
        {
          meta: f.meta(1),
          targetScope: f.targetScope,
          paymentEvidenceRef: f.paymentRef,
          correctionKind: 'REVERSE',
          sourceEvidence: u4Evidence(),
          identity: null,
          amount: null,
          actualPaidAt: null,
        },
        null,
      ),
    ).rejects.toMatchObject({ code: 'U4_PAYMENT_CONSUMED' });
    expect(f.put).not.toHaveBeenCalled();
  });
});
