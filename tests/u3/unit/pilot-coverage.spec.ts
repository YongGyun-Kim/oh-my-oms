import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import { convertCoverage } from '../../../scripts/u2/coverage-evidence.js';
import {
  productInventory,
  runtimeSourceIdentity,
  sha256,
} from '../../../scripts/u2/runtime-source.js';
import type { SourceIdentity } from '../../../scripts/u2/runtime-source.js';
import {
  pilotProductInventory,
  pilotSourceIdentity,
  pilotTestInventory,
} from '../../../scripts/u3/runtime-source.js';
import type { PilotUnit } from '../../../scripts/u3/runtime-source.js';
import {
  buildPilotCoverageEvidence,
  pilotCoveragePath,
} from '../../../scripts/u3/coverage-evidence.js';
import type { PilotCoverageEvidence } from '../../../scripts/u3/coverage-evidence.js';
import { aggregatePilotCoverage } from '../../../scripts/u3/coverage-aggregate.js';

// 고정 exporter 형식의 제어된 보고서다. 실제 CI/커버리지 성공 증거로 사용하지 않는다.
const text = Array.from({ length: 10 }, () => 'const a = 1;').join('\n'),
  products = ['apps/api/src/fixture.ts', 'scripts/u3/fixture.ts'],
  units: PilotUnit[] = ['u1', 'u2', 'u3'];
const source: SourceIdentity = {
  version: 1,
  head: 'a'.repeat(40),
  digest: 'b'.repeat(64),
  lock: 'c'.repeat(64),
  tools: { node: 'v22.23.3', vitest: '5.0.3', v8: '5.0.3', typescript: '6.0.3' },
  files: Object.fromEntries([
    ...products.map((path) => [path, sha256(text)]),
    ...units.map((unit) => ['tests/' + unit + '/unit/fixture.spec.ts', 'd'.repeat(64)]),
    ['.github/workflows/u1-validation.yml', 'e'.repeat(64)],
  ]),
};
function rawCoverage(executed: number[]) {
  return Object.fromEntries(
    products.map((path) => [
      resolve(path),
      {
        path: resolve(path),
        statementMap: Object.fromEntries(
          Array.from({ length: 10 }, (_, index) => [
            String(index),
            { start: { line: index + 1, column: 0 }, end: { line: index + 1, column: 1 } },
          ]),
        ),
        s: Object.fromEntries(
          Array.from({ length: 10 }, (_, index) => [
            String(index),
            executed.includes(index + 1) ? 1 : 0,
          ]),
        ),
        fnMap: {},
        f: {},
        branchMap: {},
        b: {},
        meta: {},
      },
    ]),
  );
}
function contribution(unit: PilotUnit, executed: number[]) {
  const raw = rawCoverage(executed),
    bytes = Buffer.from(JSON.stringify(raw));
  return {
    bytes,
    evidence: buildPilotCoverageEvidence(
      {
        unit,
        source,
        current: source,
        startedAt: '2026-10-12T00:00:00.000Z',
        finishedAt: '2026-10-12T00:00:01.000Z',
        reason: 'passed',
        errors: 0,
        testFiles: pilotTestInventory(source, unit),
        tests: { total: 1, passed: 1, failed: 0, skipped: 0 },
        raw,
        bytes,
      },
      process.cwd(),
      () => text,
    ),
  };
}
function fixture() {
  const contributions = [
      contribution('u1', [1, 2, 3]),
      contribution('u2', [4, 5, 6]),
      contribution('u3', [7, 8]),
    ],
    evidence = contributions.map((entry) => structuredClone(entry.evidence)),
    bytes = new Map(contributions.map((entry) => [entry.evidence.rawPath, entry.bytes]));
  const aggregate = (entries = evidence, identity = source) =>
    aggregatePilotCoverage(
      entries,
      identity,
      (path) => {
        const value = bytes.get(path);
        if (!value) throw new Error('제어된 보고서 누락');
        return value;
      },
      () => text,
    );
  return { evidence, bytes, aggregate };
}
describe('pilot-current 전체 source·3기여·원문 라인 합집합', () => {
  it('실제 pilot identity는 기존 공용/워크플로 원문과 모든 새 U3 source/test를 함께 포함한다', () => {
    const legacy = runtimeSourceIdentity(),
      current = pilotSourceIdentity();
    expect(current.head).toBe(legacy.head);
    expect(current.lock).toBe(legacy.lock);
    expect(current.tools).toEqual(legacy.tools);
    for (const [path, hash] of Object.entries(legacy.files)) expect(current.files[path]).toBe(hash);
    expect(current.files['scripts/u3/coverage-aggregate.ts']).toBe(
      sha256(readFileSync('scripts/u3/coverage-aggregate.ts')),
    );
    expect(current.files['tests/u3/unit/pilot-coverage.spec.ts']).toBe(
      sha256(readFileSync('tests/u3/unit/pilot-coverage.spec.ts')),
    );
    expect(pilotProductInventory(current)).toContain('scripts/u3/coverage-evidence.ts');
    expect(pilotTestInventory(current, 'u3')).toContain(
      'tests/u3/integration/worker-handoff.spec.ts',
    );
    expect(
      Object.keys(current.files).some(
        (path) => path.startsWith('.runtime/') || path.startsWith('.reports/'),
      ),
    ).toBe(false);
  });
  it('기존 converter 기본 전체 inventory는 그대로이고 명시 pilot inventory만 새 script를 포함한다', () => {
    const raw = rawCoverage([1]),
      legacyRaw = Object.fromEntries(
        Object.entries(raw).filter(([path]) => path === resolve(products[0]!)),
      ),
      legacy = convertCoverage(legacyRaw, source, process.cwd(), () => text),
      current = convertCoverage(
        raw,
        source,
        process.cwd(),
        () => text,
        pilotProductInventory(source),
      );
    expect(Object.keys(legacy)).toEqual(productInventory(source));
    expect(current[products[0]!]).toEqual(legacy[products[0]!]);
    expect(Object.keys(current).sort()).toEqual(pilotProductInventory(source));
    expect(() => convertCoverage(raw, source, process.cwd(), () => text)).toThrow();
    expect(() =>
      convertCoverage(legacyRaw, source, process.cwd(), () => text, pilotProductInventory(source)),
    ).toThrow();
  });
  it('독립3기여를 같은 전체20라인 분모에 합집합하고80%에서만 통과한다', () => {
    const f = fixture(),
      result = f.aggregate();
    expect(result).toMatchObject({
      mode: 'pilot-current',
      passed: true,
      threshold: 80,
      denominator: 20,
      numerator: 16,
      percentage: 80,
      realActivationAllowed: false,
    });
    expect(result.files[products[1]!]).toMatchObject({ unexecuted: [9, 10] });
    const missed = contribution('u3', [7]);
    f.evidence[2] = missed.evidence;
    f.bytes.set(missed.evidence.rawPath, missed.bytes);
    expect(f.aggregate()).toMatchObject({
      passed: false,
      denominator: 20,
      numerator: 14,
      percentage: 70,
    });
  });
  it('누락·중복·구형2기여/모드·부분 test inventory·분모 축소·UNKNOWN 통과 주장을 거절한다', () => {
    for (const mutate of [
      (e: PilotCoverageEvidence[]) => {
        e.pop();
      },
      (e: PilotCoverageEvidence[]) => {
        e[2] = structuredClone(e[0]!);
      },
      (e: PilotCoverageEvidence[]) => {
        Reflect.set(e[0]!, 'version', 1);
      },
      (e: PilotCoverageEvidence[]) => {
        Reflect.set(e[0]!, 'mode', 'full-proof');
      },
      (e: PilotCoverageEvidence[]) => {
        e[0]!.testFiles = [];
      },
      (e: PilotCoverageEvidence[]) => {
        e[0]!.completeScope = false;
      },
      (e: PilotCoverageEvidence[]) => {
        delete e[0]!.files[products[1]!];
      },
      (e: PilotCoverageEvidence[]) => {
        Reflect.set(e[0]!, 'passed', 'UNKNOWN');
      },
    ]) {
      const f = fixture();
      mutate(f.evidence);
      expect(() => f.aggregate()).toThrow();
    }
  });
  it('실패/취소/skip/불완전 정수 count와 source/lock/workflow mismatch를 거절한다', () => {
    for (const mutate of [
      (e: PilotCoverageEvidence[]) => {
        e[0]!.passed = false;
      },
      (e: PilotCoverageEvidence[]) => {
        e[0]!.tests.skipped = 1;
      },
      (e: PilotCoverageEvidence[]) => {
        e[0]!.tests.failed = 1;
      },
      (e: PilotCoverageEvidence[]) => {
        e[0]!.tests.total = 1.5;
        e[0]!.tests.passed = 1.5;
      },
      (e: PilotCoverageEvidence[]) => {
        e[0]!.finishedAt = 'invalid';
      },
      (e: PilotCoverageEvidence[]) => {
        e[0]!.source.lock = 'f'.repeat(64);
      },
      (e: PilotCoverageEvidence[]) => {
        e[0]!.source.files['.github/workflows/u1-validation.yml'] = 'f'.repeat(64);
      },
    ]) {
      const f = fixture();
      mutate(f.evidence);
      expect(() => f.aggregate()).toThrow();
    }
    const base = contribution('u1', [1]),
      raw = rawCoverage([1]);
    for (const mode of ['failed', 'interrupted', 'passed']) {
      const evidence = buildPilotCoverageEvidence(
        {
          unit: 'u1',
          source,
          current: source,
          startedAt: base.evidence.startedAt,
          finishedAt: base.evidence.finishedAt,
          reason: mode,
          errors: mode === 'passed' ? 1 : 0,
          testFiles: pilotTestInventory(source, 'u1'),
          tests: base.evidence.tests,
          raw,
          bytes: base.bytes,
        },
        process.cwd(),
        () => text,
      );
      expect(evidence.passed).toBe(false);
    }
  });
  it('옛/없는 원문·임의 raw path·위조 실행 기여와 서로 다른 map layout을 합집합하지 않는다', () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => {
        f.bytes.delete(f.evidence[0]!.rawPath);
      },
      (f: ReturnType<typeof fixture>) => {
        f.bytes.set(f.evidence[0]!.rawPath, Buffer.from('{}'));
      },
      (f: ReturnType<typeof fixture>) => {
        f.evidence[0]!.rawPath = '/unregistered';
      },
      (f: ReturnType<typeof fixture>) => {
        f.evidence[0]!.files[products[1]!]!.executed.push(9);
      },
      (f: ReturnType<typeof fixture>) => {
        const entry = f.evidence[0]!,
          raw = rawCoverage([1, 2, 3]);
        raw[resolve(products[0]!)]!.statementMap['0']!.end.column = 2;
        const bytes = Buffer.from(JSON.stringify(raw));
        entry.rawHash = sha256(bytes);
        entry.files = convertCoverage(
          raw,
          source,
          process.cwd(),
          () => text,
          pilotProductInventory(source),
        );
        f.bytes.set(entry.rawPath, bytes);
      },
    ]) {
      const f = fixture();
      mutate(f);
      expect(() => f.aggregate()).toThrow();
    }
    expect(pilotCoveragePath('u3')).toBe('.reports/u3/pilot/u3-coverage');
  });
  it('raw exporter/관측·시험 시작/끝 source 교환을 reporter 단계에서 거절한다', () => {
    const value = contribution('u3', [7, 8]),
      input = {
        unit: 'u3' as const,
        source,
        current: source,
        startedAt: value.evidence.startedAt,
        finishedAt: value.evidence.finishedAt,
        reason: 'passed',
        errors: 0,
        testFiles: pilotTestInventory(source, 'u3'),
        tests: value.evidence.tests,
        raw: rawCoverage([7, 8]),
        bytes: value.bytes,
      };
    expect(() =>
      buildPilotCoverageEvidence(
        { ...input, current: { ...source, digest: 'f'.repeat(64) } },
        process.cwd(),
        () => text,
      ),
    ).toThrow();
    expect(() =>
      buildPilotCoverageEvidence({ ...input, raw: rawCoverage([1]) }, process.cwd(), () => text),
    ).toThrow();
    expect(() =>
      buildPilotCoverageEvidence(
        { ...input, tests: { total: 1, passed: 0.5, failed: 0, skipped: 0 } },
        process.cwd(),
        () => text,
      ),
    ).toThrow();
    expect(canonicalJson(input.raw)).toBe(canonicalJson(JSON.parse(input.bytes.toString())));
  });
});
