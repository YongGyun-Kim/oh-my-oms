import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { canonicalJson, fingerprint, requireCondition, SchemaValidator } from '@oms/contracts';
import type { Work } from '@oms/contracts';
import { createHash } from 'node:crypto';
import type { QueueEnvelopeRejection, QueueBroker, QueueMessage } from '@oms/core';
import { QueuePublishFailure, queueWorkVersion, validateQueueWork } from '@oms/core';
export class SqsBroker implements QueueBroker {
  readonly kind = 'SQS' as const;
  private readonly client: SQSClient;
  private readonly schema = new SchemaValidator();
  private rejected: QueueEnvelopeRejection[] = [];
  takeReceiveRejections(): readonly QueueEnvelopeRejection[] {
    const records = this.rejected;
    this.rejected = [];
    return records.map((record) => ({ ...record }));
  }
  constructor(
    private readonly queues: Readonly<Record<string, string>>,
    region: 'ap-northeast-2',
    client?: SQSClient,
  ) {
    requireCondition(
      region === 'ap-northeast-2',
      503,
      'QUEUE_REGION',
      '등록된 큐 지역이 필요합니다.',
    );
    for (const queue of Object.values(queues))
      requireCondition(
        /^https:\/\/sqs\.ap-northeast-2\.amazonaws\.com\/\d{12}\/[A-Za-z0-9_-]+$/.test(queue) &&
          !queue.endsWith('.fifo'),
        503,
        'STANDARD_QUEUE_REQUIRED',
        '실제 consumer별 SQS Standard queue가 필요합니다.',
      );
    this.client = client ?? new SQSClient({ region, maxAttempts: 1 });
  }
  private queue(consumer: string): string {
    const url = this.queues[consumer];
    requireCondition(url, 503, 'CONSUMER_QUEUE_NOT_REGISTERED', '소비자 큐 binding이 없습니다.');
    return url;
  }
  endpointId(consumer: string): string {
    return fingerprint({ service: 'SQS', queue: this.queue(consumer) });
  }
  async publish(consumer: string, work: Work, signal: AbortSignal): Promise<{ messageId: string }> {
    validateQueueWork(this.schema, work, queueWorkVersion(work) === '2' ? undefined : consumer);
    const body = canonicalJson(work);
    requireCondition(
      Buffer.byteLength(body) <= 65536,
      400,
      'QUEUE_BODY_LIMIT',
      '작업 봉투 크기가 초과되었습니다.',
    );
    let result;
    try {
      result = await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queue(consumer),
          MessageBody: body,
          MessageAttributes: {
            contractVersion: { DataType: 'String', StringValue: queueWorkVersion(work) },
            consumer: { DataType: 'String', StringValue: consumer },
          },
        }),
        { abortSignal: signal },
      );
    } catch (error) {
      const observed = error as {
        name?: string;
        $metadata?: { requestId?: string; httpStatusCode?: number };
      };
      // Only an authenticated service rejection with a known no-effect semantic permits retry.
      if (
        observed.name === 'RequestThrottled' &&
        observed.$metadata?.requestId &&
        observed.$metadata.httpStatusCode === 400
      )
        throw new QueuePublishFailure('SAFE_TRANSIENT', 'REQUEST_THROTTLED');
      if (
        ['AccessDenied', 'AccessDeniedException', 'InvalidParameterValue'].includes(
          observed.name ?? '',
        ) &&
        observed.$metadata?.requestId &&
        observed.$metadata.httpStatusCode === 400
      )
        throw new QueuePublishFailure('PERMANENT', 'SERVICE_REJECTED');
      throw new QueuePublishFailure('UNKNOWN', 'PUBLISH_OUTCOME_UNKNOWN');
    }
    requireCondition(
      result.MessageId,
      503,
      'PUBLISH_OUTCOME_UNKNOWN',
      '원래 큐 발행 결과를 확인해야 합니다.',
    );
    return { messageId: result.MessageId };
  }
  async receive(consumer: string, signal: AbortSignal): Promise<QueueMessage[]> {
    const rejected: QueueEnvelopeRejection[] = [];
    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queue(consumer),
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 30,
        MessageAttributeNames: ['contractVersion', 'consumer'],
        MessageSystemAttributeNames: ['ApproximateReceiveCount', 'SentTimestamp'],
      }),
      { abortSignal: signal },
    );
    const messages = result.Messages ?? [];
    requireCondition(
      messages.length <= 10,
      503,
      'QUEUE_RECEIVE_BATCH',
      '원래 유한 수신 batch를 확인하세요.',
    );
    const valid: QueueMessage[] = [];
    for (const [index, message] of messages.entries()) {
      let reason: QueueEnvelopeRejection['reason'] = 'ENVELOPE';
      try {
        requireCondition(
          message.MessageId &&
            message.ReceiptHandle &&
            typeof message.Body === 'string' &&
            message.Body.length > 0,
          400,
          'QUEUE_ENVELOPE',
          '등록된 원래 큐 봉투가 필요합니다.',
        );
        reason = 'BODY_LIMIT';
        requireCondition(
          Buffer.byteLength(message.Body) <= 65536,
          400,
          'QUEUE_BODY_LIMIT',
          '등록된 큐 크기를 확인하세요.',
        );
        reason = 'ATTRIBUTES';
        const version = message.MessageAttributes?.contractVersion?.StringValue;
        requireCondition(
          (version === '2' || version === 'u2-access-additions:1') &&
            message.MessageAttributes?.consumer?.StringValue === consumer &&
            [
              message.MessageAttributes?.contractVersion?.DataType,
              message.MessageAttributes?.consumer?.DataType,
            ].every((type) => type === undefined || type === 'String'),
          400,
          'QUEUE_ATTRIBUTES',
          '원래 등록 version/consumer가 필요합니다.',
        );
        reason = 'JSON';
        const body: unknown = JSON.parse(message.Body);
        reason = 'SCHEMA';
        requireCondition(
          version === queueWorkVersion(body),
          400,
          'QUEUE_PROFILE',
          '원래 operation의 명시 profile가 필요합니다.',
        );
        const work = validateQueueWork(this.schema, body, version === '2' ? undefined : consumer);
        valid.push({
          id: message.MessageId,
          receiptHandle: message.ReceiptHandle,
          consumer,
          body: work,
        });
      } catch {
        const body = typeof message.Body === 'string' ? message.Body : null,
          count = message.Attributes?.ApproximateReceiveCount,
          receiveRequestId = result.$metadata?.requestId ?? null;
        // No raw body, handle or parser error enters diagnostics. Every poison
        // stays unacknowledged for the queue's configured finite redrive.
        rejected.push({
          consumer,
          endpointId: this.endpointId(consumer),
          index,
          messageId: message.MessageId ? fingerprint({ messageId: message.MessageId }) : null,
          receiveRequestId,
          receiptPresent: !!message.ReceiptHandle,
          bodyBytes: body === null ? null : Buffer.byteLength(body),
          bodyPrefixDigest:
            body === null ? null : createHash('sha256').update(body.slice(0, 65536)).digest('hex'),
          approximateReceiveCount: count && /^[1-9][0-9]{0,8}$/.test(count) ? Number(count) : null,
          reason,
          disposition: 'NO_ACK_WAIT_REDRIVE',
          providerEvidence: receiveRequestId ? 'OBSERVED' : 'UNCONFIRMED',
        });
      }
    }
    requireCondition(
      this.rejected.length + rejected.length <= 100,
      503,
      'QUEUE_QUARANTINE_CAPACITY',
      '유한 수신 진단을 먼저 회수하세요.',
    );
    this.rejected.push(...rejected);
    requireCondition(
      valid.length > 0 || rejected.length === 0,
      400,
      'QUEUE_BATCH_QUARANTINED',
      '수신된 봉투를 격리했습니다. 원래 redrive/수신 근거를 확인하세요.',
    );
    return valid;
  }
  async acknowledge(message: QueueMessage, signal: AbortSignal): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queue(message.consumer),
        ReceiptHandle: message.receiptHandle,
      }),
      { abortSignal: signal },
    );
  }
}
