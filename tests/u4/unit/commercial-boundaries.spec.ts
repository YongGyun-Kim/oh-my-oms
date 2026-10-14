import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import { U4OrderReadiness, u3Ref } from '@oms/core';
import type { U4ReadinessRegistration } from '@oms/core';
import type { ModelData, ProtectedStore, U4Transaction } from '@oms/persistence';
import { U4_SOURCE_CONTRACT } from '@oms/persistence';
import {
  U4CommercialAdapter,
  recordedU4CommercialOperation,
} from '../../../packages/core/src/u4-commercial-adapter.js';
import { u4Ref, u4Scope } from '../fixtures/contracts.js';
const schema = new SchemaValidator();
afterEach(() => vi.unstubAllEnvs());
function recordedFixture() {
  const beforeRef = u4Ref('CommercialAgreement', 'CommercialProposal', 'synthetic-proposal');
  const afterRef = { ...beforeRef, revision: 2 };
  const consentRef = u4Ref('CommercialAgreement', 'CustomerConsent', 'synthetic-consent');
  const actor = u4Ref('IdentityRecovery', 'Account', 'synthetic-customer');
  const history: ModelData = {
    modelVersion: 2,
    historyId: 'synthetic-history',
    owner: 'CommercialAgreement',
    actorAccountRef: actor,
    verifiedPersonRef: null,
    occurredAt: '2026-10-15T00:00:00Z',
    reason: '합성 동의 이력',
    beforeRef,
    afterRef,
    evidenceRefs: [],
    requestId: 'synthetic-request',
    resultRefs: [afterRef, consentRef],
    correctionOf: null,
    sourceRevision: 2,
  };
  const receipt: ModelData = {
    owner: 'CommercialAgreement',
    operation: 'recordPaymentPlanConsent',
    requestState: 'RESULT_RECORDED',
    audience: 'CUSTOMER',
    principalId: actor.id,
    targetIdentity: { kind: 'RECORD', recordRef: beforeRef },
    targetScope: u4Scope(),
    sourceContract: U4_SOURCE_CONTRACT,
    resultRefs: [afterRef, consentRef, u3Ref('AgreementHistory', history, schema)],
  };
  const adapter = {
    store: { schema },
    basis: () => ({ collection: async () => [history] }),
  } as unknown as U4CommercialAdapter;
  const scope = {
    readSource: () => ({ currentProtected: async () => receipt }),
  } as unknown as U4Transaction;
  const input = {
    owner: 'CommercialAgreement' as const,
    operation: 'recordPaymentPlanConsent',
    beforeRef,
    afterRef,
    resultRef: consentRef,
    target: { kind: 'RECORD' as const, recordRef: beforeRef },
    targetScope: u4Scope(),
    audience: 'CUSTOMER' as const,
  };
  return { adapter, scope, input, receipt, history };
}
describe('U4 상업 원본의 닫힌 등록·접수 경계', () => {
  it('알 수 없는 준비 원본 등록 종류를 callable만으로 활성화하지 않는다', () => {
    expect(
      () =>
        new U4OrderReadiness({ schema } as ProtectedStore, () => new Date(), [
          {
            kind: 'FORGED',
            owner: 'FinancialSettlement',
            ownerRegistration: 'synthetic',
            readReadiness: async () => ({}),
          } as unknown as U4ReadinessRegistration,
        ]),
    ).toThrow();
  });
  it('운영 합성 등록과 기본 미등록 원본은 준비 확인이 아니다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      () =>
        new U4OrderReadiness({ schema } as ProtectedStore, () => new Date(), [
          {
            kind: 'LOCAL_SYNTHETIC',
            owner: 'FinancialSettlement',
            ownerRegistration: 'synthetic',
            readReadiness: async () => ({}),
          } as unknown as U4ReadinessRegistration,
        ]),
    ).toThrow();
    await expect(
      new U4OrderReadiness({ schema } as ProtectedStore, () => new Date()).current(
        'FinancialSettlement',
        {} as Parameters<U4OrderReadiness['current']>[1],
        { currentEpoch: async () => 'initial' },
      ),
    ).rejects.toMatchObject({ code: 'ORDER_READINESS_UNCONFIRMED' });
  });
  it('실제 sourceRevision2 이력 Ref와 결과가 결합된 동의 접수만 판독한다', async () => {
    const f = recordedFixture();
    expect((await recordedU4CommercialOperation(f.adapter, f.scope, f.input)).receipt).toBe(
      f.receipt,
    );
    f.receipt.resultRefs = (f.receipt.resultRefs as import('@oms/contracts').Ref[]).map(
      (reference) =>
        reference.entity === 'AgreementHistory' ? { ...reference, revision: 1 } : reference,
    );
    await expect(recordedU4CommercialOperation(f.adapter, f.scope, f.input)).rejects.toMatchObject({
      code: 'U4_RECORDED_SOURCE',
    });
  });
  it('접수 처리 중 상태를 기록된 고객 동의 결과로 사용하지 않는다', async () => {
    const f = recordedFixture();
    f.receipt.requestState = 'PROCESSING';
    await expect(recordedU4CommercialOperation(f.adapter, f.scope, f.input)).rejects.toMatchObject({
      code: 'U4_RECORDED_SOURCE',
    });
  });
  it('구형 profile 또는 다른 actor·범위의 결과를 현재 동의로 사용하지 않는다', async () => {
    for (const change of [
      { sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 } },
      { principalId: 'different' },
      { targetScope: null },
    ]) {
      const f = recordedFixture();
      Object.assign(f.receipt, change);
      await expect(
        recordedU4CommercialOperation(f.adapter, f.scope, f.input),
      ).rejects.toMatchObject({ code: 'U4_RECORDED_SOURCE' });
    }
  });
});
