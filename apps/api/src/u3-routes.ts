import { canonicalJson, requireCondition } from '@oms/contracts';
import type { InvocationTarget, Ref } from '@oms/contracts';
import type { Request } from 'express';
import type { ApiRoute } from './routes.js';
import { routeInput, routeTarget } from './transport-input.js';

export interface U3ApiRoute extends ApiRoute {
  u3: true;
  pathField?: 'targetRef' | 'productRef' | 'proposalRef' | 'roleRef' | 'enterpriseRef';
}
const route = (
  method: ApiRoute['method'],
  path: string,
  owner: string,
  operation: string,
  target: ApiRoute['target'] = 'NONE',
  entity?: string,
  pathField?: U3ApiRoute['pathField'],
): U3ApiRoute => ({ method, path, owner, operation, target, entity, pathField, u3: true });
export const U3_API_ROUTES: U3ApiRoute[] = [
  route('post', '/products', 'ProductCatalog', 'registerProduct'),
  route(
    'post',
    '/products/:id/revisions',
    'ProductCatalog',
    'reviseProduct',
    'RECORD',
    'Product',
    'targetRef',
  ),
  route(
    'get',
    '/products/:id/offer',
    'ProductCatalog',
    'readCommonOffer',
    'NONE',
    'Product',
    'targetRef',
  ),
  route('post', '/commercial-agreements', 'CommercialAgreement', 'registerAgreement'),
  route(
    'post',
    '/commercial-agreements/:id/approvals',
    'CommercialAgreement',
    'approveAgreement',
    'RECORD',
    'AgreementRevision',
    'targetRef',
  ),
  route(
    'get',
    '/enterprises/:id/commercial-agreements',
    'CommercialAgreement',
    'readAgreement',
    'ENTERPRISE',
    'Enterprise',
  ),
  route('post', '/contract-change-requests', 'CommercialAgreement', 'requestContractChange'),
  route('post', '/offer-exceptions', 'CommercialAgreement', 'registerOfferException'),
  route('post', '/commercial-proposals', 'CommercialAgreement', 'createProposal'),
  route(
    'get',
    '/commercial-proposals/:id',
    'CommercialAgreement',
    'readProposal',
    'RECORD',
    'CommercialProposal',
    'targetRef',
  ),
  route(
    'post',
    '/commercial-proposals/:id/consents',
    'CommercialAgreement',
    'recordConsent',
    'RECORD',
    'CommercialProposal',
    'proposalRef',
  ),
  route(
    'get',
    '/commercial-contracts/:id/effective',
    'CommercialAgreement',
    'effectiveAgreement',
    'NONE',
    'EnterpriseContract',
    'targetRef',
  ),
  route('get', '/commercial-terms', 'CommercialAgreement', 'readApprovedTerms'),
  route('post', '/orders', 'OrderAcceptance', 'submitOrder'),
  route(
    'post',
    '/orders/:id/decisions',
    'OrderAcceptance',
    'decideOrder',
    'RECORD',
    'Order',
    'targetRef',
  ),
  route('get', '/orders/:id', 'OrderAcceptance', 'readAcceptedOrder', 'NONE', 'Order', 'targetRef'),
  route('post', '/order-condition-applications', 'OrderAcceptance', 'applyApprovedChange'),
  route('post', '/u3/staff-roles', 'EnterpriseAccess', 'defineStaffRole'),
  route(
    'post',
    '/u3/staff-roles/:id/revisions',
    'EnterpriseAccess',
    'reviseStaffRole',
    'RECORD',
    'StaffRole',
    'roleRef',
  ),
  route(
    'post',
    '/u3/staff-roles/:id/deactivations',
    'EnterpriseAccess',
    'deactivateStaffRole',
    'RECORD',
    'StaffRole',
    'roleRef',
  ),
  route('get', '/u3/staff-roles', 'EnterpriseAccess', 'readStaffRoles'),
  route(
    'post',
    '/u3/enterprises/:id/consent-roles',
    'EnterpriseAccess',
    'defineCustomerRole',
    'ENTERPRISE',
    'Enterprise',
    'enterpriseRef',
  ),
  route(
    'post',
    '/u3/consent-roles/:id/revisions',
    'EnterpriseAccess',
    'reviseCustomerRole',
    'RECORD',
    'CustomerRole',
    'roleRef',
  ),
  route(
    'post',
    '/u3/consent-roles/:id/deactivations',
    'EnterpriseAccess',
    'deactivateCustomerRole',
    'RECORD',
    'CustomerRole',
    'roleRef',
  ),
  route(
    'get',
    '/u3/enterprises/:id/consent-roles',
    'EnterpriseAccess',
    'readCustomerRoles',
    'ENTERPRISE',
    'Enterprise',
    'enterpriseRef',
  ),
  route('post', '/u3/staff-role-grants', 'EnterpriseAccess', 'grantStaffRole'),
  route(
    'post',
    '/u3/enterprises/:id/role-grants',
    'EnterpriseAccess',
    'grantCustomerRole',
    'ENTERPRISE',
    'Enterprise',
  ),
  route('get', '/requests/original', 'WorkInquiry', 'lookupOriginalReceipt'),
  route('get', '/requests/original-probe', 'WorkInquiry', 'probeOriginalReceipt'),
  route('get', '/requests/:id', 'WorkInquiry', 'readReceipt', 'REQUEST'),
  ...(['ProductCatalog', 'CommercialAgreement', 'OrderAcceptance'] as const).flatMap((owner) => [
    route('post', '/u3/' + owner + '/diagnostics', owner, 'readOwnerDiagnostics'),
    route('get', '/u3/' + owner + '/history', owner, 'readOwnerHistory'),
  ]),
];
export function u3BodyLimit(route: Pick<ApiRoute, 'owner' | 'operation'> | undefined): number {
  return route?.owner === 'OrderAcceptance' &&
    ['submitOrder', 'applyApprovedChange'].includes(route.operation)
    ? 1048576
    : 65536;
}
export function matchU3Route(method: string, path: string): U3ApiRoute | undefined {
  return U3_API_ROUTES.find(
    (route) =>
      route.method.toUpperCase() === method &&
      new RegExp('^' + route.path.replace(/:[A-Za-z]+/g, '[^/]+') + '$').test(path),
  );
}
export function u3RouteInput(
  route: U3ApiRoute,
  request: Request,
  target: InvocationTarget,
): unknown {
  let data: Record<string, unknown>;
  if (request.method === 'GET') {
    requireCondition(
      Object.keys(request.query).every((key) => key === 'query'),
      400,
      'QUERY_FIELD',
      '닫힌 현재 조회 입력만 허용합니다.',
    );
    const raw = request.query.query;
    if (route.operation === 'readReceipt' && raw === undefined)
      data = { requestId: target.kind === 'REQUEST' ? target.requestId : null };
    else {
      requireCondition(
        typeof raw === 'string' && Buffer.byteLength(raw) <= 8192,
        400,
        'U3_QUERY_INPUT',
        '유한 JSON 조회 입력이 필요합니다.',
      );
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        requireCondition(false, 400, 'U3_QUERY_INPUT', '조회 JSON을 확인하세요.');
      }
      requireCondition(
        data && typeof data === 'object' && !Array.isArray(data),
        400,
        'U3_QUERY_INPUT',
        '닫힌 조회 객체가 필요합니다.',
      );
    }
  } else data = routeInput(route, request, target) as Record<string, unknown>;
  if (route.pathField) {
    const reference =
      route.target === 'ENTERPRISE'
        ? (target as { enterpriseRef: Ref }).enterpriseRef
        : route.target === 'RECORD'
          ? (target as { recordRef: Ref }).recordRef
          : (routeTarget({ ...route, target: 'RECORD' }, request) as { recordRef: Ref }).recordRef;
    requireCondition(
      canonicalJson(data[route.pathField]) === canonicalJson(reference),
      400,
      'PATH_TARGET_MISMATCH',
      '경로·개정과 실제 입력 원본이 다릅니다.',
    );
  }
  return data;
}
export function u3RouteTarget(route: U3ApiRoute, request: Request): InvocationTarget {
  if (route.target === 'RECORD' || route.target === 'ENTERPRISE' || route.pathField) {
    requireCondition(
      typeof request.headers['x-target-revision'] === 'string',
      400,
      'TARGET_REVISION',
      '조회/변경 대상의 정확한 개정이 필요합니다.',
    );
  }
  return routeTarget(route, request);
}
