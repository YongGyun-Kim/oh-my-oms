import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { canonicalJson } from '@oms/contracts';
import { runProofCommand } from '../../../scripts/u2/ci-full-proof.js';
import type { CommandExecution } from '../../../scripts/u2/ci-full-proof.js';
import { sha256 } from '../../../scripts/u2/runtime-source.js';
import type { SourceIdentity } from '../../../scripts/u2/runtime-source.js';
import { collectPilotCommand, collectPilotProof } from '../../../scripts/u3/ci-pilot-proof.js';
import type { PilotPorts } from '../../../scripts/u3/ci-pilot-proof.js';
import { JsonReporter } from 'vitest/node';
import type { TestModule, Vitest } from 'vitest/node';
import { pilotCommands, PILOT_DEFERRED } from '../../../scripts/u3/pilot-commands.js';
import {
  mergePilotProofs,
  validatePilotProof,
  validatePilotReceipt,
  validatePilotTests,
} from '../../../scripts/u3/pilot-validation.js';
import type { PilotProof, PilotReceipt } from '../../../scripts/u3/pilot-validation.js';
import { validatePilotImage } from '../../../scripts/u3/pilot-tools.js';
import { pilotProductInventory, pilotTestInventory } from '../../../scripts/u3/runtime-source.js';
import { buildPilotCoverageEvidence } from '../../../scripts/u3/coverage-evidence.js';
import { aggregatePilotCoverage } from '../../../scripts/u3/coverage-aggregate.js';
import {
  MAX_DIAGNOSTIC_REPORT_BYTES,
  observedError,
  U3_COVERAGE_TEST_REPORT,
} from '../../../scripts/u3/pilot-safe-diagnostics.js';

const text = 'const a = 1;',
  product = 'scripts/u3/fixture.ts',
  imageId = 'sha256:' + 'f'.repeat(64),
  source: SourceIdentity = {
    version: 1,
    head: 'a'.repeat(40),
    digest: 'b'.repeat(64),
    lock: 'c'.repeat(64),
    tools: { node: 'v22.23.3', vitest: '5.0.3', v8: '5.0.3', typescript: '6.0.3' },
    files: Object.fromEntries([
      [product, sha256(text)],
      ...(['u1', 'u2', 'u3'] as const).flatMap((unit) =>
        ['unit', 'integration'].map((layer) => [
          'tests/' + unit + '/' + layer + '/fixture.spec.ts',
          'd'.repeat(64),
        ]),
      ),
    ]),
  };
const execution: CommandExecution = {
  observed: true,
  exitCode: 0,
  signal: null,
  errorCode: null,
  expired: false,
  logFailed: false,
  stdoutBytes: 0,
  stderrBytes: 0,
};
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
function testReport(files: readonly string[]) {
  return {
    success: true,
    numTotalTests: files.length,
    numPassedTests: files.length,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    testResults: files.map((name) => ({
      name: resolve(name),
      status: 'passed',
      assertionResults: [{ status: 'passed' }],
    })),
  };
}
function memoryPorts() {
  const files = new Map<string, Buffer>(),
    archived: string[] = [];
  let current = source,
    modified = Date.now(),
    diagnosticModified = modified;
  const ports: PilotPorts = {
    identity: () => current,
    exists: (path) => files.has(path),
    read: (path) => {
      const value = files.get(path);
      if (!value) throw new Error('제어된 보고서 누락');
      return value;
    },
    mtime: () => modified,
    readCoverageTests: (startedAt, finishedAt) => {
      const value = files.get(U3_COVERAGE_TEST_REPORT);
      return value &&
        diagnosticModified >= Date.parse(startedAt) &&
        diagnosticModified <= Date.parse(finishedAt)
        ? value
        : null;
    },
    archive: (path) => {
      if (files.has(path)) archived.push(path);
      if (path === U3_COVERAGE_TEST_REPORT) {
        files.delete(path);
        diagnosticModified = 0;
      }
    },
    write: (path, value) => {
      files.set(path, value);
      modified = Date.now();
      if (path === U3_COVERAGE_TEST_REPORT) diagnosticModified = modified;
    },
  };
  return {
    files,
    archived,
    ports,
    source: (value: SourceIdentity) => {
      current = value;
    },
    stale: () => {
      modified = 0;
      diagnosticModified = 0;
    },
  };
}
function wholeProof() {
  const files = new Map<string, Buffer>(),
    reports: PilotProof['reports'] = {},
    raw = {
      [resolve(product)]: {
        path: resolve(product),
        statementMap: { '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } },
        s: { '0': 1 },
        fnMap: {},
        f: {},
        branchMap: {},
        b: {},
        meta: {},
      },
    },
    coverages = (['u1', 'u2', 'u3'] as const).map((unit) => {
      const evidence = buildPilotCoverageEvidence(
        {
          unit,
          source,
          current: source,
          startedAt: '2026-10-12T00:00:00.000Z',
          finishedAt: '2026-10-12T00:00:01.000Z',
          reason: 'passed',
          errors: 0,
          testFiles: pilotTestInventory(source, unit),
          tests: { total: 2, passed: 2, failed: 0, skipped: 0 },
          raw,
          bytes: bytes(raw),
        },
        process.cwd(),
        () => text,
      );
      files.set(evidence.rawPath, bytes(raw));
      return evidence;
    }),
    aggregate = aggregatePilotCoverage(
      coverages,
      source,
      (path) => files.get(path)!,
      () => text,
    );
  for (const spec of pilotCommands(source)) {
    let report: unknown = { passed: true, sourceDigest: source.digest };
    if (/^u[123]-(unit|integration)$/.test(spec.key) && spec.scope !== 'project')
      report = testReport(
        pilotTestInventory(source, spec.scope).filter((path) =>
          path.includes('/' + spec.key.split('-')[1] + '/'),
        ),
      );
    else if (spec.key.endsWith('-coverage'))
      report = coverages.find((entry) => entry.unit === spec.scope);
    else if (spec.key === 'runtime-security-tests')
      report = testReport(['tests/u2/integration/runtime-security.spec.ts']);
    else if (spec.key === 'u2-e2e')
      report = { stats: { expected: 3, skipped: 0, unexpected: 0, flaky: 0 }, errors: [] };
    else if (spec.key === 'coverage-aggregate') report = aggregate;
    else if (spec.key === 'check')
      report = { passed: true, sourceDigest: source.digest, completed: ['type', 'lint', 'format'] };
    else if (spec.key === 'synth')
      report = {
        passed: true,
        sourceDigest: source.digest,
        actualAwsDeploymentPerformed: false,
        stacks: ['synthetic'],
        templateSha256: 'e'.repeat(64),
      };
    else if (spec.key === 'image')
      report = validatePilotImage(
        {
          Id: imageId,
          Config: {
            Labels: {
              'oms.pilot.mode': 'pilot-current',
              'oms.pilot.source': source.digest,
              'oms.pilot.lock': source.lock,
            },
          },
        },
        source,
      );
    else if (spec.key === 'security')
      report = {
        passed: true,
        sourceDigest: source.digest,
        imageId,
        completed: [
          'dependencies-physical-bundle-and-audit',
          'sast',
          'secrets',
          'iac-context-verified-no-real-activation',
          'container-os-and-library',
        ],
      };
    else if (spec.key === 'runtime-security')
      report = {
        passed: true,
        sourceDigest: source.digest,
        imageId,
        sameProductImageVerified: true,
        actualTlsVerification: true,
        cleanupFailed: false,
        roles: 4,
      };
    const value = spec.key === 'image-build' ? Buffer.from('controlled image log') : bytes(report);
    files.set(spec.path, value);
    reports[spec.key] = {
      mode: 'pilot-current',
      source,
      environment: spec.environment,
      path: spec.path,
      sha256: sha256(value),
      command: spec.command,
      passed: true,
      startedAt: '2026-10-12T00:00:00.000Z',
      finishedAt: '2026-10-12T00:00:01.000Z',
      execution: { ...execution },
      artifact: {
        exists: true,
        fresh: true,
        bytes: value.length,
        sha256: sha256(value),
        modifiedAtMilliseconds: Date.parse('2026-10-12T00:00:00.500Z'),
      },
    };
  }
  const proof: PilotProof = {
      version: 2,
      mode: 'pilot-current',
      source,
      reports,
      deferred: [...PILOT_DEFERRED],
    },
    read = (path: string) => {
      const value = files.get(path);
      if (!value) throw new Error('제어된 보고서 누락');
      return value;
    };
  const replace = (key: string, value: unknown) => {
    const receipt = proof.reports[key]!,
      valueBytes = bytes(value);
    files.set(receipt.path, valueBytes);
    receipt.sha256 = sha256(valueBytes);
    receipt.artifact.sha256 = receipt.sha256;
    receipt.artifact.bytes = valueBytes.length;
  };
  return {
    proof,
    files,
    read,
    replace,
    validate: () => validatePilotProof(proof, source, read, () => text),
  };
}
afterEach(() => vi.unstubAllEnvs());
describe('pilot-current child·보고서·동일 image의 차단 경계', () => {
  it('명시된3유닛·현재 회귀/coverage/보안만 기본 명령이며 부하/DR는 포함하지 않는다', () => {
    const specs = pilotCommands(source);
    expect(new Set(specs.map((spec) => spec.key)).size).toBe(specs.length);
    expect(specs.filter((spec) => spec.key.endsWith('-coverage'))).toHaveLength(3);
    expect(
      specs.some((spec) => /performance|recovery\.ts|ci-full-proof/.test(spec.command.join(' '))),
    ).toBe(false);
    expect(specs.find((spec) => spec.key === 'image-build')!.command).toContain(
      'oms.pilot.source=' + source.digest,
    );
    expect(pilotProductInventory(source)).toContain(product);
  });
  it('실측 전체 실행 예산은 U3 통합·coverage에만 적용하고 다른 Unit 명령은 유지한다', () => {
    const specs = pilotCommands(source);
    expect(specs.find((spec) => spec.key === 'u3-integration')!.timeoutMilliseconds).toBe(1200000);
    expect(specs.find((spec) => spec.key === 'u3-coverage')!.timeoutMilliseconds).toBe(1800000);
    for (const key of [
      'u1-unit',
      'u1-integration',
      'u1-coverage',
      'u2-unit',
      'u2-integration',
      'u2-coverage',
      'u3-unit',
    ])
      expect(specs.find((spec) => spec.key === key)!.timeoutMilliseconds).toBeUndefined();
  });
  it('실제 관측 child 성공과 새 전체 보고서만 수집하고 기존 원문을 archive한다', async () => {
    const f = memoryPorts(),
      spec = pilotCommands(source)[0]!;
    f.files.set(spec.path, Buffer.from('prior'));
    const result = await collectPilotCommand(
      spec,
      source,
      async () => {
        f.ports.write(spec.path, bytes(testReport(['tests/u1/unit/fixture.spec.ts'])));
        return execution;
      },
      f.ports,
    );
    expect(result.passed).toBe(true);
    expect(f.archived).toContain(spec.path);
    expect(result.environment).toEqual(spec.environment);
  });
  it('receipt와 보고서 검증 실패는 고정된 다른 코드로 요약하고 원문을 공개하지 않는다', async () => {
    for (const mode of ['receipt', 'report'] as const) {
      vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
      const f = memoryPorts();
      const spec = pilotCommands(source).find((item) => item.key === 'u3-unit')!;
      const secret = 'synthetic-private-request-token-and-sql';
      if (mode === 'receipt') f.ports.mtime = () => Date.now() + 10000;
      await expect(
        collectPilotProof(
          'u3',
          async () => {
            const report = testReport([
              'tests/u3/unit/fixture.spec.ts',
              ...(mode === 'report' ? ['tests/u3/unit/unregistered.spec.ts'] : []),
            ]);
            f.ports.write(
              spec.path,
              bytes({ ...report, error: secret, env: secret, payload: secret }),
            );
            return execution;
          },
          f.ports,
        ),
      ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
      const summaryBytes = f.ports.read('.reports/u3/pilot/u3-job-summary.json');
      expect(summaryBytes.toString()).not.toContain(secret);
      const summary = JSON.parse(summaryBytes.toString());
      expect(summary).toMatchObject({ passed: false, completed: [], realActivationAllowed: false });
      expect(summary.failures).toHaveLength(1);
      expect(summary.failures[0]).toMatchObject({
        key: 'u3-unit',
        execution: {
          observed: true,
          exitCode: 0,
          signal: null,
          expired: false,
          logFailed: false,
          errorCode: null,
        },
        artifact: { exists: true, fresh: true },
        validationFailure:
          mode === 'receipt'
            ? 'PILOT_RECEIPT_VALIDATION_FAILED'
            : 'PILOT_COMMAND_REPORT_VALIDATION_FAILED',
        validationErrorCode: mode === 'receipt' ? 'PILOT_COMMAND_PROOF' : 'PILOT_TEST_SCOPE',
        reportStatus: 'VALID_COUNTS',
        tests: { numTotalTests: mode === 'receipt' ? 1 : 2, success: true },
      });
      const privateProof = JSON.parse(
        f.ports.read('.reports/u3/pilot/validation-u3.json').toString(),
      );
      expect(privateProof.reports['u3-unit'].passed).toBe(false);
      expect(privateProof.reports['u3-unit'].validationFailure).toBe(
        summary.failures[0].validationFailure,
      );
    }
  });
  it('실패 child의 엄격한 숫자 count만 요약하고 제목·SQL·임의 오류 code는 배제한다', async () => {
    vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
    const f = memoryPorts();
    const spec = pilotCommands(source).find((item) => item.key === 'u3-unit')!;
    const secret = 'synthetic-private-title-sql-token';
    await expect(
      collectPilotProof(
        'u3',
        async () => {
          const report = testReport(['tests/u3/unit/fixture.spec.ts']);
          report.success = false;
          report.numPassedTests = 0;
          report.numTotalTests = report.numFailedTests = 15;
          report.numFailedTestSuites = 1;
          report.testResults[0]!.status = 'failed';
          report.testResults[0]!.assertionResults = Array.from({ length: 15 }, () => ({
            status: 'failed',
            title: secret,
            failureMessages: [
              secret +
                ' unknown/private.ts:9:9 scripts/u3/fixture.ts:10:2 scripts/u3/fixture.ts:11:3 scripts/u3/fixture.ts:12:4 scripts/u3/fixture.ts:13:5',
            ],
          }));
          report.testResults.push({
            name: resolve('tests/u3/unit/unregistered-secret.spec.ts'),
            status: 'failed',
            assertionResults: [],
          });
          f.ports.write(spec.path, bytes(report));
          return { ...execution, exitCode: 1, errorCode: secret };
        },
        f.ports,
      ),
    ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
    const text = f.ports.read('.reports/u3/pilot/u3-job-summary.json').toString();
    expect(text).not.toContain(secret);
    const summary = JSON.parse(text);
    expect(summary.failures[0]).toMatchObject({
      execution: { observed: true, exitCode: 1, errorCode: 'UNRECOGNIZED_ERROR_CODE' },
      validationFailure: null,
      reportStatus: 'VALID_COUNTS',
      tests: {
        success: false,
        numTotalTests: 15,
        numPassedTests: 0,
        numFailedTests: 15,
        numFailedTestSuites: 1,
      },
    });
    expect(summary.failures[0].assertions).toHaveLength(10);
    for (let ordinal = 0; ordinal < 10; ordinal++) {
      expect(summary.failures[0].assertions[ordinal]).toEqual({
        file: 'tests/u3/unit/fixture.spec.ts',
        ordinal: ordinal + 1,
        status: 'failed',
        received: null,
        frames: [
          { path: 'scripts/u3/fixture.ts', line: 10, column: 2 },
          { path: 'scripts/u3/fixture.ts', line: 11, column: 3 },
          { path: 'scripts/u3/fixture.ts', line: 12, column: 4 },
        ],
      });
    }
    expect(text).not.toContain('unknown/private');
    expect(text).not.toContain('unregistered-secret');
    expect(Object.keys(summary.failures[0]).sort()).toEqual(
      [
        'artifact',
        'assertions',
        'execution',
        'key',
        'reportStatus',
        'suites',
        'tests',
        'validationFailure',
        'validationErrorCode',
      ].sort(),
    );
  });
  it('최종 failed의 닫힌 received meta만 공개하고 passed 예상 rejection·오염 meta는 제외한다', async () => {
    vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
    const valid = {
      version: 1,
      errors: [
        observedError({
          code: 'EXECUTION_DEADLINE',
          message: 'private-secret',
          token: 'private-secret',
        }),
      ],
      phases: [{ phase: 'READ_100', milliseconds: 1, requestRemainingAtEntry: 9999, methods: {} }],
      http: [{ phase: 'HTTP_APPLY', status: 503, code: 'REQUEST_UNAVAILABLE' }],
    };
    for (const poisoned of [false, true]) {
      const f = memoryPorts(),
        spec = pilotCommands(source).find((item) => item.key === 'u3-unit')!;
      await expect(
        collectPilotProof(
          'u3',
          async () => {
            const report = testReport(['tests/u3/unit/fixture.spec.ts']);
            f.ports.write(
              spec.path,
              bytes({
                ...report,
                success: false,
                numTotalTests: 2,
                numPassedTests: 1,
                numFailedTests: 1,
                numFailedTestSuites: 1,
                testResults: [
                  {
                    name: resolve('tests/u3/unit/fixture.spec.ts'),
                    status: 'failed',
                    assertionResults: [
                      { status: 'passed', title: 'private-secret', meta: { u3SafeFailure: valid } },
                      {
                        status: 'failed',
                        title: 'private-secret',
                        failureMessages: ['private-secret'],
                        meta: {
                          u3SafeFailure: poisoned ? { ...valid, token: 'private-secret' } : valid,
                        },
                      },
                    ],
                  },
                ],
              }),
            );
            return { ...execution, exitCode: 1 };
          },
          f.ports,
        ),
      ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
      const text = f.ports.read('.reports/u3/pilot/u3-job-summary.json').toString();
      expect(text).not.toContain('private-secret');
      const failure = JSON.parse(text).failures[0];
      expect(failure.assertions).toEqual([
        {
          file: 'tests/u3/unit/fixture.spec.ts',
          ordinal: 2,
          status: 'failed',
          frames: [],
          received: poisoned ? null : valid,
        },
      ]);
      expect(failure.tests).toMatchObject({
        numTotalTests: 2,
        numPassedTests: 1,
        numFailedTests: 1,
        success: false,
      });
    }
    const commands = pilotCommands(source);
    expect(commands.find((command) => command.key === 'u3-integration')!.command).toContain(
      '--reporter=./tests/u3/fixtures/safe-json-reporter.ts',
    );
    expect(
      commands.find((command) => command.key === 'u3-integration')!.environment
        .OMS_U3_BUDGET_PROFILE,
    ).toBe('1');
    expect(
      commands.find((command) => command.key === 'u3-coverage')!.environment.OMS_U3_BUDGET_PROFILE,
    ).toBe('1');
    for (const key of ['u1-integration', 'u2-integration', 'u3-unit']) {
      const command = commands.find((item) => item.key === key)!;
      expect(command.command).toContain('--reporter=json');
      expect(command.environment).not.toHaveProperty('OMS_U3_BUDGET_PROFILE');
    }
  });
  it('누락·무효 JSON·문자열 count는 실패 요약에서도 실제 count로 승격하지 않는다', async () => {
    for (const mode of ['missing', 'json', 'count'] as const) {
      vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
      const f = memoryPorts();
      const spec = pilotCommands(source).find((item) => item.key === 'u3-unit')!;
      await expect(
        collectPilotProof(
          'u3',
          async () => {
            if (mode === 'json')
              f.ports.write(spec.path, Buffer.from('synthetic-private-invalid-json'));
            if (mode === 'count')
              f.ports.write(
                spec.path,
                bytes({
                  ...testReport(['tests/u3/unit/fixture.spec.ts']),
                  numTotalTests: 'synthetic-private-count',
                }),
              );
            return execution;
          },
          f.ports,
        ),
      ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
      const text = f.ports.read('.reports/u3/pilot/u3-job-summary.json').toString();
      expect(text).not.toContain('synthetic-private');
      const summary = JSON.parse(text);
      expect(summary.failures[0]).toMatchObject({
        key: 'u3-unit',
        artifact: { exists: mode !== 'missing', fresh: mode !== 'missing' },
        reportStatus: mode === 'missing' ? 'MISSING' : 'INVALID',
        tests: null,
        validationErrorCode:
          mode === 'json'
            ? 'JSON_PARSE_FAILED'
            : mode === 'count'
              ? 'UNKNOWN_VALIDATION_ERROR'
              : null,
      });
    }
  });
  it('검증 예외의 임의 code는 고정 UNKNOWN으로만 공개하고 안정적인 frame이 없으면 빈 목록이다', async () => {
    vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
    const f = memoryPorts(),
      spec = pilotCommands(source).find((item) => item.key === 'u3-unit')!;
    const read = f.ports.read;
    let reads = 0;
    f.ports.read = (path) => {
      if (path === spec.path && ++reads >= 3)
        throw Object.assign(new Error('synthetic-private-validation-message'), {
          code: 'synthetic-private-code',
        });
      return read(path);
    };
    await expect(
      collectPilotProof(
        'u3',
        async () => {
          f.ports.write(spec.path, bytes(testReport(['tests/u3/unit/fixture.spec.ts'])));
          return execution;
        },
        f.ports,
      ),
    ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
    const text = read('.reports/u3/pilot/u3-job-summary.json').toString();
    expect(text).not.toContain('synthetic-private');
    expect(JSON.parse(text).failures[0]).toMatchObject({
      validationFailure: 'PILOT_RECEIPT_VALIDATION_FAILED',
      validationErrorCode: 'UNKNOWN_VALIDATION_ERROR',
      reportStatus: 'INVALID',
      tests: null,
      assertions: [],
    });
  });
  it('assertion 전체 통과와 별개의 hook 실패 suite를 등록 파일/숫자/프레임만 최대10개 요약한다', async () => {
    vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
    const f = memoryPorts();
    const paths = Array.from(
      { length: 15 },
      (_, ordinal) => 'tests/u3/unit/hook-' + ordinal + '.spec.ts',
    );
    f.source({
      ...source,
      files: {
        ...source.files,
        ...Object.fromEntries(paths.map((path) => [path, 'd'.repeat(64)])),
      },
    });
    const spec = pilotCommands(source).find((item) => item.key === 'u3-unit')!;
    await expect(
      collectPilotProof(
        'u3',
        async () => {
          const report = testReport(paths);
          report.success = false;
          report.numFailedTestSuites = paths.length;
          for (let index = 0; index < report.testResults.length; index++) {
            report.testResults[index]!.status = 'failed';
            Object.assign(report.testResults[index]!, {
              message:
                index === 0
                  ? 'synthetic-private-hook-without-stack'
                  : 'synthetic-private-hook unknown/private.ts:2:3 scripts/u3/fixture.ts:10:2 scripts/u3/fixture.ts:11:3 scripts/u3/fixture.ts:12:4 scripts/u3/fixture.ts:13:5',
              title: 'synthetic-private-title',
            });
          }
          report.testResults.push({
            name: resolve('tests/u3/unit/unregistered-secret.spec.ts'),
            status: 'failed',
            assertionResults: [],
          });
          f.ports.write(spec.path, bytes(report));
          return { ...execution, exitCode: 1 };
        },
        f.ports,
      ),
    ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
    const text = f.ports.read('.reports/u3/pilot/u3-job-summary.json').toString();
    expect(text).not.toContain('synthetic-private');
    expect(text).not.toContain('unregistered-secret');
    expect(text).not.toContain('unknown/private');
    const failure = JSON.parse(text).failures[0];
    expect(failure.tests).toMatchObject({
      numTotalTests: 15,
      numPassedTests: 15,
      numFailedTests: 0,
      numFailedTestSuites: 15,
      success: false,
    });
    expect(failure.assertions).toEqual([]);
    expect(failure.suites).toHaveLength(10);
    expect(failure.suites[0]).toEqual({
      file: paths[0],
      status: 'failed',
      assertionCount: 1,
      frames: [],
    });
    expect(failure.suites[1]).toEqual({
      file: paths[1],
      status: 'failed',
      assertionCount: 1,
      frames: [
        { path: 'scripts/u3/fixture.ts', line: 10, column: 2 },
        { path: 'scripts/u3/fixture.ts', line: 11, column: 3 },
        { path: 'scripts/u3/fixture.ts', line: 12, column: 4 },
      ],
    });
  });
  it('coverage의 fresh 시험 관측을 별도 투영하고 evidence 없는 실제 실패는 그대로 보존한다', async () => {
    for (const mode of ['failed', 'all-passed', 'subset'] as const) {
      vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
      const f = memoryPorts();
      const diagnosticRead = vi.fn(f.ports.readCoverageTests!);
      f.ports.readCoverageTests = diagnosticRead;
      const paths = pilotTestInventory(source, 'u3');
      const report = testReport(mode === 'subset' ? paths.slice(0, 1) : paths);
      if (mode === 'failed') {
        report.success = false;
        report.numPassedTests--;
        report.numFailedTests = report.numFailedTestSuites = 1;
        report.testResults[0]!.status = 'failed';
        report.testResults[0]!.assertionResults = [
          {
            status: 'failed',
            ...{
              title: 'private-title',
              failureMessages: ['private-query scripts/u3/fixture.ts:10:2'],
              meta: {
                u3SafeFailure: {
                  version: 1,
                  errors: [observedError({ code: 'EXECUTION_DEADLINE', message: 'private' })],
                  phases: [],
                  http: [],
                },
              },
            },
          },
        ];
      }
      await expect(
        collectPilotProof(
          'u3',
          async (command, args) => {
            const spec = pilotCommands(source).find(
              (item) =>
                item.scope === 'u3' &&
                item.command[0] === command &&
                canonicalJson(item.command.slice(1)) === canonicalJson(args),
            )!;
            if (spec.key === 'u3-coverage') {
              f.ports.write(U3_COVERAGE_TEST_REPORT, bytes({ ...report, message: 'private' }));
              return { ...execution, exitCode: 1 };
            }
            f.ports.write(
              spec.path,
              bytes(
                testReport(
                  paths.filter((path) => path.includes('/' + spec.key.split('-')[1] + '/')),
                ),
              ),
            );
            return execution;
          },
          f.ports,
        ),
      ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
      const output = f.ports.read('.reports/u3/pilot/u3-job-summary.json').toString();
      expect(output).not.toContain('private');
      const summary = JSON.parse(output),
        failure = summary.failures[0];
      expect(diagnosticRead).toHaveBeenCalledOnce();
      expect(Buffer.isBuffer(diagnosticRead.mock.results[0]!.value)).toBe(true);
      expect(summary).toMatchObject({
        passed: false,
        completed: ['u3-unit', 'u3-integration'],
        realActivationAllowed: false,
      });
      expect(failure).toMatchObject({
        key: 'u3-coverage',
        execution: { exitCode: 1, observed: true },
        artifact: { exists: false, fresh: false },
        tests: null,
        reportStatus: 'NOT_APPLICABLE',
        coverageTests: {
          diagnosticOnly: true,
          reportStatus: 'VALID_COUNTS',
          completeScope: mode !== 'subset',
          tests: {
            success: mode !== 'failed',
            numTotalTests: mode === 'subset' ? 1 : 2,
            numFailedTests: mode === 'failed' ? 1 : 0,
          },
        },
      });
      expect(failure.coverageTests.assertions).toHaveLength(mode === 'failed' ? 1 : 0);
      expect(failure.coverageTests.suites).toHaveLength(mode === 'failed' ? 1 : 0);
      if (mode === 'failed')
        expect(failure.coverageTests.assertions[0]).toMatchObject({
          file: paths[0],
          ordinal: 1,
          frames: [{ path: 'scripts/u3/fixture.ts', line: 10, column: 2 }],
          received: { errors: [{ code: 'EXECUTION_DEADLINE' }] },
        });
      expect(
        JSON.parse(f.ports.read('.reports/u3/pilot/validation-u3.json').toString()).reports[
          'u3-coverage'
        ].passed,
      ).toBe(false);
    }
  });
  it('실제 JsonReporter의 중첩 describe suite 수를 파일 수와 혼동하지 않는다', async () => {
    vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
    const logged: string[] = [],
      reporter = new JsonReporter({ stdout: true });
    reporter.onInit({
      config: { root: process.cwd(), passWithNoTests: false },
      snapshot: { summary: {} },
      logger: { log: (value: string) => logged.push(value), warn: () => {} },
    } as unknown as Vitest);
    const file = {
      id: 'file',
      type: 'suite',
      name: 'private-file',
      mode: 'run',
      filepath: resolve('tests/u3/unit/fixture.spec.ts'),
      result: { state: 'fail' },
      tasks: [] as unknown[],
    };
    const outer = {
      id: 'outer',
      type: 'suite',
      name: 'private-outer',
      mode: 'run',
      suite: file,
      result: { state: 'fail' },
      tasks: [] as unknown[],
    };
    const inner = {
      id: 'inner',
      type: 'suite',
      name: 'private-inner',
      mode: 'run',
      suite: outer,
      result: { state: 'fail' },
      tasks: [] as unknown[],
    };
    file.tasks.push(outer);
    outer.tasks.push(inner);
    for (const id of ['first', 'second'])
      inner.tasks.push({
        id,
        type: 'test',
        name: 'private-test',
        mode: 'run',
        suite: inner,
        result: { state: 'fail', startTime: Date.now(), duration: 1 },
        meta: {},
      });
    await reporter.onTestRunEnd([{ task: file }] as unknown as TestModule[]);
    const report = JSON.parse(logged[0]!);
    expect(report).toMatchObject({
      numTotalTests: 2,
      numFailedTests: 2,
      numFailedTestSuites: 3,
    });
    expect(report.testResults).toHaveLength(1);
    const f = memoryPorts();
    await expect(
      collectPilotProof(
        'u3',
        async (command, args) => {
          const spec = pilotCommands(source).find(
            (item) =>
              item.scope === 'u3' &&
              item.command[0] === command &&
              canonicalJson(item.command.slice(1)) === canonicalJson(args),
          )!;
          if (spec.key === 'u3-coverage') {
            f.ports.write(U3_COVERAGE_TEST_REPORT, bytes(report));
            return { ...execution, exitCode: 1 };
          }
          f.ports.write(
            spec.path,
            bytes(
              testReport(
                pilotTestInventory(source, 'u3').filter((path) =>
                  path.includes('/' + spec.key.split('-')[1] + '/'),
                ),
              ),
            ),
          );
          return execution;
        },
        f.ports,
      ),
    ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
    const output = f.ports.read('.reports/u3/pilot/u3-job-summary.json').toString();
    expect(output).not.toContain('private');
    const diagnostic = JSON.parse(output).failures[0].coverageTests;
    expect(diagnostic).toMatchObject({
      diagnosticOnly: true,
      reportStatus: 'VALID_COUNTS',
      completeScope: false,
      tests: { numFailedTests: 2, numFailedTestSuites: 3 },
    });
    expect(diagnostic.suites).toHaveLength(1);
    expect(diagnostic.assertions).toHaveLength(2);
  });
  it('coverage 보조 JSON의 누락·옛 source·과대·오염·타unit/중복/상태-count 불일치를 관측으로 승격하지 않는다', async () => {
    for (const mode of [
      'missing',
      'prior',
      'stale',
      'source-before',
      'source-during',
      'oversized',
      'json',
      'count',
      'foreign',
      'duplicate',
      'enum',
      'states',
    ] as const) {
      vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
      const f = memoryPorts(),
        report = testReport(pilotTestInventory(source, 'u3'));
      if (mode === 'prior') f.ports.write(U3_COVERAGE_TEST_REPORT, bytes(report));
      if (mode === 'count') Reflect.set(report, 'numTotalTests', 'private');
      if (mode === 'foreign')
        report.testResults[0]!.name = resolve('tests/u2/unit/fixture.spec.ts');
      if (mode === 'duplicate') report.testResults[1]!.name = report.testResults[0]!.name;
      if (mode === 'enum') report.testResults[0]!.status = 'private';
      if (mode === 'states') report.testResults[0]!.assertionResults[0]!.status = 'failed';
      if (mode === 'source-during') {
        const read = f.ports.readCoverageTests!;
        f.ports.readCoverageTests = (...args) => {
          const value = read(...args);
          f.source({ ...source, digest: 'f'.repeat(64) });
          return value;
        };
      }
      await expect(
        collectPilotProof(
          'u3',
          async (command, args) => {
            const spec = pilotCommands(source).find(
              (item) =>
                item.scope === 'u3' &&
                item.command[0] === command &&
                canonicalJson(item.command.slice(1)) === canonicalJson(args),
            )!;
            if (spec.key !== 'u3-coverage') {
              f.ports.write(
                spec.path,
                bytes(
                  testReport(
                    pilotTestInventory(source, 'u3').filter((path) =>
                      path.includes('/' + spec.key.split('-')[1] + '/'),
                    ),
                  ),
                ),
              );
              return execution;
            }
            if (mode !== 'missing' && mode !== 'prior')
              f.ports.write(
                U3_COVERAGE_TEST_REPORT,
                mode === 'json'
                  ? Buffer.from('private-invalid-json')
                  : mode === 'oversized'
                    ? Buffer.alloc(MAX_DIAGNOSTIC_REPORT_BYTES + 1)
                    : bytes(report),
              );
            if (mode === 'stale') f.stale();
            if (mode === 'source-before') f.source({ ...source, digest: 'f'.repeat(64) });
            return { ...execution, exitCode: 1 };
          },
          f.ports,
        ),
      ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
      const output = f.ports.read('.reports/u3/pilot/u3-job-summary.json').toString();
      expect(output).not.toContain('private');
      const diagnostic = JSON.parse(output).failures[0].coverageTests;
      expect(diagnostic).toEqual({
        diagnosticOnly: true,
        reportStatus: ['json', 'count', 'foreign', 'duplicate', 'enum', 'states'].includes(mode)
          ? 'INVALID'
          : 'UNCONFIRMED',
        completeScope: null,
        tests: null,
        assertions: [],
        suites: [],
      });
    }
  });
  it('다른 key의 실패에서는 coverage 보조 경로를 읽지 않는다', async () => {
    vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
    const f = memoryPorts();
    f.ports.readCoverageTests = vi
      .fn()
      .mockReturnValue(bytes(testReport(pilotTestInventory(source, 'u3'))));
    await expect(
      collectPilotProof('u3', async () => ({ ...execution, exitCode: 1 }), f.ports),
    ).rejects.toMatchObject({ code: 'PILOT_CHILD_FAILED' });
    expect(f.ports.readCoverageTests).not.toHaveBeenCalled();
    expect(
      JSON.parse(f.ports.read('.reports/u3/pilot/u3-job-summary.json').toString()).failures[0],
    ).not.toHaveProperty('coverageTests');
  });
  it('coverage receipt의 source/경로/명령/환경/관측/실행시간 바인딩이 다르면 보조 관측을 읽지 않는다', async () => {
    for (const mode of [
      'source',
      'path',
      'command',
      'environment',
      'unobserved',
      'time',
    ] as const) {
      vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
      const f = memoryPorts(),
        prior = wholeProof(),
        receipt = prior.proof.reports['u3-coverage']!;
      for (const [path, value] of prior.files) f.files.set(path, value);
      receipt.passed = false;
      receipt.execution = { ...execution, exitCode: 1 };
      if (mode === 'source') receipt.source = { ...source, digest: 'f'.repeat(64) };
      if (mode === 'path') receipt.path = '.reports/u3/pilot/u2-coverage/evidence.json';
      if (mode === 'command') receipt.command = ['node', 'private'];
      if (mode === 'environment')
        receipt.environment = { ...receipt.environment, PRIVATE: 'private' };
      if (mode === 'unobserved') receipt.execution.observed = false;
      if (mode === 'time') receipt.startedAt = 'private-invalid-time';
      f.ports.readCoverageTests = vi
        .fn()
        .mockReturnValue(bytes(testReport(pilotTestInventory(source, 'u3'))));
      f.ports.write('.reports/u3/pilot/validation-u3.json', bytes(prior.proof));
      await expect(collectPilotProof('u3', async () => execution, f.ports)).rejects.toMatchObject({
        code: 'PILOT_COMMAND_PROOF',
      });
      expect(f.ports.readCoverageTests).not.toHaveBeenCalled();
      const output = f.ports.read('.reports/u3/pilot/u3-job-summary.json').toString();
      expect(output).not.toContain('private');
      expect(JSON.parse(output).failures[0].coverageTests).toMatchObject({
        diagnosticOnly: true,
        reportStatus: 'UNCONFIRMED',
        completeScope: null,
        tests: null,
      });
    }
  });
  it('void·실패·signal·cancel·timeout·log 오류와 없거나 옛 report를 성공으로 바꾸지 않는다', async () => {
    for (const mode of [
      'void',
      'exit',
      'signal',
      'error',
      'timeout',
      'log',
      'missing',
      'stale',
      'write',
      'source',
      'skip',
      'case-count',
    ]) {
      const f = memoryPorts(),
        spec = pilotCommands(source)[0]!;
      const result = await collectPilotCommand(
        spec,
        source,
        async () => {
          if (mode === 'write') throw new Error('controlled output failure');
          if (mode !== 'missing') {
            const report = testReport(['tests/u1/unit/fixture.spec.ts']);
            if (mode === 'skip') report.numPendingTests = 1;
            if (mode === 'case-count') report.numTotalTests = report.numPassedTests = 2;
            f.ports.write(spec.path, bytes(report));
          }
          if (mode === 'stale') f.stale();
          if (mode === 'source') f.source({ ...source, lock: 'f'.repeat(64) });
          if (mode === 'void') return;
          return {
            ...execution,
            ...(mode === 'exit' ? { exitCode: 7 } : {}),
            ...(mode === 'signal' ? { signal: 'SIGTERM' } : {}),
            ...(mode === 'error' ? { errorCode: 'ENOENT' } : {}),
            ...(mode === 'timeout' ? { expired: true } : {}),
            ...(mode === 'log' ? { logFailed: true } : {}),
          };
        },
        f.ports,
      );
      expect(result.passed, mode).toBe(false);
    }
  });
  it('통제된 작은 실제 child는 종료/timeout을 관측하지만 어떤 CI·부하·scanner도 실행하지 않는다', async () => {
    const sink = () =>
      new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      });
    expect(
      await runProofCommand(
        process.execPath,
        ['-e', 'process.exit(7)'],
        'virtual.log',
        2000,
        sink(),
      ),
    ).toMatchObject({ observed: true, exitCode: 7, expired: false });
    expect(
      await runProofCommand(
        process.execPath,
        ['-e', 'setInterval(()=>{},1000)'],
        'virtual.log',
        100,
        sink(),
      ),
    ).toMatchObject({ observed: true, expired: true, signal: 'SIGTERM' });
  });
  it('전체3기여/검사/동일 image 모의 증거만 pilot 검증으로 묶고 Deferred는 별도 유지한다', () => {
    expect(wholeProof().validate()).toMatchObject({
      passed: true,
      mode: 'pilot-current',
      imageId,
      realActivationAllowed: false,
      deferred: PILOT_DEFERRED.map((key) => ({ key, status: 'DEFERRED' })),
    });
  });
  it('필수 누락·임의 추가·다른 동일key·옛source/lock/image·Deferred→PASS는 차단한다', () => {
    for (const mode of [
      'missing',
      'extra',
      'deferred',
      'image',
      'image-source',
      'coverage',
      'check',
      'source',
    ]) {
      const f = wholeProof();
      if (mode === 'missing') delete f.proof.reports.security;
      if (mode === 'extra') f.proof.reports.performance = f.proof.reports.check!;
      if (mode === 'deferred') f.proof.deferred = [];
      if (mode === 'image')
        f.replace('runtime-security', {
          ...JSON.parse(f.read(f.proof.reports['runtime-security']!.path).toString()),
          imageId: 'sha256:' + '0'.repeat(64),
        });
      if (mode === 'image-source')
        f.replace('image', {
          ...JSON.parse(f.read(f.proof.reports.image!.path).toString()),
          sourceDigest: '0'.repeat(64),
        });
      if (mode === 'coverage') f.files.delete('.reports/u3/pilot/u3-coverage/coverage-final.json');
      if (mode === 'check')
        f.replace('check', { passed: true, sourceDigest: source.digest, completed: ['type'] });
      if (mode === 'source') f.proof.reports.security!.source = { ...source, lock: '0'.repeat(64) };
      expect(() => f.validate(), mode).toThrow();
    }
    const f = wholeProof(),
      other = structuredClone(f.proof);
    other.reports.check!.sha256 = '0'.repeat(64);
    expect(() => mergePilotProofs([f.proof, other], source)).toThrow();
    for (const labels of [
      {},
      { 'oms.pilot.mode': 'full-proof' },
      {
        'oms.pilot.mode': 'pilot-current',
        'oms.pilot.source': source.digest,
        'oms.pilot.lock': '0'.repeat(64),
      },
    ])
      expect(() =>
        validatePilotImage({ Id: imageId, Config: { Labels: labels } }, source),
      ).toThrow();
  });
  it('같은 artifact hash로도 child 실패/미관측·stale/미래시간·다른 명령/환경을 덮을 수 없다', () => {
    for (const mutate of [
      (r: PilotReceipt) => {
        r.execution.exitCode = 7;
      },
      (r: PilotReceipt) => {
        r.execution.observed = false;
      },
      (r: PilotReceipt) => {
        r.artifact.fresh = false;
      },
      (r: PilotReceipt) => {
        r.artifact.modifiedAtMilliseconds = Date.parse(r.finishedAt) + 1000;
      },
      (r: PilotReceipt) => {
        r.command = ['node', '--selected'];
      },
      (r: PilotReceipt) => {
        r.environment = {};
      },
    ]) {
      const f = wholeProof();
      mutate(f.proof.reports['u1-unit']!);
      expect(() =>
        validatePilotReceipt(
          f.proof.reports['u1-unit']!,
          pilotCommands(source)[0]!,
          source,
          f.read,
        ),
      ).toThrow();
    }
    const report = testReport(['tests/u1/unit/fixture.spec.ts']);
    report.testResults[0]!.assertionResults = [];
    expect(() => validatePilotTests(report, ['tests/u1/unit/fixture.spec.ts'])).toThrow();
  });
  it('필수 child 실패를 수집기에서 보존하고 다음 명령/같은source 우연 재실행을 차단한다', async () => {
    vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
    vi.stubEnv('NODE_ENV', 'test');
    const f = memoryPorts();
    let calls = 0;
    const run = async () => {
      calls++;
      return { ...execution, exitCode: 7 };
    };
    await expect(collectPilotProof('u1', run, f.ports)).rejects.toThrow();
    expect(calls).toBe(1);
    expect(
      JSON.parse(f.ports.read('.reports/u3/pilot/u1-job-summary.json').toString()),
    ).toMatchObject({ passed: false, realActivationAllowed: false });
    await expect(collectPilotProof('u1', run, f.ports)).rejects.toThrow();
    expect(calls).toBe(1);
  });
  it('현재 YAML은 기본3유닛/source gate·safe artifact를 연결하고 원래 full-proof는 manual-only다', () => {
    const current = parseDocument(readFileSync('.github/workflows/u1-validation.yml', 'utf8')),
      full = parseDocument(readFileSync('.github/workflows/oms-full-proof.yml', 'utf8'));
    expect(current.errors).toHaveLength(0);
    expect(full.errors).toHaveLength(0);
    const workflow = current.toJS(),
      optional = full.toJS();
    expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'push', 'workflow_dispatch']);
    expect(workflow.jobs.units.strategy.matrix.unit).toEqual(['u1', 'u2', 'u3']);
    expect(workflow.jobs.project.needs).toEqual(['units']);
    expect(workflow.jobs.project.steps[0].run).toContain('needs.units.result');
    expect(Object.keys(optional.on)).toEqual(['workflow_dispatch']);
    expect(readFileSync('.github/workflows/u1-validation.yml', 'utf8')).not.toContain(
      'ci-full-proof.ts',
    );
    for (const role of ['u1', 'u2', 'project'])
      expect(
        optional.jobs[role].steps.some(
          (step: { run?: string }) =>
            step.run === 'node --import tsx scripts/u2/ci-full-proof.ts ' + role,
        ),
      ).toBe(true);
    const uploaded = Object.values(workflow.jobs)
      .flatMap((job) =>
        (job as { steps: { uses?: string; with?: { path?: string } }[] }).steps
          .filter((step) => step.uses?.startsWith('actions/upload-artifact@'))
          .map((step) => step.with!.path ?? ''),
      )
      .join('\n');
    expect(uploaded).not.toMatch(/\.runtime|sast\.json|secrets\.json|\.log|trace/);
    expect(canonicalJson(PILOT_DEFERRED)).toContain('full-dr-proof');
  });
});
