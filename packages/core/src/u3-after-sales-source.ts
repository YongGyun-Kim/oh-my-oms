import {
  canonicalJson,
  ExecutionBudget,
  OmsError,
  requireCondition,
  U3_PROFILE,
} from '@oms/contracts';
import type { Ref, TargetScope } from '@oms/contracts';
import type { ProtectedStore, ProtectedReadSource } from '@oms/persistence';

export interface U3AfterSalesBinding {
  owner: 'AfterSalesDecision';
  ownerRegistration: string;
  operation: 'readAfterSalesFacts';
  decisionRef: Ref;
  orderRef: Ref;
  proposalRef: Ref;
  proposalRevision: number;
  termsFingerprint: string;
  consentRef: Ref;
  newTermsRef: Ref;
  targetScope: TargetScope;
  epoch: string;
  applicationDigest: string;
}
export interface U3AfterSalesObservation {
  binding: U3AfterSalesBinding;
  facts:
    | {
        knowledge: 'KNOWN';
        data: {
          requestRef: Ref;
          orderRef: Ref;
          decisionRef: Ref | null;
          decision: 'ALLOW' | 'DECLINE' | 'REVIEW_REQUIRED' | 'UNVERIFIED';
          holdBasisRef: Ref | null;
          actualResultRefs: Ref[];
          remainingActionRefs: Ref[];
        };
        sourceRefs: Ref[];
        observedAt: string;
      }
    | {
        knowledge: 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
        sourceRefs: Ref[];
        observedAt: string;
        safeReasonCode: string;
      };
  expiresAt: string;
}
export type U3AfterSalesRegistration =
  | { kind: 'UNREGISTERED' }
  | {
      kind: 'REGISTERED_OWNER' | 'LOCAL_SYNTHETIC';
      ownerRegistration: string;
      // 등록 adapter가 실제 C08 결과/결정 원본을 읽어 이 정확한 변경 대상에 결합한다.
      readAfterSalesFacts(
        binding: U3AfterSalesBinding,
        signal: AbortSignal,
      ): Promise<U3AfterSalesObservation>;
    };
const exact = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const verified = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'U7_AFTERSALES_UNCONFIRMED',
    '정확한 수락 후 변경의 현재 U7 허용 결정이 필요합니다.',
  );
export class U3AfterSalesSource {
  private readonly registration: U3AfterSalesRegistration;
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    registration: U3AfterSalesRegistration = { kind: 'UNREGISTERED' },
  ) {
    requireCondition(
      registration.kind !== 'LOCAL_SYNTHETIC' || process.env.NODE_ENV !== 'production',
      503,
      'U7_SYNTHETIC_REGISTRATION',
      '운영에서 합성 U7 허용 결정을 등록할 수 없습니다.',
    );
    verified(
      registration.kind === 'UNREGISTERED' ||
        ((registration.kind === 'REGISTERED_OWNER' || registration.kind === 'LOCAL_SYNTHETIC') &&
          typeof registration.readAfterSalesFacts === 'function'),
    );
    if (registration.kind === 'UNREGISTERED')
      this.registration = Object.freeze({ kind: 'UNREGISTERED' });
    else {
      store.schema.validate('Id', registration.ownerRegistration);
      this.registration = Object.freeze({
        kind: registration.kind,
        ownerRegistration: registration.ownerRegistration,
        readAfterSalesFacts: registration.readAfterSalesFacts.bind(registration),
      });
    }
  }
  async current(
    request: Omit<U3AfterSalesBinding, 'owner' | 'ownerRegistration' | 'operation'>,
    reads: Pick<ProtectedReadSource, 'currentEpoch'> = this.store,
  ): Promise<U3AfterSalesObservation> {
    const registration = this.registration;
    verified(registration.kind !== 'UNREGISTERED');
    if (registration.kind === 'UNREGISTERED')
      throw new OmsError(
        503,
        'U7_AFTERSALES_UNCONFIRMED',
        'U7 실제 조회 생산자가 등록되지 않았습니다.',
      );
    for (const reference of [
      request.decisionRef,
      request.orderRef,
      request.proposalRef,
      request.consentRef,
      request.newTermsRef,
    ])
      this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', reference);
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/TargetScope', request.targetScope);
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/Revision', request.proposalRevision);
    verified(
      request.decisionRef.owner === 'AfterSalesDecision' &&
        request.decisionRef.entity === 'AfterSalesDecisionRecord' &&
        request.orderRef.owner === 'OrderAcceptance' &&
        request.orderRef.entity === 'Order' &&
        request.proposalRef.owner === 'CommercialAgreement' &&
        request.proposalRef.entity === 'CommercialProposal' &&
        request.consentRef.owner === 'CommercialAgreement' &&
        request.consentRef.entity === 'CustomerConsent' &&
        /^[a-f0-9]{64}$/.test(request.termsFingerprint) &&
        /^[a-f0-9]{64}$/.test(request.applicationDigest) &&
        request.epoch === (await reads.currentEpoch()),
    );
    const binding: U3AfterSalesBinding = {
        ...structuredClone(request),
        owner: 'AfterSalesDecision',
        ownerRegistration: registration.ownerRegistration,
        operation: 'readAfterSalesFacts',
      },
      signal = ExecutionBudget.current()?.signalWithin(5000) ?? AbortSignal.timeout(5000),
      began = this.now().getTime();
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () =>
        reject(new OmsError(503, 'U7_AFTERSALES_UNCONFIRMED', 'U7 원본 조회 기한이 종료됐습니다.'));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    let result: U3AfterSalesObservation;
    try {
      result = await Promise.race([
        registration.readAfterSalesFacts(structuredClone(binding), signal),
        aborted,
      ]);
    } catch {
      throw new OmsError(503, 'U7_AFTERSALES_UNCONFIRMED', 'U7 현재 결정을 확인하지 못했습니다.');
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    verified(
      result &&
        Object.keys(result).sort().join(',') === 'binding,expiresAt,facts' &&
        exact(result.binding, binding),
    );
    this.store.schema.validate('AfterSalesViewResult', result.facts);
    verified(result.facts.knowledge === 'KNOWN');
    if (result.facts.knowledge !== 'KNOWN')
      throw new OmsError(503, 'U7_AFTERSALES_UNCONFIRMED', 'U7 허용 결정이 확인되지 않았습니다.');
    verified(
      !signal.aborted &&
        Date.parse(result.facts.observedAt) >= began &&
        Date.parse(result.facts.observedAt) <= this.now().getTime() &&
        Date.parse(result.expiresAt) > this.now().getTime() &&
        request.epoch === (await reads.currentEpoch()) &&
        exact(result.facts.data.orderRef, request.orderRef) &&
        exact(result.facts.data.decisionRef, request.decisionRef) &&
        result.facts.data.decision === 'ALLOW' &&
        result.facts.data.requestRef.owner === 'AfterSalesDecision' &&
        result.facts.data.requestRef.entity === 'AfterSalesRequest' &&
        [request.decisionRef, result.facts.data.requestRef, request.orderRef].every((reference) =>
          result.facts.sourceRefs.some((value) => exact(value, reference)),
        ),
    );
    return structuredClone(result);
  }
}
