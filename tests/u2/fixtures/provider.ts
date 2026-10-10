export {
  SyntheticIdentityProvider,
  syntheticPassword,
  syntheticFactor,
} from '../../u1/fixtures/identity.js';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import type { ExecutionBudget } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import type {
  IdentityProvider,
  FactorProof,
  RecoveryProviderPort,
  RecoveryProviderOperation,
  RecoveryProviderTarget,
  RecoveryProviderObservation,
  PasswordProof,
} from '@oms/core';
import { syntheticPassword as initialPassword } from '../../u1/fixtures/identity.js';
import { recoveryCapabilities } from '@oms/integrations';
export class StatefulRecoveryProvider implements RecoveryProviderPort, IdentityProvider {
  readonly kind = 'SYNTHETIC' as const;
  readonly capabilities = recoveryCapabilities('SYNTHETIC', 'LOCAL_SYNTHETIC');
  readonly calls: { operation: RecoveryProviderOperation; target: RecoveryProviderTarget }[] = [];
  readonly factorCalls: {
    operation: 'BEGIN_NEW_FACTOR' | 'VERIFY_NEW_FACTOR';
    target: RecoveryProviderTarget;
  }[] = [];
  readonly original = new Map<string, RecoveryProviderObservation>();
  readonly subjects = new Map<
    string,
    {
      removed: boolean;
      signedOut: boolean;
      passwordDigest: string | null;
      secret: Buffer | null;
      challenge: string | null;
      verified: boolean;
    }
  >();
  mode: 'KNOWN' | 'UNKNOWN' | 'FORGED' | 'THROW' = 'KNOWN';
  barrier: Promise<void> | null = null;
  active = 0;
  maximum = 0;
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly factorNow: () => Date = now,
  ) {}
  async password(
    audience: 'CUSTOMER' | 'STAFF',
    login: string,
    password: string,
  ): Promise<PasswordProof> {
    const issuer = 'urn:synthetic:identity:' + audience,
      state = this.subjects.get(issuer + ':' + login),
      digest = createHmac('sha256', Buffer.alloc(32, 41))
        .update(Buffer.from(password))
        .digest('hex');
    requireCondition(
      state?.passwordDigest ? digest === state.passwordDigest : password === initialPassword,
      401,
      'AUTHENTICATION_DENIED',
      '현재 합성 첫 인증 수단을 확인하세요.',
    );
    return {
      issuer,
      subject: login,
      audience,
      evidenceRefs: [
        {
          owner: 'OperationalAssurance',
          entity: 'OperationalEvidence',
          id: 'synthetic-password-' + randomUUID(),
          revision: 1,
        },
      ],
      providerHandle: randomUUID(),
      requiresEnrolment: state?.verified !== true,
    };
  }
  async factor(proof: PasswordProof, response: string): Promise<FactorProof> {
    const state = this.subjects.get(proof.issuer + ':' + proof.subject);
    requireCondition(
      state?.verified && state.secret,
      401,
      'MFA_DENIED',
      '실제 확인된 현재 합성 수단이 필요합니다.',
    );
    const target = { issuer: proof.issuer, subject: proof.subject } as RecoveryProviderTarget;
    requireCondition(
      this.code(target) === response,
      401,
      'MFA_DENIED',
      '현재 실제 합성 TOTP를 확인하세요.',
    );
    return {
      issuer: proof.issuer,
      subject: proof.subject,
      audience: proof.audience,
      verified: true,
      methodRef: 'synthetic-new-factor:' + proof.subject,
      evidenceRefs: proof.evidenceRefs,
    };
  }
  async beginEnrolment(): Promise<{ secret: string; providerHandle: string }> {
    throw Error('합성 복구는 등록된 당사자 purpose port로 준비해야 합니다.');
  }
  async completeEnrolment(proof: PasswordProof, response: string): Promise<FactorProof> {
    return this.factor(proof, response);
  }
  private subject(target: RecoveryProviderTarget) {
    const key = target.issuer + ':' + target.subject;
    if (!this.subjects.has(key))
      this.subjects.set(key, {
        removed: false,
        signedOut: false,
        passwordDigest: null,
        secret: null,
        challenge: null,
        verified: false,
      });
    return this.subjects.get(key)!;
  }
  private observation(
    target: RecoveryProviderTarget,
    effect: RecoveryProviderObservation['effect'],
  ): RecoveryProviderObservation {
    return {
      approvedOperationId: target.approvedOperationId,
      workId: target.workId,
      bindingRef: target.bindingRef,
      inputDigest: target.inputDigest,
      epoch: target.epoch,
      providerRequestId: 'synthetic-stateful-' + randomUUID(),
      knowledge: this.mode === 'UNKNOWN' ? 'UNKNOWN' : 'KNOWN',
      effect: this.mode === 'UNKNOWN' ? 'UNCONFIRMED' : effect,
      terminal: this.mode !== 'UNKNOWN',
      evidenceRefs: this.mode === 'UNKNOWN' ? [] : [target.caseRef],
      observedAt: this.now().toISOString(),
    };
  }
  async execute(
    operation: RecoveryProviderOperation,
    target: RecoveryProviderTarget,
    secret: Buffer | null,
    budget: ExecutionBudget,
  ) {
    budget.check();
    this.calls.push({ operation, target: structuredClone(target) });
    this.maximum = Math.max(this.maximum, ++this.active);
    try {
      if (this.barrier) await this.barrier;
      if (this.mode === 'THROW') throw Error('synthetic-lost-original-response');
      const subject = this.subject(target);
      let effect: RecoveryProviderObservation['effect'];
      if (operation === 'REMOVE_ORIGINAL_FACTOR') {
        subject.removed = true;
        subject.verified = false;
        effect = 'REMOVED';
      } else if (operation === 'SIGN_OUT_ORIGINAL_SESSIONS') {
        subject.signedOut = true;
        effect = 'SIGNED_OUT';
      } else {
        requireCondition(
          operation === 'REPLACE_FIRST_FACTOR' && secret,
          400,
          'SYNTHETIC_OPERATION',
          '명시 첫 수단만 변경합니다.',
        );
        subject.passwordDigest = createHmac('sha256', Buffer.alloc(32, 41))
          .update(secret)
          .digest('hex');
        effect = 'PASSWORD_REPLACED';
      }
      const result = this.observation(target, effect);
      this.original.set(target.approvedOperationId, {
        ...result,
        knowledge: 'KNOWN',
        effect,
        terminal: true,
        evidenceRefs: [target.caseRef],
      });
      return this.mode === 'FORGED' ? { ...result, inputDigest: '0'.repeat(64) } : result;
    } finally {
      this.active--;
    }
  }
  async beginFactor(target: RecoveryProviderTarget, proof: PasswordProof, budget: ExecutionBudget) {
    budget.check();
    this.factorCalls.push({ operation: 'BEGIN_NEW_FACTOR', target: structuredClone(target) });
    requireCondition(
      proof.issuer === target.issuer &&
        proof.subject === target.subject &&
        proof.audience === target.audience,
      403,
      'SYNTHETIC_PROOF',
      '원래 password proof가 필요합니다.',
    );
    const subject = this.subject(target);
    requireCondition(
      subject.removed && subject.signedOut,
      409,
      'SYNTHETIC_OLD_FACTOR',
      '옛 수단/세션 종료 이후 등록합니다.',
    );
    subject.secret = randomBytes(32);
    subject.challenge = randomUUID();
    subject.verified = false;
    return {
      secret: Buffer.from(subject.secret),
      providerChallenge: Buffer.from(subject.challenge),
      observation: {
        ...this.observation(target, 'UNCONFIRMED'),
        knowledge: 'UNAVAILABLE' as const,
        terminal: false,
        evidenceRefs: [],
      },
    };
  }
  code(target: RecoveryProviderTarget): string {
    const secret = this.subject(target).secret;
    requireCondition(secret, 400, 'SYNTHETIC_PREPARATION', '새 수단 준비가 필요합니다.');
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(this.factorNow().getTime() / 30000)));
    const digest = createHmac('sha1', secret).update(counter).digest(),
      offset = digest[digest.length - 1]! & 15,
      value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return String(value).padStart(6, '0');
  }
  async verifyFactor(
    target: RecoveryProviderTarget,
    proof: PasswordProof,
    providerChallenge: Buffer,
    response: Buffer,
    budget: ExecutionBudget,
  ) {
    budget.check();
    this.factorCalls.push({ operation: 'VERIFY_NEW_FACTOR', target: structuredClone(target) });
    const subject = this.subject(target);
    requireCondition(
      proof.issuer === target.issuer &&
        proof.subject === target.subject &&
        proof.audience === target.audience &&
        subject.challenge === providerChallenge.toString() &&
        this.code(target) === response.toString(),
      401,
      'SYNTHETIC_FACTOR',
      '원래 새 challenge/실제 합성 TOTP를 확인하세요.',
    );
    subject.verified = true;
    const observation = this.observation(target, 'FACTOR_VERIFIED');
    this.original.set(target.approvedOperationId, observation);
    return { methodRef: 'synthetic-new-factor:' + target.subject, observation };
  }
  async observeOriginal(target: RecoveryProviderTarget, budget: ExecutionBudget) {
    budget.check();
    return (
      this.original.get(target.approvedOperationId) ?? {
        ...this.observation(target, 'UNCONFIRMED'),
        knowledge: 'UNKNOWN' as const,
        terminal: false,
        evidenceRefs: [],
      }
    );
  }
}
