import { describe, expect, it, vi } from 'vitest';
import { OmsError, SchemaValidator } from '@oms/contracts';
import type { TargetScope, U4CapturedLine, U4OrderLineInput } from '@oms/contracts';
import { U4CommercialOrder } from '@oms/core';
import type { U4CommercialAdapter } from '@oms/core';
import type { U4Transaction } from '@oms/persistence';
import { u4Money, u4Plan, u4Ref, u4Scope } from '../fixtures/contracts.js';

function fixture() {
  const plan = u4Plan();
  const line: U4OrderLineInput = {
    productRef: u4Ref('ProductCatalog', 'Product', 'synthetic-product'),
    commonOfferRevisionRef: u4Ref('ProductCatalog', 'CommonOfferRevision', 'synthetic-offer'),
    quantity: 1,
    requestedActivationDate: null,
    agreementRevisionRefs: [plan.agreementRevisionRef],
    conditionBindings: [
      {
        conditionKey: 'PAYMENT',
        value: { mode: 'MIXED', termsRef: plan.agreementRevisionRef },
        sourceRef: plan.agreementRevisionRef,
        effectiveWindow: {
          startAt: '2026-01-01T00:00:00Z',
          startInclusive: true,
          endAt: null,
          endInclusive: false,
        },
        evidenceRefs: [plan.agreementRevisionRef],
      },
    ],
  };
  const orders = new U4CommercialOrder({
    store: { schema: new SchemaValidator() },
    now: () => new Date('2026-10-15T00:00:00Z'),
  } as unknown as U4CommercialAdapter);
  const source = {
    product: { productId: line.productRef.id, label: '합성 현재 상품' },
    bindings: structuredClone(line.conditionBindings),
    agreementRefs: structuredClone(line.agreementRevisionRefs),
  };
  const read = vi.spyOn(orders, 'catalog').mockResolvedValue(source);
  const scope = {} as U4Transaction;
  return { orders, read, scope, source, line, plan };
}

describe('U4 주문의 한 검증 pass 안에서만 동일 catalog 원본 재사용', () => {
  it('동일 원본의 실제100줄을 합치지 않고100개 결과로 반환한다', async () => {
    const f = fixture();
    const lines = Array.from({ length: 100 }, (_, index) => ({
      ...structuredClone(f.line),
      quantity: index + 1,
    }));
    const result = await f.orders.catalogLines(f.scope, u4Scope(), lines);
    expect(result).toHaveLength(100);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(new Set(result)).toHaveProperty('size', 100);
  });
  it('다른 상품ID와 같은 상품의 다른 정확 개정을 구별한다', async () => {
    const f = fixture();
    await f.orders.catalogLines(f.scope, u4Scope(), [
      f.line,
      { ...f.line, productRef: { ...f.line.productRef, id: 'another-product' } },
      { ...f.line, productRef: { ...f.line.productRef, revision: 2 } },
      structuredClone(f.line),
    ]);
    expect(f.read).toHaveBeenCalledTimes(3);
  });
  it('다른 offerID와 같은 offer의 다른 정확 개정을 구별한다', async () => {
    const f = fixture();
    await f.orders.catalogLines(f.scope, u4Scope(), [
      f.line,
      {
        ...f.line,
        commonOfferRevisionRef: { ...f.line.commonOfferRevisionRef, id: 'another-offer' },
      },
      { ...f.line, commonOfferRevisionRef: { ...f.line.commonOfferRevisionRef, revision: 2 } },
    ]);
    expect(f.read).toHaveBeenCalledTimes(3);
  });
  it('기업·부서·현장·조직개정·정책이 다른 범위를 새 pass의 실제 읽기로 전달한다', async () => {
    const f = fixture(),
      target = u4Scope();
    const scopes: TargetScope[] = [
      target,
      { ...target, enterpriseRef: { ...target.enterpriseRef, id: 'another-enterprise' } },
      { ...target, departmentRef: u4Ref('EnterpriseAccess', 'Department', 'another-department') },
      { ...target, siteRef: u4Ref('EnterpriseAccess', 'Site', 'another-site') },
      { ...target, organisationRevision: 2 },
      { ...target, contextPolicyRef: { ...target.contextPolicyRef!, revision: 2 } },
    ];
    for (const scope of scopes) await f.orders.catalogLines(f.scope, scope, [f.line]);
    expect(f.read.mock.calls.map((call) => call[1])).toEqual(scopes);
    expect(f.read).toHaveBeenCalledTimes(scopes.length);
  });
  it('반환 상품·조건·근거 배열의 변경이 뒤 줄이나 생산자 snapshot을 오염시키지 않는다', async () => {
    const f = fixture();
    const result = await f.orders.catalogLines(f.scope, u4Scope(), [f.line, f.line]);
    result[0]!.product.label = '합성 변경';
    result[0]!.bindings[0]!.evidenceRefs[0]!.revision = 99;
    result[0]!.agreementRefs.splice(0);
    expect(result[1]).toEqual(f.source);
    expect(result[1]!.bindings[0]!.evidenceRefs[0]!.revision).toBe(1);
    expect(f.source.product.label).toBe('합성 현재 상품');
    expect(result[1]).not.toBe(f.source);
  });
  it('수락 전후의 별도 pass는 원본을 다시 읽고 현재개정 거절을 그대로 전파한다', async () => {
    const f = fixture();
    await f.orders.catalogLines(f.scope, u4Scope(), [f.line, f.line]);
    f.read.mockRejectedValueOnce(new OmsError(503, 'U4_PLAN_UNCONFIRMED', '합성 현재개정 변경'));
    await expect(f.orders.catalogLines(f.scope, u4Scope(), [f.line, f.line])).rejects.toMatchObject(
      { code: 'U4_PLAN_UNCONFIRMED' },
    );
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it('실패한 pass나 앞 요청의 결과를 다음 호출에 보관하지 않는다', async () => {
    const f = fixture();
    f.read.mockRejectedValueOnce(new OmsError(503, 'U4_PLAN_UNCONFIRMED', '합성 원본 미확인'));
    await expect(f.orders.catalogLines(f.scope, u4Scope(), [f.line])).rejects.toMatchObject({
      code: 'U4_PLAN_UNCONFIRMED',
    });
    expect(await f.orders.catalogLines(f.scope, u4Scope(), [f.line])).toEqual([f.source]);
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it('같은 catalog를 재사용해도100번째 줄의 조건이나 승인Ref 불일치를 거절한다', async () => {
    for (const kind of ['CONDITION', 'AGREEMENT']) {
      const f = fixture();
      vi.spyOn(f.orders.plans, 'current').mockResolvedValue(f.plan);
      const captured: U4CapturedLine[] = Array.from({ length: 100 }, () => ({
        ...structuredClone(f.line),
        paymentMode: 'MIXED',
        purchasePrice: u4Money('1000'),
        priceKnowledge: 'KNOWN',
        paymentTermsRef: f.plan.agreementRevisionRef,
        agreedPeriod: null,
        completionBasisRef: f.plan.agreementRevisionRef,
      }));
      if (kind === 'CONDITION') captured[99]!.conditionBindings[0]!.evidenceRefs[0]!.revision = 2;
      else captured[99]!.agreementRevisionRefs[0]!.revision = 2;
      const current = {
        order: { targetScope: u4Scope() },
        plan: f.plan,
        price: { total: f.plan.total },
        captured,
      } as unknown as Awaited<ReturnType<U4CommercialOrder['current']>>;
      await expect(f.orders.commercial(f.scope, current)).rejects.toMatchObject({
        code: 'U4_ORDER_UNCONFIRMED',
      });
      expect(f.read).toHaveBeenCalledTimes(1);
    }
  });
});
