import { describe, it, expect } from 'vitest';
import { runtimeSecurityEvidence, specFiles } from '../../../scripts/u1/runtime-security-report.js';
const unit = [
  'bff.spec.ts',
  'portal-session.spec.tsx',
  'admission.spec.ts',
  'runtime-configuration.spec.ts',
].map((name) => 'tests/u1/unit/' + name);
const integration = [
  'http-boundaries.spec.ts',
  'http-primary-ac.spec.ts',
  'auth-access.spec.ts',
  'business-flow.spec.ts',
  'recovery-security.spec.ts',
].map((name) => 'tests/u1/integration/' + name);
const report = (files: string[]) => ({
  success: true,
  numTotalTests: files.length,
  numPassedTests: files.length,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: files.map((name) => ({ name: '/workspace/' + name })),
});
const browser = () => ({ stats: { expected: 4, skipped: 0, unexpected: 0, flaky: 0 } });
const check = (
  u: unknown = report(unit),
  i: unknown = report(integration),
  b: unknown = browser(),
  uf = unit,
  inf = integration,
) => runtimeSecurityEvidence(u, i, b, uf, inf);
describe('실행된 전체 보안 증거와 합성/실환경 경계', () => {
  it('전체 HTTP/PG/PC 통과에도 실제 Cognito·망·AWS 활성화를 발명하지 않는다', () => {
    expect(check()).toMatchObject({
      passed: true,
      actualCognitoVerified: false,
      actualCompanyNetworkVerified: false,
      actualAwsDeploymentPerformed: false,
      tests: { browserCases: 4 },
    });
  });
  it('선택 unit/integration 파일 누락은 전체 통과가 아니다', () => {
    expect(() => check(report(unit.slice(1)))).toThrow();
    expect(() => check(undefined, report(integration.slice(1)))).toThrow();
  });
  it('skip/pending/실패는 다른 계층 통과로 대체하지 못한다', () => {
    expect(() => check({ ...report(unit), numPendingTests: 1 })).toThrow();
    expect(() => check(undefined, { ...report(integration), numFailedTests: 1 })).toThrow();
  });
  it('PC 4경로 미만/문자열 개수/빈 보고서는 거절한다', () => {
    for (const expected of [0, 3, '4', null])
      expect(() =>
        check(undefined, undefined, { stats: { expected, skipped: 0, unexpected: 0, flaky: 0 } }),
      ).toThrow();
    expect(() => check(undefined, undefined, null)).toThrow();
  });
  it('PC skipped/unexpected/flaky 중 하나라도 있으면 실패한다', () => {
    for (const key of ['skipped', 'unexpected', 'flaky'])
      expect(() =>
        check(undefined, undefined, { stats: { ...browser().stats, [key]: 1 } }),
      ).toThrow();
  });
  it('형식상 전체 결과여도 필수 실제 HTTP/회수 source 시험이 빠지면 실패한다', () => {
    const files = integration.filter((path) => !path.endsWith('recovery-security.spec.ts'));
    expect(() => check(undefined, report(files), undefined, unit, files)).toThrow();
  });
  it('필수 production/접점/BFF 시험을 제외한 결과는 준비 증거가 아니다', () => {
    const files = unit.filter((path) => !path.endsWith('bff.spec.ts'));
    expect(() => check(report(files), undefined, undefined, files)).toThrow();
  });
  it('재귀로 실제 spec만 열거하고 새 필수 파일을 포함한다', () => {
    const files = specFiles('tests/u1/integration');
    expect(files).toContain('tests/u1/integration/http-auth-intents.spec.ts');
    expect(files.every((file) => /\.spec\.tsx?$/.test(file))).toBe(true);
  });
});
