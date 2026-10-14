import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireCondition, canonicalJson } from '@oms/contracts';
import { runtimeSourceIdentity, testInventory, sha256 } from './runtime-source.js';
import type { SourceIdentity } from './runtime-source.js';
import { validateTestReport } from '../u1/report-validation.js';
import {
  PILOT_PROFILE,
  assertPilotCounts,
  assertPilotRestorationScale,
  validatePilotPerformance,
} from './verification-profile.js';
export const REQUIRED_PROOFS = [
  'u1-unit',
  'u1-integration',
  'u2-unit',
  'u2-integration',
  'u2-e2e',
  'check',
  'coverage-aggregate',
  'security',
  'runtime-security',
  'performance',
  'recovery',
] as const;
export interface ValidationProof {
  version: 1;
  source: SourceIdentity;
  reports: Record<
    string,
    {
      path: string;
      sha256: string;
      command: string[];
      passed: boolean;
      startedAt: string;
      finishedAt: string;
    }
  >;
}
export function validateReleaseProof(
  proof: ValidationProof,
  source: SourceIdentity,
  read: (path: string) => unknown,
) {
  requireCondition(
    proof.version === 1 && canonicalJson(proof.source) === canonicalJson(source),
    503,
    'RELEASE_SOURCE_IDENTITY',
    '현재 정확 source/lock/tool/inventory의 동일 증거만 허용합니다.',
  );
  for (const key of REQUIRED_PROOFS) {
    const receipt = proof.reports[key];
    requireCondition(
      receipt?.passed &&
        receipt.command.length > 0 &&
        /^[a-f0-9]{64}$/.test(receipt.sha256) &&
        Number.isFinite(Date.parse(receipt.startedAt)) &&
        Date.parse(receipt.finishedAt) >= Date.parse(receipt.startedAt),
      503,
      'RELEASE_REQUIRED_REPORT',
      '필수 실행 실패/누락/취소는 차단합니다: ' + key,
    );
    const report = read(receipt.path) as Record<string, unknown>;
    if (
      key === 'u1-unit' ||
      key === 'u1-integration' ||
      key === 'u2-unit' ||
      key === 'u2-integration'
    ) {
      const unit = key.startsWith('u1') ? 'u1' : 'u2',
        layer = key.endsWith('unit') ? 'unit' : 'integration';
      validateTestReport(
        report as unknown as Parameters<typeof validateTestReport>[0],
        testInventory(source, unit).filter((path) => path.includes('/' + layer + '/')),
      );
    } else if (key === 'u2-e2e') {
      const stats = report.stats as {
        expected: number;
        skipped: number;
        unexpected: number;
        flaky: number;
      };
      requireCondition(
        stats &&
          stats.expected >= 3 &&
          stats.skipped === 0 &&
          stats.unexpected === 0 &&
          stats.flaky === 0,
        503,
        'RELEASE_E2E',
        '필수 PC 시험의 실패/skip/flaky를 인정하지 않습니다.',
      );
    } else if (key === 'performance') validatePilotPerformance(report);
    else if (key === 'coverage-aggregate') {
      requireCondition(
        report.passed === true &&
          report.threshold === 80 &&
          canonicalJson(report.source) === canonicalJson(source) &&
          Number.isInteger(report.denominator) &&
          Number(report.denominator) > 0 &&
          Number.isInteger(report.numerator) &&
          Number(report.numerator) >= 0 &&
          Number(report.numerator) <= Number(report.denominator) &&
          Number(report.numerator) * 100 >= Number(report.denominator) * 80,
        503,
        'RELEASE_COVERAGE',
        '현재 전체 직접 testable 제품의 미실행 포함80% 합집합이 필요합니다.',
      );
    } else
      requireCondition(
        report.passed === true,
        503,
        'RELEASE_REPORT_FAILED',
        '필수 검증 실패/미실행: ' + key,
      );
    if (key === 'runtime-security')
      requireCondition(
        report.sameProductImageVerified === true &&
          typeof report.imageId === 'string' &&
          /^sha256:[a-f0-9]{64}$/.test(report.imageId) &&
          (read(proof.reports.security!.path) as { imageId?: string }).imageId === report.imageId,
        503,
        'RELEASE_RUNTIME_IMAGE',
        '스캔한 동일 제품 image의 격리 실행 보안 근거가 필요합니다.',
      );
    if (key === 'recovery') {
      requireCondition(
        report.verificationProfileId === PILOT_PROFILE.id,
        503,
        'RELEASE_RECOVERY_PROFILE',
        '같은 현재 pilot의 실제 복구가 필요합니다.',
      );
      assertPilotCounts(report.profile);
      assertPilotRestorationScale(
        report.beforeCounts as { orders: unknown; lines: unknown; products: unknown },
      );
      requireCondition(
        report.ackMissingOrChanged === 0 &&
          report.authorityResurrections === 0 &&
          Number(report.rtoMilliseconds) <= 1800000 &&
          report.originalUnknownPreserved === true &&
          report.freshMfaReadVerified === true,
        503,
        'RELEASE_RECOVERY',
        '독립 ACK·부활0·UNKNOWN·현재 MFA조회까지30분 복원 증거가 필요합니다.',
      );
    }
  }
  return {
    passed: true,
    sourceDigest: source.digest,
    validated: REQUIRED_PROOFS,
    realActivationAllowed: false,
  };
}
export function releaseValidation() {
  const source = runtimeSourceIdentity();
  let passed = false;
  try {
    const proof = JSON.parse(
      readFileSync('.reports/u2/validation-source.json', 'utf8'),
    ) as ValidationProof;
    const result = validateReleaseProof(proof, source, (path) => {
      const bytes = readFileSync(path),
        receipt = Object.values(proof.reports).find((r) => r.path === path);
      requireCondition(
        receipt && sha256(bytes) === receipt.sha256,
        503,
        'RELEASE_REPORT_CHANGED',
        '원래 command 결과 bytes가 다릅니다.',
      );
      return JSON.parse(bytes.toString());
    });
    passed = result.passed;
    return result;
  } finally {
    mkdirSync('.reports/u2', { recursive: true, mode: 0o700 });
    writeFileSync(
      '.reports/u2/release-validation.json',
      JSON.stringify(
        {
          passed,
          sourceDigest: source.digest,
          realActivationAllowed: false,
          observedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  releaseValidation();
