import { OmsError, requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import { EnterpriseAccess } from './enterprise-access.js';
import { currentCustomerScopes } from './current-customer-scopes.js';
import { ref } from './references.js';
import type { OrderingPolicy } from './scopes.js';
import { canonicalJson, fingerprint } from '@oms/contracts';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { AuthorizationFence } from './authorization-fence.js';
import { currentManagementScopes } from './enterprise-memberships.js';
import { currentRolePredicates } from './enterprise-role-revisions.js';
import { scopeV2WithinManagement } from './scope-v2.js';
export class EnterpriseQuery {
  constructor(
    readonly access: EnterpriseAccess,
    private readonly now: () => Date,
  ) {}
  async applications(
    context: ServiceContext,
    query: { status: string | null; cursor: string | null; pageSize?: number },
    self = false,
  ): Promise<unknown> {
    const { store, authorization } = this.access;
    store.schema.validateUri('urn:oms:contract:foundation:1#/$defs/ApplicationFilter', query);
    if (self) {
      await authorization.identity(context);
      requireCondition(
        context.audience === 'CUSTOMER',
        403,
        'CUSTOMER_REQUIRED',
        '고객 신청 조회입니다.',
      );
    } else await authorization.requireStaff(context, 'application.read');
    const limit = query.pageSize ?? 25;
    const applications = await store.list('EnterpriseApplication', {
      equals: {
        ...(query.status ? { state: query.status } : {}),
        ...(self ? { applicantAccountRef: { id: context.principalId } } : {}),
      },
      cursor: query.cursor,
      limit,
    });
    const items = [];
    for (const application of applications)
      items.push(await this.access.readApplication(context, String(application.applicationId)));
    return store.schema.validateUri('urn:oms:contract:foundation:1#/$defs/ApplicationPage', {
      items,
      nextCursor: applications.length === limit ? String(applications.at(-1)!.applicationId) : null,
      observedAt: this.now().toISOString(),
    });
  }
  async enterprise(
    context: ServiceContext,
    enterpriseRef: Ref,
    query: { cursor: string | null; pageSize: number },
  ): Promise<unknown> {
    const { store, authorization } = this.access;
    await authorization.identity(context);
    if (context.audience === 'STAFF') await authorization.requireStaff(context, 'application.read');
    if (context.audience === 'CUSTOMER') await authorization.relation(context, enterpriseRef.id);
    const enterprise = await store.currentProtected('Enterprise', enterpriseRef.id);
    requireCondition(enterprise, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    // This U1 management projection contains no order/finance/SW authority or customer contact directory.
    const page = async (model: string) =>
      store.list(model, {
        equals: { enterpriseRef: { id: enterpriseRef.id } },
        cursor: query.cursor,
        limit: query.pageSize,
      });
    const application = await store.read(
      'EnterpriseApplication',
      (enterprise.applicationRef as Ref).id,
    );
    requireCondition(
      application,
      503,
      'ENTERPRISE_NAME_UNCONFIRMED',
      '기업명 원본을 확인해야 합니다.',
    );
    const managementPermission = async (action: string): Promise<boolean> => {
      if (context.audience !== 'CUSTOMER') return false;
      try {
        await authorization.requireCustomer(
          context,
          action,
          this.access.managementTarget(enterprise),
          enterprise.orderingContextPolicy as OrderingPolicy,
        );
        return true;
      } catch (error) {
        if (error instanceof OmsError && error.code === 'ACTION_DENIED') return false;
        throw error;
      }
    };
    const organisationAllowed = await managementPermission('organisation.manage');
    const roleAllowed = await managementPermission('role.manage');
    const userAllowed = await managementPermission('user.manage');
    requireCondition(
      context.audience === 'STAFF' || organisationAllowed || roleAllowed || userAllowed,
      403,
      'ACTION_DENIED',
      '현재 명시적 관리 행위 권한이 필요합니다.',
    );
    const departments = await page('Department');
    const sites = await page('BusinessSite');
    const roles = roleAllowed ? await page('CustomerRole') : [];
    const members = userAllowed ? await page('EnterpriseMembership') : [];
    const ownMember =
      context.audience === 'CUSTOMER'
        ? await authorization.relation(context, enterpriseRef.id)
        : null;
    const scopeGrants = ownMember
      ? (await currentCustomerScopes(this.access, context, ownMember, enterprise, this.now))
          .filter(
            (scope) =>
              scope.data.kind === 'ENTERPRISE_ALL' &&
              ((scope.data.action === 'organisation.manage' && organisationAllowed) ||
                (scope.data.action === 'role.manage' && roleAllowed) ||
                (scope.data.action === 'user.manage' && userAllowed)),
          )
          .filter(
            (scope, index, all) =>
              all.findIndex((value) => value.data.action === scope.data.action) === index,
          )
          .map((scope) => scope.data)
      : [];
    const customerRoles = [];
    for (const role of roles) {
      const scopes = [];
      for (const scopeRef of role.actionScopeRefs as Ref[]) {
        const scope = await store.currentProtected('ActionScope', scopeRef.id);
        requireCondition(scope, 503, 'SCOPE_UNCONFIRMED', '원래 행위 범위를 확인해야 합니다.');
        scopes.push({
          action: scope.action,
          kind: scope.kind,
          enterpriseRef: scope.enterpriseRef,
          departmentRefs: scope.departmentRefs,
          siteRefs: scope.siteRefs,
        });
      }
      customerRoles.push({
        roleRef: ref('CustomerRole', role),
        label: role.label,
        actionScopes: scopes,
      });
    }
    const memberships = [];
    for (const member of members) {
      const account = await store.currentProtected('Account', (member.accountRef as Ref).id);
      requireCondition(
        account,
        503,
        'MEMBER_ACCOUNT_UNCONFIRMED',
        '소속 계정 원본을 확인해야 합니다.',
      );
      const grants = await store.list('CustomerRoleGrant', {
        equals: { membershipRef: { id: member.membershipId }, revokedAt: null },
        limit: 100,
      });
      memberships.push({
        membershipRef: ref('EnterpriseMembership', member),
        accountRef: ref('Account', account),
        displayName: account.displayName,
        departmentRef: member.departmentRef,
        siteRef: member.siteRef,
        active: member.active,
        administrator: member.administrator,
        grantRefs: grants.map((grant) => ref('CustomerRoleGrant', grant)),
        invitationState: 'NONE',
        grantNextCursor: grants.length === 100 ? String(grants.at(-1)!.grantId) : null,
      });
    }
    const organisation = (model: string, records: Record<string, unknown>[]) =>
      records.map((record) => ({
        recordRef: ref(model, record),
        label: record.label,
        active: record.active,
      }));
    const last = (records: Record<string, unknown>[], key: string) =>
      records.length === query.pageSize ? String(records.at(-1)![key]) : null;
    return store.schema.validate('EnterpriseViewResult', {
      knowledge: 'KNOWN',
      data: {
        enterpriseRef: ref('Enterprise', enterprise),
        legalName: application.legalName,
        approvalState: enterprise.approvalState,
        organisationRefs: [
          ...departments.map((record) => ref('Department', record)),
          ...sites.map((record) => ref('BusinessSite', record)),
        ],
        membershipRefs: members.map((member) => ref('EnterpriseMembership', member)),
        roleRefs: roles.map((role) => ref('CustomerRole', role)),
        administratorCount: enterprise.administratorCount,
        scopeGrants,
        scopeProjectionKnowledge: context.audience === 'CUSTOMER' ? 'KNOWN' : 'UNAVAILABLE',
        customerRoles,
        memberships,
        departments: organisation('Department', departments),
        sites: organisation('BusinessSite', sites),
        orderingContextPolicy: enterprise.orderingContextPolicy,
        sectionCursors: {
          departments: last(departments, 'departmentId'),
          sites: last(sites, 'siteId'),
          roles: last(roles, 'roleId'),
          memberships: last(members, 'membershipId'),
        },
      },
      sourceRefs: [ref('Enterprise', enterprise)],
      observedAt: this.now().toISOString(),
    });
  }
}
export class U2AccessDirectory {
  private readonly key: Buffer;
  constructor(
    private readonly access: EnterpriseAccess,
    key: Buffer,
    private readonly now: () => Date,
  ) {
    requireCondition(
      key.length >= 32,
      503,
      'DIRECTORY_CURSOR_KEY',
      '별도 목적의 서버 cursor 키가 필요합니다.',
    );
    this.key = createHmac('sha256', key).update('oms-u2-directory-cursor:1\0').digest();
  }
  private seal(last: string, binding: unknown): string {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(canonicalJson(binding)));
    const bytes = Buffer.from(canonicalJson({ last, expiresAt: this.now().getTime() + 300000 })),
      encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return [iv, encrypted, cipher.getAuthTag()].map((part) => part.toString('base64url')).join('.');
  }
  private open(value: string, binding: unknown): string {
    try {
      requireCondition(value.length <= 4096, 400, 'DIRECTORY_CURSOR', '현재 cursor를 확인하세요.');
      const encoded = value.split('.');
      requireCondition(
        encoded.length === 3 &&
          encoded.every(
            (part) =>
              /^[A-Za-z0-9_-]+$/.test(part) &&
              Buffer.from(part, 'base64url').toString('base64url') === part,
          ),
        400,
        'DIRECTORY_CURSOR',
        '현재 cursor를 확인하세요.',
      );
      const [iv, encrypted, tag] = encoded.map((part) => Buffer.from(part, 'base64url'));
      requireCondition(
        iv!.length === 12 && tag!.length === 16,
        400,
        'DIRECTORY_CURSOR',
        '현재 cursor를 확인하세요.',
      );
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv!, { authTagLength: 16 });
      decipher.setAAD(Buffer.from(canonicalJson(binding)));
      decipher.setAuthTag(tag!);
      const row = JSON.parse(
        Buffer.concat([decipher.update(encrypted!), decipher.final()]).toString(),
      ) as { last: string; expiresAt: number };
      requireCondition(
        Object.keys(row).sort().join(',') === 'expiresAt,last' &&
          typeof row.last === 'string' &&
          row.last.length <= 128 &&
          Number.isFinite(row.expiresAt) &&
          this.now().getTime() < row.expiresAt,
        400,
        'DIRECTORY_CURSOR',
        '원래 cursor가 만료됐습니다.',
      );
      return row.last;
    } catch {
      throw new OmsError(
        400,
        'DIRECTORY_CURSOR',
        '현재 권한/조건의 원래 cursor를 다시 확인하세요.',
      );
    }
  }
  async staff(
    context: ServiceContext,
    query: { cursor: string | null; pageSize: number; filter: string },
  ): Promise<unknown> {
    const { store, authorization } = this.access;
    store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/PageInput', query);
    requireCondition(
      ['ALL', 'ACTIVE', 'INACTIVE'].includes(query.filter),
      400,
      'DIRECTORY_FILTER',
      '직원 역할 상태를 확인하세요.',
    );
    await authorization.requireStaff(context, 'staff.role.manage');
    const fence = new AuthorizationFence(authorization),
      snapshot = await fence.capture(context, null),
      binding = {
        principal: context.principalId,
        audience: context.audience,
        kind: 'staff-roles',
        filter: query.filter,
        pageSize: query.pageSize,
        authority: fingerprint(snapshot),
      },
      cursor = query.cursor ? this.open(query.cursor, binding) : null;
    const items: unknown[] = [];
    let last = cursor,
      scanned = 0,
      more = false;
    while (items.length < query.pageSize && scanned < 2000) {
      const rows = await store.list('StaffRole', {
        cursor: last,
        limit: Math.min(100, query.pageSize),
      });
      if (!rows.length) break;
      for (const candidate of rows) {
        scanned++;
        const role = await authorization.lookup('StaffRole', String(candidate.staffRoleId));
        requireCondition(role, 503, 'CURRENT_ROLE_REQUIRED', '현재 직원 역할 원본이 필요합니다.');
        last = String(role.staffRoleId);
        const state = await authorization.currentRoleState('StaffRole', last),
          active = state?.active !== false;
        requireCondition(
          !state || (state.staffRoleRef as Ref).revision === role.revision,
          503,
          'ROLE_STATE_REVISION',
          '현재 역할 개정을 확인하세요.',
        );
        if (query.filter !== 'ALL' && active !== (query.filter === 'ACTIVE')) continue;
        items.push({
          roleRef: ref('StaffRole', role),
          label: role.label,
          actions: state?.actions ?? role.actions,
          active,
        });
        if (items.length === query.pageSize) {
          more = true;
          break;
        }
      }
      if (items.length === query.pageSize || rows.length < Math.min(100, query.pageSize)) break;
    }
    requireCondition(
      scanned < 2000 || items.length === query.pageSize,
      503,
      'DIRECTORY_SCAN_LIMIT',
      '직원 역할 조회 상한에서 다시 확인하세요.',
    );
    await authorization.requireStaff(context, 'staff.role.manage');
    await fence.assert(context, snapshot);
    return store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/StaffRolePage', {
      items,
      nextCursor: more && last ? this.seal(last, binding) : null,
      observedAt: this.now().toISOString(),
    });
  }
  async read(
    context: ServiceContext,
    enterpriseRef: Ref,
    query: { cursor: string | null; pageSize: number; filter: string },
    kind: 'memberships' | 'roles',
  ): Promise<unknown> {
    const { store, authorization } = this.access;
    store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/PageInput', query);
    requireCondition(
      enterpriseRef.owner === 'EnterpriseAccess' && enterpriseRef.entity === 'Enterprise',
      400,
      'DIRECTORY_TARGET',
      '현재 기업 대상이 필요합니다.',
    );
    const enterprise = await authorization.lookup('Enterprise', enterpriseRef.id);
    requireCondition(
      enterprise && enterprise.usageEnabled && enterprise.approvalState === 'APPROVED',
      404,
      'NOT_FOUND',
      '대상을 확인할 수 없습니다.',
    );
    const scopes = await currentManagementScopes(this.access, context, enterprise),
      action = kind === 'memberships' ? 'user.manage' : 'role.manage',
      selected = scopes.filter((scope) => scope.action === action);
    requireCondition(
      selected.length > 0,
      403,
      'ACTION_DENIED',
      '현재 명시 관리 행위가 필요합니다.',
    );
    const fence = new AuthorizationFence(authorization),
      snapshot = await fence.capture(context, enterpriseRef.id),
      binding = {
        principal: context.principalId,
        audience: context.audience,
        enterprise: enterpriseRef.id,
        kind,
        filter: query.filter,
        pageSize: query.pageSize,
        authority: fingerprint(snapshot),
      },
      cursor = query.cursor ? this.open(query.cursor, binding) : null;
    const invitations = kind === 'memberships' && ['PENDING', 'HOLD'].includes(query.filter),
      model = invitations
        ? 'MembershipInvitation'
        : kind === 'memberships'
          ? 'EnterpriseMembership'
          : 'CustomerRole',
      id = invitations ? 'invitationId' : kind === 'memberships' ? 'membershipId' : 'roleId';
    requireCondition(
      kind !== 'roles' || ['ALL', 'ACTIVE', 'INACTIVE'].includes(query.filter),
      400,
      'DIRECTORY_FILTER',
      '현재 역할 상태 조건을 확인하세요.',
    );
    const clauses = (kind === 'memberships' ? selected : []).flatMap((scope) => {
      const policy = enterprise.orderingContextPolicy as OrderingPolicy;
      if (policy.departmentUsage === 'UNSET' || policy.siteUsage === 'UNSET')
        return scope.kind === 'ENTERPRISE_ALL' ? [{}] : [];
      const clause: Record<string, unknown> = {};
      for (const [field, selector, usage] of [
        ['departmentRef', scope.departmentSelector, policy.departmentUsage],
        ['siteRef', scope.siteSelector, policy.siteUsage],
      ] as const) {
        if (selector.kind === 'EXACT') {
          if (usage !== 'USED') return [];
          clause[field] = { id: selector.ref.id };
        } else if (selector.kind === 'NOT_USED') {
          if (usage !== 'NOT_USED') return [];
          clause[field] = null;
        }
      }
      return [clause];
    });
    requireCondition(
      kind !== 'memberships' || clauses.length > 0,
      403,
      'ACTION_DENIED',
      '현재 조직 술어 범위가 필요합니다.',
    );
    const items: unknown[] = [],
      limit = Math.min(100, Math.max(query.pageSize, 25));
    let scanCursor = cursor,
      scanned = 0,
      last: string | null = null,
      more = false;
    while (items.length < query.pageSize && scanned < 2000) {
      const policy = enterprise.orderingContextPolicy as OrderingPolicy;
      const rows = await store.list(model, {
        equals: {
          enterpriseRef: { id: enterpriseRef.id },
          ...(invitations
            ? { state: query.filter === 'PENDING' ? 'PENDING' : 'RECONFIRMATION_REQUIRED' }
            : kind === 'memberships' && query.filter !== 'ALL'
              ? { active: query.filter === 'ACTIVE' }
              : {}),
        },
        ...(kind === 'memberships'
          ? { u2ScopeClauses: clauses }
          : {
              u2RoleManagement: {
                scopes: selected,
                departmentUsage: policy.departmentUsage,
                siteUsage: policy.siteUsage,
                active: query.filter === 'ALL' ? null : query.filter === 'ACTIVE',
              },
            }),
        cursor: scanCursor,
        limit,
      });
      if (!rows.length) break;
      for (const candidate of rows) {
        requireCondition(
          ++scanned <= 2000,
          503,
          'DIRECTORY_SCAN_LIMIT',
          '유한 관리 조회를 확인하세요.',
        );
        const row = (await authorization.lookup(model, String(candidate[id])))!;
        last = String(row[id]);
        if (kind === 'roles') {
          const state = await authorization.currentRoleState('CustomerRole', String(row.roleId)),
            active = state?.active !== false;
          if (query.filter !== 'ALL' && active !== (query.filter === 'ACTIVE')) continue;
          const predicates = await currentRolePredicates(this.access, row);
          requireCondition(
            predicates.length <= 200,
            503,
            'ROLE_PREDICATE_LIMIT',
            '유한 역할 술어를 확인하세요.',
          );
          if (
            !predicates.every((predicate) => scopeV2WithinManagement(predicate, selected, action))
          )
            continue;
        }
        const state = invitations
          ? String(row.state)
          : kind === 'roles'
            ? (await authorization.currentRoleState('CustomerRole', String(row.roleId)))?.active ===
              false
              ? 'INACTIVE'
              : 'ACTIVE'
            : row.active
              ? 'ACTIVE'
              : 'INACTIVE';
        items.push({
          sourceRef: ref(model, row),
          state,
          knowledge: 'KNOWN',
          remainingAction:
            kind === 'roles'
              ? String(row.label)
              : invitations
                ? '원래 초대의 현재 처리 상태를 확인하세요.'
                : '선택한 원래 소속의 변경 전후 범위를 확인하세요.',
          expiresAt: invitations ? row.expiresAt : null,
          actualEffect: invitations ? 'UNCONFIRMED' : 'CONFIRMED',
          noticeDelivery: invitations ? 'REQUESTED' : 'UNKNOWN',
        });
        if (items.length === query.pageSize) {
          more = true;
          break;
        }
      }
      if (items.length === query.pageSize || rows.length < limit) break;
      scanCursor = String(rows.at(-1)![id]);
    }
    requireCondition(
      scanned < 2000 || items.length === query.pageSize,
      503,
      'DIRECTORY_SCAN_LIMIT',
      '권한 필터 조회 상한에서 후속 대조가 필요합니다.',
    );
    await fence.assert(context, snapshot);
    return store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/PageView', {
      items,
      nextCursor: more && last ? this.seal(last, binding) : null,
      observedAt: this.now().toISOString(),
    });
  }
}
