import { randomUUID } from 'node:crypto';
import {
  canonicalJson,
  declareU4Operations,
  ExecutionBudget,
  fingerprint,
  OperationRegistry,
  requireCondition,
  U4_PROFILE,
  U4_REGISTRY_VERSION,
} from '@oms/contracts';
import type { CommandMeta, InvocationTarget, Receipt, Ref, ServiceContext } from '@oms/contracts';
import { U2_STAFF_FENCE_ID, U4Repository, U4_SOURCE_CONTRACT } from '@oms/persistence';
import type { ProtectedStore, U4Transaction } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { AuthorizationFence } from './authorization-fence.js';
import { ref, u4Ref } from './references.js';
import { STAFF_ACTIONS } from './scopes.js';

export interface U4StaffRoleInput {
  meta: CommandMeta;
  label: string;
  actions: string[];
}
type RoleChange = { target: Ref; before: Ref | null };

// 역할 원본은 EnterpriseAccess만 쓴다. 금융 등록 명령에는 역할 쓰기 권위를 주지 않는다.
export class U4StaffAccess {
  private readonly repository: U4Repository;
  private readonly registry: OperationRegistry;
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
  ) {
    this.repository = new U4Repository(store);
    this.registry = new OperationRegistry(store.schema);
    declareU4Operations(this.registry);
  }
  private async authorize(context: ServiceContext, proof: unknown, scope?: U4Transaction) {
    requireCondition(
      context.audience === 'STAFF',
      403,
      'STAFF_ONLY',
      '현재 직원 요청만 허용합니다.',
    );
    requireCondition(
      await this.staffIngress(proof),
      403,
      'STAFF_NETWORK_REQUIRED',
      '등록된 직원망 경로가 필요합니다.',
    );
    const authorization = new Authorization(this.store, this.now, scope?.readSource());
    await authorization.requireStaff(context, 'staff.role.manage', scope?.transaction);
    return authorization;
  }
  private async run(
    context: ServiceContext,
    name: string,
    target: InvocationTarget,
    input: { meta: CommandMeta },
    proof: unknown,
    change: (scope: U4Transaction) => Promise<RoleChange>,
  ): Promise<Receipt> {
    const operation = this.registry.lookup('EnterpriseAccess', name, U4_REGISTRY_VERSION);
    this.store.schema.validate('ServiceContext', context);
    this.store.schema.validateUri(operation.input, input);
    this.store.schema.validate('InvocationTarget', target);
    requireCondition(
      operation.targetKind === target.kind,
      400,
      'STAFF_ROLE_TARGET',
      '등록된 역할 대상이 필요합니다.',
    );
    if (operation.targetSchema) this.store.schema.validateSchema(operation.targetSchema, target);
    if (target.kind === 'RECORD')
      requireCondition(
        input.meta.expectedRevision === target.recordRef.revision,
        409,
        'ROLE_REVISION',
        '정확한 역할 개정이 필요합니다.',
      );
    const remaining = Math.min(
      10000,
      Date.parse(context.deadlineAt) - this.now().getTime(),
      ExecutionBudget.current()?.remaining() ?? 10000,
    );
    requireCondition(
      Number.isFinite(remaining) && remaining > 0,
      503,
      'EXECUTION_DEADLINE',
      '현재 요청 기한이 필요합니다.',
    );
    return new ExecutionBudget(
      Math.floor(remaining),
      () => this.now().getTime(),
      ExecutionBudget.current()?.signal,
    ).run(async () => {
      const authorization = await this.authorize(context, proof);
      const snapshot = await new AuthorizationFence(authorization).capture(context, null);
      let changed = false;
      const commit = await this.repository.mutate(
        {
          principalId: context.principalId,
          audience: context.audience,
          owner: 'EnterpriseAccess',
          operation: name,
          target,
          idempotencyKey: input.meta.clientRequestId,
          input,
          correlationId: context.correlationId,
          epoch: snapshot.epoch,
          sourceContract: U4_SOURCE_CONTRACT,
        },
        async (scope) => {
          const current = await this.authorize(context, proof, scope);
          if (!changed) {
            await new AuthorizationFence(current).assert(context, snapshot, scope.transaction);
            return;
          }
          // 같은 소유자가 기록한 역할/fence after-image만 허용한다. 독립 보호 I/O는 하지 않는다.
          for (const source of snapshot.sources) {
            const written = scope.transaction
              .rows()
              .find((row) => row.model === source.entity && row.id === source.id);
            const data = await current.lookup(source.entity, source.id, scope.transaction);
            requireCondition(
              data &&
                (written
                  ? ['StaffRole', 'RoleRevisionState', 'StaffAuthorityFence'].includes(
                      source.entity,
                    ) &&
                    !written.deleted &&
                    written.revision === source.revision + 1 &&
                    canonicalJson(data) === canonicalJson(written.data)
                  : canonicalJson(ref(source.entity, data)) === canonicalJson(source)),
              409,
              'AUTHORIZATION_FENCE_CHANGED',
              '원래 현재 권위 또는 등록된 자체 변경이 필요합니다.',
            );
          }
        },
        async (scope, requestId) => {
          if (target.kind === 'RECORD') await scope.current(target.recordRef);
          const result = await change(scope);
          const roleRow = scope.transaction
            .rows()
            .find((row) => row.model === 'StaffRole' && row.id === result.target.id);
          requireCondition(
            roleRow && roleRow.revision === result.target.revision,
            503,
            'U4_RESULT_NOT_WRITTEN',
            '실제 기록한 역할 개정이 필요합니다.',
          );
          const authority = await scope
            .readSource()
            .currentProtected('StaffAuthorityFence', U2_STAFF_FENCE_ID);
          requireCondition(
            authority,
            503,
            'STAFF_FENCE_REQUIRED',
            '현재 직원 권위 fence가 필요합니다.',
          );
          await scope.transaction.put(
            'StaffAuthorityFence',
            {
              ...authority,
              authorityRevision: Number(authority.authorityRevision) + 1,
              revision: Number(authority.revision) + 1,
            },
            Number(authority.revision),
          );
          const at = this.now().toISOString();
          const history = {
            historyId: randomUUID(),
            owner: 'EnterpriseAccess',
            actorAccountRef: context.actorAccountRef,
            verifiedPersonRef: context.verifiedPersonRef,
            occurredAt: at,
            reason: input.meta.reason,
            beforeRef: result.before,
            afterRef: result.target,
            evidenceRefs: input.meta.evidenceRefs,
            requestId,
            resultRefs: [result.target],
            correctionOf: null,
            sourceRevision: result.target.revision,
          };
          await scope.transaction.put('AccessHistory', history);
          await scope.transaction.put('RequestReceipt', {
            requestId,
            principalId: context.principalId,
            audience: context.audience,
            operation: name,
            targetIdentity: target,
            requestFingerprint: fingerprint(input),
            idempotencyKey: input.meta.clientRequestId,
            owner: 'EnterpriseAccess',
            targetScope: null,
            requestState: 'RESULT_RECORDED',
            resultRefs: [
              result.target,
              { ...ref('AccessHistory', history), revision: history.sourceRevision },
            ],
            acceptedAt: at,
            updatedAt: at,
            revision: 1,
            correlationId: context.correlationId,
            sourceContract: U4_SOURCE_CONTRACT,
          });
          changed = true;
        },
      );
      await this.authorize(context, proof);
      const record = await this.store.currentProtected('RequestReceipt', commit.requestId);
      requireCondition(
        record && canonicalJson(record.sourceContract) === canonicalJson(U4_SOURCE_CONTRACT),
        503,
        'RECEIPT_NOT_PROTECTED',
        '원래 접수 보호가 필요합니다.',
      );
      const references = record.resultRefs as Ref[];
      return this.store.schema.validateUri<Receipt>(U4_PROFILE + '#/$defs/Receipt', {
        requestId: record.requestId,
        requestState: record.requestState,
        owner: record.owner,
        targetRef: references.find((reference) => reference.entity === 'StaffRole') ?? null,
        resultRefs: references,
        acceptedAt: record.acceptedAt,
        updatedAt: record.updatedAt,
        statusRevision: record.revision,
        retryAfterMilliseconds: null,
      });
    });
  }
  defineRole(context: ServiceContext, input: U4StaffRoleInput, proof: unknown): Promise<Receipt> {
    return this.run(context, 'defineStaffRole', { kind: 'NONE' }, input, proof, async (scope) => {
      requireCondition(
        input.meta.expectedRevision === null,
        400,
        'CREATE_REVISION',
        '새 역할은 예상 개정이 없어야 합니다.',
      );
      const role = {
        modelVersion: 3,
        staffRoleId: randomUUID(),
        label: input.label,
        actions: input.actions.filter((action) => STAFF_ACTIONS.includes(action)),
        revision: 1,
        sourceContract: U4_SOURCE_CONTRACT,
      };
      await scope.transaction.put('StaffRole', role);
      const reference = u4Ref('StaffRole', role, this.store.schema);
      await scope.transaction.put('RoleRevisionState', {
        modelVersion: 3,
        roleStateId: randomUUID(),
        roleRef: null,
        staffRoleRef: reference,
        active: true,
        scopeRefs: [],
        actions: input.actions,
        revision: 1,
        sourceContract: U4_SOURCE_CONTRACT,
      });
      return { target: reference, before: null };
    });
  }
  reviseRole(
    context: ServiceContext,
    input: U4StaffRoleInput & { roleRef: Ref },
    proof: unknown,
  ): Promise<Receipt> {
    return this.change(context, input, proof, false);
  }
  deactivateRole(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref },
    proof: unknown,
  ): Promise<Receipt> {
    return this.change(context, input, proof, true);
  }
  private change(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref; label?: string; actions?: string[] },
    proof: unknown,
    deactivate: boolean,
  ) {
    return this.run(
      context,
      deactivate ? 'deactivateStaffRole' : 'reviseStaffRole',
      { kind: 'RECORD', recordRef: input.roleRef },
      input,
      proof,
      async (scope) => {
        const role = await scope.current(input.roleRef);
        const authorization = new Authorization(this.store, this.now, scope.readSource());
        const state = await authorization.currentRoleState(
          'StaffRole',
          input.roleRef.id,
          scope.transaction,
        );
        requireCondition(
          role.modelVersion === 3 && state?.modelVersion === 3,
          409,
          'ROLE_REVISION',
          '명시 새 직원 역할만 변경합니다. 구형 자동 전환은 제공하지 않습니다.',
        );
        const actions = input.actions ?? (state.actions as string[]);
        const next = {
          ...role,
          label: input.label ?? role.label,
          actions: actions.filter((action) => STAFF_ACTIONS.includes(action)),
          revision: Number(role.revision) + 1,
        };
        await scope.transaction.put('StaffRole', next, Number(role.revision));
        const reference = u4Ref('StaffRole', next, this.store.schema);
        await scope.transaction.put(
          'RoleRevisionState',
          {
            ...state,
            staffRoleRef: reference,
            actions,
            active: deactivate ? false : state.active,
            revision: Number(state.revision) + 1,
          },
          Number(state.revision),
        );
        return { target: reference, before: input.roleRef };
      },
    );
  }
  async readRoles(
    context: ServiceContext,
    query: { cursor: string | null; pageSize: number },
    proof: unknown,
  ): Promise<unknown> {
    this.store.schema.validateUri(U4_PROFILE + '#/$defs/StaffRolePageInput', query);
    const authorization = await this.authorize(context, proof);
    const fence = new AuthorizationFence(authorization),
      snapshot = await fence.capture(context, null);
    const rows = await this.store.list('StaffRole', {
      equals: { modelVersion: 3 },
      cursor: query.cursor,
      limit: query.pageSize,
    });
    const items = [];
    for (const value of rows) {
      const role = await authorization.lookup('StaffRole', String(value.staffRoleId));
      requireCondition(
        role?.modelVersion === 3,
        503,
        'CURRENT_ROLE_REQUIRED',
        '현재 새 직원 역할이 필요합니다.',
      );
      const state = await authorization.currentRoleState('StaffRole', String(role.staffRoleId));
      requireCondition(
        state?.modelVersion === 3 && (state.staffRoleRef as Ref).revision === role.revision,
        503,
        'ROLE_STATE_REVISION',
        '현재 역할과 행위 원본 개정이 일치해야 합니다.',
      );
      items.push({
        roleRef: u4Ref('StaffRole', role, this.store.schema),
        label: role.label,
        actions: state.actions,
        active: state.active,
      });
    }
    await this.authorize(context, proof);
    await fence.assert(context, snapshot);
    return this.store.schema.validateUri(U4_PROFILE + '#/$defs/StaffRolePage', {
      items,
      nextCursor: rows.length === query.pageSize ? String(rows.at(-1)!.staffRoleId) : null,
      observedAt: this.now().toISOString(),
    });
  }
}
