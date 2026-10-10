import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCoverage, validatePerformance, validateTestReport } from './report-validation.js';
import { admitCurrentWorkerRecovery } from './worker-recovery-evidence.js';
function testFiles(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const file = path + '/' + name;
    return statSync(file).isDirectory()
      ? testFiles(file)
      : /\.spec\.tsx?$/.test(file)
        ? [file]
        : [];
  });
}
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
export function verifySkeleton(): void {
  validateTestReport(json('.reports/u1/unit.json'), testFiles('tests/u1/unit'));
  validateTestReport(json('.reports/u1/integration.json'), testFiles('tests/u1/integration'));
  validateTestReport(json('.reports/u1/profile-probes.json'), testFiles('tests/u1/profile'));
  validateCoverage(json('.reports/u1/coverage/coverage-summary.json'));
  validatePerformance(json('.reports/u1/performance.json'));
  admitCurrentWorkerRecovery();
  const browser = json<{
    stats: { expected: number; skipped: number; unexpected: number; flaky: number };
  }>('.reports/u1/e2e.json');
  if (
    !Number.isInteger(browser.stats.expected) ||
    browser.stats.expected < 4 ||
    browser.stats.skipped !== 0 ||
    browser.stats.unexpected !== 0 ||
    browser.stats.flaky !== 0
  )
    throw new Error('PC UI 필수 시험의 전체 성공 증거가 필요합니다.');
  for (const path of [
    'check',
    'security',
    'runtime-security',
    'large-recovery',
    'deployment-compatibility',
    'accessibility',
  ])
    if (json<{ passed: boolean }>('.reports/u1/' + path + '.json').passed !== true)
      throw new Error('필수 보고서 실패: ' + path);
  const ack = json<{ acknowledgements: number; missingOrChanged: number }>(
    '.reports/u1/ack-preservation.json',
  );
  if (
    !Number.isInteger(ack.acknowledgements) ||
    ack.acknowledgements < 1 ||
    ack.missingOrChanged !== 0
  )
    throw new Error('독립 성공 ACK 보존 증거가 필요합니다.');
  writeFileSync(
    '.reports/u1/skeleton.json',
    JSON.stringify(
      {
        passed: true,
        realActivationAllowed: false,
        validatedAt: new Date().toISOString(),
        limitations: ['실제 회사망/Cognito/기업/자료/수신자/운영·AWS 배포 증거는 별도 gate입니다.'],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  verifySkeleton();
