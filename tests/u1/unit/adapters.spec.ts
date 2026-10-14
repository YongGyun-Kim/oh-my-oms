import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { CognitoProvider, SqsBroker } from '@oms/integrations';
import type { CognitoConfiguration } from '@oms/integrations';
import type { Work } from '@oms/contracts';
import { ExecutionBudget } from '@oms/contracts';
const config: CognitoConfiguration = {
  region: 'ap-northeast-2',
  pools: {
    CUSTOMER: {
      poolId: 'ap-northeast-2_syntheticcustomer',
      clientId: 'syntheticcustomerclient',
      clientSecret: randomBytes(32).toString('hex'),
    },
    STAFF: {
      poolId: 'ap-northeast-2_syntheticstaff',
      clientId: 'syntheticstaffclient',
      clientSecret: null,
    },
  },
};
interface Command {
  constructor: { name: string };
  input: Record<string, unknown>;
}
function cognito(mode = 'SOFTWARE_TOKEN_MFA', wrongSubject = false) {
  const calls: Command[] = [];
  const transport = {
    async send(command: Command) {
      calls.push(command);
      const meta = { $metadata: { requestId: 'synthetic-provider-request-' + calls.length } };
      const attributes = [
        {
          Name: 'sub',
          Value:
            wrongSubject && command.constructor.name === 'GetUserCommand'
              ? 'wrong'
              : 'synthetic-subject',
        },
      ];
      switch (command.constructor.name) {
        case 'InitiateAuthCommand':
          return mode === 'ACCESS'
            ? { ...meta, AuthenticationResult: { AccessToken: 'synthetic-access-token' } }
            : { ...meta, ChallengeName: mode, Session: 'synthetic-provider-session' };
        case 'AdminGetUserCommand':
          return {
            ...meta,
            Username: 'synthetic-username',
            Enabled: true,
            UserAttributes: attributes,
          };
        case 'GetUserCommand':
          return {
            ...meta,
            UserAttributes: attributes,
            UserMFASettingList: ['SOFTWARE_TOKEN_MFA'],
          };
        case 'RespondToAuthChallengeCommand':
          return { ...meta, AuthenticationResult: { AccessToken: 'synthetic-access-token' } };
        case 'AssociateSoftwareTokenCommand':
          return {
            ...meta,
            SecretCode: 'SYNTHETIC-NOT-REAL-TOTP',
            Session: 'synthetic-enrolment-session',
          };
        case 'VerifySoftwareTokenCommand':
          return { ...meta, Status: 'SUCCESS', Session: 'synthetic-verified-session' };
        case 'SetUserMFAPreferenceCommand':
          return meta;
        default:
          throw new Error('모의 SDK 명령이 등록되지 않았습니다.');
      }
    },
  };
  return {
    provider: new CognitoProvider(config, transport as unknown as CognitoIdentityProviderClient),
    calls,
  };
}
describe('Cognito adapter의 실제 SDK 계약 모의 검증', () => {
  it('분리 pool의 password→실제 MFA 응답/subject 대조를 연결한다', async () => {
    const { provider, calls } = cognito();
    const proof = await provider.password(
      'CUSTOMER',
      'synthetic@example.invalid',
      randomBytes(16).toString('hex'),
    );
    const factor = await provider.factor(proof, '123456');
    expect(factor.verified).toBe(true);
    expect(factor.subject).toBe('synthetic-subject');
    expect(factor.verification?.operation).toBe('SOFTWARE_TOKEN_MFA_VERIFIED');
    expect(factor.evidenceRefs[0]?.entity).toBe('ProviderVerificationEvidence');
    expect(calls[0]!.input).toMatchObject({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.pools.CUSTOMER.clientId,
    });
    expect(calls[2]!.input).toMatchObject({
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: 'synthetic-provider-session',
    });
    expect(JSON.stringify(calls)).not.toContain('DEVICE_KEY');
  });
  it('MFA_SETUP의 Associate→Verify→Respond→GetUser 결과로 등록을 확인한다', async () => {
    const { provider, calls } = cognito('MFA_SETUP');
    const proof = await provider.password('STAFF', 'synthetic@example.invalid', 'synthetic-only');
    const material = await provider.beginEnrolment(proof);
    const factor = await provider.completeEnrolment(
      { ...proof, providerHandle: material.providerHandle },
      '123456',
    );
    expect(factor.verified).toBe(true);
    expect(
      calls.some(
        (command) =>
          command.constructor.name === 'RespondToAuthChallengeCommand' &&
          command.input.ChallengeName === 'MFA_SETUP',
      ),
    ).toBe(true);
  });
  it('password-only access token은 TOTP 로그인 성공으로 승격하지 않는다', async () => {
    const { provider } = cognito('ACCESS');
    const proof = await provider.password(
      'CUSTOMER',
      'synthetic@example.invalid',
      'synthetic-only',
    );
    expect(proof.requiresEnrolment).toBe(true);
    await expect(provider.factor(proof, '123456')).rejects.toMatchObject({
      code: 'PROVIDER_MFA_CHALLENGE_REQUIRED',
    });
  });
  it('선택/최초 비밀번호 변경 등 미등록 phase는 성공 대신 준비 오류를 반환한다', async () => {
    const { provider } = cognito('NEW_PASSWORD_REQUIRED');
    await expect(
      provider.password('STAFF', 'synthetic@example.invalid', 'synthetic-only'),
    ).rejects.toMatchObject({ code: 'PROVIDER_STEP_REQUIRED' });
  });
  it('issuer/subject가 다른 실제 응답은 MFA로 인정하지 않는다', async () => {
    const { provider } = cognito('SOFTWARE_TOKEN_MFA', true);
    const proof = await provider.password(
      'CUSTOMER',
      'synthetic@example.invalid',
      'synthetic-only',
    );
    await expect(provider.factor(proof, '123456')).rejects.toMatchObject({
      code: 'PROVIDER_FACTOR_REQUIRED',
    });
    await expect(
      provider.factor({ ...proof, issuer: 'https://untrusted.invalid' }, '123456'),
    ).rejects.toThrow();
  });
  it('동일 고객/직원 pool/client와 미등록 지역/ID는 거절한다', () => {
    expect(
      () =>
        new CognitoProvider({
          ...config,
          pools: { CUSTOMER: config.pools.CUSTOMER, STAFF: config.pools.CUSTOMER },
        }),
    ).toThrow();
    expect(
      () =>
        new CognitoProvider({
          ...config,
          pools: { ...config.pools, CUSTOMER: { ...config.pools.CUSTOMER, poolId: 'untrusted' } },
        }),
    ).toThrow();
  });
  it('ACCESS 상태의 TOTP 검증과 활성화도 실제 SDK 단계를 사용한다', async () => {
    const { provider, calls } = cognito('ACCESS');
    const proof = await provider.password(
      'CUSTOMER',
      'synthetic@example.invalid',
      'synthetic-only',
    );
    const material = await provider.beginEnrolment(proof);
    expect(
      (
        await provider.completeEnrolment(
          { ...proof, providerHandle: material.providerHandle },
          '123456',
        )
      ).verified,
    ).toBe(true);
    expect(
      calls.some((command) => command.constructor.name === 'SetUserMFAPreferenceCommand'),
    ).toBe(true);
  });
  for (const delayedStep of [1, 2, 3])
    it(
      '연속 SDK의 ' + delayedStep + '번째 응답 지연은 원래 전체 deadline에서 중단한다',
      async () => {
        const base = cognito('ACCESS');
        let sends = 0;
        const transport = {
          async send(command: Command, options: { abortSignal: AbortSignal }) {
            sends++;
            const delay = sends === delayedStep ? 100 : 1;
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, delay);
              options.abortSignal.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer);
                  reject(new Error('synthetic SDK aborted at original deadline'));
                },
                { once: true },
              );
            });
            if (command.constructor.name === 'VerifySoftwareTokenCommand')
              return { Status: 'SUCCESS', $metadata: { requestId: 'verify-request' } };
            if (command.constructor.name === 'SetUserMFAPreferenceCommand')
              return { $metadata: { requestId: 'preference-request' } };
            if (command.constructor.name === 'GetUserCommand')
              return {
                UserAttributes: [{ Name: 'sub', Value: 'synthetic-subject' }],
                UserMFASettingList: ['SOFTWARE_TOKEN_MFA'],
                $metadata: { requestId: 'get-user-request' },
              };
            throw new Error('모의 명령 불일치');
          },
        };
        const proof = await base.provider.password(
          'CUSTOMER',
          'synthetic@example.invalid',
          'synthetic-only',
        );
        const provider = new CognitoProvider(
          config,
          transport as unknown as CognitoIdentityProviderClient,
        );
        const budget = new ExecutionBudget(30);
        await expect(provider.completeEnrolment(proof, '123456', budget)).rejects.toThrow(
          'original deadline',
        );
        expect(sends).toBe(delayedStep);
        expect(budget.signal.aborted).toBe(true);
      },
    );
});
const work: Work = {
  workId: 'synthetic-work',
  requestId: 'synthetic-request',
  owner: 'NotificationDelivery',
  operationId: 'NotificationDelivery.materialiseInApp',
  targetRef: null,
  sourceFactRef: null,
  executionPermitRef: {
    owner: 'EnterpriseAccess',
    entity: 'ExecutionPermit',
    id: 'synthetic-permit',
    revision: 1,
  },
  expectedRevision: null,
  notBefore: '2026-10-08T10:00:00Z',
  deadlineAt: '2026-10-08T10:05:00Z',
  attempt: 0,
  correlationId: 'synthetic-correlation',
};
describe('SQS Standard adapter 계약 모의 검증', () => {
  const url = 'https://sqs.ap-northeast-2.amazonaws.com/000000000000/synthetic-unit-queue';
  function adapter(result: Record<string, unknown>) {
    const calls: Command[] = [];
    const client = {
      async send(command: Command) {
        calls.push(command);
        return result;
      },
    };
    return {
      broker: new SqsBroker({ consumer: url }, 'ap-northeast-2', client as unknown as SQSClient),
      calls,
    };
  }
  it('원래 work/correlation과version/consumer를 전송하고 response MessageId만 기록한다', async () => {
    const { broker, calls } = adapter({ MessageId: 'synthetic-message' });
    expect(await broker.publish('consumer', work, AbortSignal.timeout(1000))).toEqual({
      messageId: 'synthetic-message',
    });
    expect(calls[0]!.input).toMatchObject({
      QueueUrl: url,
      MessageAttributes: {
        contractVersion: { StringValue: '2' },
        consumer: { StringValue: 'consumer' },
      },
    });
    expect(JSON.parse(String(calls[0]!.input.MessageBody))).toEqual(work);
    expect(calls[0]!.input.MessageGroupId).toBeUndefined();
  });
  it('빈 발행 응답은 효과 불명으로 거절한다', async () => {
    const { broker } = adapter({});
    await expect(broker.publish('consumer', work, AbortSignal.timeout(1000))).rejects.toMatchObject(
      { code: 'PUBLISH_OUTCOME_UNKNOWN' },
    );
  });
  it('미등록 consumer/지역/FIFO/HTTP는 SDK 실행 전에 거절한다', async () => {
    const { broker, calls } = adapter({});
    await expect(broker.publish('unknown', work, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(calls).toHaveLength(0);
    for (const queue of [
      url + '.fifo',
      url.replace('https:', 'http:'),
      'https://untrusted.invalid/q',
    ])
      expect(() => new SqsBroker({ consumer: queue }, 'ap-northeast-2')).toThrow();
  });
  it('정확한 등록 봉투만 읽고 receiptHandle로 큐 ACK한다', async () => {
    const { broker, calls } = adapter({
      Messages: [
        {
          MessageId: 'message',
          ReceiptHandle: 'handle',
          Body: JSON.stringify(work),
          MessageAttributes: {
            consumer: { StringValue: 'consumer' },
            contractVersion: { StringValue: '2' },
          },
        },
      ],
    });
    const messages = await broker.receive('consumer', AbortSignal.timeout(1000));
    expect(messages[0]?.body).toEqual(work);
    await broker.acknowledge(messages[0]!, AbortSignal.timeout(1000));
    expect(calls[1]!.input).toMatchObject({ ReceiptHandle: 'handle' });
  });
  it('version/consumer/필수필드가 틀린 큐 봉투는 거절한다', async () => {
    const { broker } = adapter({
      Messages: [
        {
          MessageId: 'message',
          ReceiptHandle: 'handle',
          Body: '{}',
          MessageAttributes: {
            consumer: { StringValue: 'other' },
            contractVersion: { StringValue: '1' },
          },
        },
      ],
    });
    await expect(broker.receive('consumer', AbortSignal.timeout(1000))).rejects.toThrow();
  });
  it('producer의 unknown input/크기 초과를 보내지 않는다', async () => {
    const { broker, calls } = adapter({});
    await expect(
      broker.publish('consumer', { ...work, extra: true } as Work, AbortSignal.timeout(1000)),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
