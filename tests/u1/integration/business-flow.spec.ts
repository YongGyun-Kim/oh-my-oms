import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CustomerContexts,
  HistoryQuery,
  CatalogQuery,
  EnterpriseOrganisation,
  EnterpriseQuery,
  Assessments,
  EnterpriseAccess,
  ExternalPolicy,
  IdentityRecovery,
  NoticeWorker,
  NotificationDelivery,
  OrderAcceptance,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
  ref,
} from '@oms/core';
import type { AssessmentOwner } from '@oms/core';
import type {
  ServiceContext,
  CommandMeta,
  Ref,
  Receipt,
  ActionScope,
  OrderInput,
  Work,
} from '@oms/contracts';
import { ProtectedStore, restoreFromJournal } from '@oms/persistence';
import { initializeDatabases } from '../fixtures/migrate.js';
import { localSources } from '../fixtures/databases.js';
import { resetSyntheticDatabases } from '../fixtures/reset.js';
import {
  seedSyntheticAccount,
  SyntheticIdentityProvider,
  syntheticPassword,
  syntheticFactor,
} from '../fixtures/identity.js';
import { SyntheticEnterpriseVerification, syntheticBasis } from '../fixtures/enterprise.js';
import { SyntheticQueue } from '../fixtures/queue.js';
import { runWorkerCycle } from '@oms/integrations';
const sources = localSources();
let currentTime = Date.parse('2026-10-08T10:00:00Z');
const now = () => new Date(currentTime);
const currentTokens = new Map<string, string>();
const meta = (expectedRevision: number | null = null): CommandMeta => ({
  clientRequestId: randomUUID(),
  expectedRevision,
  reason: '합성 업무 확인',
  evidenceRefs: [syntheticBasis],
});
let store: ProtectedStore;
let identity: IdentityRecovery;
let access: EnterpriseAccess;
let staffAccess: StaffAccess;
let verification: SyntheticEnterpriseVerification;
let customer: ServiceContext;
let other: ServiceContext;
let staff: ServiceContext;
let approvalOnly: ServiceContext;
beforeAll(async () => {
  await initializeDatabases();
  for (const source of Object.values(sources)) await source.initialize();
});
async function authenticate(id: string, audience: 'CUSTOMER' | 'STAFF'): Promise<ServiceContext> {
  const ingress = audience === 'STAFF' ? 'synthetic-private-ingress' : null;
  const challenge = await identity.login(
    audience,
    id + '@example.invalid',
    syntheticPassword,
    'peer-' + id,
    ingress,
  );
  await identity.verifyFactor(challenge.challengeId!, syntheticFactor, 'peer-' + id, ingress);
  const issued = await identity.issueRecoveryCodes(challenge.challengeId!, ingress);
  const outcome = await identity.acknowledgeRecoveryCodes(
    challenge.challengeId!,
    issued.setId,
    true,
    ingress,
  );
  currentTokens.set(id, outcome.sessionToken!);
  return identity.authenticate(outcome.sessionToken!, audience, 'correlation-' + id, ingress);
}
beforeEach(async () => {
  currentTime = Date.parse('2026-10-08T10:00:00Z');
  currentTokens.clear();
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  identity = new IdentityRecovery(store, new SyntheticIdentityProvider(), {
    synthetic: true,
    verifierKey: randomBytes(32),
    now,
    staffIngress: async (value) => value === 'synthetic-private-ingress',
  });
  verification = new SyntheticEnterpriseVerification();
  access = new EnterpriseAccess(store, verification, now, true);
  staffAccess = new StaffAccess(store, now);
  for (const [id, audience] of [
    ['customer', 'CUSTOMER'],
    ['other', 'CUSTOMER'],
    ['staff', 'STAFF'],
    ['approval-only', 'STAFF'],
  ] as const)
    await seedSyntheticAccount(store, id, audience);
  // Q24's explicit private initial grant is only staff.role.manage; business roles use normal owner commands below.
  const account = await store.read('Account', 'staff');
  await store.execute(
    {
      principalId: 'synthetic-bootstrap',
      audience: 'SYSTEM',
      owner: 'EnterpriseAccess',
      operation: 'initial-minimum-staff-role',
      target: { kind: 'NONE' },
      idempotencyKey: 'initial-staff',
      input: { action: 'staff.role.manage' },
      correlationId: 'initial-staff',
      epoch: 'initial',
    },
    async (transaction, requestId) => {
      const role = {
        staffRoleId: 'initial-role-manager',
        label: '합성 최소 권한 준비',
        actions: ['staff.role.manage'],
        revision: 1,
      };
      const grant = {
        staffGrantId: 'initial-role-manager-grant',
        accountRef: ref('Account', account!),
        roleRef: ref('StaffRole', role),
        effectiveFrom: now().toISOString(),
        revokedAt: null,
        grantedBy: ref('Account', account!),
        revision: 1,
      };
      await transaction.put('StaffRole', role);
      await transaction.put('StaffRoleGrant', grant);
      await transaction.put('RequestReceipt', {
        requestId,
        principalId: 'synthetic-bootstrap',
        audience: 'SYSTEM',
        operation: 'initial-minimum-staff-role',
        targetIdentity: { kind: 'NONE' },
        requestFingerprint: 'synthetic-profile',
        idempotencyKey: 'initial-staff',
        owner: 'EnterpriseAccess',
        targetScope: null,
        requestState: 'RESULT_RECORDED',
        resultRefs: [ref('StaffRole', role), ref('StaffRoleGrant', grant)],
        acceptedAt: now().toISOString(),
        updatedAt: now().toISOString(),
        revision: 1,
        correlationId: 'initial-staff',
      });
      await transaction.put('AccessHistory', {
        historyId: 'initial-staff-profile-history',
        owner: 'EnterpriseAccess',
        actorAccountRef: null,
        verifiedPersonRef: null,
        occurredAt: now().toISOString(),
        reason: 'Q24 합성 비공개 최초 최소 준비',
        beforeRef: null,
        afterRef: ref('StaffRoleGrant', grant),
        evidenceRefs: [syntheticBasis],
        requestId,
        resultRefs: [ref('StaffRoleGrant', grant)],
        correctionOf: null,
        sourceRevision: 1,
      });
    },
  );
  customer = await authenticate('customer', 'CUSTOMER');
  other = await authenticate('other', 'CUSTOMER');
  staff = await authenticate('staff', 'STAFF');
  approvalOnly = await authenticate('approval-only', 'STAFF');
  const role = await staffAccess.defineRole(staff, {
    meta: meta(),
    label: '합성 기업 업무',
    actions: [
      'application.read',
      'enterprise.approve',
      'enterprise.initial-administrator.designate',
      'product.register',
      'product.read',
      'order.read',
      'order.review.read',
    ],
  });
  await staffAccess.grantRole(staff, {
    meta: meta(),
    accountRef: staff.actorAccountRef!,
    roleRef: role.targetRef!,
    decision: 'GRANT',
  });
  const only = await staffAccess.defineRole(staff, {
    meta: meta(),
    label: '승인만',
    actions: ['enterprise.approve'],
  });
  await staffAccess.grantRole(staff, {
    meta: meta(),
    accountRef: approvalOnly.actorAccountRef!,
    roleRef: only.targetRef!,
    decision: 'GRANT',
  });
});
afterAll(async () => {
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
});
describe('현재 원본의 worker 배치 회복', () => {
  it('만료된 앞 메시지는 보호 중단만 ACK하고 다음 유한 배치의 새로운 원래Work는 업무 효과를 보호 처리한다', async () => {
    const late = now;
    const setup = await trading();
    const queue = new SyntheticQueue(() => late().getTime());
    const originalWorker = new NoticeWorker(store, queue, now, true);
    await originalWorker.relayBatch();
    const expired = queue.messages[0]!;
    expect(expired).toBeDefined();
    currentTime += 6 * 60000;
    const freshCustomer = await identity.authenticate(
      currentTokens.get('customer')!,
      'CUSTOMER',
      '현재 배치 회복',
      null,
    );
    const receipt = await new OrderAcceptance(store, new Assessments(late), late).submit(
      freshCustomer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const worker = new NoticeWorker(store, queue, late, true);
    const failures: unknown[] = [];
    const result = await runWorkerCycle(worker, queue, new AbortController().signal, (error) =>
      failures.push(error),
    );
    expect(result.failed).toBe(0);
    expect(failures).toHaveLength(0);
    const expiredInput = expired.body as { workId: string; deadlineAt: string; targetRef: Ref };
    expect(await store.currentProtected('WorkItem', expiredInput.workId)).toMatchObject({
      state: 'REVIEW_REQUIRED',
      attempt: 0,
      deadlineAt: expiredInput.deadlineAt,
      targetRef: expiredInput.targetRef,
    });
    expect(
      await store.list('ConsumerProcessingMark', {
        equals: {
          consumer: 'u1-in-app-notice',
          deliveryId: expiredInput.workId,
          deliveryKind: 'WORK',
        },
      }),
    ).toHaveLength(0);
    expect(
      await store.list('RequestReceipt', {
        equals: {
          operation: 'reviewExpiredOriginalOutbox',
          resultRefs: [{ entity: 'WorkItem', id: expiredInput.workId }],
        },
      }),
    ).toHaveLength(1);
    expect(queue.acknowledgements).toContain(expired.id);
    const next = await runWorkerCycle(worker, queue, new AbortController().signal, (error) =>
      failures.push(error),
    );
    expect(
      next.succeeded,
      JSON.stringify(failures.map((error) => (error as { code?: string }).code)),
    ).toBeGreaterThan(0);
    const fresh = queue.messages.find(
      (message) => (message.body as { requestId: string }).requestId === receipt.requestId,
    )!;
    expect(fresh).toBeDefined();
    const incoming = fresh.body as { workId: string; requestId: string; correlationId: string };
    const original = (await store.read('WorkItem', incoming.workId))!;
    expect(original).toMatchObject({
      workId: incoming.workId,
      requestId: incoming.requestId,
      correlationId: incoming.correlationId,
      state: 'RESULT_RECORDED',
    });
    expect(queue.acknowledgements).toContain(fresh.id);
    const first = await worker.consume(fresh);
    expect(await worker.consume(fresh)).toEqual(first);
  });
});
async function apply(): Promise<Receipt> {
  return access.apply(customer, {
    meta: meta(),
    legalName: '합성기업A',
    designatedContact: 'contact@example.invalid',
    registrationEvidenceRefs: [syntheticBasis],
  });
}
async function approved() {
  const application = await apply();
  const decision = await access.approve(staff, {
    meta: meta(1),
    targetRef: application.targetRef!,
    decision: 'APPROVE',
    basisRefs: [syntheticBasis],
  });
  const enterprise = decision.resultRefs.find((value) => value.entity === 'Enterprise')!;
  return { application, decision, enterprise };
}
const managementScopes = (enterpriseRef: Ref): ActionScope[] =>
  ['organisation.manage', 'user.manage', 'role.manage'].map((action) => ({
    action,
    kind: 'ENTERPRISE_ALL',
    enterpriseRef,
    departmentRefs: [],
    siteRefs: [],
  }));
async function trading() {
  const result = await approved();
  await access.designate(staff, result.enterprise, {
    meta: meta(1),
    accountRef: customer.actorAccountRef!,
    basisRefs: [syntheticBasis],
    label: '기업관리',
    actionScopes: managementScopes(result.enterprise),
  });
  let enterprise = (await store.read('Enterprise', result.enterprise.id))!;
  await access.setOrderingPolicy(customer, ref('Enterprise', enterprise), {
    meta: meta(2),
    departmentUsage: 'NOT_USED',
    siteUsage: 'NOT_USED',
  });
  enterprise = (await store.read('Enterprise', result.enterprise.id))!;
  const role = await access.defineCustomerRole(customer, ref('Enterprise', enterprise), {
    meta: meta(),
    label: '명시 주문 역할',
    actionScopes: ['order.submit', 'order.read', 'product.read'].map((action) => ({
      action,
      kind: 'ENTERPRISE_ALL',
      enterpriseRef: ref('Enterprise', enterprise),
      departmentRefs: [],
      siteRefs: [],
    })),
  });
  await access.grantCustomerRole(customer, ref('Enterprise', enterprise), {
    meta: meta(),
    accountRef: customer.actorAccountRef!,
    roleRef: role.targetRef!,
    decision: 'GRANT',
  });
  const catalog = new ProductCatalog(store, now);
  const hw = await catalog.register(staff, {
    meta: meta(),
    productType: 'HARDWARE',
    softwareTermKind: null,
    label: '합성 HW',
    salesDescription: '외부 재고/배송 결과 미확인',
    commonPrice: { currency: 'KRW', value: '123.45' },
    salesConditionRefs: [],
  });
  const sw = await catalog.register(staff, {
    meta: meta(),
    productType: 'SOFTWARE',
    softwareTermKind: 'TERM',
    label: '합성 SW',
    salesDescription: '실제 라이선스 발급/기간 미확인',
    commonPrice: { currency: 'KRW', value: '500' },
    salesConditionRefs: [],
  });
  const input = (product: Receipt, type: OrderInput['productType'], count = 1): OrderInput => ({
    meta: meta(),
    productType: type,
    targetScope: access.managementTarget(enterprise),
    provisionChoice: 'FULL',
    partialConsentRef: null,
    lines: Array.from({ length: count }, () => ({
      productRef: product.targetRef!,
      commonOfferRevisionRef: product.resultRefs.find(
        (value) => value.entity === 'CommonOfferRevision',
      )!,
      agreementRevisionRef: null,
      quantity: 1,
      paymentMode: 'PREPAY',
      requestedActivationDate: type === 'SOFTWARE' ? '2026-12-01' : null,
    })),
  });
  return { enterprise, catalog, hw, sw, input };
}
describe('기업 주 책임 AC 실제 owner·PG 흐름', () => {
  const contextQuery = () => ({
    cursor: null,
    pageSize: 25,
    enterpriseRef: null,
    departmentCursor: null,
    siteCursor: null,
    scopeCursor: null,
  });
  it('다른확인된최초관리자는자기신청이없어도소속/현재관리문맥에진입한다', async () => {
    const setup = await approved();
    await access.designate(staff, setup.enterprise, {
      meta: meta(1),
      accountRef: other.actorAccountRef!,
      basisRefs: [syntheticBasis],
      label: '별도다른관리자',
      actionScopes: managementScopes(setup.enterprise),
    });
    expect(
      (
        (await new EnterpriseQuery(access, now).applications(
          other,
          { status: null, cursor: null, pageSize: 25 },
          true,
        )) as { items: unknown[] }
      ).items,
    ).toEqual([]);
    const result = (await new CustomerContexts(access, now).list(other, contextQuery())) as {
      items: {
        data: { legalName: string; availableActions: string[]; managementAvailable: boolean };
      }[];
    };
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.data).toMatchObject({
      legalName: '합성기업A',
      managementAvailable: true,
    });
    expect(result.items[0]!.data.availableActions).not.toContain('order.submit');
  });
  it('일반구매자는관리directory없이명시trade권한의기업/문맥만조회한다', async () => {
    const setup = await trading();
    await new EnterpriseOrganisation(access, now).membership(
      customer,
      ref('Enterprise', setup.enterprise),
      {
        meta: meta(),
        accountRef: other.actorAccountRef!,
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      },
    );
    const current = ref(
      'Enterprise',
      (await store.read('Enterprise', String(setup.enterprise.enterpriseId)))!,
    );
    const role = (await store.list('CustomerRole', { equals: { label: '명시 주문 역할' } }))[0]!;
    await access.grantCustomerRole(customer, current, {
      meta: meta(),
      accountRef: other.actorAccountRef!,
      roleRef: ref('CustomerRole', role),
      decision: 'GRANT',
    });
    const result = (await new CustomerContexts(access, now).list(other, contextQuery())) as {
      items: { data: Record<string, unknown> }[];
    };
    expect(result.items[0]!.data).toMatchObject({
      managementAvailable: false,
      availableActions: ['order.submit', 'order.read', 'product.read'],
    });
    expect(result.items[0]!.data).not.toHaveProperty('memberships');
    expect(result.items[0]!.data).not.toHaveProperty('customerRoles');
    await expect(
      new EnterpriseQuery(access, now).enterprise(other, current, { cursor: null, pageSize: 25 }),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
  for (const action of ['role.manage', 'user.manage'])
    it(
      action + '만명시된관리자는그facet만조회하며추가organisation권한을강요하지않는다',
      async () => {
        const setup = await approved();
        await access.designate(staff, setup.enterprise, {
          meta: meta(1),
          accountRef: other.actorAccountRef!,
          basisRefs: [syntheticBasis],
          label: '분리관리행위',
          actionScopes: managementScopes(setup.enterprise).filter(
            (scope) => scope.action === action,
          ),
        });
        const current = ref('Enterprise', (await store.read('Enterprise', setup.enterprise.id))!);
        const result = (await new EnterpriseQuery(access, now).enterprise(other, current, {
          cursor: null,
          pageSize: 25,
        })) as {
          data: { customerRoles: unknown[]; memberships: unknown[]; scopeGrants: ActionScope[] };
        };
        expect(result.data.scopeGrants.map((scope) => scope.action)).toEqual([action]);
        expect(result.data.customerRoles.length).toBe(action === 'role.manage' ? 1 : 0);
        expect(result.data.memberships.length).toBe(action === 'user.manage' ? 1 : 0);
      },
    );
  it('타기업/없는기업과멤버없는주체는문맥존재/건수를구분해서누설하지않는다', async () => {
    const setup = await trading();
    for (const id of [String(setup.enterprise.enterpriseId), 'not-existing'])
      expect(
        (
          (await new CustomerContexts(access, now).list(other, {
            ...contextQuery(),
            enterpriseRef: { owner: 'EnterpriseAccess', entity: 'Enterprise', id, revision: 1 },
          })) as { items: unknown[] }
        ).items,
      ).toEqual([]);
  });
  it('소속만있고trade관리grant없으면문맥선택이권한을만들지않는다', async () => {
    const setup = await trading();
    await new EnterpriseOrganisation(access, now).membership(
      customer,
      ref('Enterprise', setup.enterprise),
      {
        meta: meta(),
        accountRef: other.actorAccountRef!,
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      },
    );
    expect(
      (
        (await new CustomerContexts(access, now).list(other, contextQuery())) as {
          items: unknown[];
        }
      ).items,
    ).toEqual([]);
  });
  it('현재미보호grant회수는옛문맥을그대로KNOWN으로다시노출하지않는다', async () => {
    await trading();
    const grant = (
      await store.list('CustomerRoleGrant', {
        equals: {
          roleRef: {
            id: (await store.list('CustomerRole', { equals: { label: '명시 주문 역할' } }))[0]!
              .roleId,
          },
        },
      })
    )[0]!;
    const failed = new ProtectedStore(sources.primaryApp, sources.journalAppend, async (phase) => {
      if (phase === 'PRIMARY_COMMITTED') throw new Error('합성원장미확인');
    });
    await expect(
      failed.execute(
        {
          principalId: 'synthetic-current',
          audience: 'SYSTEM',
          owner: 'EnterpriseAccess',
          operation: 'revoke-context',
          target: null,
          idempotencyKey: randomUUID(),
          input: {},
          correlationId: 'original',
          epoch: 'initial',
        },
        (transaction) =>
          transaction.put(
            'CustomerRoleGrant',
            { ...grant, revokedAt: now().toISOString(), revision: Number(grant.revision) + 1 },
            Number(grant.revision),
          ),
      ),
    ).rejects.toThrow();
    await expect(
      new CustomerContexts(access, now).list(customer, contextQuery()),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
  it('canonical필터/owner·ID목록한도/unknown입력은같은검증기로거절한다', async () => {
    const query = contextQuery();
    expect(() =>
      store.schema.validateUri('urn:oms:contract:foundation:1#/$defs/CustomerContextFilter', {
        ...query,
        extra: true,
      }),
    ).toThrow();
    expect(() =>
      store.schema.validateUri('urn:oms:contract:foundation:1#/$defs/CustomerContextFilter', {
        ...query,
        enterpriseRef: { owner: 'ProductCatalog', entity: 'Product', id: 'id', revision: 1 },
      }),
    ).toThrow();
    await expect(
      store.list('Account', { ids: Array.from({ length: 101 }, () => 'id') }),
    ).rejects.toThrow();
  });

  it('명시적확인된소속부여는원본/기업개정을기록하고거래grant를자동부여하지않는다', async () => {
    const setup = await trading();
    const organisation = new EnterpriseOrganisation(access, now);
    const receipt = await organisation.membership(customer, ref('Enterprise', setup.enterprise), {
      meta: meta(),
      accountRef: other.actorAccountRef!,
      departmentRef: null,
      siteRef: null,
      active: true,
      administrator: false,
    });
    expect(await store.read('EnterpriseMembership', receipt.targetRef!.id)).toMatchObject({
      active: true,
      administrator: false,
      designationBasis: { knowledge: 'KNOWN' },
    });
    const enterprise = (await store.read('Enterprise', String(setup.enterprise.enterpriseId)))!;
    await expect(
      access.authorization.requireCustomer(
        other,
        'order.submit',
        access.managementTarget(enterprise),
        enterprise.orderingContextPolicy as never,
      ),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
  it('소속관계미확인은소속을만들지않고user.manage없는사람은확인owner를부르지못한다', async () => {
    const setup = await trading();
    const organisation = new EnterpriseOrganisation(access, now);
    verification.relationshipConfirmed = false;
    await expect(
      organisation.membership(customer, ref('Enterprise', setup.enterprise), {
        meta: meta(),
        accountRef: other.actorAccountRef!,
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      }),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_CONFIRMATION_REQUIRED' });
    await expect(
      organisation.membership(other, ref('Enterprise', setup.enterprise), {
        meta: meta(),
        accountRef: other.actorAccountRef!,
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await store.list('EnterpriseMembership', { equals: { accountRef: { id: 'other' } } }),
    ).toHaveLength(0);
  });
  it('소속회수는추가외부확인없이현재원본개정으로차단하고기존주문조직을바꾸지않는다', async () => {
    const setup = await trading();
    const organisation = new EnterpriseOrganisation(access, now);
    const added = await organisation.membership(customer, ref('Enterprise', setup.enterprise), {
      meta: meta(),
      accountRef: other.actorAccountRef!,
      departmentRef: null,
      siteRef: null,
      active: true,
      administrator: false,
    });
    const enterprise = (await store.read('Enterprise', String(setup.enterprise.enterpriseId)))!;
    verification.relationshipConfirmed = false;
    await organisation.membership(customer, ref('Enterprise', enterprise), {
      meta: meta(1),
      accountRef: other.actorAccountRef!,
      departmentRef: null,
      siteRef: null,
      active: false,
      administrator: false,
    });
    expect(await store.read('EnterpriseMembership', added.targetRef!.id)).toMatchObject({
      active: false,
      revision: 2,
    });
    expect(await store.readRevision('EnterpriseMembership', added.targetRef!.id, 1)).toMatchObject({
      active: true,
    });
  });

  it('주문권한없는현재구성원은외부판단owner를호출하지않는다', async () => {
    const setup = await trading();
    for (const grant of await store.list('CustomerRoleGrant')) {
      const role = await store.read('CustomerRole', (grant.roleRef as Ref).id);
      if (role?.label !== '명시 주문 역할') continue;
      await access.grantCustomerRole(customer, ref('Enterprise', setup.enterprise), {
        meta: meta(Number(grant.revision)),
        accountRef: customer.actorAccountRef!,
        roleRef: ref('CustomerRole', role),
        decision: 'REVOKE',
      });
    }
    let calls = 0;
    const owner: AssessmentOwner = {
      owner: 'HardwareFulfillment',
      async assess() {
        calls++;
        throw new Error('must not call');
      },
    };
    const orders = new OrderAcceptance(store, new Assessments(now, [owner]), now);
    await expect(orders.submit(customer, setup.input(setup.hw, 'HARDWARE'))).rejects.toMatchObject({
      code: 'ACTION_DENIED',
    });
    expect(calls).toBe(0);
    expect(await store.list('Order')).toHaveLength(0);
  });

  it('신청 목록은 직원 application.read·상태 필터·유한 keyset을 적용한다', async () => {
    await apply();
    await apply();
    const query = new EnterpriseQuery(access, now);
    const first = (await query.applications(staff, {
      status: 'PENDING',
      cursor: null,
      pageSize: 1,
    })) as { items: unknown[]; nextCursor: string };
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    expect(await query.applications(staff, { status: 'APPROVED', cursor: null })).toMatchObject({
      items: [],
    });
    await expect(
      query.applications(approvalOnly, { status: null, cursor: null }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      query.applications(customer, { status: null, cursor: null }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('조직 CREATE는 같은 기업 원본과 일관된 Enterprise 조직 개정을 원자적으로 기록한다', async () => {
    const setup = await trading();
    const organisation = new EnterpriseOrganisation(access, now);
    const result = await organisation.upsert(customer, ref('Enterprise', setup.enterprise), {
      meta: meta(),
      entityKind: 'DEPARTMENT',
      label: '합성 부서',
      active: true,
      changeKind: 'CREATE',
      organisationRef: null,
    });
    expect(await store.read('Department', result.targetRef!.id)).toMatchObject({
      label: '합성 부서',
      revision: 1,
    });
    expect(await store.read('Enterprise', String(setup.enterprise.enterpriseId))).toMatchObject({
      revision: Number(setup.enterprise.revision) + 1,
    });
    expect(await store.read('RequestReceipt', result.requestId)).toMatchObject({
      correlationId: customer.correlationId,
    });
  });
  it('조직 UPDATE는 식별자를 유지하며 비활성화로 과거 조직을 삭제하지 않는다', async () => {
    const setup = await trading();
    const organisation = new EnterpriseOrganisation(access, now);
    const created = await organisation.upsert(customer, ref('Enterprise', setup.enterprise), {
      meta: meta(),
      entityKind: 'BUSINESS_SITE',
      label: '합성 사업장',
      active: true,
      changeKind: 'CREATE',
      organisationRef: null,
    });
    const current = (await store.read('Enterprise', String(setup.enterprise.enterpriseId)))!;
    const changed = await organisation.upsert(customer, ref('Enterprise', current), {
      meta: meta(1),
      entityKind: 'BUSINESS_SITE',
      label: '폐지 사업장',
      active: false,
      changeKind: 'UPDATE',
      organisationRef: created.targetRef!,
    });
    expect(changed.targetRef!.id).toBe(created.targetRef!.id);
    expect(changed.targetRef!.revision).toBe(2);
    expect(await store.readRevision('BusinessSite', created.targetRef!.id, 1)).toMatchObject({
      active: true,
    });
    expect(await store.read('BusinessSite', created.targetRef!.id)).toMatchObject({
      active: false,
    });
  });
  it('조직 변경은 현재 관리 행위·소속과 원래 기업 개정을 요구한다', async () => {
    const setup = await trading();
    const organisation = new EnterpriseOrganisation(access, now);
    const input = {
      meta: meta(),
      entityKind: 'DEPARTMENT' as const,
      label: '합성',
      active: true,
      changeKind: 'CREATE' as const,
      organisationRef: null,
    };
    await expect(
      organisation.upsert(other, ref('Enterprise', setup.enterprise), input),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await organisation.upsert(customer, ref('Enterprise', setup.enterprise), input);
    await expect(
      organisation.upsert(customer, ref('Enterprise', setup.enterprise), {
        ...input,
        meta: meta(),
      }),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
  });
  it('조직 UPDATE는 잘못된 원본 타입/개정과 미등록 필드를 거절한다', async () => {
    const setup = await trading();
    const organisation = new EnterpriseOrganisation(access, now);
    const input = {
      meta: meta(1),
      entityKind: 'DEPARTMENT' as const,
      label: '합성',
      active: true,
      changeKind: 'UPDATE' as const,
      organisationRef: setup.hw.targetRef!,
    };
    await expect(
      organisation.upsert(customer, ref('Enterprise', setup.enterprise), input),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      organisation.upsert(customer, ref('Enterprise', setup.enterprise), {
        ...input,
        bypass: true,
      } as never),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('기업 관리 조회는 조직 페이지와 미설정/명시 정책을 보여주며 거래 데이터를 포함하지 않는다', async () => {
    const setup = await trading();
    const query = new EnterpriseQuery(access, now);
    expect(
      await query.enterprise(customer, ref('Enterprise', setup.enterprise), {
        cursor: null,
        pageSize: 25,
      }),
    ).toMatchObject({
      data: {
        orderingContextPolicy: { departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
        administratorCount: 1,
      },
    });
    await expect(
      query.enterprise(other, ref('Enterprise', setup.enterprise), { cursor: null, pageSize: 25 }),
    ).rejects.toThrow();
  });
  it('상품 조회는 실제 등록 공통가격과 미확인 기업 적용가격을 구분한다', async () => {
    const setup = await trading();
    const query = new CatalogQuery(setup.catalog, now);
    const page = (await query.list(customer, {
      scope: access.managementTarget(setup.enterprise),
      cursor: null,
      pageSize: 25,
    })) as { items: { data: Record<string, unknown> }[] };
    expect(page.items).toHaveLength(2);
    expect(
      page.items.every(
        (item) =>
          item.data.priceKnowledge === 'UNKNOWN' &&
          item.data.resolvedPrice === null &&
          item.data.commonPrice,
      ),
    ).toBe(true);
    expect(
      page.items.find((item) => item.data.productType === 'HARDWARE')!.data.commonPrice,
    ).toEqual({ currency: 'KRW', value: '123.45' });
  });
  it('상품 조회는 product.read와 기업 범위를 요구하며 페이지 한도를 우회하지 않는다', async () => {
    const setup = await trading();
    const query = new CatalogQuery(setup.catalog, now);
    await expect(
      query.list(other, {
        scope: access.managementTarget(setup.enterprise),
        cursor: null,
        pageSize: 25,
      }),
    ).rejects.toThrow();
    await expect(
      query.list(approvalOnly, { scope: null, cursor: null, pageSize: 25 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      query.list(customer, { scope: null, cursor: null, pageSize: 25 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      query.list(staff, { scope: null, cursor: null, pageSize: 101 }),
    ).rejects.toMatchObject({ code: 'PAGE_LIMIT' });
  });

  it('AC1.1.1 신청자는 자기 PENDING 결과와 원래 지속 접수를 재조회한다', async () => {
    const input = {
      meta: meta(),
      legalName: '합성기업A',
      designatedContact: 'contact@example.invalid',
      registrationEvidenceRefs: [syntheticBasis],
    };
    const receipt = await access.apply(customer, input);
    const replay = await access.apply(customer, input);
    expect(replay.requestId).toBe(receipt.requestId);
    expect(await access.readApplication(customer, receipt.targetRef!.id)).toMatchObject({
      knowledge: 'KNOWN',
      data: { state: 'PENDING', initialAdministratorRef: null, confirmation: 'UNKNOWN' },
    });
    expect(await store.read('RequestReceipt', receipt.requestId)).toMatchObject({
      correlationId: customer.correlationId,
      principalId: 'customer',
    });
    expect(await store.list('EnterpriseApplication')).toHaveLength(1);
  });
  it('AC1.1.3 다른 신청자의 신청은 존재/내용을 비노출404로 거절한다', async () => {
    const receipt = await apply();
    await expect(access.readApplication(other, receipt.targetRef!.id)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    await expect(access.readApplication(other, 'nonexistent')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
  it('AC1.2.1 기업 승인과 별도 최초 관리자 지정은 원본/이력을 보호하며 거래 권한을 자동 부여하지 않는다', async () => {
    const result = await approved();
    expect(await store.list('EnterpriseMembership')).toEqual([]);
    await access.designate(staff, result.enterprise, {
      meta: meta(1),
      accountRef: customer.actorAccountRef!,
      basisRefs: [syntheticBasis],
      label: '최초 기업관리',
      actionScopes: managementScopes(result.enterprise),
    });
    expect(await access.readApplication(customer, result.application.targetRef!.id)).toMatchObject({
      data: { state: 'APPROVED', initialAdministratorRef: { entity: 'EnterpriseMembership' } },
    });
    const enterprise = await store.read('Enterprise', result.enterprise.id);
    expect(enterprise?.administratorCount).toBe(1);
    const scopes = await store.list('ActionScope');
    expect(scopes.map((value) => value.action).sort()).toEqual([
      'organisation.manage',
      'role.manage',
      'user.manage',
    ]);
    expect(
      (await store.list('AccessHistory')).some(
        (value) => value.actorAccountRef && (value.actorAccountRef as Ref).id === 'staff',
      ),
    ).toBe(true);
    await expect(
      access.authorization.requireCustomer(
        customer,
        'order.submit',
        access.managementTarget(enterprise!),
        enterprise!.orderingContextPolicy as never,
      ),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
  it('AC1.2.2 근거 부족/미확인/충돌/조회불가는 승인을 확정하지 않고 확인 대상으로 유지한다', async () => {
    for (const knowledge of ['UNKNOWN', 'CONFLICT', 'UNAVAILABLE'] as const) {
      verification.knowledge = knowledge;
      const receipt = await apply();
      const result = await access.approve(staff, {
        meta: meta(1),
        targetRef: receipt.targetRef!,
        decision: 'APPROVE',
        basisRefs: [syntheticBasis],
      });
      expect(result.requestState).toBe('REVIEW_REQUIRED');
      expect(await access.readApplication(customer, receipt.targetRef!.id)).toMatchObject({
        data: { state: 'UNVERIFIED', confirmation: knowledge },
      });
    }
    verification.knowledge = 'KNOWN';
    const receipt = await apply();
    await access.approve(staff, {
      meta: meta(1),
      targetRef: receipt.targetRef!,
      decision: 'APPROVE',
      basisRefs: [],
    });
    expect(await store.list('Enterprise')).toHaveLength(0);
  });
  it('AC1.2.3 승인 권한만 있는 직원의 최초 지정은 거절하며 권한을 확대하지 않는다', async () => {
    const result = await approved();
    await expect(
      access.designate(approvalOnly, result.enterprise, {
        meta: meta(1),
        accountRef: customer.actorAccountRef!,
        basisRefs: [syntheticBasis],
        label: '기업관리',
        actionScopes: managementScopes(result.enterprise),
      }),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    expect(await store.list('EnterpriseMembership')).toEqual([]);
    await expect(
      access.readApplication(approvalOnly, result.application.targetRef!.id),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
  it('후보 관계 미확인/거래 행위 혼입/오래된 개정은 최초 지정을 거절한다', async () => {
    const result = await approved();
    const input = {
      meta: meta(1),
      accountRef: customer.actorAccountRef!,
      basisRefs: [syntheticBasis],
      label: '기업관리',
      actionScopes: managementScopes(result.enterprise),
    };
    verification.relationshipConfirmed = false;
    await expect(access.designate(staff, result.enterprise, input)).rejects.toMatchObject({
      code: 'ADMINISTRATOR_CONFIRMATION_REQUIRED',
    });
    verification.relationshipConfirmed = true;
    await expect(
      access.designate(staff, result.enterprise, {
        ...input,
        meta: meta(1),
        actionScopes: [{ ...input.actionScopes[0]!, action: 'order.submit' }],
      }),
    ).rejects.toMatchObject({ code: 'INITIAL_MANAGEMENT_ONLY' });
    await expect(
      access.designate(staff, result.enterprise, { ...input, meta: meta(2) }),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    expect(await store.list('EnterpriseMembership')).toEqual([]);
  });
  it('관리자는 정책을 명시하고 별도 거래 역할을 명시 부여해야 주문 행위를 얻는다', async () => {
    const result = await approved();
    await access.designate(staff, result.enterprise, {
      meta: meta(1),
      accountRef: customer.actorAccountRef!,
      basisRefs: [syntheticBasis],
      label: '기업관리',
      actionScopes: managementScopes(result.enterprise),
    });
    let enterprise = (await store.read('Enterprise', result.enterprise.id))!;
    await access.setOrderingPolicy(customer, ref('Enterprise', enterprise), {
      meta: meta(2),
      departmentUsage: 'NOT_USED',
      siteUsage: 'NOT_USED',
    });
    enterprise = (await store.read('Enterprise', result.enterprise.id))!;
    expect(enterprise.revision).toBe(3);
    const role = await access.defineCustomerRole(customer, ref('Enterprise', enterprise), {
      meta: meta(),
      label: '명시 거래 역할',
      actionScopes: [
        {
          action: 'order.submit',
          kind: 'ENTERPRISE_ALL',
          enterpriseRef: ref('Enterprise', enterprise),
          departmentRefs: [],
          siteRefs: [],
        },
      ],
    });
    await access.grantCustomerRole(customer, ref('Enterprise', enterprise), {
      meta: meta(),
      accountRef: customer.actorAccountRef!,
      roleRef: role.targetRef!,
      decision: 'GRANT',
    });
    await expect(
      access.authorization.requireCustomer(
        customer,
        'order.submit',
        access.managementTarget(enterprise),
        enterprise.orderingContextPolicy as never,
      ),
    ).resolves.toMatchObject({ administrator: true });
    await expect(
      access.authorization.requireCustomer(
        other,
        'order.submit',
        access.managementTarget(enterprise),
        enterprise.orderingContextPolicy as never,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('AC1.1.2 미승인 기업의 주문은 접수하지 않고 기업 이용 사유를 반환한다', async () => {
    await apply();
    const enterpriseRef: Ref = {
      owner: 'EnterpriseAccess',
      entity: 'Enterprise',
      id: 'pending-enterprise',
      revision: 1,
    };
    const orders = new OrderAcceptance(store, new Assessments(now), now);
    const input: OrderInput = {
      meta: meta(),
      productType: 'HARDWARE',
      targetScope: {
        enterpriseRef,
        contextPolicyRef: enterpriseRef,
        organisationRevision: 1,
        departmentRef: null,
        siteRef: null,
      },
      lines: [
        {
          productRef: { owner: 'ProductCatalog', entity: 'Product', id: 'p', revision: 1 },
          commonOfferRevisionRef: {
            owner: 'ProductCatalog',
            entity: 'CommonOfferRevision',
            id: 'o',
            revision: 1,
          },
          agreementRevisionRef: null,
          quantity: 1,
          paymentMode: 'PREPAY',
          requestedActivationDate: null,
        },
      ],
      provisionChoice: 'FULL',
      partialConsentRef: null,
    };
    await expect(orders.submit(customer, input)).rejects.toMatchObject({
      status: 403,
      code: 'ENTERPRISE_NOT_ENABLED',
    });
    expect(await store.list('Order')).toEqual([]);
  });
  it('AC3.3.1 품목별 미확인/특례/충돌/기술실패를 구별하여 원래 다품목 주문에 남긴다', async () => {
    const setup = await trading();
    const owner: AssessmentOwner = {
      owner: 'HardwareFulfillment',
      async assess(input) {
        if (input.quantity === 4) throw new Error('synthetic technical failure');
        return {
          sourceOwner: 'HardwareFulfillment',
          knowledge: input.quantity === 3 ? 'CONFLICT' : input.quantity === 2 ? 'KNOWN' : 'UNKNOWN',
          reasonKind:
            input.quantity === 3
              ? 'CONFLICT'
              : input.quantity === 2
                ? 'SPECIAL_CONDITION'
                : 'UNVERIFIED',
          reasonCode: 'SYNTHETIC_ASSESSMENT_' + input.quantity,
          observedAt: now().toISOString(),
          sourceRevision: 1,
          basisRefs: [syntheticBasis],
        };
      },
    };
    const orders = new OrderAcceptance(store, new Assessments(now, [owner]), now);
    const input = setup.input(setup.hw, 'HARDWARE', 4);
    input.lines.forEach((line, index) => {
      line.quantity = index + 1;
    });
    const receipt = await orders.submit(customer, input);
    const view = (await orders.readReview(staff, receipt.targetRef!.id)) as {
      data: { lines: { assessments: { sourceOwner: string; reasonKind: string }[] }[] };
    };
    expect(
      view.data.lines.map(
        (line) =>
          line.assessments.find((value) => value.sourceOwner === 'HardwareFulfillment')!.reasonKind,
      ),
    ).toEqual(['UNVERIFIED', 'SPECIAL_CONDITION', 'CONFLICT', 'TECHNICAL_FAILURE']);
    expect(receipt.requestState).toBe('REVIEW_REQUIRED');
  });
  it('AC3.3.2 일부 조건 확인 후에도 전체 대기이며 남은 모든 항목을 표시한다', async () => {
    const setup = await trading();
    const owner: AssessmentOwner = {
      owner: 'HardwareFulfillment',
      async assess() {
        return {
          sourceOwner: 'HardwareFulfillment',
          knowledge: 'KNOWN',
          reasonKind: 'UNVERIFIED',
          reasonCode: 'SYNTHETIC_KNOWN_SUPPLY_ONLY',
          observedAt: now().toISOString(),
          sourceRevision: 1,
          basisRefs: [syntheticBasis],
        };
      },
    };
    const orders = new OrderAcceptance(store, new Assessments(now, [owner]), now);
    const receipt = await orders.submit(customer, setup.input(setup.hw, 'HARDWARE', 2));
    const view = (await orders.readReview(customer, receipt.targetRef!.id)) as {
      data: { acceptance: string; lines: { assessments: { knowledge: string }[] }[] };
    };
    expect(view.data.acceptance).toBe('REVIEW_REQUIRED');
    expect(view.data.lines).toHaveLength(2);
    expect(
      view.data.lines.every(
        (line) =>
          line.assessments.some((value) => value.knowledge === 'KNOWN') &&
          line.assessments.some((value) => value.knowledge === 'UNKNOWN'),
      ),
    ).toBe(true);
  });
  it('AC3.3.3 무권한 직원/타기업 고객에게 판단 내용·근거를 반환하지 않는다', async () => {
    const setup = await trading();
    const orders = new OrderAcceptance(store, new Assessments(now), now);
    const receipt = await orders.submit(customer, setup.input(setup.hw, 'HARDWARE'));
    await expect(orders.readReview(approvalOnly, receipt.targetRef!.id)).rejects.toMatchObject({
      code: 'ACTION_DENIED',
    });
    await expect(orders.readReview(other, receipt.targetRef!.id)).rejects.toThrow();
  });
  it('HW/SW 주문은 분리하며101항목/무효수량/혼합 타입/미확인 부분동의는 전체 거절한다', async () => {
    const setup = await trading();
    const orders = new OrderAcceptance(store, new Assessments(now), now);
    await expect(
      orders.submit(customer, setup.input(setup.hw, 'HARDWARE', 101)),
    ).rejects.toMatchObject({ status: 400 });
    const bad = setup.input(setup.hw, 'HARDWARE');
    bad.lines[0]!.quantity = 0;
    await expect(orders.submit(customer, bad)).rejects.toThrow();
    await expect(orders.submit(customer, setup.input(setup.sw, 'HARDWARE'))).rejects.toMatchObject({
      code: 'PRODUCT_OFFER_CHANGED',
    });
    const partial = setup.input(setup.hw, 'HARDWARE');
    partial.provisionChoice = 'PARTIAL';
    await expect(orders.submit(customer, partial)).rejects.toMatchObject({
      code: 'PARTIAL_CONSENT_UNCONFIRMED',
    });
    expect(await store.list('Order')).toEqual([]);
    const hundred = await orders.submit(customer, setup.input(setup.hw, 'HARDWARE', 100));
    const software = await orders.submit(customer, setup.input(setup.sw, 'SOFTWARE'));
    const hardwareView = (await orders.readReview(customer, hundred.targetRef!.id)) as {
      data: { lines: unknown[]; productType: string };
    };
    expect(hardwareView.data.lines).toHaveLength(100);
    expect(hardwareView.data.productType).toBe('HARDWARE');
    expect(await orders.readReview(customer, software.targetRef!.id)).toMatchObject({
      data: { productType: 'SOFTWARE', acceptance: 'REVIEW_REQUIRED' },
    });
  });
  it('상품 등록은 직원 현재 grant가 필요하며 고객은 등록하지 못한다', async () => {
    const catalog = new ProductCatalog(store, now);
    const input = {
      meta: meta(),
      productType: 'HARDWARE' as const,
      softwareTermKind: null,
      label: '합성',
      salesDescription: '합성',
      commonPrice: { currency: 'KRW' as const, value: '1' },
      salesConditionRefs: [],
    };
    await expect(catalog.register(customer, input)).rejects.toMatchObject({
      code: 'STAFF_REQUIRED',
    });
    await expect(catalog.register(approvalOnly, input)).rejects.toMatchObject({
      code: 'ACTION_DENIED',
    });
    await expect(
      catalog.register(staff, { ...input, softwareTermKind: 'TERM' }),
    ).rejects.toMatchObject({ code: 'PRODUCT_TERM_KIND' });
    expect(await store.list('Product')).toEqual([]);
  });
  it('원래 Receipt 조회는 현재 자기/행위 권한과 원래correlation을 유지한다', async () => {
    const setup = await trading();
    const orders = new OrderAcceptance(store, new Assessments(now), now);
    const receipt = await orders.submit(customer, setup.input(setup.hw, 'HARDWARE'));
    const inquiry = new WorkInquiry(store, now);
    expect(await inquiry.readReceipt(customer, receipt.requestId)).toEqual(receipt);
    await expect(inquiry.readReceipt(other, receipt.requestId)).rejects.toMatchObject({
      status: 404,
    });
    const saved = await store.read('RequestReceipt', receipt.requestId);
    expect(saved?.correlationId).toBe(customer.correlationId);
  });
  it('보호된 outbox→큐→현재 permit→내부효과/consumer mark는 중복 전달에도 한 번 기록된다', async () => {
    const setup = await trading();
    const orders = new OrderAcceptance(store, new Assessments(now), now);
    await orders.submit(customer, setup.input(setup.hw, 'HARDWARE'));
    const queue = new SyntheticQueue();
    const worker = new NoticeWorker(store, queue, now, true);
    const expectedOutboxes = await store.list('OutboxDelivery', {
      equals: { state: 'PENDING' },
      limit: 25,
    });
    expect(await worker.relayBatch()).toBe(expectedOutboxes.length);
    expect(queue.messages).toHaveLength(expectedOutboxes.length);
    const orderMessages = queue.messages.filter(
      (message) => (message.body as { targetRef: { entity: string } }).targetRef.entity === 'Order',
    );
    expect(orderMessages).toHaveLength(1);
    const first = await worker.consume(
      queue.messages.find(
        (message) =>
          (message.body as { targetRef: { entity: string } }).targetRef.entity === 'Order',
      )!,
    );
    await queue.publish('u1-in-app-notice', orderMessages[0]!.body as Work);
    const replay = await worker.consume(queue.messages.at(-1)!);
    expect(replay.requestId).toBe(first.requestId);
    expect(await store.list('NotificationIntent')).toHaveLength(1);
    expect(await store.list('ConsumerProcessingMark')).toHaveLength(1);
    expect(await store.list('DeliveryAttempt', { equals: { channel: 'IN_APP' } })).toMatchObject([
      { knowledge: 'KNOWN' },
    ]);
    expect(await store.list('DeliveryAttempt', { equals: { channel: 'EMAIL' } })).toMatchObject([
      { knowledge: 'UNKNOWN', providerCorrelation: null },
    ]);
    expect(queue.acknowledgements).toHaveLength(2);
    expect(
      await store.list('WorkItem', { equals: { targetRef: { entity: 'Order' } }, limit: 25 }),
    ).toMatchObject([{ state: 'RESULT_RECORDED', correlationId: customer.correlationId }]);
  });
  it('큐 발행 효과 불명은 UNKNOWN을 보존하고 다시 전송/성공으로 표시하지 않는다', async () => {
    const setup = await trading();
    await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const queue = new SyntheticQueue();
    queue.failAfterPublish = true;
    const worker = new NoticeWorker(store, queue, now, true);
    const originalWork = (
      await store.list('WorkItem', { equals: { targetRef: { entity: 'Order' } }, limit: 1 })
    )[0]!;
    const outbox = (
      await store.list('OutboxDelivery', {
        equals: { workRef: { id: originalWork.workId } },
        limit: 1,
      })
    )[0]!;
    await expect(worker.relayOne(String(outbox.outboxId))).rejects.toThrow(
      'unknown publish outcome',
    );
    const currentOutbox = (await store.read('OutboxDelivery', String(outbox.outboxId)))!;
    expect(currentOutbox.state).toBe('UNKNOWN');
    await expect(worker.relayOne(String(outbox.outboxId))).rejects.toMatchObject({
      code: 'PUBLISH_OUTCOME_REVIEW',
    });
    expect(queue.messages).toHaveLength(1);
    expect(await store.list('NotificationIntent')).toHaveLength(0);
  });
  it('provider 미등록은 효과/발행 성공을 만들지 않고 원본 작업을 보존한다', async () => {
    const setup = await trading();
    await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const originalWork = (
      await store.list('WorkItem', { equals: { targetRef: { entity: 'Order' } }, limit: 1 })
    )[0]!;
    const originalOutbox = (
      await store.list('OutboxDelivery', {
        equals: { workRef: { id: originalWork.workId } },
        limit: 1,
      })
    )[0]!;
    const worker = new NoticeWorker(store, null, now, false);
    await expect(worker.relayOne(String(originalOutbox.outboxId))).rejects.toMatchObject({
      code: 'BROKER_NOT_REGISTERED',
    });
    expect(await store.read('OutboxDelivery', String(originalOutbox.outboxId))).toMatchObject({
      state: 'PENDING',
      attempt: 0,
    });
    expect(await store.read('WorkItem', String(originalWork.workId))).toMatchObject(originalWork);
    expect(await store.list('ConsumerProcessingMark')).toHaveLength(0);
  });
  it('위조 Work/consumer/허가 회수와 old epoch는 큐 ACK·내부 효과 전에 거절한다', async () => {
    const setup = await trading();
    await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const queue = new SyntheticQueue();
    const worker = new NoticeWorker(store, queue, now, true);
    await worker.relayBatch();
    const message = queue.messages.find(
      (message) => (message.body as { targetRef: { entity: string } }).targetRef.entity === 'Order',
    )!;
    await expect(worker.consume({ ...message, consumer: 'unknown-consumer' })).rejects.toThrow();
    await expect(
      worker.consume({
        ...message,
        body: { ...(message.body as Record<string, unknown>), requestId: 'forged' },
      }),
    ).rejects.toMatchObject({ code: 'WORK_ENVELOPE_MISMATCH' });
    const permit = (await store.read(
      'ExecutionPermit',
      (message.body as { executionPermitRef: { id: string } }).executionPermitRef.id,
    ))!;
    await store.execute(
      {
        principalId: 'synthetic-admin',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'revokePermit',
        target: { permitId: permit.permitId },
        idempotencyKey: 'revoke-permit',
        input: { allowed: false },
        correlationId: 'revoke-permit',
        epoch: 'initial',
      },
      (transaction) =>
        transaction.put('ExecutionPermit', { ...permit, allowed: false, revision: 2 }, 1),
    );
    await expect(worker.consume(message)).rejects.toMatchObject({ code: 'WORK_PERMIT' });
    expect(queue.acknowledgements).toHaveLength(0);
    expect(await store.list('NotificationIntent')).toHaveLength(0);
  });
  it('보호 전 후보의 outbox/작업은 relay하지 않고 보호 대조 뒤에만 발행한다', async () => {
    const setup = await trading();
    const failed = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'PRIMARY_COMMITTED') throw new Error('unprotected outbox');
      },
    );
    await expect(
      new OrderAcceptance(failed, new Assessments(now), now).submit(
        customer,
        setup.input(setup.hw, 'HARDWARE'),
      ),
    ).rejects.toThrow();
    const queue = new SyntheticQueue();
    const worker = new NoticeWorker(store, queue, now, true);
    expect(await worker.relayBatch()).toBe(0);
    expect(queue.messages).toHaveLength(0);
    await store.protectPending('initial');
    expect(await worker.relayBatch()).toBe(1);
    expect(queue.messages).toHaveLength(1);
    expect((queue.messages[0]!.body as { targetRef: { entity: string } }).targetRef.entity).toBe(
      'Order',
    ); // Earlier claims interrupted by the protection gap remain reconciliation-required; they are not resent by inference.
  });
  it('실제 in-app 통지 조회/열람과 이메일 미확인은 별도이며 다른 수신자는 비노출이다', async () => {
    const setup = await trading();
    await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const queue = new SyntheticQueue();
    const worker = new NoticeWorker(store, queue, now, true);
    await worker.relayBatch();
    const result = await worker.consume(
      queue.messages.find(
        (message) =>
          (message.body as { targetRef: { entity: string } }).targetRef.entity === 'Order',
      )!,
    );
    const notices = new NotificationDelivery(store, now);
    expect(await notices.read(customer)).toMatchObject({
      items: [
        { knowledge: 'KNOWN', data: { minimalText: '주문 진행을 확인해 주세요.', readAt: null } },
      ],
    });
    expect(await notices.read(other)).toMatchObject({ items: [] });
    await expect(
      notices.recordRead(other, { meta: meta(), notificationRef: result.resultRef }),
    ).rejects.toMatchObject({ status: 404 });
    await notices.recordRead(customer, { meta: meta(), notificationRef: result.resultRef });
    expect(await notices.read(customer)).toMatchObject({
      items: [{ data: { readAt: now().toISOString() } }],
    });
    expect(await store.list('Order')).toMatchObject([{ revision: 1 }]);
    expect(await store.list('AcceptanceDecision')).toMatchObject([
      { acceptance: 'REVIEW_REQUIRED' },
    ]);
  });
  it('누적 최초+추가3/30초/5분은 replica와queue copy로 초기화되지 않고UNKNOWN은 대조 대상으로 남는다', async () => {
    const setup = await trading();
    await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const work = (await store.list('WorkItem'))[0]!;
    let clock = now();
    const policy = new ExternalPolicy(
      store,
      () => clock,
      () => 0,
    );
    for (let count = 1; count <= 4; count++) {
      const budget = await policy.begin(
        'same-original-operation',
        String(work.workId),
        'endpoint',
        String(work.deadlineAt),
      );
      expect(budget.attemptCount).toBe(count);
      expect(Date.parse(budget.deadlineAt) - clock.getTime()).toBeLessThanOrEqual(30000);
      await policy.finish('same-original-operation', 'SAFE_TRANSIENT', budget);
    }
    await expect(
      new ExternalPolicy(store, () => clock).begin(
        'same-original-operation',
        String(work.workId),
        'endpoint',
        String(work.deadlineAt),
      ),
    ).rejects.toThrow();
    const unknownClaim = await policy.begin(
      'unknown-original-operation',
      String(work.workId),
      'other-endpoint',
      String(work.deadlineAt),
    );
    await policy.finish('unknown-original-operation', 'UNKNOWN', unknownClaim);
    await expect(
      policy.begin(
        'unknown-original-operation',
        String(work.workId),
        'other-endpoint',
        String(work.deadlineAt),
      ),
    ).rejects.toMatchObject({ code: 'EXTERNAL_ORIGINAL_RECONCILIATION' });
    expect((await store.read('ExternalAttempt', 'unknown-original-operation'))?.state).toBe(
      'UNKNOWN',
    );
    clock = new Date(clock.getTime() + 5 * 60000);
    await expect(
      policy.begin('expired-operation', String(work.workId), 'endpoint', String(work.deadlineAt)),
    ).rejects.toMatchObject({ code: 'EXTERNAL_RETRY_BUDGET' });
  });
  it('30초내연속5실패 circuit은 endpoint전체HALF_OPEN1개와부작용없는probe만허용한다', async () => {
    const setup = await trading();
    await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const work = (await store.list('WorkItem'))[0]!;
    let clock = now();
    const policy = new ExternalPolicy(
      store,
      () => clock,
      () => 0,
    );
    for (let i = 0; i < 5; i++) {
      const claim = await policy.begin(
        'failure-' + i,
        String(work.workId),
        'shared-endpoint',
        String(work.deadlineAt),
      );
      await policy.finish('failure-' + i, 'SAFE_TRANSIENT', claim);
    }
    await expect(
      policy.begin(
        'blocked-operation',
        String(work.workId),
        'shared-endpoint',
        String(work.deadlineAt),
      ),
    ).rejects.toMatchObject({ code: 'ENDPOINT_CIRCUIT_OPEN' });
    await expect(
      policy.claimHarmlessProbe('shared-endpoint', 'replicaA', false),
    ).rejects.toMatchObject({ code: 'HARMLESS_PROBE_NOT_REGISTERED' });
    await expect(policy.claimHarmlessProbe('shared-endpoint', 'replicaA', true)).rejects.toThrow();
    clock = new Date(clock.getTime() + 30000);
    const replica = new ExternalPolicy(store, () => clock);
    const results = await Promise.allSettled([
      policy.claimHarmlessProbe('shared-endpoint', 'replicaA', true),
      replica.claimHarmlessProbe('shared-endpoint', 'replicaB', true),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const circuit = (await store.read('EndpointCircuit', 'shared-endpoint'))!;
    const claim = results.find((result) => result.status === 'fulfilled')!.value;
    await expect(
      policy.completeHarmlessProbe('shared-endpoint', 'wrong-owner', true, claim),
    ).rejects.toThrow();
    await policy.completeHarmlessProbe('shared-endpoint', String(circuit.probeOwner), true, claim);
    expect((await store.read('EndpointCircuit', 'shared-endpoint'))?.state).toBe('CLOSED');
  });
  it('복구는 완료 consumer/effect를 보존하고 old epoch 큐사본으로 두 번째 효과를 만들지 않는다', async () => {
    const setup = await trading();
    await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const queue = new SyntheticQueue();
    const worker = new NoticeWorker(store, queue, now, true);
    await worker.relayBatch();
    const message = queue.messages.find(
      (message) => (message.body as { targetRef: { entity: string } }).targetRef.entity === 'Order',
    )!;
    await worker.consume(message);
    const noticesBefore = await store.list('NotificationIntent');
    const marksBefore = await store.list('ConsumerProcessingMark');
    const pendingBefore = (await store.list('WorkItem', { limit: 100 })).filter((work) =>
      ['PENDING', 'PROCESSING', 'TECHNICAL_FAILED'].includes(String(work.state)),
    );
    const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(report.workHolds).toBe(pendingBefore.length);
    expect(await store.list('RecoveryWorkHold', { limit: 100 })).toHaveLength(pendingBefore.length);
    expect((await store.read('WorkItem', (message.body as { workId: string }).workId))?.state).toBe(
      'RESULT_RECORDED',
    );
    expect(await store.list('NotificationIntent')).toEqual(noticesBefore);
    expect(await store.list('ConsumerProcessingMark')).toEqual(marksBefore);
    await expect(worker.consume(message)).rejects.toMatchObject({ code: 'WORK_EPOCH_FENCED' });
    expect(await store.list('NotificationIntent')).toHaveLength(1);
    expect(await store.read('WorkItem', (message.body as { workId: string }).workId)).toMatchObject(
      { state: 'RESULT_RECORDED' },
    );
  });
  it('미처리 원래 Work/불명 외부결과와 회수 grant는 복구 뒤 명시적 보류로 남고 옛 권한을 부활시키지 않는다', async () => {
    const setup = await trading();
    await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const workBefore = (
      await store.list('WorkItem', { equals: { targetRef: { entity: 'Order' } }, limit: 1 })
    )[0]!;
    const policy = new ExternalPolicy(store, now);
    const claim = await policy.begin(
      'original-unknown-operation',
      String(workBefore.workId),
      'endpoint',
      String(workBefore.deadlineAt),
    );
    await policy.finish('original-unknown-operation', 'UNKNOWN', claim);
    const grant = (
      await store.list('CustomerRoleGrant', {
        equals: {
          roleRef: {
            id: (await store.list('CustomerRole', { equals: { label: '명시 주문 역할' } }))[0]!
              .roleId,
          },
        },
      })
    )[0]!;
    await store.execute(
      {
        principalId: 'synthetic-admin',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'revoke-current-grant',
        target: { grantId: grant.grantId },
        idempotencyKey: 'revoke-before-recovery',
        input: { revoke: true },
        correlationId: 'revoke-before-recovery',
        epoch: 'initial',
      },
      (transaction) =>
        transaction.put(
          'CustomerRoleGrant',
          { ...grant, revokedAt: now().toISOString(), revision: Number(grant.revision) + 1 },
          Number(grant.revision),
        ),
    );
    const pendingBefore = (await store.list('WorkItem', { limit: 100 })).filter((work) =>
      ['PENDING', 'PROCESSING', 'TECHNICAL_FAILED'].includes(String(work.state)),
    );
    const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(report.workHolds).toBe(pendingBefore.length);
    for (const original of pendingBefore)
      expect(await store.read('WorkItem', String(original.workId))).toMatchObject({
        workId: original.workId,
        requestId: original.requestId,
        correlationId: original.correlationId,
        state: 'REVIEW_REQUIRED',
      });
    expect(await store.read('WorkItem', String(workBefore.workId))).toMatchObject({
      workId: workBefore.workId,
      requestId: workBefore.requestId,
      correlationId: workBefore.correlationId,
      state: 'REVIEW_REQUIRED',
      epoch: 'initial',
    });
    expect(
      await store.list('RecoveryWorkHold', { equals: { workId: workBefore.workId }, limit: 1 }),
    ).toMatchObject([
      {
        workId: workBefore.workId,
        requestId: workBefore.requestId,
        correlationId: workBefore.correlationId,
        reason: 'CURRENT_SECURITY_AND_ORIGINAL_OUTCOME_UNCONFIRMED',
        recoveryEpoch: report.epoch,
      },
    ]);
    expect((await store.read('ExternalAttempt', 'original-unknown-operation'))?.state).toBe(
      'UNKNOWN',
    );
    expect((await store.read('CustomerRoleGrant', String(grant.grantId)))?.revokedAt).toBe(
      now().toISOString(),
    );
    await expect(
      access.authorization.requireCustomer(
        customer,
        'order.submit',
        access.managementTarget(setup.enterprise),
        setup.enterprise.orderingContextPolicy as never,
      ),
    ).rejects.toThrow();
    expect(
      await store.list('OutboxDelivery', {
        equals: { workRef: { id: workBefore.workId } },
        limit: 1,
      }),
    ).toMatchObject([{ state: 'REVIEW_REQUIRED' }]);
    expect(await store.list('NotificationIntent')).toHaveLength(0);
  });
  it('이전attempt의늦은callback과같은owner의옛probe결과는새시도/새probe를완료시키지않는다', async () => {
    const setup = await trading();
    await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const work = (await store.list('WorkItem'))[0]!;
    let clock = now();
    const policy = new ExternalPolicy(
      store,
      () => clock,
      () => 0,
    );
    const old = await policy.begin(
      'attempt-race',
      String(work.workId),
      'race-endpoint',
      String(work.deadlineAt),
    );
    await policy.finish('attempt-race', 'SAFE_TRANSIENT', old);
    const current = await policy.begin(
      'attempt-race',
      String(work.workId),
      'race-endpoint',
      String(work.deadlineAt),
    );
    await expect(policy.finish('attempt-race', 'KNOWN', old)).rejects.toMatchObject({
      status: 409,
    });
    expect((await store.read('ExternalAttempt', 'attempt-race'))?.state).toBe('RUNNING');
    await policy.finish('attempt-race', 'KNOWN', current);
    for (let i = 0; i < 5; i++) {
      const claim = await policy.begin(
        'probe-failure-' + i,
        String(work.workId),
        'probe-endpoint',
        String(work.deadlineAt),
      );
      await policy.finish('probe-failure-' + i, 'SAFE_TRANSIENT', claim);
    }
    clock = new Date(clock.getTime() + 30000);
    const priorProbe = await policy.claimHarmlessProbe('probe-endpoint', 'same-owner', true);
    await policy.completeHarmlessProbe('probe-endpoint', 'same-owner', false, priorProbe);
    clock = new Date(clock.getTime() + 30000);
    const nextProbe = await policy.claimHarmlessProbe('probe-endpoint', 'same-owner', true);
    await expect(
      policy.completeHarmlessProbe('probe-endpoint', 'same-owner', true, priorProbe),
    ).rejects.toMatchObject({ code: 'PROBE_NOT_CURRENT' });
    expect((await store.read('EndpointCircuit', 'probe-endpoint'))?.probeToken).toBe(
      nextProbe.token,
    );
    clock = new Date(clock.getTime() + 30000);
    await expect(
      policy.completeHarmlessProbe('probe-endpoint', 'same-owner', true, nextProbe),
    ).rejects.toThrow();
    await policy.holdExpiredProbe('probe-endpoint');
    expect((await store.read('EndpointCircuit', 'probe-endpoint'))?.state).toBe('REVIEW_REQUIRED');
    await expect(policy.claimHarmlessProbe('probe-endpoint', 'new-owner', true)).rejects.toThrow();
    await expect(
      policy.reconcileTerminatedProbe('probe-endpoint', syntheticBasis),
    ).rejects.toMatchObject({ code: 'PROBE_TERMINATION_AUTHORITY_REQUIRED' });
    const observer = new ExternalPolicy(
      store,
      () => clock,
      () => 0,
      {
        async observeOriginalProbe() {
          return {
            endpointId: 'probe-endpoint',
            token: nextProbe.token,
            generation: nextProbe.generation,
            epoch: nextProbe.epoch,
            terminated: true,
          };
        },
      },
    );
    await observer.reconcileTerminatedProbe('probe-endpoint', syntheticBasis);
    expect((await store.read('EndpointCircuit', 'probe-endpoint'))?.state).toBe('OPEN');
  });
});

describe('보호된 원본별 최소 이력 조회·현재 행위·관련 참조 경계', () => {
  it('신청 원래 사유·행위자·전후 참조·근거·결과를 현재 신청 조회 권한으로 읽는다', async () => {
    const applied = await apply();
    const view = (await new HistoryQuery(store, now).read(staff, applied.targetRef!, {
      cursor: null,
      pageSize: 25,
    })) as { items: { reason: string; requestId: string; evidenceRefs: Ref[]; afterRef: Ref }[] };
    expect(view.items).toHaveLength(1);
    expect(view.items[0]!.requestId).toBe(applied.requestId);
    expect(view.items[0]!.reason).toBe('합성 업무 확인');
    expect(view.items[0]!.evidenceRefs).toEqual([syntheticBasis]);
    expect(view.items[0]!.afterRef.id).toBe(applied.targetRef!.id);
  });
  it('승인 행위만 있는 직원은 신청 이력을 조회할 수 없다', async () => {
    const applied = await apply();
    await expect(
      new HistoryQuery(store, now).read(approvalOnly, applied.targetRef!, {
        cursor: null,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
  });
  it('다른 신청 이력은 SQL 대상 필터 뒤 페이지에 섞이지 않는다', async () => {
    const first = await apply();
    const second = await apply();
    const query = new HistoryQuery(store, now);
    const view = (await query.read(staff, first.targetRef!, { cursor: null, pageSize: 1 })) as {
      items: { requestId: string }[];
      nextCursor: string | null;
    };
    expect(view.items.map((row) => row.requestId)).toEqual([first.requestId]);
    expect(view.items.some((row) => row.requestId === second.requestId)).toBe(false);
    expect(view.nextCursor).not.toBeNull();
    expect(
      (
        (await query.read(staff, first.targetRef!, { cursor: view.nextCursor, pageSize: 1 })) as {
          items: unknown[];
        }
      ).items,
    ).toEqual([]);
  });
  it('없는 원본·후속 재무/라이선스 원본을 이력 참조로 우회 조회하지 않는다', async () => {
    const query = new HistoryQuery(store, now);
    for (const target of [
      { owner: 'ProductCatalog', entity: 'Product', id: 'missing', revision: 1 },
      { owner: 'FinancialSettlement', entity: 'Invoice', id: 'hidden', revision: 1 },
    ])
      await expect(query.read(staff, target, { cursor: null, pageSize: 25 })).rejects.toMatchObject(
        { code: 'NOT_FOUND' },
      );
  });
  it('고객 주문 이력은 현재 원래 범위로 한정하고 내부 판단 근거/actor를 숨긴다', async () => {
    const setup = await trading();
    const order = await new OrderAcceptance(store, new Assessments(now), now).submit(
      customer,
      setup.input(setup.hw, 'HARDWARE'),
    );
    const query = new HistoryQuery(store, now);
    const view = (await query.read(customer, order.targetRef!, { cursor: null, pageSize: 25 })) as {
      items: { evidenceRefs: Ref[]; actorAccountRef: Ref | null; resultRefs: Ref[] }[];
    };
    expect(view.items).toHaveLength(1);
    expect(view.items[0]!.evidenceRefs).toEqual([]);
    expect(view.items[0]!.actorAccountRef).toBeNull();
    expect(
      view.items[0]!.resultRefs.every((ref) => ['Order', 'OrderLine'].includes(ref.entity)),
    ).toBe(true);
    await expect(
      query.read(other, order.targetRef!, { cursor: null, pageSize: 25 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('현재 역할 회수/미보호 보안 변경 뒤 과거 이력 조회를 허용하지 않는다', async () => {
    const applied = await apply();
    await new HistoryQuery(store, now).read(staff, applied.targetRef!, {
      cursor: null,
      pageSize: 25,
    });
    await sources.primaryAdmin.query(
      'UPDATE u1_staff_role_grant SET revision=revision+1, "revokedAt"=$1 WHERE "accountRefKey"=$2',
      [now(), 'staff'],
    );
    await expect(
      new HistoryQuery(store, now).read(staff, applied.targetRef!, { cursor: null, pageSize: 25 }),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
  it('상품 이력은 원본 가격 개정과 접수 참조를 보존하며 이력 읽기로 쓰기를 만들지 않는다', async () => {
    const setup = await trading();
    const before = await store.list('RequestReceipt');
    const view = (await new HistoryQuery(store, now).read(staff, setup.hw.targetRef!, {
      cursor: null,
      pageSize: 100,
    })) as { items: { resultRefs: Ref[] }[] };
    expect(view.items[0]!.resultRefs.some((ref) => ref.entity === 'CommonOfferRevision')).toBe(
      true,
    );
    expect(await store.list('RequestReceipt')).toEqual(before);
  });
});
