import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import { Authorization, U4CommercialAdapter, U4PaymentPlan } from '@oms/core';
import { ProtectedTransaction, U4Transaction } from '@oms/persistence';
import { seedU4CommercialPlan } from '../fixtures/commercial-plan.js';
import { persistenceFixture } from '../fixtures/persistence.js';
import { u4Ref } from '../fixtures/contracts.js';

describe('U4 실제 승인 계획·주문·동의와 동일 트랜잭션 권위', () => {
  const { sources, store } = persistenceFixture();
  let f: Awaited<ReturnType<typeof seedU4CommercialPlan>>;
  beforeEach(async () => {
    f = await seedU4CommercialPlan(store);
  });
  const submit = async () => {
    const approved = await f.approve();
    const input = await f.orderInput(approved.targetRef!);
    const receipt = await f.orders().submit(await f.requestContext(f.seller.customer), input);
    return { approved, input, receipt };
  };
  const inspect = async <T>(
    read: (scope: import('@oms/persistence').U4Transaction) => Promise<T>,
  ): Promise<T> => {
    // 조회 검증은 명시 READ ONLY 트랜잭션에서 수행한다. 업무 변경/접수 성공을 만들지 않는다.
    return sources.primaryApp.transaction('READ COMMITTED', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      const control = (
        await manager.query('SELECT epoch FROM u1_recovery_control WHERE singleton=true')
      )[0];
      const rows = await manager.query(
        'SELECT epoch,commit_order FROM u1_protected_prefix ORDER BY epoch',
      );
      const transaction = new ProtectedTransaction(manager, store.schema);
      const scope = new U4Transaction(
        transaction,
        {
          epoch: control.epoch,
          prefixes: rows.map((row: { epoch: string; commit_order: string }) => ({
            epoch: row.epoch,
            commitOrder: Number(row.commit_order),
          })),
        },
        store.schema,
      );
      const result = await read(scope);
      await scope.assertPremises();
      expect(transaction.rows()).toHaveLength(0);
      return result;
    });
  };
  it('다른 사람 승인→혼합200/800 주문→직원 FULL 수락과 실제 개정 접수를 보존한다', async () => {
    const { approved, input, receipt } = await submit();
    expect(await store.currentProtected('Order', receipt.targetRef!.id)).toMatchObject({
      modelVersion: 3,
      paymentKind: 'MIXED',
      state: 'REVIEW',
      paymentPlan: { obligations: [{ amount: { value: '200' } }, { amount: { value: '800' } }] },
    });
    const accepted = await f.orders().decide(
      await f.requestContext(f.registrant),
      {
        meta: f.meta(1),
        targetRef: receipt.targetRef!,
        targetScope: f.targetScope,
        decision: 'ACCEPT',
        basisRefs: [],
      },
      f.ingress,
    );
    expect(accepted.targetRef!.revision).toBe(2);
    expect(await store.currentProtected('Order', receipt.targetRef!.id)).toMatchObject({
      state: 'ACCEPTED',
      revision: 2,
    });
    expect(
      accepted.resultRefs.find((reference) => reference.entity === 'OrderHistory')!.revision,
    ).toBe(2);
    const replay = await f.orders().submit(await f.requestContext(f.seller.customer), input);
    expect(replay.requestId).toBe(receipt.requestId);
    expect(replay.resultRefs).toEqual(receipt.resultRefs);
    const terms = await inspect((scope) => f.orders().current(scope, accepted.targetRef!));
    expect(terms.plan.agreementRevisionRef).toEqual(approved.targetRef);
    expect(await store.list('Invoice')).toHaveLength(0); // 수락은 제공 전 지급 충족을 뜻하지 않는다.
  });
  it('동일 사람 승인과 stale 개정은 승인·포인터를 만들지 않는다', async () => {
    await expect(
      f.plans.approve(await f.requestContext(f.registrant), f.approval(), f.ingress),
    ).rejects.toMatchObject({ code: 'SAME_PERSON_APPROVAL' });
    const stale = f.approval();
    stale.meta.expectedRevision = 2;
    await expect(
      f.plans.approve(await f.requestContext(f.approver), stale, f.ingress),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    expect(await store.list('AgreementApproval')).toHaveLength(0);
    expect(
      await store.currentProtected('AgreementRevision', f.registered.targetRef!.id),
    ).toMatchObject({ state: 'REGISTERED', paymentPlan: null });
  });
  it('미승인 계획은 합성 입력을 준비해도 주문으로 승격하지 않는다', async () => {
    const input = await f.orderInput(f.registered.targetRef!);
    await expect(
      f.orders().submit(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({ code: 'U4_PLAN_UNCONFIRMED' });
    expect(await store.list('Order')).toHaveLength(0);
  });
  it('미등록 사람·합의 원본과 다른 승인 합계를 명시적으로 거절한다', async () => {
    const ordinary = new U4PaymentPlan(
      new U4CommercialAdapter(store, f.seller.now, async () => true),
    );
    await expect(
      ordinary.approve(await f.requestContext(f.approver), f.approval(), f.ingress),
    ).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    const changed = f.registration();
    changed.planDraft.total.value = '1001';
    await expect(
      f.plans.register(await f.requestContext(f.registrant), changed, f.ingress),
    ).rejects.toThrow();
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('직원이 확인하지 않은 전체 금액을0원으로 주문하지 않는다', async () => {
    const approved = await f.approve(),
      input = await f.orderInput(approved.targetRef!);
    input.priceConfirmation = null;
    await expect(
      f.orders().submit(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({ code: 'ORDER_PRICE_UNCONFIRMED' });
    expect(await store.list('OrderLine')).toHaveLength(0);
    expect(await store.list('Order')).toHaveLength(0);
  });
  it('상품 수량의 확인 총액이 승인 계획과 다르면 전체 주문을 롤백한다', async () => {
    const approved = await f.approve(),
      input = await f.orderInput(approved.targetRef!);
    input.lines[0]!.quantity = 2;
    const price = input.priceConfirmation!.priceBreakdown;
    price.lineAmounts[0]!.value = '2000';
    price.productAmount!.value = '2000';
    price.total!.value = '2000';
    await expect(
      f.orders().submit(await f.requestContext(f.seller.customer), input),
    ).rejects.toMatchObject({ code: 'U4_ORDER_UNCONFIRMED' });
    expect(await store.list('Order')).toHaveLength(0);
  });
  it('미등록 지급·이행 판단은 청구 유무를 추정하지 않고 REVIEW/HOLD로 남긴다', async () => {
    const { receipt } = await submit();
    const held = await f.orders([]).decide(
      await f.requestContext(f.registrant),
      {
        meta: f.meta(1),
        targetRef: receipt.targetRef!,
        targetScope: f.targetScope,
        decision: 'ACCEPT',
        basisRefs: [],
      },
      f.ingress,
    );
    expect(held.requestState).toBe('REVIEW_REQUIRED');
    expect(await store.currentProtected('Order', receipt.targetRef!.id)).toMatchObject({
      state: 'REVIEW',
    });
    expect(
      await store.currentProtected(
        'AcceptanceDecision',
        held.resultRefs.find((reference) => reference.entity === 'AcceptanceDecision')!.id,
      ),
    ).toMatchObject({ decision: 'HOLD' });
  });
  it('정확한 고객 동의로 한 번 적용하고 최초 스냅샷·후속 개정 체인을 보존한다', async () => {
    const { receipt, approved } = await submit();
    const snapshot = (await store.currentProtected('Order', receipt.targetRef!.id))!
      .purchaseTermsRef as Ref;
    const bytes = canonicalJson(await store.currentProtected('PurchaseTermsSnapshot', snapshot.id));
    const proposed = await f.proposals.create(
      await f.requestContext(f.registrant),
      await f.proposalInput(receipt.targetRef!, approved.targetRef!),
      f.ingress,
    );
    await f.grantConsent();
    const agreed = await f.proposals.consent(
      await f.requestContext(f.seller.customer),
      await f.consentInput(proposed.targetRef!),
    );
    const consent = agreed.resultRefs.find((reference) => reference.entity === 'CustomerConsent')!;
    const applied = await f.proposals.apply(
      await f.requestContext(f.registrant),
      f.application(receipt.targetRef!, consent, approved.targetRef!),
      f.ingress,
    );
    expect(applied.targetRef!.revision).toBe(2);
    expect(canonicalJson(await store.currentProtected('PurchaseTermsSnapshot', snapshot.id))).toBe(
      bytes,
    );
    const current = await inspect((scope) => f.orders().current(scope, applied.targetRef!));
    expect(current.plan.customerConsentRef).toEqual(consent);
    expect(current.reference.entity).toBe('OrderChangeApplication');
    await expect(
      f.proposals.apply(
        await f.requestContext(f.registrant),
        f.application(applied.targetRef!, consent, approved.targetRef!),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'CONSENT_ALREADY_APPLIED' });
    expect(await store.list('OrderChangeApplication')).toHaveLength(1);
  });
  it('위조한 표시 fingerprint와 존재하지 않는 동의로 조건을 바꾸지 않는다', async () => {
    const { receipt, approved } = await submit();
    const forged = await f.proposalInput(receipt.targetRef!, approved.targetRef!);
    forged.proposedTermsRef = f.offerRef;
    forged.proposedTerms.termsRecordRef = f.offerRef;
    await expect(
      f.proposals.create(await f.requestContext(f.registrant), forged, f.ingress),
    ).rejects.toMatchObject({ code: 'U4_PROPOSAL_CHANGED' });
    expect(await store.list('CommercialProposal')).toHaveLength(0);
    const proposed = await f.proposals.create(
      await f.requestContext(f.registrant),
      await f.proposalInput(receipt.targetRef!, approved.targetRef!),
      f.ingress,
    );
    await f.grantConsent();
    const consent = await f.consentInput(proposed.targetRef!);
    consent.termsFingerprint = '0'.repeat(64);
    await expect(
      f.proposals.consent(await f.requestContext(f.seller.customer), consent),
    ).rejects.toMatchObject({ code: 'U4_PROPOSAL_CHANGED' });
    await expect(
      f.proposals.apply(
        await f.requestContext(f.registrant),
        f.application(
          receipt.targetRef!,
          u4Ref('CommercialAgreement', 'CustomerConsent', 'absent'),
          approved.targetRef!,
        ),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'STALE_U4_REFERENCE' });
    expect(await store.list('CustomerConsent')).toHaveLength(0);
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
  });
  it('실제 적용 자료의 역사 읽기 포트가 기업·범위·상품 타입·행을 바꾸면 체인을 거절한다', async () => {
    const { receipt, approved } = await submit();
    const proposed = await f.proposals.create(
      await f.requestContext(f.registrant),
      await f.proposalInput(receipt.targetRef!, approved.targetRef!),
      f.ingress,
    );
    await f.grantConsent();
    const consented = await f.proposals.consent(
      await f.requestContext(f.seller.customer),
      await f.consentInput(proposed.targetRef!),
    );
    const consent = consented.resultRefs.find(
      (reference) => reference.entity === 'CustomerConsent',
    )!;
    const applied = await f.proposals.apply(
      await f.requestContext(f.registrant),
      f.application(receipt.targetRef!, consent, approved.targetRef!),
      f.ingress,
    );
    for (const change of [
      {
        enterpriseRef: f.reviewer.enterpriseRef,
        targetScope: {
          ...f.targetScope,
          enterpriseRef: f.reviewer.enterpriseRef,
          contextPolicyRef: f.reviewer.enterpriseRef,
          organisationRevision: f.reviewer.enterpriseRef.revision,
        },
      },
      {
        targetScope: {
          ...f.targetScope,
          siteRef: u4Ref('EnterpriseAccess', 'BusinessSite', 'synthetic-other-site'),
        },
      },
      { productType: 'SOFTWARE' },
      { lineRefs: [u4Ref('OrderAcceptance', 'OrderLine', 'synthetic-other-line')] },
    ]) {
      await expect(
        inspect(async (scope) => {
          const reads = scope.readSource();
          // 실제 DB를 조회한 뒤 역사 읽기 경계의 손상 응답만 주입한다. 장부·보호 저장은 대체하지 않는다.
          vi.spyOn(scope, 'readSource').mockReturnValue({
            ...reads,
            readRevision: async (model, id, revision) => {
              const value = await reads.readRevision(model, id, revision);
              return model === 'Order' &&
                id === applied.targetRef!.id &&
                revision === applied.targetRef!.revision
                ? { ...value, ...change }
                : value;
            },
          });
          return f.orders().current(scope, applied.targetRef!);
        }),
      ).rejects.toMatchObject({ code: 'U4_ORDER_TERMS_CHAIN' });
    }
  });
  it('고객의 현재 동의 권한이 없으면 제안 수락을 기록하지 않는다', async () => {
    const { receipt, approved } = await submit();
    const proposed = await f.proposals.create(
      await f.requestContext(f.registrant),
      await f.proposalInput(receipt.targetRef!, approved.targetRef!),
      f.ingress,
    );
    await expect(
      f.proposals.consent(
        await f.requestContext(f.seller.customer),
        await f.consentInput(proposed.targetRef!),
      ),
    ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
    expect(await store.list('CustomerConsent')).toHaveLength(0);
  });
  it('선행 업무 원본이 미보호이면 현재 승인 계획을 사용하지 않는다', async () => {
    const approved = await f.approve();
    await sources.primaryAdmin
      .getRepository('AgreementRevision')
      .update({ agreementRevisionId: approved.targetRef!.id }, { state: 'REJECTED' });
    await expect(
      inspect((scope) => f.plans.current(scope, approved.targetRef!)),
    ).rejects.toMatchObject({ code: 'CURRENT_U4_NOT_PROTECTED' });
  });
  it('허용된 primary heartbeat는 보호 시간을 반환하고 다른 단말 권위 변조는 차단한다', async () => {
    const context = await f.requestContext(f.seller.customer);
    const sessionRef = context.identityAssertionRef!;
    const visible = (await store.currentProtected('IdentitySession', sessionRef.id))!;
    const later = new Date(
      Math.min(
        Date.parse(String(visible.lastActiveAt)) + 1,
        Date.parse(String(visible.deadlineAt)),
      ),
    ).toISOString();
    await sources.primaryAdmin
      .getRepository('IdentitySession')
      .update(
        { sessionId: sessionRef.id },
        { lastActiveAt: later, revision: Number(visible.revision) + 1 },
      );
    const protectedTime = await inspect(async (scope) => {
      await new Authorization(store, f.seller.now, scope.readSource()).identity(
        context,
        scope.transaction,
      );
      return (await scope.readSource().currentProtected('IdentitySession', sessionRef.id))!
        .lastActiveAt;
    });
    expect(protectedTime).toBe(visible.lastActiveAt);
    await sources.primaryAdmin
      .getRepository('IdentitySession')
      .update(
        { sessionId: sessionRef.id },
        { lastActiveAt: new Date(Date.parse(String(visible.deadlineAt)) + 1).toISOString() },
      );
    await expect(
      inspect((scope) => scope.readSource().currentProtected('IdentitySession', sessionRef.id)),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
  it('auth_ready 미확인은 빈 권위 목록도 성공으로 반환하지 않는다', async () => {
    await sources.primaryAdmin.query(
      'UPDATE u1_recovery_control SET auth_ready=false WHERE singleton=true',
    );
    await expect(
      inspect((scope) => scope.readSource().list('Account', { equals: { accountId: 'absent' } })),
    ).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_UNCONFIRMED' });
  });
});
