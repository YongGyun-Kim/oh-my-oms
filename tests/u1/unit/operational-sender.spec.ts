import { describe, expect, it, vi } from 'vitest';
import type { SNSClient } from '@aws-sdk/client-sns';
import { SlackEmailSender } from '@oms/integrations';
const message = {
  incidentId: 'synthetic-incident',
  attemptId: 'original-attempt',
  cause: 'APPLICATION' as const,
  action: 'AUTO_RECOVERY_STARTED' as const,
};
const topic = 'arn:aws:sns:ap-northeast-2:000000000000:synthetic-topic';
const webhook = 'https://hooks.slack.com/services/SYNTHETIC/NOT_REAL';
function fixture(body = 'ok', status = 200, active = true) {
  const send = vi.fn(async () => ({ MessageId: 'synthetic-accepted' }));
  const transport = vi.fn(async () => new Response(body, { status }));
  return {
    send,
    transport,
    sender: new SlackEmailSender(
      webhook,
      topic,
      async () => active,
      { send } as unknown as SNSClient,
      transport as typeof fetch,
    ),
  };
}
describe('SDK/HTTP sender모의: Slack/SNS 접수는실제수신/ACK증거가아님', () => {
  it('실수신/국내경로/담당자profile 미확인은실제호출전에차단한다', async () => {
    const f = fixture('ok', 200, false);
    await expect(f.sender.send('SLACK', message, AbortSignal.timeout(1000))).rejects.toMatchObject({
      code: 'OPERATION_ACTIVATION_UNVERIFIED',
    });
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });
  it('실제webhook의200+ok만발송수락으로기록하고미리보기를끈다', async () => {
    const f = fixture();
    expect(await f.sender.send('SLACK', message, AbortSignal.timeout(1000))).toBe('ACCEPTED');
    const options = f.transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(options[1].body))).toEqual({
      text: JSON.stringify(message),
      unfurl_links: false,
      unfurl_media: false,
    });
  });
  it('200의다른내용·400/503·과대body는확인된수락으로채우지않는다', async () => {
    for (const [body, status] of [
      ['unknown', 200],
      ['ok', 400],
      ['ok', 503],
      ['x'.repeat(4097), 200],
    ] as const)
      expect(
        await fixture(body, status).sender.send('SLACK', message, AbortSignal.timeout(1000)),
      ).toBe('UNKNOWN');
  });
  it('SNS는MessageId가있는Publish접수만확인하며수신/ACK상태는없다', async () => {
    const f = fixture();
    expect(await f.sender.send('EMAIL', message, AbortSignal.timeout(1000))).toBe('ACCEPTED');
    expect((f.send.mock.calls[0] as unknown as [{ input: unknown }])[0].input).toMatchObject({
      TopicArn: topic,
      Message: JSON.stringify(message),
    });
  });
  it('timeout/network불명은효과부재·자동재송신으로승격하지않는다', async () => {
    const transport = vi.fn(async () => {
      throw new Error('synthetic timeout');
    });
    const sender = new SlackEmailSender(
      webhook,
      topic,
      async () => true,
      {} as SNSClient,
      transport as typeof fetch,
    );
    expect(await sender.send('SLACK', message, AbortSignal.timeout(1000))).toBe('UNKNOWN');
    expect(transport).toHaveBeenCalledOnce();
  });
  it('업무ID상세·비밀·unknown메시지필드는SDK호출전에거절한다', async () => {
    const f = fixture();
    await expect(
      f.sender.send(
        'EMAIL',
        { ...message, customerName: 'sensitive' } as typeof message,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_MESSAGE' });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('다른호스트/리전/HTTP/URLuserinfo는등록하지않는다', () => {
    for (const url of [
      'http://hooks.slack.com/services/test',
      'https://attacker.invalid/services/test',
      'https://user:secret@hooks.slack.com/services/test',
    ])
      expect(() => new SlackEmailSender(url, topic, async () => false)).toThrow();
    expect(
      () =>
        new SlackEmailSender(
          webhook,
          topic.replace('ap-northeast-2', 'us-east-1'),
          async () => false,
        ),
    ).toThrow();
  });
  it('미완료응답stream도원래signal에서취소되어UNKNOWN이된다', async () => {
    let cancelled = false;
    const transport = async () =>
      new Response(
        new ReadableStream({
          cancel: () => {
            cancelled = true;
          },
        }),
      );
    const sender = new SlackEmailSender(
      webhook,
      topic,
      async () => true,
      {} as SNSClient,
      transport as typeof fetch,
    );
    expect(await sender.send('SLACK', message, AbortSignal.timeout(20))).toBe('UNKNOWN');
    expect(cancelled).toBe(true);
  });
});
