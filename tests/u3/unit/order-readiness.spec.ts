import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { ExecutionBudget } from '@oms/contracts';
import { ProtectedStore } from '@oms/persistence';
import { U3OrderReadiness } from '@oms/core';
import type {
  U3ReadinessBinding,
  U3ReadinessObservation,
  U3ReadinessRegistration,
  U3ReadinessRequest,
} from '@oms/core';
import { fixtureRef } from '../fixtures/identity.js';
import { orderFixture } from '../fixtures/commercial.js';
import { proposalPrice } from '../fixtures/proposal-input.js';

function fixture() {
  // DB에는 접속하지 않는다. mock callback은 실제 U4/U5 준비 생산자의 운영 증거가 아니다.
  const store = new ProtectedStore(
    new DataSource({ type: 'postgres', synchronize: false }),
    new DataSource({ type: 'postgres', synchronize: false }),
  );
  vi.spyOn(store, 'currentEpoch').mockResolvedValue('local-epoch');
  const input = orderFixture();
  const request: U3ReadinessRequest = {
    orderRef: fixtureRef('OrderAcceptance', 'Order'),
    purchaseTermsRef: fixtureRef('OrderAcceptance', 'PurchaseTermsSnapshot'),
    currentTermsRef: fixtureRef('OrderAcceptance', 'PurchaseTermsSnapshot'),
    enterpriseRef: input.targetScope.enterpriseRef,
    targetScope: input.targetScope,
    productType: 'HARDWARE',
    paymentKind: 'PREPAY',
    provisionChoice: 'FULL',
    priceBreakdown: proposalPrice(),
    lines: [
      {
        ...input.lines[0]!,
        lineRef: fixtureRef('OrderAcceptance', 'OrderLine'),
        agreedPeriod: null,
      },
    ],
    epoch: 'local-epoch',
    decisionDigest: 'a'.repeat(64),
  };
  const observe = (binding: U3ReadinessBinding): U3ReadinessObservation => {
    const sourceRef = fixtureRef('HardwareFulfillment', 'HardwareSupplyAssessment');
    return {
      binding: structuredClone(binding),
      knowledge: 'KNOWN',
      sourceRef,
      sourceRefs: [sourceRef],
      lines: binding.lines.map((line) => ({
        lineRef: line.lineRef,
        knowledge: 'KNOWN',
        readyQuantity: line.quantity,
        activationResolution: 'NOT_REQUIRED',
      })),
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };
  };
  const registration: U3ReadinessRegistration = {
    kind: 'REGISTERED_OWNER',
    owner: 'HardwareFulfillment',
    ownerRegistration: 'mock-u5',
    async readReadiness(binding) {
      return observe(binding);
    },
  };
  return { store, request, observe, registration };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('현재 전체 주문 준비 소유자 등록·정확한 결합·유한 기한', () => {
  it('기본 미등록은 확인되지 않으며 정확한 서버 등록 mock 결합만 반환한다', async () => {
    const f = fixture();
    await expect(
      new U3OrderReadiness(f.store, () => new Date()).current('HardwareFulfillment', f.request),
    ).rejects.toMatchObject({ code: 'ORDER_READINESS_UNCONFIRMED' });
    const result = await new U3OrderReadiness(f.store, () => new Date(), [f.registration]).current(
      'HardwareFulfillment',
      f.request,
    );
    expect(result.binding).toEqual({
      ...f.request,
      owner: 'HardwareFulfillment',
      ownerRegistration: 'mock-u5',
      purpose: 'ORDER_ACCEPTANCE_READINESS',
    });
    expect(result.lines[0]!.readyQuantity).toBe(1);
  });
  it('회사/범위/수량/기간/epoch/digest/source 개정 결합 위조·만료·누락·열린 필드는 거절한다', async () => {
    const f = fixture();
    const changes: ((value: U3ReadinessObservation) => void)[] = [
      (value) => {
        value.binding.enterpriseRef.id = 'foreign';
      },
      (value) => {
        value.binding.targetScope.organisationRevision++;
      },
      (value) => {
        value.binding.lines[0]!.quantity++;
      },
      (value) => {
        value.binding.lines[0]!.requestedActivationDate = '2026-12-01';
      },
      (value) => {
        value.binding.epoch = 'other-epoch';
      },
      (value) => {
        value.binding.decisionDigest = 'b'.repeat(64);
      },
      (value) => {
        value.binding.ownerRegistration = 'body-owner';
      },
      (value) => {
        value.sourceRef.entity = 'StockReservation';
      },
      (value) => {
        value.sourceRefs = [];
      },
      (value) => {
        value.lines[0]!.lineRef.revision++;
      },
      (value) => {
        value.expiresAt = '2000-01-01T00:00:00.000Z';
      },
      (value) => {
        Object.assign(value, { approved: true });
      },
    ];
    for (const change of changes) {
      const registration: U3ReadinessRegistration = {
        kind: 'REGISTERED_OWNER',
        owner: 'HardwareFulfillment',
        ownerRegistration: 'mock-u5',
        async readReadiness(binding) {
          const result = f.observe(binding);
          change(result);
          return result;
        },
      };
      await expect(
        new U3OrderReadiness(f.store, () => new Date(), [registration]).current(
          'HardwareFulfillment',
          f.request,
        ),
      ).rejects.toThrow();
    }
    expect(f.request.lines[0]!.quantity).toBe(1);
  });
  it('AbortSignal을 무시하는 callback도 부모 남은 기한 안에 차단하고 늦은 결과를 반환하지 않는다', async () => {
    const f = fixture();
    const controller = new AbortController();
    let now = Date.now();
    // 실제 timeout 전파는 U1 시험에서 확인한다. 이 시험은 callback 진입 후 취소를 결정적으로 제어한다.
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const budget = new ExecutionBudget(25, () => now);
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finish!: (value: U3ReadinessObservation) => void;
    const late = new Promise<U3ReadinessObservation>((resolve) => {
      finish = resolve;
    });
    let binding: U3ReadinessBinding | undefined;
    let signal: AbortSignal | undefined;
    const readReadiness = vi.fn(async (value: U3ReadinessBinding, incoming: AbortSignal) => {
      binding = value;
      signal = incoming;
      entered();
      return late;
    });
    const registration: U3ReadinessRegistration = {
      kind: 'REGISTERED_OWNER',
      owner: 'HardwareFulfillment',
      ownerRegistration: 'mock-u5',
      readReadiness,
    };
    const returned = vi.fn();
    const pending = budget
      .run(() =>
        new U3OrderReadiness(f.store, () => new Date(now), [registration]).current(
          'HardwareFulfillment',
          f.request,
        ),
      )
      .then(returned);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ORDER_READINESS_UNCONFIRMED' });
    await started;
    expect(readReadiness).toHaveBeenCalledTimes(1);
    expect(signal).toBe(budget.signal);
    expect(budget.remaining()).toBe(25);
    expect(AbortSignal.timeout).toHaveBeenCalledWith(25);
    now += 25;
    controller.abort();
    await rejected;
    expect(budget.remaining()).toBe(0);
    expect(signal?.aborted).toBe(true);
    expect(binding).toBeDefined();
    finish(f.observe(binding!));
    await late;
    await Promise.resolve();
    expect(readReadiness).toHaveBeenCalledTimes(1);
    expect(returned).not.toHaveBeenCalled();
  });
  it('운영 합성 등록·중복 소유자·임의 등록 mode는 차단한다', () => {
    const f = fixture();
    expect(
      () => new U3OrderReadiness(f.store, () => new Date(), [f.registration, f.registration]),
    ).toThrow();
    const forged = Object.assign({}, f.registration, { kind: 'KNOWN' });
    expect(
      () => new U3OrderReadiness(f.store, () => new Date(), [forged as U3ReadinessRegistration]),
    ).toThrow();
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      () =>
        new U3OrderReadiness(f.store, () => new Date(), [
          { ...f.registration, kind: 'LOCAL_SYNTHETIC' },
        ]),
    ).toThrow();
  });
});
