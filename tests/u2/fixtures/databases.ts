import { readFileSync } from 'node:fs';
import {
  createDataSource,
  materialSchemas,
  migrateMaterialModels,
  migrateRecovery,
  migrateReadIndexes,
  migrateU2Models,
  migratePurposeVault,
  ALL_MODELS,
  tableName,
} from '@oms/persistence';
import { parseSyntheticCredentials } from '../../../scripts/u2/prepare-test-databases.js';

export function u2DatabaseProfile(
  value = process.env.OMS_U2_DATABASE_PROFILE,
): 'verification' | 'e2e' {
  if (value === 'verification-isolated') return 'verification';
  if (value === 'e2e-isolated') return 'e2e';
  throw new Error('명시적인 격리 U2 합성 DB profile이 필요합니다.');
}
export function u2Sources(role: 'api' | 'worker' = 'api') {
  const suffix = u2DatabaseProfile();
  const c = parseSyntheticCredentials(readFileSync('.runtime/u2/test-databases.env', 'utf8'));
  const primary = 'oms_u2_' + suffix;
  const journal = 'oms_u2_journal_' + suffix;
  const source = (user: string, password: string, port: number, db: string, model = false) =>
    createDataSource(
      {
        url:
          'postgresql://' +
          user +
          ':' +
          encodeURIComponent(password) +
          '@127.0.0.1:' +
          port +
          '/' +
          db,
        applicationName: 'u2-synthetic-verification',
        localSynthetic: true,
        role: user.endsWith('admin')
          ? 'administrative'
          : port === 25432
            ? role === 'worker'
              ? 'worker-protection'
              : 'api-protection'
            : role === 'worker'
              ? 'worker-primary'
              : 'api-primary',
        protectionMaterial:
          user === 'u2_verify_vault'
            ? 'vault'
            : user === 'u2_verify_journal_append'
              ? 'append'
              : undefined,
      },
      model ? materialSchemas() : [],
    );
  return {
    primaryAdmin: source('u1_primary_admin', c.U2_PRIMARY_ADMIN_PASSWORD!, 15432, primary, true),
    journalAdmin: source('u1_journal_admin', c.U2_JOURNAL_ADMIN_PASSWORD!, 25432, journal),
    primaryApp: source('u2_verify_app', c.U2_APP_PASSWORD!, 15432, primary, true),
    journalAppend: source(
      'u2_verify_journal_append',
      c.U2_JOURNAL_APPEND_PASSWORD!,
      25432,
      journal,
    ),
    vault: source('u2_verify_vault', c.U2_VAULT_PASSWORD!, 25432, journal),
  };
}
export async function initializeU2Databases(): Promise<void> {
  const sources = u2Sources();
  await sources.primaryAdmin.initialize();
  await sources.journalAdmin.initialize();
  try {
    // Only disposable U2 fixture namespaces are cleared before expanding
    // their in-progress schema. This is not a production migration/backfill
    // and never touches the preserved U1 verification databases/reports.
    const suffix = u2DatabaseProfile(),
      actual = await sources.primaryAdmin.query('SELECT current_database() AS name');
    if (actual[0]?.name !== 'oms_u2_' + suffix) throw new Error('다른 DB의 fixture 초기화 금지');
    const existing = await sources.primaryAdmin.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",
      [ALL_MODELS.map((model) => tableName(model.name))],
    );
    if (existing.length)
      await sources.primaryAdmin.query(
        'TRUNCATE ' +
          existing.map((row: { tablename: string }) => '"' + row.tablename + '"').join(',') +
          ' CASCADE',
      );
    for (const source of [sources.primaryAdmin, sources.journalAdmin]) {
      await source.query(
        'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE,CREATE ON SCHEMA public TO u1_owner',
      );
    }
    await migrateMaterialModels(sources.primaryAdmin);
    await migrateU2Models(sources.primaryAdmin);
    await migrateRecovery(sources.primaryAdmin, sources.journalAdmin);
    await migratePurposeVault(sources.journalAdmin);
    await migrateReadIndexes(sources.primaryAdmin);
    await sources.primaryAdmin.query(`GRANT USAGE ON SCHEMA public TO u2_verify_app;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO u2_verify_app;
      REVOKE ALL ON u1_recovery_control,u1_commit_counter,u1_recovery_candidate,u1_protected_prefix,u1_entity_version,u1_request_key,u1_epoch_sequence,u1_recovery_security_confirmation FROM u2_verify_app;
      GRANT SELECT ON u1_recovery_control,u1_epoch_sequence TO u2_verify_app;
      GRANT SELECT,UPDATE(commit_order,digest) ON u1_commit_counter TO u2_verify_app;
      GRANT SELECT,INSERT ON u1_recovery_candidate,u1_entity_version,u1_request_key TO u2_verify_app;
      GRANT SELECT,INSERT,UPDATE ON u1_protected_prefix TO u2_verify_app;`);
    await sources.journalAdmin.query(`GRANT USAGE ON SCHEMA public TO u2_verify_journal_append;
      GRANT EXECUTE ON FUNCTION u1_append_entry(varchar,bigint,text,varchar,varchar,text) TO u2_verify_journal_append;
      GRANT SELECT ON u1_protected_entry,u1_journal_prefix,u1_journal_epoch TO u2_verify_journal_append;`);
  } finally {
    await sources.primaryAdmin.destroy();
    await sources.journalAdmin.destroy();
  }
}
