import { describe, it, expect } from 'vitest';
import {
  requalifiedPerformance,
  verifyRawPhaseStatistics,
} from '../../../scripts/u1/requalify-performance.js';
import {
  mandatoryPhases,
  evaluateSamples,
  type Sample,
} from '../../../scripts/u1/performance-statistics.js';
const sourceDigest = 'a'.repeat(64);
const starts = mandatoryPhases.map((phase, index) => ({
  phase: phase.name,
  from: new Date(Date.UTC(2026, 9, 9, 0, index, 0)).toISOString(),
}));
const raw = mandatoryPhases.flatMap((phase, index) =>
  Array.from({ length: phase.rate * phase.seconds }, (_, number) => ({
    observedAt: starts[index]!.from,
    milliseconds: 1,
    kind: number % 5 === 0 ? 'WRITE' : 'READ',
    status: number % 5 === 0 ? 202 : 200,
    accuracy: true,
    bytes: 100,
  })),
) as (Sample & { observedAt: string })[];
const phases = mandatoryPhases.map((phase, index) =>
  evaluateSamples(
    raw.filter((r) => r.observedAt === starts[index]!.from),
    phase,
    phase.seconds * 1000,
  ),
);
const original = {
  runId: '실제원래측정ID',
  sourceDigest,
  finished: true,
  passed: false,
  workerRecoveryVerified: false,
  phases,
  uiReadiness: true,
  workFirstStart: true,
  resourceObservations: true,
  observedAt: '2026-10-09T01:00:00Z',
};
const worker = { passed: true, runId: original.runId, sourceDigest } as never;
describe('전체 원문과 원래 실행을 보존하는 측정기 재평가', () => {
  it('원래실행ID/source/관측시각은바꾸지않고재평가시각을따로남긴다', () => {
    const result = requalifiedPerformance(original, worker);
    expect(result.passed).toBe(true);
    expect(result.runId).toBe(original.runId);
    expect(result.observedAt).toBe(original.observedAt);
    expect(result.sourceDigest).toBe(sourceDigest);
    expect(result.reevaluatedAt).toBeTruthy();
    expect(original.passed).toBe(false);
  });
  it('미완료·화면·firststart·자원실패를worker값으로덮지않는다', () => {
    for (const key of ['finished', 'uiReadiness', 'workFirstStart', 'resourceObservations'])
      expect(() => requalifiedPerformance({ ...original, [key]: false }, worker)).toThrow(
        '전체50분',
      );
  });
  it('다른run/source와worker실패는거절한다', () => {
    for (const change of [
      { runId: '다른실행' },
      { sourceDigest: 'b'.repeat(64) },
      { passed: false },
    ])
      expect(() =>
        requalifiedPerformance(original, { ...(worker as object), ...change } as never),
      ).toThrow();
  });
  it('accuracy실패나HTTPphase실패를새통과로바꾸지않는다', () => {
    for (const change of [{ accuracyFailures: 1 }, { passed: false }])
      expect(() =>
        requalifiedPerformance(
          { ...original, phases: phases.map((p, i) => (i === 2 ? { ...p, ...change } : p)) },
          worker,
        ),
      ).toThrow('기준');
  });
  it('전체84k각phase의원문통계를독립재계산한다', () => {
    expect(verifyRawPhaseStatistics(raw, starts, { phases })).toEqual(phases);
  });
  it('부분표본·틀린시작순서·다른집계는거절한다', () => {
    expect(() => verifyRawPhaseStatistics(raw.slice(1), starts, { phases })).toThrow('전체phase');
    expect(() => verifyRawPhaseStatistics(raw, [...starts].reverse(), { phases })).toThrow('시작');
    expect(() =>
      verifyRawPhaseStatistics(raw, starts, {
        phases: phases.map((p, i) => (i === 0 ? { ...p, readP95: 2 } : p)),
      }),
    ).toThrow('원문');
  });
  it('뜻밖의redirect를정상표본으로바꾸거나phase밖표본을숨기지않는다', () => {
    expect(() =>
      verifyRawPhaseStatistics([{ ...raw[0]!, status: 302 }, ...raw.slice(1)], starts, { phases }),
    ).toThrow('원문');
    expect(() =>
      verifyRawPhaseStatistics(
        [{ ...raw[0]!, observedAt: '2026-10-08T00:00:00Z' }, ...raw.slice(1)],
        starts,
        { phases },
      ),
    ).toThrow('원문');
  });
});
