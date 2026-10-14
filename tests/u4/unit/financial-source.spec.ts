import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionBudget, SchemaValidator } from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';
import { U4FinancialSource } from '../../../packages/core/src/u4-financial-source.js';
import type {
  U4PaymentSourceBinding,
  U4PaymentSourceProfile,
  U4FinancialImpactRegistration,
} from '../../../packages/core/src/u4-financial-source.js';
import { u4Evidence, u4Money, u4Ref, u4Scope } from '../fixtures/contracts.js';

const now = () => new Date('2026-12-01T00:00:00.000Z');
const store = { schema: new SchemaValidator() } as ProtectedStore;
const binding = (): U4PaymentSourceBinding => ({
  epoch: 'initial',
  requestDigest: 'a'.repeat(64),
  actorAccountRef: u4Evidence().verifiedByRef,
  enterpriseRef: u4Scope().enterpriseRef,
  targetScope: u4Scope(),
  evidence: u4Evidence(),
  identity: {
    sourceProfileId: 'synthetic-source',
    sourceProfileRevision: 1,
    sourceNamespace: 'synthetic-receiver',
    canonicalIdentity: 'opaque-001',
    aliases: ['old-001'],
  },
  amount: u4Money('100'),
  actualPaidAt: now().toISOString(),
});
const profile = (): U4PaymentSourceProfile => ({
  kind: 'LOCAL_SYNTHETIC',
  profileId: 'synthetic-source',
  revision: 1,
  namespace: 'synthetic-receiver',
  async verify(value) {
    return {
      knowledge: 'KNOWN',
      binding: value,
      state: 'CONFIRMED',
      observedAt: now().toISOString(),
      expiresAt: '2026-12-01T00:01:00Z',
    };
  },
});
const impact = (): U4FinancialImpactRegistration => ({
  kind: 'LOCAL_SYNTHETIC',
  owner: 'HardwareFulfillment',
  async read(value) {
    return {
      knowledge: 'KNOWN',
      binding: value,
      clear: true,
      sourceRefs: [u4Ref('HardwareFulfillment', 'HardwareHistory')],
      observedAt: now().toISOString(),
      expiresAt: '2026-12-01T00:01:00Z',
    };
  },
});
const impactBinding = () => ({
  epoch: 'initial',
  requestDigest: 'a'.repeat(64),
  orderRef: u4Ref('OrderAcceptance', 'Order'),
  targetScope: u4Scope(),
  owner: 'HardwareFulfillment' as const,
});

describe('금융 서버 source 등록과 실제 원본 확인 경계', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('미등록·다른 profile개정/namespace는 입력만으로 실거래를 확정하지 않는다', async () => {
    expect(await new U4FinancialSource(store, now).payment(binding())).toBe('UNVERIFIED');
    const source = new U4FinancialSource(store, now, [profile()]);
    for (const identity of [
      { ...binding().identity, sourceProfileRevision: 2 },
      { ...binding().identity, sourceNamespace: 'other-receiver' },
    ])
      expect(await source.payment({ ...binding(), identity })).toBe('UNVERIFIED');
  });
  it('등록된 실제 확인 포트의 정확한 현재 결합만 확정한다', async () => {
    expect(await new U4FinancialSource(store, now, [profile()]).payment(binding())).toBe(
      'CONFIRMED',
    );
    const port = profile();
    port.verify = async (value) => ({
      knowledge: 'CONFLICT',
      binding: value,
      state: 'UNCONFIRMED',
      observedAt: now().toISOString(),
      expiresAt: '2026-12-01T00:01:00Z',
    });
    expect(await new U4FinancialSource(store, now, [port]).payment(binding())).toBe('DISPUTED');
    port.verify = async (value) => ({
      knowledge: 'KNOWN',
      binding: value,
      state: 'REVOKED',
      observedAt: now().toISOString(),
      expiresAt: '2026-12-01T00:01:00Z',
    });
    expect(await new U4FinancialSource(store, now, [port]).payment(binding())).toBe('REVOKED');
  });
  it('포트가 입력 객체를 변조하거나 다른 epoch·기업·금액·별칭을 돌려주면 거절한다', async () => {
    for (const patch of [
      { epoch: 'other' },
      { enterpriseRef: u4Ref('EnterpriseAccess', 'Enterprise', 'other') },
      { amount: u4Money('200') },
      { identity: { ...binding().identity, aliases: [] } },
    ]) {
      const port = profile();
      port.verify = async (value) => {
        Object.assign(value, patch);
        return {
          knowledge: 'KNOWN',
          binding: value,
          state: 'CONFIRMED',
          observedAt: now().toISOString(),
          expiresAt: '2026-12-01T00:01:00Z',
        };
      };
      expect(await new U4FinancialSource(store, now, [port]).payment(binding())).toBe('UNVERIFIED');
    }
  });
  it('낮은/잘못된 관측 시각·만료·추가 원문 필드·조회 실패를 확정으로 삼지 않는다', async () => {
    for (const patch of [
      { observedAt: 'invalid' },
      { observedAt: '2026-11-30T00:00:00Z' },
      { expiresAt: now().toISOString() },
      { bankPayload: '금융 원문 금지' },
    ]) {
      const port = profile(),
        original = port.verify;
      port.verify = async (value, signal) => ({ ...(await original(value, signal)), ...patch });
      expect(await new U4FinancialSource(store, now, [port]).payment(binding())).toBe('UNVERIFIED');
    }
    const port = profile();
    port.verify = async () => {
      throw new Error('합성 원본 실패');
    };
    expect(await new U4FinancialSource(store, now, [port]).payment(binding())).toBe('UNVERIFIED');
  });
  it('원본 포트가 abort를 무시해도 짧은 요청 예산 만료로 확인을 종료한다', async () => {
    const port = profile();
    port.verify = () => new Promise(() => {});
    await expect(
      new ExecutionBudget(20, () => Date.now()).run(() =>
        new U4FinancialSource(store, now, [port]).payment(binding()),
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_DEADLINE' });
  });
  it('미등록/중복 종류·운영 합성 profile 등록과 잘못된 거래 형식을 거절한다', async () => {
    expect(() => new U4FinancialSource(store, now, [profile(), profile()])).toThrow();
    expect(
      () =>
        new U4FinancialSource(store, now, [
          { ...profile(), kind: 'UNREGISTERED' } as unknown as U4PaymentSourceProfile,
        ]),
    ).toThrow();
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => new U4FinancialSource(store, now, [profile()])).toThrow();
    vi.unstubAllEnvs();
    await expect(
      new U4FinancialSource(store, now, [profile()]).payment({
        ...binding(),
        amount: u4Money('1.1'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('정정 전 제공 영향은 해당 소유자의 현재 원본이 명시 해소한 경우만 허용한다', async () => {
    await expect(
      new U4FinancialSource(store, now).clearImpact(impactBinding()),
    ).rejects.toMatchObject({ code: 'U4_IMPACT_UNVERIFIED' });
    expect(
      await new U4FinancialSource(store, now, [], [impact()]).clearImpact(impactBinding()),
    ).toHaveLength(1);
    for (const patch of [
      { clear: false },
      { sourceRefs: [] },
      { binding: { ...impactBinding(), epoch: 'other' } },
    ]) {
      const port = impact(),
        original = port.read;
      port.read = async (value, signal) => ({ ...(await original(value, signal)), ...patch });
      await expect(
        new U4FinancialSource(store, now, [], [port]).clearImpact(impactBinding()),
      ).rejects.toMatchObject({ code: 'U4_IMPACT_UNVERIFIED' });
    }
  });
  it('실제 제공 근거가 다른 owner이거나 중복 등록이면 영향 확인으로 쓰지 않는다', async () => {
    expect(() => new U4FinancialSource(store, now, [], [impact(), impact()])).toThrow();
    const port = impact(),
      original = port.read;
    port.read = async (value, signal) => ({
      ...(await original(value, signal)),
      sourceRefs: [u4Ref('SoftwareLifecycle', 'SoftwareHistory')],
    });
    await expect(
      new U4FinancialSource(store, now, [], [port]).clearImpact(impactBinding()),
    ).rejects.toMatchObject({ code: 'U4_IMPACT_UNVERIFIED' });
  });
});
