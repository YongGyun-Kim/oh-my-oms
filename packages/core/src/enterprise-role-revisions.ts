import { randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { CommandMeta, Ref, ServiceContext, ScopeV2, Receipt } from '@oms/contracts';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import { U2_STAFF_FENCE_ID } from '@oms/persistence';
import type { EnterpriseAccess } from './enterprise-access.js';
import { ref } from './references.js';
import { validateScopeV2, scopeV2WithinManagement } from './scope-v2.js';
import { decodeLegacyScope } from './scope-compatibility.js';
import type { OrderingPolicy } from './scopes.js';
import { STAFF_ACTIONS } from './scopes.js';
import {
  currentManagementScopes,
  bumpEnterpriseAccessFence,
  runU2AccessCommand,
} from './enterprise-memberships.js';
import type { ManagementAccess } from './enterprise-memberships.js';

export async function currentRolePredicates(
  access: ManagementAccess,
  role: ModelData,
  transaction?: ProtectedTransaction,
): Promise<ScopeV2[]> {
  const state = await access.authorization.currentRoleState(
      'CustomerRole',
      String(role.roleId),
      transaction,
    ),
    result: ScopeV2[] = [];
  if (state) {
    for (const source of state.scopeRefs as Ref[]) {
      const scope = await access.authorization.lookup('ScopeV2', source.id, transaction);
      requireCondition(
        scope && scope.revision === source.revision,
        503,
        'SCOPE_REVISION',
        '현재 역할 술어가 필요합니다.',
      );
      result.push(validateScopeV2(scope.predicate as ScopeV2));
    }
    return result;
  }
  for (const source of role.actionScopeRefs as Ref[]) {
    const row = await access.authorization.lookup('ActionScope', source.id, transaction);
    requireCondition(row, 503, 'SCOPE_REQUIRED', '현재 원래 범위가 필요합니다.');
    const origin = await access.store.readRevision(
      'Enterprise',
      (row.enterpriseRef as Ref).id,
      (row.enterpriseRef as Ref).revision,
    );
    requireCondition(origin, 503, 'LEGACY_SCOPE_POLICY', '원래 조직 정책 개정이 필요합니다.');
    result.push(
      ...decodeLegacyScope(
        {
          enterpriseRef: row.enterpriseRef as Ref,
          action: String(row.action),
          kind: row.kind as ScopeV2['kind'],
          departmentRefs: row.departmentRefs as Ref[],
          siteRefs: row.siteRefs as Ref[],
        },
        {
          profile: 'u1:2',
          policyRevision: Number(origin.revision),
          policy: origin.orderingContextPolicy as OrderingPolicy,
        },
      ),
    );
  }
  return result;
}
export class EnterpriseRoleRevisions {
  constructor(
    private readonly access: EnterpriseAccess,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async customer(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref; label: string; predicates: ScopeV2[] },
  ): Promise<Receipt> {
    return this.changeCustomer(context, input, false);
  }
  async deactivateCustomer(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref },
  ): Promise<Receipt> {
    return this.changeCustomer(context, input, true);
  }
  private async changeCustomer(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref; label?: string; predicates?: ScopeV2[] },
    deactivate: boolean,
  ): Promise<Receipt> {
    const { store, authorization: a } = this.access;
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/' +
        (deactivate ? 'DeactivateRoleInput' : 'RoleRevisionInput'),
      input,
    );
    let role: ModelData, enterprise: ModelData, previousState: ModelData | null;
    const authorize = async (tx?: ProtectedTransaction) => {
      requireCondition(
        context.audience === 'CUSTOMER' &&
          input.roleRef.owner === 'EnterpriseAccess' &&
          input.roleRef.entity === 'CustomerRole',
        403,
        'CUSTOMER_ROLE',
        '현재 고객 역할 관리입니다.',
      );
      const current = await a.lookup('CustomerRole', input.roleRef.id, tx);
      requireCondition(
        current &&
          current.revision === input.roleRef.revision &&
          current.revision === input.meta.expectedRevision,
        409,
        'ROLE_REVISION',
        '현재 역할 개정이 다릅니다.',
      );
      const e = await a.lookup('Enterprise', (current.enterpriseRef as Ref).id, tx);
      requireCondition(
        e?.usageEnabled && e.approvalState === 'APPROVED',
        404,
        'NOT_FOUND',
        '대상을 확인할 수 없습니다.',
      );
      const management = await currentManagementScopes(this.access, context, e, tx),
        before = await currentRolePredicates(this.access, current, tx);
      requireCondition(
        management.some((scope) => scope.action === 'role.manage'),
        403,
        'ACTION_DENIED',
        '현재 역할 관리 권한이 필요합니다.',
      );
      for (const predicate of [...before, ...(input.predicates ?? [])]) {
        validateScopeV2(predicate);
        requireCondition(
          predicate.enterpriseRef.id === e.enterpriseId &&
            scopeV2WithinManagement(predicate, management, 'role.manage'),
          403,
          'ROLE_MANAGEMENT_SCOPE',
          '역할 전체가 현재 관리 범위 안에 있어야 합니다.',
        );
        for (const selected of [predicate.departmentSelector, predicate.siteSelector])
          if (selected.kind === 'EXACT') {
            const organisation = await a.lookup(selected.ref.entity, selected.ref.id, tx);
            requireCondition(
              organisation &&
                (organisation.enterpriseRef as Ref).id === e.enterpriseId &&
                organisation.revision === selected.ref.revision,
              400,
              'ROLE_ORGANISATION',
              '같은 기업의 명시 조직 원본이 필요합니다.',
            );
          }
      }
      role = current;
      enterprise = e;
      previousState = await a.currentRoleState('CustomerRole', String(current.roleId), tx);
    };
    return runU2AccessCommand(
      this.access,
      context,
      deactivate ? 'deactivateCustomerRole' : 'reviseCustomerRole',
      { kind: 'RECORD', recordRef: input.roleRef },
      input,
      authorize,
      async (tx) => {
        const next = {
          ...role,
          label: input.label ?? role.label,
          revision: Number(role.revision) + 1,
        };
        await tx.put('CustomerRole', next, Number(role.revision));
        const sources: Ref[] = [];
        if (deactivate && previousState) sources.push(...(previousState.scopeRefs as Ref[]));
        else
          for (const predicate of input.predicates ??
            (await currentRolePredicates(this.access, role, tx))) {
            const scope = {
              scopeId: randomUUID(),
              enterpriseRef: predicate.enterpriseRef,
              action: predicate.action,
              kind: predicate.kind,
              predicate,
              revision: 1,
            };
            await tx.put('ScopeV2', scope);
            sources.push(ref('ScopeV2', scope));
          }
        const state = {
          roleStateId: previousState?.roleStateId ?? randomUUID(),
          roleRef: ref('CustomerRole', next),
          staffRoleRef: null,
          active: deactivate ? false : (previousState?.active ?? true),
          scopeRefs: sources,
          actions: [],
          revision: Number(previousState?.revision ?? 0) + 1,
        };
        await tx.put(
          'RoleRevisionState',
          state,
          previousState ? Number(previousState.revision) : null,
        );
        await bumpEnterpriseAccessFence(this.access, tx, enterprise);
        return {
          target: ref('CustomerRole', next),
          refs: [ref('CustomerRole', next), ref('RoleRevisionState', state)],
          before: ref('CustomerRole', role),
          scope: this.access.managementTarget(enterprise),
          state: 'RESULT_RECORDED',
        };
      },
      this.now,
    );
  }
  async staff(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref; label: string; actions: string[] },
  ): Promise<Receipt> {
    return this.changeStaff(context, input, false);
  }
  async deactivateStaff(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref },
  ): Promise<Receipt> {
    return this.changeStaff(context, input, true);
  }
  private async changeStaff(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref; label?: string; actions?: string[] },
    deactivate: boolean,
  ): Promise<Receipt> {
    const { store, authorization: a } = this.access;
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/' +
        (deactivate ? 'DeactivateRoleInput' : 'StaffRoleRevisionInput'),
      input,
    );
    let role: ModelData, state: ModelData | null;
    const authorize = async (tx?: ProtectedTransaction) => {
      await a.requireStaff(context, 'staff.role.manage', tx);
      requireCondition(
        input.roleRef.owner === 'EnterpriseAccess' && input.roleRef.entity === 'StaffRole',
        400,
        'STAFF_ROLE',
        '명시 직원 역할 target이 필요합니다.',
      );
      const current = await a.lookup('StaffRole', input.roleRef.id, tx);
      requireCondition(
        current &&
          current.revision === input.meta.expectedRevision &&
          current.revision === input.roleRef.revision,
        409,
        'ROLE_REVISION',
        '현재 역할 개정이 다릅니다.',
      );
      role = current;
      state = await a.currentRoleState('StaffRole', String(current.staffRoleId), tx);
    };
    return runU2AccessCommand(
      this.access,
      context,
      deactivate ? 'deactivateStaffRole' : 'reviseStaffRole',
      { kind: 'RECORD', recordRef: input.roleRef },
      input,
      authorize,
      async (tx) => {
        const actions = input.actions ?? (state?.actions as string[]) ?? (role.actions as string[]);
        const legacy = actions.filter((action) => STAFF_ACTIONS.includes(action));
        // The versioned base projection remains representable by its old
        // decoder. Current authority always reads RoleRevisionState; a legacy
        // producer must reject an unsupported new-only action projection.
        const next = {
          ...role,
          label: input.label ?? role.label,
          actions: legacy.length ? legacy : role.actions,
          revision: Number(role.revision) + 1,
        };
        await tx.put('StaffRole', next, Number(role.revision));
        const nextState = {
          roleStateId: state?.roleStateId ?? randomUUID(),
          roleRef: null,
          staffRoleRef: ref('StaffRole', next),
          active: deactivate ? false : (state?.active ?? true),
          scopeRefs: [],
          actions,
          revision: Number(state?.revision ?? 0) + 1,
        };
        await tx.put('RoleRevisionState', nextState, state ? Number(state.revision) : null);
        const fence = await tx.get('StaffAuthorityFence', U2_STAFF_FENCE_ID);
        requireCondition(fence, 503, 'STAFF_FENCE_REQUIRED', '현재 직원 권위 fence가 필요합니다.');
        await tx.put(
          'StaffAuthorityFence',
          {
            ...fence,
            authorityRevision: Number(fence.authorityRevision) + 1,
            revision: Number(fence.revision) + 1,
          },
          Number(fence.revision),
        );
        return {
          target: ref('StaffRole', next),
          refs: [ref('StaffRole', next), ref('RoleRevisionState', nextState)],
          before: ref('StaffRole', role),
          scope: null,
          state: 'RESULT_RECORDED',
        };
      },
      this.now,
    );
  }
}
