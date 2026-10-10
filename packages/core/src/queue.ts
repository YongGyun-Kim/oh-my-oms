import type { Work } from '@oms/contracts';
import { requireCondition, SchemaValidator } from '@oms/contracts';
import { U2_WORK_OPERATIONS } from './identity-work.js';
export function queueWorkVersion(work: unknown): '2' | 'u2-access-additions:1' {
  return work !== null &&
    typeof work === 'object' &&
    Object.hasOwn(U2_WORK_OPERATIONS, String((work as { operationId?: unknown }).operationId))
    ? 'u2-access-additions:1'
    : '2';
}
export function validateQueueWork(schema: SchemaValidator, work: unknown, consumer?: string): Work {
  if (queueWorkVersion(work) === '2') return schema.validate<Work>('Work', work);
  const validated = schema.validateUri<Work>(
      'urn:oms:contract:u2-access-additions:1#/$defs/U2Work',
      work,
    ),
    operation = U2_WORK_OPERATIONS[validated.operationId as keyof typeof U2_WORK_OPERATIONS];
  requireCondition(
    consumer === undefined || consumer === operation.consumer,
    400,
    'QUEUE_U2_CONSUMER',
    '원래 등록된 U2 operation/consumer가 필요합니다.',
  );
  return validated;
}
export interface QueueEnvelopeRejection {
  consumer: string;
  endpointId: string;
  index: number;
  messageId: string | null;
  receiveRequestId: string | null;
  receiptPresent: boolean;
  bodyBytes: number | null;
  bodyPrefixDigest: string | null;
  approximateReceiveCount: number | null;
  reason: 'ENVELOPE' | 'BODY_LIMIT' | 'ATTRIBUTES' | 'JSON' | 'SCHEMA';
  disposition: 'NO_ACK_WAIT_REDRIVE';
  providerEvidence: 'OBSERVED' | 'UNCONFIRMED';
}
export interface QueueMessage {
  id: string;
  receiptHandle: string;
  consumer: string;
  body: unknown;
}
export interface QueueBroker {
  readonly kind: 'SQS' | 'SYNTHETIC';
  endpointId(consumer: string): string;
  publish(consumer: string, work: Work, signal: AbortSignal): Promise<{ messageId: string }>;
  receive(consumer: string, signal: AbortSignal): Promise<QueueMessage[]>;
  acknowledge(message: QueueMessage, signal: AbortSignal): Promise<void>;
  takeReceiveRejections?(): readonly QueueEnvelopeRejection[];
}
export class QueuePublishFailure extends Error {
  constructor(
    readonly outcome: 'SAFE_TRANSIENT' | 'PERMANENT' | 'UNKNOWN',
    readonly safeCode: string,
  ) {
    super('큐 제공자 결과: ' + safeCode);
  }
}
