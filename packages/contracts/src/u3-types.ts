import type { CommandMeta, Money, Ref, TargetScope } from './types.js';

export interface U3Period {
  startDate: string;
  endDate: string;
  timeZone: 'Asia/Seoul';
  endRule: 'INCLUSIVE_DATE' | 'EXCLUSIVE_DATE';
  ruleRef: Ref;
}
export interface EffectiveWindow {
  startAt: string;
  endAt: string | null;
  startInclusive: boolean;
  endInclusive: boolean;
}
interface ConditionSource {
  sourceRef: Ref;
  effectiveWindow: EffectiveWindow;
  evidenceRefs: Ref[];
}
export type ConditionBinding = ConditionSource &
  (
    | { conditionKey: 'PRICE'; value: Money }
    | { conditionKey: 'PAYMENT'; value: { mode: 'PREPAY' | 'POSTPAY'; termsRef: Ref } }
    | { conditionKey: 'PROVISION'; value: { choice: 'FULL'; termsRef: Ref } }
    | { conditionKey: 'PERIOD'; value: U3Period }
    | { conditionKey: 'COMPLETION' | 'RENEWAL'; value: Ref }
    | { conditionKey: 'VISIBILITY'; value: boolean }
  );
type WithoutSource<T> = T extends unknown ? Omit<T, 'sourceRef'> : never;
export type CommonConditionDraft = WithoutSource<ConditionBinding>;
export interface CommonOfferDraft {
  effectiveWindow: EffectiveWindow;
  conditions: CommonConditionDraft[];
  revisionEvidenceRefs: Ref[];
}
export interface U3ProductInput {
  meta: CommandMeta;
  productType: 'HARDWARE' | 'SOFTWARE';
  softwareTermKind: 'PERPETUAL' | 'TERM' | null;
  label: string;
  salesDescription: string;
  commonPrice: Money;
  salesConditionRefs: Ref[];
  offerDraft: CommonOfferDraft | null;
  saleState?: 'OFFERABLE' | 'SUSPENDED';
}
export interface U3CommonOfferQuery {
  targetRef: Ref;
  targetScope: TargetScope | null;
}
export interface U3AgreementInput {
  meta: CommandMeta;
  enterpriseRef: Ref;
  productRefs: Ref[];
  commercialTermsRef: Ref;
  provisionTermsRef: Ref;
  renewalTermsRef: Ref | null;
  agreementEvidenceRefs: Ref[];
}
export interface U3AgreementRegistrationInput extends U3AgreementInput {
  contractRef: Ref | null;
  changeRequestRef?: Ref | null;
  effectiveWindow: EffectiveWindow;
  conditions: CommonConditionDraft[];
}
export interface U3ContractChangeInput {
  meta: CommandMeta;
  enterpriseRef: Ref;
  targetScope: TargetScope;
  contractRef: Ref;
  requestedTerms: string;
  agreementEvidenceRefs: Ref[];
}
export interface U3OfferExceptionInput {
  meta: CommandMeta;
  enterpriseRef: Ref;
  productRef: Ref;
  agreementRevisionRef: Ref;
  visibility: boolean;
  price: Money | null;
}
export interface U3CommercialTermsQuery {
  targetScope: TargetScope;
  productRef: Ref;
  commonOfferRevisionRef: Ref;
}
export interface U3ResolvedCommercialTerms {
  enterpriseRef: Ref;
  productRef: Ref;
  commonOfferRevisionRef: Ref;
  agreementRevisionRefs: Ref[];
  conditionBindings: ConditionBinding[];
}
export interface U3AgreementApprovalInput {
  meta: CommandMeta;
  targetRef: Ref;
  decision: 'APPROVE' | 'DECLINE';
  basisRefs: Ref[];
}
export interface U3ProposalInput {
  meta: CommandMeta;
  targetScope: TargetScope;
  targetOrderRef: Ref | null;
  targetEntitlementRef: Ref | null;
  targetRenewalCycleRef: Ref | null;
  originalTermsRef: Ref;
  proposedTermsRef: Ref;
  proposedTerms: U3ProposalTerms;
  priceBreakdown: U3OrderPriceBreakdown;
  supersedesRef: Ref | null;
  agreementEvidenceRefs: Ref[];
}
export interface U3ConsentInput {
  meta: CommandMeta;
  targetScope: TargetScope;
  proposalRef: Ref;
  proposalRevision: number;
  termsFingerprint: string;
  decision: 'ACCEPT' | 'DECLINE';
}
export interface U3ProposalLine {
  productRef: Ref;
  quantity: number;
  price: Money;
  period: U3Period | null;
  conditionRefs: Ref[];
}
export interface U3ProposalTerms {
  termsRecordRef: Ref;
  lines: U3ProposalLine[];
}
export type U3Knowledge = 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
export interface U3PriceAdjustment {
  itemId: string;
  kind: 'TAX' | 'SHIPPING' | 'FEE' | 'DISCOUNT';
  knowledge: U3Knowledge;
  amount: Money | null;
  position: 'SEPARATE' | 'UNIT_PRICE' | 'OTHER_ITEM' | 'NOT_APPLICABLE';
  includedInItemId: string | null;
  evidenceRefs: Ref[];
  confirmedByRef: Ref | null;
}
export interface U3OrderPriceBreakdown {
  lineAmounts: (Money | null)[];
  productAmount: Money | null;
  adjustments: U3PriceAdjustment[];
  total: Money | null;
  knowledge: U3Knowledge;
}
export interface U3ProposalQuery {
  targetRef: Ref;
  targetScope: TargetScope;
}
export interface U3ProposalView {
  proposalRef: Ref;
  proposalRevision: number;
  targetScope: TargetScope;
  targetOrderRef: Ref | null;
  targetEntitlementRef: Ref | null;
  targetRenewalCycleRef: Ref | null;
  originalTerms: U3ProposalTerms;
  proposedTerms: U3ProposalTerms;
  originalPriceBreakdown: U3OrderPriceBreakdown;
  priceBreakdown: U3OrderPriceBreakdown;
  termsFingerprint: string;
  agreementEvidenceRefs: Ref[];
  consentRefs: Ref[];
  state: 'AWAITING_CONSENT' | 'ACCEPTED' | 'APPLIED' | 'DECLINED' | 'STALE' | 'UNVERIFIED';
  applicationRefs?: Ref[];
}
export interface U3OrderLineInput {
  productRef: Ref;
  commonOfferRevisionRef: Ref;
  agreementRevisionRefs: Ref[];
  conditionBindings: ConditionBinding[];
  quantity: number;
  paymentMode: 'PREPAY' | 'POSTPAY';
  requestedActivationDate: string | null;
}
export interface U3OrderInput {
  meta: CommandMeta;
  targetScope: TargetScope;
  productType: 'HARDWARE' | 'SOFTWARE';
  lines: U3OrderLineInput[];
  provisionChoice: 'FULL';
  partialConsentRef: null;
  priceConfirmation?: U3PriceConfirmation | null;
}
export interface U3CapturedLine extends U3OrderLineInput {
  purchasePrice: Money | null;
  priceKnowledge: U3Knowledge;
  paymentTermsRef: Ref | null;
  agreedPeriod: U3Period | null;
  completionBasisRef: Ref | null;
}
// 적용 결과에 고정한 인라인 값이다. 원본 확인·현재 권한은 소유 서비스가 별도로 대조한다.
export interface U3AppliedTerms {
  terms: U3ProposalTerms;
  capturedLines: U3CapturedLine[];
  priceBreakdown: U3OrderPriceBreakdown;
  targetScope: TargetScope;
  proposalRevision: number;
  termsFingerprint: string;
}
export interface U3PriceConfirmation {
  priceBreakdown: U3OrderPriceBreakdown;
  confirmedByRef: Ref;
  evidenceRefs: Ref[];
}
export interface U3OrderQuery {
  targetRef: Ref;
  targetScope: TargetScope;
}
export interface U3OrderLineView {
  orderLineRef: Ref;
  productRef: Ref;
  quantity: number;
  purchasePrice: Money;
  paymentTermsRef: Ref;
  agreedPeriod: U3Period | null;
  completionBasisRef: Ref;
  commonOfferRevisionRef: Ref;
  agreementRevisionRefs: Ref[];
  conditionBindings: ConditionBinding[];
}
export interface U3OrderView {
  orderRef: Ref;
  targetScope: TargetScope;
  productType: 'HARDWARE' | 'SOFTWARE';
  lines: U3OrderLineView[];
  purchaseTermsSnapshotRef: Ref;
  commonOfferRevisionRefs: Ref[];
  agreementRevisionRefs: Ref[];
  conditionBindings: ConditionBinding[];
  provisionChoice: 'FULL';
  consentRef: Ref | null;
  acceptance: 'REVIEW_REQUIRED' | 'ACCEPTED' | 'DECLINED' | 'UNVERIFIED';
  basisRefs: Ref[];
  priceBreakdown?: U3OrderPriceBreakdown;
  currentTermsRef?: Ref;
  appliedTerms?: U3AppliedTerms;
}
export type U3ApplyOrderChangeInput = {
  meta: CommandMeta;
  targetScope: TargetScope;
  orderRef: Ref;
  customerConsentRef: Ref;
  newTermsRef: Ref;
} & (
  | { changeKind: 'REVIEW_PRICE_CHANGE'; afterSalesDecisionRef: null }
  | { changeKind: 'ACCEPTED_AFTERSALES_CHANGE'; afterSalesDecisionRef: Ref }
);
export interface U3OrderDecisionInput {
  meta: CommandMeta;
  targetScope: TargetScope;
  targetRef: Ref;
  decision: 'ACCEPT' | 'REJECT' | 'HOLD';
  basisRefs: Ref[];
}
