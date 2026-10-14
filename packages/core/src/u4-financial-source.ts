import {
  canonicalJson,
  ExecutionBudget,
  fingerprint,
  requireCondition,
  U4_PROFILE,
  OmsError,
} from '@oms/contracts';
import type { Money, Ref, U4Evidence, U4PaymentIdentity } from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';

export interface U4PaymentSourceBinding {
  epoch: string;
  requestDigest: string;
  actorAccountRef: Ref;
  enterpriseRef: Ref;
  targetScope: import('@oms/contracts').TargetScope;
  evidence: U4Evidence;
  identity: U4PaymentIdentity;
  amount: Money;
  actualPaidAt: string;
}
export interface U4PaymentSourceResult {
  knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
  binding: U4PaymentSourceBinding;
  state: 'CONFIRMED' | 'UNCONFIRMED' | 'REVOKED';
  observedAt: string;
  expiresAt: string;
}
export interface U4PaymentSourceProfile {
  kind: 'LOCAL_SYNTHETIC' | 'REGISTERED_OWNER';
  profileId: string;
  revision: number;
  namespace: string;
  verify(binding: U4PaymentSourceBinding, signal: AbortSignal): Promise<U4PaymentSourceResult>;
}
export interface U4FinancialImpactBinding {
  epoch: string;
  requestDigest: string;
  orderRef: Ref;
  targetScope: import('@oms/contracts').TargetScope;
  owner: 'HardwareFulfillment' | 'SoftwareLifecycle';
}
export interface U4FinancialImpactRegistration {
  kind: 'LOCAL_SYNTHETIC' | 'REGISTERED_OWNER';
  owner: U4FinancialImpactBinding['owner'];
  read(
    binding: U4FinancialImpactBinding,
    signal: AbortSignal,
  ): Promise<{
    knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
    binding: U4FinancialImpactBinding;
    sourceRefs: Ref[];
    clear: boolean;
    observedAt: string;
    expiresAt: string;
  }>;
}
const exact = (left: unknown, right: unknown) => {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
};

// 실제 수취 원본의 정규화·원본 접근 권위는 서버 등록 포트가 소유한다. 은행 규칙을 임의 생성하지 않는다.
export class U4FinancialSource {
  private readonly profiles: readonly U4PaymentSourceProfile[];
  private readonly impacts: readonly U4FinancialImpactRegistration[];
  private async bounded<T>(
    read: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    let onAbort = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () =>
        reject(
          new OmsError(503, 'U4_SOURCE_UNVERIFIED', '현재 금융 원본 조회 기한을 확인해야 합니다.'),
        );
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    try {
      return await Promise.race([read(signal), aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
  constructor(
    private readonly store: ProtectedStore,
    private readonly now: () => Date,
    profiles: readonly U4PaymentSourceProfile[] = [],
    impacts: readonly U4FinancialImpactRegistration[] = [],
  ) {
    const keys = new Set<string>();
    this.profiles = profiles.map((profile) => {
      store.schema.validate('Id', profile.profileId);
      store.schema.validate('Revision', profile.revision);
      store.schema.validateUri(U4_PROFILE + '#/$defs/ExternalReference', profile.namespace);
      const key = fingerprint([profile.profileId, profile.revision]);
      requireCondition(
        ['LOCAL_SYNTHETIC', 'REGISTERED_OWNER'].includes(profile.kind) &&
          typeof profile.verify === 'function' &&
          !keys.has(key) &&
          (profile.kind !== 'LOCAL_SYNTHETIC' || process.env.NODE_ENV !== 'production'),
        503,
        'U4_SOURCE_REGISTRATION',
        '실제 등록 종류·유일 profile·운영 출처가 필요합니다.',
      );
      keys.add(key);
      return Object.freeze({ ...profile, verify: profile.verify.bind(profile) });
    });
    const owners = new Set<string>();
    this.impacts = impacts.map((registration) => {
      requireCondition(
        ['LOCAL_SYNTHETIC', 'REGISTERED_OWNER'].includes(registration.kind) &&
          ['HardwareFulfillment', 'SoftwareLifecycle'].includes(registration.owner) &&
          !owners.has(registration.owner) &&
          typeof registration.read === 'function' &&
          (registration.kind !== 'LOCAL_SYNTHETIC' || process.env.NODE_ENV !== 'production'),
        503,
        'U4_SOURCE_REGISTRATION',
        '등록된 단일 제공 소유자 확인 포트가 필요합니다.',
      );
      owners.add(registration.owner);
      return Object.freeze({ ...registration, read: registration.read.bind(registration) });
    });
  }
  async payment(
    binding: U4PaymentSourceBinding,
  ): Promise<'CONFIRMED' | 'UNVERIFIED' | 'DISPUTED' | 'REVOKED'> {
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/PaymentIdentity', binding.identity);
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/PositiveMoney', binding.amount);
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/Evidence', binding.evidence);
    this.store.schema.validate('Instant', binding.actualPaidAt);
    const profile = this.profiles.find(
      (profile) =>
        profile.profileId === binding.identity.sourceProfileId &&
        profile.revision === binding.identity.sourceProfileRevision,
    );
    if (!profile || profile.namespace !== binding.identity.sourceNamespace) return 'UNVERIFIED';
    const started = this.now().getTime(),
      signal = ExecutionBudget.current()?.signalWithin(5000) ?? AbortSignal.timeout(5000);
    const original = structuredClone(binding),
      expected = canonicalJson(original);
    let result: U4PaymentSourceResult;
    try {
      result = await this.bounded(
        (signal) => profile.verify(structuredClone(original), signal),
        signal,
      );
      if (
        signal.aborted ||
        !result ||
        Object.keys(result).sort().join(',') !== 'binding,expiresAt,knowledge,observedAt,state' ||
        canonicalJson(result.binding) !== expected ||
        !Number.isFinite(Date.parse(result.observedAt)) ||
        Date.parse(result.observedAt) < started ||
        Date.parse(result.observedAt) > this.now().getTime() ||
        !(Date.parse(result.expiresAt) > this.now().getTime())
      )
        return 'UNVERIFIED';
    } catch {
      return 'UNVERIFIED';
    }
    if (result.knowledge === 'CONFLICT') return 'DISPUTED';
    if (result.knowledge === 'KNOWN' && result.state === 'REVOKED') return 'REVOKED';
    return result.knowledge === 'KNOWN' && result.state === 'CONFIRMED'
      ? 'CONFIRMED'
      : 'UNVERIFIED';
  }
  async clearImpact(binding: U4FinancialImpactBinding): Promise<Ref[]> {
    const registration = this.impacts.find((value) => value.owner === binding.owner);
    requireCondition(
      registration,
      503,
      'U4_IMPACT_UNVERIFIED',
      '정정 전 실제 제공/회수 영향의 등록 원본을 확인해야 합니다.',
    );
    const started = this.now().getTime(),
      signal = ExecutionBudget.current()?.signalWithin(5000) ?? AbortSignal.timeout(5000);
    const original = structuredClone(binding);
    let result: Awaited<ReturnType<U4FinancialImpactRegistration['read']>>;
    try {
      result = await this.bounded(
        (signal) => registration.read(structuredClone(original), signal),
        signal,
      );
    } catch {
      result = undefined as never;
    }
    requireCondition(
      result &&
        !signal.aborted &&
        result.knowledge === 'KNOWN' &&
        result.clear === true &&
        Object.keys(result).sort().join(',') ===
          'binding,clear,expiresAt,knowledge,observedAt,sourceRefs' &&
        exact(result.binding, original) &&
        Date.parse(result.observedAt) >= started &&
        Date.parse(result.observedAt) <= this.now().getTime() &&
        Date.parse(result.expiresAt) > this.now().getTime() &&
        Array.isArray(result.sourceRefs) &&
        result.sourceRefs.length > 0 &&
        result.sourceRefs.length <= 100,
      503,
      'U4_IMPACT_UNVERIFIED',
      '같은 현재 주문/개정의 실제 영향 해소 원본이 필요합니다.',
    );
    for (const reference of result.sourceRefs) {
      this.store.schema.validateUri(U4_PROFILE + '#/$defs/Ref', reference);
      requireCondition(
        reference.owner === binding.owner,
        503,
        'U4_IMPACT_UNVERIFIED',
        '실제 제공 소유자의 근거가 필요합니다.',
      );
    }
    return structuredClone(result.sourceRefs);
  }
}
