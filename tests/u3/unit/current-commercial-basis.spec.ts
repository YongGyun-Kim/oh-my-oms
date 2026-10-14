import { afterEach, describe, expect, it, vi } from 'vitest';
import { Authorization, U3CurrentBasis } from '@oms/core';
import { fingerprint, SchemaValidator, ExecutionBudget } from '@oms/contracts';
import type {
  U3RegisteredProofOwner,
  U3OwnerProofBinding,
  U3ApprovalProofContext,
  U3OwnerProofResult,
} from '@oms/core';
import type { ModelData, ProtectedStore, U3Transaction } from '@oms/persistence';
import { fixtureRef } from '../fixtures/identity.js';
import { syntheticCommercialEvidence } from '../fixtures/agreement.js';

const at = new Date('2026-10-12T00:00:00.000Z'),
  account = fixtureRef('IdentityRecovery', 'Account', 'account'),
  authority = fixtureRef('IdentityRecovery', 'Account', 'confirmer'),
  policyRef = fixtureRef('IdentityRecovery', 'VerificationPolicy', 'policy'),
  bindingRef = fixtureRef('IdentityRecovery', 'ProviderBinding', 'binding'),
  refs = ['a', 'b'].map((id) => fixtureRef('IdentityRecovery', 'VerificationEvidence', id));
function host(owner?: U3RegisteredProofOwner) {
  const policy: ModelData = {
    purpose: 'CONTRACT_AGREEMENT',
    active: true,
    synthetic: !owner,
    expiresAt: '2026-10-13T00:00:00.000Z',
    requiredSourceKinds: ['SYNTHETIC_A', 'SYNTHETIC_B'],
  };
  const data: Record<string, ModelData> = {
    policy,
    account: { active: true },
    confirmer: { active: true },
    binding: { active: true, accountRef: account },
  };
  for (const [index, reference] of refs.entries())
    data[reference.id] = {
      purpose: 'CONTRACT_AGREEMENT',
      policyRef,
      accountRef: account,
      bindingRef,
      authorityRef: authority,
      enterpriseRef: null,
      sourceKind: index === 0 ? 'SYNTHETIC_A' : 'SYNTHETIC_B',
      state: 'CONFIRMED',
      synthetic: !owner,
      observedAt: '2026-10-11T00:00:00.000Z',
      expiresAt: '2026-10-13T00:00:00.000Z',
    };
  data.enterprise = {};
  const store = {
    schema: new SchemaValidator(),
    currentEpoch: async () => 'initial',
  } as ProtectedStore;
  const basis = new U3CurrentBasis(
      store,
      () => at,
      owner
        ? { ...syntheticCommercialEvidence, kind: 'REGISTERED_OWNER', owner }
        : syntheticCommercialEvidence,
    ),
    current = vi.fn(async (reference: typeof account) => data[reference.id]!);
  const scope = { current, transaction: {} } as unknown as U3Transaction;
  const issuer = vi
    .spyOn(Authorization.prototype, 'requireStaffSource')
    .mockResolvedValue(undefined);
  return { basis, scope, data, issuer };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('U3 결정의 목적/출처 완전성 — 단위, 실제 원본 대조는 통합에서 검증', () => {
  it('일반 호출의 UNREGISTERED는 합성 KNOWN 주장으로 활성화되지 않는다', () => {
    expect(() =>
      new U3CurrentBasis({} as ProtectedStore, () => at).requireRegistration(),
    ).toThrow();
  });
  it('두 필수 출처를 각각 검사하고 동일한 정확 확인자의 현재 권위를 전후 한 번씩 확인한다', async () => {
    const f = host();
    await f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null);
    expect(f.issuer).toHaveBeenCalledTimes(2);
    expect(f.issuer).toHaveBeenCalledWith(authority, 'identity.person.verify', f.scope.transaction);
  });
  it('다른 확인자는 합치지 않으며 같은 확인자도 다음 phase에서 다시 검사한다', async () => {
    const f = host(),
      second = { ...authority, id: 'other-confirmer' };
    f.data[second.id] = { active: true };
    f.data.b!.authorityRef = second;
    await f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null);
    expect(f.issuer).toHaveBeenCalledTimes(4);
    expect(f.issuer).toHaveBeenCalledWith(second, 'identity.person.verify', f.scope.transaction);
    f.issuer.mockClear();
    await f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null);
    expect(f.issuer).toHaveBeenCalledTimes(4);
  });
  it('확인자의 후단 현재 권위가 회수되면 앞선 검사 결과를 재사용하지 않는다', async () => {
    const f = host();
    f.issuer.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('합성 권위 회수'));
    await expect(
      f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null),
    ).rejects.toThrow('합성 권위 회수');
    expect(f.issuer).toHaveBeenCalledTimes(2);
  });
  it('필수 두 출처 중 하나가 빠지면 HOLD한다', async () => {
    const f = host();
    await expect(
      f.basis.evidence(f.scope, refs.slice(0, 1), 'CONTRACT_AGREEMENT', account, null),
    ).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
  });
  it('모든 출처를 검사하여 두 번째 출처의 틀린 목적/상태/출처 kind를 거절한다', async () => {
    for (const change of [
      { purpose: 'RECOVERY' },
      { state: 'UNCONFIRMED' },
      { sourceKind: 'UNREGISTERED' },
    ]) {
      const f = host();
      Object.assign(f.data.b!, change);
      await expect(
        f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null),
      ).rejects.toThrow();
    }
  });
  it('subject·기업·binding 또는 PersonVerification 정책 개정이 다른 근거를 거절한다', async () => {
    for (const change of [
      { accountRef: { ...account, revision: 2 } },
      { enterpriseRef: fixtureRef('EnterpriseAccess', 'Enterprise', 'other') },
    ]) {
      const f = host();
      Object.assign(f.data.b!, change);
      await expect(
        f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null),
      ).rejects.toThrow();
    }
    const f = host();
    f.data.binding!.accountRef = { ...account, id: 'different' };
    await expect(
      f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null),
    ).rejects.toThrow();
    await expect(
      host().basis.evidence(host().scope, refs, 'CONTRACT_AGREEMENT', account, null, {
        ...policyRef,
        revision: 2,
      }),
    ).rejects.toThrow();
  });
  it('만료/미래 관측·inactive 정책·실제 출처처럼 바꾼 합성 metadata를 거절한다', async () => {
    for (const change of [
      { expiresAt: at.toISOString() },
      { observedAt: '2026-10-13T00:00:00.000Z' },
      { synthetic: false },
    ]) {
      const f = host();
      Object.assign(f.data.b!, change);
      await expect(
        f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null),
      ).rejects.toThrow();
    }
    const f = host();
    f.data.policy!.active = false;
    await expect(
      f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null),
    ).rejects.toThrow();
  });
  it('동일 계정 또는 동일 사람의 다른 계정은 승인 전에 거절한다', async () => {
    const f = host(),
      link = fixtureRef('IdentityRecovery', 'VerifiedPersonLink', 'same-person');
    await expect(
      f.basis.differentPeople(f.scope, account, link, account, link),
    ).rejects.toMatchObject({ code: 'SAME_PERSON_APPROVAL' });
    await expect(
      f.basis.differentPeople(f.scope, account, link, { ...account, id: 'alias' }, link),
    ).rejects.toMatchObject({ code: 'SAME_PERSON_APPROVAL' });
  });
  it('권위 있는 확인자 행위 권한이 회수되면 근거의 CONFIRMED 표시만으로 승인하지 않는다', async () => {
    const f = host();
    f.issuer.mockRejectedValue(Error('현재 확인자 회수'));
    await expect(
      f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null),
    ).rejects.toThrow('현재 확인자 회수');
  });
});

const decision: U3ApprovalProofContext = {
  epoch: 'initial',
  approvalDigest: fingerprint('server-approval-content'),
  targetEnterpriseRef: fixtureRef('EnterpriseAccess', 'Enterprise', 'enterprise'),
};
const ownerReply = (binding: U3OwnerProofBinding) => ({
  knowledge: 'KNOWN' as const,
  state: 'CONFIRMED' as const,
  binding,
  observedAt: at.toISOString(),
  expiresAt: '2026-10-13T00:00:00.000Z',
});
function registeredOwner() {
  return {
    identityNamespace: 'mock-person-owner',
    verifyEvidence: vi.fn(async (binding: U3OwnerProofBinding): Promise<U3OwnerProofResult> =>
      ownerReply(binding),
    ),
    verifyPerson: vi.fn(async (binding: U3OwnerProofBinding): Promise<U3OwnerProofResult> => ({
      ...ownerReply(binding),
      personKey: fingerprint(binding.subjectRef.id),
    })),
  };
}
describe('서버 등록 real-owner 포트 — mocked callback 계약만 검증, 운영 증명이 아님', () => {
  it('AbortSignal을 무시한 owner도 원래 남은 예산에서 종료하고 늦은 결과를 적용하지 않는다', async () => {
    const owner = registeredOwner(),
      f = host(owner);
    let late: (() => void) | undefined;
    owner.verifyEvidence.mockImplementation(
      (binding) =>
        new Promise((resolve) => {
          late = () => resolve(ownerReply(binding));
        }),
    );
    const pending = new ExecutionBudget(25).run(() =>
      f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null, undefined, decision),
    );
    await expect(pending).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    expect(owner.verifyEvidence).toHaveBeenCalledOnce();
    expect(f.issuer).toHaveBeenCalledTimes(1);
    late?.();
    await Promise.resolve();
    expect(f.issuer).toHaveBeenCalledTimes(1);
  });
  it('운영의 local 합성 등록을 차단하고 서버 등록 real 포트만 지원한다', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => host()).toThrow();
    expect(() => host(registeredOwner()).basis.requireRegistration()).not.toThrow();
  });
  it('person owner도 정확한 보호 link/check/policy와 같은 namespace의 비식별 key를 요구한다', async () => {
    const owner = registeredOwner(),
      f = host(owner),
      personRef = fixtureRef('IdentityRecovery', 'VerifiedPersonLink', 'person');
    const anchor = fixtureRef('IdentityRecovery', 'IdentityHistory', 'history'),
      checkRef = fixtureRef('IdentityRecovery', 'PersonVerification', 'check'),
      receiptRef = fixtureRef('U1Host', 'RequestReceipt', 'receipt');
    f.data.person = {
      personLinkId: 'person',
      accountRefs: [account],
      evidenceRefs: [anchor],
      verifiedAt: at.toISOString(),
    };
    const check = {
      personVerificationId: 'check',
      revision: 1,
      personLinkRef: personRef,
      policyRef,
      evidenceRefs: refs,
      verifiedBy: authority,
      verifiedAt: at.toISOString(),
      expiresAt: '2026-10-13T00:00:00.000Z',
      state: 'CONFIRMED',
    };
    f.data.check = check;
    const history = {
      owner: 'IdentityRecovery',
      actorAccountRef: authority,
      occurredAt: at.toISOString(),
      afterRef: personRef,
      resultRefs: [personRef, checkRef],
      sourceRevision: 1,
      evidenceRefs: refs,
      requestId: receiptRef.id,
    };
    f.data.history = history;
    f.data.receipt = {
      owner: 'IdentityRecovery',
      audience: 'STAFF',
      principalId: authority.id,
      requestState: 'RESULT_RECORDED',
      resultRefs: [anchor, personRef, checkRef],
    };
    f.data.policy!.purpose = syntheticCommercialEvidence.personPurpose;
    for (const reference of refs)
      f.data[reference.id]!.purpose = syntheticCommercialEvidence.personPurpose;
    vi.spyOn(f.basis, 'collection').mockResolvedValue([check]);
    expect(await f.basis.person(f.scope, account, personRef, decision)).toMatchObject({
      identityKey: fingerprint(account.id),
    });
    expect(owner.verifyPerson.mock.calls[0]![0].sourceRefs).toEqual(
      expect.arrayContaining([personRef, policyRef, authority, anchor, receiptRef, ...refs]),
    );
    for (const change of [
      { afterRef: { ...personRef, id: 'other-person' } },
      { sourceRevision: 2 },
      { actorAccountRef: { ...authority, id: 'other-confirmer' } },
      { evidenceRefs: refs.slice(0, 1) },
    ]) {
      f.data.history = { ...history, ...change };
      await expect(f.basis.person(f.scope, account, personRef, decision)).rejects.toMatchObject({
        code: 'U3_PROOF_UNCONFIRMED',
      });
    }
    f.data.history = history;
    owner.verifyPerson.mockImplementation(async (binding) => ({
      ...ownerReply(binding),
      personKey: 'raw-person@example.invalid',
    }));
    await expect(f.basis.person(f.scope, account, personRef, decision)).rejects.toMatchObject({
      code: 'U3_PROOF_UNCONFIRMED',
    });
  });
  it('real 정책/근거와 정확 source refs·기업·epoch·승인 지문 결합을 함께 요구한다', async () => {
    const owner = registeredOwner(),
      f = host(owner);
    await f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null, undefined, decision);
    expect(owner.verifyEvidence).toHaveBeenCalledOnce();
    expect(owner.verifyEvidence.mock.calls[0]![0]).toMatchObject({
      ...decision,
      subjectRef: account,
      enterpriseRef: null,
      identityNamespace: owner.identityNamespace,
      purpose: 'CONTRACT_AGREEMENT',
    });
    expect(owner.verifyEvidence.mock.calls[0]![0].sourceRefs).toEqual(
      expect.arrayContaining([
        ...refs,
        account,
        policyRef,
        bindingRef,
        authority,
        decision.targetEnterpriseRef,
      ]),
    );
  });
  it('approval 지문/epoch 결합이 없거나 현재 epoch와 다르면 owner에 물어보기 전 HOLD한다', async () => {
    const owner = registeredOwner(),
      f = host(owner);
    await expect(
      f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null),
    ).rejects.toThrow();
    await expect(
      f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null, undefined, {
        ...decision,
        epoch: 'old',
      }),
    ).rejects.toThrow();
    expect(owner.verifyEvidence).not.toHaveBeenCalled();
  });
  it.each(['purpose', 'epoch', 'digest', 'company', 'revision', 'namespace'])(
    '다른 %s 결합의 KNOWN 응답은 승인 근거가 아니다',
    async (change) => {
      const owner = registeredOwner(),
        f = host(owner);
      owner.verifyEvidence.mockImplementation(async (binding) => {
        const altered = structuredClone(binding);
        if (change === 'purpose') altered.purpose = 'RECOVERY';
        if (change === 'epoch') altered.epoch = 'old';
        if (change === 'digest') altered.approvalDigest = '0'.repeat(64);
        if (change === 'company') altered.targetEnterpriseRef.id = 'other';
        if (change === 'revision') altered.sourceRefs[0]!.revision++;
        if (change === 'namespace') altered.identityNamespace = 'other';
        return ownerReply(altered);
      });
      await expect(
        f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null, undefined, decision),
      ).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    },
  );
  it('owner 조회 불가·만료·UNCONFIRMED는 원본의 CONFIRMED 표시로 대체하지 않는다', async () => {
    for (const response of ['failure', 'expired', 'unconfirmed']) {
      const owner = registeredOwner(),
        f = host(owner);
      owner.verifyEvidence.mockImplementation(async (binding) => {
        if (response === 'failure') throw Error('mock-unavailable');
        return {
          ...ownerReply(binding),
          expiresAt: response === 'expired' ? at.toISOString() : '2026-10-13T00:00:00.000Z',
          state: response === 'unconfirmed' ? 'UNCONFIRMED' : 'CONFIRMED',
        };
      });
      await expect(
        f.basis.evidence(f.scope, refs, 'CONTRACT_AGREEMENT', account, null, undefined, decision),
      ).rejects.toMatchObject({ code: 'U3_PROOF_UNCONFIRMED' });
    }
  });
  it('real 등록에 synthetic true를 섞거나 local 등록에 false를 넣으면 콜백/KNOWN으로 우회하지 못한다', async () => {
    const owner = registeredOwner(),
      real = host(owner);
    real.data.b!.synthetic = true;
    await expect(
      real.basis.evidence(
        real.scope,
        refs,
        'CONTRACT_AGREEMENT',
        account,
        null,
        undefined,
        decision,
      ),
    ).rejects.toThrow();
    expect(owner.verifyEvidence).not.toHaveBeenCalled();
    const local = host();
    local.data.policy!.synthetic = false;
    await expect(
      local.basis.evidence(local.scope, refs, 'CONTRACT_AGREEMENT', account, null),
    ).rejects.toThrow();
  });
  it('서로 다른 link ID도 owner의 동일 namespace canonical person key가 같으면 자기 승인이다', async () => {
    const f = host(registeredOwner()),
      a = fixtureRef('IdentityRecovery', 'VerifiedPersonLink', 'link-a'),
      b = fixtureRef('IdentityRecovery', 'VerifiedPersonLink', 'link-b');
    vi.spyOn(f.basis, 'person')
      .mockResolvedValueOnce({
        link: { personLinkId: a.id, accountRefs: [account] },
        identityKey: 'a'.repeat(64),
      })
      .mockResolvedValueOnce({
        link: { personLinkId: b.id, accountRefs: [{ ...account, id: 'other-account' }] },
        identityKey: 'a'.repeat(64),
      });
    await expect(
      f.basis.differentPeople(
        f.scope,
        account,
        a,
        { ...account, id: 'other-account' },
        b,
        decision,
      ),
    ).rejects.toMatchObject({ code: 'SAME_PERSON_APPROVAL' });
  });
});
