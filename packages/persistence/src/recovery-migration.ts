import type { DataSource } from 'typeorm';

// Only the explicit DDL connection may register epochs or replace these objects.
export async function migrateRecovery(primary: DataSource, journal: DataSource): Promise<void> {
  await primary.query(`CREATE TABLE IF NOT EXISTS u1_recovery_security_confirmation(epoch varchar(128) PRIMARY KEY,check_id varchar(128) NOT NULL,source_kind varchar(32) NOT NULL CHECK(source_kind IN ('REGISTERED_CURRENT_OWNER','SYNTHETIC')),source_digest char(64) NOT NULL,records bigint NOT NULL CHECK(records>=0),observed_at timestamptz NOT NULL);
    REVOKE ALL ON u1_recovery_security_confirmation FROM PUBLIC,u1_app;`);
  await primary.transaction(async (manager) => {
    await manager.query('SET LOCAL ROLE u1_owner');
    await manager.query(`
      CREATE TABLE IF NOT EXISTS u1_recovery_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), epoch varchar(128) NOT NULL, enabled boolean NOT NULL,auth_ready boolean NOT NULL DEFAULT true);
      ALTER TABLE u1_recovery_control ADD COLUMN IF NOT EXISTS auth_ready boolean NOT NULL DEFAULT true;
      INSERT INTO u1_recovery_control(singleton,epoch,enabled,auth_ready) VALUES(true,'initial',true,true) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS u1_commit_counter(epoch varchar(128) PRIMARY KEY, commit_order bigint NOT NULL CHECK(commit_order>=0), digest varchar(64));
      INSERT INTO u1_commit_counter VALUES('initial',0,NULL) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS u1_recovery_candidate(epoch varchar(128) NOT NULL, commit_order bigint NOT NULL, request_id varchar(128) NOT NULL UNIQUE, payload_text text NOT NULL, digest varchar(64) NOT NULL, PRIMARY KEY(epoch,commit_order));
      CREATE TABLE IF NOT EXISTS u1_protected_prefix(epoch varchar(128) PRIMARY KEY, commit_order bigint NOT NULL, digest varchar(64));
      CREATE TABLE IF NOT EXISTS u1_entity_version(model varchar(128) NOT NULL, id varchar(128) NOT NULL, revision bigint NOT NULL, epoch varchar(128) NOT NULL, commit_order bigint NOT NULL, data jsonb NOT NULL, deleted boolean NOT NULL, PRIMARY KEY(model,id,epoch,commit_order));
      CREATE TABLE IF NOT EXISTS u1_epoch_sequence(epoch varchar(128) PRIMARY KEY, generation bigint NOT NULL UNIQUE);
      INSERT INTO u1_epoch_sequence VALUES('initial',1) ON CONFLICT DO NOTHING;
      CREATE INDEX IF NOT EXISTS u1_entity_version_visible ON u1_entity_version(model,id,commit_order DESC);
      CREATE TABLE IF NOT EXISTS u1_request_key(scoped_key varchar(64) PRIMARY KEY, request_id varchar(128) NOT NULL UNIQUE, data jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS u1_http_attempt_capacity(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton));
      INSERT INTO u1_http_attempt_capacity VALUES(true) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS u1_http_attempt(id varchar(128) PRIMARY KEY,scoped_key varchar(64) NOT NULL,epoch varchar(128) NOT NULL,state varchar(32) NOT NULL CHECK(state IN ('RUNNING','REJECTED','COMMITTED','UNKNOWN')),deadline_at timestamptz NOT NULL,finished_at timestamptz);
      CREATE INDEX IF NOT EXISTS u1_http_attempt_key ON u1_http_attempt(scoped_key,epoch,state);
      CREATE TABLE IF NOT EXISTS u1_auth_capacity(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton));
      INSERT INTO u1_auth_capacity VALUES(true) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS u1_auth_intent(id varchar(64) PRIMARY KEY,kind varchar(16) NOT NULL CHECK(kind IN ('ROOT','BROWSER','CHALLENGE','SESSION')),root varchar(64) NOT NULL,generation uuid NOT NULL,expires_at timestamptz NOT NULL);
      ALTER TABLE u1_auth_intent DROP CONSTRAINT IF EXISTS u1_auth_intent_kind_check;
      ALTER TABLE u1_auth_intent ADD CONSTRAINT u1_auth_intent_kind_check CHECK(kind IN ('ROOT','BROWSER','CHALLENGE','SESSION'));
      CREATE TABLE IF NOT EXISTS u1_auth_ephemeral(id varchar(128) PRIMARY KEY,ciphertext text NOT NULL CHECK(octet_length(ciphertext)<=90000),iv varchar(24) NOT NULL,tag varchar(24) NOT NULL,deadline_at timestamptz NOT NULL,lease_id varchar(128),lease_until timestamptz);
    `);
  });
  await journal.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await journal.query(`CREATE TABLE IF NOT EXISTS u1_restore_append_role(role_name varchar(128) PRIMARY KEY CHECK(role_name IN ('u1_journal_append','u2_verify_journal_append')));
    REVOKE ALL ON u1_restore_append_role FROM PUBLIC,u1_journal_append;`);
  await journal.transaction(async (manager) => {
    await manager.query('SET LOCAL ROLE u1_owner');
    await manager.query(`
      CREATE TABLE IF NOT EXISTS u1_journal_epoch(epoch varchar(128) PRIMARY KEY,generation bigint NOT NULL UNIQUE);
      INSERT INTO u1_journal_epoch VALUES('initial',1) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS u1_protected_entry(epoch varchar(128) NOT NULL REFERENCES u1_journal_epoch(epoch), commit_order bigint NOT NULL CHECK(commit_order>0), payload_text text NOT NULL CHECK(octet_length(payload_text)<=4194304), digest varchar(64) NOT NULL, previous_digest varchar(64), PRIMARY KEY(epoch,commit_order));
      CREATE TABLE IF NOT EXISTS u1_journal_prefix(epoch varchar(128) PRIMARY KEY REFERENCES u1_journal_epoch(epoch), commit_order bigint NOT NULL DEFAULT 0, digest varchar(64));
      INSERT INTO u1_journal_prefix VALUES('initial',0,NULL) ON CONFLICT DO NOTHING;
      CREATE OR REPLACE FUNCTION u1_append_entry(e varchar,o bigint,t text,d varchar,p varchar,b text) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
      DECLARE existing text; boundary bigint; prior varchar; next_entry record; body jsonb;
      BEGIN
        IF octet_length(t)>4194304 THEN RAISE EXCEPTION 'payload size' USING ERRCODE='22023'; END IF;
        body:=t::jsonb;
        IF b::jsonb IS DISTINCT FROM body-'contentDigest' OR encode(digest(b,'sha256'),'hex') IS DISTINCT FROM d THEN RAISE EXCEPTION 'payload digest' USING ERRCODE='22023'; END IF;
        IF body->>'epoch' IS DISTINCT FROM e OR (body->>'commitOrder')::bigint IS DISTINCT FROM o OR body->>'contentDigest' IS DISTINCT FROM d OR body->>'previousDigest' IS DISTINCT FROM p OR body->>'schemaVersion' IS DISTINCT FROM '1' OR jsonb_array_length(body->'rows')<1 THEN RAISE EXCEPTION 'payload metadata' USING ERRCODE='22023'; END IF;
        -- Hash canonical body separately; caller supplies canonical JSON but cannot replace an existing entry.
        PERFORM 1 FROM u1_journal_prefix WHERE epoch=e FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'unregistered epoch' USING ERRCODE='22023'; END IF;
        INSERT INTO u1_protected_entry VALUES(e,o,t,d,p) ON CONFLICT DO NOTHING;
        SELECT payload_text INTO existing FROM u1_protected_entry WHERE epoch=e AND commit_order=o;
        IF existing IS DISTINCT FROM t THEN RAISE EXCEPTION 'content conflict' USING ERRCODE='23505'; END IF;
        SELECT commit_order,digest INTO boundary,prior FROM u1_journal_prefix WHERE epoch=e;
        LOOP
          SELECT * INTO next_entry FROM u1_protected_entry WHERE epoch=e AND commit_order=boundary+1;
          EXIT WHEN NOT FOUND;
          IF next_entry.previous_digest IS DISTINCT FROM prior THEN RAISE EXCEPTION 'prefix conflict' USING ERRCODE='22023'; END IF;
          boundary:=boundary+1; prior:=next_entry.digest;
        END LOOP;
        UPDATE u1_journal_prefix SET commit_order=boundary,digest=prior WHERE epoch=e;
      END $function$;
      REVOKE ALL ON FUNCTION u1_append_entry(varchar,bigint,text,varchar,varchar,text) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION u1_append_entry(varchar,bigint,text,varchar,varchar,text) TO u1_journal_append;
      GRANT SELECT ON u1_protected_entry,u1_journal_prefix,u1_journal_epoch TO u1_journal_append;
    `);
  });
  // Restore least privilege even when the local material fixture grants CRUD to material tables.
  await primary.query(`REVOKE ALL ON u1_recovery_control,u1_commit_counter,u1_recovery_candidate,u1_protected_prefix,u1_entity_version,u1_request_key,u1_epoch_sequence FROM u1_app;
    GRANT SELECT ON u1_recovery_control TO u1_app;
    GRANT SELECT ON u1_epoch_sequence TO u1_app;
    GRANT SELECT,UPDATE(commit_order,digest) ON u1_commit_counter TO u1_app;
    GRANT SELECT,INSERT ON u1_recovery_candidate,u1_entity_version,u1_request_key TO u1_app;
    GRANT SELECT,INSERT,UPDATE ON u1_protected_prefix TO u1_app;`);
  await primary.query(
    'GRANT SELECT,UPDATE ON u1_http_attempt_capacity TO u1_app; GRANT SELECT,INSERT,UPDATE,DELETE ON u1_http_attempt TO u1_app',
  );
  await primary.query(
    'GRANT SELECT,UPDATE ON u1_auth_capacity TO u1_app; GRANT SELECT,INSERT,UPDATE,DELETE ON u1_auth_ephemeral,u1_auth_intent TO u1_app',
  );
  await primary.query(`CREATE UNIQUE INDEX IF NOT EXISTS u1_binding_subject_unique ON u1_provider_binding(issuer,subject,audience);
    CREATE UNIQUE INDEX IF NOT EXISTS u1_binding_current_unique ON u1_provider_binding("accountRefKey",audience) WHERE active;
    CREATE UNIQUE INDEX IF NOT EXISTS u1_code_set_current_unique ON u1_recovery_code_set("bindingRefKey") WHERE NOT invalidated;`);
}
