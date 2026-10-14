import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import type { Receipt, Ref } from '@oms/contracts';
import { U3OwnerQuery, U3ProductCatalog, u3Ref } from '@oms/core';
import { OwnerDiagnostics, ProtectedStore } from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { prepareU3DiagnosticView, u3DiagnosticSource } from '../fixtures/diagnostics.js';
import { seedOrderChange } from '../fixtures/order-change.js';
import { catalogInput } from '../fixtures/catalog.js';
import { createU3Owners } from '../../../apps/api/src/u3-operations.js';
import { businessOperations } from '../../../apps/api/src/operations.js';
import { authenticationCall } from '../../../apps/api/src/authentication.js';
import type { ApiOwners } from '../../../apps/api/src/operations.js';
import {
  Assessments,
  NotificationDelivery,
  OrderAcceptance,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
} from '@oms/core';

describe('실제 보호 계약·효력·각 owner 이력·읽기 전용 진단', () => {
  const sources = u3Sources(),
    readonlySource = u3DiagnosticSource();
  let store: ProtectedStore,
    f: Awaited<ReturnType<typeof seedOrderChange>>,
    query: U3OwnerQuery,
    contractRef: Ref,
    product: Receipt,
    owners: ApiOwners;
  const ingress = 'synthetic-private-ingress';
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
    await prepareU3DiagnosticView(sources.primaryAdmin);
    await readonlySource.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    f = await seedOrderChange(store);
    const revision = (await store.currentProtected(
        'AgreementRevision',
        f.display.proposedTerms.termsRecordRef.id,
      ))!,
      contract = (await store.currentProtected(
        'EnterpriseContract',
        (revision.contractRef as Ref).id,
      ))!;
    contractRef = u3Ref('EnterpriseContract', contract, store.schema);
    product = await new U3ProductCatalog(
      store,
      f.seller.now,
      async (proof) => proof === ingress,
    ).register(await f.requestContext(f.registrant), catalogInput(f.offerRef), null, ingress);
    const diagnostics = new OwnerDiagnostics(
      readonlySource,
      'u1_verify_diagnostic_reader',
      new Set(['ProductCatalog', 'CommercialAgreement', 'OrderAcceptance']),
    );
    query = new U3OwnerQuery(
      store,
      f.seller.now,
      async (proof) => proof === ingress,
      f.agreement,
      diagnostics,
    );
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
      staffIngress: async (proof) => proof === ingress,
      evidence: f.agreement.basis.registration,
      diagnostics,
    });
  });
  afterAll(async () => {
    if (readonlySource.isInitialized) await readonlySource.destroy();
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  const recordInput = (targetRef = contractRef) => ({ targetRef, targetScope: f.targetScope });
  it('현재 승인 개정/조건을 정확 조회하고 list/단건 실제 registry3 출력도 같은 원본을 참조한다', async () => {
    const current = await query.effectiveAgreement(
      await f.requestContext(f.seller.customer),
      recordInput(),
    );
    expect(current).toMatchObject({
      knowledge: 'KNOWN',
      data: {
        enterpriseRef: f.targetScope.enterpriseRef,
        approvedRevisionRef: f.display.proposedTerms.termsRecordRef,
        commercialTermsRef: f.offerRef,
      },
    });
    const input = {
      targetRef: contractRef,
      scope: f.targetScope,
      cursor: null,
      pageSize: 25,
      sourceRevision: f.targetScope.enterpriseRef.revision,
    };
    expect(
      await query.readAgreement(
        await f.requestContext(f.seller.customer),
        f.targetScope.enterpriseRef,
        input,
      ),
    ).toMatchObject({ items: [{ knowledge: 'KNOWN', data: (current as { data: unknown }).data }] });
    const context = await f.requestContext(f.seller.customer);
    const result = await authenticationCall.run({ network: 'synthetic', ingress }, () =>
      businessOperations(owners).invoke('CommercialAgreement', 'effectiveAgreement', 3, {
        context,
        target: { kind: 'NONE' },
        data: recordInput(),
      }),
    );
    expect(result).toMatchObject({ knowledge: 'KNOWN', data: (current as { data: unknown }).data });
  });
  it('foreign/stale/누락 scope·외부망·위조 현재 권한은 계약 원본을 반환하지 않는다', async () => {
    await expect(
      query.effectiveAgreement(await f.requestContext(f.reviewer.customer), recordInput()),
    ).rejects.toThrow();
    await expect(
      query.effectiveAgreement(
        await f.requestContext(f.seller.customer),
        recordInput({ ...contractRef, revision: contractRef.revision - 1 }),
      ),
    ).rejects.toThrow();
    await expect(
      query.effectiveAgreement(await f.requestContext(f.seller.customer), {
        ...recordInput(),
        targetScope: null,
      }),
    ).rejects.toMatchObject({ code: 'U3_CUSTOMER_SCOPE' });
    await expect(
      query.effectiveAgreement(await f.requestContext(f.registrant), recordInput(), 'external'),
    ).rejects.toMatchObject({ code: 'STAFF_NETWORK_REQUIRED' });
    const context = await f.requestContext(f.seller.customer);
    context.identityAssertionRef = { ...context.identityAssertionRef, id: 'missing' };
    await expect(query.effectiveAgreement(context, recordInput())).rejects.toThrow();
  });
  it('세 owner의 실제 생성 이력을 sourceRevision 개정으로 읽고 customer projection은 신원/근거를 숨긴다', async () => {
    for (const [owner, reference] of [
      ['ProductCatalog', product.targetRef!],
      ['CommercialAgreement', contractRef],
      ['OrderAcceptance', f.orderRef],
    ] as const) {
      const result = (await query.history(
        await f.requestContext(f.registrant),
        owner,
        recordInput(reference),
        ingress,
      )) as { historyRefs: Ref[]; items: { sourceRevision: number; historyRef: Ref }[] };
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((item) => item.historyRef.revision === item.sourceRevision)).toBe(
        true,
      );
      expect(
        store.schema.validateUri('urn:oms:contract:u3-commercial:2#/$defs/HistoryView', result),
      ).toEqual(result);
      await expect(
        query.history(
          await f.requestContext(f.seller.customer),
          owner,
          recordInput({ ...reference, revision: reference.revision + 1 }),
        ),
      ).rejects.toThrow();
    }
    const customer = (await query.history(
      await f.requestContext(f.seller.customer),
      'OrderAcceptance',
      recordInput(f.orderRef),
    )) as { items: unknown[] };
    expect(customer.items).toMatchObject([
      { actorAccountRef: null, verifiedPersonRef: null, evidenceRefs: [] },
    ]);
    await expect(
      query.history(
        await f.requestContext(f.reviewer.customer),
        'OrderAcceptance',
        recordInput(f.orderRef),
      ),
    ).rejects.toThrow();
  });
  it('실제 readonly role의 metadata만 PARTIAL로 대조하고 ACK/업무 성공을 추정하거나 원본을 쓰지 않는다', async () => {
    const input = {
      owner: 'ProductCatalog',
      requestRefs: [product.requestId],
      factRefs: [],
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T00:00:00.000Z',
    };
    const before = canonicalJson(await store.currentProtected('Product', product.targetRef!.id));
    expect(
      await query.diagnostic(
        await f.requestContext(f.registrant),
        'ProductCatalog',
        input,
        ingress,
      ),
    ).toMatchObject({
      coverage: 'PARTIAL',
      acknowledgedRequestRefs: [],
      storedReceiptRefs: [{ id: product.requestId }],
    });
    expect((await readonlySource.query('SELECT current_user AS role'))[0].role).toBe(
      'u1_verify_diagnostic_reader',
    );
    await expect(readonlySource.query('DELETE FROM u1_request_receipt')).rejects.toMatchObject({
      driverError: { code: '42501' },
    });
    expect(canonicalJson(await store.currentProtected('Product', product.targetRef!.id))).toBe(
      before,
    );
    const writer = new U3OwnerQuery(
      store,
      f.seller.now,
      async () => true,
      f.agreement,
      new OwnerDiagnostics(sources.primaryApp, 'u3_verify_app', new Set(['ProductCatalog'])),
    );
    await expect(
      writer.diagnostic(await f.requestContext(f.registrant), 'ProductCatalog', input, ingress),
    ).rejects.toMatchObject({ code: 'DIAGNOSTIC_READER_REQUIRED' });
    const unregistered = new U3OwnerQuery(store, f.seller.now, async () => true, f.agreement);
    await expect(
      unregistered.diagnostic(
        await f.requestContext(f.registrant),
        'ProductCatalog',
        input,
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'U3_DIAGNOSTIC_NOT_REGISTERED' });
    await expect(
      query.diagnostic(await f.requestContext(f.registrant), 'OrderAcceptance', input, ingress),
    ).rejects.toMatchObject({ code: 'DIAGNOSTIC_SCOPE' });
    await expect(
      query.diagnostic(
        await f.requestContext(f.registrant),
        'ProductCatalog',
        { ...input, requestRefs: [f.consent.requestId] },
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'DIAGNOSTIC_REQUEST_OWNER' });
  });
});
