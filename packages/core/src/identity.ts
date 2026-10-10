import type { Audience, ServiceContext } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import { ref } from './references.js';
import type { ProtectedTransaction } from '@oms/persistence';
import { EncryptedChallenges, ProtectedStore } from '@oms/persistence';
import { hkdfSync } from 'node:crypto';
import * as identitychallenges from './identity-challenges.js';
import * as identitycodes from './identity-codes.js';
import * as identityfactor from './identity-factor.js';
import * as identitypassword from './identity-password.js';
import * as identityproofs from './identity-proofs.js';
import type {
  FactorProof,
  FactorRemovalProof,
  IdentityProvider,
  IdentityRuntime,
  PasswordProof,
} from './identity-provider.js';
import * as identitysecurityevents from './identity-security-events.js';
import * as identitysession from './identity-session.js';
import type {
  Attempt,
  IdentityInternal,
  IdentityOutcome,
  LoginPreparation,
  IdentityU2Runtime,
} from './identity-state.js';
import { RecoveryCodes } from './recovery-codes.js';
export type { IdentityOutcome, IdentityU2Runtime } from './identity-state.js';
export class IdentityRecovery {
  private readonly internal: IdentityInternal;
  private readonly challenges: EncryptedChallenges<Attempt>;
  private readonly codes: RecoveryCodes;
  private readonly preparations: EncryptedChallenges<LoginPreparation>;
  constructor(
    readonly store: ProtectedStore,
    private readonly provider: IdentityProvider,
    private readonly runtime: IdentityRuntime,
    private readonly u2?: IdentityU2Runtime,
  ) {
    if (u2)
      requireCondition(
        u2.parties.store === store &&
          u2.handoffs.store === store &&
          u2.authorities.store === store &&
          (!u2.cases || u2.cases.store === store) &&
          (!u2.holds || u2.holds.store === store) &&
          (!u2.savedCodes || u2.savedCodes.store === store) &&
          (!u2.completions || u2.completions.store === store) &&
          (!u2.emergencies || u2.emergencies.store === store) &&
          (!u2.recoveryFactors || u2.recoveryFactors.store === store) &&
          (!u2.recoveryCodes || u2.recoveryCodes.store === store),
        503,
        'IDENTITY_U2_STORE_BINDING',
        '현재 신원 서비스와 같은 보호 원본의 목적 모듈을 등록해야 합니다.',
      );
    requireCondition(
      provider.kind !== 'SYNTHETIC' || runtime.synthetic,
      503,
      'SYNTHETIC_PROVIDER_FORBIDDEN',
      '운영에 합성 인증 제공자를 등록할 수 없습니다.',
    );
    this.codes = new RecoveryCodes(runtime.verifierKey);
    u2?.recoveryCodes?.assertVerifier(this.codes);
    const key = Buffer.from(
      hkdfSync('sha256', runtime.verifierKey, 'oms-auth-ephemeral-v1', 'challenge-aes256-gcm', 32),
    );
    this.challenges = new EncryptedChallenges(store.primary, key);
    this.preparations = new EncryptedChallenges(store.primary, key);
    this.internal = {
      store,
      provider,
      runtime,
      codes: this.codes,
      challenges: this.challenges,
      preparations: this.preparations,
      sessionId: this.sessionId.bind(this),
      recordProviderProof: this.recordProviderProof.bind(this),
      mutate: this.mutate.bind(this),
      limit: this.limit.bind(this),
      ingress: this.ingress.bind(this),
      withAttempt: <R>(id: string, operation: (attempt: Attempt) => Promise<R>) =>
        this.withAttempt(id, operation),
      completeChallenge: this.completeChallenge.bind(this),
      readIdentity: this.readIdentity.bind(this),
      publicView: this.publicView.bind(this),
      startLogin: this.startLogin.bind(this),
      completePassword: this.completePassword.bind(this),
      login: this.login.bind(this),
      verifyFactor: this.verifyFactor.bind(this),
      validateFactor: this.validateFactor.bind(this),
      beginEnrolment: this.beginEnrolment.bind(this),
      completeEnrolment: this.completeEnrolment.bind(this),
      issueRecoveryCodes: this.issueRecoveryCodes.bind(this),
      acknowledgeRecoveryCodes: this.acknowledgeRecoveryCodes.bind(this),
      recover: this.recover.bind(this),
      checkAttemptCurrent: this.checkAttemptCurrent.bind(this),
      finish: this.finish.bind(this),
      authenticate: this.authenticate.bind(this),
      logout: this.logout.bind(this),
      recordRegisteredActivity: this.recordRegisteredActivity.bind(this),
      recordConfirmedFactorRemoval: this.recordConfirmedFactorRemoval.bind(this),
    };
  }
  private sessionId(token: string): string {
    return identityproofs.sessionId(this.internal, token);
  }
  private purposeRuntime(): IdentityU2Runtime {
    requireCondition(
      this.u2,
      503,
      'IDENTITY_U2_UNREGISTERED',
      '현재 목적별 신원 모듈이 등록되지 않았습니다.',
    );
    return this.u2;
  }
  createPartyContext(...args: Parameters<IdentityU2Runtime['parties']['create']>) {
    return this.purposeRuntime().parties.create(...args);
  }
  verifyRecoveryParty(...args: Parameters<IdentityU2Runtime['handoffs']['verifyParty']>) {
    return this.purposeRuntime().handoffs.verifyParty(...args);
  }
  issueHandoff(...args: Parameters<IdentityU2Runtime['handoffs']['issue']>) {
    return this.purposeRuntime().handoffs.issue(...args);
  }
  claimHandoff(...args: Parameters<IdentityU2Runtime['handoffs']['claim']>) {
    return this.purposeRuntime().handoffs.claim(...args);
  }
  reobserveHandoff(...args: Parameters<IdentityU2Runtime['handoffs']['reobserve']>) {
    return this.purposeRuntime().handoffs.reobserve(...args);
  }
  authenticatePurpose(...args: Parameters<IdentityU2Runtime['authorities']['authenticate']>) {
    return this.purposeRuntime().authorities.authenticate(...args);
  }
  issueInvitationPurpose(...args: Parameters<IdentityU2Runtime['authorities']['issueInvitation']>) {
    return this.purposeRuntime().authorities.issueInvitation(...args);
  }
  async readOwnClaimResult(
    context: ServiceContext,
    sourceRef: import('@oms/contracts').Ref,
  ): Promise<unknown> {
    const authority = await this.purposeRuntime().authorities.assert(
      context,
      'MFA_REENROLMENT',
      undefined,
      true,
      true,
    );
    requireCondition(
      sourceRef.owner === 'IdentityRecovery' &&
        sourceRef.entity === 'ClaimReceipt' &&
        (authority.claimReceiptRef as import('@oms/contracts').Ref | null)?.id === sourceRef.id,
      404,
      'NOT_FOUND',
      '원래 본인 결과를 확인할 수 없습니다.',
    );
    const claim = await this.store.currentProtected('ClaimReceipt', sourceRef.id);
    requireCondition(
      claim &&
        (claim.accountRef as import('@oms/contracts').Ref).id === context.principalId &&
        (claim.authorityRef as import('@oms/contracts').Ref).id === authority.authorityId,
      404,
      'NOT_FOUND',
      '원래 본인 결과를 확인할 수 없습니다.',
    );
    await this.purposeRuntime().authorities.assert(
      context,
      'MFA_REENROLMENT',
      undefined,
      true,
      true,
    );
    return this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/LimitedOutcome',
      {
        claimReceiptRef: ref('ClaimReceipt', claim),
        authorityRef: ref('EnrollmentAuthority', authority),
        purpose: 'MFA_REENROLMENT',
        expiresAt: authority.expiresAt,
        phase: 'ENROLMENT_ONLY',
      },
    );
  }
  async readRecoveryStatus(
    context: ServiceContext,
    sourceRef: import('@oms/contracts').Ref,
  ): Promise<unknown> {
    const authority = await this.purposeRuntime().authorities.assert(
      context,
      'MFA_REENROLMENT',
      undefined,
      true,
      true,
    );
    requireCondition(
      sourceRef.owner === 'IdentityRecovery' &&
        sourceRef.entity === 'RecoveryCase' &&
        (authority.sourceRef as import('@oms/contracts').Ref | null)?.id === sourceRef.id,
      404,
      'NOT_FOUND',
      '원래 본인 상태를 확인할 수 없습니다.',
    );
    const source = await this.store.currentProtected('RecoveryCase', sourceRef.id);
    requireCondition(
      source &&
        (source.accountRef as import('@oms/contracts').Ref).id === context.principalId &&
        (source.enrollmentAuthorityRef as import('@oms/contracts').Ref | null)?.id ===
          authority.authorityId,
      404,
      'NOT_FOUND',
      '원래 본인 상태를 확인할 수 없습니다.',
    );
    const providerResultRefs: import('@oms/contracts').Ref[] = [];
    const originalOperations = source.originalOperationRefs as import('@oms/contracts').Ref[];
    if (originalOperations.length <= 20)
      for (const operation of originalOperations) {
        const observed = await this.store.currentProtected('IdentityOperationResult', operation.id);
        if (
          observed &&
          (observed.caseRef as import('@oms/contracts').Ref).id === source.caseId &&
          observed.epoch === source.epoch &&
          observed.knowledge === 'KNOWN' &&
          observed.terminal === true
        )
          providerResultRefs.push(ref('IdentityOperationResult', observed));
      }
    const result = {
      sourceRef: ref('RecoveryCase', source),
      state: source.state,
      knowledge: String(source.holdReason).includes('UNKNOWN') ? 'UNKNOWN' : 'KNOWN',
      remainingAction:
        source.state === 'COMPLETED'
          ? '새 일반 인증으로 로그인하세요.'
          : source.state === 'HOLD'
            ? '원래 보류 사유와 현재 확인 담당자의 후속 조치를 확인하세요.'
            : '새 수단 확인과 필수 복구 코드 보관을 완료하세요.',
      expiresAt: authority.expiresAt,
      actualEffect: source.state === 'COMPLETED' ? 'CONFIRMED' : 'UNCONFIRMED',
      noticeDelivery: source.noticeRef ? 'REQUESTED' : 'NOT_REQUESTED',
      providerResultRefs,
      originalEffectKnowledge:
        originalOperations.length > 0 && providerResultRefs.length === originalOperations.length
          ? 'KNOWN'
          : 'UNKNOWN',
    };
    await this.purposeRuntime().authorities.assert(
      context,
      'MFA_REENROLMENT',
      undefined,
      true,
      true,
    );
    return this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/StatusView',
      result,
    );
  }
  beginRecoveryEnrollment(
    context: ServiceContext,
    caseRef: import('@oms/contracts').Ref,
    passwordChallengeId: string,
    ingressProof: unknown = null,
  ) {
    const service = this.purposeRuntime().recoveryFactors;
    requireCondition(
      service,
      503,
      'RECOVERY_FACTOR_UNREGISTERED',
      '현재 새 수단 등록 모듈이 필요합니다.',
    );
    return service.begin(this.internal, context, caseRef, passwordChallengeId, ingressProof);
  }
  verifyRecoveryEnrollment(
    ...args: Parameters<NonNullable<IdentityU2Runtime['recoveryFactors']>['verify']>
  ) {
    const service = this.purposeRuntime().recoveryFactors;
    requireCondition(
      service,
      503,
      'RECOVERY_FACTOR_UNREGISTERED',
      '현재 새 수단 확인 모듈이 필요합니다.',
    );
    return service.verify(...args);
  }
  issueRecoveryPurposeCodes(
    ...args: Parameters<NonNullable<IdentityU2Runtime['recoveryCodes']>['issue']>
  ) {
    const service = this.purposeRuntime().recoveryCodes;
    requireCondition(
      service,
      503,
      'RECOVERY_CODES_UNREGISTERED',
      '현재 목적 코드 발급 모듈이 필요합니다.',
    );
    return service.issue(...args);
  }
  acknowledgeRecoveryPurposeCodes(
    ...args: Parameters<NonNullable<IdentityU2Runtime['recoveryCodes']>['acknowledge']>
  ) {
    const service = this.purposeRuntime().recoveryCodes;
    requireCondition(
      service,
      503,
      'RECOVERY_CODES_UNREGISTERED',
      '현재 목적 코드 보관 모듈이 필요합니다.',
    );
    return service.acknowledge(...args);
  }
  requestRecovery(...args: Parameters<NonNullable<IdentityU2Runtime['cases']>['request']>) {
    const cases = this.purposeRuntime().cases;
    requireCondition(
      cases,
      503,
      'RECOVERY_CASES_UNREGISTERED',
      '현재 복구 접수 모듈이 등록되지 않았습니다.',
    );
    return cases.request(...args);
  }
  resumeRecovery(...args: Parameters<NonNullable<IdentityU2Runtime['holds']>['resume']>) {
    const holds = this.purposeRuntime().holds;
    requireCondition(
      holds,
      503,
      'RECOVERY_HOLDS_UNREGISTERED',
      '현재 보류 검토 모듈이 등록되지 않았습니다.',
    );
    return holds.resume(...args);
  }
  closeRecovery(...args: Parameters<NonNullable<IdentityU2Runtime['holds']>['close']>) {
    const holds = this.purposeRuntime().holds;
    requireCondition(
      holds,
      503,
      'RECOVERY_HOLDS_UNREGISTERED',
      '현재 보류 종료 모듈이 등록되지 않았습니다.',
    );
    return holds.close(...args);
  }
  prepareSavedRecovery(challengeId: string, ingressProof: unknown = null) {
    const saved = this.purposeRuntime().savedCodes;
    requireCondition(
      saved,
      503,
      'SAVED_CODES_UNREGISTERED',
      '현재 직접 복구 모듈이 등록되지 않았습니다.',
    );
    return saved.prepare(this.internal, challengeId, ingressProof);
  }
  recoverSavedCode(
    caseRef: import('@oms/contracts').Ref,
    challengeId: string,
    setId: string,
    code: string,
    network: string,
    ingressProof: unknown = null,
  ) {
    const saved = this.purposeRuntime().savedCodes;
    requireCondition(
      saved,
      503,
      'SAVED_CODES_UNREGISTERED',
      '현재 직접 복구 모듈이 등록되지 않았습니다.',
    );
    return saved.consume(this.internal, caseRef, challengeId, setId, code, network, ingressProof);
  }
  completeRecovery(...args: Parameters<NonNullable<IdentityU2Runtime['completions']>['complete']>) {
    const service = this.purposeRuntime().completions;
    requireCondition(
      service,
      503,
      'RECOVERY_COMPLETION_UNREGISTERED',
      '현재 보호 완료 모듈이 등록되지 않았습니다.',
    );
    return service.complete(...args);
  }
  authenticateEmergency(
    ...args: Parameters<NonNullable<IdentityU2Runtime['emergencies']>['authenticate']>
  ) {
    const service = this.purposeRuntime().emergencies;
    requireCondition(
      service,
      503,
      'EMERGENCY_UNREGISTERED',
      '현재 별도 비공개 운영 모듈이 등록되지 않았습니다.',
    );
    return service.authenticate(...args);
  }
  resumeEmergencyRecovery(
    ...args: Parameters<NonNullable<IdentityU2Runtime['emergencies']>['resume']>
  ) {
    const service = this.purposeRuntime().emergencies;
    requireCondition(
      service,
      503,
      'EMERGENCY_UNREGISTERED',
      '현재 별도 비공개 운영 모듈이 등록되지 않았습니다.',
    );
    return service.resume(...args);
  }
  closeEmergencyRecovery(
    ...args: Parameters<NonNullable<IdentityU2Runtime['emergencies']>['close']>
  ) {
    const service = this.purposeRuntime().emergencies;
    requireCondition(
      service,
      503,
      'EMERGENCY_UNREGISTERED',
      '현재 별도 비공개 운영 모듈이 등록되지 않았습니다.',
    );
    return service.close(...args);
  }
  applyVerifiedEmergencyResult(
    ...args: Parameters<NonNullable<IdentityU2Runtime['emergencies']>['applyVerifiedResult']>
  ) {
    const service = this.purposeRuntime().emergencies;
    requireCondition(
      service,
      503,
      'EMERGENCY_UNREGISTERED',
      '현재 별도 비공개 운영 모듈이 등록되지 않았습니다.',
    );
    return service.applyVerifiedResult(...args);
  }
  private recordProviderProof(proof: PasswordProof | FactorProof): Promise<void> {
    return identityproofs.recordProviderProof(this.internal, proof);
  }
  private mutate(
    key: string,
    input: unknown,
    operation: (transaction: ProtectedTransaction, requestId: string) => Promise<void>,
  ): Promise<void> {
    return identityproofs.mutate(this.internal, key, input, operation);
  }
  private limit(subject: string, network: string): Promise<void> {
    return identitychallenges.limit(this.internal, subject, network);
  }
  private ingress(audience: Audience, ingressProof: unknown): Promise<void> {
    return identitychallenges.ingress(this.internal, audience, ingressProof);
  }
  private withAttempt<R>(id: string, operation: (attempt: Attempt) => Promise<R>): Promise<R> {
    return identitychallenges.withAttempt(this.internal, id, operation);
  }
  completeChallenge(
    challengeId: string,
    response: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome> {
    return identitychallenges.completeChallenge(
      this.internal,
      challengeId,
      response,
      network,
      ingressProof,
    );
  }
  readIdentity(context: ServiceContext): Promise<unknown> {
    return identitychallenges.readIdentity(this.internal, context);
  }
  publicView(outcome: {
    challengeId: string | null;
    phase: string;
    accountId?: string;
  }): Promise<unknown> {
    return identitychallenges.publicView(this.internal, outcome);
  }
  startLogin(
    audience: Exclude<Audience, 'SYSTEM'>,
    loginIdentifier: string,
    ingressProof: unknown,
  ): Promise<{ challengeId: string; phase: 'PASSWORD_REQUIRED' }> {
    return identitypassword.startLogin(this.internal, audience, loginIdentifier, ingressProof);
  }
  completePassword(
    challengeId: string,
    password: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome> {
    return identitypassword.completePassword(
      this.internal,
      challengeId,
      password,
      network,
      ingressProof,
    );
  }
  login(
    audience: Exclude<Audience, 'SYSTEM'>,
    login: string,
    password: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome> {
    return identitypassword.login(this.internal, audience, login, password, network, ingressProof);
  }
  verifyFactor(
    challengeId: string,
    response: string,
    network: string,
    ingressProof: unknown,
    retainForCodeReissue = false,
  ): Promise<IdentityOutcome> {
    return identityfactor.verifyFactor(
      this.internal,
      challengeId,
      response,
      network,
      ingressProof,
      retainForCodeReissue,
    );
  }
  private validateFactor(attempt: Attempt, proof: FactorProof): void {
    return identityfactor.validateFactor(this.internal, attempt, proof);
  }
  beginEnrolment(challengeId: string, ingressProof: unknown): Promise<{ secret: string }> {
    return identityfactor.beginEnrolment(this.internal, challengeId, ingressProof);
  }
  completeEnrolment(
    challengeId: string,
    response: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome> {
    return identityfactor.completeEnrolment(
      this.internal,
      challengeId,
      response,
      network,
      ingressProof,
    );
  }
  issueRecoveryCodes(
    challengeId: string,
    ingressProof: unknown,
  ): Promise<{ setId: string; codes: string[] }> {
    return identitycodes.issueRecoveryCodes(this.internal, challengeId, ingressProof);
  }
  acknowledgeRecoveryCodes(
    challengeId: string,
    setId: string,
    stored: boolean,
    ingressProof: unknown,
  ): Promise<IdentityOutcome> {
    return identitycodes.acknowledgeRecoveryCodes(
      this.internal,
      challengeId,
      setId,
      stored,
      ingressProof,
    );
  }
  async recover(
    challengeId: string,
    setId: string,
    code: string,
    network: string,
    ingressProof: unknown,
  ): Promise<IdentityOutcome> {
    requireCondition(
      !this.u2,
      403,
      'RECOVERY_PURPOSE_REQUIRED',
      '등록된 U2에서는 원래 case에 결합된 직접 복구 제한 권위를 사용하세요.',
    );
    return identitycodes.recover(this.internal, challengeId, setId, code, network, ingressProof);
  }
  private checkAttemptCurrent(attempt: Attempt, transaction: ProtectedTransaction): Promise<void> {
    return identitysession.checkAttemptCurrent(this.internal, attempt, transaction);
  }
  private finish(challengeId: string, attempt: Attempt): Promise<IdentityOutcome> {
    return identitysession.finish(this.internal, challengeId, attempt);
  }
  authenticate(
    token: string,
    audience: Exclude<Audience, 'SYSTEM'>,
    correlationId: string,
    ingressProof: unknown,
  ): Promise<ServiceContext> {
    return identitysession.authenticate(
      this.internal,
      token,
      audience,
      correlationId,
      ingressProof,
    );
  }
  logout(token: string): Promise<void> {
    return identitysession.logout(this.internal, token);
  }
  recordRegisteredActivity(
    token: string,
    audience: Exclude<Audience, 'SYSTEM'>,
    operation: string,
    correlationId: string,
    ingressProof: unknown,
  ): Promise<void> {
    return identitysecurityevents.recordRegisteredActivity(
      this.internal,
      token,
      audience,
      operation,
      correlationId,
      ingressProof,
    );
  }
  recordConfirmedFactorRemoval(challengeId: string, observed: FactorRemovalProof): Promise<void> {
    return identitysecurityevents.recordConfirmedFactorRemoval(
      this.internal,
      challengeId,
      observed,
    );
  }
}
