import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson, OmsError, U3_PROFILE } from '@oms/contracts';
import type { Ref, U3OrderView, U3ProposalView } from '@oms/contracts';
import type {
  U3AfterSalesBinding,
  U3AfterSalesObservation,
  U3AfterSalesRegistration,
} from '@oms/core';
import { ProtectedStore, ProtectedTransaction, decodeAppliedTerms } from '@oms/persistence';
import { QueryFailedError } from 'typeorm';
import type { TestContext } from 'vitest';
import type { U3ApplyOrderChangeInput } from '@oms/contracts';
import type { DiagnosticPhase } from '../../../scripts/u3/pilot-safe-diagnostics.js';
import { profileU3Budget } from '../fixtures/budget-profile.js';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedOrderChange } from '../fixtures/order-change.js';
import { orderQuery } from '../fixtures/order-input.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';

describe('실제 가격 변경·정확한 동의·한 번 적용·다음 제안의 현재 조건', () => {
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
  async function observedApply(
    test: TestContext,
    phase: DiagnosticPhase,
    f: Awaited<ReturnType<typeof seedOrderChange>>,
    input: U3ApplyOrderChangeInput,
  ) {
    const context = await f.requestContext(f.registrant);
    return profileU3Budget(phase, context, () => f.orders.apply(context, input, f.ingress), test);
  }
  async function original(f: Awaited<ReturnType<typeof seedOrderChange>>) {
    const order = (await store.currentProtected('Order', f.orderRef.id))!;
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
  const u7 = (change?: (value: U3AfterSalesObservation) => void): U3AfterSalesRegistration => ({
    kind: 'LOCAL_SYNTHETIC',
    ownerRegistration: 'synthetic-u7',
    async readAfterSalesFacts(binding: U3AfterSalesBinding) {
      const requestRef: Ref = {
        owner: 'AfterSalesDecision',
        entity: 'AfterSalesRequest',
        id: 'synthetic-request',
        revision: 1,
      };
      const observation: U3AfterSalesObservation = {
        binding: structuredClone(binding),
        facts: {
          knowledge: 'KNOWN',
          data: {
            requestRef,
            orderRef: binding.orderRef,
            decisionRef: binding.decisionRef,
            decision: 'ALLOW',
            holdBasisRef: null,
            actualResultRefs: [],
            remainingActionRefs: [],
          },
          sourceRefs: [requestRef, binding.orderRef, binding.decisionRef],
          observedAt: new Date().toISOString(),
        },
        expiresAt: new Date(Date.now() + 30000).toISOString(),
      };
      change?.(observation);
      return observation;
    },
  });
  it('실제1000→900 기업 승인·제안·동의→REVIEW 적용→다음 제안이 현재900을 원래 조건으로 읽는다', async (test) => {
    const f = await seedOrderChange(store),
      bytes = await original(f),
      input = f.application();
    expect(f.display.originalTerms.lines[0]!.price.value).toBe('1000');
    expect(f.display.proposedTerms.lines[0]!.price.value).toBe('900');
    const receipt = await observedApply(test, 'APPLY_REVIEW', f, input),
      applicationRef = receipt.resultRefs.find(
        (reference) => reference.entity === 'OrderChangeApplication',
      )!;
    const application = (await store.currentProtected(
      'OrderChangeApplication',
      applicationRef.id,
    ))!;
    expect(decodeAppliedTerms(application, store.schema)).toMatchObject({
      terms: { lines: [{ price: { value: '900' } }] },
      priceBreakdown: { total: { value: '900' } },
    });
    const current = (await f.orders.read(
      await f.requestContext(f.seller.customer),
      orderQuery(receipt.targetRef!, f.targetScope),
    )) as { data: U3OrderView };
    expect(current.data.currentTermsRef).toEqual(applicationRef);
    expect(current.data.priceBreakdown!.total!.value).toBe('900');
    expect(current.data.lines[0]!.purchasePrice.value).toBe('1000');
    expect(current.data.appliedTerms!.capturedLines[0]!.purchasePrice!.value).toBe('900');
    expect(await original(f)).toBe(bytes);
    expect(
      (await store.currentProtected('CommercialProposal', f.consent.targetRef!.id))!.result,
    ).toBe('CONSENTED'); // 다른 owner 원본은 직접 APPLIED로 쓰지 않는다.
    const displayed = (await f.proposals.read(await f.requestContext(f.seller.customer), {
      targetRef: f.consent.targetRef!,
      targetScope: f.targetScope,
    })) as { data: U3ProposalView };
    expect(displayed.data.state).toBe('APPLIED');
    expect(displayed.data.applicationRefs).toEqual([applicationRef]);
    const nextInput = await f.proposalInput(receipt.targetRef!);
    expect(nextInput.originalTermsRef).toEqual(applicationRef);
    const next = await f.proposals.create(
        await f.requestContext(f.registrant),
        nextInput,
        f.ingress,
      ),
      nextView = (await f.proposals.read(await f.requestContext(f.seller.customer), {
        targetRef: next.targetRef!,
        targetScope: f.targetScope,
      })) as { data: U3ProposalView };
    expect(nextView.data.originalTerms.termsRecordRef).toEqual(applicationRef);
    expect(nextView.data.originalTerms.lines[0]!.price.value).toBe('900');
    expect(nextView.data.originalPriceBreakdown.total!.value).toBe('900');
    const evaluated = await f.orders.decide(
      await f.requestContext(f.registrant),
      f.decision('ACCEPT', receipt.targetRef!),
      f.ingress,
    );
    expect((await store.currentProtected('Order', evaluated.targetRef!.id))!.state).toBe(
      'ACCEPTED',
    );
    const payload = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      receipt.requestId,
      store.schema,
    );
    expect(payload.rows.filter((row) => row.model === 'OrderChangeApplication')).toHaveLength(1);
    expect(
      payload.rows.some(
        (row) =>
          row.model === 'CommercialProposal' ||
          row.model === 'OrderLine' ||
          row.model === 'PurchaseTermsSnapshot',
      ),
    ).toBe(false);
  });
  it('최초 UNKNOWN 합계는0원으로 바꾸지 않고 새 확인900원만 별도 실제 적용한다', async () => {
    const f = await seedOrderChange(store, false, false),
      bytes = await original(f);
    expect(f.display.originalPriceBreakdown).toMatchObject({ knowledge: 'UNKNOWN', total: null });
    const receipt = await f.orders.apply(
      await f.requestContext(f.registrant),
      f.application(),
      f.ingress,
    );
    const current = (await f.orders.read(
      await f.requestContext(f.seller.customer),
      orderQuery(receipt.targetRef!, f.targetScope),
    )) as { data: U3OrderView };
    expect(current.data.priceBreakdown).toMatchObject({
      knowledge: 'KNOWN',
      total: { value: '900' },
    });
    expect(await original(f)).toBe(bytes);
  });
  it('동일 key 응답 유실은 원래 결과를 재사용하고 다른 key의 같은 동의는 두 번 적용하지 않는다', async (test) => {
    const f = await seedOrderChange(store),
      input = f.application(),
      bytes = await original(f),
      validate = store.schema.validateUri.bind(store.schema);
    let once = true;
    const lost = vi.spyOn(store.schema, 'validateUri').mockImplementation((uri, data) => {
      if (once && uri === U3_PROFILE + '#/$defs/Receipt') {
        once = false;
        throw new OmsError(503, 'SYNTHETIC_APPLY_RESPONSE_LOSS', '보호 이후 합성 응답 유실');
      }
      return validate(uri, data);
    });
    await expect(observedApply(test, 'APPLY_RESPONSE_LOSS', f, input)).rejects.toMatchObject({
      code: 'SYNTHETIC_APPLY_RESPONSE_LOSS',
    });
    lost.mockRestore();
    const receipt = await f.orders.apply(await f.requestContext(f.registrant), input, f.ingress);
    expect(await f.orders.apply(await f.requestContext(f.registrant), input, f.ingress)).toEqual(
      receipt,
    );
    await expect(
      f.orders.apply(
        await f.requestContext(f.registrant),
        f.application(receipt.targetRef!),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'CONSENT_ALREADY_APPLIED' });
    expect(
      await store.list('OrderChangeApplication', {
        equals: { consentRef: { id: f.consentRef.id }, actualApplicationResult: 'APPLIED' },
      }),
    ).toHaveLength(1);
    expect(await original(f)).toBe(bytes);
  });
  it('다른 회사/범위·오래된 주문·다른 새 조건·외부망은 효과 없이 거절한다', async () => {
    const f = await seedOrderChange(store),
      bytes = await original(f);
    const foreign = f.application();
    foreign.targetScope = {
      ...foreign.targetScope,
      enterpriseRef: f.reviewer.enterpriseRef,
      contextPolicyRef: f.reviewer.enterpriseRef,
      organisationRevision: f.reviewer.enterpriseRef.revision,
    };
    await expect(
      f.orders.apply(await f.requestContext(f.registrant), foreign, f.ingress),
    ).rejects.toThrow();
    await expect(
      f.orders.apply(
        await f.requestContext(f.registrant),
        f.application({ ...f.orderRef, revision: 2 }),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'STALE_U3_REFERENCE' });
    const wrong = f.application();
    wrong.newTermsRef = f.offerRef;
    await expect(
      f.orders.apply(await f.requestContext(f.registrant), wrong, f.ingress),
    ).rejects.toMatchObject({
      code: 'CONSENT_TARGET_CHANGED',
    });
    await expect(
      f.orders.apply(await f.requestContext(f.registrant), f.application(), 'external'),
    ).rejects.toMatchObject({
      code: 'STAFF_NETWORK_REQUIRED',
    });
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
    expect(await original(f)).toBe(bytes);
  });
  it('현재 고객 동의 권한 회수는 과거 동의 당시 MFA를 새 인증으로 꾸미지 않고 적용을 차단한다', async () => {
    const f = await seedOrderChange(store),
      bytes = await original(f);
    await f.grant('REVOKE');
    const input = f.application();
    await expect(
      f.orders.apply(await f.requestContext(f.registrant), input, f.ingress),
    ).rejects.toThrow();
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
    expect(
      await store.list('RequestReceipt', {
        equals: { idempotencyKey: input.meta.clientRequestId },
      }),
    ).toHaveLength(0);
    expect(await original(f)).toBe(bytes);
  });
  it('현재 열린 제안의 명시 대체 후 이전 표시 동의를 다시 만들 수 없고 적용 원본도 생기지 않는다', async () => {
    const f = await seedOrderChange(store),
      input = await f.proposalInput(),
      opened = await f.proposals.create(await f.requestContext(f.registrant), input, f.ingress);
    const displayed = (await f.proposals.read(await f.requestContext(f.seller.customer), {
      targetRef: opened.targetRef!,
      targetScope: f.targetScope,
    })) as { data: U3ProposalView };
    const replacing = await f.proposalInput();
    replacing.supersedesRef = opened.targetRef!;
    await f.proposals.create(await f.requestContext(f.registrant), replacing, f.ingress);
    const consentInput = {
      meta: f.meta(opened.targetRef!.revision),
      targetScope: f.targetScope,
      proposalRef: opened.targetRef!,
      proposalRevision: displayed.data.proposalRevision,
      termsFingerprint: displayed.data.termsFingerprint,
      decision: 'ACCEPT' as const,
    };
    await expect(
      f.proposals.recordConsent(await f.requestContext(f.seller.customer), consentInput),
    ).rejects.toMatchObject({
      code: 'STALE_U3_REFERENCE',
    });
    const current = { ...opened.targetRef!, revision: opened.targetRef!.revision + 1 };
    await expect(
      f.proposals.recordConsent(await f.requestContext(f.seller.customer), {
        ...consentInput,
        meta: f.meta(current.revision),
        proposalRef: current,
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_PRESENTATION_CHANGED' });
    expect(
      await store.list('CustomerConsent', {
        equals: { proposalRef: { id: opened.targetRef!.id } },
      }),
    ).toHaveLength(0);
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
  });
  it('합의 후 제안의 현재 표시 원본이 변조되면 보안 대조를 유지하고 적용하지 않는다', async () => {
    const f = await seedOrderChange(store),
      bytes = await original(f);
    await sources.primaryApp
      .getRepository('CommercialProposal')
      .update({ proposalId: f.consent.targetRef!.id }, { termsFingerprint: 'c'.repeat(64) });
    await expect(
      f.orders.apply(await f.requestContext(f.registrant), f.application(), f.ingress),
    ).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
    expect(await original(f)).toBe(bytes);
  });
  it('application 이후 실패와 별도 보호 실패는 주문·적용·접수를 성공으로 표시하지 않는다', async (test) => {
    const f = await seedOrderChange(store),
      bytes = await original(f),
      put = ProtectedTransaction.prototype.put;
    const failed = vi
      .spyOn(ProtectedTransaction.prototype, 'put')
      .mockImplementation(async function (this: ProtectedTransaction, model, data, revision) {
        await put.call(this, model, data, revision);
        if (model === 'OrderChangeApplication')
          throw new OmsError(503, 'SYNTHETIC_APPLY_ROLLBACK', '적용 기록 이후 합성 실패');
      });
    await expect(observedApply(test, 'APPLY_ROLLBACK', f, f.application())).rejects.toMatchObject({
      code: 'SYNTHETIC_APPLY_ROLLBACK',
    });
    failed.mockRestore();
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
    expect((await store.currentProtected('Order', f.orderRef.id))!.revision).toBe(1);
    const protect = vi
      .spyOn(store, 'protect')
      .mockRejectedValue(new OmsError(503, 'SYNTHETIC_APPLY_PROTECTION', '별도 보호 합성 실패'));
    const input = f.application();
    await expect(observedApply(test, 'APPLY_PROTECTION', f, input)).rejects.toThrow();
    protect.mockRestore();
    expect((await store.read('Order', f.orderRef.id))!.revision).toBe(1);
    expect(
      (await sources.primaryApp.getRepository('Order').findOneBy({ orderId: f.orderRef.id }))!
        .revision,
    ).toBe(2);
    await expect(store.currentProtected('Order', f.orderRef.id)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    const before = await f.orders.commands.original(
      await f.requestContext(f.registrant),
      'OrderAcceptance',
      'applyApprovedChange',
      { kind: 'NONE' },
      input,
      { scope: f.targetScope },
    );
    const committed = await sources.primaryAdmin.query(
      'SELECT "requestId" AS request_id FROM u1_request_receipt WHERE "idempotencyKey"=$1 AND "principalId"=$2 AND audience=\'STAFF\' AND owner=\'OrderAcceptance\' AND operation=\'applyApprovedChange\'',
      [input.meta.clientRequestId, f.registrant.principalId],
    );
    expect(committed).toHaveLength(1);
    expect(before).toEqual({
      knowledge: 'UNKNOWN',
      requestId: committed[0].request_id,
      reasonCode: 'PROTECTION_UNCONFIRMED',
    });
    const receipt = await f.orders.apply(await f.requestContext(f.registrant), input, f.ingress);
    expect(receipt.requestId).toBe(committed[0].request_id);
    expect(receipt.targetRef!.revision).toBe(2);
    expect((await store.currentProtected('Order', f.orderRef.id))!.revision).toBe(2);
    expect(
      await store.list('OrderChangeApplication', {
        equals: { actualApplicationResult: 'APPLIED' },
      }),
    ).toHaveLength(1);
    expect(await original(f)).toBe(bytes);
  });
  it('같은 현재 개정의 전체 수락과 가격 적용은 한 경로만 성공하고 패자 효과를 남기지 않는다', async () => {
    const f = await seedOrderChange(store),
      bytes = await original(f),
      decision = f.decision('ACCEPT', f.orderRef),
      application = f.application();
    expect(decision.meta.clientRequestId).not.toBe(application.meta.clientRequestId);
    const contexts = await Promise.all([
      f.requestContext(f.registrant),
      f.requestContext(f.registrant),
    ]);
    const outcomes = await Promise.allSettled([
      f.orders.decide(contexts[0]!, decision, f.ingress),
      f.orders.apply(contexts[1]!, application, f.ingress),
    ]);
    expect(outcomes.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((value) => value.status === 'rejected')).toHaveLength(1);
    const winnerIndex = outcomes.findIndex((value) => value.status === 'fulfilled'),
      loserIndex = outcomes.findIndex((value) => value.status === 'rejected'),
      winner = outcomes[winnerIndex],
      loser = outcomes[loserIndex];
    if (!winner || winner.status !== 'fulfilled' || !loser || loser.status !== 'rejected')
      throw new Error('수락/적용 경쟁은 정확히 한 성공과 한 거절이어야 합니다.');
    if (loser.reason instanceof QueryFailedError) {
      expect(loser.reason.driverError.code).toBe('55P03');
      const context = await f.requestContext(f.registrant);
      await expect(
        loserIndex === 0
          ? f.orders.decide(context, decision, f.ingress)
          : f.orders.apply(context, application, f.ingress),
      ).rejects.toMatchObject({ code: 'STALE_U3_REFERENCE' });
    } else expect(loser.reason).toMatchObject({ code: 'STALE_U3_REFERENCE' });
    const loserKey = (loserIndex === 0 ? decision : application).meta.clientRequestId;
    expect(
      await store.list('RequestReceipt', { equals: { idempotencyKey: loserKey } }),
    ).toHaveLength(0);
    expect(
      await sources.primaryApp
        .getRepository('RequestReceipt')
        .countBy({ idempotencyKey: loserKey }),
    ).toBe(0);
    const order = (await store.currentProtected('Order', f.orderRef.id))!,
      applications = await store.list('OrderChangeApplication', {
        equals: { orderRef: { id: f.orderRef.id } },
      }),
      decisions = await store.list('AcceptanceDecision', {
        equals: { orderRef: { id: f.orderRef.id } },
      });
    expect(winner.value.targetRef).toEqual({ ...f.orderRef, revision: 2 });
    expect(order).toMatchObject({ revision: 2, state: winnerIndex === 0 ? 'ACCEPTED' : 'REVIEW' });
    expect(applications).toHaveLength(winnerIndex === 1 ? 1 : 0);
    expect(decisions).toHaveLength(winnerIndex === 0 ? 2 : 1);
    expect(order.changeApplicationRefs).toEqual(
      winnerIndex === 1
        ? [
            winner.value.resultRefs.find(
              (reference) => reference.entity === 'OrderChangeApplication',
            ),
          ]
        : [],
    );
    expect(
      await store.list('OrderHistory', {
        equals: { afterRef: { id: f.orderRef.id, revision: 2 } },
      }),
    ).toHaveLength(1);
    expect(await original(f)).toBe(bytes);
  });
  it('같은 현재 개정·동의의 다른 key 동시 적용은 한 적용만 보호하고 패자의 정확 재시도도 stale다', async () => {
    const f = await seedOrderChange(store),
      bytes = await original(f),
      inputs = [f.application(), f.application()];
    expect(inputs[0]!.customerConsentRef).toEqual(inputs[1]!.customerConsentRef);
    expect(inputs[0]!.meta.clientRequestId).not.toBe(inputs[1]!.meta.clientRequestId);
    const contexts = await Promise.all(inputs.map(() => f.requestContext(f.registrant))),
      outcomes = await Promise.allSettled(
        inputs.map((input, index) => f.orders.apply(contexts[index]!, input, f.ingress)),
      );
    expect(outcomes.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((value) => value.status === 'rejected')).toHaveLength(1);
    const loserIndex = outcomes.findIndex((value) => value.status === 'rejected'),
      loser = outcomes[loserIndex],
      winner = outcomes.find((value) => value.status === 'fulfilled');
    if (!loser || loser.status !== 'rejected' || !winner || winner.status !== 'fulfilled')
      throw new Error('동시 적용은 정확히 한 성공과 한 거절이어야 합니다.');
    if (loser.reason instanceof QueryFailedError) {
      expect(loser.reason.driverError.code).toBe('55P03');
      await expect(
        f.orders.apply(await f.requestContext(f.registrant), inputs[loserIndex]!, f.ingress),
      ).rejects.toMatchObject({ code: 'STALE_U3_REFERENCE' });
    } else expect(loser.reason).toMatchObject({ code: 'STALE_U3_REFERENCE' });
    const loserKey = inputs[loserIndex]!.meta.clientRequestId;
    expect(
      await store.list('RequestReceipt', { equals: { idempotencyKey: loserKey } }),
    ).toHaveLength(0);
    expect(
      await sources.primaryApp
        .getRepository('RequestReceipt')
        .countBy({ idempotencyKey: loserKey }),
    ).toBe(0);
    const applicationRef = winner.value.resultRefs.find(
        (reference) => reference.entity === 'OrderChangeApplication',
      )!,
      order = (await store.currentProtected('Order', f.orderRef.id))!;
    expect(winner.value.targetRef).toEqual({ ...f.orderRef, revision: 2 });
    expect(order).toMatchObject({
      state: 'REVIEW',
      revision: 2,
      changeApplicationRefs: [applicationRef],
    });
    expect(
      await store.list('OrderChangeApplication', {
        equals: { consentRef: { id: f.consentRef.id } },
      }),
    ).toHaveLength(1);
    expect(await sources.primaryApp.getRepository('OrderChangeApplication').count()).toBe(1);
    expect(
      await store.list('AcceptanceDecision', { equals: { orderRef: { id: f.orderRef.id } } }),
    ).toHaveLength(1); // 실제 제출의 초기 HOLD만 있고 적용은 수락 판단을 만들지 않는다.
    expect(
      await store.list('OrderHistory', {
        equals: { afterRef: { id: f.orderRef.id, revision: 2 } },
      }),
    ).toHaveLength(1);
    expect(await original(f)).toBe(bytes);
  });
  it('수락 후 변경은 U7 기본 미등록·미확인·다른 결정/주문을 거절하고 정확한 소유자 원본만 한 번 적용한다', async () => {
    const f = await seedOrderChange(store, true),
      bytes = await original(f),
      input = f.application();
    await expect(
      f.orders.apply(await f.requestContext(f.registrant), input, f.ingress),
    ).rejects.toMatchObject({
      code: 'U7_AFTERSALES_UNCONFIRMED',
    });
    for (const change of [
      (value: U3AfterSalesObservation) => {
        value.facts = {
          knowledge: 'UNKNOWN',
          sourceRefs: [],
          observedAt: new Date().toISOString(),
          safeReasonCode: 'UNVERIFIED',
        };
      },
      (value: U3AfterSalesObservation) => {
        value.binding.orderRef.id = 'foreign';
      },
      (value: U3AfterSalesObservation) => {
        if (value.facts.knowledge === 'KNOWN')
          value.facts.data.decisionRef = { ...value.binding.decisionRef, revision: 2 };
      },
    ])
      await expect(
        f.service(u7(change)).apply(await f.requestContext(f.registrant), input, f.ingress),
      ).rejects.toThrow();
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
    const receipt = await f
      .service(u7())
      .apply(await f.requestContext(f.registrant), input, f.ingress);
    expect((await store.currentProtected('Order', f.orderRef.id))!.state).toBe('ACCEPTED');
    expect(receipt.targetRef!.revision).toBe(3);
    expect(await original(f)).toBe(bytes); // mock은 운영 U7 증거나 실제 환불/이행 완료가 아니다.
  });
});
