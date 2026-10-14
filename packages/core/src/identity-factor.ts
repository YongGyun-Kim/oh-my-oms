import { requireCondition, canonicalJson, ExecutionBudget, fingerprint } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import { randomUUID } from 'node:crypto';
import { PurposeSecretVault } from '@oms/persistence';
import type {
  ProtectedStore,
  ProtectedTransaction,
  ModelData,
  VaultBinding,
  VaultPermit,
} from '@oms/persistence';
import type {
  RecoveryProviderPort,
  RecoveryProviderTarget,
  PasswordProof,
} from './identity-provider.js';
import { EnrollmentAuthorities } from './enrollment-authority.js';
import { Authorization } from './authorization.js';
import {
  identitySubjectKey,
  identityProviderCircuitKey,
  boundedIdentityCall,
  identityObservationMatches,
} from './identity-consumer.js';
import { identityResultDigest } from './recovery-completion.js';
import { ref } from './references.js';
import { PurposeVerifier } from './purpose-verifier.js';
import type { FactorProof } from './identity-provider.js';
import type { Attempt, IdentityInternal, IdentityOutcome } from './identity-state.js';
import { assertBusinessIdentityReleased } from './enrollment-authority.js';
export async function verifyFactor(
  host: IdentityInternal,
  challengeId: string,
  response: string,
  network: string,
  ingressProof: unknown,
  retainForCodeReissue = false,
): Promise<IdentityOutcome> {
  return host.withAttempt(challengeId, async (attempt) => {
    await host.ingress(attempt.proof.audience, ingressProof);
    await host.limit((attempt.binding.accountRef as { id: string }).id, network);
    const proof = await host.provider.factor(attempt.proof, response);
    host.validateFactor(attempt, proof);
    await host.recordProviderProof(proof);
    attempt.factor = proof;
    const sets = await host.store.list('RecoveryCodeSet', {
      equals: {
        bindingRef: { id: attempt.binding.bindingId },
        invalidated: false,
        confirmed: true,
        generation: attempt.binding.generation,
      },
      limit: 1,
    });
    const confirmed = sets.length > 0;
    if (!confirmed || retainForCodeReissue)
      return {
        challengeId,
        phase: 'MFA_REQUIRED',
        accountId: (attempt.binding.accountRef as { id: string }).id,
      };
    return host.finish(challengeId, attempt);
  });
}
export function validateFactor(host: IdentityInternal, attempt: Attempt, proof: FactorProof): void {
  requireCondition(
    proof.verified === true &&
      proof.evidenceRefs.length > 0 &&
      proof.issuer === attempt.proof.issuer &&
      proof.subject === attempt.proof.subject &&
      proof.audience === attempt.proof.audience,
    401,
    'MFA_PROOF_REQUIRED',
    '현재 신원에 연결된 MFA 근거가 필요합니다.',
  );
}
export async function beginEnrolment(
  host: IdentityInternal,
  challengeId: string,
  ingressProof: unknown,
): Promise<{ secret: string }> {
  return host.withAttempt(challengeId, async (attempt) => {
    await host.ingress(attempt.proof.audience, ingressProof);
    requireCondition(
      attempt.proof.requiresEnrolment || attempt.recovery,
      403,
      'ENROLMENT_PURPOSE_REQUIRED',
      '등록 목적을 확인하세요.',
    );
    requireCondition(
      attempt.binding.removalState !== 'UNKNOWN',
      503,
      'FACTOR_REMOVAL_UNKNOWN',
      '이전 인증 수단 제거 결과를 확인해야 합니다.',
    );
    await assertBusinessIdentityReleased(
      host.store,
      (attempt.binding.accountRef as { id: string }).id,
    );
    const result = await host.provider.beginEnrolment(attempt.proof);
    attempt.secretHandle = result.providerHandle;
    attempt.proof = { ...attempt.proof, providerHandle: result.providerHandle };
    return { secret: result.secret };
  });
}
export async function completeEnrolment(
  host: IdentityInternal,
  challengeId: string,
  response: string,
  network: string,
  ingressProof: unknown,
): Promise<IdentityOutcome> {
  return host.withAttempt(challengeId, async (attempt) => {
    await host.ingress(attempt.proof.audience, ingressProof);
    await host.limit((attempt.binding.accountRef as { id: string }).id, network);
    requireCondition(
      attempt.secretHandle,
      403,
      'ENROLMENT_PURPOSE_REQUIRED',
      '등록 목적을 확인하세요.',
    );
    await assertBusinessIdentityReleased(
      host.store,
      (attempt.binding.accountRef as { id: string }).id,
    );
    const proof = await host.provider.completeEnrolment(attempt.proof, response);
    host.validateFactor(attempt, proof);
    await host.recordProviderProof(proof);
    attempt.factor = proof;
    return {
      challengeId,
      phase: 'MFA_REQUIRED',
      accountId: (attempt.binding.accountRef as { id: string }).id,
    };
  });
}

// Only the server-held password attempt and opaque limited authority enter
// this producer. It never calls finish() or creates a business session.
export class RecoveryFactorEnrollment {
  readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    private readonly provider: RecoveryProviderPort,
    private readonly authorities: EnrollmentAuthorities,
    private readonly vault: PurposeSecretVault,
    private readonly now: () => Date,
    synthetic: boolean,
    private readonly verifier: PurposeVerifier,
  ) {
    requireCondition(
      authorities.store === store &&
        synthetic &&
        provider.capabilities.profile === 'LOCAL_SYNTHETIC' &&
        provider.capabilities.originalTermination &&
        provider.capabilities.sdkMaxAttempts === 1 &&
        provider.capabilities.subjectMutationLimit === 1,
      503,
      'RECOVERY_FACTOR_HOLD',
      '등록된 local 원래 종료/목적 권위 경계가 필요합니다.',
    );
    this.authorization = new Authorization(store, now);
  }
  async current(context: ServiceContext, caseRef: Ref, transaction?: ProtectedTransaction) {
    const authority = await this.authorities.assert(context, 'MFA_REENROLMENT', transaction),
      source = await this.authorization.lookup('RecoveryCase', caseRef.id, transaction);
    requireCondition(
      source &&
        canonicalJson(ref('RecoveryCase', source)) === canonicalJson(caseRef) &&
        source.state === 'ENROLMENT_ONLY' &&
        (source.enrollmentAuthorityRef as Ref).id === authority.authorityId,
      409,
      'RECOVERY_FACTOR_SOURCE',
      '현재 원래 case와 제한 당사자 권위가 필요합니다.',
    );
    const slots = await this.store.list('IdentityExecutionSlot', {
      equals: { accountRef: { id: context.principalId } },
      anyOf: [{ state: 'ACTIVE' }, { state: 'UNKNOWN' }],
      limit: 2,
    });
    requireCondition(
      slots.length === 1 &&
        slots[0]!.state === 'ACTIVE' &&
        (slots[0]!.caseRef as Ref).id === source.caseId,
      409,
      'RECOVERY_EFFECT_UNKNOWN',
      '옛 불명 작업 종료/격리를 먼저 확인하세요.',
    );
    await this.authorization.lookup('IdentityExecutionSlot', String(slots[0]!.slotId), transaction);
    const results: ModelData[] = [];
    requireCondition(
      (source.originalOperationRefs as Ref[]).length >= 2,
      409,
      'RECOVERY_ORIGINAL_EFFECTS',
      '모든 원래 제거/signout 작업이 필요합니다.',
    );
    for (const selected of source.originalOperationRefs as Ref[]) {
      const work = await this.authorization.lookup('WorkItem', selected.id, transaction),
        result = await this.authorization.lookup(
          'IdentityOperationResult',
          selected.id,
          transaction,
        );
      requireCondition(
        work?.state === 'RESULT_RECORDED' &&
          work.attempt === 1 &&
          work.owner === 'IdentityRecovery' &&
          [
            'IdentityRecovery.removeOriginalFactor',
            'IdentityRecovery.signOutOriginalSessions',
            'IdentityRecovery.replaceFirstFactor',
          ].includes(String(work.operationId)) &&
          (work.targetRef as Ref).id === source.caseId &&
          work.epoch === source.epoch &&
          result?.knowledge === 'KNOWN' &&
          result.terminal === true &&
          result.epoch === source.epoch &&
          result.operationId === work.workId &&
          (work.operationId === 'IdentityRecovery.replaceFirstFactor'
            ? result.effect === 'PASSWORD_REPLACED' &&
              (
                await this.store.readRevision(
                  'IdentityOperationResult',
                  String(result.operationResultId),
                  1,
                )
              )?.inputDigest === result.inputDigest
            : result.inputDigest ===
              identityResultDigest(source, result.bindingRef as Ref, String(work.workId))) &&
          (result.evidenceRefs as Ref[]).length > 0,
        409,
        'RECOVERY_ORIGINAL_EFFECTS',
        '수락/probe를 원래 작업 종료로 승격하지 않습니다.',
      );
      results.push(result);
    }
    for (const original of source.originalBindingRefs as Ref[])
      requireCondition(
        results.some(
          (result) =>
            canonicalJson(result.bindingRef) === canonicalJson(original) &&
            ['REMOVED', 'ISOLATED'].includes(String(result.effect)),
        ) &&
          results.some(
            (result) =>
              canonicalJson(result.bindingRef) === canonicalJson(original) &&
              ['SIGNED_OUT', 'ISOLATED'].includes(String(result.effect)),
          ),
        409,
        'RECOVERY_ORIGINAL_EFFECTS',
        '모든 옛 주체의 실제 종료/격리를 대조하세요.',
      );
    const binding = (await this.authorization.lookup(
      'ProviderBinding',
      (source.bindingRef as Ref).id,
      transaction,
    ))!;
    requireCondition(
      binding &&
        canonicalJson(ref('ProviderBinding', binding)) === canonicalJson(source.bindingRef),
      409,
      'RECOVERY_FACTOR_BINDING',
      '현재 원래 연결 개정이 필요합니다.',
    );
    return { source, authority, binding };
  }
  private binding(authority: ModelData, id: string): VaultBinding {
    return {
      id,
      purpose: 'PROVIDER_CHALLENGE',
      targetRef: ref('EnrollmentAuthority', authority),
      accountRef: authority.accountRef as Ref,
      audience: authority.audience as 'CUSTOMER' | 'STAFF',
      bindingGeneration: Number(authority.bindingGeneration),
      sourceRevision: Number(authority.revision),
      expiresAt: String(authority.expiresAt),
      keyVersion: this.vault.keyVersion,
    };
  }
  private permit(authority: ModelData): VaultPermit {
    return {
      authorityRef: ref('EnrollmentAuthority', authority),
      targetRef: ref('EnrollmentAuthority', authority),
      purpose: 'PROVIDER_CHALLENGE',
      operation: 'identity.enrollment.challenge',
      epoch: String(authority.epoch),
      deadlineAt: new Date(
        Math.min(this.now().getTime() + 10000, Date.parse(String(authority.expiresAt))),
      ).toISOString(),
    };
  }
  private target(
    source: ModelData,
    binding: ModelData,
    id: string,
    authority: ModelData,
  ): RecoveryProviderTarget {
    return {
      approvedOperationId: id,
      workId: id,
      caseRef: ref('RecoveryCase', source),
      accountRef: source.accountRef as Ref,
      bindingRef: source.bindingRef as Ref,
      issuer: String(binding.issuer),
      subject: String(binding.subject),
      audience: binding.audience as 'CUSTOMER' | 'STAFF',
      bindingGeneration: Number(binding.generation),
      securityGeneration: Number(source.securityGeneration),
      epoch: String(source.epoch),
      inputDigest: identityResultDigest(source, source.bindingRef as Ref, id),
      deadlineAt: String(authority.expiresAt),
    };
  }
  private async providerAdmission(binding: ModelData, tx?: ProtectedTransaction) {
    const circuit = await this.authorization.lookup(
      'EndpointCircuit',
      identityProviderCircuitKey(String(binding.issuer)),
      tx,
    );
    requireCondition(
      !circuit || (circuit.state === 'CLOSED' && circuit.probeOwner === null),
      503,
      'IDENTITY_PROVIDER_CIRCUIT',
      '현재 공유 접점의 등록된 검증 전에는 새 수단 호출을 보류합니다.',
    );
  }
  private async change(
    context: ServiceContext,
    operation: string,
    id: string,
    input: unknown,
    apply: (tx: ProtectedTransaction, requestId: string) => Promise<void>,
  ) {
    return this.store.execute(
      {
        principalId: context.principalId,
        audience: context.audience,
        owner: 'IdentityRecovery',
        operation,
        target: { operationId: id },
        idempotencyKey: id + ':' + operation,
        input,
        correlationId: context.correlationId,
        epoch: await this.store.currentEpoch(),
      },
      async (tx, requestId) => {
        await apply(tx, requestId);
        const affected = tx.rows().map((row) => ref(row.model, row.data)),
          at = this.now().toISOString();
        if (!(await tx.get('RequestReceipt', requestId)))
          await tx.put('RequestReceipt', {
            requestId,
            principalId: context.principalId,
            audience: context.audience,
            operation,
            targetIdentity: { kind: 'RECORD', recordRef: context.identityAssertionRef },
            requestFingerprint: fingerprint(input),
            idempotencyKey: id + ':' + operation,
            owner: 'IdentityRecovery',
            targetScope: null,
            requestState: 'RESULT_RECORDED',
            resultRefs: affected,
            acceptedAt: at,
            updatedAt: at,
            revision: 1,
            correlationId: context.correlationId,
          });
        await tx.put('IdentityHistory', {
          historyId: randomUUID(),
          owner: 'IdentityRecovery',
          actorAccountRef: context.actorAccountRef,
          verifiedPersonRef: null,
          occurredAt: at,
          reason: '원래 당사자의 제한 복구 단계 기록',
          beforeRef: null,
          afterRef: affected[0] ?? null,
          evidenceRefs: [],
          requestId,
          resultRefs: affected,
          correctionOf: null,
          sourceRevision: 1,
        });
      },
    );
  }
  private async uncertain(context: ServiceContext, caseRef: Ref, id: string) {
    await this.change(context, 'holdRecoveryFactor', id, { caseRef, id }, async (tx) => {
      const source = (await this.authorization.lookup('RecoveryCase', caseRef.id, tx))!,
        authority = (await this.authorization.lookup(
          'EnrollmentAuthority',
          context.identityAssertionRef.id,
          tx,
        ))!,
        slots = await tx.list(
          'IdentityExecutionSlot',
          { accountRef: { id: context.principalId }, state: 'ACTIVE' },
          2,
        );
      requireCondition(
        source &&
          authority &&
          slots.length === 1 &&
          (slots[0]!.caseRef as Ref).id === source.caseId,
        503,
        'RECOVERY_FACTOR_SLOT',
        '원래 보호 경계를 대조하세요.',
      );
      await tx.put(
        'RecoveryCase',
        {
          ...source,
          state: 'HOLD',
          holdReason: 'NEW_FACTOR_ORIGINAL_EFFECT_UNKNOWN',
          revision: Number(source.revision) + 1,
        },
        Number(source.revision),
      );
      await tx.put(
        'EnrollmentAuthority',
        { ...authority, state: 'HOLD', revision: Number(authority.revision) + 1 },
        Number(authority.revision),
      );
      await tx.put('SecurityTombstone', {
        tombstoneId: randomUUID(),
        revision: 1,
        targetRef: { ...ref('EnrollmentAuthority', authority), revision: 1 },
        purpose: 'PROVIDER_CHALLENGE',
        reason: 'NEW_FACTOR_ORIGINAL_EFFECT_UNKNOWN',
        destroyedAt: this.now().toISOString(),
        epoch: authority.epoch,
      });
      await tx.put(
        'IdentityExecutionSlot',
        {
          ...slots[0]!,
          state: 'UNKNOWN',
          originalOperationRef: {
            owner: 'IdentityRecovery',
            entity: 'IdentityOperationResult',
            id,
            revision: 1,
          },
          revision: Number(slots[0]!.revision) + 1,
        },
        Number(slots[0]!.revision),
      );
      const binding = (await this.authorization.lookup(
          'ProviderBinding',
          (source.bindingRef as Ref).id,
          tx,
        ))!,
        endpoint = await this.authorization.lookup(
          'EndpointCircuit',
          identitySubjectKey(String(binding.issuer), String(binding.subject)),
          tx,
        );
      if (endpoint?.probeOwner && endpoint.probeEpoch === source.epoch)
        await tx.put(
          'EndpointCircuit',
          { ...endpoint, state: 'REVIEW_REQUIRED', revision: Number(endpoint.revision) + 1 },
          Number(endpoint.revision),
        );
      const intent = await tx.get('IdentityOperationResult', id);
      if (intent)
        await tx.put(
          'IdentityOperationResult',
          { ...intent, knowledge: 'UNKNOWN', revision: Number(intent.revision) + 1 },
          Number(intent.revision),
        );
    });
  }
  async begin(
    host: IdentityInternal,
    context: ServiceContext,
    caseRef: Ref,
    passwordChallengeId: string,
    ingressProof: unknown = null,
  ): Promise<{ enrollmentRef: Ref; secret: string }> {
    requireCondition(
      host.store === this.store,
      503,
      'RECOVERY_FACTOR_STORE',
      '같은 현재 원본이 필요합니다.',
    );
    return host.withAttempt(passwordChallengeId, async (attempt) => {
      await host.ingress(context.audience, ingressProof);
      const current = await this.current(context, caseRef);
      requireCondition(
        canonicalJson(ref('ProviderBinding', attempt.binding)) ===
          canonicalJson(current.source.bindingRef) &&
          attempt.proof.issuer === current.binding.issuer &&
          attempt.proof.subject === current.binding.subject &&
          attempt.proof.audience === context.audience &&
          attempt.proof.evidenceRefs.length > 0,
        403,
        'RECOVERY_PASSWORD_PROOF',
        '이 당사자/현재 주체의 실제 password challenge가 필요합니다.',
      );
      const id = randomUUID(),
        subjectId = identitySubjectKey(
          String(current.binding.issuer),
          String(current.binding.subject),
        ),
        target = this.target(current.source, current.binding, id, current.authority),
        pending = {
          enrollmentId: id,
          accountRef: current.source.accountRef,
          state: 'PENDING',
          protectedMethodRef: 'purpose-vault:' + id,
          verificationEvidenceRefs: [],
          revision: 1,
        };
      await this.change(
        context,
        'prepareRecoveryFactor',
        id,
        { caseRef, passwordChallengeId },
        async (tx) => {
          await this.current(context, caseRef, tx);
          await this.providerAdmission(current.binding, tx);
          await host.checkAttemptCurrent(attempt, tx);
          const results = await tx.list(
              'IdentityOperationResult',
              {
                caseRef: { id: current.source.caseId },
                bindingRef: { id: current.binding.bindingId },
              },
              100,
            ),
            originalIds = new Set(
              (current.source.originalOperationRefs as Ref[]).map((selected) => selected.id),
            );
          requireCondition(
            results.length < 100 &&
              results.every((result) => originalIds.has(String(result.operationId))),
            409,
            'RECOVERY_FACTOR_ALREADY_STARTED',
            '이 원래 제한 권위의 새 수단 준비/확인은 단회입니다.',
          );
          const old = await this.authorization.lookup('EndpointCircuit', subjectId, tx);
          requireCondition(
            !old || (old.state === 'CLOSED' && old.probeOwner === null),
            409,
            'IDENTITY_SUBJECT_BUSY',
            '원래 subject mutation이 아직 끝나지 않았습니다.',
          );
          await tx.put(
            'EndpointCircuit',
            {
              endpointId: subjectId,
              state: 'CLOSED',
              failureCount: 0,
              windowStartedAt: this.now().toISOString(),
              openedAt: null,
              probeOwner: id,
              probeDeadlineAt: current.authority.expiresAt,
              probeToken: id,
              probeGeneration: Number(old?.probeGeneration ?? 0) + 1,
              probeEpoch: target.epoch,
              revision: Number(old?.revision ?? 0) + 1,
            },
            old ? Number(old.revision) : undefined,
          );
          await tx.put('MfaEnrollment', pending);
          await tx.put('IdentityOperationResult', {
            operationResultId: id,
            revision: 1,
            caseRef,
            bindingRef: target.bindingRef,
            operationId: id,
            inputDigest: target.inputDigest,
            providerRequestId: 'UNCONFIRMED',
            knowledge: 'UNAVAILABLE',
            effect: 'UNCONFIRMED',
            evidenceRefs: [],
            terminal: false,
            observedAt: this.now().toISOString(),
            epoch: target.epoch,
          });
        },
      );
      let privatePrepared: Awaited<ReturnType<RecoveryProviderPort['beginFactor']>> | null = null;
      try {
        const budget = new ExecutionBudget(
            Math.max(
              1,
              Math.min(
                5000,
                Date.parse(String(current.authority.expiresAt)) - this.now().getTime(),
              ),
            ),
            () => this.now().getTime(),
          ),
          prepared = await boundedIdentityCall(budget, async () => {
            await this.providerAdmission(current.binding);
            const returned = await this.provider.beginFactor(target, attempt.proof, budget);
            if (budget.signal.aborted) {
              returned.secret.fill(0);
              returned.providerChallenge.fill(0);
              budget.check();
            }
            return returned;
          });
        privatePrepared = prepared;
        await this.current(context, caseRef);
        requireCondition(
          identityObservationMatches(target, prepared.observation, 'BEGIN_NEW_FACTOR') &&
            Number.isFinite(Date.parse(prepared.observation.observedAt)) &&
            Date.parse(prepared.observation.observedAt) >=
              Date.parse(String(current.authority.issuedAt)) &&
            Date.parse(prepared.observation.observedAt) <= this.now().getTime() &&
            prepared.observation.evidenceRefs.length <= 20 &&
            prepared.secret.length > 0 &&
            prepared.secret.length <= 65536 &&
            prepared.providerChallenge.length > 0 &&
            prepared.providerChallenge.length <= 65536,
          503,
          'RECOVERY_FACTOR_ORIGINAL_CHALLENGE',
          '원래 당사자/operation/challenge와 유한 관측이 필요합니다.',
        );
        const bytes = Buffer.from(
          JSON.stringify({
            proof: attempt.proof,
            challenge: prepared.providerChallenge.toString('base64'),
          }),
        );
        try {
          await this.vault.create(
            bytes,
            this.binding(current.authority, id),
            this.permit(current.authority),
          );
          return {
            enrollmentRef: ref('MfaEnrollment', pending),
            secret: prepared.secret.toString('base64'),
          };
        } finally {
          bytes.fill(0);
          prepared.secret.fill(0);
          prepared.providerChallenge.fill(0);
        }
      } catch (error) {
        await this.uncertain(context, caseRef, id);
        await this.vault.destroy(this.binding(current.authority, id), {
          ...this.permit(current.authority),
          epoch: await this.store.currentEpoch(),
          deadlineAt: new Date(this.now().getTime() + 3000).toISOString(),
        });
        throw error;
      } finally {
        privatePrepared?.secret.fill(0);
        privatePrepared?.providerChallenge.fill(0);
      }
    });
  }
  async verify(
    context: ServiceContext,
    caseRef: Ref,
    enrollmentRef: Ref,
    response: string,
  ): Promise<{ enrollmentRef: Ref; providerResultRef: Ref }> {
    requireCondition(
      /^[0-9]{6}$/.test(response) &&
        enrollmentRef.owner === 'IdentityRecovery' &&
        enrollmentRef.entity === 'MfaEnrollment',
      400,
      'RECOVERY_FACTOR_FORMAT',
      '새 수단의 6자리 확인을 입력하세요.',
    );
    const current = await this.current(context, caseRef),
      id = randomUUID(),
      enrollment = await this.authorization.lookup('MfaEnrollment', enrollmentRef.id),
      subjectId = identitySubjectKey(
        String(current.binding.issuer),
        String(current.binding.subject),
      ),
      target = this.target(current.source, current.binding, id, current.authority);
    requireCondition(
      enrollment?.state === 'PENDING' &&
        enrollment.revision === enrollmentRef.revision &&
        (enrollment.accountRef as Ref).id === context.principalId &&
        enrollment.protectedMethodRef === 'purpose-vault:' + enrollmentRef.id,
      409,
      'RECOVERY_FACTOR_PENDING',
      '원래 미확인 새 수단이 필요합니다.',
    );
    const bytes = await this.vault.read(
      this.binding(current.authority, enrollmentRef.id),
      this.permit(current.authority),
    );
    let material: { proof: PasswordProof; challenge: string };
    try {
      material = JSON.parse(bytes.toString('utf8')) as typeof material;
    } finally {
      bytes.fill(0);
    }
    const challenge = Buffer.from(material.challenge, 'base64'),
      code = Buffer.from(response);
    target.inputDigest = this.verifier.inputDigest(
      'C21_VERIFY_FACTOR',
      { ...target, inputDigest: target.inputDigest },
      code,
    );
    await this.change(
      context,
      'prepareRecoveryFactorVerification',
      id,
      { caseRef, enrollmentRef },
      async (tx) => {
        await this.current(context, caseRef, tx);
        await this.providerAdmission(current.binding, tx);
        const original = (await this.authorization.lookup(
            'IdentityOperationResult',
            enrollmentRef.id,
            tx,
          ))!,
          reservation = (await this.authorization.lookup('EndpointCircuit', subjectId, tx))!;
        requireCondition(
          original?.knowledge === 'UNAVAILABLE' &&
            original.revision === 1 &&
            reservation.probeOwner === enrollmentRef.id &&
            reservation.probeToken === enrollmentRef.id &&
            reservation.probeEpoch === target.epoch,
          409,
          'RECOVERY_FACTOR_ALREADY_STARTED',
          '원래 단회 새 수단 확인이 이미 시작됐습니다.',
        );
        await tx.put('IdentityOperationResult', { ...original, revision: 2 }, 1);
        await tx.put('IdentityOperationResult', {
          operationResultId: id,
          revision: 1,
          caseRef,
          bindingRef: target.bindingRef,
          operationId: id,
          inputDigest: target.inputDigest,
          providerRequestId: 'UNCONFIRMED',
          knowledge: 'UNAVAILABLE',
          effect: 'UNCONFIRMED',
          evidenceRefs: [],
          terminal: false,
          observedAt: this.now().toISOString(),
          epoch: target.epoch,
        });
      },
    );
    try {
      const budget = new ExecutionBudget(
          Math.max(
            1,
            Math.min(5000, Date.parse(String(current.authority.expiresAt)) - this.now().getTime()),
          ),
          () => this.now().getTime(),
        ),
        verified = await boundedIdentityCall(budget, async () => {
          await this.providerAdmission(current.binding);
          return this.provider.verifyFactor(target, material.proof, challenge, code, budget);
        });
      requireCondition(
        identityObservationMatches(target, verified.observation, 'VERIFY_NEW_FACTOR') &&
          verified.observation.knowledge === 'KNOWN' &&
          verified.observation.effect === 'FACTOR_VERIFIED' &&
          verified.methodRef.length > 0 &&
          verified.methodRef.length <= 65536 &&
          Number.isFinite(Date.parse(verified.observation.observedAt)) &&
          Date.parse(verified.observation.observedAt) >=
            Date.parse(String(current.authority.issuedAt)) &&
          Date.parse(verified.observation.observedAt) <= this.now().getTime() &&
          verified.observation.evidenceRefs.length <= 20,
        503,
        'RECOVERY_FACTOR_UNKNOWN',
        '새 수단의 실제 원래 확인이 필요합니다.',
      );
      const observed = verified.observation;
      const committed = await this.change(
        context,
        'identity.recovery-factor-observed',
        id,
        { caseRef, enrollmentRef, providerRequestId: observed.providerRequestId },
        async (tx, requestId) => {
          await this.current(context, caseRef, tx);
          const pending = (await this.authorization.lookup('MfaEnrollment', enrollmentRef.id, tx))!,
            intent = (await this.authorization.lookup('IdentityOperationResult', id, tx))!,
            reservation = (await this.authorization.lookup('EndpointCircuit', subjectId, tx))!;
          requireCondition(
            pending.state === 'PENDING' &&
              pending.revision === enrollmentRef.revision &&
              intent.revision === 1 &&
              reservation.probeOwner === enrollmentRef.id &&
              reservation.probeEpoch === target.epoch,
            409,
            'RECOVERY_FACTOR_FENCED',
            '현재 원래 새 수단 확인이 필요합니다.',
          );
          const receiptRef: Ref = {
              owner: 'U1Host',
              entity: 'RequestReceipt',
              id: requestId,
              revision: 1,
            },
            next = {
              ...pending,
              state: 'VERIFIED',
              protectedMethodRef: verified.methodRef,
              verificationEvidenceRefs: [receiptRef],
              revision: 2,
            },
            result = {
              ...intent,
              knowledge: 'KNOWN',
              effect: 'FACTOR_VERIFIED',
              terminal: true,
              providerRequestId: observed.providerRequestId,
              evidenceRefs: [...observed.evidenceRefs, ref('MfaEnrollment', next)],
              observedAt: observed.observedAt,
              revision: 2,
            };
          for (const old of current.source.originalFactorRefs as Ref[]) {
            const row = (await this.authorization.lookup('MfaEnrollment', old.id, tx))!;
            if (row.state !== 'INVALIDATED')
              await tx.put(
                'MfaEnrollment',
                { ...row, state: 'INVALIDATED', revision: Number(row.revision) + 1 },
                Number(row.revision),
              );
          }
          await tx.put('MfaEnrollment', next, 1);
          await tx.put('IdentityOperationResult', result, 1);
          await tx.put(
            'EndpointCircuit',
            {
              ...reservation,
              probeOwner: null,
              probeToken: null,
              probeDeadlineAt: null,
              revision: Number(reservation.revision) + 1,
            },
            Number(reservation.revision),
          );
          const at = this.now().toISOString();
          await tx.put('RequestReceipt', {
            requestId,
            principalId: context.principalId,
            audience: context.audience,
            operation: 'identity.recovery-factor-observed',
            targetIdentity: { kind: 'RECORD', recordRef: caseRef },
            requestFingerprint: target.inputDigest,
            idempotencyKey: id,
            owner: 'IdentityRecovery',
            targetScope: null,
            requestState: 'RESULT_RECORDED',
            resultRefs: [ref('MfaEnrollment', next), ref('IdentityOperationResult', result)],
            acceptedAt: at,
            updatedAt: at,
            revision: 1,
            correlationId: context.correlationId,
          });
          await tx.put('SecurityTombstone', {
            tombstoneId: randomUUID(),
            targetRef: ref('EnrollmentAuthority', current.authority),
            purpose: 'PROVIDER_CHALLENGE',
            destroyedAt: at,
            reason: 'FACTOR_VERIFIED',
            epoch: target.epoch,
            revision: 1,
          });
        },
      );
      requireCondition(
        committed.requestId,
        503,
        'RECOVERY_FACTOR_PROTECTION',
        '새 수단 확인 보호가 필요합니다.',
      );
      await this.vault.destroy(
        this.binding(current.authority, enrollmentRef.id),
        this.permit(current.authority),
      );
      const completed = (await this.authorization.lookup('MfaEnrollment', enrollmentRef.id))!,
        result = (await this.authorization.lookup('IdentityOperationResult', id))!;
      return {
        enrollmentRef: ref('MfaEnrollment', completed),
        providerResultRef: ref('IdentityOperationResult', result),
      };
    } catch (error) {
      let recorded: ModelData | null;
      try {
        recorded = await this.authorization.lookup('IdentityOperationResult', id);
      } catch {
        throw error;
      }
      if (recorded?.knowledge !== 'KNOWN') {
        await this.uncertain(context, caseRef, id);
        await this.vault.destroy(this.binding(current.authority, enrollmentRef.id), {
          ...this.permit(current.authority),
          epoch: await this.store.currentEpoch(),
          deadlineAt: new Date(this.now().getTime() + 3000).toISOString(),
        });
      }
      throw error;
    } finally {
      challenge.fill(0);
      code.fill(0);
    }
  }
}
