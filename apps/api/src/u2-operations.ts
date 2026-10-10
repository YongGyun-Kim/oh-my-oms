import { createHmac } from 'node:crypto';
import { declareU2Operations, requireCondition } from '@oms/contracts';
import type {
  InvocationTarget,
  OperationRegistry,
  ServiceContext,
  U2PurposeContext,
  U2PrivateOperatorContext,
} from '@oms/contracts';
import { U2AccessDirectory, VerifiedPerson } from '@oms/core';
import type { EnterpriseAccess, IdentityRecovery } from '@oms/core';
import type { ApiOwners } from './operations.js';
import { u2HttpCall } from './u2-authentication.js';
import type { U2Authentication } from './u2-authentication.js';

// 계약 검사 뒤에도 목적 권위는 원래 서버 객체로만 해석한다.
export function bindU2Operations(
  registry: OperationRegistry,
  owners: ApiOwners,
  bridge: U2Authentication,
  cookieKey: Buffer,
): void {
  declareU2Operations(registry);
  const directory = new U2AccessDirectory(
    owners.enterprise,
    createHmac('sha256', cookieKey).update('oms-u2-directory:1').digest(),
    owners.now,
  );
  const limitedView = async (value: unknown) => {
    const data = value as { authorityRef: Parameters<IdentityRecovery['authenticatePurpose']>[0] },
      source = await owners.store.currentProtected('EnrollmentAuthority', data.authorityRef.id);
    requireCondition(source, 503, 'PURPOSE_PRODUCER', '원래 보호 목적 source가 필요합니다.');
    return { ...data, ...(source.sourceRef ? { caseRef: source.sourceRef } : {}) };
  };
  const bind = <Input>(
    owner: string,
    name: string,
    handler: (context: ServiceContext, input: Input, target: InvocationTarget) => Promise<unknown>,
    purpose = false,
  ) =>
    registry.bind(owner, name, 1, (invocation) =>
      handler(
        purpose
          ? bridge.resolve(invocation.context as U2PurposeContext)
          : (invocation.context as ServiceContext),
        invocation.data as Input,
        invocation.target,
      ),
    );
  bind(
    'EnterpriseAccess',
    'readStaffRoles',
    (context, input: Parameters<U2AccessDirectory['staff']>[1]) => directory.staff(context, input),
  );
  bind(
    'EnterpriseAccess',
    'inviteMembership',
    owners.enterprise.issueMembershipInvitation.bind(owners.enterprise),
  );
  bind(
    'EnterpriseAccess',
    'acceptMembershipInvitation',
    owners.enterprise.acceptMembershipInvitation.bind(owners.enterprise),
    true,
  );
  bind(
    'EnterpriseAccess',
    'readOwnInvitation',
    (context, input: { sourceRef: Parameters<EnterpriseAccess['readOwnInvitation']>[1] }) =>
      owners.enterprise.readOwnInvitation(context, input.sourceRef),
    true,
  );
  bind(
    'EnterpriseAccess',
    'revokeMembershipInvitation',
    owners.enterprise.revokeMembershipInvitation.bind(owners.enterprise),
  );
  bind(
    'EnterpriseAccess',
    'resendMembershipInvitation',
    owners.enterprise.resendMembershipInvitation.bind(owners.enterprise),
  );
  for (const [name, kind] of [
    ['readMemberships', 'memberships'],
    ['readCustomerRoles', 'roles'],
  ] as const)
    bind(
      'EnterpriseAccess',
      name,
      (context, input: Parameters<U2AccessDirectory['read']>[2], target) => {
        requireCondition(
          target.kind === 'ENTERPRISE',
          400,
          'ENTERPRISE_TARGET',
          '기업 대상이 필요합니다.',
        );
        return directory.read(context, target.enterpriseRef, input, kind);
      },
    );
  bind(
    'EnterpriseAccess',
    'updateMembership',
    owners.enterprise.updateMembership.bind(owners.enterprise),
  );
  bind(
    'EnterpriseAccess',
    'reviseCustomerRole',
    owners.enterprise.reviseCustomerRole.bind(owners.enterprise),
  );
  bind(
    'EnterpriseAccess',
    'deactivateCustomerRole',
    owners.enterprise.deactivateCustomerRole.bind(owners.enterprise),
  );
  bind(
    'EnterpriseAccess',
    'reviseStaffRole',
    owners.enterprise.reviseStaffRole.bind(owners.enterprise),
  );
  bind(
    'EnterpriseAccess',
    'deactivateStaffRole',
    owners.enterprise.deactivateStaffRole.bind(owners.enterprise),
  );
  bind(
    'EnterpriseAccess',
    'restoreAdministrator',
    owners.enterprise.restoreAdministrator.bind(owners.enterprise),
  );
  bind(
    'EnterpriseAccess',
    'resumeAdministratorRestoration',
    owners.enterprise.resumeAdministratorRestoration.bind(owners.enterprise),
  );
  bind(
    'EnterpriseAccess',
    'closeAdministratorRestoration',
    owners.enterprise.closeAdministratorRestoration.bind(owners.enterprise),
  );
  registry.bind('IdentityRecovery', 'createPartyContext', 1, (invocation) =>
    owners.identity.createPartyContext(
      invocation.context as Parameters<IdentityRecovery['createPartyContext']>[0],
      invocation.data as Parameters<IdentityRecovery['createPartyContext']>[1],
      u2HttpCall.getStore()?.ingress,
    ),
  );
  bind(
    'IdentityRecovery',
    'verifyRecoveryParty',
    owners.identity.verifyRecoveryParty.bind(owners.identity),
  );
  bind('IdentityRecovery', 'issueHandoff', owners.identity.issueHandoff.bind(owners.identity));
  registry.bind('IdentityRecovery', 'claimHandoff', 1, async (invocation) => {
    const result = await owners.identity.claimHandoff(
      invocation.context as Parameters<IdentityRecovery['claimHandoff']>[0],
      invocation.data as Parameters<IdentityRecovery['claimHandoff']>[1],
      u2HttpCall.getStore()?.ingress,
    );
    const outcome = result.outcome as {
      authorityRef: Parameters<IdentityRecovery['authenticatePurpose']>[0];
      expiresAt: string;
    };
    const call = u2HttpCall.getStore();
    requireCondition(call, 503, 'PURPOSE_HOST_REQUIRED', '목적 응답 host가 필요합니다.');
    call.purposeResult = {
      version: 1,
      purpose: 'MFA_REENROLMENT',
      authorityRef: outcome.authorityRef,
      expiresAt: outcome.expiresAt,
      handle: result.handle,
    };
    return limitedView(result.outcome);
  });
  registry.bind('IdentityRecovery', 'reobserveHandoff', 1, async (invocation) => {
    const call = u2HttpCall.getStore();
    requireCondition(call, 503, 'PURPOSE_HOST_REQUIRED', '원래 결과 응답 host가 필요합니다.');
    const result = await owners.identity.reobserveHandoff(
        invocation.context as Parameters<IdentityRecovery['reobserveHandoff']>[0],
        invocation.data as Parameters<IdentityRecovery['reobserveHandoff']>[1],
        call.ingress,
      ),
      outcome = result.outcome as {
        authorityRef: Parameters<IdentityRecovery['authenticatePurpose']>[0];
        expiresAt: string;
      };
    call.purposeResult = {
      version: 1,
      purpose: 'MFA_REENROLMENT',
      authorityRef: outcome.authorityRef,
      expiresAt: outcome.expiresAt,
      handle: result.handle,
    };
    return limitedView(result.outcome);
  });
  bind(
    'IdentityRecovery',
    'readOwnClaimResult',
    (context, input: { sourceRef: Parameters<IdentityRecovery['readOwnClaimResult']>[1] }) =>
      owners.identity.readOwnClaimResult(context, input.sourceRef),
    true,
  );
  bind(
    'IdentityRecovery',
    'readRecoveryStatus',
    (context, input: { sourceRef: Parameters<IdentityRecovery['readRecoveryStatus']>[1] }) =>
      owners.identity.readRecoveryStatus(context, input.sourceRef),
    true,
  );
  bind(
    'IdentityRecovery',
    'completeRecovery',
    owners.identity.completeRecovery.bind(owners.identity),
    true,
  );
  bind(
    'IdentityRecovery',
    'replaceFirstFactor',
    (
      context,
      input: Parameters<NonNullable<ApiOwners['identityConsumer']>['prepareFirstFactor']>[1],
    ) => {
      requireCondition(
        owners.identityConsumer,
        503,
        'IDENTITY_CONSUMER_UNREGISTERED',
        '현재 C21 목적 모듈이 등록되지 않았습니다.',
      );
      return owners.identityConsumer.prepareFirstFactor(context, input);
    },
    true,
  );
  bind(
    'IdentityRecovery',
    'verifiedPersonEvidence',
    async (context, input: { sourceRef: Parameters<VerifiedPerson['read']>[1] }) =>
      new VerifiedPerson(
        owners.store,
        owners.personRegistration ?? 'UNREGISTERED',
        owners.now,
      ).read(context, input.sourceRef),
  );
  bind('IdentityRecovery', 'resumeRecovery', owners.identity.resumeRecovery.bind(owners.identity));
  bind('IdentityRecovery', 'closeRecovery', owners.identity.closeRecovery.bind(owners.identity));
  registry.bind('IdentityRecovery', 'requestRecovery', 1, (invocation) =>
    owners.identity.requestRecovery(
      invocation.context as Parameters<IdentityRecovery['requestRecovery']>[0],
      invocation.data as Parameters<IdentityRecovery['requestRecovery']>[1],
      u2HttpCall.getStore()?.ingress,
    ),
  );
  registry.bind('IdentityRecovery', 'prepareSavedRecovery', 1, async (invocation) => {
    const caseRef = await owners.identity.prepareSavedRecovery(
        (invocation.data as { challengeId: string }).challengeId,
        u2HttpCall.getStore()?.ingress,
      ),
      source = await owners.store.currentProtected('RecoveryCase', caseRef.id);
    requireCondition(source, 503, 'SAVED_CASE_NOT_PROTECTED', '원래 직접 복구 준비가 필요합니다.');
    const candidates = await owners.store.list('RecoveryCodeSet', {
      equals: {
        bindingRef: { id: (source.bindingRef as import('@oms/contracts').Ref).id },
        confirmed: true,
        invalidated: false,
      },
      limit: 2,
    });
    let codeSetRef: import('@oms/contracts').Ref | null = null;
    if (candidates.length === 1) {
      const row = await owners.store.currentProtected(
        'RecoveryCodeSet',
        String(candidates[0]!.setId),
      );
      if (row && row.generation === source.bindingGeneration)
        codeSetRef = {
          owner: 'IdentityRecovery',
          entity: 'RecoveryCodeSet',
          id: String(row.setId),
          revision: Number(row.revision),
        };
    }
    return { caseRef, codeSetRef };
  });
  registry.bind('IdentityRecovery', 'recoverSavedCode', 1, async (invocation) => {
    const data = invocation.data as {
        caseRef: Parameters<IdentityRecovery['recoverSavedCode']>[0];
        challengeId: string;
        setId: string;
        code: string;
      },
      call = u2HttpCall.getStore();
    requireCondition(call, 503, 'PURPOSE_HOST_REQUIRED', '현재 목적 host가 필요합니다.');
    const result = await owners.identity.recoverSavedCode(
        data.caseRef,
        data.challengeId,
        data.setId,
        data.code,
        call.network,
        call.ingress,
      ),
      outcome = result.outcome as {
        authorityRef: Parameters<IdentityRecovery['authenticatePurpose']>[0];
        expiresAt: string;
      };
    call.purposeResult = {
      version: 1,
      purpose: 'MFA_REENROLMENT',
      authorityRef: outcome.authorityRef,
      expiresAt: outcome.expiresAt,
      handle: result.handle,
    };
    return limitedView(result.outcome);
  });
  bind(
    'IdentityRecovery',
    'issueInvitationPurpose',
    async (
      context,
      data: {
        invitationRef: Parameters<IdentityRecovery['issueInvitationPurpose']>[1];
        response: string;
        contactVerificationRef: Parameters<IdentityRecovery['issueInvitationPurpose']>[3];
      },
    ) => {
      const issued = await owners.identity.issueInvitationPurpose(
          context,
          data.invitationRef,
          data.response,
          data.contactVerificationRef,
        ),
        source = await owners.store.currentProtected('EnrollmentAuthority', issued.authorityRef.id),
        call = u2HttpCall.getStore();
      requireCondition(
        source && call,
        503,
        'PURPOSE_PRODUCER',
        '현재 보호 목적 결과가 필요합니다.',
      );
      call.purposeResult = {
        version: 1,
        purpose: 'INVITATION_ACCEPTANCE',
        authorityRef: issued.authorityRef,
        handle: issued.handle,
        expiresAt: String(source.expiresAt),
      };
      return {
        authorityRef: issued.authorityRef,
        purpose: 'INVITATION_ACCEPTANCE',
        expiresAt: source.expiresAt,
        phase: 'ENROLMENT_ONLY',
      };
    },
  );
  bind(
    'IdentityRecovery',
    'beginRecoveryEnrollment',
    (
      context,
      data: {
        caseRef: Parameters<IdentityRecovery['beginRecoveryEnrollment']>[1];
        passwordChallengeId: string;
      },
    ) =>
      owners.identity.beginRecoveryEnrollment(
        context,
        data.caseRef,
        data.passwordChallengeId,
        u2HttpCall.getStore()?.ingress,
      ),
    true,
  );
  bind(
    'IdentityRecovery',
    'verifyRecoveryEnrollment',
    (
      context,
      data: {
        caseRef: Parameters<IdentityRecovery['verifyRecoveryEnrollment']>[1];
        enrollmentRef: Parameters<IdentityRecovery['verifyRecoveryEnrollment']>[2];
        response: string;
      },
    ) =>
      owners.identity.verifyRecoveryEnrollment(
        context,
        data.caseRef,
        data.enrollmentRef,
        data.response,
      ),
    true,
  );
  bind(
    'IdentityRecovery',
    'issueRecoveryPurposeCodes',
    (
      context,
      data: {
        caseRef: Parameters<IdentityRecovery['issueRecoveryPurposeCodes']>[1];
        enrollmentRef: Parameters<IdentityRecovery['issueRecoveryPurposeCodes']>[2];
      },
    ) => owners.identity.issueRecoveryPurposeCodes(context, data.caseRef, data.enrollmentRef),
    true,
  );
  bind(
    'IdentityRecovery',
    'acknowledgeRecoveryPurposeCodes',
    (
      context,
      data: {
        caseRef: Parameters<IdentityRecovery['acknowledgeRecoveryPurposeCodes']>[1];
        enrollmentRef: Parameters<IdentityRecovery['acknowledgeRecoveryPurposeCodes']>[2];
        codeSetRef: Parameters<IdentityRecovery['acknowledgeRecoveryPurposeCodes']>[3];
        stored: boolean;
      },
    ) =>
      owners.identity.acknowledgeRecoveryPurposeCodes(
        context,
        data.caseRef,
        data.enrollmentRef,
        data.codeSetRef,
        data.stored,
      ),
    true,
  );
  bind(
    'IdentityRecovery',
    'prepareRecoveryProviderWork',
    (context, input: Parameters<NonNullable<ApiOwners['identityConsumer']>['prepare']>[1]) => {
      requireCondition(
        owners.identityConsumer,
        503,
        'IDENTITY_CONSUMER_UNREGISTERED',
        '현재 C21 목적 모듈이 필요합니다.',
      );
      return owners.identityConsumer.prepare(context, input);
    },
    true,
  );
  // SYSTEM 객체는 비공개 운영 host가 실제 core에서 발급한 객체 그대로 전달한다.
  registry.bind('IdentityRecovery', 'applyVerifiedEmergencyResult', 1, (invocation) =>
    owners.identity.applyVerifiedEmergencyResult(
      invocation.context as U2PrivateOperatorContext,
      invocation.data as Parameters<IdentityRecovery['applyVerifiedEmergencyResult']>[1],
    ),
  );
  registry.bind('IdentityRecovery', 'resumeEmergencyRecovery', 1, (invocation) =>
    owners.identity.resumeEmergencyRecovery(
      invocation.context as U2PrivateOperatorContext,
      invocation.data as Parameters<IdentityRecovery['resumeEmergencyRecovery']>[1],
    ),
  );
  registry.bind('IdentityRecovery', 'closeEmergencyRecovery', 1, (invocation) =>
    owners.identity.closeEmergencyRecovery(
      invocation.context as U2PrivateOperatorContext,
      invocation.data as Parameters<IdentityRecovery['closeEmergencyRecovery']>[1],
    ),
  );
}
