import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregateCoverage } from '../../../scripts/u2/coverage-aggregate.js';
import { COVERAGE_FORMAT, convertCoverage } from '../../../scripts/u2/coverage-evidence.js';
import type { CoverageEvidence } from '../../../scripts/u2/coverage-evidence.js';
import type { SourceIdentity } from '../../../scripts/u2/runtime-source.js';
import {
  sha256,
  runtimeSourceIdentity,
  testInventory,
} from '../../../scripts/u2/runtime-source.js';
import u1CoverageConfig from '../../project/vitest.u1.coverage.config.js';
import u1UnitConfig from '../../u1/vitest.unit.config.js';
import u1IntegrationConfig from '../../u1/vitest.integration.config.js';
import { matchesGlob } from 'node:path';
const source: SourceIdentity = {
  version: 1,
  head: 'a'.repeat(40),
  digest: 'b'.repeat(64),
  lock: 'c'.repeat(64),
  files: {
    'apps/example.ts': 'd'.repeat(64),
    'packages/example/src/unexecuted.ts': 'e'.repeat(64),
    'tests/u1/unit/golden.spec.ts': 'a'.repeat(64),
    'tests/u2/unit/golden.spec.ts': 'a'.repeat(64),
  },
  tools: { node: 'v22.23.3', vitest: '5.0.3', v8: '5.0.3', typescript: '6.0.3' },
};
function evidence(unit: 'u1' | 'u2', executed: number[]): CoverageEvidence {
  return {
    version: 1,
    format: COVERAGE_FORMAT,
    unit,
    source,
    startedAt: '2026-10-10T00:00:00Z',
    finishedAt: '2026-10-10T00:01:00Z',
    passed: true,
    completeScope: true,
    testFiles: ['tests/' + unit + '/unit/golden.spec.ts'],
    tests: { total: 1, passed: 1, skipped: 0, failed: 0 },
    rawPath: 'synthetic-only.json',
    rawHash: 'f'.repeat(64),
    files: {
      'apps/example.ts': {
        sourceHash: source.files['apps/example.ts']!,
        mapHash: 'g'.repeat(64),
        executable: [1, 2, 3, 4],
        executed,
      },
      'packages/example/src/unexecuted.ts': {
        sourceHash: source.files['packages/example/src/unexecuted.ts']!,
        mapHash: 'h'.repeat(64),
        executable: [1],
        executed: [],
      },
    },
  };
}
describe('현재 전체 coverage 라인 합집합; synthetic 집합은 실제 실행 근거가 아니다', () => {
  it('U1 기존 unit/integration TS와 TSX suite가 coverage/inventory와 정확히 동일하다', () => {
    const current = runtimeSourceIdentity();
    const select = (patterns: string[]) =>
      Object.keys(current.files)
        .filter((path) => patterns.some((pattern) => matchesGlob(path, pattern)))
        .sort();
    const original = select([
      ...u1UnitConfig.test!.include!,
      ...u1IntegrationConfig.test!.include!,
    ]);
    expect(original.some((path) => path.endsWith('.spec.tsx'))).toBe(true);
    expect(select(u1CoverageConfig.test!.include!)).toEqual(original);
    expect(testInventory(current, 'u1')).toEqual(original);
  });
  it('TSX suite 하나라도 누락하면 completeScope flag와 관계없이 합집합을 거절한다', () => {
    const current = structuredClone(source);
    current.files['tests/u1/unit/pc.spec.tsx'] = 'a'.repeat(64);
    const a = evidence('u1', [1, 2]),
      b = evidence('u2', [3, 4]);
    a.source = current;
    b.source = current;
    expect(() => aggregateCoverage([a, b], current)).toThrow();
  });
  it('겹친 라인/같은 파일은 한 번만 세며 미실행 파일도 분모에 남긴다', () => {
    const r = aggregateCoverage([evidence('u1', [1, 2, 3]), evidence('u2', [2, 3, 4])], source);
    expect(r).toMatchObject({ numerator: 4, denominator: 5, percentage: 80, passed: true });
    expect(r.files['packages/example/src/unexecuted.ts']!.unexecuted).toEqual([1]);
  });
  it('80% 정각 아래는 부분 report 통과와 관계없이 overall false다', () =>
    expect(
      aggregateCoverage([evidence('u1', [1, 2]), evidence('u2', [2, 3])], source),
    ).toMatchObject({ numerator: 3, denominator: 5, passed: false }));
  it('전체 미실행 분모를0으로 축소하거나 empty map로 pass하지 않는다', () => {
    const a = evidence('u1', []),
      b = evidence('u2', []);
    expect(aggregateCoverage([a, b], source).passed).toBe(false);
    for (const e of [a, b])
      for (const f of Object.values(e.files)) {
        f.executable = [];
        f.executed = [];
      }
    expect(aggregateCoverage([a, b], source).passed).toBe(false);
  });
  for (const mutation of [
    'sha',
    'lock',
    'inventory',
    'skip',
    'failure',
    'no-test',
    'missing-file',
    'format',
    'stale-order',
    'line-map',
    'duplicate-line',
    'alien-line',
  ] as const)
    it(mutation + '는 차단된다', () => {
      const a = evidence('u1', [1, 2]),
        b = structuredClone(evidence('u2', [3, 4]));
      if (mutation === 'sha') b.source.head = 'f'.repeat(40);
      if (mutation === 'lock') b.source.lock = 'f'.repeat(64);
      if (mutation === 'inventory') b.source.files['apps/new.ts'] = 'a'.repeat(64);
      if (mutation === 'skip') b.tests.skipped = 1;
      if (mutation === 'failure') b.passed = false;
      if (mutation === 'no-test') b.tests.total = 0;
      if (mutation === 'missing-file') delete b.files['packages/example/src/unexecuted.ts'];
      if (mutation === 'format') b.format = 'unsupported' as typeof COVERAGE_FORMAT;
      if (mutation === 'stale-order') b.startedAt = '2026-10-11T00:00:00Z';
      if (mutation === 'line-map') b.files['apps/example.ts']!.mapHash = 'different';
      if (mutation === 'duplicate-line') b.files['apps/example.ts']!.executed = [3, 3];
      if (mutation === 'alien-line') b.files['apps/example.ts']!.executed = [100];
      expect(() => aggregateCoverage([a, b], source)).toThrow();
    });
  it('독립 두 current owner 기여가 없으면 stale U1 옛 측정을 재사용하지 않는다', () => {
    expect(() => aggregateCoverage([evidence('u1', [1])], source)).toThrow();
    expect(() => aggregateCoverage([evidence('u1', [1]), evidence('u1', [2])], source)).toThrow();
  });
  it('전체 제품 분모를 가진 선택시험 기여도 전체 unit suite 근거로 승격하지 않는다', () => {
    const b = evidence('u2', [1, 2, 3, 4]);
    b.completeScope = false;
    expect(() => aggregateCoverage([evidence('u1', [1]), b], source)).toThrow();
  });
  it('completeScope flag만 조작해도 현재 시험 파일 누락은 차단한다', () => {
    const b = evidence('u2', [1, 2, 3, 4]);
    b.testFiles = [];
    expect(() => aggregateCoverage([evidence('u1', [1]), b], source)).toThrow();
  });
  it('고정 실제 V8 exporter 원문은 source map Infinity/null와 statement start-line을 summary와 동일하게 변환한다', () => {
    const golden = JSON.parse(readFileSync('tests/u2/fixtures/coverage-export.json', 'utf8')),
      raw = { '/golden/apps/example.ts': { ...golden.file, path: '/golden/apps/example.ts' } },
      actual = { ...source, files: { 'apps/example.ts': sha256(golden.source) } },
      converted = convertCoverage(raw, actual, '/golden', () => golden.source);
    expect(Object.keys(converted)).toEqual(['apps/example.ts']);
    for (const file of Object.values(converted)) {
      const measured = golden.expected;
      expect({ total: file.executable.length, covered: file.executed.length }).toEqual({
        total: measured.total,
        covered: measured.covered,
      });
    }
    expect(() => convertCoverage([], actual)).toThrow();
    const broken = structuredClone(raw);
    delete broken['/golden/apps/example.ts'].s['0'];
    expect(() => convertCoverage(broken, actual, '/golden', () => golden.source)).toThrow();
    for (const change of [
      'function-location',
      'function-field',
      'branch-count',
      'branch-location',
      'negative-count',
    ]) {
      const bad = structuredClone(raw),
        file = bad['/golden/apps/example.ts'];
      if (change === 'function-location') file.fnMap['0'].loc.start.line = -1;
      if (change === 'function-field') file.fnMap['0'].unsupported = true;
      if (change === 'branch-count') file.b['0'] = [];
      if (change === 'branch-location') file.branchMap['0'].locations[0].start.line = 0;
      if (change === 'negative-count') file.f['0'] = -1;
      expect(() => convertCoverage(bad, actual, '/golden', () => golden.source)).toThrow();
    }
  });
});
