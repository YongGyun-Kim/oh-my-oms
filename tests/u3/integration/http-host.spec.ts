import { randomBytes, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import type { Receipt, Ref, U3OrderInput, U3OrderView, U3ProposalView } from '@oms/contracts';
import {
  Assessments,
  NotificationDelivery,
  OrderAcceptance,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
} from '@oms/core';
import { ProtectedStore } from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import { createApi } from '../../../apps/api/src/application.js';
import type { ApiOwners } from '../../../apps/api/src/operations.js';
import { createU3Owners } from '../../../apps/api/src/u3-operations.js';
import { u3PersonContext } from '../../../apps/api/src/u3-person-context.js';
import { SyntheticHttpClient } from '../../u1/fixtures/http-client.js';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedOrderChange } from '../fixtures/order-change.js';
import { syntheticCommercialEvidence } from '../fixtures/agreement.js';
import { registeredOrderInput } from '../fixtures/order-input.js';
import { consentRoleInput } from '../fixtures/consent-role.js';

// password/MFA·권한·보호 저장은 실제 경로로 실행한다. 외부 소유자 원본은 로컬 합성이다.
describe('명시 U3 HTTP host·실제 세션·유한 raw JSON 경계', () => {
  const sources = u3Sources(),
    customerOrigin = 'http://127.0.0.1:34701',
    staffOrigin = 'http://127.0.0.1:34702';
  let store: ProtectedStore,
    f: Awaited<ReturnType<typeof seedOrderChange>>,
    owners: ApiOwners,
    customerHost: Awaited<ReturnType<typeof createApi>> | undefined,
    staffHost: Awaited<ReturnType<typeof createApi>> | undefined,
    customer: SyntheticHttpClient,
    staff: SyntheticHttpClient,
    staffAllowed: boolean,
    removedBootstrapLinks: ModelData[];
  const safeStatus = (status: number, body: unknown) =>
    JSON.stringify({
      status,
      errorType:
        body &&
        typeof body === 'object' &&
        'type' in body &&
        typeof body.type === 'string' &&
        /^urn:oms:problem:[a-z0-9_-]{1,128}$/.test(body.type)
          ? body.type
          : 'NON_PROBLEM',
    });
  const query = (path: string, input: unknown) =>
    path + '?query=' + encodeURIComponent(JSON.stringify(input));
  const headers = (input: { meta: { clientRequestId: string } }, revision?: number) => ({
    'Idempotency-Key': input.meta.clientRequestId,
    ...(revision === undefined ? {} : { 'X-Target-Revision': String(revision) }),
  });
  const padded = (input: unknown, limit: number) => {
    const json = JSON.stringify(input);
    if (Buffer.byteLength(json) > limit) throw new Error('유한 합성 입력의 크기를 확인하세요.');
    return json + ' '.repeat(limit - Buffer.byteLength(json));
  };
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await customerHost?.app.close();
    await staffHost?.app.close();
    customerHost = staffHost = undefined;
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    f = await seedOrderChange(store);
    // 공용 bootstrap은 미확인 링크를 만들고 U3 fixture는 별도 확인 링크를 만든다.
    // HTTP 정상 준비에서 정확한 미확인 bootstrap만 명시 보호 삭제한다. 운영 정리 기능이 아니다.
    removedBootstrapLinks = [];
    for (const actor of [f.registrant, f.approver]) {
      const bootstrapId = actor.principalId + '-person-link',
        bootstrap = (await store.currentProtected('VerifiedPersonLink', bootstrapId))!,
        confirmed = (await store.currentProtected(
          'VerifiedPersonLink',
          actor.verifiedPersonRef!.id,
        ))!,
        checks = await store.list('PersonVerification', {
          equals: { personLinkRef: { id: bootstrapId } },
          limit: 2,
        }),
        rawChecks = await sources.primaryApp.query(
          'SELECT count(*)::integer AS count FROM u1_person_verification WHERE "personLinkRef"->>\'id\'=$1',
          [bootstrapId],
        );
      expect(bootstrap.personLinkId).toBe(bootstrapId);
      expect(bootstrap.accountRefs).toEqual([actor.actorAccountRef]);
      expect(confirmed.personLinkId).toBe(actor.verifiedPersonRef!.id);
      expect(confirmed.accountRefs).toEqual([actor.actorAccountRef]);
      expect(
        f.personChecks.some(
          (check) =>
            canonicalJson(check.personLinkRef) === canonicalJson(actor.verifiedPersonRef) &&
            check.state === 'CONFIRMED',
        ),
      ).toBe(true);
      expect(checks).toHaveLength(0);
      expect(rawChecks[0].count).toBe(0);
      await store.execute(
        {
          principalId: 'synthetic-http-link-preparation',
          audience: 'SYSTEM',
          owner: 'IdentityRecovery',
          operation: 'fixture-http-remove-unverified-bootstrap-link',
          target: null,
          input: {
            synthetic: true,
            bootstrapRef: {
              owner: 'IdentityRecovery',
              entity: 'VerifiedPersonLink',
              id: bootstrapId,
              revision: bootstrap.revision,
            },
          },
          idempotencyKey: randomUUID(),
          correlationId: randomUUID(),
          epoch: await store.currentEpoch(),
        },
        async (tx) => {
          expect(canonicalJson(await tx.get('VerifiedPersonLink', bootstrapId))).toBe(
            canonicalJson(bootstrap),
          );
          await tx.remove('VerifiedPersonLink', bootstrapId, Number(bootstrap.revision));
        },
      );
      removedBootstrapLinks.push(bootstrap);
      expect(await store.read('VerifiedPersonLink', bootstrapId)).toBeNull();
      expect(
        canonicalJson(
          await store.readRevision('VerifiedPersonLink', bootstrapId, Number(bootstrap.revision)),
        ),
      ).toBe(canonicalJson(bootstrap));
    }
    staffAllowed = true;
    owners = {
      store,
      identity: f.seller.identity,
      enterprise: f.seller.access,
      catalog: new ProductCatalog(store, f.seller.now),
      orders: new OrderAcceptance(store, new Assessments(f.seller.now), f.seller.now),
      staff: new StaffAccess(store, f.seller.now),
      inquiry: new WorkInquiry(store, f.seller.now),
      notices: new NotificationDelivery(store, f.seller.now),
      now: f.seller.now,
    };
    owners.u3 = createU3Owners(owners, {
      staffIngress: async (proof) => proof === f.ingress,
      evidence: syntheticCommercialEvidence,
      readiness: f.registrations(),
    });
    customerHost = await createApi(owners, {
      audience: 'CUSTOMER',
      origin: customerOrigin,
      cookieKey: randomBytes(32),
      localSynthetic: true,
      staffAdmission: async () => null,
    });
    staffHost = await createApi(owners, {
      audience: 'STAFF',
      origin: staffOrigin,
      cookieKey: randomBytes(32),
      localSynthetic: true,
      staffAdmission: async () => (staffAllowed ? f.ingress : null),
    });
    await customerHost.app.listen(34701, '127.0.0.1');
    await staffHost.app.listen(34702, '127.0.0.1');
    customer = new SyntheticHttpClient(customerOrigin);
    staff = new SyntheticHttpClient(staffOrigin);
  });
  afterAll(async () => {
    await customerHost?.app.close();
    await staffHost?.app.close();
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  async function raw(
    client: SyntheticHttpClient,
    path: string,
    body: string | Buffer,
    extra: Record<string, string> = {},
  ) {
    const csrf = await client.request('/security/csrf');
    expect(csrf.response.status).toBe(200);
    const response = await fetch(client.origin + path, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Cookie: client
          .cookieSnapshot()
          .map(({ name, value }) => name + '=' + value)
          .join('; '),
        Origin: client.origin,
        'X-CSRF-Token': csrf.body.csrfToken,
        'Content-Type': 'application/json',
        ...extra,
      },
      body: typeof body === 'string' ? body : new Blob([new Uint8Array(body)]),
    });
    return { response, body: (await response.json()) as Record<string, unknown> };
  }
  async function submission(): Promise<U3OrderInput> {
    const resolved = await owners.u3!.agreement.resolve(await f.requestContext(f.seller.customer), {
        targetScope: f.targetScope,
        productRef: f.productRef,
        commonOfferRevisionRef: f.offerRef,
      }),
      price = resolved.conditionBindings.find((binding) => binding.conditionKey === 'PRICE');
    if (!price || price.conditionKey !== 'PRICE') throw new Error('현재 확인 가격이 필요합니다.');
    return registeredOrderInput('submitOrder', {
      ...structuredClone(f.input),
      meta: f.meta(),
      lines: [
        {
          ...structuredClone(f.input.lines[0]!),
          agreementRevisionRefs: resolved.agreementRevisionRefs,
          conditionBindings: resolved.conditionBindings,
        },
      ],
      priceConfirmation: {
        confirmedByRef: f.registrant.actorAccountRef!,
        evidenceRefs: f.evidence,
        priceBreakdown: {
          lineAmounts: [structuredClone(price.value)],
          productAmount: structuredClone(price.value),
          adjustments: [],
          total: structuredClone(price.value),
          knowledge: 'KNOWN',
        },
      },
    });
  }
  it('정확1MiB 주문·조건 적용은 보호202/원래 결과 재시도·현재 조회와 스냅샷 불변을 연결한다', async () => {
    await customer.authenticate(f.seller.customer.principalId);
    await staff.authenticate(f.registrant.principalId);
    const input = await submission(),
      rawInput = padded(input, 1048576),
      submitted = await raw(customer, '/orders', rawInput, headers(input));
    expect(submitted.response.status).toBe(202);
    const receipt = store.schema.validateUri<Receipt>(
      customerHost!.registry.lookup('OrderAcceptance', 'submitOrder', 3).output,
      submitted.body,
    );
    expect((await raw(customer, '/orders', rawInput, headers(input))).body).toEqual(receipt);
    const current = await customer.request<{ data: U3OrderView }>(
      query('/orders/' + receipt.targetRef!.id, {
        targetRef: receipt.targetRef,
        targetScope: f.targetScope,
      }),
      undefined,
      { 'X-Target-Revision': String(receipt.targetRef!.revision) },
    );
    expect(current.response.status).toBe(200);
    expect(current.body.data.priceBreakdown!.total!.value).toBe('900');
    store.schema.validateUri(
      customerHost!.registry.lookup('OrderAcceptance', 'readAcceptedOrder', 3).output,
      current.body,
    );
    const originalOrder = (await store.currentProtected('Order', f.orderRef.id))!,
      snapshotRef = originalOrder.purchaseTermsRef as Ref,
      snapshot = canonicalJson(
        await store.currentProtected('PurchaseTermsSnapshot', snapshotRef.id),
      ),
      change = f.application(),
      applied = await raw(
        staff,
        '/order-condition-applications',
        padded(change, 1048576),
        headers(change),
      );
    expect(applied.response.status, safeStatus(applied.response.status, applied.body)).toBe(202);
    const appliedReceipt = store.schema.validateUri<Receipt>(
      staffHost!.registry.lookup('OrderAcceptance', 'applyApprovedChange', 3).output,
      applied.body,
    );
    expect(
      (await raw(staff, '/order-condition-applications', padded(change, 1048576), headers(change)))
        .body,
    ).toEqual(appliedReceipt);
    expect((await staff.request('/requests/' + appliedReceipt.requestId)).body).toEqual(
      appliedReceipt,
    );
    const updated = await customer.request<{ data: U3OrderView }>(
      query('/orders/' + f.orderRef.id, {
        targetRef: appliedReceipt.targetRef,
        targetScope: f.targetScope,
      }),
      undefined,
      { 'X-Target-Revision': String(appliedReceipt.targetRef!.revision) },
    );
    expect(updated.response.status).toBe(200);
    expect(updated.body.data.appliedTerms!.priceBreakdown.total!.value).toBe('900');
    expect(updated.body.data.lines[0]!.purchasePrice.value).toBe('1000');
    expect(
      canonicalJson(await store.currentProtected('PurchaseTermsSnapshot', snapshotRef.id)),
    ).toBe(snapshot);
  });
  it('실제 직원 로그인에서 현재 보호 person-link를 연결해 제안·현재 고객 동의·정확 출력 계약을 실행한다', async () => {
    await staff.authenticate(f.registrant.principalId);
    await customer.authenticate(f.seller.customer.principalId);
    const input = await submission(),
      submitted = await customer.request<Receipt>('/orders', input, headers(input));
    expect(submitted.response.status).toBe(202);
    const proposalInput = await f.proposalInput(submitted.body.targetRef!),
      created = await staff.request<Receipt>(
        '/commercial-proposals',
        proposalInput,
        headers(proposalInput),
      );
    expect(created.response.status, safeStatus(created.response.status, created.body)).toBe(202);
    const history = await store.list('AgreementHistory', {
      equals: { requestId: created.body.requestId },
      limit: 2,
    });
    expect(history).toHaveLength(1);
    expect(history[0]!.actorAccountRef).toEqual(f.registrant.actorAccountRef);
    expect(history[0]!.verifiedPersonRef).toEqual(f.registrant.verifiedPersonRef);
    const display = await customer.request<{ data: U3ProposalView }>(
      query('/commercial-proposals/' + created.body.targetRef!.id, {
        targetRef: created.body.targetRef,
        targetScope: f.targetScope,
      }),
      undefined,
      { 'X-Target-Revision': String(created.body.targetRef!.revision) },
    );
    expect(display.response.status).toBe(200);
    const consent = {
        meta: f.meta(created.body.targetRef!.revision),
        targetScope: f.targetScope,
        proposalRef: created.body.targetRef!,
        proposalRevision: display.body.data.proposalRevision,
        termsFingerprint: display.body.data.termsFingerprint,
        decision: 'ACCEPT',
      },
      accepted = await customer.request<Receipt>(
        '/commercial-proposals/' + created.body.targetRef!.id + '/consents',
        consent,
        headers(consent, created.body.targetRef!.revision),
      );
    expect(accepted.response.status).toBe(202);
    store.schema.validateUri(
      customerHost!.registry.lookup('CommercialAgreement', 'recordConsent', 3).output,
      accepted.body,
    );
    expect((await customer.request('/requests/' + accepted.body.requestId)).body).toEqual(
      accepted.body,
    );
  });
  it('정확64KiB 동의 역할 생성과 ScopeV2 접수/probe·CONSENT_ROLES 목록이 registry3로 왕복한다', async () => {
    await customer.authenticate(f.seller.customer.principalId);
    const input = consentRoleInput(f.seller.enterpriseRef),
      path = '/u3/enterprises/' + f.seller.enterpriseRef.id + '/consent-roles',
      result = await raw(
        customer,
        path,
        padded(input, 65536),
        headers(input, f.seller.enterpriseRef.revision),
      );
    expect(result.response.status).toBe(202);
    const receipt = store.schema.validateUri<Receipt>(
      customerHost!.registry.lookup('EnterpriseAccess', 'defineCustomerRole', 3).output,
      result.body,
    );
    expect(receipt.resultRefs.some((reference) => reference.entity === 'ScopeV2')).toBe(true);
    expect((await customer.request('/requests/' + receipt.requestId)).body).toEqual(receipt);
    const original = {
      owner: 'EnterpriseAccess',
      operation: 'defineCustomerRole',
      target: { kind: 'ENTERPRISE', enterpriseRef: f.seller.enterpriseRef },
      clientRequestId: input.meta.clientRequestId,
    };
    expect((await customer.request(query('/requests/original', original))).body).toEqual(receipt);
    expect(
      (await customer.request(query('/requests/original-probe', original))).body,
    ).toMatchObject({ disposition: 'RECEIPT', receipt });
    const listed = await customer.request<{
      viewKind: string;
      items: { roleRef: Ref; modelVersion: number }[];
    }>(
      query(path, { enterpriseRef: f.seller.enterpriseRef, cursor: null, pageSize: 25 }),
      undefined,
      { 'X-Target-Revision': String(f.seller.enterpriseRef.revision) },
    );
    expect(listed.response.status).toBe(200);
    expect(listed.body.viewKind).toBe('CONSENT_ROLES');
    expect(
      listed.body.items.some(
        (item) =>
          canonicalJson(item.roleRef) === canonicalJson(receipt.targetRef) &&
          item.modelVersion === 2,
      ),
    ).toBe(true);
  });
  it('초과raw byte·잘못된 JSON·압축·다른 Content-Type은 인증/업무 전에 거절하고 접수하지 않는다', async () => {
    const receipts = await sources.primaryApp.getRepository('RequestReceipt').count();
    for (const [path, limit] of [
      ['/orders', 1048576],
      ['/order-condition-applications', 1048576],
      ['/u3/enterprises/' + f.seller.enterpriseRef.id + '/consent-roles', 65536],
    ] as const) {
      expect((await raw(customer, path, '[' + ' '.repeat(limit - 1))).response.status).toBe(400);
      expect((await raw(customer, path, '[' + ' '.repeat(limit))).response.status).toBe(413);
    }
    expect(
      (await raw(customer, '/orders', gzipSync(Buffer.from('{}')), { 'Content-Encoding': 'gzip' }))
        .response.status,
    ).toBe(415);
    expect(
      (await raw(customer, '/orders', '{}', { 'Content-Type': 'text/plain' })).response.status,
    ).toBe(415);
    expect(await sources.primaryApp.getRepository('RequestReceipt').count()).toBe(receipts);
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
  });
  it('현재 MFA·CSRF·직원 내부망·서버 버전·고정 대상/기업 경계를 우회할 수 없다', async () => {
    const input = await submission();
    await customer.refreshCsrf();
    expect((await customer.request('/orders', input, headers(input))).response.status).toBe(401);
    await customer.authenticate(f.seller.customer.principalId);
    await staff.authenticate(f.registrant.principalId);
    expect(
      (await customer.request('/orders', input, { ...headers(input), 'X-CSRF-Token': 'wrong' }))
        .response.status,
    ).toBe(403);
    expect(
      (
        await customer.request('/orders', input, {
          ...headers(input),
          Origin: 'https://other.invalid',
        })
      ).response.status,
    ).toBe(403);
    for (const field of ['X-Registry-Version', 'X-MFA-Verified', 'X-Operation'])
      expect(
        (await customer.request('/orders', input, { ...headers(input), [field]: '2' })).response
          .status,
      ).toBe(400);
    expect(
      (await customer.request('/orders', { ...input, version: 2 }, headers(input))).response.status,
    ).toBe(400);
    expect(
      (
        await staff.request('/products', {
          meta: f.meta(),
          productType: 'HARDWARE',
          softwareTermKind: null,
          label: '구형 입력',
          salesDescription: '합성',
          commonPrice: { currency: 'KRW', value: '1000' },
          salesConditionRefs: [],
        })
      ).response.status,
    ).toBe(400);
    const path = '/orders/' + f.orderRef.id;
    expect(
      (
        await customer.request(
          query(path, { targetRef: { ...f.orderRef, id: 'wrong' }, targetScope: f.targetScope }),
          undefined,
          { 'X-Target-Revision': '1' },
        )
      ).response.status,
    ).toBe(400);
    expect(
      (await customer.request(query(path, { targetRef: f.orderRef, targetScope: f.targetScope })))
        .response.status,
    ).toBe(400);
    const foreign = {
      ...f.targetScope,
      enterpriseRef: f.reviewer.enterpriseRef,
      contextPolicyRef: f.reviewer.enterpriseRef,
      organisationRevision: f.reviewer.enterpriseRef.revision,
    };
    expect(
      (
        await customer.request(
          query(path, { targetRef: f.orderRef, targetScope: foreign }),
          undefined,
          { 'X-Target-Revision': '1' },
        )
      ).response.status,
    ).toBe(404);
    staffAllowed = false;
    const change = f.application();
    expect(
      (await staff.request('/order-condition-applications', change, headers(change))).response
        .status,
    ).toBe(403);
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
    expect(
      await store.list('RequestReceipt', {
        equals: { idempotencyKey: input.meta.clientRequestId },
      }),
    ).toHaveLength(0);
  });
  it('현재 보호된 사람 연결은 실제 계정 개정/목적을 대조하고 primary-only 변조를 신원으로 승격하지 않는다', async () => {
    const context = await f.seller.authenticateRequest('STAFF'),
      bound = await u3PersonContext(
        store,
        context,
        f.seller.now,
        syntheticCommercialEvidence.personPurpose,
      );
    expect(context.verifiedPersonRef).toBeNull();
    expect(bound.verifiedPersonRef).toEqual(f.registrant.verifiedPersonRef);
    await expect(
      u3PersonContext(store, context, f.seller.now, 'WRONG_PURPOSE'),
    ).rejects.toMatchObject({ code: 'U3_PERSON_CHECK_UNCONFIRMED' });
    const bootstrap = removedBootstrapLinks.find(
      (link) => canonicalJson(link.accountRefs) === canonicalJson([context.actorAccountRef]),
    )!;
    const duplicate: ModelData & { personLinkId: string } = {
      ...bootstrap,
      personLinkId: randomUUID(),
    };
    await store.execute(
      {
        principalId: 'synthetic-http-duplicate-person-link',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-http-duplicate-current-link',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put('VerifiedPersonLink', duplicate);
      },
    );
    await expect(
      u3PersonContext(
        store,
        await f.seller.authenticateRequest('STAFF'),
        f.seller.now,
        syntheticCommercialEvidence.personPurpose,
      ),
    ).rejects.toMatchObject({ code: 'U3_PERSON_LINK_AMBIGUOUS' });
    await store.execute(
      {
        principalId: 'synthetic-http-duplicate-person-link',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-http-remove-duplicate-current-link',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.remove('VerifiedPersonLink', duplicate.personLinkId, Number(duplicate.revision));
      },
    );
    await sources.primaryAdmin.query(
      'UPDATE u1_verified_person_link SET "verifiedAt"=$1 WHERE "personLinkId"=$2',
      [new Date(0).toISOString(), f.registrant.verifiedPersonRef!.id],
    );
    await expect(
      u3PersonContext(
        store,
        await f.seller.authenticateRequest('STAFF'),
        f.seller.now,
        syntheticCommercialEvidence.personPurpose,
      ),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
  });
});
