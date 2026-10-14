import type { Model } from './model-catalog.js';

// Protected auxiliary originals; indexes are derived and never an independent authority.
export const U4_SUPPORT_MODELS: readonly Model[] = Object.freeze([
  {
    name: 'FinancialCompletionBasis',
    owner: 'FinancialSettlement',
    attributes: [
      { name: 'invoiceId', type: 'Identifier', required: true, unique: true },
      {
        name: 'invoiceRef',
        type: 'U4Contract:InvoiceRef',
        required: true,
        references: 'Invoice',
        nullable: false,
      },
      {
        name: 'orderRef',
        type: 'U4Contract:OrderRef',
        required: true,
        references: 'Order',
        nullable: false,
      },
      { name: 'termsSnapshotRef', type: 'U4Contract:Ref', required: true },
      {
        name: 'sourceOwner',
        type: 'Enum',
        required: true,
        allowed_values: ['HardwareFulfillment', 'SoftwareLifecycle'],
      },
      { name: 'dueBasis', type: 'U4Contract:DueBasis', required: true },
      { name: 'completionView', type: 'U4Contract:CompletionFactView', required: true },
      {
        name: 'confirmedFact',
        type: 'U4Contract:ConfirmedDueFact',
        required: true,
        nullable: true,
      },
      { name: 'epoch', type: 'Identifier', required: true },
      { name: 'sourceContract', type: 'U4Contract:SourceContract', required: true },
      { name: 'targetScope', type: 'U4Contract:TargetScope', required: true },
      { name: 'historyRefs', type: 'U4Contract:Refs', required: true },
      { name: 'modelVersion', type: 'PositiveInteger', required: true, allowed_values: ['1'] },
      { name: 'revision', type: 'Revision', required: true },
    ],
    constraints: [],
  },
  {
    name: 'FinancialIdentityClaim',
    owner: 'FinancialSettlement',
    attributes: [
      {
        name: 'claimId',
        type: 'Identifier',
        required: true,
        unique: true,
      },
      {
        name: 'canonicalPaymentId',
        type: 'Identifier',
        required: true,
      },
      {
        name: 'sourceNamespace',
        type: 'U4Contract:ExternalReference',
        required: true,
      },
      {
        name: 'canonicalIdentity',
        type: 'U4Contract:ExternalReference',
        required: true,
      },
      {
        name: 'modelVersion',
        type: 'PositiveInteger',
        required: true,
        allowed_values: ['1'],
      },
      {
        name: 'revision',
        type: 'Revision',
        required: true,
      },
    ],
    constraints: [],
  },
  {
    name: 'FinancialPaymentBinding',
    owner: 'FinancialSettlement',
    attributes: [
      {
        name: 'paymentId',
        type: 'Identifier',
        required: true,
        unique: true,
      },
      {
        name: 'orderRef',
        type: 'U4Contract:OrderRef',
        required: true,
        nullable: true,
      },
      {
        name: 'historyRefs',
        type: 'U4Contract:Refs',
        required: true,
      },
      {
        name: 'modelVersion',
        type: 'PositiveInteger',
        required: true,
        allowed_values: ['1'],
      },
      {
        name: 'revision',
        type: 'Revision',
        required: true,
      },
    ],
    constraints: [],
  },
  {
    name: 'FinancialInvoiceBinding',
    owner: 'FinancialSettlement',
    attributes: [
      {
        name: 'bindingId',
        type: 'Identifier',
        required: true,
        unique: true,
      },
      {
        name: 'orderId',
        type: 'Identifier',
        required: true,
      },
      {
        name: 'obligationKey',
        type: 'Identifier',
        required: true,
      },
      {
        name: 'invoiceRef',
        type: 'U4Contract:InvoiceRef',
        required: true,
        nullable: true,
      },
      {
        name: 'historyRefs',
        type: 'U4Contract:Refs',
        required: true,
      },
      {
        name: 'modelVersion',
        type: 'PositiveInteger',
        required: true,
        allowed_values: ['1'],
      },
      {
        name: 'revision',
        type: 'Revision',
        required: true,
      },
    ],
    constraints: [],
  },
  {
    name: 'FinancialPaymentBalance',
    owner: 'FinancialSettlement',
    attributes: [
      {
        name: 'paymentId',
        type: 'Identifier',
        required: true,
        unique: true,
      },
      {
        name: 'principal',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'allocatedPrincipal',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'allocatedRefunded',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'unallocatedRefunded',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'allocatedReserved',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'unallocatedReserved',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'modelVersion',
        type: 'PositiveInteger',
        required: true,
        allowed_values: ['1'],
      },
      {
        name: 'revision',
        type: 'Revision',
        required: true,
      },
    ],
    constraints: [],
  },
  {
    name: 'FinancialInvoiceBalance',
    owner: 'FinancialSettlement',
    attributes: [
      {
        name: 'invoiceId',
        type: 'Identifier',
        required: true,
        unique: true,
      },
      {
        name: 'amount',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'allocatedPrincipal',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'refunded',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'reserved',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'modelVersion',
        type: 'PositiveInteger',
        required: true,
        allowed_values: ['1'],
      },
      {
        name: 'revision',
        type: 'Revision',
        required: true,
      },
    ],
    constraints: [],
  },
  {
    name: 'FinancialApprovalBalance',
    owner: 'FinancialSettlement',
    attributes: [
      {
        name: 'approvalRootId',
        type: 'Identifier',
        required: true,
        unique: true,
      },
      {
        name: 'approvalRef',
        type: 'U4Contract:Ref',
        required: true,
      },
      {
        name: 'limit',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'confirmed',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'reserved',
        type: 'U4Contract:Money',
        required: true,
      },
      {
        name: 'modelVersion',
        type: 'PositiveInteger',
        required: true,
        allowed_values: ['1'],
      },
      {
        name: 'revision',
        type: 'Revision',
        required: true,
      },
    ],
    constraints: [],
  },
  {
    name: 'FinancialRefundIdentityClaim',
    owner: 'FinancialSettlement',
    attributes: [
      {
        name: 'claimId',
        type: 'Identifier',
        required: true,
        unique: true,
      },
      {
        name: 'sourceNamespace',
        type: 'U4Contract:ExternalReference',
        required: true,
      },
      {
        name: 'canonicalIdentity',
        type: 'U4Contract:ExternalReference',
        required: true,
      },
      {
        name: 'refundCaseRef',
        type: 'U4Contract:RefundRef',
        required: true,
      },
      {
        name: 'operationId',
        type: 'Identifier',
        required: true,
      },
      {
        name: 'portionKey',
        type: 'Identifier',
        required: true,
      },
      {
        name: 'modelVersion',
        type: 'PositiveInteger',
        required: true,
        allowed_values: ['1'],
      },
      {
        name: 'revision',
        type: 'Revision',
        required: true,
      },
    ],
    constraints: [],
  },
  {
    name: 'FinancialRestriction',
    owner: 'FinancialSettlement',
    attributes: [
      {
        name: 'restrictionId',
        type: 'Identifier',
        required: true,
        unique: true,
      },
      {
        name: 'orderRef',
        type: 'U4Contract:OrderRef',
        required: true,
      },
      {
        name: 'assessmentPurpose',
        type: 'U4Contract:AssessmentPurpose',
        required: true,
      },
      {
        name: 'active',
        type: 'Boolean',
        required: true,
      },
      {
        name: 'agreementRevisionRef',
        type: 'U4Contract:AgreementRef',
        required: true,
      },
      {
        name: 'sourceEvidence',
        type: 'U4Contract:Evidence',
        required: true,
      },
      {
        name: 'targetScope',
        type: 'U4Contract:TargetScope',
        required: true,
      },
      {
        name: 'modelVersion',
        type: 'PositiveInteger',
        required: true,
        allowed_values: ['1'],
      },
      {
        name: 'revision',
        type: 'Revision',
        required: true,
      },
    ],
    constraints: [],
  },
]);
