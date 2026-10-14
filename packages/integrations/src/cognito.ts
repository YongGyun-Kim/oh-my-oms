import { createHmac } from 'node:crypto';
import {
  AdminGetUserCommand,
  AssociateSoftwareTokenCommand,
  CognitoIdentityProviderClient,
  GetUserCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ExecutionBudget, fingerprint, requireCondition } from '@oms/contracts';
import type { Audience, Ref } from '@oms/contracts';
import type { FactorProof, IdentityProvider, PasswordProof, ProviderVerification } from '@oms/core';
type HumanAudience = Exclude<Audience, 'SYSTEM'>;
export interface CognitoPool {
  poolId: string;
  clientId: string;
  clientSecret: string | null;
}
export interface CognitoConfiguration {
  region: 'ap-northeast-2';
  pools: Record<HumanAudience, CognitoPool>;
}
interface ProviderHandle {
  username: string;
  session?: string;
  accessToken?: string;
  step: 'SOFTWARE_TOKEN_MFA' | 'MFA_SETUP' | 'ACCESS';
}
export class CognitoProvider implements IdentityProvider {
  readonly kind = 'COGNITO' as const;
  private readonly client: CognitoIdentityProviderClient;
  constructor(
    private readonly config: CognitoConfiguration,
    client?: CognitoIdentityProviderClient,
  ) {
    requireCondition(
      config.region === 'ap-northeast-2' &&
        config.pools.CUSTOMER.poolId !== config.pools.STAFF.poolId &&
        config.pools.CUSTOMER.clientId !== config.pools.STAFF.clientId,
      503,
      'IDENTITY_POOLS_REQUIRED',
      '분리된 고객/직원 인증 구성이 필요합니다.',
    );
    for (const pool of Object.values(config.pools))
      requireCondition(
        /^ap-northeast-2_[A-Za-z0-9]+$/.test(pool.poolId) &&
          /^[A-Za-z0-9]{1,128}$/.test(pool.clientId),
        503,
        'IDENTITY_POOL_CONFIGURATION',
        '실제 인증 pool/client를 확인하세요.',
      );
    this.client =
      client ?? new CognitoIdentityProviderClient({ region: config.region, maxAttempts: 1 });
  }
  private hash(audience: HumanAudience, username: string): Record<string, string> {
    const pool = this.config.pools[audience];
    return pool.clientSecret
      ? {
          SECRET_HASH: createHmac('sha256', pool.clientSecret)
            .update(username + pool.clientId)
            .digest('base64'),
        }
      : {};
  }
  private evidence(
    requestId: string | undefined,
    audience: HumanAudience,
    subject: string,
    operation: string,
  ): { evidenceRefs: Ref[]; verification: ProviderVerification } {
    requireCondition(
      requestId,
      503,
      'PROVIDER_OBSERVATION_REQUIRED',
      '실제 제공자 응답의 관측 식별자가 필요합니다.',
    );
    const evidenceId = fingerprint({ issuer: this.issuer(audience), requestId, operation });
    return {
      evidenceRefs: [
        {
          owner: 'IdentityRecovery',
          entity: 'ProviderVerificationEvidence',
          id: evidenceId,
          revision: 1,
        },
      ],
      verification: {
        evidenceId,
        provider: 'COGNITO',
        issuer: this.issuer(audience),
        subject,
        audience,
        operation,
        providerRequestId: requestId,
        verifiedAt: new Date().toISOString(),
        outcome: 'VERIFIED',
      },
    };
  }
  private issuer(audience: HumanAudience): string {
    return (
      'https://cognito-idp.' +
      this.config.region +
      '.amazonaws.com/' +
      this.config.pools[audience].poolId
    );
  }
  private handle(proof: PasswordProof): ProviderHandle {
    requireCondition(
      proof.issuer === this.issuer(proof.audience),
      401,
      'PROVIDER_ISSUER_MISMATCH',
      '인증 제공자 경계가 다릅니다.',
    );
    return JSON.parse(proof.providerHandle) as ProviderHandle;
  }
  async password(
    audience: HumanAudience,
    loginIdentifier: string,
    password: string,
    budget = ExecutionBudget.current() ?? new ExecutionBudget(10000),
  ): Promise<PasswordProof> {
    const pool = this.config.pools[audience];
    const result = await this.client.send(
      new InitiateAuthCommand({
        ClientId: pool.clientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: loginIdentifier,
          PASSWORD: password,
          ...this.hash(audience, loginIdentifier),
        },
      }),
      { abortSignal: budget.signalWithin(5000) },
    );
    budget.check();
    requireCondition(
      result.ChallengeName === 'SOFTWARE_TOKEN_MFA' ||
        result.ChallengeName === 'MFA_SETUP' ||
        !!result.AuthenticationResult?.AccessToken,
      503,
      'PROVIDER_STEP_REQUIRED',
      '제공자의 등록/최초 비밀번호 변경 단계를 먼저 확인해야 합니다.',
    );
    const user = await this.client.send(
      new AdminGetUserCommand({ UserPoolId: pool.poolId, Username: loginIdentifier }),
      { abortSignal: budget.signalWithin(5000) },
    );
    budget.check();
    const subject = user.UserAttributes?.find((attribute) => attribute.Name === 'sub')?.Value;
    requireCondition(
      subject && user.Enabled && user.Username,
      401,
      'PROVIDER_SUBJECT_REQUIRED',
      '활성 제공자 주체를 확인할 수 없습니다.',
    );
    const handle: ProviderHandle = {
      username: user.Username,
      step:
        result.ChallengeName === 'SOFTWARE_TOKEN_MFA'
          ? 'SOFTWARE_TOKEN_MFA'
          : result.ChallengeName === 'MFA_SETUP'
            ? 'MFA_SETUP'
            : 'ACCESS',
      ...(result.Session ? { session: result.Session } : {}),
      ...(result.AuthenticationResult?.AccessToken
        ? { accessToken: result.AuthenticationResult.AccessToken }
        : {}),
    };
    return {
      issuer: this.issuer(audience),
      subject,
      audience,
      ...this.evidence(result.$metadata.requestId, audience, subject, 'PASSWORD_VERIFIED'),
      providerHandle: JSON.stringify(handle),
      requiresEnrolment: handle.step !== 'SOFTWARE_TOKEN_MFA',
    };
  }
  private async proof(
    proof: PasswordProof,
    accessToken: string,
    requestId: string | undefined,
    operation: string,
    budget: ExecutionBudget,
  ): Promise<FactorProof> {
    const user = await this.client.send(new GetUserCommand({ AccessToken: accessToken }), {
      abortSignal: budget.signalWithin(5000),
    });
    budget.check();
    const subject = user.UserAttributes?.find((attribute) => attribute.Name === 'sub')?.Value;
    requireCondition(
      subject === proof.subject && user.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA'),
      401,
      'PROVIDER_FACTOR_REQUIRED',
      '현재 주체의 실제 TOTP 근거가 필요합니다.',
    );
    return {
      issuer: proof.issuer,
      subject: proof.subject,
      audience: proof.audience,
      ...this.evidence(requestId, proof.audience, proof.subject, operation),
      methodRef: 'cognito-totp:' + proof.subject,
      verified: true,
    };
  }
  async factor(
    proof: PasswordProof,
    response: string,
    budget = ExecutionBudget.current() ?? new ExecutionBudget(10000),
  ): Promise<FactorProof> {
    const handle = this.handle(proof);
    requireCondition(
      handle.step === 'SOFTWARE_TOKEN_MFA' && handle.session,
      403,
      'PROVIDER_MFA_CHALLENGE_REQUIRED',
      'TOTP 로그인 challenge가 필요합니다.',
    );
    const result = await this.client.send(
      new RespondToAuthChallengeCommand({
        ClientId: this.config.pools[proof.audience].clientId,
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        Session: handle.session,
        ChallengeResponses: {
          USERNAME: handle.username,
          SOFTWARE_TOKEN_MFA_CODE: response,
          ...this.hash(proof.audience, handle.username),
        },
      }),
      { abortSignal: budget.signalWithin(5000) },
    );
    budget.check();
    requireCondition(
      result.AuthenticationResult?.AccessToken,
      401,
      'PROVIDER_FACTOR_REQUIRED',
      'TOTP 검증 완료를 확인할 수 없습니다.',
    );
    return this.proof(
      proof,
      result.AuthenticationResult.AccessToken,
      result.$metadata.requestId,
      'SOFTWARE_TOKEN_MFA_VERIFIED',
      budget,
    );
  }
  async beginEnrolment(
    proof: PasswordProof,
    budget = ExecutionBudget.current() ?? new ExecutionBudget(10000),
  ): Promise<{ secret: string; providerHandle: string }> {
    const handle = this.handle(proof);
    requireCondition(
      handle.step === 'MFA_SETUP' || handle.step === 'ACCESS',
      503,
      'PROVIDER_ENROLMENT_PREPARATION_REQUIRED',
      '기존 제공자 수단 제거/재등록 준비 결과를 확인해야 합니다.',
    );
    const result = await this.client.send(
      new AssociateSoftwareTokenCommand(
        handle.accessToken ? { AccessToken: handle.accessToken } : { Session: handle.session },
      ),
      { abortSignal: budget.signalWithin(5000) },
    );
    budget.check();
    requireCondition(
      result.SecretCode,
      503,
      'PROVIDER_ENROLMENT_PREPARATION_REQUIRED',
      'TOTP 등록 자료를 확인할 수 없습니다.',
    );
    return {
      secret: result.SecretCode,
      providerHandle: JSON.stringify({
        ...handle,
        ...(result.Session ? { session: result.Session } : {}),
      }),
    };
  }
  async completeEnrolment(
    proof: PasswordProof,
    response: string,
    budget = ExecutionBudget.current() ?? new ExecutionBudget(10000),
  ): Promise<FactorProof> {
    const handle = this.handle(proof);
    const verified = await this.client.send(
      new VerifySoftwareTokenCommand({
        UserCode: response,
        ...(handle.accessToken ? { AccessToken: handle.accessToken } : { Session: handle.session }),
      }),
      { abortSignal: budget.signalWithin(5000) },
    );
    budget.check();
    requireCondition(
      verified.Status === 'SUCCESS',
      401,
      'PROVIDER_FACTOR_REQUIRED',
      'TOTP 등록 검증 완료가 필요합니다.',
    );
    let accessToken = handle.accessToken;
    if (accessToken)
      await this.client.send(
        new SetUserMFAPreferenceCommand({
          AccessToken: accessToken,
          SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
        }),
        { abortSignal: budget.signalWithin(5000) },
      );
    else {
      const final = await this.client.send(
        new RespondToAuthChallengeCommand({
          ClientId: this.config.pools[proof.audience].clientId,
          ChallengeName: 'MFA_SETUP',
          Session: verified.Session,
          ChallengeResponses: {
            USERNAME: handle.username,
            ...this.hash(proof.audience, handle.username),
          },
        }),
        { abortSignal: budget.signalWithin(5000) },
      );
      accessToken = final.AuthenticationResult?.AccessToken;
    }
    budget.check();
    requireCondition(
      accessToken,
      401,
      'PROVIDER_FACTOR_REQUIRED',
      'TOTP 등록 후 인증 완료가 필요합니다.',
    );
    return this.proof(
      proof,
      accessToken,
      verified.$metadata.requestId,
      'SOFTWARE_TOKEN_ENROLMENT_VERIFIED',
      budget,
    );
  }
}
