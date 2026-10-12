import { relative, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { canonicalJson, requireCondition } from '@oms/contracts';
import type { SourceIdentity } from '../u2/runtime-source.js';
import { sha256 } from '../u2/runtime-source.js';
import { validateTestReport } from '../u1/report-validation.js';
import type { collectCommandProof } from '../u2/ci-full-proof.js';
import { aggregatePilotCoverage } from './coverage-aggregate.js';
import type { PilotCoverageEvidence } from './coverage-evidence.js';
import { pilotTestInventory } from './runtime-source.js';
import { pilotCommands, PILOT_DEFERRED } from './pilot-commands.js';
import type { PilotCommand } from './pilot-commands.js';

export type PilotReceipt = Awaited<ReturnType<typeof collectCommandProof>> & {
  mode: 'pilot-current';
  source: SourceIdentity;
  environment: Record<string, string>;
};
export interface PilotProof {
  version: 2;
  mode: 'pilot-current';
  source: SourceIdentity;
  reports: Record<string, PilotReceipt>;
  deferred: readonly string[];
}
export function validatePilotReceipt(
  receipt: PilotReceipt,
  spec: PilotCommand,
  source: SourceIdentity,
  read: (path: string) => Buffer,
) {
  const execution = receipt?.execution;
  requireCondition(
    receipt?.passed === true &&
      receipt.mode === 'pilot-current' &&
      canonicalJson(receipt.source) === canonicalJson(source) &&
      canonicalJson(receipt.environment) === canonicalJson(spec.environment) &&
      canonicalJson(receipt.command) === canonicalJson(spec.command) &&
      receipt.path === spec.path &&
      Number.isFinite(Date.parse(receipt.startedAt)) &&
      Date.parse(receipt.finishedAt) >= Date.parse(receipt.startedAt) &&
      execution?.observed === true &&
      execution.exitCode === 0 &&
      execution.signal === null &&
      execution.errorCode === null &&
      execution.expired === false &&
      execution.logFailed === false &&
      Number.isSafeInteger(execution.stdoutBytes) &&
      Number(execution.stdoutBytes) >= 0 &&
      Number.isSafeInteger(execution.stderrBytes) &&
      Number(execution.stderrBytes) >= 0 &&
      receipt.artifact?.exists === true &&
      receipt.artifact.fresh === true &&
      Number(receipt.artifact.bytes) > 0 &&
      Number(receipt.artifact.modifiedAtMilliseconds) >= Date.parse(receipt.startedAt) &&
      Math.floor(Number(receipt.artifact.modifiedAtMilliseconds)) <= Date.parse(receipt.finishedAt),
    503,
    'PILOT_COMMAND_PROOF',
    '실제 종료·현재 source·정확 명령/환경·새 산출물이 필요합니다: ' + spec.key,
  );
  const bytes = read(spec.path);
  requireCondition(
    sha256(bytes) === receipt.sha256 &&
      receipt.artifact.sha256 === receipt.sha256 &&
      bytes.length === receipt.artifact.bytes,
    503,
    'PILOT_REPORT_BYTES',
    '실행한 원문 bytes/hash가 달라졌습니다: ' + spec.key,
  );
  return spec.key === 'image-build'
    ? null
    : (JSON.parse(bytes.toString()) as Record<string, unknown>);
}
export function validatePilotTests(value: unknown, expectedFiles: readonly string[]): void {
  validateTestReport(value as Parameters<typeof validateTestReport>[0], expectedFiles);
  const report = value as {
    numTotalTests: number;
    numFailedTestSuites: number;
    numPendingTestSuites: number;
    testResults: { name: string; status: string; assertionResults: { status: string }[] }[];
  };
  const files = report.testResults
    .map((result) => relative(process.cwd(), resolve(result.name)).replaceAll('\\', '/'))
    .sort();
  requireCondition(
    canonicalJson(files) === canonicalJson([...expectedFiles].sort()) &&
      report.numFailedTestSuites === 0 &&
      report.numPendingTestSuites === 0 &&
      report.testResults.every(
        (result) =>
          result.status === 'passed' &&
          Array.isArray(result.assertionResults) &&
          result.assertionResults.length > 0 &&
          result.assertionResults.every((test) => test.status === 'passed'),
      ) &&
      report.testResults.reduce((sum, result) => sum + result.assertionResults.length, 0) ===
        report.numTotalTests,
    503,
    'PILOT_TEST_SCOPE',
    '실제 전체 파일·사례 수·상태를 대조해야 합니다.',
  );
}
export function validatePilotCommandReport(
  spec: PilotCommand,
  report: Record<string, unknown> | null,
  source: SourceIdentity,
): void {
  if (/^u[123]-(unit|integration)$/.test(spec.key)) {
    requireCondition(
      spec.scope !== 'project',
      503,
      'PILOT_UNIT_SCOPE',
      '정확한 시험 유닛이 필요합니다.',
    );
    validatePilotTests(
      report,
      pilotTestInventory(source, spec.scope).filter((path) =>
        path.includes('/' + spec.key.split('-')[1] + '/'),
      ),
    );
  } else if (spec.key === 'runtime-security-tests')
    validatePilotTests(report, ['tests/u2/integration/runtime-security.spec.ts']);
  else if (spec.key === 'u2-e2e') {
    const stats = report?.stats as
      { expected?: number; skipped?: number; unexpected?: number; flaky?: number } | undefined;
    requireCondition(
      stats &&
        Number.isInteger(stats.expected) &&
        Number(stats.expected) >= 3 &&
        stats.skipped === 0 &&
        stats.unexpected === 0 &&
        stats.flaky === 0 &&
        Array.isArray(report!.errors) &&
        report!.errors.length === 0,
      503,
      'PILOT_E2E',
      '현재 PC 회귀의 실패/skip/flaky를 인정하지 않습니다.',
    );
  } else if (spec.key.endsWith('-coverage')) {
    const coverage = report as unknown as PilotCoverageEvidence;
    requireCondition(
      coverage?.version === 2 &&
        coverage.mode === 'pilot-current' &&
        coverage.unit === spec.scope &&
        coverage.passed === true &&
        coverage.completeScope === true &&
        canonicalJson(coverage.source) === canonicalJson(source),
      503,
      'PILOT_COVERAGE_COMMAND',
      '해당 현재 유닛의 전체 기여 증거가 필요합니다.',
    );
  } else if (spec.key !== 'image-build')
    requireCondition(
      report?.passed === true,
      503,
      'PILOT_REQUIRED_FAILED',
      '필수 실행 실패/누락: ' + spec.key,
    );
}
export function mergePilotProofs(proofs: PilotProof[], source: SourceIdentity): PilotProof {
  const merged: PilotProof = {
    version: 2,
    mode: 'pilot-current',
    source,
    reports: {},
    deferred: [...PILOT_DEFERRED],
  };
  for (const proof of proofs) {
    requireCondition(
      proof.version === 2 &&
        proof.mode === 'pilot-current' &&
        canonicalJson(proof.source) === canonicalJson(source) &&
        canonicalJson(proof.deferred) === canonicalJson(PILOT_DEFERRED),
      503,
      'PILOT_PROOF_SOURCE',
      '같은 pilot source와 명시 Deferred만 합칩니다.',
    );
    for (const [key, receipt] of Object.entries(proof.reports)) {
      requireCondition(
        !merged.reports[key] || canonicalJson(merged.reports[key]) === canonicalJson(receipt),
        503,
        'PILOT_DUPLICATE_PROOF',
        '다른 결과를 같은 key로 덮어쓸 수 없습니다.',
      );
      merged.reports[key] = receipt;
    }
  }
  return merged;
}
export function validatePilotProof(
  proof: PilotProof,
  source: SourceIdentity,
  read: (path: string) => Buffer = readFileSync,
  readSource: (path: string) => string = (path) => readFileSync(path, 'utf8'),
) {
  mergePilotProofs([proof], source);
  const commands = pilotCommands(source),
    expectedKeys = commands.map((command) => command.key).sort(),
    reports: Record<string, Record<string, unknown>> = {};
  requireCondition(
    canonicalJson(Object.keys(proof.reports).sort()) === canonicalJson(expectedKeys),
    503,
    'PILOT_REQUIRED_PROOFS',
    '필수 검사 누락/추가·Deferred의 PASS 대체를 차단합니다.',
  );
  for (const spec of commands) {
    const report = validatePilotReceipt(proof.reports[spec.key]!, spec, source, read);
    validatePilotCommandReport(spec, report, source);
    if (report) reports[spec.key] = report;
    if (/^u[123]-(unit|integration)$/.test(spec.key)) {
      const unit = spec.scope;
      requireCondition(
        unit !== 'project',
        503,
        'PILOT_UNIT_SCOPE',
        '정확한 시험 유닛이 필요합니다.',
      );
      validatePilotTests(
        report,
        pilotTestInventory(source, unit).filter((path) =>
          path.includes('/' + spec.key.split('-')[1] + '/'),
        ),
      );
    } else if (spec.key === 'runtime-security-tests')
      validatePilotTests(report, ['tests/u2/integration/runtime-security.spec.ts']);
    else if (spec.key === 'u2-e2e') {
      const stats = report!.stats as
        { expected?: number; skipped?: number; unexpected?: number; flaky?: number } | undefined;
      requireCondition(
        stats &&
          Number.isInteger(stats.expected) &&
          Number(stats.expected) >= 3 &&
          stats.skipped === 0 &&
          stats.unexpected === 0 &&
          stats.flaky === 0 &&
          Array.isArray(report!.errors) &&
          report!.errors.length === 0,
        503,
        'PILOT_E2E',
        '현재 PC 회귀의 실패/skip/flaky를 인정하지 않습니다.',
      );
    } else if (!spec.key.endsWith('-coverage') && spec.key !== 'image-build')
      requireCondition(
        report!.passed === true,
        503,
        'PILOT_REQUIRED_FAILED',
        '필수 실행 실패/누락: ' + spec.key,
      );
  }
  const contributions = ['u1', 'u2', 'u3'].map(
      (unit) => reports[unit + '-coverage'] as unknown as PilotCoverageEvidence,
    ),
    aggregate = aggregatePilotCoverage(contributions, source, read, readSource);
  requireCondition(
    aggregate.passed && canonicalJson(reports['coverage-aggregate']) === canonicalJson(aggregate),
    503,
    'PILOT_WHOLE_COVERAGE',
    '원문3기여의 동일 전체 분모80% 결과가 필요합니다.',
  );
  requireCondition(
    canonicalJson(reports.check!.completed) === canonicalJson(['type', 'lint', 'format']) &&
      reports.check!.sourceDigest === source.digest,
    503,
    'PILOT_CHECK_SCOPE',
    '전체 type/lint/format이 필요합니다.',
  );
  requireCondition(
    reports.synth!.sourceDigest === source.digest &&
      reports.synth!.actualAwsDeploymentPerformed === false &&
      Array.isArray(reports.synth!.stacks) &&
      reports.synth!.stacks.length === 1 &&
      typeof reports.synth!.templateSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(reports.synth!.templateSha256),
    503,
    'PILOT_SYNTH_SOURCE',
    '동일 pilot source의 offline 합성 template가 필요합니다.',
  );
  const image = reports.image!,
    security = reports.security!,
    runtime = reports['runtime-security']!;
  requireCondition(
    image.mode === 'pilot-current' &&
      image.sourceDigest === source.digest &&
      image.lock === source.lock &&
      typeof image.imageId === 'string' &&
      /^sha256:[a-f0-9]{64}$/.test(image.imageId) &&
      security.imageId === image.imageId &&
      runtime.imageId === image.imageId &&
      security.sourceDigest === source.digest &&
      runtime.sourceDigest === source.digest &&
      runtime.sameProductImageVerified === true &&
      runtime.actualTlsVerification === true &&
      runtime.cleanupFailed === false &&
      runtime.roles === 4 &&
      canonicalJson(security.completed) ===
        canonicalJson([
          'dependencies-physical-bundle-and-audit',
          'sast',
          'secrets',
          'iac-context-verified-no-real-activation',
          'container-os-and-library',
        ]),
    503,
    'PILOT_SAME_IMAGE',
    '동일 source·lock·제품 image의 스캔/격리 TLS·4role·종료 관측이 필요합니다.',
  );
  return {
    version: 2,
    mode: 'pilot-current',
    passed: true,
    sourceDigest: source.digest,
    lock: source.lock,
    imageId: image.imageId,
    validated: expectedKeys,
    deferred: PILOT_DEFERRED.map((key) => ({ key, status: 'DEFERRED' })),
    realActivationAllowed: false,
  };
}
