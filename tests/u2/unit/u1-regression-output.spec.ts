import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { sha256 } from '../../../scripts/u2/runtime-source.js';
import { describe, it, expect } from 'vitest';
import {
  runU1Regression,
  parseRegressionArguments,
} from '../../../scripts/u2/run-u1-regression.js';
import type { RegressionDependencies } from '../../../scripts/u2/run-u1-regression.js';
const test = 'tests/u1/unit/identity.spec.ts',
  args = ['unit', '--report-key', 'fixture', '--', test];
function fixture() {
  const files = new Map<string, Buffer>([
      ['.reports/u1/unit.json', Buffer.from('원래 fixture bytes')],
      [test, Buffer.from('합성 선택 시험 source')],
      ['tests/u1/integration/business-flow.spec.ts', Buffer.from('합성 integration source')],
    ]),
    calls: { command: string; args: readonly string[]; log: string }[] = [];
  const report = () => ({
    success: true,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      { name: resolve(test), status: 'passed', assertionResults: [{ status: 'passed' }] },
    ],
  });
  const deps: RegressionDependencies = {
    read: (path) => {
      const value = files.get(path);
      if (!value) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return value;
    },
    writeExclusive: (path, bytes) => {
      if (files.has(path)) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      files.set(path, bytes);
    },
    run: async (command, commandArgs, log) => {
      calls.push({ command, args: commandArgs, log });
      files.set(
        commandArgs.find((arg) => arg.startsWith('--outputFile='))!.slice(13),
        Buffer.from(JSON.stringify(report())),
      );
    },
    uniqueId: randomUUID,
    now: () => new Date('2026-10-10T00:00:00Z'),
    sourceIdentity: () => 'synthetic-source-identity',
  };
  return { files, calls, deps, report };
}
describe('U1 정확 선택 회귀의 출력 격리', () => {
  it('native 실제 선택 runner는 명시 U2 고유 output에 쓰고 현재 U1 두 보고서의 byte hash를 그대로 보존한다', async () => {
    const paths = ['.reports/u1/unit.json', '.reports/u1/integration.json'];
    const before = paths.map((path) => sha256(readFileSync(path)));
    const result = await runU1Regression([
      'unit',
      '--report-key',
      'p10-native-wrapper-adapters',
      '--',
      'tests/u1/unit/adapters.spec.ts',
    ]);
    expect(paths.map((path) => sha256(readFileSync(path)))).toEqual(before);
    expect(result.output.startsWith('.reports/u2/regressions/p10-native-wrapper-adapters/')).toBe(
      true,
    );
    const evidence = JSON.parse(readFileSync(result.evidence, 'utf8'));
    expect(evidence.passed).toBe(true);
    expect(evidence.args).toContain('--outputFile=' + result.output);
    expect(
      evidence.protectedReports.map((row: { before: string; after: string }) => [
        row.before,
        row.after,
      ]),
    ).toEqual(before.map((hash) => [hash, hash]));
    for (const row of evidence.protectedReports)
      expect(sha256(readFileSync(row.archive))).toBe(row.before);
  }, 30000);
  it('정확 runner/경로/강제 JSON output을 전달하고 원래 bytes/hash를 그대로 둔다', async () => {
    const f = fixture(),
      before = Buffer.from(f.files.get('.reports/u1/unit.json')!),
      result = await runU1Regression(args, f.deps),
      call = f.calls[0]!;
    expect(call.command).toBe('npm');
    expect(call.args).toEqual([
      'run',
      'test:u1:unit',
      '--',
      test,
      '--reporter=default',
      '--reporter=json',
      '--outputFile=' + result.output,
    ]);
    expect(f.files.get('.reports/u1/unit.json')).toEqual(before);
    const evidence = JSON.parse(f.files.get(result.evidence)!.toString());
    expect(evidence.passed).toBe(true);
    expect(evidence.protectedReports[0].before).toBe(evidence.protectedReports[0].after);
    expect(f.files.get(evidence.protectedReports[0].archive)).toEqual(before);
  });
  it('잘못된 모드/key·glob/상대탈출/다른 Unit·중복/임의 reporter/output을 실행 전에 거절한다', () => {
    for (const bad of [
      [],
      ['whole', '--report-key', 'fixture', '--', test],
      ['unit', '--report-key', '../u1', '--', test],
      args.slice(0, -1),
      [...args, test],
      [...args, '--outputFile=.reports/u1/unit.json'],
      [...args, '--reporter=json'],
      [...args.slice(0, -1), 'tests/u1/unit/*.spec.ts'],
      [...args.slice(0, -1), '../' + test],
      [...args.slice(0, -1), 'tests/u2/unit/contracts.spec.ts'],
    ])
      expect(() => parseRegressionArguments(bad)).toThrow();
  });
  it('같은 report-key 재사용도 실행별 고유 output과 실패 증거를 덮어쓰지 않는다', async () => {
    const f = fixture(),
      a = await runU1Regression(args, f.deps),
      before = Buffer.from(f.files.get(a.evidence)!),
      b = await runU1Regression(args, f.deps);
    expect(a.output).not.toBe(b.output);
    expect(f.files.get(a.evidence)).toEqual(before);
    f.deps.run = async () => {
      throw new Error('synthetic failure');
    };
    await expect(runU1Regression(args, f.deps)).rejects.toThrow('RUNNER_FAILED');
    expect(f.files.get(a.evidence)).toEqual(before);
  });
  it('호출 실패와 JSON 미생성은 실패 evidence를 남긴다', async () => {
    for (const failed of [true, false]) {
      const f = fixture();
      f.deps.run = async () => {
        if (failed) throw new Error('synthetic failure');
      };
      await expect(runU1Regression(args, f.deps)).rejects.toThrow(
        failed ? 'RUNNER_FAILED' : 'REPORT_INVALID_OR_MISSING',
      );
      expect(
        [...f.files.entries()].some(
          ([path, bytes]) =>
            path.endsWith('/execution.json') && JSON.parse(bytes.toString()).passed === false,
        ),
      ).toBe(true);
    }
  });
  it('test failure/skip/todo/no-test와 assertion/file 누락은 성공 exit라도 통과하지 않는다', async () => {
    for (const change of [
      { success: false },
      { numFailedTests: 1 },
      { numPendingTests: 1 },
      { numTodoTests: 1 },
      { numTotalTests: 0, numPassedTests: 0 },
      { testResults: [] },
      {
        testResults: [
          { name: resolve(test), status: 'passed', assertionResults: [{ status: 'pending' }] },
        ],
      },
      {
        testResults: [
          {
            name: resolve('tests/u1/unit/models.spec.ts'),
            status: 'passed',
            assertionResults: [{ status: 'passed' }],
          },
        ],
      },
    ]) {
      const f = fixture();
      f.deps.run = async (_command, selected) => {
        f.files.set(
          selected.find((arg) => arg.startsWith('--outputFile='))!.slice(13),
          Buffer.from(JSON.stringify({ ...f.report(), ...change })),
        );
      };
      await expect(runU1Regression(args, f.deps)).rejects.toThrow('REPORT_INVALID_OR_MISSING');
    }
  });
  it('원래 U1 report 변경은 차단하고 원본을 새 측정/자동 복사로 복구하지 않는다', async () => {
    const f = fixture(),
      run = f.deps.run;
    f.deps.run = async (...call) => {
      await run(...call);
      f.files.set('.reports/u1/unit.json', Buffer.from('주입된 변경'));
    };
    await expect(runU1Regression(args, f.deps)).rejects.toThrow('LEGACY_REPORT_CHANGED');
    expect(f.files.get('.reports/u1/unit.json')!.toString()).toBe('주입된 변경');
    expect(
      [...f.files.entries()].some(
        ([path, bytes]) =>
          path.endsWith('/before-unit.json') && bytes.toString() === '원래 fixture bytes',
      ),
    ).toBe(true);
  });
  it('source drift와 고유 ID 충돌을 통과로 만들지 않는다', async () => {
    const f = fixture();
    let count = 0;
    f.deps.sourceIdentity = () => (++count === 1 ? 'before' : 'after');
    await expect(runU1Regression(args, f.deps)).rejects.toThrow('SOURCE_CHANGED');
    const g = fixture(),
      id = randomUUID();
    g.deps.uniqueId = () => id;
    await runU1Regression(args, g.deps);
    await expect(runU1Regression(args, g.deps)).rejects.toThrow('exists');
    expect(g.calls).toHaveLength(1);
  });
  it('integration은 원래 npm pretest/admission을 보존하며 unit 파일 혼합을 거절한다', async () => {
    const f = fixture(),
      path = 'tests/u1/integration/business-flow.spec.ts';
    f.deps.run = async (command, selected, log) => {
      f.calls.push({ command, args: selected, log });
      f.files.set(
        selected.find((arg) => arg.startsWith('--outputFile='))!.slice(13),
        Buffer.from(
          JSON.stringify({
            ...f.report(),
            testResults: [
              { name: resolve(path), status: 'passed', assertionResults: [{ status: 'passed' }] },
            ],
          }),
        ),
      );
    };
    await runU1Regression(
      ['integration', '--report-key', 'fixture-integration', '--', path],
      f.deps,
    );
    expect(f.calls[0]!.args[1]).toBe('test:u1:integration');
    expect(() =>
      parseRegressionArguments(['integration', '--report-key', 'fixture', '--', test]),
    ).toThrow();
  });
});
