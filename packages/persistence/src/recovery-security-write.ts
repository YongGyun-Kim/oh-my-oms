import { randomUUID } from 'node:crypto';
import { fingerprint } from '@oms/contracts';
import { modelDefinition } from './model-catalog.js';
import type { ModelData } from './model-catalog.js';
import type { ProtectedStore } from './protected-store.js';
export async function writeRecoveredSecurityTransition(
  store: ProtectedStore,
  input: {
    epoch: string;
    checkId: string;
    model: string;
    id: string;
    previous: ModelData;
    current: ModelData;
    evidenceId: string;
  },
): Promise<void> {
  const { epoch, checkId, model, id, previous, current, evidenceId } = input;
  const definition = modelDefinition(model);
  const securityKey = 'recovery-security-' + randomUUID();
  const securityInput = {
    checkId: checkId,
    model,
    id,
    sourceRevision: current.revision,
    evidenceId: evidenceId,
  };
  await store.execute(
    {
      principalId: 'registered-recovery-security-owner',
      audience: 'SYSTEM',
      owner: definition.owner,
      operation: 'reconcileRecoveredSecurity',
      target: { model, id },
      idempotencyKey: securityKey,
      input: {
        checkId: checkId,
        model,
        id,
        sourceRevision: current.revision,
        evidenceId: evidenceId,
      },
      correlationId: checkId,
      epoch,
    },
    async (transaction, requestId) => {
      await transaction.put(model, current, Number(previous.revision));
      const beforeRef = {
          owner: definition.owner,
          entity: model,
          id,
          revision: Number(previous.revision),
        },
        afterRef = { ...beforeRef, revision: Number(current.revision) };
      const recordedAt = new Date().toISOString();
      await transaction.put('RequestReceipt', {
        requestId,
        principalId: 'registered-recovery-security-owner',
        audience: 'SYSTEM',
        operation: 'reconcileRecoveredSecurity',
        targetIdentity: { kind: 'RECORD', recordRef: afterRef },
        requestFingerprint: fingerprint(securityInput),
        idempotencyKey: securityKey,
        owner: definition.owner,
        targetScope: null,
        requestState: 'RESULT_RECORDED',
        resultRefs: [afterRef],
        acceptedAt: recordedAt,
        updatedAt: recordedAt,
        revision: 1,
        correlationId: checkId,
      });
      await transaction.put(
        definition.owner === 'IdentityRecovery' ? 'IdentityHistory' : 'AccessHistory',
        {
          historyId: randomUUID(),
          owner: definition.owner,
          actorAccountRef: null,
          verifiedPersonRef: null,
          occurredAt: new Date().toISOString(),
          reason: '복구 뒤 등록된 현재 owner의 독립 보안 원본 대조',
          beforeRef,
          afterRef,
          evidenceRefs: [],
          requestId,
          resultRefs: [afterRef],
          correctionOf: null,
          sourceRevision: Number(current.revision),
        },
      );
    },
  );
}
