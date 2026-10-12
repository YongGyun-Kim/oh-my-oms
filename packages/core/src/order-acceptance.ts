import type {
  OrderInput,
  Receipt,
  Ref,
  ServiceContext,
  TargetScope,
  ConditionBinding,
  U3OrderInput,
  U3OrderQuery,
  U3OrderView,
  U3OrderLineView,
  U3ProposalTerms,
  U3OrderPriceBreakdown,
  U3ResolvedCommercialTerms,
  U3OrderDecisionInput,
  U3PriceConfirmation,
  U3ApplyOrderChangeInput,
  U3AppliedTerms,
} from '@oms/contracts';
import {
  requireCondition,
  canonicalJson,
  fingerprint,
  ExecutionBudget,
  U3_PROFILE,
  OmsError,
} from '@oms/contracts';
import { ProtectedTransaction, U3Transaction, U3_SOURCE_CONTRACT } from '@oms/persistence';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { randomUUID } from 'node:crypto';
import { Authorization } from './authorization.js';
import { Commands } from './commands.js';
import { Assessments } from './order-assessment.js';
import * as orderreview from './order-review.js';
import { enqueueMinimumNotice } from './pending-notification.js';
import { ref, sameRef, u3Ref } from './references.js';
import { U3Commands } from './u3-commands.js';
import { CommercialAgreement } from './commercial-agreement.js';
import type { U3EvidenceRegistration } from './u3-current-basis.js';
import { confirmedOrderPrice, unconfirmedOrderPrice } from './order-price.js';
import type { OrderingPolicy } from './scopes.js';
import { U3OrderReadiness } from './u3-order-readiness.js';
import type {
  U3ReadinessObservation,
  U3ReadinessRegistration,
  U3ReadinessRequest,
} from './u3-order-readiness.js';
import type { Assessment } from './order-assessment.js';
import { resolveConditionBindings } from './commercial-terms.js';
import { withinEffectiveWindow } from './catalog-conditions.js';
import { CommercialProposal } from './commercial-proposal.js';
import { currentOrderTerms } from './order-terms.js';
import { U3AfterSalesSource } from './u3-after-sales-source.js';
import type { U3AfterSalesRegistration } from './u3-after-sales-source.js';
export class OrderAcceptance {
  private readonly authorization: Authorization;
  private readonly commands: Commands;
  constructor(
    readonly store: ProtectedStore,
    private readonly assessments: Assessments,
    private readonly now: () => Date,
  ) {
    this.authorization = new Authorization(store, now);
    this.commands = new Commands(store, now);
  }
  private async originalPolicy(target: TargetScope): Promise<OrderingPolicy> {
    requireCondition(
      target.contextPolicyRef.owner === 'EnterpriseAccess' &&
        target.contextPolicyRef.entity === 'Enterprise' &&
        target.contextPolicyRef.id === target.enterpriseRef.id &&
        target.contextPolicyRef.revision === target.organisationRevision,
      400,
      'POLICY_REFERENCE',
      '원래 기업 조직 정책 참조를 확인하세요.',
    );
    const original = await this.store.readRevision(
      'Enterprise',
      target.enterpriseRef.id,
      target.organisationRevision,
    );
    requireCondition(original, 409, 'ORIGINAL_POLICY_MISSING', '원래 조직 정책을 확인하세요.');
    return original.orderingContextPolicy as OrderingPolicy;
  }
  async submit(context: ServiceContext, input: OrderInput): Promise<Receipt> {
    this.store.schema.validate('OrderInput', input);
    await this.authorization.identity(context);
    requireCondition(context.audience === 'CUSTOMER', 403, 'CUSTOMER_REQUIRED', '고객 주문입니다.');
    const members = await this.store.list('EnterpriseMembership', {
      equals: {
        accountRef: { id: context.principalId },
        enterpriseRef: { id: input.targetScope.enterpriseRef.id },
        active: true,
      },
      limit: 2,
    });
    const enterprise = await this.store.currentProtected(
      'Enterprise',
      input.targetScope.enterpriseRef.id,
    );
    requireCondition(
      members.length === 1 && enterprise?.approvalState === 'APPROVED' && enterprise.usageEnabled,
      403,
      'ENTERPRISE_NOT_ENABLED',
      '이 계정의 기업 승인/이용 준비가 필요합니다.',
    );
    const policy = await this.originalPolicy(input.targetScope);
    await this.authorization.requireCustomer(context, 'order.submit', input.targetScope, policy);
    const lineAssessments = await Promise.all(
      input.lines.map((line) =>
        this.assessments.line(
          { ...line, enterpriseRef: input.targetScope.enterpriseRef },
          input.productType,
        ),
      ),
    );
    return this.commands.run(
      context,
      'OrderAcceptance',
      'submitOrder',
      { kind: 'NONE' },
      input,
      'OrderHistory',
      async (transaction) => {
        await this.authorization.requireCustomer(
          context,
          'order.submit',
          input.targetScope,
          policy,
          transaction,
        );
      },
      async (transaction, requestId) => {
        const enterprise = await transaction.get('Enterprise', input.targetScope.enterpriseRef.id);
        requireCondition(
          enterprise &&
            enterprise.revision === input.targetScope.organisationRevision &&
            input.targetScope.enterpriseRef.revision === enterprise.revision,
          409,
          'ORGANISATION_REVISION',
          '현재 기업 조직 개정을 다시 확인하세요.',
        );
        const currentPolicy = enterprise.orderingContextPolicy as OrderingPolicy;
        for (const [axis, model] of [
          ['department', 'Department'],
          ['site', 'BusinessSite'],
        ] as const) {
          const value = input.targetScope[axis === 'department' ? 'departmentRef' : 'siteRef'];
          const usage = currentPolicy[axis === 'department' ? 'departmentUsage' : 'siteUsage'];
          requireCondition(
            usage !== 'UNSET' && (usage === 'NOT_USED' ? value === null : value !== null),
            400,
            'ORDERING_CONTEXT_REQUIRED',
            '기업의 조직 사용 기준과 주문 문맥을 확인하세요.',
          );
          if (value) {
            const organisation = await transaction.get(model, value.id);
            requireCondition(
              value.owner === 'EnterpriseAccess' &&
                value.entity === model &&
                organisation?.active &&
                (organisation.enterpriseRef as Ref).id === enterprise.enterpriseId &&
                organisation.revision === value.revision,
              400,
              'ORDERING_ORGANISATION',
              '해당 기업의 활성 조직이 필요합니다.',
            );
          }
        }
        requireCondition(
          input.provisionChoice === 'FULL' && input.partialConsentRef === null,
          409,
          'PARTIAL_CONSENT_UNCONFIRMED',
          '실제 부분 제공 동의 소유자의 확인이 필요합니다.',
        );
        const orderId = randomUUID();
        const decisionId = randomUUID();
        const termsId = randomUUID();
        const choiceId = randomUUID();
        const orderRef: Ref = {
          owner: 'OrderAcceptance',
          entity: 'Order',
          id: orderId,
          revision: 1,
        };
        const lineRefs: Ref[] = [];
        const capturedLines: ModelData[] = [];
        const decisions: ModelData[] = [];
        for (const [index, line] of input.lines.entries()) {
          const product = await transaction.get('Product', line.productRef.id);
          const offer = await transaction.get(
            'CommonOfferRevision',
            line.commonOfferRevisionRef.id,
          );
          requireCondition(
            line.productRef.owner === 'ProductCatalog' &&
              line.productRef.entity === 'Product' &&
              line.commonOfferRevisionRef.owner === 'ProductCatalog' &&
              line.commonOfferRevisionRef.entity === 'CommonOfferRevision' &&
              product?.productType === input.productType &&
              product.revision === line.productRef.revision &&
              offer?.visible &&
              offer.revision === line.commonOfferRevisionRef.revision &&
              sameRef(product.currentOfferRef as Ref, line.commonOfferRevisionRef) &&
              (offer.productRef as Ref).id === product.productId,
            409,
            'PRODUCT_OFFER_CHANGED',
            '같은 타입의 현재 공개 상품/판매 개정을 확인하세요.',
          );
          const capturedTerms = {
            sourceOfferRef: line.commonOfferRevisionRef,
            displayedPrice: offer.commonPrice,
            requestedPaymentMode: line.paymentMode,
            requestedActivationDate: line.requestedActivationDate,
            agreedPeriod: null,
            paymentTermsRef: null,
            completionBasisRef: null,
            agreementRevisionRef: line.agreementRevisionRef,
            knowledge: {
              displayedPrice: 'KNOWN',
              enterprisePrice: 'UNKNOWN',
              agreedPeriod: 'UNKNOWN',
              paymentTerms: 'UNKNOWN',
              completionBasis: 'UNKNOWN',
              agreement: 'UNKNOWN',
            },
            evidenceRefs: offer.salesConditionRefs,
          };
          const record = {
            lineId: randomUUID(),
            orderRef,
            productRef: line.productRef,
            commonOfferRevisionRef: line.commonOfferRevisionRef,
            quantity: line.quantity,
            requestedPaymentMode: line.paymentMode,
            requestedActivationDate: line.requestedActivationDate,
            capturedTerms,
            revision: 1,
          };
          await transaction.put('OrderLine', record);
          lineRefs.push(ref('OrderLine', record));
          capturedLines.push(capturedTerms);
          decisions.push({
            lineRef: ref('OrderLine', record),
            assessments: lineAssessments[index],
          });
        }
        const order = {
          orderId,
          enterpriseRef: input.targetScope.enterpriseRef,
          requesterAccountRef: context.actorAccountRef,
          submissionRequestId: requestId,
          targetScope: input.targetScope,
          submittedAt: this.now().toISOString(),
          productType: input.productType,
          lineRefs,
          purchaseTermsRef: {
            owner: 'OrderAcceptance',
            entity: 'PurchaseTermsSnapshot',
            id: termsId,
            revision: 1,
          },
          provisionChoiceRef: {
            owner: 'OrderAcceptance',
            entity: 'ProvisionChoice',
            id: choiceId,
            revision: 1,
          },
          acceptanceRef: {
            owner: 'OrderAcceptance',
            entity: 'AcceptanceDecision',
            id: decisionId,
            revision: 1,
          },
          revision: 1,
        };
        const decision = {
          decisionId,
          orderRef,
          acceptance: 'REVIEW_REQUIRED',
          lineAssessments: decisions,
          basisRefs: [],
          evaluatedAt: this.now().toISOString(),
          assessedSourceRevisions: [],
          revision: 1,
        };
        await transaction.put('Order', order);
        await transaction.put('PurchaseTermsSnapshot', {
          purchaseTermsId: termsId,
          orderRef,
          catalogRevisionRefs: input.lines.map((line) => line.commonOfferRevisionRef),
          agreementRevisionRef: null,
          capturedLines,
          capturedAt: this.now().toISOString(),
          revision: 1,
        });
        await transaction.put('ProvisionChoice', {
          provisionChoiceId: choiceId,
          orderRef,
          choice: 'FULL',
          consentRef: null,
          revision: 1,
        });
        await transaction.put('AcceptanceDecision', decision);
        await enqueueMinimumNotice(
          transaction,
          context,
          requestId,
          orderRef,
          input.targetScope,
          await this.store.currentEpoch(),
          this.now(),
        );
        return {
          target: orderRef,
          refs: [orderRef, ref('AcceptanceDecision', decision)],
          scope: input.targetScope,
          state: 'REVIEW_REQUIRED',
        };
      },
    );
  }
  readReview(context: ServiceContext, id: string): Promise<unknown> {
    return orderreview.readReview(
      {
        store: this.store,
        authorization: this.authorization,
        now: this.now,
        originalPolicy: this.originalPolicy.bind(this),
      },
      context,
      id,
    );
  }
}

// 기존 common1/2 소유 경로는 보존한다. 호스트는 명시 registry3 클래스를 선택한다.
export class U3OrderAcceptance {
  readonly commands: U3Commands;
  readonly agreement: CommercialAgreement;
  readonly readiness: U3OrderReadiness;
  readonly proposals: CommercialProposal;
  readonly afterSales: U3AfterSalesSource;
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
    evidence?: U3EvidenceRegistration,
    readiness: U3ReadinessRegistration[] = [],
    afterSales?: U3AfterSalesRegistration,
  ) {
    this.commands = new U3Commands(store, now);
    this.agreement = new CommercialAgreement(store, now, staffIngress, evidence);
    this.readiness = new U3OrderReadiness(store, now, readiness);
    this.proposals = new CommercialProposal(store, now, staffIngress, evidence);
    this.afterSales = new U3AfterSalesSource(store, now, afterSales);
  }
  private async ingress(context: ServiceContext, proof: unknown): Promise<void> {
    requireCondition(
      context.audience !== 'STAFF' || (await this.staffIngress(proof)),
      403,
      'STAFF_NETWORK_REQUIRED',
      '등록된 내부망 접근이 필요합니다.',
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
      '현재 요청의 유한 실행 기한이 필요합니다.',
    );
    return new ExecutionBudget(
      Math.floor(remaining),
      () => this.now().getTime(),
      parent?.signal,
    ).run(operation);
  }
  async submit(context: ServiceContext, input: U3OrderInput): Promise<Receipt> {
    return this.budget(context, () =>
      this.commands.run(
        context,
        'OrderAcceptance',
        'submitOrder',
        { kind: 'NONE' },
        input,
        { scope: input.targetScope },
        async (scope, requestId) => {
          requireCondition(
            input.meta.expectedRevision === null,
            400,
            'CREATE_REVISION',
            '새 주문의 예상 개정은 null이어야 합니다.',
          );
          const orderRef: Ref = {
            owner: 'OrderAcceptance',
            entity: 'Order',
            id: randomUUID(),
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
          const at = this.now().toISOString(),
            digest = fingerprint(input),
            captured: ModelData[] = [],
            lineRefs: Ref[] = [],
            lineRecords: ModelData[] = [];
          const currentSources = new Map<
            string,
            { product: ModelData; terms: U3ResolvedCommercialTerms }
          >();
          const allRefs = (values: Ref[]) => [
            ...new Map(values.map((value) => [canonicalJson(value), value])).values(),
          ];
          for (const [index, line] of input.lines.entries()) {
            const sourceKey = canonicalJson([line.productRef, line.commonOfferRevisionRef]);
            let sources = currentSources.get(sourceKey);
            if (!sources) {
              const product = await scope.current(line.productRef);
              const terms = await this.agreement.currentTerms(scope, {
                targetScope: input.targetScope,
                productRef: line.productRef,
                commonOfferRevisionRef: line.commonOfferRevisionRef,
              });
              sources = { product, terms };
              currentSources.set(sourceKey, sources);
              await this.agreement.approvedSources(scope, terms.agreementRevisionRefs, {
                epoch: await this.store.currentEpoch(),
                targetEnterpriseRef: input.targetScope.enterpriseRef,
                approvalDigest: digest,
              });
              for (const binding of terms.conditionBindings)
                for (const evidence of binding.evidenceRefs) await scope.current(evidence);
            }
            const product = sources.product;
            requireCondition(
              product.modelVersion === 2 && product.productType === input.productType,
              400,
              'ORDER_PRODUCT_TYPE',
              '같은 등록 HW/SW 타입만 한 주문에 제출할 수 있습니다.',
            );
            const current = sources.terms;
            requireCondition(
              canonicalJson(current.conditionBindings) === canonicalJson(line.conditionBindings) &&
                canonicalJson(current.agreementRevisionRefs.map(canonicalJson).sort()) ===
                  canonicalJson(line.agreementRevisionRefs.map(canonicalJson).sort()),
              409,
              'ORDER_CONDITIONS_CHANGED',
              '현재 원본의 모든 기업 우선 조건과 입력 개정을 정확히 대조해야 합니다.',
            );
            const price = current.conditionBindings.find((value) => value.conditionKey === 'PRICE'),
              payment = current.conditionBindings.find((value) => value.conditionKey === 'PAYMENT'),
              period = current.conditionBindings.find((value) => value.conditionKey === 'PERIOD'),
              completion = current.conditionBindings.find(
                (value) => value.conditionKey === 'COMPLETION',
              );
            requireCondition(
              price && payment && completion && (product.softwareTermKind !== 'TERM' || period),
              503,
              'ORDER_TERMS_UNCONFIRMED',
              '가격/지급/완료·기간제의 정확한 계약 기간이 필요합니다.',
            );
            requireCondition(
              (payment.value as { mode: string }).mode === line.paymentMode,
              409,
              'ORDER_PAYMENT_CHANGED',
              '행별 지급 조건이 현재 계약과 다릅니다.',
            );
            const value = {
              ...line,
              purchasePrice: price.value,
              priceKnowledge: 'KNOWN',
              paymentTermsRef: (payment.value as { termsRef: Ref }).termsRef,
              agreedPeriod: period?.value ?? null,
              completionBasisRef: completion.value,
            };
            this.store.schema.validateUri(U3_PROFILE + '#/$defs/CapturedLine', value);
            captured.push(value);
            const record: ModelData = {
              modelVersion: 2,
              lineId: randomUUID(),
              orderRef,
              productRef: line.productRef,
              commonOfferRevisionRef: line.commonOfferRevisionRef,
              quantity: line.quantity,
              requestedPaymentMode: line.paymentMode,
              requestedActivationDate: line.requestedActivationDate,
              purchasePrice: price.value,
              priceKnowledge: 'KNOWN',
              paymentTermsRef: value.paymentTermsRef,
              agreedPeriod: value.agreedPeriod,
              completionBasisRef: value.completionBasisRef,
              position: index + 1,
              agreementRevisionRefs: line.agreementRevisionRefs,
              conditionBindings: line.conditionBindings,
              revision: 1,
            };
            lineRecords.push(record);
            lineRefs.push(u3Ref('OrderLine', record, this.store.schema));
          }
          await scope.transaction.putNewBatch('OrderLine', lineRecords);
          const terms: U3ProposalTerms = {
            termsRecordRef: snapshotRef,
            lines: captured.map((value) => ({
              productRef: value.productRef as Ref,
              quantity: Number(value.quantity),
              price: value.purchasePrice as U3ProposalTerms['lines'][number]['price'],
              period: value.agreedPeriod as U3ProposalTerms['lines'][number]['period'],
              conditionRefs: allRefs(
                (value.conditionBindings as ConditionBinding[]).map((binding) => binding.sourceRef),
              ),
            })),
          };
          const confirmation = input.priceConfirmation ?? null;
          const price = confirmation
            ? await confirmedOrderPrice(
                scope,
                terms,
                confirmation,
                input.targetScope.enterpriseRef,
                await this.store.currentEpoch(),
                digest,
                this.agreement.basis,
                this.commands.authorization,
              )
            : unconfirmedOrderPrice(terms, this.store.schema);
          const order: ModelData = {
            modelVersion: 2,
            orderId: orderRef.id,
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
            paymentKind: input.lines[0]!.paymentMode,
            revision: 1,
          };
          const snapshot: ModelData = {
            modelVersion: 2,
            purchaseTermsId: snapshotRef.id,
            orderRef,
            catalogRevisionRefs: allRefs(input.lines.map((line) => line.commonOfferRevisionRef)),
            agreementRevisionRefs: allRefs(
              input.lines.flatMap((line) => line.agreementRevisionRefs),
            ),
            conditionBindings: [
              ...new Map(
                input.lines
                  .flatMap((line) => line.conditionBindings)
                  .map((binding) => [canonicalJson(binding), binding]),
              ).values(),
            ],
            capturedLines: captured,
            priceBreakdown: price,
            priceConfirmation: confirmation,
            capturedAt: at,
            revision: 1,
          };
          await scope.transaction.put('Order', order);
          await scope.transaction.put('PurchaseTermsSnapshot', snapshot);
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
          if (confirmation)
            await confirmedOrderPrice(
              scope,
              terms,
              confirmation,
              input.targetScope.enterpriseRef,
              await this.store.currentEpoch(),
              digest,
              this.agreement.basis,
              this.commands.authorization,
            );
          return {
            target: orderRef,
            // 결과는 전체 행을 소유하는 집계 원본을 가리킨다. 모든 행은 같은 후보에 그대로 보호한다.
            refs: [orderRef, snapshotRef, choiceRef, decisionRef],
            state: 'REVIEW_REQUIRED',
            notice: true,
          };
        },
      ),
    );
  }
  private unresolved(error: unknown): boolean {
    return (
      error instanceof OmsError &&
      [
        'ORDER_READINESS_UNCONFIRMED',
        'ORDER_PRICE_UNCONFIRMED',
        'ORDER_TERMS_CHANGED',
        'U3_PROOF_UNCONFIRMED',
        'STALE_U3_REFERENCE',
        'ACTION_DENIED',
        'AGREEMENT_CONDITION_CONFLICT',
      ].includes(error.code)
    );
  }
  private assessment(owner: Assessment['sourceOwner'], code: string): Assessment {
    return {
      sourceOwner: owner,
      knowledge: 'UNKNOWN',
      reasonKind: 'UNVERIFIED',
      reasonCode: code,
      observedAt: this.now().toISOString(),
      sourceRevision: null,
      basisRefs: [],
    };
  }
  private async decisionOriginal(scope: U3Transaction, input: U3OrderDecisionInput) {
    const order = await scope.current(input.targetRef);
    requireCondition(
      order.modelVersion === 2 &&
        canonicalJson(order.targetScope) === canonicalJson(input.targetScope),
      404,
      'NOT_FOUND',
      '해당 기업·조직의 정확한 주문이 필요합니다.',
    );
    requireCondition(
      order.state === 'REVIEW',
      409,
      'ORDER_ALREADY_DECIDED',
      '전체 수락·거절 후 새 판단으로 기존 결과를 덮어쓸 수 없습니다.',
    );
    const current = await currentOrderTerms(scope, input.targetRef, this.agreement.basis);
    const snapshotRef = order.purchaseTermsRef as Ref;
    // 같은 판단 phase에서 이미 보호 원본/현재 primary를 대조한 값을 재사용한다.
    // 독립 최종 assertPremises/권한 fence는 그대로 수행한다.
    const snapshot = current.snapshot,
      choice = current.choice,
      birth = await this.store.readRevision('Order', input.targetRef.id, 1);
    requireCondition(
      birth?.modelVersion === 2 &&
        canonicalJson(snapshot.orderRef) ===
          canonicalJson(u3Ref('Order', birth, this.store.schema)) &&
        canonicalJson(birth.purchaseTermsRef) === canonicalJson(snapshotRef) &&
        birth.submissionRequestId === order.submissionRequestId &&
        choice.choice === 'FULL' &&
        canonicalJson(choice.orderRef) === canonicalJson(snapshot.orderRef) &&
        canonicalJson(choice.effectiveRevisionRef) === canonicalJson(snapshotRef),
      503,
      'ORDER_SNAPSHOT_UNCONFIRMED',
      '불변 구매 스냅샷과 실제 최초 전체 제공 원본이 필요합니다.',
    );
    const currentReceipt = await this.store.currentProtected(
      'RequestReceipt',
      String(order.submissionRequestId),
    );
    requireCondition(
      currentReceipt,
      503,
      'ORDER_SNAPSHOT_UNCONFIRMED',
      '실제 보호된 원래 제출 접수가 필요합니다.',
    );
    const receipt = await scope.current(ref('RequestReceipt', currentReceipt));
    requireCondition(
      canonicalJson(receipt.sourceContract) === canonicalJson(U3_SOURCE_CONTRACT) &&
        receipt.owner === 'OrderAcceptance' &&
        receipt.operation === 'submitOrder' &&
        receipt.audience === 'CUSTOMER' &&
        receipt.principalId === (birth.requesterAccountRef as Ref).id &&
        (receipt.targetIdentity as { kind: string }).kind === 'NONE' &&
        canonicalJson(receipt.targetScope) === canonicalJson(input.targetScope) &&
        [snapshotRef, snapshot.orderRef as Ref].every((reference) =>
          (receipt.resultRefs as Ref[]).some(
            (value) => canonicalJson(value) === canonicalJson(reference),
          ),
        ),
      503,
      'ORDER_SNAPSHOT_UNCONFIRMED',
      '스냅샷·요청자·고정 범위는 동일한 보호 제출 결과에 결합되어야 합니다.',
    );
    const captured = snapshot.capturedLines as ModelData[],
      lines: ModelData[] = [];
    requireCondition(
      captured.length >= 1 &&
        captured.length <= 100 &&
        captured.length === (order.lineRefs as Ref[]).length,
      503,
      'ORDER_SNAPSHOT_UNCONFIRMED',
      '주문 전체 행을 확인해야 합니다.',
    );
    for (const [index, line] of current.lines.entries()) {
      const original = captured[index]!;
      requireCondition(
        line &&
          line.modelVersion === 2 &&
          Number(line.position) === index + 1 &&
          canonicalJson(line.orderRef) === canonicalJson(snapshot.orderRef) &&
          line.requestedPaymentMode === order.paymentKind &&
          [
            'productRef',
            'quantity',
            'purchasePrice',
            'paymentTermsRef',
            'agreedPeriod',
            'completionBasisRef',
            'commonOfferRevisionRef',
            'agreementRevisionRefs',
            'conditionBindings',
            'requestedActivationDate',
          ].every((field) => canonicalJson(line[field]) === canonicalJson(original[field])),
        503,
        'ORDER_SNAPSHOT_UNCONFIRMED',
        '모든 현재 행은 최초 구매 조건·수량·기간과 정확히 일치해야 합니다.',
      );
      lines.push(line);
    }
    const terms = current.terms;
    const request: U3ReadinessRequest = {
      orderRef: input.targetRef,
      purchaseTermsRef: snapshotRef,
      currentTermsRef: current.reference,
      enterpriseRef: input.targetScope.enterpriseRef,
      targetScope: input.targetScope,
      productType: order.productType as U3ReadinessRequest['productType'],
      paymentKind: order.paymentKind as U3ReadinessRequest['paymentKind'],
      provisionChoice: 'FULL',
      priceBreakdown: current.price,
      lines: current.captured.map((line, index) => ({
        lineRef: (order.lineRefs as Ref[])[index]!,
        productRef: line.productRef as Ref,
        commonOfferRevisionRef: line.commonOfferRevisionRef as Ref,
        agreementRevisionRefs: line.agreementRevisionRefs as Ref[],
        conditionBindings: line.conditionBindings as ConditionBinding[],
        quantity: Number(line.quantity),
        paymentMode: line.paymentMode,
        requestedActivationDate: line.requestedActivationDate as string | null,
        agreedPeriod: line.agreedPeriod as U3ReadinessRequest['lines'][number]['agreedPeriod'],
      })),
      epoch: await this.store.currentEpoch(),
      decisionDigest: fingerprint(input),
    };
    return { order, snapshot, lines, terms, receipt, request, current };
  }
  private async commercialReadiness(
    scope: U3Transaction,
    original: Awaited<ReturnType<U3OrderAcceptance['decisionOriginal']>>,
  ) {
    const { request, snapshot, terms, receipt } = original;
    const seen = new Set<string>();
    for (const line of request.lines) {
      const key = canonicalJson([line.commonOfferRevisionRef, line.agreementRevisionRefs]);
      if (seen.has(key)) continue;
      seen.add(key);
      const common = await scope.current(line.commonOfferRevisionRef),
        agreements: ModelData[] = [];
      requireCondition(
        common.modelVersion === 2 &&
          common.visible === true &&
          canonicalJson(common.productRef) === canonicalJson(line.productRef) &&
          withinEffectiveWindow(
            common.effectiveWindow as Parameters<typeof withinEffectiveWindow>[0],
            this.now(),
          ),
        503,
        'ORDER_TERMS_CHANGED',
        '구매 시 선택한 조건 원본의 현재 판단 효력을 확인해야 합니다.',
      );
      for (const reference of line.agreementRevisionRefs)
        agreements.push(await scope.current(reference));
      await this.agreement.approvedSources(scope, line.agreementRevisionRefs, {
        epoch: request.epoch,
        approvalDigest: request.decisionDigest,
        targetEnterpriseRef: request.enterpriseRef,
      });
      const resolved = resolveConditionBindings(
        common.conditionBindings as ConditionBinding[],
        agreements,
        this.now(),
      );
      requireCondition(
        canonicalJson(resolved) === canonicalJson(line.conditionBindings),
        503,
        'ORDER_TERMS_CHANGED',
        '원래 조건의 효력/필수 근거가 달라지면 새 합의를 확인해야 합니다.',
      );
      for (const binding of line.conditionBindings)
        for (const evidence of binding.evidenceRefs) await scope.current(evidence);
    }
    if (original.current.application) {
      await this.proposals.currentApplicationEvidence(
        scope,
        original.current.application.consentRef as Ref,
      );
      return;
    }
    const confirmation = snapshot.priceConfirmation as U3PriceConfirmation | null | undefined;
    requireCondition(
      confirmation && (snapshot.priceBreakdown as U3OrderPriceBreakdown).knowledge === 'KNOWN',
      503,
      'ORDER_PRICE_UNCONFIRMED',
      '미확인 총액이나 확인 자료 부재를0원으로 수락할 수 없습니다.',
    );
    await confirmedOrderPrice(
      scope,
      terms,
      confirmation,
      request.enterpriseRef,
      request.epoch,
      String(receipt.requestFingerprint),
      this.agreement.basis,
      this.commands.authorization,
    );
  }
  async decide(
    context: ServiceContext,
    input: U3OrderDecisionInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    await this.ingress(context, ingressProof);
    return this.budget(context, () =>
      this.commands.run(
        context,
        'OrderAcceptance',
        'decideOrder',
        { kind: 'RECORD', recordRef: input.targetRef },
        input,
        { scope: input.targetScope },
        async (scope) => {
          const original = await this.decisionOriginal(scope, input),
            { order, request } = original;
          requireCondition(
            input.meta.reason.trim().length > 0 &&
              (input.decision !== 'REJECT' || input.basisRefs.length > 0),
            400,
            'ORDER_DECISION_REASON',
            '전체 거절은 실제 근거와 비어 있지 않은 사유가 필요합니다.',
          );
          if (input.basisRefs.length)
            await this.agreement.basis.evidence(
              scope,
              input.basisRefs,
              this.agreement.basis.registration.agreementPurpose,
              context.actorAccountRef!,
              request.enterpriseRef,
              undefined,
              {
                epoch: request.epoch,
                approvalDigest: request.decisionDigest,
                targetEnterpriseRef: request.enterpriseRef,
              },
            );
          let commercial = this.assessment('CommercialAgreement', 'ORDER_PRICE_UNCONFIRMED');
          try {
            await this.commercialReadiness(scope, original);
            commercial = {
              sourceOwner: 'CommercialAgreement',
              knowledge: 'KNOWN',
              reasonKind: 'SPECIAL_CONDITION',
              reasonCode: 'ORIGINAL_CONFIRMED_TERMS',
              observedAt: this.now().toISOString(),
              sourceRevision: request.purchaseTermsRef.revision,
              basisRefs: [request.purchaseTermsRef],
            };
          } catch (error) {
            if (!this.unresolved(error)) throw error;
            commercial.reasonCode = (error as OmsError).code;
          }
          const owners = [
            'FinancialSettlement',
            request.productType === 'HARDWARE' ? 'HardwareFulfillment' : 'SoftwareLifecycle',
          ] as const;
          const observations: (U3ReadinessObservation | null)[] = [];
          for (const owner of owners) {
            try {
              observations.push(await this.readiness.current(owner, request));
            } catch (error) {
              if (!this.unresolved(error)) throw error;
              observations.push(null);
            }
          }
          const lineAssessments = request.lines.map((line, index) => ({
            lineRef: line.lineRef,
            assessments: [
              commercial,
              ...owners.map((owner, ownerIndex): Assessment => {
                const observation = observations[ownerIndex],
                  readiness = observation?.lines[index];
                const periodMismatch =
                  owner === 'SoftwareLifecycle' &&
                  line.requestedActivationDate !== null &&
                  line.agreedPeriod !== null &&
                  line.requestedActivationDate !== line.agreedPeriod.startDate;
                const ready =
                  observation?.knowledge === 'KNOWN' &&
                  readiness?.knowledge === 'KNOWN' &&
                  readiness.readyQuantity === line.quantity &&
                  (!periodMismatch || readiness.activationResolution === 'CONFIRMED');
                return ready
                  ? {
                      sourceOwner: owner,
                      knowledge: 'KNOWN',
                      reasonKind: 'SPECIAL_CONDITION',
                      reasonCode: 'OWNER_READY_FOR_ACCEPTANCE',
                      observedAt: observation!.observedAt,
                      sourceRevision: observation!.sourceRef.revision,
                      basisRefs: observation!.sourceRefs,
                    }
                  : this.assessment(
                      owner,
                      periodMismatch ? 'ACTIVATION_AGREEMENT_UNCONFIRMED' : 'ORDER_OWNER_NOT_READY',
                    );
              }),
            ],
          }));
          const allReady = lineAssessments.every((line) =>
            line.assessments.every((assessment) => assessment.knowledge === 'KNOWN'),
          );
          const decision = input.decision === 'ACCEPT' && !allReady ? 'HOLD' : input.decision;
          const acceptance =
            decision === 'ACCEPT'
              ? 'ACCEPTED'
              : decision === 'REJECT'
                ? 'DECLINED'
                : 'REVIEW_REQUIRED';
          const record: ModelData = {
            modelVersion: 2,
            decisionId: randomUUID(),
            orderRef: input.targetRef,
            acceptance,
            lineAssessments,
            basisRefs: input.basisRefs,
            evaluatedAt: this.now().toISOString(),
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
          const decisionRef = u3Ref('AcceptanceDecision', record, this.store.schema),
            after: ModelData = {
              ...order,
              state:
                decision === 'ACCEPT' ? 'ACCEPTED' : decision === 'REJECT' ? 'REJECTED' : 'REVIEW',
              acceptanceRef: decisionRef,
              revision: input.targetRef.revision + 1,
            };
          await scope.transaction.put('Order', after, input.targetRef.revision);
          // 수락 직전 원본·권한 재대조. 변경되면 전체 후보를 롤백하며 늦은 응답으로 수락하지 않는다.
          if (decision === 'ACCEPT') {
            await this.commercialReadiness(scope, original);
            for (const [index, owner] of owners.entries()) {
              const before = observations[index]!,
                current = await this.readiness.current(owner, request);
              requireCondition(
                canonicalJson([
                  current.binding,
                  current.knowledge,
                  current.sourceRef,
                  current.sourceRefs,
                  current.lines,
                ]) ===
                  canonicalJson([
                    before.binding,
                    before.knowledge,
                    before.sourceRef,
                    before.sourceRefs,
                    before.lines,
                  ]),
                409,
                'ORDER_READINESS_CHANGED',
                '같은 수락 직전의 준비 원본/수량/개정이 달라졌습니다.',
              );
            }
          }
          await this.ingress(context, ingressProof);
          return {
            target: u3Ref('Order', after, this.store.schema),
            refs: [u3Ref('Order', after, this.store.schema), decisionRef],
            before: input.targetRef,
            state: decision === 'HOLD' ? 'REVIEW_REQUIRED' : 'RESULT_RECORDED',
            notice: true,
          };
        },
      ),
    );
  }
  async apply(
    context: ServiceContext,
    input: U3ApplyOrderChangeInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    await this.ingress(context, ingressProof);
    return this.budget(context, () =>
      this.commands.run(
        context,
        'OrderAcceptance',
        'applyApprovedChange',
        { kind: 'NONE' },
        input,
        { scope: input.targetScope },
        async (scope) => {
          const current = await currentOrderTerms(scope, input.orderRef, this.agreement.basis),
            order = current.order;
          requireCondition(
            canonicalJson(order.targetScope) === canonicalJson(input.targetScope),
            404,
            'NOT_FOUND',
            '해당 기업·고정 조직의 주문 변경만 적용할 수 있습니다.',
          );
          requireCondition(
            input.changeKind === 'REVIEW_PRICE_CHANGE'
              ? order.state === 'REVIEW' && input.afterSalesDecisionRef === null
              : order.state === 'ACCEPTED' && input.afterSalesDecisionRef !== null,
            409,
            'ORDER_CHANGE_STATE',
            '수락 전 가격 변경과 수락 후 U7 변경의 현재 상태를 구분해야 합니다.',
          );
          const used = await this.agreement.basis.collection(scope, 'OrderChangeApplication', {
            consentRef: { id: input.customerConsentRef.id },
            actualApplicationResult: 'APPLIED',
          });
          requireCondition(
            used.length === 0,
            409,
            'CONSENT_ALREADY_APPLIED',
            '한 정확한 동의의 적용은 한 번만 기록합니다.',
          );
          const source = await this.proposals.applicationSource(
            scope,
            input.customerConsentRef,
            input.orderRef,
            input.targetScope,
            input.newTermsRef,
          );
          requireCondition(
            canonicalJson(source.proposal.originalTermsRef) === canonicalJson(current.reference) &&
              canonicalJson(source.content.originalTerms) === canonicalJson(current.terms) &&
              canonicalJson(source.content.originalPriceBreakdown) === canonicalJson(current.price),
            409,
            'ORDER_CHANGE_ORIGINAL',
            '제안의 원래 조건은 실제 현재 적용 조건과 같아야 합니다.',
          );
          const captured: U3AppliedTerms['capturedLines'] = [];
          for (const [index, line] of source.captured.entries()) {
            const product = source.products[index];
            requireCondition(
              product &&
                canonicalJson(u3Ref('Product', product, this.store.schema)) ===
                  canonicalJson(line.productRef),
              409,
              'ORDER_CHANGE_BOUNDARY',
              '같은 phase에서 검증한 정확한 상품 원본이 필요합니다.',
            );
            const previous = current.captured[index];
            requireCondition(
              previous &&
                product.productType === order.productType &&
                line.productRef.id === previous.productRef.id &&
                line.quantity === previous.quantity &&
                line.paymentMode === order.paymentKind &&
                canonicalJson(line.agreedPeriod) === canonicalJson(previous.agreedPeriod) &&
                canonicalJson(line.paymentTermsRef) === canonicalJson(previous.paymentTermsRef) &&
                canonicalJson(line.completionBasisRef) ===
                  canonicalJson(previous.completionBasisRef) &&
                canonicalJson(
                  line.conditionBindings.find((binding) => binding.conditionKey === 'PROVISION')
                    ?.value,
                ) ===
                  canonicalJson(
                    previous.conditionBindings.find(
                      (binding) => binding.conditionKey === 'PROVISION',
                    )?.value,
                  ),
              409,
              'ORDER_CHANGE_BOUNDARY',
              '가격 변경은 같은 상품/수량/단일 지급/FULL/합의 기간·이행 조건을 보존해야 합니다.',
            );
            captured.push({ ...line, requestedActivationDate: previous.requestedActivationDate });
          }
          requireCondition(
            captured.length === current.captured.length,
            409,
            'ORDER_CHANGE_BOUNDARY',
            '전체 주문 입력행을 보존해야 합니다.',
          );
          const digest = fingerprint(input),
            epoch = await this.store.currentEpoch();
          const afterSalesRequest =
            input.changeKind === 'ACCEPTED_AFTERSALES_CHANGE'
              ? {
                  decisionRef: input.afterSalesDecisionRef,
                  orderRef: input.orderRef,
                  proposalRef: source.proposalRef,
                  proposalRevision: source.content.proposalRevision,
                  termsFingerprint: String(source.proposal.termsFingerprint),
                  consentRef: input.customerConsentRef,
                  newTermsRef: input.newTermsRef,
                  targetScope: input.targetScope,
                  epoch,
                  applicationDigest: digest,
                }
              : null;
          const u7 = afterSalesRequest ? await this.afterSales.current(afterSalesRequest) : null;
          const appliedTerms: U3AppliedTerms = {
            terms: source.content.proposedTerms,
            capturedLines: captured,
            priceBreakdown: source.content.priceBreakdown,
            targetScope: input.targetScope,
            proposalRevision: source.content.proposalRevision,
            termsFingerprint: String(source.proposal.termsFingerprint),
          };
          const application: ModelData = {
            modelVersion: 2,
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
          };
          await scope.transaction.put('OrderChangeApplication', application);
          const applicationRef = u3Ref('OrderChangeApplication', application, this.store.schema),
            after = {
              ...order,
              changeApplicationRefs: [...(order.changeApplicationRefs as Ref[]), applicationRef],
              revision: input.orderRef.revision + 1,
            };
          await scope.transaction.put('Order', after, input.orderRef.revision);
          const again = await this.proposals.applicationSource(
            scope,
            input.customerConsentRef,
            input.orderRef,
            input.targetScope,
            input.newTermsRef,
          );
          requireCondition(
            canonicalJson([source.proposal, source.consent, source.captured]) ===
              canonicalJson([again.proposal, again.consent, again.captured]),
            409,
            'ORDER_CHANGE_SOURCE_CHANGED',
            '동일 적용 직전의 제안·동의·현재 근거가 변경됐습니다.',
          );
          if (afterSalesRequest) {
            const observed = await this.afterSales.current(afterSalesRequest);
            requireCondition(
              canonicalJson([observed.binding, observed.facts]) ===
                canonicalJson([
                  u7!.binding,
                  { ...u7!.facts, observedAt: observed.facts.observedAt },
                ]),
              409,
              'ORDER_CHANGE_SOURCE_CHANGED',
              '같은 U7 결정 원본의 개정/대상/허용 상태를 재확인해야 합니다.',
            );
          }
          await this.ingress(context, ingressProof);
          const target = u3Ref('Order', after, this.store.schema);
          return {
            target,
            refs: [target, applicationRef],
            before: input.orderRef,
            state: 'RESULT_RECORDED',
            notice: true,
          };
        },
      ),
    );
  }
  async read(
    context: ServiceContext,
    input: U3OrderQuery,
    ingressProof: unknown = null,
  ): Promise<unknown> {
    await this.ingress(context, ingressProof);
    return this.budget(context, () =>
      this.commands.read(
        context,
        'OrderAcceptance',
        'readAcceptedOrder',
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
              order = await scope.current(input.targetRef);
            requireCondition(
              order.modelVersion === 2 &&
                canonicalJson(order.targetScope) === canonicalJson(input.targetScope),
              404,
              'NOT_FOUND',
              '해당 기업·조직의 주문을 확인할 수 없습니다.',
            );
            const current = await currentOrderTerms(scope, input.targetRef, this.agreement.basis);
            // 같은 조회 phase의 검증된 원본을 재사용한다. 최종 전제는 별도로 다시 대조한다.
            const snapshot = current.snapshot,
              decision = await scope.current(order.acceptanceRef as Ref),
              choice = current.choice;
            const captured = snapshot.capturedLines as ModelData[],
              lines: U3OrderLineView[] = [];
            requireCondition(
              captured.length === (order.lineRefs as Ref[]).length &&
                choice.choice === 'FULL' &&
                (choice.orderRef as Ref).id === input.targetRef.id &&
                (snapshot.orderRef as Ref).id === input.targetRef.id &&
                (decision.orderRef as Ref).id === input.targetRef.id,
              503,
              'ORDER_SNAPSHOT_UNCONFIRMED',
              '원래 주문의 전체 행·FULL 선택·스냅샷·판단 원본 연결이 필요합니다.',
            );
            for (const [index, lineRef] of (order.lineRefs as Ref[]).entries()) {
              const line = current.lines[index],
                source = captured[index];
              requireCondition(
                line &&
                  source &&
                  Number(line.position) === index + 1 &&
                  (line.orderRef as Ref).id === input.targetRef.id &&
                  line.priceKnowledge === 'KNOWN',
                503,
                'ORDER_SNAPSHOT_UNCONFIRMED',
                '전체 행의 정확한 원래 구매 조건이 필요합니다.',
              );
              const data: U3OrderLineView = {
                orderLineRef: lineRef,
                productRef: line.productRef as Ref,
                quantity: Number(line.quantity),
                purchasePrice: line.purchasePrice as U3OrderLineView['purchasePrice'],
                paymentTermsRef: line.paymentTermsRef as Ref,
                agreedPeriod: line.agreedPeriod as U3OrderLineView['agreedPeriod'],
                completionBasisRef: line.completionBasisRef as Ref,
                commonOfferRevisionRef: line.commonOfferRevisionRef as Ref,
                agreementRevisionRefs: line.agreementRevisionRefs as Ref[],
                conditionBindings: line.conditionBindings as ConditionBinding[],
              };
              requireCondition(
                [
                  'productRef',
                  'quantity',
                  'purchasePrice',
                  'paymentTermsRef',
                  'agreedPeriod',
                  'completionBasisRef',
                  'commonOfferRevisionRef',
                  'agreementRevisionRefs',
                  'conditionBindings',
                ].every((key) => canonicalJson(line[key]) === canonicalJson(source[key])),
                503,
                'ORDER_SNAPSHOT_UNCONFIRMED',
                '현재 행과 불변 스냅샷의 전체 조건이 다릅니다.',
              );
              lines.push(data);
            }
            const data: U3OrderView = {
              orderRef: input.targetRef,
              targetScope: input.targetScope,
              productType: order.productType as U3OrderView['productType'],
              lines,
              purchaseTermsSnapshotRef: order.purchaseTermsRef as Ref,
              commonOfferRevisionRefs: snapshot.catalogRevisionRefs as Ref[],
              agreementRevisionRefs: snapshot.agreementRevisionRefs as Ref[],
              conditionBindings: snapshot.conditionBindings as ConditionBinding[],
              provisionChoice: 'FULL',
              consentRef: current.application
                ? (current.application.consentRef as Ref)
                : (choice.consentRef as Ref | null),
              acceptance: decision.acceptance as U3OrderView['acceptance'],
              basisRefs: decision.basisRefs as Ref[],
              priceBreakdown: current.price,
              currentTermsRef: current.reference,
              ...(current.applied ? { appliedTerms: current.applied } : {}),
            };
            await scope.assertPremises();
            await this.ingress(context, ingressProof);
            return {
              knowledge: 'KNOWN',
              data,
              sourceRefs: [
                input.targetRef,
                order.purchaseTermsRef as Ref,
                order.provisionChoiceRef as Ref,
                order.acceptanceRef as Ref,
              ],
              observedAt: this.now().toISOString(),
            };
          }),
      ),
    );
  }
}
