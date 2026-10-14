import type { Ref, TargetScope } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
interface Product {
  productRef: Ref;
  offerRef: Ref;
  productType: 'HARDWARE' | 'SOFTWARE';
}
export async function seedHistoricalOrders(
  store: ProtectedStore,
  enterprises: Ref[],
  products: Product[],
  orderCount = 100000,
): Promise<void> {
  if (
    !Number.isInteger(orderCount) ||
    orderCount <= 0 ||
    orderCount > 100000 ||
    orderCount % 100 !== 0 ||
    enterprises.length === 0 ||
    products.length === 0
  )
    throw Error('등록된 합성 주문/품목 분포와 실제 source 집합이 필요합니다.');
  // Storage-size fixture, never an accepted HTTP ACK or actual provider outcome.
  // Historical orders and needed notice work are explicitly REVIEW_REQUIRED.
  // New measured requests continue through normal owner/HTTP/worker paths.
  for (let first = 0; first < orderCount; first += 50) {
    await store.execute(
      {
        principalId: 'synthetic-nfr-storage-fixture',
        audience: 'SYSTEM',
        owner: 'OperationalAssurance',
        operation: 'synthetic-historical-profile',
        target: { kind: 'NONE' },
        idempotencyKey: 'nfr-orders-' + first,
        input: { first, count: 50 },
        correlationId: 'nfr-seed-' + first,
        epoch: await store.currentEpoch(),
      },
      async (transaction) => {
        const batches = new NewFixtureRows();
        for (let index = first; index < first + 50; index++)
          await historical(batches, enterprises, products, index);
        await batches.flush(transaction);
      },
    );
    if (first % 5000 === 0) console.log('보호된 과거 저장 규모(외부 결과 미확인):', first + 50);
  }
}
class NewFixtureRows {
  readonly records = new Map<string, ModelData[]>();
  async put(model: string, data: ModelData) {
    const group = this.records.get(model) ?? [];
    group.push(data);
    this.records.set(model, group);
  }
  async flush(transaction: ProtectedTransaction) {
    // Parent material first; reference cycles are checked by the same deferred
    // PostgreSQL FK constraints at transaction commit, never disabled.
    const order = [
      'Order',
      'CommonOfferRevision',
      'OrderLine',
      'PurchaseTermsSnapshot',
      'ProvisionChoice',
      'AcceptanceDecision',
      'OrderHistory',
      'RequestReceipt',
      'FactEnvelope',
      'ExecutionPermit',
      'WorkItem',
      'OutboxDelivery',
    ];
    for (const model of order) {
      const group = this.records.get(model) ?? [];
      for (let first = 0; first < group.length; first += 100)
        await transaction.putNewBatch(model, group.slice(first, first + 100));
      this.records.delete(model);
    }
    if (this.records.size) throw new Error('합성 배치에 미등록 원본 순서가 있습니다.');
  }
}
async function historical(
  transaction: NewFixtureRows,
  enterprises: Ref[],
  products: Product[],
  index: number,
) {
  const company = index % enterprises.length;
  const enterprise = enterprises[company]!;
  const type = index % 2 === 0 ? 'HARDWARE' : 'SOFTWARE';
  const orderRef: Ref = {
    owner: 'OrderAcceptance',
    entity: 'Order',
    id: 'nfr-order-' + String(index).padStart(6, '0'),
    revision: 1,
  };
  const requestId = 'nfr-historical-request-' + index;
  const accountRef: Ref = {
    owner: 'IdentityRecovery',
    entity: 'Account',
    id: 'nfr-customer-' + company * 10,
    revision: 1,
  };
  const scope: TargetScope = {
    enterpriseRef: enterprise,
    contextPolicyRef: enterprise,
    organisationRevision: enterprise.revision,
    departmentRef: null,
    siteRef: null,
  };
  const now = '2026-10-08T00:00:00Z';
  const termsRef: Ref = {
    owner: 'OrderAcceptance',
    entity: 'PurchaseTermsSnapshot',
    id: 'nfr-terms-' + index,
    revision: 1,
  };
  const choiceRef: Ref = {
    owner: 'OrderAcceptance',
    entity: 'ProvisionChoice',
    id: 'nfr-choice-' + index,
    revision: 1,
  };
  const decisionRef: Ref = {
    owner: 'OrderAcceptance',
    entity: 'AcceptanceDecision',
    id: 'nfr-decision-' + index,
    revision: 1,
  };
  // 1% has50items; 45%4items; remainder5items => average5,max50.
  const count = index % 100 === 0 ? 50 : index % 100 <= 45 ? 4 : 5;
  const lineRefs: Ref[] = [];
  const terms: Record<string, unknown>[] = [];
  const assessments: Record<string, unknown>[] = [];
  const offers: Ref[] = [];
  for (let line = 0; line < count; line++) {
    const product =
      products[(index * 10 + line * 2 + (type === 'SOFTWARE' ? 1 : 0)) % products.length]!;
    const lineRef: Ref = {
      owner: 'OrderAcceptance',
      entity: 'OrderLine',
      id: 'nfr-line-' + index + '-' + line,
      revision: 1,
    };
    const captured = {
      sourceOfferRef: product.offerRef,
      displayedPrice: { currency: 'KRW', value: '100' },
      requestedPaymentMode: 'PREPAY',
      requestedActivationDate: type === 'SOFTWARE' ? '2026-12-01' : null,
      agreedPeriod: null,
      paymentTermsRef: null,
      completionBasisRef: null,
      agreementRevisionRef: null,
      knowledge: {
        displayedPrice: 'KNOWN',
        enterprisePrice: 'UNKNOWN',
        agreedPeriod: 'UNKNOWN',
        paymentTerms: 'UNKNOWN',
        completionBasis: 'UNKNOWN',
        agreement: 'UNKNOWN',
      },
      evidenceRefs: [],
    };
    await transaction.put('OrderLine', {
      lineId: lineRef.id,
      orderRef,
      productRef: product.productRef,
      commonOfferRevisionRef: product.offerRef,
      quantity: 1,
      requestedPaymentMode: 'PREPAY',
      requestedActivationDate: captured.requestedActivationDate,
      capturedTerms: captured,
      revision: 1,
    });
    lineRefs.push(lineRef);
    terms.push(captured);
    offers.push(product.offerRef);
    assessments.push({
      lineRef,
      assessments: [
        'CommercialAgreement',
        'FinancialSettlement',
        type === 'HARDWARE' ? 'HardwareFulfillment' : 'SoftwareLifecycle',
      ].map((sourceOwner) => ({
        sourceOwner,
        knowledge: 'UNKNOWN',
        reasonKind: 'UNVERIFIED',
        reasonCode: 'SYNTHETIC_HISTORICAL_REVIEW_REQUIRED',
        observedAt: now,
        sourceRevision: null,
        basisRefs: [],
      })),
    });
  }
  await transaction.put('Order', {
    orderId: orderRef.id,
    enterpriseRef: enterprise,
    requesterAccountRef: accountRef,
    submissionRequestId: requestId,
    targetScope: scope,
    submittedAt: now,
    productType: type,
    lineRefs,
    purchaseTermsRef: termsRef,
    provisionChoiceRef: choiceRef,
    acceptanceRef: decisionRef,
    revision: 1,
  });
  await transaction.put('PurchaseTermsSnapshot', {
    purchaseTermsId: termsRef.id,
    orderRef,
    catalogRevisionRefs: offers,
    agreementRevisionRef: null,
    capturedLines: terms,
    capturedAt: now,
    revision: 1,
  });
  await transaction.put('ProvisionChoice', {
    provisionChoiceId: choiceRef.id,
    orderRef,
    choice: 'FULL',
    consentRef: null,
    revision: 1,
  });
  await transaction.put('AcceptanceDecision', {
    decisionId: decisionRef.id,
    orderRef,
    acceptance: 'REVIEW_REQUIRED',
    lineAssessments: assessments,
    basisRefs: [],
    evaluatedAt: now,
    assessedSourceRevisions: [],
    revision: 1,
  });
  const historyRef: Ref = {
    owner: 'OrderAcceptance',
    entity: 'OrderHistory',
    id: 'nfr-history-' + index,
    revision: 1,
  };
  await transaction.put('OrderHistory', {
    historyId: historyRef.id,
    owner: 'OrderAcceptance',
    actorAccountRef: accountRef,
    verifiedPersonRef: null,
    occurredAt: now,
    reason: '합성 과거 저장 규모: 실제 접수/공급/통지 관찰이 아닌 명시적 확인 대기',
    beforeRef: null,
    afterRef: orderRef,
    evidenceRefs: [],
    requestId,
    resultRefs: [orderRef],
    correctionOf: null,
    sourceRevision: 1,
  });
  await transaction.put('RequestReceipt', {
    requestId,
    principalId: accountRef.id,
    audience: 'CUSTOMER',
    operation: 'submitOrder',
    targetIdentity: { kind: 'NONE' },
    requestFingerprint: 'synthetic-history-' + index,
    idempotencyKey: 'synthetic-history-' + index,
    owner: 'OrderAcceptance',
    targetScope: scope,
    requestState: 'REVIEW_REQUIRED',
    resultRefs: [orderRef, historyRef],
    acceptedAt: now,
    updatedAt: now,
    revision: 1,
    correlationId: requestId,
  });
  const factRef: Ref = {
    owner: 'U1Host',
    entity: 'FactEnvelope',
    id: 'nfr-fact-' + index,
    revision: 1,
  };
  await transaction.put('FactEnvelope', {
    eventId: factRef.id,
    sourceOwner: 'OrderAcceptance',
    aggregateRef: orderRef,
    aggregateVersion: 1,
    sourceFactRef: orderRef,
    targetScope: scope,
    causationRequestId: requestId,
    correlationId: requestId,
    schemaVersion: '1.0.0',
    supersedesFactRef: null,
    evidenceRefs: [],
    occurredAt: now,
  });
  const permitRef: Ref = {
    owner: 'EnterpriseAccess',
    entity: 'ExecutionPermit',
    id: 'nfr-permit-' + index,
    revision: 1,
  };
  const workRef: Ref = {
    owner: 'U1Host',
    entity: 'WorkItem',
    id: 'nfr-work-' + index,
    revision: 1,
  };
  await transaction.put('ExecutionPermit', {
    permitId: permitRef.id,
    workId: workRef.id,
    consumer: 'u1-in-app-notice',
    principalId: 'u1-worker-notice',
    audience: 'SYSTEM',
    action: 'notification.materialise',
    owner: 'NotificationDelivery',
    operationId: 'NotificationDelivery.materialiseInApp',
    sourceFactRef: factRef,
    targetScope: scope,
    epoch: 'initial',
    allowed: false,
    deadlineAt: '2026-10-08T00:05:00Z',
    revision: 1,
  });
  await transaction.put('WorkItem', {
    workId: workRef.id,
    requestId,
    owner: 'NotificationDelivery',
    operationId: 'NotificationDelivery.materialiseInApp',
    targetRef: orderRef,
    sourceFactRef: factRef,
    executionPermitRef: permitRef,
    expectedRevision: 1,
    notBefore: now,
    deadlineAt: '2026-10-08T00:05:00Z',
    attempt: 0,
    state: 'REVIEW_REQUIRED',
    revision: 1,
    correlationId: requestId,
    epoch: 'initial',
    leaseOwner: null,
    leaseUntil: null,
    leaseGeneration: 1,
  });
  await transaction.put('OutboxDelivery', {
    outboxId: 'nfr-outbox-' + index,
    workRef,
    consumer: 'u1-in-app-notice',
    epoch: 'initial',
    state: 'REVIEW_REQUIRED',
    transportMessageId: null,
    attempt: 0,
    firstAttemptAt: null,
    deadlineAt: '2026-10-08T00:05:00Z',
    revision: 1,
  });
}
