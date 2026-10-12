import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson, OmsError, U3_PROFILE } from '@oms/contracts';
import type { Money, Ref, U3OrderInput, U3OrderView, U3PriceConfirmation } from '@oms/contracts';
import { U3OrderAcceptance } from '@oms/core';
import {
  ProtectedStore,
  ProtectedTransaction,
  decodePayload,
  migrateU3Models,
  U3_SOURCE_CONTRACT,
} from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedProposalAuthority } from '../fixtures/proposal.js';
import { syntheticCommercialEvidence } from '../fixtures/agreement.js';
import { registeredOrderInput, orderQuery } from '../fixtures/order-input.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';
import { profileU3Budget } from '../fixtures/budget-profile.js';
import { buildCommonOffer } from '../../../packages/core/src/catalog-conditions.js';
import { catalogInput } from '../fixtures/catalog.js';
import { QueryFailedError } from 'typeorm';

describe('실제 U3 주문 제출·불변 전체 조건·금액/재전송 경계', () => {
  const sources = u3Sources();
  let store: ProtectedStore,
    f: Awaited<ReturnType<typeof seedProposalAuthority>>,
    orders: U3OrderAcceptance;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    f = await seedProposalAuthority(store);
    orders = new U3OrderAcceptance(
      store,
      f.seller.now,
      async (proof) => proof === f.ingress,
      syntheticCommercialEvidence,
    );
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  async function submit(value: U3OrderInput | Promise<U3OrderInput>) {
    const ready = await value;
    return orders.submit(await f.requestContext(f.seller.customer), ready);
  }
  async function input(count = 1, confirmation = false): Promise<U3OrderInput> {
    const resolved = await f.agreement.resolve(await f.requestContext(f.seller.customer), {
      targetScope: f.targetScope,
      productRef: f.productRef,
      commonOfferRevisionRef: f.offerRef,
    });
    const value: U3OrderInput = {
      meta: f.meta(),
      targetScope: f.targetScope,
      productType: 'HARDWARE',
      provisionChoice: 'FULL',
      partialConsentRef: null,
      lines: Array.from({ length: count }, () => ({
        productRef: f.productRef,
        commonOfferRevisionRef: f.offerRef,
        agreementRevisionRefs: resolved.agreementRevisionRefs,
        conditionBindings: resolved.conditionBindings,
        quantity: 1,
        paymentMode: 'PREPAY',
        requestedActivationDate: null,
      })),
    };
    if (confirmation) {
      const unit = resolved.conditionBindings.find((binding) => binding.conditionKey === 'PRICE')!
        .value as { currency: 'KRW'; value: string };
      const total: Money = {
        currency: 'KRW',
        value: (BigInt(unit.value) * BigInt(count)).toString(),
      };
      const priceConfirmation: U3PriceConfirmation = {
        confirmedByRef: f.registrant.actorAccountRef!,
        evidenceRefs: (await f.input()).agreementEvidenceRefs,
        priceBreakdown: {
          lineAmounts: value.lines.map(() => structuredClone(unit)),
          productAmount: structuredClone(total),
          adjustments: [],
          total: structuredClone(total),
          knowledge: 'KNOWN',
        },
      };
      value.priceConfirmation = priceConfirmation;
    }
    return registeredOrderInput('submitOrder', value);
  }
  async function view(receipt: Awaited<ReturnType<U3OrderAcceptance['submit']>>) {
    return (
      (await orders.read(
        await f.requestContext(f.seller.customer),
        orderQuery(receipt.targetRef!, f.targetScope),
      )) as {
        knowledge: 'KNOWN';
        data: U3OrderView;
      }
    ).data;
  }
  it('실제 모든 행·FULL·판단·스냅샷·요청/통지를 한 후보에 보호하고 비용 확인 없으면 REVIEW/UNKNOWN이다', async () => {
    const receipt = await submit(await input()),
      data = await view(receipt);
    expect(data).toMatchObject({
      acceptance: 'REVIEW_REQUIRED',
      provisionChoice: 'FULL',
      priceBreakdown: { knowledge: 'UNKNOWN', total: null, productAmount: { value: '1000' } },
    });
    const order = (await store.currentProtected('Order', receipt.targetRef!.id))!;
    expect(order).toMatchObject({
      state: 'REVIEW',
      changeApplicationRefs: [],
      submissionRequestId: receipt.requestId,
    });
    const payload = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      receipt.requestId,
      store.schema,
    );
    for (const model of [
      'OrderLine',
      'Order',
      'PurchaseTermsSnapshot',
      'ProvisionChoice',
      'AcceptanceDecision',
      'OrderHistory',
      'RequestReceipt',
      'FactEnvelope',
      'OutboxDelivery',
    ])
      expect(payload.rows.some((row) => row.model === model)).toBe(true);
    expect(() => decodePayload(canonicalJson(payload), store.schema)).not.toThrow();
    expect(
      (await store.currentProtected(
        'AcceptanceDecision',
        (order.acceptanceRef as { id: string }).id,
      ))!.decision,
    ).toBe('HOLD');
    expect(await submit(await input())).not.toEqual(receipt);
  });
  it('기업 우선 가격과 모든 조건 개정·전체 확인 자료는 불변이며 단가/다른 항목 포함 비용을 중복 계산하지 않는다', async () => {
    await f.approvePrice();
    const value = await input(2, true),
      confirmation = value.priceConfirmation!;
    confirmation.priceBreakdown.adjustments = [
      {
        itemId: 'included-tax',
        kind: 'TAX',
        knowledge: 'KNOWN',
        amount: { currency: 'KRW', value: '100' },
        position: 'UNIT_PRICE',
        includedInItemId: null,
        evidenceRefs: confirmation.evidenceRefs,
        confirmedByRef: confirmation.confirmedByRef,
      },
      {
        itemId: 'shipping',
        kind: 'SHIPPING',
        knowledge: 'KNOWN',
        amount: { currency: 'KRW', value: '200' },
        position: 'SEPARATE',
        includedInItemId: null,
        evidenceRefs: confirmation.evidenceRefs,
        confirmedByRef: confirmation.confirmedByRef,
      },
      {
        itemId: 'discount',
        kind: 'DISCOUNT',
        knowledge: 'KNOWN',
        amount: { currency: 'KRW', value: '100' },
        position: 'SEPARATE',
        includedInItemId: null,
        evidenceRefs: confirmation.evidenceRefs,
        confirmedByRef: confirmation.confirmedByRef,
      },
    ];
    confirmation.priceBreakdown.total!.value = '1900';
    const receipt = await submit(value),
      data = await view(receipt);
    expect(data.lines.map((line) => line.purchasePrice.value)).toEqual(['900', '900']);
    expect(data.agreementRevisionRefs).toHaveLength(1);
    expect(data.priceBreakdown!.productAmount!.value).toBe('1800');
    expect(data.priceBreakdown!.total!.value).toBe('1900');
    const bytes = canonicalJson(
      await store.currentProtected('PurchaseTermsSnapshot', data.purchaseTermsSnapshotRef.id),
    );
    await migrateU3Models(sources.primaryAdmin);
    expect(
      canonicalJson(
        await store.currentProtected('PurchaseTermsSnapshot', data.purchaseTermsSnapshotRef.id),
      ),
    ).toBe(bytes);
    await expect(
      sources.primaryApp
        .getRepository('PurchaseTermsSnapshot')
        .update({ purchaseTermsId: data.purchaseTermsSnapshotRef.id }, { priceBreakdown: {} }),
    ).rejects.toThrow();
  });
  it('100행은 전체 보존하고 0/101행·혼합 지급/타입·부분 제공·허위 현재 조건은 원자 기록 전 거절한다', async (test) => {
    const value = await input(100);
    const context = await f.requestContext(f.seller.customer);
    const receipt = await profileU3Budget(
      'SUBMISSION_100',
      context,
      () => orders.submit(context, value),
      test,
    );
    const reader = await f.requestContext(f.seller.customer);
    const read = (await profileU3Budget(
      'READ_100',
      reader,
      () => orders.read(reader, orderQuery(receipt.targetRef!, f.targetScope)),
      test,
    )) as { knowledge: 'KNOWN'; data: U3OrderView; sourceRefs: Ref[] };
    expect(read.knowledge).toBe('KNOWN');
    expect(read.data.lines).toHaveLength(100);
    expect(read.sourceRefs.map((reference) => reference.entity)).toEqual([
      'Order',
      'PurchaseTermsSnapshot',
      'ProvisionChoice',
      'AcceptanceDecision',
    ]);
    expect(receipt.resultRefs.map((reference) => reference.entity)).toEqual([
      ...read.sourceRefs.map((reference) => reference.entity),
      'OrderHistory',
    ]);
    const history = (await store.currentProtected(
      'OrderHistory',
      receipt.resultRefs.find((reference) => reference.entity === 'OrderHistory')!.id,
    ))!;
    expect(history.resultRefs).toEqual(read.sourceRefs);
    const payload = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      receipt.requestId,
      store.schema,
    );
    expect(payload.rows.filter((row) => row.model === 'OrderLine')).toHaveLength(100);
    expect(() => decodePayload(canonicalJson(payload), store.schema)).not.toThrow();
    const normal = await input();
    for (const changed of [
      { lines: [] },
      { lines: Array.from({ length: 101 }, () => normal.lines[0]!) },
      { provisionChoice: 'PARTIAL' },
    ])
      await expect(submit({ ...normal, ...changed } as U3OrderInput)).rejects.toThrow();
    await expect(submit({ ...normal, productType: 'SOFTWARE' })).rejects.toMatchObject({
      code: 'ORDER_PRODUCT_TYPE',
    });
    const mixed = await input(2);
    mixed.lines[1]!.paymentMode = 'POSTPAY';
    await expect(submit(mixed)).rejects.toThrow();
    const changedCondition = normal.lines[0]!.conditionBindings.find(
      (binding) => binding.conditionKey === 'PRICE',
    );
    if (!changedCondition || changedCondition.conditionKey !== 'PRICE')
      throw new Error('정상 주문 fixture에는 PRICE 조건이 필요합니다.');
    changedCondition.value = {
      currency: 'KRW',
      value: (BigInt(changedCondition.value.value) + 1n).toString(),
    };
    registeredOrderInput('submitOrder', normal);
    await expect(submit(normal)).rejects.toMatchObject({
      code: 'ORDER_CONDITIONS_CHANGED',
    });
  });
  it('빈 추가 목록/KNOWN/직원 Ref만으로 적용 없음이나0원을 확인하지 않고 실제 모든 근거를 요구한다', async () => {
    const value = await input(1, true);
    value.priceConfirmation!.evidenceRefs = [];
    await expect(submit(value)).rejects.toMatchObject({
      code: 'ORDER_PRICE_UNCONFIRMED',
    });
    const wrong = await input(1, true);
    wrong.priceConfirmation!.confirmedByRef = f.seller.customer.actorAccountRef!;
    await expect(submit(wrong)).rejects.toThrow();
    const missing = await input(1, true);
    missing.priceConfirmation!.evidenceRefs = missing.priceConfirmation!.evidenceRefs.slice(0, 1);
    await expect(submit(missing)).rejects.toThrow();
    const unconfirmed = await submit(await input());
    expect((await view(unconfirmed)).priceBreakdown!.total).toBeNull();
  });
  it('새 행 batch의 중복 식별자와 deferred FK 실패는 주문·접수·보호 후보 전체를 rollback한다', async () => {
    async function counts() {
      const rows = await Promise.all(
        [
          'Order',
          'OrderLine',
          'PurchaseTermsSnapshot',
          'ProvisionChoice',
          'AcceptanceDecision',
          'RequestReceipt',
          'FactEnvelope',
        ].map((model) => sources.primaryAdmin.getRepository(model).count()),
      );
      const candidates = await sources.primaryAdmin.query(
        'SELECT count(*)::integer AS count FROM u1_recovery_candidate',
      );
      return [...rows, Number(candidates[0].count)];
    }
    const write = ProtectedTransaction.prototype.putNewBatch;
    for (const failureKind of ['duplicate', 'foreign-key'] as const) {
      const value = await input(2),
        context = await f.requestContext(f.seller.customer),
        before = await counts();
      const failure = vi
        .spyOn(ProtectedTransaction.prototype, 'putNewBatch')
        .mockImplementation(async function (this: ProtectedTransaction, model, records) {
          const changed = records.map((record) => structuredClone(record));
          if (model === 'OrderLine') {
            if (failureKind === 'duplicate') changed[1]!.lineId = changed[0]!.lineId;
            else changed[1]!.productRef = { ...(changed[1]!.productRef as Ref), id: randomUUID() };
          }
          await write.call(this, model, changed);
        });
      const attempted = orders.submit(context, value);
      if (failureKind === 'duplicate')
        await expect(attempted).rejects.toMatchObject({ code: 'NEW_BATCH_CONFLICT' });
      else {
        await expect(attempted).rejects.toBeInstanceOf(QueryFailedError);
        await attempted.catch((error: unknown) => {
          if (!(error instanceof QueryFailedError)) throw error;
          expect(error.driverError.code).toBe('23503');
        });
      }
      failure.mockRestore();
      expect(await counts()).toEqual(before);
      expect(
        await orders.commands.original(
          await f.requestContext(context),
          'OrderAcceptance',
          'submitOrder',
          { kind: 'NONE' },
          value,
          { scope: f.targetScope },
        ),
      ).toMatchObject({ knowledge: 'UNKNOWN', requestId: null, reasonCode: 'NO_ORIGINAL' });
    }
  });
  it('후단 실패는 전체 그래프를 rollback하고 보호 commit 이후 응답 유실은 동일 원래 접수만 재사용한다', async () => {
    const value = await input(),
      put = ProtectedTransaction.prototype.put;
    const failure = vi
      .spyOn(ProtectedTransaction.prototype, 'put')
      .mockImplementation(async function (this: ProtectedTransaction, model, data, revision) {
        await put.call(this, model, data, revision);
        if (model === 'ProvisionChoice')
          throw new OmsError(503, 'SYNTHETIC_ORDER_AFTER_ROWS', '행 기록 후 합성 실패');
      });
    await expect(submit(value)).rejects.toMatchObject({
      code: 'SYNTHETIC_ORDER_AFTER_ROWS',
    });
    failure.mockRestore();
    expect(
      await store.list('Order', {
        equals: { requesterAccountRef: { id: f.seller.customer.principalId } },
      }),
    ).toHaveLength(1); // setup의 명시 합성 주문만 존재
    const validate = store.schema.validateUri.bind(store.schema);
    let once = true;
    const loss = vi.spyOn(store.schema, 'validateUri').mockImplementation((uri, data) => {
      if (once && uri === U3_PROFILE + '#/$defs/Receipt') {
        once = false;
        throw new OmsError(503, 'SYNTHETIC_ORDER_RESPONSE_LOSS', '보호 후 합성 응답 유실');
      }
      return validate(uri, data);
    });
    await expect(submit(value)).rejects.toMatchObject({
      code: 'SYNTHETIC_ORDER_RESPONSE_LOSS',
    });
    loss.mockRestore();
    const original = await orders.commands.original(
      await f.requestContext(f.seller.customer),
      'OrderAcceptance',
      'submitOrder',
      { kind: 'NONE' },
      value,
      { scope: f.targetScope },
    );
    expect(original.knowledge).toBe('KNOWN');
    const receipt = await submit(value),
      again = await submit(value);
    expect(again).toEqual(receipt);
    await expect(
      submit({ ...value, meta: { ...value.meta, reason: '다른 내용' } }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('다른 기업 조회·제출, 외부망 직원 조회, 오래된 offer는 허용하지 않는다', async () => {
    const value = await input(),
      receipt = await submit(value);
    await expect(
      orders.submit(await f.requestContext(f.reviewer.customer), value),
    ).rejects.toThrow();
    await expect(
      orders.read(
        await f.requestContext(f.reviewer.customer),
        orderQuery(receipt.targetRef!, f.targetScope),
      ),
    ).rejects.toThrow();
    await expect(
      orders.read(
        await f.requestContext(f.registrant),
        orderQuery(receipt.targetRef!, f.targetScope),
        'external',
      ),
    ).rejects.toMatchObject({ code: 'STAFF_NETWORK_REQUIRED' });
    const stale = await input();
    stale.lines[0]!.commonOfferRevisionRef.revision = 2;
    await expect(submit(stale)).rejects.toThrow();
    expect((await view(receipt)).targetScope).toEqual(f.targetScope);
  });
  it('기간제 SW의 합의 기간을 그대로 캡처하고 요청/실제 설치·이용 기간으로 변경하지 않는다', async () => {
    const productRef: Ref = {
        owner: 'ProductCatalog',
        entity: 'Product',
        id: randomUUID(),
        revision: 1,
      },
      offerRef: Ref = {
        owner: 'ProductCatalog',
        entity: 'CommonOfferRevision',
        id: randomUUID(),
        revision: 1,
      };
    const draft = catalogInput(offerRef);
    draft.productType = 'SOFTWARE';
    draft.softwareTermKind = 'TERM';
    const period = {
      startDate: '2026-12-01',
      endDate: '2027-11-30',
      timeZone: 'Asia/Seoul' as const,
      endRule: 'INCLUSIVE_DATE' as const,
      ruleRef: offerRef,
    };
    draft.offerDraft!.conditions.push({
      conditionKey: 'PERIOD',
      value: period,
      effectiveWindow: draft.offerDraft!.effectiveWindow,
      evidenceRefs: [offerRef],
    });
    const built = buildCommonOffer(store, draft, productRef, offerRef, f.seller.now());
    await store.execute(
      {
        principalId: 'synthetic-u3-term-catalog',
        audience: 'SYSTEM',
        owner: 'ProductCatalog',
        operation: 'fixture-term-catalog',
        target: null,
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        input: { synthetic: true },
        epoch: await store.currentEpoch(),
        sourceContract: U3_SOURCE_CONTRACT,
      },
      async (tx) => {
        await tx.put('Product', built.product);
        await tx.put('CommonOfferRevision', built.offer!);
      },
    );
    const resolved = await f.agreement.resolve(await f.requestContext(f.seller.customer), {
      targetScope: f.targetScope,
      productRef,
      commonOfferRevisionRef: offerRef,
    });
    const value = registeredOrderInput<U3OrderInput>('submitOrder', {
      meta: f.meta(),
      targetScope: f.targetScope,
      productType: 'SOFTWARE',
      provisionChoice: 'FULL',
      partialConsentRef: null,
      lines: [
        {
          productRef,
          commonOfferRevisionRef: offerRef,
          agreementRevisionRefs: resolved.agreementRevisionRefs,
          conditionBindings: resolved.conditionBindings,
          quantity: 1,
          paymentMode: 'PREPAY',
          requestedActivationDate: '2026-12-01',
        },
      ],
    });
    const receipt = await submit(value),
      data = await view(receipt);
    expect(data.lines[0]!.agreedPeriod).toEqual(period);
    expect(data.productType).toBe('SOFTWARE');
    expect(
      (await store.currentProtected('OrderLine', data.lines[0]!.orderLineRef.id))!
        .requestedActivationDate,
    ).toBe('2026-12-01');
  });
});
