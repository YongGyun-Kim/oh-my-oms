import { canonicalJson, requireCondition, ExecutionBudget, OmsError } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import type { ModelData, ProtectedStore, U3Transaction } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { ref, u3Ref } from './references.js';

export interface U3EvidenceRegistration {
  kind: 'UNREGISTERED' | 'LOCAL_SYNTHETIC' | 'REGISTERED_OWNER';
  personPurpose: string;
  agreementPurpose: string;
  sourceKinds: readonly string[];
  owner?: U3RegisteredProofOwner;
}
export interface U3ApprovalProofContext {
  epoch: string;
  approvalDigest: string;
  targetEnterpriseRef: Ref;
}
export interface U3OwnerProofBinding extends U3ApprovalProofContext {
  owner: 'IdentityRecovery';
  identityNamespace: string;
  purpose: string;
  subjectRef: Ref;
  enterpriseRef: Ref | null;
  sourceRefs: Ref[];
}
export interface U3OwnerProofResult {
  knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
  binding: U3OwnerProofBinding;
  state: 'CONFIRMED' | 'UNCONFIRMED' | 'REVOKED';
  observedAt: string;
  expiresAt: string;
  // owner 내부의 불투명 사람 식별자. 원문 신원정보나 클라이언트 주장으로 받지 않는다.
  personKey?: string;
}
export interface U3RegisteredProofOwner {
  readonly identityNamespace: string;
  verifyEvidence(binding: U3OwnerProofBinding, signal: AbortSignal): Promise<U3OwnerProofResult>;
  verifyPerson(binding: U3OwnerProofBinding, signal: AbortSignal): Promise<U3OwnerProofResult>;
}
export const UNREGISTERED_U3_EVIDENCE: U3EvidenceRegistration = Object.freeze({
  kind: 'UNREGISTERED',
  personPurpose: '',
  agreementPurpose: '',
  sourceKinds: [],
});
const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const sources = (refs: Ref[]) => [...new Set(refs.map(canonicalJson))].sort();
const confirmed = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'U3_PROOF_UNCONFIRMED',
    '현재 목적·사람·모든 필수 출처의 근거를 확인해야 합니다.',
  );

// U3 결정 경계의 검사다. 기존 U2 동일인/출처 검증의 미해결을 해결했다고 주장하지 않는다.
export class U3CurrentBasis {
  readonly registration: U3EvidenceRegistration;
  private readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    registration: U3EvidenceRegistration = UNREGISTERED_U3_EVIDENCE,
  ) {
    this.registration = Object.freeze({
      ...registration,
      sourceKinds: Object.freeze([...registration.sourceKinds]),
      owner: registration.owner
        ? Object.freeze({
            identityNamespace: registration.owner.identityNamespace,
            verifyEvidence: registration.owner.verifyEvidence.bind(registration.owner),
            verifyPerson: registration.owner.verifyPerson.bind(registration.owner),
          })
        : undefined,
    });
    this.authorization = new Authorization(store, now);
    requireCondition(
      registration.kind !== 'LOCAL_SYNTHETIC' || process.env.NODE_ENV !== 'production',
      503,
      'U3_SYNTHETIC_REGISTRATION',
      '운영에서 합성 근거를 등록할 수 없습니다.',
    );
  }
  requireRegistration(): void {
    confirmed(
      (this.registration.kind === 'LOCAL_SYNTHETIC' ||
        (this.registration.kind === 'REGISTERED_OWNER' &&
          typeof this.registration.owner?.identityNamespace === 'string' &&
          this.registration.owner.identityNamespace.length > 0 &&
          typeof this.registration.owner?.verifyEvidence === 'function' &&
          typeof this.registration.owner?.verifyPerson === 'function')) &&
        this.registration.personPurpose.length > 0 &&
        this.registration.agreementPurpose.length > 0 &&
        this.registration.sourceKinds.length > 0,
    );
  }
  private async ownerProof(
    scope: U3Transaction,
    kind: 'verifyEvidence' | 'verifyPerson',
    purpose: string,
    subjectRef: Ref,
    enterpriseRef: Ref | null,
    references: Ref[],
    context?: U3ApprovalProofContext,
  ): Promise<string | null> {
    if (this.registration.kind !== 'REGISTERED_OWNER') return null;
    confirmed(context && /^[a-f0-9]{64}$/.test(context.approvalDigest));
    this.store.schema.validate('Id', context!.epoch);
    this.store.schema.validate('Id', this.registration.owner!.identityNamespace);
    confirmed(
      context!.targetEnterpriseRef.owner === 'EnterpriseAccess' &&
        context!.targetEnterpriseRef.entity === 'Enterprise',
    );
    await scope.current(context!.targetEnterpriseRef);
    confirmed(context!.epoch === (await this.store.currentEpoch()));
    const sourceRefs = [
      ...new Map(
        [...references, context!.targetEnterpriseRef].map((value) => [canonicalJson(value), value]),
      ).values(),
    ].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
    const binding: U3OwnerProofBinding = {
      ...context!,
      owner: 'IdentityRecovery',
      identityNamespace: this.registration.owner!.identityNamespace,
      purpose,
      subjectRef,
      enterpriseRef,
      sourceRefs,
    };
    const signal = ExecutionBudget.current()?.signalWithin(5000) ?? AbortSignal.timeout(5000),
      began = this.now().getTime();
    let result: U3OwnerProofResult | undefined;
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () =>
        reject(new OmsError(503, 'U3_PROOF_UNCONFIRMED', '현재 owner 조회를 완료하지 못했습니다.'));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    try {
      // 전달한 객체를 owner가 변경해 기대 결합 자체를 바꾸지 못하도록 복사한다.
      result = await Promise.race([
        this.registration.owner![kind](structuredClone(binding), signal),
        aborted,
      ]);
    } catch {
      throw new OmsError(503, 'U3_PROOF_UNCONFIRMED', '등록 owner의 현재 근거를 확인해야 합니다.');
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    confirmed(
      result &&
        typeof result === 'object' &&
        Object.keys(result).sort().join(',') ===
          (kind === 'verifyPerson'
            ? 'binding,expiresAt,knowledge,observedAt,personKey,state'
            : 'binding,expiresAt,knowledge,observedAt,state') &&
        result.knowledge === 'KNOWN' &&
        result.state === 'CONFIRMED' &&
        exact(result.binding, binding) &&
        Date.parse(result.observedAt) >= began &&
        Date.parse(result.observedAt) <= this.now().getTime() &&
        Date.parse(result.expiresAt) > this.now().getTime() &&
        !signal.aborted &&
        context!.epoch === (await this.store.currentEpoch()),
    );
    // 같은 namespace의 안정적인 비식별 digest만 비교한다. 원문 신원값을 반환/저장하지 않는다.
    if (kind === 'verifyPerson')
      confirmed(typeof result!.personKey === 'string' && /^[a-f0-9]{64}$/.test(result!.personKey));
    for (const reference of sourceRefs) await scope.current(reference);
    return kind === 'verifyPerson' ? result!.personKey! : null;
  }
  async collection(
    scope: U3Transaction,
    model: string,
    equals: Record<string, unknown>,
  ): Promise<ModelData[]> {
    const reference = (data: ModelData) =>
      data.modelVersion === 2 ? u3Ref(model, data, this.store.schema) : ref(model, data);
    const raw = await scope.transaction.list(model, equals, 100),
      visible = await this.store.list(model, { equals, limit: 100 });
    confirmed(
      raw.length < 100 &&
        visible.length < 100 &&
        exact(
          raw.map(reference).sort((a, b) => a.id.localeCompare(b.id)),
          visible.map(reference).sort((a, b) => a.id.localeCompare(b.id)),
        ),
    );
    const records: ModelData[] = [];
    for (const value of visible) records.push(await scope.current(reference(value)));
    return records;
  }
  async evidence(
    scope: U3Transaction,
    references: Ref[],
    purpose: string,
    accountRef: Ref,
    enterpriseRef: Ref | null,
    requiredPolicyRef?: Ref,
    context?: U3ApprovalProofContext,
  ): Promise<void> {
    this.requireRegistration();
    confirmed(
      purpose === this.registration.personPurpose || purpose === this.registration.agreementPurpose,
    );
    confirmed(
      references.length > 0 && new Set(references.map(canonicalJson)).size === references.length,
    );
    const policies = new Map<string, { policy: ModelData; kinds: Set<string> }>();
    const ownerSources: Ref[] = [accountRef];
    const confirmers = new Map<string, Ref>();
    const synthetic = this.registration.kind === 'LOCAL_SYNTHETIC';
    for (const reference of references) {
      confirmed(
        reference.owner === 'IdentityRecovery' && reference.entity === 'VerificationEvidence',
      );
      const evidence = await scope.current(reference),
        policyRef = evidence.policyRef as Ref,
        policy = await scope.current(policyRef),
        at = this.now().getTime();
      confirmed(
        policyRef.owner === 'IdentityRecovery' &&
          policyRef.entity === 'VerificationPolicy' &&
          (!requiredPolicyRef || exact(policyRef, requiredPolicyRef)) &&
          policy.active === true &&
          policy.synthetic === synthetic &&
          policy.purpose === purpose &&
          Date.parse(String(policy.expiresAt)) > at &&
          evidence.state === 'CONFIRMED' &&
          evidence.synthetic === synthetic &&
          evidence.purpose === purpose &&
          exact(evidence.accountRef, accountRef) &&
          exact(evidence.enterpriseRef, enterpriseRef) &&
          Date.parse(String(evidence.observedAt)) <= at &&
          Date.parse(String(evidence.expiresAt)) > at &&
          this.registration.sourceKinds.includes(String(evidence.sourceKind)),
      );
      const account = await scope.current(accountRef),
        bindingRef = evidence.bindingRef as Ref,
        binding = await scope.current(bindingRef),
        authorityRef = evidence.authorityRef as Ref;
      confirmed(
        account.active &&
          bindingRef.owner === 'IdentityRecovery' &&
          bindingRef.entity === 'ProviderBinding' &&
          binding.active &&
          exact(binding.accountRef, accountRef),
      );
      await scope.current(authorityRef);
      ownerSources.push(reference, policyRef, bindingRef, authorityRef);
      confirmers.set(canonicalJson(authorityRef), authorityRef);
      const key = canonicalJson(policyRef);
      if (!policies.has(key)) policies.set(key, { policy, kinds: new Set() });
      policies.get(key)!.kinds.add(String(evidence.sourceKind));
    }
    for (const { policy, kinds } of policies.values()) {
      const required = policy.requiredSourceKinds as string[];
      confirmed(
        required.length > 0 &&
          required.every((kind) => this.registration.sourceKinds.includes(kind) && kinds.has(kind)),
      );
    }
    // 모든 proof-kind는 위에서 개별 검증했다. 동일한 정확 확인자만 phase 안에서 중복 제거한다.
    for (const confirmer of confirmers.values())
      await this.authorization.requireStaffSource(
        confirmer,
        'identity.person.verify',
        scope.transaction,
      );
    await this.ownerProof(
      scope,
      'verifyEvidence',
      purpose,
      accountRef,
      enterpriseRef,
      ownerSources,
      context,
    );
    for (const confirmer of confirmers.values())
      await this.authorization.requireStaffSource(
        confirmer,
        'identity.person.verify',
        scope.transaction,
      );
  }
  async person(
    scope: U3Transaction,
    accountRef: Ref,
    personRef: Ref | null,
    context?: U3ApprovalProofContext,
  ): Promise<{ link: ModelData; identityKey: string }> {
    this.requireRegistration();
    confirmed(
      personRef &&
        personRef.owner === 'IdentityRecovery' &&
        personRef.entity === 'VerifiedPersonLink',
    );
    const account = await scope.current(accountRef),
      link = await scope.current(personRef!),
      at = this.now().getTime();
    confirmed(
      account.active &&
        (link.accountRefs as Ref[]).some((value) => exact(value, accountRef)) &&
        Date.parse(String(link.verifiedAt)) <= at,
    );
    const checks = await this.collection(scope, 'PersonVerification', {
      personLinkRef: { id: personRef!.id },
    });
    confirmed(checks.length === 1);
    const check = checks[0]!,
      policy = await scope.current(check.policyRef as Ref);
    confirmed(
      exact(check.personLinkRef, personRef) &&
        check.state === 'CONFIRMED' &&
        Date.parse(String(check.verifiedAt)) <= at &&
        Date.parse(String(check.expiresAt)) > at &&
        policy.purpose === this.registration.personPurpose &&
        policy.active,
    );
    const confirmer = check.verifiedBy as Ref;
    const anchors = link.evidenceRefs as Ref[],
      anchorSources: Ref[] = [];
    if (!exact(sources(anchors), sources(check.evidenceRefs as Ref[]))) {
      confirmed(anchors.length > 0);
      for (const anchor of anchors) {
        confirmed(anchor.owner === 'IdentityRecovery' && anchor.entity === 'IdentityHistory');
        const history = await scope.current(anchor),
          checkRef = ref('PersonVerification', check),
          linkTarget = exact(history.afterRef, personRef),
          checkTarget = exact(history.afterRef, checkRef);
        confirmed(
          history.owner === 'IdentityRecovery' &&
            (linkTarget || checkTarget) &&
            history.sourceRevision === (linkTarget ? personRef!.revision : checkRef.revision) &&
            exact(history.actorAccountRef, confirmer) &&
            Date.parse(String(history.occurredAt)) <= at &&
            (history.resultRefs as Ref[]).some((value) => exact(value, personRef)) &&
            (history.resultRefs as Ref[]).some((value) => exact(value, checkRef)) &&
            exact(sources(history.evidenceRefs as Ref[]), sources(check.evidenceRefs as Ref[])),
        );
        const receiptRef: Ref = {
            owner: 'U1Host',
            entity: 'RequestReceipt',
            id: String(history.requestId),
            revision: 1,
          },
          receipt = await scope.current(receiptRef);
        confirmed(
          receipt.owner === 'IdentityRecovery' &&
            receipt.audience === 'STAFF' &&
            receipt.principalId === confirmer.id &&
            receipt.requestState === 'RESULT_RECORDED' &&
            [anchor, personRef!, checkRef].every((reference) =>
              (receipt.resultRefs as Ref[]).some((value) => exact(value, reference)),
            ),
        );
        anchorSources.push(anchor, receiptRef);
      }
    }
    await scope.current(confirmer);
    await this.authorization.requireStaffSource(
      confirmer,
      'identity.person.verify',
      scope.transaction,
    );
    await this.evidence(
      scope,
      check.evidenceRefs as Ref[],
      this.registration.personPurpose,
      accountRef,
      null,
      check.policyRef as Ref,
      context,
    );
    const personKey = await this.ownerProof(
      scope,
      'verifyPerson',
      this.registration.personPurpose,
      accountRef,
      null,
      [
        accountRef,
        personRef!,
        ref('PersonVerification', check),
        check.policyRef as Ref,
        confirmer,
        ...anchorSources,
        ...(check.evidenceRefs as Ref[]),
      ],
      context,
    );
    await this.authorization.requireStaffSource(
      confirmer,
      'identity.person.verify',
      scope.transaction,
    );
    return { link, identityKey: personKey ?? String(link.personLinkId) };
  }
  async differentPeople(
    scope: U3Transaction,
    registrant: Ref,
    registeredPerson: Ref | null,
    approver: Ref,
    approverPerson: Ref | null,
    context?: U3ApprovalProofContext,
  ): Promise<void> {
    requireCondition(
      registrant.id !== approver.id,
      403,
      'SAME_PERSON_APPROVAL',
      '등록자와 승인자는 다른 사람이어야 합니다.',
    );
    requireCondition(
      !registeredPerson || !approverPerson || registeredPerson.id !== approverPerson.id,
      403,
      'SAME_PERSON_APPROVAL',
      '같은 사람의 다른 계정으로 승인할 수 없습니다.',
    );
    const left = await this.person(scope, registrant, registeredPerson, context),
      right = await this.person(scope, approver, approverPerson, context);
    requireCondition(
      left.identityKey !== right.identityKey &&
        left.link.personLinkId !== right.link.personLinkId &&
        !(left.link.accountRefs as Ref[]).some((a) =>
          (right.link.accountRefs as Ref[]).some((b) => a.id === b.id),
        ),
      403,
      'SAME_PERSON_APPROVAL',
      '같은 사람의 다른 계정으로 승인할 수 없습니다.',
    );
  }
}
