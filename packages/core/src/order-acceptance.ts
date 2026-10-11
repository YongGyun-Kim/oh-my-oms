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
} from '@oms/contracts';
import {
  requireCondition,
  canonicalJson,
  fingerprint,
  ExecutionBudget,
  U3_PROFILE,
} from '@oms/contracts';
import { ProtectedTransaction, U3Transaction } from '@oms/persistence';
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
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
    evidence?: U3EvidenceRegistration,
  ) {
    this.commands = new U3Commands(store, now);
    this.agreement = new CommercialAgreement(store, now, staffIngress, evidence);
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
            lineRefs: Ref[] = [];
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
            await scope.transaction.put('OrderLine', record);
            lineRefs.push(u3Ref('OrderLine', record, this.store.schema));
          }
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
            requireCondition(
              (order.changeApplicationRefs as Ref[]).length === 0,
              503,
              'ORDER_APPLIED_SOURCE_UNCONFIRMED',
              '정확한 적용 조건 소유 경로를 확인해야 합니다.',
            );
            const snapshot = await scope.current(order.purchaseTermsRef as Ref),
              decision = await scope.current(order.acceptanceRef as Ref),
              choice = await scope.current(order.provisionChoiceRef as Ref);
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
              const line = await scope.current(lineRef),
                source = captured[index];
              requireCondition(
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
              consentRef: choice.consentRef as Ref | null,
              acceptance: decision.acceptance as U3OrderView['acceptance'],
              basisRefs: decision.basisRefs as Ref[],
              priceBreakdown: snapshot.priceBreakdown as U3OrderPriceBreakdown,
              currentTermsRef: order.purchaseTermsRef as Ref,
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
