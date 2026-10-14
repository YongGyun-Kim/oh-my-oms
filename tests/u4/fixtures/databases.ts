import { readFileSync } from 'node:fs';
import {
  createDataSource,
  materialSchemas,
  migrateU4Models,
  migrateU2Models,
  migrateRecovery,
  migratePurposeVault,
  migrateReadIndexes,
  ALL_MODELS,
  tableName,
} from '@oms/persistence';
import type { DataSource } from 'typeorm';
import {
  U4_DATABASES,
  u4SyntheticCredentials,
} from '../../../scripts/u4/prepare-test-databases.js';
import { assertU4DatabaseProfile } from './profile.js';

export { assertU4DatabaseProfile } from './profile.js';
export function assertU4Endpoint(source: DataSource, kind: 'primary' | 'journal'): void {
  assertU4DatabaseProfile();
  if (source.options.type !== 'postgres' || !source.options.url)
    throw new Error('U4 합성 PostgreSQL만 허용합니다.');
  const url = new URL(source.options.url);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== (kind === 'primary' ? '15432' : '25432') ||
    url.pathname !== '/' + U4_DATABASES[kind] ||
    source.options.synchronize !== false
  )
    throw new Error('다른 DB 또는 자동 synchronize는 허용하지 않습니다.');
}
export function u4Sources(role: 'api' | 'worker' = 'api') {
  assertU4DatabaseProfile();
  const c = u4SyntheticCredentials(readFileSync('.runtime/u4/test-databases.env', 'utf8'));
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
          U4_DATABASES[kind],
        applicationName: 'u4-synthetic-verification',
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
          user === 'u4_verify_vault'
            ? 'vault'
            : user === 'u4_verify_journal_append'
              ? 'append'
              : undefined,
      },
      models ? materialSchemas() : [],
    );
    assertU4Endpoint(db, kind);
    return db;
  };
  return {
    primaryAdmin: source('u1_primary_admin', 'U4_PRIMARY_ADMIN_PASSWORD', 'primary', true),
    journalAdmin: source('u1_journal_admin', 'U4_JOURNAL_ADMIN_PASSWORD', 'journal'),
    primaryApp: source('u4_verify_app', 'U4_APP_PASSWORD', 'primary', true),
    journalAppend: source('u4_verify_journal_append', 'U4_JOURNAL_APPEND_PASSWORD', 'journal'),
    vault: source('u4_verify_vault', 'U4_VAULT_PASSWORD', 'journal'),
  };
}
export async function initializeU4Databases(): Promise<void> {
  const sources = u4Sources();
  await sources.primaryAdmin.initialize();
  await sources.journalAdmin.initialize();
  try {
    for (const [source, kind] of [
      [sources.primaryAdmin, 'primary'],
      [sources.journalAdmin, 'journal'],
    ] as const) {
      assertU4Endpoint(source, kind);
      const actual = await source.query('SELECT current_database() AS name');
      if (actual[0]?.name !== U4_DATABASES[kind]) throw new Error('다른 DB migration 금지');
      await source.query(
        'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE,CREATE ON SCHEMA public TO u1_owner',
      );
    }
    await migrateU4Models(sources.primaryAdmin);
    await migrateU2Models(sources.primaryAdmin);
    await migrateRecovery(sources.primaryAdmin, sources.journalAdmin);
    await migratePurposeVault(sources.journalAdmin);
    await migrateReadIndexes(sources.primaryAdmin);
    await sources.primaryAdmin.query(`GRANT USAGE ON SCHEMA public TO u4_verify_app;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO u4_verify_app;
      REVOKE ALL ON u1_recovery_control,u1_commit_counter,u1_recovery_candidate,u1_protected_prefix,u1_entity_version,u1_request_key,u1_epoch_sequence,u1_recovery_security_confirmation FROM u4_verify_app;
      GRANT SELECT ON u1_recovery_control,u1_epoch_sequence TO u4_verify_app;
      GRANT SELECT,UPDATE(commit_order,digest) ON u1_commit_counter TO u4_verify_app;
      GRANT SELECT,INSERT ON u1_recovery_candidate,u1_entity_version,u1_request_key TO u4_verify_app;
      GRANT SELECT,INSERT,UPDATE ON u1_protected_prefix TO u4_verify_app;`);
    await sources.journalAdmin.query(`GRANT USAGE ON SCHEMA public TO u4_verify_journal_append;
      GRANT EXECUTE ON FUNCTION u1_append_entry(varchar,bigint,text,varchar,varchar,text) TO u4_verify_journal_append;
      GRANT SELECT ON u1_protected_entry,u1_journal_prefix,u1_journal_epoch TO u4_verify_journal_append;`);
    await sources.journalAdmin.query(`REVOKE ALL ON SCHEMA u2_vault FROM u4_verify_journal_append;
      REVOKE ALL ON ALL TABLES IN SCHEMA u2_vault FROM u4_verify_journal_append;
      GRANT USAGE ON SCHEMA u2_vault TO u4_verify_vault;
      GRANT SELECT,UPDATE ON u2_vault.capacity TO u4_verify_vault;
      GRANT SELECT,INSERT,DELETE ON u2_vault.material TO u4_verify_vault;`);
  } finally {
    if (sources.primaryAdmin.isInitialized) await sources.primaryAdmin.destroy();
    if (sources.journalAdmin.isInitialized) await sources.journalAdmin.destroy();
  }
}
export async function resetU4Databases(primary: DataSource, journal: DataSource): Promise<void> {
  for (const [source, kind] of [
    [primary, 'primary'],
    [journal, 'journal'],
  ] as const) {
    assertU4Endpoint(source, kind);
    const actual = await source.query('SELECT current_database() AS name');
    if (actual[0]?.name !== U4_DATABASES[kind]) throw new Error('다른 DB fixture 초기화 금지');
  }
  // Disposable U4 namespace only. This is test setup, never a production rollback.
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
