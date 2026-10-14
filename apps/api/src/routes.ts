import type { InvocationTarget } from '@oms/contracts';
export interface ApiRoute {
  method: 'get' | 'post';
  path: string;
  owner: string;
  operation: string;
  public?: boolean;
  target: InvocationTarget['kind'];
  entity?: string;
}
const route = (
  method: ApiRoute['method'],
  path: string,
  owner: string,
  operation: string,
  target: ApiRoute['target'] = 'NONE',
  entity?: string,
): ApiRoute => ({ method, path, owner, operation, target, entity });
export const API_ROUTES: ApiRoute[] = [
  { ...route('post', '/identity/challenges', 'IdentityRecovery', 'startLogin'), public: true },
  {
    ...route(
      'post',
      '/identity/challenges/:id/responses',
      'IdentityRecovery',
      'completeChallenge',
      'CHALLENGE',
    ),
    public: true,
  },
  {
    ...route(
      'post',
      '/identity/challenges/:id/mfa-preparations',
      'IdentityRecovery',
      'prepareMfa',
      'CHALLENGE',
    ),
    public: true,
  },
  {
    ...route(
      'post',
      '/identity/challenges/:id/recovery-code-issues',
      'IdentityRecovery',
      'issueRecoveryCodes',
      'CHALLENGE',
    ),
    public: true,
  },
  {
    ...route(
      'post',
      '/identity/challenges/:id/recovery-code-acknowledgements',
      'IdentityRecovery',
      'acknowledgeRecoveryCodes',
      'CHALLENGE',
    ),
    public: true,
  },
  {
    ...route(
      'post',
      '/identity/challenges/:id/mfa-enrolment-responses',
      'IdentityRecovery',
      'verifyMfaEnrolment',
      'CHALLENGE',
    ),
    public: true,
  },
  route('get', '/customer-enterprise-contexts', 'EnterpriseAccess', 'readCustomerContexts'),
  route('get', '/identity', 'IdentityRecovery', 'readIdentity'),
  route('post', '/enterprise-applications', 'EnterpriseAccess', 'applyEnterprise'),
  route('get', '/enterprise-applications', 'EnterpriseAccess', 'listOwnApplications'),
  route('get', '/enterprise-applications', 'EnterpriseAccess', 'listApplications'),
  route(
    'get',
    '/enterprise-applications/:id',
    'EnterpriseAccess',
    'readApplication',
    'RECORD',
    'EnterpriseApplication',
  ),
  route(
    'post',
    '/enterprise-applications/:id/decisions',
    'EnterpriseAccess',
    'approveEnterprise',
    'RECORD',
    'EnterpriseApplication',
  ),
  route('get', '/enterprises/:id', 'EnterpriseAccess', 'readEnterprise', 'ENTERPRISE'),
  route(
    'post',
    '/enterprises/:id/initial-administrator-designations',
    'EnterpriseAccess',
    'designateInitialAdministrator',
    'ENTERPRISE',
  ),
  route(
    'post',
    '/enterprises/:id/ordering-context-policy-changes',
    'EnterpriseAccess',
    'setOrderingContextPolicy',
    'ENTERPRISE',
  ),
  route(
    'post',
    '/enterprises/:id/organisation-changes',
    'EnterpriseAccess',
    'upsertOrganisation',
    'ENTERPRISE',
  ),
  route(
    'post',
    '/enterprises/:id/membership-changes',
    'EnterpriseAccess',
    'upsertMembership',
    'ENTERPRISE',
  ),
  route(
    'post',
    '/enterprises/:id/customer-roles',
    'EnterpriseAccess',
    'defineCustomerRole',
    'ENTERPRISE',
  ),
  route(
    'post',
    '/enterprises/:id/role-grant-changes',
    'EnterpriseAccess',
    'grantCustomerRole',
    'ENTERPRISE',
  ),
  route('get', '/staff-roles', 'EnterpriseAccess', 'readStaffRoles'),
  route('post', '/staff-roles', 'EnterpriseAccess', 'defineStaffRole'),
  route('post', '/staff-role-grant-changes', 'EnterpriseAccess', 'grantStaffRole'),
  route('post', '/products', 'ProductCatalog', 'registerProduct'),
  route('post', '/products/:id/revisions', 'ProductCatalog', 'reviseProduct', 'RECORD', 'Product'),
  route('get', '/products', 'WorkInquiry', 'listVisibleProducts'),
  route('post', '/orders', 'OrderAcceptance', 'submitOrder'),
  route(
    'get',
    '/orders/:id/review-assessment',
    'OrderAcceptance',
    'readReviewAssessment',
    'RECORD',
    'Order',
  ),
  route(
    'get',
    '/records/:recordOwner/:entity/:id/history',
    'WorkInquiry',
    'readRecordHistory',
    'RECORD',
  ),
  route('get', '/orders/:id/history', 'WorkInquiry', 'readHistory', 'RECORD', 'Order'),
  route('get', '/requests/original-probe', 'WorkInquiry', 'probeOriginalReceipt'),
  route('get', '/requests/original', 'WorkInquiry', 'lookupOriginalReceipt'),
  route('post', '/identity/session-endings', 'IdentityRecovery', 'endSession'),
  route('get', '/requests/:id', 'WorkInquiry', 'readReceipt', 'REQUEST'),
  route('get', '/notifications', 'NotificationDelivery', 'readNotices'),
  route(
    'post',
    '/notifications/:id/read-receipts',
    'NotificationDelivery',
    'recordNoticeRead',
    'RECORD',
    'NotificationIntent',
  ),
];
