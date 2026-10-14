import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { InvocationTarget, Receipt, ServiceContext } from '@oms/contracts';
import {
  Assessments,
  NotificationDelivery,
  OrderAcceptance,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
} from '@oms/core';
import { ProtectedStore } from '@oms/persistence';
import { businessOperations } from '../../../apps/api/src/operations.js';
import type { ApiOwners } from '../../../apps/api/src/operations.js';
import { createU3Owners } from '../../../apps/api/src/u3-operations.js';
import { authenticationCall } from '../../../apps/api/src/authentication.js';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedU3CommandAuthority } from '../fixtures/command-authority.js';
import { consentRoleInput } from '../fixtures/consent-role.js';
import { fixtureMeta } from '../fixtures/commercial.js';

describe('명시 U3 in-process host와 실제 C01→현재 C18 참조 왕복', () => {
  const sources = u3Sources();
  let store: ProtectedStore,
    f: Awaited<ReturnType<typeof seedU3CommandAuthority>>,
    owners: ApiOwners;
  const meta = (revision: number | null = null) => ({
    ...fixtureMeta(revision),
    clientRequestId: randomUUID(),
  });
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    f = await seedU3CommandAuthority(store);
    owners = {
      store,
      identity: f.identity,
      enterprise: f.access,
      catalog: new ProductCatalog(store, f.now),
      orders: new OrderAcceptance(store, new Assessments(f.now), f.now),
      staff: new StaffAccess(store, f.now),
      inquiry: new WorkInquiry(store, f.now),
      notices: new NotificationDelivery(store, f.now),
      now: f.now,
    };
    owners.u3 = createU3Owners(owners, {
      staffIngress: async (proof) => proof === 'synthetic-private-ingress',
    });
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  async function invoke(
    owner: string,
    operation: string,
    audience: 'CUSTOMER' | 'STAFF',
    data: unknown,
    target: InvocationTarget = { kind: 'NONE' },
    ingress: unknown = 'synthetic-private-ingress',
    context?: ServiceContext,
  ) {
    const current = context ?? (await f.authenticateRequest(audience));
    return authenticationCall.run({ network: 'synthetic-peer', ingress }, () =>
      businessOperations(owners).invoke(owner, operation, 3, { context: current, target, data }),
    );
  }
  it('현재 동의 역할 생성/목록의 명시 범위와 새 ScopeV2 원래 접수·probe를 연결한다', async () => {
    const input = consentRoleInput(f.enterpriseRef),
      target: InvocationTarget = { kind: 'ENTERPRISE', enterpriseRef: f.enterpriseRef },
      created = (await invoke(
        'EnterpriseAccess',
        'defineCustomerRole',
        'CUSTOMER',
        input,
        target,
      )) as Receipt;
    expect(created.resultRefs.some((reference) => reference.entity === 'ScopeV2')).toBe(true);
    const read = await invoke(
      'WorkInquiry',
      'readReceipt',
      'CUSTOMER',
      { requestId: created.requestId },
      { kind: 'REQUEST', requestId: created.requestId },
    );
    expect(read).toEqual(created);
    const lookup = {
      owner: 'EnterpriseAccess',
      operation: 'defineCustomerRole',
      target,
      clientRequestId: input.meta.clientRequestId,
    };
    expect(await invoke('WorkInquiry', 'lookupOriginalReceipt', 'CUSTOMER', lookup)).toEqual(
      created,
    );
    expect(await invoke('WorkInquiry', 'probeOriginalReceipt', 'CUSTOMER', lookup)).toMatchObject({
      disposition: 'RECEIPT',
      receipt: created,
    });
    expect(
      await invoke(
        'EnterpriseAccess',
        'readCustomerRoles',
        'CUSTOMER',
        { enterpriseRef: f.enterpriseRef, cursor: null, pageSize: 25 },
        target,
      ),
    ).toMatchObject({
      viewKind: 'CONSENT_ROLES',
      items: [{ roleRef: created.targetRef, modelVersion: 2 }],
    });
    await expect(
      businessOperations(owners).invoke('WorkInquiry', 'readReceipt', 2, {
        context: await f.authenticateRequest('CUSTOMER'),
        data: { requestId: created.requestId },
        target: { kind: 'REQUEST', requestId: created.requestId },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PRODUCER' });
  });
  it('실제 현재 grant/revoke 생산자를 새 접수 계약에 연결하며 다른 요청자·위조 MFA는 접수를 읽지 못한다', async () => {
    const target: InvocationTarget = { kind: 'ENTERPRISE', enterpriseRef: f.enterpriseRef },
      created = (await invoke(
        'EnterpriseAccess',
        'defineCustomerRole',
        'CUSTOMER',
        consentRoleInput(f.enterpriseRef),
        target,
      )) as Receipt;
    const input = {
      meta: meta(),
      accountRef: f.customer.actorAccountRef,
      roleRef: created.targetRef,
      decision: 'GRANT',
    };
    const granted = (await invoke(
      'EnterpriseAccess',
      'grantCustomerRole',
      'CUSTOMER',
      input,
      target,
    )) as Receipt;
    expect(
      await invoke(
        'WorkInquiry',
        'readReceipt',
        'CUSTOMER',
        { requestId: granted.requestId },
        { kind: 'REQUEST', requestId: granted.requestId },
      ),
    ).toEqual(granted);
    const revoked = (await invoke(
      'EnterpriseAccess',
      'grantCustomerRole',
      'CUSTOMER',
      { ...input, meta: meta(1), decision: 'REVOKE' },
      target,
    )) as Receipt;
    expect(revoked.requestId).not.toBe(granted.requestId);
    const wrong = await f.authenticateRequest('CUSTOMER');
    wrong.principalId = 'another';
    await expect(
      invoke(
        'WorkInquiry',
        'readReceipt',
        'CUSTOMER',
        { requestId: created.requestId },
        { kind: 'REQUEST', requestId: created.requestId },
        null,
        wrong,
      ),
    ).rejects.toThrow();
    const mfa = await f.authenticateRequest('CUSTOMER');
    mfa.identityAssertionRef = { ...mfa.identityAssertionRef, id: 'unregistered-session' };
    await expect(
      invoke(
        'WorkInquiry',
        'readReceipt',
        'CUSTOMER',
        { requestId: created.requestId },
        { kind: 'REQUEST', requestId: created.requestId },
        null,
        mfa,
      ),
    ).rejects.toThrow();
  });
  it('직원 역할·현재 접수는 내부망 proof가 필요하고 unknown 작업은 보호 이력 없이 실패한다', async () => {
    const input = { meta: meta(), label: '합성 현재 역할', actions: ['order.change.apply'] };
    await expect(
      invoke('EnterpriseAccess', 'defineStaffRole', 'STAFF', input, { kind: 'NONE' }, 'external'),
    ).rejects.toMatchObject({ code: 'STAFF_NETWORK_REQUIRED' });
    const created = (await invoke(
      'EnterpriseAccess',
      'defineStaffRole',
      'STAFF',
      input,
    )) as Receipt;
    expect(
      await invoke(
        'WorkInquiry',
        'readReceipt',
        'STAFF',
        { requestId: created.requestId },
        { kind: 'REQUEST', requestId: created.requestId },
      ),
    ).toEqual(created);
    expect(
      await invoke('EnterpriseAccess', 'readStaffRoles', 'STAFF', { cursor: null, pageSize: 25 }),
    ).toBeTruthy();
    await expect(invoke('CommercialAgreement', 'unregistered', 'STAFF', {})).rejects.toMatchObject({
      code: 'MODULE_NOT_REGISTERED',
    });
    await expect(
      invoke('EnterpriseAccess', 'defineStaffRole', 'STAFF', { ...input, profile: 'client' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('활성 U3 host의 구형 상업 변경은 차단하고 비활성 구성의 기존 등록은 보존한다', async () => {
    const input = {
        meta: meta(),
        productType: 'HARDWARE',
        softwareTermKind: null,
        label: '합성 구형 상품',
        salesDescription: '구형 입력',
        commonPrice: { currency: 'KRW', value: '1000' },
        salesConditionRefs: [],
      },
      invocation = {
        context: await f.authenticateRequest('STAFF'),
        data: input,
        target: { kind: 'NONE' } as const,
      };
    await expect(
      businessOperations(owners).invoke('ProductCatalog', 'registerProduct', 2, invocation),
    ).rejects.toMatchObject({ code: 'U3_LEGACY_MUTATION_BLOCKED' });
    const legacy = { ...owners, u3: undefined };
    expect(businessOperations(legacy).lookup('ProductCatalog', 'registerProduct', 2).version).toBe(
      2,
    );
    expect(() =>
      businessOperations(legacy).lookup('ProductCatalog', 'registerProduct', 3),
    ).toThrow();
    expect(await store.list('Product')).toHaveLength(0);
  });
});
