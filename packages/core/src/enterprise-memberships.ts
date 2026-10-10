import { randomUUID } from 'node:crypto';
import { requireCondition, fingerprint, canonicalJson } from '@oms/contracts';
import type {
  CommandMeta,
  Ref,
  Receipt,
  ServiceContext,
  TargetScope,
  ScopeV2,
} from '@oms/contracts';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import { u2EnterpriseFenceId } from '@oms/persistence';
import type { EnterpriseAccess } from './enterprise-access.js';
import type { ChangeResult } from './commands.js';
import type { OrderingPolicy } from './scopes.js';
import { ref } from './references.js';
import { decodeLegacyScope } from './scope-compatibility.js';
import { requireManagedChange, scopeV2Includes } from './scope-v2.js';

export type ManagementAccess = Pick<
  EnterpriseAccess,
  'store' | 'authorization' | 'managementTarget'
>;
export type AccessCommandHost = Pick<EnterpriseAccess, 'store' | 'authorization'>;
export async function currentManagementScopes(
  access: ManagementAccess,
  context: ServiceContext,
  enterprise: ModelData,
  transaction?: ProtectedTransaction,
): Promise<ScopeV2[]> {
  const member = await access.authorization.relation(
    context,
    String(enterprise.enterpriseId),
    transaction,
  );
  return (await currentMembershipManagement(access, member, transaction)).scopes;
}
export async function currentMembershipManagement(
  access: ManagementAccess,
  member: ModelData,
  transaction?: ProtectedTransaction,
): Promise<{ scopes: ScopeV2[]; sources: Ref[] }> {
  const a = access.authorization,
    store = access.store,
    scopes: ScopeV2[] = [],
    sources: Ref[] = [ref('EnterpriseMembership', member)];
  let scanned = 0;
  requireCondition(member.active, 403, 'INVITER_INACTIVE', '현재 활성 관리 소속이 필요합니다.');
  const account = await a.lookup('Account', (member.accountRef as Ref).id, transaction);
  requireCondition(account?.active, 403, 'INVITER_INACTIVE', '현재 관리 계정이 필요합니다.');
  sources.push(ref('Account', account));
  const bindings = await store.list('ProviderBinding', {
    equals: {
      accountRef: { id: (member.accountRef as Ref).id },
      audience: 'CUSTOMER',
      active: true,
    },
    limit: 2,
  });
  requireCondition(
    bindings.length === 1,
    403,
    'INVITER_BINDING',
    '현재 관리 계정의 고객 연결이 필요합니다.',
  );
  const binding = await a.lookup('ProviderBinding', String(bindings[0]!.bindingId), transaction);
  requireCondition(
    binding?.active,
    403,
    'INVITER_BINDING',
    '현재 관리 계정의 고객 연결이 필요합니다.',
  );
  sources.push(ref('ProviderBinding', binding));
  const security = await store.list('AccountSecurityState', {
    equals: { accountRef: { id: (member.accountRef as Ref).id } },
    limit: 2,
  });
  requireCondition(
    security.length <= 1,
    503,
    'CURRENT_SECURITY_REQUIRED',
    '현재 관리 계정의 보안 세대를 대조하세요.',
  );
  if (security[0]) {
    const state = await a.lookup(
      'AccountSecurityState',
      String(security[0].securityStateId),
      transaction,
    );
    requireCondition(
      state,
      503,
      'CURRENT_SECURITY_REQUIRED',
      '현재 관리 계정의 보안 세대가 필요합니다.',
    );
    sources.push(ref('AccountSecurityState', state));
  }
  for await (const item of store.scan(
    'CustomerRoleGrant',
    { membershipRef: { id: member.membershipId }, revokedAt: null },
    new Date(Date.now() + 5000).toISOString(),
  )) {
    requireCondition(
      ++scanned <= 2000,
      503,
      'AUTHORITY_SCAN_LIMIT',
      '유한 현재 권위 조회가 필요합니다.',
    );
    const grant = await a.lookup('CustomerRoleGrant', String(item.grantId), transaction);
    if (!grant || grant.revokedAt !== null || Date.parse(String(grant.effectiveFrom)) > Date.now())
      continue;
    sources.push(ref('CustomerRoleGrant', grant));
    const role = await a.lookup('CustomerRole', (grant.roleRef as Ref).id, transaction);
    requireCondition(
      role && (role.enterpriseRef as Ref).id === (member.enterpriseRef as Ref).id,
      403,
      'ROLE_ENTERPRISE',
      '현재 기업 역할이 필요합니다.',
    );
    sources.push(ref('CustomerRole', role));
    const state = await a.currentRoleState('CustomerRole', String(role.roleId), transaction);
    if (state) {
      requireCondition(
        (state.roleRef as Ref).revision === role.revision,
        503,
        'ROLE_STATE_REVISION',
        '현재 역할 개정이 다릅니다.',
      );
      sources.push(ref('RoleRevisionState', state));
      if (!state.active) continue;
      for (const source of state.scopeRefs as Ref[]) {
        const row = await a.lookup('ScopeV2', source.id, transaction);
        requireCondition(
          row && row.revision === source.revision,
          503,
          'SCOPE_REVISION',
          '현재 술어가 필요합니다.',
        );
        sources.push(ref('ScopeV2', row));
        scopes.push(row.predicate as ScopeV2);
      }
      continue;
    }
    for (const source of role.actionScopeRefs as Ref[]) {
      const row = await a.lookup('ActionScope', source.id, transaction);
      requireCondition(row, 503, 'CURRENT_SCOPE_REQUIRED', '현재 범위가 필요합니다.');
      sources.push(ref('ActionScope', row));
      const origin = await store.readRevision(
        'Enterprise',
        (row.enterpriseRef as Ref).id,
        (row.enterpriseRef as Ref).revision,
      );
      requireCondition(origin, 503, 'LEGACY_SCOPE_POLICY', '원래 조직 정책 개정이 필요합니다.');
      scopes.push(
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
  }
  return {
    scopes,
    sources: [
      ...new Map(sources.map((source) => [source.entity + ':' + source.id, source])).values(),
    ].sort((left, right) => (left.entity + left.id).localeCompare(right.entity + right.id)),
  };
}
export async function bumpEnterpriseAccessFence(
  access: ManagementAccess,
  transaction: ProtectedTransaction,
  enterprise: ModelData,
): Promise<void> {
  const id = u2EnterpriseFenceId(String(enterprise.enterpriseId)),
    fence = await transaction.get('EnterpriseAccessFence', id);
  requireCondition(fence, 503, 'ACCESS_FENCE_REQUIRED', '현재 기업 접근 fence가 필요합니다.');
  await transaction.put(
    'EnterpriseAccessFence',
    {
      ...fence,
      accessRevision: Number(fence.accessRevision) + 1,
      revision: Number(fence.revision) + 1,
    },
    Number(fence.revision),
  );
}
export async function readOwnAccessReplay(
  access: AccessCommandHost,
  context: ServiceContext,
  operation: string,
  target: unknown,
  input: { meta: CommandMeta },
  identityGuard: () => Promise<void> = async () => {
    await access.authorization.identity(context);
  },
  owner: 'EnterpriseAccess' | 'IdentityRecovery' = 'EnterpriseAccess',
): Promise<Receipt | null> {
  access.store.schema.validateUri(
    'urn:oms:contract:u2-access-additions:1#/$defs/CommandMeta',
    input.meta,
  );
  await identityGuard();
  const originals = await access.store.list('RequestReceipt', {
    equals: {
      principalId: context.principalId,
      audience: context.audience,
      owner,
      operation,
      idempotencyKey: input.meta.clientRequestId,
      targetIdentity: target,
    },
    limit: 2,
  });
  const original = originals.find(
    (receipt) => canonicalJson(receipt.targetIdentity) === canonicalJson(target),
  );
  if (original) {
    requireCondition(
      original.requestFingerprint === fingerprint(input),
      409,
      'IDEMPOTENCY_CONFLICT',
      '원래 요청 내용이 다릅니다.',
    );
    return ownAccessReceipt(access, context, original, identityGuard);
  }
  return null;
}
export async function runU2AccessCommand(
  access: AccessCommandHost,
  context: ServiceContext,
  operation: string,
  target: unknown,
  input: { meta: CommandMeta },
  authorize: (transaction?: ProtectedTransaction) => Promise<void>,
  apply: (transaction: ProtectedTransaction, requestId: string) => Promise<ChangeResult>,
  now: () => Date,
  identityGuard: (transaction?: ProtectedTransaction) => Promise<void> = async (tx) => {
    await access.authorization.identity(context, tx);
  },
  owner: 'EnterpriseAccess' | 'IdentityRecovery' = 'EnterpriseAccess',
): Promise<Receipt> {
  const replay = await readOwnAccessReplay(
    access,
    context,
    operation,
    target,
    input,
    identityGuard,
    owner,
  );
  if (replay) return replay;
  await authorize();
  const committed = await access.store.execute(
    {
      principalId: context.principalId,
      audience: context.audience,
      owner,
      operation,
      target,
      idempotencyKey: input.meta.clientRequestId,
      input,
      correlationId: context.correlationId,
      epoch: await access.store.currentEpoch(),
    },
    async (tx, requestId) => {
      await authorize(tx);
      const result = await apply(tx, requestId),
        at = now().toISOString();
      const historyModel = owner === 'IdentityRecovery' ? 'IdentityHistory' : 'AccessHistory';
      const history = {
        historyId: randomUUID(),
        owner,
        actorAccountRef: context.actorAccountRef,
        verifiedPersonRef: context.verifiedPersonRef,
        occurredAt: at,
        reason: input.meta.reason,
        beforeRef: result.before ?? null,
        afterRef: result.target,
        evidenceRefs: input.meta.evidenceRefs,
        requestId,
        resultRefs: result.refs,
        correctionOf: null,
        sourceRevision: result.target?.revision ?? 1,
      };
      await tx.put(historyModel, history);
      await tx.put('RequestReceipt', {
        requestId,
        principalId: context.principalId,
        audience: context.audience,
        operation,
        targetIdentity: target,
        requestFingerprint: fingerprint(input),
        idempotencyKey: input.meta.clientRequestId,
        owner,
        targetScope: result.scope,
        requestState: result.state,
        resultRefs: [...result.refs, ref(historyModel, history)],
        acceptedAt: at,
        updatedAt: at,
        revision: 1,
        correlationId: context.correlationId,
      });
    },
  );
  // Own minimal result status survives an intentional self-revocation. It
  // contains no directory, evidence body, role actions or decrypted secret.
  await identityGuard();
  const receipt = await access.store.read('RequestReceipt', committed.requestId);
  requireCondition(
    receipt && receipt.principalId === context.principalId && receipt.audience === context.audience,
    403,
    'OWN_RESULT_REQUIRED',
    '현재 본인의 원래 결과만 확인합니다.',
  );
  return ownAccessReceipt(access, context, receipt, identityGuard);
}
async function ownAccessReceipt(
  access: AccessCommandHost,
  context: ServiceContext,
  receipt: ModelData,
  identityGuard: () => Promise<void>,
): Promise<Receipt> {
  await identityGuard();
  requireCondition(
    receipt.principalId === context.principalId && receipt.audience === context.audience,
    403,
    'OWN_RESULT_REQUIRED',
    '현재 본인의 원래 결과만 확인합니다.',
  );
  const refs = receipt.resultRefs as Ref[];
  return access.store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Receipt', {
    requestId: receipt.requestId,
    requestState: receipt.requestState,
    owner: receipt.owner,
    targetRef: refs.find((source) => !source.entity.endsWith('History')) ?? null,
    resultRefs: refs,
    acceptedAt: receipt.acceptedAt,
    updatedAt: receipt.updatedAt,
    statusRevision: receipt.revision,
    retryAfterMilliseconds: null,
  });
}
export async function validateMembershipOrganisation(
  access: EnterpriseAccess,
  enterprise: ModelData,
  departmentRef: Ref | null,
  siteRef: Ref | null,
  active: boolean,
  transaction?: ProtectedTransaction,
): Promise<void> {
  const policy = enterprise.orderingContextPolicy as OrderingPolicy;
  for (const [model, selected, usage] of [
    ['Department', departmentRef, policy.departmentUsage],
    ['BusinessSite', siteRef, policy.siteUsage],
  ] as const) {
    if (active)
      requireCondition(
        usage !== 'UNSET' && (usage === 'USED' ? selected !== null : selected === null),
        400,
        'MEMBERSHIP_POLICY',
        '현재 명시 조직 사용 정책과 일치해야 합니다.',
      );
    if (selected) {
      const row = await access.authorization.lookup(model, selected.id, transaction);
      requireCondition(
        row &&
          selected.owner === 'EnterpriseAccess' &&
          selected.entity === model &&
          (row.enterpriseRef as Ref).id === enterprise.enterpriseId &&
          row.revision === selected.revision &&
          (!active || row.active),
        400,
        'MEMBERSHIP_ORGANISATION',
        '같은 기업의 현재 사용 가능한 조직이 필요합니다.',
      );
    }
  }
}
export class EnterpriseMemberships {
  constructor(
    private readonly access: EnterpriseAccess,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async update(
    context: ServiceContext,
    input: {
      meta: CommandMeta;
      membershipRef: Ref;
      departmentRef: Ref | null;
      siteRef: Ref | null;
      active: boolean;
      administrator: boolean;
    },
  ): Promise<Receipt> {
    const { store, authorization: a } = this.access;
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/MembershipInput',
      input,
    );
    let original: ModelData, enterprise: ModelData, target: TargetScope;
    const authorize = async (tx?: ProtectedTransaction) => {
      await a.identity(context);
      requireCondition(
        context.audience === 'CUSTOMER',
        403,
        'CUSTOMER_REQUIRED',
        '현재 고객 관리 행위입니다.',
      );
      const member = await a.lookup('EnterpriseMembership', input.membershipRef.id, tx);
      requireCondition(
        member &&
          member.revision === input.membershipRef.revision &&
          member.revision === input.meta.expectedRevision,
        404,
        'NOT_FOUND',
        '대상을 확인할 수 없습니다.',
      );
      const own = await a.relation(context, (member.enterpriseRef as Ref).id, tx);
      requireCondition(own.active, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      const current = await a.lookup('Enterprise', (member.enterpriseRef as Ref).id, tx);
      requireCondition(current, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      const scopes = await currentManagementScopes(this.access, context, current, tx);
      const oldPolicy = (
        await store.readRevision(
          'Enterprise',
          (member.enterpriseRef as Ref).id,
          (member.enterpriseRef as Ref).revision,
        )
      )?.orderingContextPolicy as OrderingPolicy | undefined;
      requireCondition(
        oldPolicy,
        503,
        'MEMBERSHIP_ORIGINAL_POLICY',
        '원래 소속 조직 정책이 필요합니다.',
      );
      const before = {
          ...this.access.managementTarget(current),
          departmentRef: member.departmentRef as Ref | null,
          siteRef: member.siteRef as Ref | null,
        },
        after = { ...before, departmentRef: input.departmentRef, siteRef: input.siteRef };
      requireCondition(
        scopes.some((scope) =>
          scopeV2Includes(scope, 'user.manage', before, oldPolicy, 'MANAGEMENT'),
        ),
        403,
        'MANAGEMENT_TARGET',
        '변경 전 현재 관리 범위가 필요합니다.',
      );
      requireManagedChange(
        scopes,
        'user.manage',
        null,
        after,
        current.orderingContextPolicy as OrderingPolicy,
      );
      await validateMembershipOrganisation(
        this.access,
        current,
        input.departmentRef,
        input.siteRef,
        input.active,
        tx,
      );
      if (input.active && (!member.active || (input.administrator && !member.administrator))) {
        const links = await store.list('VerifiedPersonLink', {
          equals: { accountRefs: [{ id: (member.accountRef as Ref).id }] },
          limit: 2,
        });
        requireCondition(
          links.length === 1 && input.meta.evidenceRefs.length > 0,
          409,
          'MEMBERSHIP_CONFIRMATION_REQUIRED',
          '현재 신원·소속/위임 근거가 필요합니다.',
        );
        const verification = await this.access.verification.administrator(
          ref('Enterprise', current),
          member.accountRef as Ref,
          ref('VerifiedPersonLink', links[0]!),
          input.meta.evidenceRefs,
        );
        requireCondition(
          verification.knowledge === 'KNOWN' &&
            verification.personConfirmed &&
            verification.enterpriseRelationshipConfirmed &&
            (!input.administrator || verification.mandateConfirmed),
          409,
          'MEMBERSHIP_CONFIRMATION_REQUIRED',
          '현재 확인된 소속/관리자 위임이 필요합니다.',
        );
      }
      original = member;
      enterprise = current;
      target = after;
    };
    return runU2AccessCommand(
      this.access,
      context,
      'updateMembership',
      { kind: 'RECORD', recordRef: input.membershipRef },
      input,
      authorize,
      async (tx) => {
        const updated = {
          ...original,
          departmentRef: input.departmentRef,
          siteRef: input.siteRef,
          active: input.active,
          administrator: input.administrator,
          enterpriseRef: ref('Enterprise', enterprise),
          revision: Number(original.revision) + 1,
        };
        const count =
          Number(enterprise.administratorCount) -
          (original.active && original.administrator ? 1 : 0) +
          (input.active && input.administrator ? 1 : 0);
        requireCondition(
          count >= 0,
          503,
          'ADMINISTRATOR_COUNT',
          '현재 관리자 원본 대조가 필요합니다.',
        );
        await tx.put('EnterpriseMembership', updated, Number(original.revision));
        const nextEnterprise = {
          ...enterprise,
          administratorCount: count,
          revision: Number(enterprise.revision) + 1,
        };
        await tx.put('Enterprise', nextEnterprise, Number(enterprise.revision));
        await bumpEnterpriseAccessFence(this.access, tx, nextEnterprise);
        return {
          target: ref('EnterpriseMembership', updated),
          refs: [ref('EnterpriseMembership', updated), ref('Enterprise', nextEnterprise)],
          scope: target,
          state: 'RESULT_RECORDED',
          before: ref('EnterpriseMembership', original),
        };
      },
      this.now,
    );
  }
}
