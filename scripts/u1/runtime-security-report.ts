import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateTestReport } from './report-validation.js';
export function specFiles(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const file = path + '/' + name;
    return statSync(file).isDirectory()
      ? specFiles(file)
      : /\.spec\.tsx?$/.test(file)
        ? [file]
        : [];
  });
}
export function runtimeSecurityEvidence(
  unit: unknown,
  integration: unknown,
  browser: unknown,
  expectedUnit: string[],
  expectedIntegration: string[],
) {
  validateTestReport(unit as Parameters<typeof validateTestReport>[0], expectedUnit);
  validateTestReport(integration as Parameters<typeof validateTestReport>[0], expectedIntegration);
  if (browser === null || typeof browser !== 'object')
    throw new Error('실제 PC 실행 보고서가 필요합니다.');
  const result = browser as {
    stats?: { expected?: number; skipped?: number; unexpected?: number; flaky?: number };
  };
  const stats = result.stats;
  if (
    !stats ||
    typeof stats.expected !== 'number' ||
    !Number.isInteger(stats.expected) ||
    stats.expected < 4 ||
    stats.skipped !== 0 ||
    stats.unexpected !== 0 ||
    stats.flaky !== 0
  )
    throw new Error('실제 PC 보안/계정/범위 경로의 전체 성공이 필요합니다.');
  for (const required of [
    'http-boundaries.spec.ts',
    'http-primary-ac.spec.ts',
    'auth-access.spec.ts',
    'business-flow.spec.ts',
    'recovery-security.spec.ts',
  ])
    if (!expectedIntegration.some((path) => path.endsWith('/' + required)))
      throw new Error('실제 API/신원/회수/tenant 경계의 시험이 없습니다.');
  for (const required of [
    'bff.spec.ts',
    'portal-session.spec.tsx',
    'admission.spec.ts',
    'runtime-configuration.spec.ts',
  ])
    if (!expectedUnit.some((path) => path.endsWith('/' + required)))
      throw new Error('BFF/현재세대/운영차단의 시험이 없습니다.');
  return {
    passed: true,
    scope: '로컬 실제HTTP/BFF/두PG·PC의승인된합성신원/사설ingress',
    actualCognitoVerified: false,
    actualCompanyNetworkVerified: false,
    actualAwsDeploymentPerformed: false,
    tests: {
      unitFiles: expectedUnit.length,
      integrationFiles: expectedIntegration.length,
      browserCases: stats.expected,
    },
    boundaries: [
      '현재MFA·회수/epoch',
      'origin/host/CSRF/cookie·stream기한',
      '고객/직원·tenant/행위·판단근거비노출',
      '응답유실/늦은본문·원래키',
      'production합성등록/망fallback차단',
    ],
    limitations: [
      '별도 실 provider/회사망/기기/자격/자료·운영 준비를 합성 통과로 대체하지 않습니다.',
    ],
    observedAt: new Date().toISOString(),
  };
}
export function reportRuntimeSecurity(): void {
  const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
  const report = runtimeSecurityEvidence(
    json('.reports/u1/unit.json'),
    json('.reports/u1/integration.json'),
    json('.reports/u1/e2e.json'),
    specFiles('tests/u1/unit'),
    specFiles('tests/u1/integration'),
  );
  writeFileSync('.reports/u1/runtime-security.json', JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  reportRuntimeSecurity();
