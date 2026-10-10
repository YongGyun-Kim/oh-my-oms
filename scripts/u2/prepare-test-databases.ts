import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseSyntheticCredentials(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.trim().split('\n')) {
    const at = line.indexOf('=');
    if (at <= 0 || !/^[A-Z0-9_]+$/.test(line.slice(0, at)))
      throw new Error('합성 검증 자격 형식을 확인해야 합니다.');
    result[line.slice(0, at)] = line.slice(at + 1);
  }
  return result;
}

export function assertSyntheticPostgresContainers(): void {
  for (const [name, service, port] of [
    ['oms-u1-primary-1', 'primary', '15432'],
    ['oms-u1-journal-1', 'journal', '25432'],
  ]) {
    const rows = JSON.parse(
      execFileSync('docker', ['inspect', name!], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }),
    ) as {
      Config: { Labels: Record<string, string> };
      NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[]> };
      State: { Running: boolean };
    }[];
    const row = rows[0];
    if (
      rows.length !== 1 ||
      !row?.State.Running ||
      row.Config.Labels['oms.data'] !== 'synthetic' ||
      row.Config.Labels['com.docker.compose.project'] !== 'oms-u1' ||
      row.Config.Labels['com.docker.compose.service'] !== service ||
      row.NetworkSettings.Ports['5432/tcp']?.length !== 1 ||
      row.NetworkSettings.Ports['5432/tcp']?.[0]?.HostIp !== '127.0.0.1' ||
      row.NetworkSettings.Ports['5432/tcp']?.[0]?.HostPort !== port
    )
      throw new Error('등록된 로컬 합성 PostgreSQL 두 인스턴스만 허용합니다.');
  }
}

export async function prepareU2TestDatabases(): Promise<void> {
  assertSyntheticPostgresContainers();
  const parent = parseSyntheticCredentials(readFileSync('.runtime/u1/databases.env', 'utf8'));
  mkdirSync('.runtime/u2', { recursive: true, mode: 0o700 });
  mkdirSync('.reports/u2', { recursive: true, mode: 0o700 });
  const file = '.runtime/u2/test-databases.env';
  const credentials = existsSync(file)
    ? parseSyntheticCredentials(readFileSync(file, 'utf8'))
    : {
        U2_PRIMARY_ADMIN_PASSWORD: parent.U1_PRIMARY_ADMIN_PASSWORD!,
        U2_JOURNAL_ADMIN_PASSWORD: parent.U1_JOURNAL_ADMIN_PASSWORD!,
        U2_APP_PASSWORD: randomBytes(32).toString('hex'),
        U2_JOURNAL_APPEND_PASSWORD: randomBytes(32).toString('hex'),
        U2_VAULT_PASSWORD: randomBytes(32).toString('hex'),
      };
  if (!existsSync(file))
    writeFileSync(
      file,
      Object.entries(credentials)
        .map(([key, value]) => key + '=' + value)
        .join('\n') + '\n',
      { mode: 0o600, flag: 'wx' },
    );
  for (const [kind, port, admin, database, roles] of [
    ['PRIMARY', 15432, 'u1_primary_admin', 'oms_u1', [['u2_verify_app', 'U2_APP_PASSWORD']]],
    [
      'JOURNAL',
      25432,
      'u1_journal_admin',
      'oms_u1_journal',
      [
        ['u2_verify_journal_append', 'U2_JOURNAL_APPEND_PASSWORD'],
        ['u2_verify_vault', 'U2_VAULT_PASSWORD'],
      ],
    ],
  ] as const) {
    const client = new Client({
      host: '127.0.0.1',
      port,
      user: admin,
      password: credentials['U2_' + kind + '_ADMIN_PASSWORD'],
      database,
      connectionTimeoutMillis: 2000,
    });
    await client.connect();
    try {
      for (const [name, key] of roles) {
        const existing = await client.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [
          name,
        ]);
        if (!existing.rows.length) {
          const command = await client.query(
            "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L',$1::text,$2::text) AS sql",
            [name, credentials[key]],
          );
          await client.query(command.rows[0].sql);
        }
      }
      for (const suffix of ['verification', 'e2e']) {
        const target = kind === 'PRIMARY' ? 'oms_u2_' + suffix : 'oms_u2_journal_' + suffix;
        const existing = await client.query('SELECT datname FROM pg_database WHERE datname=$1', [
          target,
        ]);
        if (!existing.rows.length) {
          const command = await client.query(
            "SELECT format('CREATE DATABASE %I OWNER %I',$1::text,$2::text) AS sql",
            [target, admin],
          );
          await client.query(command.rows[0].sql);
        }
      }
    } finally {
      await client.end();
    }
  }
  console.log('별도 U2 합성 검증 DB 준비 완료; U1 보존 DB는 초기화하지 않았습니다.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await prepareU2TestDatabases();
