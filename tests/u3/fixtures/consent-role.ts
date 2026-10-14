import { randomUUID } from 'node:crypto';
import { declareU3Operations, OperationRegistry, SchemaValidator } from '@oms/contracts';
import type { Ref, ScopeV2 } from '@oms/contracts';
import type { U3CustomerRoleInput } from '@oms/core';
import { fixtureMeta } from './commercial.js';

const schema = new SchemaValidator(),
  registry = new OperationRegistry(schema);
declareU3Operations(registry);
export function consentPredicate(enterpriseRef: Ref): ScopeV2 {
  return {
    enterpriseRef,
    action: 'contract.consent',
    kind: 'ENTERPRISE_ALL',
    departmentSelector: { kind: 'ALL' },
    siteSelector: { kind: 'ALL' },
    sourcePolicyRevision: enterpriseRef.revision,
  };
}
export function registeredConsentRoleInput<T>(
  name:
    'defineCustomerRole' | 'reviseCustomerRole' | 'deactivateCustomerRole' | 'readCustomerRoles',
  value: T,
): T {
  return schema.validateUri<T>(registry.lookup('EnterpriseAccess', name, 3).input, value);
}
export function consentRoleInput(enterpriseRef: Ref): U3CustomerRoleInput {
  return registeredConsentRoleInput('defineCustomerRole', {
    meta: { ...fixtureMeta(), clientRequestId: randomUUID() },
    enterpriseRef,
    label: '합성 검증: 명시 동의 권한',
    predicates: [consentPredicate(enterpriseRef)],
  });
}
