import { requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import type { EnterpriseAccess } from './enterprise-access.js';
import { currentCustomerScopes } from './current-customer-scopes.js';
import { ref } from './references.js';
import { AuthorizationFence } from './authorization-fence.js';
import type { AuthorizationSnapshot } from './authorization-fence.js';
export class CustomerContexts {
  constructor(
    private readonly access: EnterpriseAccess,
    private readonly now: () => Date,
  ) {}
  async list(
    context: ServiceContext,
    query: {
      cursor: string | null;
      pageSize: number;
      enterpriseRef: Ref | null;
      departmentCursor: string | null;
      siteCursor: string | null;
      scopeCursor: string | null;
    },
  ): Promise<unknown> {
    const { store, authorization } = this.access;
    if (query.enterpriseRef)
      requireCondition(
        query.enterpriseRef.owner === 'EnterpriseAccess' &&
          query.enterpriseRef.entity === 'Enterprise',
        400,
        'CONTEXT_ENTERPRISE_REF',
        '정확한 기업 참조가 필요합니다.',
      );
    await authorization.identity(context);
    requireCondition(
      context.audience === 'CUSTOMER',
      403,
      'CUSTOMER_REQUIRED',
      '현재 고객의 소속 문맥 조회입니다.',
    );
    const members = await store.list('EnterpriseMembership', {
      equals: {
        accountRef: { id: context.principalId },
        active: true,
        ...(query.enterpriseRef ? { enterpriseRef: { id: query.enterpriseRef.id } } : {}),
      },
      cursor: query.cursor,
      limit: query.pageSize,
    });
    const items = [];
    const fence = new AuthorizationFence(authorization),
      snapshots: AuthorizationSnapshot[] = [];
    for (const value of members) {
      const member = await authorization.lookup('EnterpriseMembership', String(value.membershipId));
      requireCondition(member?.active, 403, 'MEMBERSHIP_CHANGED', '현재 소속 확인이 필요합니다.');
      const enterprise = await authorization.lookup('Enterprise', (member.enterpriseRef as Ref).id);
      if (!enterprise?.usageEnabled || enterprise.approvalState !== 'APPROVED') continue;
      const snapshot = await fence.capture(
        context,
        String(enterprise.enterpriseId),
        undefined,
        'u1:2',
      );
      const scopes = await currentCustomerScopes(
        this.access,
        context,
        member,
        enterprise,
        this.now,
      );
      // Individual action scopes remain separate; no Cartesian product or implicit trade grant.
      const allowed = scopes
        .map((value) => value.data)
        .filter((action) =>
          [
            'organisation.manage',
            'user.manage',
            'role.manage',
            'product.read',
            'order.submit',
            'order.read',
          ].includes(action.action),
        );
      if (!allowed.length) continue;
      const management = allowed.some(
        (action) =>
          ['organisation.manage', 'user.manage', 'role.manage'].includes(action.action) &&
          action.kind === 'ENTERPRISE_ALL',
      );
      const sectionCursors: {
        departments: string | null;
        sites: string | null;
        scopes: string | null;
      } = { departments: null, sites: null, scopes: null };
      const organisation = async (name: 'Department' | 'BusinessSite') => {
        const field = name === 'Department' ? 'departmentRefs' : 'siteRefs';
        const all =
          management ||
          allowed.some((action) =>
            name === 'Department'
              ? ['ENTERPRISE_ALL', 'SITE_ALL_DEPARTMENTS'].includes(action.kind)
              : ['ENTERPRISE_ALL', 'DEPARTMENT_ALL_SITES'].includes(action.kind),
          );
        const selected = new Set(
          allowed.flatMap((action) => action[field]).map((value) => value.id),
        );
        const result = [];
        if (!all && !selected.size) return [];
        const cursor = name === 'Department' ? query.departmentCursor : query.siteCursor;
        const ids = [...selected]
          .filter((id) => cursor === null || id > cursor)
          .sort()
          .slice(0, 100);
        const rows = await store.list(name, {
          equals: { enterpriseRef: { id: enterprise.enterpriseId }, active: true },
          ...(!all ? { ids } : {}),
          cursor,
          limit: query.pageSize,
        });
        sectionCursors[name === 'Department' ? 'departments' : 'sites'] =
          rows.length === query.pageSize
            ? String(rows.at(-1)![name === 'Department' ? 'departmentId' : 'siteId'])
            : null;
        for (const row of rows) {
          if (!all && !selected.has(String(row[name === 'Department' ? 'departmentId' : 'siteId'])))
            continue;
          const current = await authorization.lookup(
            name,
            String(row[name === 'Department' ? 'departmentId' : 'siteId']),
          );
          requireCondition(
            current?.active,
            503,
            'CONTEXT_ORGANISATION_CHANGED',
            '현재 활성 조직을 대조해야 합니다.',
          );
          result.push({ recordRef: ref(name, current), label: current.label, active: true });
        }
        return result;
      };
      const application = await store.read(
        'EnterpriseApplication',
        (enterprise.applicationRef as Ref).id,
      );
      requireCondition(
        application,
        503,
        'CONTEXT_NAME_UNCONFIRMED',
        '소속 기업 이름의 원본을 대조해야 합니다.',
      );
      const scoped = scopes
        .filter((value) => query.scopeCursor === null || value.id > query.scopeCursor)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, query.pageSize);
      sectionCursors.scopes = scoped.length === query.pageSize ? scoped.at(-1)!.id : null;
      items.push({
        knowledge: 'KNOWN',
        data: {
          enterpriseRef: ref('Enterprise', enterprise),
          legalName: application.legalName,
          orderingContextPolicy: enterprise.orderingContextPolicy,
          departments: await organisation('Department'),
          sites: await organisation('BusinessSite'),
          actionScopes: scoped.map((value) => value.data),
          availableActions: [...new Set(allowed.map((value) => value.action))],
          sectionCursors,
          managementAvailable: management,
          scopeProjectionKnowledge: 'KNOWN',
        },
        sourceRefs: [ref('Enterprise', enterprise)],
        observedAt: this.now().toISOString(),
      });
      await fence.assert(context, snapshot);
      snapshots.push(snapshot);
    }
    await authorization.identity(context);
    for (const snapshot of snapshots) await fence.assert(context, snapshot);
    return store.schema.validateUri('urn:oms:contract:foundation:1#/$defs/CustomerContextPage', {
      items,
      nextCursor: members.length === query.pageSize ? String(members.at(-1)!.membershipId) : null,
      observedAt: this.now().toISOString(),
    });
  }
}
