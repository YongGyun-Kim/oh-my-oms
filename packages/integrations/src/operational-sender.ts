import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { requireCondition } from '@oms/contracts';
import type { OperationalSender } from './incident-types.js';
export class SlackEmailSender implements OperationalSender {
  constructor(
    private readonly webhook: string,
    private readonly emailTopic: string,
    private readonly activation: () => Promise<boolean>,
    private readonly sns = new SNSClient({ region: 'ap-northeast-2', maxAttempts: 1 }),
    private readonly transport: typeof fetch = fetch,
  ) {
    const url = new URL(webhook);
    requireCondition(
      url.protocol === 'https:' &&
        url.hostname === 'hooks.slack.com' &&
        url.pathname.startsWith('/services/') &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password &&
        /^arn:aws:sns:ap-northeast-2:\d{12}:[A-Za-z0-9_-]+$/.test(emailTopic),
      503,
      'OPERATION_CHANNEL',
      '등록된 Slack/SNS 서울 접점이 필요합니다.',
    );
  }
  async send(
    channel: 'SLACK' | 'EMAIL',
    message: Parameters<OperationalSender['send']>[1],
    signal: AbortSignal,
  ): Promise<'ACCEPTED' | 'UNKNOWN'> {
    requireCondition(
      (await this.activation()) === true,
      503,
      'OPERATION_ACTIVATION_UNVERIFIED',
      '실수신/구독/담당자/국내경로/수명 확인 전 외부발송을 허용하지 않습니다.',
    );
    requireCondition(
      Object.keys(message).sort().join(',') === 'action,attemptId,cause,incidentId' &&
        ['SLACK', 'EMAIL'].includes(channel) &&
        ['AUTO_RECOVERY_STARTED', 'MANUAL_REQUIRED', 'ACK_REMINDER', 'VERIFIED_RECOVERY'].includes(
          message.action,
        ) &&
        [
          'APPLICATION',
          'WORKER',
          'PRIMARY',
          'JOURNAL',
          'DEPLOYMENT',
          'OBSERVATION',
          'CHANNEL',
          'ACCURACY',
        ].includes(message.cause) &&
        [message.incidentId, message.attemptId].every(
          (id) =>
            typeof id === 'string' && Array.from(id).length >= 1 && Array.from(id).length <= 128,
        ),
      503,
      'OPERATION_MESSAGE',
      '외부 메시지에는 등록된 최소 사건/조치만 허용합니다.',
    );
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    const text = JSON.stringify(message);
    try {
      if (channel === 'EMAIL') {
        const result = await this.sns.send(
          new PublishCommand({
            TopicArn: this.emailTopic,
            Message: text,
            Subject: 'OMS 운영 상태 확인',
          }),
          { abortSignal: bounded },
        );
        return result.MessageId ? 'ACCEPTED' : 'UNKNOWN';
      }
      const response = await this.transport(this.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
        signal: bounded,
        redirect: 'error',
      });
      // Incoming webhook acceptance is not delivered/read/explicit operator ACK.
      const reader = response.body?.getReader();
      if (!reader) return 'UNKNOWN';
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      const cancel = () => {
        void reader.cancel().catch(() => undefined);
      };
      bounded.addEventListener('abort', cancel, { once: true });
      try {
        while (true) {
          bounded.throwIfAborted();
          const chunk = await reader.read();
          bounded.throwIfAborted();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 4096) {
            await reader.cancel();
            return 'UNKNOWN';
          }
          chunks.push(chunk.value);
        }
        return response.status === 200 && Buffer.concat(chunks).toString('utf8') === 'ok'
          ? 'ACCEPTED'
          : 'UNKNOWN';
      } finally {
        bounded.removeEventListener('abort', cancel);
        reader.releaseLock();
      }
    } catch {
      return 'UNKNOWN';
    }
  }
}
