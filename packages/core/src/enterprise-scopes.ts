import type { ActionScope, Ref, TargetScope } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import { randomUUID } from 'node:crypto';
import { EnterpriseInternal } from './enterprise-access-state.js';
import { ref } from './references.js';
import { validateActionScope } from './scopes.js';
export async function validateScope(
  host: EnterpriseInternal,
  scope: ActionScope,
  enterpriseId: string,
  transaction?: ProtectedTransaction,
): Promise<void> {
  validateActionScope(scope);
  requireCondition(
    scope.enterpriseRef.id === enterpriseId,
    400,
    'SCOPE_ENTERPRISE',
    '다른 기업 범위입니다.',
  );
  for (const value of [...scope.departmentRefs, ...scope.siteRefs]) {
    const record = await host.authorization.lookup(value.entity, value.id, transaction);
    requireCondition(
      record && (record.enterpriseRef as Ref).id === enterpriseId,
      400,
      'SCOPE_ORGANISATION_PARENT',
      '해당 기업의 조직 원본이 필요합니다.',
    );
  }
}
export async function createRole(
  host: EnterpriseInternal,
  transaction: ProtectedTransaction,
  enterpriseRef: Ref,
  memberRef: Ref,
  label: string,
  scopes: ActionScope[],
  actor: Ref,
): Promise<Ref[]> {
  const refs: Ref[] = [];
  const scopeRefs: Ref[] = [];
  for (const scope of scopes) {
    const data = { actionScopeId: randomUUID(), ...scope, revision: 1 };
    await transaction.put('ActionScope', data);
    scopeRefs.push(ref('ActionScope', data));
  }
  const role = {
    roleId: randomUUID(),
    enterpriseRef,
    label,
    actionScopeRefs: scopeRefs,
    revision: 1,
  };
  await transaction.put('CustomerRole', role);
  refs.push(ref('CustomerRole', role));
  const grant = {
    grantId: randomUUID(),
    membershipRef: memberRef,
    roleRef: ref('CustomerRole', role),
    effectiveFrom: host.now().toISOString(),
    revokedAt: null,
    grantedBy: actor,
    revision: 1,
  };
  await transaction.put('CustomerRoleGrant', grant);
  refs.push(ref('CustomerRoleGrant', grant));
  return refs;
}
export function managementTarget(host: EnterpriseInternal, enterprise: ModelData): TargetScope {
  const enterpriseRef = ref('Enterprise', enterprise);
  return {
    enterpriseRef,
    departmentRef: null,
    siteRef: null,
    contextPolicyRef: enterpriseRef,
    organisationRevision: Number(enterprise.revision),
  };
}
