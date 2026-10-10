import type { Observation, Ref, Work } from '@oms/contracts';
import { ExecutionBudget, fingerprint, requireCondition } from '@oms/contracts';
import { QueuePublishFailure } from './queue.js';
import { workerFailureOutcome } from './worker-observation.js';
import { CONSUMER, envelope, WorkerInternal } from './worker-state.js';
import type { ProtectedStore, ProtectedTransaction, ModelData } from '@oms/persistence';
import type { QueueBroker } from './queue.js';
import { assertU2WorkPermit, u2WorkEnvelope, U2_WORK_OPERATIONS } from './identity-work.js';
import { ExternalPolicy } from './external-policy.js';
import { boundedIdentityCall } from './identity-consumer.js';
import { Authorization } from './authorization.js';
export async function relayOne(host: WorkerInternal, outboxId: string): Promise<void> {
  let observation: Observation | undefined;
  try {
    await host.relayOriginal(outboxId, (correlation) => {
      observation = host.observed('NotificationDelivery.relay', correlation);
    });
    host.completeObserved(observation, { outcome: 'ACCEPTED_NOT_COMPLETED' });
  } catch (error) {
    if (!observation) observation = host.observed('NotificationDelivery.relay', outboxId);
    host.completeObserved(observation, { outcome: workerFailureOutcome(error) });
    throw error;
  }
}
export async function relayOriginal(
  host: WorkerInternal,
  outboxId: string,
  observe: (correlation: string) => void,
): Promise<void> {
  const outbox = await host.store.read('OutboxDelivery', outboxId);
  requireCondition(outbox, 404, 'NOT_FOUND', '발행 원본이 없습니다.');
  if (outbox.state === 'PUBLISHED') {
    const original = await host.store.read('WorkItem', (outbox.workRef as Ref).id);
    observe(original ? String(original.correlationId) : outboxId);
    return;
  }
  requireCondition(
    outbox.state === 'PENDING',
    409,
    'PUBLISH_OUTCOME_REVIEW',
    '원래 발행 결과를 확인해야 합니다.',
  );
  requireCondition(
    host.broker,
    503,
    'BROKER_NOT_REGISTERED',
    '실제 큐 제공자가 등록되지 않았습니다.',
  );
  const work = await host.store.read('WorkItem', (outbox.workRef as Ref).id);
  requireCondition(work, 503, 'WORK_NOT_PROTECTED', '작업 보호를 확인해야 합니다.');
  observe(String(work.correlationId));
  await host.permit(work);
  const now = host.now();
  const original = String(outbox.outboxId);
  const claim = await host.policy.begin(
    original,
    String(work.workId),
    host.broker.endpointId(CONSUMER),
    String(work.deadlineAt),
  );
  await host.store.execute(
    {
      principalId: 'u1-worker-notice',
      audience: 'SYSTEM',
      owner: 'NotificationDelivery',
      operation: 'preparePublish',
      target: { outboxId: original },
      idempotencyKey: fingerprint({
        outboxId: original,
        token: claim.attemptToken,
        operation: 'preparePublish',
      }),
      input: { outboxId: original, claim },
      correlationId: String(work.correlationId),
      epoch: String(work.epoch),
    },
    async (transaction) => {
      await host.permit(work, transaction);
      const current = await transaction.get('OutboxDelivery', original);
      requireCondition(
        current?.state === 'PENDING' && current.revision === outbox.revision,
        409,
        'OUTBOX_CHANGED',
        '발행 개정을 확인하세요.',
      );
      await transaction.put(
        'OutboxDelivery',
        {
          ...current,
          state: 'PUBLISHING',
          attempt: claim.attemptCount,
          firstAttemptAt: current.firstAttemptAt ?? now.toISOString(),
          revision: Number(current.revision) + 1,
        },
        Number(current.revision),
      );
    },
  );
  let messageId: string | null = null;
  let failure: unknown;
  const incoming = ExecutionBudget.current();
  const remaining = Math.min(
    30000,
    Date.parse(claim.deadlineAt) - host.now().getTime(),
    incoming?.remaining() ?? 30000,
  );
  requireCondition(remaining > 0, 409, 'WORK_DEADLINE', '원래 작업 잔여 기한이 없습니다.');
  const cleanupReserve = Math.min(1000, Math.max(1, Math.floor(remaining / 4)));
  requireCondition(
    remaining > cleanupReserve,
    409,
    'WORK_DEADLINE',
    '호출과 결과 보호를 위한 원래 잔여 기한이 필요합니다.',
  );
  try {
    messageId = (
      await host.broker.publish(
        CONSUMER,
        host.store.schema.validate<Work>('Work', envelope(work)),
        incoming?.signalWithin(remaining - cleanupReserve) ??
          AbortSignal.timeout(remaining - cleanupReserve),
      )
    ).messageId;
  } catch (error) {
    failure = error;
  }
  const outcome = messageId
    ? 'KNOWN'
    : failure instanceof QueuePublishFailure
      ? failure.outcome
      : 'UNKNOWN';
  const cleanupRemaining = Math.min(
    Date.parse(claim.deadlineAt) - host.now().getTime(),
    incoming?.remaining() ?? 30000,
  );
  requireCondition(
    cleanupRemaining > 0,
    503,
    'EXTERNAL_ORIGINAL_RECONCILIATION',
    '만료된 원래 호출/결과 기록을 대조해야 합니다.',
  );
  await new ExecutionBudget(
    Math.min(30000, cleanupRemaining),
    () => host.now().getTime(),
    incoming?.signal,
  ).run(() =>
    host.policy.finish(
      original,
      outcome,
      claim,
      async (transaction, recordedResult) => {
        const current = await transaction.get('OutboxDelivery', original);
        requireCondition(
          current?.state === 'PUBLISHING',
          409,
          'OUTBOX_CHANGED',
          '원래 발행 상태를 확인하세요.',
        );
        await transaction.put(
          'OutboxDelivery',
          {
            ...current,
            state:
              messageId && recordedResult === 'KNOWN'
                ? 'PUBLISHED'
                : recordedResult === 'SAFE_TRANSIENT' && claim.attemptCount < 4
                  ? 'PENDING'
                  : recordedResult === 'PERMANENT' || recordedResult === 'SAFE_TRANSIENT'
                    ? 'REVIEW_REQUIRED'
                    : 'UNKNOWN',
            transportMessageId: messageId,
            revision: Number(current.revision) + 1,
          },
          Number(current.revision),
        );
      },
      { outboxId: original, messageId },
    ),
  );
  if (failure) throw failure;
}
export async function relayU2Outbox(
  store: ProtectedStore,
  broker: QueueBroker,
  outboxId: string,
  now: () => Date,
  authorize: (work: ModelData, tx?: ProtectedTransaction) => Promise<void>,
): Promise<void> {
  const authorization = new Authorization(store, now),
    outbox = (await authorization.lookup('OutboxDelivery', outboxId))!,
    work = outbox && (await authorization.lookup('WorkItem', (outbox.workRef as Ref).id));
  requireCondition(
    outbox &&
      work &&
      Object.hasOwn(U2_WORK_OPERATIONS, String(work.operationId)) &&
      outbox.consumer ===
        U2_WORK_OPERATIONS[work.operationId as keyof typeof U2_WORK_OPERATIONS].consumer &&
      outbox.epoch === work.epoch,
    403,
    'U2_OUTBOX_BINDING',
    '원래 exact U2 outbox/operation/consumer가 필요합니다.',
  );
  if (outbox.state === 'PUBLISHED') return;
  requireCondition(
    outbox.state === 'PENDING' && work.state === 'PENDING' && outbox.deadlineAt === work.deadlineAt,
    409,
    'U2_PUBLISH_REVIEW',
    '원래 발행 결과/현재 기한을 대조하세요.',
  );
  await assertU2WorkPermit(store, work, now);
  await authorize(work);
  const policy = new ExternalPolicy(store, now),
    claim = await policy.begin(
      outboxId,
      String(work.workId),
      broker.endpointId(String(outbox.consumer)),
      String(work.deadlineAt),
    );
  await store.execute(
    {
      principalId: 'u2-worker-identity',
      audience: 'SYSTEM',
      owner: String(work.owner),
      operation: 'prepareU2Publish',
      target: { outboxId },
      idempotencyKey: 'publish-' + claim.attemptToken,
      input: { outboxId, claim },
      correlationId: String(work.correlationId),
      epoch: String(work.epoch),
    },
    async (tx) => {
      await assertU2WorkPermit(store, work, now, tx);
      await authorize(work, tx);
      const current = (await authorization.lookup('OutboxDelivery', outboxId, tx))!;
      requireCondition(
        current.revision === outbox.revision && current.state === 'PENDING',
        409,
        'U2_OUTBOX_CHANGED',
        '원래 발행 개정이 바뀌었습니다.',
      );
      await tx.put(
        'OutboxDelivery',
        {
          ...current,
          state: 'PUBLISHING',
          attempt: claim.attemptCount,
          firstAttemptAt: current.firstAttemptAt ?? now().toISOString(),
          revision: Number(current.revision) + 1,
        },
        Number(current.revision),
      );
    },
  );
  let messageId: string | null = null,
    failure: unknown;
  const incoming = ExecutionBudget.current(),
    remaining = Math.min(
      30000,
      Date.parse(claim.deadlineAt) - now().getTime(),
      incoming?.remaining() ?? 30000,
    );
  requireCondition(
    remaining > 1000,
    503,
    'U2_PUBLISH_BUDGET',
    '호출과 보호 결과의 원래 잔여 기한이 필요합니다.',
  );
  try {
    const budget = new ExecutionBudget(remaining - 1000, () => now().getTime(), incoming?.signal);
    messageId = (
      await boundedIdentityCall(budget, async () => {
        await assertU2WorkPermit(store, work, now);
        await authorize(work);
        const body = store.schema.validateUri<Work>(
          'urn:oms:contract:u2-access-additions:1#/$defs/U2Work',
          u2WorkEnvelope(work),
        );
        return broker.publish(String(outbox.consumer), body, budget.signal);
      })
    ).messageId;
    requireCondition(
      messageId.length > 0 && messageId.length <= 128,
      503,
      'U2_PUBLISH_OBSERVATION',
      '유한 원래 발행 식별자가 필요합니다.',
    );
  } catch (error) {
    messageId = null;
    failure = error;
  }
  await policy.finish(
    outboxId,
    messageId ? 'KNOWN' : failure instanceof QueuePublishFailure ? failure.outcome : 'UNKNOWN',
    claim,
    async (tx, outcome) => {
      const current = (await authorization.lookup('OutboxDelivery', outboxId, tx))!;
      requireCondition(
        current.state === 'PUBLISHING' &&
          current.attempt === claim.attemptCount &&
          current.epoch === claim.epoch,
        409,
        'U2_OUTBOX_CHANGED',
        '원래 단회 발행 시도만 기록합니다.',
      );
      await tx.put(
        'OutboxDelivery',
        {
          ...current,
          state:
            messageId && outcome === 'KNOWN'
              ? 'PUBLISHED'
              : outcome === 'SAFE_TRANSIENT' && claim.attemptCount < 4
                ? 'PENDING'
                : outcome === 'UNKNOWN'
                  ? 'UNKNOWN'
                  : 'REVIEW_REQUIRED',
          transportMessageId: messageId,
          revision: Number(current.revision) + 1,
        },
        Number(current.revision),
      );
    },
    { outboxId, messageId },
  );
  if (failure) throw failure;
}
