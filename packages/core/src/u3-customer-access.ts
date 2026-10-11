import { randomUUID } from 'node:crypto';
import {
  canonicalJson,
  declareU3Operations,
  OperationRegistry,
  requireCondition,
  U3_PROFILE,
} from '@oms/contracts';
import type { CommandMeta, Ref, Receipt, ServiceContext, ScopeV2 } from '@oms/contracts';
import { U3_SOURCE_CONTRACT } from '@oms/persistence';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import type { EnterpriseAccess } from './enterprise-access.js';
import { Commands } from './commands.js';
import { AuthorizationFence } from './authorization-fence.js';
import { currentManagementScopes, bumpEnterpriseAccessFence } from './enterprise-memberships.js';
import { ref } from './references.js';
import { currentConsentScope, validateConsentScope } from './u3-consent-scope.js';
import { scopeV2WithinManagement } from './scope-v2.js';

export interface U3CustomerRoleInput {
  meta: CommandMeta;
  enterpriseRef: Ref;
  label: string;
  predicates: ScopeV2[];
}
export class U3CustomerAccess {
  private readonly registry: OperationRegistry;
  private readonly commands: Commands;
  constructor(
    readonly access: EnterpriseAccess,
    private readonly now: () => Date,
  ) {
    this.registry = new OperationRegistry(access.store.schema);
    declareU3Operations(this.registry);
    this.commands = new Commands(access.store, now);
  }
  private async managed(
    context: ServiceContext,
    enterpriseRef: Ref,
    predicates: ScopeV2[],
    tx?: ProtectedTransaction,
  ): Promise<ModelData> {
    const { authorization: a } = this.access;
    requireCondition(
      context.audience === 'CUSTOMER',
      403,
      'CUSTOMER_REQUIRED',
      '현재 고객의 명시 역할 관리 행위입니다.',
    );
    await a.relation(context, enterpriseRef.id, tx);
    const enterprise = await a.lookup('Enterprise', enterpriseRef.id, tx);
    requireCondition(
      enterprise?.usageEnabled &&
        enterprise.approvalState === 'APPROVED' &&
        enterprise.revision === enterpriseRef.revision,
      409,
      'U3_ROLE_ENTERPRISE',
      '현재 승인 기업의 정확한 개정이 필요합니다.',
    );
    const management = await currentManagementScopes(this.access, context, enterprise, tx);
    requireCondition(
      management.some((value) => value.action === 'role.manage'),
      403,
      'ACTION_DENIED',
      '동의 역할 생산에는 현재 역할 관리 권한이 필요합니다.',
    );
    for (const predicate of predicates) {
      validateConsentScope(predicate);
      requireCondition(
        canonicalJson(predicate.enterpriseRef) === canonicalJson(enterpriseRef) &&
          scopeV2WithinManagement(predicate, management, 'role.manage', validateConsentScope),
        403,
        'ROLE_MANAGEMENT_SCOPE',
        '동의 역할 전체는 현재 실제 관리 범위 안에 있어야 합니다.',
      );
      const policy = enterprise.orderingContextPolicy as {
        departmentUsage: string;
        siteUsage: string;
      };
      requireCondition(
        policy.departmentUsage !== 'UNSET' && policy.siteUsage !== 'UNSET',
        409,
        'U3_CONSENT_POLICY',
        '동의 범위는 확인된 조직 정책에서만 생성합니다.',
      );
      for (const [selector, usage] of [
        [predicate.departmentSelector, policy.departmentUsage],
        [predicate.siteSelector, policy.siteUsage],
      ] as const) {
        requireCondition(
          selector.kind !== 'NOT_USED' || usage === 'NOT_USED',
          409,
          'U3_CONSENT_POLICY',
          '조직 미사용 선택은 현재 미사용 정책에만 허용됩니다.',
        );
        if (selector.kind !== 'EXACT') continue;
        const organisation = await a.lookup(selector.ref.entity, selector.ref.id, tx);
        requireCondition(
          usage === 'USED' &&
            organisation?.active &&
            organisation.revision === selector.ref.revision &&
            (organisation.enterpriseRef as Ref).id === enterpriseRef.id,
          409,
          'U3_CONSENT_ORGANISATION',
          '현재 같은 기업의 정확한 활성 조직이 필요합니다.',
        );
      }
    }
    return enterprise;
  }
  private async state(role: ModelData, tx?: ProtectedTransaction): Promise<ModelData> {
    const state = await this.access.authorization.currentRoleState(
      'CustomerRole',
      String(role.roleId),
      tx,
    );
    requireCondition(
      role.modelVersion === 2 &&
        state?.modelVersion === 2 &&
        canonicalJson(role.sourceContract) === canonicalJson(U3_SOURCE_CONTRACT) &&
        canonicalJson(state.roleRef) === canonicalJson(ref('CustomerRole', role)),
      503,
      'U3_ROLE_STATE_REQUIRED',
      '구형 역할 자동 전환 없이 같은 명시 profile의 현재 역할 상태가 필요합니다.',
    );
    return state;
  }
  private async predicates(state: ModelData, tx?: ProtectedTransaction): Promise<ScopeV2[]> {
    const result: ScopeV2[] = [];
    for (const reference of state.scopeRefs as Ref[]) {
      const row = await this.access.authorization.lookup('ScopeV2', reference.id, tx);
      requireCondition(
        row && canonicalJson(ref('ScopeV2', row)) === canonicalJson(reference),
        503,
        'SCOPE_REVISION',
        '현재 동의 술어의 정확한 개정이 필요합니다.',
      );
      result.push(currentConsentScope(row, state));
    }
    return result;
  }
  private async putScopes(tx: ProtectedTransaction, predicates: ScopeV2[]): Promise<Ref[]> {
    const refs: Ref[] = [];
    for (const predicate of predicates) {
      const row = {
        modelVersion: 2,
        scopeId: randomUUID(),
        enterpriseRef: predicate.enterpriseRef,
        action: predicate.action,
        kind: predicate.kind,
        predicate,
        revision: 1,
        sourceContract: U3_SOURCE_CONTRACT,
      };
      await tx.put('ScopeV2', row);
      refs.push(ref('ScopeV2', row));
    }
    return refs;
  }
  private async assertSources(
    context: ServiceContext,
    tx: ProtectedTransaction,
    sources: Ref[],
  ): Promise<void> {
    await this.access.authorization.identity(context, tx);
    for (const source of sources) {
      const visible = await this.access.store.currentProtected(source.entity, source.id),
        written = tx.rows().find((row) => row.model === source.entity && row.id === source.id),
        current = await tx.get(source.entity, source.id);
      requireCondition(
        visible && canonicalJson(ref(source.entity, visible)) === canonicalJson(source),
        409,
        'AUTHORIZATION_FENCE_CHANGED',
        '역할 판단 중 원래 권위 개정이 변경됐습니다.',
      );
      requireCondition(
        current &&
          !written?.deleted &&
          canonicalJson(current) === canonicalJson(written?.data ?? visible),
        503,
        'CURRENT_AUTH_NOT_PROTECTED',
        '원래 권위 또는 이 명령의 정확한 변경을 보호 대조해야 합니다.',
      );
    }
  }
  async defineRole(context: ServiceContext, input: U3CustomerRoleInput): Promise<Receipt> {
    const operation = this.registry.lookup('EnterpriseAccess', 'defineCustomerRole', 3);
    this.access.store.schema.validateUri(operation.input, input);
    return this.commands.run(
      context,
      'EnterpriseAccess',
      operation.name,
      { kind: 'ENTERPRISE', enterpriseRef: input.enterpriseRef },
      input,
      'AccessHistory',
      async (tx) => {
        await this.managed(context, input.enterpriseRef, input.predicates, tx);
      },
      async (tx) => {
        requireCondition(
          input.meta.expectedRevision === null,
          400,
          'CREATE_REVISION',
          '새 동의 역할에 예상 개정을 지정할 수 없습니다.',
        );
        const snapshot = await new AuthorizationFence(this.access.authorization).capture(
            context,
            input.enterpriseRef.id,
            tx,
          ),
          enterprise = await this.managed(context, input.enterpriseRef, input.predicates, tx),
          role = {
            modelVersion: 2,
            roleId: randomUUID(),
            enterpriseRef: input.enterpriseRef,
            label: input.label,
            actionScopeRefs: [],
            revision: 1,
            sourceContract: U3_SOURCE_CONTRACT,
          },
          state = {
            modelVersion: 2,
            roleStateId: randomUUID(),
            roleRef: ref('CustomerRole', role),
            staffRoleRef: null,
            active: true,
            scopeRefs: await this.putScopes(tx, input.predicates),
            actions: [],
            revision: 1,
            sourceContract: U3_SOURCE_CONTRACT,
          };
        await tx.put('CustomerRole', role);
        await tx.put('RoleRevisionState', state);
        await bumpEnterpriseAccessFence(this.access, tx, enterprise);
        await this.assertSources(context, tx, snapshot.sources);
        return {
          target: ref('CustomerRole', role),
          refs: [ref('CustomerRole', role), ref('RoleRevisionState', state), ...state.scopeRefs],
          scope: this.access.managementTarget(enterprise),
          state: 'RESULT_RECORDED',
        };
      },
      U3_SOURCE_CONTRACT,
    );
  }
  reviseRole(
    context: ServiceContext,
    input: { meta: CommandMeta; roleRef: Ref; label: string; predicates: ScopeV2[] },
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
    input: { meta: CommandMeta; roleRef: Ref; label?: string; predicates?: ScopeV2[] },
    deactivate: boolean,
  ): Promise<Receipt> {
    const operation = this.registry.lookup(
      'EnterpriseAccess',
      deactivate ? 'deactivateCustomerRole' : 'reviseCustomerRole',
      3,
    );
    this.access.store.schema.validateUri(operation.input, input);
    const authorize = async (tx?: ProtectedTransaction) => {
      const role = await this.access.authorization.lookup('CustomerRole', input.roleRef.id, tx);
      requireCondition(role, 404, 'NOT_FOUND', '현재 대상 역할이 필요합니다.');
      const state = await this.state(role, tx);
      await this.managed(
        context,
        role.enterpriseRef as Ref,
        [...(await this.predicates(state, tx)), ...(input.predicates ?? [])],
        tx,
      );
    };
    return this.commands.run(
      context,
      'EnterpriseAccess',
      operation.name,
      { kind: 'RECORD', recordRef: input.roleRef },
      input,
      'AccessHistory',
      authorize,
      async (tx) => {
        const role = (await this.access.authorization.lookup(
            'CustomerRole',
            input.roleRef.id,
            tx,
          ))!,
          state = await this.state(role, tx);
        requireCondition(
          canonicalJson(ref('CustomerRole', role)) === canonicalJson(input.roleRef) &&
            role.revision === input.meta.expectedRevision,
          409,
          'ROLE_REVISION',
          '현재 동의 역할의 정확한 개정이 필요합니다.',
        );
        const snapshot = await new AuthorizationFence(this.access.authorization).capture(
            context,
            (role.enterpriseRef as Ref).id,
            tx,
          ),
          enterprise = await this.managed(
            context,
            role.enterpriseRef as Ref,
            await this.predicates(state, tx),
            tx,
          ),
          next = { ...role, label: input.label ?? role.label, revision: Number(role.revision) + 1 },
          scopes = deactivate
            ? (state.scopeRefs as Ref[])
            : await this.putScopes(tx, input.predicates!),
          nextState = {
            ...state,
            roleRef: ref('CustomerRole', next),
            active: deactivate ? false : state.active,
            scopeRefs: scopes,
            revision: Number(state.revision) + 1,
          };
        await tx.put('CustomerRole', next, Number(role.revision));
        await tx.put('RoleRevisionState', nextState, Number(state.revision));
        await bumpEnterpriseAccessFence(this.access, tx, enterprise);
        await this.assertSources(context, tx, snapshot.sources);
        return {
          target: ref('CustomerRole', next),
          refs: [
            ref('CustomerRole', next),
            ref('RoleRevisionState', nextState),
            ...(deactivate ? [] : scopes),
          ],
          before: input.roleRef,
          scope: this.access.managementTarget(enterprise),
          state: 'RESULT_RECORDED',
        };
      },
      U3_SOURCE_CONTRACT,
    );
  }
  async readRoles(
    context: ServiceContext,
    input: { enterpriseRef: Ref; cursor: string | null; pageSize: number },
  ): Promise<unknown> {
    const operation = this.registry.lookup('EnterpriseAccess', 'readCustomerRoles', 3);
    this.access.store.schema.validateUri(operation.input, input);
    await this.managed(context, input.enterpriseRef, []);
    const fence = new AuthorizationFence(this.access.authorization),
      snapshot = await fence.capture(context, input.enterpriseRef.id),
      rows = await this.access.store.list('CustomerRole', {
        equals: { enterpriseRef: { id: input.enterpriseRef.id }, modelVersion: 2 },
        cursor: input.cursor,
        limit: input.pageSize,
      }),
      items = [];
    for (const row of rows) {
      const role = (await this.access.authorization.lookup('CustomerRole', String(row.roleId)))!,
        state = await this.state(role),
        predicates = await this.predicates(state);
      await this.managed(context, input.enterpriseRef, predicates);
      items.push({
        roleRef: ref('CustomerRole', role),
        modelVersion: role.modelVersion,
        sourceContract: role.sourceContract,
        label: role.label,
        active: state.active,
        predicates,
      });
    }
    await this.managed(context, input.enterpriseRef, []);
    await fence.assert(context, snapshot);
    // 기존 전체 역할 목록을 대체하지 않는 명시 동의 역할 전용 조회다.
    return this.access.store.schema.validateUri(operation.output, {
      profile: U3_PROFILE,
      viewKind: 'CONSENT_ROLES',
      items,
      nextCursor: rows.length === input.pageSize ? String(rows.at(-1)!.roleId) : null,
      observedAt: this.now().toISOString(),
    });
  }
}
