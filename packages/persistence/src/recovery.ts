import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { canonicalJson, requireCondition, SchemaValidator } from '@oms/contracts';
import { ALL_MODELS, tableName } from './model-catalog.js';
import { decodePayload } from './recovery-types.js';
import type { RecoveryPayload } from './recovery-types.js';
import { replayRows } from './recovery-replay.js';
import { ProtectedStore } from './protected-store.js';
interface Epoch {
  epoch: string;
  generation: string;
  commit_order: string;
  digest: string | null;
}
const APPEND_ROLES = ['u1_journal_append', 'u2_verify_journal_append'];
const APPEND_FUNCTION = 'u1_append_entry(varchar,bigint,text,varchar,varchar,text)';
async function suspendAppendRoles(journal: DataSource): Promise<void> {
  await journal.transaction(async (manager) => {
    const roles = await manager.query(
      "SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[]) AND has_function_privilege(oid,$2,'EXECUTE')",
      [APPEND_ROLES, APPEND_FUNCTION],
    );
    for (const role of roles)
      await manager.query('INSERT INTO u1_restore_append_role VALUES($1) ON CONFLICT DO NOTHING', [
        role.rolname,
      ]);
    const pending = await manager.query(
      'SELECT role_name FROM u1_restore_append_role WHERE role_name=ANY($1::text[])',
      [APPEND_ROLES],
    );
    for (const role of pending) {
      const exists = await manager.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [
        role.role_name,
      ]);
      if (exists.length)
        await manager.query(
          'REVOKE EXECUTE ON FUNCTION ' + APPEND_FUNCTION + ' FROM "' + role.role_name + '"',
        );
    }
  });
}
async function resumeAppendRoles(journal: DataSource): Promise<void> {
  await journal.transaction(async (manager) => {
    const roles = await manager.query(
      'SELECT role_name FROM u1_restore_append_role WHERE role_name=ANY($1::text[])',
      [APPEND_ROLES],
    );
    for (const role of roles) {
      const exists = await manager.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [
        role.role_name,
      ]);
      if (exists.length)
        await manager.query(
          'GRANT EXECUTE ON FUNCTION ' + APPEND_FUNCTION + ' TO "' + role.role_name + '"',
        );
      await manager.query('DELETE FROM u1_restore_append_role WHERE role_name=$1', [
        role.role_name,
      ]);
    }
  });
}
export interface RecoveryReport {
  epoch: string;
  entries: number;
  rows: number;
  requestIdSample: string[];
  requestManifestDigest: string;
  workHolds: number;
  requiresSecurityConfirmation: true;
}
export interface RecoveryObservation {
  phase: 'VERIFIED' | 'REPLAYED';
  requestId: string;
  epoch: string;
  commitOrder: number;
  digest: string;
}
async function* epochs(snapshot: QueryRunner): AsyncGenerator<Epoch> {
  let after = 0;
  while (true) {
    const page = (await snapshot.query(
      'SELECT e.epoch,e.generation,p.commit_order,p.digest FROM u1_journal_epoch e JOIN u1_journal_prefix p USING(epoch) WHERE e.generation>$1 ORDER BY e.generation LIMIT 25',
      [after],
    )) as Epoch[];
    for (const epoch of page) {
      after = Number(epoch.generation);
      yield epoch;
    }
    if (page.length < 25) return;
  }
}
async function* entries(
  snapshot: QueryRunner,
  epoch: Epoch,
  schema: SchemaValidator,
): AsyncGenerator<RecoveryPayload> {
  let sequence = 0;
  let prior: string | null = null;
  while (sequence < Number(epoch.commit_order)) {
    // One bounded payload at a time, with no full journal or 100k request-ID array.
    const page = (await snapshot.query(
      'SELECT payload_text FROM u1_protected_entry WHERE epoch=$1 AND commit_order>$2 AND commit_order<=$3 ORDER BY commit_order LIMIT 1',
      [epoch.epoch, sequence, epoch.commit_order],
    )) as { payload_text: string }[];
    requireCondition(page[0], 503, 'RECOVERY_PREFIX_CONFLICT', '복구 원장 순번이 누락되었습니다.');
    const payload = decodePayload(page[0].payload_text, schema);
    requireCondition(
      payload.epoch === epoch.epoch &&
        payload.commitOrder === ++sequence &&
        payload.previousDigest === prior,
      503,
      'RECOVERY_PREFIX_CONFLICT',
      '복구 원장 연속 경계가 다릅니다.',
    );
    prior = payload.contentDigest;
    yield payload;
  }
  requireCondition(
    prior === epoch.digest,
    503,
    'RECOVERY_PREFIX_CONFLICT',
    '복구 원장 경계 내용 해시가 다릅니다.',
  );
}
// Administrative sources only; observer streams minimal ACK/evidence metadata into a protected report.
export async function restoreFromJournal(
  primaryAdmin: DataSource,
  journalAdmin: DataSource,
  observe?: (entry: RecoveryObservation) => Promise<void>,
): Promise<RecoveryReport> {
  await primaryAdmin.transaction(async (manager) => {
    await manager.query('SELECT * FROM u1_commit_counter FOR UPDATE');
    await manager.query(
      'UPDATE u1_recovery_control SET enabled=false,auth_ready=false WHERE singleton=true',
    );
  });
  await suspendAppendRoles(journalAdmin);
  const snapshot = journalAdmin.createQueryRunner();
  await snapshot.connect();
  await snapshot.startTransaction('REPEATABLE READ');
  const schema = new SchemaValidator();
  let count = 0;
  let rows = 0;
  let lastGeneration = 0;
  const requestIdSample: string[] = [];
  const manifest = createHash('sha256');
  try {
    // Verify every entry first, before replacing primary state. Both passes use one fixed snapshot.
    for await (const oldEpoch of epochs(snapshot)) {
      lastGeneration = Number(oldEpoch.generation);
      for await (const payload of entries(snapshot, oldEpoch, schema)) {
        count++;
        rows += payload.rows.length;
        if (requestIdSample.length < 64) requestIdSample.push(payload.requestId);
        const observed = {
          requestId: payload.requestId,
          epoch: payload.epoch,
          commitOrder: payload.commitOrder,
          digest: payload.contentDigest,
        };
        manifest.update(canonicalJson(observed) + '\n');
        await observe?.({ phase: 'VERIFIED', ...observed });
      }
    }
    requireCondition(
      lastGeneration > 0 && Number.isSafeInteger(lastGeneration + 1),
      503,
      'RECOVERY_EPOCH_MISSING',
      '복구 원장 세대를 확인해야 합니다.',
    );
    const epoch = 'recovery-' + randomUUID();
    const generation = lastGeneration + 1;
    // Writers/readers remain fenced for the entire restore. Release old table
    // storage before bounded replay so the full verified journal does not need
    // two copies of the entire primary heap in one long transaction.
    await primaryAdmin.transaction(async (manager) => {
      await manager.query('SET CONSTRAINTS ALL DEFERRED');
      await manager.query('DELETE FROM u1_auth_intent; DELETE FROM u1_auth_ephemeral');
      await manager.query(
        'TRUNCATE ' +
          ALL_MODELS.map((model) => tableName(model.name)).join(',') +
          ',u1_entity_version,u1_request_key,u1_recovery_candidate,u1_protected_prefix,u1_commit_counter,u1_epoch_sequence',
      );
      for await (const oldEpoch of epochs(snapshot)) {
        await manager.query('INSERT INTO u1_epoch_sequence VALUES($1,$2)', [
          oldEpoch.epoch,
          oldEpoch.generation,
        ]);
        await manager.query('INSERT INTO u1_commit_counter VALUES($1,$2,$3)', [
          oldEpoch.epoch,
          oldEpoch.commit_order,
          oldEpoch.digest,
        ]);
        await manager.query('INSERT INTO u1_protected_prefix VALUES($1,$2,$3)', [
          oldEpoch.epoch,
          oldEpoch.commit_order,
          oldEpoch.digest,
        ]);
      }
    });
    for await (const oldEpoch of epochs(snapshot)) {
      for await (const payload of entries(snapshot, oldEpoch, schema)) {
        await primaryAdmin.transaction(async (manager) => {
          await manager.query('SET CONSTRAINTS ALL DEFERRED');
          await replayRows(manager, payload);
          await manager.query('INSERT INTO u1_recovery_candidate VALUES($1,$2,$3,$4,$5)', [
            payload.epoch,
            payload.commitOrder,
            payload.requestId,
            canonicalJson(payload),
            payload.contentDigest,
          ]);
        });
        await observe?.({
          phase: 'REPLAYED',
          requestId: payload.requestId,
          epoch: payload.epoch,
          commitOrder: payload.commitOrder,
          digest: payload.contentDigest,
        });
      }
    }
    await primaryAdmin.transaction(async (manager) => {
      await manager.query('INSERT INTO u1_epoch_sequence VALUES($1,$2)', [epoch, generation]);
      await manager.query('INSERT INTO u1_commit_counter VALUES($1,0,NULL)', [epoch]);
      await manager.query('UPDATE u1_recovery_control SET epoch=$1 WHERE singleton=true', [epoch]);
    });
    await snapshot.commitTransaction();
    await journalAdmin.transaction(async (manager) => {
      await manager.query('INSERT INTO u1_journal_epoch VALUES($1,$2)', [epoch, generation]);
      await manager.query('INSERT INTO u1_journal_prefix VALUES($1,0,NULL)', [epoch]);
    });
    await resumeAppendRoles(journalAdmin);
    await primaryAdmin.query('UPDATE u1_recovery_control SET enabled=true WHERE singleton=true');
    const restored = new ProtectedStore(primaryAdmin, journalAdmin);
    let workHolds = 0;
    for await (const work of restored.scan(
      'WorkItem',
      {},
      new Date(Date.now() + 30 * 60000).toISOString(),
    )) {
      if (!['PENDING', 'PROCESSING', 'TECHNICAL_FAILED'].includes(String(work.state))) continue;
      const holdId = randomUUID();
      await restored.execute(
        {
          principalId: 'recovery-authority',
          audience: 'SYSTEM',
          owner: 'OperationalAssurance',
          operation: 'holdOriginalRecoveredWork',
          target: { workId: work.workId },
          idempotencyKey: holdId,
          input: { workId: work.workId, epoch },
          correlationId: String(work.correlationId),
          epoch,
        },
        async (transaction) => {
          await transaction.put(
            'WorkItem',
            {
              ...work,
              state: 'REVIEW_REQUIRED',
              leaseOwner: null,
              leaseUntil: null,
              leaseGeneration: Number(work.leaseGeneration) + 1,
              revision: Number(work.revision) + 1,
            },
            Number(work.revision),
          );
          await transaction.put('RecoveryWorkHold', {
            holdId,
            workId: work.workId,
            requestId: work.requestId,
            correlationId: work.correlationId,
            originalEpoch: work.epoch,
            recoveryEpoch: epoch,
            reason: 'CURRENT_SECURITY_AND_ORIGINAL_OUTCOME_UNCONFIRMED',
            createdAt: new Date().toISOString(),
            revision: 1,
          });
          for (const outbox of await transaction.list('OutboxDelivery', {
            workRef: { id: work.workId },
          }))
            if (!['PUBLISHED', 'UNKNOWN'].includes(String(outbox.state)))
              await transaction.put(
                'OutboxDelivery',
                { ...outbox, state: 'REVIEW_REQUIRED', revision: Number(outbox.revision) + 1 },
                Number(outbox.revision),
              );
        },
      );
      workHolds++;
    }
    return {
      epoch,
      entries: count,
      rows,
      requestIdSample,
      requestManifestDigest: manifest.digest('hex'),
      workHolds,
      requiresSecurityConfirmation: true,
    };
  } catch (error) {
    if (snapshot.isTransactionActive) await snapshot.rollbackTransaction();
    await primaryAdmin.query(
      'UPDATE u1_recovery_control SET enabled=false,auth_ready=false WHERE singleton=true',
    );
    // Interrupted validation/replay remains fenced, including restart attempts.
    throw error;
  } finally {
    await snapshot.release();
  }
}
