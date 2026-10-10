import {
  canonicalJson,
  ExecutionBudget,
  fingerprint,
  requireCondition,
  SchemaValidator,
} from '@oms/contracts';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type {
  Candidate,
  CommitResult,
  FaultBoundary,
  Prefix,
  WriteRequest,
} from './protected-store.js';
import { ProtectedTransaction } from './protected-transaction.js';
import type { RequestKey } from './recovery-types.js';
import { decodePayload, sealPayload } from './recovery-types.js';
export interface ProtectedWriteHost {
  readonly primary: DataSource;
  readonly schema: SchemaValidator;
  readonly fault: ((boundary: FaultBoundary) => Promise<void>) | undefined;
  currentEpoch(): Promise<string>;
  protect(candidate: Candidate): Promise<void>;
}
export async function execute(
  host: ProtectedWriteHost,
  request: WriteRequest,
  operation: (transaction: ProtectedTransaction, requestId: string) => Promise<void>,
): Promise<CommitResult> {
  const budget = ExecutionBudget.current();
  budget?.check();
  for (const value of [
    request.principalId,
    request.idempotencyKey,
    request.correlationId,
    request.epoch,
  ])
    host.schema.validate('Id', value);
  const scopedKey = fingerprint({
    principalId: request.principalId,
    audience: request.audience,
    owner: request.owner,
    operation: request.operation,
    target: request.target,
    key: request.idempotencyKey,
  });
  const inputFingerprint = fingerprint(request.input);
  let candidate: Candidate | undefined;
  let replay = false;
  await host.primary.transaction(async (manager) => {
    budget?.check();
    if (budget)
      await manager.query(
        "SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)",
        [
          String(Math.max(1, Math.min(2000, budget.remaining()))),
          String(Math.max(1, Math.min(500, budget.remaining()))),
        ],
      );
    // Lock counter only through primary commit, never while doing independent journal I/O.
    const counter = (await manager.query(
      'SELECT commit_order,digest FROM u1_commit_counter WHERE epoch=$1 FOR UPDATE',
      [request.epoch],
    )) as Prefix[];
    const control = (await manager.query(
      'SELECT epoch,enabled FROM u1_recovery_control WHERE singleton=true',
    )) as { epoch: string; enabled: boolean }[];
    requireCondition(
      counter[0] && control[0]?.enabled && control[0].epoch === request.epoch,
      503,
      'WRITER_FENCED',
      '현재 쓰기 세대가 아닙니다.',
    );
    const existing = (await manager.query('SELECT data FROM u1_request_key WHERE scoped_key=$1', [
      scopedKey,
    ])) as { data: RequestKey }[];
    if (existing[0]) {
      requireCondition(
        existing[0].data.inputFingerprint === inputFingerprint,
        409,
        'IDEMPOTENCY_CONFLICT',
        '같은 접수 키의 내용이 다릅니다.',
      );
      const saved = (await manager.query(
        'SELECT * FROM u1_recovery_candidate WHERE request_id=$1',
        [existing[0].data.requestId],
      )) as Candidate[];
      requireCondition(
        saved[0],
        503,
        'ORIGINAL_CANDIDATE_MISSING',
        '원래 접수 보호 자료를 확인해야 합니다.',
      );
      candidate = saved[0];
      replay = true;
      return;
    }
    const commitOrder = Number(counter[0].commit_order) + 1;
    requireCondition(
      Number.isSafeInteger(commitOrder),
      503,
      'COMMIT_ORDER_LIMIT',
      '접수 순번 범위를 초과했습니다.',
    );
    const requestId = randomUUID();
    const transaction = new ProtectedTransaction(manager, host.schema);
    await operation(transaction, requestId);
    const key: RequestKey = {
      scopedKey,
      requestId,
      inputFingerprint,
      principalId: request.principalId,
      audience: request.audience,
      owner: request.owner,
      operation: request.operation,
      target: request.target,
    };
    const rows = transaction.rows();
    requireCondition(rows.length > 0, 503, 'EMPTY_COMMIT', '보호할 원본 변경이 없습니다.');
    rows.push({
      model: 'RequestKey',
      schemaVersion: 1,
      id: scopedKey,
      revision: 1,
      data: { ...key },
      deleted: false,
    });
    const payload = sealPayload({
      schemaVersion: 1,
      epoch: request.epoch,
      commitOrder,
      requestId,
      correlationId: request.correlationId,
      rows,
      previousDigest: counter[0].digest,
    });
    const text = canonicalJson(payload);
    decodePayload(text, host.schema);
    await manager.query('INSERT INTO u1_request_key VALUES($1,$2,$3)', [scopedKey, requestId, key]);
    await manager.query('INSERT INTO u1_recovery_candidate VALUES($1,$2,$3,$4,$5)', [
      request.epoch,
      commitOrder,
      requestId,
      text,
      payload.contentDigest,
    ]);
    for (const row of rows.filter((row) => row.model !== 'RequestKey'))
      await manager.query('INSERT INTO u1_entity_version VALUES($1,$2,$3,$4,$5,$6,$7)', [
        row.model,
        row.id,
        row.revision,
        request.epoch,
        commitOrder,
        row.data,
        row.deleted,
      ]);
    await manager.query('UPDATE u1_commit_counter SET commit_order=$2,digest=$3 WHERE epoch=$1', [
      request.epoch,
      commitOrder,
      payload.contentDigest,
    ]);
    candidate = {
      epoch: request.epoch,
      commit_order: String(commitOrder),
      request_id: requestId,
      payload_text: text,
      digest: payload.contentDigest,
    };
    budget?.check();
  });
  requireCondition(candidate, 503, 'COMMIT_NOT_FOUND', '접수 원본을 확인할 수 없습니다.');
  await host.fault?.('PRIMARY_COMMITTED');
  budget?.check();
  await host.protect(candidate);
  budget?.check();
  requireCondition(
    (await host.currentEpoch()) === request.epoch,
    503,
    'WRITER_FENCED',
    '변경 중 복구 세대가 바뀌었습니다.',
  );
  return { requestId: candidate.request_id, commitOrder: Number(candidate.commit_order), replay };
}
