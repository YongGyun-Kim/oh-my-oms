import { describe, it, expect } from 'vitest';
import { recoveryCompletionConjunction, identityResultDigest } from '@oms/core';
import type { RecoveryCompletionFacts } from '@oms/core';
const all: RecoveryCompletionFacts = {
  newFactor: true,
  oldFactors: true,
  oldCodes: true,
  oldSessions: true,
  originalEffects: true,
  newCodesStored: true,
  currentAuthority: true,
};
describe('복구 완료의 보호 conjunction', () => {
  it('모든 독립 조건을 만족한 내부 관측만 완료 후보다', () =>
    expect(recoveryCompletionConjunction(all)).toBe(true));
  for (const field of Object.keys(all) as (keyof RecoveryCompletionFacts)[])
    it(field + ' 누락을 다른 성공으로 대신하지 않는다', () =>
      expect(recoveryCompletionConjunction({ ...all, [field]: false })).toBe(false),
    );
  it('caller 성공 문자열은 실제 boolean 조건을 만족하지 않는다', () =>
    expect(
      recoveryCompletionConjunction({
        ...all,
        newFactor: 'VERIFIED',
      } as unknown as RecoveryCompletionFacts),
    ).toBe(false));
  it('제공자 결과 digest는 원래 binding 개정/세대/epoch/operation을 모두 구별한다', () => {
    const source = { caseId: 'case', securityGeneration: 2, epoch: 'epoch' },
      binding = {
        owner: 'IdentityRecovery',
        entity: 'ProviderBinding',
        id: 'binding',
        revision: 2,
      },
      digest = identityResultDigest(source, binding, 'work');
    expect(
      [
        identityResultDigest({ ...source, securityGeneration: 3 }, binding, 'work'),
        identityResultDigest({ ...source, epoch: 'other' }, binding, 'work'),
        identityResultDigest(source, { ...binding, revision: 1 }, 'work'),
        identityResultDigest(source, binding, 'other'),
      ].every((value) => value !== digest),
    ).toBe(true);
  });
});
