import { requireCondition, ExecutionBudget } from '@oms/contracts';
import type { ActionScope, Ref, ServiceContext, TargetScope, ScopeV2 } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { currentSecurityMatches, sameSessionAuthority } from '@oms/persistence';
import { scopeIncludes } from './scopes.js';
import type { OrderingPolicy } from './scopes.js';
import { scopeV2Includes } from './scope-v2.js';
export class Authorization {
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
  ) {}
  queryDeadline(context?: ServiceContext): string {
    // Authority TTL uses this owner's injected clock. The SQL scan uses wall
    // time; convert only the remaining duration, without renewing either TTL.
    const authorityRemaining = context
        ? Date.parse(context.deadlineAt) - this.now().getTime()
        : 5000,
      remaining = Math.min(
        5000,
        authorityRemaining,
        ExecutionBudget.current()?.remaining() ?? 5000,
      );
    requireCondition(
      Number.isFinite(remaining) && remaining > 0,
      503,
      'QUERY_DEADLINE',
      '현재 권위/실행 조회 기한을 초과했습니다.',
    );
    return new Date(Date.now() + remaining).toISOString();
  }
  async lookup(
    model: string,
    id: string,
    transaction?: ProtectedTransaction,
  ): Promise<ModelData | null> {
    const protectedValue = await this.store.currentProtected(model, id);
    if (!transaction) return protectedValue;
    const current = await transaction.get(model, id);
    requireCondition(
      currentSecurityMatches(model, protectedValue, current),
      503,
      'CURRENT_AUTH_NOT_PROTECTED',
      '현재 권한 변경을 확인해야 합니다.',
    );
    return model === 'IdentitySession' ? protectedValue : current;
  }
  async identity(context: ServiceContext, transaction?: ProtectedTransaction): Promise<ModelData> {
    requireCondition(
      context.audience !== 'SYSTEM' &&
        context.actorAccountRef?.id === context.principalId &&
        context.identityAssertionRef.owner === 'IdentityRecovery' &&
        context.identityAssertionRef.entity === 'IdentitySession',
      401,
      'TRUSTED_IDENTITY_REQUIRED',
      '검증된 사용자 문맥이 필요합니다.',
    );
    const session = await this.lookup(
      'IdentitySession',
      context.identityAssertionRef.id,
      transaction,
    );
    const now = this.now().getTime();
    const asserted =
      session?.revision === context.identityAssertionRef.revision
        ? session
        : await this.store.readRevision(
            'IdentitySession',
            context.identityAssertionRef.id,
            context.identityAssertionRef.revision,
          );
    requireCondition(
      session?.phase === 'MFA_VERIFIED' &&
        sameSessionAuthority(asserted, session) &&
        session.audience === context.audience &&
        (session.accountRef as Ref).id === context.principalId &&
        session.recoveryEpoch === (await this.store.currentEpoch()) &&
        Date.parse(String(session.deadlineAt)) > now &&
        now - Date.parse(String(session.lastActiveAt)) <
          (context.audience === 'STAFF' ? 15 : 30) * 60000 &&
        Date.parse(context.deadlineAt) > now,
      401,
      'SESSION_REQUIRED',
      '현재 인증을 확인하세요.',
    );
    const account = await this.lookup('Account', context.principalId, transaction);
    requireCondition(account?.active, 401, 'ACCOUNT_INACTIVE', '현재 계정을 확인하세요.');
    const bindings = await this.store.list('ProviderBinding', {
      equals: { accountRef: { id: context.principalId }, audience: context.audience, active: true },
      limit: 2,
    });
    requireCondition(
      bindings.length === 1,
      401,
      'BINDING_REQUIRED',
      '현재 신원 연결을 확인하세요.',
    );
    const binding = await this.lookup(
      'ProviderBinding',
      String(bindings[0]!.bindingId),
      transaction,
    );
    requireCondition(
      binding?.generation === session.bindingGeneration &&
        binding?.authRevision === session.authRevision,
      401,
      'BINDING_CHANGED',
      '신원 연결이 변경되었습니다.',
    );
    const factor = await this.lookup(
      'MfaEnrollment',
      (session.mfaEnrollmentRef as Ref).id,
      transaction,
    );
    requireCondition(
      factor?.state === 'VERIFIED' &&
        (factor.accountRef as Ref).id === context.principalId &&
        factor.revision === (session.mfaEnrollmentRef as Ref).revision,
      401,
      'MFA_REQUIRED',
      '현재 MFA 확인이 필요합니다.',
    );
    return account;
  }
  async currentRoleState(
    kind: 'CustomerRole' | 'StaffRole',
    id: string,
    transaction?: ProtectedTransaction,
  ): Promise<ModelData | null> {
    const field = kind === 'CustomerRole' ? 'roleRef' : 'staffRoleRef';
    const raw = await this.store.primary.query(
      'SELECT "roleStateId" AS id FROM u1_role_revision_state WHERE "' +
        field +
        "\"->>'id'=$1 LIMIT 2",
      [id],
    );
    const visible = await this.store.list('RoleRevisionState', {
      equals: { [field]: { id } },
      limit: 2,
    });
    requireCondition(
      raw.length === visible.length && visible.length <= 1,
      503,
      'CURRENT_AUTH_NOT_PROTECTED',
      '현재 역할 상태의 보호가 필요합니다.',
    );
    for (const row of raw)
      requireCondition(
        visible.some((state) => state.roleStateId === row.id),
        503,
        'CURRENT_AUTH_NOT_PROTECTED',
        '현재 역할 상태의 보호가 필요합니다.',
      );
    if (!visible[0]) return null;
    return this.lookup('RoleRevisionState', String(visible[0].roleStateId), transaction);
  }
  async requireStaff(
    context: ServiceContext,
    action: string,
    transaction?: ProtectedTransaction,
  ): Promise<void> {
    await this.identity(context, transaction);
    requireCondition(context.audience === 'STAFF', 403, 'STAFF_REQUIRED', '직원 행위입니다.');
    let allowed = false;
    for await (const item of this.store.scan(
      'StaffRoleGrant',
      { accountRef: { id: context.principalId }, revokedAt: null },
      this.queryDeadline(context),
    )) {
      const grant = await this.lookup('StaffRoleGrant', String(item.staffGrantId), transaction);
      if (
        !grant ||
        grant.revokedAt !== null ||
        Date.parse(String(grant.effectiveFrom)) > this.now().getTime()
      )
        continue;
      const role = await this.lookup('StaffRole', (grant.roleRef as Ref).id, transaction);
      if (!role) continue;
      const state = await this.currentRoleState('StaffRole', String(role.staffRoleId), transaction);
      if (state) {
        requireCondition(
          (state.staffRoleRef as Ref).revision === role.revision,
          503,
          'ROLE_STATE_REVISION',
          '현재 역할 개정이 다릅니다.',
        );
        if (!state.active) continue;
      }
      if (((state?.actions ?? role.actions) as string[]).includes(action)) allowed = true;
    }
    requireCondition(allowed, 403, 'ACTION_DENIED', '현재 행위 권한이 없습니다.');
  }
  // Revalidate an already protected decision issuer; this never creates a
  // session or authorizes a caller command.
  async requireStaffSource(
    accountRef: Ref,
    action: string,
    transaction?: ProtectedTransaction,
  ): Promise<void> {
    requireCondition(
      accountRef.owner === 'IdentityRecovery' && accountRef.entity === 'Account',
      403,
      'ISSUER_AUTHORITY',
      '현재 직원 확인 원본이 필요합니다.',
    );
    const account = await this.lookup('Account', accountRef.id, transaction),
      bindings = await this.store.list('ProviderBinding', {
        equals: { accountRef: { id: accountRef.id }, audience: 'STAFF', active: true },
        limit: 2,
      });
    requireCondition(
      account?.active && bindings.length === 1,
      403,
      'ISSUER_AUTHORITY',
      '현재 확인 직원 계정/연결이 필요합니다.',
    );
    const binding = await this.lookup(
      'ProviderBinding',
      String(bindings[0]!.bindingId),
      transaction,
    );
    requireCondition(binding?.active, 403, 'ISSUER_AUTHORITY', '현재 확인 직원 연결이 필요합니다.');
    let allowed = false,
      count = 0;
    for await (const item of this.store.scan(
      'StaffRoleGrant',
      { accountRef: { id: accountRef.id }, revokedAt: null },
      this.queryDeadline(),
    )) {
      requireCondition(
        ++count <= 2000,
        503,
        'AUTHORITY_SCAN_LIMIT',
        '유한 확인 직원 권위 대조가 필요합니다.',
      );
      const grant = await this.lookup('StaffRoleGrant', String(item.staffGrantId), transaction);
      if (
        !grant ||
        grant.revokedAt !== null ||
        Date.parse(String(grant.effectiveFrom)) > this.now().getTime()
      )
        continue;
      const role = await this.lookup('StaffRole', (grant.roleRef as Ref).id, transaction);
      if (!role) continue;
      const state = await this.currentRoleState('StaffRole', String(role.staffRoleId), transaction);
      if (state) {
        requireCondition(
          (state.staffRoleRef as Ref).revision === role.revision,
          503,
          'ROLE_STATE_REVISION',
          '현재 확인 직원 역할 개정이 필요합니다.',
        );
        if (!state.active) continue;
      }
      if (((state?.actions ?? role.actions) as string[]).includes(action)) allowed = true;
    }
    requireCondition(
      allowed,
      403,
      'ISSUER_AUTHORITY',
      '확인 직원의 현재 행위 권위가 회수됐습니다.',
    );
  }
  async relation(
    context: ServiceContext,
    enterpriseId: string,
    transaction?: ProtectedTransaction,
  ): Promise<ModelData> {
    await this.identity(context, transaction);
    requireCondition(context.audience === 'CUSTOMER', 403, 'CUSTOMER_REQUIRED', '고객 행위입니다.');
    const members = await this.store.list('EnterpriseMembership', {
      equals: {
        accountRef: { id: context.principalId },
        enterpriseRef: { id: enterpriseId },
        active: true,
      },
      limit: 2,
    });
    requireCondition(members.length === 1, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    const member = await this.lookup(
      'EnterpriseMembership',
      String(members[0]!.membershipId),
      transaction,
    );
    requireCondition(
      member?.active && (member.enterpriseRef as Ref).id === enterpriseId,
      404,
      'NOT_FOUND',
      '대상을 확인할 수 없습니다.',
    );
    return member;
  }
  async requireCustomer(
    context: ServiceContext,
    action: string,
    target: TargetScope,
    original: OrderingPolicy,
    transaction?: ProtectedTransaction,
  ): Promise<ModelData> {
    const member = await this.relation(context, target.enterpriseRef.id, transaction);
    const enterprise = await this.lookup('Enterprise', target.enterpriseRef.id, transaction);
    requireCondition(
      enterprise?.approvalState === 'APPROVED' && enterprise.usageEnabled,
      403,
      'ENTERPRISE_NOT_ENABLED',
      '기업 승인 또는 이용 가능 상태를 확인하세요.',
    );
    let allowed = false;
    for await (const item of this.store.scan(
      'CustomerRoleGrant',
      { membershipRef: { id: member.membershipId }, revokedAt: null },
      this.queryDeadline(context),
    )) {
      const grant = await this.lookup('CustomerRoleGrant', String(item.grantId), transaction);
      if (
        !grant ||
        grant.revokedAt !== null ||
        Date.parse(String(grant.effectiveFrom)) > this.now().getTime()
      )
        continue;
      const role = await this.lookup('CustomerRole', (grant.roleRef as Ref).id, transaction);
      requireCondition(
        role && (role.enterpriseRef as Ref).id === target.enterpriseRef.id,
        403,
        'ROLE_ENTERPRISE',
        '역할의 기업 관계가 다릅니다.',
      );
      const state = await this.currentRoleState('CustomerRole', String(role.roleId), transaction);
      if (state) {
        requireCondition(
          (state.roleRef as Ref).revision === role.revision,
          503,
          'ROLE_STATE_REVISION',
          '현재 역할 개정이 다릅니다.',
        );
        if (!state.active) continue;
        for (const scopeRef of state.scopeRefs as Ref[]) {
          const scope = await this.lookup('ScopeV2', scopeRef.id, transaction);
          requireCondition(
            scope && scope.revision === scopeRef.revision,
            503,
            'SCOPE_REVISION',
            '현재 완성 술어 개정이 필요합니다.',
          );
          if (
            scopeV2Includes(
              scope.predicate as ScopeV2,
              action,
              target,
              original,
              ['organisation.manage', 'user.manage', 'role.manage'].includes(action)
                ? 'MANAGEMENT'
                : 'BUSINESS',
            )
          )
            allowed = true;
        }
        continue;
      }
      for (const scopeRef of role.actionScopeRefs as Ref[]) {
        const scope = await this.lookup('ActionScope', scopeRef.id, transaction);
        requireCondition(
          (scope?.enterpriseRef as Ref | undefined)?.id === target.enterpriseRef.id,
          403,
          'SCOPE_ENTERPRISE',
          '행위 범위의 기업 관계가 다릅니다.',
        );
        requireCondition(scope, 403, 'SCOPE_ENTERPRISE', '행위 범위가 없습니다.');
        if (
          scopeIncludes(
            {
              action: String(scope.action),
              kind: scope.kind as ActionScope['kind'],
              enterpriseRef: scope.enterpriseRef as Ref,
              departmentRefs: scope.departmentRefs as Ref[],
              siteRefs: scope.siteRefs as Ref[],
            },
            action,
            target,
            original,
          )
        )
          allowed = true;
      }
    }
    requireCondition(allowed, 403, 'ACTION_DENIED', '이 대상에 대한 현재 행위 권한이 없습니다.');
    return member;
  }
}
