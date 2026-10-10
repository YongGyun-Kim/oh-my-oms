import type { Ref } from '@oms/contracts';
import { fingerprint, requireCondition } from '@oms/contracts';
import type { ModelData } from '@oms/persistence';
import { randomUUID } from 'node:crypto';
import { minimumNoticeSource } from './notice-source.js';
import { ref } from './references.js';
import { WorkerInternal } from './worker-state.js';
export async function firstProcessing(host: WorkerInternal, work: ModelData): Promise<void> {
  const key = fingerprint({ purpose: 'first-durable-processing', workId: work.workId });
  const epoch = await host.store.currentEpoch();
  const result = await host.store.execute(
    {
      principalId: 'u1-worker-notice',
      audience: 'SYSTEM',
      owner: 'NotificationDelivery',
      operation: 'firstDurableProcessing',
      target: { workId: work.workId },
      idempotencyKey: key,
      input: {
        workId: work.workId,
        requestId: work.requestId,
        correlationId: work.correlationId,
      },
      correlationId: String(work.correlationId),
      epoch,
    },
    async (transaction, requestId) => {
      await host.permit(work, transaction);
      await minimumNoticeSource(host.store, transaction, work.targetRef as Ref);
      const current = await transaction.get('WorkItem', String(work.workId));
      requireCondition(
        current &&
          ['PENDING', 'PROCESSING'].includes(String(current.state)) &&
          Date.parse(String(current.notBefore)) <= host.now().getTime() &&
          Date.parse(String(current.deadlineAt)) > host.now().getTime(),
        409,
        'WORK_START_CHANGED',
        '현재 실행 가능한 원래 작업을 확인해야 합니다.',
      );
      const updated = { ...current, state: 'PROCESSING', revision: Number(current.revision) + 1 };
      await transaction.put('WorkItem', updated, Number(current.revision));
      const history = {
        historyId: randomUUID(),
        owner: 'NotificationDelivery',
        actorAccountRef: null,
        verifiedPersonRef: null,
        occurredAt: host.now().toISOString(),
        reason: '현재 허가/원래due를 대조한 첫 지속 처리 시작',
        beforeRef: ref('WorkItem', current),
        afterRef: ref('WorkItem', updated),
        evidenceRefs: [work.sourceFactRef as Ref],
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
        operation: 'firstDurableProcessing',
        targetIdentity: { kind: 'RECORD', recordRef: ref('WorkItem', updated) },
        requestFingerprint: key,
        idempotencyKey: key,
        owner: 'NotificationDelivery',
        targetScope: null,
        requestState: 'PROCESSING',
        resultRefs: [ref('WorkItem', updated), ref('NotificationHistory', history)],
        acceptedAt: host.now().toISOString(),
        updatedAt: host.now().toISOString(),
        revision: 1,
        correlationId: work.correlationId,
      });
    },
  );
  if (!result.replay) {
    const observation = host.observed(
      'NotificationDelivery.firstProcessing',
      String(work.correlationId),
    );
    host.completeObserved(observation, {
      outcome: 'SUCCESS',
      eligibleDelayMilliseconds: Math.max(
        0,
        host.now().getTime() - Date.parse(String(work.notBefore)),
      ),
    });
  }
}
