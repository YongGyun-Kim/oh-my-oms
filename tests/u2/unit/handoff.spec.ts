import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  recoveryEvidenceMatches,
  handoffSecretBinding,
  PurposeVerifier,
  generatePurposeSecret,
} from '@oms/core';
import type { Ref } from '@oms/contracts';
const r = (entity: string, id = entity, revision = 1): Ref => ({
    owner: 'IdentityRecovery',
    entity,
    id,
    revision,
  }),
  now = new Date('2026-10-09T00:00:00Z'),
  expiresAt = new Date(now.getTime() + 300000).toISOString(),
  source = {
    caseId: 'case',
    accountRef: r('Account'),
    bindingRef: r('ProviderBinding'),
    securityGeneration: 1,
    bindingGeneration: 1,
  },
  party = { partyContextId: 'party', challengeId: 'verified-party-challenge' },
  policy = {
    policyId: 'policy',
    revision: 1,
    purpose: 'RECOVERY',
    active: true,
    synthetic: true,
    requiredSourceKinds: ['SYNTHETIC'],
    expiresAt,
  },
  evidence = {
    evidenceId: 'evidence',
    state: 'CONFIRMED',
    purpose: 'RECOVERY',
    synthetic: true,
    policyRef: r('VerificationPolicy', 'policy'),
    accountRef: r('Account'),
    bindingRef: r('ProviderBinding'),
    caseRef: r('RecoveryCase', 'case'),
    partyContextRef: r('PartyClaimContext', 'party'),
    challengeId: party.challengeId,
    sourceKind: 'SYNTHETIC',
    expiresAt,
  };
describe('원래 확인 party/case와 인계 비밀의 결합', () => {
  it('정확한 현재 local 확인 근거만 인정한다', () =>
    expect(recoveryEvidenceMatches(evidence, policy, source, party, now)).toBe(true));
  it('존재하는 Ref만으로 다른 party/challenge를 확인 완료로 만들지 않는다', () => {
    for (const changed of [
      { partyContextRef: r('PartyClaimContext', 'first-anonymous') },
      { challengeId: 'other' },
    ])
      expect(recoveryEvidenceMatches({ ...evidence, ...changed }, policy, source, party, now)).toBe(
        false,
      );
  });
  it('다른 case/계정/binding 개정은 거절한다', () => {
    for (const changed of [
      { caseRef: r('RecoveryCase', 'other') },
      { accountRef: r('Account', 'other') },
      { bindingRef: r('ProviderBinding', 'ProviderBinding', 2) },
    ])
      expect(recoveryEvidenceMatches({ ...evidence, ...changed }, policy, source, party, now)).toBe(
        false,
      );
  });
  it('미확인/폐기 및 다른 목적의 근거는 권위가 아니다', () => {
    for (const changed of [
      { state: 'UNCONFIRMED' },
      { state: 'REVOKED' },
      { purpose: 'INVITATION_ACCEPTANCE' },
    ])
      expect(recoveryEvidenceMatches({ ...evidence, ...changed }, policy, source, party, now)).toBe(
        false,
      );
  });
  it('미등록/비활성/만료 정책은 합성 근거로 대체하지 않는다', () => {
    for (const changed of [
      { synthetic: false },
      { active: false },
      { revision: 2 },
      { expiresAt: now.toISOString() },
    ])
      expect(recoveryEvidenceMatches(evidence, { ...policy, ...changed }, source, party, now)).toBe(
        false,
      );
  });
  it('근거 정각 만료와 알 수 없는 source kind는 거절한다', () => {
    expect(recoveryEvidenceMatches(evidence, policy, source, party, new Date(expiresAt))).toBe(
      false,
    );
    expect(
      recoveryEvidenceMatches({ ...evidence, sourceKind: 'UNKNOWN' }, policy, source, party, now),
    ).toBe(false);
  });
  it('오입력 counter의 정당한 개정 증가가 원래 code metadata를 바꾸지 않는다', () => {
    const grant = {
        grantId: 'grant',
        revision: 1,
        accountRef: r('Account'),
        bindingRef: r('ProviderBinding'),
        bindingGeneration: 1,
        securityGeneration: 1,
        caseRef: r('RecoveryCase', 'case', 2),
        epoch: 'initial',
        challengeId: party.challengeId,
        keyVersion: 'fixture-key',
      },
      v = new PurposeVerifier(randomBytes(32), 'fixture-key'),
      code = generatePurposeSecret('HANDOFF'),
      digest = v.digest(code, handoffSecretBinding(grant));
    expect(
      v.matches(code, handoffSecretBinding({ ...grant, revision: 5, attemptCount: 4 }), digest),
    ).toBe(true);
    expect(v.matches(generatePurposeSecret('HANDOFF'), handoffSecretBinding(grant), digest)).toBe(
      false,
    );
  });
  it('원래 case revision/세대/target 변경은 같은 code의 재사용이 아니다', () => {
    const grant = {
        grantId: 'grant',
        revision: 1,
        accountRef: r('Account'),
        bindingRef: r('ProviderBinding'),
        bindingGeneration: 1,
        securityGeneration: 1,
        caseRef: r('RecoveryCase', 'case', 2),
        epoch: 'initial',
        challengeId: party.challengeId,
        keyVersion: 'fixture-key',
      },
      v = new PurposeVerifier(randomBytes(32), 'fixture-key'),
      code = generatePurposeSecret('HANDOFF'),
      digest = v.digest(code, handoffSecretBinding(grant));
    for (const change of [
      { grantId: 'other' },
      { caseRef: r('RecoveryCase', 'case', 3) },
      { securityGeneration: 2 },
      { challengeId: 'other' },
    ])
      expect(v.matches(code, handoffSecretBinding({ ...grant, ...change }), digest)).toBe(false);
  });
});
