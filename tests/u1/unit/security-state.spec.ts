import { describe, expect, it } from 'vitest';
import { currentSecurityMatches, sameSessionAuthority } from '@oms/persistence';
const session = {
  sessionId: 'session',
  accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'one', revision: 1 },
  audience: 'STAFF',
  phase: 'MFA_VERIFIED',
  purpose: null,
  deadlineAt: '2026-10-08T18:00:00Z',
  mfaEnrollmentRef: { owner: 'IdentityRecovery', entity: 'MfaEnrollment', id: 'mfa', revision: 1 },
  revision: 1,
  issuedAt: '2026-10-08T10:00:00Z',
  lastActiveAt: '2026-10-08T10:00:00Z',
  bindingGeneration: 1,
  authRevision: 1,
  recoveryEpoch: 'initial',
};
describe('정상 idle 개정과 인증 세대/보안 회수의 분리', () => {
  it('같은 인증 권위의 정상 heartbeat만 이전 보호 문맥과 대조한다', () =>
    expect(
      sameSessionAuthority(session, {
        ...session,
        revision: 2,
        lastActiveAt: '2026-10-08T10:01:00Z',
      }),
    ).toBe(true));
  it('phase·purpose·account·binding·MFA·epoch·절대기한의 변경은 heartbeat가 아니다', () => {
    for (const change of [
      { phase: 'INVALIDATED' },
      { purpose: 'RECOVERY' },
      { accountRef: { ...session.accountRef, id: 'other' } },
      { bindingGeneration: 2 },
      { authRevision: 2 },
      { mfaEnrollmentRef: { ...session.mfaEnrollmentRef, revision: 2 } },
      { recoveryEpoch: 'new' },
      { deadlineAt: '2026-10-08T19:00:00Z' },
    ])
      expect(sameSessionAuthority(session, { ...session, ...change })).toBe(false);
  });
  it('primary-only heartbeat도 이전 보호 idle 시각을 그대로 반환하는 조건만 허용한다', () =>
    expect(
      currentSecurityMatches('IdentitySession', session, {
        ...session,
        revision: 2,
        lastActiveAt: '2026-10-08T10:01:00Z',
      }),
    ).toBe(true));
  it('같은 revision으로 바뀐 phase도 즉시 거절한다', () =>
    expect(
      currentSecurityMatches('IdentitySession', session, { ...session, phase: 'INVALIDATED' }),
    ).toBe(false));
  it('역행/절대기한 이후/불명 시각과 낮은 revision은 거절한다', () => {
    for (const change of [
      { lastActiveAt: '2026-10-08T09:00:00Z' },
      { lastActiveAt: '2026-10-08T19:00:00Z' },
      { lastActiveAt: 'invalid' },
      { revision: 0 },
    ])
      expect(currentSecurityMatches('IdentitySession', session, { ...session, ...change })).toBe(
        false,
      );
  });
  it('Account의 같은revision active회수는 보호 전에도 불일치다', () =>
    expect(
      currentSecurityMatches(
        'Account',
        { accountId: 'one', active: true, revision: 1 },
        { accountId: 'one', active: false, revision: 1 },
      ),
    ).toBe(false));
  it('현재 raw 부재와 알려진 이전 원본을 같은 상태로 만들지 않는다', () => {
    expect(currentSecurityMatches('IdentitySession', session, null)).toBe(false);
    expect(currentSecurityMatches('IdentitySession', null, session)).toBe(false);
    expect(currentSecurityMatches('IdentitySession', null, null)).toBe(true);
  });
  it('물리FK 보조컬럼을 업무 권위로 바꾸지 않지만 전체 등록 필드는 대조한다', () =>
    expect(
      currentSecurityMatches('IdentitySession', session, { ...session, accountRefKey: 'one' }),
    ).toBe(true));
});
