import type { Audience, ServiceContext } from '@oms/contracts';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import { EncryptedChallenges, ProtectedStore } from '@oms/persistence';
import type {
  FactorProof,
  FactorRemovalProof,
  IdentityProvider,
  IdentityRuntime,
  PasswordProof,
} from './identity-provider.js';
import { RecoveryCodes } from './recovery-codes.js';
import type { PartyClaimContexts } from './party-claim-context.js';
import type { RecoveryHandoffs } from './recovery-handoff.js';
import type { EnrollmentAuthorities } from './enrollment-authority.js';
import type { RecoveryCases, SavedCodeRecoveries } from './recovery-case.js';
import type { RecoveryHolds } from './recovery-hold.js';
import type { RecoveryCompletions } from './recovery-completion.js';
import type { EmergencyRecoveries } from './emergency-recovery.js';
import type { RecoveryFactorEnrollment } from './identity-factor.js';
import type { RecoveryPurposeCodes } from './identity-codes.js';
export interface IdentityU2Runtime {
  readonly parties: PartyClaimContexts;
  readonly handoffs: RecoveryHandoffs;
  readonly authorities: EnrollmentAuthorities;
  readonly cases?: RecoveryCases;
  readonly holds?: RecoveryHolds;
  readonly savedCodes?: SavedCodeRecoveries;
  readonly completions?: RecoveryCompletions;
  readonly emergencies?: EmergencyRecoveries;
  readonly recoveryFactors?: RecoveryFactorEnrollment;
  readonly recoveryCodes?: RecoveryPurposeCodes;
}
export interface LoginPreparation {
  kind: 'PASSWORD';
  audience: Exclude<Audience, 'SYSTEM'>;
  loginIdentifier: string;
  deadline: number;
  clientBinding: string;
}
export interface Attempt {
  kind: 'MFA';
  clientBinding: string;
  proof: PasswordProof;
  binding: ModelData;
  deadline: number;
  factor: FactorProof | null;
  issuedSet: string | null;
  secretHandle: string | null;
  recovery: boolean;
  recoveryCaseRef?: import('@oms/contracts').Ref;
  leaseId?: string;
  challengeId?: string;
  consumed?: boolean;
}
export interface IdentityOutcome {
  challengeId: string | null;
  phase: 'MFA_REQUIRED' | 'RECOVERY_REVIEW' | 'MFA_VERIFIED';
  accountId: string;
  sessionToken?: string;
  browserBinding?: string;
}
export interface IdentityInternal {
  readonly store: ProtectedStore;
  readonly provider: IdentityProvider;
  readonly runtime: IdentityRuntime;
  readonly codes: RecoveryCodes;
  readonly challenges: EncryptedChallenges<Attempt>;
  readonly preparations: EncryptedChallenges<LoginPreparation>;
  sessionId(token: string): string;
  recordProviderProof(proof: PasswordProof | FactorProof): Promise<void>;
  mutate(
    key: string,
    input: unknown,
    operation: (transaction: ProtectedTransaction, requestId: string) => Promise<void>,
  ): Promise<void>;
  limit(subject: string, network: string): Promise<void>;
  ingress(audience: Audience, ingressProof: unknown): Promise<void>;
  withAttempt<R>(id: string, operation: (attempt: Attempt) => Promise<R>): Promise<R>;
  completeChallenge(
    challengeId: string,
    response: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome>;
  readIdentity(context: ServiceContext): Promise<unknown>;
  publicView(outcome: {
    challengeId: string | null;
    phase: string;
    accountId?: string;
  }): Promise<unknown>;
  startLogin(
    audience: Exclude<Audience, 'SYSTEM'>,
    loginIdentifier: string,
    ingressProof: unknown,
  ): Promise<{ challengeId: string; phase: 'PASSWORD_REQUIRED' }>;
  completePassword(
    challengeId: string,
    password: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome>;
  login(
    audience: Exclude<Audience, 'SYSTEM'>,
    login: string,
    password: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome>;
  verifyFactor(
    challengeId: string,
    response: string,
    network: string,
    ingressProof: unknown,
    retainForCodeReissue?: boolean,
  ): Promise<IdentityOutcome>;
  validateFactor(attempt: Attempt, proof: FactorProof): void;
  beginEnrolment(challengeId: string, ingressProof: unknown): Promise<{ secret: string }>;
  completeEnrolment(
    challengeId: string,
    response: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome>;
  issueRecoveryCodes(
    challengeId: string,
    ingressProof: unknown,
  ): Promise<{ setId: string; codes: string[] }>;
  acknowledgeRecoveryCodes(
    challengeId: string,
    setId: string,
    stored: boolean,
    ingressProof: unknown,
  ): Promise<IdentityOutcome>;
  recover(
    challengeId: string,
    setId: string,
    code: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome>;
  checkAttemptCurrent(attempt: Attempt, transaction: ProtectedTransaction): Promise<void>;
  finish(challengeId: string, attempt: Attempt): Promise<IdentityOutcome>;
  authenticate(
    token: string,
    audience: Exclude<Audience, 'SYSTEM'>,
    correlationId: string,
    ingressProof: unknown,
  ): Promise<ServiceContext>;
  logout(token: string): Promise<void>;
  recordRegisteredActivity(
    token: string,
    audience: Exclude<Audience, 'SYSTEM'>,
    operation: string,
    correlationId: string,
    ingressProof: unknown,
  ): Promise<void>;
  recordConfirmedFactorRemoval(challengeId: string, observed: FactorRemovalProof): Promise<void>;
}
