import { randomUUID } from 'node:crypto';
import { canonicalJson, requireCondition, OmsError } from '@oms/contracts';
import type { CommandMeta, Ref, Receipt, ServiceContext, ScopeV2 } from '@oms/contracts';
import type { ModelData, ProtectedTransaction, VaultBinding, VaultPermit } from '@oms/persistence';
import { PurposeSecretVault, u2EnterpriseFenceId } from '@oms/persistence';
import type { EnterpriseAccess } from './enterprise-access.js';
import { ref } from './references.js';
import { PurposeVerifier, generatePurposeSecret } from './purpose-verifier.js';
import type { InvitationSecretBinding } from './purpose-verifier.js';
import {
  currentMembershipManagement,
  currentManagementScopes,
  runU2AccessCommand,
  validateMembershipOrganisation,
} from './enterprise-memberships.js';
import { currentRolePredicates } from './enterprise-role-revisions.js';
import { requireManagedChange } from './scope-v2.js';
import type { OrderingPolicy } from './scopes.js';
import { enqueueU2Work } from './identity-work.js';
import { enqueueMinimumNotice } from './pending-notification.js';
import type { EnrollmentAuthorities } from './enrollment-authority.js';
export interface InvitationInput {
  meta: CommandMeta;
  enterpriseRef: Ref;
  contactRef: Ref;
  contactVersion: number;
  departmentRef: Ref | null;
  siteRef: Ref | null;
  roleRefs: Ref[];
  expectedMembershipRevision: number | null;
  reactivate: boolean;
}
export function invitationBinding(row: ModelData): InvitationSecretBinding {
  return {
    purpose: 'INVITATION_TOKEN',
    targetRef: { ...ref('MembershipInvitation', row), revision: Number(row.tokenGeneration) },
    contactRef: row.contactRef as Ref,
    tokenGeneration: Number(row.tokenGeneration),
    epoch: String(row.epoch),
    keyVersion: String(row.keyVersion),
  };
}
export function requireInvitationPending(row: ModelData, now: Date): void {
  requireCondition(
    row.state === 'PENDING' && now.getTime() < Date.parse(String(row.expiresAt)),
    409,
    'INVITATION_NOT_PENDING',
    '초대가 만료되거나 이미 처리됐습니다.',
  );
}
export class EnterpriseInvitations {
  constructor(
    private readonly access: EnterpriseAccess,
    private readonly verifier: PurposeVerifier,
    private readonly vault: PurposeSecretVault,
    private readonly authorities: EnrollmentAuthorities,
    private readonly now: () => Date,
  ) {}
  get store() {
    return this.access.store;
  }
  async assertDelivery(sourceRef: Ref, tx?: ProtectedTransaction): Promise<ModelData> {
    const a = this.access.authorization,
      row = await a.lookup('MembershipInvitation', sourceRef.id, tx);
    requireCondition(
      row &&
        canonicalJson(ref('MembershipInvitation', row)) === canonicalJson(sourceRef) &&
        row.epoch === (await this.store.currentEpoch()),
      409,
      'INVITATION_REVISION',
      '원래 현재 초대 전달 개정이 필요합니다.',
    );
    requireInvitationPending(row, this.now());
    const enterprise = await a.lookup('Enterprise', (row.enterpriseRef as Ref).id, tx),
      inviter = await a.lookup('EnterpriseMembership', (row.inviterMembershipRef as Ref).id, tx),
      contact = await a.lookup('RegisteredContact', (row.contactRef as Ref).id, tx);
    requireCondition(
      enterprise?.usageEnabled &&
        enterprise.approvalState === 'APPROVED' &&
        enterprise.revision === row.policyRevision &&
        inviter?.active &&
        inviter.revision === (row.inviterMembershipRef as Ref).revision &&
        contact?.state === 'VERIFIED' &&
        contact.revision === (row.contactRef as Ref).revision &&
        contact.contactVersion === row.contactVersion,
      409,
      'RECONFIRMATION_REQUIRED',
      '현재 초대자/기업/연락 개정의 재확인이 필요합니다.',
    );
    const management = await currentMembershipManagement(this.access, inviter, tx);
    requireCondition(
      canonicalJson(management.sources) === canonicalJson(row.inviterAuthorityRefs),
      409,
      'RECONFIRMATION_REQUIRED',
      '원래 관리 권위 원본을 대조하세요.',
    );
    await this.checkPlan(
      enterprise,
      {
        departmentRef: row.departmentRef as Ref | null,
        siteRef: row.siteRef as Ref | null,
        roleRefs: row.roleRefs as Ref[],
      },
      management.scopes,
      tx,
    );
    return row;
  }
  async deliveryMaterial(sourceRef: Ref) {
    const row = await this.assertDelivery(sourceRef);
    return {
      routeRef: row.contactRef as Ref,
      binding: this.vaultBinding(row),
      permit: this.permit(row),
    };
  }
  async destroyDelivered(sourceRef: Ref): Promise<void> {
    const original = await this.store.readRevision(
      'MembershipInvitation',
      sourceRef.id,
      sourceRef.revision,
    );
    requireCondition(
      original,
      503,
      'INVITATION_VAULT_SOURCE',
      '원래 전달 자료의 보호 개정이 필요합니다.',
    );
    await this.vault.destroy(this.vaultBinding(original), {
      ...this.permit(original),
      epoch: await this.store.currentEpoch(),
    });
  }
  async readOwn(context: ServiceContext, sourceRef: Ref): Promise<unknown> {
    const authority = await this.authorities.assert(
      context,
      'INVITATION_ACCEPTANCE',
      undefined,
      true,
    );
    requireCondition(
      sourceRef.owner === 'EnterpriseAccess' &&
        sourceRef.entity === 'MembershipInvitation' &&
        (authority.invitationRef as Ref).id === sourceRef.id,
      404,
      'NOT_FOUND',
      '대상을 확인할 수 없습니다.',
    );
    const row = await this.access.authorization.lookup('MembershipInvitation', sourceRef.id);
    requireCondition(row, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    const view = {
      sourceRef: ref('MembershipInvitation', row),
      state: row.state,
      knowledge: 'KNOWN',
      remainingAction:
        row.state === 'PENDING'
          ? '본인의 초대 수락을 확인하세요.'
          : row.state === 'RECONFIRMATION_REQUIRED'
            ? '현재 관리자의 새 확인이 필요합니다.'
            : '원래 처리 상태를 확인하세요.',
      expiresAt: row.expiresAt,
      actualEffect: row.state === 'ACCEPTED' ? 'CONFIRMED' : 'UNCONFIRMED',
      noticeDelivery: 'REQUESTED',
    };
    await this.authorities.assert(context, 'INVITATION_ACCEPTANCE', undefined, true);
    return this.access.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/StatusView',
      view,
    );
  }
  private vaultBinding(row: ModelData): VaultBinding {
    return {
      id: String(row.vaultRef),
      purpose: 'INVITATION_TOKEN',
      targetRef: ref('MembershipInvitation', row),
      accountRef: null,
      audience: 'CUSTOMER',
      bindingGeneration: null,
      sourceRevision: Number(row.revision),
      expiresAt: String(row.vaultExpiresAt),
      keyVersion: this.vault.keyVersion,
    };
  }
  private permit(row: ModelData): VaultPermit {
    return {
      authorityRef: ref('MembershipInvitation', row),
      targetRef: ref('MembershipInvitation', row),
      purpose: 'INVITATION_TOKEN',
      operation: 'enterprise.invitation.deliver',
      epoch: String(row.epoch),
      deadlineAt: new Date(
        Math.min(this.now().getTime() + 30000, Date.parse(String(row.expiresAt))),
      ).toISOString(),
    };
  }
  async issue(context: ServiceContext, input: InvitationInput): Promise<Receipt> {
    const { store, authorization: a } = this.access;
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/InvitationInput',
      input,
    );
    requireCondition(
      input.meta.expectedRevision === null,
      400,
      'CREATE_REVISION',
      '신규 초대입니다.',
    );
    let enterprise: ModelData,
      member: ModelData,
      authorityRefs: Ref[] = [],
      issued: ModelData | null = null;
    const secret = generatePurposeSecret('INVITATION_TOKEN');
    const authorize = async (tx?: ProtectedTransaction) => {
      enterprise = (await a.lookup('Enterprise', input.enterpriseRef.id, tx))!;
      requireCondition(
        enterprise &&
          enterprise.revision === input.enterpriseRef.revision &&
          enterprise.usageEnabled,
        404,
        'NOT_FOUND',
        '대상을 확인할 수 없습니다.',
      );
      member = await a.relation(context, input.enterpriseRef.id, tx);
      const management = await currentMembershipManagement(this.access, member, tx),
        contact = await a.lookup('RegisteredContact', input.contactRef.id, tx);
      authorityRefs = management.sources;
      requireCondition(
        contact &&
          contact.revision === input.contactRef.revision &&
          contact.state === 'VERIFIED' &&
          contact.contactVersion === input.contactVersion,
        409,
        'CONTACT_UNCONFIRMED',
        '등록 연락 경로와 개정 확인이 필요합니다.',
      );
      await this.checkPlan(enterprise, input, management.scopes, tx);
      requireCondition(
        await a.lookup('EnterpriseAccessFence', u2EnterpriseFenceId(input.enterpriseRef.id), tx),
        503,
        'ACCESS_FENCE_REQUIRED',
        '현재 접근 fence가 필요합니다.',
      );
    };
    const receipt = await runU2AccessCommand(
      this.access,
      context,
      'issueMembershipInvitation',
      { kind: 'ENTERPRISE', enterpriseRef: input.enterpriseRef },
      input,
      authorize,
      async (tx, requestId) => {
        const at = this.now();
        issued = {
          invitationId: randomUUID(),
          revision: 1,
          enterpriseRef: ref('Enterprise', enterprise),
          inviterMembershipRef: ref('EnterpriseMembership', member),
          inviterAuthorityRefs: authorityRefs,
          contactRef: input.contactRef,
          contactVersion: input.contactVersion,
          departmentRef: input.departmentRef,
          siteRef: input.siteRef,
          roleRefs: input.roleRefs,
          expectedMembershipRevision: input.expectedMembershipRevision,
          reactivate: input.reactivate,
          policyRevision: enterprise.revision,
          tokenVerifier: '',
          keyVersion: this.verifier.keyVersion,
          tokenGeneration: 1,
          issuedAt: at.toISOString(),
          expiresAt: new Date(at.getTime() + 7 * 86400000).toISOString(),
          state: 'PENDING',
          acceptedAccountRef: null,
          acceptedMembershipRef: null,
          vaultRef: randomUUID(),
          vaultExpiresAt: new Date(at.getTime() + 86400000).toISOString(),
          epoch: await store.currentEpoch(),
        };
        issued.tokenVerifier = this.verifier.digest(secret, invitationBinding(issued));
        const bytes = Buffer.from(secret);
        try {
          await this.vault.prepareInvitation(bytes, this.vaultBinding(issued), {
            ...this.permit(issued),
            authorityRef: ref('Enterprise', enterprise),
            operation: 'enterprise.invitation.prepare',
          });
        } finally {
          bytes.fill(0);
        }
        await tx.put('MembershipInvitation', issued);
        const work = await enqueueU2Work(
          tx,
          context,
          requestId,
          'EnterpriseAccess.deliverInvitation',
          ref('MembershipInvitation', issued),
          String(issued.epoch),
          at,
          String(issued.expiresAt),
        );
        return {
          target: ref('MembershipInvitation', issued),
          refs: [ref('MembershipInvitation', issued), work.workRef, work.factRef],
          scope: this.access.managementTarget(enterprise),
          state: 'ACCEPTED',
        };
      },
      this.now,
    );
    return receipt;
  }
  private async checkPlan(
    enterprise: ModelData,
    plan: Pick<InvitationInput, 'departmentRef' | 'siteRef' | 'roleRefs'>,
    management: ScopeV2[],
    tx?: ProtectedTransaction,
  ): Promise<void> {
    await validateMembershipOrganisation(
      this.access,
      enterprise,
      plan.departmentRef,
      plan.siteRef,
      true,
      tx,
    );
    const target = {
      ...this.access.managementTarget(enterprise),
      departmentRef: plan.departmentRef,
      siteRef: plan.siteRef,
    };
    requireManagedChange(
      management,
      'user.manage',
      null,
      target,
      enterprise.orderingContextPolicy as OrderingPolicy,
    );
    for (const source of plan.roleRefs) {
      requireCondition(
        source.owner === 'EnterpriseAccess' && source.entity === 'CustomerRole',
        400,
        'INVITATION_ROLE',
        '명시 고객 역할이 필요합니다.',
      );
      const role = await this.access.authorization.lookup('CustomerRole', source.id, tx);
      requireCondition(
        role &&
          role.revision === source.revision &&
          (role.enterpriseRef as Ref).id === enterprise.enterpriseId,
        409,
        'INVITATION_ROLE_CHANGED',
        '예정 역할 개정이 다릅니다.',
      );
      const state = await this.access.authorization.currentRoleState('CustomerRole', source.id, tx);
      requireCondition(
        state?.active !== false,
        409,
        'INVITATION_ROLE_CHANGED',
        '비활성 역할을 초대에 부여할 수 없습니다.',
      );
      requireManagedChange(
        management,
        'role.manage',
        null,
        target,
        enterprise.orderingContextPolicy as OrderingPolicy,
        await currentRolePredicates(this.access, role, tx),
      );
    }
  }
  async revoke(
    context: ServiceContext,
    input: { meta: CommandMeta; sourceRef: Ref },
  ): Promise<Receipt> {
    return this.control(context, input, false);
  }
  async resend(
    context: ServiceContext,
    input: { meta: CommandMeta; sourceRef: Ref },
  ): Promise<Receipt> {
    return this.control(context, input, true);
  }
  private async control(
    context: ServiceContext,
    input: { meta: CommandMeta; sourceRef: Ref },
    resend: boolean,
  ): Promise<Receipt> {
    const { store, authorization: a } = this.access;
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/RecordCommandInput',
      input,
    );
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/MembershipInvitation',
      input.sourceRef,
    );
    let original: ModelData,
      updated: ModelData | null = null;
    const secret = generatePurposeSecret('INVITATION_TOKEN');
    const authorize = async (tx?: ProtectedTransaction) => {
      original = (await a.lookup('MembershipInvitation', input.sourceRef.id, tx))!;
      requireCondition(
        original &&
          original.revision === input.sourceRef.revision &&
          original.revision === input.meta.expectedRevision,
        409,
        'INVITATION_REVISION',
        '원래 초대 개정이 다릅니다.',
      );
      if (resend) requireInvitationPending(original, this.now());
      else
        requireCondition(
          ['PENDING', 'RECONFIRMATION_REQUIRED'].includes(String(original.state)),
          409,
          'INVITATION_NOT_PENDING',
          '원래 초대를 회수할 수 없습니다.',
        );
      const enterprise = await a.lookup('Enterprise', (original.enterpriseRef as Ref).id, tx);
      requireCondition(enterprise, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      const scopes = await currentManagementScopes(this.access, context, enterprise, tx);
      requireManagedChange(
        scopes,
        'user.manage',
        null,
        {
          ...this.access.managementTarget(enterprise),
          departmentRef: original.departmentRef as Ref | null,
          siteRef: original.siteRef as Ref | null,
        },
        enterprise.orderingContextPolicy as OrderingPolicy,
      );
    };
    const receipt = await runU2AccessCommand(
      this.access,
      context,
      resend ? 'resendMembershipInvitation' : 'revokeMembershipInvitation',
      { kind: 'RECORD', recordRef: input.sourceRef },
      input,
      authorize,
      async (tx, requestId) => {
        updated = {
          ...original,
          revision: Number(original.revision) + 1,
          state: resend ? 'PENDING' : 'REVOKED',
          tokenGeneration: resend ? Number(original.revision) + 1 : original.tokenGeneration,
          vaultRef: resend ? randomUUID() : original.vaultRef,
          vaultExpiresAt: resend
            ? new Date(
                Math.min(this.now().getTime() + 86400000, Date.parse(String(original.expiresAt))),
              ).toISOString()
            : original.vaultExpiresAt,
        };
        if (resend) {
          updated.tokenVerifier = this.verifier.digest(secret, invitationBinding(updated));
          const bytes = Buffer.from(secret);
          try {
            await this.vault.prepareInvitation(bytes, this.vaultBinding(updated), {
              ...this.permit(updated),
              authorityRef: ref('MembershipInvitation', original),
              operation: 'enterprise.invitation.prepare',
            });
          } finally {
            bytes.fill(0);
          }
        }
        await tx.put('MembershipInvitation', updated, Number(original.revision));
        await this.tombstone(tx, original, resend ? 'ROTATED' : 'REVOKED');
        const refs = [ref('MembershipInvitation', updated)];
        if (resend) {
          const work = await enqueueU2Work(
            tx,
            context,
            requestId,
            'EnterpriseAccess.deliverInvitation',
            ref('MembershipInvitation', updated),
            String(updated.epoch),
            this.now(),
            String(updated.expiresAt),
          );
          refs.push(work.workRef, work.factRef);
        }
        return {
          target: ref('MembershipInvitation', updated),
          refs,
          before: ref('MembershipInvitation', original),
          scope: null,
          state: resend ? 'ACCEPTED' : 'RESULT_RECORDED',
        };
      },
      this.now,
    );
    if (updated) await this.vault.destroy(this.vaultBinding(original!), this.permit(original!));
    return receipt;
  }
  private async tombstone(tx: ProtectedTransaction, row: ModelData, reason: string): Promise<void> {
    await tx.put('SecurityTombstone', {
      tombstoneId: randomUUID(),
      revision: 1,
      targetRef: ref('MembershipInvitation', row),
      purpose: 'INVITATION_TOKEN',
      reason,
      destroyedAt: this.now().toISOString(),
      epoch: row.epoch,
    });
  }
  async accept(
    context: ServiceContext,
    input: { meta: CommandMeta; invitationRef: Ref; response: string; contactVerificationRef: Ref },
  ): Promise<Receipt> {
    const { store, authorization: a } = this.access;
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/AcceptInvitationInput',
      input,
    );
    const source = await a.lookup('MembershipInvitation', input.invitationRef.id);
    requireCondition(source, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    const safeInput = {
      meta: input.meta,
      invitationRef: input.invitationRef,
      contactVerificationRef: input.contactVerificationRef,
      candidateVerifier: this.verifier.digest(input.response, invitationBinding(source)),
    };
    let invitation: ModelData,
      enterprise: ModelData,
      authority: ModelData,
      existing: ModelData | null;
    const identity = async (tx?: ProtectedTransaction) => {
      await this.authorities.assert(context, 'INVITATION_ACCEPTANCE', tx, true);
    };
    const authorize = async (tx?: ProtectedTransaction) => {
      authority = await this.authorities.assert(context, 'INVITATION_ACCEPTANCE', tx);
      requireCondition(
        (authority.invitationRef as Ref).id === input.invitationRef.id &&
          context.audience === 'CUSTOMER',
        403,
        'INVITATION_PURPOSE',
        '현재 본인의 원래 초대 목적이 필요합니다.',
      );
      invitation = (await a.lookup('MembershipInvitation', input.invitationRef.id, tx))!;
      requireCondition(
        invitation &&
          invitation.revision === input.meta.expectedRevision &&
          invitation.revision === input.invitationRef.revision,
        409,
        'INVITATION_REVISION',
        '원래 초대 개정이 다릅니다.',
      );
      requireInvitationPending(invitation, this.now());
      requireCondition(
        this.verifier.matches(
          input.response,
          invitationBinding(invitation),
          String(invitation.tokenVerifier),
        ),
        403,
        'INVITATION_RESPONSE',
        '초대 확인을 다시 진행하세요.',
      );
      const contact = await a.lookup('RegisteredContact', (invitation.contactRef as Ref).id, tx),
        evidence = await a.lookup('VerificationEvidence', input.contactVerificationRef.id, tx);
      requireCondition(
        input.contactVerificationRef.owner === 'IdentityRecovery' &&
          input.contactVerificationRef.entity === 'VerificationEvidence' &&
          evidence?.revision === input.contactVerificationRef.revision &&
          evidence.state === 'CONFIRMED' &&
          evidence.purpose === 'INVITATION_ACCEPTANCE' &&
          (evidence.accountRef as Ref).id === context.principalId &&
          (evidence.bindingRef as Ref).id === (authority.bindingRef as Ref).id &&
          (evidence.contactRef as Ref | null)?.id === (invitation.contactRef as Ref).id &&
          evidence.contactVersion === invitation.contactVersion &&
          contact?.state === 'VERIFIED' &&
          contact.revision === (invitation.contactRef as Ref).revision &&
          contact.contactVersion === invitation.contactVersion &&
          (contact.accountRef === null || (contact.accountRef as Ref).id === context.principalId) &&
          this.now().getTime() < Date.parse(String(evidence.expiresAt)),
        403,
        'CONTACT_VERIFICATION_REQUIRED',
        '현재 본인/연락 경로의 확인 근거가 필요합니다.',
      );
      const policy = await a.lookup('VerificationPolicy', (evidence.policyRef as Ref).id, tx);
      requireCondition(
        policy?.active &&
          policy.revision === (evidence.policyRef as Ref).revision &&
          policy.purpose === 'INVITATION_ACCEPTANCE' &&
          this.now().getTime() < Date.parse(String(policy.expiresAt)) &&
          (policy.requiredSourceKinds as string[]).includes(String(evidence.sourceKind)) &&
          ((evidence.synthetic && policy.synthetic) || (!evidence.synthetic && !policy.synthetic)),
        403,
        'CONTACT_POLICY_REQUIRED',
        '인정된 현재 연락 확인 정책이 필요합니다.',
      );
      requireCondition(
        this.access.verification.kind === 'SYNTHETIC' && evidence.synthetic && policy.synthetic,
        503,
        'REALACTIVATION_HOLD',
        '실제 신원/위임/국내 수신 경로가 확인되기 전 실활성은 보류합니다.',
      );
      enterprise = (await a.lookup('Enterprise', (invitation.enterpriseRef as Ref).id, tx))!;
      requireCondition(
        enterprise?.usageEnabled &&
          enterprise.approvalState === 'APPROVED' &&
          enterprise.revision === invitation.policyRevision,
        409,
        'RECONFIRMATION_REQUIRED',
        '현재 기업/조직 정책의 재확인이 필요합니다.',
      );
      const inviter = await a.lookup(
        'EnterpriseMembership',
        (invitation.inviterMembershipRef as Ref).id,
        tx,
      );
      requireCondition(
        inviter?.active && inviter.revision === (invitation.inviterMembershipRef as Ref).revision,
        409,
        'RECONFIRMATION_REQUIRED',
        '현재 초대자의 재확인이 필요합니다.',
      );
      const management = await currentMembershipManagement(this.access, inviter, tx);
      requireCondition(
        canonicalJson(management.sources) === canonicalJson(invitation.inviterAuthorityRefs),
        409,
        'RECONFIRMATION_REQUIRED',
        '초대자 권위 원본이 변경됐습니다.',
      );
      await this.checkPlan(
        enterprise,
        {
          departmentRef: invitation.departmentRef as Ref | null,
          siteRef: invitation.siteRef as Ref | null,
          roleRefs: invitation.roleRefs as Ref[],
        },
        management.scopes,
        tx,
      );
      requireCondition(
        await a.lookup(
          'EnterpriseAccessFence',
          u2EnterpriseFenceId(String(enterprise.enterpriseId)),
          tx,
        ),
        503,
        'ACCESS_FENCE_REQUIRED',
        '현재 접근 fence가 필요합니다.',
      );
      const matches = tx
        ? await tx.list(
            'EnterpriseMembership',
            {
              enterpriseRef: { id: enterprise.enterpriseId },
              accountRef: { id: context.principalId },
            },
            2,
          )
        : await store.list('EnterpriseMembership', {
            equals: {
              enterpriseRef: { id: enterprise.enterpriseId },
              accountRef: { id: context.principalId },
            },
            limit: 2,
          });
      requireCondition(
        matches.length <= 1,
        503,
        'MEMBERSHIP_CONFLICT',
        '현재 소속 원본을 대조하세요.',
      );
      existing = matches[0] ?? null;
      requireCondition(
        !existing
          ? !invitation.reactivate && invitation.expectedMembershipRevision === null
          : !existing.active &&
              invitation.reactivate &&
              existing.revision === invitation.expectedMembershipRevision,
        409,
        'MEMBERSHIP_INTENT',
        '기존 ACTIVE 소속은 덮어쓰지 않으며 명시 INACTIVE 재활성화만 허용합니다.',
      );
    };
    let receipt: Receipt;
    try {
      receipt = await runU2AccessCommand(
        this.access,
        context,
        'acceptMembershipInvitation',
        { kind: 'RECORD', recordRef: input.invitationRef },
        safeInput,
        authorize,
        async (tx, requestId) => {
          const member = {
            ...(existing ?? {}),
            membershipId: existing?.membershipId ?? randomUUID(),
            enterpriseRef: ref('Enterprise', enterprise),
            accountRef: context.actorAccountRef,
            departmentRef: invitation.departmentRef,
            siteRef: invitation.siteRef,
            active: true,
            administrator: existing?.administrator ?? false,
            designationBasis: existing?.designationBasis ?? null,
            revision: Number(existing?.revision ?? 0) + 1,
          };
          await tx.put('EnterpriseMembership', member, existing ? Number(existing.revision) : null);
          const refs = [ref('EnterpriseMembership', member)];
          for (const roleRef of invitation.roleRefs as Ref[]) {
            const matches = await tx.list(
              'CustomerRoleGrant',
              {
                membershipRef: { id: member.membershipId },
                roleRef: { id: roleRef.id },
                revokedAt: null,
              },
              2,
            );
            requireCondition(
              matches.length === 0,
              409,
              'GRANT_EXISTS',
              '기존 역할 부여를 덮어쓰지 않습니다.',
            );
            const grant = {
              grantId: randomUUID(),
              membershipRef: ref('EnterpriseMembership', member),
              roleRef,
              effectiveFrom: this.now().toISOString(),
              revokedAt: null,
              grantedBy: (await tx.get(
                'EnterpriseMembership',
                (invitation.inviterMembershipRef as Ref).id,
              ))!.accountRef,
              revision: 1,
            };
            await tx.put('CustomerRoleGrant', grant);
            refs.push(ref('CustomerRoleGrant', grant));
          }
          const accepted = {
            ...invitation,
            state: 'ACCEPTED',
            acceptedAccountRef: context.actorAccountRef,
            acceptedMembershipRef: ref('EnterpriseMembership', member),
            revision: Number(invitation.revision) + 1,
          };
          await tx.put('MembershipInvitation', accepted, Number(invitation.revision));
          await tx.put(
            'EnrollmentAuthority',
            { ...authority, state: 'COMPLETED', revision: Number(authority.revision) + 1 },
            Number(authority.revision),
          );
          await this.tombstone(tx, invitation, 'CONSUMED');
          const fence = (await tx.get(
            'EnterpriseAccessFence',
            u2EnterpriseFenceId(String(enterprise.enterpriseId)),
          ))!;
          await tx.put(
            'EnterpriseAccessFence',
            {
              ...fence,
              accessRevision: Number(fence.accessRevision) + 1,
              revision: Number(fence.revision) + 1,
            },
            Number(fence.revision),
          );
          refs.push(ref('MembershipInvitation', accepted));
          await enqueueMinimumNotice(
            tx,
            context,
            requestId,
            ref('EnterpriseMembership', member),
            null,
            String(invitation.epoch),
            this.now(),
          );
          return {
            target: ref('EnterpriseMembership', member),
            refs,
            scope: {
              ...this.access.managementTarget(enterprise),
              departmentRef: member.departmentRef as Ref | null,
              siteRef: member.siteRef as Ref | null,
            },
            state: 'RESULT_RECORDED',
            before: ref('MembershipInvitation', invitation),
          };
        },
        this.now,
        identity,
      );
    } catch (error) {
      if (
        !(error instanceof OmsError) ||
        ![
          'RECONFIRMATION_REQUIRED',
          'INVITATION_ROLE_CHANGED',
          'MEMBERSHIP_POLICY',
          'MEMBERSHIP_ORGANISATION',
          'INVITER_INACTIVE',
          'INVITER_BINDING',
          'MANAGEMENT_TARGET',
          'MANAGEMENT_ROLE_SCOPE',
        ].includes(error.code)
      )
        throw error;
      receipt = await runU2AccessCommand(
        this.access,
        context,
        'acceptMembershipInvitation',
        { kind: 'RECORD', recordRef: input.invitationRef },
        safeInput,
        async (tx) => {
          const auth = await this.authorities.assert(context, 'INVITATION_ACCEPTANCE', tx),
            current = await a.lookup('MembershipInvitation', input.invitationRef.id, tx);
          requireCondition(
            (auth.invitationRef as Ref).id === input.invitationRef.id &&
              current?.revision === input.invitationRef.revision &&
              current.state === 'PENDING' &&
              this.verifier.matches(
                input.response,
                invitationBinding(current),
                String(current.tokenVerifier),
              ),
            409,
            'INVITATION_CHANGED',
            '원래 초대 상태를 대조하세요.',
          );
        },
        async (tx) => {
          const current = (await tx.get('MembershipInvitation', input.invitationRef.id))!,
            next = {
              ...current,
              state: 'RECONFIRMATION_REQUIRED',
              revision: Number(current.revision) + 1,
            };
          await tx.put('MembershipInvitation', next, Number(current.revision));
          await this.tombstone(tx, current, 'RECONFIRMATION_REQUIRED');
          return {
            target: ref('MembershipInvitation', next),
            refs: [ref('MembershipInvitation', next)],
            before: ref('MembershipInvitation', current),
            scope: null,
            state: 'REVIEW_REQUIRED',
          };
        },
        this.now,
        identity,
      );
    }
    const originalVault = await store.readRevision(
      'MembershipInvitation',
      input.invitationRef.id,
      Number(source.tokenGeneration),
    );
    requireCondition(
      originalVault,
      503,
      'INVITATION_VAULT_SOURCE',
      '원래 파기 자료 원본을 확인하세요.',
    );
    await this.vault.destroy(this.vaultBinding(originalVault), this.permit(originalVault));
    return receipt;
  }
}
