import { requireCondition, SchemaValidator } from '@oms/contracts';
import type { ScopeV2, AxisSelector, TargetScope, Ref } from '@oms/contracts';
import type { OrderingPolicy } from './scopes.js';
import { sameRef } from './references.js';
const schema = new SchemaValidator();
export const MANAGEMENT_ACTIONS = ['organisation.manage', 'user.manage', 'role.manage'];
export function validateScopeV2(scope: ScopeV2): ScopeV2 {
  return schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/ScopeV2', scope);
}
function axis(
  selector: AxisSelector,
  target: Ref | null,
  usage: OrderingPolicy['departmentUsage'],
): boolean {
  if (selector.kind === 'ALL') return true;
  if (selector.kind === 'NOT_USED') return target === null && usage === 'NOT_USED';
  return usage === 'USED' && sameRef(selector.ref, target);
}
export function scopeV2Includes(
  scope: ScopeV2,
  action: string,
  target: TargetScope,
  original: OrderingPolicy,
  mode: 'BUSINESS' | 'HISTORICAL' | 'MANAGEMENT' = 'BUSINESS',
): boolean {
  validateScopeV2(scope);
  if (scope.action !== action || !sameRef(scope.enterpriseRef, target.enterpriseRef)) return false;
  if (original.departmentUsage === 'UNSET' || original.siteUsage === 'UNSET')
    return (
      mode === 'MANAGEMENT' &&
      MANAGEMENT_ACTIONS.includes(action) &&
      scope.kind === 'ENTERPRISE_ALL'
    );
  return (
    axis(scope.departmentSelector, target.departmentRef, original.departmentUsage) &&
    axis(scope.siteSelector, target.siteRef, original.siteUsage)
  );
}
export function scopesV2Include(
  scopes: readonly ScopeV2[],
  action: string,
  target: TargetScope,
  original: OrderingPolicy,
  mode: 'BUSINESS' | 'HISTORICAL' | 'MANAGEMENT' = 'BUSINESS',
): boolean {
  requireCondition(scopes.length <= 200, 400, 'SCOPE_LIMIT', '한 역할의 유한 술어가 필요합니다.');
  scopes.forEach(validateScopeV2);
  return scopes.some((scope) => scopeV2Includes(scope, action, target, original, mode));
}
export function scopeV2WithinManagement(
  candidate: ScopeV2,
  management: readonly ScopeV2[],
  action: string,
): boolean {
  validateScopeV2(candidate);
  const axisContains = (outer: AxisSelector, inner: AxisSelector) =>
    outer.kind === 'ALL' ||
    (outer.kind === inner.kind &&
      (outer.kind !== 'EXACT' || (inner.kind === 'EXACT' && sameRef(outer.ref, inner.ref))));
  return management.some((scope) => {
    validateScopeV2(scope);
    return (
      scope.action === action &&
      sameRef(scope.enterpriseRef, candidate.enterpriseRef) &&
      axisContains(scope.departmentSelector, candidate.departmentSelector) &&
      axisContains(scope.siteSelector, candidate.siteSelector)
    );
  });
}
export function requireManagedChange(
  management: readonly ScopeV2[],
  action: 'organisation.manage' | 'user.manage' | 'role.manage',
  before: TargetScope | null,
  after: TargetScope,
  original: OrderingPolicy,
  rolePredicates: readonly ScopeV2[] = [],
): void {
  requireCondition(
    management.length <= 2000,
    503,
    'MANAGEMENT_SCOPE_LIMIT',
    '현재 역할들의 유한 전체 술어가 필요합니다.',
  );
  management.forEach(validateScopeV2);
  const includes = (target: TargetScope) =>
    management.some((scope) => scopeV2Includes(scope, action, target, original, 'MANAGEMENT'));
  requireCondition(
    includes(after) && (!before || includes(before)),
    403,
    'MANAGEMENT_TARGET',
    '변경 전후의 현재 관리 범위가 필요합니다.',
  );
  requireCondition(
    rolePredicates.every((predicate) => scopeV2WithinManagement(predicate, management, action)),
    403,
    'MANAGEMENT_ROLE_SCOPE',
    '역할 전체가 현재 관리 범위 안에 있어야 합니다.',
  );
}
