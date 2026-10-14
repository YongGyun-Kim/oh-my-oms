import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fingerprint } from '@oms/contracts';
import { CommercialAgreement } from '@oms/core';
import type { U3OwnerProofBinding, U3OwnerProofResult, U3RegisteredProofOwner } from '@oms/core';
import { ProtectedStore } from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedAgreementAuthority, syntheticCommercialEvidence } from '../fixtures/agreement.js';
import { agreementApprovalInput } from '../fixtures/agreement-input.js';

// 보호된 non-synthetic 모양 + mocked owner callback 연결 시험이며 실제 신원/사업 증명이 아니다.
describe('등록 owner 포트의 실제 보호 경계와 mocked 현재 결정', () => {
  const sources = u3Sources(),
    ingress = 'synthetic-private-ingress';
  let store: ProtectedStore, f: Awaited<ReturnType<typeof seedAgreementAuthority>>;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    f = await seedAgreementAuthority(store, 'MOCK_REGISTERED_OWNER');
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  function service(mode: 'known' | 'unavailable' | 'same' | 'wrong-person-binding' | 'local') {
    const calls: U3OwnerProofBinding[] = [];
    const reply = async (binding: U3OwnerProofBinding): Promise<U3OwnerProofResult> => {
      calls.push(structuredClone(binding));
      if (mode === 'unavailable')
        return {
          knowledge: 'UNAVAILABLE',
          state: 'UNCONFIRMED',
          binding,
          observedAt: f.seller.now().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        };
      return {
        knowledge: 'KNOWN',
        state: 'CONFIRMED',
        binding,
        observedAt: f.seller.now().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
    };
    const owner: U3RegisteredProofOwner = {
      identityNamespace: 'mock-person-owner',
      verifyEvidence: reply,
      verifyPerson: async (binding) => {
        const result = await reply(binding);
        if (mode === 'wrong-person-binding')
          result.binding = { ...binding, approvalDigest: '0'.repeat(64) };
        return {
          ...result,
          personKey:
            mode === 'same'
              ? 'a'.repeat(64)
              : fingerprint({
                  namespace: binding.identityNamespace,
                  person: binding.sourceRefs.find((value) => value.entity === 'VerifiedPersonLink')!
                    .id,
                }),
        };
      },
    };
    const registration =
      mode === 'local'
        ? syntheticCommercialEvidence
        : {
            ...syntheticCommercialEvidence,
            kind: 'REGISTERED_OWNER' as const,
            sourceKinds: ['MOCK_A', 'MOCK_B'],
            owner,
          };
    return {
      calls,
      agreement: new CommercialAgreement(
        store,
        f.seller.now,
        async (proof) => proof === ingress,
        registration,
      ),
    };
  }
  async function run(mode: Parameters<typeof service>[0]) {
    const s = service(mode),
      registered = await s.agreement.register(f.registrant, f.input(), ingress);
    const input = agreementApprovalInput(registered.targetRef!, f.input().agreementEvidenceRefs);
    return { ...s, input };
  }
  it('정확한 보호 graph와 owner evidence/person의 결합이 있어야 승인 기록을 만든다', async () => {
    const s = await run('known'),
      receipt = await s.agreement.approve(f.approver, s.input, ingress);
    expect(await store.read('AgreementRevision', receipt.targetRef!.id)).toMatchObject({
      state: 'APPROVED',
    });
    expect(
      s.calls.some((binding) => binding.purpose === syntheticCommercialEvidence.agreementPurpose),
    ).toBe(true);
    expect(
      s.calls.every(
        (binding) =>
          binding.epoch === 'initial' &&
          binding.targetEnterpriseRef.id === f.seller.enterpriseRef.id &&
          /^[a-f0-9]{64}$/.test(binding.approvalDigest),
      ),
    ).toBe(true);
    const saved = (await store.list('AgreementApproval'))[0]!;
    expect(saved).not.toHaveProperty('personKey');
    expect(saved).not.toHaveProperty('identityNamespace');
  });
  it('owner 미확인은 bare CONFIRMED non-synthetic 원본으로 대체하지 않는다', async () => {
    const s = await run('unavailable');
    await expect(s.agreement.approve(f.approver, s.input, ingress)).rejects.toMatchObject({
      code: 'U3_PROOF_UNCONFIRMED',
    });
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('독립된 두 CONFIRMED link라도 owner가 같은 사람 key를 확인하면 거절한다', async () => {
    const s = await run('same');
    expect(f.registrant.verifiedPersonRef!.id).not.toBe(f.approver.verifiedPersonRef!.id);
    await expect(s.agreement.approve(f.approver, s.input, ingress)).rejects.toMatchObject({
      code: 'SAME_PERSON_APPROVAL',
    });
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('person owner의 다른 승인 결합은 KNOWN이어도 HOLD한다', async () => {
    const s = await run('wrong-person-binding');
    await expect(s.agreement.approve(f.approver, s.input, ingress)).rejects.toMatchObject({
      code: 'U3_PROOF_UNCONFIRMED',
    });
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
  it('non-synthetic 모양을 local 등록으로 승인하지 않는다', async () => {
    const s = await run('local');
    await expect(s.agreement.approve(f.approver, s.input, ingress)).rejects.toMatchObject({
      code: 'U3_PROOF_UNCONFIRMED',
    });
    expect(await store.list('AgreementApproval')).toHaveLength(0);
  });
});
