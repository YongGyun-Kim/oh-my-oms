import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { canonicalJson, requireCondition } from '@oms/contracts';
import type { Reporter, TestModule, Vitest } from 'vitest/node';
import { COVERAGE_FORMAT, convertCoverage } from '../u2/coverage-evidence.js';
import type { CoverageEvidence } from '../u2/coverage-evidence.js';
import type { SourceIdentity } from '../u2/runtime-source.js';
import { sha256 } from '../u2/runtime-source.js';
import {
  pilotProductInventory,
  pilotSourceIdentity,
  pilotTestInventory,
} from './runtime-source.js';
import type { PilotUnit } from './runtime-source.js';

export interface PilotCoverageEvidence extends Omit<CoverageEvidence, 'version' | 'unit'> {
  version: 2;
  mode: 'pilot-current';
  unit: PilotUnit;
}
export const pilotCoveragePath = (unit: PilotUnit) => '.reports/u3/pilot/' + unit + '-coverage';
export function buildPilotCoverageEvidence(
  input: {
    unit: PilotUnit;
    source: SourceIdentity;
    current: SourceIdentity;
    startedAt: string;
    finishedAt: string;
    reason: string;
    errors: number;
    testFiles: string[];
    tests: CoverageEvidence['tests'];
    raw: unknown;
    bytes: Buffer;
  },
  root = process.cwd(),
  readSource: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): PilotCoverageEvidence {
  requireCondition(
    ['u1', 'u2', 'u3'].includes(input.unit) &&
      canonicalJson(input.source) === canonicalJson(input.current),
    503,
    'PILOT_COVERAGE_SOURCE',
    '시험 시작/끝의 전체 source·lock·workflow·도구가 같아야 합니다.',
  );
  requireCondition(
    Number.isFinite(Date.parse(input.startedAt)) &&
      Date.parse(input.finishedAt) >= Date.parse(input.startedAt),
    503,
    'PILOT_COVERAGE_TIME',
    '실제 시험 시작/종료 시각이 필요합니다.',
  );
  const raw = JSON.parse(input.bytes.toString());
  requireCondition(
    Object.values(input.tests).every((value) => Number.isSafeInteger(value) && value >= 0) &&
      input.tests.total === input.tests.passed + input.tests.failed + input.tests.skipped,
    503,
    'PILOT_COVERAGE_COUNTS',
    '실제 정수 시험 수와 전체 상태 합계가 필요합니다.',
  );
  requireCondition(
    canonicalJson(raw) === canonicalJson(JSON.parse(JSON.stringify(input.raw))),
    503,
    'PILOT_COVERAGE_EXPORT',
    '실제 onCoverage와 원문 exporter를 대조해야 합니다.',
  );
  return {
    version: 2,
    mode: 'pilot-current',
    format: COVERAGE_FORMAT,
    unit: input.unit,
    source: input.source,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    passed:
      input.reason === 'passed' &&
      input.errors === 0 &&
      input.tests.total > 0 &&
      input.tests.passed === input.tests.total &&
      input.tests.skipped === 0 &&
      input.tests.failed === 0,
    completeScope:
      canonicalJson(input.testFiles) ===
      canonicalJson(pilotTestInventory(input.source, input.unit)),
    testFiles: input.testFiles,
    tests: input.tests,
    rawPath: pilotCoveragePath(input.unit) + '/coverage-final.json',
    rawHash: sha256(input.bytes),
    files: convertCoverage(
      raw,
      input.source,
      root,
      readSource,
      pilotProductInventory(input.source),
    ),
  };
}
export default class PilotCoverageReporter implements Reporter {
  private ctx?: Vitest;
  private source?: SourceIdentity;
  private raw: unknown;
  private startedAt = '';
  private finished?: {
    modules: ReadonlyArray<TestModule>;
    errors: ReadonlyArray<unknown>;
    reason: string;
  };
  constructor(private readonly options: { unit: PilotUnit }) {}
  onInit(ctx: Vitest) {
    this.ctx = ctx;
    ctx.onClose(() => {
      try {
        this.writeEvidence();
      } catch (error) {
        process.exitCode = 1;
        throw error;
      }
    });
  }
  onTestRunStart() {
    this.source = pilotSourceIdentity();
    this.startedAt = new Date().toISOString();
  }
  onCoverage(coverage: unknown) {
    const value = coverage as { toJSON?: () => unknown };
    this.raw = typeof value?.toJSON === 'function' ? value.toJSON() : coverage;
  }
  onTestRunEnd(modules: ReadonlyArray<TestModule>, errors: ReadonlyArray<unknown>, reason: string) {
    this.finished = { modules, errors, reason };
  }
  private writeEvidence() {
    requireCondition(
      this.ctx && this.source && this.finished,
      503,
      'PILOT_COVERAGE_RUN',
      '실제 시작/종료한 runner 증거가 필요합니다.',
    );
    const directory = pilotCoveragePath(this.options.unit);
    requireCondition(
      relative(process.cwd(), resolve(this.ctx.config.coverage.reportsDirectory)).replaceAll(
        '\\',
        '/',
      ) === directory,
      503,
      'PILOT_COVERAGE_DIRECTORY',
      '등록한 기여별 exporter 경로만 사용합니다.',
    );
    const tests = { total: 0, passed: 0, skipped: 0, failed: 0 };
    for (const module of this.finished.modules)
      for (const test of module.children.allTests()) {
        tests.total++;
        const state = test.result().state;
        if (state === 'passed') tests.passed++;
        else if (state === 'skipped') tests.skipped++;
        else tests.failed++;
      }
    const evidence = buildPilotCoverageEvidence({
      unit: this.options.unit,
      source: this.source,
      current: pilotSourceIdentity(),
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      reason: this.finished.reason,
      errors: this.finished.errors.length,
      testFiles: this.finished.modules
        .map((module) => relative(process.cwd(), module.moduleId).replaceAll('\\', '/'))
        .sort(),
      tests,
      raw: this.raw,
      bytes: readFileSync(directory + '/coverage-final.json'),
    });
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(directory + '/evidence.json', JSON.stringify(evidence, null, 2), { mode: 0o600 });
    requireCondition(
      evidence.passed && evidence.completeScope,
      503,
      'PILOT_COVERAGE_FAILED',
      '실패/취소/skip/누락을 전체 기여 성공으로 바꾸지 않습니다.',
    );
  }
}
