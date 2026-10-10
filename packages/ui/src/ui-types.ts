import type { ActionScope, Ref, Money, TargetScope } from '@oms/contracts';
export interface IdentityView {
  accountRef: Ref | null;
  challengeId: string | null;
  phase: string;
}
export interface U2LimitedOutcome {
  claimReceiptRef: Ref;
  authorityRef: Ref;
  purpose: 'MFA_REENROLMENT' | 'INVITATION_ACCEPTANCE';
  expiresAt: string;
  phase: 'ENROLMENT_ONLY';
  caseRef?: Ref;
}
export interface U2StatusView {
  sourceRef: Ref;
  state: string;
  knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
  remainingAction: string;
  expiresAt: string | null;
  actualEffect: 'CONFIRMED' | 'UNCONFIRMED';
  noticeDelivery: 'UNKNOWN' | 'NOT_REQUESTED' | 'REQUESTED' | 'DELIVERED';
  providerResultRefs?: Ref[];
  originalEffectKnowledge?: 'KNOWN' | 'UNKNOWN';
}
export interface U2StatusPage {
  items: U2StatusView[];
  nextCursor: string | null;
  observedAt: string;
}
export interface Known<T> {
  knowledge: 'KNOWN';
  data: T;
  sourceRefs: Ref[];
  observedAt: string;
}
export interface Page<T> {
  items: Known<T>[];
  nextCursor: string | null;
  observedAt: string;
}
export interface ApplicationView {
  applicationRef: Ref;
  applicantAccountRef: Ref;
  legalName: string;
  designatedContact: string;
  state: string;
  submittedAt: string;
  confirmation: string;
  initialAdministratorRef: Ref | null;
}
export interface OrganisationView {
  recordRef: Ref;
  label: string;
  active: boolean;
}
export interface EnterpriseView {
  scopeGrants: ActionScope[];
  legalName: string;
  enterpriseRef: Ref;
  administratorCount: number;
  orderingContextPolicy: {
    departmentUsage: 'UNSET' | 'USED' | 'NOT_USED';
    siteUsage: 'UNSET' | 'USED' | 'NOT_USED';
  };
  departments: OrganisationView[];
  sites: OrganisationView[];
  customerRoles: { roleRef: Ref; label: string; actionScopes: ActionScope[] }[];
  memberships: {
    membershipRef: Ref;
    accountRef: Ref;
    displayName: string;
    active: boolean;
    administrator: boolean;
    departmentRef: Ref | null;
    siteRef: Ref | null;
    grantRefs: Ref[];
  }[];
  sectionCursors: {
    departments: string | null;
    sites: string | null;
    roles: string | null;
    memberships: string | null;
  };
}
export interface ProductView {
  productRef: Ref;
  commonOfferRevisionRef: Ref;
  productType: 'HARDWARE' | 'SOFTWARE';
  softwareTermKind: 'PERPETUAL' | 'TERM' | null;
  label: string;
  salesDescription: string;
  commonPrice: Money;
  resolvedPrice: Money | null;
  priceKnowledge: string;
}
export interface ReviewView {
  orderRef: Ref;
  requestId: string;
  targetScope: TargetScope;
  productType: string;
  acceptance: string;
  lines: {
    lineRef: Ref;
    productRef: Ref;
    quantity: number;
    assessments: {
      sourceOwner: string;
      knowledge: string;
      reasonKind: string;
      reasonCode: string;
    }[];
  }[];
  nextActions: string[];
}
export const stateText: Record<string, string> = {
  PENDING: '직원 확인 대기',
  APPROVED: '기업 이용 승인',
  DECLINED: '이용 신청 거절',
  UNVERIFIED: '근거 확인 필요',
  REVIEW_REQUIRED: '전체 조건 확인 대기',
  RESULT_RECORDED: '결과 기록',
  KNOWN: '확인됨',
  UNKNOWN: '미확인',
  CONFLICT: '상충',
  UNAVAILABLE: '조회 실패',
};

export type CurrentEnterpriseContext = Pick<
  EnterpriseView,
  'legalName' | 'enterpriseRef' | 'orderingContextPolicy' | 'departments' | 'sites'
>;
export interface CustomerContextView extends CurrentEnterpriseContext {
  actionScopes: ActionScope[];
  availableActions: string[];
  managementAvailable: boolean;
  sectionCursors: { departments: string | null; sites: string | null; scopes: string | null };
}
