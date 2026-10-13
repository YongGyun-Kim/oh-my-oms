import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import type { Ref, U3ProductInput } from '@oms/contracts';
import { CommercialAgreement, U3CatalogQuery, U3ProductCatalog } from '@oms/core';
import { ProtectedStore, U3_SOURCE_CONTRACT } from '@oms/persistence';
import { buildCommonOffer } from '../../../packages/core/src/catalog-conditions.js';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedU3CommandAuthority } from '../fixtures/command-authority.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';
import { catalogInput } from '../fixtures/catalog.js';
import { fixtureScope } from '../fixtures/identity.js';
import { syntheticCommercialEvidence } from '../fixtures/agreement.js';

// 기존 공통 판매 정보 원본을 합성 등록한다. 실제 고객 계약/외부 이행의 근거가 아니다.
describe('U3 상품 실제 저장·현재 조건·권한 경계', () => {
  const sources = u3Sources(),
    ingress = 'synthetic-private-ingress';
  let store: ProtectedStore,
    catalog: U3ProductCatalog,
    query: U3CatalogQuery,
    authority: Awaited<ReturnType<typeof seedU3CommandAuthority>>,
    basis: Ref;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    authority = await seedU3CommandAuthority(store);
    catalog = new U3ProductCatalog(store, authority.now, async (proof) => proof === ingress);
    query = new U3CatalogQuery(
      catalog,
      new CommercialAgreement(
        store,
        authority.now,
        async (proof) => proof === ingress,
        syntheticCommercialEvidence,
      ),
    );
    basis = {
      owner: 'ProductCatalog',
      entity: 'CommonOfferRevision',
      id: randomUUID(),
      revision: 1,
    };
    const productRef: Ref = {
        owner: 'ProductCatalog',
        entity: 'Product',
        id: randomUUID(),
        revision: 1,
      },
      built = buildCommonOffer(store, catalogInput(basis), productRef, basis, authority.now());
    await store.execute(
      {
        principalId: 'synthetic-catalog-source',
        audience: 'SYSTEM',
        owner: 'ProductCatalog',
        operation: 'fixture-common-terms',
        target: null,
        idempotencyKey: randomUUID(),
        input: { synthetic: true },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
        sourceContract: U3_SOURCE_CONTRACT,
      },
      async (tx) => {
        await tx.put('Product', built.product);
        await tx.put('CommonOfferRevision', built.offer!);
      },
    );
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  const input = (): U3ProductInput => {
    const data = catalogInput(basis);
    data.meta.clientRequestId = randomUUID();
    return data;
  };
  const customerScope = () => ({
    ...fixtureScope(),
    enterpriseRef: authority.enterpriseRef,
    contextPolicyRef: authority.enterpriseRef,
    organisationRevision: authority.enterpriseRef.revision,
  });
  const register = (data = input()) => catalog.register(authority.staff, data, null, ingress);
  it('상품·서버 offer·이력·접수·원 단위 가격과 정확 refs를 같은 보호 후보에 기록한다', async () => {
    const data = input(),
      receipt = await register(data),
      product = (await store.currentProtected('Product', receipt.targetRef!.id))!,
      offer = (await store.currentProtected(
        'CommonOfferRevision',
        (product.currentOfferRef as Ref).id,
      ))!;
    expect(product).toMatchObject({ modelVersion: 2, saleState: 'OFFERABLE' });
    expect(offer).toMatchObject({
      modelVersion: 2,
      commonPrice: data.commonPrice,
      productRef: receipt.targetRef,
    });
    expect(
      (offer.conditionBindings as { sourceRef: Ref }[]).every(
        (value) => canonicalJson(value.sourceRef) === canonicalJson(product.currentOfferRef),
      ),
    ).toBe(true);
    expect(
      await store.list('CatalogHistory', { equals: { requestId: receipt.requestId } }),
    ).toHaveLength(1);
    const payload = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      receipt.requestId,
      store.schema,
    );
    expect(payload.rows.map((row) => row.model)).toEqual([
      'Product',
      'CommonOfferRevision',
      'CatalogHistory',
      'RequestReceipt',
      'FactEnvelope',
      'RequestKey',
    ]);
  });
  it('초안 누락/미완성은 저장하지만 유효 판매 조건으로 반환하지 않는다', async () => {
    const data = { ...input(), offerDraft: null },
      receipt = await register(data);
    expect(await store.read('Product', receipt.targetRef!.id)).toMatchObject({
      saleState: 'INCOMPLETE',
      currentOfferRef: null,
    });
    await expect(
      query.readCommonOffer(
        authority.staff,
        { targetRef: receipt.targetRef!, targetScope: null },
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const incomplete = input();
    incomplete.offerDraft!.conditions = incomplete.offerDraft!.conditions.filter(
      (value) => value.conditionKey !== 'COMPLETION',
    );
    const saved = await register(incomplete);
    expect(await store.read('Product', saved.targetRef!.id)).toMatchObject({
      saleState: 'INCOMPLETE',
    });
    const missingRevisionEvidence = input();
    missingRevisionEvidence.offerDraft!.revisionEvidenceRefs = [];
    const draft = await register(missingRevisionEvidence);
    const stored = (await store.read('Product', draft.targetRef!.id))!;
    expect(stored.saleState).toBe('INCOMPLETE');
    expect(
      await store.read('CommonOfferRevision', (stored.currentOfferRef as Ref).id),
    ).toMatchObject({
      visible: false,
      revisionEvidenceRefs: [],
    });
    const historyBefore = (await store.list('CatalogHistory')).length;
    const invalid = input();
    invalid.offerDraft!.conditions[0]!.evidenceRefs = [];
    await expect(register(invalid)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await store.list('CatalogHistory')).toHaveLength(historyBefore);
  });
  it('현재 기업/상품 읽기 권한으로 공개 상품의 최종 가격을 확인하고 직원 공통 조회는 구분한다', async () => {
    const receipt = await register();
    const view = await query.readCommonOffer(authority.customer, {
      targetRef: receipt.targetRef!,
      targetScope: customerScope(),
    });
    expect(view).toMatchObject({
      knowledge: 'KNOWN',
      data: {
        commonPrice: { currency: 'KRW', value: '1000' },
        resolvedPrice: { currency: 'KRW', value: '1000' },
        priceKnowledge: 'KNOWN',
      },
    });
    expect(view.sourceRefs.every((value) => value.owner === 'ProductCatalog')).toBe(true);
    expect(
      await query.readCommonOffer(
        authority.staff,
        { targetRef: receipt.targetRef!, targetScope: null },
        ingress,
      ),
    ).toMatchObject({ data: { resolvedPrice: null, priceKnowledge: 'UNKNOWN' } });
  });
  it('직원은 완성된 비공개 공통 원본을 조회·재개정하지만 공개 예외 없는 고객에게 메타데이터를 반환하지 않는다', async () => {
    const draft = input();
    const visibility = draft.offerDraft!.conditions.find(
      (value) => value.conditionKey === 'VISIBILITY',
    )!;
    if (visibility.conditionKey === 'VISIBILITY') visibility.value = false;
    const receipt = await register(draft);
    const view = await query.readCommonOffer(
      authority.staff,
      { targetRef: receipt.targetRef!, targetScope: null },
      ingress,
    );
    expect(view).toMatchObject({
      data: {
        visible: false,
        commonPrice: draft.commonPrice,
        resolvedPrice: null,
        priceKnowledge: 'UNKNOWN',
      },
    });
    await expect(
      query.readCommonOffer(authority.customer, {
        targetRef: receipt.targetRef!,
        targetScope: customerScope(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const revised = catalogInput(view.data.commonOfferRevisionRef as Ref);
    revised.meta = {
      ...revised.meta,
      clientRequestId: randomUUID(),
      expectedRevision: receipt.targetRef!.revision,
    };
    const saved = await catalog.register(authority.staff, revised, receipt.targetRef!, ingress);
    expect(saved.targetRef!.revision).toBe(2);
    expect(
      await store.readRevision(
        'CommonOfferRevision',
        (view.data.commonOfferRevisionRef as Ref).id,
        1,
      ),
    ).toMatchObject({ visible: false });
  });
  it('중지 상품의 현재 공통 원본은 직원 관리에 사용하고 생략 개정은 중지를 보존하며 명시 재판매만 허용한다', async () => {
    const stopped = input();
    stopped.saleState = 'SUSPENDED';
    const first = await register(stopped);
    const firstProduct = (await store.currentProtected('Product', first.targetRef!.id))!;
    const firstOffer = firstProduct.currentOfferRef as Ref;
    const bytes = canonicalJson(await store.readRevision('CommonOfferRevision', firstOffer.id, 1));
    const staffView = await query.readCommonOffer(
      authority.staff,
      { targetRef: first.targetRef!, targetScope: null },
      ingress,
    );
    expect(staffView.data.commonOfferRevisionRef).toEqual(firstOffer);
    await expect(
      query.readCommonOffer(authority.customer, {
        targetRef: first.targetRef!,
        targetScope: customerScope(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const description = catalogInput(firstOffer);
    description.meta = {
      ...description.meta,
      clientRequestId: randomUUID(),
      expectedRevision: first.targetRef!.revision,
    };
    description.salesDescription = '합성 중지 상품 설명 개정';
    const revised = await catalog.register(authority.staff, description, first.targetRef!, ingress);
    const current = (await store.currentProtected('Product', revised.targetRef!.id))!;
    expect(current).toMatchObject({
      saleState: 'SUSPENDED',
      revision: 2,
      salesDescription: description.salesDescription,
    });
    const explicit = catalogInput(current.currentOfferRef as Ref);
    explicit.meta = {
      ...explicit.meta,
      clientRequestId: randomUUID(),
      expectedRevision: revised.targetRef!.revision,
    };
    explicit.saleState = 'OFFERABLE';
    const resale = await catalog.register(authority.staff, explicit, revised.targetRef!, ingress);
    const active = (await store.currentProtected('Product', resale.targetRef!.id))!;
    expect(active.saleState).toBe('OFFERABLE');
    const invalid = catalogInput(active.currentOfferRef as Ref);
    invalid.meta = {
      ...invalid.meta,
      clientRequestId: randomUUID(),
      expectedRevision: resale.targetRef!.revision,
    };
    invalid.saleState = 'OFFERABLE';
    invalid.offerDraft!.effectiveWindow.startAt = '2099-01-01T00:00:00.000Z';
    const incomplete = await catalog.register(authority.staff, invalid, resale.targetRef!, ingress);
    expect(await store.currentProtected('Product', incomplete.targetRef!.id)).toMatchObject({
      saleState: 'INCOMPLETE',
    });
    const resume = catalogInput(
      (await store.currentProtected('Product', incomplete.targetRef!.id))!.currentOfferRef as Ref,
    );
    resume.meta = {
      ...resume.meta,
      clientRequestId: randomUUID(),
      expectedRevision: incomplete.targetRef!.revision,
    };
    resume.saleState = 'OFFERABLE';
    await expect(
      catalog.register(authority.staff, resume, incomplete.targetRef!, ingress),
    ).rejects.toMatchObject({ code: 'CATALOG_BASIS_UNCONFIRMED' });
    const validResume = catalogInput(basis);
    validResume.meta = {
      ...validResume.meta,
      clientRequestId: randomUUID(),
      expectedRevision: incomplete.targetRef!.revision,
    };
    validResume.saleState = 'OFFERABLE';
    const resumed = await catalog.register(
      authority.staff,
      validResume,
      incomplete.targetRef!,
      ingress,
    );
    expect(await store.currentProtected('Product', resumed.targetRef!.id)).toMatchObject({
      saleState: 'OFFERABLE',
    });
    expect(canonicalJson(await store.readRevision('CommonOfferRevision', firstOffer.id, 1))).toBe(
      bytes,
    );
  });
  it('타 기업 범위·기업 미지정·고객 상품 등록은 정보를 반환/변경하지 않는다', async () => {
    const receipt = await register();
    for (const targetScope of [
      null,
      {
        ...customerScope(),
        enterpriseRef: { ...authority.enterpriseRef, id: 'other-company' },
        contextPolicyRef: { ...authority.enterpriseRef, id: 'other-company' },
      },
    ])
      await expect(
        query.readCommonOffer(authority.customer, { targetRef: receipt.targetRef!, targetScope }),
      ).rejects.toThrow();
    await expect(catalog.register(authority.customer, input())).rejects.toMatchObject({
      code: 'U3_PERSON_COMMAND',
    });
    expect(await store.list('Product')).toHaveLength(2);
  });
  it('외부망 직원 등록/조회와 만료 신원을 거절한다', async () => {
    await expect(
      catalog.register(authority.staff, input(), null, 'synthetic-public-ingress'),
    ).rejects.toMatchObject({ code: 'STAFF_NETWORK_REQUIRED' });
    const receipt = await register();
    await expect(
      query.readCommonOffer(
        authority.staff,
        { targetRef: receipt.targetRef!, targetScope: null },
        null,
      ),
    ).rejects.toMatchObject({ code: 'STAFF_NETWORK_REQUIRED' });
    await expect(
      catalog.register(
        { ...authority.staff, deadlineAt: '2000-01-01T00:00:00.000Z' },
        input(),
        null,
        ingress,
      ),
    ).rejects.toThrow();
  });
  it('새 가격 개정은 새 offer를 발급하며 과거 구매 참조의 가격/조건 bytes를 보존한다', async () => {
    const first = await register(),
      original = (await store.read('Product', first.targetRef!.id))!,
      oldOffer = original.currentOfferRef as Ref,
      oldBytes = canonicalJson(
        await store.readRevision('CommonOfferRevision', oldOffer.id, oldOffer.revision),
      );
    const data = input();
    data.meta.expectedRevision = first.targetRef!.revision;
    data.commonPrice = { currency: 'KRW', value: '2000' };
    const price = data.offerDraft!.conditions.find((value) => value.conditionKey === 'PRICE')!;
    if (price.conditionKey === 'PRICE') price.value = data.commonPrice;
    const revised = await catalog.register(authority.staff, data, first.targetRef, ingress),
      current = (await store.read('Product', revised.targetRef!.id))!;
    expect(current.revision).toBe(2);
    expect((current.currentOfferRef as Ref).id).not.toBe(oldOffer.id);
    expect(canonicalJson(await store.readRevision('CommonOfferRevision', oldOffer.id, 1))).toBe(
      oldBytes,
    );
    await expect(
      query.readCommonOffer(authority.staff, { targetRef: oldOffer, targetScope: null }, ingress),
    ).rejects.toThrow();
    expect(
      await query.readCommonOffer(
        authority.staff,
        { targetRef: revised.targetRef!, targetScope: null },
        ingress,
      ),
    ).toMatchObject({ data: { commonPrice: data.commonPrice } });
    await expect(
      catalog.register(
        authority.staff,
        { ...data, meta: { ...data.meta, clientRequestId: randomUUID() } },
        first.targetRef,
        ingress,
      ),
    ).rejects.toThrow();
  });
  it('개정 시 HW→SW 변경과 소수 금액은 기존 상품/offer/이력을 보존하고 거절한다', async () => {
    const receipt = await register(),
      before = canonicalJson(await store.read('Product', receipt.targetRef!.id)),
      data = input();
    data.meta.expectedRevision = 1;
    await expect(
      catalog.register(
        authority.staff,
        { ...data, productType: 'SOFTWARE', softwareTermKind: 'PERPETUAL' },
        receipt.targetRef,
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_TYPE_IMMUTABLE' });
    await expect(
      register({ ...input(), commonPrice: { currency: 'KRW', value: '1000.5' } }),
    ).rejects.toThrow();
    expect(canonicalJson(await store.read('Product', receipt.targetRef!.id))).toBe(before);
    expect(await store.list('CatalogHistory')).toHaveLength(1);
  });
  it('정확 근거의 stale/primary-only 변경은 상품과 이력을 전체 rollback한다', async () => {
    const stale = input();
    stale.offerDraft!.revisionEvidenceRefs = [{ ...basis, revision: 2 }];
    await expect(register(stale)).rejects.toMatchObject({ code: 'STALE_U3_REFERENCE' });
    await sources.primaryAdmin
      .getRepository('CommonOfferRevision')
      .update({ offerRevisionId: basis.id }, { visible: false });
    await expect(register()).rejects.toThrow();
    expect(await store.list('CatalogHistory')).toHaveLength(0);
    expect(await sources.primaryAdmin.getRepository('Product').count()).toBe(1);
  });
  it('상품 작성 후 현재 역할 회수는 후단 대조에서 전체 rollback한다', async () => {
    let calls = 0;
    const guarded = new U3ProductCatalog(store, authority.now, async (proof) => {
      if (++calls === 3)
        await sources.primaryAdmin
          .getRepository('StaffRoleGrant')
          .update(
            { staffGrantId: authority.staffGrant.staffGrantId },
            { revokedAt: authority.now().toISOString(), revision: 2 },
          );
      return proof === ingress;
    });
    await expect(guarded.register(authority.staff, input(), null, ingress)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(await store.list('CatalogHistory')).toHaveLength(0);
    expect(await sources.primaryAdmin.getRepository('Product').count()).toBe(1);
  });
  it('기업 사적 근거를 공통 조건으로 등록하지 않는다', async () => {
    const data = input();
    data.offerDraft!.revisionEvidenceRefs = [
      {
        owner: 'CommercialAgreement',
        entity: 'AgreementRevision',
        id: 'private-company-terms',
        revision: 1,
      },
    ];
    await expect(register(data)).rejects.toMatchObject({ code: 'CATALOG_PRIVATE_SOURCE' });
    expect(await store.list('CatalogHistory')).toHaveLength(0);
  });
});
