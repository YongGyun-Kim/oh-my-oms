import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { canonicalJson, fingerprint } from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';
import { percentile } from './performance-statistics.js';
import { runtimeSourceDigest, runtimeSourceIdentity } from './runtime-source.js';
import { evaluationProvenance, validateEvaluationProvenance } from './measurement-provenance.js';
export interface WorkRecoveryRow {
  workId: string;
  requestId: string;
  correlationHash: string;
  state: string;
  acknowledged: boolean;
  notBefore: string;
  deadlineAt: string;
  start: { observedAt: string; delayMilliseconds: number } | null;
}
export interface WorkRecoveryPhase {
  phase: string;
  from: string;
  to: string;
}
// Recovery has an approved five-minute grace period. Its complete first-start
// distribution remains visible; normal latency must be regained before the end
// and then held for the following ten minutes. No missing original is omitted.
export function workerRecoveryWindows(phase: WorkRecoveryPhase, rows: readonly WorkRecoveryRow[]) {
  const from = Date.parse(phase.from);
  const duration = Date.parse(phase.to) - from;
  const windowCount = Math.floor(duration / 60000);
  if (!Number.isFinite(duration) || duration <= 0 || windowCount > 60) return [];
  return Array.from({ length: windowCount }, (_, index) => {
    const lower = from + index * 60000;
    const upper = Math.min(from + duration, lower + 60000);
    const originals = rows.filter((row) => {
      const due = Date.parse(row.notBefore);
      return due >= lower && due < upper;
    });
    const p95 = percentile(
      originals.flatMap((row) => (row.start ? [row.start.delayMilliseconds] : [])),
      0.95,
    );
    return {
      from: new Date(lower).toISOString(),
      to: new Date(upper).toISOString(),
      eligibleWork: originals.length,
      startedWork: originals.filter((row) => row.start !== null).length,
      p95Milliseconds: p95,
      normalLatency:
        originals.length > 0 &&
        originals.every((row) => row.start !== null) &&
        p95 !== null &&
        p95 <= 10000,
    };
  });
}
export function evaluateWorkerRecovery(
  phase: WorkRecoveryPhase,
  rows: readonly WorkRecoveryRow[],
  missingWork: number,
) {
  const eligible = rows.filter((row) => Date.parse(row.notBefore) <= Date.parse(phase.to));
  const invalid = eligible.filter(
    (row) =>
      !row.workId ||
      !row.requestId ||
      typeof row.acknowledged !== 'boolean' ||
      !/^[a-f0-9]{64}$/.test(row.correlationHash) ||
      !Number.isFinite(Date.parse(row.notBefore)) ||
      !Number.isFinite(Date.parse(row.deadlineAt)) ||
      Date.parse(row.deadlineAt) <= Date.parse(row.notBefore) ||
      (row.start &&
        (!Number.isFinite(row.start.delayMilliseconds) ||
          row.start.delayMilliseconds < 0 ||
          !Number.isFinite(Date.parse(row.start.observedAt)) ||
          Date.parse(row.start.observedAt) < Date.parse(row.notBefore) ||
          Date.parse(row.start.observedAt) >= Date.parse(row.deadlineAt))),
  );
  const starts = eligible.filter((row) => row.start !== null);
  const terminal = eligible.filter((row) => row.state === 'RESULT_RECORDED');
  const acknowledged = eligible.filter((row) => row.acknowledged === true);
  const stalled = eligible.filter(
    (row) => !row.start || row.state !== 'RESULT_RECORDED' || !row.acknowledged,
  );
  const p95 = percentile(
    starts.map((row) => row.start!.delayMilliseconds),
    0.95,
  );
  const windows = workerRecoveryWindows(phase, eligible);
  const restoredIndex = windows.findIndex(
    (window, index) =>
      window.normalLatency && windows.slice(index).every((later) => later.normalLatency),
  );
  const recoveryConfirmedBy = restoredIndex < 0 ? null : windows[restoredIndex]!.to;
  const latencyPassed =
    phase.phase === 'RECOVERY'
      ? recoveryConfirmedBy !== null &&
        Date.parse(recoveryConfirmedBy) - Date.parse(phase.from) <= 300000 &&
        windows.at(-1)?.normalLatency === true
      : p95 !== null && p95 <= 10000;
  return {
    ...phase,
    recoveryWindows: windows,
    recoveryConfirmedBy,
    latencyPassed,
    passed:
      ['NORMAL', 'RECOVERY', 'HOLD'].includes(phase.phase) &&
      Number.isFinite(Date.parse(phase.from)) &&
      Date.parse(phase.to) > Date.parse(phase.from) &&
      eligible.length > 0 &&
      missingWork === 0 &&
      invalid.length === 0 &&
      stalled.length === 0 &&
      latencyPassed,
    eligibleWork: eligible.length,
    startedWork: starts.length,
    terminalWork: terminal.length,
    acknowledgedWork: acknowledged.length,
    unacknowledgedWork: eligible.length - acknowledged.length,
    stalledWork: stalled.length,
    missingWork,
    invalidWork: invalid.length,
    p95Milliseconds: p95,
    workManifestDigest: fingerprint(rows),
    originalSamples: eligible.slice(0, 64),
    stalledSamples: stalled.slice(0, 64),
    workStates: Object.fromEntries(
      ['PENDING', 'PROCESSING', 'RESULT_RECORDED', 'REVIEW_REQUIRED', 'TECHNICAL_FAILED'].map(
        (state) => [state, eligible.filter((row) => row.state === state).length],
      ),
    ),
  };
}
async function records(path: string, visit: (record: Record<string, unknown>) => void) {
  if (statSync(path).size > 64 * 1024 * 1024) throw new Error('측정 metadata 파일 범위 초과');
  const input = createReadStream(path, { highWaterMark: 65536 });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  try {
    for await (const line of lines) {
      if (++count > 100000 || Buffer.byteLength(line) > 4096)
        throw new Error('측정 metadata의 유한 범위 초과');
      visit(JSON.parse(line));
    }
  } finally {
    lines.close();
    input.destroy();
  }
}
export async function collectWorkerRecovery(
  store: ProtectedStore,
  phases: readonly WorkRecoveryPhase[],
  source: {
    runId: string;
    profileId: string;
    sourceIdentity: Record<string, string>;
    evaluationSourceIdentity?: Record<string, string>;
  },
  paths = {
    acks: '.reports/u1/performance-ack.jsonl',
    starts: '.reports/u1/worker-first-start.jsonl',
    consumes: '.reports/u1/worker-consume.jsonl',
    report: '.reports/u1/worker-recovery-profile.json',
  },
) {
  const acks: { requestId: string; correlationId: string; observedAt: string }[] = [];
  await records(paths.acks, (value) => {
    // Staff product registration does not create a notification Work.
    if (value.owner === 'OrderAcceptance') acks.push(value as (typeof acks)[number]);
  });
  const startByCorrelation = new Map<string, { observedAt: string; delayMilliseconds: number }>();
  await records(paths.starts, (value) => {
    if (value.operation === 'NotificationDelivery.firstProcessing' && value.outcome === 'SUCCESS') {
      const hash = String(value.correlationHash);
      const current = startByCorrelation.get(hash);
      if (!current || String(value.observedAt) < current.observedAt)
        startByCorrelation.set(hash, {
          observedAt: String(value.observedAt),
          delayMilliseconds: Number(value.delayMilliseconds),
        });
    }
  });
  const results = [];
  const completedByCorrelation = new Set<string>();
  await records(paths.consumes, (value) => {
    if (value.operation === 'NotificationDelivery.consume' && value.outcome === 'SUCCESS')
      completedByCorrelation.add(String(value.correlationHash));
  });
  for (const phase of phases) {
    const rows: WorkRecoveryRow[] = [];
    let missingWork = 0;
    for (const ack of acks.filter(
      (value) => value.observedAt >= phase.from && value.observedAt <= phase.to,
    )) {
      const work = await store.list('WorkItem', {
        equals: { owner: 'NotificationDelivery', requestId: ack.requestId },
        limit: 25,
      });
      // The registered minimum in-app path creates one original Work per order.
      // Ambiguous/missing originals are not a successful timing sample.
      if (
        work.length !== 1 ||
        work[0]!.requestId !== ack.requestId ||
        work[0]!.correlationId !== ack.correlationId ||
        work[0]!.owner !== 'NotificationDelivery'
      ) {
        missingWork++;
        continue;
      }
      const original = work[0]!;
      const hash = createHash('sha256').update(ack.correlationId).digest('hex');
      const start = startByCorrelation.get(hash) ?? null;
      rows.push({
        workId: String(original.workId),
        requestId: String(original.requestId),
        correlationHash: hash,
        state: String(original.state),
        acknowledged: completedByCorrelation.has(hash),
        notBefore: String(original.notBefore),
        deadlineAt: String(original.deadlineAt),
        start,
      });
    }
    results.push(evaluateWorkerRecovery(phase, rows, missingWork));
  }
  const report = {
    passed: results.length === 3 && results.every((result) => result.passed),
    runId: source.runId,
    profileId: source.profileId,
    sourceDigest: runtimeSourceDigest(source.sourceIdentity),
    evaluationSourceIdentity: source.evaluationSourceIdentity ?? source.sourceIdentity,
    evaluationProvenance: evaluationProvenance(
      source.sourceIdentity,
      source.evaluationSourceIdentity ?? source.sourceIdentity,
    ),
    ackSha256: ackFileDigest(paths.acks),
    phases: results,
    primaryTechnicalBacklogNotAck: await store.primary.query(
      `SELECT state,count(*)::integer AS count,count(*) FILTER(WHERE "notBefore"<=now() AND "deadlineAt">now())::integer AS currently_due_before_deadline FROM u1_work_item WHERE owner='NotificationDelivery' GROUP BY state ORDER BY state`,
    ),
    observedAt: new Date().toISOString(),
    actualSqsRecoveryVerified: false,
    scope:
      '로컬 보호된 신규 주문 Work의 원래ID·due/deadline·첫 보호처리·종료 전수 대조; 과거 business REVIEW_REQUIRED 제외',
  };
  writeFileSync(paths.report, JSON.stringify(report, null, 2), { mode: 0o600 });
  return report;
}
export function validateWorkerRecoveryEvidence(
  report: ReturnType<typeof collectWorkerRecovery> extends Promise<infer T> ? T : never,
  source: { runId: string; profileId: string; sourceIdentity: Record<string, string> },
  performance: {
    runId: string;
    sourceDigest: string;
    workerRecoveryEvidenceDigest: string;
    workerRecoveryVerified: boolean;
  },
  currentIdentity: Record<string, string>,
  actualAckSha256: string,
) {
  if (
    report.passed !== true ||
    performance.workerRecoveryVerified !== true ||
    report.runId !== source.runId ||
    performance.runId !== source.runId ||
    report.profileId !== source.profileId ||
    canonicalJson(report.evaluationSourceIdentity) !== canonicalJson(currentIdentity) ||
    report.sourceDigest !== runtimeSourceDigest(source.sourceIdentity) ||
    report.sourceDigest !== performance.sourceDigest ||
    report.ackSha256 !== actualAckSha256 ||
    performance.workerRecoveryEvidenceDigest !== fingerprint(report) ||
    !Array.isArray(report.phases) ||
    report.phases.length !== 3
  )
    throw new Error(
      '누락·실패·stale worker 회복 증거는 전체 완료/큰 복구 접수에 사용할 수 없습니다.',
    );
  validateEvaluationProvenance(source.sourceIdentity, currentIdentity, report.evaluationProvenance);
  for (const [index, phase] of report.phases.entries()) {
    if (
      phase.phase !== ['NORMAL', 'RECOVERY', 'HOLD'][index] ||
      phase.passed !== true ||
      !Number.isInteger(phase.eligibleWork) ||
      phase.eligibleWork < 1 ||
      phase.startedWork !== phase.eligibleWork ||
      phase.terminalWork !== phase.eligibleWork ||
      phase.acknowledgedWork !== phase.eligibleWork ||
      phase.unacknowledgedWork !== 0 ||
      phase.stalledWork !== 0 ||
      phase.missingWork !== 0 ||
      phase.invalidWork !== 0 ||
      !Number.isFinite(phase.p95Milliseconds) ||
      phase.p95Milliseconds! < 0 ||
      (phase.phase !== 'RECOVERY' && phase.p95Milliseconds! > 10000) ||
      phase.latencyPassed !== true ||
      (phase.phase === 'RECOVERY' &&
        (!phase.recoveryConfirmedBy ||
          Date.parse(phase.recoveryConfirmedBy) - Date.parse(phase.from) > 300000 ||
          phase.recoveryWindows.at(-1)?.normalLatency !== true))
    )
      throw new Error('현재 전체 phase의 worker 회복/원래 Work 증거가 필요합니다.');
  }
}
export function admitCurrentWorkerRecovery() {
  const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
  validateWorkerRecoveryEvidence(
    json('.reports/u1/worker-recovery-profile.json'),
    json('.reports/u1/performance-source.json'),
    json('.reports/u1/performance.json'),
    runtimeSourceIdentity(),
    ackFileDigest('.reports/u1/performance-ack.jsonl'),
  );
}
function ackFileDigest(path: string) {
  if (statSync(path).size > 64 * 1024 * 1024) throw new Error('독립 ACK 파일 범위 초과');
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
