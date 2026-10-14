import { describe, it, expect } from 'vitest';
import { reviewEvidenceMatches } from '@oms/core';
const r = (entity: string, id = entity, revision = 1) => ({
    owner: 'IdentityRecovery',
    entity,
    id,
    revision,
  }),
  now = new Date('2026-10-10T00:00:00Z');
const source = {
  caseId: 'case',
  accountRef: r('Account'),
  bindingRef: r('ProviderBinding'),
  bindingGeneration: 1,
  securityGeneration: 1,
};
const policy = {
  policyId: 'policy',
  revision: 1,
  active: true,
  synthetic: true,
  purpose: 'RECOVERY',
  requiredSourceKinds: ['SYNTHETIC'],
  expiresAt: new Date(now.getTime() + 10000).toISOString(),
};
const evidence = {
  state: 'CONFIRMED',
  synthetic: true,
  purpose: 'RECOVERY',
  policyRef: r('VerificationPolicy', 'policy'),
  accountRef: source.accountRef,
  bindingRef: source.bindingRef,
  caseRef: r('RecoveryCase', 'case'),
  sourceKind: 'SYNTHETIC',
  expiresAt: new Date(now.getTime() + 10000).toISOString(),
};
describe('현재 복구 검토 근거의 대상/출처/기한', () => {
  it('등록된 합성 정책의 현재 대상 근거는 재검토 입장에만 사용한다', () =>
    expect(reviewEvidenceMatches(evidence, policy, source, now)).toBe(true));
  it('확인되지 않은 근거는 Ref 존재로 승격하지 않는다', () =>
    expect(reviewEvidenceMatches({ ...evidence, state: 'UNCONFIRMED' }, policy, source, now)).toBe(
      false,
    ));
  it('다른 계정/연결/개정 근거를 사용하지 않는다', () => {
    for (const changed of [
      { accountRef: r('Account', 'other') },
      { bindingRef: r('ProviderBinding', 'other') },
      { bindingRef: r('ProviderBinding', 'ProviderBinding', 2) },
    ])
      expect(reviewEvidenceMatches({ ...evidence, ...changed }, policy, source, now)).toBe(false);
  });
  it('다른 원래 case의 근거는 재사용하지 않는다', () =>
    expect(
      reviewEvidenceMatches(
        { ...evidence, caseRef: r('RecoveryCase', 'other') },
        policy,
        source,
        now,
      ),
    ).toBe(false));
  it('다른 목적/정책 개정/미등록 출처를 거절한다', () => {
    for (const changed of [
      { purpose: 'INVITATION_ACCEPTANCE' },
      { policyRef: r('VerificationPolicy', 'policy', 2) },
      { sourceKind: 'EMAIL_ONLY' },
    ])
      expect(reviewEvidenceMatches({ ...evidence, ...changed }, policy, source, now)).toBe(false);
  });
  it('근거와 정책 모두 만료 정각/이후에 유효하지 않다', () => {
    for (const delta of [0, -1]) {
      const expiresAt = new Date(now.getTime() + delta).toISOString();
      expect(reviewEvidenceMatches({ ...evidence, expiresAt }, policy, source, now)).toBe(false);
      expect(reviewEvidenceMatches(evidence, { ...policy, expiresAt }, source, now)).toBe(false);
    }
  });
  it('비활성/다른 목적 정책과 빈 필수 출처를 거절한다', () => {
    for (const changed of [
      { active: false },
      { purpose: 'SAME_PERSON' },
      { requiredSourceKinds: [] },
    ])
      expect(reviewEvidenceMatches(evidence, { ...policy, ...changed }, source, now)).toBe(false);
  });
  it('실제 정책 미확인을 synthetic 필드의 한쪽만으로 채우지 않는다', () => {
    expect(reviewEvidenceMatches({ ...evidence, synthetic: false }, policy, source, now)).toBe(
      false,
    );
    expect(reviewEvidenceMatches(evidence, { ...policy, synthetic: false }, source, now)).toBe(
      false,
    );
  });
});
