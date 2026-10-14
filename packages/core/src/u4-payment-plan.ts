import { randomUUID } from 'node:crypto';
import { canonicalJson, fingerprint, requireCondition, U4_PROFILE } from '@oms/contracts';
import type {
  Money,
  Receipt,
  Ref,
  ServiceContext,
  U3AgreementApprovalInput,
  U4AgreedPaymentPlan,
  U4AgreementPlanInput,
  U4ConditionBinding,
  U4PaymentPlanDraft,
} from '@oms/contracts';
import type { ModelData, U4Transaction } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { U4CommercialAdapter } from './u4-commercial-adapter.js';
import { ref, u4Ref } from './references.js';
import { withinEffectiveWindow } from './catalog-conditions.js';
import { assertNoCommercialConflict, overlappingWindows } from './commercial-terms.js';

const exact = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const confirmed = (value: unknown) =>
  requireCondition(
    value,
    503,
    'U4_PLAN_UNCONFIRMED',
    '현재 승인 계획·사람·합의 근거의 정확한 개정이 필요합니다.',
  );

export function paymentPlanMode(plan: U4PaymentPlanDraft): 'PREPAY' | 'POSTPAY' | 'MIXED' {
  if (plan.obligations.every((obligation) => !obligation.requiredBeforeProvision)) return 'POSTPAY';
  return plan.obligations.every((obligation) => obligation.requiredBeforeProvision)
    ? 'PREPAY'
    : 'MIXED';
}
export class U4PaymentPlan {
  constructor(readonly adapter: U4CommercialAdapter) {}
  private validate(plan: U4PaymentPlanDraft, expected?: Money): U4PaymentPlanDraft {
    const value = this.adapter.store.schema.validateUri<U4PaymentPlanDraft>(
      U4_PROFILE + '#/$defs/PaymentPlanDraft',
      plan,
    );
    requireCondition(
      !expected || exact(value.total, expected),
      409,
      'U4_PLAN_TOTAL',
      '승인 주문 총액과 지급 의무 합계가 같아야 합니다.',
    );
    return value;
  }
  async parent(scope: U4Transaction, agreement: ModelData): Promise<ModelData> {
    const parentRef = agreement.contractRef as Ref;
    confirmed(
      parentRef.owner === 'CommercialAgreement' && parentRef.entity === 'EnterpriseContract',
    );
    const reads = scope.readSource();
    const original = await reads.readRevision(parentRef.entity, parentRef.id, parentRef.revision);
    const visible = await reads.currentProtected(parentRef.entity, parentRef.id);
    confirmed(
      original?.modelVersion === 2 &&
        visible &&
        exact(ref('EnterpriseContract', original), parentRef),
    );
    const parent = await scope.current(ref('EnterpriseContract', visible!));
    confirmed(parent.modelVersion === 2 && exact(parent.enterpriseRef, original!.enterpriseRef));
    return parent;
  }
  async register(
    context: ServiceContext,
    input: U4AgreementPlanInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    return this.adapter.run(
      context,
      'CommercialAgreement',
      'registerAgreementPaymentPlan',
      { kind: 'NONE' },
      input,
      { scope: null, enterpriseRef: input.enterpriseRef },
      ingressProof,
      async (scope) => {
        requireCondition(
          input.meta.expectedRevision === input.sourceAgreementRevisionRef.revision,
          409,
          'STALE_REVISION',
          '지급 계획의 원래 계약 개정이 필요합니다.',
        );
        const source = await scope.current(input.sourceAgreementRevisionRef);
        const parent = await this.parent(scope, source);
        confirmed(
          [2, 3].includes(Number(source.modelVersion)) &&
            ['APPROVED', 'REGISTERED', 'CONFIRMATION_REQUIRED'].includes(String(source.state)) &&
            exact(parent.enterpriseRef, input.enterpriseRef) &&
            (source.state !== 'APPROVED' ||
              exact(parent.currentApprovedRevisionRef, input.sourceAgreementRevisionRef)),
        );
        const draft = this.validate(input.planDraft);
        confirmed(
          (source.conditionBindings as U4ConditionBinding[]).filter(
            (binding) => binding.conditionKey === 'PAYMENT',
          ).length === 1,
        );
        const previous = source.paymentPlan as U4AgreedPaymentPlan | null | undefined;
        requireCondition(
          draft.planRevision === (previous ? previous.planRevision + 1 : 1),
          409,
          'U4_PLAN_REVISION',
          '이전 승인 계획을 잇는 정확한 개정이 필요합니다.',
        );
        const basis = this.adapter.basis(scope);
        const proof = {
          epoch: await scope.readSource().currentEpoch(),
          targetEnterpriseRef: input.enterpriseRef,
          approvalDigest: fingerprint({ operation: 'registerAgreementPaymentPlan', input, source }),
        };
        await basis.person(scope, context.actorAccountRef!, context.verifiedPersonRef, proof);
        for (const obligation of draft.obligations)
          for (const evidence of obligation.agreementEvidenceRefs) await scope.current(evidence);
        const agreement: ModelData = {
          ...source,
          modelVersion: 3,
          agreementRevisionId: randomUUID(),
          contractRef: ref('EnterpriseContract', parent),
          registeredBy: context.actorAccountRef,
          registeredPersonRef: context.verifiedPersonRef,
          approvalRef: null,
          paymentPlan: null,
          paymentPlanDraft: draft,
          state: 'REGISTERED',
          revision: 1,
        };
        const reference = ref('AgreementRevision', agreement);
        agreement.conditionBindings = (source.conditionBindings as U4ConditionBinding[]).map(
          (binding) => ({
            ...binding,
            sourceRef: reference,
            ...(binding.conditionKey === 'PAYMENT'
              ? { value: { ...binding.value, mode: paymentPlanMode(draft) } }
              : {}),
          }),
        );
        agreement.agreementEvidenceRefs = [
          ...new Map(
            [
              ...(source.agreementEvidenceRefs as Ref[]),
              ...(source.conditionBindings as U4ConditionBinding[]).flatMap(
                (binding) => binding.evidenceRefs,
              ),
              ...draft.obligations.flatMap((obligation) => obligation.agreementEvidenceRefs),
            ].map((evidence) => [canonicalJson(evidence), evidence]),
          ).values(),
        ];
        await scope.transaction.put('AgreementRevision', agreement);
        return {
          target: u4Ref('AgreementRevision', agreement, this.adapter.store.schema),
          refs: [u4Ref('AgreementRevision', agreement, this.adapter.store.schema)],
          before: input.sourceAgreementRevisionRef,
        };
      },
    );
  }
  async approve(
    context: ServiceContext,
    input: U3AgreementApprovalInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    this.adapter.store.schema.validateUri(U4_PROFILE + '#/$defs/AgreementPlanApprovalInput', input);
    const visible = await this.adapter.repository.current(input.targetRef);
    const parentRef = visible.contractRef as Ref;
    const parent = await this.adapter.store.currentProtected('EnterpriseContract', parentRef.id);
    confirmed(parent);
    const enterpriseRef = parent!.enterpriseRef as Ref;
    return this.adapter.run(
      context,
      'CommercialAgreement',
      'approveAgreementPaymentPlan',
      { kind: 'RECORD', recordRef: input.targetRef },
      input,
      { scope: null, enterpriseRef },
      ingressProof,
      async (scope) => {
        const agreement = await scope.current(input.targetRef);
        const contract = await this.parent(scope, agreement);
        confirmed(
          agreement.modelVersion === 3 &&
            agreement.state === 'REGISTERED' &&
            agreement.paymentPlan === null &&
            agreement.paymentPlanDraft !== null &&
            exact(contract.enterpriseRef, enterpriseRef),
        );
        const draft = this.validate(agreement.paymentPlanDraft as U4PaymentPlanDraft);
        const basis = this.adapter.basis(scope);
        const proof = {
          epoch: await scope.readSource().currentEpoch(),
          targetEnterpriseRef: enterpriseRef,
          approvalDigest: fingerprint({
            operation: 'approveAgreementPaymentPlan',
            agreement,
            input,
            approver: context.actorAccountRef,
          }),
        };
        const verify = async () => {
          await basis.differentPeople(
            scope,
            agreement.registeredBy as Ref,
            agreement.registeredPersonRef as Ref | null,
            context.actorAccountRef!,
            context.verifiedPersonRef,
            proof,
          );
          const required = [
            ...(agreement.agreementEvidenceRefs as Ref[]),
            ...draft.obligations.flatMap((obligation) => obligation.agreementEvidenceRefs),
          ];
          confirmed(
            required.length > 0 &&
              required.every((reference) =>
                input.basisRefs.some((value) => exact(reference, value)),
              ),
          );
          await basis.evidence(
            scope,
            input.basisRefs,
            basis.registration.agreementPurpose,
            agreement.registeredBy as Ref,
            enterpriseRef,
            undefined,
            proof,
          );
        };
        await verify();
        if (input.decision === 'APPROVE') {
          const existing: ModelData[] = [];
          for (const registered of await basis.collection(scope, 'EnterpriseContract', {
            enterpriseRef: { id: enterpriseRef.id },
          }))
            existing.push(
              ...(await basis.collection(scope, 'AgreementRevision', {
                contractRef: { id: registered.contractId },
              })),
            );
          assertNoCommercialConflict(agreement, existing);
          for (const other of existing) {
            if (
              other.state !== 'APPROVED' ||
              other.agreementRevisionId === agreement.agreementRevisionId ||
              !other.paymentPlan ||
              !(other.productRefs as Ref[]).some((product) =>
                (agreement.productRefs as Ref[]).some((candidate) => candidate.id === product.id),
              ) ||
              !overlappingWindows(
                other.effectiveWindow as import('@oms/contracts').EffectiveWindow,
                agreement.effectiveWindow as import('@oms/contracts').EffectiveWindow,
              )
            )
              continue;
            const prior = other.paymentPlan as U4AgreedPaymentPlan;
            requireCondition(
              exact(
                { total: prior.total, obligations: prior.obligations },
                { total: draft.total, obligations: draft.obligations },
              ),
              409,
              'U4_PLAN_CONFLICT',
              '유효 구간이 겹치는 지급 계획의 충돌을 해소해야 합니다.',
            );
          }
        }
        const after: ModelData = {
          ...agreement,
          state: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          revision: input.targetRef.revision + 1,
        };
        const approval = {
          modelVersion: 2,
          approvalId: randomUUID(),
          revisionRef: ref('AgreementRevision', after),
          registrantPersonRef: agreement.registeredPersonRef,
          approverAccountRef: context.actorAccountRef,
          approverPersonRef: context.verifiedPersonRef,
          evidenceRefs: input.basisRefs,
          decision: input.decision,
          occurredAt: this.adapter.now().toISOString(),
          revision: 1,
        };
        after.approvalRef = ref('AgreementApproval', approval);
        if (input.decision === 'APPROVE')
          after.paymentPlan = {
            ...draft,
            agreementRevisionRef: ref('AgreementRevision', after),
            agreementApprovalRef: ref('AgreementApproval', approval),
            customerConsentRef: null,
          } satisfies U4AgreedPaymentPlan;
        after.conditionBindings = (agreement.conditionBindings as U4ConditionBinding[]).map(
          (binding) => ({ ...binding, sourceRef: ref('AgreementRevision', after) }),
        );
        await scope.transaction.put('AgreementRevision', after, input.targetRef.revision);
        await scope.transaction.put('AgreementApproval', approval);
        const refs = [
          u4Ref('AgreementRevision', after, this.adapter.store.schema),
          ref('AgreementApproval', approval),
        ];
        if (
          input.decision === 'APPROVE' &&
          withinEffectiveWindow(
            after.effectiveWindow as import('@oms/contracts').EffectiveWindow,
            this.adapter.now(),
          )
        ) {
          const changed = {
            ...contract,
            currentApprovedRevisionRef: ref('AgreementRevision', after),
            revision: Number(contract.revision) + 1,
          };
          await scope.transaction.put('EnterpriseContract', changed, Number(contract.revision));
          refs.push(ref('EnterpriseContract', changed));
        }
        await verify();
        return { target: refs[0]!, refs };
      },
    );
  }
  async current(
    scope: U4Transaction,
    agreementRef: Ref,
    total?: Money,
  ): Promise<U4AgreedPaymentPlan> {
    const agreement = await scope.current(agreementRef);
    const parent = await this.parent(scope, agreement);
    confirmed(
      agreement.modelVersion === 3 &&
        agreement.state === 'APPROVED' &&
        agreement.paymentPlan &&
        exact(parent.currentApprovedRevisionRef, agreementRef) &&
        withinEffectiveWindow(
          agreement.effectiveWindow as import('@oms/contracts').EffectiveWindow,
          this.adapter.now(),
        ),
    );
    const plan = this.adapter.store.schema.validateUri<U4AgreedPaymentPlan>(
      U4_PROFILE + '#/$defs/AgreedPaymentPlan',
      agreement.paymentPlan,
    );
    this.validate(
      {
        planRevision: plan.planRevision,
        total: plan.total,
        obligations: plan.obligations,
        knowledge: plan.knowledge,
      },
      total,
    );
    confirmed(
      exact(plan.agreementRevisionRef, agreementRef) &&
        exact(plan.agreementApprovalRef, agreement.approvalRef),
    );
    const approval = await scope.current(plan.agreementApprovalRef);
    confirmed(
      approval.decision === 'APPROVE' &&
        exact(approval.revisionRef, agreementRef) &&
        exact(approval.registrantPersonRef, agreement.registeredPersonRef),
    );
    const basis = this.adapter.basis(scope);
    const proof = {
      epoch: await scope.readSource().currentEpoch(),
      targetEnterpriseRef: parent.enterpriseRef as Ref,
      approvalDigest: fingerprint({ operation: 'currentPaymentPlan', agreement, plan, approval }),
    };
    await new Authorization(
      this.adapter.store,
      this.adapter.now,
      scope.readSource(),
    ).requireStaffSource(approval.approverAccountRef as Ref, 'contract.approve', scope.transaction);
    await basis.differentPeople(
      scope,
      agreement.registeredBy as Ref,
      agreement.registeredPersonRef as Ref | null,
      approval.approverAccountRef as Ref,
      approval.approverPersonRef as Ref | null,
      proof,
    );
    const evidence = approval.evidenceRefs as Ref[];
    confirmed(
      [
        ...(agreement.agreementEvidenceRefs as Ref[]),
        ...plan.obligations.flatMap((obligation) => obligation.agreementEvidenceRefs),
      ].every((reference) => evidence.some((value) => exact(value, reference))),
    );
    await basis.evidence(
      scope,
      evidence,
      basis.registration.agreementPurpose,
      agreement.registeredBy as Ref,
      parent.enterpriseRef as Ref,
      undefined,
      proof,
    );
    return structuredClone(plan);
  }
  async currentAgreement(scope: U4Transaction, reference: Ref): Promise<ModelData> {
    const agreement = await scope.current(reference);
    if (agreement.modelVersion === 3) {
      await this.current(scope, reference);
      return agreement;
    }
    const parent = await this.parent(scope, agreement);
    confirmed(
      agreement.modelVersion === 2 &&
        agreement.state === 'APPROVED' &&
        agreement.approvalRef &&
        withinEffectiveWindow(
          agreement.effectiveWindow as import('@oms/contracts').EffectiveWindow,
          this.adapter.now(),
        ),
    );
    const approval = await scope.current(agreement.approvalRef as Ref);
    confirmed(
      approval.decision === 'APPROVE' &&
        exact(approval.revisionRef, reference) &&
        exact(approval.registrantPersonRef, agreement.registeredPersonRef),
    );
    const proof = {
      epoch: await scope.readSource().currentEpoch(),
      targetEnterpriseRef: parent.enterpriseRef as Ref,
      approvalDigest: fingerprint({
        operation: 'currentAgreementForPlannedOrder',
        agreement,
        approval,
      }),
    };
    const basis = this.adapter.basis(scope);
    await new Authorization(
      this.adapter.store,
      this.adapter.now,
      scope.readSource(),
    ).requireStaffSource(approval.approverAccountRef as Ref, 'contract.approve', scope.transaction);
    await basis.differentPeople(
      scope,
      agreement.registeredBy as Ref,
      agreement.registeredPersonRef as Ref | null,
      approval.approverAccountRef as Ref,
      approval.approverPersonRef as Ref | null,
      proof,
    );
    const evidence = approval.evidenceRefs as Ref[];
    confirmed(
      [
        ...(agreement.agreementEvidenceRefs as Ref[]),
        ...(agreement.conditionBindings as U4ConditionBinding[]).flatMap(
          (binding) => binding.evidenceRefs,
        ),
      ].every((required) => evidence.some((value) => exact(required, value))),
    );
    await basis.evidence(
      scope,
      evidence,
      basis.registration.agreementPurpose,
      agreement.registeredBy as Ref,
      parent.enterpriseRef as Ref,
      undefined,
      proof,
    );
    return agreement;
  }
}
