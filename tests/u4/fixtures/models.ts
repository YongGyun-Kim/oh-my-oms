import {
  modelDefinition,
  primaryAttribute,
  U4_PERSISTENCE_MODELS,
  u4IdentityClaimId,
  u4ObligationBindingId,
  type ModelData,
} from '@oms/persistence';
import { u4Evidence, u4Money, u4Ref, u4Scope } from './contracts.js';

export function u4ModelFixture(name: string, id = name + '-synthetic'): ModelData {
  const model = U4_PERSISTENCE_MODELS.find((entry) => entry.name === name)!;
  const values: ModelData = {
    modelVersion: 1,
    revision: 1,
    targetScope: u4Scope(),
    enterpriseRef: u4Scope().enterpriseRef,
    knowledge: 'KNOWN',
    historyRefs: [],
    amount: u4Money('100'),
    requestedAmount: u4Money('1'),
    agreedLimit: u4Money('100'),
    principal: u4Money('100'),
    allocatedPrincipal: u4Money('0'),
    allocatedRefunded: u4Money('0'),
    unallocatedRefunded: u4Money('0'),
    allocatedReserved: u4Money('0'),
    unallocatedReserved: u4Money('0'),
    refunded: u4Money('0'),
    reserved: u4Money('0'),
    confirmed: u4Money('0'),
    limit: u4Money('100'),
    sourceNamespace: 'synthetic-receiver',
    canonicalIdentity: '00aA',
    orderId: 'synthetic-order',
    obligationKey: 'synthetic-obligation',
    label: '합성 청구',
    reason: '합성 검증 사유',
    identity: null,
    lifecycle: name === 'PaymentEvidence' ? 'REVIEW' : name === 'Invoice' ? 'ISSUED' : 'REQUESTED',
    assessmentPurpose: 'PROVISION',
    decision: 'HOLD',
    applicationResult: 'UNKNOWN',
    sourceRef: u4Evidence(),
    sourceEvidence: u4Evidence(),
    dueBasis: { kind: 'FIXED_DATE', date: '2026-12-01' },
    portions: [
      {
        portionKey: 'portion',
        paymentEvidenceRef: u4Ref('FinancialSettlement', 'PaymentEvidence'),
        allocationRef: null,
        invoiceRef: null,
        amount: u4Money('1'),
        operationId: 'operation',
        attemptId: 'attempt',
        currentResult: {
          portionKey: 'portion',
          operationId: 'operation',
          attemptId: 'attempt',
          succeeded: u4Money('0'),
          failed: u4Money('0'),
          unknown: u4Money('0'),
          pending: u4Money('1'),
          resultRevision: 1,
          actualResultIdentity: null,
        },
        priorAttempts: [],
      },
    ],
    results: [],
    effect: 'APPLIED',
    boundOrderRef: null,
  };
  if (name === 'FinancialCompletionBasis')
    Object.assign(values, {
      invoiceRef: u4Ref('FinancialSettlement', 'Invoice', id),
      termsSnapshotRef: u4Ref('OrderAcceptance', 'PurchaseTermsSnapshot'),
      sourceOwner: 'HardwareFulfillment',
      dueBasis: {
        kind: 'CONFIRMED_FACT_PLUS_DAYS',
        sourceOwner: 'HardwareFulfillment',
        event: 'ACTUAL_PROVISION_COMPLETION',
        ruleRef: u4Ref('ProductCatalog', 'CommonOfferRevision'),
        calendar: 'KST_CALENDAR_DAYS',
        days: 30,
      },
      completionView: {
        requestedSourceFactRef: u4Ref('HardwareFulfillment', 'HardwareHistory'),
        latestSourceFactRef: u4Ref('HardwareFulfillment', 'HardwareHistory'),
        aggregateRef: u4Ref('HardwareFulfillment', 'HardwareFulfillmentCase'),
        latestSourceRevision: 1,
        providedTranches: [
          {
            trancheId: 'synthetic-full-tranche',
            trancheRef: u4Ref('HardwareFulfillment', 'ShipmentTranche'),
            orderRef: u4Ref('OrderAcceptance', 'Order'),
            orderLineRef: u4Ref('OrderAcceptance', 'OrderLine'),
            termsSnapshotRef: u4Ref('OrderAcceptance', 'PurchaseTermsSnapshot'),
            completionBasis: 'HW_DELIVERY',
            completionState: 'COMPLETED',
            completedQuantity: 1,
            completedAt: '2026-12-01T00:00:00.000Z',
            hardwareDeliveredAt: '2026-12-01T00:00:00.000Z',
            customerAcceptedAt: null,
            softwareIssuedAt: null,
            resultAvailableAt: null,
            contractualStartAt: null,
            sourceRevision: 1,
            correctionOf: null,
            correctedAt: null,
            evidenceRefs: [u4Ref('HardwareFulfillment', 'HardwareHistory')],
          },
        ],
        correctionRefs: [],
        coverage: 'CURRENT',
        observedAt: '2026-12-01T00:00:00.000Z',
      },
      confirmedFact: null,
      epoch: 'initial',
      sourceContract: { profile: 'urn:oms:contract:u4-financial:1', registryVersion: 4 },
    });
  const data: ModelData = {};
  for (const attribute of model.attributes) {
    if (attribute.name in values) data[attribute.name] = structuredClone(values[attribute.name]);
    else if (attribute.nullable) data[attribute.name] = null;
    else if (attribute.name === primaryAttribute(model).name) data[attribute.name] = id;
    else if (attribute.type === 'Identifier') data[attribute.name] = attribute.name + '-synthetic';
    else if (attribute.type === 'Revision' || attribute.type === 'PositiveInteger')
      data[attribute.name] = 1;
    else if (attribute.type === 'Boolean') data[attribute.name] = true;
    else if (attribute.type === 'Instant') data[attribute.name] = '2026-12-01T00:00:00.000Z';
    else if (attribute.type === 'Enum') data[attribute.name] = attribute.allowed_values![0];
    else if (attribute.type === 'Ref')
      data[attribute.name] = u4Ref(
        modelDefinition(attribute.references!).owner,
        attribute.references!,
      );
    else if (attribute.type.endsWith(':Refs') || attribute.type.endsWith(':EvidenceList'))
      data[attribute.name] = [];
    else if (attribute.type === 'U4Contract:Ref')
      data[attribute.name] = u4Ref('AfterSalesDecision', 'AfterSalesDecisionRecord');
    else if (attribute.type === 'U4Contract:RefundRef')
      data[attribute.name] = u4Ref('FinancialSettlement', 'RefundCase');
    else if (attribute.type === 'U4Contract:AgreementRef')
      data[attribute.name] = u4Ref('CommercialAgreement', 'AgreementRevision');
    else if (attribute.type === 'U4Contract:OrderRef')
      data[attribute.name] = u4Ref('OrderAcceptance', 'Order');
    else throw new Error('미등록 합성 fixture attribute');
  }
  if (name.includes('IdentityClaim'))
    data.claimId = u4IdentityClaimId(String(data.sourceNamespace), String(data.canonicalIdentity));
  if (name === 'FinancialInvoiceBinding')
    data.bindingId = u4ObligationBindingId(String(data.orderId), String(data.obligationKey));
  return data;
}
