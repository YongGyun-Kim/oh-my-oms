import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { RecoveryCodes, IdentityRecovery } from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import { SyntheticIdentityProvider } from '../fixtures/identity.js';
describe('사전 코드의 유한 암호 정책', () => {
  const codes = new RecoveryCodes(randomBytes(32));
  it('10개의 서로 다른 128bit CSPRNG 코드를 발급하고 verifier만 별도로 유지한다', () => {
    const issued = codes.issue('account', 1, 'set');
    expect(issued.codes).toHaveLength(10);
    expect(new Set(issued.codes).size).toBe(10);
    expect(issued.codes.every((code) => /^[a-f0-9]{32}$/.test(code))).toBe(true);
    expect(
      issued.verifiers.every(
        (verifier) => !issued.codes.includes(verifier.digest) && !verifier.used,
      ),
    ).toBe(true);
  });
  it('단회 소비는 재사용을 거절한다', () => {
    const issued = codes.issue('a', 1, 's');
    const digest = codes.digest('a', 1, 's', issued.codes[0]!);
    const consumed = codes.consume(issued.verifiers, digest);
    expect(consumed[0]!.used).toBe(true);
    expect(() => codes.consume(consumed, digest)).toThrow();
  });
  it('다른 account/binding generation/set/key는 동일 코드를 허용하지 않는다', () => {
    const digest = codes.digest('a', 1, 's', 'raw');
    for (const alternative of [
      codes.digest('b', 1, 's', 'raw'),
      codes.digest('a', 2, 's', 'raw'),
      codes.digest('a', 1, 'other', 'raw'),
      new RecoveryCodes(randomBytes(32)).digest('a', 1, 's', 'raw'),
    ])
      expect(alternative).not.toBe(digest);
  });
  it('잘못된 verifier/hash는 실패하고 입력 목록을 수정하지 않는다', () => {
    const issued = codes.issue('a', 1, 's');
    const before = structuredClone(issued.verifiers);
    expect(() => codes.consume(issued.verifiers, 'bad')).toThrow();
    expect(issued.verifiers).toEqual(before);
    expect(() => codes.consume([{ digest: 'bad', used: false }], 'a'.repeat(64))).toThrow();
  });
  it('약한/누락 키로 handler를 만들 수 없다', () =>
    expect(() => new RecoveryCodes(Buffer.alloc(8))).toThrow());
  it('원본 사용 상태의 verifier만 소비하고 다른 코드는 보존한다', () => {
    const issued = codes.issue('a', 1, 's');
    const consumed = codes.consume(issued.verifiers, codes.digest('a', 1, 's', issued.codes[3]!));
    expect(consumed.filter((verifier) => verifier.used)).toHaveLength(1);
    expect(consumed[3]!.used).toBe(true);
  });
  it('운영 runtime에 합성 provider 등록을 거절한다', () =>
    expect(
      () =>
        new IdentityRecovery({} as ProtectedStore, new SyntheticIdentityProvider(), {
          synthetic: false,
          verifierKey: randomBytes(32),
          now: () => new Date(),
          staffIngress: async () => false,
        }),
    ).toThrow());
  it('정기 만료 시간을 verifier에 추가하지 않는다', () =>
    expect(Object.keys(codes.issue('a', 1, 's').verifiers[0]!).sort()).toEqual(['digest', 'used']));
});
