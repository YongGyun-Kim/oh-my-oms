import { beforeEach, describe, expect, it } from 'vitest';
import type { U3RenewalRegistration } from '@oms/core';
import { seedU4CommercialPlan } from '../fixtures/commercial-plan.js';
import { persistenceFixture } from '../fixtures/persistence.js';
import { u4Ref } from '../fixtures/contracts.js';

describe('U4 별도 갱신 주문의 검증 회차와 과거 지급 경계', () => {
  const { store } = persistenceFixture();
  let f: Awaited<ReturnType<typeof seedU4CommercialPlan>>;
  beforeEach(async () => {
    f = await seedU4CommercialPlan(store, true);
  });
  it('같은 검증 회차는 원본 개정이 높아져도 별도 주문을 두 번 만들지 않는다', async () => {
    const approved = await f.approve();
    const input = await f.orderInput(approved.targetRef!);
    input.renewal = {
      entitlementRef: u4Ref('SoftwareLifecycle', 'EnterpriseEntitlement', 'synthetic-entitlement'),
      renewalCycleRef: u4Ref('SoftwareLifecycle', 'RenewalCycle', 'synthetic-cycle'),
      originalTermsRef: approved.targetRef!,
    };
    const registration: U3RenewalRegistration = {
      kind: 'LOCAL_SYNTHETIC',
      ownerRegistration: 'u4-renewal-synthetic-owner',
      async readRenewal(binding) {
        return {
          binding,
          knowledge: 'KNOWN',
          state: 'RENEWABLE',
          productType: 'SOFTWARE',
          originalTerms: {
            termsRecordRef: binding.originalTermsRef,
            lines: [
              {
                productRef: f.productRef,
                quantity: 1,
                price: { currency: 'KRW', value: '1000' },
                period: null,
                conditionRefs: [f.offerRef],
              },
            ],
          },
          originalPriceBreakdown: input.priceConfirmation!.priceBreakdown,
          sourceRefs: [binding.entitlementRef, binding.renewalCycleRef, binding.originalTermsRef],
          observedAt: f.seller.now().toISOString(),
          expiresAt: new Date(f.seller.now().getTime() + 30000).toISOString(),
        };
      },
    };
    const service = f.orders(undefined, registration);
    const first = await service.submit(await f.requestContext(f.seller.customer), input);
    expect(first.targetRef!.id.startsWith('renewal-')).toBe(true);
    expect(await store.currentProtected('Order', first.targetRef!.id)).toMatchObject({
      renewalCycleRef: input.renewal.renewalCycleRef,
      paymentPlan: { customerConsentRef: null },
    });
    const again = structuredClone(input);
    again.meta = f.meta();
    again.renewal!.renewalCycleRef.revision = 2;
    await expect(
      service.submit(await f.requestContext(f.seller.customer), again),
    ).rejects.toMatchObject({ code: 'U4_RENEWAL_ORDER_EXISTS' });
    expect(await store.list('Order')).toHaveLength(1);
    expect(await store.list('Invoice')).toHaveLength(0);
    expect(await store.list('PaymentAllocation')).toHaveLength(0);
  });
  it('갱신 소유자 미등록과 입력으로 주입한 과거 입금 참조는 새 주문의 지급 근거가 아니다', async () => {
    const approved = await f.approve(),
      input = await f.orderInput(approved.targetRef!);
    input.renewal = {
      entitlementRef: u4Ref('SoftwareLifecycle', 'EnterpriseEntitlement', 'synthetic-entitlement'),
      renewalCycleRef: u4Ref('SoftwareLifecycle', 'RenewalCycle', 'synthetic-cycle'),
      originalTermsRef: approved.targetRef!,
    };
    await expect(
      f.orders().submit(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({ code: 'U6_SOURCE_UNCONFIRMED' });
    await expect(
      f
        .orders()
        .submit(await f.requestContext(f.seller.customer), {
          ...input,
          priorPaymentRef: u4Ref('FinancialSettlement', 'PaymentEvidence', 'old-payment'),
        } as typeof input),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await store.list('Order')).toHaveLength(0);
    expect(await store.list('PaymentAllocation')).toHaveLength(0);
  });
});
