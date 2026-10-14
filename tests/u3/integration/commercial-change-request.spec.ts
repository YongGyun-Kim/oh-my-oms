import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { canonicalJson } from '@oms/contracts';
import type { Ref, TargetScope } from '@oms/contracts';
import { CommercialAgreement, ref } from '@oms/core';
import { ProtectedStore, U3_SOURCE_CONTRACT } from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedAgreementAuthority, syntheticCommercialEvidence } from '../fixtures/agreement.js';
import { fixtureScope } from '../fixtures/identity.js';
import {
  agreementApprovalInput,
  contractChangeInput,
  offerExceptionInput,
  registeredAgreementInput,
} from '../fixtures/agreement-input.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';

describe('고객 변경 요청·승인 예외의 원자 보호와 현재 권한', () => {
  const sources = u3Sources(),
    ingress = 'synthetic-private-ingress';
  let store: ProtectedStore,
    service: CommercialAgreement,
    f: Awaited<ReturnType<typeof seedAgreementAuthority>>;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    f = await seedAgreementAuthority(store);
    service = new CommercialAgreement(
      store,
      f.seller.now,
      async (proof) => proof === ingress,
      syntheticCommercialEvidence,
    );
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  const targetScope = (): TargetScope => ({
    ...fixtureScope(),
    enterpriseRef: f.seller.enterpriseRef,
    contextPolicyRef: f.seller.enterpriseRef,
    organisationRevision: f.seller.enterpriseRef.revision,
  });
  const register = async (visibility = false, future = false) => {
    const input = f.input();
    if (future) {
      input.effectiveWindow = { ...input.effectiveWindow, startAt: '2099-01-01T00:00:00.000Z' };
      input.conditions = input.conditions.map((value) => ({
        ...value,
        effectiveWindow: input.effectiveWindow,
      }));
    }
    if (visibility)
      input.conditions.push({
        conditionKey: 'VISIBILITY',
        value: true,
        effectiveWindow: input.effectiveWindow,
        evidenceRefs: input.agreementEvidenceRefs,
      });
    registeredAgreementInput('registerAgreement', input);
    const receipt = await service.register(f.registrant, input, ingress),
      value = (await store.currentProtected('AgreementRevision', receipt.targetRef!.id))!;
    return { receipt, value, contractRef: value.contractRef as Ref };
  };
  const approve = (reference: Ref) =>
    service.approve(
      f.approver,
      agreementApprovalInput(reference, f.input().agreementEvidenceRefs),
      ingress,
    );

  // 검증용 protected 변조 후보이며 실제 승인/소속 변경 업무 경로가 아니다.
  const changedAssociation = async (model: string, value: ModelData, change: ModelData) =>
    store.execute(
      {
        principalId: 'synthetic-association-boundary',
        audience: 'SYSTEM',
        owner: 'CommercialAgreement',
        operation: 'fixture-changed-association',
        target: null,
        idempotencyKey: randomUUID(),
        input: { synthetic: true },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
        sourceContract: U3_SOURCE_CONTRACT,
      },
      async (tx) => {
        await tx.put(
          model,
          { ...value, ...change, revision: Number(value.revision) + 1 },
          Number(value.revision),
        );
      },
    );

  it('자기 기업의 정확 계약 요청만 RECEIVED로 보호하고 같은 key는 같은 원래 접수를 반환한다', async () => {
    const { contractRef } = await register(),
      original = canonicalJson(await store.currentProtected('EnterpriseContract', contractRef.id)),
      input = contractChangeInput(targetScope(), contractRef, f.input().agreementEvidenceRefs),
      received = await service.requestChange(f.seller.customer, input);
    const request = await store.currentProtected('ContractChangeRequest', received.targetRef!.id);
    expect(request).toMatchObject({
      state: 'RECEIVED',
      contractRef,
      registeredRevisionRef: null,
      resultRef: null,
      requesterRef: f.seller.customer.actorAccountRef,
    });
    expect(canonicalJson(await store.currentProtected('EnterpriseContract', contractRef.id))).toBe(
      original,
    );
    expect(await service.requestChange(f.seller.customer, input)).toEqual(received);
    expect(await service.originalChangeRequest(f.seller.customer, input)).toEqual({
      knowledge: 'KNOWN',
      receipt: received,
    });
    expect(await store.list('ContractChangeRequest')).toHaveLength(1);
    const candidate = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      received.requestId,
      store.schema,
    );
    expect(candidate.rows.map((row) => row.model)).toEqual([
      'ContractChangeRequest',
      'AgreementHistory',
      'RequestReceipt',
      'FactEnvelope',
      'RequestKey',
    ]);
  });
  it('타 기업 계약·고객 대상 아닌 직원·오래된 개정/조직 문맥은 요청을 만들지 않는다', async () => {
    const { contractRef } = await register(),
      input = contractChangeInput(targetScope(), contractRef);
    await expect(service.requestChange(f.reviewer.customer, input)).rejects.toThrow();
    await expect(service.requestChange(f.registrant, input)).rejects.toThrow();
    await expect(
      service.requestChange(f.seller.customer, {
        ...input,
        meta: { ...input.meta, expectedRevision: contractRef.revision + 1 },
      }),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    await expect(
      service.requestChange(f.seller.customer, {
        ...input,
        targetScope: { ...input.targetScope, organisationRevision: 2 },
      }),
    ).rejects.toThrow();
    expect(await store.list('ContractChangeRequest')).toHaveLength(0);
  });
  it('같은 key의 요청 조건 변경은 원래 접수와 대조하며 새로운 요청으로 확정하지 않는다', async () => {
    const { contractRef } = await register(),
      input = contractChangeInput(targetScope(), contractRef);
    await service.requestChange(f.seller.customer, input);
    const changed = { ...input, requestedTerms: '다른 합성 요청' };
    await expect(service.requestChange(f.seller.customer, changed)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(service.originalChangeRequest(f.seller.customer, changed)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(await store.list('ContractChangeRequest')).toHaveLength(1);
  });
  it('고객 요청→직원 새 개정→다른 사람의 승인 결과를 원자 이력에 연결한다', async () => {
    const { contractRef } = await register(),
      request = await service.requestChange(
        f.seller.customer,
        contractChangeInput(targetScope(), contractRef),
      );
    const input = f.input();
    input.contractRef = contractRef;
    input.meta.expectedRevision = contractRef.revision;
    input.changeRequestRef = request.targetRef;
    registeredAgreementInput('registerAgreement', input);
    const registered = await service.register(f.registrant, input, ingress);
    expect(
      await store.currentProtected('ContractChangeRequest', request.targetRef!.id),
    ).toMatchObject({
      state: 'UNDER_REVIEW',
      registeredRevisionRef: registered.targetRef,
      resultRef: null,
      revision: 2,
    });
    const approved = await approve(registered.targetRef!),
      approvalRef = approved.resultRefs.find((value) => value.entity === 'AgreementApproval');
    expect(
      await store.currentProtected('ContractChangeRequest', request.targetRef!.id),
    ).toMatchObject({
      state: 'RESULT_RECORDED',
      registeredRevisionRef: registered.targetRef,
      resultRef: approvalRef,
      revision: 3,
    });
    const candidate = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      approved.requestId,
      store.schema,
    );
    expect(
      candidate.rows.some((row) => row.model === 'ContractChangeRequest' && row.revision === 3),
    ).toBe(true);
    const replay = { ...input };
    expect(await service.register(f.registrant, replay, ingress)).toEqual(registered);
    await expect(
      service.register(
        f.registrant,
        { ...input, meta: { ...input.meta, clientRequestId: 'other-registration' } },
        ingress,
      ),
    ).rejects.toThrow();
  });
  it('승인 전 개정이나 가격/공개가 다른 입력은 예외 승인 우회가 아니다', async () => {
    const { receipt } = await register(true);
    await expect(
      service.registerException(
        f.registrant,
        offerExceptionInput(f.seller.enterpriseRef, f.productRef, receipt.targetRef!),
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'EXCEPTION_APPROVAL_REQUIRED' });
    const approved = await approve(receipt.targetRef!),
      input = offerExceptionInput(f.seller.enterpriseRef, f.productRef, approved.targetRef!);
    await expect(
      service.registerException(
        f.registrant,
        { ...input, price: { currency: 'KRW', value: '800' } },
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'EXCEPTION_CONTENT_MISMATCH' });
    await expect(
      service.registerException(f.registrant, { ...input, visibility: false }, ingress),
    ).rejects.toMatchObject({ code: 'EXCEPTION_CONTENT_MISMATCH' });
    expect(await store.list('EnterpriseOfferException')).toHaveLength(0);
  });
  it('승인된 정확 예외만 기록하고 계약/원래 승인 bytes를 수정하지 않는다', async () => {
    const { receipt, contractRef } = await register(true),
      approved = await approve(receipt.targetRef!),
      before = canonicalJson(
        await store.currentProtected('AgreementRevision', approved.targetRef!.id),
      ),
      originalContract = canonicalJson(
        await store.currentProtected('EnterpriseContract', contractRef.id),
      ),
      input = offerExceptionInput(f.seller.enterpriseRef, f.productRef, approved.targetRef!),
      result = await service.registerException(f.registrant, input, ingress);
    expect(
      await store.readRevision('EnterpriseContract', contractRef.id, contractRef.revision),
    ).toMatchObject({ revision: 1, currentApprovedRevisionRef: null });
    expect(await store.currentProtected('EnterpriseContract', contractRef.id)).toMatchObject({
      revision: 2,
      currentApprovedRevisionRef: approved.targetRef,
    });
    expect(await store.currentProtected('AgreementRevision', approved.targetRef!.id)).toMatchObject(
      { contractRef },
    );
    expect(
      await store.currentProtected('EnterpriseOfferException', result.targetRef!.id),
    ).toMatchObject({
      agreementRevisionRef: approved.targetRef,
      visible: true,
      price: input.price,
    });
    expect(
      canonicalJson(await store.currentProtected('AgreementRevision', approved.targetRef!.id)),
    ).toBe(before);
    expect(canonicalJson(await store.currentProtected('EnterpriseContract', contractRef.id))).toBe(
      originalContract,
    );
    expect(await service.registerException(f.registrant, input, ingress)).toEqual(result);
    const candidate = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      result.requestId,
      store.schema,
    );
    expect(candidate.rows.map((row) => row.model)).toEqual([
      'EnterpriseOfferException',
      'AgreementHistory',
      'RequestReceipt',
      'FactEnvelope',
      'RequestKey',
    ]);
  });
  it('과거 부모와 현재 보호 부모의 기업 소속이 달라지면 예외를 만들지 않는다', async () => {
    const { receipt, contractRef } = await register(true),
      approved = await approve(receipt.targetRef!),
      parent = (await store.currentProtected('EnterpriseContract', contractRef.id))!;
    await changedAssociation('EnterpriseContract', parent, {
      enterpriseRef: f.reviewer.enterpriseRef,
    });
    await expect(
      service.registerException(
        f.registrant,
        offerExceptionInput(f.seller.enterpriseRef, f.productRef, approved.targetRef!),
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'U3_CONTRACT_ASSOCIATION' });
    expect(await store.list('EnterpriseOfferException')).toHaveLength(0);
  });
  it('승인 후 수정된 개정은 과거 승인/부모 개정으로 예외를 재사용하지 않는다', async () => {
    const { receipt } = await register(true),
      approved = await approve(receipt.targetRef!),
      original = (await store.currentProtected('AgreementRevision', approved.targetRef!.id))!;
    await changedAssociation('AgreementRevision', original, {});
    await expect(
      service.registerException(
        f.registrant,
        offerExceptionInput(f.seller.enterpriseRef, f.productRef, approved.targetRef!),
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'STALE_U3_REFERENCE' });
    const revised = (await store.currentProtected('AgreementRevision', approved.targetRef!.id))!;
    await expect(
      service.registerException(
        f.registrant,
        offerExceptionInput(
          f.seller.enterpriseRef,
          f.productRef,
          ref('AgreementRevision', revised),
        ),
        ingress,
      ),
    ).rejects.toThrow();
    expect(await store.list('EnterpriseOfferException')).toHaveLength(0);
  });
  it('현재 부모의 primary-only 변경을 과거 보호 소속으로 덮어 받아들이지 않는다', async () => {
    const { receipt, contractRef } = await register(true),
      approved = await approve(receipt.targetRef!);
    await sources.primaryAdmin
      .getRepository('EnterpriseContract')
      .update({ contractId: contractRef.id }, { revision: 3 });
    await expect(
      service.registerException(
        f.registrant,
        offerExceptionInput(f.seller.enterpriseRef, f.productRef, approved.targetRef!),
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    expect(await store.list('EnterpriseOfferException')).toHaveLength(0);
  });
  it('현재 원본에 위조된 과거 부모 개정을 적어도 보호 원상이 없으면 연결을 거절한다', async () => {
    const { receipt, contractRef } = await register(true),
      approved = await approve(receipt.targetRef!),
      original = (await store.currentProtected('AgreementRevision', approved.targetRef!.id))!;
    await changedAssociation('AgreementRevision', original, {
      contractRef: { ...contractRef, revision: 99 },
    });
    const revised = (await store.currentProtected('AgreementRevision', approved.targetRef!.id))!;
    await expect(
      service.registerException(
        f.registrant,
        offerExceptionInput(
          f.seller.enterpriseRef,
          f.productRef,
          ref('AgreementRevision', revised),
        ),
        ingress,
      ),
    ).rejects.toMatchObject({ code: 'U3_CONTRACT_ASSOCIATION' });
    expect(await store.list('EnterpriseOfferException')).toHaveLength(0);
  });
  it('미등록 근거·내부망 부재·타 기업·회수된 실제 승인자 권한은 예외 기록을 차단한다', async () => {
    const { receipt } = await register(true),
      approved = await approve(receipt.targetRef!),
      input = offerExceptionInput(f.seller.enterpriseRef, f.productRef, approved.targetRef!);
    await expect(
      new CommercialAgreement(store, f.seller.now, async () => true).registerException(
        f.registrant,
        input,
      ),
    ).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    await expect(service.registerException(f.registrant, input, 'outside')).rejects.toMatchObject({
      code: 'STAFF_NETWORK_REQUIRED',
    });
    await expect(
      service.registerException(
        f.registrant,
        { ...input, enterpriseRef: f.reviewer.enterpriseRef },
        ingress,
      ),
    ).rejects.toThrow();
    const grants = await store.list('StaffRoleGrant', {
      equals: { accountRef: { id: f.approver.actorAccountRef!.id }, revokedAt: null },
      limit: 100,
    });
    await f.write('fixture-revoke-approver', async (tx) => {
      for (const grant of grants)
        await tx.put(
          'StaffRoleGrant',
          {
            ...grant,
            revokedAt: f.seller.now().toISOString(),
            revision: Number(grant.revision) + 1,
          },
          Number(grant.revision),
        );
    });
    await expect(service.registerException(f.registrant, input, ingress)).rejects.toThrow();
    expect(await store.list('EnterpriseOfferException')).toHaveLength(0);
  });
  it('미래 승인 예외는 미래 구간만 기록하며 현재 승인 포인터/조건을 자동 적용하지 않는다', async () => {
    const { receipt, contractRef } = await register(true, true),
      approved = await approve(receipt.targetRef!),
      result = await service.registerException(
        f.registrant,
        offerExceptionInput(f.seller.enterpriseRef, f.productRef, approved.targetRef!),
        ingress,
      );
    const value = (await store.currentProtected('EnterpriseOfferException', result.targetRef!.id))!;
    expect(value.effectiveWindow).toMatchObject({ startAt: '2099-01-01T00:00:00.000Z' });
    expect(await store.currentProtected('EnterpriseContract', contractRef.id)).toMatchObject({
      currentApprovedRevisionRef: null,
    });
    expect(ref('EnterpriseOfferException', value)).toEqual(result.targetRef);
  });
});
