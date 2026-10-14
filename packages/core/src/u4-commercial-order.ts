import { randomUUID } from 'node:crypto';
import { canonicalJson, fingerprint, OmsError, requireCondition, U4_PROFILE } from '@oms/contracts';
import type {
  ConditionBinding,
  EffectiveWindow,
  Money,
  Receipt,
  Ref,
  ServiceContext,
  TargetScope,
  U3ProposalTerms,
  U4CapturedLine,
  U4ConditionBinding,
  U4OrderInput,
  U4OrderLineInput,
  U3OrderDecisionInput,
} from '@oms/contracts';
import type { Assessment } from './order-assessment.js';
import type { ModelData, U4Transaction } from '@oms/persistence';
import { U4CommercialAdapter } from './u4-commercial-adapter.js';
import { U4PaymentPlan, paymentPlanMode } from './u4-payment-plan.js';
import { Authorization } from './authorization.js';
import { ref, u3Ref, u4Ref } from './references.js';
import { currentU4OrderTerms } from './u4-order-terms.js';
import { U4OrderReadiness } from './u3-order-readiness.js';
import type {
  U4ReadinessRequest,
  U4ReadinessRegistration,
  U4ReadinessObservation,
} from './u3-order-readiness.js';
import { currentU4ProposalProof } from './u4-proposal-proof.js';
import { CommercialProposal } from './commercial-proposal.js';
import { withinEffectiveWindow } from './catalog-conditions.js';
import { resolveConditionBindings } from './commercial-terms.js';
import { confirmedOrderPrice } from './order-price.js';
import { U3RenewalSource } from './u3-renewal-source.js';
import type { U3RenewalRegistration } from './u3-renewal-source.js';

const exact = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const uniqueRefs = (refs: Ref[]) => [
  ...new Map(refs.map((reference) => [canonicalJson(reference), reference])).values(),
];
const confirmed = (value: unknown) =>
  requireCondition(
    value,
    503,
    'U4_ORDER_UNCONFIRMED',
    '현재 계약·전체 주문 스냅샷·승인 계획을 확인해야 합니다.',
  );
export class U4CommercialOrder {
  readonly plans: U4PaymentPlan;
  readonly renewal: U3RenewalSource;
  readonly readiness: U4OrderReadiness;
  constructor(
    readonly adapter: U4CommercialAdapter,
    renewal?: U3RenewalRegistration,
    readiness: U4ReadinessRegistration[] = [],
  ) {
    this.plans = new U4PaymentPlan(adapter);
    this.renewal = new U3RenewalSource(adapter.store, adapter.now, renewal);
    this.readiness = new U4OrderReadiness(adapter.store, adapter.now, readiness);
  }
  current(scope: U4Transaction, reference: Ref) {
    return currentU4OrderTerms(this.adapter, scope, reference);
  }
  async commercial(
    scope: U4Transaction,
    current: Awaited<ReturnType<U4CommercialOrder['current']>>,
  ) {
    const target = current.order.targetScope as TargetScope;
    const approved = await this.plans.current(
      scope,
      current.plan.agreementRevisionRef,
      current.price.total!,
    );
    confirmed(exact(approved, { ...current.plan, customerConsentRef: null }));
    const catalog = await this.catalogLines(scope, target, current.captured);
    for (const [index, line] of current.captured.entries()) {
      const source = catalog[index]!;
      confirmed(
        exact(source.bindings, line.conditionBindings) &&
          exact(
            source.agreementRefs.map(canonicalJson).sort(),
            line.agreementRevisionRefs.map(canonicalJson).sort(),
          ),
      );
    }
    if (current.application) {
      const proposal = await scope.current(current.application.proposalRef as Ref);
      await currentU4ProposalProof(this.adapter, scope, proposal);
      const consent = await scope.current(current.application.consentRef as Ref);
      await new CommercialProposal(
        this.adapter.store,
        this.adapter.now,
        this.adapter.staffIngress,
        this.adapter.registration,
      ).currentConsentAuthority(
        this.adapter.consentAuthorityScope(scope),
        consent,
        target,
        scope.readSource(),
      );
    } else {
      confirmed(current.snapshot.priceConfirmation);
      const price = await confirmedOrderPrice(
        scope,
        current.terms,
        current.snapshot.priceConfirmation as import('@oms/contracts').U3PriceConfirmation,
        target.enterpriseRef,
        await scope.readSource().currentEpoch(),
        String(current.receipt.requestFingerprint),
        this.adapter.basis(scope),
        new Authorization(this.adapter.store, this.adapter.now, scope.readSource()),
      );
      confirmed(exact(price, current.price));
    }
  }
  async decide(
    context: ServiceContext,
    input: U3OrderDecisionInput,
    proof: unknown = null,
  ): Promise<Receipt> {
    return this.adapter.run(
      context,
      'OrderAcceptance',
      'decidePlannedOrder',
      { kind: 'RECORD', recordRef: input.targetRef },
      input,
      { scope: input.targetScope, enterpriseRef: input.targetScope.enterpriseRef },
      proof,
      async (scope) => {
        const current = await this.current(scope, input.targetRef);
        const order = current.order;
        requireCondition(
          exact(order.targetScope, input.targetScope),
          404,
          'NOT_FOUND',
          '해당 기업·조직 주문만 판단합니다.',
        );
        requireCondition(
          order.state === 'REVIEW',
          409,
          'ORDER_ALREADY_DECIDED',
          '이미 확정한 전체 수락·거절을 덮어쓸 수 없습니다.',
        );
        requireCondition(
          input.decision !== 'REJECT' || input.basisRefs.length > 0,
          400,
          'ORDER_DECISION_REASON',
          '거절의 확인 근거가 필요합니다.',
        );
        const request: U4ReadinessRequest = {
          orderRef: input.targetRef,
          purchaseTermsRef: order.purchaseTermsRef as Ref,
          currentTermsRef: current.reference,
          enterpriseRef: input.targetScope.enterpriseRef,
          targetScope: input.targetScope,
          productType: order.productType as 'HARDWARE' | 'SOFTWARE',
          paymentKind: order.paymentKind as U4ReadinessRequest['paymentKind'],
          provisionChoice: 'FULL',
          priceBreakdown: current.price,
          paymentPlan: current.plan,
          assessmentPurpose: 'SALE_ACCEPTANCE',
          lines: current.captured.map((line, index) => ({
            ...line,
            lineRef: (order.lineRefs as Ref[])[index]!,
          })),
          epoch: await scope.readSource().currentEpoch(),
          decisionDigest: fingerprint(input),
        };
        const basis = this.adapter.basis(scope);
        if (input.basisRefs.length)
          await basis.evidence(
            scope,
            input.basisRefs,
            basis.registration.agreementPurpose,
            context.actorAccountRef!,
            input.targetScope.enterpriseRef,
            undefined,
            {
              epoch: request.epoch,
              targetEnterpriseRef: input.targetScope.enterpriseRef,
              approvalDigest: request.decisionDigest,
            },
          );
        const unknown = (owner: string, code: string): Assessment => ({
          sourceOwner: owner as Assessment['sourceOwner'],
          knowledge: 'UNKNOWN',
          reasonKind: 'UNVERIFIED',
          reasonCode: code,
          observedAt: this.adapter.now().toISOString(),
          sourceRevision: null,
          basisRefs: [],
        });
        const unresolved = (error: unknown) =>
          error instanceof OmsError &&
          [
            'U4_PLAN_UNCONFIRMED',
            'U4_ORDER_UNCONFIRMED',
            'ORDER_PRICE_UNCONFIRMED',
            'ORDER_READINESS_UNCONFIRMED',
            'U3_PROOF_UNCONFIRMED',
            'STALE_REVISION',
            'ACTION_DENIED',
            'STAFF_REQUIRED',
            'NOT_FOUND',
          ].includes(error.code);
        let commercial = unknown('CommercialAgreement', 'U4_PLAN_UNCONFIRMED');
        try {
          await this.commercial(scope, current);
          commercial = {
            sourceOwner: 'CommercialAgreement',
            knowledge: 'KNOWN',
            reasonKind: 'SPECIAL_CONDITION',
            reasonCode: 'CURRENT_APPROVED_PAYMENT_PLAN',
            observedAt: this.adapter.now().toISOString(),
            sourceRevision: current.reference.revision,
            basisRefs: [current.reference, current.plan.agreementRevisionRef],
          };
        } catch (error) {
          if (!unresolved(error)) throw error;
          commercial.reasonCode = (error as OmsError).code;
        }
        const owners = [
          'FinancialSettlement',
          request.productType === 'HARDWARE' ? 'HardwareFulfillment' : 'SoftwareLifecycle',
        ] as const;
        const observations: (U4ReadinessObservation | null)[] = [];
        for (const owner of owners) {
          try {
            observations.push(await this.readiness.current(owner, request, scope.readSource()));
          } catch (error) {
            if (!unresolved(error)) throw error;
            observations.push(null);
          }
        }
        const lineAssessments = request.lines.map((line, index) => ({
          lineRef: line.lineRef,
          assessments: [
            commercial,
            ...owners.map((owner, ownerIndex): Assessment => {
              const observation = observations[ownerIndex];
              const ready = observation?.lines[index];
              const mismatch =
                owner === 'SoftwareLifecycle' &&
                line.requestedActivationDate !== null &&
                line.agreedPeriod !== null &&
                line.requestedActivationDate !== line.agreedPeriod.startDate;
              return observation?.knowledge === 'KNOWN' &&
                ready?.knowledge === 'KNOWN' &&
                ready.readyQuantity === line.quantity &&
                (!mismatch || ready.activationResolution === 'CONFIRMED')
                ? {
                    sourceOwner: owner,
                    knowledge: 'KNOWN',
                    reasonKind: 'SPECIAL_CONDITION',
                    reasonCode: 'OWNER_READY_FOR_ACCEPTANCE',
                    observedAt: observation.observedAt,
                    sourceRevision: observation.sourceRef.revision,
                    basisRefs: observation.sourceRefs,
                  }
                : unknown(owner, 'ORDER_OWNER_NOT_READY');
            }),
          ],
        }));
        const decision =
          input.decision === 'ACCEPT' &&
          lineAssessments.some((line) =>
            line.assessments.some((assessment) => assessment.knowledge !== 'KNOWN'),
          )
            ? 'HOLD'
            : input.decision;
        if (decision === 'ACCEPT') {
          await this.commercial(scope, current);
          for (const [index, owner] of owners.entries()) {
            const again = await this.readiness.current(owner, request, scope.readSource());
            const before = observations[index]!;
            requireCondition(
              exact(
                [again.binding, again.knowledge, again.sourceRef, again.sourceRefs, again.lines],
                [
                  before.binding,
                  before.knowledge,
                  before.sourceRef,
                  before.sourceRefs,
                  before.lines,
                ],
              ),
              409,
              'ORDER_READINESS_CHANGED',
              '수락 직전의 정확한 준비 개정과 전체 수량이 필요합니다.',
            );
          }
        }
        const record = {
          modelVersion: 2,
          decisionId: randomUUID(),
          orderRef: input.targetRef,
          acceptance:
            decision === 'ACCEPT'
              ? 'ACCEPTED'
              : decision === 'REJECT'
                ? 'DECLINED'
                : 'REVIEW_REQUIRED',
          lineAssessments,
          basisRefs: input.basisRefs,
          evaluatedAt: this.adapter.now().toISOString(),
          assessedSourceRevisions: [
            commercial,
            ...observations
              .filter((value) => value !== null)
              .map((value) => ({
                sourceOwner: value.binding.owner,
                sourceRevision: value.sourceRef.revision,
              })),
          ]
            .filter((value) => value.sourceRevision !== null)
            .map((value) => ({
              sourceOwner: value.sourceOwner,
              sourceRevision: value.sourceRevision,
            })),
          actorRef: context.actorAccountRef,
          observedOrderRevision: input.targetRef.revision,
          decision,
          revision: 1,
        };
        await scope.transaction.put('AcceptanceDecision', record);
        const decisionRef = u3Ref('AcceptanceDecision', record, this.adapter.store.schema);
        const after = {
          ...order,
          state: decision === 'ACCEPT' ? 'ACCEPTED' : decision === 'REJECT' ? 'REJECTED' : 'REVIEW',
          acceptanceRef: decisionRef,
          revision: input.targetRef.revision + 1,
        };
        await scope.transaction.put('Order', after, input.targetRef.revision);
        const target = u4Ref('Order', after, this.adapter.store.schema);
        return {
          target,
          refs: [target, decisionRef],
          state: decision === 'HOLD' ? 'REVIEW_REQUIRED' : 'RESULT_RECORDED',
        };
      },
    );
  }
  async catalog(scope: U4Transaction, target: TargetScope, line: U4OrderLineInput) {
    const product = await scope.current(line.productRef);
    const offer = await scope.current(line.commonOfferRevisionRef);
    confirmed(
      product.modelVersion === 2 &&
        product.saleState === 'OFFERABLE' &&
        offer.modelVersion === 2 &&
        exact(product.currentOfferRef, line.commonOfferRevisionRef) &&
        exact(offer.productRef, line.productRef) &&
        withinEffectiveWindow(offer.effectiveWindow as EffectiveWindow, this.adapter.now()),
    );
    const agreements: ModelData[] = [];
    const basis = this.adapter.basis(scope);
    for (const contract of await basis.collection(scope, 'EnterpriseContract', {
      enterpriseRef: { id: target.enterpriseRef.id },
    }))
      for (const candidate of await basis.collection(scope, 'AgreementRevision', {
        contractRef: { id: contract.contractId },
      }))
        if (
          candidate.state === 'APPROVED' &&
          (candidate.productRefs as Ref[]).some((reference) => exact(reference, line.productRef)) &&
          withinEffectiveWindow(candidate.effectiveWindow as EffectiveWindow, this.adapter.now())
        )
          agreements.push(
            await this.plans.currentAgreement(scope, ref('AgreementRevision', candidate)),
          );
    const bindings = this.adapter.store.schema.validateUri<U4ConditionBinding[]>(
      U4_PROFILE + '#/$defs/ConditionBindings',
      resolveConditionBindings(
        offer.conditionBindings as ConditionBinding[],
        agreements,
        this.adapter.now(),
      ),
    );
    confirmed(
      ['PRICE', 'PAYMENT', 'PROVISION', 'COMPLETION', 'VISIBILITY'].every((key) =>
        bindings.some((binding) => binding.conditionKey === key),
      ),
    );
    requireCondition(
      bindings.find((binding) => binding.conditionKey === 'VISIBILITY')?.value === true,
      404,
      'NOT_FOUND',
      '해당 기업에 공개된 상품을 확인할 수 없습니다.',
    );
    for (const binding of bindings)
      for (const evidence of binding.evidenceRefs) await scope.current(evidence);
    return {
      product,
      bindings,
      agreementRefs: uniqueRefs(
        bindings
          .filter((binding) => binding.sourceRef.owner === 'CommercialAgreement')
          .map((binding) => binding.sourceRef),
      ),
    };
  }
  async catalogLines(
    scope: U4Transaction,
    target: TargetScope,
    lines: readonly U4OrderLineInput[],
  ) {
    // catalog가 읽는 입력은 전체 범위와 정확 상품/offer Ref다. 한 검증 호출 안에서만 재사용한다.
    // 수락 전/후 호출과 다른 요청에는 Map을 공유하지 않으며 최종 권한/원상 대조는 그대로 수행한다.
    const sources = new Map<string, Awaited<ReturnType<U4CommercialOrder['catalog']>>>();
    const result: Awaited<ReturnType<U4CommercialOrder['catalog']>>[] = [];
    for (const line of lines) {
      const key = canonicalJson([target, line.productRef, line.commonOfferRevisionRef]);
      let source = sources.get(key);
      if (!source) {
        source = await this.catalog(scope, target, line);
        sources.set(key, structuredClone(source));
      }
      // 줄별 처리에서 조건/근거 배열이 다른 줄이나 보관된 snapshot을 바꾸지 못하게 한다.
      result.push(structuredClone(source));
    }
    return result;
  }
  async submit(context: ServiceContext, input: U4OrderInput): Promise<Receipt> {
    return this.adapter.run(
      context,
      'OrderAcceptance',
      'submitPlannedOrder',
      { kind: 'NONE' },
      input,
      { scope: input.targetScope, enterpriseRef: input.targetScope.enterpriseRef },
      null,
      async (scope, requestId) => {
        requireCondition(
          input.meta.expectedRevision === null,
          400,
          'CREATE_REVISION',
          '새 주문의 예상 개정은 null이어야 합니다.',
        );
        const company = await scope.current(input.targetScope.enterpriseRef);
        confirmed(company.revision === input.targetScope.organisationRevision);
        const plan = await this.plans.current(scope, input.paymentPlanRef);
        const agreement = await scope.current(input.paymentPlanRef);
        const parent = await this.plans.parent(scope, agreement);
        requireCondition(
          (parent.enterpriseRef as Ref).id === input.targetScope.enterpriseRef.id,
          404,
          'NOT_FOUND',
          '자기 기업의 승인 계획이 필요합니다.',
        );
        const mode = paymentPlanMode(plan);
        const renewalRequest = input.renewal
          ? {
              ...input.renewal,
              enterpriseRef: input.targetScope.enterpriseRef,
              targetScope: input.targetScope,
              epoch: await scope.readSource().currentEpoch(),
              proposalDigest: fingerprint(input),
            }
          : null;
        const renewal = renewalRequest
          ? await this.renewal.current(renewalRequest, scope.readSource())
          : null;
        requireCondition(
          !renewal || input.productType === 'SOFTWARE',
          409,
          'U4_RENEWAL_TARGET',
          '갱신은 검증된 SW 회차의 별도 주문이어야 합니다.',
        );
        const orderId = input.renewal
          ? 'renewal-' +
            fingerprint({
              owner: input.renewal.renewalCycleRef.owner,
              entity: input.renewal.renewalCycleRef.entity,
              id: input.renewal.renewalCycleRef.id,
            })
          : randomUUID();
        requireCondition(
          !(await scope.optional('Order', orderId)),
          409,
          'U4_RENEWAL_ORDER_EXISTS',
          '해당 회차의 원래 갱신 주문을 확인해야 합니다.',
        );
        const orderRef: Ref = {
          owner: 'OrderAcceptance',
          entity: 'Order',
          id: orderId,
          revision: 1,
        };
        const snapshotRef: Ref = {
          owner: 'OrderAcceptance',
          entity: 'PurchaseTermsSnapshot',
          id: randomUUID(),
          revision: 1,
        };
        const choiceRef: Ref = {
          owner: 'OrderAcceptance',
          entity: 'ProvisionChoice',
          id: randomUUID(),
          revision: 1,
        };
        const decisionRef: Ref = {
          owner: 'OrderAcceptance',
          entity: 'AcceptanceDecision',
          id: randomUUID(),
          revision: 1,
        };
        const captured: U4CapturedLine[] = [];
        const records: ModelData[] = [];
        const catalog = await this.catalogLines(scope, input.targetScope, input.lines);
        for (const [index, line] of input.lines.entries()) {
          const source = catalog[index]!;
          requireCondition(
            source.product.productType === input.productType,
            400,
            'ORDER_PRODUCT_TYPE',
            '한 주문의 HW/SW 타입이 같아야 합니다.',
          );
          confirmed(
            (agreement.productRefs as Ref[]).some((reference) =>
              exact(reference, line.productRef),
            ) && source.agreementRefs.some((reference) => exact(reference, input.paymentPlanRef)),
          );
          requireCondition(
            exact(line.conditionBindings, source.bindings) &&
              exact(
                line.agreementRevisionRefs.map(canonicalJson).sort(),
                source.agreementRefs.map(canonicalJson).sort(),
              ),
            409,
            'ORDER_CONDITIONS_CHANGED',
            '현재 기업 우선 조건의 정확한 원본이 필요합니다.',
          );
          const price = source.bindings.find((binding) => binding.conditionKey === 'PRICE');
          const payment = source.bindings.find((binding) => binding.conditionKey === 'PAYMENT');
          const period = source.bindings.find((binding) => binding.conditionKey === 'PERIOD');
          const completion = source.bindings.find(
            (binding) => binding.conditionKey === 'COMPLETION',
          );
          confirmed(
            price?.conditionKey === 'PRICE' &&
              payment?.conditionKey === 'PAYMENT' &&
              completion &&
              (source.product.softwareTermKind !== 'TERM' || period),
          );
          confirmed((payment!.value as { mode: string }).mode === mode);
          const value: U4CapturedLine = {
            ...line,
            paymentMode: mode,
            purchasePrice: price!.value as Money,
            priceKnowledge: 'KNOWN',
            paymentTermsRef: (payment!.value as { termsRef: Ref }).termsRef,
            agreedPeriod: (period?.value as U4CapturedLine['agreedPeriod']) ?? null,
            completionBasisRef: completion!.value as Ref,
          };
          this.adapter.store.schema.validateUri(U4_PROFILE + '#/$defs/CapturedLine', value);
          captured.push(value);
          records.push({
            modelVersion: 3,
            lineId: randomUUID(),
            orderRef,
            productRef: line.productRef,
            commonOfferRevisionRef: line.commonOfferRevisionRef,
            quantity: line.quantity,
            requestedPaymentMode: mode,
            requestedActivationDate: line.requestedActivationDate,
            purchasePrice: value.purchasePrice,
            priceKnowledge: 'KNOWN',
            paymentTermsRef: value.paymentTermsRef,
            agreedPeriod: value.agreedPeriod,
            completionBasisRef: value.completionBasisRef,
            position: index + 1,
            agreementRevisionRefs: line.agreementRevisionRefs,
            conditionBindings: line.conditionBindings,
            paymentPlan: plan,
            revision: 1,
          });
        }
        if (renewal)
          confirmed(
            input.lines.length === renewal.originalTerms.lines.length &&
              input.lines.every(
                (line, index) =>
                  exact(line.productRef, renewal.originalTerms.lines[index]!.productRef) &&
                  line.quantity === renewal.originalTerms.lines[index]!.quantity,
              ),
          );
        const terms: U3ProposalTerms = {
          termsRecordRef: snapshotRef,
          lines: captured.map((line) => ({
            productRef: line.productRef,
            quantity: line.quantity,
            price: line.purchasePrice!,
            period: line.agreedPeriod,
            conditionRefs: uniqueRefs(line.conditionBindings.map((binding) => binding.sourceRef)),
          })),
        };
        requireCondition(
          input.priceConfirmation,
          503,
          'ORDER_PRICE_UNCONFIRMED',
          '혼합 지급 계획의 전체 금액을 확인한 직원 원본이 필요합니다.',
        );
        const price = await confirmedOrderPrice(
          scope,
          terms,
          input.priceConfirmation!,
          input.targetScope.enterpriseRef,
          await scope.readSource().currentEpoch(),
          fingerprint(input),
          this.adapter.basis(scope),
          new Authorization(this.adapter.store, this.adapter.now, scope.readSource()),
        );
        confirmed(price.total && exact(plan.total, price.total));
        const at = this.adapter.now().toISOString();
        const lineRefs = records.map((record) =>
          u4Ref('OrderLine', record, this.adapter.store.schema),
        );
        const order: ModelData = {
          modelVersion: 3,
          orderId,
          enterpriseRef: input.targetScope.enterpriseRef,
          requesterAccountRef: context.actorAccountRef,
          submissionRequestId: requestId,
          targetScope: input.targetScope,
          submittedAt: at,
          productType: input.productType,
          lineRefs,
          purchaseTermsRef: snapshotRef,
          provisionChoiceRef: choiceRef,
          acceptanceRef: decisionRef,
          changeApplicationRefs: [],
          state: 'REVIEW',
          paymentKind: mode,
          paymentPlan: plan,
          renewalCycleRef: input.renewal?.renewalCycleRef ?? null,
          revision: 1,
        };
        await scope.transaction.putNewBatch('Order', [order]);
        await scope.transaction.putNewBatch('OrderLine', records);
        await scope.transaction.put('PurchaseTermsSnapshot', {
          modelVersion: 3,
          purchaseTermsId: snapshotRef.id,
          orderRef,
          catalogRevisionRefs: uniqueRefs(input.lines.map((line) => line.commonOfferRevisionRef)),
          agreementRevisionRefs: uniqueRefs(
            input.lines.flatMap((line) => line.agreementRevisionRefs),
          ),
          conditionBindings: [
            ...new Map(
              captured
                .flatMap((line) => line.conditionBindings)
                .map((binding) => [canonicalJson(binding), binding]),
            ).values(),
          ],
          capturedLines: captured,
          priceBreakdown: price,
          priceConfirmation: input.priceConfirmation,
          capturedAt: at,
          paymentPlan: plan,
          renewalCycleRef: input.renewal?.renewalCycleRef ?? null,
          revision: 1,
        });
        await scope.transaction.put('ProvisionChoice', {
          modelVersion: 2,
          provisionChoiceId: choiceRef.id,
          orderRef,
          choice: 'FULL',
          consentRef: null,
          effectiveRevisionRef: snapshotRef,
          revision: 1,
        });
        await scope.transaction.put('AcceptanceDecision', {
          modelVersion: 2,
          decisionId: decisionRef.id,
          orderRef,
          acceptance: 'REVIEW_REQUIRED',
          lineAssessments: lineRefs.map((lineRef) => ({
            lineRef,
            assessments: [
              'CommercialAgreement',
              'FinancialSettlement',
              input.productType === 'HARDWARE' ? 'HardwareFulfillment' : 'SoftwareLifecycle',
            ].map((sourceOwner) => ({
              sourceOwner,
              knowledge: 'UNKNOWN',
              reasonKind: 'UNVERIFIED',
              reasonCode: 'STAFF_CURRENT_REVIEW_REQUIRED',
              observedAt: at,
              sourceRevision: null,
              basisRefs: [],
            })),
          })),
          basisRefs: [],
          evaluatedAt: at,
          assessedSourceRevisions: [],
          actorRef: null,
          observedOrderRevision: 1,
          decision: 'HOLD',
          revision: 1,
        });
        await this.plans.current(scope, input.paymentPlanRef, price.total!);
        await confirmedOrderPrice(
          scope,
          terms,
          input.priceConfirmation!,
          input.targetScope.enterpriseRef,
          await scope.readSource().currentEpoch(),
          fingerprint(input),
          this.adapter.basis(scope),
          new Authorization(this.adapter.store, this.adapter.now, scope.readSource()),
        );
        if (renewalRequest) {
          const current = await this.renewal.current(renewalRequest, scope.readSource());
          confirmed(
            exact(
              [
                current.binding,
                current.originalTerms,
                current.originalPriceBreakdown,
                current.sourceRefs,
              ],
              [
                renewal!.binding,
                renewal!.originalTerms,
                renewal!.originalPriceBreakdown,
                renewal!.sourceRefs,
              ],
            ),
          );
        }
        return {
          target: orderRef,
          refs: [orderRef, snapshotRef, choiceRef, decisionRef],
          state: 'REVIEW_REQUIRED',
        };
      },
    );
  }
}
