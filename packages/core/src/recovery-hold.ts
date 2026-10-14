import { randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { CommandMeta, Ref, Receipt, ServiceContext } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import type { PurposeSecretVault, VaultBinding } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { RecoveryVerificationPolicies } from './recovery-verification.js';
import { runU2AccessCommand } from './enterprise-memberships.js';
import { ref } from './references.js';
export interface RecoveryHoldInput {
  meta: CommandMeta;
  sourceRef: Ref;
  basisRef: Ref | null;
  reason: string;
}
export function recoveryHoldTransition(state: string, operation: 'resume' | 'close'): boolean {
  return operation === 'resume'
    ? state === 'HOLD'
    : ['REQUESTED', 'VERIFYING', 'HOLD', 'ENROLMENT_ONLY', 'EXTERNAL_PENDING'].includes(state);
}
export class RecoveryHolds {
  readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    private readonly policy: RecoveryVerificationPolicies,
    private readonly now: () => Date,
    private readonly vault: PurposeSecretVault,
  ) {
    requireCondition(
      policy.store === store,
      503,
      'RECOVERY_POLICY_STORE',
      '현재 복구 정책과 같은 보호 원본이 필요합니다.',
    );
    this.authorization = new Authorization(store, now);
  }
  resume(context: ServiceContext, input: RecoveryHoldInput): Promise<Receipt> {
    return this.change(context, input, 'resume');
  }
  close(context: ServiceContext, input: RecoveryHoldInput): Promise<Receipt> {
    return this.change(context, input, 'close');
  }
  private async change(
    context: ServiceContext,
    input: RecoveryHoldInput,
    operation: 'resume' | 'close',
  ): Promise<Receipt> {
    this.store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/HoldInput', input);
    requireCondition(
      input.sourceRef.owner === 'IdentityRecovery' && input.sourceRef.entity === 'RecoveryCase',
      400,
      'RECOVERY_HOLD_TARGET',
      '원래 복구 case만 변경합니다.',
    );
    let source: ModelData;
    const authorize = async (tx?: ProtectedTransaction) => {
      await this.authorization.requireStaff(context, 'identity.recovery.verify', tx);
      source = (await this.authorization.lookup('RecoveryCase', input.sourceRef.id, tx))!;
      requireCondition(
        source &&
          source.revision === input.sourceRef.revision &&
          source.revision === input.meta.expectedRevision &&
          source.epoch === (await this.store.currentEpoch()) &&
          recoveryHoldTransition(String(source.state), operation),
        409,
        'RECOVERY_HOLD_REVISION',
        '현재 원래 보류/종료 개정이 필요합니다.',
      );
      if (operation === 'resume') {
        requireCondition(
          input.basisRef,
          403,
          'RECOVERY_REVIEW_EVIDENCE',
          '재검토의 새 현재 인정 정책/근거가 필요합니다.',
        );
        await this.policy.assertReview(source, input.basisRef, input.meta.evidenceRefs, tx);
      } else
        requireCondition(
          input.reason.trim().length > 0 && input.meta.evidenceRefs.length > 0,
          400,
          'RECOVERY_CLOSE_REASON',
          '정당한 종료 사유/근거가 필요합니다.',
        );
    };
    const receipt = await runU2AccessCommand(
      this,
      context,
      operation === 'resume' ? 'resumeRecovery' : 'closeRecovery',
      { kind: 'RECORD', recordRef: input.sourceRef },
      input,
      authorize,
      async (tx) => {
        const refs: Ref[] = [];
        // Closing/reviewing does not claim that old external effects ended. Slots
        // and operation results remain unchanged and continue to fence new effects.
        const grants = await tx.list(
          'RecoveryHandoffGrant',
          { caseRef: { id: source.caseId }, state: 'ISSUED' },
          2,
        );
        requireCondition(
          grants.length <= 1,
          503,
          'HANDOFF_CONFLICT',
          '원래 단일 활성 인계를 대조하세요.',
        );
        for (const grant of grants) {
          await this.authorization.lookup('RecoveryHandoffGrant', String(grant.grantId), tx);
          const next = { ...grant, state: 'REVOKED', revision: Number(grant.revision) + 1 };
          await tx.put('RecoveryHandoffGrant', next, Number(grant.revision));
          await tx.put('SecurityTombstone', {
            tombstoneId: randomUUID(),
            revision: 1,
            targetRef: { ...ref('RecoveryHandoffGrant', grant), revision: 1 },
            purpose: 'HANDOFF',
            reason: operation === 'close' ? 'CASE_CLOSED' : 'NEW_REVIEW_REQUIRED',
            destroyedAt: this.now().toISOString(),
            epoch: source.epoch,
          });
          refs.push(ref('RecoveryHandoffGrant', next));
        }
        if (source.enrollmentAuthorityRef) {
          const authority = await this.authorization.lookup(
            'EnrollmentAuthority',
            (source.enrollmentAuthorityRef as Ref).id,
            tx,
          );
          requireCondition(
            authority &&
              (authority.accountRef as Ref).id === (source.accountRef as Ref).id &&
              (authority.sourceRef as Ref | null)?.id === source.caseId,
            503,
            'RECOVERY_AUTHORITY_SOURCE',
            '원래 제한 권위 관계를 대조하세요.',
          );
          if (['ACTIVE', 'HOLD'].includes(String(authority.state))) {
            const next = {
              ...authority,
              state: 'REVOKED',
              revision: Number(authority.revision) + 1,
            };
            await tx.put('EnrollmentAuthority', next, Number(authority.revision));
            for (const purpose of ['ENROLLMENT_HANDLE', 'PROVIDER_CHALLENGE', 'FIRST_FACTOR'])
              await tx.put('SecurityTombstone', {
                tombstoneId: randomUUID(),
                revision: 1,
                targetRef: { ...ref('EnrollmentAuthority', authority), revision: 1 },
                purpose,
                reason: operation === 'close' ? 'CASE_CLOSED' : 'NEW_REVIEW_REQUIRED',
                destroyedAt: this.now().toISOString(),
                epoch: source.epoch,
              });
            refs.push(ref('EnrollmentAuthority', next));
          }
        }
        const next = {
          ...source,
          state: operation === 'resume' ? 'VERIFYING' : 'CLOSED',
          holdReason:
            operation === 'resume'
              ? 'AWAITING_NEW_VERIFICATION'
              : 'CLOSED_WITH_ORIGINAL_EFFECTS_PRESERVED',
          reason: input.reason,
          verificationRef: operation === 'resume' ? null : source.verificationRef,
          partyContextRef: operation === 'resume' ? null : source.partyContextRef,
          enrollmentAuthorityRef: operation === 'resume' ? null : source.enrollmentAuthorityRef,
          revision: Number(source.revision) + 1,
        };
        await tx.put('RecoveryCase', next, Number(source.revision));
        return {
          target: ref('RecoveryCase', next),
          refs: [ref('RecoveryCase', next), ...refs],
          scope: null,
          state: operation === 'resume' ? 'REVIEW_REQUIRED' : 'RESULT_RECORDED',
          before: ref('RecoveryCase', source),
        };
      },
      this.now,
      async (tx) => {
        await this.authorization.identity(context, tx);
      },
      'IdentityRecovery',
    );
    for (const selected of receipt.resultRefs) {
      if (!['RecoveryHandoffGrant', 'EnrollmentAuthority'].includes(selected.entity)) continue;
      const original = await this.store.readRevision(selected.entity, selected.id, 1);
      requireCondition(
        original,
        503,
        'RECOVERY_ORIGINAL_SECRET_SOURCE',
        '원래 파기 자료의 보호 결합이 필요합니다.',
      );
      const purpose = selected.entity === 'RecoveryHandoffGrant' ? 'HANDOFF' : 'ENROLLMENT_HANDLE',
        id = purpose === 'HANDOFF' ? original.vaultRef : original.handleVaultRef;
      if (id === null) continue;
      const targetRef = { ...selected, revision: 1 },
        binding: VaultBinding = {
          id: String(id),
          purpose,
          targetRef,
          accountRef: original.accountRef as Ref,
          audience: original.audience as 'CUSTOMER' | 'STAFF',
          bindingGeneration: Number(original.bindingGeneration),
          sourceRevision: 1,
          expiresAt: String(original.expiresAt),
          keyVersion: this.vault.keyVersion,
        };
      await this.vault.destroy(binding, {
        authorityRef: targetRef,
        targetRef,
        purpose,
        operation:
          purpose === 'HANDOFF' ? 'identity.handoff.deliver' : 'identity.enrollment.handle',
        epoch: await this.store.currentEpoch(),
        deadlineAt: new Date(this.now().getTime() + 30000).toISOString(),
      });
    }
    return receipt;
  }
}
