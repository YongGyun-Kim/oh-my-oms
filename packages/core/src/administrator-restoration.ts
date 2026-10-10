import { randomUUID } from 'node:crypto';
import { requireCondition, OmsError, canonicalJson } from '@oms/contracts';
import type { CommandMeta, Ref, ServiceContext, Receipt } from '@oms/contracts';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import type { EnterpriseAccess } from './enterprise-access.js';
import { ref } from './references.js';
import {
  runU2AccessCommand,
  bumpEnterpriseAccessFence,
  validateMembershipOrganisation,
} from './enterprise-memberships.js';
import { currentRolePredicates } from './enterprise-role-revisions.js';
import { MANAGEMENT_ACTIONS } from './scope-v2.js';
import { enqueueMinimumNotice } from './pending-notification.js';
export interface RestoreAdministratorInput {
  meta: CommandMeta;
  enterpriseRef: Ref;
  membershipRef: Ref;
  delegationRef: Ref;
  personVerificationRef: Ref;
  roleRefs: Ref[];
}
export function administratorEvidenceCurrent(
  evidence: ModelData,
  policy: ModelData,
  enterpriseRef: Ref,
  accountRef: Ref,
  now: Date,
): boolean {
  return (
    evidence.state === 'CONFIRMED' &&
    evidence.purpose === 'ADMINISTRATOR_RESTORATION' &&
    (evidence.enterpriseRef as Ref | null)?.id === enterpriseRef.id &&
    (evidence.accountRef as Ref).id === accountRef.id &&
    evidence.synthetic === true &&
    policy.synthetic === true &&
    policy.active === true &&
    policy.purpose === 'ADMINISTRATOR_RESTORATION' &&
    policy.revision === (evidence.policyRef as Ref).revision &&
    (policy.requiredSourceKinds as string[]).length > 0 &&
    (policy.requiredSourceKinds as string[]).every((kind) => kind === evidence.sourceKind) &&
    now.getTime() < Date.parse(String(evidence.expiresAt)) &&
    now.getTime() < Date.parse(String(policy.expiresAt))
  );
}
export interface RestorationHoldInput {
  meta: CommandMeta;
  sourceRef: Ref;
  basisRef: Ref | null;
  reason: string;
}
export class AdministratorRestoration {
  constructor(
    private readonly access: EnterpriseAccess,
    private readonly now: () => Date,
  ) {}
  async restore(context: ServiceContext, input: RestoreAdministratorInput): Promise<Receipt> {
    const source = input.meta.evidenceRefs.find(
      (value) => value.owner === 'EnterpriseAccess' && value.entity === 'AdministratorRestoration',
    );
    return this.run(
      context,
      input,
      source
        ? {
            input: {
              meta: { ...input.meta, expectedRevision: source.revision },
              sourceRef: source,
              basisRef: input.delegationRef,
              reason: input.meta.reason,
            },
            mode: 'apply',
          }
        : undefined,
    );
  }
  resume(context: ServiceContext, input: RestorationHoldInput): Promise<Receipt> {
    return this.control(context, input, 'resume');
  }
  async close(context: ServiceContext, input: RestorationHoldInput): Promise<Receipt> {
    this.access.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/HoldInput',
      input,
    );
    let source: ModelData;
    const authorize = async (tx?: ProtectedTransaction) => {
      await this.access.authorization.requireStaff(context, 'enterprise.administrator.restore', tx);
      source = (await this.access.authorization.lookup(
        'AdministratorRestoration',
        input.sourceRef.id,
        tx,
      ))!;
      requireCondition(
        input.sourceRef.owner === 'EnterpriseAccess' &&
          input.sourceRef.entity === 'AdministratorRestoration' &&
          source?.revision === input.sourceRef.revision &&
          source.revision === input.meta.expectedRevision &&
          ['REQUESTED', 'HOLD', 'VERIFIED'].includes(String(source.state)) &&
          source.epoch === (await this.access.store.currentEpoch()) &&
          input.meta.evidenceRefs.length > 0,
        409,
        'RESTORATION_CONTROL_SOURCE',
        '현재 원래 재지정 원본/종료 근거가 필요합니다.',
      );
      await this.access.authorization.lookup('Enterprise', (source.enterpriseRef as Ref).id, tx);
      await this.access.authorization.lookup(
        'EnterpriseMembership',
        (source.membershipRef as Ref).id,
        tx,
      );
    };
    return runU2AccessCommand(
      this.access,
      context,
      'closeAdministratorRestoration',
      { kind: 'RECORD', recordRef: input.sourceRef },
      input,
      authorize,
      async (tx) => {
        const next = {
          ...source,
          state: 'CLOSED',
          reason: input.reason,
          holdReason: 'CLOSED_WITH_ORIGINAL_REFERENCES',
          revision: Number(source.revision) + 1,
        };
        await tx.put('AdministratorRestoration', next, Number(source.revision));
        return {
          target: ref('AdministratorRestoration', next),
          refs: [ref('AdministratorRestoration', next)],
          scope: null,
          state: 'RESULT_RECORDED',
          before: ref('AdministratorRestoration', source),
        };
      },
      this.now,
    );
  }
  private async control(
    context: ServiceContext,
    input: RestorationHoldInput,
    mode: 'resume' | 'apply',
  ): Promise<Receipt> {
    const a = this.access.authorization;
    this.access.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/HoldInput',
      input,
    );
    await a.requireStaff(context, 'enterprise.administrator.restore');
    requireCondition(
      input.sourceRef.owner === 'EnterpriseAccess' &&
        input.sourceRef.entity === 'AdministratorRestoration',
      400,
      'RESTORATION_CONTROL_TARGET',
      '원래 재지정만 재검토합니다.',
    );
    const source = await a.lookup('AdministratorRestoration', input.sourceRef.id);
    requireCondition(source, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    const enterprise = await a.lookup('Enterprise', (source.enterpriseRef as Ref).id),
      member = await a.lookup('EnterpriseMembership', (source.membershipRef as Ref).id),
      personRef = input.meta.evidenceRefs.find(
        (value) => value.owner === 'IdentityRecovery' && value.entity === 'PersonVerification',
      );
    requireCondition(
      enterprise && member && input.basisRef?.entity === 'VerificationEvidence' && personRef,
      403,
      'RESTORATION_REVIEW_BASIS',
      '새 현재 위임/동일인 원본을 명시하세요.',
    );
    const desired: RestoreAdministratorInput = {
      meta: { ...input.meta, expectedRevision: Number(member.revision) },
      enterpriseRef: ref('Enterprise', enterprise),
      membershipRef: ref('EnterpriseMembership', member),
      delegationRef: input.basisRef,
      personVerificationRef: personRef,
      roleRefs: source.roleRefs as Ref[],
    };
    return this.run(context, desired, { input, mode });
  }
  private async run(
    context: ServiceContext,
    input: RestoreAdministratorInput,
    control?: { input: RestorationHoldInput; mode: 'resume' | 'apply' },
  ): Promise<Receipt> {
    const { store, authorization: a } = this.access;
    store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/RestoreInput', input);
    let enterprise: ModelData,
      member: ModelData,
      evidence: ModelData,
      person: ModelData,
      confirmed = false;
    const authorize = async (tx?: ProtectedTransaction) => {
      await a.requireStaff(context, 'enterprise.administrator.restore', tx);
      enterprise = (await a.lookup('Enterprise', input.enterpriseRef.id, tx))!;
      member = (await a.lookup('EnterpriseMembership', input.membershipRef.id, tx))!;
      requireCondition(
        enterprise?.approvalState === 'APPROVED' &&
          enterprise.usageEnabled &&
          enterprise.revision === input.enterpriseRef.revision &&
          member &&
          (member.enterpriseRef as Ref).id === input.enterpriseRef.id &&
          member.revision === input.membershipRef.revision &&
          member.revision === input.meta.expectedRevision,
        409,
        'RESTORATION_TARGET',
        '현재 기업/지정 대상 소속 개정이 필요합니다.',
      );
      requireCondition(
        input.delegationRef.owner === 'IdentityRecovery' &&
          input.delegationRef.entity === 'VerificationEvidence',
        400,
        'DELEGATION_SOURCE',
        '명시 위임 근거 원본이 필요합니다.',
      );
      evidence = (await a.lookup('VerificationEvidence', input.delegationRef.id, tx))!;
      person = (await a.lookup('PersonVerification', input.personVerificationRef.id, tx))!;
      requireCondition(
        evidence?.revision === input.delegationRef.revision &&
          person?.revision === input.personVerificationRef.revision,
        409,
        'RESTORATION_SOURCE',
        '현재 위임/동일인 근거 개정이 필요합니다.',
      );
      const account = await a.lookup('Account', (member.accountRef as Ref).id, tx),
        policy = await a.lookup('VerificationPolicy', (evidence.policyRef as Ref).id, tx),
        personPolicy = await a.lookup('VerificationPolicy', (person.policyRef as Ref).id, tx),
        link = await a.lookup('VerifiedPersonLink', (person.personLinkRef as Ref).id, tx),
        binding = await a.lookup('ProviderBinding', (evidence.bindingRef as Ref).id, tx);
      confirmed = !!(
        account?.active &&
        binding?.active &&
        binding.audience === 'CUSTOMER' &&
        (binding.accountRef as Ref).id === (member.accountRef as Ref).id &&
        policy &&
        administratorEvidenceCurrent(
          evidence,
          policy,
          input.enterpriseRef,
          member.accountRef as Ref,
          this.now(),
        ) &&
        person.state === 'CONFIRMED' &&
        this.now().getTime() < Date.parse(String(person.expiresAt)) &&
        personPolicy?.active &&
        personPolicy.synthetic === true &&
        personPolicy.purpose === 'SAME_PERSON' &&
        personPolicy.revision === (person.policyRef as Ref).revision &&
        this.now().getTime() < Date.parse(String(personPolicy.expiresAt)) &&
        link &&
        link.revision === (person.personLinkRef as Ref).revision &&
        (link.accountRefs as Ref[]).some((source) => source.id === (member.accountRef as Ref).id) &&
        this.access.verification.kind === 'SYNTHETIC'
      );
      if (confirmed) {
        const required = new Set(personPolicy!.requiredSourceKinds as string[]),
          observed = new Set<string>();
        for (const source of person.evidenceRefs as Ref[]) {
          const record = await a.lookup('VerificationEvidence', source.id, tx);
          if (
            !record ||
            record.revision !== source.revision ||
            record.state !== 'CONFIRMED' ||
            record.synthetic !== true ||
            (record.policyRef as Ref).id !== personPolicy!.policyId ||
            (record.accountRef as Ref).id !== (member.accountRef as Ref).id ||
            this.now().getTime() >= Date.parse(String(record.expiresAt))
          )
            confirmed = false;
          else observed.add(String(record.sourceKind));
        }
        if (required.size === 0 || ![...required].every((kind) => observed.has(kind)))
          confirmed = false;
      }
      if (confirmed) {
        try {
          await a.requireStaffSource(
            evidence.authorityRef as Ref,
            'enterprise.administrator.restore',
            tx,
          );
          await a.requireStaffSource(
            person.verifiedBy as Ref,
            'enterprise.administrator.restore',
            tx,
          );
          await validateMembershipOrganisation(
            this.access,
            enterprise,
            member.departmentRef as Ref | null,
            member.siteRef as Ref | null,
            true,
            tx,
          );
        } catch (error) {
          if (
            error instanceof OmsError &&
            ['ISSUER_AUTHORITY', 'MEMBERSHIP_POLICY', 'MEMBERSHIP_ORGANISATION'].includes(
              error.code,
            )
          )
            confirmed = false;
          else throw error;
        }
      }
      if (control) {
        const source = await a.lookup('AdministratorRestoration', control.input.sourceRef.id, tx);
        requireCondition(
          source &&
            source.revision === control.input.sourceRef.revision &&
            source.revision === control.input.meta.expectedRevision &&
            source.state === (control.mode === 'resume' ? 'HOLD' : 'VERIFIED') &&
            (source.accountRef as Ref).id === (member.accountRef as Ref).id &&
            (source.enterpriseRef as Ref).id === enterprise.enterpriseId &&
            (source.membershipRef as Ref).id === member.membershipId &&
            source.epoch === (await store.currentEpoch()) &&
            canonicalJson(source.roleRefs) === canonicalJson(input.roleRefs),
          409,
          'RESTORATION_CONTROL_SOURCE',
          '현재 원래 보류 개정/대상만 재검토합니다.',
        );
      }
      for (const source of input.roleRefs) {
        requireCondition(
          source.owner === 'EnterpriseAccess' && source.entity === 'CustomerRole',
          400,
          'RESTORATION_ROLE',
          '명시 고객 관리 역할이 필요합니다.',
        );
        const role = await a.lookup('CustomerRole', source.id, tx);
        requireCondition(
          role &&
            role.revision === source.revision &&
            (role.enterpriseRef as Ref).id === enterprise.enterpriseId,
          409,
          'RESTORATION_ROLE',
          '현재 지정 역할 개정이 필요합니다.',
        );
        const state = await a.currentRoleState('CustomerRole', source.id, tx),
          predicates = await currentRolePredicates(this.access, role, tx);
        requireCondition(
          state?.active !== false &&
            predicates.length > 0 &&
            predicates.every((scope) => MANAGEMENT_ACTIONS.includes(scope.action)),
          400,
          'RESTORATION_MANAGEMENT_ONLY',
          '재지정은 명시 관리 행위만 부여하며 거래 권한을 확대하지 않습니다.',
        );
      }
      if (confirmed) {
        const decision = await this.access.verification.administrator(
          ref('Enterprise', enterprise),
          member.accountRef as Ref,
          ref('VerifiedPersonLink', link!),
          [input.delegationRef, input.personVerificationRef, ...input.meta.evidenceRefs],
        );
        confirmed =
          decision.knowledge === 'KNOWN' &&
          decision.personConfirmed &&
          decision.enterpriseRelationshipConfirmed &&
          decision.mandateConfirmed &&
          decision.evidenceRefs.length > 0;
      }
    };
    return runU2AccessCommand(
      this.access,
      context,
      control
        ? control.mode === 'resume'
          ? 'resumeAdministratorRestoration'
          : 'restoreAdministrator'
        : 'restoreAdministrator',
      control?.mode === 'resume'
        ? { kind: 'RECORD', recordRef: control.input.sourceRef }
        : { kind: 'ENTERPRISE', enterpriseRef: input.enterpriseRef },
      control?.mode === 'resume' ? control.input : input,
      authorize,
      async (tx, requestId) => {
        const original = control
          ? (await a.lookup('AdministratorRestoration', control.input.sourceRef.id, tx))!
          : null;
        if (control?.mode === 'resume') {
          requireCondition(
            confirmed,
            403,
            'RESTORATION_REVIEW_UNCONFIRMED',
            '새 현재 위임/동일인 근거를 모두 확인해야 합니다.',
          );
          const next = {
            ...original!,
            state: 'VERIFIED',
            delegationRef: input.delegationRef,
            personVerificationRef: input.personVerificationRef,
            enterpriseRef: input.enterpriseRef,
            membershipRef: input.membershipRef,
            issuerRef: context.actorAccountRef,
            reason: control.input.reason,
            holdReason: 'REVIEWED_AWAITING_CURRENT_APPLY',
            revision: Number(original!.revision) + 1,
          };
          await tx.put('AdministratorRestoration', next, Number(original!.revision));
          return {
            target: ref('AdministratorRestoration', next),
            refs: [ref('AdministratorRestoration', next)],
            scope: null,
            state: 'REVIEW_REQUIRED',
            before: ref('AdministratorRestoration', original!),
          };
        }
        if (control)
          requireCondition(
            confirmed && this.now().getTime() < Date.parse(String(original!.deadlineAt)),
            403,
            'RESTORATION_APPLY_UNCONFIRMED',
            '원래 기한 안에서 현재 위임/동일인 근거를 다시 확인하세요.',
          );
        const restoration: ModelData = {
          restorationId: original?.restorationId ?? randomUUID(),
          revision: original ? Number(original.revision) + 1 : 1,
          enterpriseRef: ref('Enterprise', enterprise),
          membershipRef: ref('EnterpriseMembership', member),
          accountRef: member.accountRef,
          delegationRef: input.delegationRef,
          personVerificationRef: input.personVerificationRef,
          issuerRef: context.actorAccountRef,
          roleRefs: input.roleRefs,
          state: confirmed ? 'APPLIED' : 'HOLD',
          holdReason: confirmed ? 'RESOLVED' : 'DELEGATION_OR_PERSON_UNCONFIRMED',
          reason: input.meta.reason,
          deadlineAt: original?.deadlineAt ?? new Date(this.now().getTime() + 300000).toISOString(),
          epoch: await store.currentEpoch(),
        };
        await tx.put(
          'AdministratorRestoration',
          restoration,
          original ? Number(original.revision) : undefined,
        );
        const refs = [ref('AdministratorRestoration', restoration)];
        if (confirmed) {
          const next = {
            ...member,
            active: true,
            administrator: true,
            designationBasis: {
              actorAccountRef: context.actorAccountRef,
              verifiedPersonRef: person.personLinkRef,
              evidenceRefs: [input.delegationRef, input.personVerificationRef],
              targetRevision: enterprise.revision,
              decision: 'DESIGNATE',
              knowledge: 'KNOWN',
              decidedAt: this.now().toISOString(),
              reason: input.meta.reason,
            },
            revision: Number(member.revision) + 1,
          };
          await tx.put('EnterpriseMembership', next, Number(member.revision));
          for (const roleRef of input.roleRefs) {
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
              matches.length <= 1,
              503,
              'GRANT_CONFLICT',
              '현재 원래 관리 부여를 대조하세요.',
            );
            if (matches[0]) {
              refs.push(ref('CustomerRoleGrant', matches[0]));
              continue;
            }
            const grant = {
              grantId: randomUUID(),
              membershipRef: ref('EnterpriseMembership', next),
              roleRef,
              effectiveFrom: this.now().toISOString(),
              revokedAt: null,
              grantedBy: context.actorAccountRef,
              revision: 1,
            };
            await tx.put('CustomerRoleGrant', grant);
            refs.push(ref('CustomerRoleGrant', grant));
          }
          const nextEnterprise = {
            ...enterprise,
            administratorCount:
              Number(enterprise.administratorCount) +
              (member.active && member.administrator ? 0 : 1),
            revision: Number(enterprise.revision) + 1,
          };
          await tx.put('Enterprise', nextEnterprise, Number(enterprise.revision));
          await bumpEnterpriseAccessFence(this.access, tx, nextEnterprise);
          await enqueueMinimumNotice(
            tx,
            context,
            requestId,
            ref('EnterpriseMembership', next),
            null,
            String(restoration.epoch),
            this.now(),
          );
          refs.push(ref('EnterpriseMembership', next), ref('Enterprise', nextEnterprise));
        }
        return {
          target: ref('AdministratorRestoration', restoration),
          refs,
          scope: this.access.managementTarget(enterprise),
          state: confirmed ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED',
          before: ref('EnterpriseMembership', member),
        };
      },
      this.now,
    );
  }
}
