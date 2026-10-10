import { canonicalJson, requireCondition } from '@oms/contracts';
import type { InvocationTarget, Ref } from '@oms/contracts';
import type { Request } from 'express';
import type { ApiRoute } from './routes.js';

export interface U2ApiRoute extends ApiRoute {
  readonly version: 1;
  readonly contextKind: 'PRE' | 'BUSINESS' | 'PURPOSE';
  readonly purpose?: 'INVITATION_ACCEPTANCE' | 'MFA_REENROLMENT';
  readonly targetField?: string;
}
function route(
  method: 'get' | 'post',
  path: string,
  owner: string,
  operation: string,
  entity?: string,
  targetField?: string,
  purpose?: U2ApiRoute['purpose'],
  pre = false,
): U2ApiRoute {
  return Object.freeze({
    method,
    path,
    owner,
    operation,
    version: 1,
    contextKind: pre ? 'PRE' : purpose ? 'PURPOSE' : 'BUSINESS',
    ...(pre ? { public: true } : {}),
    ...(purpose ? { purpose } : {}),
    target: entity === 'Enterprise' ? 'ENTERPRISE' : entity ? 'RECORD' : 'NONE',
    ...(entity ? { entity } : {}),
    ...(targetField ? { targetField } : {}),
  });
}
// SYSTEM/private operator procedures are deliberately absent from the two
// person transports. Their registered module requires its own opaque host.
export const U2_API_ROUTES: readonly U2ApiRoute[] = Object.freeze([
  route('get', '/staff-role-directory', 'EnterpriseAccess', 'readStaffRoles'),
  route(
    'get',
    '/identity/handoff-result',
    'IdentityRecovery',
    'reobserveHandoff',
    undefined,
    undefined,
    undefined,
    true,
  ),
  route(
    'post',
    '/identity/recovery-requests',
    'IdentityRecovery',
    'requestRecovery',
    undefined,
    undefined,
    undefined,
    true,
  ),
  route(
    'post',
    '/identity/saved-code-preparations',
    'IdentityRecovery',
    'prepareSavedRecovery',
    undefined,
    undefined,
    undefined,
    true,
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/saved-code-consumptions',
    'IdentityRecovery',
    'recoverSavedCode',
    'RecoveryCase',
    'caseRef',
    undefined,
    true,
  ),
  route(
    'post',
    '/membership-invitations/:id/purpose-authorities',
    'IdentityRecovery',
    'issueInvitationPurpose',
    'MembershipInvitation',
    'invitationRef',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/provider-work',
    'IdentityRecovery',
    'prepareRecoveryProviderWork',
    'RecoveryCase',
    'caseRef',
    'MFA_REENROLMENT',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/enrollments',
    'IdentityRecovery',
    'beginRecoveryEnrollment',
    'RecoveryCase',
    'caseRef',
    'MFA_REENROLMENT',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/enrollment-verifications',
    'IdentityRecovery',
    'verifyRecoveryEnrollment',
    'RecoveryCase',
    'caseRef',
    'MFA_REENROLMENT',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/recovery-code-issues',
    'IdentityRecovery',
    'issueRecoveryPurposeCodes',
    'RecoveryCase',
    'caseRef',
    'MFA_REENROLMENT',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/recovery-code-acknowledgements',
    'IdentityRecovery',
    'acknowledgeRecoveryPurposeCodes',
    'RecoveryCase',
    'caseRef',
    'MFA_REENROLMENT',
  ),
  route(
    'post',
    '/enterprises/:id/membership-invitations',
    'EnterpriseAccess',
    'inviteMembership',
    'Enterprise',
    'enterpriseRef',
  ),
  route(
    'post',
    '/membership-invitations/:id/acceptances',
    'EnterpriseAccess',
    'acceptMembershipInvitation',
    'MembershipInvitation',
    'invitationRef',
    'INVITATION_ACCEPTANCE',
  ),
  route(
    'get',
    '/membership-invitations/:id',
    'EnterpriseAccess',
    'readOwnInvitation',
    'MembershipInvitation',
    undefined,
    'INVITATION_ACCEPTANCE',
  ),
  route(
    'post',
    '/membership-invitations/:id/revocations',
    'EnterpriseAccess',
    'revokeMembershipInvitation',
    'MembershipInvitation',
    'sourceRef',
  ),
  route(
    'post',
    '/membership-invitations/:id/resends',
    'EnterpriseAccess',
    'resendMembershipInvitation',
    'MembershipInvitation',
    'sourceRef',
  ),
  route('get', '/enterprises/:id/memberships', 'EnterpriseAccess', 'readMemberships', 'Enterprise'),
  route(
    'get',
    '/enterprises/:id/customer-roles',
    'EnterpriseAccess',
    'readCustomerRoles',
    'Enterprise',
  ),
  route(
    'post',
    '/memberships/:id/revisions',
    'EnterpriseAccess',
    'updateMembership',
    'EnterpriseMembership',
    'membershipRef',
  ),
  route(
    'post',
    '/customer-roles/:id/revisions',
    'EnterpriseAccess',
    'reviseCustomerRole',
    'CustomerRole',
    'roleRef',
  ),
  route(
    'post',
    '/customer-roles/:id/deactivations',
    'EnterpriseAccess',
    'deactivateCustomerRole',
    'CustomerRole',
    'roleRef',
  ),
  route(
    'post',
    '/staff-roles/:id/revisions',
    'EnterpriseAccess',
    'reviseStaffRole',
    'StaffRole',
    'roleRef',
  ),
  route(
    'post',
    '/staff-roles/:id/deactivations',
    'EnterpriseAccess',
    'deactivateStaffRole',
    'StaffRole',
    'roleRef',
  ),
  route(
    'post',
    '/enterprises/:id/administrator-restorations',
    'EnterpriseAccess',
    'restoreAdministrator',
    'Enterprise',
    'enterpriseRef',
  ),
  route(
    'post',
    '/administrator-restorations/:id/resumes',
    'EnterpriseAccess',
    'resumeAdministratorRestoration',
    'AdministratorRestoration',
    'sourceRef',
  ),
  route(
    'post',
    '/administrator-restorations/:id/closures',
    'EnterpriseAccess',
    'closeAdministratorRestoration',
    'AdministratorRestoration',
    'sourceRef',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/party-contexts',
    'IdentityRecovery',
    'createPartyContext',
    'RecoveryCase',
    'caseRef',
    undefined,
    true,
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/verifications',
    'IdentityRecovery',
    'verifyRecoveryParty',
    'RecoveryCase',
    'caseRef',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/handoffs',
    'IdentityRecovery',
    'issueHandoff',
    'RecoveryCase',
    'caseRef',
  ),
  route(
    'post',
    '/identity/handoffs/:id/claims',
    'IdentityRecovery',
    'claimHandoff',
    'RecoveryHandoffGrant',
    'grantRef',
    undefined,
    true,
  ),
  route(
    'get',
    '/identity/claims/:id',
    'IdentityRecovery',
    'readOwnClaimResult',
    'ClaimReceipt',
    undefined,
    'MFA_REENROLMENT',
  ),
  route(
    'get',
    '/identity/recovery-cases/:id',
    'IdentityRecovery',
    'readRecoveryStatus',
    'RecoveryCase',
    undefined,
    'MFA_REENROLMENT',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/completions',
    'IdentityRecovery',
    'completeRecovery',
    'RecoveryCase',
    'caseRef',
    'MFA_REENROLMENT',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/first-factor-replacements',
    'IdentityRecovery',
    'replaceFirstFactor',
    'RecoveryCase',
    'caseRef',
    'MFA_REENROLMENT',
  ),
  route(
    'get',
    '/identity/verified-person-links/:id',
    'IdentityRecovery',
    'verifiedPersonEvidence',
    'VerifiedPersonLink',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/resumes',
    'IdentityRecovery',
    'resumeRecovery',
    'RecoveryCase',
    'sourceRef',
  ),
  route(
    'post',
    '/identity/recovery-cases/:id/closures',
    'IdentityRecovery',
    'closeRecovery',
    'RecoveryCase',
    'sourceRef',
  ),
]);
export function assertU2ResourceInput(value: unknown): void {
  requireCondition(
    Buffer.byteLength(JSON.stringify(value) ?? '') <= 65536,
    413,
    'JSON_SIZE_LIMIT',
    '입력은64KiB 안에서 보내세요.',
  );
  const visit = (node: unknown, depth: number, field = '') => {
    requireCondition(depth <= 16, 400, 'JSON_DEPTH_LIMIT', '입력 중첩 상한을 확인하세요.');
    if (typeof node === 'string')
      requireCondition(
        node.length <= 4096,
        400,
        'JSON_STRING_LIMIT',
        '입력 문자열 상한을 확인하세요.',
      );
    else if (Array.isArray(node)) {
      const limit =
        field === 'roleRefs'
          ? 100
          : field === 'predicates'
            ? 200
            : field === 'evidenceRefs' || field === 'providerResultRefs'
              ? 20
              : 2000;
      requireCondition(
        node.length <= limit,
        400,
        'JSON_COLLECTION_LIMIT',
        '등록된 입력 목록 상한을 확인하세요.',
      );
      for (const item of node) visit(item, depth + 1, field);
    } else if (node !== null && typeof node === 'object')
      for (const [key, item] of Object.entries(node)) {
        requireCondition(
          !['__proto__', 'prototype', 'constructor'].includes(key),
          400,
          'JSON_FIELD_FORBIDDEN',
          '등록된 입력 필드를 사용하세요.',
        );
        visit(item, depth + 1, key);
      }
    else
      requireCondition(
        node === null ||
          typeof node === 'boolean' ||
          (typeof node === 'number' && Number.isFinite(node)),
        400,
        'JSON_VALUE',
        '정규 JSON 입력이 필요합니다.',
      );
  };
  visit(value, 0);
}
export function u2RouteInput(
  route: U2ApiRoute,
  request: Request,
  target: InvocationTarget,
): unknown {
  if (request.method === 'GET') {
    const page = ['readMemberships', 'readCustomerRoles', 'readStaffRoles'].includes(
        route.operation,
      ),
      allowed = page ? ['cursor', 'pageSize', 'filter'] : [];
    requireCondition(
      Object.keys(request.query).every((key) => allowed.includes(key)),
      400,
      'QUERY_FIELD',
      '등록된 목적 조회 조건만 허용합니다.',
    );
    const result = page
      ? {
          cursor: request.query.cursor ?? null,
          pageSize: request.query.pageSize === undefined ? 25 : Number(request.query.pageSize),
          filter: request.query.filter ?? 'ALL',
        }
      : { sourceRef: target.kind === 'RECORD' ? target.recordRef : null };
    assertU2ResourceInput(result);
    return result;
  }
  const data = request.body as Record<string, unknown>;
  requireCondition(
    data && typeof data === 'object' && !Array.isArray(data),
    400,
    'JSON_INPUT',
    'JSON 작업 입력이 필요합니다.',
  );
  assertU2ResourceInput(data);
  const meta = data.meta as { clientRequestId?: string } | undefined;
  if (meta)
    requireCondition(
      request.headers['idempotency-key'] === meta.clientRequestId,
      400,
      'IDEMPOTENCY_HEADER_MISMATCH',
      '원래 요청 키를 확인하세요.',
    );
  if (route.targetField) {
    const selected = data[route.targetField] as Ref | undefined,
      expected =
        target.kind === 'ENTERPRISE'
          ? target.enterpriseRef
          : target.kind === 'RECORD'
            ? target.recordRef
            : null;
    requireCondition(
      selected && expected && canonicalJson(selected) === canonicalJson(expected),
      400,
      'PATH_TARGET_MISMATCH',
      '경로와 원래 대상/개정이 다릅니다.',
    );
  }
  return data;
}
