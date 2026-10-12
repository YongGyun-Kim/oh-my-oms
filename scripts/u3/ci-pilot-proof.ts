import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, requireCondition } from '@oms/contracts';
import {
  collectCommandProof,
  preserveOutput,
  runProofCommand,
  securityOutputPaths,
} from '../u2/ci-full-proof.js';
import type { ProofPorts, ProofRunner } from '../u2/ci-full-proof.js';
import type { SourceIdentity } from '../u2/runtime-source.js';
import { pilotSourceIdentity, pilotTestInventory } from './runtime-source.js';
import type { PilotUnit } from './runtime-source.js';
import { pilotCommands, PILOT_DEFERRED } from './pilot-commands.js';
import type { PilotCommand } from './pilot-commands.js';
import {
  mergePilotProofs,
  validatePilotProof,
  validatePilotReceipt,
  validatePilotCommandReport,
} from './pilot-validation.js';
import type { PilotProof, PilotReceipt } from './pilot-validation.js';
import { pilotCoveragePath } from './coverage-evidence.js';

export interface PilotPorts extends ProofPorts {
  archive(path: string): void;
  write(path: string, bytes: Buffer): void;
}
const actualPorts: PilotPorts = {
  identity: pilotSourceIdentity,
  exists: existsSync,
  read: readFileSync,
  mtime: (path) => statSync(path).mtimeMs,
  archive: preserveOutput,
  write: (path, bytes) => {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, bytes, { mode: 0o600 });
  },
};
const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2));
const safeErrorCodes = [
  'ENOENT',
  'EACCES',
  'EINVAL',
  'ENOEXEC',
  'EMFILE',
  'ENFILE',
  'CHILD_ERROR',
  'RUNNER_ERROR',
] as const;
const safeSignals = [
  'SIGTERM',
  'SIGKILL',
  'SIGINT',
  'SIGABRT',
  'SIGSEGV',
  'SIGHUP',
  'SIGQUIT',
  'SIGPIPE',
  'SIGBUS',
  'SIGTRAP',
  'SIGFPE',
  'SIGILL',
  'SIGALRM',
  'SIGXCPU',
  'SIGXFSZ',
] as const;
const vitestCountFields = [
  'numTotalTests',
  'numPassedTests',
  'numFailedTests',
  'numPendingTests',
  'numTodoTests',
  'numFailedTestSuites',
  'numPendingTestSuites',
] as const;
// 공개 요약은 닫힌 scalar 투영만 사용한다. 원문 report/message/title/env는 복사하지 않는다.
const validationCodes = [
  'PILOT_COMMAND_PROOF',
  'PILOT_REPORT_BYTES',
  'PILOT_TEST_SCOPE',
  'PILOT_UNIT_SCOPE',
  'PILOT_E2E',
  'PILOT_COVERAGE_COMMAND',
  'PILOT_REQUIRED_FAILED',
] as const;
function validationErrorCode(error: unknown): PilotReceipt['validationErrorCode'] {
  if (error instanceof SyntaxError) return 'JSON_PARSE_FAILED';
  if (error && typeof error === 'object' && 'code' in error) {
    const code = validationCodes.find((allowed) => allowed === error.code);
    if (code) return code;
  }
  return 'UNKNOWN_VALIDATION_ERROR';
}
function diagnosticFrames(messages: unknown, source: SourceIdentity) {
  const frames: { path: string; line: number; column: number | null }[] = [];
  if (!Array.isArray(messages)) return frames;
  for (const message of messages.slice(0, 3)) {
    if (typeof message !== 'string') continue;
    for (const frame of message
      .slice(0, 65536)
      .matchAll(
        /((?:apps|packages|infra|scripts|tests)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs)):(\d+)(?::(\d+))?/g,
      )) {
      const path = frame[1]!,
        line = Number(frame[2]),
        column = frame[3] === undefined ? null : Number(frame[3]);
      if (
        Object.hasOwn(source.files, path) &&
        Number.isSafeInteger(line) &&
        line > 0 &&
        (column === null || (Number.isSafeInteger(column) && column > 0))
      ) {
        const entry = { path, line, column };
        if (!frames.some((item) => canonicalJson(item) === canonicalJson(entry)))
          frames.push(entry);
      }
      if (frames.length === 3) return frames;
    }
  }
  return frames;
}
function failedSuites(report: Record<string, unknown>, spec: PilotCommand, source: SourceIdentity) {
  const result: {
    file: string;
    status: 'failed';
    assertionCount: number;
    frames: ReturnType<typeof diagnosticFrames>;
  }[] = [];
  if (spec.scope === 'project' || !Array.isArray(report.testResults)) return result;
  const expected = new Set(pilotTestInventory(source, spec.scope));
  for (const suite of report.testResults) {
    if (
      !suite ||
      typeof suite !== 'object' ||
      typeof suite.name !== 'string' ||
      suite.status !== 'failed' ||
      !Array.isArray(suite.assertionResults)
    )
      continue;
    const file = relative(process.cwd(), resolve(suite.name)).replaceAll('\\', '/');
    if (!expected.has(file)) continue;
    result.push({
      file,
      status: 'failed',
      assertionCount: suite.assertionResults.length,
      frames: diagnosticFrames([suite.message], source),
    });
    if (result.length === 10) break;
  }
  return result;
}
function failedAssertions(
  report: Record<string, unknown>,
  spec: PilotCommand,
  source: SourceIdentity,
) {
  const result: {
    file: string;
    ordinal: number;
    status: 'failed';
    frames: { path: string; line: number; column: number | null }[];
  }[] = [];
  if (spec.scope === 'project' || !Array.isArray(report.testResults)) return result;
  const expected = new Set(pilotTestInventory(source, spec.scope));
  for (const suite of report.testResults) {
    if (
      !suite ||
      typeof suite !== 'object' ||
      typeof suite.name !== 'string' ||
      !Array.isArray(suite.assertionResults)
    )
      continue;
    const file = relative(process.cwd(), resolve(suite.name)).replaceAll('\\', '/');
    if (!expected.has(file)) continue;
    for (
      let ordinal = 0;
      ordinal < suite.assertionResults.length && result.length < 10;
      ordinal++
    ) {
      const assertion = suite.assertionResults[ordinal];
      if (!assertion || typeof assertion !== 'object' || assertion.status !== 'failed') continue;
      const frames = diagnosticFrames(assertion.failureMessages, source);
      result.push({ file, ordinal: ordinal + 1, status: 'failed', frames });
    }
    if (result.length === 10) break;
  }
  return result;
}
function failedChildDiagnostics(proof: PilotProof, ports: PilotPorts) {
  return pilotCommands(proof.source).flatMap((spec) => {
    const receipt = proof.reports[spec.key];
    if (!receipt || receipt.passed) return [];
    const execution = receipt.execution;
    const artifact = receipt.artifact;
    let tests: Record<string, number | boolean> | null = null;
    let assertions: ReturnType<typeof failedAssertions> = [];
    let suites: ReturnType<typeof failedSuites> = [];
    let reportStatus: 'NOT_APPLICABLE' | 'MISSING' | 'INVALID' | 'VALID_COUNTS' =
      /^u[123]-(unit|integration)$/.test(spec.key) ? 'MISSING' : 'NOT_APPLICABLE';
    if (reportStatus === 'MISSING' && ports.exists(spec.path)) {
      reportStatus = 'INVALID';
      try {
        const value: unknown = JSON.parse(ports.read(spec.path).toString());
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const report = value as Record<string, unknown>;
          assertions = failedAssertions(report, spec, proof.source);
          suites = failedSuites(report, spec, proof.source);
          if (
            typeof report.success === 'boolean' &&
            vitestCountFields.every(
              (field) => Number.isSafeInteger(report[field]) && Number(report[field]) >= 0,
            ) &&
            Number(report.numPassedTests) +
              Number(report.numFailedTests) +
              Number(report.numPendingTests) +
              Number(report.numTodoTests) ===
              report.numTotalTests &&
            (report.success === false ||
              (report.numFailedTests === 0 &&
                report.numPendingTests === 0 &&
                report.numTodoTests === 0 &&
                report.numFailedTestSuites === 0 &&
                report.numPendingTestSuites === 0)) &&
            Array.isArray(report.testResults) &&
            report.testResults.every(
              (suite) =>
                suite &&
                typeof suite === 'object' &&
                Array.isArray(suite.assertionResults) &&
                suite.assertionResults.every(
                  (assertion: unknown) =>
                    assertion &&
                    typeof assertion === 'object' &&
                    'status' in assertion &&
                    ['passed', 'failed', 'pending', 'todo', 'skipped'].includes(
                      String(assertion.status),
                    ),
                ),
            ) &&
            report.testResults.reduce((sum, suite) => sum + suite.assertionResults.length, 0) ===
              report.numTotalTests
          ) {
            tests = Object.fromEntries(
              vitestCountFields.map((field) => [field, Number(report[field])]),
            );
            tests.success = report.success;
            reportStatus = 'VALID_COUNTS';
          }
        }
      } catch {
        // 실패 진단의 JSON/IO 오류도 원문을 공개하지 않으며 성공 판정을 바꾸지 않는다.
      }
    }
    return [
      {
        key: spec.key,
        execution: {
          observed: execution?.observed === true,
          exitCode: Number.isSafeInteger(execution?.exitCode) ? execution.exitCode : null,
          signal:
            execution?.signal === null
              ? null
              : safeSignals.some((signal) => signal === execution?.signal)
                ? execution.signal
                : 'UNRECOGNIZED_SIGNAL',
          expired: execution?.expired === true,
          logFailed: execution?.logFailed === true,
          errorCode:
            execution?.errorCode === null
              ? null
              : safeErrorCodes.some((code) => code === execution?.errorCode)
                ? execution.errorCode
                : 'UNRECOGNIZED_ERROR_CODE',
        },
        artifact: {
          exists: artifact?.exists === true,
          fresh: artifact?.fresh === true,
          bytes:
            Number.isSafeInteger(artifact?.bytes) && Number(artifact.bytes) >= 0
              ? artifact.bytes
              : null,
        },
        validationFailure:
          receipt.validationFailure === 'PILOT_RECEIPT_VALIDATION_FAILED' ||
          receipt.validationFailure === 'PILOT_COMMAND_REPORT_VALIDATION_FAILED'
            ? receipt.validationFailure
            : null,
        reportStatus,
        tests,
        validationErrorCode:
          validationCodes.some((code) => code === receipt.validationErrorCode) ||
          receipt.validationErrorCode === 'JSON_PARSE_FAILED' ||
          receipt.validationErrorCode === 'UNKNOWN_VALIDATION_ERROR'
            ? receipt.validationErrorCode
            : null,
        assertions,
        suites,
      },
    ];
  });
}
export async function collectPilotCommand(
  spec: PilotCommand,
  source: SourceIdentity,
  run: ProofRunner = runProofCommand,
  ports: PilotPorts = actualPorts,
): Promise<PilotReceipt> {
  ports.archive(spec.path);
  ports.archive('.reports/u2/project-' + spec.key + '.log');
  if (spec.key.endsWith('-coverage') && spec.scope !== 'project')
    for (const suffix of [
      'coverage-final.json',
      'coverage-summary.json',
      'lcov.info',
      'evidence.json',
    ])
      ports.archive(pilotCoveragePath(spec.scope) + '/' + suffix);
  if (spec.key === 'security') for (const path of securityOutputPaths()) ports.archive(path);
  const previous = Object.fromEntries(
    Object.keys(spec.environment).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, spec.environment);
    const result = await collectCommandProof(
      spec,
      source,
      async (...args) => {
        const outcome = await run(...args);
        requireCondition(
          outcome !== undefined,
          503,
          'PILOT_CHILD_UNOBSERVED',
          'void child 결과는 실행 성공이 아닙니다.',
        );
        return outcome;
      },
      ports,
    );
    const receipt: PilotReceipt = {
      ...result,
      mode: 'pilot-current',
      source,
      environment: spec.environment,
    };
    if (receipt.passed) {
      let report: Record<string, unknown> | null;
      try {
        report = validatePilotReceipt(receipt, spec, source, ports.read);
      } catch (error) {
        receipt.passed = false;
        receipt.validationFailure = 'PILOT_RECEIPT_VALIDATION_FAILED';
        receipt.validationErrorCode = validationErrorCode(error);
        return receipt;
      }
      try {
        validatePilotCommandReport(spec, report, source);
      } catch (error) {
        receipt.passed = false;
        receipt.validationFailure = 'PILOT_COMMAND_REPORT_VALIDATION_FAILED';
        receipt.validationErrorCode = validationErrorCode(error);
      }
    }
    return receipt;
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
}
export async function collectPilotProof(
  scope: PilotUnit | 'project' | 'all',
  run: ProofRunner = runProofCommand,
  ports: PilotPorts = actualPorts,
) {
  requireCondition(
    ['u1', 'u2', 'u3', 'project', 'all'].includes(scope) &&
      process.env.NODE_ENV !== 'production' &&
      process.env.OMS_U2_SYNTHETIC_PROFILE === 'approved-local-only',
    503,
    'PILOT_PROOF_ADMISSION',
    '명시 pilot 격리 합성 수집만 허용합니다.',
  );
  const source = ports.identity(),
    file = '.reports/u3/pilot/validation-' + scope + '.json',
    specs = pilotCommands(source).filter((spec) => scope === 'all' || spec.scope === scope);
  let proof: PilotProof = {
      version: 2,
      mode: 'pilot-current',
      source,
      reports: {},
      deferred: [...PILOT_DEFERRED],
    },
    passed = false;
  if (ports.exists(file)) {
    const prior = JSON.parse(ports.read(file).toString()) as PilotProof;
    if (
      prior.version === 2 &&
      prior.mode === 'pilot-current' &&
      canonicalJson(prior.source) === canonicalJson(source)
    )
      proof = mergePilotProofs([prior], source);
    else {
      ports.archive(file);
      for (const receipt of Object.values(prior.reports ?? {})) ports.archive(receipt.path);
    }
  }
  try {
    if (scope === 'project')
      proof = mergePilotProofs(
        [
          proof,
          ...(['u1', 'u2', 'u3'] as const).map(
            (unit) =>
              JSON.parse(
                ports.read('.reports/u3/pilot/validation-' + unit + '.json').toString(),
              ) as PilotProof,
          ),
        ],
        source,
      );
    for (const spec of specs) {
      const prior = proof.reports[spec.key];
      if (prior)
        validatePilotCommandReport(
          spec,
          validatePilotReceipt(prior, spec, source, ports.read),
          source,
        );
      else {
        try {
          proof.reports[spec.key] = await collectPilotCommand(spec, source, run, ports);
          requireCondition(
            proof.reports[spec.key]!.passed === true,
            503,
            'PILOT_CHILD_FAILED',
            '실패/취소/누락 증거를 보존하고 다음 검사를 차단합니다: ' + spec.key,
          );
        } finally {
          ports.write(file, jsonBytes(proof));
        }
      }
    }
    if (scope === 'project' || scope === 'all') {
      const result = validatePilotProof(proof, source, ports.read);
      ports.write('.reports/u3/pilot/release-validation.json', jsonBytes(result));
    }
    requireCondition(
      canonicalJson(ports.identity()) === canonicalJson(source),
      503,
      'PILOT_FINAL_SOURCE',
      '수집 종료의 전체 source가 달라졌습니다.',
    );
    passed = true;
    return proof;
  } finally {
    ports.write(file, jsonBytes(proof));
    ports.write(
      '.reports/u3/pilot/' + scope + '-job-summary.json',
      jsonBytes({
        passed,
        mode: 'pilot-current',
        sourceDigest: source.digest,
        scope,
        completed: Object.entries(proof.reports)
          .filter(([, receipt]) => receipt.passed)
          .map(([key]) => key),
        failures: failedChildDiagnostics(proof, ports),
        deferred: [...PILOT_DEFERRED],
        realActivationAllowed: false,
        observedAt: new Date().toISOString(),
      }),
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const scope = process.argv[2] ?? 'all';
  requireCondition(
    ['u1', 'u2', 'u3', 'project', 'all'].includes(scope),
    503,
    'PILOT_PROOF_SCOPE',
    '명시 수집 역할만 실행합니다.',
  );
  await collectPilotProof(scope as PilotUnit | 'project' | 'all');
}
