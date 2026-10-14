import { describe, it, expect } from 'vitest';
import { administratorEvidenceCurrent } from '@oms/core';
import type { Ref } from '@oms/contracts';
const r = (entity: string, id = entity): Ref => ({
    owner: entity === 'Enterprise' ? 'EnterpriseAccess' : 'IdentityRecovery',
    entity,
    id,
    revision: 1,
  }),
  now = new Date('2026-10-09T00:00:00Z'),
  expires = new Date(now.getTime() + 300000).toISOString(),
  policy = {
    policyId: 'policy',
    revision: 1,
    purpose: 'ADMINISTRATOR_RESTORATION',
    requiredSourceKinds: ['SYNTHETIC'],
    synthetic: true,
    active: true,
    expiresAt: expires,
  },
  evidence = {
    evidenceId: 'evidence',
    state: 'CONFIRMED',
    purpose: 'ADMINISTRATOR_RESTORATION',
    enterpriseRef: r('Enterprise'),
    accountRef: r('Account'),
    policyRef: r('VerificationPolicy', 'policy'),
    synthetic: true,
    sourceKind: 'SYNTHETIC',
    expiresAt: expires,
  };
describe('현재 지정 대상 위임 근거의 fail-closed 평가', () => {
  it('local 확인 정책과 정확 기업/계정의 살아 있는 근거만 허용한다', () =>
    expect(administratorEvidenceCurrent(evidence, policy, r('Enterprise'), r('Account'), now)).toBe(
      true,
    ));
  it('다른 기업 근거를 같은 계정으로 재사용하지 않는다', () =>
    expect(
      administratorEvidenceCurrent(evidence, policy, r('Enterprise', 'other'), r('Account'), now),
    ).toBe(false));
  it('다른 지정 대상과 enterpriseRef 누락을 거절한다', () => {
    expect(
      administratorEvidenceCurrent(evidence, policy, r('Enterprise'), r('Account', 'other'), now),
    ).toBe(false);
    expect(
      administratorEvidenceCurrent(
        { ...evidence, enterpriseRef: null },
        policy,
        r('Enterprise'),
        r('Account'),
        now,
      ),
    ).toBe(false);
  });
  it('UNCONFIRMED/CONFLICT/REVOKED를 확인 완료로 바꾸지 않는다', () => {
    for (const state of ['UNCONFIRMED', 'CONFLICT', 'REVOKED'])
      expect(
        administratorEvidenceCurrent(
          { ...evidence, state },
          policy,
          r('Enterprise'),
          r('Account'),
          now,
        ),
      ).toBe(false);
  });
  it('stale/비활성 정책은 거절한다', () => {
    for (const change of [{ active: false }, { revision: 2 }])
      expect(
        administratorEvidenceCurrent(
          evidence,
          { ...policy, ...change },
          r('Enterprise'),
          r('Account'),
          now,
        ),
      ).toBe(false);
  });
  it('정각 만료와 경계 이후는 거절한다', () => {
    for (const delta of [0, 1])
      expect(
        administratorEvidenceCurrent(
          evidence,
          policy,
          r('Enterprise'),
          r('Account'),
          new Date(Date.parse(expires) + delta),
        ),
      ).toBe(false);
  });
  it('미등록 source kind/빈 정책/다른 목적은 거절한다', () => {
    for (const change of [
      { requiredSourceKinds: [] },
      { requiredSourceKinds: ['OTHER'] },
      { purpose: 'RECOVERY' },
    ])
      expect(
        administratorEvidenceCurrent(
          evidence,
          { ...policy, ...change },
          r('Enterprise'),
          r('Account'),
          now,
        ),
      ).toBe(false);
  });
  it('합성 근거로 실제 위임 정책을 채우지 않는다', () =>
    expect(
      administratorEvidenceCurrent(
        { ...evidence, synthetic: false },
        { ...policy, synthetic: false },
        r('Enterprise'),
        r('Account'),
        now,
      ),
    ).toBe(false));
});
