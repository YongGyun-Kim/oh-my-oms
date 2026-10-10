import type { Ref } from '@oms/contracts';
import { fingerprint, canonicalJson, requireCondition } from '@oms/contracts';
import type { ModelData } from '@oms/persistence';
import { randomUUID } from 'node:crypto';
import { ref } from './references.js';
import { CONSUMER, WorkerInternal, ReceiptResult } from './worker-state.js';
export async function relayBatch(host: WorkerInternal): Promise<number> {
  const pending = await host.store.list('OutboxDelivery', {
    equals: { state: 'PENDING', consumer: CONSUMER },
    cursor: host.relayCursor,
    limit: 25,
  });
  const issues: string[] = [];
  let published = 0;
  for (const record of pending) {
    try {
      const work = await host.store.read('WorkItem', (record.workRef as Ref).id);
      if (work && Date.parse(String(work.deadlineAt)) <= host.now().getTime()) {
        await host.holdExpired(record, work);
        issues.push(String(record.outboxId));
        continue;
      }
      await host.relayOne(String(record.outboxId));
      published++;
    } catch {
      issues.push(String(record.outboxId));
    }
  }
  // Bounded fair traversal lets a future-due/retry/open-circuit or unresolved
  // original remain visible without starving later eligible work/receives.
  host.relayCursor = pending.length === 25 ? String(pending.at(-1)!.outboxId) : null;
  if (issues.length && host.now().getTime() - host.lastReconciliationAt >= 120000) {
    host.lastReconciliationAt = host.now().getTime();
    console.error(
      JSON.stringify({
        event: 'original-outbox-reconciliation-required',
        outboxIds: issues,
        observedAt: host.now().toISOString(),
        effectsConfirmed: false,
      }),
    );
  }
  return published;
}
export async function holdExpired(
  host: WorkerInternal,
  outbox: ModelData,
  work: ModelData,
): Promise<ReceiptResult> {
  const key = fingerprint({
    purpose: 'hold-expired-original',
    outboxId: outbox.outboxId,
    revision: outbox.revision,
  });
  const epoch = await host.store.currentEpoch();
  const committed = await host.store.execute(
    {
      principalId: 'u1-worker-notice',
      audience: 'SYSTEM',
      owner: 'NotificationDelivery',
      operation: 'reviewExpiredOriginalOutbox',
      target: { outboxId: outbox.outboxId },
      idempotencyKey: key,
      input: { outboxId: outbox.outboxId, workId: work.workId, revision: outbox.revision },
      correlationId: String(work.correlationId),
      epoch,
    },
    async (transaction, requestId) => {
      const visibleOutbox = await host.store.currentProtected(
          'OutboxDelivery',
          String(outbox.outboxId),
        ),
        visibleWork = await host.store.currentProtected('WorkItem', String(work.workId));
      const current = await transaction.get('OutboxDelivery', String(outbox.outboxId));
      const original = await transaction.get('WorkItem', String(work.workId));
      requireCondition(original, 503, 'ORIGINAL_WORK_MISSING', '원래 작업을 대조해야 합니다.');
      requireCondition(
        current &&
          ['PENDING', 'PUBLISHED'].includes(String(current.state)) &&
          current.state === outbox.state &&
          current.consumer === CONSUMER &&
          (outbox.workRef as Ref).owner === 'U1Host' &&
          (outbox.workRef as Ref).entity === 'WorkItem' &&
          (outbox.workRef as Ref).id === work.workId &&
          outbox.epoch === work.epoch &&
          original.owner === 'NotificationDelivery' &&
          original.operationId === 'NotificationDelivery.materialiseInApp' &&
          canonicalJson(visibleOutbox) === canonicalJson(current) &&
          canonicalJson(visibleWork) === canonicalJson(original) &&
          current.revision === outbox.revision &&
          original?.revision === work.revision &&
          Date.parse(String(original.deadlineAt)) <= host.now().getTime(),
        409,
        'OUTBOX_CHANGED',
        '원래 작업/발행 개정과 기한을 다시 대조해야 합니다.',
      );
      const permitRef = original.executionPermitRef as Ref,
        permit = await host.store.readRevision('ExecutionPermit', permitRef.id, permitRef.revision);
      requireCondition(
        permitRef.owner === 'EnterpriseAccess' &&
          permitRef.entity === 'ExecutionPermit' &&
          permit &&
          permit.workId === original.workId &&
          permit.consumer === CONSUMER &&
          permit.principalId === 'u1-worker-notice' &&
          permit.audience === 'SYSTEM' &&
          permit.owner === 'NotificationDelivery' &&
          permit.action === 'notification.materialise' &&
          permit.operationId === original.operationId &&
          permit.epoch === original.epoch &&
          permit.deadlineAt === original.deadlineAt &&
          canonicalJson(permit.sourceFactRef) === canonicalJson(original.sourceFactRef),
        403,
        'EXPIRED_CONTROL_BINDING',
        '원래 실행 허가는 만료된 채 유지하고 해당 작업을 중단하는 control 권위만 대조합니다.',
      );
      const factRef = original.sourceFactRef as Ref,
        fact = await host.store.readRevision('FactEnvelope', factRef.id, factRef.revision);
      requireCondition(
        factRef.owner === 'U1Host' &&
          factRef.entity === 'FactEnvelope' &&
          fact &&
          fact.causationRequestId === original.requestId &&
          fact.correlationId === original.correlationId &&
          canonicalJson(fact.aggregateRef) === canonicalJson(original.targetRef) &&
          fact.aggregateVersion === original.expectedRevision,
        403,
        'EXPIRED_CONTROL_BINDING',
        '원래 사실/대상/접수의 중단 원본을 대조하세요.',
      );
      const published = await host.store.readRevision(
        'WorkItem',
        (outbox.workRef as Ref).id,
        (outbox.workRef as Ref).revision,
      );
      requireCondition(
        published &&
          [
            'requestId',
            'owner',
            'operationId',
            'targetRef',
            'sourceFactRef',
            'executionPermitRef',
            'expectedRevision',
            'notBefore',
            'deadlineAt',
            'correlationId',
            'epoch',
          ].every((field) => canonicalJson(published[field]) === canonicalJson(original[field])),
        403,
        'EXPIRED_CONTROL_BINDING',
        '원래 발행한 작업의 target/operation/기한을 바꾸지 않습니다.',
      );
      const updated = {
        ...original,
        state: original.state === 'RESULT_RECORDED' ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED',
        revision: Number(original.revision) + 1,
      };
      await transaction.put('WorkItem', updated, Number(original.revision));
      await transaction.put(
        'OutboxDelivery',
        { ...current, state: 'REVIEW_REQUIRED', revision: Number(current.revision) + 1 },
        Number(current.revision),
      );
      const history = {
        historyId: randomUUID(),
        owner: 'NotificationDelivery',
        actorAccountRef: null,
        verifiedPersonRef: null,
        occurredAt: host.now().toISOString(),
        reason:
          '원래 작업 기한 만료: 실제 발행/효과 상태 대조 필요. 새 발행이나 완료를 가정하지 않음.',
        beforeRef: ref('WorkItem', original),
        afterRef: ref('WorkItem', updated),
        evidenceRefs: [],
        requestId,
        resultRefs: [ref('WorkItem', updated)],
        correctionOf: null,
        sourceRevision: updated.revision,
      };
      await transaction.put('NotificationHistory', history);
      await transaction.put('RequestReceipt', {
        requestId,
        principalId: 'u1-worker-notice',
        audience: 'SYSTEM',
        operation: 'reviewExpiredOriginalOutbox',
        targetIdentity: { kind: 'RECORD', recordRef: ref('WorkItem', original) },
        requestFingerprint: key,
        idempotencyKey: key,
        owner: 'NotificationDelivery',
        targetScope: null,
        requestState: 'REVIEW_REQUIRED',
        resultRefs: [ref('WorkItem', updated), ref('NotificationHistory', history)],
        acceptedAt: host.now().toISOString(),
        updatedAt: host.now().toISOString(),
        revision: 1,
        correlationId: work.correlationId,
      });
    },
  );
  const receipt = await host.store.read('RequestReceipt', committed.requestId);
  requireCondition(
    receipt && receipt.requestState === 'REVIEW_REQUIRED',
    503,
    'EXPIRED_CONTROL_NOT_PROTECTED',
    '만료 중단의 원래 보호 receipt가 필요합니다.',
  );
  return {
    requestId: committed.requestId,
    resultRef: (receipt.resultRefs as Ref[])[0]!,
    disposition: 'CONTROL_REVIEW_REQUIRED',
  };
}
