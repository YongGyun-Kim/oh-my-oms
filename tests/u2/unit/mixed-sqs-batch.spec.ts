import { describe, it, expect } from 'vitest';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { SqsBroker, runWorkerCycle } from '@oms/integrations';
import type { QueueMessage } from '@oms/core';
const queue = 'https://sqs.ap-northeast-2.amazonaws.com/123456789012/local-synthetic-only';
const r = (entity: string, owner = 'U1Host') => ({
  owner,
  entity,
  id: 'fixture-' + entity,
  revision: 1,
});
const work = {
  workId: 'work',
  requestId: 'request',
  owner: 'NotificationDelivery',
  operationId: 'NotificationDelivery.materialiseInApp',
  targetRef: r('Order', 'OrderAcceptance'),
  sourceFactRef: r('FactEnvelope'),
  executionPermitRef: r('ExecutionPermit', 'EnterpriseAccess'),
  expectedRevision: 1,
  notBefore: '2026-10-10T00:00:00Z',
  deadlineAt: '2026-10-10T00:05:00Z',
  attempt: 0,
  correlationId: 'trace',
};
const envelope = (id = 'valid', body: unknown = work, consumer = 'consumer', version = '2') => ({
  MessageId: id,
  ReceiptHandle: 'synthetic-receipt-' + id,
  Body: JSON.stringify(body),
  MessageAttributes: {
    consumer: { DataType: 'String', StringValue: consumer },
    contractVersion: { DataType: 'String', StringValue: version },
  },
  Attributes: { ApproximateReceiveCount: '4' },
});
function adapter(messages: unknown[], metadata: unknown = { requestId: 'synthetic-sdk-receive' }) {
  const calls: { name: string; input: Record<string, unknown> }[] = [],
    client = {
      send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        calls.push({ name: command.constructor.name, input: command.input });
        return command.constructor.name === 'ReceiveMessageCommand'
          ? { Messages: messages, $metadata: metadata }
          : { MessageId: 'synthetic-published' };
      },
    } as unknown as SQSClient;
  return {
    broker: new SqsBroker(
      { consumer: queue, 'u1-in-app-notice': queue, 'u2-handoff-delivery': queue },
      'ap-northeast-2',
      client,
    ),
    calls,
  };
}
describe('SQS SDK double의 per-envelope poison 격리; 실제 SQS 증거 아님', () => {
  it('malformed 한 개가 정상 앞/뒤 sibling 처리를 막지 않고 자동 ACK하지 않는다', async () => {
    const { broker, calls } = adapter([
        envelope('first'),
        { ...envelope('poison'), Body: '{bad' },
        envelope('last'),
      ]),
      valid = await broker.receive('consumer', new AbortController().signal);
    expect(valid.map((row) => row.id)).toEqual(['first', 'last']);
    const rejected = broker.takeReceiveRejections();
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      index: 1,
      reason: 'JSON',
      approximateReceiveCount: 4,
      disposition: 'NO_ACK_WAIT_REDRIVE',
      receiveRequestId: 'synthetic-sdk-receive',
    });
    expect(calls.some((call) => call.name === 'DeleteMessageCommand')).toBe(false);
    expect(broker.takeReceiveRejections()).toHaveLength(0);
  });
  it('missing receipt/id/body·잘못된 속성·schema 각각을 정상 sibling과 분리한다', async () => {
    const malformed = [
        { ...envelope(), ReceiptHandle: undefined },
        { ...envelope(), MessageId: undefined },
        { ...envelope(), Body: undefined },
        envelope('attributes', work, 'other'),
        envelope('schema', { ...work, extra: true }),
        envelope('wrongtype', { ...work, attempt: 'one' }),
      ],
      { broker } = adapter([...malformed, envelope('valid')]);
    expect(await broker.receive('consumer', new AbortController().signal)).toHaveLength(1);
    expect(broker.takeReceiveRejections().map((row) => row.reason)).toEqual([
      'ENVELOPE',
      'ENVELOPE',
      'ENVELOPE',
      'ATTRIBUTES',
      'SCHEMA',
      'SCHEMA',
    ]);
  });
  it('모두 poison이면 성공 수신으로 바꾸지 않고 거절하며 미확인 receive/redrive를 채우지 않는다', async () => {
    const { broker } = adapter(
      [{ ...envelope(), Body: 'private raw sentinel', Attributes: {} }],
      {},
    );
    await expect(broker.receive('consumer', new AbortController().signal)).rejects.toMatchObject({
      code: 'QUEUE_BATCH_QUARANTINED',
    });
    const rejected = broker.takeReceiveRejections();
    expect(rejected[0]).toMatchObject({
      receiveRequestId: null,
      approximateReceiveCount: null,
      providerEvidence: 'UNCONFIRMED',
    });
    expect(JSON.stringify(rejected).includes('private raw sentinel')).toBe(false);
    expect(JSON.stringify(rejected).includes('synthetic-receipt')).toBe(false);
  });
  it('크기 초과 원문과 parser error는 격리 진단에 복사하지 않는다', async () => {
    const { broker } = adapter([
      { ...envelope('too-big'), Body: 'raw-private-sentinel'.repeat(5000) },
      envelope(),
    ]);
    expect(await broker.receive('consumer', new AbortController().signal)).toHaveLength(1);
    const rejected = broker.takeReceiveRejections();
    expect(rejected[0]?.reason).toBe('BODY_LIMIT');
    expect(rejected[0]?.bodyPrefixDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rejected).includes('raw-private-sentinel')).toBe(false);
  });
  it('유한 수신10개/원래 receive attribute 요구를 지키고 초과 batch를 소비하지 않는다', async () => {
    const { broker, calls } = adapter(Array.from({ length: 11 }, (_, i) => envelope(String(i))));
    await expect(broker.receive('consumer', new AbortController().signal)).rejects.toMatchObject({
      code: 'QUEUE_RECEIVE_BATCH',
    });
    expect(calls[0]?.input).toMatchObject({
      MaxNumberOfMessages: 10,
      MessageSystemAttributeNames: ['ApproximateReceiveCount', 'SentTimestamp'],
    });
    expect(calls).toHaveLength(1);
  });
  it('새 U2 profile과 구형 version은 동시에 읽되 version 주입/다른 consumer는 격리한다', async () => {
    const u2 = {
        ...work,
        owner: 'IdentityRecovery',
        operationId: 'IdentityRecovery.deliverHandoff',
        targetRef: r('RecoveryHandoffGrant', 'IdentityRecovery'),
      },
      { broker } = adapter([
        envelope('u2', u2, 'u2-handoff-delivery', 'u2-access-additions:1'),
        envelope('wrong-version', u2, 'u2-handoff-delivery', '2'),
        envelope(
          'wrong-consumer',
          {
            ...u2,
            owner: 'EnterpriseAccess',
            operationId: 'EnterpriseAccess.deliverInvitation',
            targetRef: r('MembershipInvitation', 'EnterpriseAccess'),
          },
          'u2-handoff-delivery',
          'u2-access-additions:1',
        ),
      ]);
    const valid = await broker.receive('u2-handoff-delivery', new AbortController().signal);
    expect(valid).toHaveLength(1);
    expect(broker.takeReceiveRejections()).toHaveLength(2);
  });
  it('producer도 U2 별도 version을 보내고 consumer 혼합은 SDK 호출 전 거절한다', async () => {
    const { broker, calls } = adapter([]),
      u2 = {
        ...work,
        owner: 'IdentityRecovery',
        operationId: 'IdentityRecovery.deliverHandoff',
        targetRef: r('RecoveryHandoffGrant', 'IdentityRecovery'),
      };
    await broker.publish('u2-handoff-delivery', u2, new AbortController().signal);
    expect(calls[0]?.input.MessageAttributes).toMatchObject({
      contractVersion: { StringValue: 'u2-access-additions:1' },
    });
    await expect(
      broker.publish('consumer', u2, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'QUEUE_U2_CONSUMER' });
    expect(calls).toHaveLength(1);
  });
  it('worker 진단 callback 실패도 valid sibling 실행과 원래 poison no-ACK를 유지한다', async () => {
    const actual = adapter([
      { ...envelope('poison', work, 'u1-in-app-notice'), Body: 'bad' },
      envelope('valid', work, 'u1-in-app-notice'),
    ]);
    let consumed = 0,
      diagnostic = 0;
    const result = await runWorkerCycle(
      {
        relayBatch: async () => 0,
        consume: async (message: QueueMessage) => {
          expect(message.consumer).toBe('u1-in-app-notice');
          consumed++;
        },
      },
      actual.broker,
      new AbortController().signal,
      () => {
        diagnostic++;
        throw Error('diagnostic unavailable');
      },
    );
    expect(result.succeeded).toBe(1);
    expect(consumed).toBe(1);
    expect(diagnostic).toBe(1);
    expect(actual.calls.some((call) => call.name === 'DeleteMessageCommand')).toBe(false);
  });
  it('동시4소비자 수신의 poison은 자기 batch만 거절하고 빈/정상 sibling 결과와 진단을 보존한다', async () => {
    const consumers = [
        'u1-in-app-notice',
        'u2-identity',
        'u2-handoff-delivery',
        'u2-invitation-delivery',
      ],
      queues = Object.fromEntries(
        consumers.map((consumer, index) => [consumer, queue + '-' + index]),
      );
    const client = {
      send: async (command: { input: { QueueUrl: string } }) => {
        const consumer = consumers.find((name) => queues[name] === command.input.QueueUrl)!;
        await Promise.resolve();
        return {
          Messages:
            consumer === 'u2-identity'
              ? [{ ...envelope('poison', work, consumer), Body: 'bad' }]
              : consumer === 'u1-in-app-notice'
                ? [envelope('valid', work, consumer)]
                : [],
          $metadata: { requestId: 'synthetic-' + consumer },
        };
      },
    } as unknown as SQSClient;
    const broker = new SqsBroker(queues, 'ap-northeast-2', client),
      results = await Promise.allSettled(
        consumers.map((consumer) => broker.receive(consumer, new AbortController().signal)),
      );
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
      'fulfilled',
    ]);
    expect(
      (results[0] as PromiseFulfilledResult<QueueMessage[]>).value.map((message) => message.id),
    ).toEqual(['valid']);
    expect((results[2] as PromiseFulfilledResult<QueueMessage[]>).value).toEqual([]);
    expect(broker.takeReceiveRejections()).toMatchObject([
      { consumer: 'u2-identity', reason: 'JSON', disposition: 'NO_ACK_WAIT_REDRIVE' },
    ]);
  });
});
