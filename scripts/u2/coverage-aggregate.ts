import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, requireCondition } from '@oms/contracts';
import {
  runtimeSourceIdentity,
  productInventory,
  testInventory,
  sha256,
} from './runtime-source.js';
import type { SourceIdentity } from './runtime-source.js';
import { COVERAGE_FORMAT, convertCoverage } from './coverage-evidence.js';
import type { CoverageEvidence } from './coverage-evidence.js';
export function aggregateCoverage(evidence: CoverageEvidence[], source: SourceIdentity) {
  requireCondition(
    evidence.length === 2 &&
      new Set(evidence.map((e) => e.unit)).size === 2 &&
      evidence.every((e) => ['u1', 'u2'].includes(e.unit)),
    503,
    'COVERAGE_CONTRIBUTIONS',
    '현재 U1/U2의 독립 기여 두 개가 필요합니다.',
  );
  for (const e of evidence)
    requireCondition(
      e.version === 1 &&
        e.format === COVERAGE_FORMAT &&
        e.completeScope &&
        canonicalJson(e.testFiles) === canonicalJson(testInventory(source, e.unit)) &&
        e.passed &&
        e.tests.total > 0 &&
        e.tests.passed === e.tests.total &&
        e.tests.skipped === 0 &&
        e.tests.failed === 0 &&
        Date.parse(e.startedAt) <= Date.parse(e.finishedAt) &&
        canonicalJson(e.source) === canonicalJson(source) &&
        canonicalJson(Object.keys(e.files).sort()) === canonicalJson(productInventory(source)),
      503,
      'COVERAGE_PROVENANCE',
      'stale/missing/skip/identity/inventory mismatch는 차단합니다.',
    );
  const files: Record<string, { executable: number[]; executed: number[]; unexecuted: number[] }> =
    {};
  let numerator = 0,
    denominator = 0;
  for (const path of productInventory(source)) {
    const a = evidence[0]!.files[path]!,
      b = evidence[1]!.files[path]!;
    requireCondition(
      a.sourceHash === source.files[path] &&
        b.sourceHash === a.sourceHash &&
        a.mapHash === b.mapHash &&
        canonicalJson(a.executable) === canonicalJson(b.executable),
      503,
      'COVERAGE_LINE_LAYOUT',
      '현재 source-map/line layout 불일치를 합집합하지 않습니다.',
    );
    for (const f of [a, b])
      requireCondition(
        f.executable.every(
          (n, i) => Number.isInteger(n) && n > 0 && (i === 0 || n > f.executable[i - 1]!),
        ) &&
          f.executed.every(
            (n, i) => f.executable.includes(n) && (i === 0 || n > f.executed[i - 1]!),
          ),
        503,
        'COVERAGE_LINE_SET',
        '정렬된 단일 executable/실행 라인 집합이 필요합니다.',
      );
    const executed = [...new Set([...a.executed, ...b.executed])].sort((x, y) => x - y);
    denominator += a.executable.length;
    numerator += executed.length;
    files[path] = {
      executable: a.executable,
      executed,
      unexecuted: a.executable.filter((n) => !executed.includes(n)),
    };
  }
  const percentage = denominator ? (100 * numerator) / denominator : 0;
  return {
    version: 1,
    format: COVERAGE_FORMAT,
    source,
    threshold: 80,
    numerator,
    denominator,
    percentage,
    passed: denominator > 0 && numerator * 100 >= denominator * 80,
    files,
    realActivationAllowed: false,
  };
}
export function collectAggregate() {
  const source = runtimeSourceIdentity(),
    evidence = [
      '.reports/project/current-u1-coverage/evidence.json',
      '.reports/u2/coverage/evidence.json',
    ].map((path) => {
      const e = JSON.parse(readFileSync(path, 'utf8')) as CoverageEvidence,
        bytes = readFileSync(e.rawPath);
      requireCondition(
        sha256(bytes) === e.rawHash &&
          canonicalJson(convertCoverage(JSON.parse(bytes.toString()), source)) ===
            canonicalJson(e.files),
        503,
        'COVERAGE_RAW_EVIDENCE',
        '원문 map/실행 라인/provenance 교환 내용을 다시 검증합니다.',
      );
      return e;
    });
  const result = aggregateCoverage(evidence, source);
  mkdirSync('.reports/project', { recursive: true, mode: 0o700 });
  writeFileSync('.reports/project/coverage-aggregate.json', JSON.stringify(result, null, 2), {
    mode: 0o600,
  });
  writeFileSync('.reports/project/source-inventory.json', JSON.stringify(source, null, 2), {
    mode: 0o600,
  });
  requireCondition(
    result.passed,
    503,
    'COVERAGE_BELOW_FLOOR',
    '현재 전체 직접 testable 제품의80% 라인 하한에 미달합니다.',
  );
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  collectAggregate();
