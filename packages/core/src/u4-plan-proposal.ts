import { randomUUID } from 'node:crypto';
import { canonicalJson, fingerprint, requireCondition, U4_PROFILE } from '@oms/contracts';
import type {
  Receipt,
  Ref,
  ServiceContext,
  TargetScope,
  U3ConsentInput,
  U3OrderPriceBreakdown,
  U3ProposalTerms,
  U4AgreedPaymentPlan,
  U4AppliedTerms,
  U4ApplyPlanInput,
  U4CapturedLine,
  U4PlanProposalInput,
} from '@oms/contracts';
import type { ModelData, U4Transaction } from '@oms/persistence';
import { U4CommercialAdapter, recordedU4CommercialOperation } from './u4-commercial-adapter.js';
import { U4CommercialOrder } from './u4-commercial-order.js';
import { currentU4ProposalProof, u4ProposalFingerprint } from './u4-proposal-proof.js';
import { historicalU4 } from './u4-order-terms.js';
import { paymentPlanMode } from './u4-payment-plan.js';
import { Authorization } from './authorization.js';
import { AuthorizationFence } from './authorization-fence.js';
import { CommercialProposal } from './commercial-proposal.js';
import { U3AfterSalesSource } from './u3-after-sales-source.js';
import type { U3AfterSalesRegistration } from './u3-after-sales-source.js';
import { u3Ref, u4Ref } from './references.js';
import { validateProposalPrice } from './proposal-terms.js';
const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const check = (value: unknown) =>
  requireCondition(
    value,
    409,
    'U4_PROPOSAL_CHANGED',
    '정확한 현재 주문·승인 계획·제안·고객 동의의 같은 개정이 필요합니다.',
  );
const unique = (values: Ref[]) => [
  ...new Map(values.map((value) => [canonicalJson(value), value])).values(),
];

export class U4PlanProposal {
  readonly afterSales: U3AfterSalesSource;
  readonly orders: U4CommercialOrder;
  constructor(
    readonly adapter: U4CommercialAdapter,
    afterSales?: U3AfterSalesRegistration,
  ) {
    this.orders = new U4CommercialOrder(adapter);
    this.afterSales = new U3AfterSalesSource(adapter.store, adapter.now, afterSales);
  }
  private async proposed(
    scope: U4Transaction,
    data: ModelData,
    current: Awaited<ReturnType<U4CommercialOrder['current']>>,
  ) {
    const terms = data.proposedTerms as U3ProposalTerms;
    const target = data.targetScope as TargetScope;
    const plan = data.paymentPlan as U4AgreedPaymentPlan;
    const approved = await this.orders.plans.current(
      scope,
      plan.agreementRevisionRef,
      (data.priceBreakdown as U3OrderPriceBreakdown).total!,
    );
    check(
      exact(approved, plan) &&
        exact(data.targetOrderRef, u4Ref('Order', current.order, this.adapter.store.schema)) &&
        exact(data.originalTerms, current.terms) &&
        exact(data.originalPriceBreakdown, current.price) &&
        exact(data.originalTermsRef, current.reference) &&
        exact(target, current.order.targetScope) &&
        exact(data.proposedTermsRef, terms.termsRecordRef) &&
        exact(data.proposedTermsRef, plan.agreementRevisionRef) &&
        terms.lines.length === current.captured.length &&
        ['REVIEW', 'ACCEPTED'].includes(String(current.order.state)),
    );
    validateProposalPrice(
      terms,
      data.priceBreakdown as U3OrderPriceBreakdown,
      this.adapter.store.schema,
    );
    const captured: U4CapturedLine[] = [];
    for (const [index, line] of terms.lines.entries()) {
      const before = current.captured[index]!;
      check(
        exact(line.productRef, before.productRef) &&
          line.quantity === before.quantity &&
          exact(line.period, before.agreedPeriod),
      );
      const product = await scope.current(line.productRef);
      check(product.currentOfferRef);
      const source = await this.orders.catalog(scope, target, {
        productRef: line.productRef,
        quantity: line.quantity,
        commonOfferRevisionRef: product.currentOfferRef as Ref,
        agreementRevisionRefs: [],
        conditionBindings: [],
        requestedActivationDate: before.requestedActivationDate,
      });
      const price = source.bindings.find((binding) => binding.conditionKey === 'PRICE');
      const payment = source.bindings.find((binding) => binding.conditionKey === 'PAYMENT');
      const period = source.bindings.find((binding) => binding.conditionKey === 'PERIOD');
      const completion = source.bindings.find((binding) => binding.conditionKey === 'COMPLETION');
      check(
        price &&
          payment?.conditionKey === 'PAYMENT' &&
          completion &&
          exact(price.value, line.price) &&
          exact(period?.value ?? null, line.period) &&
          payment.value.mode === paymentPlanMode(plan) &&
          source.agreementRefs.some((value) => exact(value, plan.agreementRevisionRef)) &&
          exact(
            unique(source.bindings.map((binding) => binding.sourceRef))
              .map(canonicalJson)
              .sort(),
            line.conditionRefs.map(canonicalJson).sort(),
          ) &&
          exact(completion.value, before.completionBasisRef) &&
          exact(
            source.bindings.find((binding) => binding.conditionKey === 'PROVISION')?.value,
            before.conditionBindings.find((binding) => binding.conditionKey === 'PROVISION')?.value,
          ),
      );
      captured.push({
        productRef: line.productRef,
        quantity: line.quantity,
        commonOfferRevisionRef: product.currentOfferRef as Ref,
        agreementRevisionRefs: source.agreementRefs,
        conditionBindings: source.bindings,
        requestedActivationDate: before.requestedActivationDate,
        paymentMode: paymentPlanMode(plan),
        paymentTermsRef: (payment!.value as { termsRef: Ref }).termsRef,
        purchasePrice: line.price,
        priceKnowledge: 'KNOWN',
        agreedPeriod: line.period,
        completionBasisRef: completion!.value as Ref,
      });
    }
    const basis = this.adapter.basis(scope);
    const evidence = data.evidenceRefs as Ref[];
    check(evidence.length > 0);
    const proof = {
      epoch: await scope.readSource().currentEpoch(),
      targetEnterpriseRef: target.enterpriseRef,
      approvalDigest: String(data.termsFingerprint),
    };
    // 새 제안의 비용도 직원 원본/현재 권위를 확인하며 KNOWN 입력만 신뢰하지 않는다.
    for (const item of (data.priceBreakdown as U3OrderPriceBreakdown).adjustments) {
      check(item.confirmedByRef && item.knowledge === 'KNOWN');
      await new Authorization(
        this.adapter.store,
        this.adapter.now,
        scope.readSource(),
      ).requireStaffSource(item.confirmedByRef!, 'contract.propose', scope.transaction);
      await basis.evidence(
        scope,
        item.evidenceRefs,
        basis.registration.agreementPurpose,
        item.confirmedByRef!,
        target.enterpriseRef,
        undefined,
        proof,
      );
    }
    return captured;
  }
  async create(
    context: ServiceContext,
    input: U4PlanProposalInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    return this.adapter.run(
      context,
      'CommercialAgreement',
      'createPaymentPlanProposal',
      { kind: 'NONE' },
      input,
      { scope: input.targetScope, enterpriseRef: input.targetScope.enterpriseRef },
      ingressProof,
      async (scope) => {
        check(input.meta.expectedRevision === null);
        const current = await this.orders.current(scope, input.targetOrderRef);
        const plan = await this.orders.plans.current(
          scope,
          input.paymentPlanRef,
          input.priceBreakdown.total!,
        );
        const previous = input.supersedesRef ? await scope.current(input.supersedesRef) : null;
        if (previous) {
          await currentU4ProposalProof(this.adapter, scope, previous);
          check(
            previous.result === 'OPEN' &&
              exact(previous.targetOrderRef, input.targetOrderRef) &&
              exact(previous.targetScope, input.targetScope) &&
              exact(previous.originalTermsRef, input.originalTermsRef),
          );
        }
        const data: ModelData = {
          modelVersion: 3,
          proposalId: randomUUID(),
          enterpriseRef: input.targetScope.enterpriseRef,
          targetScope: input.targetScope,
          targetOrderRef: input.targetOrderRef,
          targetEntitlementRef: null,
          targetRenewalCycleRef: null,
          originalTermsRef: input.originalTermsRef,
          proposedTermsRef: input.proposedTermsRef,
          originalTerms: current.terms,
          proposedTerms: input.proposedTerms,
          originalPriceBreakdown: current.price,
          priceBreakdown: input.priceBreakdown,
          evidenceRefs: input.agreementEvidenceRefs,
          supersedesRef: input.supersedesRef,
          proposalRevision: previous ? Number(previous.proposalRevision) + 1 : 1,
          result: 'OPEN',
          revision: 1,
          paymentPlan: plan,
        };
        data.termsFingerprint = u4ProposalFingerprint(data, this.adapter);
        await this.proposed(scope, data, current);
        const basis = this.adapter.basis(scope),
          proof = {
            epoch: await scope.readSource().currentEpoch(),
            targetEnterpriseRef: input.targetScope.enterpriseRef,
            approvalDigest: String(data.termsFingerprint),
          };
        await basis.person(scope, context.actorAccountRef!, context.verifiedPersonRef, proof);
        await basis.evidence(
          scope,
          input.agreementEvidenceRefs,
          basis.registration.agreementPurpose,
          context.actorAccountRef!,
          input.targetScope.enterpriseRef,
          undefined,
          proof,
        );
        await scope.transaction.put('CommercialProposal', data);
        const refs = [u4Ref('CommercialProposal', data, this.adapter.store.schema)];
        if (previous) {
          const after = {
            ...previous,
            result: 'SUPERSEDED',
            revision: Number(previous.revision) + 1,
          };
          await scope.transaction.put('CommercialProposal', after, Number(previous.revision));
          refs.push(u4Ref('CommercialProposal', after, this.adapter.store.schema));
        }
        return { target: refs[0]!, refs, before: input.supersedesRef };
      },
    );
  }
  async consent(context: ServiceContext, input: U3ConsentInput): Promise<Receipt> {
    return this.adapter.run(
      context,
      'CommercialAgreement',
      'recordPaymentPlanConsent',
      { kind: 'RECORD', recordRef: input.proposalRef },
      input,
      { scope: input.targetScope, enterpriseRef: input.targetScope.enterpriseRef },
      null,
      async (scope) => {
        const proposal = await scope.current(input.proposalRef);
        check(
          proposal.modelVersion === 3 &&
            proposal.result === 'OPEN' &&
            proposal.proposalRevision === input.proposalRevision &&
            proposal.termsFingerprint === input.termsFingerprint &&
            exact(proposal.targetScope, input.targetScope),
        );
        await currentU4ProposalProof(this.adapter, scope, proposal);
        const current = await this.orders.current(scope, proposal.targetOrderRef as Ref);
        await this.proposed(scope, proposal, current);
        const auth = new Authorization(this.adapter.store, this.adapter.now, scope.readSource());
        const fence = await new AuthorizationFence(auth).capture(
          context,
          input.targetScope.enterpriseRef.id,
          scope.transaction,
        );
        const consent: ModelData = {
          modelVersion: 2,
          consentId: randomUUID(),
          proposalRef: input.proposalRef,
          proposalRevision: input.proposalRevision,
          actorAccountRef: context.actorAccountRef,
          enterpriseRef: input.targetScope.enterpriseRef,
          decision: input.decision,
          evidenceRefs: unique([input.proposalRef, ...fence.sources]),
          occurredAt: this.adapter.now().toISOString(),
          revision: 1,
        };
        await scope.transaction.put('CustomerConsent', consent);
        const after = {
          ...proposal,
          result: input.decision === 'ACCEPT' ? 'CONSENTED' : 'DECLINED',
          revision: input.proposalRef.revision + 1,
        };
        await scope.transaction.put('CommercialProposal', after, input.proposalRef.revision);
        return {
          target: u4Ref('CommercialProposal', after, this.adapter.store.schema),
          refs: [
            u4Ref('CommercialProposal', after, this.adapter.store.schema),
            u3Ref('CustomerConsent', consent, this.adapter.store.schema),
          ],
        };
      },
    );
  }
  private async consentSource(
    scope: U4Transaction,
    consentRef: Ref,
    current: Awaited<ReturnType<U4CommercialOrder['current']>>,
    newTermsRef: Ref,
  ) {
    const consent = await scope.current(consentRef);
    check(consent.modelVersion === 2 && consent.decision === 'ACCEPT');
    const displayedRef = consent.proposalRef as Ref;
    const displayed = await historicalU4(this.adapter, scope, displayedRef);
    const proposalRef = { ...displayedRef, revision: displayedRef.revision + 1 };
    const proposal = await scope.current(proposalRef);
    check(
      proposal.result === 'CONSENTED' &&
        displayed.result === 'OPEN' &&
        proposal.proposalRevision === consent.proposalRevision &&
        proposal.termsFingerprint === displayed.termsFingerprint &&
        exact(proposal.paymentPlan, displayed.paymentPlan) &&
        exact(proposal.enterpriseRef, consent.enterpriseRef) &&
        exact(proposal.proposedTermsRef, newTermsRef),
    );
    await currentU4ProposalProof(this.adapter, scope, proposal);
    const recorded = await recordedU4CommercialOperation(this.adapter, scope, {
      owner: 'CommercialAgreement',
      operation: 'recordPaymentPlanConsent',
      beforeRef: displayedRef,
      afterRef: proposalRef,
      resultRef: consentRef,
      target: { kind: 'RECORD', recordRef: displayedRef },
      targetScope: proposal.targetScope as TargetScope,
      audience: 'CUSTOMER',
    });
    check(
      exact(recorded.history.actorAccountRef, consent.actorAccountRef) &&
        Date.parse(String(consent.occurredAt)) <= Date.parse(String(recorded.history.occurredAt)),
    );
    const original: U3ConsentInput = {
      meta: {
        clientRequestId: String(recorded.receipt.idempotencyKey),
        expectedRevision: displayedRef.revision,
        reason: String(recorded.history.reason),
        evidenceRefs: recorded.history.evidenceRefs as Ref[],
      },
      targetScope: proposal.targetScope as TargetScope,
      proposalRef: displayedRef,
      proposalRevision: Number(proposal.proposalRevision),
      termsFingerprint: String(proposal.termsFingerprint),
      decision: 'ACCEPT',
    };
    this.adapter.store.schema.validateUri(U4_PROFILE + '#/$defs/PlanConsentInput', original);
    check(recorded.receipt.requestFingerprint === fingerprint(original));
    await new CommercialProposal(
      this.adapter.store,
      this.adapter.now,
      this.adapter.staffIngress,
      this.adapter.registration,
    ).currentConsentAuthority(
      this.adapter.consentAuthorityScope(scope),
      consent,
      proposal.targetScope as TargetScope,
      scope.readSource(),
    );
    const captured = await this.proposed(scope, proposal, current);
    return { consent, proposal, proposalRef, captured };
  }
  async apply(
    context: ServiceContext,
    input: U4ApplyPlanInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    return this.adapter.run(
      context,
      'OrderAcceptance',
      'applyPaymentPlanChange',
      { kind: 'RECORD', recordRef: input.orderRef },
      input,
      { scope: input.targetScope, enterpriseRef: input.targetScope.enterpriseRef },
      ingressProof,
      async (scope) => {
        const current = await this.orders.current(scope, input.orderRef);
        check(
          exact(current.order.targetScope, input.targetScope) &&
            (input.changeKind === 'REVIEW_PAYMENT_PLAN_CHANGE'
              ? current.order.state === 'REVIEW' && input.afterSalesDecisionRef === null
              : current.order.state === 'ACCEPTED' && input.afterSalesDecisionRef !== null),
        );
        const used = await this.adapter.basis(scope).collection(scope, 'OrderChangeApplication', {
          consentRef: { id: input.customerConsentRef.id },
          actualApplicationResult: 'APPLIED',
        });
        requireCondition(
          used.length === 0,
          409,
          'CONSENT_ALREADY_APPLIED',
          '같은 고객 동의를 두 번 적용할 수 없습니다.',
        );
        const source = await this.consentSource(
          scope,
          input.customerConsentRef,
          current,
          input.newTermsRef,
        );
        const request = input.afterSalesDecisionRef
          ? {
              decisionRef: input.afterSalesDecisionRef,
              orderRef: input.orderRef,
              proposalRef: source.proposalRef,
              proposalRevision: Number(source.proposal.proposalRevision),
              termsFingerprint: String(source.proposal.termsFingerprint),
              consentRef: input.customerConsentRef,
              newTermsRef: input.newTermsRef,
              targetScope: input.targetScope,
              epoch: await scope.readSource().currentEpoch(),
              applicationDigest: fingerprint(input),
            }
          : null;
        const observation = request
          ? await this.afterSales.current(request, scope.readSource())
          : null;
        const appliedTerms: U4AppliedTerms = {
          terms: source.proposal.proposedTerms as U3ProposalTerms,
          capturedLines: source.captured,
          priceBreakdown: source.proposal.priceBreakdown as U3OrderPriceBreakdown,
          targetScope: input.targetScope,
          proposalRevision: Number(source.proposal.proposalRevision),
          termsFingerprint: String(source.proposal.termsFingerprint),
        };
        const plan = {
          ...(source.proposal.paymentPlan as U4AgreedPaymentPlan),
          customerConsentRef: input.customerConsentRef,
        };
        const application: ModelData = {
          modelVersion: 3,
          orderChangeApplicationId: randomUUID(),
          orderRef: input.orderRef,
          afterSalesDecisionRef: input.afterSalesDecisionRef,
          consentRef: input.customerConsentRef,
          previousTermsRef: current.reference,
          changedTermsRef: input.newTermsRef,
          actualApplicationResult: 'APPLIED',
          expectedOrderRevision: input.orderRef.revision,
          proposalRef: source.proposalRef,
          changeKind: input.changeKind,
          revision: 1,
          appliedTerms,
          paymentPlan: plan,
        };
        // 이전 주문 개정이 정확한 동안 원본을 한 번 더 확인한 뒤 동일 트랜잭션으로 적용한다.
        const again = await this.consentSource(
          scope,
          input.customerConsentRef,
          current,
          input.newTermsRef,
        );
        check(
          exact(
            [source.proposal, source.consent, source.captured],
            [again.proposal, again.consent, again.captured],
          ),
        );
        if (request) {
          const observed = await this.afterSales.current(request, scope.readSource());
          check(
            exact(
              [observed.binding, observed.facts],
              [
                observation!.binding,
                { ...observation!.facts, observedAt: observed.facts.observedAt },
              ],
            ),
          );
        }
        await scope.transaction.put('OrderChangeApplication', application);
        const applicationRef = u4Ref(
          'OrderChangeApplication',
          application,
          this.adapter.store.schema,
        );
        const after = {
          ...current.order,
          paymentPlan: plan,
          paymentKind: paymentPlanMode(plan),
          changeApplicationRefs: [
            ...(current.order.changeApplicationRefs as Ref[]),
            applicationRef,
          ],
          revision: input.orderRef.revision + 1,
        };
        await scope.transaction.put('Order', after, input.orderRef.revision);
        const target = u4Ref('Order', after, this.adapter.store.schema);
        return { target, refs: [target, applicationRef] };
      },
    );
  }
}
