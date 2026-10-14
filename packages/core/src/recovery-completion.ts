import { canonicalJson, fingerprint, requireCondition } from '@oms/contracts';
import type { CommandMeta, Ref, Receipt, ServiceContext } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { u2CodeSecurityStateId } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { EnrollmentAuthorities } from './enrollment-authority.js';
import { runU2AccessCommand } from './enterprise-memberships.js';
import { enqueueMinimumNotice } from './pending-notification.js';
import { ref } from './references.js';
import type { EmergencyRecoveries } from './emergency-recovery.js';

export interface RecoveryCompletionInput {
  meta: CommandMeta;
  caseRef: Ref;
  enrollmentRef: Ref;
  codeSetRef: Ref;
  providerResultRefs: Ref[];
}
export interface RecoveryCompletionFacts {
  newFactor: boolean;
  oldFactors: boolean;
  oldCodes: boolean;
  oldSessions: boolean;
  originalEffects: boolean;
  newCodesStored: boolean;
  currentAuthority: boolean;
}
export function recoveryCompletionConjunction(facts: RecoveryCompletionFacts): boolean {
  return (
    facts.newFactor === true &&
    facts.oldFactors === true &&
    facts.oldCodes === true &&
    facts.oldSessions === true &&
    facts.originalEffects === true &&
    facts.newCodesStored === true &&
    facts.currentAuthority === true
  );
}
export function identityResultDigest(
  source: ModelData,
  bindingRef: Ref,
  operationId: string,
): string {
  return fingerprint({
    caseId: source.caseId,
    bindingRef,
    operationId,
    securityGeneration: source.securityGeneration,
    epoch: source.epoch,
  });
}
// This is the owner-side commit boundary, not a provider success probe. The
// protected producer must register every original effect before execution.
export class RecoveryCompletions {
  readonly authorization: Authorization;
  private async originalDigest(row: ModelData, source: ModelData): Promise<boolean> {
    if (row.revision === 1)
      return (
        row.inputDigest ===
        identityResultDigest(source, row.bindingRef as Ref, String(row.operationId))
      );
    const intent = await this.store.readRevision(
      'IdentityOperationResult',
      String(row.operationResultId),
      1,
    );
    return !!(
      intent &&
      intent.inputDigest === row.inputDigest &&
      intent.operationId === row.operationId &&
      intent.epoch === row.epoch &&
      canonicalJson(intent.bindingRef) === canonicalJson(row.bindingRef) &&
      (intent.caseRef as Ref).id === source.caseId
    );
  }
  constructor(
    readonly store: ProtectedStore,
    private readonly authorities: EnrollmentAuthorities,
    private readonly now: () => Date,
    private readonly registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED',
    private readonly operators?: EmergencyRecoveries,
  ) {
    requireCondition(
      authorities.store === store && (!operators || operators.store === store),
      503,
      'RECOVERY_COMPLETION_STORE',
      '현재 목적 권위와 같은 보호 원본이 필요합니다.',
    );
    this.authorization = new Authorization(store, now);
  }
  async complete(context: ServiceContext, input: RecoveryCompletionInput): Promise<Receipt> {
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/CompletionInput',
      input,
    );
    let source: ModelData, authority: ModelData, binding: ModelData;
    const identity = async (tx?: ProtectedTransaction) => {
      await this.authorities.assert(context, 'MFA_REENROLMENT', tx, true);
    };
    const authorize = async (tx?: ProtectedTransaction) => {
      authority = await this.authorities.assert(context, 'MFA_REENROLMENT', tx);
      source = (await this.authorization.lookup('RecoveryCase', input.caseRef.id, tx))!;
      requireCondition(
        this.registration === 'LOCAL_SYNTHETIC',
        503,
        'RECOVERY_COMPLETION_HOLD',
        '실제 제공자/격리/수신 경로의 검증 전에는 복구 완료를 보류합니다.',
      );
      requireCondition(
        source &&
          source.revision === input.caseRef.revision &&
          source.revision === input.meta.expectedRevision &&
          ['ENROLMENT_ONLY', 'EXTERNAL_PENDING'].includes(String(source.state)) &&
          (source.accountRef as Ref).id === context.principalId &&
          (source.enrollmentAuthorityRef as Ref | null)?.id === authority.authorityId &&
          (authority.sourceRef as Ref | null)?.id === source.caseId &&
          source.securityGeneration === authority.securityGeneration &&
          source.epoch === authority.epoch,
        409,
        'RECOVERY_COMPLETION_SOURCE',
        '원래 현재 복구 case/당사자 제한 권위가 필요합니다.',
      );
      binding = (await this.authorization.lookup(
        'ProviderBinding',
        (source.bindingRef as Ref).id,
        tx,
      ))!;
      requireCondition(
        binding &&
          canonicalJson(ref('ProviderBinding', binding)) === canonicalJson(source.bindingRef),
        409,
        'RECOVERY_COMPLETION_BINDING',
        '현재 원래 연결 개정을 확인하세요.',
      );
      if (source.method === 'EMERGENCY') {
        const verification = await this.authorization.lookup(
          'RecoveryVerification',
          (source.verificationRef as Ref).id,
          tx,
        );
        requireCondition(
          this.operators && verification?.operatorAuthorityRef,
          503,
          'RECOVERY_COMPLETION_HOLD',
          '현재 원래 비상 운영 원본이 필요합니다.',
        );
        await this.operators.assertSourceAuthority(
          verification.operatorAuthorityRef as Ref,
          source,
          tx,
        );
      }
      const enrollment = await this.authorization.lookup(
          'MfaEnrollment',
          input.enrollmentRef.id,
          tx,
        ),
        codes = await this.authorization.lookup('RecoveryCodeSet', input.codeSetRef.id, tx),
        mapping = await this.authorization.lookup(
          'RecoveryCodeSecurityState',
          u2CodeSecurityStateId(input.codeSetRef.id),
          tx,
        );
      const facts: RecoveryCompletionFacts = {
        currentAuthority: true,
        newFactor: !!(
          input.enrollmentRef.entity === 'MfaEnrollment' &&
          enrollment?.revision === input.enrollmentRef.revision &&
          enrollment.state === 'VERIFIED' &&
          (enrollment.accountRef as Ref).id === context.principalId &&
          !(source.originalFactorRefs as Ref[]).some((old) => old.id === input.enrollmentRef.id)
        ),
        oldFactors: true,
        oldCodes: true,
        oldSessions: true,
        originalEffects: true,
        newCodesStored: !!(
          input.codeSetRef.entity === 'RecoveryCodeSet' &&
          codes?.revision === input.codeSetRef.revision &&
          codes.confirmed === true &&
          codes.invalidated === false &&
          (codes.accountRef as Ref).id === context.principalId &&
          canonicalJson(codes.bindingRef) === canonicalJson(source.bindingRef) &&
          codes.generation === source.bindingGeneration &&
          mapping &&
          canonicalJson(mapping.codeSetRef) === canonicalJson(input.codeSetRef) &&
          mapping.securityGeneration === source.securityGeneration &&
          mapping.epoch === source.epoch &&
          mapping.origin === 'ISSUED_AT_SECURITY_GENERATION'
        ),
      };
      for (const old of source.originalFactorRefs as Ref[]) {
        const row = await this.authorization.lookup('MfaEnrollment', old.id, tx);
        facts.oldFactors &&= !!(
          row &&
          row.state === 'INVALIDATED' &&
          (row.accountRef as Ref).id === context.principalId
        );
      }
      for (const old of source.originalCodeSetRefs as Ref[]) {
        const row = await this.authorization.lookup('RecoveryCodeSet', old.id, tx);
        facts.oldCodes &&= !!(
          row &&
          row.invalidated === true &&
          (row.accountRef as Ref).id === context.principalId
        );
      }
      for (const old of source.originalSessionRefs as Ref[]) {
        const row = await this.authorization.lookup('IdentitySession', old.id, tx);
        let fenced = row?.phase === 'INVALIDATED';
        if (row)
          for (const original of source.originalBindingRefs as Ref[]) {
            const originalBinding = await this.store.readRevision(
                'ProviderBinding',
                original.id,
                original.revision,
              ),
              current = await this.authorization.lookup('ProviderBinding', original.id, tx);
            if (
              originalBinding?.audience === row.audience &&
              current?.active &&
              current.generation === row.bindingGeneration &&
              Number(current.authRevision) > Number(row.authRevision)
            )
              fenced = true;
          }
        facts.oldSessions &&= !!(
          row &&
          (row.accountRef as Ref).id === context.principalId &&
          fenced
        );
      }
      const results: ModelData[] = [];
      for (const selected of input.providerResultRefs) {
        requireCondition(
          selected.owner === 'IdentityRecovery' && selected.entity === 'IdentityOperationResult',
          403,
          'RECOVERY_PROVIDER_RESULT',
          '현재 등록 제공자 관측 원본만 대조합니다.',
        );
        const row = await this.authorization.lookup('IdentityOperationResult', selected.id, tx);
        requireCondition(
          row?.revision === selected.revision &&
            (row.caseRef as Ref).id === source.caseId &&
            row.epoch === source.epoch &&
            row.knowledge === 'KNOWN' &&
            row.terminal === true &&
            row.evidenceRefs instanceof Array &&
            row.evidenceRefs.length > 0 &&
            Date.parse(String(row.observedAt)) >= Date.parse(String(authority.issuedAt)) &&
            Date.parse(String(row.observedAt)) <= this.now().getTime() &&
            (await this.originalDigest(row, source)),
          403,
          'RECOVERY_PROVIDER_RESULT',
          '요청 수락/현재 probe를 원래 효과 종료로 해석하지 않습니다.',
        );
        results.push(row);
      }
      facts.oldSessions &&= (source.originalBindingRefs as Ref[]).length > 0;
      for (const original of source.originalBindingRefs as Ref[]) {
        const before = await this.store.readRevision(
            'ProviderBinding',
            original.id,
            original.revision,
          ),
          current = await this.authorization.lookup('ProviderBinding', original.id, tx);
        facts.oldSessions &&= !!(
          before &&
          current &&
          before.active &&
          current.active &&
          (current.accountRef as Ref).id === context.principalId &&
          current.generation === before.generation &&
          Number(current.authRevision) > Number(before.authRevision)
        );
      }
      const factor = results.find(
        (row) =>
          row.effect === 'FACTOR_VERIFIED' &&
          canonicalJson(row.bindingRef) === canonicalJson(source.bindingRef) &&
          (row.evidenceRefs as Ref[]).some(
            (value) => canonicalJson(value) === canonicalJson(input.enrollmentRef),
          ),
      );
      facts.newFactor &&= !!factor;
      let observedFactor = false;
      if (factor && enrollment)
        for (const selected of enrollment.verificationEvidenceRefs as Ref[]) {
          if (selected.owner !== 'U1Host' || selected.entity !== 'RequestReceipt') continue;
          const receipt = await this.authorization.lookup('RequestReceipt', selected.id, tx);
          if (
            receipt?.revision === selected.revision &&
            receipt.operation === 'identity.recovery-factor-observed' &&
            receipt.owner === 'IdentityRecovery' &&
            receipt.principalId === context.principalId &&
            receipt.audience === context.audience &&
            receipt.requestState === 'RESULT_RECORDED' &&
            (receipt.targetIdentity as { recordRef?: Ref }).recordRef?.id === source.caseId &&
            Date.parse(String(receipt.acceptedAt)) >= Date.parse(String(authority.issuedAt)) &&
            (receipt.resultRefs as Ref[]).some(
              (value) => canonicalJson(value) === canonicalJson(input.enrollmentRef),
            ) &&
            (receipt.resultRefs as Ref[]).some(
              (value) =>
                canonicalJson(value) === canonicalJson(ref('IdentityOperationResult', factor)),
            )
          )
            observedFactor = true;
        }
      facts.newFactor &&= observedFactor;
      const originals = source.originalBindingRefs as Ref[];
      facts.originalEffects =
        (source.originalOperationRefs as Ref[]).length > 0 &&
        originals.length > 0 &&
        originals.every(
          (original) =>
            results.some(
              (row) =>
                canonicalJson(row.bindingRef) === canonicalJson(original) &&
                ['REMOVED', 'ISOLATED'].includes(String(row.effect)),
            ) &&
            results.some(
              (row) =>
                canonicalJson(row.bindingRef) === canonicalJson(original) &&
                ['SIGNED_OUT', 'ISOLATED'].includes(String(row.effect)),
            ),
        );
      for (const original of source.originalOperationRefs as Ref[]) {
        const work = await this.authorization.lookup(original.entity, original.id, tx);
        facts.originalEffects &&= !!(
          original.entity === 'WorkItem' &&
          work?.state === 'RESULT_RECORDED' &&
          work.owner === 'IdentityRecovery' &&
          [
            'IdentityRecovery.removeOriginalFactor',
            'IdentityRecovery.signOutOriginalSessions',
            'IdentityRecovery.replaceFirstFactor',
          ].includes(String(work.operationId)) &&
          (work.targetRef as Ref | null)?.id === source.caseId &&
          work.epoch === source.epoch &&
          work.attempt === 1 &&
          results.some(
            (row) =>
              row.operationId === original.id &&
              Date.parse(String(row.observedAt)) < Date.parse(String(work.deadlineAt)),
          )
        );
      }
      const slots = await this.store.list('IdentityExecutionSlot', {
        equals: { accountRef: { id: context.principalId } },
        anyOf: [{ state: 'ACTIVE' }, { state: 'UNKNOWN' }],
        limit: 2,
      });
      requireCondition(
        slots.length === 1 &&
          (slots[0]!.caseRef as Ref).id === source.caseId &&
          slots[0]!.state === 'ACTIVE',
        409,
        'RECOVERY_EFFECT_UNKNOWN',
        '원래 단일 실행 slot의 불명 결과를 먼저 종료/격리해야 합니다.',
      );
      await this.authorization.lookup('IdentityExecutionSlot', String(slots[0]!.slotId), tx);
      requireCondition(
        recoveryCompletionConjunction(facts),
        409,
        'RECOVERY_COMPLETION_REQUIRED',
        '새 MFA/옛 수단·코드·세션 무효화/원래 효과 종료·격리/새 코드 보관 확인을 모두 대조하세요.',
      );
    };
    return runU2AccessCommand(
      this,
      context,
      'completeRecovery',
      { kind: 'RECORD', recordRef: input.caseRef },
      input,
      authorize,
      async (tx, requestId) => {
        const updatedBinding = {
            ...binding,
            removalState: 'COMPLETED',
            revision: Number(binding.revision) + 1,
          },
          updatedAuthority = {
            ...authority,
            state: 'COMPLETED',
            revision: Number(authority.revision) + 1,
          },
          completed: ModelData = {
            ...source,
            state: 'COMPLETED',
            bindingRef: ref('ProviderBinding', updatedBinding),
            holdReason: 'COMPLETION_CONFIRMED_NOTICE_REQUESTED',
            revision: Number(source.revision) + 1,
          };
        await tx.put('ProviderBinding', updatedBinding, Number(binding.revision));
        await tx.put('EnrollmentAuthority', updatedAuthority, Number(authority.revision));
        const slots = await tx.list(
          'IdentityExecutionSlot',
          { accountRef: { id: context.principalId }, state: 'ACTIVE' },
          2,
        );
        requireCondition(
          slots.length === 1 && (slots[0]!.caseRef as Ref).id === source.caseId,
          409,
          'RECOVERY_SLOT_CHANGED',
          '현재 원래 실행 slot을 확인하세요.',
        );
        const slot = { ...slots[0]!, state: 'CLOSED', revision: Number(slots[0]!.revision) + 1 };
        await tx.put('IdentityExecutionSlot', slot, Number(slots[0]!.revision));
        // E01 obligation is committed with completion; transport acceptance and
        // actual delivery remain the notification owner's separate outcomes.
        completed.noticeRef = await enqueueMinimumNotice(
          tx,
          context,
          requestId,
          ref('RecoveryCase', completed),
          null,
          String(source.epoch),
          this.now(),
        );
        await tx.put('RecoveryCase', completed, Number(source.revision));
        if (source.method === 'EMERGENCY') {
          const records = await tx.list(
            'EmergencyRecoveryCase',
            { caseRef: { id: source.caseId }, state: 'ENROLMENT_ONLY' },
            2,
          );
          requireCondition(
            records.length === 1,
            503,
            'CURRENT_EMERGENCY_REQUIRED',
            '현재 원래 비상 제한 단계를 대조하세요.',
          );
          const original = (await this.authorization.lookup(
            'EmergencyRecoveryCase',
            String(records[0]!.emergencyCaseId),
            tx,
          ))!;
          await tx.put(
            'EmergencyRecoveryCase',
            {
              ...original,
              state: 'COMPLETED',
              caseRef: ref('RecoveryCase', completed),
              revision: Number(original.revision) + 1,
            },
            Number(original.revision),
          );
        }
        return {
          target: ref('RecoveryCase', completed),
          refs: [
            ref('RecoveryCase', completed),
            ref('EnrollmentAuthority', updatedAuthority),
            ref('ProviderBinding', updatedBinding),
            ref('IdentityExecutionSlot', slot),
            input.enrollmentRef,
            input.codeSetRef,
            ...input.providerResultRefs,
          ],
          scope: null,
          state: 'RESULT_RECORDED',
          before: ref('RecoveryCase', source),
        };
      },
      this.now,
      identity,
      'IdentityRecovery',
    );
  }
}
