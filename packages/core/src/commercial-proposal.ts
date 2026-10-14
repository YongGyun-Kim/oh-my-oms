import { randomUUID } from 'node:crypto';
import {
  canonicalJson,
  ExecutionBudget,
  fingerprint,
  requireCondition,
  U3_PROFILE,
} from '@oms/contracts';
import type {
  Receipt,
  Ref,
  ServiceContext,
  TargetScope,
  U3ConsentInput,
  U3OrderPriceBreakdown,
  U3ProposalInput,
  U3ProposalQuery,
  U3ProposalTerms,
  U3ProposalView,
  U3CapturedLine,
  U3ResolvedCommercialTerms,
} from '@oms/contracts';
import {
  ProtectedTransaction,
  U3Transaction,
  U3_SOURCE_CONTRACT,
  validateModel,
} from '@oms/persistence';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { AuthorizationFence } from './authorization-fence.js';
import { CommercialAgreement } from './commercial-agreement.js';
import { U3Commands } from './u3-commands.js';
import type { U3EvidenceRegistration } from './u3-current-basis.js';
import { U3RenewalSource } from './u3-renewal-source.js';
import type { U3RenewalObservation, U3RenewalRegistration } from './u3-renewal-source.js';
import { proposalTermsFingerprint, validateProposalPrice } from './proposal-terms.js';
import type { ProposalContent } from './proposal-terms.js';
import { ref, u3Ref } from './references.js';
import { currentOrderTerms } from './order-terms.js';
import { recordedOperation } from './u3-recorded-operation.js';
import { currentConsentScope, validateConsentScope } from './u3-consent-scope.js';
import { scopeV2Includes } from './scope-v2.js';
import type { OrderingPolicy } from './scopes.js';

const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const refs = (values: Ref[]) => [
  ...new Map(values.map((value) => [canonicalJson(value), value])).values(),
];
const refSet = (values: Ref[]) => values.map(canonicalJson).sort();
const confirmed = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'U3_PROOF_UNCONFIRMED',
    '현재 제안의 정확한 대상·조건·모든 원본을 확인해야 합니다.',
  );
interface OriginalTarget {
  terms: U3ProposalTerms;
  price: U3OrderPriceBreakdown;
  renewal: U3RenewalObservation | null;
}
type TargetData = Pick<
  U3ProposalInput,
  | 'targetScope'
  | 'targetOrderRef'
  | 'targetEntitlementRef'
  | 'targetRenewalCycleRef'
  | 'originalTermsRef'
>;

export class CommercialProposal {
  readonly commands: U3Commands;
  readonly agreement: CommercialAgreement;
  private readonly renewal: U3RenewalSource;
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
    evidence?: U3EvidenceRegistration,
    renewal?: U3RenewalRegistration,
  ) {
    this.commands = new U3Commands(store, now);
    this.agreement = new CommercialAgreement(store, now, staffIngress, evidence);
    this.renewal = new U3RenewalSource(store, now, renewal);
  }
  private async ingress(context: ServiceContext, proof: unknown): Promise<void> {
    requireCondition(
      context.audience !== 'STAFF' || (await this.staffIngress(proof)),
      403,
      'STAFF_NETWORK_REQUIRED',
      '등록된 사내 내부망 접근이 필요합니다.',
    );
  }
  private async budget<T>(context: ServiceContext, operation: () => Promise<T>): Promise<T> {
    const parent = ExecutionBudget.current();
    parent?.check();
    const remaining = Math.min(
      10000,
      Date.parse(context.deadlineAt) - this.now().getTime(),
      parent?.remaining() ?? 10000,
    );
    requireCondition(
      Number.isFinite(remaining) && remaining > 0,
      503,
      'EXECUTION_DEADLINE',
      '현재 요청의 유한 판단 기한이 필요합니다.',
    );
    return new ExecutionBudget(
      Math.floor(remaining),
      () => this.now().getTime(),
      parent?.signal,
    ).run(operation);
  }
  private async historical(reference: Ref): Promise<ModelData> {
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/Ref', reference);
    const original = await this.store.readRevision(
      reference.entity,
      reference.id,
      reference.revision,
    );
    confirmed(
      original && original.modelVersion === 2 && exact(ref(reference.entity, original), reference),
    );
    validateModel(reference.entity, original!, this.store.schema);
    return original!;
  }
  private async original(
    scope: U3Transaction,
    target: TargetData,
    digest: string,
  ): Promise<OriginalTarget> {
    await scope.current(target.targetScope.enterpriseRef);
    if (target.targetOrderRef) {
      const order = await scope.current(target.targetOrderRef);
      requireCondition(
        order.modelVersion === 2 &&
          exact(order.enterpriseRef, target.targetScope.enterpriseRef) &&
          exact(order.targetScope, target.targetScope),
        404,
        'NOT_FOUND',
        '해당 기업·고정 문맥의 주문을 확인할 수 없습니다.',
      );
      requireCondition(
        ['REVIEW', 'ACCEPTED'].includes(String(order.state)),
        409,
        'PROPOSAL_TARGET_STATE',
        '거절된 주문의 조건을 적용 대상으로 제안할 수 없습니다.',
      );
      const current = await currentOrderTerms(scope, target.targetOrderRef, this.agreement.basis);
      requireCondition(
        exact(current.reference, target.originalTermsRef),
        409,
        'PROPOSAL_ORIGINAL_TERMS',
        '다음 제안은 실제 현재 적용 조건 원본을 가리켜야 합니다.',
      );
      // 원래 미확인 총액은 미확인 그대로 비교한다. 새 제안의 확인 금액으로 추정하지 않는다.
      return { terms: current.terms, price: current.price, renewal: null };
    }
    const renewal = await this.renewal.current({
      entitlementRef: target.targetEntitlementRef!,
      renewalCycleRef: target.targetRenewalCycleRef!,
      enterpriseRef: target.targetScope.enterpriseRef,
      targetScope: target.targetScope,
      originalTermsRef: target.originalTermsRef,
      epoch: await this.store.currentEpoch(),
      proposalDigest: digest,
    });
    validateProposalPrice(renewal.originalTerms, renewal.originalPriceBreakdown, this.store.schema);
    confirmed(renewal.originalPriceBreakdown.knowledge === 'KNOWN');
    return { terms: renewal.originalTerms, price: renewal.originalPriceBreakdown, renewal };
  }
  private async currentTerms(
    scope: U3Transaction,
    target: TargetData,
    original: U3ProposalTerms,
    proposed: U3ProposalTerms,
    digest: string,
  ): Promise<{ product: ModelData; offerRef: Ref; terms: U3ResolvedCommercialTerms }[]> {
    confirmed(original.lines.length === proposed.lines.length);
    const corporate: Ref[] = [],
      conditionRefs: Ref[] = [],
      resolved: { product: ModelData; offerRef: Ref; terms: U3ResolvedCommercialTerms }[] = [];
    for (const [index, line] of proposed.lines.entries()) {
      const prior = original.lines[index]!;
      confirmed(prior.productRef.id === line.productRef.id && prior.quantity === line.quantity);
      const product = await scope.current(line.productRef);
      confirmed(target.targetOrderRef !== null || product.productType === 'SOFTWARE');
      const offer = product.currentOfferRef as Ref | null;
      confirmed(offer);
      const current = await this.agreement.currentTerms(scope, {
        targetScope: target.targetScope,
        productRef: line.productRef,
        commonOfferRevisionRef: offer!,
      });
      const price = current.conditionBindings.find((value) => value.conditionKey === 'PRICE'),
        period = current.conditionBindings.find((value) => value.conditionKey === 'PERIOD');
      confirmed(
        price &&
          exact(price.value, line.price) &&
          exact(period?.value ?? null, line.period) &&
          (product.softwareTermKind !== 'TERM' || period) &&
          exact(
            refSet(refs(current.conditionBindings.map((value) => value.sourceRef))),
            refSet(line.conditionRefs),
          ),
      );
      conditionRefs.push(...line.conditionRefs);
      corporate.push(...current.agreementRevisionRefs);
      for (const binding of current.conditionBindings)
        for (const evidence of binding.evidenceRefs) await scope.current(evidence);
      resolved.push({ product, offerRef: offer!, terms: current });
    }
    if (proposed.termsRecordRef.entity === 'AgreementHistory') {
      const history = await scope.current(proposed.termsRecordRef);
      confirmed(
        history.owner === 'CommercialAgreement' &&
          conditionRefs.some((value) => exact(value, history.afterRef)) &&
          history.sourceRevision === (history.afterRef as Ref).revision,
      );
    } else if (proposed.termsRecordRef.entity === 'CommercialProposal') {
      const source = await scope.current(proposed.termsRecordRef);
      confirmed(
        exact(source.enterpriseRef, target.targetScope.enterpriseRef) &&
          exact((source.proposedTerms as U3ProposalTerms).lines, proposed.lines),
      );
    } else confirmed(conditionRefs.some((value) => exact(value, proposed.termsRecordRef)));
    await this.agreement.approvedSources(scope, refs(corporate), {
      epoch: await this.store.currentEpoch(),
      targetEnterpriseRef: target.targetScope.enterpriseRef,
      approvalDigest: digest,
    });
    return resolved;
  }
  private async costs(
    scope: U3Transaction,
    price: U3OrderPriceBreakdown,
    enterpriseRef: Ref,
    digest: string,
  ): Promise<void> {
    confirmed(price.knowledge === 'KNOWN');
    for (const item of price.adjustments) {
      confirmed(item.knowledge === 'KNOWN' && item.confirmedByRef && item.evidenceRefs.length > 0);
      // 입력의 KNOWN 플래그 대신 현재 직원 권위와 목적에 맞는 모든 합의 원본을 확인한다.
      await this.commands.authorization.requireStaffSource(
        item.confirmedByRef!,
        'contract.propose',
        scope.transaction,
      );
      await this.agreement.basis.evidence(
        scope,
        item.evidenceRefs,
        this.agreement.basis.registration.agreementPurpose,
        item.confirmedByRef!,
        enterpriseRef,
        undefined,
        {
          epoch: await this.store.currentEpoch(),
          targetEnterpriseRef: enterpriseRef,
          approvalDigest: digest,
        },
      );
    }
  }
  private content(data: ModelData): ProposalContent {
    confirmed(
      data.modelVersion === 2 &&
        data.originalPriceBreakdown &&
        typeof data.termsFingerprint === 'string' &&
        Object.prototype.hasOwnProperty.call(data, 'supersedesRef'),
    );
    const content: ProposalContent = {
      proposalRevision: Number(data.proposalRevision),
      targetScope: data.targetScope as TargetScope,
      targetOrderRef: data.targetOrderRef as Ref | null,
      targetEntitlementRef: data.targetEntitlementRef as Ref | null,
      targetRenewalCycleRef: data.targetRenewalCycleRef as Ref | null,
      originalTerms: data.originalTerms as U3ProposalTerms,
      proposedTerms: data.proposedTerms as U3ProposalTerms,
      originalPriceBreakdown: data.originalPriceBreakdown as U3OrderPriceBreakdown,
      priceBreakdown: data.priceBreakdown as U3OrderPriceBreakdown,
      agreementEvidenceRefs: data.evidenceRefs as Ref[],
    };
    confirmed(data.termsFingerprint === proposalTermsFingerprint(content, this.store.schema));
    return content;
  }
  private async currentProposal(scope: U3Transaction, reference: Ref): Promise<ModelData> {
    // 먼저 primary/protected 전체 대조와 현재 판단 전제 fence를 유지한다.
    await scope.current(reference);
    const protectedOriginal = await this.commands.repository.current(reference);
    confirmed(
      protectedOriginal.modelVersion === 2 &&
        exact(ref('CommercialProposal', protectedOriginal), reference),
    );
    this.content(protectedOriginal);
    await this.creator(scope, protectedOriginal);
    // 선택 nullable의 명시 null은 보호 원상에서 확인하며 공유 decoder를 바꾸지 않는다.
    return protectedOriginal;
  }
  private async creator(scope: U3Transaction, proposal: ModelData): Promise<ModelData> {
    const first = await this.historical({
      owner: 'CommercialAgreement',
      entity: 'CommercialProposal',
      id: String(proposal.proposalId),
      revision: 1,
    });
    confirmed(
      exact(first.evidenceRefs, proposal.evidenceRefs) &&
        first.termsFingerprint === proposal.termsFingerprint,
    );
    const histories = await this.agreement.basis.collection(scope, 'AgreementHistory', {
      afterRef: { id: proposal.proposalId },
    });
    const creators: ModelData[] = [];
    for (const history of histories) {
      if (
        history.sourceRevision !== 1 ||
        !exact(history.afterRef, ref('CommercialProposal', first))
      )
        continue;
      const receipt = await scope.current({
        owner: 'U1Host',
        entity: 'RequestReceipt',
        id: String(history.requestId),
        revision: 1,
      });
      if (receipt.operation !== 'createProposal') continue;
      confirmed(
        receipt.owner === 'CommercialAgreement' &&
          receipt.audience === 'STAFF' &&
          receipt.requestState === 'RESULT_RECORDED' &&
          exact(receipt.sourceContract, U3_SOURCE_CONTRACT) &&
          (receipt.targetIdentity as { kind: string }).kind === 'NONE' &&
          exact(receipt.targetScope, proposal.targetScope) &&
          receipt.principalId === (history.actorAccountRef as Ref).id &&
          [
            ref('CommercialProposal', first),
            u3Ref('AgreementHistory', history, this.store.schema),
          ].every((reference) =>
            (receipt.resultRefs as Ref[]).some((value) => exact(value, reference)),
          ),
      );
      creators.push(history);
    }
    confirmed(creators.length === 1);
    return creators[0]!;
  }
  private async proposalEvidence(
    scope: U3Transaction,
    proposal: ModelData,
    digest: string,
  ): Promise<void> {
    const creator = await this.creator(scope, proposal),
      proof = {
        epoch: await this.store.currentEpoch(),
        targetEnterpriseRef: proposal.enterpriseRef as Ref,
        approvalDigest: digest,
      };
    await this.agreement.basis.person(
      scope,
      creator.actorAccountRef as Ref,
      creator.verifiedPersonRef as Ref | null,
      proof,
    );
    await this.agreement.basis.evidence(
      scope,
      proposal.evidenceRefs as Ref[],
      this.agreement.basis.registration.agreementPurpose,
      creator.actorAccountRef as Ref,
      proposal.enterpriseRef as Ref,
      undefined,
      proof,
    );
  }
  async recordedConsent(scope: U3Transaction, reference: Ref) {
    const consent = await scope.current(reference);
    confirmed(consent.modelVersion === 2 && consent.decision === 'ACCEPT');
    const displayed = await this.historical(consent.proposalRef as Ref),
      current = await this.store.currentProtected(
        'CommercialProposal',
        (consent.proposalRef as Ref).id,
      );
    confirmed(current?.modelVersion === 2);
    const proposalRef = u3Ref('CommercialProposal', current!, this.store.schema),
      proposal = await this.currentProposal(scope, proposalRef),
      content = this.content(proposal);
    requireCondition(
      proposal.result === 'CONSENTED' &&
        proposalRef.revision === (consent.proposalRef as Ref).revision + 1 &&
        content.proposalRevision === consent.proposalRevision &&
        exact(this.content(displayed), content) &&
        exact(consent.enterpriseRef, proposal.enterpriseRef),
      409,
      'CONSENT_PRESENTATION_CHANGED',
      '동의한 정확한 제안 내용과 현재 동의 기록이 필요합니다.',
    );
    const recorded = await recordedOperation(scope, this.agreement.basis, {
      owner: 'CommercialAgreement',
      operation: 'recordConsent',
      afterRef: proposalRef,
      beforeRef: consent.proposalRef as Ref,
      resultRef: reference,
      target: { kind: 'RECORD', recordRef: consent.proposalRef as Ref },
      targetScope: content.targetScope,
      audience: 'CUSTOMER',
    });
    confirmed(
      exact(recorded.history.actorAccountRef, consent.actorAccountRef) &&
        recorded.receipt.principalId === (consent.actorAccountRef as Ref).id &&
        Date.parse(String(consent.occurredAt)) <= Date.parse(String(recorded.history.occurredAt)),
    );
    const originalInput: U3ConsentInput = {
      meta: {
        clientRequestId: String(recorded.receipt.idempotencyKey),
        expectedRevision: (consent.proposalRef as Ref).revision,
        reason: String(recorded.history.reason),
        evidenceRefs: recorded.history.evidenceRefs as Ref[],
      },
      targetScope: content.targetScope,
      proposalRef: consent.proposalRef as Ref,
      proposalRevision: content.proposalRevision,
      termsFingerprint: String(proposal.termsFingerprint),
      decision: 'ACCEPT',
    };
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/ConsentInput', originalInput);
    confirmed(recorded.receipt.requestFingerprint === fingerprint(originalInput));
    return { consent, proposal, proposalRef, content };
  }
  private async currentConsentAuthority(
    scope: U3Transaction,
    consent: ModelData,
    target: TargetScope,
  ): Promise<void> {
    const references = consent.evidenceRefs as Ref[],
      sources: { ref: Ref; data: ModelData }[] = [];
    confirmed(references.some((reference) => exact(reference, consent.proposalRef)));
    for (const reference of references) {
      if (exact(reference, consent.proposalRef)) continue; // 내용 개정은 위의 보호 역사/현재 제안으로 검증한다.
      sources.push({ ref: reference, data: await scope.current(reference) });
    }
    const one = (entity: string) => {
      const rows = sources.filter((value) => value.ref.entity === entity);
      confirmed(rows.length === 1);
      return rows[0]!;
    };
    const account = one('Account'),
      security = one('AccountSecurityState'),
      binding = one('ProviderBinding'),
      membership = one('EnterpriseMembership'),
      enterprise = one('Enterprise'),
      fence = one('EnterpriseAccessFence');
    const actor = consent.actorAccountRef as Ref;
    confirmed(
      exact(account.ref, actor) &&
        account.data.active &&
        (security.data.accountRef as Ref).id === actor.id &&
        security.data.epoch === (await this.store.currentEpoch()) &&
        binding.data.active &&
        binding.data.audience === 'CUSTOMER' &&
        (binding.data.accountRef as Ref).id === actor.id &&
        membership.data.active &&
        (membership.data.accountRef as Ref).id === actor.id &&
        (membership.data.enterpriseRef as Ref).id === target.enterpriseRef.id &&
        exact(enterprise.ref, target.enterpriseRef) &&
        enterprise.data.approvalState === 'APPROVED' &&
        enterprise.data.usageEnabled &&
        (fence.data.enterpriseRef as Ref).id === target.enterpriseRef.id,
    );
    const original = await this.store.readRevision(
      'Enterprise',
      target.enterpriseRef.id,
      target.organisationRevision,
    );
    confirmed(
      original &&
        target.contextPolicyRef.id === target.enterpriseRef.id &&
        target.contextPolicyRef.revision === target.organisationRevision &&
        target.enterpriseRef.revision === target.organisationRevision,
    );
    for (const reference of [target.departmentRef, target.siteRef])
      if (reference) {
        const organisation = await scope.current(reference);
        confirmed(
          organisation.active && (organisation.enterpriseRef as Ref).id === target.enterpriseRef.id,
        );
      }
    let allowed = false;
    for (const grant of sources.filter((value) => value.ref.entity === 'CustomerRoleGrant')) {
      if (
        grant.data.revokedAt !== null ||
        Date.parse(String(grant.data.effectiveFrom)) > this.now().getTime() ||
        (grant.data.membershipRef as Ref).id !== membership.ref.id
      )
        continue;
      const role = sources.find(
        (value) =>
          value.ref.entity === 'CustomerRole' && value.ref.id === (grant.data.roleRef as Ref).id,
      );
      if (!role || role.data.modelVersion !== 2) continue; // 구형 역할은 동의 권한으로 추정하지 않는다.
      const state = sources.find(
        (value) => value.ref.entity === 'RoleRevisionState' && exact(value.data.roleRef, role.ref),
      );
      confirmed(state && state.data.modelVersion === 2);
      if (!state!.data.active) continue;
      confirmed((role.data.enterpriseRef as Ref).id === target.enterpriseRef.id);
      for (const reference of state!.data.scopeRefs as Ref[]) {
        const stored = sources.find((value) => exact(value.ref, reference));
        confirmed(stored);
        const predicate = currentConsentScope(stored!.data, state!.data);
        confirmed(
          exact(predicate.enterpriseRef, target.enterpriseRef) &&
            predicate.sourcePolicyRevision === target.organisationRevision,
        );
        if (
          scopeV2Includes(
            predicate,
            'contract.consent',
            target,
            original!.orderingContextPolicy as OrderingPolicy,
            'BUSINESS',
            validateConsentScope,
          )
        )
          allowed = true;
      }
    }
    requireCondition(
      allowed,
      403,
      'ACTION_DENIED',
      '동의한 고객의 현재 대상별 동의 권한이 필요합니다.',
    );
    // 이 fence는 현재 사업 권위를 검증한다. 고객의 새 로그인/새 MFA를 증명하지 않는다.
  }
  async currentApplicationEvidence(scope: U3Transaction, consentRef: Ref) {
    const source = await this.recordedConsent(scope, consentRef);
    await this.currentConsentAuthority(scope, source.consent, source.content.targetScope);
    await this.proposalEvidence(scope, source.proposal, String(source.proposal.termsFingerprint));
    await this.costs(
      scope,
      source.content.priceBreakdown,
      source.content.targetScope.enterpriseRef,
      String(source.proposal.termsFingerprint),
    );
    validateProposalPrice(
      source.content.proposedTerms,
      source.content.priceBreakdown,
      this.store.schema,
    );
    return source;
  }
  async applicationSource(
    scope: U3Transaction,
    consentRef: Ref,
    orderRef: Ref,
    targetScope: TargetScope,
    newTermsRef: Ref,
  ) {
    const source = await this.currentApplicationEvidence(scope, consentRef);
    requireCondition(
      exact(source.content.targetOrderRef, orderRef) &&
        exact(source.content.targetScope, targetScope) &&
        exact(source.proposal.proposedTermsRef, newTermsRef) &&
        exact(source.content.proposedTerms.termsRecordRef, newTermsRef),
      409,
      'CONSENT_TARGET_CHANGED',
      '동의한 정확한 주문·새 조건·고정 대상에만 적용합니다.',
    );
    const resolved = await this.currentTerms(
      scope,
      { ...source.content, originalTermsRef: source.content.originalTerms.termsRecordRef },
      source.content.originalTerms,
      source.content.proposedTerms,
      String(source.proposal.termsFingerprint),
    );
    const captured: U3CapturedLine[] = [];
    for (const [index, line] of source.content.proposedTerms.lines.entries()) {
      // 같은 phase에서 실제 보호 원본·가격·기간·기업 승인을 검증한 결과만 재사용한다.
      // 적용 전후 applicationSource 호출은 각각 독립적으로 다시 조회한다.
      const { offerRef: offer, terms: current } = resolved[index]!;
      const payment = current.conditionBindings.find(
          (binding) => binding.conditionKey === 'PAYMENT',
        ),
        completion = current.conditionBindings.find(
          (binding) => binding.conditionKey === 'COMPLETION',
        );
      requireCondition(
        payment?.conditionKey === 'PAYMENT' && completion?.conditionKey === 'COMPLETION',
        503,
        'U3_PROOF_UNCONFIRMED',
        '현재 제안의 지급·완료 조건이 필요합니다.',
      );
      captured.push({
        productRef: line.productRef,
        commonOfferRevisionRef: offer,
        agreementRevisionRefs: current.agreementRevisionRefs,
        conditionBindings: current.conditionBindings,
        quantity: line.quantity,
        paymentMode: payment.value.mode,
        requestedActivationDate: null,
        purchasePrice: line.price,
        priceKnowledge: 'KNOWN',
        paymentTermsRef: payment.value.termsRef,
        agreedPeriod: line.period,
        completionBasisRef: completion.value,
      });
    }
    return { ...source, captured, products: resolved.map((value) => value.product) };
  }
  async create(
    context: ServiceContext,
    input: U3ProposalInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    await this.ingress(context, ingressProof);
    return this.budget(context, () =>
      this.commands.run(
        context,
        'CommercialAgreement',
        'createProposal',
        { kind: 'NONE' },
        input,
        { scope: input.targetScope },
        async (scope) => {
          requireCondition(
            input.meta.expectedRevision === null,
            400,
            'CREATE_REVISION',
            '새 제안은 별도 기록이며 예상 저장 개정이 없어야 합니다.',
          );
          const digest = fingerprint(input),
            original = await this.original(scope, input, digest);
          await this.currentTerms(scope, input, original.terms, input.proposedTerms, digest);
          validateProposalPrice(input.proposedTerms, input.priceBreakdown, this.store.schema);
          await this.costs(scope, input.priceBreakdown, input.targetScope.enterpriseRef, digest);
          await this.agreement.basis.person(
            scope,
            context.actorAccountRef!,
            context.verifiedPersonRef,
            {
              epoch: await this.store.currentEpoch(),
              targetEnterpriseRef: input.targetScope.enterpriseRef,
              approvalDigest: digest,
            },
          );
          await this.agreement.basis.evidence(
            scope,
            input.agreementEvidenceRefs,
            this.agreement.basis.registration.agreementPurpose,
            context.actorAccountRef!,
            input.targetScope.enterpriseRef,
            undefined,
            {
              epoch: await this.store.currentEpoch(),
              targetEnterpriseRef: input.targetScope.enterpriseRef,
              approvalDigest: digest,
            },
          );
          const previous = input.supersedesRef
            ? await this.currentProposal(scope, input.supersedesRef)
            : null;
          if (previous) {
            this.content(previous);
            requireCondition(
              previous.result === 'OPEN' &&
                exact(previous.targetScope, input.targetScope) &&
                exact(previous.targetOrderRef, input.targetOrderRef) &&
                exact(previous.targetEntitlementRef, input.targetEntitlementRef) &&
                exact(previous.targetRenewalCycleRef, input.targetRenewalCycleRef) &&
                exact(previous.originalTermsRef, input.originalTermsRef),
              409,
              'PROPOSAL_SUPERSESSION',
              '같은 원래 대상의 현재 열린 제안만 명시 대체할 수 있습니다.',
            );
          }
          const content: ProposalContent = {
            proposalRevision: previous ? Number(previous.proposalRevision) + 1 : 1,
            targetScope: input.targetScope,
            targetOrderRef: input.targetOrderRef,
            targetEntitlementRef: input.targetEntitlementRef,
            targetRenewalCycleRef: input.targetRenewalCycleRef,
            originalTerms: original.terms,
            proposedTerms: input.proposedTerms,
            originalPriceBreakdown: original.price,
            priceBreakdown: input.priceBreakdown,
            agreementEvidenceRefs: input.agreementEvidenceRefs,
          };
          const data: ModelData = {
            modelVersion: 2,
            proposalId: randomUUID(),
            enterpriseRef: input.targetScope.enterpriseRef,
            ...content,
            originalTermsRef: input.originalTermsRef,
            proposedTermsRef: input.proposedTermsRef,
            evidenceRefs: content.agreementEvidenceRefs,
            termsFingerprint: proposalTermsFingerprint(content, this.store.schema),
            supersedesRef: input.supersedesRef,
            result: 'OPEN',
            revision: 1,
          };
          delete data.agreementEvidenceRefs;
          await scope.transaction.put('CommercialProposal', data);
          const written = [ref('CommercialProposal', data)];
          if (previous) {
            const next = {
              ...previous,
              result: 'SUPERSEDED',
              revision: Number(previous.revision) + 1,
            };
            await scope.transaction.put('CommercialProposal', next, Number(previous.revision));
            written.push(ref('CommercialProposal', next));
          }
          const again = await this.original(scope, input, digest);
          confirmed(exact(original.terms, again.terms) && exact(original.price, again.price));
          await this.ingress(context, ingressProof);
          return {
            target: written[0]!,
            refs: written,
            state: 'RESULT_RECORDED',
            before: input.supersedesRef,
          };
        },
      ),
    );
  }
  async recordConsent(context: ServiceContext, input: U3ConsentInput): Promise<Receipt> {
    return this.budget(context, () =>
      this.commands.run(
        context,
        'CommercialAgreement',
        'recordConsent',
        { kind: 'RECORD', recordRef: input.proposalRef },
        input,
        { scope: input.targetScope },
        async (scope) => {
          const proposal = await this.currentProposal(scope, input.proposalRef),
            content = this.content(proposal);
          requireCondition(
            exact(proposal.enterpriseRef, input.targetScope.enterpriseRef) &&
              exact(content.targetScope, input.targetScope),
            404,
            'NOT_FOUND',
            '해당 기업·조직의 제안을 확인할 수 없습니다.',
          );
          requireCondition(
            proposal.result === 'OPEN' &&
              proposal.proposalRevision === input.proposalRevision &&
              proposal.termsFingerprint === input.termsFingerprint,
            409,
            'PROPOSAL_PRESENTATION_CHANGED',
            '현재 열린 제안의 정확한 내용 개정과 표시 조건을 확인해야 합니다.',
          );
          const digest = String(proposal.termsFingerprint),
            target: TargetData = { ...content, originalTermsRef: proposal.originalTermsRef as Ref };
          const original = await this.original(scope, target, digest);
          confirmed(
            exact(original.terms, content.originalTerms) &&
              exact(original.price, content.originalPriceBreakdown),
          );
          await this.currentTerms(
            scope,
            target,
            content.originalTerms,
            content.proposedTerms,
            digest,
          );
          await this.costs(scope, content.priceBreakdown, input.targetScope.enterpriseRef, digest);
          await this.proposalEvidence(scope, proposal, digest);
          const authority = await new AuthorizationFence(this.commands.authorization).capture(
            context,
            input.targetScope.enterpriseRef.id,
            scope.transaction,
          );
          const consent = {
            modelVersion: 2,
            consentId: randomUUID(),
            proposalRef: input.proposalRef,
            proposalRevision: input.proposalRevision,
            actorAccountRef: context.actorAccountRef,
            enterpriseRef: input.targetScope.enterpriseRef,
            decision: input.decision,
            evidenceRefs: refs([input.proposalRef, ...authority.sources]),
            occurredAt: this.now().toISOString(),
            revision: 1,
          };
          this.store.schema.validateUri(U3_PROFILE + '#/$defs/Refs', consent.evidenceRefs);
          await scope.transaction.put('CustomerConsent', consent);
          const next = {
            ...proposal,
            result: input.decision === 'ACCEPT' ? 'CONSENTED' : 'DECLINED',
            revision: Number(proposal.revision) + 1,
          };
          await scope.transaction.put('CommercialProposal', next, Number(proposal.revision));
          const again = await this.original(scope, target, digest);
          confirmed(exact(original.terms, again.terms) && exact(original.price, again.price));
          await this.proposalEvidence(scope, proposal, digest);
          return {
            target: ref('CommercialProposal', next),
            refs: [ref('CommercialProposal', next), ref('CustomerConsent', consent)],
            state: 'RESULT_RECORDED',
          };
        },
      ),
    );
  }
  async read(
    context: ServiceContext,
    input: U3ProposalQuery,
    ingressProof: unknown = null,
  ): Promise<unknown> {
    await this.ingress(context, ingressProof);
    return this.budget(context, () =>
      this.commands.read(
        context,
        'CommercialAgreement',
        'readProposal',
        input,
        { scope: input.targetScope },
        async () =>
          this.store.primary.transaction(async (manager) => {
            await manager.query(
              'SELECT commit_order FROM u1_commit_counter WHERE epoch=$1 FOR SHARE',
              [await this.store.currentEpoch()],
            );
            const scope = new U3Transaction(
                this.commands.repository,
                new ProtectedTransaction(manager, this.store.schema),
              ),
              proposal = await this.currentProposal(scope, input.targetRef);
            requireCondition(
              exact(proposal.enterpriseRef, input.targetScope.enterpriseRef) &&
                exact(proposal.targetScope, input.targetScope),
              404,
              'NOT_FOUND',
              '해당 기업·조직의 제안을 확인할 수 없습니다.',
            );
            const content = this.content(proposal);
            const consents = await this.agreement.basis.collection(scope, 'CustomerConsent', {
              proposalRef: { id: input.targetRef.id },
            });
            for (const consent of consents) {
              const original = await this.historical(consent.proposalRef as Ref);
              confirmed(
                original.proposalRevision === consent.proposalRevision &&
                  exact(original.enterpriseRef, consent.enterpriseRef) &&
                  original.termsFingerprint === proposal.termsFingerprint,
              );
            }
            const applications = await this.agreement.basis.collection(
              scope,
              'OrderChangeApplication',
              { proposalRef: { id: input.targetRef.id }, actualApplicationResult: 'APPLIED' },
            );
            for (const application of applications) {
              confirmed(
                content.targetOrderRef &&
                  (application.orderRef as Ref).id === content.targetOrderRef.id,
              );
              const currentOrder = await this.store.currentProtected(
                'Order',
                (application.orderRef as Ref).id,
              );
              confirmed(currentOrder);
              const current = await currentOrderTerms(
                scope,
                u3Ref('Order', currentOrder!, this.store.schema),
                this.agreement.basis,
              );
              confirmed(
                (current.order.changeApplicationRefs as Ref[]).some((reference) =>
                  exact(reference, u3Ref('OrderChangeApplication', application, this.store.schema)),
                ) && exact(application.proposalRef, input.targetRef),
              );
            }
            const states: Record<string, U3ProposalView['state']> = {
              OPEN: 'AWAITING_CONSENT',
              CONSENTED: 'ACCEPTED',
              DECLINED: 'DECLINED',
              SUPERSEDED: 'STALE',
              CONFIRMATION_REQUIRED: 'UNVERIFIED',
            };
            confirmed(states[String(proposal.result)]);
            const data: U3ProposalView = {
              ...content,
              proposalRef: input.targetRef,
              termsFingerprint: String(proposal.termsFingerprint),
              consentRefs: consents.map((value) => ref('CustomerConsent', value)),
              state: applications.length ? 'APPLIED' : states[String(proposal.result)]!,
              applicationRefs: applications.map((application) =>
                u3Ref('OrderChangeApplication', application, this.store.schema),
              ),
            };
            await scope.assertPremises();
            await this.ingress(context, ingressProof);
            return {
              knowledge: 'KNOWN',
              data,
              sourceRefs: refs([
                input.targetRef,
                ...data.consentRefs,
                ...data.applicationRefs!,
                proposal.originalTermsRef as Ref,
                proposal.proposedTermsRef as Ref,
              ]),
              observedAt: this.now().toISOString(),
            };
          }),
      ),
    );
  }
}
