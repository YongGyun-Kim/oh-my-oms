import type { Receipt, Ref, ServiceContext } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import { randomUUID } from 'node:crypto';
import { EnterpriseInternal, InitialAdministratorInput } from './enterprise-access-state.js';
import { enqueueMinimumNotice } from './pending-notification.js';
import { ref } from './references.js';
export async function designate(
  host: EnterpriseInternal,
  context: ServiceContext,
  enterpriseRef: Ref,
  input: InitialAdministratorInput,
): Promise<Receipt> {
  host.store.schema.validateUri(
    'urn:oms:contract:foundation:1#/$defs/DesignateInitialAdministratorInput',
    input,
  );
  requireCondition(
    enterpriseRef.owner === 'EnterpriseAccess' && enterpriseRef.entity === 'Enterprise',
    400,
    'ENTERPRISE_TARGET',
    '기업 대상이 필요합니다.',
  );
  await host.authorization.requireStaff(context, 'enterprise.initial-administrator.designate');
  const observedLinks = await host.store.list('VerifiedPersonLink', {
    equals: { accountRefs: [{ id: input.accountRef.id }] },
    limit: 2,
  });
  requireCondition(
    observedLinks.length === 1 && input.basisRefs.length > 0,
    409,
    'PERSON_LINK_REQUIRED',
    '확인된 동일인 연결과 지정 근거가 필요합니다.',
  );
  const observedLink = await host.authorization.lookup(
    'VerifiedPersonLink',
    String(observedLinks[0]!.personLinkId),
  );
  requireCondition(
    observedLink && (observedLink.evidenceRefs as Ref[]).length > 0,
    409,
    'ADMINISTRATOR_CONFIRMATION_REQUIRED',
    '동일인 확인 근거가 필요합니다.',
  );
  const check = await host.verification.administrator(
    enterpriseRef,
    input.accountRef,
    ref('VerifiedPersonLink', observedLink),
    input.basisRefs,
  );
  return host.commands.run(
    context,
    'EnterpriseAccess',
    'designateInitialAdministrator',
    { kind: 'ENTERPRISE', enterpriseRef },
    input,
    'AccessHistory',
    (transaction) =>
      host.authorization.requireStaff(
        context,
        'enterprise.initial-administrator.designate',
        transaction,
      ),
    async (transaction, requestId) => {
      const enterprise = await transaction.get('Enterprise', enterpriseRef.id);
      requireCondition(
        enterprise?.approvalState === 'APPROVED' && enterprise.usageEnabled,
        403,
        'ENTERPRISE_NOT_ENABLED',
        '승인된 기업이 필요합니다.',
      );
      requireCondition(
        input.meta.expectedRevision === enterprise.revision &&
          enterpriseRef.revision === enterprise.revision,
        409,
        'STALE_REVISION',
        '기업 개정을 다시 확인하세요.',
      );
      requireCondition(
        enterprise.administratorCount === 0,
        409,
        'INITIAL_ADMINISTRATOR_EXISTS',
        '최초 관리자 지정 상태를 확인하세요.',
      );
      const account = await host.authorization.lookup('Account', input.accountRef.id, transaction);
      requireCondition(
        account?.active &&
          input.accountRef.owner === 'IdentityRecovery' &&
          input.accountRef.entity === 'Account' &&
          input.accountRef.revision === account.revision,
        400,
        'CANDIDATE_ACCOUNT',
        '현재 활성 후보 계정이 필요합니다.',
      );
      const personLinks = await host.store.list('VerifiedPersonLink', {
        equals: { accountRefs: [{ id: input.accountRef.id }] },
        limit: 2,
      });
      requireCondition(
        personLinks.length === 1,
        409,
        'PERSON_LINK_REQUIRED',
        '확인된 하나의 동일인 연결이 필요합니다.',
      );
      const link = await host.authorization.lookup(
        'VerifiedPersonLink',
        String(personLinks[0]!.personLinkId),
        transaction,
      );
      requireCondition(
        link && (link.evidenceRefs as Ref[]).length > 0 && input.basisRefs.length > 0,
        409,
        'ADMINISTRATOR_CONFIRMATION_REQUIRED',
        '동일인과 기업 관계 확인 근거가 필요합니다.',
      );
      requireCondition(
        link.personLinkId === observedLink.personLinkId && link.revision === observedLink.revision,
        409,
        'PERSON_LINK_CHANGED',
        '동일인 확인 개정이 변경되었습니다.',
      );
      requireCondition(
        check.knowledge === 'KNOWN' &&
          check.personConfirmed &&
          check.enterpriseRelationshipConfirmed &&
          check.mandateConfirmed &&
          check.evidenceRefs.length > 0,
        409,
        'ADMINISTRATOR_CONFIRMATION_REQUIRED',
        '후보의 신원·기업 관계·지정 위임을 확인해야 합니다.',
      );
      for (const scope of input.actionScopes) {
        await host.validateScope(scope, enterpriseRef.id, transaction);
        requireCondition(
          ['organisation.manage', 'user.manage', 'role.manage'].includes(scope.action),
          400,
          'INITIAL_MANAGEMENT_ONLY',
          '최초 역할은 명시적 기업 관리 행위만 허용합니다.',
        );
      }
      const basis = {
        actorAccountRef: context.actorAccountRef,
        verifiedPersonRef: ref('VerifiedPersonLink', link),
        evidenceRefs: check.evidenceRefs,
        targetRevision: enterprise.revision,
        decision: 'DESIGNATE',
        knowledge: 'KNOWN',
        decidedAt: host.now().toISOString(),
        reason: input.meta.reason,
      };
      const membership = {
        membershipId: randomUUID(),
        accountRef: ref('Account', account),
        enterpriseRef: ref('Enterprise', enterprise),
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: true,
        designationBasis: basis,
        revision: 1,
      };
      await transaction.put('EnterpriseMembership', membership);
      const refs = [ref('EnterpriseMembership', membership)];
      refs.push(
        ...(await host.createRole(
          transaction,
          enterpriseRef,
          ref('EnterpriseMembership', membership),
          input.label,
          input.actionScopes,
          context.actorAccountRef!,
        )),
      );
      const updated = {
        ...enterprise,
        administratorCount: 1,
        revision: Number(enterprise.revision) + 1,
      };
      await transaction.put('Enterprise', updated, Number(enterprise.revision));
      const application = await transaction.get(
        'EnterpriseApplication',
        (enterprise.applicationRef as Ref).id,
      );
      requireCondition(
        application,
        503,
        'APPLICATION_NOT_FOUND',
        '기업 신청 원본을 확인해야 합니다.',
      );
      await transaction.put(
        'EnterpriseApplication',
        {
          ...application,
          initialAdministratorRef: ref('EnterpriseMembership', membership),
          revision: Number(application.revision) + 1,
        },
        Number(application.revision),
      );
      await enqueueMinimumNotice(
        transaction,
        context,
        requestId,
        ref('EnterpriseMembership', membership),
        null,
        await host.store.currentEpoch(),
        host.now(),
      );
      return {
        target: ref('Enterprise', updated),
        refs: [ref('Enterprise', updated), ...refs],
        scope: null,
        state: 'RESULT_RECORDED',
        before: ref('Enterprise', enterprise),
      };
    },
  );
}
