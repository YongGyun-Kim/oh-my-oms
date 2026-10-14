import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, requireCondition } from '@oms/contracts';
import { COVERAGE_FORMAT, convertCoverage } from '../u2/coverage-evidence.js';
import { sha256 } from '../u2/runtime-source.js';
import type { SourceIdentity } from '../u2/runtime-source.js';
import { pilotCoveragePath } from './coverage-evidence.js';
import type { PilotCoverageEvidence } from './coverage-evidence.js';
import {
  pilotProductInventory,
  pilotSourceIdentity,
  pilotTestInventory,
} from './runtime-source.js';
import type { PilotUnit } from './runtime-source.js';

export function aggregatePilotCoverage(
  evidence: PilotCoverageEvidence[],
  source: SourceIdentity,
  readRaw: (path: string) => Buffer = readFileSync,
  readSource: (path: string) => string = (path) => readFileSync(path, 'utf8'),
) {
  const units: PilotUnit[] = ['u1', 'u2', 'u3'],
    inventory = pilotProductInventory(source);
  requireCondition(
    evidence.length === 3 &&
      new Set(evidence.map((entry) => entry.unit)).size === 3 &&
      evidence.every((entry) => units.includes(entry.unit)),
    503,
    'PILOT_COVERAGE_CONTRIBUTIONS',
    '전체 현재 U1/U2/U3의 독립 기여3개가 필요합니다.',
  );
  for (const entry of evidence) {
    requireCondition(
      Object.values(entry.tests).every((value) => Number.isSafeInteger(value) && value >= 0) &&
        entry.tests.total === entry.tests.passed + entry.tests.failed + entry.tests.skipped,
      503,
      'PILOT_COVERAGE_COUNTS',
      '실제 정수 시험 수와 상태 합계가 필요합니다.',
    );
    requireCondition(
      entry.version === 2 &&
        entry.mode === 'pilot-current' &&
        entry.format === COVERAGE_FORMAT &&
        entry.completeScope === true &&
        entry.passed === true &&
        entry.tests.total > 0 &&
        entry.tests.passed === entry.tests.total &&
        entry.tests.failed === 0 &&
        entry.tests.skipped === 0 &&
        canonicalJson(entry.testFiles) === canonicalJson(pilotTestInventory(source, entry.unit)) &&
        canonicalJson(entry.source) === canonicalJson(source) &&
        Date.parse(entry.startedAt) <= Date.parse(entry.finishedAt) &&
        canonicalJson(Object.keys(entry.files).sort()) === canonicalJson(inventory) &&
        entry.rawPath === pilotCoveragePath(entry.unit) + '/coverage-final.json',
      503,
      'PILOT_COVERAGE_PROVENANCE',
      '누락/skip/부분 분모/옛 모드·source·시각은 차단합니다.',
    );
    const bytes = readRaw(entry.rawPath);
    requireCondition(
      sha256(bytes) === entry.rawHash &&
        canonicalJson(
          convertCoverage(
            JSON.parse(bytes.toString()),
            source,
            process.cwd(),
            readSource,
            inventory,
          ),
        ) === canonicalJson(entry.files),
      503,
      'PILOT_COVERAGE_RAW',
      '원문 bytes·현재 source map·실행 기여를 다시 대조해야 합니다.',
    );
  }
  const files: Record<string, { executable: number[]; executed: number[]; unexecuted: number[] }> =
    {};
  let numerator = 0,
    denominator = 0;
  for (const path of inventory) {
    const first = evidence[0]!.files[path]!;
    for (const entry of evidence) {
      const file = entry.files[path]!;
      requireCondition(
        file.sourceHash === source.files[path] &&
          file.mapHash === first.mapHash &&
          canonicalJson(file.executable) === canonicalJson(first.executable),
        503,
        'PILOT_COVERAGE_LAYOUT',
        '동일 전체 제품/source-map 라인만 합집합합니다.',
      );
    }
    const executed = [...new Set(evidence.flatMap((entry) => entry.files[path]!.executed))].sort(
      (a, b) => a - b,
    );
    files[path] = {
      executable: first.executable,
      executed,
      unexecuted: first.executable.filter((line) => !executed.includes(line)),
    };
    denominator += first.executable.length;
    numerator += executed.length;
  }
  return {
    version: 2,
    mode: 'pilot-current',
    format: COVERAGE_FORMAT,
    source,
    threshold: 80,
    numerator,
    denominator,
    percentage: denominator ? (numerator * 100) / denominator : 0,
    passed: denominator > 0 && numerator * 100 >= denominator * 80,
    files,
    realActivationAllowed: false,
  };
}
export function collectPilotCoverage() {
  const source = pilotSourceIdentity(),
    evidence = (['u1', 'u2', 'u3'] as const).map(
      (unit) =>
        JSON.parse(
          readFileSync(pilotCoveragePath(unit) + '/evidence.json', 'utf8'),
        ) as PilotCoverageEvidence,
    ),
    result = aggregatePilotCoverage(evidence, source);
  mkdirSync('.reports/u3/pilot', { recursive: true, mode: 0o700 });
  writeFileSync('.reports/u3/pilot/coverage-aggregate.json', JSON.stringify(result, null, 2), {
    mode: 0o600,
  });
  requireCondition(
    result.passed,
    503,
    'PILOT_COVERAGE_FLOOR',
    '현재 전체 직접 testable 제품 합집합80%에 미달합니다.',
  );
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  collectPilotCoverage();
