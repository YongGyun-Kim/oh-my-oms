import type { Audience, Ref } from '@oms/contracts';
import type { ExecutionBudget } from '@oms/contracts';
export interface ProviderVerification {
  evidenceId: string;
  provider: 'COGNITO' | 'KEYCLOAK';
  issuer: string;
  subject: string;
  audience: Exclude<Audience, 'SYSTEM'>;
  operation: string;
  providerRequestId: string;
  verifiedAt: string;
  outcome: 'VERIFIED';
}
export interface PasswordProof {
  issuer: string;
  subject: string;
  audience: Exclude<Audience, 'SYSTEM'>;
  evidenceRefs: Ref[];
  providerHandle: string;
  requiresEnrolment: boolean;
  verification?: ProviderVerification;
}
export interface FactorProof {
  issuer: string;
  subject: string;
  audience: Exclude<Audience, 'SYSTEM'>;
  evidenceRefs: Ref[];
  methodRef: string;
  verified: true;
  verification?: ProviderVerification;
}
export interface FactorRemovalProof {
  issuer: string;
  subject: string;
  audience: Exclude<Audience, 'SYSTEM'>;
  originalOperationRef: Ref;
  evidenceRefs: Ref[];
  outcome: 'REMOVED';
  terminal: true;
}
export interface IdentityProvider {
  readonly kind: 'COGNITO' | 'KEYCLOAK' | 'SYNTHETIC';
  password(
    audience: Exclude<Audience, 'SYSTEM'>,
    loginIdentifier: string,
    password: string,
    budget?: ExecutionBudget,
  ): Promise<PasswordProof>;
  factor(proof: PasswordProof, response: string, budget?: ExecutionBudget): Promise<FactorProof>;
  beginEnrolment(
    proof: PasswordProof,
    budget?: ExecutionBudget,
  ): Promise<{ secret: string; providerHandle: string }>;
  completeEnrolment(
    proof: PasswordProof,
    response: string,
    budget?: ExecutionBudget,
  ): Promise<FactorProof>;
}
export interface IdentityRuntime {
  synthetic: boolean;
  verifierKey: Buffer;
  now: () => Date;
  staffIngress: (proof: unknown) => Promise<boolean>;
}
export type RecoveryProviderOperation =
  | 'REMOVE_ORIGINAL_FACTOR'
  | 'SIGN_OUT_ORIGINAL_SESSIONS'
  | 'REPLACE_FIRST_FACTOR'
  | 'BEGIN_NEW_FACTOR'
  | 'VERIFY_NEW_FACTOR';
export interface RecoveryProviderTarget {
  approvedOperationId: string;
  workId: string;
  caseRef: Ref;
  accountRef: Ref;
  bindingRef: Ref;
  issuer: string;
  subject: string;
  audience: Exclude<Audience, 'SYSTEM'>;
  bindingGeneration: number;
  securityGeneration: number;
  epoch: string;
  inputDigest: string;
  deadlineAt: string;
}
export interface RecoveryProviderObservation {
  approvedOperationId: string;
  workId: string;
  bindingRef: Ref;
  inputDigest: string;
  epoch: string;
  providerRequestId: string;
  knowledge: 'KNOWN' | 'UNKNOWN' | 'UNAVAILABLE' | 'CONFLICT';
  effect:
    'REMOVED' | 'SIGNED_OUT' | 'PASSWORD_REPLACED' | 'FACTOR_VERIFIED' | 'ISOLATED' | 'UNCONFIRMED';
  terminal: boolean;
  evidenceRefs: Ref[];
  observedAt: string;
}
export interface RecoveryProviderCapabilities {
  readonly provider: 'COGNITO' | 'KEYCLOAK' | 'SYNTHETIC';
  readonly profile: 'LOCAL_SYNTHETIC' | 'LOCAL_SDK_DOUBLE' | 'UNREGISTERED';
  readonly operations: readonly RecoveryProviderOperation[];
  readonly sdkMaxAttempts: 1;
  readonly subjectMutationLimit: 1;
  readonly originalTermination: boolean;
  readonly lateEffectIsolation: boolean;
  readonly realActivation: false;
}
export interface RecoveryProviderPort {
  readonly capabilities: RecoveryProviderCapabilities;
  execute(
    operation: RecoveryProviderOperation,
    target: RecoveryProviderTarget,
    secret: Buffer | null,
    budget: ExecutionBudget,
  ): Promise<RecoveryProviderObservation>;
  beginFactor(
    target: RecoveryProviderTarget,
    proof: PasswordProof,
    budget: ExecutionBudget,
  ): Promise<{
    secret: Buffer;
    providerChallenge: Buffer;
    observation: RecoveryProviderObservation;
  }>;
  verifyFactor(
    target: RecoveryProviderTarget,
    proof: PasswordProof,
    providerChallenge: Buffer,
    response: Buffer,
    budget: ExecutionBudget,
  ): Promise<{ methodRef: string; observation: RecoveryProviderObservation }>;
  observeOriginal(
    target: RecoveryProviderTarget,
    budget: ExecutionBudget,
  ): Promise<RecoveryProviderObservation>;
}
