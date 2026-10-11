import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import type { Ref, U3AgreementRegistrationInput } from '@oms/contracts';
import { CommercialAgreement } from '@oms/core';
import { ProtectedStore } from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedAgreementAuthority, syntheticCommercialEvidence } from '../fixtures/agreement.js';
import { fixtureMeta } from '../fixtures/commercial.js';
import { fixtureScope } from '../fixtures/identity.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';
import { agreementApprovalInput, commercialTermsInput } from '../fixtures/agreement-input.js';

describe('계약 등록·현재 다른 사람 승인·기업 조건의 실제 보호 경계', () => {
  const sources = u3Sources(),
    ingress = 'synthetic-private-ingress';
  let store: ProtectedStore,
    agreement: CommercialAgreement,
    f: Awaited<ReturnType<typeof seedAgreementAuthority>>;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    f = await seedAgreementAuthority(store);
    agreement = new CommercialAgreement(
      store,
      f.seller.now,
      async (proof) => proof === ingress,
      syntheticCommercialEvidence,
    );
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  const register = (data = f.input()) => agreement.register(f.registrant, data, ingress);
  const approve = (
    targetRef: Ref,
    actor = f.approver,
    basisRefs = f.input().agreementEvidenceRefs,
  ) => agreement.approve(actor, agreementApprovalInput(targetRef, basisRefs), ingress);
  const query = () =>
    commercialTermsInput({
      productRef: f.productRef,
      commonOfferRevisionRef: f.offerRef,
      targetScope: {
        ...fixtureScope(),
        enterpriseRef: f.seller.enterpriseRef,
        contextPolicyRef: f.seller.enterpriseRef,
        organisationRevision: f.seller.enterpriseRef.revision,
      },
    });
  const mutate = async (
    model: string,
    value: import('@oms/persistence').ModelData,
    change: Record<string, unknown>,
  ) =>
    f.write('fixture-changed-current-proof', async (tx) =>
      tx.put(
        model,
        { ...value, ...change, revision: Number(value.revision) + 1 },
        Number(value.revision),
      ),
    );
  it('등록은 승인 포인터 없이 저장하고 다른 사람의 정확 승인/이력/계약/근거를 원자 보호한다', async () => {
    const receipt = await register(),
      before = (await store.read('AgreementRevision', receipt.targetRef!.id))!,
      contractRef = before.contractRef as Ref;
    expect(before).toMatchObject({
      state: 'REGISTERED',
      approvalRef: null,
      registeredPersonRef: f.registrant.verifiedPersonRef,
    });
    expect(await store.read('EnterpriseContract', contractRef.id)).toMatchObject({
      currentApprovedRevisionRef: null,
    });
    const approved = await approve(receipt.targetRef!);
    expect(await store.read('AgreementRevision', approved.targetRef!.id)).toMatchObject({
      state: 'APPROVED',
      revision: 2,
    });
    expect(await store.read('EnterpriseContract', contractRef.id)).toMatchObject({
      currentApprovedRevisionRef: approved.targetRef,
      revision: 2,
    });
    const payload = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      approved.requestId,
      store.schema,
    );
    expect(payload.rows.map((value) => value.model)).toEqual([
      'AgreementRevision',
      'AgreementApproval',
      'EnterpriseContract',
      'AgreementHistory',
      'RequestReceipt',
      'FactEnvelope',
      'RequestKey',
    ]);
  });
  it('같은 계정 및 같은 사람의 다른 계정은 승인/포인터를 생성하지 않는다', async () => {
    const receipt = await register();
    await expect(approve(receipt.targetRef!, f.registrant)).rejects.toMatchObject({
      code: 'SAME_PERSON_APPROVAL',
    });
    await expect(
      approve(receipt.targetRef!, {
        ...f.approver,
        verifiedPersonRef: f.registrant.verifiedPersonRef,
      }),
    ).rejects.toMatchObject({ code: 'SAME_PERSON_APPROVAL' });
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('기본 UNREGISTERED 및 사람 원본 부재는 합성 표시를 실제 승인으로 승격하지 않는다', async () => {
    const receipt = await register();
    const ordinary = new CommercialAgreement(store, f.seller.now, async () => true);
    await expect(
      ordinary.approve(f.approver, {
        meta: { ...fixtureMeta(1), clientRequestId: randomUUID() },
        targetRef: receipt.targetRef!,
        decision: 'APPROVE',
        basisRefs: f.input().agreementEvidenceRefs,
      }),
    ).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    await expect(
      approve(receipt.targetRef!, { ...f.approver, verifiedPersonRef: null }),
    ).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('두 번째 필수 proof의 목적이 바뀌면 현재 개정을 조회해도 HOLD한다', async () => {
    const receipt = await register(),
      check = f.personChecks[1]!,
      old = f.evidences.find((value) => value.evidenceId === (check.evidenceRefs as Ref[])[1]!.id)!;
    await mutate('VerificationEvidence', old, { purpose: 'RECOVERY' });
    await expect(approve(receipt.targetRef!)).rejects.toThrow();
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('모든 필수 출처가 없으면 CONFIRMED 사람/정책이라도 승인하지 않는다', async () => {
    const receipt = await register();
    await expect(
      approve(receipt.targetRef!, f.approver, f.input().agreementEvidenceRefs.slice(0, 1)),
    ).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('PersonVerification의 링크 개정이나 정책 개정이 다르면 KNOWN 추정을 하지 않는다', async () => {
    const receipt = await register();
    await mutate('PersonVerification', f.personChecks[1]!, {
      personLinkRef: { ...f.approver.verifiedPersonRef!, revision: 2 },
    });
    await expect(approve(receipt.targetRef!)).rejects.toMatchObject({
      code: 'U3_PROOF_UNCONFIRMED',
    });
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('현재 확인자 권위의 미보호 회수도 승인 결과가 아니다', async () => {
    const receipt = await register();
    await sources.primaryAdmin
      .getRepository('StaffRoleGrant')
      .update(
        { staffGrantId: f.seller.staffGrant.staffGrantId },
        { revokedAt: f.seller.now().toISOString(), revision: 2 },
      );
    await expect(approve(receipt.targetRef!)).rejects.toThrow();
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('기업 가격은 공통 가격을 대체하며 다른 기업 조회에는 적용하지 않는다', async () => {
    const receipt = await register(),
      approved = await approve(receipt.targetRef!);
    const own = await agreement.resolve(f.seller.customer, query());
    expect(own.agreementRevisionRefs).toEqual([approved.targetRef]);
    expect(own.conditionBindings.find((value) => value.conditionKey === 'PRICE')).toMatchObject({
      value: { currency: 'KRW', value: '900' },
      sourceRef: approved.targetRef,
    });
    const otherQuery = {
      ...query(),
      targetScope: {
        ...query().targetScope,
        enterpriseRef: f.reviewer.enterpriseRef,
        contextPolicyRef: f.reviewer.enterpriseRef,
        organisationRevision: f.reviewer.enterpriseRef.revision,
      },
    };
    const other = await agreement.resolve(f.reviewer.customer, otherQuery);
    expect(other.agreementRevisionRefs).toEqual([]);
    expect(other.conditionBindings.find((value) => value.conditionKey === 'PRICE')?.value).toEqual({
      currency: 'KRW',
      value: '1000',
    });
    await expect(agreement.resolve(f.reviewer.customer, query())).rejects.toThrow();
  });
  it('겹친 새 가격은 승인 적용 차단하고 기존 포인터/개정/가격 bytes를 보존한다', async () => {
    const first = await register(),
      approved = await approve(first.targetRef!),
      original = canonicalJson(await store.read('AgreementRevision', approved.targetRef!.id)),
      changed: U3AgreementRegistrationInput = f.input();
    const price = changed.conditions[0]!;
    if (price.conditionKey === 'PRICE') price.value = { currency: 'KRW', value: '800' };
    const second = await register(changed);
    await expect(approve(second.targetRef!)).rejects.toMatchObject({
      code: 'AGREEMENT_CONDITION_CONFLICT',
    });
    expect(canonicalJson(await store.read('AgreementRevision', approved.targetRef!.id))).toBe(
      original,
    );
    expect(await store.list('AgreementApproval')).toHaveLength(1);
    expect(
      (await agreement.resolve(f.seller.customer, query())).conditionBindings.find(
        (value) => value.conditionKey === 'PRICE',
      )?.value,
    ).toEqual({ currency: 'KRW', value: '900' });
  });
  it('미래 승인과 적용 시점은 구분하며 미승인 초안은 현재 조건을 바꾸지 않는다', async () => {
    const future = f.input();
    future.effectiveWindow = { ...future.effectiveWindow, startAt: '2099-01-01T00:00:00.000Z' };
    future.conditions = future.conditions.map((value) => ({
      ...value,
      effectiveWindow: future.effectiveWindow,
    }));
    const receipt = await register(future);
    await approve(receipt.targetRef!);
    const registered = (await store.read('AgreementRevision', receipt.targetRef!.id))!;
    expect(
      await store.read('EnterpriseContract', (registered.contractRef as Ref).id),
    ).toMatchObject({ currentApprovedRevisionRef: null });
    expect((await agreement.resolve(f.seller.customer, query())).agreementRevisionRefs).toEqual([]);
    const pending = await register();
    expect(await store.read('AgreementRevision', pending.targetRef!.id)).toMatchObject({
      state: 'REGISTERED',
    });
    expect(
      (await agreement.resolve(f.seller.customer, query())).conditionBindings.find(
        (value) => value.conditionKey === 'PRICE',
      )?.value,
    ).toEqual({ currency: 'KRW', value: '1000' });
  });
});
