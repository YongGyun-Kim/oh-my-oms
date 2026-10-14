import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export async function prepareTestDatabases(): Promise<void> {
  const file = '.runtime/u1/test-databases.env';
  const entries = (text: string) =>
    Object.fromEntries(
      text
        .trim()
        .split('\n')
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  const primary = entries(readFileSync('.runtime/u1/databases.env', 'utf8'));
  const secret = existsSync(file)
    ? entries(readFileSync(file, 'utf8'))
    : {
        U1_PRIMARY_ADMIN_PASSWORD: primary.U1_PRIMARY_ADMIN_PASSWORD!,
        U1_JOURNAL_ADMIN_PASSWORD: primary.U1_JOURNAL_ADMIN_PASSWORD!,
        U1_APP_PASSWORD: randomBytes(32).toString('hex'),
        U1_JOURNAL_APPEND_PASSWORD: randomBytes(32).toString('hex'),
        U1_DIAGNOSTIC_PASSWORD: randomBytes(32).toString('hex'),
      };
  if (!existsSync(file))
    writeFileSync(
      file,
      Object.entries(secret)
        .map(([key, value]) => key + '=' + value)
        .join('\n') + '\n',
      { mode: 0o600, flag: 'wx' },
    );
  for (const [kind, port, database, admin] of [
    ['PRIMARY', 15432, 'oms_u1_verification', 'u1_primary_admin'],
    ['JOURNAL', 25432, 'oms_u1_journal_verification', 'u1_journal_admin'],
  ] as const) {
    const client = new Client({
      host: '127.0.0.1',
      port,
      user: admin,
      password: primary['U1_' + kind + '_ADMIN_PASSWORD'],
      database: kind === 'PRIMARY' ? 'oms_u1' : 'oms_u1_journal',
      connectionTimeoutMillis: 2000,
    });
    await client.connect();
    try {
      for (const [name, parent, key] of kind === 'PRIMARY'
        ? [
            ['u1_verify_app', 'u1_app', 'U1_APP_PASSWORD'],
            ['u1_verify_diagnostic_reader', 'u1_diagnostic_reader', 'U1_DIAGNOSTIC_PASSWORD'],
          ]
        : [['u1_verify_journal_append', 'u1_journal_append', 'U1_JOURNAL_APPEND_PASSWORD']]) {
        const result = await client.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [name]);
        if (!result.rows.length) {
          const command = await client.query(
            "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L IN ROLE %I',$1::text,$2::text,$3::text) AS command",
            [name, secret[key!], parent],
          );
          await client.query(command.rows[0].command);
        }
      }
      for (const target of [database, database.replace('verification', 'e2e')]) {
        const exists = await client.query('SELECT datname FROM pg_database WHERE datname=$1', [
          target,
        ]);
        if (!exists.rows.length) {
          const command = await client.query(
            "SELECT format('CREATE DATABASE %I OWNER %I',$1::text,$2::text) AS command",
            [target, admin],
          );
          await client.query(command.rows[0].command);
        }
      }
    } finally {
      await client.end();
    }
  }
  console.log('별도 로컬 U1 검증 DB 준비: 보존 성능/ACK 원본 DB는 초기화하지 않습니다.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await prepareTestDatabases();
