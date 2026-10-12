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
    modified = Date.now();
  const ports: PilotPorts = {
    identity: () => current,
    exists: (path) => files.has(path),
    read: (path) => {
      const value = files.get(path);
      if (!value) throw new Error('제어된 보고서 누락');
      return value;
    },
    mtime: () => modified,
    archive: (path) => {
      if (files.has(path)) archived.push(path);
    },
    write: (path, value) => {
      files.set(path, value);
      modified = Date.now();
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
