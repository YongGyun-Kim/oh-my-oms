import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PurposeVerifier, generatePurposeSecret, canonicalSecretBytes } from '@oms/core';
import type { SecretBinding } from '@oms/core';
const ref = {
  owner: 'IdentityRecovery',
  entity: 'RecoveryHandoffGrant',
  id: 'grant-fixture',
  revision: 1,
};
const binding: SecretBinding = {
  purpose: 'HANDOFF',
  targetRef: ref,
  accountRef: { ...ref, entity: 'Account', id: 'account-fixture' },
  bindingRef: { ...ref, entity: 'ProviderBinding', id: 'binding-fixture' },
  bindingGeneration: 1,
  securityGeneration: 1,
  sourceRevision: 1,
  epoch: 'initial',
  challengeId: 'challenge-fixture',
  keyVersion: 'synthetic-key-1',
};
describe('purpose HMAC는 candidate bytes와 원래 metadata를 함께 검증', () => {
  const verifier = new PurposeVerifier(randomBytes(32), binding.keyVersion),
    secret = generatePurposeSecret('HANDOFF');
  it('96bit 난수의 정규16문자와 정확32byte 다른 목적을 만든다', () => {
    expect(secret).toHaveLength(16);
    expect(canonicalSecretBytes(secret, 'HANDOFF')).toHaveLength(12);
    expect(
      canonicalSecretBytes(generatePurposeSecret('PARTY_CONTEXT'), 'PARTY_CONTEXT'),
    ).toHaveLength(32);
  });
  it('동일 비밀/metadata/키는 동일 digest와 true 비교다', () => {
    const digest = verifier.digest(secret, binding);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(verifier.matches(secret, binding, digest)).toBe(true);
  });
  it('metadata가 같아도 candidate 한 byte 변경은 반드시 실패다', () => {
    const bytes = canonicalSecretBytes(secret, 'HANDOFF');
    bytes[0] = bytes[0]! ^ 1;
    expect(
      verifier.matches(bytes.toString('base64url'), binding, verifier.digest(secret, binding)),
    ).toBe(false);
  });
  it('다른 target/account/binding/보안세대/source/challenge/epoch는 실패다', () => {
    const expected = verifier.digest(secret, binding);
    for (const changed of [
      { targetRef: { ...ref, id: 'other' } },
      { accountRef: { ...binding.accountRef!, id: 'other' } },
      { bindingRef: { ...binding.bindingRef!, id: 'other' } },
      { bindingGeneration: 2 },
      { securityGeneration: 2 },
      { sourceRevision: 2 },
      { challengeId: 'other' },
      { epoch: 'other' },
    ])
      expect(verifier.matches(secret, { ...binding, ...changed }, expected)).toBe(false);
  });
  it('다른 키/목적 domain은 검증을 공유하지 않는다', () => {
    const value = generatePurposeSecret('PARTY_CONTEXT'),
      meta = { ...binding, purpose: 'PARTY_CONTEXT' as const },
      digest = verifier.digest(value, meta);
    expect(verifier.matches(value, { ...meta, purpose: 'ENROLLMENT_HANDLE' }, digest)).toBe(false);
    expect(
      new PurposeVerifier(randomBytes(32), binding.keyVersion).matches(value, meta, digest),
    ).toBe(false);
  });
  it('trim/casefold/padding/비정규 base64url/길이 추정은 없다', () => {
    for (const value of [
      ' ' + secret,
      secret + ' ',
      secret + '=',
      secret.slice(1),
      secret + 'A',
      '!'.repeat(16),
    ])
      expect(() => canonicalSecretBytes(value, 'HANDOFF')).toThrow();
    expect(() => canonicalSecretBytes('B'.repeat(43), 'PARTY_CONTEXT')).toThrow();
  });
  it('keyVersion/필수 metadata/잘못된 owner는 닫힌 거절이다', () => {
    expect(() => verifier.digest(secret, { ...binding, keyVersion: 'other' })).toThrow();
    expect(() => verifier.digest(secret, { ...binding, system: true } as SecretBinding)).toThrow();
    expect(() =>
      verifier.digest(secret, {
        ...binding,
        accountRef: { ...binding.accountRef!, owner: 'EnterpriseAccess' },
      }),
    ).toThrow();
  });
  it('잘못된 digest는 false, 잘못된 키 길이는 시작부터 거절한다', () => {
    expect(verifier.matches(secret, binding, 'wrong')).toBe(false);
    expect(() => new PurposeVerifier(Buffer.alloc(31), 'bad')).toThrow();
  });
});
describe('초대 token의 별도 closed contact 결합', () => {
  const verifier = new PurposeVerifier(randomBytes(32), 'synthetic-invite-1'),
    secret = generatePurposeSecret('INVITATION_TOKEN');
  const invitation = {
    purpose: 'INVITATION_TOKEN' as const,
    targetRef: {
      owner: 'EnterpriseAccess',
      entity: 'MembershipInvitation',
      id: 'invitation-fixture',
      revision: 1,
    },
    contactRef: {
      owner: 'IdentityRecovery',
      entity: 'RegisteredContact',
      id: 'contact-fixture',
      revision: 1,
    },
    tokenGeneration: 1,
    epoch: 'initial',
    keyVersion: 'synthetic-invite-1',
  };
  it('256bit token과 연락 경로/원래 초대의 verifier를 만든다', () =>
    expect(verifier.matches(secret, invitation, verifier.digest(secret, invitation))).toBe(true));
  it('같은 metadata에서 다른 candidate 한 byte는 실패다', () => {
    const bytes = canonicalSecretBytes(secret, 'INVITATION_TOKEN');
    bytes[0] = bytes[0]! ^ 1;
    expect(
      verifier.matches(
        bytes.toString('base64url'),
        invitation,
        verifier.digest(secret, invitation),
      ),
    ).toBe(false);
  });
  it('contact/version/tokenGeneration/원래 invitation 변경은 실패다', () => {
    const digest = verifier.digest(secret, invitation);
    for (const changed of [
      { contactRef: { ...invitation.contactRef, id: 'other' } },
      { contactRef: { ...invitation.contactRef, revision: 2 } },
      { tokenGeneration: 2 },
      { targetRef: { ...invitation.targetRef, id: 'other' } },
      { epoch: 'other' },
    ])
      expect(verifier.matches(secret, { ...invitation, ...changed }, digest)).toBe(false);
  });
  it('미확인 recipient의 account/binding/security 세대를 fake metadata로 추가하지 않는다', () =>
    expect(() =>
      verifier.digest(secret, {
        ...invitation,
        accountRef: null,
        bindingGeneration: 1,
      } as unknown as import('@oms/core').InvitationSecretBinding),
    ).toThrow());
  it('인계 목적의 metadata family와 교차 검증하지 않는다', () =>
    expect(() =>
      verifier.digest(secret, { ...invitation, purpose: 'HANDOFF' } as unknown as SecretBinding),
    ).toThrow());
  it('미등록 contact owner/entity는 source 결합으로 사용하지 않는다', () =>
    expect(() =>
      verifier.digest(secret, {
        ...invitation,
        contactRef: { ...invitation.contactRef, entity: 'Account' },
      }),
    ).toThrow());
  it('원래 초대가 아닌 target과 지원되지 않는 keyVersion을 거절한다', () => {
    expect(() =>
      verifier.digest(secret, {
        ...invitation,
        targetRef: { ...invitation.targetRef, entity: 'Enterprise' },
      }),
    ).toThrow();
    expect(() => verifier.digest(secret, { ...invitation, keyVersion: 'other' })).toThrow();
  });
});
describe('C21 candidate 입력 digest는 원래 작업과 실제 bytes를 결합', () => {
  const verifier = new PurposeVerifier(randomBytes(32), 'c21-key'),
    metadata = {
      workId: 'original',
      bindingGeneration: 2,
      securityGeneration: 3,
      epoch: 'initial',
    };
  it('같은 metadata/후보는 동일하며 다른 TOTP/password/purpose/key/epoch를 혼합하지 않는다', () => {
    const bytes = Buffer.from('123456'),
      digest = verifier.inputDigest('C21_VERIFY_FACTOR', metadata, bytes);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(verifier.inputDigest('C21_VERIFY_FACTOR', metadata, bytes)).toBe(digest);
    expect(verifier.inputDigest('C21_VERIFY_FACTOR', metadata, Buffer.from('123457'))).not.toBe(
      digest,
    );
    expect(verifier.inputDigest('C21_REPLACE_FIRST_FACTOR', metadata, bytes)).not.toBe(digest);
    expect(
      verifier.inputDigest('C21_VERIFY_FACTOR', { ...metadata, epoch: 'changed' }, bytes),
    ).not.toBe(digest);
    expect(
      new PurposeVerifier(randomBytes(32), 'c21-key').inputDigest(
        'C21_VERIFY_FACTOR',
        metadata,
        bytes,
      ),
    ).not.toBe(digest);
  });
  it('빈 후보와 상한 초과/미등록 목적은 SDK 입력을 만들기 전에 거절한다', () => {
    for (const bytes of [Buffer.alloc(0), Buffer.alloc(4097)])
      expect(() => verifier.inputDigest('C21_VERIFY_FACTOR', metadata, bytes)).toThrow();
    expect(() =>
      verifier.inputDigest('OTHER' as 'C21_VERIFY_FACTOR', metadata, Buffer.from('value')),
    ).toThrow();
  });
});
