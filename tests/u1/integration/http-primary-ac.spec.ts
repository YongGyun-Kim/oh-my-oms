import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '@oms/api';
import {
  Assessments,
  EnterpriseAccess,
  IdentityRecovery,
  NotificationDelivery,
  OrderAcceptance,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
} from '@oms/core';
import type { AssessmentOwner } from '@oms/core';
import type { CommandMeta, Receipt, Ref, TargetScope } from '@oms/contracts';
import { ProtectedStore } from '@oms/persistence';
import { initializeDatabases } from '../fixtures/migrate.js';
import { localSources } from '../fixtures/databases.js';
import { resetSyntheticDatabases } from '../fixtures/reset.js';
import { seedSyntheticAccount, SyntheticIdentityProvider } from '../fixtures/identity.js';
import { SyntheticEnterpriseVerification, syntheticBasis } from '../fixtures/enterprise.js';
import { seedMinimumStaffManager } from '../fixtures/staff-bootstrap.js';
import { SyntheticHttpClient } from '../fixtures/http-client.js';
const sources = localSources();
const now = () => new Date();
let customerHost: Awaited<ReturnType<typeof createApi>>;
let staffHost: Awaited<ReturnType<typeof createApi>>;
let store: ProtectedStore;
const meta = (expectedRevision: number | null = null): CommandMeta => ({
  clientRequestId: randomUUID(),
  expectedRevision,
  reason: '명시적 합성 업무 확인',
  evidenceRefs: [syntheticBasis],
});
beforeAll(async () => {
  await initializeDatabases();
  for (const source of Object.values(sources)) await source.initialize();
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  for (const [id, audience] of [
    ['customer', 'CUSTOMER'],
    ['other', 'CUSTOMER'],
    ['staff', 'STAFF'],
  ] as const)
    await seedSyntheticAccount(store, id, audience);
  await seedMinimumStaffManager(store, 'staff', now());
  const identity = () =>
    new IdentityRecovery(store, new SyntheticIdentityProvider(), {
      synthetic: true,
      verifierKey: randomBytes(32),
      now,
      staffIngress: async (proof) => proof === 'synthetic-private-ingress',
    });
  // Explicit synthetic owner observations; none is a WMS reservation/stock execution or actual provider proof.
  const assessment: AssessmentOwner = {
    owner: 'HardwareFulfillment',
    async assess(input) {
      if (input.quantity === 4) throw new Error('synthetic unavailable');
      return {
        sourceOwner: 'HardwareFulfillment',
        knowledge: input.quantity === 3 ? 'CONFLICT' : input.quantity === 2 ? 'KNOWN' : 'UNKNOWN',
        reasonKind:
          input.quantity === 3
            ? 'CONFLICT'
            : input.quantity === 2
              ? 'SPECIAL_CONDITION'
              : 'UNVERIFIED',
        reasonCode: 'SYNTHETIC_OWNER_PROFILE',
        basisRefs: [syntheticBasis],
        sourceRevision: 1,
        observedAt: now().toISOString(),
      };
    },
  };
  const owners = {
    store,
    identity: identity(),
    enterprise: new EnterpriseAccess(store, new SyntheticEnterpriseVerification(), now, true),
    catalog: new ProductCatalog(store, now),
    orders: new OrderAcceptance(store, new Assessments(now, [assessment]), now),
    staff: new StaffAccess(store, now),
    inquiry: new WorkInquiry(store, now),
    notices: new NotificationDelivery(store, now),
    now,
  };
  customerHost = await createApi(owners, {
    audience: 'CUSTOMER',
    origin: 'http://127.0.0.1:34683',
    cookieKey: randomBytes(32),
    localSynthetic: true,
    staffAdmission: async () => null,
  });
  await customerHost.app.listen(34683, '127.0.0.1');
  staffHost = await createApi(
    { ...owners, identity: identity() },
    {
      audience: 'STAFF',
      origin: 'http://127.0.0.1:34684',
      cookieKey: randomBytes(32),
      localSynthetic: true,
      staffAdmission: async (request) =>
        request.socket.remoteAddress === '127.0.0.1' ? 'synthetic-private-ingress' : null,
    },
  );
  await staffHost.app.listen(34684, '127.0.0.1');
});
afterAll(async () => {
  if (customerHost) await customerHost.app.close();
  if (staffHost) await staffHost.app.close();
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
});
describe('주 책임9개AC 실제HTTP·owner·두PG 연결', () => {
  it('자기신청/미승인거절/타기업비노출→근거승인/별도관리자/권한분리→4사유/전체대기/직원비노출', async () => {
    const customer = new SyntheticHttpClient('http://127.0.0.1:34683');
    const other = new SyntheticHttpClient('http://127.0.0.1:34683');
    const staff = new SyntheticHttpClient('http://127.0.0.1:34684');
    await customer.authenticate('customer');
    await other.authenticate('other');
    await staff.authenticate('staff');
    async function command(
      client: SyntheticHttpClient,
      path: string,
      input: { meta: CommandMeta } & Record<string, unknown>,
      revision?: number,
    ) {
      return client.request<Receipt>(path, input, {
        'Idempotency-Key': input.meta.clientRequestId,
        ...(revision ? { 'X-Target-Revision': String(revision) } : {}),
      });
    }
    async function staffRole(actions: string[]) {
      const role = await command(staff, '/staff-roles', {
        meta: meta(),
        label: '명시적 합성 역할',
        actions,
      });
      expect(role.response.status).toBe(202);
      const grant = await command(staff, '/staff-role-grant-changes', {
        meta: meta(),
        accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'staff', revision: 1 },
        roleRef: role.body.targetRef,
        decision: 'GRANT',
      });
      expect(grant.response.status).toBe(202);
    }
    await staffRole(['application.read', 'enterprise.approve', 'product.register']);
    const applied = await command(customer, '/enterprise-applications', {
      meta: meta(),
      legalName: '합성기업A',
      designatedContact: 'a@example.invalid',
      registrationEvidenceRefs: [syntheticBasis],
    });
    expect(applied.response.status).toBe(202);
    // AC1.1.1: applicant's durable PENDING result and original receipt.
    expect(
      (await customer.request('/enterprise-applications/' + applied.body.targetRef!.id)).body.data
        .state,
    ).toBe('PENDING');
    expect((await customer.request('/requests/' + applied.body.requestId)).body.requestId).toBe(
      applied.body.requestId,
    );
    // AC1.1.3: another applicant cannot observe existence or content.
    const hidden = await other.request('/enterprise-applications/' + applied.body.targetRef!.id);
    const absent = await other.request('/enterprise-applications/missing');
    expect(hidden.response.status).toBe(404);
    expect(hidden.body.type).toBe(absent.body.type);
    expect(hidden.body.detail).toBe(absent.body.detail);
    const pendingRef: Ref = {
      owner: 'EnterpriseAccess',
      entity: 'Enterprise',
      id: 'pending-enterprise',
      revision: 1,
    };
    const productRef: Ref = {
      owner: 'ProductCatalog',
      entity: 'Product',
      id: 'unconfirmed',
      revision: 1,
    };
    const pendingScope: TargetScope = {
      enterpriseRef: pendingRef,
      contextPolicyRef: pendingRef,
      organisationRevision: 1,
      departmentRef: null,
      siteRef: null,
    };
    // AC1.1.2: unapproved enterprise is never an order reception.
    const rejected = await command(customer, '/orders', {
      meta: meta(),
      targetScope: pendingScope,
      productType: 'HARDWARE',
      lines: [
        {
          productRef,
          commonOfferRevisionRef: { ...productRef, entity: 'CommonOfferRevision' },
          agreementRevisionRef: null,
          quantity: 1,
          paymentMode: 'PREPAY',
          requestedActivationDate: null,
        },
      ],
      provisionChoice: 'FULL',
      partialConsentRef: null,
    });
    expect(rejected.response.status).toBe(403);
    expect(await store.list('Order')).toHaveLength(0);
    // AC1.2.2: missing evidence does not establish approval.
    const unknown = await command(
      staff,
      '/enterprise-applications/' + applied.body.targetRef!.id + '/decisions',
      { meta: meta(1), targetRef: applied.body.targetRef, decision: 'APPROVE', basisRefs: [] },
      1,
    );
    expect(unknown.body.requestState).toBe('REVIEW_REQUIRED');
    expect(await store.list('Enterprise')).toHaveLength(0);
    const currentApplication = { ...applied.body.targetRef!, revision: 2 };
    const approved = await command(
      staff,
      '/enterprise-applications/' + currentApplication.id + '/decisions',
      {
        meta: meta(2),
        targetRef: currentApplication,
        decision: 'APPROVE',
        basisRefs: [syntheticBasis],
      },
      2,
    );
    expect(approved.response.status).toBe(202);
    const enterprise = approved.body.resultRefs.find((value) => value.entity === 'Enterprise')!;
    const applicationHistory = await staff.request<{
      items: {
        requestId: string;
        beforeRef: Ref | null;
        afterRef: Ref | null;
        evidenceRefs: Ref[];
      }[];
    }>(
      '/records/EnterpriseAccess/EnterpriseApplication/' + applied.body.targetRef!.id + '/history',
    );
    expect(applicationHistory.response.status).toBe(200);
    expect(
      applicationHistory.body.items.some((row) => row.requestId === applied.body.requestId),
    ).toBe(true);
    expect(applicationHistory.body.items.some((row) => row.beforeRef?.revision === 2)).toBe(true);
    const management = ['organisation.manage', 'user.manage', 'role.manage'].map((action) => ({
      action,
      kind: 'ENTERPRISE_ALL',
      enterpriseRef: enterprise,
      departmentRefs: [],
      siteRefs: [],
    }));
    const designateInput = {
      meta: meta(1),
      accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'customer', revision: 1 },
      basisRefs: [syntheticBasis],
      label: '명시적 최초 관리',
      actionScopes: management,
    };
    // AC1.2.3: approval permission has no designation authority.
    expect(
      (
        await command(
          staff,
          '/enterprises/' + enterprise.id + '/initial-administrator-designations',
          designateInput,
          1,
        )
      ).response.status,
    ).toBe(403);
    expect(await store.list('EnterpriseMembership')).toHaveLength(0);
    await staffRole(['enterprise.initial-administrator.designate']);
    // AC1.2.1: separate confirmation and original protected linkage/history.
    const designated = await command(
      staff,
      '/enterprises/' + enterprise.id + '/initial-administrator-designations',
      { ...designateInput, meta: meta(1) },
      1,
    );
    expect(designated.response.status).toBe(202);
    expect(
      (await store.list('AccessHistory')).some(
        (value) => value.afterRef && (value.afterRef as Ref).entity === 'Enterprise',
      ),
    ).toBe(true);
    expect(
      (await store.list('CustomerRole')).every((role) => String(role.label) === '명시적 최초 관리'),
    ).toBe(true);
    const policy = await command(
      customer,
      '/enterprises/' + enterprise.id + '/ordering-context-policy-changes',
      { meta: meta(2), departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
      2,
    );
    expect(policy.response.status).toBe(202);
    const currentEnterprise = policy.body.targetRef!;
    const role = await command(
      customer,
      '/enterprises/' + enterprise.id + '/customer-roles',
      {
        meta: meta(),
        label: '별도 거래',
        actionScopes: ['product.read', 'order.submit', 'order.read'].map((action) => ({
          action,
          kind: 'ENTERPRISE_ALL',
          enterpriseRef: currentEnterprise,
          departmentRefs: [],
          siteRefs: [],
        })),
      },
      3,
    );
    expect(role.response.status).toBe(202);
    expect(
      (
        await command(
          customer,
          '/enterprises/' + enterprise.id + '/role-grant-changes',
          {
            meta: meta(),
            accountRef: {
              owner: 'IdentityRecovery',
              entity: 'Account',
              id: 'customer',
              revision: 1,
            },
            roleRef: role.body.targetRef,
            decision: 'GRANT',
          },
          3,
        )
      ).response.status,
    ).toBe(202);
    const product = await command(staff, '/products', {
      meta: meta(),
      productType: 'HARDWARE',
      softwareTermKind: null,
      label: '합성HW',
      salesDescription: '실제재고미확인',
      commonPrice: { currency: 'KRW', value: '100' },
      salesConditionRefs: [],
    });
    expect(product.response.status).toBe(202);
    const scope: TargetScope = {
      enterpriseRef: currentEnterprise,
      contextPolicyRef: currentEnterprise,
      organisationRevision: 3,
      departmentRef: null,
      siteRef: null,
    };
    const submitted = await command(customer, '/orders', {
      meta: meta(),
      targetScope: scope,
      productType: 'HARDWARE',
      lines: [1, 2, 3, 4].map((quantity) => ({
        productRef: product.body.targetRef,
        commonOfferRevisionRef: product.body.resultRefs.find(
          (value) => value.entity === 'CommonOfferRevision',
        ),
        agreementRevisionRef: null,
        quantity,
        paymentMode: 'PREPAY',
        requestedActivationDate: null,
      })),
      provisionChoice: 'FULL',
      partialConsentRef: null,
    });
    expect(submitted.response.status).toBe(202);
    expect(submitted.body.requestState).toBe('REVIEW_REQUIRED');
    // AC3.3.3: no judgment view without current independent staff action.
    const forbidden = await staff.request(
      '/orders/' + submitted.body.targetRef!.id + '/review-assessment',
    );
    expect(forbidden.response.status).toBe(403);
    expect(forbidden.body.data).toBeUndefined();
    await staffRole(['order.review.read']);
    const detail = await staff.request<{
      data: {
        acceptance: string;
        lines: { assessments: { sourceOwner: string; reasonKind: string; knowledge: string }[] }[];
      };
    }>('/orders/' + submitted.body.targetRef!.id + '/review-assessment');
    expect(detail.response.status).toBe(200);
    // AC3.3.1/2: all four reasons, four visible lines, known subset never becomes partial acceptance.
    expect(
      detail.body.data.lines.map(
        (line) =>
          line.assessments.find((value) => value.sourceOwner === 'HardwareFulfillment')!.reasonKind,
      ),
    ).toEqual(['UNVERIFIED', 'SPECIAL_CONDITION', 'CONFLICT', 'TECHNICAL_FAILURE']);
    expect(detail.body.data.lines).toHaveLength(4);
    expect(detail.body.data.acceptance).toBe('REVIEW_REQUIRED');
    expect(
      detail.body.data.lines[1]!.assessments.some((value) => value.knowledge === 'KNOWN'),
    ).toBe(true);
    expect(
      (await other.request('/orders/' + submitted.body.targetRef!.id + '/review-assessment'))
        .response.status,
    ).toBe(404);
    const ownHistory = await customer.request<{
      items: { evidenceRefs: Ref[]; actorAccountRef: Ref | null }[];
    }>('/orders/' + submitted.body.targetRef!.id + '/history');
    expect(ownHistory.response.status).toBe(200);
    expect(ownHistory.body.items).toHaveLength(1);
    expect(ownHistory.body.items[0]!.evidenceRefs).toEqual([]);
    expect(ownHistory.body.items[0]!.actorAccountRef).toBeNull();
    expect(
      (await other.request('/orders/' + submitted.body.targetRef!.id + '/history')).response.status,
    ).toBe(404);
    expect(
      (
        await customer.request(
          '/records/EnterpriseAccess/EnterpriseApplication/' +
            applied.body.targetRef!.id +
            '/history',
        )
      ).response.status,
    ).toBe(404);
  });
});
