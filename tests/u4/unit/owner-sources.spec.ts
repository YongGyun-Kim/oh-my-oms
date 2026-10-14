import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import { U4OwnerSources } from '@oms/core';
import type {
  U4CompletionBinding,
  U4CompletionObservation,
  U4CompletionRegistration,
  U4RefundApprovalRegistration,
  U4ReturnRegistration,
  U4RenewalCurrentRegistration,
} from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import { u4Money, u4Ref, u4Scope } from '../fixtures/contracts.js';

const at = '2026-12-02T00:00:00.000Z',
  now = () => new Date(at),
  store = {
    schema: new SchemaValidator(),
    currentEpoch: async () => 'initial',
  } as unknown as ProtectedStore,
  factRef = u4Ref('HardwareFulfillment', 'HardwareHistory', 'fact'),
  aggregateRef = u4Ref('HardwareFulfillment', 'HardwareFulfillmentCase', 'case'),
  orderRef = u4Ref('OrderAcceptance', 'Order'),
  decisionRef = u4Ref('AfterSalesDecision', 'AfterSalesDecisionRecord', 'decision'),
  cycleRef = u4Ref('SoftwareLifecycle', 'RenewalCycle', 'cycle');
const request = (): Omit<U4CompletionBinding, 'ownerRegistration' | 'purpose'> => ({
  owner: 'HardwareFulfillment',
  orderRef,
  termsSnapshotRef: u4Ref('OrderAcceptance', 'PurchaseTermsSnapshot'),
  productType: 'HARDWARE',
  lines: [
    {
      lineRef: u4Ref('OrderAcceptance', 'OrderLine'),
      quantity: 2,
      completionBasisRef: u4Ref('ProductCatalog', 'CommonOfferRevision'),
    },
  ],
  targetScope: u4Scope(),
  epoch: 'initial',
  requestDigest: 'a'.repeat(64),
  dueBasis: {
    kind: 'CONFIRMED_FACT_PLUS_DAYS',
    sourceOwner: 'HardwareFulfillment',
    event: 'ACTUAL_PROVISION_COMPLETION',
    ruleRef: u4Ref('ProductCatalog', 'CommonOfferRevision'),
    calendar: 'KST_CALENDAR_DAYS',
    days: 30,
  },
  query: { sourceFactRef: factRef, aggregateRef, minimumSourceRevision: 1 },
});
const observed = (binding: U4CompletionBinding): U4CompletionObservation => ({
  binding,
  knowledge: 'KNOWN',
  view: {
    requestedSourceFactRef: factRef,
    latestSourceFactRef: factRef,
    aggregateRef,
    latestSourceRevision: 1,
    providedTranches: [],
    correctionRefs: [],
    coverage: 'CURRENT',
    observedAt: at,
  },
  confirmedFact: null,
  expiresAt: '2026-12-02T00:00:05.000Z',
});
const completion = (
  change: (value: U4CompletionObservation) => U4CompletionObservation = (value) => value,
): U4CompletionRegistration => ({
  kind: 'LOCAL_SYNTHETIC',
  owner: 'HardwareFulfillment',
  ownerRegistration: 'synthetic-hardware',
  readCompletion: async (binding) => change(observed(binding)),
});
const base = { orderRef, targetScope: u4Scope(), epoch: 'initial', requestDigest: 'a'.repeat(64) };
afterEach(() => vi.unstubAllEnvs());
describe('U4 등록 소유자의 현재 원본 경계', () => {
  it('정확한 목적·세대·범위의 등록 완료 원본만 반환한다', async () => {
    const result = await new U4OwnerSources(store, now, [completion()]).completion(request());
    expect(result.binding.purpose).toBe('finance.postpay.reconcile');
    expect(result.view.latestSourceFactRef).toEqual(factRef);
  });
  it('미등록 완료·현재 회차·승인·실제 회수를 성공 근거로 만들지 않는다', async () => {
    const source = new U4OwnerSources(store, now);
    await expect(source.completion(request())).rejects.toMatchObject({
      code: 'U4_OWNER_UNREGISTERED',
    });
    await expect(source.currentRenewal({ ...base, renewalCycleRef: cycleRef })).rejects.toThrow();
    await expect(
      source.currentApproval({ ...base, decisionRef, approvalRootId: 'root' }),
    ).rejects.toThrow();
    await expect(
      source.currentReturn({ ...base, owner: 'HardwareFulfillment', decisionRef }),
    ).rejects.toThrow();
  });
  it('다른 binding·GAP·알 수 없는 필드·aggregate 개정 불일치를 거절한다', async () => {
    for (const change of [
      (value: U4CompletionObservation) => ({
        ...value,
        binding: { ...value.binding, epoch: 'other' },
      }),
      (value: U4CompletionObservation) => ({
        ...value,
        view: { ...value.view, coverage: 'GAP' as const },
      }),
      (value: U4CompletionObservation) => ({ ...value, invented: true }),
      (value: U4CompletionObservation) => ({
        ...value,
        view: { ...value.view, latestSourceRevision: 2 },
      }),
    ])
      await expect(
        new U4OwnerSources(store, now, [completion(change)]).completion(request()),
      ).rejects.toThrow();
  });
  it('stale 세대·미래 관측·만료 관측과 다른 확인 사건의 ruleRef 위조를 거절한다', async () => {
    const source = new U4OwnerSources(store, now, [completion()]);
    await expect(source.completion({ ...request(), epoch: 'old' })).rejects.toThrow();
    const agreed = await new U4OwnerSources(store, now, [
      completion((value) => ({
        ...value,
        confirmedFact: { sourceRef: factRef, ruleRef: request().dueBasis.ruleRef, confirmedAt: at },
      })),
    ]).completion({
      ...request(),
      dueBasis: { ...request().dueBasis, event: 'AGREED_CONFIRMED_FACT' },
    });
    expect(agreed.confirmedFact!.confirmedAt).toBe(at);
    for (const change of [
      (value: U4CompletionObservation) => ({
        ...value,
        view: { ...value.view, observedAt: '2026-12-03T00:00:00.000Z' },
      }),
      (value: U4CompletionObservation) => ({ ...value, expiresAt: at }),
      (value: U4CompletionObservation) => ({
        ...value,
        confirmedFact: {
          sourceRef: factRef,
          ruleRef: { ...request().dueBasis.ruleRef, id: 'other-rule' },
          confirmedAt: at,
        },
      }),
    ])
      await expect(
        new U4OwnerSources(store, now, [completion(change)]).completion({
          ...request(),
          dueBasis: { ...request().dueBasis, event: 'AGREED_CONFIRMED_FACT' },
        }),
      ).rejects.toThrow();
  });
  it('현재 갱신 회차만 인정하며 지난 회차의 정상 응답을 재사용하지 않는다', async () => {
    const registration = (current: boolean): U4RenewalCurrentRegistration => ({
      kind: 'LOCAL_SYNTHETIC',
      ownerRegistration: 'synthetic-software',
      readCurrent: async (binding) => ({
        binding,
        current,
        knowledge: 'KNOWN',
        sourceRefs: [cycleRef],
        observedAt: at,
        expiresAt: '2026-12-02T00:00:05.000Z',
      }),
    });
    expect(
      await new U4OwnerSources(store, now, [], registration(true)).currentRenewal({
        ...base,
        renewalCycleRef: cycleRef,
      }),
    ).toEqual([cycleRef]);
    await expect(
      new U4OwnerSources(store, now, [], registration(false)).currentRenewal({
        ...base,
        renewalCycleRef: cycleRef,
      }),
    ).rejects.toThrow();
    await expect(
      new U4OwnerSources(store, now, [], registration(true)).currentRenewal({
        ...base,
        renewalCycleRef: { ...cycleRef, id: 'different-cycle' },
      }),
    ).rejects.toThrow();
  });
  it('공통 승인 root의 현재 실제 한도를 읽으며 회수 필요 여부 미확인을 허용하지 않는다', async () => {
    const registration = (returnRequired: boolean | null): U4RefundApprovalRegistration => ({
      kind: 'LOCAL_SYNTHETIC',
      ownerRegistration: 'synthetic-aftersales',
      readApproval: async (binding) => ({
        binding,
        knowledge: 'KNOWN',
        approved: true,
        limit: u4Money('100'),
        returnRequired,
        sourceRefs: [decisionRef],
        observedAt: at,
        expiresAt: '2026-12-02T00:00:05.000Z',
      }),
    });
    expect(
      (
        await new U4OwnerSources(store, now, [], undefined, registration(true)).currentApproval({
          ...base,
          decisionRef,
          approvalRootId: 'root',
        })
      ).limit.value,
    ).toBe('100');
    await expect(
      new U4OwnerSources(store, now, [], undefined, registration(null)).currentApproval({
        ...base,
        decisionRef,
        approvalRootId: 'root',
      }),
    ).rejects.toThrow();
  });
  it('회수는 U7 승인과 구별해 실제 제공 소유자의 현재 확인을 요구한다', async () => {
    const registration = (returned: boolean): U4ReturnRegistration => ({
      kind: 'LOCAL_SYNTHETIC',
      owner: 'HardwareFulfillment',
      ownerRegistration: 'synthetic-return',
      readReturn: async (binding) => ({
        binding,
        knowledge: 'KNOWN',
        returned,
        sourceRefs: [factRef],
        observedAt: at,
        expiresAt: '2026-12-02T00:00:05.000Z',
      }),
    });
    expect(
      await new U4OwnerSources(store, now, [], undefined, undefined, [
        registration(true),
      ]).currentReturn({ ...base, owner: 'HardwareFulfillment', decisionRef }),
    ).toEqual([factRef]);
    await expect(
      new U4OwnerSources(store, now, [], undefined, undefined, [registration(false)]).currentReturn(
        { ...base, owner: 'HardwareFulfillment', decisionRef },
      ),
    ).rejects.toThrow();
  });
  it('중복 소유자·운영 합성 등록·등록 포트 실패를 정상 원본으로 만들지 않는다', async () => {
    expect(() => new U4OwnerSources(store, now, [completion(), completion()])).toThrow();
    const broken: U4CompletionRegistration = {
      kind: 'LOCAL_SYNTHETIC',
      owner: 'HardwareFulfillment',
      ownerRegistration: 'broken',
      readCompletion: async () => {
        throw new Error('synthetic private source');
      },
    };
    await expect(
      new U4OwnerSources(store, now, [broken]).completion(request()),
    ).rejects.toMatchObject({ code: 'U4_OWNER_UNREGISTERED' });
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => new U4OwnerSources(store, now, [completion()])).toThrow();
  });
});
