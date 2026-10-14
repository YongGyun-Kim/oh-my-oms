import { requireCondition } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { Authorization } from './authorization.js';

export function reviewEvidenceMatches(
  evidence: ModelData,
  policy: ModelData,
  source: ModelData,
  now: Date,
): boolean {
  return (
    evidence.state === 'CONFIRMED' &&
    evidence.synthetic === true &&
    policy.synthetic === true &&
    policy.active === true &&
    policy.purpose === 'RECOVERY' &&
    evidence.purpose === 'RECOVERY' &&
    (evidence.policyRef as Ref).id === policy.policyId &&
    (evidence.policyRef as Ref).revision === policy.revision &&
    (evidence.accountRef as Ref).id === (source.accountRef as Ref).id &&
    (evidence.bindingRef as Ref).id === (source.bindingRef as Ref).id &&
    (evidence.bindingRef as Ref).revision === (source.bindingRef as Ref).revision &&
    (evidence.caseRef as Ref | null)?.id === source.caseId &&
    (policy.requiredSourceKinds as string[]).includes(String(evidence.sourceKind)) &&
    now.getTime() < Date.parse(String(evidence.expiresAt)) &&
    now.getTime() < Date.parse(String(policy.expiresAt))
  );
}
// Review admission never supplies a claim, MFA proof, provider capability or
// assertion that an original UNKNOWN operation has terminated.
export class RecoveryVerificationPolicies {
  private readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
    private readonly registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED',
  ) {
    this.authorization = new Authorization(store, now);
  }
  async assertReview(
    source: ModelData,
    policyRef: Ref,
    evidenceRefs: Ref[],
    transaction?: ProtectedTransaction,
  ): Promise<void> {
    requireCondition(
      this.registration === 'LOCAL_SYNTHETIC',
      503,
      'RECOVERY_POLICY_UNREGISTERED',
      '실제 인정 출처/정책이 미등록인 복구는 보류해야 합니다.',
    );
    this.store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Ref', policyRef);
    requireCondition(
      policyRef.owner === 'IdentityRecovery' && policyRef.entity === 'VerificationPolicy',
      403,
      'RECOVERY_POLICY_REQUIRED',
      '등록된 원래 복구 검토 정책이 필요합니다.',
    );
    const policy = await this.authorization.lookup('VerificationPolicy', policyRef.id, transaction),
      binding = await this.authorization.lookup(
        'ProviderBinding',
        (source.bindingRef as Ref).id,
        transaction,
      ),
      account = await this.authorization.lookup(
        'Account',
        (source.accountRef as Ref).id,
        transaction,
      );
    requireCondition(
      policy &&
        policy.revision === policyRef.revision &&
        account?.active &&
        binding?.active &&
        binding.revision === (source.bindingRef as Ref).revision &&
        binding.generation === source.bindingGeneration &&
        source.epoch === (await this.store.currentEpoch()),
      409,
      'RECOVERY_REVIEW_SOURCE',
      '현재 원래 복구 신원/정책을 대조하세요.',
    );
    const security = await this.store.list('AccountSecurityState', {
      equals: { accountRef: { id: (source.accountRef as Ref).id } },
      limit: 2,
    });
    requireCondition(
      security.length === 1,
      503,
      'CURRENT_SECURITY_REQUIRED',
      '현재 단일 보안 세대가 필요합니다.',
    );
    const currentSecurity = await this.authorization.lookup(
      'AccountSecurityState',
      String(security[0]!.securityStateId),
      transaction,
    );
    requireCondition(
      currentSecurity?.securityGeneration === source.securityGeneration,
      409,
      'RECOVERY_REVIEW_SOURCE',
      '현재 원래 복구 보안 세대를 대조하세요.',
    );
    requireCondition(
      evidenceRefs.length > 0 && evidenceRefs.length <= 20,
      403,
      'RECOVERY_REVIEW_EVIDENCE',
      '유한 현재 검토 근거가 필요합니다.',
    );
    const observed = new Set<string>();
    for (const selected of evidenceRefs) {
      requireCondition(
        selected.owner === 'IdentityRecovery' && selected.entity === 'VerificationEvidence',
        403,
        'RECOVERY_REVIEW_EVIDENCE',
        '등록된 확인 근거 원본이 필요합니다.',
      );
      const evidence = await this.authorization.lookup(
        'VerificationEvidence',
        selected.id,
        transaction,
      );
      requireCondition(
        evidence &&
          evidence.revision === selected.revision &&
          reviewEvidenceMatches(evidence, policy, source, this.now()),
        403,
        'RECOVERY_REVIEW_EVIDENCE',
        '현재 대상/출처/기한의 확인 근거가 필요합니다.',
      );
      await this.authorization.requireStaffSource(
        evidence.authorityRef as Ref,
        'identity.recovery.verify',
        transaction,
      );
      observed.add(String(evidence.sourceKind));
    }
    const required = policy.requiredSourceKinds as string[];
    requireCondition(
      required.length > 0 && required.every((kind) => observed.has(kind)),
      403,
      'RECOVERY_REVIEW_EVIDENCE',
      '모든 필수 확인 출처가 필요합니다.',
    );
  }
}
