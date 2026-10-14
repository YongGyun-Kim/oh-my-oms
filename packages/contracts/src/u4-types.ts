import type { CommandMeta, Knowledge, Money, Ref, TargetScope } from './types.js';
import type {
  U3CapturedLine,
  U3OrderInput,
  U3OrderLineInput,
  ConditionBinding,
  U3AppliedTerms,
  U3ProposalInput,
} from './u3-types.js';
export type FinancialSourceContract =
  | { profile: 'urn:oms:contract:u3-commercial:2'; registryVersion: 3 }
  | { profile: 'urn:oms:contract:u4-financial:1'; registryVersion: 4 };

export type U4AssessmentPurpose = 'SALE_ACCEPTANCE' | 'PROVISION';
export type U4DueBasis =
  | { kind: 'FIXED_DATE'; date: string }
  | {
      kind: 'CONFIRMED_FACT_PLUS_DAYS';
      sourceOwner: 'HardwareFulfillment' | 'SoftwareLifecycle';
      event: 'ACTUAL_PROVISION_COMPLETION' | 'AGREED_CONFIRMED_FACT';
      ruleRef: Ref;
      calendar: 'KST_CALENDAR_DAYS';
      days: number;
    };
export interface U4Evidence {
  documentReference: string;
  verifiedByRef: Ref;
  verifiedAt: string;
  summary: string;
}
export interface U4PaymentObligation {
  obligationKey: string;
  label: string;
  amount: Money;
  description: string;
  dueBasis: U4DueBasis;
  requiredBeforeProvision: boolean;
  agreementEvidenceRefs: Ref[];
}
export interface U4AgreedPaymentPlan {
  planRevision: number;
  total: Money;
  obligations: U4PaymentObligation[];
  agreementRevisionRef: Ref;
  agreementApprovalRef: Ref;
  customerConsentRef: Ref | null;
  knowledge: 'KNOWN';
}
export type U4PaymentPlanDraft = Pick<
  U4AgreedPaymentPlan,
  'planRevision' | 'total' | 'obligations' | 'knowledge'
>;
export interface U4AgreementPlanInput {
  meta: CommandMeta;
  enterpriseRef: Ref;
  sourceAgreementRevisionRef: Ref;
  planDraft: U4PaymentPlanDraft;
}
export type U4ConditionBinding =
  | ConditionBinding
  | {
      conditionKey: 'PAYMENT';
      value: { mode: 'MIXED'; termsRef: Ref };
      sourceRef: Ref;
      effectiveWindow: import('./u3-types.js').EffectiveWindow;
      evidenceRefs: Ref[];
    };
export interface U4OrderLineInput extends Omit<
  U3OrderLineInput,
  'paymentMode' | 'conditionBindings'
> {
  conditionBindings: U4ConditionBinding[];
}
export interface U4OrderInput extends Omit<U3OrderInput, 'lines'> {
  lines: U4OrderLineInput[];
  paymentPlanRef: Ref;
  renewal: { entitlementRef: Ref; renewalCycleRef: Ref; originalTermsRef: Ref } | null;
}
export interface U4CapturedLine extends Omit<U3CapturedLine, 'paymentMode' | 'conditionBindings'> {
  paymentMode: 'PREPAY' | 'POSTPAY' | 'MIXED';
  conditionBindings: U4ConditionBinding[];
}
export interface U4AppliedTerms extends Omit<U3AppliedTerms, 'capturedLines'> {
  capturedLines: U4CapturedLine[];
}
export interface U4PlanProposalInput extends Omit<
  U3ProposalInput,
  'targetOrderRef' | 'targetEntitlementRef' | 'targetRenewalCycleRef'
> {
  targetOrderRef: Ref;
  targetEntitlementRef: null;
  targetRenewalCycleRef: null;
  paymentPlanRef: Ref;
}
export type U4ApplyPlanInput = {
  meta: CommandMeta;
  targetScope: TargetScope;
  orderRef: Ref;
  customerConsentRef: Ref;
  newTermsRef: Ref;
} & (
  | { changeKind: 'REVIEW_PAYMENT_PLAN_CHANGE'; afterSalesDecisionRef: null }
  | { changeKind: 'ACCEPTED_AFTERSALES_CHANGE'; afterSalesDecisionRef: Ref }
);
export interface U4PaymentIdentity {
  sourceProfileId: string;
  sourceProfileRevision: number;
  sourceNamespace: string;
  canonicalIdentity: string;
  aliases: string[];
}
export interface U4AllocationItem {
  invoiceRef: Ref;
  amount: Money;
}
export interface U4CommandInput {
  meta: CommandMeta;
  targetScope: TargetScope;
}
export interface U4OrderCommandInput extends U4CommandInput {
  orderRef: Ref;
}
export interface U4PaymentPlanInput extends U4OrderCommandInput {
  plan: U4AgreedPaymentPlan;
  purchaseTermsSnapshotRef: Ref;
}
export interface U4InvoiceInput extends U4OrderCommandInput {
  chargeTermsRef: Ref;
  planRevision: number;
  obligationKey: string;
  label: string;
  amount: Money;
  dueBasis: U4DueBasis;
  renewalCycleRefs: Ref[];
  sourceEvidence: U4Evidence;
  correctionOf: Ref | null;
}
export interface U4PaymentEvidenceInput extends U4CommandInput {
  enterpriseRef: Ref;
  sourceEvidence: U4Evidence;
  amount: Money | null;
  actualPaidAt: string | null;
  identity: U4PaymentIdentity | null;
  orderRef: Ref | null;
  correctionOf: Ref | null;
}
export interface U4ConfirmPaymentInput extends U4CommandInput {
  paymentEvidenceRef: Ref;
  amount: Money;
  actualPaidAt: string;
  identity: U4PaymentIdentity;
  sourceEvidence: U4Evidence;
}
export interface U4CancelInvoiceInput extends U4OrderCommandInput {
  invoiceRef: Ref;
  sourceEvidence: U4Evidence;
}
export interface U4PaymentCorrectionInput extends U4CommandInput {
  paymentEvidenceRef: Ref;
  correctionKind: 'DISPUTE' | 'REVERSE' | 'CONFIRM';
  sourceEvidence: U4Evidence;
  identity: U4PaymentIdentity | null;
  amount: Money | null;
  actualPaidAt: string | null;
}
export interface U4AllocationBatchInput extends U4OrderCommandInput {
  paymentEvidenceRef: Ref;
  items: U4AllocationItem[];
  renewalCycleRefs: Ref[];
  sourceEvidence: U4Evidence;
}
export interface U4AllocationCorrectionInput extends U4OrderCommandInput {
  allocationRef: Ref;
  sourceEvidence: U4Evidence;
}
export interface U4PaymentBindingCorrectionInput extends U4OrderCommandInput {
  paymentEvidenceRef: Ref;
  previousOrderRef: Ref;
  sourceEvidence: U4Evidence;
}
export interface U4EligibilityInput extends U4OrderCommandInput {
  assessmentPurpose: U4AssessmentPurpose;
  agreementRevisionRef: Ref;
  planRevision: number;
  orderLineRefs: Ref[];
  renewalCycleRefs: Ref[];
}
export interface U4RestrictionInput extends U4OrderCommandInput {
  restrictionKey: string;
  assessmentPurpose: U4AssessmentPurpose;
  effect: 'RESTRICT' | 'RELEASE';
  agreementRevisionRef: Ref;
  sourceEvidence: U4Evidence;
}
export interface U4RefundPortion {
  portionKey: string;
  paymentEvidenceRef: Ref;
  allocationRef: Ref | null;
  invoiceRef: Ref | null;
  amount: Money;
  operationId: string;
  attemptId: string;
}
export interface U4RefundInput extends U4OrderCommandInput {
  approvalRootId: string;
  afterSalesDecisionRef: Ref;
  requestedAmount: Money;
  portions: U4RefundPortion[];
  sourceEvidence: U4Evidence;
}
export interface U4RefundResultPortion {
  portionKey: string;
  operationId: string;
  attemptId: string;
  succeeded: Money;
  failed: Money;
  unknown: Money;
  pending: Money;
  resultRevision: number;
  actualResultIdentity: U4PaymentIdentity | null;
}
export interface U4RefundResultInput extends U4OrderCommandInput {
  refundCaseRef: Ref;
  results: U4RefundResultPortion[];
  sourceEvidence: U4Evidence;
  correctionOf: Ref | null;
}
export interface U4RefundStatePortion extends U4RefundPortion {
  currentResult: U4RefundResultPortion;
  priorAttempts: U4RefundResultPortion[];
}
export interface U4EligibilityView {
  orderRef: Ref;
  assessmentPurpose: U4AssessmentPurpose;
  planRevision: number;
  agreementRevisionRef: Ref;
  decision: 'ALLOW' | 'HOLD' | 'UNVERIFIED';
  basisRefs: Ref[];
  sourceRevision: number;
  renewalCycleRefs: Ref[];
}
export interface U4FinancialQuery {
  targetScope: TargetScope;
  orderRef: Ref;
}
export interface U4FinancialPageQuery {
  targetScope: TargetScope;
  cursor: string | null;
  limit: number;
}
export interface U4PublicInvoice {
  invoiceRef: Ref;
  label: string;
  amount: Money;
  netPaid: Money;
  remaining: Money;
  dueDate: string | null;
  knowledge: Knowledge;
  lifecycle: 'DRAFT' | 'ISSUED' | 'SUPERSEDED' | 'CANCELLED';
}
export interface U4FinancialView {
  orderRef: Ref;
  targetScope: TargetScope;
  invoices: U4PublicInvoice[];
  actualPayment: Money;
  allocated: Money;
  unallocated: Money;
  refunded: Money;
  reserved: Money;
  knowledge: Knowledge;
  sourceRefs: Ref[];
  observedAt: string;
}
