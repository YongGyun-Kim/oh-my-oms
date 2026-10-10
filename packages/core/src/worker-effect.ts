import type { Receipt, Ref, Work } from '@oms/contracts';
import { canonicalJson, requireCondition } from '@oms/contracts';
import type { ModelData } from '@oms/persistence';
import { createHash, randomUUID } from 'node:crypto';
import { minimumNoticeSource } from './notice-source.js';
import { ref } from './references.js';
import { CONSUMER, envelope, WorkerInternal } from './worker-state.js';
export async function processOriginalWork(
  host: WorkerInternal,
  incoming: Work,
  work: ModelData,
): Promise<Receipt> {
  const immutable = (value: Work) => {
    const { attempt: _attempt, ...rest } = value;
    void _attempt;
    return rest;
  };
  requireCondition(
    canonicalJson(immutable(incoming)) === canonicalJson(immutable(envelope(work))),
    403,
    'WORK_ENVELOPE_MISMATCH',
    '큐 사본은 원래 작업을 대체할 수 없습니다.',
  );
  await host.permit(work);
  requireCondition(
    Date.parse(String(work.notBefore)) <= host.now().getTime() &&
      Date.parse(String(work.deadlineAt)) > host.now().getTime(),
    409,
    'WORK_DEADLINE',
    '원래 작업 시작/종료 기한을 확인하세요.',
  );
  const markId = createHash('sha256')
    .update(CONSUMER + ':WORK:' + incoming.workId)
    .digest('hex');
  if (!(await host.store.read('ConsumerProcessingMark', markId))) await host.firstProcessing(work);
  const receipt = await host.commands.run(
    host.context(work),
    'NotificationDelivery',
    'materialiseInApp',
    { kind: 'RECORD', recordRef: work.targetRef },
    {
      meta: {
        clientRequestId: markId,
        expectedRevision: null,
        reason: '원래 보호 사실의 최소 통지',
        evidenceRefs: [work.sourceFactRef as Ref],
      },
    },
    'NotificationHistory',
    async (transaction) => {
      await host.permit(work, transaction);
    },
    async (transaction) => {
      const current = await transaction.get('WorkItem', incoming.workId);
      requireCondition(
        current && ['PENDING', 'PROCESSING'].includes(String(current.state)),
        409,
        'WORK_ALREADY_RESOLVED',
        '원래 작업 결과를 확인하세요.',
      );
      requireCondition(
        current.leaseUntil === null ||
          Date.parse(String(current.leaseUntil)) <= host.now().getTime(),
        409,
        'WORK_LEASE_BUSY',
        '다른 처리의 현재 임대가 있습니다.',
      );
      const source = await minimumNoticeSource(host.store, transaction, work.targetRef as Ref);
      const notice = {
        notificationId: randomUUID(),
        sourceFactRef: work.sourceFactRef,
        targetScope: source.scope,
        recipientAccountRefs: [source.recipient],
        minimalText: source.text,
        loginPath: source.loginPath,
        requiredActionRefs: [],
        createdAt: host.now().toISOString(),
        revision: 1,
      };
      await transaction.put('NotificationIntent', notice);
      const known = {
        deliveryAttemptId: randomUUID(),
        notificationRef: ref('NotificationIntent', notice),
        channel: 'IN_APP',
        providerCorrelation: 'in-app:' + notice.notificationId,
        knowledge: 'KNOWN',
        evidenceRefs: [ref('NotificationIntent', notice)],
        attemptedAt: host.now().toISOString(),
        revision: 1,
      };
      await transaction.put('DeliveryAttempt', known);
      await transaction.put('DeliveryAttempt', {
        ...known,
        deliveryAttemptId: randomUUID(),
        channel: 'EMAIL',
        providerCorrelation: null,
        knowledge: 'UNKNOWN',
        evidenceRefs: [],
      });
      await transaction.put('ConsumerProcessingMark', {
        processingMarkId: markId,
        consumer: CONSUMER,
        deliveryId: incoming.workId,
        deliveryKind: 'WORK',
        sourceVersion: incoming.expectedRevision,
        effectRefs: [ref('NotificationIntent', notice)],
        committedAt: host.now().toISOString(),
      });
      await transaction.put(
        'WorkItem',
        {
          ...current,
          state: 'RESULT_RECORDED',
          attempt: Number(current.attempt) + 1,
          leaseOwner: null,
          leaseUntil: null,
          leaseGeneration: Number(current.leaseGeneration) + 1,
          revision: Number(current.revision) + 1,
        },
        Number(current.revision),
      );
      return {
        target: ref('NotificationIntent', notice),
        refs: [ref('NotificationIntent', notice), ref('DeliveryAttempt', known)],
        scope: null,
        state: 'RESULT_RECORDED',
      };
    },
  );
  return receipt;
}
