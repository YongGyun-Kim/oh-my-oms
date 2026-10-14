import { requireCondition, canonicalJson, fingerprint } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import type { ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { randomUUID } from 'node:crypto';
import type { IdentityInternal, IdentityOutcome } from './identity-state.js';
import type { CodeVerifier } from './recovery-codes.js';
import { ref } from './references.js';
import { assertBusinessIdentityReleased } from './enrollment-authority.js';
import { u2CodeSecurityStateId } from '@oms/persistence';
import { RecoveryCodes } from './recovery-codes.js';
import { RecoveryFactorEnrollment } from './identity-factor.js';
export async function issueRecoveryCodes(
  host: IdentityInternal,
  challengeId: string,
  ingressProof: unknown,
): Promise<{ setId: string; codes: string[] }> {
  return host.withAttempt(challengeId, async (attempt) => {
    await host.ingress(attempt.proof.audience, ingressProof);
    requireCondition(attempt.factor, 403, 'MFA_REQUIRED', 'MFA 확인이 필요합니다.');
    const setId = randomUUID();
    const accountId = (attempt.binding.accountRef as { id: string }).id;
    await assertBusinessIdentityReleased(host.store, accountId);
    const issued = host.codes.issue(accountId, Number(attempt.binding.generation), setId);
    await host.mutate(
      randomUUID(),
      { bindingId: attempt.binding.bindingId, setId },
      async (transaction) => {
        await host.checkAttemptCurrent(attempt, transaction);
        await assertBusinessIdentityReleased(host.store, accountId, transaction);
        for (const existing of await transaction.list('RecoveryCodeSet', {
          bindingRef: { id: attempt.binding.bindingId },
          invalidated: false,
        }))
          await transaction.put(
            'RecoveryCodeSet',
            { ...existing, invalidated: true, revision: Number(existing.revision) + 1 },
            Number(existing.revision),
          );
        await transaction.put('RecoveryCodeSet', {
          setId,
          accountRef: attempt.binding.accountRef,
          bindingRef: ref('ProviderBinding', attempt.binding),
          generation: attempt.binding.generation,
          verifiers: issued.verifiers,
          confirmed: false,
          invalidated: false,
          revision: 1,
        });
        const securityStates = await transaction.list(
          'AccountSecurityState',
          { accountRef: { id: accountId } },
          2,
        );
        requireCondition(
          securityStates.length <= 1,
          503,
          'CURRENT_SECURITY_REQUIRED',
          '현재 코드 발급의 단일 보안 경계가 필요합니다.',
        );
        if (securityStates[0]) {
          const currentSecurity = await host.store.currentProtected(
            'AccountSecurityState',
            String(securityStates[0].securityStateId),
          );
          requireCondition(
            currentSecurity && currentSecurity.revision === securityStates[0].revision,
            503,
            'CURRENT_SECURITY_REQUIRED',
            '현재 코드 발급 보안 경계의 보호가 필요합니다.',
          );
          await transaction.put('RecoveryCodeSecurityState', {
            codeSecurityId: u2CodeSecurityStateId(setId),
            revision: 1,
            codeSetRef: {
              owner: 'IdentityRecovery',
              entity: 'RecoveryCodeSet',
              id: setId,
              revision: 1,
            },
            bindingRef: ref('ProviderBinding', attempt.binding),
            securityStateRef: ref('AccountSecurityState', currentSecurity),
            securityGeneration: currentSecurity.securityGeneration,
            origin: 'ISSUED_AT_SECURITY_GENERATION',
            establishedAt: host.runtime.now().toISOString(),
            epoch: await host.store.currentEpoch(),
          });
        }
      },
    );
    attempt.issuedSet = setId;
    return { setId, codes: issued.codes };
  });
}
export async function acknowledgeRecoveryCodes(
  host: IdentityInternal,
  challengeId: string,
  setId: string,
  stored: boolean,
  ingressProof: unknown,
): Promise<IdentityOutcome> {
  return host.withAttempt(challengeId, async (attempt) => {
    await host.ingress(attempt.proof.audience, ingressProof);
    requireCondition(
      stored === true && attempt.factor && attempt.issuedSet === setId,
      403,
      'CODE_STORAGE_ACK_REQUIRED',
      '복구 코드 보관 확인이 필요합니다.',
    );
    await host.mutate(randomUUID(), { setId, stored }, async (transaction) => {
      await host.checkAttemptCurrent(attempt, transaction);
      await assertBusinessIdentityReleased(
        host.store,
        (attempt.binding.accountRef as { id: string }).id,
        transaction,
      );
      const set = await transaction.get('RecoveryCodeSet', setId);
      requireCondition(
        set && !set.invalidated,
        401,
        'CODE_SET_INVALIDATED',
        '현재 코드 발급을 확인하세요.',
      );
      await transaction.put(
        'RecoveryCodeSet',
        { ...set, confirmed: true, revision: Number(set.revision) + 1 },
        Number(set.revision),
      );
      const mapping = await transaction.get(
        'RecoveryCodeSecurityState',
        u2CodeSecurityStateId(setId),
      );
      if (mapping) {
        const currentMapping = await host.store.currentProtected(
          'RecoveryCodeSecurityState',
          String(mapping.codeSecurityId),
        );
        requireCondition(
          currentMapping &&
            currentMapping.revision === mapping.revision &&
            (mapping.codeSetRef as import('@oms/contracts').Ref).revision === set.revision,
          503,
          'CURRENT_CODE_SECURITY_REQUIRED',
          '원래 코드 발급 보안 경계의 보호가 필요합니다.',
        );
        await transaction.put(
          'RecoveryCodeSecurityState',
          {
            ...mapping,
            codeSetRef: ref('RecoveryCodeSet', { ...set, revision: Number(set.revision) + 1 }),
            revision: Number(mapping.revision) + 1,
          },
          Number(mapping.revision),
        );
      }
    });
    return host.finish(challengeId, attempt);
  });
}
export async function recover(
  host: IdentityInternal,
  challengeId: string,
  setId: string,
  code: string,
  network: string,
  ingressProof: unknown,
): Promise<IdentityOutcome> {
  return host.withAttempt(challengeId, async (attempt) => {
    await host.ingress(attempt.proof.audience, ingressProof);
    await host.limit((attempt.binding.accountRef as { id: string }).id, network);
    await assertBusinessIdentityReleased(
      host.store,
      (attempt.binding.accountRef as { id: string }).id,
    );
    await host.mutate(
      randomUUID(),
      { setId, purpose: 'RECOVERY_VERIFICATION' },
      async (transaction) => {
        await host.checkAttemptCurrent(attempt, transaction);
        await assertBusinessIdentityReleased(
          host.store,
          (attempt.binding.accountRef as { id: string }).id,
          transaction,
        );
        const set = await transaction.get('RecoveryCodeSet', setId);
        requireCondition(
          set &&
            !set.invalidated &&
            set.confirmed &&
            (set.bindingRef as { id: string }).id === attempt.binding.bindingId &&
            set.generation === attempt.binding.generation,
          401,
          'RECOVERY_DENIED',
          '복구 정보를 확인하세요.',
        );
        const digest = host.codes.digest(
          (attempt.binding.accountRef as { id: string }).id,
          Number(attempt.binding.generation),
          setId,
          code,
        );
        await transaction.put(
          'RecoveryCodeSet',
          {
            ...set,
            verifiers: host.codes.consume(set.verifiers as CodeVerifier[], digest),
            revision: Number(set.revision) + 1,
          },
          Number(set.revision),
        );
        const current = await transaction.get('ProviderBinding', String(attempt.binding.bindingId));
        requireCondition(current, 401, 'RECOVERY_DENIED', '현재 연결을 확인하세요.');
        const updated = {
          ...current,
          authRevision: Number(current.authRevision) + 1,
          removalState: 'UNKNOWN',
          revision: Number(current.revision) + 1,
        };
        await transaction.put('ProviderBinding', updated, Number(current.revision));
        attempt.binding = updated;
        // Consuming a code permits only enrolment; it never supplies an MFA business proof.
      },
    );
    attempt.recovery = true;
    attempt.factor = null;
    return {
      challengeId,
      phase: 'RECOVERY_REVIEW',
      accountId: (attempt.binding.accountRef as { id: string }).id,
    };
  });
}

export class RecoveryPurposeCodes {
  constructor(
    readonly store: ProtectedStore,
    private readonly factors: RecoveryFactorEnrollment,
    private readonly codes: RecoveryCodes,
    private readonly now: () => Date,
  ) {
    requireCondition(
      factors.store === store,
      503,
      'RECOVERY_CODES_STORE',
      '같은 현재 보호 원본이 필요합니다.',
    );
  }
  assertVerifier(codes: RecoveryCodes): void {
    requireCondition(
      this.codes.compatibleWith(codes),
      503,
      'RECOVERY_CODES_VERIFIER_BINDING',
      '발급한 새 코드와 이후 직접 복구는 같은 현재 검증 키 원본이어야 합니다.',
    );
  }
  private async change(
    context: ServiceContext,
    operation: string,
    id: string,
    target: { caseRef: Ref },
    input: unknown,
    apply: (tx: ProtectedTransaction) => Promise<void>,
  ) {
    await this.store.execute(
      {
        principalId: context.principalId,
        audience: context.audience,
        owner: 'IdentityRecovery',
        operation,
        target,
        idempotencyKey: id,
        input,
        correlationId: context.correlationId,
        epoch: await this.store.currentEpoch(),
      },
      async (tx, requestId) => {
        await apply(tx);
        const refs = tx.rows().map((row) => ref(row.model, row.data)),
          at = this.now().toISOString();
        await tx.put('RequestReceipt', {
          requestId,
          principalId: context.principalId,
          audience: context.audience,
          operation,
          targetIdentity: { kind: 'RECORD', recordRef: target.caseRef },
          requestFingerprint: fingerprint(input),
          idempotencyKey: id,
          owner: 'IdentityRecovery',
          targetScope: null,
          requestState: 'RESULT_RECORDED',
          resultRefs: refs,
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
          reason: '원래 당사자의 필수 복구 코드 발급/보관 기록',
          beforeRef: target.caseRef,
          afterRef: refs[0] ?? null,
          evidenceRefs: [],
          requestId,
          resultRefs: refs,
          correctionOf: null,
          sourceRevision: refs[0]?.revision ?? 1,
        });
      },
    );
  }
  private async current(
    context: ServiceContext,
    caseRef: Ref,
    enrollmentRef: Ref,
    tx?: ProtectedTransaction,
  ) {
    const current = await this.factors.current(context, caseRef, tx),
      enrollment = await this.factors.authorization.lookup('MfaEnrollment', enrollmentRef.id, tx);
    requireCondition(
      enrollment &&
        canonicalJson(ref('MfaEnrollment', enrollment)) === canonicalJson(enrollmentRef) &&
        enrollment.state === 'VERIFIED' &&
        (enrollment.accountRef as Ref).id === context.principalId &&
        !(current.source.originalFactorRefs as Ref[]).some((old) => old.id === enrollmentRef.id),
      403,
      'RECOVERY_CODES_MFA',
      '원래 case의 실제 새 MFA 확인이 필요합니다.',
    );
    let matched = false;
    for (const evidence of enrollment.verificationEvidenceRefs as Ref[]) {
      if (evidence.entity !== 'RequestReceipt' || evidence.owner !== 'U1Host') continue;
      const receipt = await this.factors.authorization.lookup('RequestReceipt', evidence.id, tx);
      if (
        receipt?.operation === 'identity.recovery-factor-observed' &&
        receipt.principalId === context.principalId &&
        receipt.requestState === 'RESULT_RECORDED' &&
        (receipt.targetIdentity as { recordRef: Ref }).recordRef.id === caseRef.id &&
        (receipt.resultRefs as Ref[]).some(
          (value) => canonicalJson(value) === canonicalJson(enrollmentRef),
        )
      )
        matched = true;
    }
    requireCondition(matched, 403, 'RECOVERY_CODES_MFA', '새 수단의 원래 보호 관측을 대조하세요.');
    return current;
  }
  async issue(
    context: ServiceContext,
    caseRef: Ref,
    enrollmentRef: Ref,
  ): Promise<{ codeSetRef: Ref; codes: string[] }> {
    const current = await this.current(context, caseRef, enrollmentRef),
      id = randomUUID(),
      issued = this.codes.issue(context.principalId, Number(current.binding.generation), id),
      set = {
        setId: id,
        accountRef: current.source.accountRef,
        bindingRef: current.source.bindingRef,
        generation: current.binding.generation,
        verifiers: issued.verifiers,
        confirmed: false,
        invalidated: false,
        revision: 1,
      };
    await this.change(
      context,
      'issueRecoveryPurposeCodes',
      id,
      { caseRef },
      { caseRef, enrollmentRef, setId: id },
      async (tx) => {
        await this.current(context, caseRef, enrollmentRef, tx);
        for (const old of await tx.list(
          'RecoveryCodeSet',
          { accountRef: { id: context.principalId }, invalidated: false },
          100,
        )) {
          await this.factors.authorization.lookup('RecoveryCodeSet', String(old.setId), tx);
          await tx.put(
            'RecoveryCodeSet',
            { ...old, invalidated: true, revision: Number(old.revision) + 1 },
            Number(old.revision),
          );
        }
        const states = await tx.list(
          'AccountSecurityState',
          { accountRef: { id: context.principalId } },
          2,
        );
        requireCondition(
          states.length === 1 &&
            states[0]!.securityGeneration === current.source.securityGeneration,
          409,
          'RECOVERY_CODES_SECURITY',
          '현재 발급 보안 세대를 대조하세요.',
        );
        await tx.put('RecoveryCodeSet', set);
        await tx.put('RecoveryCodeSecurityState', {
          codeSecurityId: u2CodeSecurityStateId(id),
          revision: 1,
          codeSetRef: ref('RecoveryCodeSet', set),
          bindingRef: current.source.bindingRef,
          securityStateRef: ref('AccountSecurityState', states[0]!),
          securityGeneration: current.source.securityGeneration,
          origin: 'ISSUED_AT_SECURITY_GENERATION',
          establishedAt: this.now().toISOString(),
          epoch: current.source.epoch,
        });
      },
    );
    return { codeSetRef: ref('RecoveryCodeSet', set), codes: issued.codes };
  }
  async acknowledge(
    context: ServiceContext,
    caseRef: Ref,
    enrollmentRef: Ref,
    codeSetRef: Ref,
    stored: boolean,
  ): Promise<Ref> {
    requireCondition(
      stored === true &&
        codeSetRef.entity === 'RecoveryCodeSet' &&
        codeSetRef.owner === 'IdentityRecovery',
      403,
      'CODE_STORAGE_ACK_REQUIRED',
      '본인의 새 코드 보관 확인이 필요합니다.',
    );
    const current = await this.current(context, caseRef, enrollmentRef);
    await this.change(
      context,
      'ackRecoveryPurposeCodes',
      codeSetRef.id + ':stored',
      { caseRef },
      { enrollmentRef, codeSetRef, stored },
      async (tx) => {
        await this.current(context, caseRef, enrollmentRef, tx);
        const set = await this.factors.authorization.lookup('RecoveryCodeSet', codeSetRef.id, tx),
          mapping = await this.factors.authorization.lookup(
            'RecoveryCodeSecurityState',
            u2CodeSecurityStateId(codeSetRef.id),
            tx,
          );
        requireCondition(
          set?.revision === codeSetRef.revision &&
            set.confirmed === false &&
            set.invalidated === false &&
            (set.accountRef as Ref).id === context.principalId &&
            canonicalJson(set.bindingRef) === canonicalJson(current.source.bindingRef) &&
            mapping &&
            mapping.securityGeneration === current.source.securityGeneration &&
            mapping.origin === 'ISSUED_AT_SECURITY_GENERATION' &&
            canonicalJson(mapping.codeSetRef) === canonicalJson(codeSetRef),
          409,
          'RECOVERY_CODES_CURRENT',
          '본인의 현재 발급/보관 세대가 필요합니다.',
        );
        const next = { ...set, confirmed: true, revision: Number(set.revision) + 1 };
        await tx.put('RecoveryCodeSet', next, Number(set.revision));
        await tx.put(
          'RecoveryCodeSecurityState',
          {
            ...mapping,
            codeSetRef: ref('RecoveryCodeSet', next),
            revision: Number(mapping.revision) + 1,
          },
          Number(mapping.revision),
        );
      },
    );
    return ref(
      'RecoveryCodeSet',
      (await this.factors.authorization.lookup('RecoveryCodeSet', codeSetRef.id))!,
    );
  }
}
