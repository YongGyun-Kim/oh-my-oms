import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  createWriteStream,
} from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import type { Writable } from 'node:stream';
import { canonicalJson, requireCondition } from '@oms/contracts';
import { runtimeSourceIdentity, sha256 } from './runtime-source.js';
import type { SourceIdentity } from './runtime-source.js';
import type { ValidationProof } from './release-validation.js';
export interface ProofCommand {
  key: string;
  command: string[];
  path: string;
  timeoutMilliseconds?: number;
}
export interface CommandExecution {
  observed: boolean;
  exitCode: number | null;
  signal: string | null;
  errorCode: string | null;
  expired: boolean;
  logFailed: boolean;
  stdoutBytes: number | null;
  stderrBytes: number | null;
}
export type ProofRunner = (
  command: string,
  args: readonly string[],
  path: string,
  timeout?: number,
) => Promise<void | CommandExecution>;
/** 기존 argv/env/기한을 유지하며 child 종료와 산출물 신선도를 별도로 관측한다. */
export function runProofCommand(
  command: string,
  args: readonly string[],
  logPath: string,
  timeoutMilliseconds = 600000,
  sink?: Writable,
): Promise<CommandExecution> {
  requireCondition(
    Number.isInteger(timeoutMilliseconds) &&
      timeoutMilliseconds >= 1 &&
      timeoutMilliseconds <= 3600000,
    503,
    'PROOF_COMMAND_DEADLINE',
    '기존 검사 도구의 유한 실행 기한이 필요합니다.',
  );
  if (!sink) mkdirSync(dirname(logPath), { recursive: true });
  const log = sink ?? createWriteStream(logPath, { mode: 0o600 });
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    SEMGREP_SEND_METRICS: 'off',
    SEMGREP_ENABLE_VERSION_CHECK: '0',
  };
  delete environment.SEMGREP_APP_TOKEN;
  return new Promise((resolve) => {
    const result: CommandExecution = {
      observed: true,
      exitCode: null,
      signal: null,
      errorCode: null,
      expired: false,
      logFailed: false,
      stdoutBytes: 0,
      stderrBytes: 0,
    };
    const child = spawn(command, [...args], {
      shell: false,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (bytes: Buffer) => {
      result.stdoutBytes! += bytes.length;
    });
    child.stderr.on('data', (bytes: Buffer) => {
      result.stderrBytes! += bytes.length;
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    const deadline = setTimeout(() => {
      result.expired = true;
      child.kill('SIGTERM');
    }, timeoutMilliseconds);
    const force = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMilliseconds + 5000);
    log.once('error', () => {
      result.logFailed = true;
      child.kill('SIGTERM');
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      result.errorCode = ['ENOENT', 'EACCES', 'EINVAL', 'ENOEXEC', 'EMFILE', 'ENFILE'].includes(
        error.code ?? '',
      )
        ? error.code!
        : 'CHILD_ERROR';
    });
    child.once('close', (code, signal) => {
      clearTimeout(deadline);
      clearTimeout(force);
      result.exitCode = code;
      result.signal = signal;
      // close occurs after stdio closes; resolve only after the owned log drains.
      if (log.destroyed) resolve(result);
      else log.end(() => resolve(result));
    });
  });
}
function executionSucceeded(result: void | CommandExecution) {
  return (
    result === undefined ||
    (result.observed &&
      result.exitCode === 0 &&
      result.signal === null &&
      result.errorCode === null &&
      !result.expired &&
      !result.logFailed)
  );
}
export const PROJECT_COMMANDS: readonly ProofCommand[] = [
  {
    key: 'u1-unit',
    command: [
      'npm',
      'run',
      'test:u1:unit',
      '--',
      '--reporter=default',
      '--reporter=json',
      '--outputFile=.reports/project/current-u1-unit.json',
    ],
    path: '.reports/project/current-u1-unit.json',
  },
  {
    key: 'u1-integration',
    command: [
      'npm',
      'run',
      'test:u1:integration',
      '--',
      '--reporter=default',
      '--reporter=json',
      '--outputFile=.reports/project/current-u1-integration.json',
    ],
    path: '.reports/project/current-u1-integration.json',
  },
  { key: 'check', command: ['npm', 'run', 'check:u2'], path: '.reports/u2/check.json' },
  {
    key: 'u1-coverage',
    command: [
      'npx',
      'vitest',
      'run',
      '--config',
      'tests/project/vitest.u1.coverage.config.ts',
      '--coverage',
    ],
    path: '.reports/project/current-u1-coverage/evidence.json',
  },
  {
    key: 'u2-coverage',
    command: ['npm', 'run', 'test:u2:coverage'],
    path: '.reports/u2/coverage/evidence.json',
  },
  {
    key: 'coverage-aggregate',
    command: ['node', '--import', 'tsx', 'scripts/u2/coverage-aggregate.ts'],
    path: '.reports/project/coverage-aggregate.json',
  },
  { key: 'u2-unit', command: ['npm', 'run', 'test:u2:unit'], path: '.reports/u2/unit.json' },
  {
    key: 'u2-integration',
    command: ['npm', 'run', 'test:u2:integration'],
    path: '.reports/u2/integration.json',
  },
  { key: 'u2-e2e', command: ['npm', 'run', 'test:u2:e2e'], path: '.reports/u2/e2e.json' },
  { key: 'synth', command: ['npm', 'run', 'synth:u2'], path: '.reports/u2/synth.json' },
  {
    key: 'image-build',
    command: [
      'docker',
      'build',
      '--platform',
      'linux/amd64',
      '--label',
      'oms.unit=u2-identity-enterprise-access',
      '-t',
      'oms-u2-local:verification',
      '.',
    ],
    path: '.reports/u2/project-image-build.log',
    timeoutMilliseconds: 3600000,
  },
  { key: 'security', command: ['npm', 'run', 'security:u2'], path: '.reports/u2/security.json' },
  {
    key: 'runtime-security-tests',
    command: [
      'npm',
      'run',
      'test:u2:runtime-security',
      '--',
      '--outputFile=.reports/u2/selected/project-runtime-security.json',
    ],
    path: '.reports/u2/selected/project-runtime-security.json',
  },
  {
    key: 'runtime-security',
    command: ['node', '--import', 'tsx', 'scripts/u2/runtime-security-report.ts'],
    path: '.reports/u2/runtime-security.json',
  },
  {
    key: 'performance-prepare',
    command: ['node', '--import', 'tsx', 'scripts/u2/performance.ts', '--prepare'],
    path: '.runtime/u2/performance-profile.json',
    timeoutMilliseconds: 3600000,
  },
  {
    key: 'performance',
    command: ['npm', 'run', 'test:u2:performance'],
    path: '.reports/u2/performance.json',
    timeoutMilliseconds: 3600000,
  },
  {
    key: 'recovery',
    command: ['npm', 'run', 'test:u2:recovery'],
    path: '.reports/u2/recovery.json',
    timeoutMilliseconds: 1800000,
  },
];
export interface ProofPorts {
  identity: () => SourceIdentity;
  exists: (path: string) => boolean;
  read: (path: string) => Buffer;
  mtime: (path: string) => number;
}
const actualPorts: ProofPorts = {
  identity: runtimeSourceIdentity,
  exists: existsSync,
  read: readFileSync,
  mtime: (p) => statSync(p).mtimeMs,
};
export function preserveOutput(path: string) {
  if (!existsSync(path)) return;
  const bytes = readFileSync(path),
    hash = sha256(bytes),
    target = '.reports/u2/history/' + hash + '-' + basename(path);
  if (!existsSync(target)) {
    mkdirSync('.reports/u2/history', { recursive: true, mode: 0o700 });
    writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' });
  }
  requireCondition(
    readFileSync(target).equals(bytes) && readFileSync(path).equals(bytes),
    503,
    'PROOF_HISTORY_BYTES',
    '원래 출력과 hash-history archive bytes가 일치해야 합니다.',
  );
}
export function securityOutputPaths(): string[] {
  return [
    'dependency-audit.json',
    'sast.json',
    'sast.log',
    'secrets.json',
    'secrets.log',
    'iac-security.json',
    'iac-security.log',
    'iac-adjudication.json',
    'security-policy.json',
    'scanned-image-id.txt',
    'container-security.json',
    'container-security.log',
  ].map((name) => '.reports/u2/' + name);
}
export function coverageOutputPaths(unit: 'u1' | 'u2'): string[] {
  const directory = unit === 'u1' ? '.reports/project/current-u1-coverage' : '.reports/u2/coverage';
  return ['coverage-final.json', 'coverage-summary.json', 'lcov.info', 'evidence.json']
    .map((name) => directory + '/' + name)
    .concat(
      unit === 'u1'
        ? '.reports/project/current-u1-coverage-tests.json'
        : '.reports/u2/coverage.json',
    );
}
export async function collectCommandProof(
  spec: ProofCommand,
  source: SourceIdentity,
  run: ProofRunner = runProofCommand,
  ports: ProofPorts = actualPorts,
) {
  requireCondition(
    canonicalJson(ports.identity()) === canonicalJson(source),
    503,
    'PROOF_SOURCE_BEFORE',
    '명령 시작 전 정확 source가 바뀌었습니다.',
  );
  const startedAt = new Date().toISOString();
  if (ports === actualPorts) {
    preserveOutput(spec.path);
    preserveOutput('.reports/u2/project-' + spec.key + '.log');
    if (spec.key === 'u1-coverage' || spec.key === 'u2-coverage')
      for (const path of coverageOutputPaths(spec.key === 'u1-coverage' ? 'u1' : 'u2'))
        preserveOutput(path);
    if (spec.key === 'security') for (const path of securityOutputPaths()) preserveOutput(path);
  }
  let passed = false;
  let execution: CommandExecution = {
    observed: false,
    exitCode: null,
    signal: null,
    errorCode: null,
    expired: false,
    logFailed: false,
    stdoutBytes: null,
    stderrBytes: null,
  };
  const legacy = Object.fromEntries(
    ['.reports/u1/unit.json', '.reports/u1/integration.json'].map((p) => [
      p,
      ports.exists(p) ? sha256(ports.read(p)) : null,
    ]),
  );
  try {
    const outcome = await run(
      spec.command[0]!,
      spec.command.slice(1),
      '.reports/u2/project-' + spec.key + '.log',
      spec.timeoutMilliseconds,
    );
    if (outcome !== undefined) execution = outcome;
    passed = executionSucceeded(outcome);
  } catch {
    passed = false;
    execution.errorCode = 'RUNNER_ERROR';
  } finally {
    if (ports === actualPorts && spec.key === 'security')
      for (const path of [spec.path, '.reports/u2/project-security.log', ...securityOutputPaths()])
        preserveOutput(path);
  }
  passed =
    passed &&
    canonicalJson(ports.identity()) === canonicalJson(source) &&
    Object.entries(legacy).every(
      ([p, h]) => (ports.exists(p) ? sha256(ports.read(p)) : null) === h,
    );
  const artifactExists = ports.exists(spec.path);
  const artifactBytes = artifactExists ? ports.read(spec.path) : null;
  const modifiedAtMilliseconds = artifactExists ? ports.mtime(spec.path) : null;
  const written = artifactExists && modifiedAtMilliseconds! >= Date.parse(startedAt);
  passed = passed && written;
  return {
    path: spec.path,
    sha256: written ? sha256(ports.read(spec.path)) : sha256(''),
    command: spec.command,
    passed,
    startedAt,
    finishedAt: new Date().toISOString(),
    execution,
    artifact: {
      exists: artifactExists,
      fresh: written,
      bytes: artifactBytes?.length ?? null,
      sha256: artifactBytes === null ? null : sha256(artifactBytes),
      modifiedAtMilliseconds,
    },
  };
}
export async function collectProjectProof(
  scope: 'all' | 'u1' | 'u2' | 'project' = 'all',
  run: ProofRunner = runProofCommand,
) {
  requireCondition(
    process.env.NODE_ENV !== 'production' &&
      process.env.OMS_U2_SYNTHETIC_PROFILE === 'approved-local-only',
    503,
    'PROOF_SYNTHETIC_ADMISSION',
    '명시 local 합성 검증만 실행합니다.',
  );
  const source = runtimeSourceIdentity(),
    file =
      scope === 'u1' || scope === 'u2'
        ? '.reports/u2/validation-' + scope + '.json'
        : '.reports/u2/validation-source.json';
  mkdirSync('.reports/project', { recursive: true, mode: 0o700 });
  mkdirSync('.reports/u2', { recursive: true, mode: 0o700 });
  let proof: ValidationProof = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : { version: 1, source, reports: {} };
  if (canonicalJson(proof.source) !== canonicalJson(source)) {
    preserveOutput(file);
    for (const prior of Object.values(proof.reports)) {
      preserveOutput(prior.path);
    }
    // A controller may be interrupted before it records a coverage receipt.
    // Preserve both raw exports and reporter results, including such partial runs.
    for (const unit of ['u1', 'u2'] as const) {
      for (const path of coverageOutputPaths(unit)) preserveOutput(path);
      preserveOutput('.reports/u2/project-' + unit + '-coverage.log');
    }
    // An interrupted scanner may leave raw/log bytes without a stage receipt.
    for (const path of securityOutputPaths()) preserveOutput(path);
    // Source changed after an approved cause fix: preserve old bytes, then
    // obtain current evidence. This is never reuse of a prior green result.
    proof = { version: 1, source, reports: {} };
  }
  if (scope === 'project')
    for (const unit of ['u1', 'u2']) {
      const other = JSON.parse(
        readFileSync('.reports/u2/validation-' + unit + '.json', 'utf8'),
      ) as ValidationProof;
      requireCondition(
        canonicalJson(other.source) === canonicalJson(source),
        503,
        'CI_SOURCE_IDENTITY',
        '두 job의 source/lock/tool/inventory가 다릅니다.',
      );
      for (const [key, value] of Object.entries(other.reports)) {
        requireCondition(
          !proof.reports[key] || canonicalJson(proof.reports[key]) === canonicalJson(value),
          503,
          'CI_DUPLICATE_PROOF',
          '서로 다른 동일 명령 결과를 합치지 않습니다.',
        );
        proof.reports[key] = value;
      }
    }
  const u1Keys = new Set(['u1-unit', 'u1-integration', 'u1-coverage']),
    u2Keys = new Set(['u2-unit', 'u2-integration', 'u2-coverage', 'u2-e2e']);
  let completed = false;
  try {
    for (const spec of PROJECT_COMMANDS.filter(
      (s) =>
        scope === 'all' ||
        (scope === 'u1' && u1Keys.has(s.key)) ||
        (scope === 'u2' && u2Keys.has(s.key)) ||
        (scope === 'project' && !u1Keys.has(s.key) && !u2Keys.has(s.key)),
    )) {
      const prior = proof.reports[spec.key];
      if (prior) {
        requireCondition(
          prior.passed &&
            canonicalJson(prior.command) === canonicalJson(spec.command) &&
            sha256(readFileSync(prior.path)) === prior.sha256,
          503,
          'PROOF_PRIOR_FAILED_OR_CHANGED',
          '같은 source의 실패/변조 증거를 반복해 대체하지 않습니다.',
        );
        continue;
      }
      // Explicit environment selection is admitted by the project plan. Both
      // namespaces remain separately owned; no U1 default reporter is invoked.
      if (spec.key === 'u1-coverage') process.env.OMS_U1_DATABASE_PROFILE = 'verification-isolated';
      process.env.OMS_U2_DATABASE_PROFILE = 'verification-isolated';
      console.log(
        JSON.stringify({ event: 'verification-start', key: spec.key, sourceDigest: source.digest }),
      );
      try {
        proof.reports[spec.key] = await collectCommandProof(spec, source, run);
        console.log(
          JSON.stringify({
            event: 'verification-result',
            key: spec.key,
            passed: proof.reports[spec.key]!.passed,
          }),
        );
        requireCondition(
          proof.reports[spec.key]!.passed,
          503,
          'PROOF_EXECUTION_FAILED',
          '명령 실패/미생성/변경 증거를 보존했으며 후속 전체 gate를 차단합니다: ' + spec.key,
        );
      } finally {
        writeFileSync(file, JSON.stringify(proof, null, 2), { mode: 0o600 });
      }
    }
    if (scope === 'all' || scope === 'project')
      requireCondition(
        executionSucceeded(
          await run(
            'npm',
            ['run', 'verify:u2:release'],
            '.reports/u2/project-release-validation.log',
          ),
        ),
        503,
        'PROOF_RELEASE_FAILED',
        '현재 source의 최종 검증 실행이 실패했습니다.',
      );
    completed = true;
  } finally {
    writeFileSync(
      '.reports/project/' + scope + '-job-summary.json',
      JSON.stringify(
        {
          passed: completed,
          sourceDigest: source.digest,
          scope,
          completed: Object.keys(proof.reports).filter((key) => proof.reports[key]!.passed),
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
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const scope = process.argv[2] ?? 'all';
  if (!['all', 'u1', 'u2', 'project'].includes(scope)) throw Error('등록된 CI 역할만 허용합니다.');
  await collectProjectProof(scope as 'all' | 'u1' | 'u2' | 'project');
}
