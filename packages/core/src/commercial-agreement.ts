import { randomUUID } from 'node:crypto';
import { canonicalJson, requireCondition, fingerprint, ExecutionBudget } from '@oms/contracts';
import type {
  ConditionBinding,
  Receipt,
  Ref,
  ServiceContext,
  U3AgreementRegistrationInput,
  U3AgreementApprovalInput,
  U3CommercialTermsQuery,
  U3ResolvedCommercialTerms,
  EffectiveWindow,
} from '@oms/contracts';
import { ProtectedTransaction, U3Transaction } from '@oms/persistence';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { U3Commands } from './u3-commands.js';
import { ref } from './references.js';
import { U3CurrentBasis } from './u3-current-basis.js';
import type { U3EvidenceRegistration } from './u3-current-basis.js';
import { assertNoCommercialConflict, resolveConditionBindings } from './commercial-terms.js';
import { withinEffectiveWindow } from './catalog-conditions.js';

export class CommercialAgreement {
  readonly commands: U3Commands;
  readonly basis: U3CurrentBasis;
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
    registration?: U3EvidenceRegistration,
  ) {
    this.commands = new U3Commands(store, now);
    this.basis = new U3CurrentBasis(store, now, registration);
  }
  private async ingress(context: ServiceContext, proof: unknown) {
    requireCondition(
      context.audience !== 'STAFF' || (await this.staffIngress(proof)),
      403,
      'STAFF_NETWORK_REQUIRED',
      '등록된 회사 내부망 경로가 필요합니다.',
    );
  }
  private async terms(scope: U3Transaction, reference: Ref, enterpriseRef: Ref): Promise<void> {
    const source = await scope.current(reference);
    if (reference.owner !== 'CommercialAgreement') return;
    let company = source.enterpriseRef as Ref | undefined;
    let contractRef = source.contractRef as Ref | undefined;
    if (reference.entity === 'AgreementHistory') {
      const after = source.afterRef as Ref;
      const original = await this.store.readRevision(after.entity, after.id, after.revision);
      requireCondition(
        original,
        503,
        'U3_PROOF_UNCONFIRMED',
        '원래 계약 조건의 보호 개정이 필요합니다.',
      );
      contractRef = original!.contractRef as Ref;
    }
    if (contractRef) {
      const current = await this.store.currentProtected('EnterpriseContract', contractRef.id);
      requireCondition(current, 503, 'U3_PROOF_UNCONFIRMED', '조건의 기업 계약 원본이 필요합니다.');
      company = (await scope.current(ref('EnterpriseContract', current!))).enterpriseRef as Ref;
    }
    requireCondition(
      company?.owner === 'EnterpriseAccess' &&
        company.entity === 'Enterprise' &&
        company.id === enterpriseRef.id,
      404,
      'NOT_FOUND',
      '해당 기업의 조건 원본을 확인할 수 없습니다.',
    );
  }
  async register(
    context: ServiceContext,
    input: U3AgreementRegistrationInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    await this.ingress(context, ingressProof);
    return this.commands.run(
      context,
      'CommercialAgreement',
      'registerAgreement',
      { kind: 'NONE' },
      input,
      { scope: null, enterpriseRef: input.enterpriseRef },
      async (scope) => {
        await this.ingress(context, ingressProof);
        requireCondition(
          input.meta.expectedRevision === (input.contractRef?.revision ?? null),
          409,
          'STALE_REVISION',
          '정확한 기업 계약 개정이 필요합니다.',
        );
        const previous = input.contractRef ? await scope.current(input.contractRef) : null;
        requireCondition(
          !previous ||
            (previous.modelVersion === 2 &&
              (previous.enterpriseRef as Ref).id === input.enterpriseRef.id),
          409,
          'AGREEMENT_TARGET',
          '같은 기업의 현재 계약이 필요합니다.',
        );
        for (const product of input.productRefs) await scope.current(product);
        const terms = [input.commercialTermsRef, input.provisionTermsRef, input.renewalTermsRef];
        for (const condition of input.conditions) {
          if (condition.conditionKey === 'PAYMENT' || condition.conditionKey === 'PROVISION')
            terms.push(condition.value.termsRef);
          else if (condition.conditionKey === 'PERIOD') terms.push(condition.value.ruleRef);
          else if (condition.conditionKey === 'COMPLETION' || condition.conditionKey === 'RENEWAL')
            terms.push(condition.value);
        }
        for (const reference of terms.filter((value): value is Ref => value !== null))
          await this.terms(scope, reference, input.enterpriseRef);
        for (const reference of [
          ...input.agreementEvidenceRefs,
          ...input.conditions.flatMap((value) => value.evidenceRefs),
        ])
          await scope.current(reference);
        if (context.verifiedPersonRef) {
          const link = await scope.current(context.verifiedPersonRef);
          requireCondition(
            (link.accountRefs as Ref[]).some(
              (value) => canonicalJson(value) === canonicalJson(context.actorAccountRef),
            ),
            503,
            'U3_PROOF_UNCONFIRMED',
            '등록자의 현재 사람 원본이 다릅니다.',
          );
        }
        const contract = previous ?? {
          modelVersion: 2,
          contractId: randomUUID(),
          enterpriseRef: input.enterpriseRef,
          currentApprovedRevisionRef: null,
          contractEvidenceRefs: input.agreementEvidenceRefs,
          revision: 1,
        };
        const agreement: ModelData = {
          modelVersion: 2,
          agreementRevisionId: randomUUID(),
          contractRef: ref('EnterpriseContract', contract),
          productRefs: input.productRefs,
          commercialTermsRef: input.commercialTermsRef,
          provisionTermsRef: input.provisionTermsRef,
          renewalTermsRef: input.renewalTermsRef,
          registeredBy: context.actorAccountRef,
          registeredPersonRef: context.verifiedPersonRef,
          approvalRef: null,
          agreementEvidenceRefs: input.agreementEvidenceRefs,
          effectiveWindow: input.effectiveWindow,
          conditionBindings: [],
          state:
            context.verifiedPersonRef &&
            input.agreementEvidenceRefs.length > 0 &&
            input.conditions.length > 0
              ? 'REGISTERED'
              : 'CONFIRMATION_REQUIRED',
          revision: 1,
        };
        agreement.conditionBindings = input.conditions.map((value) => ({
          ...value,
          sourceRef: ref('AgreementRevision', agreement),
        }));
        if (!previous) await scope.transaction.put('EnterpriseContract', contract);
        await scope.transaction.put('AgreementRevision', agreement);
        await this.ingress(context, ingressProof);
        return {
          target: ref('AgreementRevision', agreement),
          refs: previous
            ? [ref('AgreementRevision', agreement)]
            : [ref('AgreementRevision', agreement), ref('EnterpriseContract', contract)],
          state: 'RESULT_RECORDED',
        };
      },
    );
  }
  private async agreements(scope: U3Transaction, enterpriseRef: Ref): Promise<ModelData[]> {
    const contracts = await this.basis.collection(scope, 'EnterpriseContract', {
      enterpriseRef: { id: enterpriseRef.id },
    });
    const records: ModelData[] = [];
    for (const contract of contracts)
      records.push(
        ...(await this.basis.collection(scope, 'AgreementRevision', {
          contractRef: { id: contract.contractId },
        })),
      );
    return records;
  }
  async approve(
    context: ServiceContext,
    input: U3AgreementApprovalInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    const incoming = ExecutionBudget.current();
    const remaining = Math.min(
      10000,
      incoming?.remaining() ?? 10000,
      Date.parse(context.deadlineAt) - this.now().getTime(),
    );
    requireCondition(
      Number.isFinite(remaining) && remaining > 0,
      503,
      'EXECUTION_DEADLINE',
      '원래 승인 요청 기한이 종료됐습니다.',
    );
    return new ExecutionBudget(
      Math.max(1, Math.floor(remaining)),
      incoming?.now ?? (() => Date.now()),
      incoming?.signal,
    ).run(() => this.approveWithinBudget(context, input, ingressProof));
  }
  private async approveWithinBudget(
    context: ServiceContext,
    input: U3AgreementApprovalInput,
    ingressProof: unknown,
  ): Promise<Receipt> {
    await this.ingress(context, ingressProof);
    // 승인 대상 기업은 보호된 계약 원본에서 고정한다.
    const visible = await this.commands.repository.current(input.targetRef),
      contract = await this.commands.repository.current(visible.contractRef as Ref),
      enterpriseRef = contract.enterpriseRef as Ref;
    return this.commands.run(
      context,
      'CommercialAgreement',
      'approveAgreement',
      { kind: 'RECORD', recordRef: input.targetRef },
      input,
      { scope: null, enterpriseRef },
      async (scope) => {
        await this.ingress(context, ingressProof);
        const agreement = await scope.current(input.targetRef),
          currentContract = await scope.current(agreement.contractRef as Ref);
        requireCondition(
          agreement.modelVersion === 2 &&
            ['REGISTERED', 'CONFIRMATION_REQUIRED'].includes(String(agreement.state)),
          409,
          'AGREEMENT_APPROVAL_STATE',
          '아직 승인하지 않은 정확한 계약 개정이 필요합니다.',
        );
        const proofContext = {
          epoch: await this.store.currentEpoch(),
          targetEnterpriseRef: enterpriseRef,
          approvalDigest: fingerprint({
            operation: 'approveAgreement',
            agreement,
            input,
            approverAccountRef: context.actorAccountRef,
            approverPersonRef: context.verifiedPersonRef,
          }),
        };
        await this.basis.differentPeople(
          scope,
          agreement.registeredBy as Ref,
          agreement.registeredPersonRef as Ref | null,
          context.actorAccountRef!,
          context.verifiedPersonRef,
          proofContext,
        );
        const proofRefs = agreement.agreementEvidenceRefs as Ref[];
        requireCondition(
          proofRefs.length > 0 &&
            proofRefs.every((value) =>
              input.basisRefs.some((basis) => canonicalJson(basis) === canonicalJson(value)),
            ),
          503,
          'U3_PROOF_UNCONFIRMED',
          '등록된 합의 근거 전체를 승인해야 합니다.',
        );
        await this.basis.evidence(
          scope,
          input.basisRefs,
          this.basis.registration.agreementPurpose,
          agreement.registeredBy as Ref,
          enterpriseRef,
          undefined,
          proofContext,
        );
        for (const product of agreement.productRefs as Ref[]) await scope.current(product);
        requireCondition(
          (agreement.conditionBindings as ConditionBinding[]).length > 0,
          503,
          'U3_PROOF_UNCONFIRMED',
          '적용할 계약 조건을 확인해야 합니다.',
        );
        if (input.decision === 'APPROVE')
          assertNoCommercialConflict(agreement, await this.agreements(scope, enterpriseRef));
        const changed: ModelData = {
          ...agreement,
          state: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          revision: Number(agreement.revision) + 1,
        };
        changed.conditionBindings = (agreement.conditionBindings as ConditionBinding[]).map(
          (value) => ({ ...value, sourceRef: ref('AgreementRevision', changed) }),
        );
        const approval = {
          modelVersion: 2,
          approvalId: randomUUID(),
          revisionRef: ref('AgreementRevision', changed),
          registrantPersonRef: agreement.registeredPersonRef,
          approverAccountRef: context.actorAccountRef,
          approverPersonRef: context.verifiedPersonRef,
          evidenceRefs: input.basisRefs,
          decision: input.decision,
          occurredAt: this.now().toISOString(),
          revision: 1,
        };
        changed.approvalRef = ref('AgreementApproval', approval);
        await scope.transaction.put('AgreementRevision', changed, Number(agreement.revision));
        await scope.transaction.put('AgreementApproval', approval);
        const refs = [ref('AgreementRevision', changed), ref('AgreementApproval', approval)];
        if (
          input.decision === 'APPROVE' &&
          withinEffectiveWindow(agreement.effectiveWindow as EffectiveWindow, this.now())
        ) {
          const amended = {
            ...currentContract,
            currentApprovedRevisionRef: ref('AgreementRevision', changed),
            revision: Number(currentContract.revision) + 1,
          };
          await scope.transaction.put(
            'EnterpriseContract',
            amended,
            Number(currentContract.revision),
          );
          refs.push(ref('EnterpriseContract', amended));
        }
        await this.basis.differentPeople(
          scope,
          agreement.registeredBy as Ref,
          agreement.registeredPersonRef as Ref | null,
          context.actorAccountRef!,
          context.verifiedPersonRef,
          proofContext,
        );
        await this.basis.evidence(
          scope,
          input.basisRefs,
          this.basis.registration.agreementPurpose,
          agreement.registeredBy as Ref,
          enterpriseRef,
          undefined,
          proofContext,
        );
        await this.ingress(context, ingressProof);
        return { target: ref('AgreementRevision', changed), refs, state: 'RESULT_RECORDED' };
      },
    );
  }
  async resolve(
    context: ServiceContext,
    input: U3CommercialTermsQuery,
    ingressProof: unknown = null,
  ): Promise<U3ResolvedCommercialTerms> {
    await this.ingress(context, ingressProof);
    return this.commands.read(
      context,
      'CommercialAgreement',
      'readApprovedTerms',
      input,
      { scope: input.targetScope },
      async () => {
        this.basis.requireRegistration();
        return this.store.primary.transaction(async (manager) => {
          const epoch = await this.store.currentEpoch();
          await manager.query(
            'SELECT commit_order FROM u1_commit_counter WHERE epoch=$1 FOR SHARE',
            [epoch],
          );
          const scope = new U3Transaction(
            this.commands.repository,
            new ProtectedTransaction(manager, this.store.schema),
          );
          const product = await scope.current(input.productRef),
            offer = await scope.current(input.commonOfferRevisionRef);
          requireCondition(
            product.modelVersion === 2 &&
              product.saleState === 'OFFERABLE' &&
              offer.visible &&
              canonicalJson(product.currentOfferRef) ===
                canonicalJson(input.commonOfferRevisionRef) &&
              canonicalJson(offer.productRef) === canonicalJson(input.productRef) &&
              withinEffectiveWindow(offer.effectiveWindow as EffectiveWindow, this.now()),
            409,
            'STALE_CATALOG_OFFER',
            '현재 공통 조건의 정확한 개정이 필요합니다.',
          );
          const applicable: ModelData[] = [];
          for (const agreement of await this.agreements(scope, input.targetScope.enterpriseRef)) {
            if (
              agreement.state !== 'APPROVED' ||
              !(agreement.productRefs as Ref[]).some((value) => value.id === input.productRef.id)
            )
              continue;
            const approvalRef = agreement.approvalRef as Ref | null;
            requireCondition(
              approvalRef,
              503,
              'U3_PROOF_UNCONFIRMED',
              '정확한 승인 원본이 필요합니다.',
            );
            const approval = await scope.current(approvalRef!);
            requireCondition(
              approval.decision === 'APPROVE' &&
                canonicalJson(approval.revisionRef) ===
                  canonicalJson(ref('AgreementRevision', agreement)),
              503,
              'U3_PROOF_UNCONFIRMED',
              '정확한 계약 승인 개정이 다릅니다.',
            );
            if (withinEffectiveWindow(agreement.effectiveWindow as EffectiveWindow, this.now()))
              applicable.push(agreement);
          }
          const conditionBindings = resolveConditionBindings(
            offer.conditionBindings as ConditionBinding[],
            applicable,
            this.now(),
          );
          requireCondition(
            ['PRICE', 'PAYMENT', 'PROVISION', 'COMPLETION', 'VISIBILITY'].every((key) =>
              conditionBindings.some((value) => value.conditionKey === key),
            ),
            503,
            'U3_PROOF_UNCONFIRMED',
            '현재 유효한 필수 판매 조건이 필요합니다.',
          );
          requireCondition(
            conditionBindings.find((value) => value.conditionKey === 'VISIBILITY')?.value === true,
            404,
            'NOT_FOUND',
            '해당 기업에 공개된 상품을 확인할 수 없습니다.',
          );
          const result = {
            enterpriseRef: input.targetScope.enterpriseRef,
            productRef: input.productRef,
            commonOfferRevisionRef: input.commonOfferRevisionRef,
            agreementRevisionRefs: [
              ...new Map(
                conditionBindings
                  .filter((value) => value.sourceRef.owner === 'CommercialAgreement')
                  .map((value) => [canonicalJson(value.sourceRef), value.sourceRef]),
              ).values(),
            ],
            conditionBindings,
          };
          await scope.assertPremises();
          await this.ingress(context, ingressProof);
          return result;
        });
      },
    );
  }
}
