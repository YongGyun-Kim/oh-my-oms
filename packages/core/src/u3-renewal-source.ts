import {
  canonicalJson,
  ExecutionBudget,
  OmsError,
  requireCondition,
  U3_PROFILE,
} from '@oms/contracts';
import type { Ref, TargetScope, U3OrderPriceBreakdown, U3ProposalTerms } from '@oms/contracts';
import type { ProtectedStore, ProtectedReadSource } from '@oms/persistence';

export interface U3RenewalBinding {
  owner: 'SoftwareLifecycle';
  ownerRegistration: string;
  purpose: 'MANUAL_RENEWAL_PROPOSAL';
  entitlementRef: Ref;
  renewalCycleRef: Ref;
  enterpriseRef: Ref;
  targetScope: TargetScope;
  originalTermsRef: Ref;
  epoch: string;
  proposalDigest: string;
}
export interface U3RenewalObservation {
  knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
  binding: U3RenewalBinding;
  state: 'RENEWABLE' | 'UNCONFIRMED';
  productType: 'SOFTWARE';
  originalTerms: U3ProposalTerms;
  originalPriceBreakdown: U3OrderPriceBreakdown;
  sourceRefs: Ref[];
  observedAt: string;
  expiresAt: string;
}
export type U3RenewalRegistration =
  | { kind: 'UNREGISTERED' }
  | {
      kind: 'REGISTERED_OWNER' | 'LOCAL_SYNTHETIC';
      ownerRegistration: string;
      readRenewal(binding: U3RenewalBinding, signal: AbortSignal): Promise<U3RenewalObservation>;
    };
const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const confirmed = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'U6_SOURCE_UNCONFIRMED',
    '정확한 현재 SW 권한·수동 갱신 회차 원본을 확인해야 합니다.',
  );

// 서버 구성으로 등록한 실제 U6 소유 경계다. 동의 권한이나 기간 변경을 대신하지 않는다.
export class U3RenewalSource {
  private readonly registration: U3RenewalRegistration;
  constructor(
    private readonly store: ProtectedStore,
    private readonly now: () => Date,
    registration: U3RenewalRegistration = { kind: 'UNREGISTERED' },
  ) {
    requireCondition(
      registration.kind !== 'LOCAL_SYNTHETIC' || process.env.NODE_ENV !== 'production',
      503,
      'U6_SYNTHETIC_REGISTRATION',
      '운영에서는 합성 U6 원본을 등록할 수 없습니다.',
    );
    confirmed(
      registration.kind === 'UNREGISTERED' ||
        ((registration.kind === 'REGISTERED_OWNER' || registration.kind === 'LOCAL_SYNTHETIC') &&
          typeof registration.readRenewal === 'function'),
    );
    this.registration =
      registration.kind === 'UNREGISTERED'
        ? Object.freeze({ kind: 'UNREGISTERED' })
        : Object.freeze({
            kind: registration.kind,
            ownerRegistration: registration.ownerRegistration,
            readRenewal: registration.readRenewal.bind(registration),
          });
  }
  async current(
    request: Omit<U3RenewalBinding, 'owner' | 'ownerRegistration' | 'purpose'>,
    reads: Pick<ProtectedReadSource, 'currentEpoch'> = this.store,
  ): Promise<U3RenewalObservation> {
    const registration = this.registration;
    confirmed(registration.kind === 'REGISTERED_OWNER' || registration.kind === 'LOCAL_SYNTHETIC');
    if (registration.kind === 'UNREGISTERED')
      throw new OmsError(
        503,
        'U6_SOURCE_UNCONFIRMED',
        'U6 현재 원본 생산자가 등록되지 않았습니다.',
      );
    this.store.schema.validate('Id', registration.ownerRegistration);
    this.store.schema.validate('Id', request.epoch);
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/TargetScope', request.targetScope);
    for (const reference of [
      request.entitlementRef,
      request.renewalCycleRef,
      request.originalTermsRef,
      request.enterpriseRef,
    ])
      this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', reference);
    confirmed(
      request.entitlementRef.owner === 'SoftwareLifecycle' &&
        request.entitlementRef.entity === 'EnterpriseEntitlement' &&
        request.renewalCycleRef.owner === 'SoftwareLifecycle' &&
        request.renewalCycleRef.entity === 'RenewalCycle' &&
        exact(request.enterpriseRef, request.targetScope.enterpriseRef) &&
        /^[a-f0-9]{64}$/.test(request.proposalDigest) &&
        request.epoch === (await reads.currentEpoch()),
    );
    const binding: U3RenewalBinding = {
      ...structuredClone(request),
      owner: 'SoftwareLifecycle',
      ownerRegistration: registration.ownerRegistration,
      purpose: 'MANUAL_RENEWAL_PROPOSAL',
    };
    const signal = ExecutionBudget.current()?.signalWithin(5000) ?? AbortSignal.timeout(5000),
      began = this.now().getTime();
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () =>
        reject(
          new OmsError(503, 'U6_SOURCE_UNCONFIRMED', 'U6 소유 원본 조회 기한이 종료됐습니다.'),
        );
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    let result: U3RenewalObservation;
    try {
      result = await Promise.race([
        registration.readRenewal(structuredClone(binding), signal),
        aborted,
      ]);
    } catch {
      throw new OmsError(503, 'U6_SOURCE_UNCONFIRMED', 'U6 소유 원본을 현재 확인하지 못했습니다.');
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    confirmed(
      result &&
        Object.keys(result).sort().join(',') ===
          'binding,expiresAt,knowledge,observedAt,originalPriceBreakdown,originalTerms,productType,sourceRefs,state' &&
        result.knowledge === 'KNOWN' &&
        result.state === 'RENEWABLE' &&
        result.productType === 'SOFTWARE' &&
        exact(result.binding, binding) &&
        !signal.aborted &&
        Date.parse(result.observedAt) >= began &&
        Date.parse(result.observedAt) <= this.now().getTime() &&
        Date.parse(result.expiresAt) > this.now().getTime() &&
        request.epoch === (await reads.currentEpoch()),
    );
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/ProposalTerms', result.originalTerms);
    this.store.schema.validateUri(
      U3_PROFILE + '#/$defs/OrderPriceBreakdown',
      result.originalPriceBreakdown,
    );
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/Refs', result.sourceRefs);
    confirmed(
      exact(result.originalTerms.termsRecordRef, request.originalTermsRef) &&
        [request.entitlementRef, request.renewalCycleRef, request.originalTermsRef].every((ref) =>
          result.sourceRefs.some((value) => exact(ref, value)),
        ),
    );
    return structuredClone(result);
  }
}
