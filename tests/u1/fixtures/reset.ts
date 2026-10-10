import type { DataSource } from 'typeorm';
import { ALL_MODELS, tableName } from '@oms/persistence';
export async function resetSyntheticDatabases(
  primary: DataSource,
  journal: DataSource,
): Promise<void> {
  const suffix = process.env.OMS_U1_DATABASE_PROFILE === 'e2e-isolated' ? 'e2e' : 'verification';
  if (
    !['verification-isolated', 'e2e-isolated'].includes(
      process.env.OMS_U1_DATABASE_PROFILE ?? '',
    ) ||
    new URL(primary.options.type === 'postgres' ? primary.options.url! : '').port !== '15432' ||
    new URL(primary.options.type === 'postgres' ? primary.options.url! : '').pathname !==
      '/oms_u1_' + suffix ||
    new URL(journal.options.type === 'postgres' ? journal.options.url! : '').pathname !==
      '/oms_u1_journal_' + suffix
  )
    throw new Error('합성 시험 DB 이외 초기화 금지');
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
  await journal.query(
    "INSERT INTO u1_journal_epoch VALUES('initial',1); INSERT INTO u1_journal_prefix VALUES('initial',0,NULL)",
  );
  await journal.query(
    'GRANT EXECUTE ON FUNCTION u1_append_entry(varchar,bigint,text,varchar,varchar,text) TO u1_journal_append',
  );
}
