export type Audience = 'CUSTOMER' | 'STAFF' | 'SYSTEM';
export interface Ref {
  owner: string;
  entity: string;
  id: string;
  revision: number;
}
export interface Money {
  currency: 'KRW';
  value: string;
}
export interface CommandMeta {
  clientRequestId: string;
  expectedRevision: number | null;
  reason: string;
  evidenceRefs: Ref[];
}
export interface TargetScope {
  enterpriseRef: Ref;
  departmentRef: Ref | null;
  siteRef: Ref | null;
  contextPolicyRef: Ref;
  organisationRevision: number;
}
export interface ActionScope {
  action: string;
  kind: 'DEPARTMENT_SITE' | 'SITE_ALL_DEPARTMENTS' | 'DEPARTMENT_ALL_SITES' | 'ENTERPRISE_ALL';
  enterpriseRef: Ref;
  departmentRefs: Ref[];
  siteRefs: Ref[];
}
export interface OrderLineInput {
  productRef: Ref;
  commonOfferRevisionRef: Ref;
  agreementRevisionRef: Ref | null;
  quantity: number;
  paymentMode: 'PREPAY' | 'POSTPAY';
  requestedActivationDate: string | null;
}
export interface OrderInput {
  meta: CommandMeta;
  targetScope: TargetScope;
  productType: 'HARDWARE' | 'SOFTWARE';
  lines: OrderLineInput[];
  provisionChoice: 'FULL' | 'PARTIAL';
  partialConsentRef: Ref | null;
}
export interface Receipt {
  requestId: string;
  requestState:
    'ACCEPTED' | 'PROCESSING' | 'RESULT_RECORDED' | 'REVIEW_REQUIRED' | 'TECHNICAL_FAILED';
  owner: string;
  targetRef: Ref | null;
  resultRefs: Ref[];
  acceptedAt: string;
  updatedAt: string;
  statusRevision: number;
  retryAfterMilliseconds: number | null;
}
export interface ServiceContext {
  principalId: string;
  actorAccountRef: Ref | null;
  verifiedPersonRef: Ref | null;
  identityAssertionRef: Ref;
  audience: Audience;
  accessEvaluationRef: Ref | null;
  executionPermitRef: Ref | null;
  correlationId: string;
  deadlineAt: string;
}
export interface PreIdentityContext {
  attemptId: string;
  audience: 'CUSTOMER' | 'STAFF';
  correlationId: string;
  deadlineAt: string;
}
export interface LimitedIdentityContext {
  audience: 'CUSTOMER' | 'STAFF';
  correlationId: string;
  deadlineAt: string;
  subjectAccountRef: Ref;
  challengeId: string;
  purpose: 'MFA_ENROLMENT' | 'RECOVERY_VERIFICATION';
  verificationBasisRefs: Ref[];
}
export interface Work {
  workId: string;
  requestId: string;
  owner: string;
  operationId: string;
  targetRef: Ref | null;
  sourceFactRef: Ref | null;
  executionPermitRef: Ref;
  expectedRevision: number | null;
  notBefore: string;
  deadlineAt: string;
  attempt: number;
  correlationId: string;
}
export type Knowledge = 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  correlationId: string;
}
export type InvocationTarget =
  | { kind: 'NONE' }
  | { kind: 'RECORD'; recordRef: Ref }
  | { kind: 'ENTERPRISE'; enterpriseRef: Ref }
  | { kind: 'REQUEST'; requestId: string }
  | { kind: 'CHALLENGE'; challengeId: string };
