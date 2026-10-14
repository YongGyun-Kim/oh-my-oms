import { readFileSync } from 'node:fs';
import {
  createDataSource,
  materialSchemas,
  migrateU3Models,
  migrateU2Models,
  migrateRecovery,
  migratePurposeVault,
  migrateReadIndexes,
  ALL_MODELS,
  tableName,
} from '@oms/persistence';
import type { DataSource } from 'typeorm';
import {
  U3_DATABASES,
  u3SyntheticCredentials,
} from '../../../scripts/u3/prepare-test-databases.js';
import { assertU3DatabaseProfile } from './profile.js';

export { assertU3DatabaseProfile } from './profile.js';
export function assertU3Endpoint(source: DataSource, kind: 'primary' | 'journal'): void {
  assertU3DatabaseProfile();
  if (source.options.type !== 'postgres' || !source.options.url)
    throw new Error('U3 합성 PostgreSQL만 허용합니다.');
  const url = new URL(source.options.url);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== (kind === 'primary' ? '15432' : '25432') ||
    url.pathname !== '/' + U3_DATABASES[kind] ||
    source.options.synchronize !== false
  )
    throw new Error('다른 DB 또는 자동 synchronize는 허용하지 않습니다.');
}
export function u3Sources(role: 'api' | 'worker' = 'api') {
  assertU3DatabaseProfile();
  const c = u3SyntheticCredentials(readFileSync('.runtime/u3/test-databases.env', 'utf8'));
  const source = (user: string, key: string, kind: 'primary' | 'journal', models = false) => {
    const db = createDataSource(
      {
        url:
          'postgresql://' +
          user +
          ':' +
          encodeURIComponent(c[key]!) +
          '@127.0.0.1:' +
          (kind === 'primary' ? '15432' : '25432') +
          '/' +
          U3_DATABASES[kind],
        applicationName: 'u3-synthetic-verification',
        localSynthetic: true,
        role: user.endsWith('admin')
          ? 'administrative'
          : kind === 'primary'
            ? role === 'api'
              ? 'api-primary'
              : 'worker-primary'
            : role === 'api'
              ? 'api-protection'
              : 'worker-protection',
        protectionMaterial:
          user === 'u3_verify_vault'
            ? 'vault'
            : user === 'u3_verify_journal_append'
              ? 'append'
              : undefined,
      },
      models ? materialSchemas() : [],
    );
    assertU3Endpoint(db, kind);
    return db;
  };
  return {
    primaryAdmin: source('u1_primary_admin', 'U3_PRIMARY_ADMIN_PASSWORD', 'primary', true),
    journalAdmin: source('u1_journal_admin', 'U3_JOURNAL_ADMIN_PASSWORD', 'journal'),
    primaryApp: source('u3_verify_app', 'U3_APP_PASSWORD', 'primary', true),
    journalAppend: source('u3_verify_journal_append', 'U3_JOURNAL_APPEND_PASSWORD', 'journal'),
    vault: source('u3_verify_vault', 'U3_VAULT_PASSWORD', 'journal'),
  };
}
export async function initializeU3Databases(): Promise<void> {
  const sources = u3Sources();
  await sources.primaryAdmin.initialize();
  await sources.journalAdmin.initialize();
  try {
    for (const [source, kind] of [
      [sources.primaryAdmin, 'primary'],
      [sources.journalAdmin, 'journal'],
    ] as const) {
      assertU3Endpoint(source, kind);
      const actual = await source.query('SELECT current_database() AS name');
      if (actual[0]?.name !== U3_DATABASES[kind]) throw new Error('다른 DB migration 금지');
      await source.query(
        'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE,CREATE ON SCHEMA public TO u1_owner',
      );
    }
    await migrateU3Models(sources.primaryAdmin);
    await migrateU2Models(sources.primaryAdmin);
    await migrateRecovery(sources.primaryAdmin, sources.journalAdmin);
    await migratePurposeVault(sources.journalAdmin);
    await migrateReadIndexes(sources.primaryAdmin);
    await sources.primaryAdmin.query(`GRANT USAGE ON SCHEMA public TO u3_verify_app;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO u3_verify_app;
      REVOKE ALL ON u1_recovery_control,u1_commit_counter,u1_recovery_candidate,u1_protected_prefix,u1_entity_version,u1_request_key,u1_epoch_sequence,u1_recovery_security_confirmation FROM u3_verify_app;
      GRANT SELECT ON u1_recovery_control,u1_epoch_sequence TO u3_verify_app;
      GRANT SELECT,UPDATE(commit_order,digest) ON u1_commit_counter TO u3_verify_app;
      GRANT SELECT,INSERT ON u1_recovery_candidate,u1_entity_version,u1_request_key TO u3_verify_app;
      GRANT SELECT,INSERT,UPDATE ON u1_protected_prefix TO u3_verify_app;`);
    await sources.journalAdmin.query(`GRANT USAGE ON SCHEMA public TO u3_verify_journal_append;
      GRANT EXECUTE ON FUNCTION u1_append_entry(varchar,bigint,text,varchar,varchar,text) TO u3_verify_journal_append;
      GRANT SELECT ON u1_protected_entry,u1_journal_prefix,u1_journal_epoch TO u3_verify_journal_append;`);
    await sources.journalAdmin.query(`REVOKE ALL ON SCHEMA u2_vault FROM u3_verify_journal_append;
      REVOKE ALL ON ALL TABLES IN SCHEMA u2_vault FROM u3_verify_journal_append;
      GRANT USAGE ON SCHEMA u2_vault TO u3_verify_vault;
      GRANT SELECT,UPDATE ON u2_vault.capacity TO u3_verify_vault;
      GRANT SELECT,INSERT,DELETE ON u2_vault.material TO u3_verify_vault;`);
  } finally {
    if (sources.primaryAdmin.isInitialized) await sources.primaryAdmin.destroy();
    if (sources.journalAdmin.isInitialized) await sources.journalAdmin.destroy();
  }
}
export async function resetU3Databases(primary: DataSource, journal: DataSource): Promise<void> {
  for (const [source, kind] of [
    [primary, 'primary'],
    [journal, 'journal'],
  ] as const) {
    assertU3Endpoint(source, kind);
    const actual = await source.query('SELECT current_database() AS name');
    if (actual[0]?.name !== U3_DATABASES[kind]) throw new Error('다른 DB fixture 초기화 금지');
  }
  // Disposable U3 namespace only. This is test setup, never a production rollback.
  await primary.query(
    'TRUNCATE ' +
      ALL_MODELS.map((model) => '"' + tableName(model.name) + '"').join(',') +
      ',u1_entity_version,u1_request_key,u1_recovery_candidate,u1_protected_prefix,u1_commit_counter,u1_epoch_sequence',
  );
  await primary.query(
    "INSERT INTO u1_commit_counter VALUES('initial',0,NULL); INSERT INTO u1_epoch_sequence VALUES('initial',1); UPDATE u1_recovery_control SET epoch='initial',enabled=true,auth_ready=true",
  );
  await primary.query(
    'DELETE FROM u1_auth_intent; DELETE FROM u1_auth_ephemeral; DELETE FROM u1_http_attempt',
  );
  await journal.query('TRUNCATE u1_protected_entry,u1_journal_prefix,u1_journal_epoch');
  await journal.query('TRUNCATE u2_vault.material');
  await journal.query(
    "INSERT INTO u1_journal_epoch VALUES('initial',1); INSERT INTO u1_journal_prefix VALUES('initial',0,NULL)",
  );
}
