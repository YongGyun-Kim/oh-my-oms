import {
  canonicalJson,
  ExecutionBudget,
  OmsError,
  requireCondition,
  U3_PROFILE,
} from '@oms/contracts';
import type {
  Ref,
  TargetScope,
  U3Knowledge,
  U3OrderLineInput,
  U3OrderPriceBreakdown,
  U3Period,
} from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';

export type U3ReadinessOwner = 'FinancialSettlement' | 'HardwareFulfillment' | 'SoftwareLifecycle';
export interface U3ReadinessLine extends U3OrderLineInput {
  lineRef: Ref;
  agreedPeriod: U3Period | null;
}
export interface U3ReadinessRequest {
  orderRef: Ref;
  purchaseTermsRef: Ref;
  currentTermsRef: Ref;
  enterpriseRef: Ref;
  targetScope: TargetScope;
  productType: 'HARDWARE' | 'SOFTWARE';
  paymentKind: 'PREPAY' | 'POSTPAY';
  provisionChoice: 'FULL';
  priceBreakdown: U3OrderPriceBreakdown;
  lines: U3ReadinessLine[];
  epoch: string;
  decisionDigest: string;
}
export interface U3ReadinessBinding extends U3ReadinessRequest {
  owner: U3ReadinessOwner;
  ownerRegistration: string;
  purpose: 'ORDER_ACCEPTANCE_READINESS';
}
export interface U3ReadinessObservation {
  binding: U3ReadinessBinding;
  knowledge: U3Knowledge;
  sourceRef: Ref;
  sourceRefs: Ref[];
  lines: {
    lineRef: Ref;
    knowledge: U3Knowledge;
    readyQuantity: number | null;
    activationResolution: 'NOT_REQUIRED' | 'CONFIRMED' | 'UNCONFIRMED';
  }[];
  observedAt: string;
  expiresAt: string;
}
export type U3ReadinessRegistration =
  | { kind: 'UNREGISTERED'; owner: U3ReadinessOwner }
  | {
      kind: 'REGISTERED_OWNER' | 'LOCAL_SYNTHETIC';
      owner: U3ReadinessOwner;
      ownerRegistration: string;
      readReadiness(
        binding: U3ReadinessBinding,
        signal: AbortSignal,
      ): Promise<U3ReadinessObservation>;
    };
const entities: Record<U3ReadinessOwner, string> = {
  FinancialSettlement: 'FinancialEligibility',
  HardwareFulfillment: 'HardwareSupplyAssessment',
  SoftwareLifecycle: 'SoftwareSupplyAssessment',
};
const exact = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const confirmed = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'ORDER_READINESS_UNCONFIRMED',
    '현재 소유자의 정확한 전체 주문 준비 원본이 필요합니다.',
  );

// 운영 원본 생산자는 서버에서 등록한다. 이 조회는 지급·재고 확보·발급 자체를 실행하지 않는다.
export class U3OrderReadiness {
  private readonly registrations = new Map<U3ReadinessOwner, U3ReadinessRegistration>();
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    registrations: U3ReadinessRegistration[] = [],
  ) {
    for (const registration of registrations) {
      confirmed(
        Object.hasOwn(entities, registration.owner) && !this.registrations.has(registration.owner),
      );
      requireCondition(
        registration.kind !== 'LOCAL_SYNTHETIC' || process.env.NODE_ENV !== 'production',
        503,
        'ORDER_SYNTHETIC_READINESS',
        '운영에서 합성 준비 원본을 등록할 수 없습니다.',
      );
      confirmed(
        registration.kind === 'UNREGISTERED' ||
          ((registration.kind === 'REGISTERED_OWNER' || registration.kind === 'LOCAL_SYNTHETIC') &&
            typeof registration.readReadiness === 'function'),
      );
      if (registration.kind === 'UNREGISTERED')
        this.registrations.set(registration.owner, Object.freeze({ ...registration }));
      else {
        store.schema.validate('Id', registration.ownerRegistration);
        this.registrations.set(
          registration.owner,
          Object.freeze({
            kind: registration.kind,
            owner: registration.owner,
            ownerRegistration: registration.ownerRegistration,
            readReadiness: registration.readReadiness.bind(registration),
          }),
        );
      }
    }
  }
  async current(
    owner: U3ReadinessOwner,
    request: U3ReadinessRequest,
  ): Promise<U3ReadinessObservation> {
    const registration = this.registrations.get(owner);
    confirmed(registration && registration.kind !== 'UNREGISTERED');
    if (!registration || registration.kind === 'UNREGISTERED')
      throw new OmsError(
        503,
        'ORDER_READINESS_UNCONFIRMED',
        '필수 준비 소유자가 등록되지 않았습니다.',
      );
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/TargetScope', request.targetScope);
    this.store.schema.validateUri(
      U3_PROFILE + '#/$defs/OrderPriceBreakdown',
      request.priceBreakdown,
    );
    this.store.schema.validate('Id', request.epoch);
    for (const reference of [
      request.orderRef,
      request.purchaseTermsRef,
      request.currentTermsRef,
      request.enterpriseRef,
    ])
      this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', reference);
    confirmed(
      request.orderRef.owner === 'OrderAcceptance' &&
        request.orderRef.entity === 'Order' &&
        request.purchaseTermsRef.owner === 'OrderAcceptance' &&
        request.purchaseTermsRef.entity === 'PurchaseTermsSnapshot' &&
        request.currentTermsRef.owner === 'OrderAcceptance' &&
        ['PurchaseTermsSnapshot', 'OrderChangeApplication'].includes(
          request.currentTermsRef.entity,
        ) &&
        exact(request.enterpriseRef, request.targetScope.enterpriseRef) &&
        request.provisionChoice === 'FULL' &&
        ['PREPAY', 'POSTPAY'].includes(request.paymentKind) &&
        ['HARDWARE', 'SOFTWARE'].includes(request.productType) &&
        /^[a-f0-9]{64}$/.test(request.decisionDigest) &&
        request.epoch === (await this.store.currentEpoch()) &&
        request.lines.length >= 1 &&
        request.lines.length <= 100,
    );
    const ids = new Set<string>();
    for (const line of request.lines) {
      const { lineRef, agreedPeriod, ...input } = line;
      this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', lineRef);
      this.store.schema.validateUri(U3_PROFILE + '#/$defs/OrderLineInput', input);
      if (agreedPeriod !== null)
        this.store.schema.validateUri(U3_PROFILE + '#/$defs/Period', agreedPeriod);
      confirmed(
        lineRef.owner === 'OrderAcceptance' &&
          lineRef.entity === 'OrderLine' &&
          !ids.has(lineRef.id) &&
          line.paymentMode === request.paymentKind,
      );
      ids.add(lineRef.id);
    }
    const binding: U3ReadinessBinding = {
      ...structuredClone(request),
      owner,
      ownerRegistration: registration.ownerRegistration,
      purpose: 'ORDER_ACCEPTANCE_READINESS',
    };
    const signal = ExecutionBudget.current()?.signalWithin(5000) ?? AbortSignal.timeout(5000),
      began = this.now().getTime();
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () =>
        reject(
          new OmsError(503, 'ORDER_READINESS_UNCONFIRMED', '소유 원본 조회 기한이 종료됐습니다.'),
        );
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    let result: U3ReadinessObservation;
    try {
      result = await Promise.race([
        registration.readReadiness(structuredClone(binding), signal),
        aborted,
      ]);
    } catch {
      throw new OmsError(
        503,
        'ORDER_READINESS_UNCONFIRMED',
        '필수 준비 소유 원본을 현재 조회하지 못했습니다.',
      );
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    confirmed(
      result &&
        Object.keys(result).sort().join(',') ===
          'binding,expiresAt,knowledge,lines,observedAt,sourceRef,sourceRefs' &&
        exact(result.binding, binding) &&
        ['KNOWN', 'UNKNOWN', 'CONFLICT', 'UNAVAILABLE'].includes(result.knowledge) &&
        !signal.aborted &&
        Date.parse(result.observedAt) >= began &&
        Date.parse(result.observedAt) <= this.now().getTime() &&
        Date.parse(result.expiresAt) > this.now().getTime() &&
        request.epoch === (await this.store.currentEpoch()),
    );
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', result.sourceRef);
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/Refs', result.sourceRefs);
    confirmed(
      result.sourceRef.owner === owner &&
        result.sourceRef.entity === entities[owner] &&
        result.sourceRefs.length >= 1 &&
        result.sourceRefs.length <= 100 &&
        result.sourceRefs.every((reference) => reference.owner === owner) &&
        result.sourceRefs.some((reference) => exact(reference, result.sourceRef)) &&
        Array.isArray(result.lines) &&
        result.lines.length === request.lines.length,
    );
    for (const [index, line] of result.lines.entries()) {
      confirmed(
        Object.keys(line).sort().join(',') ===
          'activationResolution,knowledge,lineRef,readyQuantity' &&
          exact(line.lineRef, request.lines[index]!.lineRef) &&
          ['KNOWN', 'UNKNOWN', 'CONFLICT', 'UNAVAILABLE'].includes(line.knowledge) &&
          ['NOT_REQUIRED', 'CONFIRMED', 'UNCONFIRMED'].includes(line.activationResolution) &&
          (line.readyQuantity === null ||
            (Number.isSafeInteger(line.readyQuantity) && line.readyQuantity >= 0)),
      );
      // 확인 수량은 수락 판단의 근거이며 후속 지급·출고·발급 완료를 뜻하지 않는다.
      confirmed(line.knowledge !== 'KNOWN' || line.readyQuantity !== null);
    }
    return structuredClone(result);
  }
}
