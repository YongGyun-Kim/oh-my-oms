import { randomUUID } from 'node:crypto';
import { requireCondition, canonicalJson } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { ref } from './references.js';
import { PurposeVerifier, generatePurposeSecret } from './purpose-verifier.js';
import type { SecretBinding } from './purpose-verifier.js';
import { invitationBinding } from './enterprise-invitations.js';
export async function assertBusinessIdentityReleased(
  store: ProtectedStore,
  accountId: string,
  transaction?: ProtectedTransaction,
): Promise<void> {
  const rawSlots = await store.primary.query(
    "SELECT \"slotId\" AS id FROM u1_identity_execution_slot WHERE \"accountRef\"->>'id'=$1 AND state IN ('ACTIVE','UNKNOWN') LIMIT 101",
    [accountId],
  );
  const slots = await store.list('IdentityExecutionSlot', {
    equals: { accountRef: { id: accountId } },
    anyOf: [{ state: 'ACTIVE' }, { state: 'UNKNOWN' }],
    limit: 100,
  });
  requireCondition(
    rawSlots.length <= 100 &&
      rawSlots.length === slots.length &&
      rawSlots.every((row: { id: string }) => slots.some((slot) => slot.slotId === row.id)),
    503,
    'CURRENT_RECOVERY_NOT_PROTECTED',
    '현재 복구 실행 경계의 보호가 필요합니다.',
  );
  for (const row of slots) {
    const protectedRow = await store.currentProtected('IdentityExecutionSlot', String(row.slotId));
    if (transaction) {
      const raw = await transaction.get('IdentityExecutionSlot', String(row.slotId));
      requireCondition(
        canonicalJson(raw) === canonicalJson(protectedRow),
        503,
        'CURRENT_RECOVERY_NOT_PROTECTED',
        '현재 복구 경계를 대조하세요.',
      );
    }
  }
  requireCondition(
    slots.length === 0,
    403,
    'RECOVERY_PURPOSE_REQUIRED',
    '현재 복구 제한 단계가 끝난 뒤 새 일반 인증을 진행하세요.',
  );
  const rawCases = await store.primary.query(
    "SELECT \"caseId\" AS id FROM u1_recovery_case WHERE \"accountRef\"->>'id'=$1 AND \"enrollmentAuthorityRef\" IS NOT NULL AND state NOT IN ('COMPLETED','CLOSED','REJECTED') LIMIT 101",
    [accountId],
  );
  const active: ModelData[] = [];
  for (const state of ['REQUESTED', 'VERIFYING', 'ENROLMENT_ONLY', 'EXTERNAL_PENDING', 'HOLD'])
    for (const row of await store.list('RecoveryCase', {
      equals: { accountRef: { id: accountId }, state },
      limit: 100,
    }))
      if (row.enrollmentAuthorityRef !== null) active.push(row);
  requireCondition(
    rawCases.length <= 100 &&
      rawCases.length === active.length &&
      rawCases.every((row: { id: string }) => active.some((source) => source.caseId === row.id)),
    503,
    'CURRENT_RECOVERY_NOT_PROTECTED',
    '현재 당사자 복구의 보호가 필요합니다.',
  );
  for (const row of active) await store.currentProtected('RecoveryCase', String(row.caseId));
  requireCondition(
    active.length === 0,
    403,
    'RECOVERY_PURPOSE_REQUIRED',
    '복구 완료 후 새 일반 인증을 진행하세요.',
  );
}
export type EnrollmentPurpose =
  'INITIAL_MFA' | 'INVITATION_ACCEPTANCE' | 'RECOVERY_VERIFICATION' | 'MFA_REENROLMENT';
// Contexts are server-created after verification of the actual opaque handle.
// A supplied Ref, header or boolean cannot manufacture one.
export class EnrollmentAuthorities {
  private readonly contexts = new WeakMap<ServiceContext, { row: string; context: string }>();
  private readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    private readonly verifier: PurposeVerifier,
    private readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
  ) {
    this.authorization = new Authorization(store, now);
  }
  binding(row: ModelData): SecretBinding {
    return {
      purpose: 'ENROLLMENT_HANDLE',
      targetRef: { ...ref('EnrollmentAuthority', row), revision: 1 },
      accountRef: row.accountRef as Ref,
      bindingRef: row.bindingRef as Ref,
      bindingGeneration: Number(row.bindingGeneration),
      securityGeneration: Number(row.securityGeneration),
      sourceRevision: 1,
      epoch: String(row.epoch),
      challengeId: String(row.challengeId),
      keyVersion: String(row.keyVersion),
    };
  }
  async issueInvitation(
    context: ServiceContext,
    invitationRef: Ref,
    response: string,
    contactVerificationRef: Ref,
  ): Promise<{ authorityRef: Ref; handle: string }> {
    await this.authorization.identity(context);
    requireCondition(
      context.audience === 'CUSTOMER',
      403,
      'CUSTOMER_REQUIRED',
      '고객 본인의 제한 초대 단계입니다.',
    );
    const invitation = await this.store.currentProtected('MembershipInvitation', invitationRef.id);
    requireCondition(
      invitation &&
        invitation.revision === invitationRef.revision &&
        invitation.state === 'PENDING' &&
        this.now().getTime() < Date.parse(String(invitation.expiresAt)),
      404,
      'NOT_FOUND',
      '대상을 확인할 수 없습니다.',
    );
    requireCondition(
      this.verifier.matches(
        response,
        invitationBinding(invitation),
        String(invitation.tokenVerifier),
      ),
      403,
      'INVITATION_RESPONSE',
      '초대 확인을 다시 진행하세요.',
    );
    await this.contactProof(context.principalId, invitation, contactVerificationRef);
    const bindings = await this.store.list('ProviderBinding', {
        equals: {
          accountRef: { id: context.principalId },
          audience: context.audience,
          active: true,
        },
        limit: 2,
      }),
      states = await this.store.list('AccountSecurityState', {
        equals: { accountRef: { id: context.principalId } },
        limit: 2,
      });
    requireCondition(
      bindings.length === 1 && states.length === 1,
      503,
      'CURRENT_SECURITY_REQUIRED',
      '현재 신원 세대가 필요합니다.',
    );
    const issued = this.now(),
      handle = generatePurposeSecret('ENROLLMENT_HANDLE'),
      row: ModelData = {
        authorityId: randomUUID(),
        revision: 1,
        accountRef: context.actorAccountRef,
        bindingRef: ref('ProviderBinding', bindings[0]!),
        bindingGeneration: bindings[0]!.generation,
        securityGeneration: states[0]!.securityGeneration,
        audience: 'CUSTOMER',
        purpose: 'INVITATION_ACCEPTANCE',
        sourceRef: null,
        invitationRef,
        contactVerificationRef,
        handleVaultRef: null,
        claimReceiptRef: null,
        verificationRef: null,
        partyContextRef: null,
        challengeId: randomUUID(),
        handleVerifier: '',
        keyVersion: this.verifier.keyVersion,
        issuedAt: issued.toISOString(),
        expiresAt: new Date(
          Math.min(issued.getTime() + 300000, Date.parse(String(invitation.expiresAt))),
        ).toISOString(),
        state: 'ACTIVE',
        epoch: await this.store.currentEpoch(),
      };
    row.handleVerifier = this.verifier.digest(handle, this.binding(row));
    await this.store.execute(
      {
        principalId: context.principalId,
        audience: context.audience,
        owner: 'IdentityRecovery',
        operation: 'invitation-purpose-authority',
        target: invitationRef,
        idempotencyKey: randomUUID(),
        input: { authorityId: row.authorityId },
        correlationId: context.correlationId,
        epoch: String(row.epoch),
      },
      async (tx) => {
        await this.authorization.identity(context, tx);
        const current = await this.authorization.lookup(
            'MembershipInvitation',
            invitationRef.id,
            tx,
          ),
          binding = await this.authorization.lookup(
            'ProviderBinding',
            (row.bindingRef as Ref).id,
            tx,
          ),
          security = await this.authorization.lookup(
            'AccountSecurityState',
            String(states[0]!.securityStateId),
            tx,
          );
        requireCondition(
          current?.revision === invitationRef.revision &&
            current.state === 'PENDING' &&
            this.now().getTime() < Date.parse(String(current.expiresAt)),
          409,
          'INVITATION_CHANGED',
          '현재 초대가 변경됐습니다.',
        );
        requireCondition(
          binding?.generation === row.bindingGeneration &&
            security?.securityGeneration === row.securityGeneration,
          409,
          'PURPOSE_SECURITY_CHANGED',
          '현재 신원 세대가 변경됐습니다.',
        );
        await this.contactProof(context.principalId, current, contactVerificationRef, tx);
        await tx.put('EnrollmentAuthority', row);
      },
    );
    return { authorityRef: ref('EnrollmentAuthority', row), handle };
  }
  async authenticate(
    authorityRef: Ref,
    handle: string,
    purpose: EnrollmentPurpose,
    correlationId: string,
    ingressProof: unknown = null,
    allowHeld = false,
  ): Promise<ServiceContext> {
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/EnrollmentAuthority',
      authorityRef,
    );
    const row = await this.store.currentProtected('EnrollmentAuthority', authorityRef.id);
    requireCondition(
      row && this.verifier.matches(handle, this.binding(row), String(row.handleVerifier)),
      401,
      'PURPOSE_AUTHORITY_REQUIRED',
      '현재 목적 권위를 확인하세요.',
    );
    requireCondition(
      row.audience !== 'STAFF' || (await this.staffIngress(ingressProof)),
      403,
      'STAFF_INGRESS_REQUIRED',
      '사설 직원 접점이 필요합니다.',
    );
    const context: ServiceContext = {
      principalId: (row.accountRef as Ref).id,
      actorAccountRef: row.accountRef as Ref,
      verifiedPersonRef: null,
      identityAssertionRef: ref('EnrollmentAuthority', row),
      audience: row.audience as 'CUSTOMER' | 'STAFF',
      accessEvaluationRef: null,
      executionPermitRef: null,
      correlationId,
      deadlineAt: new Date(
        Math.min(this.now().getTime() + 10000, Date.parse(String(row.expiresAt))),
      ).toISOString(),
    };
    this.contexts.set(context, { row: this.immutable(row), context: canonicalJson(context) });
    await this.assert(context, purpose, undefined, true, allowHeld);
    return context;
  }
  private async contactProof(
    accountId: string,
    invitation: ModelData,
    evidenceRef: Ref,
    transaction?: ProtectedTransaction,
  ): Promise<void> {
    this.store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Ref', evidenceRef);
    requireCondition(
      evidenceRef.owner === 'IdentityRecovery' && evidenceRef.entity === 'VerificationEvidence',
      403,
      'CONTACT_VERIFICATION_REQUIRED',
      '현재 본인 연락 근거가 필요합니다.',
    );
    const evidence = await this.authorization.lookup(
        'VerificationEvidence',
        evidenceRef.id,
        transaction,
      ),
      contact = await this.authorization.lookup(
        'RegisteredContact',
        (invitation.contactRef as Ref).id,
        transaction,
      );
    requireCondition(
      evidence &&
        evidence.revision === evidenceRef.revision &&
        evidence.state === 'CONFIRMED' &&
        evidence.purpose === 'INVITATION_ACCEPTANCE' &&
        (evidence.accountRef as Ref).id === accountId &&
        (evidence.contactRef as Ref | null)?.id === (invitation.contactRef as Ref).id &&
        evidence.contactVersion === invitation.contactVersion &&
        contact?.state === 'VERIFIED' &&
        contact.revision === (invitation.contactRef as Ref).revision &&
        contact.contactVersion === invitation.contactVersion &&
        (contact.accountRef === null || (contact.accountRef as Ref).id === accountId) &&
        this.now().getTime() < Date.parse(String(evidence.expiresAt)),
      403,
      'CONTACT_VERIFICATION_REQUIRED',
      '현재 본인 연락 근거가 필요합니다.',
    );
    const policy = await this.authorization.lookup(
      'VerificationPolicy',
      (evidence.policyRef as Ref).id,
      transaction,
    );
    requireCondition(
      policy?.active &&
        policy.revision === (evidence.policyRef as Ref).revision &&
        policy.purpose === 'INVITATION_ACCEPTANCE' &&
        policy.synthetic === true &&
        evidence.synthetic === true &&
        (policy.requiredSourceKinds as string[]).includes(String(evidence.sourceKind)) &&
        this.now().getTime() < Date.parse(String(policy.expiresAt)),
      403,
      'CONTACT_POLICY_REQUIRED',
      '등록된 현재 합성 연락 확인 정책이 필요합니다.',
    );
  }
  private immutable(row: ModelData): string {
    return canonicalJson(
      Object.fromEntries(
        Object.entries(row).filter(([key]) => key !== 'revision' && key !== 'state'),
      ),
    );
  }
  async assert(
    context: ServiceContext,
    purpose: EnrollmentPurpose,
    transaction?: ProtectedTransaction,
    allowCompleted = false,
    allowHeld = false,
  ): Promise<ModelData> {
    requireCondition(
      this.contexts.get(context)?.context === canonicalJson(context) &&
        context.identityAssertionRef.entity === 'EnrollmentAuthority',
      401,
      'PURPOSE_AUTHORITY_REQUIRED',
      '서버가 검증한 현재 목적 권위가 필요합니다.',
    );
    const row = await this.authorization.lookup(
        'EnrollmentAuthority',
        context.identityAssertionRef.id,
        transaction,
      ),
      now = this.now().getTime();
    requireCondition(
      row && this.contexts.get(context)?.row === this.immutable(row),
      401,
      'PURPOSE_AUTHORITY_CHANGED',
      '원래 목적 권위의 결합이 변경됐습니다.',
    );
    requireCondition(
      row &&
        row.purpose === purpose &&
        row.audience === context.audience &&
        (row.accountRef as Ref).id === context.principalId &&
        (row.state === 'ACTIVE' ||
          (allowCompleted && row.state === 'COMPLETED') ||
          (allowHeld && row.state === 'HOLD')) &&
        row.epoch === (await this.store.currentEpoch()) &&
        now < Date.parse(String(row.expiresAt)) &&
        now < Date.parse(context.deadlineAt),
      401,
      'PURPOSE_AUTHORITY_EXPIRED',
      '현재 목적 권위가 만료/회수됐습니다.',
    );
    const account = await this.authorization.lookup('Account', context.principalId, transaction),
      binding = await this.authorization.lookup(
        'ProviderBinding',
        (row.bindingRef as Ref).id,
        transaction,
      ),
      states = await this.store.list('AccountSecurityState', {
        equals: { accountRef: { id: context.principalId } },
        limit: 2,
      });
    let currentBinding = !!binding && binding.revision === (row.bindingRef as Ref).revision;
    if (
      !currentBinding &&
      allowCompleted &&
      row.state === 'COMPLETED' &&
      purpose === 'MFA_REENROLMENT' &&
      row.sourceRef
    ) {
      const source = await this.authorization.lookup(
          'RecoveryCase',
          (row.sourceRef as Ref).id,
          transaction,
        ),
        original = await this.store.readRevision(
          'ProviderBinding',
          (row.bindingRef as Ref).id,
          (row.bindingRef as Ref).revision,
        );
      currentBinding = !!(
        source?.state === 'COMPLETED' &&
        (source.enrollmentAuthorityRef as Ref | null)?.id === row.authorityId &&
        canonicalJson(source.bindingRef) ===
          canonicalJson(binding && ref('ProviderBinding', binding)) &&
        original?.authRevision === binding?.authRevision &&
        source.securityGeneration === row.securityGeneration &&
        source.epoch === row.epoch
      );
    }
    requireCondition(
      account?.active &&
        binding?.active &&
        currentBinding &&
        binding.audience === context.audience &&
        (binding.accountRef as Ref).id === context.principalId &&
        binding.generation === row.bindingGeneration &&
        states.length === 1,
      401,
      'PURPOSE_SECURITY_CHANGED',
      '현재 신원 연결/보안 세대를 확인하세요.',
    );
    const security = await this.authorization.lookup(
      'AccountSecurityState',
      String(states[0]!.securityStateId),
      transaction,
    );
    requireCondition(
      security?.securityGeneration === row.securityGeneration,
      401,
      'PURPOSE_SECURITY_CHANGED',
      '현재 보안 세대가 변경됐습니다.',
    );
    if (purpose === 'INVITATION_ACCEPTANCE') {
      requireCondition(
        row.contactVerificationRef,
        403,
        'CONTACT_VERIFICATION_REQUIRED',
        '원래 본인 연락 근거가 필요합니다.',
      );
      const invitation = await this.authorization.lookup(
        'MembershipInvitation',
        (row.invitationRef as Ref).id,
        transaction,
      );
      requireCondition(
        invitation && invitation.tokenGeneration === (row.invitationRef as Ref).revision,
        401,
        'PURPOSE_SOURCE_CHANGED',
        '원래 초대 세대가 변경됐습니다.',
      );
      await this.contactProof(
        context.principalId,
        invitation,
        row.contactVerificationRef as Ref,
        transaction,
      );
      const evidence = await this.authorization.lookup(
        'VerificationEvidence',
        (row.contactVerificationRef as Ref).id,
        transaction,
      );
      requireCondition(
        (evidence!.bindingRef as Ref).id === (row.bindingRef as Ref).id,
        401,
        'PURPOSE_SECURITY_CHANGED',
        '원래 연락 확인의 연결이 다릅니다.',
      );
    }
    return row;
  }
}
