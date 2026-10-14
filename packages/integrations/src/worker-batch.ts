import { ExecutionBudget, OmsError, requireCondition } from '@oms/contracts';
import type { QueueBroker, QueueMessage } from '@oms/core';

// A failed original remains unacknowledged. It must not prevent the other
// deliveries in the same finite batch from checking their own authority.
export async function processWorkerMessages(
  messages: readonly QueueMessage[],
  consume: (message: QueueMessage) => Promise<unknown>,
  signal: AbortSignal,
  failure: (error: unknown, message: QueueMessage) => void,
) {
  if (messages.length > 10) throw new Error('등록된 소비 batch는 최대10개입니다.');
  let next = 0;
  let succeeded = 0;
  let failed = 0;
  const lanes = Array.from({ length: Math.min(4, messages.length) }, async () => {
    while (!signal.aborted && next < messages.length) {
      const message = messages[next++]!;
      try {
        await consume(message);
        succeeded++;
      } catch (error) {
        failed++;
        try {
          failure(error, message);
        } catch {
          // Diagnostic loss is not permission to ACK or discard the original.
        }
      }
    }
  });
  await Promise.all(lanes);
  return { attempted: next, succeeded, failed, unstarted: messages.length - next };
}

export async function runWorkerCycle(
  worker: { relayBatch(): Promise<number>; consume(message: QueueMessage): Promise<unknown> },
  broker: QueueBroker,
  stop: AbortSignal,
  failure: (error: unknown, message: QueueMessage) => void,
  u2?: { relayBatch(): Promise<number>; consume(message: QueueMessage): Promise<unknown> },
) {
  const budget = new ExecutionBudget(30000, () => Date.now(), stop);
  return budget.run(async () => {
    await worker.relayBatch();
    if (u2) {
      await u2.relayBatch();
      const consumers = [
        'u1-in-app-notice',
        'u2-identity',
        'u2-handoff-delivery',
        'u2-invitation-delivery',
      ] as const;
      // Four receive calls share this cycle. Consumption uses ONE four-lane
      // pool, never four independent pools of four. Each finite batch is <=10.
      const received = await Promise.allSettled(
        consumers.map((consumer) => broker.receive(consumer, budget.signalWithin(5000))),
      );
      const messages: QueueMessage[] = [];
      for (let i = 0; i < received.length; i++) {
        const result = received[i]!,
          consumer = consumers[i]!;
        if (result.status === 'fulfilled') {
          requireCondition(
            result.value.length <= 10 &&
              result.value.every((message) => message.consumer === consumer),
            403,
            'WORKER_ROUTE_BINDING',
            '원래 소비자별 유한 수신 경계를 대조하세요.',
          );
          messages.push(...result.value);
        } else {
          try {
            failure(result.reason, {
              id: 'receive-unconfirmed-' + consumer,
              consumer,
              receiptHandle: '',
              body: { action: 'ORIGINAL_WORK_RECONCILIATION_REQUIRED' },
            });
          } catch {
            /* 관측 실패는 ACK 근거가 아닙니다. */
          }
        }
      }
      for (const record of broker.takeReceiveRejections?.() ?? []) {
        try {
          failure(
            new OmsError(
              400,
              'QUEUE_ENVELOPE_QUARANTINED',
              '원래 poison은 ACK 없이 finite redrive로 격리합니다.',
            ),
            {
              id: record.messageId ?? 'unidentified-envelope-' + record.index,
              consumer: record.consumer,
              receiptHandle: '',
              body: record,
            },
          );
        } catch {
          /* 진단 실패는 폐기/ACK 허가가 아닙니다. */
        }
      }
      const totals = { attempted: 0, succeeded: 0, failed: 0, unstarted: 0 };
      for (let start = 0; start < messages.length; start += 10) {
        const result = await processWorkerMessages(
          messages.slice(start, start + 10),
          (message) =>
            message.consumer === 'u1-in-app-notice' ? worker.consume(message) : u2.consume(message),
          budget.signal,
          failure,
        );
        for (const key of Object.keys(totals) as (keyof typeof totals)[])
          totals[key] += result[key];
      }
      return totals;
    }
    let messages: QueueMessage[];
    const quarantine = () => {
      for (const record of broker.takeReceiveRejections?.() ?? []) {
        try {
          failure(
            new OmsError(
              400,
              'QUEUE_ENVELOPE_QUARANTINED',
              '수신 봉투는 성공 ACK 없이 원래 finite redrive로 격리했습니다.',
            ),
            {
              id: record.messageId ?? 'unidentified-envelope-' + record.index,
              consumer: record.consumer,
              receiptHandle: '',
              body: record,
            },
          );
        } catch {
          /* 진단 실패도 원래 poison을 ACK하는 근거가 아닙니다. */
        }
      }
    };
    try {
      messages = await broker.receive('u1-in-app-notice', budget.signalWithin(25000));
    } catch (error) {
      quarantine();
      throw error;
    }
    quarantine();
    return processWorkerMessages(
      messages,
      (message) => worker.consume(message),
      budget.signal,
      failure,
    );
  });
}
