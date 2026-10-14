import {
  AdminDeleteSoftwareTokenCommand,
  AdminUserGlobalSignOutCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { ExecutionBudget } from '@oms/contracts';
import { requireCondition, SchemaValidator } from '@oms/contracts';
import type {
  PasswordProof,
  RecoveryProviderPort,
  RecoveryProviderOperation,
  RecoveryProviderTarget,
  RecoveryProviderObservation,
} from '@oms/core';
import { CognitoProvider } from './cognito.js';
import type { CognitoConfiguration } from './cognito.js';
import { recoveryCapabilities, assertRecoveryCapability } from './identity-capabilities.js';

// AssociateSoftwareToken returns the setup key used verbatim in otpauth's
// Base32 secret field. The U2 provider port/vault carries the underlying key
// bytes, so the PC presentation must not Base32-encode its ASCII spelling.
export function cognitoTotpSecretBytes(encoded: string): Buffer {
  requireCondition(
    typeof encoded === 'string' &&
      encoded.length >= 16 &&
      encoded.length <= 65536 &&
      /^[A-Z2-7]+$/.test(encoded),
    503,
    'RECOVERY_FACTOR_ENCODING',
    '원래 제공자의 정규 TOTP 자료 표현을 확인해야 합니다.',
  );
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
    bytes: number[] = [];
  let bits = 0,
    accumulator = 0;
  for (const character of encoded) {
    accumulator = (accumulator << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 255);
      accumulator &= (1 << bits) - 1;
    }
  }
  requireCondition(
    bytes.length > 0 && [0, 2, 4, 5, 7].includes(encoded.length % 8) && accumulator === 0,
    503,
    'RECOVERY_FACTOR_ENCODING',
    '누락/비정규 끝 bit를 TOTP 자료로 해석하지 않습니다.',
  );
  return Buffer.from(bytes);
}

// SDK command support is a local double profile. It is never evidence of the
// actual pool/IAM/identity/domestic path or termination of an original call.
export class CognitoRecoveryPort implements RecoveryProviderPort {
  readonly capabilities;
  private readonly identity: CognitoProvider | null;
  private readonly schema = new SchemaValidator();
  constructor(
    private readonly config: CognitoConfiguration,
    private readonly client?: CognitoIdentityProviderClient,
    profile: 'LOCAL_SDK_DOUBLE' | 'UNREGISTERED' = 'UNREGISTERED',
  ) {
    requireCondition(
      config.region === 'ap-northeast-2' &&
        config.pools.CUSTOMER.poolId !== config.pools.STAFF.poolId &&
        config.pools.CUSTOMER.clientId !== config.pools.STAFF.clientId,
      503,
      'RECOVERY_POOLS_REQUIRED',
      '원래 고객/직원 pool/client 경계를 유지해야 합니다.',
    );
    if (profile === 'LOCAL_SDK_DOUBLE')
      requireCondition(
        client &&
          !(client instanceof CognitoIdentityProviderClient) &&
          Object.values(config.pools).every((pool) =>
            /^ap-northeast-2_[A-Za-z0-9]*synthetic[A-Za-z0-9]*$/i.test(pool.poolId),
          ),
        503,
        'RECOVERY_SDK_DOUBLE_REQUIRED',
        '네트워크 client/실제 pool은 local SDK double로 등록할 수 없습니다.',
      );
    this.capabilities = recoveryCapabilities('COGNITO', profile);
    this.identity = profile === 'LOCAL_SDK_DOUBLE' ? new CognitoProvider(config, client) : null;
  }
  private target(
    operation: RecoveryProviderOperation,
    target: RecoveryProviderTarget,
    budget: ExecutionBudget,
  ): void {
    assertRecoveryCapability(this.capabilities, operation);
    budget.check();
    for (const [field, entity] of [
      ['caseRef', 'RecoveryCase'],
      ['accountRef', 'Account'],
      ['bindingRef', 'ProviderBinding'],
    ] as const) {
      this.schema.validateUri(
        'urn:oms:contract:u2-access-additions:1#/$defs/' + entity,
        target[field],
      );
    }
    requireCondition(
      target.issuer ===
        'https://cognito-idp.ap-northeast-2.amazonaws.com/' +
          this.config.pools[target.audience]?.poolId &&
        target.subject.length >= 1 &&
        target.subject.length <= 128 &&
        /^[\p{L}\p{M}\p{S}\p{N}\p{P}]+$/u.test(target.subject) &&
        target.workId.length > 0 &&
        target.approvedOperationId.length > 0 &&
        /^[a-f0-9]{64}$/.test(target.inputDigest) &&
        target.bindingGeneration >= 1 &&
        target.securityGeneration >= 1 &&
        Date.now() < Date.parse(target.deadlineAt),
      403,
      'RECOVERY_PROVIDER_TARGET',
      '원래 현재 pool/issuer/subject/operation/input/기한을 확인하세요.',
    );
  }
  private unknown(
    target: RecoveryProviderTarget,
    providerRequestId = '',
  ): RecoveryProviderObservation {
    return {
      approvedOperationId: target.approvedOperationId,
      workId: target.workId,
      bindingRef: target.bindingRef,
      inputDigest: target.inputDigest,
      epoch: target.epoch,
      providerRequestId,
      knowledge: 'UNKNOWN',
      effect: 'UNCONFIRMED',
      terminal: false,
      evidenceRefs: [],
      observedAt: new Date().toISOString(),
    };
  }
  async execute(
    operation: RecoveryProviderOperation,
    target: RecoveryProviderTarget,
    secret: Buffer | null,
    budget: ExecutionBudget,
  ): Promise<RecoveryProviderObservation> {
    this.target(operation, target, budget);
    const input = {
        UserPoolId: this.config.pools[target.audience].poolId,
        Username: target.subject,
      },
      options = {
        abortSignal: budget.signalWithin(
          Math.min(5000, Math.max(1, Date.parse(target.deadlineAt) - Date.now())),
        ),
      };
    let send: () => Promise<{ $metadata: { requestId?: string } }>;
    if (operation === 'REMOVE_ORIGINAL_FACTOR')
      send = () => this.client!.send(new AdminDeleteSoftwareTokenCommand(input), options);
    else if (operation === 'SIGN_OUT_ORIGINAL_SESSIONS')
      send = () => this.client!.send(new AdminUserGlobalSignOutCommand(input), options);
    else {
      requireCondition(
        operation === 'REPLACE_FIRST_FACTOR' && secret,
        400,
        'RECOVERY_PROVIDER_OPERATION',
        '등록된 원래 변경 목적/암호 자료가 필요합니다.',
      );
      const password = new TextDecoder('utf-8', { fatal: true }).decode(secret);
      requireCondition(
        password.length > 0 && password.length <= 256 && /^\S+$/.test(password),
        400,
        'RECOVERY_PASSWORD_FORMAT',
        '제공자 허용 범위의 첫 수단을 입력하세요.',
      );
      send = () =>
        this.client!.send(
          new AdminSetUserPasswordCommand({ ...input, Password: password, Permanent: true }),
          options,
        );
    }
    try {
      const response = await send();
      budget.check();
      return this.unknown(target, response.$metadata.requestId ?? '');
    } catch (error) {
      const observed = error as { $metadata?: { requestId?: string } };
      return this.unknown(target, observed.$metadata?.requestId ?? '');
    }
  }
  private proof(target: RecoveryProviderTarget, proof: PasswordProof): void {
    requireCondition(
      proof.issuer === target.issuer &&
        proof.subject === target.subject &&
        proof.audience === target.audience &&
        proof.evidenceRefs.length > 0,
      403,
      'RECOVERY_PROVIDER_PROOF',
      '원래 당사자의 실제 password challenge와 현재 연결을 대조하세요.',
    );
  }
  async beginFactor(target: RecoveryProviderTarget, proof: PasswordProof, budget: ExecutionBudget) {
    this.target('BEGIN_NEW_FACTOR', target, budget);
    this.proof(target, proof);
    const prepared = await this.identity!.beginEnrolment(proof, budget);
    return {
      secret: cognitoTotpSecretBytes(prepared.secret),
      providerChallenge: Buffer.from(prepared.providerHandle),
      observation: this.unknown(target),
    };
  }
  async verifyFactor(
    target: RecoveryProviderTarget,
    proof: PasswordProof,
    providerChallenge: Buffer,
    response: Buffer,
    budget: ExecutionBudget,
  ) {
    this.target('VERIFY_NEW_FACTOR', target, budget);
    this.proof(target, proof);
    requireCondition(
      providerChallenge.length > 0 &&
        providerChallenge.length <= 65536 &&
        /^[0-9]{6}$/.test(response.toString('utf8')),
      400,
      'RECOVERY_FACTOR_FORMAT',
      '원래 등록 challenge와 6자리 확인을 입력하세요.',
    );
    const observed = await this.identity!.completeEnrolment(
      {
        ...proof,
        providerHandle: new TextDecoder('utf-8', { fatal: true }).decode(providerChallenge),
      },
      response.toString('utf8'),
      budget,
    );
    return {
      methodRef: observed.methodRef,
      observation: this.unknown(target, observed.verification?.providerRequestId ?? ''),
    };
  }
  async observeOriginal(
    target: RecoveryProviderTarget,
    budget: ExecutionBudget,
  ): Promise<RecoveryProviderObservation> {
    budget.check();
    return this.unknown(target);
  }
}
