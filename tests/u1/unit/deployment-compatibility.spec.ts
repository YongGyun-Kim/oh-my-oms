import { describe, expect, it } from 'vitest';
import { evaluateRollback } from '@oms/integrations';
import type { ReleaseIdentity, RollbackEvidence } from '@oms/integrations';
const release: ReleaseIdentity = {
  sourceSha: 'a'.repeat(40),
  imageDigest: 'sha256:' + 'b'.repeat(64),
  schemaDigest: 'c'.repeat(64),
  registryDigest: 'd'.repeat(64),
  recoveryDecoderDigest: 'e'.repeat(64),
  configRevision: 'verified-synthetic-1',
  keyGeneration: 'original-1',
  bindingGeneration: 'original-1',
  epoch: 'original-epoch',
  acceptedWorkVersions: [2],
};
const evidence = (): RollbackEvidence => ({
  incidentId: 'synthetic-incident',
  attemptId: 'original-attempt',
  current: { ...release },
  previous: { ...release, imageDigest: 'sha256:' + 'f'.repeat(64) },
  previousState: 'COMPLETED',
  pendingWorkVersions: [2],
  originalKeysRetained: true,
  currentSecurityConfirmed: true,
  stagedCompatibilityPassed: true,
  manifestApproved: true,
});
describe('조건부 application rollback: 원본/보안/decoder·실제승인 의미', () => {
  it('동일 호환 근거의 이전COMPLETED digest만 대상이며DB복구를 만들지 않는다', () => {
    const value = evidence();
    expect(evaluateRollback(value)).toMatchObject({
      state: 'APPLICATION_ROLLBACK_ELIGIBLE',
      targetImage: value.previous.imageDigest,
      preservesDatabase: true,
      securityAuthorityUnchanged: true,
    });
  });
  it('FAILED/UNKNOWN 이전 target을 안전으로 만들지 않는다', () => {
    for (const previousState of ['FAILED', 'UNKNOWN'] as const)
      expect(evaluateRollback({ ...evidence(), previousState }).state).toBe(
        'MANUAL_RECONCILIATION_REQUIRED',
      );
  });
  it('현재 schema/config/key/binding/epoch의 변경은 대조 전 자동 rollback을막는다', () => {
    for (const key of [
      'schemaDigest',
      'registryDigest',
      'recoveryDecoderDigest',
      'configRevision',
      'keyGeneration',
      'bindingGeneration',
      'epoch',
    ] as const) {
      const value = evidence();
      value.previous[key] = key.endsWith('Digest') ? 'f'.repeat(64) : 'changed';
      expect(evaluateRollback(value).state).toBe('MANUAL_RECONCILIATION_REQUIRED');
    }
  });
  it('이전 앱이 대기 원래Work를읽지못하면 제거/새ID로 해결하지않는다', () =>
    expect(evaluateRollback({ ...evidence(), pendingWorkVersions: [1, 2] }).reasons).toContain(
      'ORIGINAL_PENDING_WORK_DECODER_MISSING',
    ));
  it('정확한 true가 아닌 승인·현재보안/원래키는 자동실행을허용하지않는다', () => {
    for (const key of [
      'manifestApproved',
      'currentSecurityConfirmed',
      'originalKeysRetained',
      'stagedCompatibilityPassed',
    ] as const) {
      const value = evidence();
      value[key] = false;
      expect(evaluateRollback(value).state).toBe('MANUAL_RECONCILIATION_REQUIRED');
      for (const invalid of ['false', null, undefined, 1])
        expect(() =>
          evaluateRollback({ ...value, [key]: invalid } as unknown as RollbackEvidence),
        ).toThrow();
    }
  });
  it('null/missing/unknown top/release 필드는 wire로 들어오면거절한다', () => {
    expect(() => evaluateRollback(null as unknown as RollbackEvidence)).toThrow();
    const { manifestApproved: _flag, ...missing } = evidence();
    void _flag;
    expect(() => evaluateRollback(missing as RollbackEvidence)).toThrow();
    expect(() => evaluateRollback({ ...evidence(), extra: true } as RollbackEvidence)).toThrow();
    expect(() =>
      evaluateRollback({
        ...evidence(),
        previous: { ...release, extra: true },
      } as RollbackEvidence),
    ).toThrow();
  });
  it('무한/중복/0/string version과tag latest를허용하지않는다', () => {
    for (const versions of [[0], ['2'], [2, 2], Array.from({ length: 9 }, (_value, i) => i + 1)])
      expect(() =>
        evaluateRollback({ ...evidence(), pendingWorkVersions: versions } as RollbackEvidence),
      ).toThrow();
    expect(() =>
      evaluateRollback({ ...evidence(), previous: { ...release, imageDigest: 'latest' } }),
    ).toThrow();
  });
  it('incident/attempt identity와fingerprint는 같은원래실행에묶인다', () => {
    const value = evidence();
    const first = evaluateRollback(value);
    expect(first.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(evaluateRollback(value)).toEqual(first);
    expect(evaluateRollback({ ...value, attemptId: 'different' }).evidenceFingerprint).not.toBe(
      first.evidenceFingerprint,
    );
  });
});
