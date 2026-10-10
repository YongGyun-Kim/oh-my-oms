import { requireCondition } from '@oms/contracts';
import type { ActionScope, Ref, ServiceContext, ScopeV2 } from '@oms/contracts';
import type { ModelData } from '@oms/persistence';
import type { EnterpriseAccess } from './enterprise-access.js';
import { projectV2ToLegacy } from './scope-compatibility.js';
export async function currentCustomerScopes(
  access: EnterpriseAccess,
  context: ServiceContext,
  member: ModelData,
  enterprise: ModelData,
  now: () => Date,
): Promise<{ id: string; data: ActionScope }[]> {
  const { store, authorization } = access;
  requireCondition(
    (member.accountRef as Ref).id === context.principalId &&
      (member.enterpriseRef as Ref).id === enterprise.enterpriseId,
    403,
    'CONTEXT_MEMBER',
    '현재 본인/기업 소속 원본만 투영합니다.',
  );
  const scopes: { id: string; data: ActionScope }[] = [];
  for await (const item of store.scan(
    'CustomerRoleGrant',
    { membershipRef: { id: member.membershipId }, revokedAt: null },
    authorization.queryDeadline(context),
  )) {
    const grant = await authorization.lookup('CustomerRoleGrant', String(item.grantId));
    if (
      !grant ||
      grant.revokedAt !== null ||
      Date.parse(String(grant.effectiveFrom)) > now().getTime()
    )
      continue;
    const role = await authorization.lookup('CustomerRole', (grant.roleRef as Ref).id);
    requireCondition(
      role && (role.enterpriseRef as Ref).id === enterprise.enterpriseId,
      503,
      'CONTEXT_ROLE_CHANGED',
      '현재 기업/역할 원본을 대조해야 합니다.',
    );
    const state = await authorization.currentRoleState('CustomerRole', String(role.roleId));
    if (state) {
      requireCondition(
        (state.roleRef as Ref).revision === role.revision,
        503,
        'ROLE_STATE_REVISION',
        '현재 역할 개정이 다릅니다.',
      );
      if (!state.active) continue;
      for (const scopeRef of state.scopeRefs as Ref[]) {
        const scope = await authorization.lookup('ScopeV2', scopeRef.id);
        requireCondition(
          scope &&
            scope.revision === scopeRef.revision &&
            (scope.enterpriseRef as Ref).id === enterprise.enterpriseId,
          503,
          'CONTEXT_SCOPE_CHANGED',
          '현재 기업 행위 술어가 필요합니다.',
        );
        scopes.push({
          id: String(scope.scopeId),
          data: projectV2ToLegacy(scope.predicate as ScopeV2),
        });
      }
      continue;
    }
    for (const scopeRef of role.actionScopeRefs as Ref[]) {
      const scope = await authorization.lookup('ActionScope', scopeRef.id);
      requireCondition(
        scope && (scope.enterpriseRef as Ref).id === enterprise.enterpriseId,
        503,
        'CONTEXT_SCOPE_CHANGED',
        '현재 행위 범위를 대조해야 합니다.',
      );
      scopes.push({
        id: String(scope.actionScopeId),
        data: {
          action: String(scope.action),
          kind: scope.kind as ActionScope['kind'],
          enterpriseRef: scope.enterpriseRef as Ref,
          departmentRefs: scope.departmentRefs as Ref[],
          siteRefs: scope.siteRefs as Ref[],
        },
      });
    }
  }
  return [...new Map(scopes.map((scope) => [scope.id, scope])).values()];
}
