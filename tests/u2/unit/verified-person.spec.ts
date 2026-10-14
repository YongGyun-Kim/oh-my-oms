import { beforeEach, describe, expect, it } from 'vitest';
import { VerifiedPerson } from '@oms/core';
import type { Ref } from '@oms/contracts';
import { SyntheticModelStore } from '../fixtures/identity.js';
const r = (entity: string, id = entity): Ref => ({
    owner: 'IdentityRecovery',
    entity,
    id,
    revision: 1,
  }),
  left = r('Account', 'left'),
  right = r('Account', 'right'),
  now = new Date('2026-10-09T00:00:00Z'),
  expires = new Date(now.getTime() + 300000).toISOString();
describe('확인된 동일인과 actual policy 부재', () => {
  let source: SyntheticModelStore, lookup: VerifiedPerson;
  const verified = (id: string, accounts: Ref[]) => {
    source.fixture('VerifiedPersonLink', {
      personLinkId: id,
      accountRefs: accounts,
      evidenceRefs: [],
      verifiedAt: now.toISOString(),
      revision: 1,
    });
    source.fixture('PersonVerification', {
      personVerificationId: id + '-check',
      personLinkRef: r('VerifiedPersonLink', id),
      policyRef: r('VerificationPolicy'),
      evidenceRefs: [r('VerificationEvidence', id + '-evidence')],
      verifiedBy: left,
      verifiedAt: now.toISOString(),
      expiresAt: expires,
      state: 'CONFIRMED',
      revision: 1,
    });
    source.fixture('VerificationEvidence', {
      evidenceId: id + '-evidence',
      policyRef: r('VerificationPolicy'),
      sourceKind: 'SYNTHETIC',
      synthetic: true,
      state: 'CONFIRMED',
      expiresAt: expires,
      revision: 1,
    });
  };
  beforeEach(() => {
    source = new SyntheticModelStore();
    lookup = new VerifiedPerson(source.asStore(), 'LOCAL_SYNTHETIC', () => now);
    for (const account of [left, right])
      source.fixture('Account', { accountId: account.id, active: true, revision: 1 });
    source.fixture('VerificationPolicy', {
      policyId: 'VerificationPolicy',
      active: true,
      synthetic: true,
      requiredSourceKinds: ['SYNTHETIC'],
      expiresAt: expires,
      revision: 1,
    });
  });
  it('같은 계정의 자기 행위는 다른 사람으로 판정하지 않는다', async () =>
    expect((await lookup.compare(left, left)).relation).toBe('SAME'));
  it('한 현재 확인된 link의 여러 계정은 SAME이다', async () => {
    verified('one', [left, right]);
    expect(await lookup.compare(left, right)).toMatchObject({
      knowledge: 'KNOWN',
      relation: 'SAME',
      synthetic: true,
    });
  });
  it('각 현재 인정된 별도 link는 합성 내에서만 DIFFERENT다', async () => {
    verified('one', [left]);
    verified('two', [right]);
    expect((await lookup.compare(left, right)).relation).toBe('DIFFERENT');
  });
  it('미등록 실제 정책에서는 local fixture를 actual 근거로 승격하지 않는다', async () => {
    verified('one', [left, right]);
    expect(
      await new VerifiedPerson(source.asStore(), 'UNREGISTERED', () => now).compare(left, right),
    ).toMatchObject({ knowledge: 'UNKNOWN', relation: 'UNCONFIRMED', synthetic: false });
  });
  it('link/Ref만 존재하거나 필수 출처가 부족하면 UNCONFIRMED다', async () => {
    source.fixture('VerifiedPersonLink', {
      personLinkId: 'one',
      accountRefs: [left, right],
      revision: 1,
    });
    expect((await lookup.compare(left, right)).relation).toBe('UNCONFIRMED');
    verified('one', [left, right]);
    source.fixture('VerificationPolicy', {
      policyId: 'VerificationPolicy',
      active: true,
      synthetic: true,
      requiredSourceKinds: ['ACTUAL-MISSING'],
      expiresAt: expires,
      revision: 1,
    });
    expect((await lookup.compare(left, right)).relation).toBe('UNCONFIRMED');
  });
  it('만료/회수/CONFLICT를 다른 사람 확인으로 바꾸지 않는다', async () => {
    verified('one', [left, right]);
    source.fixture('PersonVerification', {
      ...source.protectedRows.get('PersonVerification')!.get('one-check')!,
      state: 'CONFLICT',
    });
    expect((await lookup.compare(left, right)).relation).toBe('UNCONFIRMED');
  });
  it('추가 미보호 link/결정은 old 확인 상태로 fallback하지 않는다', async () => {
    verified('one', [left, right]);
    source.fixture(
      'PersonVerification',
      {
        ...source.protectedRows.get('PersonVerification')!.get('one-check')!,
        personVerificationId: 'unprotected',
      },
      false,
    );
    await expect(lookup.compare(left, right)).rejects.toMatchObject({
      code: 'CURRENT_PERSON_NOT_PROTECTED',
    });
  });
  it('겹친 links/비활성 계정은 안전한 미확인 또는 거절이다', async () => {
    verified('one', [left, right]);
    verified('two', [left, right]);
    expect((await lookup.compare(left, right)).relation).toBe('UNCONFIRMED');
    source.fixture('Account', { accountId: 'left', active: false, revision: 2 });
    await expect(lookup.compare(left, right)).rejects.toThrow();
  });
});
