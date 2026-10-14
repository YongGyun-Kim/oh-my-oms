import { canonicalJson, requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import { U2_STAFF_FENCE_ID } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { ref } from './references.js';
export interface AuthorizationSnapshot {
  principalId: string;
  audience: 'CUSTOMER' | 'STAFF';
  epoch: string;
  enterpriseId: string | null;
  profile: 'u1:2' | 'u2:1';
  sources: Ref[];
}
export class AuthorizationFence {
  constructor(private readonly authorization: Authorization) {}
  async capture(
    context: ServiceContext,
    enterpriseId: string | null,
    transaction?: ProtectedTransaction,
    profile: 'u1:2' | 'u2:1' = 'u2:1',
  ): Promise<AuthorizationSnapshot> {
    const a = this.authorization,
      store = a.store;
    const account = await a.identity(context, transaction);
    requireCondition(
      context.audience !== 'SYSTEM',
      403,
      'PERSON_AUTHORITY',
      '현재 사람 권위가 필요합니다.',
    );
    const sources: Ref[] = [ref('Account', account)];
    const security = await store.list('AccountSecurityState', {
      equals: { accountRef: { id: context.principalId } },
      limit: 2,
    });
    requireCondition(
      security.length <= 1 && (profile === 'u1:2' || security.length === 1),
      503,
      'SECURITY_BACKFILL_REQUIRED',
      '계정의 보호된 보안 세대 원본이 필요합니다.',
    );
    if (security[0]) {
      const secured = await a.lookup(
        'AccountSecurityState',
        String(security[0].securityStateId),
        transaction,
      );
      requireCondition(secured, 503, 'SECURITY_BACKFILL_REQUIRED', '현재 보안 세대가 필요합니다.');
      sources.push(ref('AccountSecurityState', secured));
    }
    const bindings = await store.list('ProviderBinding', {
      equals: { accountRef: { id: context.principalId }, audience: context.audience, active: true },
      limit: 2,
    });
    requireCondition(bindings.length === 1, 503, 'BINDING_REQUIRED', '현재 연결이 필요합니다.');
    const binding = await a.lookup('ProviderBinding', String(bindings[0]!.bindingId), transaction);
    requireCondition(binding, 503, 'BINDING_REQUIRED', '현재 연결이 필요합니다.');
    sources.push(ref('ProviderBinding', binding));
    let member: ModelData | null = null;
    if (context.audience === 'CUSTOMER') {
      requireCondition(enterpriseId, 403, 'FENCE_ENTERPRISE', '정확한 기업 target이 필요합니다.');
      member = await a.relation(context, enterpriseId, transaction);
      sources.push(ref('EnterpriseMembership', member));
      const enterprise = await a.lookup('Enterprise', enterpriseId, transaction);
      requireCondition(enterprise, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      sources.push(ref('Enterprise', enterprise));
      const fences = await store.list('EnterpriseAccessFence', {
        equals: { enterpriseRef: { id: enterpriseId } },
        limit: 2,
      });
      requireCondition(
        fences.length <= 1 && (profile === 'u1:2' || fences.length === 1),
        503,
        'ACCESS_FENCE_REQUIRED',
        '현재 기업 권위 fence가 필요합니다.',
      );
      if (fences[0]) {
        const fence = await a.lookup(
          'EnterpriseAccessFence',
          String(fences[0].fenceId),
          transaction,
        );
        requireCondition(fence, 503, 'ACCESS_FENCE_REQUIRED', '현재 기업 권위 fence가 필요합니다.');
        sources.push(ref('EnterpriseAccessFence', fence));
      }
    } else {
      const fence = await a.lookup('StaffAuthorityFence', U2_STAFF_FENCE_ID, transaction);
      requireCondition(
        profile === 'u1:2' || fence,
        503,
        'STAFF_FENCE_REQUIRED',
        '현재 직원 권위 fence가 필요합니다.',
      );
      if (fence) sources.push(ref('StaffAuthorityFence', fence));
    }
    const grantModel = member ? 'CustomerRoleGrant' : 'StaffRoleGrant',
      roleModel = member ? 'CustomerRole' : 'StaffRole';
    let scanned = 0;
    for await (const item of store.scan(
      grantModel,
      member
        ? { membershipRef: { id: member.membershipId }, revokedAt: null }
        : { accountRef: { id: context.principalId }, revokedAt: null },
      a.queryDeadline(context),
    )) {
      requireCondition(
        ++scanned <= 2000,
        503,
        'AUTHORITY_SCAN_LIMIT',
        '현재 권위의 유한 조회가 필요합니다.',
      );
      const grant = await a.lookup(
        grantModel,
        String(item[member ? 'grantId' : 'staffGrantId']),
        transaction,
      );
      requireCondition(grant, 503, 'CURRENT_GRANT_REQUIRED', '현재 부여 원본이 필요합니다.');
      sources.push(ref(grantModel, grant));
      const role = await a.lookup(roleModel, (grant.roleRef as Ref).id, transaction);
      requireCondition(role, 503, 'CURRENT_ROLE_REQUIRED', '현재 역할 원본이 필요합니다.');
      sources.push(ref(roleModel, role));
      const state = await a.currentRoleState(
        roleModel,
        String(role[member ? 'roleId' : 'staffRoleId']),
        transaction,
      );
      if (state) {
        requireCondition(
          (state[member ? 'roleRef' : 'staffRoleRef'] as Ref).revision === role.revision,
          503,
          'ROLE_STATE_REVISION',
          '현재 역할 개정이 다릅니다.',
        );
        sources.push(ref('RoleRevisionState', state));
        for (const scopeRef of state.scopeRefs as Ref[]) {
          const scope = await a.lookup('ScopeV2', scopeRef.id, transaction);
          requireCondition(
            scope &&
              scope.revision === scopeRef.revision &&
              (scope.enterpriseRef as Ref).id === enterpriseId,
            503,
            'CURRENT_SCOPE_REQUIRED',
            '현재 술어가 필요합니다.',
          );
          sources.push(ref('ScopeV2', scope));
        }
      } else if (member)
        for (const scopeRef of role.actionScopeRefs as Ref[]) {
          const scope = await a.lookup('ActionScope', scopeRef.id, transaction);
          requireCondition(scope, 503, 'CURRENT_SCOPE_REQUIRED', '현재 술어가 필요합니다.');
          sources.push(ref('ActionScope', scope));
        }
    }
    const unique = [
      ...new Map(sources.map((source) => [source.entity + '/' + source.id, source])).values(),
    ].sort((left, right) =>
      (left.entity + '/' + left.id).localeCompare(right.entity + '/' + right.id),
    );
    return {
      principalId: context.principalId,
      audience: context.audience,
      epoch: await store.currentEpoch(),
      enterpriseId,
      profile,
      sources: unique,
    };
  }
  async assert(
    context: ServiceContext,
    snapshot: AuthorizationSnapshot,
    transaction?: ProtectedTransaction,
  ): Promise<void> {
    const current = await this.capture(
      context,
      snapshot.enterpriseId,
      transaction,
      snapshot.profile,
    );
    requireCondition(
      canonicalJson(current) === canonicalJson(snapshot),
      409,
      'AUTHORIZATION_FENCE_CHANGED',
      '현재 권위가 변경됐습니다.',
    );
  }
}
