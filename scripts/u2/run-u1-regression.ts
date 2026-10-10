import { createHash, randomUUID } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { resolve, relative, dirname, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCommand } from '../u1/process.js';

type Mode = 'unit' | 'integration';
export const U1_REGRESSION_PATHS = Object.freeze({
  unit: Object.freeze([
    'tests/u1/unit/skeleton.spec.ts',
    'tests/u1/unit/models.spec.ts',
    'tests/u1/unit/worker-start.spec.ts',
    'tests/u1/unit/identity.spec.ts',
    'tests/u1/unit/identity-browser.spec.ts',
    'tests/u1/unit/worker-batch.spec.ts',
    'tests/u1/unit/adapters.spec.ts',
    'tests/u1/unit/worker.spec.ts',
    'tests/u1/unit/performance-statistics.spec.ts',
  ]),
  integration: Object.freeze([
    'tests/u1/integration/business-flow.spec.ts',
    'tests/u1/integration/http-boundaries.spec.ts',
    'tests/u1/integration/recovery.spec.ts',
  ]),
});
interface Selection {
  mode: Mode;
  reportKey: string;
  paths: string[];
}
export function parseRegressionArguments(args: readonly string[]): Selection {
  const [mode, flag, reportKey, separator, ...paths] = args;
  if (
    (mode !== 'unit' && mode !== 'integration') ||
    flag !== '--report-key' ||
    !reportKey ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(reportKey) ||
    separator !== '--' ||
    paths.length === 0 ||
    paths.length > 6 ||
    new Set(paths).size !== paths.length ||
    paths.some((path) => !U1_REGRESSION_PATHS[mode].includes(path))
  )
    throw new Error('등록된 모드·report-key·정확 U1 시험 경로만 사용할 수 있습니다.');
  return { mode, reportKey, paths };
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const protectedPaths = ['.reports/u1/unit.json', '.reports/u1/integration.json'] as const;
export interface RegressionDependencies {
  read(path: string): Buffer;
  writeExclusive(path: string, bytes: Buffer): void;
  run(command: string, args: readonly string[], log: string): Promise<void>;
  sourceIdentity(): string;
  uniqueId(): string;
  now(): Date;
}
function assertLocalPath(root: string, path: string): string {
  const destination = resolve(root, path),
    inside = relative(root, destination);
  if (inside.startsWith('..' + sep) || inside === '..' || !inside)
    throw new Error('workspace 내부의 정확 경로가 필요합니다.');
  let current = root;
  for (const part of inside.split(sep)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error('보고서/시험 경로 symlink는 금지입니다.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return destination;
}
function sourceIdentity(root: string): string {
  const files = new Set([
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'eslint.config.mjs',
    '.prettierrc.json',
    'tests/u1/vitest.unit.config.ts',
    'tests/u1/vitest.integration.config.ts',
  ]);
  const scan = (directory: string) => {
    for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      const path = directory + '/' + entry.name;
      if (entry.isSymbolicLink()) continue;
      if (
        entry.isDirectory() &&
        !['node_modules', 'dist', '.next', 'cdk.out', '.reports', '.runtime'].includes(entry.name)
      )
        scan(path);
      else if (
        entry.isFile() &&
        ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'].includes(extname(path))
      )
        files.add(path);
    }
  };
  for (const directory of ['apps', 'packages', 'infra/cdk', 'scripts/u1', 'scripts/u2', 'tests/u1'])
    scan(directory);
  return digest(
    Buffer.from(
      JSON.stringify(
        [...files].sort().map((path) => [path, digest(readFileSync(resolve(root, path)))]),
      ),
    ),
  );
}
function dependencies(root: string): RegressionDependencies {
  root = realpathSync(root);
  return {
    read: (path) => readFileSync(assertLocalPath(root, path)),
    writeExclusive: (path, bytes) => {
      if (!path.startsWith('.reports/u2/regressions/'))
        throw new Error('U2 고유 회귀 출력만 작성합니다.');
      const destination = assertLocalPath(root, path);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
    },
    run: runCommand,
    sourceIdentity: () => sourceIdentity(root),
    uniqueId: randomUUID,
    now: () => new Date(),
  };
}
function snapshot(deps: RegressionDependencies): Record<string, Buffer | null> {
  return Object.fromEntries(
    protectedPaths.map((path) => {
      try {
        return [path, deps.read(path)];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [path, null];
        throw error;
      }
    }),
  );
}
interface Assertion {
  status: string;
}
interface FileResult {
  name: string;
  status: string;
  assertionResults: Assertion[];
}
interface JsonReport {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests?: number;
  numSkippedTests?: number;
  testResults: FileResult[];
}
export function validateRegressionReport(bytes: Buffer, selection: Selection, root: string): void {
  const value = JSON.parse(bytes.toString()) as JsonReport;
  const files = value.testResults;
  if (
    !value.success ||
    !Number.isInteger(value.numTotalTests) ||
    value.numTotalTests <= 0 ||
    value.numPassedTests !== value.numTotalTests ||
    value.numFailedTests !== 0 ||
    value.numPendingTests !== 0 ||
    (value.numTodoTests ?? 0) !== 0 ||
    (value.numSkippedTests ?? 0) !== 0 ||
    !Array.isArray(files) ||
    files.length !== selection.paths.length
  )
    throw new Error('회귀 실패/누락/skip/no-test 보고서는 통과 근거가 아닙니다.');
  const reported = files.map((file) => relative(root, resolve(file.name)).split(sep).join('/'));
  if (
    new Set(reported).size !== selection.paths.length ||
    !selection.paths.every((path) => reported.includes(path)) ||
    files.some(
      (file) =>
        file.status !== 'passed' ||
        !Array.isArray(file.assertionResults) ||
        file.assertionResults.length === 0 ||
        file.assertionResults.some((assertion) => assertion.status !== 'passed'),
    ) ||
    files.reduce((count, file) => count + file.assertionResults.length, 0) !== value.numTotalTests
  )
    throw new Error('정확 선택 파일/실제 모든 assertion의 통과를 대조해야 합니다.');
}
export async function runU1Regression(
  args: readonly string[],
  supplied?: RegressionDependencies,
): Promise<{ output: string; evidence: string }> {
  if (process.version !== 'v22.23.3') throw new Error('검증된 Node22.23.3이 필요합니다.');
  const selection = parseRegressionArguments(args),
    root = process.cwd(),
    deps = supplied ?? dependencies(root),
    id = deps.uniqueId();
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('서버가 만든 고유 실행 ID가 필요합니다.');
  const directory = '.reports/u2/regressions/' + selection.reportKey + '/' + id,
    output = directory + '/report.json',
    evidence = directory + '/execution.json',
    log = directory + '/runner.log',
    before = snapshot(deps),
    identity = deps.sourceIdentity(),
    selectedFileHashes = selection.paths.map((path) => ({ path, sha256: digest(deps.read(path)) })),
    command = 'npm',
    commandArgs = [
      'run',
      'test:u1:' + selection.mode,
      '--',
      ...selection.paths,
      '--reporter=default',
      '--reporter=json',
      '--outputFile=' + output,
    ];
  // Exclusive reservation prevents report-key reuse from replacing a previous
  // execution, including failures. Never restore legacy output automatically.
  deps.writeExclusive(
    directory + '/reservation.json',
    Buffer.from(
      JSON.stringify(
        {
          selection,
          selectedFileHashes,
          output,
          command,
          args: commandArgs,
          node: process.version,
          sourceIdentity: identity,
          startedAt: deps.now().toISOString(),
        },
        null,
        2,
      ),
    ),
  );
  for (const path of protectedPaths)
    if (before[path])
      deps.writeExclusive(directory + '/before-' + path.split('/').at(-1), before[path]!);
  let failure: string | null = null,
    reportHash: string | null = null;
  try {
    await deps.run(command, commandArgs, log);
  } catch {
    failure = 'RUNNER_FAILED';
  }
  try {
    const bytes = deps.read(output);
    reportHash = digest(bytes);
    validateRegressionReport(bytes, selection, root);
  } catch {
    failure ??= 'REPORT_INVALID_OR_MISSING';
  }
  const after = snapshot(deps),
    preserved = protectedPaths.every(
      (path) =>
        (before[path] === null ? null : digest(before[path]!)) ===
        (after[path] === null ? null : digest(after[path]!)),
    );
  if (!preserved) failure = 'LEGACY_REPORT_CHANGED';
  if (deps.sourceIdentity() !== identity) failure = 'SOURCE_CHANGED';
  deps.writeExclusive(
    evidence,
    Buffer.from(
      JSON.stringify(
        {
          selection,
          command,
          args: commandArgs,
          output,
          reportHash,
          sourceIdentity: identity,
          passed: failure === null,
          failure,
          protectedReports: protectedPaths.map((path) => ({
            path,
            before: before[path] === null ? null : digest(before[path]!),
            after: after[path] === null ? null : digest(after[path]!),
            archive: before[path] === null ? null : directory + '/before-' + path.split('/').at(-1),
          })),
          endedAt: deps.now().toISOString(),
        },
        null,
        2,
      ),
    ),
  );
  if (failure) throw new Error('U1 선택 회귀 차단: ' + failure + '; ' + evidence);
  return { output, evidence };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runU1Regression(process.argv.slice(2));
  process.stdout.write('정확 U1 회귀 통과; 원래 보고서 byte hash 불변: ' + result.evidence + '\n');
}
