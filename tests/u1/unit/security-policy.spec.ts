import { describe, expect, it } from 'vitest';
import {
  evaluateSecurityExceptions,
  evaluateSecretExposures,
} from '../../../scripts/u1/security-policy.js';
const now = new Date('2026-10-09T00:00:00Z');
const exception = () => ({
  id: 'exception-reference',
  owner: 'verified-owner-reference',
  reason: '합성 명시 사유',
  expiresAt: '2026-10-10T00:00:00Z',
  reviewAt: '2026-10-09T12:00:00Z',
  residualRisk: '합성 잔여 위험',
  findingIds: ['finding-original'],
});
const exposure = () => ({
  id: 'exposure-reference',
  observedAt: now.toISOString(),
  credentialRef: 'credential-reference-only',
  revoked: false,
  replacementVerified: false,
  usageReviewed: false,
  impactReviewed: false,
  logsReviewed: false,
  backupsReviewed: false,
});
describe('보안 예외/노출 대응의사유·담당·만료·잔여위험과통과구분', () => {
  it('실제노출/예외없음은회전성공이나사건발생을발명하지않는다', () => {
    expect(evaluateSecurityExceptions([], now)).toMatchObject({
      hasUnresolvedRisk: false,
      countsAsPassed: false,
    });
    expect(evaluateSecretExposures([])).toEqual([]);
  });
  it('유효문서화예외도high/critical면제나검사성공으로표시하지않는다', () =>
    expect(evaluateSecurityExceptions([exception()], now).evaluated[0]).toMatchObject({
      state: 'DOCUMENTED_RESIDUAL_RISK',
      countsAsPassed: false,
      waivesHighCritical: false,
    }));
  it('만료/재검토도래를서로구분하고뒤로숨기지않는다', () => {
    expect(
      evaluateSecurityExceptions(
        [{ ...exception(), expiresAt: now.toISOString(), reviewAt: now.toISOString() }],
        now,
      ).evaluated[0]!.state,
    ).toBe('EXPIRED');
    expect(
      evaluateSecurityExceptions([{ ...exception(), reviewAt: now.toISOString() }], now)
        .evaluated[0]!.state,
    ).toBe('REVIEW_REQUIRED');
  });
  it('담당/사유/잔여위험·만료없음/null/unknown은거절한다', () => {
    for (const change of [
      { owner: '' },
      { reason: '' },
      { residualRisk: '' },
      { expiresAt: 'unknown' },
      { extra: true },
    ])
      expect(() => evaluateSecurityExceptions([{ ...exception(), ...change }], now)).toThrow();
    expect(() => evaluateSecurityExceptions(null, now)).toThrow();
  });
  it('중복identity/발견·유한목록과만료뒤재검토는거절한다', () => {
    expect(() => evaluateSecurityExceptions([exception(), exception()], now)).toThrow();
    for (const change of [
      { findingIds: ['same', 'same'] },
      { findingIds: [] },
      { reviewAt: '2026-10-11T00:00:00Z' },
    ])
      expect(() => evaluateSecurityExceptions([{ ...exception(), ...change }], now)).toThrow();
    expect(() => evaluateSecurityExceptions(Array.from({ length: 101 }, exception), now)).toThrow();
  });
  it('노출후폐기만으로사용/영향/로그/backup대조완료를선언하지않는다', () =>
    expect(evaluateSecretExposures([{ ...exposure(), revoked: true }])[0]).toMatchObject({
      state: 'OBSERVED_OPEN',
      remaining: [
        'replacementVerified',
        'usageReviewed',
        'impactReviewed',
        'logsReviewed',
        'backupsReviewed',
      ],
    }));
  it('명시적합성대응체크전부는complete로구분하지만실제회전관측이아니다', () =>
    expect(
      evaluateSecretExposures([
        {
          ...exposure(),
          revoked: true,
          replacementVerified: true,
          usageReviewed: true,
          impactReviewed: true,
          logsReviewed: true,
          backupsReviewed: true,
        },
      ])[0],
    ).toMatchObject({ state: 'RESPONSE_EVIDENCE_COMPLETE', realIncidentVerified: false }));
  it('원문비밀/문자열false·중복노출자료는대응근거로받지않는다', () => {
    for (const change of [{ revoked: 'false' }, { password: 'forbidden' }, { credentialRef: '' }])
      expect(() => evaluateSecretExposures([{ ...exposure(), ...change }])).toThrow();
    expect(() => evaluateSecretExposures([exposure(), exposure()])).toThrow();
  });
});
