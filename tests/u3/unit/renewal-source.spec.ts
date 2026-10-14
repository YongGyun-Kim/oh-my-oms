import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { ExecutionBudget } from '@oms/contracts';
import { ProtectedStore } from '@oms/persistence';
import { U3RenewalSource } from '@oms/core';
import type { U3RenewalBinding, U3RenewalObservation, U3RenewalRegistration } from '@oms/core';
import { fixtureRef, fixtureScope } from '../fixtures/identity.js';
import { proposalPrice, proposalTerms } from '../fixtures/proposal-input.js';

function fixture() {
  // 접속하지 않는 실제 타입 객체. 현재 epoch 조회만 mock이며 운영/U6 확인 자료가 아니다.
  const store = new ProtectedStore(
    new DataSource({ type: 'postgres', synchronize: false }),
    new DataSource({ type: 'postgres', synchronize: false }),
  );
  vi.spyOn(store, 'currentEpoch').mockResolvedValue('synthetic-epoch');
  const scope = fixtureScope(),
    originalTermsRef = fixtureRef('CommercialAgreement', 'AgreementRevision');
  const request = {
    entitlementRef: fixtureRef('SoftwareLifecycle', 'EnterpriseEntitlement'),
    renewalCycleRef: fixtureRef('SoftwareLifecycle', 'RenewalCycle'),
    enterpriseRef: scope.enterpriseRef,
    targetScope: scope,
    originalTermsRef,
    epoch: 'synthetic-epoch',
    proposalDigest: 'a'.repeat(64),
  };
  const observe = (binding: U3RenewalBinding): U3RenewalObservation => ({
    knowledge: 'KNOWN',
    binding,
    state: 'RENEWABLE',
    productType: 'SOFTWARE',
    originalTerms: proposalTerms(structuredClone(originalTermsRef)),
    originalPriceBreakdown: proposalPrice(),
    sourceRefs: [binding.entitlementRef, binding.renewalCycleRef, binding.originalTermsRef],
    observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10000).toISOString(),
  });
  const registration: U3RenewalRegistration = {
    kind: 'REGISTERED_OWNER',
    ownerRegistration: 'mock-u6',
    async readRenewal(binding) {
      return observe(binding);
    },
  };
  return { store, request, observe, registration };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('명시 U6 소유 원본 포트의 결합·유한 예산', () => {
  it('기본 미등록은 차단하고 서버 등록 mock의 정확 회사/권한/회차/epoch/내용 결합만 반환한다', async () => {
    const f = fixture();
    await expect(
      new U3RenewalSource(f.store, () => new Date()).current(f.request),
    ).rejects.toMatchObject({ code: 'U6_SOURCE_UNCONFIRMED' });
    const result = await new U3RenewalSource(f.store, () => new Date(), f.registration).current(
      f.request,
    );
    expect(result.binding).toEqual({
      ...f.request,
      owner: 'SoftwareLifecycle',
      ownerRegistration: 'mock-u6',
      purpose: 'MANUAL_RENEWAL_PROPOSAL',
    });
    expect(result.originalTerms.termsRecordRef).toEqual(f.request.originalTermsRef);
  });
  it('회차/회사/목적/epoch/digest 변경, 원본 누락, UNKNOWN/만료/위조 반환을 차단한다', async () => {
    const f = fixture();
    const changes: ((result: U3RenewalObservation) => void)[] = [
      (value) => {
        value.binding.renewalCycleRef.revision++;
      },
      (value) => {
        value.binding.enterpriseRef.id = 'other-company';
      },
      (value) => {
        value.binding.ownerRegistration = 'client-owner';
      },
      (value) => {
        value.binding.epoch = 'other-epoch';
      },
      (value) => {
        value.binding.proposalDigest = 'b'.repeat(64);
      },
      (value) => {
        value.sourceRefs.pop();
      },
      (value) => {
        value.originalTerms.termsRecordRef.revision++;
      },
      (value) => {
        value.knowledge = 'UNKNOWN';
      },
      (value) => {
        value.expiresAt = '2000-01-01T00:00:00.000Z';
      },
    ];
    for (const change of changes) {
      const registration: U3RenewalRegistration = {
        kind: 'REGISTERED_OWNER',
        ownerRegistration: 'mock-u6',
        async readRenewal(binding) {
          const result = f.observe(binding);
          change(result);
          return result;
        },
      };
      await expect(
        new U3RenewalSource(f.store, () => new Date(), registration).current(f.request),
      ).rejects.toThrow();
    }
    expect(f.request.renewalCycleRef.revision).toBe(1);
  });
  it('callback이 AbortSignal을 무시해도 부모의 남은 기한 내 차단하고 늦은 KNOWN을 반환하지 않는다', async () => {
    const f = fixture();
    const registration: U3RenewalRegistration = {
      kind: 'REGISTERED_OWNER',
      ownerRegistration: 'mock-u6',
      readRenewal: async () => new Promise<U3RenewalObservation>(() => {}),
    };
    const began = Date.now();
    const budget = new ExecutionBudget(25);
    await expect(
      budget.run(() =>
        new U3RenewalSource(f.store, () => new Date(), registration).current(f.request),
      ),
    ).rejects.toMatchObject({ code: 'U6_SOURCE_UNCONFIRMED' });
    expect(Date.now() - began).toBeLessThan(1000);
  });
  it('운영의 LOCAL_SYNTHETIC 등록은 소유 원본으로 사용할 수 없다', () => {
    const f = fixture();
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      () =>
        new U3RenewalSource(f.store, () => new Date(), {
          kind: 'LOCAL_SYNTHETIC',
          ownerRegistration: 'synthetic-u6',
          async readRenewal(binding) {
            return f.observe(binding);
          },
        }),
    ).toThrow();
  });
});
