import { describe, expect, it } from 'vitest';
import {
  evaluateSamples,
  mandatoryPhases,
  percentile,
} from '../../../scripts/u1/performance-statistics.js';
import type { Sample } from '../../../scripts/u1/performance-statistics.js';
const phase = { name: 'NORMAL', rate: 20, seconds: 1 };
const samples = () =>
  Array.from({ length: 20 }, (_, i) => ({
    milliseconds: i % 5 === 4 ? 1500 : 500,
    kind: i % 5 === 4 ? ('WRITE' as const) : ('READ' as const),
    status: i % 5 === 4 ? 202 : 200,
    accuracy: true,
    bytes: 100,
  }));
describe('전체 기간/요청수·조회변경·오류와 정확성의 별도 기준', () => {
  it('등록 public requestRecovery의 실제200은 명시metadata에서만 WRITE지연과 정확성기준을 유지한다', () => {
    const rows: Sample[] = samples();
    Object.assign(rows[4]!, { operation: 'requestRecovery', expectedStatus: 200, status: 200 });
    const measured = evaluateSamples(rows, phase, 1000);
    expect(measured.technicalFailures).toBe(0);
    expect(measured.unexpectedResponseFailures).toBe(0);
    expect(measured.writeRequests).toBe(4);
    expect(measured.writeP95).toBe(1500);
    expect(measured.passed).toBe(true);
    rows[4]!.accuracy = false;
    expect(evaluateSamples(rows, phase, 1000).passed).toBe(false);
  });
  it('같은200이어도 다른operation/READ/미등록kind/다른expectedStatus는 override 성공으로 만들지 않는다', () => {
    for (const invalid of [
      { operation: 'requestRecovery', expectedStatus: 202, kind: 'WRITE', status: 202 },
      { operation: 'otherOperation', expectedStatus: 200, kind: 'WRITE', status: 200 },
      { operation: 'requestRecovery', expectedStatus: 200, kind: 'READ', status: 200 },
      { operation: 'requestRecovery', expectedStatus: 200, kind: 'INVALID', status: 200 },
      { operation: 'requestRecovery', expectedStatus: 409, kind: 'WRITE', status: 409 },
    ]) {
      const rows: Sample[] = samples();
      Object.assign(rows[4]!, invalid);
      for (const name of ['NORMAL', 'PEAK'])
        expect(evaluateSamples(rows, { ...phase, name }, 1000).passed).toBe(false);
    }
  });
  it('명시 public200도400/409/0을 성공으로 바꾸지 않고 원래 WRITE 오류율에 포함한다', () => {
    for (const status of [400, 409, 0]) {
      const rows: Sample[] = samples();
      Object.assign(rows[4]!, { operation: 'requestRecovery', expectedStatus: 200, status });
      const measured = evaluateSamples(rows, phase, 1000);
      expect(measured.technicalFailures).toBe(1);
      expect(measured.errorRate).toBe(0.05);
      expect(measured.passed).toBe(false);
    }
  });
  it('READ302/202·WRITE200/301은등록된200/202가아니므로정상과peak모두통과하지않는다', () => {
    for (const [kind, status] of [
      ['READ', 302],
      ['READ', 202],
      ['WRITE', 200],
      ['WRITE', 301],
    ] as const) {
      const rows = samples();
      const selected = rows.find((value) => value.kind === kind)!;
      selected.status = status;
      for (const name of ['NORMAL', 'PEAK']) {
        const result = evaluateSamples(rows, { ...phase, name }, 1000);
        expect(result.technicalFailures).toBe(1);
        expect(result.unexpectedResponseFailures).toBe(1);
        expect(result.passed).toBe(false);
      }
    }
  });
  it('30분 정상/5분 peak/5분 회복/10분hold를 줄이지 않는다', () =>
    expect(mandatoryPhases.map((p) => [p.rate, p.seconds])).toEqual([
      [20, 1800],
      [100, 300],
      [20, 300],
      [20, 600],
    ]));
  it('p95는 nearest-rank이며 빈집합을0ms 통과로 만들지 않는다', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.95)).toBe(5);
    expect(percentile([], 0.95)).toBeNull();
  });
  it('기본80/20·조회1초/변경2초·전체시간을 모두 확인한다', () =>
    expect(evaluateSamples(samples(), phase, 1000).passed).toBe(true));
  it('짧은 smoke/빠진 요청은 원래 duration 통과가 아니다', () => {
    expect(evaluateSamples(samples(), phase, 999).passed).toBe(false);
    expect(evaluateSamples(samples().slice(1), phase, 1000).passed).toBe(false);
  });
  it('기술 오류 예산은 정보/중복/오판 허용량이 아니다', () => {
    const rows = samples();
    rows[0]!.accuracy = false;
    expect(evaluateSamples(rows, phase, 1000).passed).toBe(false);
  });
  it('조회 p95·변경 p95·4MiB 초과를 숨기지 않는다', () => {
    for (const change of [{ milliseconds: 3000 }, { bytes: 4 * 1024 * 1024 + 1 }]) {
      const rows = samples().map((row) => ({ ...row, ...change }));
      expect(evaluateSamples(rows, phase, 1000).passed).toBe(false);
    }
  });
  it('정상0.1%와 집중 구간 공개를 구분하며 집중도 정확성0을 유지한다', () => {
    const rows = samples();
    rows[0]!.status = 503;
    expect(evaluateSamples(rows, phase, 1000).passed).toBe(false);
    expect(evaluateSamples(rows, { ...phase, name: 'PEAK' }, 1000).technicalFailures).toBe(1);
    expect(evaluateSamples(rows, { ...phase, name: 'PEAK' }, 1000).passed).toBe(true);
    rows[1]!.accuracy = false;
    expect(evaluateSamples(rows, { ...phase, name: 'PEAK' }, 1000).passed).toBe(false);
  });
  it('예정 속도보다10초 이상 늦어진 발생기와 유효 요청 오거절을 숨기지 않는다', () => {
    expect(evaluateSamples(samples(), phase, 11001).passed).toBe(false);
    const rows = samples();
    rows[0]!.status = 403;
    expect(evaluateSamples(rows, phase, 1000).technicalFailures).toBe(1);
  });
});
