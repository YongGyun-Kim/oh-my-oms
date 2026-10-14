import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, fingerprint } from '@oms/contracts';
import { ProtectedStore } from '@oms/persistence';
import {
  collectWorkerRecovery,
  validateWorkerRecoveryEvidence,
} from './worker-recovery-evidence.js';
import { runtimeSourceIdentity } from './runtime-source.js';
import { evaluationProvenance } from './measurement-provenance.js';
import { evaluateSamples, mandatoryPhases, type Sample } from './performance-statistics.js';
import { validatePerformance } from './report-validation.js';
export function requalifiedPerformance<T extends Record<string, unknown>>(
  original: T,
  worker: Awaited<ReturnType<typeof collectWorkerRecovery>>,
) {
  const candidate = {
    ...original,
    workerRecoveryVerified: worker.passed,
    workerRecoveryEvidenceDigest: fingerprint(worker),
    passed:
      worker.passed &&
      original.finished === true &&
      original.uiReadiness === true &&
      original.workFirstStart === true &&
      original.resourceObservations === true,
    reevaluatedAt: new Date().toISOString(),
    reevaluationReason:
      'ND-PERF-01 정상 첫 처리10초와5분내회복·10분유지 경계 정합성 보정. 전체 회복 분포와 원본 전수대조 유지.',
  };
  validatePerformance(candidate as never);
  if (original.runId !== worker.runId || original.sourceDigest !== worker.sourceDigest)
    throw new Error('다른 측정 실행/원본 source를 재평가할 수 없습니다.');
  return candidate;
}
export function verifyRawPhaseStatistics(
  raw: readonly (Sample & { observedAt: string })[],
  starts: readonly { phase: string; from: string }[],
  original: { phases: ReturnType<typeof evaluateSamples>[] },
) {
  if (raw.length !== 84000 || starts.length !== 4 || original.phases.length !== 4)
    throw new Error('동일84k전체phase원문이필요합니다.');
  const results = mandatoryPhases.map((phase, index) => {
    const start = starts[index]!;
    if (start.phase !== phase.name || !Number.isFinite(Date.parse(start.from)))
      throw new Error('phase 시작 근거가 다릅니다.');
    const end = starts[index + 1]?.from ?? '9999-01-01T00:00:00Z';
    const samples = raw.filter((row) => row.observedAt >= start.from && row.observedAt < end);
    const result = evaluateSamples(samples, phase, original.phases[index]!.elapsedMilliseconds);
    if (canonicalJson(result) !== canonicalJson(original.phases[index]))
      throw new Error('84k원문과원래HTTP판정이다릅니다.');
    return result;
  });
  return results;
}
async function main() {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
  )
    throw new Error('명시적 로컬 합성 자료의 재평가만 허용합니다.');
  const base = '.reports/u1/recovery-window-original-performance/';
  const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
  const qualification = json(base + 'qualification.json') as {
    files: { path: string; sha256: string }[];
  };
  for (const row of qualification.files) {
    if (
      !/^[\w.-]+$/.test(row.path) ||
      createHash('sha256')
        .update(readFileSync(base + row.path))
        .digest('hex') !== row.sha256
    )
      throw new Error('보존한 원래 측정 자료가 변경됐습니다.');
  }
  const source = json(base + 'performance-source.json');
  const original = json(base + 'performance.json');
  const current = runtimeSourceIdentity();
  const provenance = evaluationProvenance(source.sourceIdentity, current);
  const freeze = json(base + 'root-source-freeze.json');
  for (const [path, digest] of Object.entries(freeze.sourceAndConfiguration)) {
    if (path in source.sourceIdentity) continue;
    if (digest === null) {
      if (existsSync(path)) throw new Error('측정 당시 삭제된 source가 다시 생성됐습니다.');
      continue;
    }
    if (createHash('sha256').update(readFileSync(path)).digest('hex') !== digest)
      throw new Error('측정 당시 root설정/lock/문서 source가 변경됐습니다.');
  }
  for (const name of [
    'performance-samples.jsonl',
    'performance-ack.jsonl',
    'worker-first-start.jsonl',
    'worker-consume.jsonl',
  ]) {
    const archived = qualification.files.find((row) => row.path === name);
    if (
      !archived ||
      createHash('sha256')
        .update(readFileSync('.reports/u1/' + name))
        .digest('hex') !== archived.sha256
    )
      throw new Error('현재 원문이 측정 당시 자료와 다릅니다.');
  }
  const rawPath = base + 'performance-samples.jsonl';
  if (statSync(rawPath).size > 64 * 1024 * 1024) throw new Error('원문 유한 범위를 초과했습니다.');
  const raw = readFileSync(rawPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      if (Buffer.byteLength(line) > 4096) throw new Error('원문 행 크기 초과');
      return JSON.parse(line);
    });
  const starts = readFileSync(base + 'current-final-performance.log', 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .filter((row) => row.event === 'phase-start')
    .map((row) => ({ phase: row.phase, from: row.at }));
  verifyRawPhaseStatistics(raw, starts, original);
  const { localSources } = await import('../../tests/u1/fixtures/databases.js');
  const sources = localSources();
  await sources.primaryApp.initialize();
  await sources.journalAppend.initialize();
  try {
    const phases = json(base + 'worker-recovery-profile.json').phases.map(
      (phase: { phase: string; from: string; to: string }) => ({
        phase: phase.phase,
        from: phase.from,
        to: phase.to,
      }),
    );
    const worker = await collectWorkerRecovery(
      new ProtectedStore(sources.primaryApp, sources.journalAppend),
      phases,
      { ...source, evaluationSourceIdentity: current },
    );
    const candidate = requalifiedPerformance(original, worker);
    validateWorkerRecoveryEvidence(worker, source, candidate as never, current, worker.ackSha256);
    writeFileSync(
      '.reports/u1/performance-evaluation-source.json',
      JSON.stringify(
        {
          measuredCapturedAt: source.capturedAt,
          measuredRunId: source.runId,
          evaluatedAt: new Date().toISOString(),
          provenance,
          evaluationSourceIdentity: current,
          archive: base,
          runtimeChanged: false,
          raw84kStatisticsRecomputed: true,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    writeFileSync('.reports/u1/performance.json', JSON.stringify(candidate, null, 2), {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        passed: candidate.passed,
        measuredRunId: source.runId,
        provenance,
        phases: worker.phases.map(
          ({ phase, eligibleWork, p95Milliseconds, recoveryConfirmedBy }) => ({
            phase,
            eligibleWork,
            p95Milliseconds,
            recoveryConfirmedBy,
          }),
        ),
      }),
    );
  } finally {
    await sources.primaryApp.destroy();
    await sources.journalAppend.destroy();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
