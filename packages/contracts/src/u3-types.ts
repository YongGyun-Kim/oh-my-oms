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
  targetOrderRef: Ref | null;
  targetEntitlementRef: Ref | null;
  targetRenewalCycleRef: Ref | null;
  originalTermsRef: Ref;
  proposedTermsRef: Ref;
  agreementEvidenceRefs: Ref[];
}
export interface U3ConsentInput {
  meta: CommandMeta;
  proposalRef: Ref;
  proposalRevision: number;
  decision: 'ACCEPT' | 'DECLINE';
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
}
export type U3ApplyOrderChangeInput = {
  meta: CommandMeta;
  orderRef: Ref;
  customerConsentRef: Ref;
  newTermsRef: Ref;
} & (
  | { changeKind: 'REVIEW_PRICE_CHANGE'; afterSalesDecisionRef: null }
  | { changeKind: 'ACCEPTED_AFTERSALES_CHANGE'; afterSalesDecisionRef: Ref }
);
export interface U3OrderDecisionInput {
  meta: CommandMeta;
  targetRef: Ref;
  decision: 'ACCEPT' | 'REJECT' | 'HOLD';
  basisRefs: Ref[];
}
