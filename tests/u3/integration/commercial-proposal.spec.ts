import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson, OmsError, U3_PROFILE } from '@oms/contracts';
import type { Ref, U3ConsentInput, U3ProposalInput, U3ProposalView } from '@oms/contracts';
import { CommercialProposal, ref } from '@oms/core';
import type { U3RenewalRegistration } from '@oms/core';
import {
  ProtectedStore,
  ProtectedTransaction,
  U3_SOURCE_CONTRACT,
  decodePayload,
  migrateU3Models,
  storedModelData,
} from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedProposalAuthority } from '../fixtures/proposal.js';
import { syntheticCommercialEvidence } from '../fixtures/agreement.js';
import { registeredProposalInput, proposalPrice } from '../fixtures/proposal-input.js';
import { fixtureRef } from '../fixtures/identity.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';

describe('제안·정확 고객 동의·수동 갱신의 실제 보호 경계', () => {
  const sources = u3Sources();
  let store: ProtectedStore,
    f: Awaited<ReturnType<typeof seedProposalAuthority>>,
    service: CommercialProposal;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    f = await seedProposalAuthority(store);
    service = new CommercialProposal(
      store,
      f.seller.now,
      async (proof) => proof === f.ingress,
      syntheticCommercialEvidence,
    );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  afterEach(() => vi.restoreAllMocks());
  const create = async (input?: U3ProposalInput) => {
    const value = input ?? (await f.input());
    return service.create(await f.requestContext(f.registrant), value, f.ingress);
  };
  const read = async (proposalRef: Ref): Promise<U3ProposalView> => {
    const value = await service.read(
      await f.requestContext(f.seller.customer),
      registeredProposalInput('readProposal', {
        targetRef: proposalRef,
        targetScope: f.targetScope,
      }),
    );
    return (value as { knowledge: 'KNOWN'; data: U3ProposalView }).data;
  };
  const consent = async (
    proposalRef: Ref,
    decision: 'ACCEPT' | 'DECLINE' = 'ACCEPT',
  ): Promise<U3ConsentInput> => {
    const data = await read(proposalRef);
    return registeredProposalInput('recordConsent', {
      meta: f.meta(proposalRef.revision),
      targetScope: f.targetScope,
      proposalRef,
      proposalRevision: data.proposalRevision,
      termsFingerprint: data.termsFingerprint,
      decision,
    });
  };
  async function writeOrder(change: Record<string, unknown>) {
    const current = (await store.currentProtected('Order', f.orderRef.id))!;
    const next = { ...current, ...change, revision: Number(current.revision) + 1 };
    await store.execute(
      {
        principalId: 'synthetic-proposal-order-current',
        audience: 'SYSTEM',
        owner: 'OrderAcceptance',
        operation: 'fixture-current-order',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
        sourceContract: U3_SOURCE_CONTRACT,
      },
      async (tx) => {
        await tx.put('Order', next, Number(current.revision));
      },
    );
    return ref('Order', next);
  }
  it('등록→조회→실제 별도 동의 grant→정확 consent는 원자 보호하고 원래 구매/주문 bytes는 보존한다', async () => {
    await f.approvePrice();
    const original = canonicalJson(
      await store.currentProtected('PurchaseTermsSnapshot', f.snapshotRef.id),
    );
    const created = await create(),
      display = await read(created.targetRef!);
    const primaryRow = (await sources.primaryApp
      .getRepository<ModelData>('CommercialProposal')
      .findOneBy({ proposalId: created.targetRef!.id }))!;
    expect(
      Object.prototype.hasOwnProperty.call(
        storedModelData('CommercialProposal', primaryRow),
        'supersedesRef',
      ),
    ).toBe(false);
    const protectedCreated = (await store.currentProtected(
      'CommercialProposal',
      created.targetRef!.id,
    ))!;
    expect(Object.prototype.hasOwnProperty.call(protectedCreated, 'supersedesRef')).toBe(true);
    expect(protectedCreated.supersedesRef).toBeNull();
    expect(display.proposedTerms.lines[0]!.price.value).toBe('900');
    expect(display.originalTerms.lines[0]!.price.value).toBe('1000');
    expect(display.state).toBe('AWAITING_CONSENT');
    const input = await consent(created.targetRef!);
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({
      code: 'ACTION_DENIED',
    });
    await f.grant();
    const receipt = await service.recordConsent(await f.requestContext(f.seller.customer), input);
    expect(receipt.targetRef!.revision).toBe(2);
    const current = await read(receipt.targetRef!);
    const protectedCurrent = (await store.currentProtected(
      'CommercialProposal',
      receipt.targetRef!.id,
    ))!;
    expect(Object.prototype.hasOwnProperty.call(protectedCurrent, 'supersedesRef')).toBe(true);
    expect(protectedCurrent.supersedesRef).toBeNull();
    expect(current).toMatchObject({
      proposalRevision: 1,
      termsFingerprint: display.termsFingerprint,
      state: 'ACCEPTED',
    });
    const saved = (await store.list('CustomerConsent'))[0]!;
    expect(saved).toMatchObject({
      proposalRef: created.targetRef,
      proposalRevision: 1,
      actorAccountRef: f.seller.customer.actorAccountRef,
      decision: 'ACCEPT',
    });
    expect((saved.evidenceRefs as Ref[]).some((value) => value.entity === 'ScopeV2')).toBe(true);
    expect(await store.currentProtected('Order', f.orderRef.id)).toEqual(f.order);
    expect(
      canonicalJson(await store.currentProtected('PurchaseTermsSnapshot', f.snapshotRef.id)),
    ).toBe(original);
    const payload = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      receipt.requestId,
      store.schema,
    );
    const history = payload.rows.find((row) => row.model === 'AgreementHistory')!;
    expect(history.revision).toBe(2);
    expect(receipt.resultRefs.find((value) => value.entity === 'AgreementHistory')!.revision).toBe(
      2,
    );
    expect(payload.rows.map((row) => row.model)).toEqual([
      'CustomerConsent',
      'CommercialProposal',
      'AgreementHistory',
      'RequestReceipt',
      'FactEnvelope',
      'RequestKey',
    ]);
    expect(() => decodePayload(canonicalJson(payload), store.schema)).not.toThrow();
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
    const proposalBytes = canonicalJson(
      await store.readRevision('CommercialProposal', created.targetRef!.id, 1),
    );
    await migrateU3Models(sources.primaryAdmin);
    expect(
      canonicalJson(await store.readRevision('CommercialProposal', created.targetRef!.id, 1)),
    ).toBe(proposalBytes);
    expect(
      canonicalJson(await store.currentProtected('PurchaseTermsSnapshot', f.snapshotRef.id)),
    ).toBe(original);
  });
  it('보호 commit 이후 응답 schema 유실은 동일 key의 원래 consent/이력만 재사용한다', async () => {
    const created = await create();
    await f.grant();
    const input = await consent(created.targetRef!);
    const validate = store.schema.validateUri.bind(store.schema);
    let once = true;
    const failure = vi.spyOn(store.schema, 'validateUri').mockImplementation((uri, data) => {
      if (once && uri === U3_PROFILE + '#/$defs/Receipt') {
        once = false;
        throw new OmsError(503, 'SYNTHETIC_RESPONSE_LOSS', '보호 후 합성 응답 유실');
      }
      return validate(uri, data);
    });
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({
      code: 'SYNTHETIC_RESPONSE_LOSS',
    });
    failure.mockRestore();
    const receipts = await store.list('RequestReceipt', { equals: { operation: 'recordConsent' } });
    expect(receipts).toHaveLength(1);
    const histories = await store.list('AgreementHistory'),
      saved = await store.list('CustomerConsent');
    const replay = await service.recordConsent(await f.requestContext(f.seller.customer), input);
    expect(replay.requestId).toBe(receipts[0]!.requestId);
    expect(await store.list('CustomerConsent')).toEqual(saved);
    expect(await store.list('AgreementHistory')).toEqual(histories);
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), {
        ...input,
        decision: 'DECLINE',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('명시 새 제안은 이전 OPEN을 대체하고 내용2/저장1의 동의를 정확히 결합한다', async () => {
    const first = await create(),
      old = await consent(first.targetRef!);
    const changed = await f.input();
    changed.supersedesRef = first.targetRef;
    const second = await create(changed);
    expect(
      (await store.currentProtected('CommercialProposal', second.targetRef!.id))!.supersedesRef,
    ).toEqual(first.targetRef);
    await f.grant();
    expect(await store.currentProtected('CommercialProposal', first.targetRef!.id)).toMatchObject({
      result: 'SUPERSEDED',
      revision: 2,
      proposalRevision: 1,
    });
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), old),
    ).rejects.toThrow();
    const input = await consent(second.targetRef!);
    expect(input.proposalRef.revision).toBe(1);
    expect(input.proposalRevision).toBe(2);
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), {
        ...input,
        termsFingerprint: old.termsFingerprint,
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_PRESENTATION_CHANGED' });
    const applied = await service.recordConsent(await f.requestContext(f.seller.customer), input);
    expect(await read(applied.targetRef!)).toMatchObject({
      proposalRevision: 2,
      state: 'ACCEPTED',
    });
    expect((await store.list('CustomerConsent'))[0]).toMatchObject({
      proposalRevision: 2,
      proposalRef: second.targetRef,
    });
  });
  it('제안의 명시 합의 근거가 회수되면 조건/비용이 같아도 새 동의를 기록하지 않는다', async () => {
    const created = await create();
    await f.grant();
    const input = await consent(created.targetRef!);
    const evidence = f.agreementProof[0]!;
    await f.write('fixture-revoked-explicit-proposal-evidence', async (tx) => {
      await tx.put('VerificationEvidence', { ...evidence, state: 'REVOKED', revision: 2 }, 1);
    });
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), input),
    ).rejects.toThrow();
    expect(await store.list('CustomerConsent')).toHaveLength(0);
    expect(await store.currentProtected('CommercialProposal', created.targetRef!.id)).toMatchObject(
      { result: 'OPEN', revision: 1 },
    );
  });
  it('생성 후 승인 기업 가격이 달라지면 이전 표시 fingerprint가 새 조건의 동의가 될 수 없다', async () => {
    const created = await create();
    await f.grant();
    const input = await consent(created.targetRef!);
    await f.approvePrice();
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({
      code: 'U3_PROOF_UNCONFIRMED',
    });
    expect(await store.list('CustomerConsent')).toHaveLength(0);
  });
  it('정확 DECLINE은 원래 조건을 유지하며 읽기·다른 기업·위조 내용 개정은 동의가 아니다', async () => {
    const created = await create(),
      input = await consent(created.targetRef!);
    await f.grant();
    await expect(
      service.recordConsent(await f.requestContext(f.reviewer.customer), input),
    ).rejects.toThrow();
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), {
        ...input,
        proposalRevision: 2,
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_PRESENTATION_CHANGED' });
    expect(await store.list('CustomerConsent')).toHaveLength(0);
    const receipt = await service.recordConsent(await f.requestContext(f.seller.customer), {
      ...input,
      decision: 'DECLINE',
    });
    expect(await read(receipt.targetRef!)).toMatchObject({ state: 'DECLINED' });
    expect(await store.currentProtected('Order', f.orderRef.id)).toEqual(f.order);
  });
  it('현재 주문/기업·근거/가격 조건이 변경되거나 미확인 inline은 제안/동의를 완성하지 않는다', async () => {
    const input = await f.input();
    input.proposedTerms.lines[0]!.price.value = '1';
    input.priceBreakdown = {
      ...proposalPrice(),
      lineAmounts: [{ currency: 'KRW', value: '1' }],
      productAmount: { currency: 'KRW', value: '1' },
      total: { currency: 'KRW', value: '1' },
    };
    await expect(create(input)).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    const created = await create();
    await f.grant();
    const response = await consent(created.targetRef!);
    await writeOrder({ state: 'REJECTED' });
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), response),
    ).rejects.toThrow();
    expect(await store.list('CustomerConsent')).toHaveLength(0);
    const evidence = f.agreementProof[0]!;
    await f.write('fixture-expired-proposal-proof', async (tx) => {
      await tx.put('VerificationEvidence', { ...evidence, state: 'REVOKED', revision: 2 }, 1);
    });
    const fresh = await f.input();
    fresh.targetOrderRef = await writeOrder({ state: 'REVIEW' });
    await expect(create(fresh)).rejects.toThrow();
  });
  it('원래 스냅샷 부모1/현재 주문2는 실제 소속이 유지되면 가능하며 위조 부모/사내망 우회는 거절한다', async () => {
    const input = await f.input();
    input.targetOrderRef = await writeOrder({ state: 'ACCEPTED' });
    const result = await create(input);
    expect((await read(result.targetRef!)).originalTerms.termsRecordRef).toEqual(f.snapshotRef);
    await expect(
      service.create(await f.requestContext(f.registrant), await f.input(), 'external-ingress'),
    ).rejects.toMatchObject({ code: 'STAFF_NETWORK_REQUIRED' });
    const other = await f.input();
    other.targetOrderRef = input.targetOrderRef;
    other.originalTermsRef = fixtureRef('OrderAcceptance', 'PurchaseTermsSnapshot', randomUUID());
    await expect(create(other)).rejects.toMatchObject({ code: 'PROPOSAL_ORIGINAL_TERMS' });
  });
  it('새 필드 미상의 과거 제안은 조회/동의 완료 자료로 추측하지 않는다', async () => {
    const created = await create(),
      data = (await store.currentProtected('CommercialProposal', created.targetRef!.id))!;
    const legacy: ModelData = { ...data, proposalId: randomUUID() };
    delete legacy.originalPriceBreakdown;
    delete legacy.termsFingerprint;
    delete legacy.supersedesRef;
    await store.execute(
      {
        principalId: 'synthetic-old-proposal',
        audience: 'SYSTEM',
        owner: 'CommercialAgreement',
        operation: 'fixture-old-proposal',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
        sourceContract: U3_SOURCE_CONTRACT,
      },
      async (tx) => {
        await tx.put('CommercialProposal', legacy);
      },
    );
    await expect(read(ref('CommercialProposal', legacy))).rejects.toMatchObject({
      code: 'U3_PROOF_UNCONFIRMED',
    });
    await f.grant();
    const input: U3ConsentInput = {
      meta: f.meta(1),
      targetScope: f.targetScope,
      proposalRef: ref('CommercialProposal', legacy),
      proposalRevision: 1,
      termsFingerprint: String(data.termsFingerprint),
      decision: 'ACCEPT',
    };
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({
      code: 'U3_PROOF_UNCONFIRMED',
    });
  });
  it('후단 실패는 전체 후보를 rollback하고 실제 보호된 역할 비활성화는 다음 동의를 차단한다', async () => {
    const created = await create();
    await f.grant();
    const input = await consent(created.targetRef!);
    const put = ProtectedTransaction.prototype.put;
    const failure = vi
      .spyOn(ProtectedTransaction.prototype, 'put')
      .mockImplementation(async function (this: ProtectedTransaction, model, data, revision) {
        await put.call(this, model, data, revision);
        if (model === 'CommercialProposal' && data.result === 'CONSENTED')
          throw new OmsError(503, 'SYNTHETIC_AFTER_CONSENT', '동의 후 합성 실패');
      });
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({
      code: 'SYNTHETIC_AFTER_CONSENT',
    });
    failure.mockRestore();
    expect(await store.list('CustomerConsent')).toHaveLength(0);
    expect(await store.currentProtected('CommercialProposal', created.targetRef!.id)).toMatchObject(
      { result: 'OPEN', revision: 1 },
    );
    await f.roles.deactivateRole(await f.requestContext(f.seller.customer), {
      meta: f.meta(1),
      roleRef: f.consentRole.targetRef!,
    });
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({
      code: 'ACTION_DENIED',
    });
  });
  it('동의 후보에서 다른 소유 역할 원상을 직접 바꾸면 보호 권위 대조가 전체 후보를 rollback한다', async () => {
    const created = await create();
    await f.grant();
    const input = await consent(created.targetRef!);
    const state = (
      await store.list('RoleRevisionState', {
        equals: { roleRef: { id: f.consentRole.targetRef!.id } },
      })
    )[0]!;
    const put = ProtectedTransaction.prototype.put;
    const revoke = vi
      .spyOn(ProtectedTransaction.prototype, 'put')
      .mockImplementation(async function (this: ProtectedTransaction, model, data, revision) {
        await put.call(this, model, data, revision);
        if (model === 'CustomerConsent')
          await put.call(
            this,
            'RoleRevisionState',
            { ...state, active: false, revision: Number(state.revision) + 1 },
            Number(state.revision),
          );
      });
    await expect(
      service.recordConsent(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    revoke.mockRestore();
    expect(await store.list('CustomerConsent')).toHaveLength(0);
    expect(
      await store.currentProtected('RoleRevisionState', String(state.roleStateId)),
    ).toMatchObject({ active: true, revision: state.revision });
    expect(await store.currentProtected('CommercialProposal', created.targetRef!.id)).toMatchObject(
      { result: 'OPEN', revision: 1 },
    );
  });
  it('실제 U6 미등록은 차단하고 mock 소유 원본의 정확 회차만 제안/동의하며 기간은 변경하지 않는다', async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    f = await seedProposalAuthority(store, true);
    const input = await f.input();
    input.targetOrderRef = null;
    input.targetEntitlementRef = fixtureRef(
      'SoftwareLifecycle',
      'EnterpriseEntitlement',
      randomUUID(),
    );
    input.targetRenewalCycleRef = fixtureRef('SoftwareLifecycle', 'RenewalCycle', randomUUID());
    input.originalTermsRef = f.renewalTerms.termsRecordRef;
    const port: U3RenewalRegistration = {
      kind: 'REGISTERED_OWNER',
      ownerRegistration: 'mock-u6-owner',
      async readRenewal(binding) {
        return {
          knowledge: 'KNOWN',
          binding,
          state: 'RENEWABLE',
          productType: 'SOFTWARE',
          originalTerms: f.renewalTerms,
          originalPriceBreakdown: proposalPrice(),
          sourceRefs: [binding.entitlementRef, binding.renewalCycleRef, binding.originalTermsRef],
          observedAt: f.seller.now().toISOString(),
          expiresAt: new Date(f.seller.now().getTime() + 60000).toISOString(),
        };
      },
    };
    service = new CommercialProposal(
      store,
      f.seller.now,
      async () => true,
      syntheticCommercialEvidence,
    );
    await expect(create(input)).rejects.toMatchObject({ code: 'U6_SOURCE_UNCONFIRMED' });
    service = new CommercialProposal(
      store,
      f.seller.now,
      async () => true,
      syntheticCommercialEvidence,
      port,
    );
    const created = await create(input);
    await f.grant();
    const result = await service.recordConsent(
      await f.requestContext(f.seller.customer),
      await consent(created.targetRef!),
    );
    expect(await read(result.targetRef!)).toMatchObject({
      targetRenewalCycleRef: input.targetRenewalCycleRef,
      state: 'ACCEPTED',
    });
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
    expect(await store.list('CustomerConsent')).toHaveLength(1);
    service = new CommercialProposal(
      store,
      f.seller.now,
      async () => true,
      syntheticCommercialEvidence,
      {
        ...port,
        async readRenewal(binding, signal) {
          const result = await port.readRenewal(binding, signal);
          result.binding.renewalCycleRef.revision++;
          return result;
        },
      },
    );
    await expect(create({ ...input, meta: f.meta() })).rejects.toMatchObject({
      code: 'U6_SOURCE_UNCONFIRMED',
    });
  });
});
