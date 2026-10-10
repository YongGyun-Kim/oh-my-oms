import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve, isAbsolute } from 'node:path';
import { canonicalJson, requireCondition } from '@oms/contracts';
import type { Reporter, TestModule, Vitest } from 'vitest/node';
import {
  productInventory,
  testInventory,
  runtimeSourceIdentity,
  sha256,
} from './runtime-source.js';
import type { SourceIdentity } from './runtime-source.js';
export const COVERAGE_FORMAT = 'vitest-v8-5.0.3-istanbul-start-line:1';
interface Point {
  line: number;
  column: number | null;
}
interface Location {
  start: Point;
  end: Point;
}
interface FileCoverage {
  path: string;
  statementMap: Record<string, Location>;
  s: Record<string, number>;
  fnMap: Record<string, unknown>;
  f: Record<string, number>;
  branchMap: Record<string, unknown>;
  b: Record<string, number[]>;
  meta: unknown;
}
export interface FileLines {
  sourceHash: string;
  mapHash: string;
  executable: number[];
  executed: number[];
}
export interface CoverageEvidence {
  version: 1;
  format: typeof COVERAGE_FORMAT;
  unit: 'u1' | 'u2';
  source: SourceIdentity;
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  completeScope: boolean;
  testFiles: string[];
  tests: { total: number; passed: number; skipped: number; failed: number };
  rawPath: string;
  rawHash: string;
  files: Record<string, FileLines>;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function convertCoverage(
  raw: unknown,
  source: SourceIdentity,
  root = process.cwd(),
  readSource: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): Record<string, FileLines> {
  requireCondition(object(raw), 503, 'COVERAGE_FORMAT', '실제 Istanbul JSON object가 필요합니다.');
  const expected = productInventory(source),
    files: Record<string, FileLines> = {};
  for (const [absolute, value] of Object.entries(raw)) {
    requireCondition(
      isAbsolute(absolute) && object(value) && value.path === absolute,
      503,
      'COVERAGE_PATH',
      'exporter의 정확 absolute path가 필요합니다.',
    );
    const path = relative(root, absolute).replaceAll('\\', '/');
    requireCondition(
      !path.startsWith('../') && expected.includes(path) && !files[path],
      503,
      'COVERAGE_INVENTORY',
      '전체 inventory 밖/중복 파일은 차단합니다.',
    );
    requireCondition(
      Object.keys(value).sort().join(',') === 'b,branchMap,f,fnMap,meta,path,s,statementMap' &&
        ['statementMap', 's', 'fnMap', 'f', 'branchMap', 'b', 'meta'].every((key) =>
          object(value[key]),
        ),
      503,
      'COVERAGE_FORMAT',
      '고정 V8 exporter 필수 maps/counts/meta가 필요합니다.',
    );
    const c = value as unknown as FileCoverage,
      text = readSource(resolve(root, path)),
      lines = text.split('\n');
    requireCondition(
      sha256(text) === source.files[path],
      503,
      'COVERAGE_STALE_SOURCE',
      '수집한 현재 파일 bytes가 다릅니다.',
    );
    const validatePoint = (p: Point) =>
      requireCondition(
        object(p) &&
          Object.keys(p).sort().join(',') === 'column,line' &&
          Number.isInteger(p.line) &&
          p.line > 0 &&
          p.line <= lines.length &&
          (p.column === null ||
            (Number.isInteger(p.column) &&
              p.column >= 0 &&
              p.column <= (lines[p.line - 1]?.length ?? 0))),
        503,
        'COVERAGE_LOCATION',
        'source-map 위치/Infinity의 JSON null 형식을 확인하세요.',
      );
    requireCondition(
      canonicalJson(Object.keys(c.s).sort()) ===
        canonicalJson(Object.keys(c.statementMap).sort()) &&
        canonicalJson(Object.keys(c.f).sort()) === canonicalJson(Object.keys(c.fnMap).sort()) &&
        canonicalJson(Object.keys(c.b).sort()) === canonicalJson(Object.keys(c.branchMap).sort()),
      503,
      'COVERAGE_MAP_COUNTS',
      '모든 map의 원래 count가 필요합니다.',
    );
    for (const n of [...Object.values(c.s), ...Object.values(c.f), ...Object.values(c.b).flat()])
      requireCondition(
        Number.isSafeInteger(n) && n >= 0,
        503,
        'COVERAGE_COUNT',
        '정규 비음수 실행 count가 필요합니다.',
      );
    const validateLocation = (value: unknown, implicit = false) => {
      requireCondition(
        object(value),
        503,
        'COVERAGE_LOCATION',
        '원래 source-map location이 필요합니다.',
      );
      // The actual exporter uses {} for an implicit branch's absent source
      // arm (e.g. an if without else). It is not an executable line.
      if (
        implicit &&
        (Object.keys(value).length === 0 ||
          (Object.keys(value).sort().join(',') === 'end,start' &&
            object(value.start) &&
            object(value.end) &&
            Object.keys(value.start).length === 0 &&
            Object.keys(value.end).length === 0))
      )
        return;
      requireCondition(
        Object.keys(value).sort().join(',') === 'end,start',
        503,
        'COVERAGE_LOCATION',
        '등록 location 필드가 필요합니다.',
      );
      const loc = value as unknown as Location;
      validatePoint(loc.start);
      validatePoint(loc.end);
      requireCondition(
        loc.end.line >= loc.start.line,
        503,
        'COVERAGE_LOCATION',
        'source-map 순서를 확인하세요.',
      );
    };
    for (const fn of Object.values(c.fnMap)) {
      requireCondition(
        object(fn) &&
          Object.keys(fn).sort().join(',') === 'decl,line,loc,name' &&
          typeof fn.name === 'string' &&
          Number.isInteger(fn.line),
        503,
        'COVERAGE_FUNCTION_MAP',
        '고정 exporter 함수 map가 필요합니다.',
      );
      validateLocation(fn.decl);
      validateLocation(fn.loc);
    }
    for (const [id, branch] of Object.entries(c.branchMap)) {
      requireCondition(
        object(branch) &&
          Object.keys(branch).sort().join(',') === 'line,loc,locations,type' &&
          typeof branch.type === 'string' &&
          Number.isInteger(branch.line) &&
          Array.isArray(branch.locations) &&
          Array.isArray(c.b[id]) &&
          branch.locations.length === c.b[id]!.length,
        503,
        'COVERAGE_BRANCH_MAP',
        '고정 exporter branch/count 길이가 필요합니다.',
      );
      validateLocation(branch.loc);
      for (const loc of branch.locations as unknown[]) validateLocation(loc, true);
    }
    const executable = new Set<number>(),
      executed = new Set<number>();
    for (const [id, location] of Object.entries(c.statementMap)) {
      requireCondition(
        object(location) && Object.keys(location).sort().join(',') === 'end,start',
        503,
        'COVERAGE_LOCATION',
        '등록 statement 위치가 필요합니다.',
      );
      validatePoint(location.start);
      validatePoint(location.end);
      requireCondition(
        location.end.line >= location.start.line,
        503,
        'COVERAGE_LOCATION',
        '원래 위치 순서가 다릅니다.',
      );
      executable.add(location.start.line);
      if (c.s[id]! > 0) executed.add(location.start.line);
    }
    // Istanbul line summaries use each statement's start line and max hits on
    // that line, not every line in a multi-line statement or summed counters.
    files[path] = {
      sourceHash: source.files[path]!,
      mapHash: sha256(
        canonicalJson({ statementMap: c.statementMap, fnMap: c.fnMap, branchMap: c.branchMap }),
      ),
      executable: [...executable].sort((a, b) => a - b),
      executed: [...executed].sort((a, b) => a - b),
    };
  }
  requireCondition(
    canonicalJson(Object.keys(files).sort()) === canonicalJson(expected),
    503,
    'COVERAGE_MISSING_FILE',
    '미실행 파일도 같은 전체 분모의 실제 exporter map가 필요합니다.',
  );
  return files;
}
export default class CoverageEvidenceReporter implements Reporter {
  private source: SourceIdentity | undefined;
  private raw: unknown;
  private startedAt = '';
  private ctx: Vitest | undefined;
  private finished: {
    modules: ReadonlyArray<TestModule>;
    errors: ReadonlyArray<unknown>;
    reason: string;
  } | null = null;
  constructor(private readonly options: { unit: 'u1' | 'u2' }) {}
  onInit(ctx: Vitest) {
    this.ctx = ctx;
    // The fixed Vitest version writes coverage reporters AFTER onTestRunEnd.
    // Its supported onClose callback waits until that export is available.
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
    this.source = runtimeSourceIdentity();
    this.startedAt = new Date().toISOString();
  }
  onCoverage(coverage: unknown) {
    const c = coverage as { toJSON?: () => unknown };
    this.raw = typeof c?.toJSON === 'function' ? c.toJSON() : coverage;
  }
  onTestRunEnd(modules: ReadonlyArray<TestModule>, errors: ReadonlyArray<unknown>, reason: string) {
    this.finished = { modules, errors, reason };
  }
  private writeEvidence() {
    requireCondition(
      this.finished,
      503,
      'COVERAGE_RUN_MISSING',
      '완료된 실제 runner 결과가 필요합니다.',
    );
    const { modules, errors, reason } = this.finished;
    const source = this.source;
    requireCondition(
      source && this.ctx,
      503,
      'COVERAGE_START',
      '실제 runner의 시작 provenance가 필요합니다.',
    );
    const current = runtimeSourceIdentity();
    requireCondition(
      canonicalJson(current) === canonicalJson(source),
      503,
      'COVERAGE_SOURCE_CHANGED',
      '시험 중 source/tool/lock 변경을 차단합니다.',
    );
    const tests = { total: 0, passed: 0, skipped: 0, failed: 0 };
    for (const module of modules)
      for (const test of module.children.allTests()) {
        tests.total++;
        const state = test.result().state;
        if (state === 'passed') tests.passed++;
        else if (state === 'skipped') tests.skipped++;
        else tests.failed++;
      }
    const rawPath = relative(
        process.cwd(),
        resolve(this.ctx.config.coverage.reportsDirectory, 'coverage-final.json'),
      ).replaceAll('\\', '/'),
      bytes = readFileSync(rawPath),
      raw = JSON.parse(bytes.toString());
    requireCondition(
      canonicalJson(raw) === canonicalJson(JSON.parse(JSON.stringify(this.raw))),
      503,
      'COVERAGE_EXPORT_MISMATCH',
      '실제 onCoverage와 JSON exporter bytes를 대조하세요.',
    );
    const evidence: CoverageEvidence = {
      version: 1,
      format: COVERAGE_FORMAT,
      unit: this.options.unit,
      source,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      passed:
        reason === 'passed' &&
        errors.length === 0 &&
        tests.total > 0 &&
        tests.skipped === 0 &&
        tests.failed === 0,
      tests,
      testFiles: modules
        .map((module) => relative(process.cwd(), module.moduleId).replaceAll('\\', '/'))
        .sort(),
      completeScope:
        canonicalJson(
          modules
            .map((module) => relative(process.cwd(), module.moduleId).replaceAll('\\', '/'))
            .sort(),
        ) === canonicalJson(testInventory(source, this.options.unit)),
      rawPath,
      rawHash: sha256(bytes),
      files: convertCoverage(raw, source),
    };
    const output = resolve(this.ctx.config.coverage.reportsDirectory, 'evidence.json');
    mkdirSync(resolve(output, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(output, JSON.stringify(evidence, null, 2), { mode: 0o600 });
    requireCondition(
      evidence.passed,
      503,
      'COVERAGE_TEST_RUN_FAILED',
      '부분 실패/skip/no-test를 기여 통과로 인정하지 않습니다.',
    );
  }
}
