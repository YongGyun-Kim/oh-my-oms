import { readFileSync } from 'node:fs';
import { createDataSource, materialSchemas } from '@oms/persistence';

export function databaseCredentials(): Record<string, string> {
  const entries = readFileSync(
    ['verification-isolated', 'e2e-isolated'].includes(process.env.OMS_U1_DATABASE_PROFILE ?? '')
      ? '.runtime/u1/test-databases.env'
      : '.runtime/u1/databases.env',
    'utf8',
  )
    .trim()
    .split('\n')
    .map((line) => {
      const split = line.indexOf('=');
      return [line.slice(0, split), line.slice(split + 1)];
    });
  return Object.fromEntries(entries);
}
export function localSources() {
  const secret = databaseCredentials();
  const isolated = ['verification-isolated', 'e2e-isolated'].includes(
    process.env.OMS_U1_DATABASE_PROFILE ?? '',
  );
  const suffix = process.env.OMS_U1_DATABASE_PROFILE === 'e2e-isolated' ? 'e2e' : 'verification';
  const primaryDatabase = isolated ? 'oms_u1_' + suffix : 'oms_u1';
  const journalDatabase = isolated ? 'oms_u1_journal_' + suffix : 'oms_u1_journal';
  const appUser = isolated ? 'u1_verify_app' : 'u1_app';
  const appendUser = isolated ? 'u1_verify_journal_append' : 'u1_journal_append';
  const diagnosticUser = isolated ? 'u1_verify_diagnostic_reader' : 'u1_diagnostic_reader';
  const primaryUrl = `postgresql://u1_primary_admin:${secret.U1_PRIMARY_ADMIN_PASSWORD}@127.0.0.1:15432/${primaryDatabase}`;
  const journalUrl = `postgresql://u1_journal_admin:${secret.U1_JOURNAL_ADMIN_PASSWORD}@127.0.0.1:25432/${journalDatabase}`;
  return {
    primaryAdmin: createDataSource(
      { url: primaryUrl, applicationName: 'u1-test-ddl', localSynthetic: true },
      materialSchemas(),
    ),
    journalAdmin: createDataSource({
      url: journalUrl,
      applicationName: 'u1-test-journal-ddl',
      localSynthetic: true,
    }),
    primaryApp: createDataSource(
      {
        url: `postgresql://${appUser}:${secret.U1_APP_PASSWORD}@127.0.0.1:15432/${primaryDatabase}`,
        applicationName: 'u1-api',
        localSynthetic: true,
      },
      materialSchemas(),
    ),
    journalAppend: createDataSource({
      url: `postgresql://${appendUser}:${secret.U1_JOURNAL_APPEND_PASSWORD}@127.0.0.1:25432/${journalDatabase}`,
      applicationName: 'u1-journal-append',
      localSynthetic: true,
    }),
    diagnosticReader: createDataSource({
      url: `postgresql://${diagnosticUser}:${secret.U1_DIAGNOSTIC_PASSWORD}@127.0.0.1:15432/${primaryDatabase}`,
      applicationName: 'u1-read-only-diagnostic',
      localSynthetic: true,
    }),
  };
}
