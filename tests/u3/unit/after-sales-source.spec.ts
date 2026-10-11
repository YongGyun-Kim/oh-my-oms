import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { ExecutionBudget } from '@oms/contracts';
import { ProtectedStore } from '@oms/persistence';
import { U3AfterSalesSource } from '@oms/core';
import type {
  U3AfterSalesBinding,
  U3AfterSalesObservation,
  U3AfterSalesRegistration,
} from '@oms/core';
import { fixtureRef, fixtureScope } from '../fixtures/identity.js';
function fixture() {
  const store = new ProtectedStore(
    new DataSource({ type: 'postgres', synchronize: false }),
    new DataSource({ type: 'postgres', synchronize: false }),
  );
  vi.spyOn(store, 'currentEpoch').mockResolvedValue('local-epoch');
  const request = {
    decisionRef: fixtureRef('AfterSalesDecision', 'AfterSalesDecisionRecord'),
    orderRef: fixtureRef('OrderAcceptance', 'Order'),
    proposalRef: fixtureRef('CommercialAgreement', 'CommercialProposal'),
    proposalRevision: 1,
    termsFingerprint: 'a'.repeat(64),
    consentRef: fixtureRef('CommercialAgreement', 'CustomerConsent'),
    newTermsRef: fixtureRef('CommercialAgreement', 'AgreementRevision'),
    targetScope: fixtureScope(),
    epoch: 'local-epoch',
    applicationDigest: 'b'.repeat(64),
  };
  const observe = (binding: U3AfterSalesBinding): U3AfterSalesObservation => {
    const requestRef = fixtureRef('AfterSalesDecision', 'AfterSalesRequest');
    return {
      binding: structuredClone(binding),
      facts: {
        knowledge: 'KNOWN',
        data: {
          requestRef,
          orderRef: binding.orderRef,
          decisionRef: binding.decisionRef,
          decision: 'ALLOW',
          holdBasisRef: null,
          actualResultRefs: [],
          remainingActionRefs: [],
        },
        sourceRefs: [requestRef, binding.orderRef, binding.decisionRef],
        observedAt: new Date().toISOString(),
      },
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };
  };
  const registration: U3AfterSalesRegistration = {
    kind: 'REGISTERED_OWNER',
    ownerRegistration: 'mock-u7',
    async readAfterSalesFacts(binding) {
      return observe(binding);
    },
  };
  return { store, request, observe, registration };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('등록 C08 조회 adapter의 정확한 적용 대상·기한 경계(mock 단위 증거)', () => {
  it('기본 미등록은 차단하며 명시 서버 등록·실제 선언된 ALLOW facts 결합만 반환한다', async () => {
    const f = fixture();
    await expect(
      new U3AfterSalesSource(f.store, () => new Date()).current(f.request),
    ).rejects.toMatchObject({ code: 'U7_AFTERSALES_UNCONFIRMED' });
    const result = await new U3AfterSalesSource(f.store, () => new Date(), f.registration).current(
      f.request,
    );
    expect(result.binding).toEqual({
      ...f.request,
      owner: 'AfterSalesDecision',
      ownerRegistration: 'mock-u7',
      operation: 'readAfterSalesFacts',
    });
  });
  it('회사/결정/주문/제안/동의/epoch/digest·지문 위조·unknown/만료/누락 출처는 차단한다', async () => {
    const f = fixture();
    const changes: ((value: U3AfterSalesObservation) => void)[] = [
      (value) => {
        value.binding.targetScope.enterpriseRef.id = 'foreign';
      },
      (value) => {
        value.binding.decisionRef.revision++;
      },
      (value) => {
        value.binding.orderRef.id = 'other';
      },
      (value) => {
        value.binding.proposalRevision++;
      },
      (value) => {
        value.binding.consentRef.id = 'other';
      },
      (value) => {
        value.binding.epoch = 'other';
      },
      (value) => {
        value.binding.applicationDigest = 'c'.repeat(64);
      },
      (value) => {
        value.binding.termsFingerprint = 'c'.repeat(64);
      },
      (value) => {
        if (value.facts.knowledge === 'KNOWN') value.facts.data.decision = 'REVIEW_REQUIRED';
      },
      (value) => {
        value.facts = {
          knowledge: 'UNKNOWN',
          sourceRefs: [],
          observedAt: new Date().toISOString(),
          safeReasonCode: 'UNVERIFIED',
        };
      },
      (value) => {
        value.facts.sourceRefs = [];
      },
      (value) => {
        value.expiresAt = '2000-01-01T00:00:00.000Z';
      },
    ];
    for (const change of changes) {
      const registration: U3AfterSalesRegistration = {
        kind: 'REGISTERED_OWNER',
        ownerRegistration: 'mock-u7',
        async readAfterSalesFacts(binding) {
          const result = f.observe(binding);
          change(result);
          return result;
        },
      };
      await expect(
        new U3AfterSalesSource(f.store, () => new Date(), registration).current(f.request),
      ).rejects.toThrow();
    }
  });
  it('무응답/AbortSignal 무시도 부모 예산 안에 차단하며 운영 합성 등록은 거절한다', async () => {
    const f = fixture();
    const hung: U3AfterSalesRegistration = {
      kind: 'REGISTERED_OWNER',
      ownerRegistration: 'mock-u7',
      async readAfterSalesFacts() {
        return new Promise<U3AfterSalesObservation>(() => {});
      },
    };
    const began = Date.now();
    await expect(
      new ExecutionBudget(25).run(() =>
        new U3AfterSalesSource(f.store, () => new Date(), hung).current(f.request),
      ),
    ).rejects.toThrow();
    expect(Date.now() - began).toBeLessThan(1000);
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      () =>
        new U3AfterSalesSource(f.store, () => new Date(), {
          ...f.registration,
          kind: 'LOCAL_SYNTHETIC',
        }),
    ).toThrow();
  });
});
