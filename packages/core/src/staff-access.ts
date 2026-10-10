import { randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { CommandMeta, Receipt, Ref, ServiceContext } from '@oms/contracts';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { Commands } from './commands.js';
import { ref } from './references.js';
import { STAFF_ACTIONS } from './scopes.js';
import { U2_STAFF_FENCE_ID } from '@oms/persistence';
export class StaffAccess {
  private readonly authorization: Authorization;
  private readonly commands: Commands;
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
  ) {
    this.authorization = new Authorization(store, now);
    this.commands = new Commands(store, now);
  }
  async readRoles(
    context: ServiceContext,
    query: { cursor: string | null; pageSize: number },
  ): Promise<unknown> {
    await this.authorization.requireStaff(context, 'staff.role.manage');
    const roles = await this.store.list('StaffRole', {
      cursor: query.cursor,
      limit: query.pageSize,
    });
    const items = [];
    for (const role of roles) {
      const current = await this.authorization.lookup('StaffRole', String(role.staffRoleId));
      requireCondition(current, 503, 'ROLE_UNCONFIRMED', '현재 직원 역할 원본을 확인하세요.');
      const roleState = await this.authorization.currentRoleState(
        'StaffRole',
        String(current.staffRoleId),
      );
      requireCondition(
        ((roleState?.actions ?? current.actions) as string[]).every((action) =>
          STAFF_ACTIONS.includes(action),
        ),
        503,
        'UNSUPPORTED_ROLE_PROFILE',
        '현재 직원 역할은 명시 U2 소비자 프로필로 조회해야 합니다.',
      );
      const records = await this.store.list('StaffRoleGrant', {
        equals: { roleRef: { id: role.staffRoleId } },
        limit: 100,
      });
      const grants = [];
      for (const record of records) {
        const grant = await this.authorization.lookup(
          'StaffRoleGrant',
          String(record.staffGrantId),
        );
        requireCondition(grant, 503, 'GRANT_UNCONFIRMED', '현재 직원 역할 부여를 확인하세요.');
        grants.push({
          grantRef: ref('StaffRoleGrant', grant),
          accountRef: grant.accountRef,
          effective:
            roleState?.active !== false &&
            grant.revokedAt === null &&
            Date.parse(String(grant.effectiveFrom)) <= this.now().getTime(),
        });
      }
      items.push({
        roleRef: ref('StaffRole', current),
        label: current.label,
        actions: roleState?.actions ?? current.actions,
        grants,
        grantNextCursor: records.length === 100 ? String(records.at(-1)!.staffGrantId) : null,
      });
    }
    await this.authorization.requireStaff(context, 'staff.role.manage');
    return this.store.schema.validate('StaffRolePage', {
      items,
      nextCursor: roles.length === query.pageSize ? String(roles.at(-1)!.staffRoleId) : null,
      observedAt: this.now().toISOString(),
    });
  }
  async defineRole(
    context: ServiceContext,
    input: { meta: CommandMeta; label: string; actions: string[] },
  ): Promise<Receipt> {
    this.store.schema.validate('StaffRoleInput', input);
    requireCondition(
      input.actions.every((action) => STAFF_ACTIONS.includes(action)),
      400,
      'UNKNOWN_STAFF_ACTION',
      '등록된 직원 행위만 허용합니다.',
    );
    return this.commands.run(
      context,
      'EnterpriseAccess',
      'defineStaffRole',
      { kind: 'NONE' },
      input,
      'AccessHistory',
      (transaction) => this.authorization.requireStaff(context, 'staff.role.manage', transaction),
      async (transaction) => {
        requireCondition(
          input.meta.expectedRevision === null,
          400,
          'CREATE_REVISION',
          '신규 역할 개정을 확인하세요.',
        );
        const role = {
          staffRoleId: randomUUID(),
          label: input.label,
          actions: input.actions,
          revision: 1,
        };
        await transaction.put('StaffRole', role);
        await this.bumpFence(transaction);
        return {
          target: ref('StaffRole', role),
          refs: [ref('StaffRole', role)],
          scope: null,
          state: 'RESULT_RECORDED',
        };
      },
    );
  }
  async grantRole(
    context: ServiceContext,
    input: { meta: CommandMeta; accountRef: Ref; roleRef: Ref; decision: 'GRANT' | 'REVOKE' },
  ): Promise<Receipt> {
    this.store.schema.validate('RoleGrantInput', input);
    return this.commands.run(
      context,
      'EnterpriseAccess',
      'grantStaffRole',
      { kind: 'NONE' },
      input,
      'AccessHistory',
      (transaction) => this.authorization.requireStaff(context, 'staff.role.manage', transaction),
      async (transaction) => {
        requireCondition(
          input.roleRef.owner === 'EnterpriseAccess' &&
            input.roleRef.entity === 'StaffRole' &&
            input.accountRef.owner === 'IdentityRecovery' &&
            input.accountRef.entity === 'Account',
          400,
          'STAFF_GRANT_TARGET',
          '직원 역할/계정 대상이 필요합니다.',
        );
        const role = await this.authorization.lookup('StaffRole', input.roleRef.id, transaction);
        const account = await this.authorization.lookup(
          'Account',
          input.accountRef.id,
          transaction,
        );
        requireCondition(
          role && role.revision === input.roleRef.revision && account?.active,
          400,
          'STAFF_GRANT_TARGET',
          '현재 직원 역할/계정이 필요합니다.',
        );
        const state = await this.authorization.currentRoleState(
          'StaffRole',
          input.roleRef.id,
          transaction,
        );
        requireCondition(
          input.decision !== 'GRANT' || state?.active !== false,
          409,
          'ROLE_INACTIVE',
          '비활성 역할을 새로 부여하지 않습니다.',
        );
        const bindings = await this.store.list('ProviderBinding', {
          equals: { accountRef: { id: input.accountRef.id }, audience: 'STAFF', active: true },
          limit: 2,
        });
        requireCondition(
          bindings.length === 1,
          400,
          'STAFF_BINDING_REQUIRED',
          '직원 전용 신원 연결이 필요합니다.',
        );
        await this.authorization.lookup(
          'ProviderBinding',
          String(bindings[0]!.bindingId),
          transaction,
        );
        const existing = await transaction.list(
          'StaffRoleGrant',
          {
            accountRef: { id: input.accountRef.id },
            roleRef: { id: input.roleRef.id },
            revokedAt: null,
          },
          2,
        );
        requireCondition(
          existing.length <= 1,
          503,
          'GRANT_CONFLICT',
          '직원 부여 원본을 대조해야 합니다.',
        );
        let grant: ModelData;
        if (input.decision === 'GRANT') {
          requireCondition(
            !existing[0] && input.meta.expectedRevision === null,
            409,
            'GRANT_EXISTS',
            '이미 부여된 역할을 확인하세요.',
          );
          grant = {
            staffGrantId: randomUUID(),
            accountRef: ref('Account', account),
            roleRef: ref('StaffRole', role),
            effectiveFrom: this.now().toISOString(),
            revokedAt: null,
            grantedBy: context.actorAccountRef,
            revision: 1,
          };
        } else {
          requireCondition(
            existing[0] && existing[0].revision === input.meta.expectedRevision,
            409,
            'STALE_REVISION',
            '원래 부여 개정을 확인하세요.',
          );
          grant = {
            ...existing[0],
            revokedAt: this.now().toISOString(),
            revision: Number(existing[0].revision) + 1,
          };
        }
        await transaction.put(
          'StaffRoleGrant',
          grant,
          existing[0] ? Number(existing[0].revision) : null,
        );
        await this.bumpFence(transaction);
        return {
          target: ref('StaffRoleGrant', grant),
          refs: [ref('StaffRoleGrant', grant)],
          scope: null,
          state: 'RESULT_RECORDED',
        };
      },
    );
  }
  private async bumpFence(
    transaction: import('@oms/persistence').ProtectedTransaction,
  ): Promise<void> {
    const current = await transaction.get('StaffAuthorityFence', U2_STAFF_FENCE_ID);
    if (current)
      await transaction.put(
        'StaffAuthorityFence',
        {
          ...current,
          authorityRevision: Number(current.authorityRevision) + 1,
          revision: Number(current.revision) + 1,
        },
        Number(current.revision),
      );
  }
}
