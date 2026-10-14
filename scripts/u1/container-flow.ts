import { randomUUID } from 'node:crypto';
import type { Receipt, Ref } from '@oms/contracts';
import type { ContainerClient } from './container-client.js';
import { syntheticBasis } from '../../tests/u1/fixtures/enterprise.js';
export async function containerBusinessFlow(customer: ContainerClient, staff: ContainerClient) {
  const meta = (revision: number | null = null) => ({
    clientRequestId: randomUUID(),
    expectedRevision: revision,
    reason: '명시적 합성 4-role TLS 경로',
    evidenceRefs: [syntheticBasis],
  });
  async function command(
    client: ContainerClient,
    path: string,
    input: { meta: ReturnType<typeof meta> } & Record<string, unknown>,
    revision?: number,
  ) {
    const result = await client.request<Receipt>(path, input, {
      'Idempotency-Key': input.meta.clientRequestId,
      ...(revision ? { 'X-Target-Revision': String(revision) } : {}),
    });
    if (result.status !== 202)
      throw new Error('TLS 보호 command 실패 ' + path + ' status=' + result.status);
    return result.body;
  }
  await customer.authenticate('customer');
  await staff.authenticate('staff');
  const staffRole = await command(staff, '/staff-roles', {
    meta: meta(),
    label: '합성 TLS 승인/별도지정/상품',
    actions: [
      'application.read',
      'enterprise.approve',
      'enterprise.initial-administrator.designate',
      'product.register',
      'order.review.read',
    ],
  });
  await command(staff, '/staff-role-grant-changes', {
    meta: meta(),
    accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'staff', revision: 1 },
    roleRef: staffRole.targetRef,
    decision: 'GRANT',
  });
  const application = await command(customer, '/enterprise-applications', {
    meta: meta(),
    legalName: '명시적 컨테이너 합성 기업',
    designatedContact: 'container@example.invalid',
    registrationEvidenceRefs: [syntheticBasis],
  });
  const approval = await command(
    staff,
    '/enterprise-applications/' + application.targetRef!.id + '/decisions',
    {
      meta: meta(1),
      targetRef: application.targetRef,
      decision: 'APPROVE',
      basisRefs: [syntheticBasis],
    },
    1,
  );
  const enterprise = approval.resultRefs.find((value) => value.entity === 'Enterprise')!;
  await command(
    staff,
    '/enterprises/' + enterprise.id + '/initial-administrator-designations',
    {
      meta: meta(1),
      accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'customer', revision: 1 },
      basisRefs: [syntheticBasis],
      label: '별도 확인 최초 관리자',
      actionScopes: ['organisation.manage', 'user.manage', 'role.manage'].map((action) => ({
        action,
        kind: 'ENTERPRISE_ALL',
        enterpriseRef: enterprise,
        departmentRefs: [],
        siteRefs: [],
      })),
    },
    1,
  );
  const policy = await command(
    customer,
    '/enterprises/' + enterprise.id + '/ordering-context-policy-changes',
    { meta: meta(2), departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
    2,
  );
  const current = policy.targetRef!;
  const role = await command(
    customer,
    '/enterprises/' + enterprise.id + '/customer-roles',
    {
      meta: meta(),
      label: '명시적 별도 구매 범위',
      actionScopes: ['product.read', 'order.read', 'order.submit'].map((action) => ({
        action,
        kind: 'ENTERPRISE_ALL',
        enterpriseRef: current,
        departmentRefs: [],
        siteRefs: [],
      })),
    },
    3,
  );
  await command(
    customer,
    '/enterprises/' + enterprise.id + '/role-grant-changes',
    {
      meta: meta(),
      accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'customer', revision: 1 },
      roleRef: role.targetRef,
      decision: 'GRANT',
    },
    3,
  );
  const targetScope = {
    enterpriseRef: current,
    contextPolicyRef: current,
    organisationRevision: 3,
    departmentRef: null,
    siteRef: null,
  };
  const receipts: { requestId: string; targetRef: Ref; key: string; productType: string }[] = [];
  for (const productType of ['HARDWARE', 'SOFTWARE'] as const) {
    const product = await command(staff, '/products', {
      meta: meta(),
      productType,
      softwareTermKind: productType === 'SOFTWARE' ? 'TERM' : null,
      label: '합성 TLS ' + productType,
      salesDescription: '외부 공급/발급 미확인',
      commonPrice: { currency: 'KRW', value: '100' },
      salesConditionRefs: [],
    });
    const input = {
      meta: meta(),
      targetScope,
      productType,
      lines: [
        {
          productRef: product.targetRef,
          commonOfferRevisionRef: product.resultRefs.find(
            (value) => value.entity === 'CommonOfferRevision',
          ),
          agreementRevisionRef: null,
          quantity: 1,
          paymentMode: 'PREPAY',
          requestedActivationDate: productType === 'SOFTWARE' ? '2026-12-01' : null,
        },
      ],
      provisionChoice: 'FULL',
      partialConsentRef: null,
    };
    const order = await command(customer, '/orders', input);
    if (order.requestState !== 'REVIEW_REQUIRED')
      throw new Error('미등록 외부 owner를 공급 성공으로 바꿨습니다.');
    const original = await customer.request<{ requestId: string }>('/requests/' + order.requestId);
    if (original.status !== 200 || original.body.requestId !== order.requestId)
      throw new Error('TLS 원래 ACK ID 대조 실패');
    const duplicate = await command(customer, '/orders', input);
    if (duplicate.requestId !== order.requestId) throw new Error('TLS 동일 원래 key 중복 접수');
    receipts.push({
      requestId: order.requestId,
      targetRef: order.targetRef!,
      key: input.meta.clientRequestId,
      productType,
    });
  }
  return {
    applicationRequestId: application.requestId,
    enterpriseId: enterprise.id,
    orders: receipts,
  };
}
