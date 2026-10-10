import { randomUUID } from 'node:crypto';
import { requireCondition, canonicalJson, fingerprint, OmsError } from '@oms/contracts';
import type { CommandMeta, Ref, Receipt, ServiceContext, PreIdentityContext } from '@oms/contracts';
import type {
  ProtectedStore,
  ProtectedTransaction,
  ModelData,
  VaultBinding,
  VaultPermit,
} from '@oms/persistence';
import { PurposeSecretVault, U2_STAFF_FENCE_ID } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { PurposeVerifier, generatePurposeSecret } from './purpose-verifier.js';
import type { SecretBinding } from './purpose-verifier.js';
import { ref } from './references.js';
import { runU2AccessCommand } from './enterprise-memberships.js';
import { PartyClaimContexts, partySecretBinding } from './party-claim-context.js';
import { EnrollmentAuthorities } from './enrollment-authority.js';
import type { EmergencyRecoveries } from './emergency-recovery.js';
import { fenceOtherAccountBindings } from './identity-security-events.js';
import { enqueueU2Work } from './identity-work.js';
export interface VerifyRecoveryPartyInput {
  meta: CommandMeta;
  caseRef: Ref;
  partyContextRef: Ref;
  policyRef: Ref;
  evidenceRefs: Ref[];
  decision: 'CONFIRM' | 'HOLD' | 'REJECT';
}
export interface IssueHandoffInput {
  meta: CommandMeta;
  caseRef: Ref;
  verificationRef: Ref;
  partyContextRef: Ref;
  deliveryRouteRef: Ref;
}
export interface ClaimHandoffInput {
  meta: CommandMeta;
  grantRef: Ref;
  caseRef: Ref;
  challengeId: string;
  code: string;
  partySecret: string;
}
export function rejectSecretEcho(value: unknown, secrets: string[]): void {
  if (typeof value === 'string')
    requireCondition(
      !secrets.some((secret) => secret.length > 0 && value.includes(secret)),
      400,
      'SECRET_ECHO',
      '민감 입력은 이유/근거/관측 자료에 복제할 수 없습니다.',
    );
  else if (Array.isArray(value)) for (const item of value) rejectSecretEcho(item, secrets);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) rejectSecretEcho(item, secrets);
}
export function handoffSecretBinding(row: ModelData): SecretBinding {
  return {
    purpose: 'HANDOFF',
    targetRef: { ...ref('RecoveryHandoffGrant', row), revision: 1 },
    accountRef: row.accountRef as Ref,
    bindingRef: row.bindingRef as Ref,
    bindingGeneration: Number(row.bindingGeneration),
    securityGeneration: Number(row.securityGeneration),
    sourceRevision: (row.caseRef as Ref).revision,
    epoch: String(row.epoch),
    challengeId: String(row.challengeId),
    keyVersion: String(row.keyVersion),
  };
}
export function recoveryEvidenceMatches(
  evidence: ModelData,
  policy: ModelData,
  source: ModelData,
  party: ModelData,
  now: Date,
  purpose: 'RECOVERY' | 'EMERGENCY_PRIVATE' = 'RECOVERY',
): boolean {
  return (
    evidence.state === 'CONFIRMED' &&
    evidence.purpose === purpose &&
    evidence.synthetic === true &&
    policy.synthetic === true &&
    policy.active === true &&
    policy.purpose === purpose &&
    (evidence.policyRef as Ref).id === policy.policyId &&
    (evidence.policyRef as Ref).revision === policy.revision &&
    (evidence.accountRef as Ref).id === (source.accountRef as Ref).id &&
    (evidence.bindingRef as Ref).id === (source.bindingRef as Ref).id &&
    (evidence.bindingRef as Ref).revision === (source.bindingRef as Ref).revision &&
    (evidence.caseRef as Ref | null)?.id === source.caseId &&
    (evidence.partyContextRef as Ref | null)?.id === party.partyContextId &&
    evidence.challengeId === party.challengeId &&
    (policy.requiredSourceKinds as string[]).includes(String(evidence.sourceKind)) &&
    now.getTime() < Date.parse(String(evidence.expiresAt)) &&
    now.getTime() < Date.parse(String(policy.expiresAt))
  );
}
export class RecoveryHandoffs {
  readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    private readonly verifier: PurposeVerifier,
    private readonly vault: PurposeSecretVault,
    private readonly now: () => Date,
    private readonly registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED',
    private readonly parties?: PartyClaimContexts,
    private readonly staffIngress: (proof: unknown) => Promise<boolean> = async () => false,
    private readonly operators?: EmergencyRecoveries,
  ) {
    requireCondition(
      !operators || operators.store === store,
      503,
      'EMERGENCY_STORE_REQUIRED',
      '현재 비상 원본과 같은 보호 경계가 필요합니다.',
    );
    this.authorization = new Authorization(store, now);
  }
  private async caseSecurity(source: ModelData, transaction?: ProtectedTransaction): Promise<void> {
    const a = this.authorization,
      account = await a.lookup('Account', (source.accountRef as Ref).id, transaction),
      binding = await a.lookup('ProviderBinding', (source.bindingRef as Ref).id, transaction),
      states = await this.store.list('AccountSecurityState', {
        equals: { accountRef: { id: (source.accountRef as Ref).id } },
        limit: 2,
      });
    requireCondition(
      account?.active &&
        binding?.active &&
        binding.revision === (source.bindingRef as Ref).revision &&
        binding.generation === source.bindingGeneration &&
        (binding.accountRef as Ref).id === (source.accountRef as Ref).id &&
        states.length === 1 &&
        source.epoch === (await this.store.currentEpoch()),
      409,
      'CASE_SECURITY_CHANGED',
      '원래 복구 계정/연결/epoch가 변경됐습니다.',
    );
    const security = await a.lookup(
      'AccountSecurityState',
      String(states[0]!.securityStateId),
      transaction,
    );
    requireCondition(
      security?.securityGeneration === source.securityGeneration,
      409,
      'CASE_SECURITY_CHANGED',
      '원래 복구 보안 세대가 변경됐습니다.',
    );
  }
  async verifyParty(context: ServiceContext, input: VerifyRecoveryPartyInput): Promise<Receipt> {
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/VerifyRecoveryInput',
      input,
    );
    let source: ModelData,
      party: ModelData,
      policy: ModelData,
      fence: ModelData,
      confirmed = false,
      operatorRef: Ref | null = null;
    const authorize = async (tx?: ProtectedTransaction) => {
      if (context.audience === 'SYSTEM') {
        requireCondition(
          this.operators,
          503,
          'EMERGENCY_UNREGISTERED',
          '별도 비공개 운영 host가 등록되지 않았습니다.',
        );
        operatorRef = await this.operators.assertService(context, input.caseRef.id, tx);
      } else await this.authorization.requireStaff(context, 'identity.recovery.verify', tx);
      source = (await this.authorization.lookup('RecoveryCase', input.caseRef.id, tx))!;
      party = (await this.authorization.lookup('PartyClaimContext', input.partyContextRef.id, tx))!;
      policy = (await this.authorization.lookup('VerificationPolicy', input.policyRef.id, tx))!;
      requireCondition(
        source &&
          source.revision === input.meta.expectedRevision &&
          source.revision === input.caseRef.revision &&
          (operatorRef ? ['REQUESTED', 'VERIFYING', 'HOLD'] : ['REQUESTED', 'VERIFYING']).includes(
            String(source.state),
          ) &&
          (operatorRef ? source.method === 'EMERGENCY' : source.method !== 'EMERGENCY'),
        409,
        'RECOVERY_CASE_REVISION',
        '원래 복구 case의 현재 확인 단계가 필요합니다.',
      );
      await this.caseSecurity(source, tx);
      requireCondition(
        party &&
          party.revision === input.partyContextRef.revision &&
          ['PENDING', 'VERIFIED'].includes(String(party.state)) &&
          (party.caseRef as Ref).id === source.caseId &&
          (party.accountRef as Ref).id === (source.accountRef as Ref).id &&
          party.bindingGeneration === source.bindingGeneration &&
          party.securityGeneration === source.securityGeneration &&
          party.epoch === source.epoch &&
          this.now().getTime() < Date.parse(String(party.expiresAt)),
        409,
        'PARTY_VERIFICATION_CONTEXT',
        '현재 당사자 진행 challenge가 필요합니다.',
      );
      requireCondition(
        policy?.revision === input.policyRef.revision,
        409,
        'RECOVERY_POLICY_REVISION',
        '현재 인정 정책 원본이 필요합니다.',
      );
      fence = (await this.authorization.lookup('StaffAuthorityFence', U2_STAFF_FENCE_ID, tx))!;
      requireCondition(fence, 503, 'STAFF_FENCE_REQUIRED', '현재 확인자 권위 개정이 필요합니다.');
      confirmed =
        input.decision === 'CONFIRM' &&
        this.registration === 'LOCAL_SYNTHETIC' &&
        policy.active === true &&
        policy.synthetic === true &&
        policy.purpose === (operatorRef ? 'EMERGENCY_PRIVATE' : 'RECOVERY') &&
        this.now().getTime() < Date.parse(String(policy.expiresAt));
      const observed = new Set<string>();
      for (const selected of input.evidenceRefs) {
        requireCondition(
          selected.owner === 'IdentityRecovery' && selected.entity === 'VerificationEvidence',
          400,
          'RECOVERY_EVIDENCE_SOURCE',
          '등록된 확인 근거 원본이 필요합니다.',
        );
        const evidence = await this.authorization.lookup('VerificationEvidence', selected.id, tx);
        if (
          !evidence ||
          evidence.revision !== selected.revision ||
          !recoveryEvidenceMatches(
            evidence,
            policy,
            source,
            party,
            this.now(),
            operatorRef ? 'EMERGENCY_PRIVATE' : 'RECOVERY',
          ) ||
          (operatorRef &&
            canonicalJson(evidence.operatorAuthorityRef) !== canonicalJson(operatorRef)) ||
          (evidence.partyContextRef as Ref).revision !== party.revision
        )
          confirmed = false;
        else {
          await this.authorization.requireStaffSource(
            evidence.authorityRef as Ref,
            'identity.recovery.verify',
            tx,
          );
          observed.add(String(evidence.sourceKind));
        }
      }
      const required = policy.requiredSourceKinds as string[];
      if (required.length === 0 || !required.every((kind) => observed.has(kind))) confirmed = false;
    };
    return runU2AccessCommand(
      this,
      context,
      context.audience === 'SYSTEM' ? 'emergencyRecoveryProcedure' : 'verifyRecoveryParty',
      { kind: 'RECORD', recordRef: input.caseRef },
      input,
      authorize,
      async (tx) => {
        const verificationId = randomUUID(),
          nextCase = {
            ...source,
            state: input.decision === 'REJECT' ? 'REJECTED' : confirmed ? 'VERIFYING' : 'HOLD',
            holdReason: confirmed
              ? 'RESOLVED'
              : input.decision === 'REJECT'
                ? 'REJECTED'
                : 'VERIFICATION_OR_POLICY_UNCONFIRMED',
            revision: Number(source.revision) + 1,
          },
          nextParty = {
            ...party,
            state: input.decision === 'REJECT' ? 'REVOKED' : confirmed ? 'VERIFIED' : party.state,
            revision: Number(party.revision) + 1,
            verificationRef: {
              owner: 'IdentityRecovery',
              entity: 'RecoveryVerification',
              id: verificationId,
              revision: 1,
            },
          },
          verification = {
            verificationId,
            revision: 1,
            caseRef: ref('RecoveryCase', nextCase),
            accountRef: source.accountRef,
            bindingRef: source.bindingRef,
            policyRef: input.policyRef,
            partyContextRef: ref('PartyClaimContext', nextParty),
            issuerRef: context.actorAccountRef,
            ...(operatorRef ? { operatorAuthorityRef: operatorRef } : {}),
            issuerAuthorityRevision: fence.authorityRevision,
            evidenceRefs: input.evidenceRefs,
            verifiedAt: this.now().toISOString(),
            expiresAt: new Date(
              Math.min(Date.parse(String(party.expiresAt)), Date.parse(String(policy.expiresAt))),
            ).toISOString(),
            state:
              input.decision === 'REJECT' ? 'REJECTED' : confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
            reason: input.meta.reason,
          };
        await tx.put('RecoveryVerification', verification);
        await tx.put('PartyClaimContext', nextParty, Number(party.revision));
        await tx.put(
          'RecoveryCase',
          {
            ...nextCase,
            verificationRef: ref('RecoveryVerification', verification),
            partyContextRef: confirmed
              ? ref('PartyClaimContext', nextParty)
              : source.partyContextRef,
          },
          Number(source.revision),
        );
        return {
          target: ref('RecoveryCase', nextCase),
          refs: [
            ref('RecoveryCase', nextCase),
            ref('RecoveryVerification', verification),
            ref('PartyClaimContext', nextParty),
          ],
          scope: null,
          state: confirmed ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED',
          before: ref('RecoveryCase', source),
        };
      },
      this.now,
      async (tx) => {
        if (context.audience === 'SYSTEM') {
          requireCondition(
            this.operators,
            503,
            'EMERGENCY_UNREGISTERED',
            '별도 운영 host를 등록하세요.',
          );
          await this.operators.assertService(context, input.caseRef.id, tx);
        } else await this.authorization.identity(context, tx);
      },
      'IdentityRecovery',
    );
  }
  async assertDelivery(grantRef: Ref, transaction?: ProtectedTransaction): Promise<ModelData> {
    const a = this.authorization,
      grant = await a.lookup('RecoveryHandoffGrant', grantRef.id, transaction);
    requireCondition(
      grant &&
        grant.state === 'ISSUED' &&
        grant.revision === grantRef.revision &&
        grant.epoch === (await this.store.currentEpoch()) &&
        this.now().getTime() < Date.parse(String(grant.expiresAt)),
      403,
      'HANDOFF_CURRENT_SOURCE',
      '현재 원래 인계 허가가 필요합니다.',
    );
    await this.assertSources(grant, transaction);
    return grant;
  }
  private async assertSources(grant: ModelData, transaction?: ProtectedTransaction): Promise<void> {
    const a = this.authorization,
      source = await a.lookup('RecoveryCase', (grant.caseRef as Ref).id, transaction),
      party = await a.lookup('PartyClaimContext', (grant.partyContextRef as Ref).id, transaction),
      verification = await a.lookup(
        'RecoveryVerification',
        (grant.verificationRef as Ref).id,
        transaction,
      ),
      contact = await a.lookup(
        'RegisteredContact',
        (grant.deliveryRouteRef as Ref).id,
        transaction,
      ),
      fence = await a.lookup('StaffAuthorityFence', U2_STAFF_FENCE_ID, transaction);
    requireCondition(
      source &&
        source.revision === (grant.caseRef as Ref).revision &&
        ['VERIFYING', 'HOLD'].includes(String(source.state)) &&
        party?.revision === (grant.partyContextRef as Ref).revision &&
        party.state === 'VERIFIED' &&
        (party.caseRef as Ref).id === source.caseId &&
        verification?.revision === (grant.verificationRef as Ref).revision &&
        verification.state === 'CONFIRMED' &&
        (verification.caseRef as Ref).revision === source.revision &&
        (verification.partyContextRef as Ref).id === party.partyContextId &&
        (verification.partyContextRef as Ref).revision === party.revision &&
        (source.verificationRef as Ref | null)?.id === verification.verificationId &&
        (source.partyContextRef as Ref | null)?.id === party.partyContextId &&
        contact?.state === 'VERIFIED' &&
        contact.revision === (grant.deliveryRouteRef as Ref).revision &&
        (contact.accountRef as Ref | null)?.id === (source.accountRef as Ref).id &&
        fence &&
        fence.authorityRevision === grant.issuerAuthorityRevision &&
        fence.authorityRevision === verification.issuerAuthorityRevision &&
        this.now().getTime() < Date.parse(String(party.expiresAt)) &&
        this.now().getTime() < Date.parse(String(verification.expiresAt)),
      403,
      'HANDOFF_CURRENT_SOURCE',
      '원래 case/당사자/근거/경로/확인자 권위를 재대조하세요.',
    );
    await this.caseSecurity(source, transaction);
    await a.requireStaffSource(grant.issuerRef as Ref, 'identity.recovery.verify', transaction);
    await a.requireStaffSource(
      verification.issuerRef as Ref,
      'identity.recovery.verify',
      transaction,
    );
    const policy = await a.lookup(
      'VerificationPolicy',
      (verification.policyRef as Ref).id,
      transaction,
    );
    requireCondition(
      this.registration === 'LOCAL_SYNTHETIC' &&
        policy?.revision === (verification.policyRef as Ref).revision &&
        policy.active &&
        policy.synthetic &&
        policy.purpose === (verification.operatorAuthorityRef ? 'EMERGENCY_PRIVATE' : 'RECOVERY') &&
        this.now().getTime() < Date.parse(String(policy.expiresAt)),
      403,
      'HANDOFF_POLICY',
      '현재 인정 정책이 필요합니다.',
    );
    if (verification.operatorAuthorityRef) {
      requireCondition(
        this.operators &&
          source.method === 'EMERGENCY' &&
          canonicalJson(grant.operatorAuthorityRef) ===
            canonicalJson(verification.operatorAuthorityRef),
        403,
        'HANDOFF_OPERATOR_REQUIRED',
        '원래 별도 비상 발급 권위가 필요합니다.',
      );
      await this.operators.assertSourceAuthority(
        verification.operatorAuthorityRef as Ref,
        source,
        transaction,
      );
    } else
      requireCondition(
        source.method !== 'EMERGENCY' && !grant.operatorAuthorityRef,
        403,
        'HANDOFF_OPERATOR_REQUIRED',
        '비상 대상은 별도 운영 원본이 필요합니다.',
      );
    const kinds = new Set<string>();
    let routeMatched = false;
    for (const selected of verification.evidenceRefs as Ref[]) {
      const evidence = await a.lookup('VerificationEvidence', selected.id, transaction);
      requireCondition(
        evidence &&
          evidence.revision === selected.revision &&
          recoveryEvidenceMatches(
            evidence,
            policy,
            source,
            party,
            this.now(),
            verification.operatorAuthorityRef ? 'EMERGENCY_PRIVATE' : 'RECOVERY',
          ) &&
          (!verification.operatorAuthorityRef ||
            canonicalJson(evidence.operatorAuthorityRef) ===
              canonicalJson(verification.operatorAuthorityRef)),
        403,
        'HANDOFF_EVIDENCE',
        '원래 확인 근거가 변경됐습니다.',
      );
      await a.requireStaffSource(
        evidence.authorityRef as Ref,
        'identity.recovery.verify',
        transaction,
      );
      kinds.add(String(evidence.sourceKind));
      if (
        (evidence.contactRef as Ref | null)?.id === contact.contactId &&
        evidence.contactVersion === contact.contactVersion
      )
        routeMatched = true;
    }
    requireCondition(
      (policy.requiredSourceKinds as string[]).length > 0 &&
        (policy.requiredSourceKinds as string[]).every((kind) => kinds.has(kind)) &&
        routeMatched,
      403,
      'HANDOFF_EVIDENCE',
      '원래 당사자의 인정된 전달 근거가 필요합니다.',
    );
  }
  async issue(context: ServiceContext, input: IssueHandoffInput): Promise<Receipt> {
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/IssueHandoffInput',
      input,
    );
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/RegisteredContact',
      input.deliveryRouteRef,
    );
    let created: ModelData | null = null;
    const code = generatePurposeSecret('HANDOFF'),
      id = randomUUID();
    const authorize = async (tx?: ProtectedTransaction) => {
      let operatorRef: Ref | null = null;
      if (context.audience === 'SYSTEM') {
        requireCondition(
          this.operators,
          503,
          'EMERGENCY_UNREGISTERED',
          '별도 비공개 운영 host를 등록하세요.',
        );
        operatorRef = await this.operators.assertService(context, input.caseRef.id, tx);
      } else await this.authorization.requireStaff(context, 'identity.recovery.verify', tx);
      const source = await this.authorization.lookup('RecoveryCase', input.caseRef.id, tx),
        binding =
          source &&
          (await this.authorization.lookup('ProviderBinding', (source.bindingRef as Ref).id, tx)),
        fence = await this.authorization.lookup('StaffAuthorityFence', U2_STAFF_FENCE_ID, tx);
      requireCondition(
        source &&
          source.revision === input.caseRef.revision &&
          source.revision === input.meta.expectedRevision &&
          binding &&
          fence &&
          (operatorRef ? source.method === 'EMERGENCY' : source.method !== 'EMERGENCY'),
        409,
        'HANDOFF_CASE_REVISION',
        '원래 복구 case의 현재 개정이 필요합니다.',
      );
      created = {
        grantId: id,
        revision: 1,
        caseRef: input.caseRef,
        accountRef: source.accountRef,
        bindingRef: source.bindingRef,
        bindingGeneration: source.bindingGeneration,
        securityGeneration: source.securityGeneration,
        audience: binding.audience,
        purpose: 'MFA_REENROLMENT',
        challengeId: '',
        enrollmentTarget: input.caseRef,
        verificationRef: input.verificationRef,
        partyContextRef: input.partyContextRef,
        deliveryRouteRef: input.deliveryRouteRef,
        issuerRef: context.actorAccountRef,
        ...(operatorRef ? { operatorAuthorityRef: operatorRef } : {}),
        issuerAuthorityRevision: fence.authorityRevision,
        codeVerifier: '',
        keyVersion: this.verifier.keyVersion,
        vaultRef: randomUUID(),
        issuedAt: this.now().toISOString(),
        expiresAt: '',
        attemptCount: 0,
        state: 'ISSUED',
        claimReceiptRef: null,
        replacesGrantRef: null,
        epoch: source.epoch,
      };
      const party = await this.authorization.lookup(
        'PartyClaimContext',
        input.partyContextRef.id,
        tx,
      );
      requireCondition(party, 403, 'HANDOFF_CURRENT_SOURCE', '현재 당사자 진행 문맥이 필요합니다.');
      created.challengeId = party.challengeId;
      const verification = await this.authorization.lookup(
        'RecoveryVerification',
        input.verificationRef.id,
        tx,
      );
      requireCondition(verification, 403, 'HANDOFF_CURRENT_SOURCE', '현재 확인 결정이 필요합니다.');
      created.expiresAt = new Date(
        Math.min(
          Date.parse(String(created.issuedAt)) + 300000,
          Date.parse(String(party.expiresAt)),
          Date.parse(String(verification.expiresAt)),
        ),
      ).toISOString();
      await this.assertSources(created, tx);
      created.codeVerifier = this.verifier.digest(code, handoffSecretBinding(created));
    };
    let replaced: ModelData | null = null;
    const receipt = await runU2AccessCommand(
      this,
      context,
      context.audience === 'SYSTEM' ? 'emergencyRecoveryProcedure.issueHandoff' : 'issueHandoff',
      { kind: 'RECORD', recordRef: input.caseRef },
      input,
      authorize,
      async (tx, requestId) => {
        const active = await tx.list(
          'RecoveryHandoffGrant',
          { caseRef: { id: input.caseRef.id }, state: 'ISSUED' },
          2,
        );
        requireCondition(
          active.length <= 1,
          503,
          'HANDOFF_CONFLICT',
          '현재 단일 인계 원본이 필요합니다.',
        );
        if (active[0]) {
          await tx.put(
            'RecoveryHandoffGrant',
            { ...active[0], state: 'REVOKED', revision: Number(active[0].revision) + 1 },
            Number(active[0].revision),
          );
          await tx.put('SecurityTombstone', {
            tombstoneId: randomUUID(),
            revision: 1,
            targetRef: { ...ref('RecoveryHandoffGrant', active[0]), revision: 1 },
            purpose: 'HANDOFF',
            reason: 'REPLACED',
            destroyedAt: this.now().toISOString(),
            epoch: active[0].epoch,
          });
          created!.replacesGrantRef = ref('RecoveryHandoffGrant', active[0]);
          replaced = active[0];
        }
        await this.vault.prepareHandoff(Buffer.from(code), this.vaultBinding(created!), {
          ...this.vaultPermit(created!),
          authorityRef: input.verificationRef,
          operation: 'identity.handoff.prepare',
        });
        await tx.put('RecoveryHandoffGrant', created!);
        const delivery = await enqueueU2Work(
          tx,
          context,
          requestId,
          'IdentityRecovery.deliverHandoff',
          ref('RecoveryHandoffGrant', created!),
          String(created!.epoch),
          this.now(),
          String(created!.expiresAt),
        );
        return {
          target: ref('RecoveryHandoffGrant', created!),
          refs: [
            ref('RecoveryHandoffGrant', created!),
            input.caseRef,
            input.partyContextRef,
            input.verificationRef,
            delivery.workRef,
            delivery.factRef,
          ],
          scope: null,
          state: 'ACCEPTED',
        };
      },
      this.now,
      async (tx) => {
        if (context.audience === 'SYSTEM') {
          requireCondition(
            this.operators,
            503,
            'EMERGENCY_UNREGISTERED',
            '별도 운영 host를 등록하세요.',
          );
          await this.operators.assertService(context, input.caseRef.id, tx);
        } else await this.authorization.identity(context, tx);
      },
      'IdentityRecovery',
    );
    if (replaced) await this.destroyConsumedCode(String((replaced as ModelData).grantId));
    return receipt;
  }
  private vaultBinding(grant: ModelData): VaultBinding {
    return {
      id: String(grant.vaultRef),
      purpose: 'HANDOFF',
      targetRef: ref('RecoveryHandoffGrant', grant),
      accountRef: grant.accountRef as Ref,
      audience: grant.audience as 'CUSTOMER' | 'STAFF',
      bindingGeneration: Number(grant.bindingGeneration),
      sourceRevision: Number(grant.revision),
      expiresAt: String(grant.expiresAt),
      keyVersion: this.vault.keyVersion,
    };
  }
  async deliveryMaterial(sourceRef: Ref) {
    await this.assertDelivery(sourceRef);
    const row = (await this.authorization.lookup('RecoveryHandoffGrant', sourceRef.id))!;
    return {
      routeRef: row.deliveryRouteRef as Ref,
      binding: this.vaultBinding(row),
      permit: this.vaultPermit(row),
    };
  }
  private vaultPermit(grant: ModelData): VaultPermit {
    return {
      authorityRef: ref('RecoveryHandoffGrant', grant),
      targetRef: ref('RecoveryHandoffGrant', grant),
      purpose: 'HANDOFF',
      operation: 'identity.handoff.deliver',
      epoch: String(grant.epoch),
      deadlineAt: new Date(
        Math.min(this.now().getTime() + 30000, Date.parse(String(grant.expiresAt))),
      ).toISOString(),
    };
  }
  private handleBinding(authority: ModelData): VaultBinding {
    return {
      id: String(authority.handleVaultRef),
      purpose: 'ENROLLMENT_HANDLE',
      targetRef: ref('EnrollmentAuthority', authority),
      accountRef: authority.accountRef as Ref,
      audience: authority.audience as 'CUSTOMER' | 'STAFF',
      bindingGeneration: Number(authority.bindingGeneration),
      sourceRevision: 1,
      expiresAt: String(authority.expiresAt),
      keyVersion: this.vault.keyVersion,
    };
  }
  private handlePermit(authority: ModelData): VaultPermit {
    return {
      authorityRef: ref('EnrollmentAuthority', authority),
      targetRef: ref('EnrollmentAuthority', authority),
      purpose: 'ENROLLMENT_HANDLE',
      operation: 'identity.enrollment.handle',
      epoch: String(authority.epoch),
      deadlineAt: new Date(
        Math.min(this.now().getTime() + 30000, Date.parse(String(authority.expiresAt))),
      ).toISOString(),
    };
  }
  async claim(
    context: PreIdentityContext,
    input: ClaimHandoffInput,
    ingressProof: unknown = null,
  ): Promise<{ outcome: unknown; handle: string }> {
    this.store.schema.validate('PreIdentityContext', context);
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/ClaimHandoffInput',
      input,
    );
    requireCondition(
      this.parties,
      503,
      'PARTY_COORDINATOR_REQUIRED',
      '등록된 당사자 조정 경계가 필요합니다.',
    );
    requireCondition(
      context.attemptId === input.challengeId &&
        this.now().getTime() < Date.parse(context.deadlineAt) &&
        input.meta.expectedRevision === 1 &&
        input.grantRef.revision === 1,
      403,
      'HANDOFF_ORIGINAL_CHALLENGE',
      '서버의 원래 인계 challenge/발급 개정이 필요합니다.',
    );
    rejectSecretEcho(
      {
        meta: input.meta,
        grantRef: input.grantRef,
        caseRef: input.caseRef,
        challengeId: input.challengeId,
      },
      [input.code, input.partySecret],
    );
    if (context.audience === 'STAFF')
      requireCondition(
        await this.staffClaimIngress(ingressProof),
        403,
        'STAFF_INGRESS_REQUIRED',
        '사설 직원 접점이 필요합니다.',
      );
    const grant = await this.authorization.lookup('RecoveryHandoffGrant', input.grantRef.id),
      original = await this.store.readRevision('RecoveryHandoffGrant', input.grantRef.id, 1);
    requireCondition(
      grant &&
        original &&
        grant.audience === context.audience &&
        grant.epoch === (await this.store.currentEpoch()) &&
        canonicalJson(original.caseRef) === canonicalJson(input.caseRef) &&
        original.challengeId === input.challengeId,
      404,
      'NOT_FOUND',
      '당사자 진행을 다시 확인하세요.',
    );
    const party = await this.parties.assert(
        grant.partyContextRef as Ref,
        input.partySecret,
        input.caseRef,
        input.challengeId,
        undefined,
        grant.state === 'CLAIMED' ? (grant.claimReceiptRef as Ref) : undefined,
      ),
      principalId = 'party:' + party.partyContextId,
      safe = {
        meta: input.meta,
        grantRef: input.grantRef,
        caseRef: input.caseRef,
        challengeId: input.challengeId,
        codeVerifier: this.verifier.digest(input.code, handoffSecretBinding(original)),
        partyVerifier: this.verifier.digest(input.partySecret, partySecretBinding(party)),
      },
      target = { kind: 'RECORD', recordRef: input.grantRef };
    const existing = await this.store.list('RequestReceipt', {
      equals: {
        principalId,
        audience: context.audience,
        owner: 'IdentityRecovery',
        operation: 'claimHandoff',
        idempotencyKey: input.meta.clientRequestId,
        targetIdentity: target,
      },
      limit: 2,
    });
    if (existing[0]) {
      requireCondition(
        existing[0].requestFingerprint === fingerprint(safe),
        409,
        'IDEMPOTENCY_CONFLICT',
        '원래 claim 요청 내용이 다릅니다.',
      );
      return this.claimResult(existing[0], party, input);
    }
    const handle = generatePurposeSecret('ENROLLMENT_HANDLE'),
      commit = await this.store.execute(
        {
          principalId,
          audience: context.audience,
          owner: 'IdentityRecovery',
          operation: 'claimHandoff',
          target,
          idempotencyKey: input.meta.clientRequestId,
          input: safe,
          correlationId: context.correlationId,
          epoch: String(grant.epoch),
        },
        async (tx, requestId) => {
          const current = await this.authorization.lookup(
            'RecoveryHandoffGrant',
            input.grantRef.id,
            tx,
          );
          requireCondition(
            current &&
              current.state === 'ISSUED' &&
              Number(current.attemptCount) < 5 &&
              this.now().getTime() < Date.parse(String(current.expiresAt)),
            409,
            'HANDOFF_NOT_CLAIMABLE',
            '인계 허가가 만료되거나 이미 소비됐습니다.',
          );
          await this.assertSources(current, tx);
          await this.parties!.assert(
            current.partyContextRef as Ref,
            input.partySecret,
            input.caseRef,
            input.challengeId,
            tx,
          );
          let resultRefs: Ref[], state: Receipt['requestState'];
          const consumedAt = this.now();
          if (
            !this.verifier.matches(
              input.code,
              handoffSecretBinding(original),
              String(current.codeVerifier),
            )
          ) {
            const count = Number(current.attemptCount) + 1,
              next = {
                ...current,
                attemptCount: count,
                state: count === 5 ? 'EXHAUSTED' : 'ISSUED',
                revision: Number(current.revision) + 1,
              };
            await tx.put('RecoveryHandoffGrant', next, Number(current.revision));
            if (count === 5)
              await tx.put('SecurityTombstone', {
                tombstoneId: randomUUID(),
                revision: 1,
                targetRef: ref('RecoveryHandoffGrant', original),
                purpose: 'HANDOFF',
                reason: 'EXHAUSTED',
                destroyedAt: consumedAt.toISOString(),
                epoch: current.epoch,
              });
            resultRefs = [ref('RecoveryHandoffGrant', next)];
            state = count === 5 ? 'REVIEW_REQUIRED' : 'RESULT_RECORDED';
          } else {
            const source = (await this.authorization.lookup(
                'RecoveryCase',
                (current.caseRef as Ref).id,
                tx,
              ))!,
              binding = (await this.authorization.lookup(
                'ProviderBinding',
                (current.bindingRef as Ref).id,
                tx,
              ))!,
              states = await tx.list(
                'AccountSecurityState',
                { accountRef: { id: (current.accountRef as Ref).id } },
                2,
              );
            requireCondition(
              states.length === 1,
              503,
              'CURRENT_SECURITY_REQUIRED',
              '단일 현재 보안 세대가 필요합니다.',
            );
            const security = states[0]!,
              nextBinding: ModelData = {
                ...binding,
                authRevision: Number(binding.authRevision) + 1,
                removalState: 'UNKNOWN',
                revision: Number(binding.revision) + 1,
              },
              nextSecurity = {
                ...security,
                securityGeneration: Number(security.securityGeneration) + 1,
                revision: Number(security.revision) + 1,
              };
            const bindingFences = await fenceOtherAccountBindings(this.authorization, tx, binding);
            await tx.put('ProviderBinding', nextBinding, Number(binding.revision));
            await tx.put('AccountSecurityState', nextSecurity, Number(security.revision));
            const slots = await tx.list(
              'IdentityExecutionSlot',
              { accountRef: { id: (current.accountRef as Ref).id } },
              100,
            );
            requireCondition(
              slots.length < 100,
              503,
              'RECOVERY_SLOT_SCAN_LIMIT',
              '유한 원래 실행 slot 대조가 필요합니다.',
            );
            const unresolved = slots.filter(
              (slot) => slot.state === 'ACTIVE' || slot.state === 'UNKNOWN',
            );
            for (const slot of unresolved)
              await this.authorization.lookup('IdentityExecutionSlot', String(slot.slotId), tx);
            const held =
                unresolved.length > 0 || (source.originalOperationRefs as Ref[]).length > 0,
              claimId = randomUUID(),
              authorityId = randomUUID(),
              claimRef: Ref = {
                owner: 'IdentityRecovery',
                entity: 'ClaimReceipt',
                id: claimId,
                revision: 1,
              };
            const nextCase: ModelData = {
              ...source,
              bindingRef: ref('ProviderBinding', nextBinding),
              bindingGeneration: nextBinding.generation,
              originalBindingRefs: bindingFences.originals,
              originalFactorRefs: bindingFences.factors,
              previousBindingRef: current.bindingRef,
              previousSecurityGeneration: current.securityGeneration,
              securityGeneration: nextSecurity.securityGeneration,
              state: held ? 'HOLD' : 'ENROLMENT_ONLY',
              holdReason: held ? 'ORIGINAL_EFFECT_UNCONFIRMED' : 'RESOLVED',
              enrollmentAuthorityRef: {
                owner: 'IdentityRecovery',
                entity: 'EnrollmentAuthority',
                id: authorityId,
                revision: 1,
              },
              revision: Number(source.revision) + 1,
            };
            if (source.method === 'EMERGENCY') {
              const records = await tx.list(
                'EmergencyRecoveryCase',
                { caseRef: { id: source.caseId }, state: 'VERIFYING' },
                2,
              );
              requireCondition(
                records.length === 1,
                503,
                'CURRENT_EMERGENCY_REQUIRED',
                '원래 단일 비상 검토를 대조해야 합니다.',
              );
              const record = (await this.authorization.lookup(
                'EmergencyRecoveryCase',
                String(records[0]!.emergencyCaseId),
                tx,
              ))!;
              requireCondition(
                record.epoch === source.epoch &&
                  canonicalJson(record.operatorAuthorityRef) ===
                    canonicalJson(current.operatorAuthorityRef),
                403,
                'CURRENT_EMERGENCY_REQUIRED',
                '원래 별도 비상 운영 주체를 대조하세요.',
              );
              await tx.put(
                'EmergencyRecoveryCase',
                {
                  ...record,
                  state: held ? 'HOLD' : 'ENROLMENT_ONLY',
                  caseRef: ref('RecoveryCase', nextCase),
                  revision: Number(record.revision) + 1,
                },
                Number(record.revision),
              );
            }
            // One authRevision fence invalidates every old business session, including
            // historical rows beyond a page. Old provider factor effects are NOT
            // declared removed here; the conjunctive completion stage owns that proof.
            const codes = await tx.list(
              'RecoveryCodeSet',
              { accountRef: { id: (current.accountRef as Ref).id }, invalidated: false },
              100,
            );
            requireCondition(
              codes.length < 100,
              503,
              'RECOVERY_CODE_SCAN_LIMIT',
              '유한 현재 코드 집합 대조가 필요합니다.',
            );
            for (const set of codes) {
              await this.authorization.lookup('RecoveryCodeSet', String(set.setId), tx);
              await tx.put(
                'RecoveryCodeSet',
                { ...set, invalidated: true, revision: Number(set.revision) + 1 },
                Number(set.revision),
              );
            }
            nextCase.originalCodeSetRefs = codes.map((set) => ref('RecoveryCodeSet', set));
            const authority: ModelData = {
              authorityId,
              revision: 1,
              accountRef: current.accountRef,
              bindingRef: ref('ProviderBinding', nextBinding),
              bindingGeneration: nextBinding.generation,
              securityGeneration: nextSecurity.securityGeneration,
              audience: current.audience,
              purpose: 'MFA_REENROLMENT',
              sourceRef: ref('RecoveryCase', nextCase),
              invitationRef: null,
              contactVerificationRef: null,
              claimReceiptRef: claimRef,
              verificationRef: current.verificationRef,
              partyContextRef: current.partyContextRef,
              challengeId: current.challengeId,
              handleVerifier: '',
              handleVaultRef: randomUUID(),
              keyVersion: this.verifier.keyVersion,
              issuedAt: consumedAt.toISOString(),
              expiresAt: new Date(consumedAt.getTime() + 300000).toISOString(),
              state: held ? 'HOLD' : 'ACTIVE',
              epoch: current.epoch,
            };
            const authorityCodec = new EnrollmentAuthorities(
              this.store,
              this.verifier,
              this.now,
              async () => false,
            );
            authority.handleVerifier = this.verifier.digest(
              handle,
              authorityCodec.binding(authority),
            );
            await this.vault.prepareEnrollmentHandle(
              Buffer.from(handle),
              this.handleBinding(authority),
              {
                ...this.handlePermit(authority),
                authorityRef: ref('RecoveryHandoffGrant', current),
                operation: 'identity.enrollment.prepare-handle',
                deadlineAt: new Date(
                  Math.min(Date.parse(context.deadlineAt), Date.parse(String(current.expiresAt))),
                ).toISOString(),
              },
            );
            const claimed = {
                ...current,
                state: 'CLAIMED',
                claimReceiptRef: claimRef,
                revision: Number(current.revision) + 1,
              },
              claim = {
                claimReceiptId: claimId,
                revision: 1,
                grantRef: ref('RecoveryHandoffGrant', claimed),
                caseRef: ref('RecoveryCase', nextCase),
                partyContextRef: current.partyContextRef,
                accountRef: current.accountRef,
                authorityRef: ref('EnrollmentAuthority', authority),
                requestRef: ref('RequestReceipt', { requestId, revision: 1 }),
                consumedAt: consumedAt.toISOString(),
                epoch: current.epoch,
              };
            await tx.put('RecoveryHandoffGrant', claimed, Number(current.revision));
            await tx.put('EnrollmentAuthority', authority);
            await tx.put('ClaimReceipt', claim);
            await tx.put('RecoveryCase', nextCase, Number(source.revision));
            if (!held)
              await tx.put('IdentityExecutionSlot', {
                slotId: randomUUID(),
                revision: 1,
                accountRef: current.accountRef,
                bindingRef: ref('ProviderBinding', nextBinding),
                caseRef: ref('RecoveryCase', nextCase),
                state: 'ACTIVE',
                originalOperationRef: null,
                deadlineAt: authority.expiresAt,
                epoch: current.epoch,
              });
            await tx.put('SecurityTombstone', {
              tombstoneId: randomUUID(),
              revision: 1,
              targetRef: ref('RecoveryHandoffGrant', original),
              purpose: 'HANDOFF',
              reason: 'CLAIMED',
              destroyedAt: consumedAt.toISOString(),
              epoch: current.epoch,
            });
            resultRefs = [
              ...bindingFences.changed,
              ref('RecoveryHandoffGrant', claimed),
              claimRef,
              ref('EnrollmentAuthority', authority),
              ref('RecoveryCase', nextCase),
              ref('ProviderBinding', nextBinding),
              ref('AccountSecurityState', nextSecurity),
            ];
            state = held ? 'REVIEW_REQUIRED' : 'RESULT_RECORDED';
          }
          const history = {
            historyId: randomUUID(),
            owner: 'IdentityRecovery',
            actorAccountRef: current.accountRef,
            verifiedPersonRef: null,
            occurredAt: consumedAt.toISOString(),
            reason: input.meta.reason,
            beforeRef: ref('RecoveryHandoffGrant', current),
            afterRef: resultRefs[0],
            evidenceRefs: input.meta.evidenceRefs,
            requestId,
            resultRefs,
            correctionOf: null,
            sourceRevision: resultRefs[0]!.revision,
          };
          await tx.put('IdentityHistory', history);
          await tx.put('RequestReceipt', {
            requestId,
            principalId,
            audience: context.audience,
            operation: 'claimHandoff',
            targetIdentity: target,
            requestFingerprint: fingerprint(safe),
            idempotencyKey: input.meta.clientRequestId,
            owner: 'IdentityRecovery',
            targetScope: null,
            requestState: state,
            resultRefs: [...resultRefs, ref('IdentityHistory', history)],
            acceptedAt: consumedAt.toISOString(),
            updatedAt: consumedAt.toISOString(),
            revision: 1,
            correlationId: context.correlationId,
          });
        },
      );
    const receipt = await this.store.read('RequestReceipt', commit.requestId);
    requireCondition(receipt, 503, 'CLAIM_NOT_PROTECTED', '원래 claim 결과의 보호가 필요합니다.');
    return this.claimResult(receipt, party, input);
  }
  private async staffClaimIngress(proof: unknown): Promise<boolean> {
    return this.staffIngress(proof);
  }
  private async destroyConsumedCode(grantId: string): Promise<void> {
    const current = await this.authorization.lookup('RecoveryHandoffGrant', grantId);
    if (!current || !['CLAIMED', 'EXHAUSTED', 'REVOKED'].includes(String(current.state))) return;
    const original = await this.store.readRevision('RecoveryHandoffGrant', grantId, 1);
    requireCondition(
      original,
      503,
      'HANDOFF_ORIGINAL_REQUIRED',
      '원래 전달 자료의 보호 결합이 필요합니다.',
    );
    await this.vault.destroy(this.vaultBinding(original), {
      ...this.vaultPermit(original),
      deadlineAt: new Date(this.now().getTime() + 30000).toISOString(),
    });
  }
  private async assertClaimAuthority(authority: ModelData): Promise<void> {
    const account = await this.authorization.lookup('Account', (authority.accountRef as Ref).id),
      binding = await this.authorization.lookup(
        'ProviderBinding',
        (authority.bindingRef as Ref).id,
      ),
      states = await this.store.list('AccountSecurityState', {
        equals: { accountRef: { id: (authority.accountRef as Ref).id } },
        limit: 2,
      });
    requireCondition(
      account?.active &&
        binding?.active &&
        binding.revision === (authority.bindingRef as Ref).revision &&
        binding.generation === authority.bindingGeneration &&
        binding.audience === authority.audience &&
        states.length === 1,
      401,
      'PURPOSE_SECURITY_CHANGED',
      '현재 제한 권위의 신원 연결을 확인하세요.',
    );
    const security = await this.authorization.lookup(
      'AccountSecurityState',
      String(states[0]!.securityStateId),
    );
    requireCondition(
      security?.securityGeneration === authority.securityGeneration,
      401,
      'PURPOSE_SECURITY_CHANGED',
      '현재 제한 권위의 보안 세대를 확인하세요.',
    );
    const current = await this.authorization.lookup(
      'EnrollmentAuthority',
      String(authority.authorityId),
    );
    requireCondition(
      current &&
        current.revision === authority.revision &&
        ['ACTIVE', 'HOLD'].includes(String(current.state)) &&
        current.epoch === (await this.store.currentEpoch()) &&
        this.now().getTime() < Date.parse(String(current.expiresAt)),
      409,
      'CLAIM_RESULT_UNAVAILABLE',
      '현재 원래 제한 권위를 다시 확인하세요.',
    );
  }
  private async claimResult(
    receipt: ModelData,
    party: ModelData,
    input: ClaimHandoffInput,
  ): Promise<{ outcome: unknown; handle: string }> {
    await this.destroyConsumedCode(input.grantRef.id);
    const claimRef = (receipt.resultRefs as Ref[]).find(
      (source) => source.entity === 'ClaimReceipt',
    );
    if (!claimRef)
      throw new OmsError(403, 'HANDOFF_CODE_INVALID', '현재 인계 코드를 다시 확인하세요.');
    await this.parties!.assert(
      ref('PartyClaimContext', party),
      input.partySecret,
      input.caseRef,
      input.challengeId,
      undefined,
      claimRef,
    );
    const claim = await this.authorization.lookup('ClaimReceipt', claimRef.id),
      authority =
        claim &&
        (await this.authorization.lookup('EnrollmentAuthority', (claim.authorityRef as Ref).id));
    requireCondition(
      claim &&
        authority &&
        (claim.partyContextRef as Ref).id === party.partyContextId &&
        (claim.requestRef as Ref | null)?.id === receipt.requestId &&
        ['ACTIVE', 'HOLD'].includes(String(authority.state)) &&
        authority.epoch === (await this.store.currentEpoch()) &&
        this.now().getTime() < Date.parse(String(authority.expiresAt)),
      409,
      'CLAIM_RESULT_UNAVAILABLE',
      '원래 제한 단계 결과를 다시 확인하세요.',
    );
    await this.assertClaimAuthority(authority);
    const bytes = await this.vault.read(
      this.handleBinding(authority),
      this.handlePermit(authority),
    );
    await this.assertClaimAuthority(authority);
    const outcome = this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/LimitedOutcome',
      {
        claimReceiptRef: claimRef,
        authorityRef: ref('EnrollmentAuthority', authority),
        purpose: 'MFA_REENROLMENT',
        expiresAt: authority.expiresAt,
        phase: 'ENROLMENT_ONLY',
      },
    );
    return { outcome, handle: bytes.toString() };
  }
  async reobserve(
    context: PreIdentityContext,
    input: { partyContextRef: Ref; challengeId: string; partySecret: string },
    ingressProof: unknown = null,
  ): Promise<{ outcome: unknown; handle: string }> {
    this.store.schema.validate('PreIdentityContext', context);
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/ReobserveHandoffInput',
      input,
    );
    requireCondition(
      context.attemptId === input.challengeId &&
        this.now().getTime() < Date.parse(context.deadlineAt) &&
        this.parties,
      401,
      'CLAIM_RESULT_UNAVAILABLE',
      '원래 당사자의 제한 결과만 재관측합니다.',
    );
    if (context.audience === 'STAFF')
      requireCondition(
        await this.staffIngress(ingressProof),
        403,
        'STAFF_INGRESS_REQUIRED',
        '사설 직원 접점이 필요합니다.',
      );
    const party = await this.authorization.lookup('PartyClaimContext', input.partyContextRef.id),
      claims = await this.store.list('ClaimReceipt', {
        equals: { partyContextRef: { id: input.partyContextRef.id } },
        limit: 2,
      });
    requireCondition(
      party &&
        party.audience === context.audience &&
        party.challengeId === input.challengeId &&
        claims.length === 1,
      401,
      'CLAIM_RESULT_UNAVAILABLE',
      '같은 원래 당사자의 단일 보호 claim이 필요합니다.',
    );
    const claim = (await this.authorization.lookup(
        'ClaimReceipt',
        String(claims[0]!.claimReceiptId),
      ))!,
      authority = (await this.authorization.lookup(
        'EnrollmentAuthority',
        (claim.authorityRef as Ref).id,
      ))!,
      grant = claim.grantRef
        ? await this.authorization.lookup('RecoveryHandoffGrant', (claim.grantRef as Ref).id)
        : null;
    requireCondition(
      grant?.state === 'CLAIMED' &&
        canonicalJson(grant.claimReceiptRef) === canonicalJson(ref('ClaimReceipt', claim)) &&
        (grant.partyContextRef as Ref).id === party.partyContextId &&
        grant.challengeId === input.challengeId &&
        authority &&
        canonicalJson(authority.claimReceiptRef) === canonicalJson(ref('ClaimReceipt', claim)) &&
        canonicalJson(claim.partyContextRef) === canonicalJson(ref('PartyClaimContext', party)) &&
        (authority.partyContextRef as Ref).id === party.partyContextId,
      401,
      'CLAIM_RESULT_UNAVAILABLE',
      '원래 Grant/ClaimReceipt/제한 권위의 같은 결합이 필요합니다.',
    );
    const check = async () => {
      await this.parties!.assert(
        ref('PartyClaimContext', party),
        input.partySecret,
        claim.caseRef as Ref,
        input.challengeId,
        undefined,
        ref('ClaimReceipt', claim),
      );
      await this.assertClaimAuthority(authority);
      const current = await this.authorization.lookup(
          'EnrollmentAuthority',
          String(authority.authorityId),
        ),
        source = await this.authorization.lookup('RecoveryCase', (claim.caseRef as Ref).id);
      requireCondition(
        current?.state === 'ACTIVE' &&
          current.revision === authority.revision &&
          source &&
          ['ENROLMENT_ONLY', 'EXTERNAL_PENDING'].includes(String(source.state)) &&
          (source.enrollmentAuthorityRef as Ref).id === authority.authorityId &&
          (source.accountRef as Ref).id === (claim.accountRef as Ref).id &&
          source.securityGeneration === authority.securityGeneration &&
          source.bindingGeneration === authority.bindingGeneration &&
          source.epoch === authority.epoch &&
          this.now().getTime() < Date.parse(context.deadlineAt),
        401,
        'CLAIM_RESULT_UNAVAILABLE',
        '현재 ACTIVE 원래 권위의 남은 시간에만 결과를 재관측합니다.',
      );
    };
    await check();
    const bytes = await this.vault.read(
      this.handleBinding(authority),
      this.handlePermit(authority),
    );
    try {
      await check();
      return {
        handle: bytes.toString(),
        outcome: this.store.schema.validateUri(
          'urn:oms:contract:u2-access-additions:1#/$defs/LimitedOutcome',
          {
            claimReceiptRef: ref('ClaimReceipt', claim),
            authorityRef: ref('EnrollmentAuthority', authority),
            purpose: 'MFA_REENROLMENT',
            expiresAt: authority.expiresAt,
            phase: 'ENROLMENT_ONLY',
          },
        ),
      };
    } finally {
      bytes.fill(0);
    }
  }
}
