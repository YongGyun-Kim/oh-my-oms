import type { DataSource } from 'typeorm';
import { ALL_MODELS, tableName } from '@oms/persistence';
import { u2DatabaseProfile } from './databases.js';

export async function resetU2Databases(primary: DataSource, journal: DataSource): Promise<void> {
  const suffix = u2DatabaseProfile();
  const endpoint = (source: DataSource, db: string, port: string) => {
    if (source.options.type !== 'postgres' || !source.options.url)
      throw new Error('U2 PostgreSQL만 초기화합니다.');
    const url = new URL(source.options.url);
    if (url.hostname !== '127.0.0.1' || url.port !== port || url.pathname !== '/' + db)
      throw new Error('다른 소유자의 DB 또는 실제 DB 초기화 금지');
  };
  endpoint(primary, 'oms_u2_' + suffix, '15432');
  endpoint(journal, 'oms_u2_journal_' + suffix, '25432');
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
