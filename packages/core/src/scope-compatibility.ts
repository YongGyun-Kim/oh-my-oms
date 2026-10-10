import { requireCondition } from '@oms/contracts';
import type { ActionScope, AxisSelector, Ref, ScopeV2 } from '@oms/contracts';
import type { OrderingPolicy } from './scopes.js';
import { validateActionScope } from './scopes.js';
import { validateScopeV2, MANAGEMENT_ACTIONS } from './scope-v2.js';
export interface LegacyScopeBasis {
  profile: 'common:1' | 'u1:2';
  policyRevision: number;
  policy: OrderingPolicy;
  // Only an explicit registered old decoder's known pairs may establish a
  // many-by-many meaning. Two bare arrays are never inferred as a product.
  knownPairs?: readonly { departmentRef: Ref | null; siteRef: Ref | null }[];
}
export function decodeLegacyScope(scope: ActionScope, basis: LegacyScopeBasis): ScopeV2[] {
  requireCondition(
    ['common:1', 'u1:2'].includes(basis.profile) &&
      Number.isSafeInteger(basis.policyRevision) &&
      basis.policyRevision > 0,
    400,
    'LEGACY_SCOPE_BASIS',
    '원래 등록 profile/정책 개정이 필요합니다.',
  );
  requireCondition(
    scope.departmentRefs.length <= 100 && scope.siteRefs.length <= 100,
    400,
    'LEGACY_SCOPE_LIMIT',
    '유한 원래 조직 집합이 필요합니다.',
  );
  const make = (departmentSelector: AxisSelector, siteSelector: AxisSelector) =>
    validateScopeV2({
      enterpriseRef: scope.enterpriseRef,
      action: scope.action,
      kind: scope.kind,
      departmentSelector,
      siteSelector,
      sourcePolicyRevision: basis.policyRevision,
    });
  const exact = (ref: Ref): AxisSelector => ({ kind: 'EXACT', ref });
  const selected = (ref: Ref | null, usage: OrderingPolicy['departmentUsage']): AxisSelector => {
    if (ref) return exact(ref);
    requireCondition(
      usage === 'NOT_USED',
      400,
      'LEGACY_SCOPE_UNCONFIRMED',
      '빈 축의 명시 미사용 정책이 필요합니다.',
    );
    return { kind: 'NOT_USED' };
  };
  if (
    scope.kind === 'DEPARTMENT_SITE' &&
    (scope.departmentRefs.length > 1 || scope.siteRefs.length > 1)
  ) {
    requireCondition(
      basis.profile === 'common:1' &&
        basis.knownPairs &&
        basis.knownPairs.length > 0 &&
        basis.knownPairs.length <= 200,
      400,
      'LEGACY_PAIRS_UNCONFIRMED',
      '원래 decoder의 명시 쌍이 필요합니다.',
    );
    for (const pair of basis.knownPairs!)
      requireCondition(
        (pair.departmentRef === null
          ? scope.departmentRefs.length === 0
          : scope.departmentRefs.some(
              (ref) => ref.id === pair.departmentRef!.id && ref.owner === pair.departmentRef!.owner,
            )) &&
          (pair.siteRef === null
            ? scope.siteRefs.length === 0
            : scope.siteRefs.some(
                (ref) => ref.id === pair.siteRef!.id && ref.owner === pair.siteRef!.owner,
              )),
        400,
        'LEGACY_PAIR_SOURCE',
        '원래 축에 없는 쌍은 만들 수 없습니다.',
      );
    return basis.knownPairs!.map((pair) =>
      make(
        selected(pair.departmentRef, basis.policy.departmentUsage),
        selected(pair.siteRef, basis.policy.siteUsage),
      ),
    );
  }
  validateActionScope(scope);
  if (scope.kind === 'ENTERPRISE_ALL') {
    requireCondition(
      (basis.policy.departmentUsage !== 'UNSET' && basis.policy.siteUsage !== 'UNSET') ||
        MANAGEMENT_ACTIONS.includes(scope.action),
      400,
      'LEGACY_SCOPE_UNCONFIRMED',
      '원래 조직 정책이 필요합니다.',
    );
    return [make({ kind: 'ALL' }, { kind: 'ALL' })];
  }
  requireCondition(
    basis.policy.departmentUsage !== 'UNSET' && basis.policy.siteUsage !== 'UNSET',
    400,
    'LEGACY_SCOPE_UNCONFIRMED',
    '원래 조직 정책이 필요합니다.',
  );
  if (scope.kind === 'SITE_ALL_DEPARTMENTS')
    return scope.siteRefs.map((site) => make({ kind: 'ALL' }, exact(site)));
  if (scope.kind === 'DEPARTMENT_ALL_SITES')
    return scope.departmentRefs.map((department) => make(exact(department), { kind: 'ALL' }));
  return [
    make(
      selected(scope.departmentRefs[0] ?? null, basis.policy.departmentUsage),
      selected(scope.siteRefs[0] ?? null, basis.policy.siteUsage),
    ),
  ];
}
export function projectV2ToLegacy(scope: ScopeV2): ActionScope {
  validateScopeV2(scope);
  return {
    enterpriseRef: scope.enterpriseRef,
    action: scope.action,
    kind: scope.kind,
    departmentRefs: scope.departmentSelector.kind === 'EXACT' ? [scope.departmentSelector.ref] : [],
    siteRefs: scope.siteSelector.kind === 'EXACT' ? [scope.siteSelector.ref] : [],
  };
}
