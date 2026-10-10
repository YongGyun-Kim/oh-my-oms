import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { canonicalJson, requireCondition } from '@oms/contracts';
import { modelDefinition, primaryAttribute, validateModel } from './model-catalog.js';
import type { ModelData } from './model-catalog.js';
import { ProtectedStore } from './protected-store.js';
import { writeRecoveredSecurityTransition } from './recovery-security-write.js';
import { currentSecurityMatches } from './security-state.js';
import {
  RECOVERY_SECURITY_MODELS,
  recoverySecurityChangeAllowed,
  canonicalSecurityData,
} from './recovery-security-policy.js';
export interface RecoverySecurityObservation {
  checkId: string;
  model: string;
  id: string;
  sourceOwner: string;
  sourceRevision: number | null;
  currentData: ModelData | null;
  evidenceId: string;
  observedAt: string;
  knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT' | 'UNAVAILABLE';
}
export interface CurrentSecurityAuthority {
  readonly kind: 'REGISTERED_CURRENT_OWNER' | 'SYNTHETIC' | 'UNREGISTERED';
  begin(
    epoch: string,
    faultAt: string,
    signal: AbortSignal,
  ): Promise<{ checkId: string; asOf: string }>;
  observe(
    checkId: string,
    model: string,
    id: string,
    signal: AbortSignal,
  ): Promise<RecoverySecurityObservation>;
  seal(
    checkId: string,
    digest: string,
    records: number,
    signal: AbortSignal,
  ): Promise<{ checkId: string; digest: string; records: number; complete: boolean }>;
}
// No HTTP/operational evidence body can establish this authority. Actual owner
// and provider registrations remain UNREGISTERED before their readiness gate.
export async function reconcileRecoveredSecurity(
  primaryAdmin: DataSource,
  store: ProtectedStore,
  authority: CurrentSecurityAuthority,
  synthetic: boolean,
  epoch: string,
  faultAt: string,
) {
  requireCondition(
    authority.kind !== 'UNREGISTERED' && (authority.kind !== 'SYNTHETIC' || synthetic),
    503,
    'RECOVERY_SECURITY_SOURCE_UNREGISTERED',
    '실제 현재 신원/권한 owner 또는 명시 합성 oracle 등록이 필요합니다.',
  );
  store.schema.validate('Id', epoch);
  const fault = Date.parse(faultAt);
  requireCondition(
    Number.isFinite(fault) && fault <= Date.now() && Date.now() < fault + 30 * 60000,
    503,
    'RECOVERY_ORIGINAL_FAULT',
    '원래 fault t0와30분 전체 복구 기한을 대조해야 합니다.',
  );
  const deadline = new Date(fault + 30 * 60000).toISOString(),
    signal = AbortSignal.timeout(Math.max(1, Date.parse(deadline) - Date.now()));
  const control = (await primaryAdmin.query(
    'SELECT epoch,enabled,auth_ready FROM u1_recovery_control WHERE singleton=true',
  )) as { epoch: string; enabled: boolean; auth_ready: boolean }[];
  requireCondition(
    control.length === 1 &&
      control[0]!.epoch === epoch &&
      control[0]!.enabled === true &&
      control[0]!.auth_ready === false,
    409,
    'RECOVERY_SECURITY_EPOCH',
    '복원된 새epoch의 차단된 인증 상태가 필요합니다.',
  );
  const privileges = (await primaryAdmin.query(
    "SELECT has_table_privilege(current_user,'u1_recovery_control','UPDATE') AS allowed",
  )) as { allowed: boolean }[];
  requireCondition(
    privileges[0]?.allowed === true,
    403,
    'RECOVERY_AUTHORITY_ROLE',
    '일반 app role은 복구 인증 재개를 승인할 수 없습니다.',
  );
  // A prior interrupted reconciliation may already have committed its full
  // owner after-image. Reconcile that exact original candidate/prefix instead
  // of creating a new request or repeating an owner/business handler.
  for (;;) {
    signal.throwIfAborted();
    if ((await store.protectPending(epoch, 25)) < 25) break;
  }
  const check = await authority.begin(epoch, faultAt, signal);
  store.schema.validate('Id', check.checkId);
  requireCondition(
    Object.keys(check).sort().join(',') === 'asOf,checkId' &&
      Number.isFinite(Date.parse(check.asOf)) &&
      Date.parse(check.asOf) >= fault &&
      Date.parse(check.asOf) <= Date.now(),
    503,
    'RECOVERY_SECURITY_FRESHNESS',
    'fault 이후 독립 현재 owner 관측이 필요합니다.',
  );
  const sourceDigest = createHash('sha256'),
    stateDigest = createHash('sha256');
  let records = 0,
    changes = 0;
  try {
    for (const model of RECOVERY_SECURITY_MODELS)
      for await (const row of store.scan(model, {}, deadline)) {
        signal.throwIfAborted();
        const definition = modelDefinition(model),
          id = String(row[primaryAttribute(definition).name]);
        const observation = await authority.observe(
          check.checkId,
          model,
          id,
          AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        );
        store.schema.validateUri(
          'urn:oms:contract:foundation:1#/$defs/RecoverySecurityObservation',
          observation,
        );
        requireCondition(
          observation.checkId === check.checkId &&
            observation.model === model &&
            observation.id === id &&
            observation.sourceOwner === definition.owner &&
            observation.observedAt === check.asOf &&
            observation.knowledge === 'KNOWN' &&
            observation.currentData !== null,
          503,
          'RECOVERY_CURRENT_SECURITY_UNKNOWN',
          '현재 owner의 전체 보안 원본/회수/파기 근거가 미확인입니다.',
        );
        const current = validateModel(model, observation.currentData, store.schema);
        requireCondition(
          current[primaryAttribute(definition).name] === id &&
            observation.sourceRevision === current.revision &&
            recoverySecurityChangeAllowed(model, row, current),
          503,
          'RECOVERY_AUTHORITY_EXPANSION',
          '복구로 계정/연결·역할 권한을 새로 확대할 수 없습니다.',
        );
        if (!currentSecurityMatches(model, row, current)) {
          requireCondition(
            Number(current.revision) === Number(row.revision) + 1,
            503,
            'RECOVERY_CURRENT_REVISION_GAP',
            '누락된 현재 보안 전이는 원래 owner의 별도 대조가 필요합니다.',
          );
          await writeRecoveredSecurityTransition(store, {
            epoch,
            checkId: check.checkId,
            model,
            id,
            previous: row,
            current,
            evidenceId: observation.evidenceId,
          });
          changes++;
        }
        sourceDigest.update(canonicalJson(observation) + '\n');
        stateDigest.update(
          canonicalJson({ model, id, data: canonicalSecurityData(model, current) }) + '\n',
        );
        records++;
      }
    const digest = sourceDigest.digest('hex'),
      expectedState = stateDigest.digest('hex');
    const seal = await authority.seal(check.checkId, digest, records, signal);
    requireCondition(
      Object.keys(seal).sort().join(',') === 'checkId,complete,digest,records' &&
        seal.checkId === check.checkId &&
        seal.digest === digest &&
        seal.records === records &&
        seal.complete === true,
      503,
      'RECOVERY_SECURITY_INCOMPLETE',
      '독립 owner 관측의 전체범위/시점/봉인이 미확인입니다.',
    );
    await primaryAdmin.transaction(async (manager) => {
      await manager.query('SELECT * FROM u1_commit_counter WHERE epoch=$1 FOR UPDATE', [epoch]);
      const active = (await manager.query(
        'SELECT epoch,enabled,auth_ready FROM u1_recovery_control WHERE singleton=true FOR UPDATE',
      )) as typeof control;
      requireCondition(
        active[0]?.epoch === epoch && active[0].enabled === true && active[0].auth_ready === false,
        409,
        'RECOVERY_SECURITY_EPOCH',
        '현재 recovery epoch를 다시 대조해야 합니다.',
      );
      const recheck = createHash('sha256');
      let actualRecords = 0;
      for (const model of RECOVERY_SECURITY_MODELS)
        for await (const row of store.scan(model, {}, deadline)) {
          const id = String(row[primaryAttribute(modelDefinition(model)).name]);
          const current = await manager
            .getRepository<ModelData>(model)
            .findOne({ where: { [primaryAttribute(modelDefinition(model)).name]: id } });
          requireCondition(
            current && currentSecurityMatches(model, row, current),
            503,
            'RECOVERY_SECURITY_CHANGED',
            '대조 중 미보호 보안 변경이 있습니다.',
          );
          recheck.update(
            canonicalJson({ model, id, data: canonicalSecurityData(model, row) }) + '\n',
          );
          actualRecords++;
        }
      requireCondition(
        recheck.digest('hex') === expectedState && actualRecords === records,
        503,
        'RECOVERY_SECURITY_CHANGED',
        '현재 보안 원본이 독립 관측 이후 변경됐습니다.',
      );
      signal.throwIfAborted();
      await manager.query(
        'INSERT INTO u1_recovery_security_confirmation(epoch,check_id,source_kind,source_digest,records,observed_at) VALUES($1,$2,$3,$4,$5,$6)',
        [epoch, check.checkId, authority.kind, digest, records, check.asOf],
      );
      await manager.query(
        'UPDATE u1_recovery_control SET auth_ready=true WHERE singleton=true AND epoch=$1',
        [epoch],
      );
    });
    return {
      epoch,
      checkId: check.checkId,
      records,
      changes,
      sourceDigest: digest,
      authenticationReconciled: true,
      realEnvironmentVerified: false,
    };
  } catch (error) {
    await primaryAdmin.query(
      'UPDATE u1_recovery_control SET auth_ready=false WHERE singleton=true AND epoch=$1',
      [epoch],
    );
    throw error;
  }
}
