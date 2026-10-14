import { localSources, databaseCredentials } from './databases.js';
import { migrateMaterialModels } from '../../../packages/persistence/src/migration.js';
import { migrateRecovery } from '../../../packages/persistence/src/recovery-migration.js';
import { migrateDiagnosticView, migrateReadIndexes } from '@oms/persistence';
import type { DataSource } from 'typeorm';

async function createRole(source: DataSource, name: string, password?: string): Promise<void> {
  const exists = (await source.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [name])) as {
    rolname: string;
  }[];
  if (!exists.length) {
    const command = (await source.query(
      password
        ? "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS command"
        : "SELECT format('CREATE ROLE %I NOLOGIN', $1::text) AS command",
      password ? [name, password] : [name],
    )) as { command: string }[];
    await source.query(command[0]!.command);
  }
}
export async function initializeDatabases(): Promise<void> {
  const sources = localSources();
  const secret = databaseCredentials();
  await sources.primaryAdmin.initialize();
  await sources.journalAdmin.initialize();
  try {
    for (const source of [sources.primaryAdmin, sources.journalAdmin]) {
      await source.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await createRole(source, 'u1_owner');
      await source.query('GRANT USAGE,CREATE ON SCHEMA public TO u1_owner');
    }
    await createRole(sources.primaryAdmin, 'u1_app', secret.U1_APP_PASSWORD);
    await createRole(sources.primaryAdmin, 'u1_diagnostic_reader', secret.U1_DIAGNOSTIC_PASSWORD);
    await createRole(sources.journalAdmin, 'u1_journal_append', secret.U1_JOURNAL_APPEND_PASSWORD);
    // Earlier local, unreleased U1 fixtures lacked callback tokens. Preserve rows while fencing their callbacks.
    const existingAttempts = (await sources.primaryAdmin.query(
      "SELECT to_regclass('u1_external_attempt') AS name",
    )) as { name: string | null }[];
    if (existingAttempts[0]?.name) {
      await sources.primaryAdmin
        .query(`ALTER TABLE u1_external_attempt ADD COLUMN IF NOT EXISTS "attemptToken" varchar(128);
        ALTER TABLE u1_external_attempt ADD COLUMN IF NOT EXISTS epoch varchar(128);
        ALTER TABLE u1_external_attempt ADD COLUMN IF NOT EXISTS "attemptDeadlineAt" timestamptz;
        UPDATE u1_external_attempt a SET "attemptToken"=COALESCE("attemptToken",gen_random_uuid()::text),epoch=COALESCE(a.epoch,w.epoch),"attemptDeadlineAt"=COALESCE("attemptDeadlineAt",LEAST(a."deadlineAt",a."firstAttemptAt"+interval '30 seconds')) FROM u1_work_item w WHERE a."workIdKey"=w."workId";
        ALTER TABLE u1_endpoint_circuit ADD COLUMN IF NOT EXISTS "probeGeneration" bigint NOT NULL DEFAULT 1;
        ALTER TABLE u1_endpoint_circuit ALTER COLUMN "probeGeneration" DROP DEFAULT;`);
    }
    await migrateMaterialModels(sources.primaryAdmin);
    await sources.primaryAdmin.query('GRANT USAGE ON SCHEMA public TO u1_app');
    await sources.primaryAdmin.query(
      'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO u1_app',
    );
    await sources.journalAdmin.query('GRANT USAGE ON SCHEMA public TO u1_journal_append');
    await migrateRecovery(sources.primaryAdmin, sources.journalAdmin);
    await migrateReadIndexes(sources.primaryAdmin);
    await migrateDiagnosticView(sources.primaryAdmin);
    await sources.primaryAdmin.query(
      'GRANT USAGE ON SCHEMA public TO u1_diagnostic_reader; GRANT SELECT ON u1_diagnostic_metadata TO u1_diagnostic_reader',
    );
  } finally {
    await sources.primaryAdmin.destroy();
    await sources.journalAdmin.destroy();
  }
}
if (process.argv[1]?.endsWith('/migrate.ts')) await initializeDatabases();
