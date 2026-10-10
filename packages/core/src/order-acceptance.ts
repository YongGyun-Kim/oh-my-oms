import type { OrderInput, Receipt, Ref, ServiceContext, TargetScope } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { randomUUID } from 'node:crypto';
import { Authorization } from './authorization.js';
import { Commands } from './commands.js';
import { Assessments } from './order-assessment.js';
import * as orderreview from './order-review.js';
import { enqueueMinimumNotice } from './pending-notification.js';
import { ref, sameRef } from './references.js';
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
