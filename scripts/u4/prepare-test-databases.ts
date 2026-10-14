import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import {
  assertSyntheticPostgresContainers,
  parseSyntheticCredentials,
} from '../u2/prepare-test-databases.js';

export const U4_DATABASES = {
  primary: 'oms_u4_verification',
  journal: 'oms_u4_journal_verification',
} as const;
const FILE = '.runtime/u4/test-databases.env';
const REQUIRED = [
  'U4_PRIMARY_ADMIN_PASSWORD',
  'U4_JOURNAL_ADMIN_PASSWORD',
  'U4_APP_PASSWORD',
  'U4_JOURNAL_APPEND_PASSWORD',
  'U4_VAULT_PASSWORD',
];
export function u4SyntheticCredentials(text: string): Record<string, string> {
  const values = parseSyntheticCredentials(text);
  if (Object.keys(values).length !== REQUIRED.length || REQUIRED.some((key) => !values[key]))
    throw new Error('U4 합성 검증 자격의 정확한 필드가 필요합니다.');
  return values;
}
export async function prepareU4TestDatabases(): Promise<void> {
  assertSyntheticPostgresContainers();
  const parent = parseSyntheticCredentials(readFileSync('.runtime/u1/databases.env', 'utf8'));
  if (!parent.U1_PRIMARY_ADMIN_PASSWORD || !parent.U1_JOURNAL_ADMIN_PASSWORD)
    throw new Error('부모 로컬 합성 DB의 두 administrator 자격이 필요합니다.');
  mkdirSync('.runtime/u4', { recursive: true, mode: 0o700 });
  mkdirSync('.reports/u4', { recursive: true, mode: 0o700 });
  const credentials = existsSync(FILE)
    ? u4SyntheticCredentials(readFileSync(FILE, 'utf8'))
    : u4SyntheticCredentials(
        [
          'U4_PRIMARY_ADMIN_PASSWORD=' + parent.U1_PRIMARY_ADMIN_PASSWORD,
          'U4_JOURNAL_ADMIN_PASSWORD=' + parent.U1_JOURNAL_ADMIN_PASSWORD,
          'U4_APP_PASSWORD=' + randomBytes(32).toString('hex'),
          'U4_JOURNAL_APPEND_PASSWORD=' + randomBytes(32).toString('hex'),
          'U4_VAULT_PASSWORD=' + randomBytes(32).toString('hex'),
        ].join('\n'),
      );
  if (!existsSync(FILE))
    writeFileSync(
      FILE,
      Object.entries(credentials)
        .map(([key, value]) => key + '=' + value)
        .join('\n') + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  for (const [kind, port, admin, base, target, roles] of [
    [
      'PRIMARY',
      15432,
      'u1_primary_admin',
      'oms_u1',
      U4_DATABASES.primary,
      [['u4_verify_app', 'U4_APP_PASSWORD']],
    ],
    [
      'JOURNAL',
      25432,
      'u1_journal_admin',
      'oms_u1_journal',
      U4_DATABASES.journal,
      [
        ['u4_verify_journal_append', 'U4_JOURNAL_APPEND_PASSWORD'],
        ['u4_verify_vault', 'U4_VAULT_PASSWORD'],
      ],
    ],
  ] as const) {
    const client = new Client({
      host: '127.0.0.1',
      port,
      user: admin,
      database: base,
      password: credentials['U4_' + kind + '_ADMIN_PASSWORD'],
      connectionTimeoutMillis: 2000,
    });
    await client.connect();
    try {
      const current = await client.query(
        'SELECT current_database() AS name, inet_server_port() AS port',
      );
      if (current.rows[0]?.name !== base || current.rows[0]?.port !== 5432)
        throw new Error('등록된 로컬 합성 PostgreSQL 원본만 준비에 사용합니다.');
      for (const [name, key] of roles) {
        const existing = await client.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [
          name,
        ]);
        if (!existing.rows.length) {
          const ddl = await client.query(
            "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L',$1::text,$2::text) AS sql",
            [name, credentials[key]],
          );
          await client.query(ddl.rows[0].sql);
        }
      }
      const existing = await client.query('SELECT datname FROM pg_database WHERE datname=$1', [
        target,
      ]);
      if (!existing.rows.length) {
        const ddl = await client.query(
          "SELECT format('CREATE DATABASE %I OWNER %I',$1::text,$2::text) AS sql",
          [target, admin],
        );
        await client.query(ddl.rows[0].sql);
      }
    } finally {
      await client.end();
    }
  }
  console.log('별도 U4 합성 검증 DB 준비 완료; 기존 소유자의 DB는 초기화하지 않았습니다.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await prepareU4TestDatabases();
