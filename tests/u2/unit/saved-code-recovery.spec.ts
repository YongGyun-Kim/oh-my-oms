import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { RecoveryCodes, savedCodeSetCurrent } from '@oms/core';
const r = (entity: string, id = entity) => ({ owner: 'IdentityRecovery', entity, id, revision: 1 });
const binding = { bindingId: 'binding', accountRef: r('Account', 'account'), generation: 1 },
  set = {
    confirmed: true,
    invalidated: false,
    accountRef: binding.accountRef,
    bindingRef: r('ProviderBinding', 'binding'),
    generation: 1,
  };
describe('현재 password challenge에 사용하는 사전 코드 집합', () => {
  it('확인된 미회수 집합의 정확 계정/연결/세대만 후보가 된다', () =>
    expect(savedCodeSetCurrent(set, binding)).toBe(true));
  it('보관 미확인 집합은 복구 근거가 아니다', () =>
    expect(savedCodeSetCurrent({ ...set, confirmed: false }, binding)).toBe(false));
  it('재발급/회수 집합을 이전 유효 상태로 승격하지 않는다', () =>
    expect(savedCodeSetCurrent({ ...set, invalidated: true }, binding)).toBe(false));
  it('다른 계정·연결·이전 binding generation을 거절한다', () => {
    for (const changed of [
      { accountRef: r('Account', 'other') },
      { bindingRef: r('ProviderBinding', 'other') },
      { generation: 2 },
    ])
      expect(savedCodeSetCurrent({ ...set, ...changed }, binding)).toBe(false);
  });
  it('정기 만료 metadata를 추가하지 않고 실제 미사용 verifier만 단회 소비한다', () => {
    const codec = new RecoveryCodes(randomBytes(32)),
      issued = codec.issue('account', 1, 'set'),
      digest = codec.digest('account', 1, 'set', issued.codes[0]!);
    expect(Object.keys(issued.verifiers[0]!).sort()).toEqual(['digest', 'used']);
    const consumed = codec.consume(issued.verifiers, digest);
    expect(consumed[0]?.used).toBe(true);
    expect(() => codec.consume(consumed, digest)).toThrow();
  });
  it('다른 집합/키의 같은 code로 현재 집합을 소비하지 않는다', () => {
    const codec = new RecoveryCodes(randomBytes(32)),
      issued = codec.issue('account', 1, 'set');
    for (const digest of [
      codec.digest('account', 1, 'other', issued.codes[0]!),
      new RecoveryCodes(randomBytes(32)).digest('account', 1, 'set', issued.codes[0]!),
    ])
      expect(() => codec.consume(issued.verifiers, digest)).toThrow();
  });
  it('원래 한 code 소비는 다른 미사용 code의 verifier를 바꾸지 않는다', () => {
    const codec = new RecoveryCodes(randomBytes(32)),
      issued = codec.issue('account', 1, 'set'),
      before = structuredClone(issued.verifiers);
    const consumed = codec.consume(
      issued.verifiers,
      codec.digest('account', 1, 'set', issued.codes[4]!),
    );
    expect(consumed[4]?.used).toBe(true);
    expect(consumed.filter((row) => row.used)).toHaveLength(1);
    expect(consumed[0]).toEqual(before[0]);
    expect(issued.verifiers).toEqual(before);
  });
  it('잘못된 verifier는 현재 코드와 비교한 뒤 성공으로 통과하지 않는다', () => {
    const codec = new RecoveryCodes(randomBytes(32));
    expect(() => codec.consume([{ digest: 'bad', used: false }], 'a'.repeat(64))).toThrow();
    expect(() => codec.consume([{ digest: 'a'.repeat(64), used: true }], 'a'.repeat(64))).toThrow();
  });
});
