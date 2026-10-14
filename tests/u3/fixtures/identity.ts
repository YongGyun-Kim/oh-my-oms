import type { Ref, ServiceContext, TargetScope } from '@oms/contracts';

// Shape fixtures only: these do not establish a protected identity or authority.
export function fixtureRef(
  owner: string,
  entity: string,
  id = entity + '-synthetic',
  revision = 1,
): Ref {
  return { owner, entity, id, revision };
}
export function fixtureScope(enterpriseId = 'enterprise-a'): TargetScope {
  return {
    enterpriseRef: fixtureRef('EnterpriseAccess', 'Enterprise', enterpriseId),
    departmentRef: null,
    siteRef: null,
    contextPolicyRef: fixtureRef('EnterpriseAccess', 'Enterprise', enterpriseId),
    organisationRevision: 1,
  };
}
export function fixtureContext(audience: ServiceContext['audience'] = 'CUSTOMER'): ServiceContext {
  return {
    principalId: 'synthetic-person',
    actorAccountRef: fixtureRef('IdentityRecovery', 'Account'),
    verifiedPersonRef: null,
    identityAssertionRef: fixtureRef('IdentityRecovery', 'IdentitySession'),
    audience,
    accessEvaluationRef: null,
    executionPermitRef: null,
    correlationId: 'synthetic-correlation',
    deadlineAt: '2026-10-11T12:00:00.000Z',
  };
}
