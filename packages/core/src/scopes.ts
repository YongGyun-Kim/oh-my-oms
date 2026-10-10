import { requireCondition, SchemaValidator } from '@oms/contracts';
import type { ActionScope, Ref, TargetScope } from '@oms/contracts';
export interface OrderingPolicy {
  departmentUsage: 'UNSET' | 'USED' | 'NOT_USED';
  siteUsage: 'UNSET' | 'USED' | 'NOT_USED';
  setBy: Ref | null;
  setAt: string | null;
  reason: string;
}
const matches = (left: Ref, right: Ref | null) =>
  right !== null &&
  left.owner === right.owner &&
  left.entity === right.entity &&
  left.id === right.id;
const scopeSchema = new SchemaValidator();
export function validateActionScope(scope: ActionScope): void {
  scopeSchema.validate('ActionScope', scope);
  requireCondition(
    scope.enterpriseRef.owner === 'EnterpriseAccess' && scope.enterpriseRef.entity === 'Enterprise',
    400,
    'SCOPE_ENTERPRISE',
    '기업 범위를 확인하세요.',
  );
  requireCondition(
    scope.departmentRefs.every(
      (value) => value.owner === 'EnterpriseAccess' && value.entity === 'Department',
    ) &&
      scope.siteRefs.every(
        (value) => value.owner === 'EnterpriseAccess' && value.entity === 'BusinessSite',
      ),
    400,
    'SCOPE_ORGANISATION',
    '범위의 조직 종류를 확인하세요.',
  );
  const d = scope.departmentRefs.length;
  const s = scope.siteRefs.length;
  requireCondition(
    scope.kind === 'DEPARTMENT_SITE'
      ? d <= 1 && s <= 1
      : scope.kind === 'SITE_ALL_DEPARTMENTS'
        ? d === 0 && s >= 1
        : scope.kind === 'DEPARTMENT_ALL_SITES'
          ? d >= 1 && s === 0
          : d === 0 && s === 0,
    400,
    'SCOPE_AXES',
    '행위 범위의 명시적 조직 선택을 확인하세요.',
  );
}
export function scopeIncludes(
  scope: ActionScope,
  action: string,
  target: TargetScope,
  original: OrderingPolicy,
): boolean {
  validateActionScope(scope);
  if (scope.action !== action || !matches(scope.enterpriseRef, target.enterpriseRef)) return false;
  if (scope.kind === 'ENTERPRISE_ALL') return true;
  if (scope.kind === 'SITE_ALL_DEPARTMENTS')
    return scope.siteRefs.some((value) => matches(value, target.siteRef));
  if (scope.kind === 'DEPARTMENT_ALL_SITES')
    return scope.departmentRefs.some((value) => matches(value, target.departmentRef));
  const d =
    scope.departmentRefs.length === 0
      ? target.departmentRef === null && original.departmentUsage === 'NOT_USED'
      : scope.departmentRefs.some((value) => matches(value, target.departmentRef));
  const s =
    scope.siteRefs.length === 0
      ? target.siteRef === null && original.siteUsage === 'NOT_USED'
      : scope.siteRefs.some((value) => matches(value, target.siteRef));
  return d && s;
}
export const STAFF_ACTIONS = Object.freeze([
  'application.read',
  'enterprise.approve',
  'enterprise.initial-administrator.designate',
  'product.register',
  'product.revise',
  'product.read',
  'order.read',
  'order.review.read',
  'staff.role.manage',
]);
