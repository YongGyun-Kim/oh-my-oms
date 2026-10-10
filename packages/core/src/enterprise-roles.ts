import type { ActionScope, CommandMeta, Receipt, Ref, ServiceContext } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import type { ModelData } from '@oms/persistence';
import { randomUUID } from 'node:crypto';
import { EnterpriseInternal } from './enterprise-access-state.js';
import { ref } from './references.js';
import type { OrderingPolicy } from './scopes.js';
import {
  currentManagementScopes,
  bumpEnterpriseAccessFence,
  runU2AccessCommand,
  readOwnAccessReplay,
} from './enterprise-memberships.js';
import { currentRolePredicates } from './enterprise-role-revisions.js';
import { decodeLegacyScope } from './scope-compatibility.js';
import { scopeV2WithinManagement, requireManagedChange } from './scope-v2.js';
import { u2EnterpriseFenceId } from '@oms/persistence';
export async function defineCustomerRole(
  host: EnterpriseInternal,
  context: ServiceContext,
  enterpriseRef: Ref,
  input: { meta: CommandMeta; label: string; actionScopes: ActionScope[] },
): Promise<Receipt> {
  host.store.schema.validate('RoleInput', input);
  const replay = await readOwnAccessReplay(
    host,
    context,
    'defineCustomerRole',
    { kind: 'ENTERPRISE', enterpriseRef },
    input,
  );
  if (replay) return replay;
  await host.authorization.relation(context, enterpriseRef.id);
  const enterprise = await host.store.read('Enterprise', enterpriseRef.id);
  requireCondition(enterprise, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
  const target = host.managementTarget(enterprise);
  return runU2AccessCommand(
    host,
    context,
    'defineCustomerRole',
    { kind: 'ENTERPRISE', enterpriseRef },
    input,
    async (transaction) => {
      const current = await host.authorization.lookup('Enterprise', enterpriseRef.id, transaction);
      requireCondition(current?.usageEnabled, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      const management = await currentManagementScopes(host, context, current, transaction);
      requireCondition(
        management.some((scope) => scope.action === 'role.manage'),
        403,
        'ACTION_DENIED',
        '현재 역할 관리 권한이 필요합니다.',
      );
      for (const scope of input.actionScopes) {
        const origin = await host.store.readRevision(
          'Enterprise',
          scope.enterpriseRef.id,
          scope.enterpriseRef.revision,
        );
        requireCondition(origin, 503, 'LEGACY_SCOPE_POLICY', '원래 조직 정책 개정이 필요합니다.');
        const candidates = decodeLegacyScope(scope, {
          profile: 'u1:2',
          policyRevision: Number(origin.revision),
          policy: origin.orderingContextPolicy as OrderingPolicy,
        });
        requireCondition(
          candidates.every((candidate) =>
            scopeV2WithinManagement(candidate, management, 'role.manage'),
          ),
          403,
          'MANAGEMENT_ROLE_SCOPE',
          '역할 전체가 현재 관리 범위 안에 있어야 합니다.',
        );
      }
    },
    async (transaction) => {
      requireCondition(
        input.meta.expectedRevision === null,
        400,
        'CREATE_REVISION',
        '신규 역할에 기대 개정을 지정할 수 없습니다.',
      );
      const scopes: Ref[] = [];
      for (const scope of input.actionScopes) {
        await host.validateScope(scope, enterpriseRef.id, transaction);
        const data = { actionScopeId: randomUUID(), ...scope, revision: 1 };
        await transaction.put('ActionScope', data);
        scopes.push(ref('ActionScope', data));
      }
      const role = {
        roleId: randomUUID(),
        enterpriseRef,
        label: input.label,
        actionScopeRefs: scopes,
        revision: 1,
      };
      await transaction.put('CustomerRole', role);
      if (await transaction.get('EnterpriseAccessFence', u2EnterpriseFenceId(enterpriseRef.id)))
        await bumpEnterpriseAccessFence(host, transaction, enterprise);
      return {
        target: ref('CustomerRole', role),
        refs: [ref('CustomerRole', role)],
        scope: target,
        state: 'RESULT_RECORDED',
      };
    },
    host.now,
  );
}
export async function grantCustomerRole(
  host: EnterpriseInternal,
  context: ServiceContext,
  enterpriseRef: Ref,
  input: { meta: CommandMeta; accountRef: Ref; roleRef: Ref; decision: 'GRANT' | 'REVOKE' },
): Promise<Receipt> {
  host.store.schema.validate('RoleGrantInput', input);
  const replay = await readOwnAccessReplay(
    host,
    context,
    'grantCustomerRole',
    { kind: 'ENTERPRISE', enterpriseRef },
    input,
  );
  if (replay) return replay;
  await host.authorization.relation(context, enterpriseRef.id);
  const enterprise = await host.store.read('Enterprise', enterpriseRef.id);
  requireCondition(enterprise, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
  const target = host.managementTarget(enterprise);
  return runU2AccessCommand(
    host,
    context,
    'grantCustomerRole',
    { kind: 'ENTERPRISE', enterpriseRef },
    input,
    async (transaction) => {
      const current = await host.authorization.lookup('Enterprise', enterpriseRef.id, transaction);
      requireCondition(current?.usageEnabled, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      const role = await host.authorization.lookup('CustomerRole', input.roleRef.id, transaction);
      requireCondition(
        role && (role.enterpriseRef as Ref).id === enterpriseRef.id,
        400,
        'ROLE_ENTERPRISE',
        '현재 기업 역할을 확인하세요.',
      );
      const members = transaction
        ? await transaction.list(
            'EnterpriseMembership',
            {
              enterpriseRef: { id: enterpriseRef.id },
              accountRef: { id: input.accountRef.id },
              active: true,
            },
            2,
          )
        : await host.store.list('EnterpriseMembership', {
            equals: {
              enterpriseRef: { id: enterpriseRef.id },
              accountRef: { id: input.accountRef.id },
              active: true,
            },
            limit: 2,
          });
      requireCondition(
        members.length === 1,
        400,
        'GRANTEE_MEMBERSHIP',
        '수신자의 현재 기업 소속이 필요합니다.',
      );
      const member = members[0]!,
        management = await currentManagementScopes(host, context, current, transaction);
      const memberTarget = {
        ...host.managementTarget(current),
        departmentRef: member.departmentRef as Ref | null,
        siteRef: member.siteRef as Ref | null,
      };
      requireManagedChange(
        management,
        'role.manage',
        memberTarget,
        memberTarget,
        current.orderingContextPolicy as OrderingPolicy,
        await currentRolePredicates(host, role, transaction),
      );
    },
    async (transaction) => {
      const role = await host.authorization.lookup('CustomerRole', input.roleRef.id, transaction);
      requireCondition(
        role &&
          input.roleRef.owner === 'EnterpriseAccess' &&
          input.roleRef.entity === 'CustomerRole' &&
          (role.enterpriseRef as Ref).id === enterpriseRef.id &&
          role.revision === input.roleRef.revision,
        400,
        'ROLE_ENTERPRISE',
        '현재 기업 역할을 확인하세요.',
      );
      const account = await host.authorization.lookup('Account', input.accountRef.id, transaction);
      requireCondition(account?.active, 400, 'GRANTEE_ACCOUNT', '활성 수신 계정이 필요합니다.');
      const members = await transaction.list(
        'EnterpriseMembership',
        {
          enterpriseRef: { id: enterpriseRef.id },
          accountRef: { id: input.accountRef.id },
          active: true,
        },
        2,
      );
      requireCondition(
        members.length === 1,
        400,
        'GRANTEE_MEMBERSHIP',
        '수신자의 현재 기업 소속이 필요합니다.',
      );
      const matches = await transaction.list(
        'CustomerRoleGrant',
        {
          membershipRef: { id: members[0]!.membershipId },
          roleRef: { id: role.roleId },
          revokedAt: null,
        },
        2,
      );
      requireCondition(
        matches.length <= 1,
        503,
        'GRANT_CONFLICT',
        '원래 역할 부여를 대조해야 합니다.',
      );
      let result: ModelData;
      if (input.decision === 'GRANT') {
        requireCondition(
          matches.length === 0 && input.meta.expectedRevision === null,
          409,
          'GRANT_EXISTS',
          '이미 부여된 역할을 확인하세요.',
        );
        result = {
          grantId: randomUUID(),
          membershipRef: ref('EnterpriseMembership', members[0]!),
          roleRef: ref('CustomerRole', role),
          effectiveFrom: host.now().toISOString(),
          revokedAt: null,
          grantedBy: context.actorAccountRef,
          revision: 1,
        };
      } else {
        requireCondition(
          matches[0] && matches[0].revision === input.meta.expectedRevision,
          409,
          'STALE_REVISION',
          '원래 역할 부여 개정을 확인하세요.',
        );
        result = {
          ...matches[0],
          revokedAt: host.now().toISOString(),
          revision: Number(matches[0].revision) + 1,
        };
      }
      await transaction.put(
        'CustomerRoleGrant',
        result,
        matches[0] ? Number(matches[0].revision) : null,
      );
      if (await transaction.get('EnterpriseAccessFence', u2EnterpriseFenceId(enterpriseRef.id)))
        await bumpEnterpriseAccessFence(host, transaction, enterprise);
      return {
        target: ref('CustomerRoleGrant', result),
        refs: [ref('CustomerRoleGrant', result)],
        scope: target,
        state: 'RESULT_RECORDED',
      };
    },
    host.now,
  );
}
