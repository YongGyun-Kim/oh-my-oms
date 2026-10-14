import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson, OmsError, U3_PROFILE } from '@oms/contracts';
import type { Receipt, Ref, U3OrderInput, U3OrderView } from '@oms/contracts';
import { StaffAccess, U3CatalogQuery, U3ProductCatalog } from '@oms/core';
import type { U3ReadinessRegistration } from '@oms/core';
import { ProtectedStore, ProtectedTransaction, modelDefinition } from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedDecisionOrder } from '../fixtures/order-decision.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';
import { profileU3Budget } from '../fixtures/budget-profile.js';
import { orderQuery, registeredOrderInput } from '../fixtures/order-input.js';
import { agreementApprovalInput, agreementRegistrationInput } from '../fixtures/agreement-input.js';
import { catalogInput } from '../fixtures/catalog.js';
import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';

describe('실제 전체 직원 판단·소유 원본·원자 접수 경계', () => {
  const sources = u3Sources();
  let store: ProtectedStore;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  async function result(receipt: Receipt) {
    const order = (await store.currentProtected('Order', receipt.targetRef!.id))!;
    const decision = (await store.currentProtected(
      'AcceptanceDecision',
      (order.acceptanceRef as Ref).id,
    ))!;
    return { order, decision };
  }
  async function originalBytes(f: Awaited<ReturnType<typeof seedDecisionOrder>>) {
    const order = (await store.currentProtected('Order', f.receipt.targetRef!.id))!;
    return canonicalJson({
      snapshot: await store.currentProtected(
        'PurchaseTermsSnapshot',
        (order.purchaseTermsRef as Ref).id,
      ),
      lines: await Promise.all(
        (order.lineRefs as Ref[]).map((reference) =>
          store.currentProtected('OrderLine', reference.id),
        ),
      ),
    });
  }
  async function privateOrder() {
    const f = await seedDecisionOrder(store),
      catalog = new U3ProductCatalog(store, f.seller.now, async (proof) => proof === f.ingress);
    const draft = catalogInput(f.offerRef);
    draft.meta = f.meta();
    const visibility = draft.offerDraft!.conditions.find(
      (value) => value.conditionKey === 'VISIBILITY',
    )!;
    if (visibility.conditionKey === 'VISIBILITY') visibility.value = false;
    const saved = await catalog.register(
      await f.requestContext(f.registrant),
      draft,
      null,
      f.ingress,
    );
    const productRef = saved.targetRef!,
      product = (await store.currentProtected('Product', productRef.id))!,
      offerRef = product.currentOfferRef as Ref;
    const data = agreementRegistrationInput(
      f.seller.enterpriseRef,
      productRef,
      offerRef,
      f.evidence,
    );
    data.conditions.push({
      conditionKey: 'VISIBILITY',
      value: true,
      effectiveWindow: data.effectiveWindow,
      evidenceRefs: f.evidence,
    });
    const registration = await f.agreement.register(
      await f.requestContext(f.registrant),
      data,
      f.ingress,
    );
    const approval = await f.agreement.approve(
      await f.requestContext(f.approver),
      agreementApprovalInput(registration.targetRef!, f.evidence),
      f.ingress,
    );
    const query = new U3CatalogQuery(catalog, f.agreement);
    const view = await query.readCommonOffer(await f.requestContext(f.seller.customer), {
      targetRef: productRef,
      targetScope: f.targetScope,
    });
    expect(view).toMatchObject({
      data: {
        label: draft.label,
        visible: true,
        commonPrice: null,
        resolvedPrice: { currency: 'KRW', value: '900' },
        priceKnowledge: 'KNOWN',
        salesConditionRefs: [],
      },
    });
    expect(view.sourceRefs).toContainEqual(approval.targetRef);
    const resolved = await f.agreement.resolve(await f.requestContext(f.seller.customer), {
      targetScope: f.targetScope,
      productRef,
      commonOfferRevisionRef: offerRef,
    });
    const input = registeredOrderInput<U3OrderInput>('submitOrder', {
      ...structuredClone(f.input),
      meta: f.meta(),
      lines: [
        {
          ...structuredClone(f.input.lines[0]!),
          productRef,
          commonOfferRevisionRef: offerRef,
          agreementRevisionRefs: resolved.agreementRevisionRefs,
          conditionBindings: resolved.conditionBindings,
        },
      ],
      priceConfirmation: {
        ...structuredClone(f.input.priceConfirmation!),
        priceBreakdown: {
          lineAmounts: [{ currency: 'KRW', value: '900' }],
          productAmount: { currency: 'KRW', value: '900' },
          adjustments: [],
          total: { currency: 'KRW', value: '900' },
          knowledge: 'KNOWN',
        },
      },
    });
    const orders = f.service(),
      receipt = await orders.submit(await f.requestContext(f.seller.customer), input);
    return { f, catalog, query, productRef, offerRef, orders, receipt, draft };
  }
  it('실제 공통 비공개→다른 사람 승인→기업 상품 조회→제출→전체 직원 수락은 최초 스냅샷을 보존한다', async () => {
    const p = await privateOrder(),
      order = (await store.currentProtected('Order', p.receipt.targetRef!.id))!,
      snapshotRef = order.purchaseTermsRef as Ref;
    const bytes = canonicalJson(
      await store.currentProtected('PurchaseTermsSnapshot', snapshotRef.id),
    );
    const accepted = await p.orders.decide(
      await p.f.requestContext(p.f.registrant),
      p.f.decision('ACCEPT', p.receipt.targetRef!),
      p.f.ingress,
    );
    expect(await result(accepted)).toMatchObject({
      order: { state: 'ACCEPTED' },
      decision: { decision: 'ACCEPT' },
    });
    expect(
      canonicalJson(await store.currentProtected('PurchaseTermsSnapshot', snapshotRef.id)),
    ).toBe(bytes);
    expect(
      (await store.currentProtected('PurchaseTermsSnapshot', snapshotRef.id))!.priceBreakdown,
    ).toMatchObject({ total: { value: '900' } });
    await expect(
      p.query.readCommonOffer(await p.f.requestContext(p.f.reviewer.customer), {
        targetRef: p.productRef,
        targetScope: {
          ...p.f.targetScope,
          enterpriseRef: p.f.reviewer.enterpriseRef,
          contextPolicyRef: p.f.reviewer.enterpriseRef,
          organisationRevision: p.f.reviewer.enterpriseRef.revision,
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it.each(['SUSPENDED', 'INCOMPLETE'] as const)(
    '제출 뒤 현재 상품의 실제 %s 개정은 승인 공개가 있어도 전체 수락을 HOLD한다',
    async (state) => {
      const p = await privateOrder(),
        order = (await store.currentProtected('Order', p.receipt.targetRef!.id))!,
        snapshotRef = order.purchaseTermsRef as Ref;
      const bytes = canonicalJson(
        await store.currentProtected('PurchaseTermsSnapshot', snapshotRef.id),
      );
      const draft = structuredClone(p.draft);
      draft.meta = p.f.meta(p.productRef.revision);
      draft.saleState = state === 'SUSPENDED' ? 'SUSPENDED' : 'OFFERABLE';
      if (state === 'INCOMPLETE') draft.offerDraft = null;
      await p.catalog.register(
        await p.f.requestContext(p.f.registrant),
        draft,
        p.productRef,
        p.f.ingress,
      );
      const held = await p.orders.decide(
        await p.f.requestContext(p.f.registrant),
        p.f.decision('ACCEPT', p.receipt.targetRef!),
        p.f.ingress,
      );
      expect(await result(held)).toMatchObject({
        order: { state: 'REVIEW' },
        decision: { decision: 'HOLD' },
      });
      expect(
        canonicalJson(await store.currentProtected('PurchaseTermsSnapshot', snapshotRef.id)),
      ).toBe(bytes);
    },
  );
  it('모든 현재 근거가 확인된 전체만 수락하고 같은 보호 접수의 재시도는 소유자를 다시 호출하지 않는다', async () => {
    const f = await seedDecisionOrder(store),
      bytes = await originalBytes(f);
    let calls = 0;
    const orders = f.service(
        f.registrations(() => {
          calls++;
        }),
      ),
      input = f.decision();
    const receipt = await orders.decide(await f.requestContext(f.registrant), input, f.ingress),
      { order, decision } = await result(receipt);
    expect(order).toMatchObject({
      state: 'ACCEPTED',
      revision: 2,
      purchaseTermsRef: { revision: 1 },
    });
    expect(decision).toMatchObject({
      decision: 'ACCEPT',
      acceptance: 'ACCEPTED',
      observedOrderRevision: 1,
      actorRef: f.registrant.actorAccountRef,
    });
    expect(
      (decision.lineAssessments as { assessments: { knowledge: string }[] }[]).every((line) =>
        line.assessments.every((value) => value.knowledge === 'KNOWN'),
      ),
    ).toBe(true);
    expect(calls).toBe(4);
    expect(await orders.decide(await f.requestContext(f.registrant), input, f.ingress)).toEqual(
      receipt,
    );
    expect(calls).toBe(4);
    expect(await originalBytes(f)).toBe(bytes);
    const read = (await orders.read(
      await f.requestContext(f.seller.customer),
      orderQuery(receipt.targetRef!, f.targetScope),
    )) as { data: U3OrderView };
    expect(read.data.acceptance).toBe('ACCEPTED');
    const payload = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      receipt.requestId,
      store.schema,
    );
    for (const model of [
      'Order',
      'AcceptanceDecision',
      'OrderHistory',
      'RequestReceipt',
      'FactEnvelope',
      'OutboxDelivery',
    ])
      expect(payload.rows.some((row) => row.model === model)).toBe(true);
    expect(payload.rows.find((row) => row.model === 'RequestKey')?.data).toMatchObject({
      owner: 'OrderAcceptance',
      operation: 'decideOrder',
    });
    expect(
      payload.rows
        .filter((row) => row.model !== 'RequestKey')
        .some((row) =>
          ['FinancialSettlement', 'HardwareFulfillment', 'SoftwareLifecycle'].includes(
            modelDefinition(row.model).owner,
          ),
        ),
    ).toBe(false);
  });
  it('기본 미등록은 전체 HOLD/REVIEW이며 나중에 현재 전체 준비가 확인되면 새 개정 판단을 남긴다', async () => {
    const f = await seedDecisionOrder(store),
      bytes = await originalBytes(f);
    const held = await f
      .service([])
      .decide(await f.requestContext(f.registrant), f.decision(), f.ingress);
    expect(await result(held)).toMatchObject({
      order: { state: 'REVIEW', revision: 2 },
      decision: { decision: 'HOLD', acceptance: 'REVIEW_REQUIRED' },
    });
    const accepted = await f
      .service()
      .decide(
        await f.requestContext(f.registrant),
        f.decision('ACCEPT', held.targetRef!),
        f.ingress,
      );
    expect(await result(accepted)).toMatchObject({
      order: { state: 'ACCEPTED', revision: 3 },
      decision: { observedOrderRevision: 2 },
    });
    expect(await originalBytes(f)).toBe(bytes);
  });
  it('100행 중 마지막 한 행만 준비 부족이어도 100행 전체 판단은 HOLD이며 부분 수락하지 않는다', async (test) => {
    const f = await seedDecisionOrder(store, 100, true, false, false, test),
      bytes = await originalBytes(f);
    const orders = f.service(
      f.registrations((value) => {
        if (value.binding.owner === 'HardwareFulfillment') value.lines[99]!.readyQuantity = 0;
      }),
    );
    const context = await f.requestContext(f.registrant);
    const receipt = await profileU3Budget(
        'DECISION_100',
        context,
        () => orders.decide(context, f.decision(), f.ingress),
        test,
      ),
      value = await result(receipt);
    expect(value.order.state).toBe('REVIEW');
    expect(value.decision.decision).toBe('HOLD');
    const assessments = value.decision.lineAssessments as {
      assessments: { knowledge: string }[];
    }[];
    expect(assessments).toHaveLength(100);
    expect(assessments[99]!.assessments[2]!.knowledge).toBe('UNKNOWN');
    expect(await originalBytes(f)).toBe(bytes);
  });
  it('같은 phase 행을 재사용해도 마지막 행의 후단 미보호 변경은 최종 대조에서 판단 전체를 rollback한다', async (test) => {
    const f = await seedDecisionOrder(store, 100, true, false, false, test);
    const original = (await store.currentProtected('Order', f.receipt.targetRef!.id))!;
    const last = (original.lineRefs as Ref[])[99]!;
    const snapshot = canonicalJson(
      await store.currentProtected('PurchaseTermsSnapshot', (original.purchaseTermsRef as Ref).id),
    );
    const before = await sources.primaryAdmin.getRepository('AcceptanceDecision').count();
    const sourcesForDecision = f.registrations();
    const owner = sourcesForDecision.find((source) => source.owner === 'HardwareFulfillment')!;
    if (owner.kind === 'UNREGISTERED') throw new Error('정확한 합성 준비 callback이 필요합니다.');
    const read = owner.readReadiness;
    owner.readReadiness = async (binding, signal) => {
      const observation = await read(binding, signal);
      await sources.primaryAdmin
        .getRepository('OrderLine')
        .update({ lineId: last.id }, { quantity: 2 });
      return observation;
    };
    const input = f.decision(),
      context = await f.requestContext(f.registrant);
    const orders = f.service(sourcesForDecision);
    await expect(
      profileU3Budget(
        'DECISION_100',
        context,
        () => orders.decide(context, input, f.ingress),
        test,
      ),
    ).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(await store.currentProtected('Order', f.receipt.targetRef!.id)).toEqual(original);
    expect(await sources.primaryAdmin.getRepository('AcceptanceDecision').count()).toBe(before);
    expect(
      canonicalJson(
        await store.currentProtected(
          'PurchaseTermsSnapshot',
          (original.purchaseTermsRef as Ref).id,
        ),
      ),
    ).toBe(snapshot);
    await expect(store.currentProtected('OrderLine', last.id)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(
      await orders.commands.original(
        await f.requestContext(context),
        'OrderAcceptance',
        'decideOrder',
        { kind: 'RECORD', recordRef: input.targetRef },
        input,
        { scope: f.targetScope },
      ),
    ).toMatchObject({ knowledge: 'UNKNOWN', requestId: null, reasonCode: 'NO_ORIGINAL' });
  });
  it('총액 UNKNOWN은 준비 소유자 KNOWN만으로 수락하지 않는다', async () => {
    const f = await seedDecisionOrder(store, 1, false);
    const held = await f
      .service()
      .decide(await f.requestContext(f.registrant), f.decision(), f.ingress);
    const value = await result(held);
    expect(value.decision.decision).toBe('HOLD');
    expect(
      (value.decision.lineAssessments as { assessments: { reasonCode: string }[] }[])[0]!
        .assessments[0]!.reasonCode,
    ).toBe('ORDER_PRICE_UNCONFIRMED');
    const snapshot = (await store.currentProtected(
      'PurchaseTermsSnapshot',
      (value.order.purchaseTermsRef as Ref).id,
    ))!;
    expect(snapshot.priceBreakdown).toMatchObject({ knowledge: 'UNKNOWN', total: null });
  });
  it('무관한 새 판매 가격은 기존 주문 금액을 바꾸지 않지만 원래 확인 근거 개정이 취소되면 HOLD다', async () => {
    const f = await seedDecisionOrder(store),
      bytes = await originalBytes(f);
    const draft = catalogInput(f.offerRef);
    draft.meta = f.meta(f.productRef.revision);
    draft.commonPrice = { currency: 'KRW', value: '1500' };
    const price = draft.offerDraft!.conditions.find(
      (condition) => condition.conditionKey === 'PRICE',
    );
    if (!price || price.conditionKey !== 'PRICE') throw new Error('가격 조건이 필요합니다.');
    price.value = { currency: 'KRW', value: '1500' };
    await new U3ProductCatalog(store, f.seller.now, async (proof) => proof === f.ingress).register(
      await f.requestContext(f.registrant),
      draft,
      f.productRef,
      f.ingress,
    );
    const held = await f
      .service()
      .decide(await f.requestContext(f.registrant), f.decision('HOLD'), f.ingress);
    expect((await result(held)).decision.lineAssessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessments: expect.arrayContaining([
            expect.objectContaining({ sourceOwner: 'CommercialAgreement', knowledge: 'KNOWN' }),
          ]),
        }),
      ]),
    );
    const proofRef = f.evidence[0]!,
      proof = (await store.currentProtected('VerificationEvidence', proofRef.id))!;
    await store.execute(
      {
        principalId: 'synthetic-proof-revocation',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-proof-revocation',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put(
          'VerificationEvidence',
          { ...proof, state: 'REVOKED', revision: Number(proof.revision) + 1 },
          Number(proof.revision),
        );
      },
    );
    const again = await f
      .service()
      .decide(
        await f.requestContext(f.registrant),
        f.decision('ACCEPT', held.targetRef!),
        f.ingress,
      );
    expect((await result(again)).decision.decision).toBe('HOLD');
    expect(await originalBytes(f)).toBe(bytes);
  });
  it('만료·다른 회사·불일치 source·조회 실패는 업무 HOLD를 남기며 client 주장으로 대체하지 않는다', async () => {
    const f = await seedDecisionOrder(store);
    let target = f.receipt.targetRef!;
    for (const change of [
      (value: ReturnType<typeof f.observe>) => {
        value.expiresAt = '2000-01-01T00:00:00.000Z';
      },
      (value: ReturnType<typeof f.observe>) => {
        value.binding.enterpriseRef.id = 'foreign';
      },
      (value: ReturnType<typeof f.observe>) => {
        value.sourceRefs = [];
      },
    ]) {
      const held = await f
        .service(f.registrations(change))
        .decide(await f.requestContext(f.registrant), f.decision('ACCEPT', target), f.ingress);
      expect((await result(held)).decision.decision).toBe('HOLD');
      target = held.targetRef!;
    }
    const broken: U3ReadinessRegistration[] = [
      {
        kind: 'LOCAL_SYNTHETIC',
        owner: 'FinancialSettlement',
        ownerRegistration: 'synthetic-unavailable',
        async readReadiness() {
          throw new Error('합성 조회 실패');
        },
      },
    ];
    const held = await f
      .service(broken)
      .decide(await f.requestContext(f.registrant), f.decision('ACCEPT', target), f.ingress);
    expect((await result(held)).decision.decision).toBe('HOLD');
  });
  it('전체 거절에는 사유와 현재 모든 출처의 실제 근거가 필요하고 확정 뒤 결과를 덮어쓰지 않는다', async () => {
    const f = await seedDecisionOrder(store),
      orders = f.service([]),
      bytes = await originalBytes(f);
    const empty = f.decision('REJECT');
    empty.basisRefs = [];
    await expect(
      orders.decide(await f.requestContext(f.registrant), empty, f.ingress),
    ).rejects.toMatchObject({
      code: 'ORDER_DECISION_REASON',
    });
    const incomplete = f.decision('REJECT');
    incomplete.basisRefs = incomplete.basisRefs.slice(0, 1);
    await expect(
      orders.decide(await f.requestContext(f.registrant), incomplete, f.ingress),
    ).rejects.toMatchObject({
      code: 'U3_PROOF_UNCONFIRMED',
    });
    const rejected = await orders.decide(
      await f.requestContext(f.registrant),
      f.decision('REJECT'),
      f.ingress,
    );
    expect(await result(rejected)).toMatchObject({
      order: { state: 'REJECTED' },
      decision: { decision: 'REJECT', acceptance: 'DECLINED' },
    });
    await expect(
      orders.decide(
        await f.requestContext(f.registrant),
        f.decision('HOLD', rejected.targetRef!),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'ORDER_ALREADY_DECIDED' });
    expect(await originalBytes(f)).toBe(bytes);
  });
  it('현재 기업/조직·내부망·정확 개정·직원 권한 회수는 fail closed이며 접수 효과를 만들지 않는다', async () => {
    const f = await seedDecisionOrder(store),
      orders = f.service(),
      bytes = await originalBytes(f);
    await expect(
      orders.decide(await f.requestContext(f.registrant), f.decision(), 'external'),
    ).rejects.toMatchObject({
      code: 'STAFF_NETWORK_REQUIRED',
    });
    const foreign = f.decision();
    foreign.targetScope = {
      ...foreign.targetScope,
      enterpriseRef: f.reviewer.enterpriseRef,
      contextPolicyRef: f.reviewer.enterpriseRef,
      organisationRevision: f.reviewer.enterpriseRef.revision,
    };
    await expect(
      orders.decide(await f.requestContext(f.registrant), foreign, f.ingress),
    ).rejects.toThrow();
    const stale = f.decision('ACCEPT', { ...f.receipt.targetRef!, revision: 2 });
    await expect(
      orders.decide(await f.requestContext(f.registrant), stale, f.ingress),
    ).rejects.toMatchObject({
      code: 'STALE_U3_REFERENCE',
    });
    const requireStaff = orders.commands.authorization.requireStaff.bind(
      orders.commands.authorization,
    );
    let revoked = false;
    vi.spyOn(orders.commands.authorization, 'requireStaff').mockImplementation(async (...args) => {
      await requireStaff(...args);
      if (!revoked) {
        revoked = true;
        await new StaffAccess(store, f.seller.now).grantRole(f.seller.staff, {
          meta: f.meta(Number(f.seller.staffGrant.revision)),
          accountRef: f.registrant.actorAccountRef!,
          roleRef: {
            owner: 'EnterpriseAccess',
            entity: 'StaffRole',
            id: String(f.seller.staffRole.staffRoleId),
            revision: Number(f.seller.staffRole.revision),
          },
          decision: 'REVOKE',
        });
      }
    });
    const request = f.decision();
    await expect(
      orders.decide(await f.requestContext(f.registrant), request, f.ingress),
    ).rejects.toMatchObject({
      code: 'ACTION_DENIED',
    });
    expect(
      await store.list('RequestReceipt', {
        equals: { idempotencyKey: request.meta.clientRequestId },
      }),
    ).toHaveLength(0);
    expect(await originalBytes(f)).toBe(bytes);
  });
  it('후단 소유자 개정 변경·행 기록 실패는 전체 롤백하고 응답 유실 재시도는 원래 성공만 반환한다', async () => {
    const f = await seedDecisionOrder(store),
      bytes = await originalBytes(f);
    let hardwareCalls = 0;
    const unstable = f.service(
      f.registrations((value) => {
        if (value.binding.owner === 'HardwareFulfillment' && ++hardwareCalls > 1) {
          value.sourceRef.revision++;
          value.sourceRefs = [value.sourceRef];
        }
      }),
    );
    await expect(
      unstable.decide(await f.requestContext(f.registrant), f.decision(), f.ingress),
    ).rejects.toMatchObject({
      code: 'ORDER_READINESS_CHANGED',
    });
    expect((await store.currentProtected('Order', f.receipt.targetRef!.id))!.revision).toBe(1);
    const put = ProtectedTransaction.prototype.put;
    const failed = vi
      .spyOn(ProtectedTransaction.prototype, 'put')
      .mockImplementation(async function (this: ProtectedTransaction, model, data, revision) {
        await put.call(this, model, data, revision);
        if (model === 'Order' && data.revision === 2)
          throw new OmsError(503, 'SYNTHETIC_DECISION_ROLLBACK', '판단 이후 합성 실패');
      });
    await expect(
      f.service().decide(await f.requestContext(f.registrant), f.decision(), f.ingress),
    ).rejects.toMatchObject({
      code: 'SYNTHETIC_DECISION_ROLLBACK',
    });
    failed.mockRestore();
    expect((await store.currentProtected('Order', f.receipt.targetRef!.id))!.revision).toBe(1);
    let calls = 0,
      once = true;
    const orders = f.service(
        f.registrations(() => {
          calls++;
        }),
      ),
      input = f.decision(),
      validate = store.schema.validateUri.bind(store.schema);
    const lost = vi.spyOn(store.schema, 'validateUri').mockImplementation((uri, data) => {
      if (once && uri === U3_PROFILE + '#/$defs/Receipt') {
        once = false;
        throw new OmsError(503, 'SYNTHETIC_DECISION_RESPONSE_LOSS', '보호 이후 합성 응답 유실');
      }
      return validate(uri, data);
    });
    await expect(
      orders.decide(await f.requestContext(f.registrant), input, f.ingress),
    ).rejects.toMatchObject({
      code: 'SYNTHETIC_DECISION_RESPONSE_LOSS',
    });
    lost.mockRestore();
    const receipt = await orders.decide(await f.requestContext(f.registrant), input, f.ingress);
    expect((await result(receipt)).decision.decision).toBe('ACCEPT');
    expect(calls).toBe(4);
    expect(await orders.decide(await f.requestContext(f.registrant), input, f.ingress)).toEqual(
      receipt,
    );
    expect(calls).toBe(4);
    expect(await originalBytes(f)).toBe(bytes);
  });
  it('같은 개정의 동시 전체 판단은 하나만 성공하며 잠금 거절 뒤 동일 입력도 stale로 원래 결과를 보존한다', async () => {
    const f = await seedDecisionOrder(store),
      orders = f.service(),
      bytes = await originalBytes(f);
    const inputs = [f.decision(), f.decision()];
    const contexts = [await f.requestContext(f.registrant), await f.requestContext(f.registrant)];
    const outcomes = await Promise.allSettled(
      inputs.map((input, index) => orders.decide(contexts[index]!, input, f.ingress)),
    );
    expect(outcomes.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((value) => value.status === 'rejected')).toHaveLength(1);
    const loserIndex = outcomes.findIndex((value) => value.status === 'rejected'),
      failed = outcomes[loserIndex],
      winner = outcomes.find((value) => value.status === 'fulfilled');
    if (!failed || failed.status !== 'rejected' || !winner || winner.status !== 'fulfilled')
      throw new Error('동시 판단은 정확히 한 성공과 한 거절이어야 합니다.');
    if (failed.reason instanceof QueryFailedError) {
      expect(failed.reason.driverError.code).toBe('55P03');
      await expect(
        orders.decide(await f.requestContext(f.registrant), inputs[loserIndex]!, f.ingress),
      ).rejects.toMatchObject({ code: 'STALE_U3_REFERENCE' });
    } else expect(failed.reason).toMatchObject({ code: 'STALE_U3_REFERENCE' });
    expect(
      await store.list('RequestReceipt', {
        equals: { idempotencyKey: inputs[loserIndex]!.meta.clientRequestId },
      }),
    ).toHaveLength(0);
    const committed = await result(winner.value);
    expect(committed.order).toMatchObject({ state: 'ACCEPTED', revision: 2 });
    const decisions = await store.list('AcceptanceDecision', {
      equals: { orderRef: { id: f.receipt.targetRef!.id } },
    });
    expect(decisions).toHaveLength(2); // 실제 제출의 초기 HOLD와 승자의 직원 판단 하나
    expect(decisions.filter((decision) => decision.actorRef !== null)).toHaveLength(1);
    expect(
      await store.list('OrderHistory', {
        equals: { afterRef: { id: f.receipt.targetRef!.id, revision: 2 } },
      }),
    ).toHaveLength(1);
    expect(await originalBytes(f)).toBe(bytes);
  });
  it('요청 활성화일과 계약 시작의 불일치는 U6의 정확한 확인 전 HOLD이며 실제/합의 기간을 임의 이동하지 않는다', async () => {
    const f = await seedDecisionOrder(store, 1, true, true, true),
      bytes = await originalBytes(f);
    const held = await f
      .service()
      .decide(await f.requestContext(f.registrant), f.decision(), f.ingress);
    expect((await result(held)).decision.decision).toBe('HOLD');
    const resolved = f.service(
      f.registrations((value) => {
        if (value.binding.owner === 'SoftwareLifecycle')
          for (const line of value.lines) line.activationResolution = 'CONFIRMED';
      }),
    );
    const accepted = await resolved.decide(
      await f.requestContext(f.registrant),
      f.decision('ACCEPT', held.targetRef!),
      f.ingress,
    );
    expect((await result(accepted)).decision.decision).toBe('ACCEPT');
    expect(await originalBytes(f)).toBe(bytes);
  });
});
