import { randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { CommandMeta, Receipt, Ref, ServiceContext } from '@oms/contracts';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import { EnterpriseAccess } from './enterprise-access.js';
import { ref } from './references.js';
import type { OrderingPolicy } from './scopes.js';
import {
  currentManagementScopes,
  bumpEnterpriseAccessFence,
  runU2AccessCommand,
  readOwnAccessReplay,
  validateMembershipOrganisation,
} from './enterprise-memberships.js';
import { scopeV2Includes, requireManagedChange } from './scope-v2.js';
import { u2EnterpriseFenceId } from '@oms/persistence';
export interface OrganisationInput {
  meta: CommandMeta;
  entityKind: 'DEPARTMENT' | 'BUSINESS_SITE';
  label: string;
  active: boolean;
  changeKind: 'CREATE' | 'UPDATE';
  organisationRef: Ref | null;
}
export class EnterpriseOrganisation {
  constructor(
    readonly access: EnterpriseAccess,
    private readonly now: () => Date,
  ) {}
  async membership(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: {
      meta: CommandMeta;
      accountRef: Ref;
      departmentRef: Ref | null;
      siteRef: Ref | null;
      active: boolean;
      administrator: boolean;
    },
  ): Promise<Receipt> {
    const { store, authorization } = this.access;
    store.schema.validate('MembershipInput', input);
    const replay = await readOwnAccessReplay(
      this.access,
      context,
      'upsertMembership',
      { kind: 'ENTERPRISE', enterpriseRef },
      input,
    );
    if (replay) return replay;
    await authorization.relation(context, enterpriseRef.id);
    const original = await store.currentProtected('Enterprise', enterpriseRef.id);
    requireCondition(original, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    const target = {
      ...this.access.managementTarget(original),
      departmentRef: input.departmentRef,
      siteRef: input.siteRef,
    };
    const authorize = async (transaction?: ProtectedTransaction) => {
      const current = await authorization.lookup('Enterprise', enterpriseRef.id, transaction);
      requireCondition(
        current?.usageEnabled && current.revision === enterpriseRef.revision,
        409,
        'STALE_REVISION',
        '기업 조직 개정을 다시 확인하세요.',
      );
      const scopes = await currentManagementScopes(this.access, context, current, transaction);
      const matches = transaction
        ? await transaction.list(
            'EnterpriseMembership',
            { enterpriseRef: { id: enterpriseRef.id }, accountRef: { id: input.accountRef.id } },
            2,
          )
        : await store.list('EnterpriseMembership', {
            equals: {
              enterpriseRef: { id: enterpriseRef.id },
              accountRef: { id: input.accountRef.id },
            },
            limit: 2,
          });
      requireCondition(matches.length <= 1, 409, 'MEMBERSHIP_CONFLICT', '현재 소속을 대조하세요.');
      if (matches[0]) {
        const previous = matches[0],
          origin = await store.readRevision(
            'Enterprise',
            (previous.enterpriseRef as Ref).id,
            (previous.enterpriseRef as Ref).revision,
          );
        requireCondition(origin, 503, 'MEMBERSHIP_ORIGINAL_POLICY', '원래 소속 정책이 필요합니다.');
        const before = {
          ...target,
          departmentRef: previous.departmentRef as Ref | null,
          siteRef: previous.siteRef as Ref | null,
        };
        requireCondition(
          scopes.some((scope) =>
            scopeV2Includes(
              scope,
              'user.manage',
              before,
              origin.orderingContextPolicy as OrderingPolicy,
              'MANAGEMENT',
            ),
          ),
          403,
          'MANAGEMENT_TARGET',
          '변경 전 현재 관리 범위가 필요합니다.',
        );
      }
      requireManagedChange(
        scopes,
        'user.manage',
        null,
        target,
        current.orderingContextPolicy as OrderingPolicy,
      );
      await validateMembershipOrganisation(
        this.access,
        current,
        input.departmentRef,
        input.siteRef,
        input.active,
        transaction,
      );
    };
    await authorize();
    const observed = await store.list('EnterpriseMembership', {
      equals: { enterpriseRef: { id: enterpriseRef.id }, accountRef: { id: input.accountRef.id } },
      limit: 2,
    });
    requireCondition(
      observed.length <= 1,
      409,
      'MEMBERSHIP_CONFLICT',
      '원래 소속을 대조해야 합니다.',
    );
    let link: ModelData | null = null;
    let basis: ModelData | null = null;
    if (input.active) {
      const links = await store.list('VerifiedPersonLink', {
        equals: { accountRefs: [{ id: input.accountRef.id }] },
        limit: 2,
      });
      requireCondition(
        links.length === 1 && input.meta.evidenceRefs.length > 0,
        409,
        'MEMBERSHIP_CONFIRMATION_REQUIRED',
        '계정·기업 관계 확인 근거가 필요합니다.',
      );
      link = await store.currentProtected('VerifiedPersonLink', String(links[0]!.personLinkId));
      requireCondition(link, 409, 'MEMBERSHIP_CONFIRMATION_REQUIRED', '동일인 확인이 필요합니다.');
      const check = await this.access.verification.administrator(
        enterpriseRef,
        input.accountRef,
        ref('VerifiedPersonLink', link),
        input.meta.evidenceRefs,
      );
      requireCondition(
        check.knowledge === 'KNOWN' &&
          check.personConfirmed &&
          check.enterpriseRelationshipConfirmed &&
          (!input.administrator || check.mandateConfirmed) &&
          check.evidenceRefs.length > 0,
        409,
        'MEMBERSHIP_CONFIRMATION_REQUIRED',
        '소속 또는 관리자 지정의 확인 근거가 필요합니다.',
      );
      basis = {
        actorAccountRef: context.actorAccountRef,
        verifiedPersonRef: ref('VerifiedPersonLink', link),
        evidenceRefs: check.evidenceRefs,
        targetRevision: original.revision,
        decision: 'MEMBERSHIP_CHANGE',
        knowledge: 'KNOWN',
        decidedAt: this.now().toISOString(),
        reason: input.meta.reason,
      };
    }
    return runU2AccessCommand(
      this.access,
      context,
      'upsertMembership',
      { kind: 'ENTERPRISE', enterpriseRef },
      input,
      authorize,
      async (transaction) => {
        const enterprise = await transaction.get('Enterprise', enterpriseRef.id);
        requireCondition(
          enterprise && enterprise.revision === enterpriseRef.revision,
          409,
          'STALE_REVISION',
          '기업 조직 개정을 다시 확인하세요.',
        );
        const matches = await transaction.list(
          'EnterpriseMembership',
          { enterpriseRef: { id: enterpriseRef.id }, accountRef: { id: input.accountRef.id } },
          2,
        );
        requireCondition(
          matches.length <= 1,
          409,
          'MEMBERSHIP_CONFLICT',
          '원래 소속을 대조해야 합니다.',
        );
        const previous = matches[0];
        requireCondition(
          previous
            ? previous.revision === input.meta.expectedRevision
            : input.meta.expectedRevision === null && input.active,
          409,
          'STALE_MEMBERSHIP',
          '원래 소속 개정을 확인하세요.',
        );
        const account = await authorization.lookup('Account', input.accountRef.id, transaction);
        requireCondition(
          account &&
            input.accountRef.owner === 'IdentityRecovery' &&
            input.accountRef.entity === 'Account' &&
            input.accountRef.revision === account.revision &&
            (!input.active || account.active),
          400,
          'MEMBERSHIP_ACCOUNT',
          '현재 계정 원본을 확인하세요.',
        );
        if (input.active) {
          const bindings = await store.list('ProviderBinding', {
            equals: { accountRef: { id: input.accountRef.id }, audience: 'CUSTOMER', active: true },
            limit: 2,
          });
          requireCondition(
            bindings.length === 1,
            400,
            'MEMBERSHIP_CUSTOMER_IDENTITY',
            '확인된 고객 신원 연결이 필요합니다.',
          );
          const binding = await authorization.lookup(
            'ProviderBinding',
            String(bindings[0]!.bindingId),
            transaction,
          );
          requireCondition(
            binding?.active && binding.audience === 'CUSTOMER',
            400,
            'MEMBERSHIP_CUSTOMER_IDENTITY',
            '현재 고객 신원 연결이 필요합니다.',
          );
          const currentLink = await authorization.lookup(
            'VerifiedPersonLink',
            String(link!.personLinkId),
            transaction,
          );
          requireCondition(
            currentLink?.revision === link!.revision,
            409,
            'PERSON_LINK_CHANGED',
            '동일인 확인 개정을 다시 확인하세요.',
          );
        }
        for (const [model, value] of [
          ['Department', input.departmentRef],
          ['BusinessSite', input.siteRef],
        ] as const)
          if (value) {
            const organisation = await authorization.lookup(model, value.id, transaction);
            requireCondition(
              value.owner === 'EnterpriseAccess' &&
                value.entity === model &&
                organisation &&
                (organisation.enterpriseRef as Ref).id === enterpriseRef.id &&
                (!input.active || organisation.active) &&
                value.revision === organisation.revision,
              400,
              'MEMBERSHIP_ORGANISATION',
              '소속 조직의 기업/현재 개정을 확인하세요.',
            );
          }
        const record = {
          membershipId: previous?.membershipId ?? randomUUID(),
          accountRef: input.accountRef,
          enterpriseRef: ref('Enterprise', enterprise),
          departmentRef: input.departmentRef,
          siteRef: input.siteRef,
          active: input.active,
          administrator: input.administrator,
          designationBasis: basis ?? previous?.designationBasis ?? null,
          revision: Number(previous?.revision ?? 0) + 1,
        };
        await transaction.put(
          'EnterpriseMembership',
          record,
          previous ? Number(previous.revision) : null,
        );
        const count =
          Number(enterprise.administratorCount) -
          (previous?.active && previous.administrator ? 1 : 0) +
          (input.active && input.administrator ? 1 : 0);
        const updated = {
          ...enterprise,
          administratorCount: count,
          revision: Number(enterprise.revision) + 1,
        };
        await transaction.put('Enterprise', updated, Number(enterprise.revision));
        if (await transaction.get('EnterpriseAccessFence', u2EnterpriseFenceId(enterpriseRef.id)))
          await bumpEnterpriseAccessFence(this.access, transaction, updated);
        // A zero count is an explicit visible warning; it does not revoke another person's trading grants.
        return {
          target: ref('EnterpriseMembership', record),
          refs: [ref('EnterpriseMembership', record), ref('Enterprise', updated)],
          scope: target,
          state: 'RESULT_RECORDED',
          before: previous ? ref('EnterpriseMembership', previous) : null,
        };
      },
      this.now,
    );
  }
  async upsert(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: OrganisationInput,
  ): Promise<Receipt> {
    const { store, authorization } = this.access;
    store.schema.validate('OrganisationInput', input);
    const replay = await readOwnAccessReplay(
      this.access,
      context,
      'upsertOrganisation',
      { kind: 'ENTERPRISE', enterpriseRef },
      input,
    );
    if (replay) return replay;
    await authorization.relation(context, enterpriseRef.id);
    const original = await store.currentProtected('Enterprise', enterpriseRef.id);
    requireCondition(original, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    const model = input.entityKind === 'DEPARTMENT' ? 'Department' : 'BusinessSite',
      organisationId = input.organisationRef?.id ?? randomUUID();
    requireCondition(
      input.changeKind === 'CREATE'
        ? input.organisationRef === null
        : input.organisationRef?.owner === 'EnterpriseAccess' &&
            input.organisationRef.entity === model,
      400,
      'ORGANISATION_TARGET',
      '명시 조직 종류와 원래 대상이 필요합니다.',
    );
    const target = {
      ...this.access.managementTarget(original),
      departmentRef:
        model === 'Department'
          ? {
              owner: 'EnterpriseAccess',
              entity: model,
              id: organisationId,
              revision: input.organisationRef?.revision ?? 1,
            }
          : null,
      siteRef:
        model === 'BusinessSite'
          ? {
              owner: 'EnterpriseAccess',
              entity: model,
              id: organisationId,
              revision: input.organisationRef?.revision ?? 1,
            }
          : null,
    };
    const authorize = async (transaction?: ProtectedTransaction) => {
      const current = await authorization.lookup('Enterprise', enterpriseRef.id, transaction);
      requireCondition(
        current?.usageEnabled && current.revision === enterpriseRef.revision,
        409,
        'STALE_REVISION',
        '기업 조직 개정을 다시 확인하세요.',
      );
      const management = await currentManagementScopes(this.access, context, current, transaction);
      let before = null;
      if (input.changeKind === 'UPDATE') {
        const organisation = await authorization.lookup(model, organisationId, transaction);
        requireCondition(
          organisation &&
            (organisation.enterpriseRef as Ref).id === enterpriseRef.id &&
            organisation.revision === input.organisationRef!.revision &&
            organisation.revision === input.meta.expectedRevision,
          409,
          'STALE_ORGANISATION',
          '원래 조직 개정을 확인하세요.',
        );
        before = target;
      }
      requireManagedChange(
        management,
        'organisation.manage',
        before,
        target,
        current.orderingContextPolicy as OrderingPolicy,
      );
    };
    return runU2AccessCommand(
      this.access,
      context,
      'upsertOrganisation',
      { kind: 'ENTERPRISE', enterpriseRef },
      input,
      authorize,
      async (transaction) => {
        const enterprise = await transaction.get('Enterprise', enterpriseRef.id);
        requireCondition(
          enterprise && enterprise.revision === enterpriseRef.revision,
          409,
          'STALE_REVISION',
          '기업 조직 개정을 다시 확인하세요.',
        );
        const model = input.entityKind === 'DEPARTMENT' ? 'Department' : 'BusinessSite';
        const idField = model === 'Department' ? 'departmentId' : 'siteId';
        const previous = input.organisationRef
          ? await transaction.get(model, input.organisationRef.id)
          : null;
        requireCondition(
          input.changeKind === 'CREATE'
            ? input.meta.expectedRevision === null
            : previous &&
                (previous.enterpriseRef as Ref).id === enterpriseRef.id &&
                previous.revision === input.meta.expectedRevision &&
                input.organisationRef?.revision === previous.revision,
          409,
          'STALE_ORGANISATION',
          '원래 기업 조직 개정을 확인하세요.',
        );
        const record = {
          [idField]: organisationId,
          enterpriseRef: ref('Enterprise', enterprise),
          label: input.label,
          active: input.active,
          revision: Number(previous?.revision ?? 0) + 1,
        };
        await transaction.put(model, record, previous ? Number(previous.revision) : null);
        const updated = { ...enterprise, revision: Number(enterprise.revision) + 1 };
        await transaction.put('Enterprise', updated, Number(enterprise.revision));
        if (await transaction.get('EnterpriseAccessFence', u2EnterpriseFenceId(enterpriseRef.id)))
          await bumpEnterpriseAccessFence(this.access, transaction, updated);
        return {
          target: ref(model, record),
          refs: [ref(model, record), ref('Enterprise', updated)],
          scope: target,
          state: 'RESULT_RECORDED',
          before: previous ? ref(model, previous) : null,
        };
      },
      this.now,
    );
  }
}
