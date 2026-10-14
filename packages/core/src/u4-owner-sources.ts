import {
  canonicalJson,
  ExecutionBudget,
  OmsError,
  requireCondition,
  U4_PROFILE,
} from '@oms/contracts';
import type { Money, Ref, TargetScope, U4DueBasis } from '@oms/contracts';
import type { ProtectedReadSource, ProtectedStore } from '@oms/persistence';
import type { U4CompletionScope, U4ProvisionTranche } from './u4-due-basis.js';

type ProvisionOwner = 'HardwareFulfillment' | 'SoftwareLifecycle';
export interface U4CompletionFactView {
  requestedSourceFactRef: Ref;
  latestSourceFactRef: Ref;
  aggregateRef: Ref;
  latestSourceRevision: number;
  providedTranches: U4ProvisionTranche[];
  correctionRefs: Ref[];
  coverage: 'CURRENT' | 'GAP' | 'UNKNOWN' | 'CONFLICT';
  observedAt: string;
}
export interface U4CompletionBinding extends U4CompletionScope {
  owner: ProvisionOwner;
  purpose: 'finance.postpay.reconcile';
  ownerRegistration: string;
  targetScope: TargetScope;
  epoch: string;
  requestDigest: string;
  dueBasis: Exclude<U4DueBasis, { kind: 'FIXED_DATE' }>;
  query: { sourceFactRef: Ref; aggregateRef: Ref; minimumSourceRevision: number | null };
}
export interface U4CompletionObservation {
  binding: U4CompletionBinding;
  knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
  view: U4CompletionFactView;
  confirmedFact: { sourceRef: Ref; ruleRef: Ref; confirmedAt: string } | null;
  expiresAt: string;
}
export type U4CompletionRegistration =
  | { kind: 'UNREGISTERED'; owner: ProvisionOwner }
  | {
      kind: 'REGISTERED_OWNER' | 'LOCAL_SYNTHETIC';
      owner: ProvisionOwner;
      ownerRegistration: string;
      readCompletion(
        binding: U4CompletionBinding,
        signal: AbortSignal,
      ): Promise<U4CompletionObservation>;
    };
export interface U4RenewalCurrentBinding {
  purpose: 'finance.renewal.current';
  ownerRegistration: string;
  orderRef: Ref;
  renewalCycleRef: Ref;
  targetScope: TargetScope;
  epoch: string;
  requestDigest: string;
}
export type U4RenewalCurrentRegistration =
  | { kind: 'UNREGISTERED' }
  | {
      kind: 'REGISTERED_OWNER' | 'LOCAL_SYNTHETIC';
      ownerRegistration: string;
      readCurrent(
        binding: U4RenewalCurrentBinding,
        signal: AbortSignal,
      ): Promise<{
        binding: U4RenewalCurrentBinding;
        current: boolean;
        knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
        sourceRefs: Ref[];
        observedAt: string;
        expiresAt: string;
      }>;
    };
export interface U4RefundApprovalBinding {
  purpose: 'finance.refund.approval';
  ownerRegistration: string;
  orderRef: Ref;
  decisionRef: Ref;
  targetScope: TargetScope;
  approvalRootId: string;
  epoch: string;
  requestDigest: string;
}
export type U4RefundApprovalRegistration =
  | { kind: 'UNREGISTERED' }
  | {
      kind: 'REGISTERED_OWNER' | 'LOCAL_SYNTHETIC';
      ownerRegistration: string;
      readApproval(
        binding: U4RefundApprovalBinding,
        signal: AbortSignal,
      ): Promise<{
        binding: U4RefundApprovalBinding;
        knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
        approved: boolean;
        limit: Money;
        returnRequired: boolean | null;
        sourceRefs: Ref[];
        observedAt: string;
        expiresAt: string;
      }>;
    };
export interface U4ReturnBinding {
  purpose: 'finance.refund.return';
  owner: ProvisionOwner;
  ownerRegistration: string;
  orderRef: Ref;
  decisionRef: Ref;
  targetScope: TargetScope;
  epoch: string;
  requestDigest: string;
}
export type U4ReturnRegistration =
  | { kind: 'UNREGISTERED'; owner: ProvisionOwner }
  | {
      kind: 'REGISTERED_OWNER' | 'LOCAL_SYNTHETIC';
      owner: ProvisionOwner;
      ownerRegistration: string;
      readReturn(
        binding: U4ReturnBinding,
        signal: AbortSignal,
      ): Promise<{
        binding: U4ReturnBinding;
        knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
        returned: boolean;
        sourceRefs: Ref[];
        observedAt: string;
        expiresAt: string;
      }>;
    };
const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const hold = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'U4_OWNER_UNREGISTERED',
    '등록된 소유자의 현재 원본이 필요합니다.',
  );

// U5/U6/U7 원본 권위를 대신하지 않는다. 미등록을 실제 완료/회수/승인으로 승격하지 않는다.
export class U4OwnerSources {
  private readonly completionPorts: ReadonlyMap<ProvisionOwner, U4CompletionRegistration>;
  private readonly returnPorts: ReadonlyMap<ProvisionOwner, U4ReturnRegistration>;
  readonly renewal: U4RenewalCurrentRegistration;
  readonly approval: U4RefundApprovalRegistration;
  constructor(
    private readonly store: ProtectedStore,
    private readonly now: () => Date,
    completion: U4CompletionRegistration[] = [],
    renewal: U4RenewalCurrentRegistration = { kind: 'UNREGISTERED' },
    approval: U4RefundApprovalRegistration = { kind: 'UNREGISTERED' },
    returns: U4ReturnRegistration[] = [],
  ) {
    const ports = new Map<ProvisionOwner, U4CompletionRegistration>();
    for (const port of completion) {
      hold(
        ['HardwareFulfillment', 'SoftwareLifecycle'].includes(port.owner) && !ports.has(port.owner),
      );
      this.registration(port, 'readCompletion');
      ports.set(
        port.owner,
        Object.freeze(
          port.kind === 'UNREGISTERED'
            ? { ...port }
            : { ...port, readCompletion: port.readCompletion.bind(port) },
        ),
      );
    }
    this.registration(renewal, 'readCurrent');
    this.registration(approval, 'readApproval');
    this.completionPorts = ports;
    this.renewal = Object.freeze(
      renewal.kind === 'UNREGISTERED'
        ? { ...renewal }
        : { ...renewal, readCurrent: renewal.readCurrent.bind(renewal) },
    );
    this.approval = Object.freeze(
      approval.kind === 'UNREGISTERED'
        ? { ...approval }
        : { ...approval, readApproval: approval.readApproval.bind(approval) },
    );
    const returnPorts = new Map<ProvisionOwner, U4ReturnRegistration>();
    for (const port of returns) {
      hold(
        ['HardwareFulfillment', 'SoftwareLifecycle'].includes(port.owner) &&
          !returnPorts.has(port.owner),
      );
      this.registration(port, 'readReturn');
      returnPorts.set(
        port.owner,
        Object.freeze(
          port.kind === 'UNREGISTERED'
            ? { ...port }
            : { ...port, readReturn: port.readReturn.bind(port) },
        ),
      );
    }
    this.returnPorts = returnPorts;
  }
  private registration(port: { kind: string; ownerRegistration?: string }, method: string) {
    hold(['UNREGISTERED', 'REGISTERED_OWNER', 'LOCAL_SYNTHETIC'].includes(port.kind));
    if (port.kind === 'UNREGISTERED') return;
    this.store.schema.validate('Id', port.ownerRegistration);
    hold(typeof (port as unknown as Record<string, unknown>)[method] === 'function');
    hold(port.kind !== 'LOCAL_SYNTHETIC' || process.env.NODE_ENV !== 'production');
  }
  private async read<T>(read: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = ExecutionBudget.current()?.signalWithin(5000) ?? AbortSignal.timeout(5000);
    let onAbort = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () =>
        reject(new OmsError(503, 'U4_OWNER_UNREGISTERED', '소유자 원본 조회 기한이 종료됐습니다.'));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    try {
      const value = await Promise.race([read(signal), aborted]);
      hold(!signal.aborted);
      return value;
    } catch {
      throw new OmsError(
        503,
        'U4_OWNER_UNREGISTERED',
        '현재 소유자의 확인 원본을 읽지 못했습니다.',
      );
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
  private current(observedAt: string, expiresAt: string, began: number) {
    hold(
      Date.parse(observedAt) >= began &&
        Date.parse(observedAt) <= this.now().getTime() &&
        Date.parse(expiresAt) > this.now().getTime(),
    );
  }
  private refs(refs: Ref[], owner: string) {
    hold(Array.isArray(refs) && refs.length > 0 && refs.length <= 100);
    for (const reference of refs) {
      this.store.schema.validateUri(U4_PROFILE + '#/$defs/Ref', reference);
      hold(reference.owner === owner);
    }
  }
  async completion(
    request: Omit<U4CompletionBinding, 'ownerRegistration' | 'purpose'>,
    reads: Pick<ProtectedReadSource, 'currentEpoch'> = this.store,
  ): Promise<U4CompletionObservation> {
    const port = this.completionPorts.get(request.owner);
    hold(port && port.kind !== 'UNREGISTERED');
    if (!port || port.kind === 'UNREGISTERED')
      throw new OmsError(
        503,
        'U4_OWNER_UNREGISTERED',
        '실제 완료 원본 생산자가 등록되지 않았습니다.',
      );
    this.store.schema.validateUri(
      'urn:oms:contract:common:2#/$defs/CompletionFactQuery',
      request.query,
    );
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/DueBasis', request.dueBasis);
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/TargetScope', request.targetScope);
    this.refs([request.query.sourceFactRef, request.query.aggregateRef], request.owner);
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/OrderRef', request.orderRef);
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/Ref', request.termsSnapshotRef);
    hold(
      request.lines.length > 0 &&
        request.lines.length <= 100 &&
        new Set(request.lines.map((line) => canonicalJson(line.lineRef))).size ===
          request.lines.length,
    );
    for (const line of request.lines) {
      this.store.schema.validateUri(U4_PROFILE + '#/$defs/Ref', line.lineRef);
      this.store.schema.validateUri(U4_PROFILE + '#/$defs/Ref', line.completionBasisRef);
      this.store.schema.validate('PositiveQuantity', line.quantity);
      hold(line.lineRef.owner === 'OrderAcceptance' && line.lineRef.entity === 'OrderLine');
    }
    hold(
      request.epoch === (await reads.currentEpoch()) &&
        request.owner === request.dueBasis.sourceOwner &&
        /^[a-f0-9]{64}$/.test(request.requestDigest),
    );
    const binding: U4CompletionBinding = {
      ...structuredClone(request),
      ownerRegistration: port.ownerRegistration,
      purpose: 'finance.postpay.reconcile',
    };
    const began = this.now().getTime();
    const result = await this.read((signal) =>
      port.readCompletion(structuredClone(binding), signal),
    );
    hold(
      result &&
        Object.keys(result).sort().join(',') === 'binding,confirmedFact,expiresAt,knowledge,view' &&
        result.knowledge === 'KNOWN' &&
        exact(result.binding, binding),
    );
    this.store.schema.validateUri(
      'urn:oms:contract:common:2#/$defs/CompletionFactView',
      result.view,
    );
    const view = result.view;
    this.current(view.observedAt, result.expiresAt, began);
    this.refs([view.latestSourceFactRef, view.aggregateRef], request.owner);
    hold(
      view.coverage === 'CURRENT' &&
        exact(view.requestedSourceFactRef, request.query.sourceFactRef) &&
        exact(
          { ...view.aggregateRef, revision: request.query.aggregateRef.revision },
          request.query.aggregateRef,
        ) &&
        view.aggregateRef.revision === view.latestSourceRevision &&
        view.latestSourceRevision >= request.query.aggregateRef.revision &&
        view.latestSourceRevision >=
          (request.query.minimumSourceRevision ?? request.query.aggregateRef.revision) &&
        request.epoch === (await reads.currentEpoch()),
    );
    hold(view.providedTranches.length <= 100);
    for (const tranche of view.providedTranches) {
      hold(tranche.completedAt === null || Date.parse(tranche.completedAt) <= this.now().getTime());
      hold(tranche.correctedAt === null || Date.parse(tranche.correctedAt) <= this.now().getTime());
    }
    for (const reference of view.correctionRefs) this.refs([reference], request.owner);
    if (request.dueBasis.event === 'ACTUAL_PROVISION_COMPLETION')
      hold(result.confirmedFact === null);
    else {
      const fact = result.confirmedFact;
      hold(
        fact &&
          Object.keys(fact).sort().join(',') === 'confirmedAt,ruleRef,sourceRef' &&
          exact(fact.ruleRef, request.dueBasis.ruleRef),
      );
      this.refs([fact!.sourceRef], request.owner);
      this.store.schema.validate('Instant', fact!.confirmedAt);
      hold(Date.parse(fact!.confirmedAt) <= this.now().getTime());
    }
    return structuredClone(result);
  }
  async currentRenewal(
    request: Omit<U4RenewalCurrentBinding, 'ownerRegistration' | 'purpose'>,
    reads: Pick<ProtectedReadSource, 'currentEpoch'> = this.store,
  ): Promise<Ref[]> {
    const port = this.renewal;
    hold(port.kind !== 'UNREGISTERED');
    if (port.kind === 'UNREGISTERED')
      throw new OmsError(503, 'U4_OWNER_UNREGISTERED', '현재 회차 생산자가 등록되지 않았습니다.');
    this.refs([request.renewalCycleRef], 'SoftwareLifecycle');
    hold(
      request.renewalCycleRef.entity === 'RenewalCycle' &&
        request.epoch === (await reads.currentEpoch()),
    );
    const binding: U4RenewalCurrentBinding = {
      ...structuredClone(request),
      ownerRegistration: port.ownerRegistration,
      purpose: 'finance.renewal.current',
    };
    const began = this.now().getTime();
    const result = await this.read((signal) => port.readCurrent(structuredClone(binding), signal));
    hold(
      result &&
        Object.keys(result).sort().join(',') ===
          'binding,current,expiresAt,knowledge,observedAt,sourceRefs' &&
        result.knowledge === 'KNOWN' &&
        result.current === true &&
        exact(result.binding, binding),
    );
    this.current(result.observedAt, result.expiresAt, began);
    this.refs(result.sourceRefs, 'SoftwareLifecycle');
    hold(
      result.sourceRefs.some((reference) => exact(reference, request.renewalCycleRef)) &&
        request.epoch === (await reads.currentEpoch()),
    );
    return structuredClone(result.sourceRefs);
  }
  async currentApproval(
    request: Omit<U4RefundApprovalBinding, 'ownerRegistration' | 'purpose'>,
    reads: Pick<ProtectedReadSource, 'currentEpoch'> = this.store,
  ) {
    const port = this.approval;
    hold(port.kind !== 'UNREGISTERED');
    if (port.kind === 'UNREGISTERED')
      throw new OmsError(
        503,
        'U4_OWNER_UNREGISTERED',
        '후속 승인 원본 생산자가 등록되지 않았습니다.',
      );
    this.refs([request.decisionRef], 'AfterSalesDecision');
    hold(request.decisionRef.entity === 'AfterSalesDecisionRecord');
    this.store.schema.validate('Id', request.approvalRootId);
    hold(request.epoch === (await reads.currentEpoch()));
    const binding: U4RefundApprovalBinding = {
      ...structuredClone(request),
      ownerRegistration: port.ownerRegistration,
      purpose: 'finance.refund.approval',
    };
    const began = this.now().getTime();
    const result = await this.read((signal) => port.readApproval(structuredClone(binding), signal));
    hold(
      result &&
        Object.keys(result).sort().join(',') ===
          'approved,binding,expiresAt,knowledge,limit,observedAt,returnRequired,sourceRefs' &&
        result.knowledge === 'KNOWN' &&
        result.approved === true &&
        typeof result.returnRequired === 'boolean' &&
        exact(result.binding, binding),
    );
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/Money', result.limit);
    this.current(result.observedAt, result.expiresAt, began);
    this.refs(result.sourceRefs, 'AfterSalesDecision');
    hold(
      result.sourceRefs.some((reference) => exact(reference, request.decisionRef)) &&
        request.epoch === (await reads.currentEpoch()),
    );
    return structuredClone(result);
  }
  async currentReturn(
    request: Omit<U4ReturnBinding, 'ownerRegistration' | 'purpose'>,
    reads: Pick<ProtectedReadSource, 'currentEpoch'> = this.store,
  ): Promise<Ref[]> {
    const port = this.returnPorts.get(request.owner);
    hold(port && port.kind !== 'UNREGISTERED');
    if (!port || port.kind === 'UNREGISTERED')
      throw new OmsError(
        503,
        'U4_OWNER_UNREGISTERED',
        '실제 회수 원본 생산자가 등록되지 않았습니다.',
      );
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/OrderRef', request.orderRef);
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/TargetScope', request.targetScope);
    this.refs([request.decisionRef], 'AfterSalesDecision');
    hold(request.decisionRef.entity === 'AfterSalesDecisionRecord');
    hold(request.epoch === (await reads.currentEpoch()));
    const binding: U4ReturnBinding = {
      ...structuredClone(request),
      ownerRegistration: port.ownerRegistration,
      purpose: 'finance.refund.return',
    };
    const began = this.now().getTime();
    const result = await this.read((signal) => port.readReturn(structuredClone(binding), signal));
    hold(
      result &&
        Object.keys(result).sort().join(',') ===
          'binding,expiresAt,knowledge,observedAt,returned,sourceRefs' &&
        result.knowledge === 'KNOWN' &&
        result.returned === true &&
        exact(result.binding, binding),
    );
    this.current(result.observedAt, result.expiresAt, began);
    this.refs(result.sourceRefs, request.owner);
    hold(request.epoch === (await reads.currentEpoch()));
    return structuredClone(result.sourceRefs);
  }
}
