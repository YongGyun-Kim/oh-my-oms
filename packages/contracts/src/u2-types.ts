import type { Ref } from './types.js';

export type AxisSelector = { kind: 'EXACT'; ref: Ref } | { kind: 'NOT_USED' } | { kind: 'ALL' };
export interface ScopeV2 {
  enterpriseRef: Ref;
  action: string;
  kind: 'DEPARTMENT_SITE' | 'SITE_ALL_DEPARTMENTS' | 'DEPARTMENT_ALL_SITES' | 'ENTERPRISE_ALL';
  departmentSelector: AxisSelector;
  siteSelector: AxisSelector;
  sourcePolicyRevision: number;
}
export interface U2PurposeContext {
  audience: 'CUSTOMER' | 'STAFF';
  subjectAccountRef: Ref;
  bindingRef: Ref;
  bindingGeneration: number;
  securityGeneration: number;
  recoveryEpoch: string;
  purpose: 'INITIAL_MFA' | 'INVITATION_ACCEPTANCE' | 'RECOVERY_VERIFICATION' | 'MFA_REENROLMENT';
  sourceRef: Ref;
  enrollmentTarget: Ref | null;
  challengeId: string;
  authorityRef: Ref;
  verificationRef: Ref | null;
  partyContextRef: Ref | null;
  expiresAt: string;
  correlationId: string;
  deadlineAt: string;
}
export interface U2PrivateOperatorContext {
  audience: 'SYSTEM';
  operatorAuthorityRef: Ref;
  caseRef: Ref;
  purpose: 'EMERGENCY_PRIVATE';
  correlationId: string;
  deadlineAt: string;
}
