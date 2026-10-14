import { canonicalJson, requireCondition } from '@oms/contracts';
import { randomUUID } from 'node:crypto';
import type { Ref, Receipt, ServiceContext, U2PrivateOperatorContext } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { PurposeVerifier } from './purpose-verifier.js';
import type { SecretBinding } from './purpose-verifier.js';
import type { RecoveryHoldInput } from './recovery-hold.js';
import type { RecoveryCompletionInput } from './recovery-completion.js';
import { runU2AccessCommand } from './enterprise-memberships.js';
import { ref } from './references.js';

export function emergencyTransition(state: string, operation: 'resume' | 'close'): boolean {
  return operation === 'resume' ? state === 'HOLD' : ['OPEN', 'VERIFYING', 'HOLD'].includes(state);
}
// This port is registered by the private operator host. A STAFF role, a
// caller-created context or a source Ref alone never grants this authority.
export class EmergencyRecoveries {
  readonly authorization: Authorization;
  private readonly services = new WeakMap<ServiceContext, U2PrivateOperatorContext>();
  private readonly contexts = new WeakMap<
    U2PrivateOperatorContext,
    { authority: string; context: string; caseId: string; ingress: unknown }
  >();
  constructor(
    readonly store: ProtectedStore,
    private readonly verifier: PurposeVerifier,
    private readonly now: () => Date,
    private readonly registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED',
    private readonly privateIngress: (proof: unknown) => Promise<boolean>,
  ) {
    this.authorization = new Authorization(store, now);
  }
  binding(source: ModelData, epoch: string): SecretBinding {
    return {
      purpose: 'EMERGENCY_OPERATOR',
      targetRef: ref('EmergencyOperatorAuthority', source),
      accountRef: null,
      bindingRef: null,
      bindingGeneration: 1,
      securityGeneration: 1,
      sourceRevision: Number(source.revision),
      epoch,
      challengeId: String(source.operatorAuthorityId),
      keyVersion: this.verifier.keyVersion,
    };
  }
  async authenticate(
    authorityRef: Ref,
    credential: string,
    caseRef: Ref,
    correlationId: string,
    ingress: unknown,
  ): Promise<U2PrivateOperatorContext> {
    requireCondition(
      await this.privateIngress(ingress),
      403,
      'EMERGENCY_PRIVATE_REQUIRED',
      '등록된 별도 비공개 운영 접점이 필요합니다.',
    );
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/EmergencyOperatorAuthority',
      authorityRef,
    );
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/RecoveryCase',
      caseRef,
    );
    const authority = await this.authorization.lookup(
        'EmergencyOperatorAuthority',
        authorityRef.id,
      ),
      source = await this.authorization.lookup('RecoveryCase', caseRef.id);
    requireCondition(
      authority &&
        authority.revision === authorityRef.revision &&
        source &&
        source.revision === caseRef.revision &&
        this.verifier.matches(
          credential,
          this.binding(authority, await this.store.currentEpoch()),
          String(authority.credentialVerifier),
        ),
      401,
      'EMERGENCY_AUTHORITY_REQUIRED',
      '현재 원래 운영 자격/대상 결합이 필요합니다.',
    );
    const context: U2PrivateOperatorContext = {
      audience: 'SYSTEM',
      operatorAuthorityRef: authorityRef,
      caseRef,
      purpose: 'EMERGENCY_PRIVATE',
      correlationId,
      deadlineAt: new Date(
        Math.min(this.now().getTime() + 10000, Date.parse(String(authority.expiresAt))),
      ).toISOString(),
    };
    this.contexts.set(context, {
      authority: canonicalJson(authority),
      context: canonicalJson(context),
      caseId: caseRef.id,
      ingress,
    });
    await this.assert(context);
    return context;
  }
  async assert(
    context: U2PrivateOperatorContext,
    tx?: ProtectedTransaction,
  ): Promise<{ operator: ModelData; source: ModelData }> {
    const captured = this.contexts.get(context);
    requireCondition(
      captured &&
        captured.context === canonicalJson(context) &&
        context.audience === 'SYSTEM' &&
        context.purpose === 'EMERGENCY_PRIVATE' &&
        context.caseRef.id === captured.caseId &&
        this.now().getTime() < Date.parse(context.deadlineAt) &&
        (await this.privateIngress(captured.ingress)),
      403,
      'EMERGENCY_PRIVATE_REQUIRED',
      '서버가 확인한 원래 비공개 운영 문맥이 필요합니다.',
    );
    const operator = await this.authorization.lookup(
        'EmergencyOperatorAuthority',
        context.operatorAuthorityRef.id,
        tx,
      ),
      source = await this.authorization.lookup('RecoveryCase', context.caseRef.id, tx);
    requireCondition(
      operator &&
        canonicalJson(operator) === captured.authority &&
        operator.active &&
        this.now().getTime() < Date.parse(String(operator.expiresAt)) &&
        source &&
        source.epoch === (await this.store.currentEpoch()),
      403,
      'EMERGENCY_AUTHORITY_CHANGED',
      '현재 운영 자격/원래 대상이 변경됐습니다.',
    );
    await this.assertSourceAuthority(context.operatorAuthorityRef, source, tx);
    return { operator, source };
  }
  async assertSourceAuthority(
    operatorRef: Ref,
    source: ModelData,
    tx?: ProtectedTransaction,
  ): Promise<ModelData> {
    requireCondition(
      operatorRef.owner === 'IdentityRecovery' &&
        operatorRef.entity === 'EmergencyOperatorAuthority',
      403,
      'EMERGENCY_AUTHORITY_REQUIRED',
      '원래 별도 운영 권위만 대조합니다.',
    );
    const operator = await this.authorization.lookup(
      'EmergencyOperatorAuthority',
      operatorRef.id,
      tx,
    );
    requireCondition(
      operator &&
        operator.revision === operatorRef.revision &&
        operator.active &&
        this.now().getTime() < Date.parse(String(operator.expiresAt)) &&
        source.epoch === (await this.store.currentEpoch()),
      403,
      'EMERGENCY_AUTHORITY_CHANGED',
      '원래 운영 권위가 변경/만료됐습니다.',
    );
    const policy = await this.authorization.lookup(
      'VerificationPolicy',
      (operator.policyRef as Ref).id,
      tx,
    );
    requireCondition(
      this.registration === 'LOCAL_SYNTHETIC' &&
        operator.synthetic === true &&
        policy?.active &&
        policy.synthetic === true &&
        policy.purpose === 'EMERGENCY_PRIVATE' &&
        policy.revision === (operator.policyRef as Ref).revision &&
        this.now().getTime() < Date.parse(String(policy.expiresAt)),
      503,
      'EMERGENCY_POLICY_HOLD',
      '실제 운영 자격/정책 등록 전에는 비상 실행을 보류합니다.',
    );
    const account = await this.authorization.lookup('Account', (source.accountRef as Ref).id, tx),
      binding = await this.authorization.lookup(
        'ProviderBinding',
        (source.bindingRef as Ref).id,
        tx,
      );
    requireCondition(
      account?.active &&
        binding?.active &&
        binding.audience === 'STAFF' &&
        (binding.accountRef as Ref).id === (source.accountRef as Ref).id &&
        binding.generation === source.bindingGeneration &&
        binding.revision === (source.bindingRef as Ref).revision,
      403,
      'EMERGENCY_ORIGINAL_STAFF',
      '원래 지정된 담당자의 현재 직원 연결만 복원합니다.',
    );
    await this.authorization.requireStaffSource(
      source.accountRef as Ref,
      'identity.recovery.verify',
      tx,
    );
    const states = await this.store.list('AccountSecurityState', {
      equals: { accountRef: { id: (source.accountRef as Ref).id } },
      limit: 2,
    });
    requireCondition(
      states.length === 1,
      503,
      'CURRENT_SECURITY_REQUIRED',
      '현재 단일 보안 세대를 확인하세요.',
    );
    const security = await this.authorization.lookup(
      'AccountSecurityState',
      String(states[0]!.securityStateId),
      tx,
    );
    requireCondition(
      security?.securityGeneration === source.securityGeneration,
      409,
      'EMERGENCY_SECURITY_CHANGED',
      '원래 보안 세대가 변경됐습니다.',
    );
    return operator;
  }
  async serviceContext(context: U2PrivateOperatorContext): Promise<ServiceContext> {
    const initial = await this.assert(context),
      service: ServiceContext = {
        principalId: String(initial.operator.operatorId),
        actorAccountRef: initial.source.accountRef as Ref,
        verifiedPersonRef: null,
        identityAssertionRef: context.operatorAuthorityRef,
        audience: 'SYSTEM',
        accessEvaluationRef: null,
        executionPermitRef: null,
        correlationId: context.correlationId,
        deadlineAt: context.deadlineAt,
      };
    this.services.set(service, context);
    return service;
  }
  async assertService(
    context: ServiceContext,
    caseId: string,
    tx?: ProtectedTransaction,
  ): Promise<Ref> {
    const original = this.services.get(context);
    requireCondition(
      original &&
        original.caseRef.id === caseId &&
        context.audience === 'SYSTEM' &&
        context.principalId.length > 0 &&
        context.identityAssertionRef.id === original.operatorAuthorityRef.id &&
        context.deadlineAt === original.deadlineAt,
      403,
      'EMERGENCY_PRIVATE_REQUIRED',
      '원래 서버 운영 문맥만 확인합니다.',
    );
    const current = await this.assert(original, tx);
    requireCondition(
      current.operator.operatorId === context.principalId &&
        (current.source.accountRef as Ref).id === context.actorAccountRef?.id,
      403,
      'EMERGENCY_PRIVATE_REQUIRED',
      '원래 운영 주체/대상이 변경됐습니다.',
    );
    return original.operatorAuthorityRef;
  }
  resume(context: U2PrivateOperatorContext, input: RecoveryHoldInput): Promise<Receipt> {
    return this.change(context, input, 'resume');
  }
  close(context: U2PrivateOperatorContext, input: RecoveryHoldInput): Promise<Receipt> {
    return this.change(context, input, 'close');
  }
  async applyVerifiedResult(
    context: U2PrivateOperatorContext,
    input: RecoveryCompletionInput,
  ): Promise<Receipt> {
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/CompletionInput',
      input,
    );
    const service = await this.serviceContext(context);
    let original!: ModelData, source!: ModelData;
    const identity = async (tx?: ProtectedTransaction) => {
      await this.assertService(service, input.caseRef.id, tx);
    };
    const authorize = async (tx?: ProtectedTransaction) => {
      const current = await this.assert(context, tx);
      source = current.source;
      requireCondition(
        source.caseId === input.caseRef.id &&
          source.revision === input.caseRef.revision &&
          source.method === 'EMERGENCY' &&
          source.state === 'COMPLETED' &&
          source.noticeRef,
        409,
        'EMERGENCY_COMPLETION_REQUIRED',
        '당사자의 전체 보호 완료/통지 의무 이후 원래 비상 결과만 기록합니다.',
      );
      const records = await this.store.list('EmergencyRecoveryCase', {
        equals: { caseRef: { id: source.caseId }, state: 'COMPLETED' },
        limit: 2,
      });
      requireCondition(
        records.length === 1,
        503,
        'CURRENT_EMERGENCY_REQUIRED',
        '원래 단일 비상 완료가 필요합니다.',
      );
      original = (await this.authorization.lookup(
        'EmergencyRecoveryCase',
        String(records[0]!.emergencyCaseId),
        tx,
      ))!;
      requireCondition(
        original.revision === input.meta.expectedRevision &&
          canonicalJson(original.operatorAuthorityRef) ===
            canonicalJson(context.operatorAuthorityRef) &&
          original.epoch === source.epoch,
        409,
        'EMERGENCY_CONTROL_SOURCE',
        '현재 원래 운영 주체/예상 개정이 필요합니다.',
      );
      const receipts = await this.store.list('RequestReceipt', {
        equals: {
          owner: 'IdentityRecovery',
          operation: 'completeRecovery',
          resultRefs: [{ entity: 'RecoveryCase', id: source.caseId, revision: source.revision }],
        },
        limit: 2,
      });
      requireCondition(
        receipts.length === 1,
        503,
        'EMERGENCY_COMPLETION_REQUIRED',
        '원래 당사자 완료 receipt가 필요합니다.',
      );
      const receipt = (await this.authorization.lookup(
          'RequestReceipt',
          String(receipts[0]!.requestId),
          tx,
        ))!,
        refs = receipt.resultRefs as Ref[],
        observations = refs.filter((value) => value.entity === 'IdentityOperationResult');
      requireCondition(
        receipt.requestState === 'RESULT_RECORDED' &&
          receipt.principalId === (source.accountRef as Ref).id &&
          refs.some((value) => canonicalJson(value) === canonicalJson(input.enrollmentRef)) &&
          refs.some((value) => canonicalJson(value) === canonicalJson(input.codeSetRef)) &&
          observations.length === input.providerResultRefs.length &&
          input.providerResultRefs.every((value) =>
            observations.some((selected) => canonicalJson(value) === canonicalJson(selected)),
          ),
        403,
        'EMERGENCY_COMPLETION_REQUIRED',
        '원래 보호 MFA/코드/모든 제공자 결과를 정확히 대조하세요.',
      );
      for (const selected of [input.enrollmentRef, input.codeSetRef, ...input.providerResultRefs]) {
        const row = await this.authorization.lookup(selected.entity, selected.id, tx);
        requireCondition(
          row?.revision === selected.revision,
          409,
          'EMERGENCY_RESULT_CHANGED',
          '현재 원래 완료 결과 개정이 필요합니다.',
        );
      }
    };
    await authorize();
    return runU2AccessCommand(
      this,
      service,
      'applyVerifiedEmergencyResult',
      { kind: 'RECORD', recordRef: ref('EmergencyRecoveryCase', original) },
      input,
      authorize,
      async () => ({
        target: ref('EmergencyRecoveryCase', original),
        refs: [
          ref('EmergencyRecoveryCase', original),
          ref('RecoveryCase', source),
          input.enrollmentRef,
          input.codeSetRef,
          ...input.providerResultRefs,
        ],
        scope: null,
        state: 'RESULT_RECORDED',
        before: ref('EmergencyRecoveryCase', original),
      }),
      this.now,
      identity,
      'IdentityRecovery',
    );
  }
  private async change(
    context: U2PrivateOperatorContext,
    input: RecoveryHoldInput,
    operation: 'resume' | 'close',
  ): Promise<Receipt> {
    this.store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/HoldInput', input);
    let original: ModelData;
    const identity = async (tx?: ProtectedTransaction) => {
      await this.assert(context, tx);
    };
    const authorize = async (tx?: ProtectedTransaction) => {
      const { operator, source } = await this.assert(context, tx);
      original = (await this.authorization.lookup(
        'EmergencyRecoveryCase',
        input.sourceRef.id,
        tx,
      ))!;
      requireCondition(
        input.sourceRef.owner === 'IdentityRecovery' &&
          input.sourceRef.entity === 'EmergencyRecoveryCase' &&
          original?.revision === input.sourceRef.revision &&
          original.revision === input.meta.expectedRevision &&
          (original.caseRef as Ref).id === source.caseId &&
          (original.accountRef as Ref).id === (source.accountRef as Ref).id &&
          original.epoch === source.epoch &&
          emergencyTransition(String(original.state), operation) &&
          input.meta.evidenceRefs.length > 0,
        409,
        'EMERGENCY_CONTROL_SOURCE',
        '원래 비상 case/현재 예상 개정/근거를 확인하세요.',
      );
      if (operation === 'resume') {
        requireCondition(
          input.basisRef?.id === (operator.policyRef as Ref).id &&
            input.basisRef?.revision === (operator.policyRef as Ref).revision,
          403,
          'EMERGENCY_REVIEW_POLICY',
          '별도 운영 권위의 현재 정책을 명시하세요.',
        );
        const policy = (await this.authorization.lookup(
            'VerificationPolicy',
            input.basisRef.id,
            tx,
          ))!,
          observed = new Set<string>();
        for (const selected of input.meta.evidenceRefs) {
          requireCondition(
            selected.owner === 'IdentityRecovery' && selected.entity === 'VerificationEvidence',
            403,
            'EMERGENCY_REVIEW_EVIDENCE',
            '현재 비상 확인 원본이 필요합니다.',
          );
          const evidence = await this.authorization.lookup('VerificationEvidence', selected.id, tx);
          requireCondition(
            evidence?.revision === selected.revision &&
              evidence.state === 'CONFIRMED' &&
              evidence.synthetic === true &&
              evidence.purpose === 'EMERGENCY_PRIVATE' &&
              (evidence.policyRef as Ref).id === policy.policyId &&
              (evidence.policyRef as Ref).revision === policy.revision &&
              (evidence.operatorAuthorityRef as Ref | null)?.entity ===
                'EmergencyOperatorAuthority' &&
              (evidence.operatorAuthorityRef as Ref).id === operator.operatorAuthorityId &&
              (evidence.operatorAuthorityRef as Ref).revision === operator.revision &&
              (evidence.authorityRef as Ref).id === (source.accountRef as Ref).id &&
              (evidence.accountRef as Ref).id === (source.accountRef as Ref).id &&
              canonicalJson(evidence.bindingRef) === canonicalJson(source.bindingRef) &&
              (evidence.caseRef as Ref | null)?.id === source.caseId &&
              this.now().getTime() < Date.parse(String(evidence.expiresAt)),
            403,
            'EMERGENCY_REVIEW_EVIDENCE',
            '원래 대상/운영 자격/기한의 확인 근거가 필요합니다.',
          );
          observed.add(String(evidence.sourceKind));
        }
        const required = policy.requiredSourceKinds as string[];
        requireCondition(
          required.length > 0 && required.every((kind) => observed.has(kind)),
          403,
          'EMERGENCY_REVIEW_EVIDENCE',
          '모든 현재 비상 확인 출처가 필요합니다.',
        );
      }
    };
    const initial = await this.assert(context),
      service: ServiceContext = {
        principalId: String(initial.operator.operatorId),
        actorAccountRef: initial.source.accountRef as Ref,
        verifiedPersonRef: null,
        identityAssertionRef: context.operatorAuthorityRef,
        audience: 'SYSTEM',
        accessEvaluationRef: null,
        executionPermitRef: null,
        correlationId: context.correlationId,
        deadlineAt: context.deadlineAt,
      };
    return runU2AccessCommand(
      this,
      service,
      operation === 'resume' ? 'resumeEmergencyRecovery' : 'closeEmergencyRecovery',
      { kind: 'RECORD', recordRef: input.sourceRef },
      input,
      authorize,
      async (tx) => {
        const next: ModelData = {
            ...original,
            state: operation === 'resume' ? 'VERIFYING' : 'CLOSED',
            operatorAuthorityRef: context.operatorAuthorityRef,
            policyRef: input.basisRef ?? original.policyRef,
            evidenceRefs: input.meta.evidenceRefs,
            reason: input.reason,
            revision: Number(original.revision) + 1,
          },
          refs: Ref[] = [ref('EmergencyRecoveryCase', next)];
        if (operation === 'close') {
          const source = (await this.authorization.lookup('RecoveryCase', context.caseRef.id, tx))!;
          requireCondition(
            !['COMPLETED', 'REJECTED', 'CLOSED'].includes(String(source.state)),
            409,
            'EMERGENCY_CONTROL_SOURCE',
            '미종결 원래 당사자 case만 닫습니다.',
          );
          const closed = {
            ...source,
            state: 'CLOSED',
            reason: input.reason,
            holdReason: 'CLOSED_WITH_ORIGINAL_EFFECTS_PRESERVED',
            revision: Number(source.revision) + 1,
          };
          await tx.put('RecoveryCase', closed, Number(source.revision));
          next.caseRef = ref('RecoveryCase', closed);
          refs.push(ref('RecoveryCase', closed));
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
          for (const row of grants) {
            await this.authorization.lookup('RecoveryHandoffGrant', String(row.grantId), tx);
            const revoked = { ...row, state: 'REVOKED', revision: Number(row.revision) + 1 };
            await tx.put('RecoveryHandoffGrant', revoked, Number(row.revision));
            await tx.put('SecurityTombstone', {
              tombstoneId: randomUUID(),
              revision: 1,
              targetRef: { ...ref('RecoveryHandoffGrant', row), revision: 1 },
              purpose: 'HANDOFF',
              reason: 'EMERGENCY_CLOSED',
              destroyedAt: this.now().toISOString(),
              epoch: source.epoch,
            });
            refs.push(ref('RecoveryHandoffGrant', revoked));
          }
          if (source.enrollmentAuthorityRef) {
            const authority = (await this.authorization.lookup(
              'EnrollmentAuthority',
              (source.enrollmentAuthorityRef as Ref).id,
              tx,
            ))!;
            if (['ACTIVE', 'HOLD'].includes(String(authority.state))) {
              const revoked = {
                ...authority,
                state: 'REVOKED',
                revision: Number(authority.revision) + 1,
              };
              await tx.put('EnrollmentAuthority', revoked, Number(authority.revision));
              for (const purpose of ['ENROLLMENT_HANDLE', 'PROVIDER_CHALLENGE', 'FIRST_FACTOR'])
                await tx.put('SecurityTombstone', {
                  tombstoneId: randomUUID(),
                  revision: 1,
                  targetRef: { ...ref('EnrollmentAuthority', authority), revision: 1 },
                  purpose,
                  reason: 'EMERGENCY_CLOSED',
                  destroyedAt: this.now().toISOString(),
                  epoch: source.epoch,
                });
              refs.push(ref('EnrollmentAuthority', revoked));
            }
          }
        }
        await tx.put('EmergencyRecoveryCase', next, Number(original.revision));
        return {
          target: ref('EmergencyRecoveryCase', next),
          refs,
          scope: null,
          state: operation === 'resume' ? 'REVIEW_REQUIRED' : 'RESULT_RECORDED',
          before: ref('EmergencyRecoveryCase', original),
        };
      },
      this.now,
      identity,
      'IdentityRecovery',
    );
  }
}
