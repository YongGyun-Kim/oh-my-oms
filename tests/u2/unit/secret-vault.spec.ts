import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sealPurposeEnvelope, openPurposeEnvelope } from '@oms/persistence';
import type { VaultBinding } from '@oms/persistence';
const binding: VaultBinding = {
  id: 'vault-fixture',
  purpose: 'HANDOFF',
  targetRef: {
    owner: 'IdentityRecovery',
    entity: 'RecoveryHandoffGrant',
    id: 'grant-fixture',
    revision: 1,
  },
  accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'account-fixture', revision: 1 },
  audience: 'CUSTOMER',
  bindingGeneration: 1,
  sourceRevision: 1,
  expiresAt: '2026-10-10T00:00:00Z',
  keyVersion: 'synthetic-vault-1',
};
describe('목적 암호 envelope AAD/별도 키', () => {
  const key = randomBytes(32),
    secret = Buffer.from('synthetic-only-canary');
  it('정확 원본 결합으로만 AES256GCM roundtrip된다', () =>
    expect(openPurposeEnvelope(sealPurposeEnvelope(secret, binding, key), binding, key)).toEqual(
      secret,
    ));
  it('같은 입력도 unique random nonce/ciphertext다', () => {
    const first = sealPurposeEnvelope(secret, binding, key),
      second = sealPurposeEnvelope(secret, binding, key);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
  it('원문 비밀은 일반 envelope에 없다', () =>
    expect(JSON.stringify(sealPurposeEnvelope(secret, binding, key))).not.toContain(
      secret.toString(),
    ));
  it('purpose/target/account/audience/generation/revision/expiry/keyVersion마다 AAD가 다르다', () => {
    const envelope = sealPurposeEnvelope(secret, binding, key);
    for (const changed of [
      { purpose: 'FIRST_FACTOR' as const },
      { targetRef: { ...binding.targetRef, id: 'other' } },
      { accountRef: { ...binding.accountRef!, id: 'other' } },
      { audience: 'STAFF' as const },
      { bindingGeneration: 2 },
      { sourceRevision: 2 },
      { expiresAt: '2026-10-11T00:00:00Z' },
      { keyVersion: 'other' },
    ])
      expect(() => openPurposeEnvelope(envelope, { ...binding, ...changed }, key)).toThrow(
        '무결성',
      );
  });
  it('다른 서버 키는 decrypt하지 못한다', () =>
    expect(() =>
      openPurposeEnvelope(sealPurposeEnvelope(secret, binding, key), binding, randomBytes(32)),
    ).toThrow());
  it('tag/ciphertext 변조는 실패한다', () => {
    const envelope = sealPurposeEnvelope(secret, binding, key);
    for (const changed of [
      { tag: randomBytes(16).toString('base64') },
      { ciphertext: randomBytes(24).toString('base64') },
    ])
      expect(() => openPurposeEnvelope({ ...envelope, ...changed }, binding, key)).toThrow();
  });
  it('미등록 AAD 필드/키 길이/과대 비밀을 저장 전에 거절한다', () => {
    expect(() =>
      sealPurposeEnvelope(secret, { ...binding, system: true } as VaultBinding, key),
    ).toThrow();
    expect(() => sealPurposeEnvelope(secret, binding, Buffer.alloc(31))).toThrow();
    expect(() => sealPurposeEnvelope(Buffer.alloc(65537), binding, key)).toThrow();
  });
});
