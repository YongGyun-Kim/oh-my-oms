import { randomUUID } from 'node:crypto';
import type { QueueBroker, QueueMessage } from '@oms/core';
import type { Work } from '@oms/contracts';
export class SyntheticQueue implements QueueBroker {
  readonly kind = 'SYNTHETIC' as const;
  readonly messages: QueueMessage[] = [];
  readonly acknowledgements: string[] = [];
  readonly deadLetters: QueueMessage[] = [];
  private readonly acknowledged = new Set<string>();
  private readonly deadLettered = new Set<string>();
  private readonly delivery = new Map<string, { visibleAt: number; receives: number }>();
  failAfterPublish = false;
  constructor(private readonly now = () => Date.now()) {}
  endpointId(consumer: string) {
    return 'synthetic-queue-' + consumer;
  }
  async publish(consumer: string, work: Work) {
    if (this.messages.length >= 100000) throw new Error('합성 큐의 유한 자료 범위를 초과했습니다.');
    const id = randomUUID();
    this.messages.push({ id, receiptHandle: randomUUID(), consumer, body: structuredClone(work) });
    if (this.failAfterPublish) throw new Error('synthetic unknown publish outcome');
    return { messageId: id };
  }
  async receive(consumer: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const found: QueueMessage[] = [];
    for (const message of this.messages) {
      if (
        message.consumer !== consumer ||
        this.acknowledged.has(message.id) ||
        this.deadLettered.has(message.id)
      )
        continue;
      const prior = this.delivery.get(message.id);
      if (prior && prior.visibleAt > this.now()) continue;
      if (prior && prior.receives >= 5) {
        this.deadLettered.add(message.id);
        this.deadLetters.push(structuredClone(message));
        continue;
      }
      this.delivery.set(message.id, {
        visibleAt: this.now() + 30000,
        receives: (prior?.receives ?? 0) + 1,
      });
      message.receiptHandle = randomUUID();
      found.push(structuredClone(message));
      if (found.length === 10) break;
    }
    return found;
  }
  async acknowledge(message: QueueMessage) {
    const current = this.messages.find((value) => value.id === message.id);
    if (!current || current.receiptHandle !== message.receiptHandle)
      throw new Error('합성 큐의 현재 수신 handle을 대조해야 합니다.');
    this.acknowledged.add(message.id);
    this.acknowledgements.push(message.id);
  }
  snapshot() {
    let visible = 0;
    let inFlight = 0;
    for (const message of this.messages) {
      if (this.acknowledged.has(message.id) || this.deadLettered.has(message.id)) continue;
      if ((this.delivery.get(message.id)?.visibleAt ?? 0) > this.now()) inFlight++;
      else visible++;
    }
    return {
      source: 'SYNTHETIC_QUEUE_METADATA',
      actualSqsVerified: false,
      copies: this.messages.length,
      acknowledgedCopies: this.acknowledged.size,
      deadLetterCopies: this.deadLetters.length,
      visibleCopies: visible,
      inFlightCopies: inFlight,
      visibilitySeconds: 30,
      maxReceiveCount: 5,
    };
  }
}
