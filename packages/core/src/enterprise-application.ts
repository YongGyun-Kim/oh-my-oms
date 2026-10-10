import type { Receipt, Ref, ServiceContext } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import type { ProtectedTransaction } from '@oms/persistence';
import { randomUUID } from 'node:crypto';
import {
  EnterpriseDecision,
  EnterpriseInput,
  EnterpriseInternal,
} from './enterprise-access-state.js';
import { enqueueMinimumNotice } from './pending-notification.js';
import { ref } from './references.js';
export async function apply(
  host: EnterpriseInternal,
  context: ServiceContext,
  input: EnterpriseInput,
): Promise<Receipt> {
  host.store.schema.validate('EnterpriseInput', input);
  const authorize = async (transaction?: ProtectedTransaction) => {
    await host.authorization.identity(context, transaction);
    requireCondition(context.audience === 'CUSTOMER', 403, 'CUSTOMER_REQUIRED', '고객 신청입니다.');
  };
  return host.commands.run(
    context,
    'EnterpriseAccess',
    'applyEnterprise',
    { kind: 'NONE' },
    input,
    'AccessHistory',
    authorize,
    async (transaction) => {
      requireCondition(
        input.meta.expectedRevision === null,
        400,
        'CREATE_REVISION',
        '신규 신청에 기대 개정을 지정할 수 없습니다.',
      );
      const application = {
        applicationId: randomUUID(),
        applicantAccountRef: context.actorAccountRef,
        legalName: input.legalName,
        designatedContact: input.designatedContact,
        registrationEvidenceRefs: input.registrationEvidenceRefs,
        state: 'PENDING',
        decisionBasis: null,
        initialAdministratorRef: null,
        submittedAt: host.now().toISOString(),
        revision: 1,
      };
      await transaction.put('EnterpriseApplication', application);
      return {
        target: ref('EnterpriseApplication', application),
        refs: [ref('EnterpriseApplication', application)],
        scope: null,
        state: 'REVIEW_REQUIRED',
      };
    },
  );
}
export async function approve(
  host: EnterpriseInternal,
  context: ServiceContext,
  input: EnterpriseDecision,
): Promise<Receipt> {
  host.store.schema.validate('DecisionInput', input);
  requireCondition(
    input.targetRef.owner === 'EnterpriseAccess' &&
      input.targetRef.entity === 'EnterpriseApplication',
    400,
    'APPLICATION_TARGET',
    '기업 신청 대상이 필요합니다.',
  );
  await host.authorization.requireStaff(context, 'enterprise.approve');
  // Owner observation is outside the primary commit-order lock; its target revision is rechecked below.
  const check =
    input.basisRefs.length > 0
      ? await host.verification.enterprise(input.targetRef, input.basisRefs)
      : {
          knowledge: 'UNKNOWN',
          evidenceRefs: [],
          reasonCode: 'REQUIRED_EVIDENCE_MISSING',
          legalEntityConfirmed: false,
        };
  return host.commands.run(
    context,
    'EnterpriseAccess',
    'approveEnterprise',
    { kind: 'RECORD', recordRef: input.targetRef },
    input,
    'AccessHistory',
    (transaction) => host.authorization.requireStaff(context, 'enterprise.approve', transaction),
    async (transaction, requestId) => {
      const application = await transaction.get('EnterpriseApplication', input.targetRef.id);
      requireCondition(application, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      requireCondition(
        input.meta.expectedRevision === application.revision &&
          input.targetRef.revision === application.revision,
        409,
        'STALE_REVISION',
        '신청 개정을 다시 확인하세요.',
      );
      requireCondition(
        application.state !== 'APPROVED',
        409,
        'APPLICATION_ALREADY_APPROVED',
        '승인된 신청입니다.',
      );
      const confirmed =
        check.knowledge === 'KNOWN' && check.legalEntityConfirmed && check.evidenceRefs.length > 0;
      const state = confirmed
        ? input.decision === 'APPROVE'
          ? 'APPROVED'
          : 'DECLINED'
        : 'UNVERIFIED';
      const decisionBasis = {
        actorAccountRef: context.actorAccountRef,
        verifiedPersonRef: context.verifiedPersonRef,
        evidenceRefs: check.evidenceRefs,
        targetRevision: application.revision,
        decision: input.decision,
        knowledge: check.knowledge,
        reasonCode: check.reasonCode,
        decidedAt: host.now().toISOString(),
        reason: input.meta.reason,
      };
      const updated = {
        ...application,
        state,
        decisionBasis,
        revision: Number(application.revision) + 1,
      };
      await transaction.put('EnterpriseApplication', updated, Number(application.revision));
      const refs = [ref('EnterpriseApplication', updated)];
      if (state === 'APPROVED') {
        const enterprise = {
          enterpriseId: randomUUID(),
          applicationRef: ref('EnterpriseApplication', updated),
          approvalState: 'APPROVED',
          usageEnabled: true,
          orderingContextPolicy: {
            departmentUsage: 'UNSET',
            siteUsage: 'UNSET',
            setBy: null,
            setAt: null,
            reason: '미설정',
          },
          administratorCount: 0,
          designatedNoticeContactRefs: [],
          revision: 1,
        };
        await transaction.put('Enterprise', enterprise);
        refs.push(ref('Enterprise', enterprise));
      }
      await enqueueMinimumNotice(
        transaction,
        context,
        requestId,
        ref('EnterpriseApplication', updated),
        null,
        await host.store.currentEpoch(),
        host.now(),
      );
      return {
        target: ref('EnterpriseApplication', updated),
        refs,
        scope: null,
        state: confirmed ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED',
        before: ref('EnterpriseApplication', application),
      };
    },
  );
}
export async function readApplication(
  host: EnterpriseInternal,
  context: ServiceContext,
  id: string,
): Promise<unknown> {
  await host.authorization.identity(context);
  if (context.audience === 'STAFF')
    await host.authorization.requireStaff(context, 'application.read');
  const application = await host.store.read('EnterpriseApplication', id);
  requireCondition(
    application &&
      (context.audience === 'STAFF' ||
        (application.applicantAccountRef as Ref).id === context.principalId),
    404,
    'NOT_FOUND',
    '대상을 확인할 수 없습니다.',
  );
  const enterprises = await host.store.list('Enterprise', {
    equals: { applicationRef: { id } },
    limit: 1,
  });
  const basis = application.decisionBasis as { decidedAt: string; knowledge: string } | null;
  return host.store.schema.validateUri(
    'urn:oms:contract:foundation:1#/$defs/ApplicationViewResult',
    {
      knowledge: 'KNOWN',
      data: {
        applicationRef: ref('EnterpriseApplication', application),
        applicantAccountRef: application.applicantAccountRef,
        legalName: application.legalName,
        designatedContact: application.designatedContact,
        state: application.state,
        submittedAt: application.submittedAt,
        decidedAt: basis?.decidedAt ?? null,
        initialAdministratorRef: application.initialAdministratorRef,
        confirmation: basis?.knowledge ?? 'UNKNOWN',
      },
      sourceRefs: [
        ref('EnterpriseApplication', application),
        ...enterprises.map((enterprise) => ref('Enterprise', enterprise)),
      ],
      observedAt: host.now().toISOString(),
    },
  );
}
