import { readFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DataSource } from 'typeorm';
import { percentile } from './performance-statistics.js';
const execute = promisify(execFile);
export async function resourceObservation(
  primary: DataSource,
  journal: DataSource,
  ports = { execute, telemetryPath: '.reports/u1/telemetry-live.json' },
) {
  const db = async (source: DataSource) =>
    (
      await source.query(
        `SELECT count(*)::integer AS connections,count(*) FILTER(WHERE state='active')::integer AS active,count(*) FILTER(WHERE wait_event_type='Lock')::integer AS lock_waits FROM pg_stat_activity WHERE datname=current_database()`,
      )
    )[0];
  const backlog = (await primary.query(
    `SELECT state,count(*)::integer AS count FROM u1_work_item GROUP BY state ORDER BY state`,
  )) as { state: string; count: number }[];
  const web = [];
  for (const port of [3100, 3200]) {
    const found = await ports.execute('lsof', ['-nP', '-tiTCP:' + port, '-sTCP:LISTEN'], {
      timeout: 5000,
      maxBuffer: 65536,
    });
    const ids = found.stdout.trim().split(/\s+/);
    if (ids.some((id) => !/^\d+$/.test(id))) throw new Error('현재 BFF 프로세스 확인 실패');
    const result = await ports.execute('ps', ['-p', ids.join(','), '-o', 'pid=,rss=,%cpu='], {
      timeout: 5000,
      maxBuffer: 65536,
    });
    web.push({
      port,
      processes: result.stdout
        .trim()
        .split('\n')
        .map((line) => {
          const [pid, rss, cpu] = line.trim().split(/\s+/).map(Number);
          if (
            ![pid, rss, cpu].every((value) => Number.isFinite(value) && value! >= 0) ||
            !Number.isInteger(pid) ||
            pid! < 1 ||
            rss! < 1
          )
            throw new Error('실제 BFF 자원 값 확인 실패');
          return { pid, rssBytes: rss! * 1024, cpuPercent: cpu };
        }),
    });
  }
  const containers = await ports.execute(
    'docker',
    ['ps', '--filter', 'label=com.docker.compose.project=oms-u1', '--format', '{{json .}}'],
    { timeout: 5000, maxBuffer: 65536 },
  );
  const rows = containers.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { ID: string; Labels: string });
  const ids = rows
    .filter((row) => /com\.docker\.compose\.service=(primary|journal)(,|$)/.test(row.Labels))
    .map((row) => row.ID);
  if (ids.length !== 2) throw new Error('현재 두 PG 컨테이너 자원 근거 실패');
  const stats = await ports.execute(
    'docker',
    ['stats', '--no-stream', '--format', '{{json .}}', ...ids],
    { timeout: 5000, maxBuffer: 65536 },
  );
  const telemetry = JSON.parse(readFileSync(ports.telemetryPath, 'utf8'));
  if (
    !telemetry.process ||
    !Number.isFinite(telemetry.process.rss) ||
    telemetry.process.rss < 1 ||
    !telemetry.sdk
  )
    throw new Error('API/worker 관측 자원 근거 누락');
  return {
    observedAt: new Date().toISOString(),
    primary: await db(primary),
    journal: await db(journal),
    backlog,
    web,
    postgresContainers: stats.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    apiWorkerCombinedProcess: telemetry.process,
    telemetry: telemetry.sdk,
    queue: telemetry.queue ?? null,
    roleLayout:
      '로컬 API/worker 동일 측정 프로세스·BFF 두 별도 프로세스·두 PG 컨테이너; Fargate 4-role 용량 증거 아님',
  };
}
export async function firstStartEvidence(
  from: string,
  to: string,
  paths = {
    acks: '.reports/u1/performance-ack.jsonl',
    starts: '.reports/u1/worker-first-start.jsonl',
  },
) {
  const acks = new Map<string, { requestId: string; targetRef: unknown }>();
  const read = async (path: string, visit: (value: Record<string, unknown>) => void) => {
    const stream = createReadStream(path, { highWaterMark: 65536 });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) visit(JSON.parse(line));
    } finally {
      lines.close();
      stream.destroy();
    }
  };
  await read(paths.acks, (value) => {
    if (String(value.observedAt) >= from && String(value.observedAt) <= to) {
      if (acks.size >= 84000) throw new Error('유한 전체 profile ACK 범위 초과');
      acks.set(createHash('sha256').update(String(value.correlationId)).digest('hex'), {
        requestId: String(value.requestId),
        targetRef: value.targetRef,
      });
    }
  });
  const delays: number[] = [];
  const originalSamples: unknown[] = [];
  await read(paths.starts, (value) => {
    if (
      value.operation === 'NotificationDelivery.firstProcessing' &&
      value.outcome === 'SUCCESS' &&
      String(value.observedAt) >= from &&
      String(value.observedAt) <= to &&
      acks.has(String(value.correlationHash))
    ) {
      const delay = Number(value.delayMilliseconds);
      if (!Number.isFinite(delay) || delay < 0) throw new Error('원래 Work 시작 시간 근거 오류');
      delays.push(delay);
      if (originalSamples.length < 64)
        originalSamples.push({ ...acks.get(String(value.correlationHash)), ...value });
    }
  });
  const p95 = percentile(delays, 0.95);
  return {
    passed: delays.length > 0 && p95 !== null && p95 <= 10000,
    samples: delays.length,
    p95Milliseconds: p95,
    maximumMilliseconds: delays.length ? Math.max(...delays) : null,
    normalFrom: from,
    normalTo: to,
    originalSamples,
    eligibleToProtectedProcessing: true,
    heldHistoricalWorkExcluded: true,
  };
}
