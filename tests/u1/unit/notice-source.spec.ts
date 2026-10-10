import { describe, expect, it } from 'vitest';
import type { Ref } from '@oms/contracts';
import type { ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { minimumNoticeSource } from '../../../packages/core/src/notice-source.js';
const account: Ref = { owner: 'IdentityRecovery', entity: 'Account', id: 'one', revision: 1 };
function fixture(
  original: Record<string, unknown>,
  current = original,
  visibleAccount = { active: true, revision: 1 },
  rawAccount = visibleAccount,
) {
  return {
    store: {
      readRevision: async () => original,
      currentProtected: async () => visibleAccount,
    } as unknown as ProtectedStore,
    transaction: {
      get: async (model: string) => (model === 'Account' ? rawAccount : current),
    } as unknown as ProtectedTransaction,
  };
}
const target = (owner: string, entity: string): Ref => ({
  owner,
  entity,
  id: 'source',
  revision: 1,
});
describe('신청/지정/인증/주문의 원래 관계와 현재 수신자·최소내용', () => {
  it('기업 승인은 주문 grant 대신 원래 신청자 관계를 사용한다', async () => {
    const f = fixture({
      applicantAccountRef: account,
      registrationEvidenceRefs: ['sensitive-business-basis'],
    });
    expect(
      await minimumNoticeSource(
        f.store,
        f.transaction,
        target('EnterpriseAccess', 'EnterpriseApplication'),
      ),
    ).toEqual({
      recipient: account,
      text: '기업 이용 신청 결과를 확인해 주세요.',
      loginPath: '/enterprise-applications',
      scope: null,
    });
  });
  it('별도 최초 관리자는 지정 대상 관계의 최소 안내를 생성한다', async () => {
    const f = fixture({ accountRef: account });
    expect(
      (
        await minimumNoticeSource(
          f.store,
          f.transaction,
          target('EnterpriseAccess', 'EnterpriseMembership'),
        )
      ).loginPath,
    ).toBe('/enterprises');
  });
  it('인증 source의 secret/code/credential 원문을 최소 안내로 투영하지 않는다', async () => {
    const f = fixture({
      accountRef: account,
      protectedMethodRef: 'sensitive-reference',
      verifiers: ['sensitive-verifier'],
    });
    const result = await minimumNoticeSource(
      f.store,
      f.transaction,
      target('IdentityRecovery', 'RecoveryCodeSet'),
    );
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(result.loginPath).toBe('/identity');
  });
  it('주문은 원래 requester/문맥만 유지하고 가격/판단 내용을 포함하지 않는다', async () => {
    const scope = { example: 'original-context' };
    const f = fixture({
      requesterAccountRef: account,
      targetScope: scope,
      internalPrice: 'sensitive-price',
    });
    const result = await minimumNoticeSource(
      f.store,
      f.transaction,
      target('OrderAcceptance', 'Order'),
    );
    expect(result.scope).toEqual(scope);
    expect(JSON.stringify(result)).not.toContain('sensitive-price');
  });
  it('미등록 owner/entity 조합은 주문 통지 fallback으로 성공하지 않는다', async () => {
    const f = fixture({ accountRef: account });
    await expect(
      minimumNoticeSource(f.store, f.transaction, target('FinancialSettlement', 'Order')),
    ).rejects.toMatchObject({ code: 'NOTICE_SOURCE_NOT_REGISTERED' });
  });
  it('현재 회수/비활성 계정과 미보호 최신 개정은 즉시 거절한다', async () => {
    for (const f of [
      fixture({ accountRef: account }, undefined, { active: false, revision: 1 }),
      fixture(
        { accountRef: account },
        undefined,
        { active: true, revision: 1 },
        { active: true, revision: 2 },
      ),
    ])
      await expect(
        minimumNoticeSource(f.store, f.transaction, target('IdentityRecovery', 'MfaEnrollment')),
      ).rejects.toMatchObject({ code: 'NOTICE_RECIPIENT_INACTIVE' });
  });
  it('원래 수신자를 다른 현재 관계로 바꾸지 않는다', async () => {
    const f = fixture({ accountRef: account }, { accountRef: { ...account, id: 'other' } });
    await expect(
      minimumNoticeSource(f.store, f.transaction, target('IdentityRecovery', 'ProviderBinding')),
    ).rejects.toMatchObject({ code: 'NOTICE_RELATIONSHIP_CHANGED' });
  });
  it('Account 대신 동일id의 다른 entity를 수신자라고 추측하지 않는다', async () => {
    const f = fixture({ accountRef: { ...account, entity: 'IdentitySession' } });
    await expect(
      minimumNoticeSource(f.store, f.transaction, target('IdentityRecovery', 'MfaEnrollment')),
    ).rejects.toMatchObject({ code: 'NOTICE_RECIPIENT_SOURCE' });
  });
});
