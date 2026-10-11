import { randomUUID } from 'node:crypto';
import {
  canonicalJson,
  declareU3Operations,
  OperationRegistry,
  requireCondition,
  U3_PROFILE,
  U3_REGISTRY_VERSION,
} from '@oms/contracts';
import type { CommandMeta, Ref, Receipt, ServiceContext } from '@oms/contracts';
import { U2_STAFF_FENCE_ID, U3_SOURCE_CONTRACT } from '@oms/persistence';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { AuthorizationFence } from './authorization-fence.js';
import { Commands } from './commands.js';
import { ref } from './references.js';
import { STAFF_ACTIONS } from './scopes.js';

export interface U3StaffRoleInput {
  meta: CommandMeta;
  label: string;
  actions: string[];
}
export class U3StaffAccess {
  private readonly authorization: Authorization;
  private readonly commands: Commands;
  private readonly registry: OperationRegistry;
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
  ) {
    this.authorization = new Authorization(store, now);
    this.commands = new Commands(store, now);
    this.registry = new OperationRegistry(store.schema);
    declareU3Operations(this.registry);
  }
  async defineRole(context: ServiceContext, input: U3StaffRoleInput): Promise<Receipt> {
    const operation = this.registry.lookup(
      'EnterpriseAccess',
      'defineStaffRole',
      U3_REGISTRY_VERSION,
    );
    this.store.schema.validateUri(operation.input, input);
    return this.commands.run(
      context,
      'EnterpriseAccess',
      'defineStaffRole',
      { kind: 'NONE' },
      input,
      'AccessHistory',
      (tx) => this.authorization.requireStaff(context, 'staff.role.manage', tx),
      async (tx) => {
        const snapshot = await new AuthorizationFence(this.authorization).capture(
          context,
          null,
          tx,
        );
        requireCondition(
          input.meta.expectedRevision === null,
          400,
          'CREATE_REVISION',
          '새 직원 역할은 예상 개정이 없어야 합니다.',
        );
        const role = {
          modelVersion: 2,
          staffRoleId: randomUUID(),
          label: input.label,
          actions: input.actions.filter((action) => STAFF_ACTIONS.includes(action)),
          revision: 1,
          sourceContract: U3_SOURCE_CONTRACT,
        };
        await tx.put('StaffRole', role);
        await tx.put('RoleRevisionState', {
          modelVersion: 2,
          roleStateId: randomUUID(),
          roleRef: null,
          staffRoleRef: ref('StaffRole', role),
          active: true,
          scopeRefs: [],
          actions: input.actions,
          revision: 1,
          sourceContract: U3_SOURCE_CONTRACT,
        });
        await this.bump(tx);
        await this.assertAuthority(context, tx, snapshot.sources);
        return {
          target: ref('StaffRole', role),
          refs: [ref('StaffRole', role)],
          scope: null,
          state: 'RESULT_RECORDED',
        };
      },
      U3_SOURCE_CONTRACT,
    );
  }
  reviseRole(
    context: ServiceContext,
    input: U3StaffRoleInput & { roleRef: Ref },
  ): Promise<Receipt> {
    return this.change(context, input, false);
  }
  deactivateRole(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref },
  ): Promise<Receipt> {
    return this.change(context, input, true);
  }
  private async change(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref; label?: string; actions?: string[] },
    deactivate: boolean,
  ): Promise<Receipt> {
    const name = deactivate ? 'deactivateStaffRole' : 'reviseStaffRole',
      operation = this.registry.lookup('EnterpriseAccess', name, U3_REGISTRY_VERSION);
    this.store.schema.validateUri(operation.input, input);
    const authorize = (tx?: ProtectedTransaction) =>
      this.authorization.requireStaff(context, 'staff.role.manage', tx);
    return this.commands.run(
      context,
      'EnterpriseAccess',
      name,
      { kind: 'RECORD', recordRef: input.roleRef },
      input,
      'AccessHistory',
      authorize,
      async (tx) => {
        const snapshot = await new AuthorizationFence(this.authorization).capture(
          context,
          null,
          tx,
        );
        const role = await this.authorization.lookup('StaffRole', input.roleRef.id, tx);
        requireCondition(
          role?.modelVersion === 2 &&
            role.revision === input.roleRef.revision &&
            role.revision === input.meta.expectedRevision,
          409,
          'ROLE_REVISION',
          '명시 새 profile의 현재 역할 개정을 확인해야 합니다. 구형 자동 전환은 제공하지 않습니다.',
        );
        const state = await this.authorization.currentRoleState('StaffRole', input.roleRef.id, tx);
        requireCondition(
          state?.modelVersion === 2,
          503,
          'U3_ROLE_STATE_REQUIRED',
          '새 직원 역할의 실제 현재 행위 원본이 필요합니다.',
        );
        const actions = input.actions ?? (state.actions as string[]);
        const next = {
          ...role,
          label: input.label ?? role.label,
          actions: actions.filter((action) => STAFF_ACTIONS.includes(action)),
          revision: Number(role.revision) + 1,
        };
        await tx.put('StaffRole', next, Number(role.revision));
        await tx.put(
          'RoleRevisionState',
          {
            ...state,
            staffRoleRef: ref('StaffRole', next),
            actions,
            active: deactivate ? false : state.active,
            revision: Number(state.revision) + 1,
          },
          Number(state.revision),
        );
        await this.bump(tx);
        await this.assertAuthority(context, tx, snapshot.sources);
        return {
          target: ref('StaffRole', next),
          refs: [ref('StaffRole', next)],
          before: input.roleRef,
          scope: null,
          state: 'RESULT_RECORDED',
        };
      },
      U3_SOURCE_CONTRACT,
    );
  }
  private async bump(tx: ProtectedTransaction): Promise<void> {
    const fence = await this.authorization.lookup('StaffAuthorityFence', U2_STAFF_FENCE_ID, tx);
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
  }
  private async assertAuthority(
    context: ServiceContext,
    tx: ProtectedTransaction,
    sources: Ref[],
  ): Promise<void> {
    await this.authorization.identity(context, tx);
    for (const source of sources) {
      const original = await this.store.currentProtected(source.entity, source.id);
      requireCondition(
        original && canonicalJson(ref(source.entity, original)) === canonicalJson(source),
        409,
        'AUTHORIZATION_FENCE_CHANGED',
        '원래 현재 권위 개정이 변경됐습니다.',
      );
      const written = tx.rows().find((row) => row.model === source.entity && row.id === source.id);
      const current = await tx.get(source.entity, source.id);
      requireCondition(
        current &&
          !written?.deleted &&
          canonicalJson(current) === canonicalJson(written?.data ?? original),
        503,
        'CURRENT_AUTH_NOT_PROTECTED',
        '현재 권위는 원래 보호 자료 또는 이 명령의 명시 변경과 일치해야 합니다.',
      );
    }
  }
  async readRoles(
    context: ServiceContext,
    query: { cursor: string | null; pageSize: number },
  ): Promise<unknown> {
    this.store.schema.validateUri(U3_PROFILE + '#/$defs/StaffRolePageInput', query);
    await this.authorization.requireStaff(context, 'staff.role.manage');
    const fence = new AuthorizationFence(this.authorization),
      snapshot = await fence.capture(context, null);
    const rows = await this.store.list('StaffRole', {
      cursor: query.cursor,
      limit: query.pageSize,
    });
    const items: ModelData[] = [];
    for (const value of rows) {
      const role = await this.authorization.lookup('StaffRole', String(value.staffRoleId));
      requireCondition(role, 503, 'CURRENT_ROLE_REQUIRED', '현재 직원 역할이 필요합니다.');
      const state = await this.authorization.currentRoleState(
        'StaffRole',
        String(role.staffRoleId),
      );
      requireCondition(
        !state || (state.staffRoleRef as Ref).revision === role.revision,
        503,
        'ROLE_STATE_REVISION',
        '직원 역할과 현재 행위 개정을 대조해야 합니다.',
      );
      items.push({
        roleRef: ref('StaffRole', role),
        label: role.label,
        actions: state?.actions ?? role.actions,
        active: state?.active !== false,
      });
    }
    await this.authorization.requireStaff(context, 'staff.role.manage');
    await fence.assert(context, snapshot);
    return this.store.schema.validateUri(U3_PROFILE + '#/$defs/StaffRolePage', {
      items,
      nextCursor: rows.length === query.pageSize ? String(rows.at(-1)!.staffRoleId) : null,
      observedAt: this.now().toISOString(),
    });
  }
}
