import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DataSource } from 'typeorm';
const execute = promisify(execFile);
export async function recoveryResources(primary: DataSource, journal: DataSource) {
  const database = async (source: DataSource) =>
    (
      await source.query(
        `SELECT pg_database_size(current_database())::text AS database_bytes,(SELECT COALESCE(sum(size),0)::text FROM pg_ls_waldir()) AS wal_bytes,pg_current_wal_lsn()::text AS wal_lsn`,
      )
    )[0] as { database_bytes: string; wal_bytes: string; wal_lsn: string };
  const found = await execute(
    'docker',
    [
      'ps',
      '--filter',
      'label=com.docker.compose.project=oms-u1',
      '--filter',
      'label=com.docker.compose.service=primary',
      '--format',
      '{{.ID}}',
    ],
    { timeout: 5000, maxBuffer: 65536 },
  );
  const id = found.stdout.trim();
  if (!/^[a-f0-9]{12,64}$/.test(id))
    throw new Error('복구 자원 관측의 U1 primary ID가 필요합니다.');
  const usage = await execute('docker', ['exec', id, 'df', '-Pk', '/var/lib/postgresql/data'], {
    timeout: 5000,
    maxBuffer: 65536,
  });
  const row = usage.stdout.trim().split('\n').at(-1)!.trim().split(/\s+/);
  const disk = {
    filesystem: row[0],
    sizeBytes: Number(row[1]) * 1024,
    usedBytes: Number(row[2]) * 1024,
    freeBytes: Number(row[3]) * 1024,
  };
  if (
    ![disk.sizeBytes, disk.usedBytes, disk.freeBytes].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  )
    throw new Error('복구 디스크 실제 관측 값이 없습니다.');
  return {
    observedAt: new Date().toISOString(),
    primary: await database(primary),
    journal: await database(journal),
    disk,
    parentRssBytes: process.memoryUsage().rss,
  };
}
