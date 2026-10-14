import { randomUUID } from 'node:crypto';
import type {
  Ref,
  U4AgreementPlanInput,
  U4OrderInput,
  U4PaymentPlanDraft,
  U4PlanProposalInput,
  U4ApplyPlanInput,
  U3ConsentInput,
} from '@oms/contracts';
import {
  CommercialAgreement,
  StaffAccess,
  U3StaffAccess,
  U3CustomerAccess,
  U3ProductCatalog,
  U4CommercialAdapter,
  U4CommercialOrder,
  U4PaymentPlan,
  U4PlanProposal,
} from '@oms/core';
import type { U4ReadinessRegistration, U3RenewalRegistration } from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import {
  seedAgreementAuthority,
  syntheticCommercialEvidence,
} from '../../u3/fixtures/agreement.js';
import { consentRoleInput } from '../../u3/fixtures/consent-role.js';
import { catalogInput } from '../../u3/fixtures/catalog.js';
import { fixtureScope } from '../../u3/fixtures/identity.js';
import { agreementApprovalInput } from '../../u3/fixtures/agreement-input.js';
import { resolveConditionBindings } from '../../../packages/core/src/commercial-terms.js';
import { u4Plan } from './contracts.js';

// U1/U2 실권한·MFA와 U3 소유자 등록 경로를 재사용한다. 운영 은행/이행 생산자의 등록 증거가 아니다.
export interface U4FixtureShape {
  lineCount?: 1 | 100;
  obligationCount?: 2 | 100;
  onPreparationStage?: (stage: 'SUBMIT_ORDER' | 'ACCEPT_ORDER') => void;
}
export async function seedU4CommercialPlan(
  store: ProtectedStore,
  software = false,
  agreedEndAt: string | null = null,
  shape: U4FixtureShape = {},
) {
  const lineCount = shape.lineCount ?? 1;
  const total = (1000n * BigInt(lineCount)).toString();
  const f = await seedAgreementAuthority(store);
  const ingress = 'synthetic-private-ingress';
  const meta = (revision: number | null = null) => ({
    clientRequestId: randomUUID(),
    expectedRevision: revision,
    reason: 'U4 격리 합성 지급 계획',
    evidenceRefs: [] as Ref[],
  });
  const role = await new U3StaffAccess(store, f.seller.now).defineRole(
    await f.requestContext(f.seller.staff),
    {
      meta: meta(),
      label: 'U4 합성 제안·적용',
      actions: ['contract.propose', 'order.change.apply'],
    },
  );
  await new StaffAccess(store, f.seller.now).grantRole(await f.requestContext(f.seller.staff), {
    meta: meta(),
    accountRef: f.registrant.actorAccountRef!,
    roleRef: role.targetRef!,
    decision: 'GRANT',
  });
  const customerRoles = new U3CustomerAccess(f.seller.access, f.seller.now);
  const consentRole = await customerRoles.defineRole(
    await f.requestContext(f.seller.customer),
    consentRoleInput(f.seller.enterpriseRef),
  );
  const grantConsent = async () =>
    f.seller.access.grantCustomerRole(
      await f.requestContext(f.seller.customer),
      f.seller.enterpriseRef,
      {
        meta: meta(),
        accountRef: f.seller.customer.actorAccountRef!,
        roleRef: consentRole.targetRef!,
        decision: 'GRANT',
      },
    );
  let productRef = f.productRef,
    offerRef = f.offerRef;
  if (software) {
    const draft = catalogInput(f.offerRef);
    draft.meta = meta();
    draft.productType = 'SOFTWARE';
    draft.softwareTermKind = 'PERPETUAL';
    const created = await new U3ProductCatalog(
      store,
      f.seller.now,
      async (proof) => proof === ingress,
    ).register(await f.requestContext(f.registrant), draft, null, ingress);
    productRef = created.targetRef!;
    offerRef = (await store.currentProtected('Product', productRef.id))!.currentOfferRef as Ref;
  }
  const targetScope = {
    ...fixtureScope(),
    enterpriseRef: f.seller.enterpriseRef,
    contextPolicyRef: f.seller.enterpriseRef,
    organisationRevision: f.seller.enterpriseRef.revision,
  };
  const agreement = new CommercialAgreement(
    store,
    f.seller.now,
    async (proof) => proof === ingress,
    syntheticCommercialEvidence,
  );
  const input = f.input();
  if (agreedEndAt !== null)
    input.effectiveWindow = { ...input.effectiveWindow, endAt: agreedEndAt, endInclusive: false };
  input.productRefs = [productRef];
  input.commercialTermsRef = offerRef;
  input.provisionTermsRef = offerRef;
  input.conditions = [
    {
      conditionKey: 'PAYMENT',
      value: { mode: 'PREPAY', termsRef: offerRef },
      effectiveWindow: input.effectiveWindow,
      evidenceRefs: input.agreementEvidenceRefs,
    },
  ];
  const original = await agreement.register(await f.requestContext(f.registrant), input, ingress);
  const adapter = new U4CommercialAdapter(
    store,
    f.seller.now,
    async (proof) => proof === ingress,
    syntheticCommercialEvidence,
  );
  const plans = new U4PaymentPlan(adapter);
  function planDraft(): U4PaymentPlanDraft {
    const p = u4Plan();
    const obligations =
      shape.obligationCount === 100
        ? Array.from({ length: 100 }, (_, index) => ({
            ...p.obligations[0]!,
            obligationKey: 'synthetic-obligation-' + index,
            label: '합의 지급 의무 ' + (index + 1),
            amount: { currency: 'KRW' as const, value: (BigInt(total) / 100n).toString() },
          }))
        : p.obligations.map((value) => ({
            ...value,
            amount: {
              currency: 'KRW' as const,
              value: (BigInt(value.amount.value) * BigInt(lineCount)).toString(),
            },
          }));
    return {
      planRevision: 1,
      total: { currency: 'KRW', value: total },
      knowledge: 'KNOWN',
      obligations: obligations.map((obligation) => ({
        ...obligation,
        agreementEvidenceRefs: input.agreementEvidenceRefs,
        dueBasis:
          obligation.dueBasis.kind === 'FIXED_DATE'
            ? obligation.dueBasis
            : { ...obligation.dueBasis, ruleRef: offerRef },
      })),
    };
  }
  const registration = (draft = planDraft()): U4AgreementPlanInput => ({
    meta: meta(original.targetRef!.revision),
    enterpriseRef: f.seller.enterpriseRef,
    sourceAgreementRevisionRef: original.targetRef!,
    planDraft: draft,
  });
  const registered = await plans.register(
    await f.requestContext(f.registrant),
    registration(),
    ingress,
  );
  const approval = () => agreementApprovalInput(registered.targetRef!, input.agreementEvidenceRefs);
  const approve = async () =>
    plans.approve(await f.requestContext(f.approver), approval(), ingress);
  const registrations = (): U4ReadinessRegistration[] =>
    (['FinancialSettlement', software ? 'SoftwareLifecycle' : 'HardwareFulfillment'] as const).map(
      (owner) => ({
        kind: 'LOCAL_SYNTHETIC',
        owner,
        ownerRegistration: 'u4-synthetic-' + owner,
        async readReadiness(binding) {
          const sourceRef: Ref = {
            owner,
            entity:
              owner === 'FinancialSettlement'
                ? 'FinancialEligibility'
                : software
                  ? 'SoftwareSupplyAssessment'
                  : 'HardwareSupplyAssessment',
            id: 'u4-synthetic-' + owner,
            revision: 1,
          };
          return {
            binding,
            knowledge: 'KNOWN',
            sourceRef,
            sourceRefs: [sourceRef],
            lines: binding.lines.map((line) => ({
              lineRef: line.lineRef,
              knowledge: 'KNOWN',
              readyQuantity: line.quantity,
              activationResolution: 'NOT_REQUIRED',
            })),
            observedAt: f.seller.now().toISOString(),
            expiresAt: new Date(f.seller.now().getTime() + 30000).toISOString(),
          };
        },
      }),
    );
  const orders = (readiness = registrations(), renewal?: U3RenewalRegistration) =>
    new U4CommercialOrder(adapter, renewal, readiness);
  async function orderInput(planRef: Ref): Promise<U4OrderInput> {
    const offer = (await store.currentProtected('CommonOfferRevision', offerRef.id))!;
    const current = (await store.currentProtected('AgreementRevision', planRef.id))!;
    const bindings = resolveConditionBindings(
      offer.conditionBindings as import('@oms/contracts').ConditionBinding[],
      [current],
      f.seller.now(),
    );
    return {
      meta: meta(),
      targetScope,
      productType: software ? 'SOFTWARE' : 'HARDWARE',
      provisionChoice: 'FULL',
      partialConsentRef: null,
      paymentPlanRef: planRef,
      renewal: null,
      lines: Array.from({ length: lineCount }, () => ({
        productRef,
        commonOfferRevisionRef: offerRef,
        quantity: 1,
        conditionBindings: bindings,
        agreementRevisionRefs: [planRef],
        requestedActivationDate: null,
      })),
      priceConfirmation: {
        confirmedByRef: f.registrant.actorAccountRef!,
        evidenceRefs: input.agreementEvidenceRefs,
        priceBreakdown: {
          knowledge: 'KNOWN',
          lineAmounts: Array.from({ length: lineCount }, () => ({
            currency: 'KRW',
            value: '1000',
          })),
          productAmount: { currency: 'KRW', value: total },
          adjustments: [],
          total: { currency: 'KRW', value: total },
        },
      },
    };
  }
  const proposals = new U4PlanProposal(adapter);
  async function proposalInput(orderRef: Ref, planRef: Ref): Promise<U4PlanProposalInput> {
    const submitted = (await store.currentProtected('Order', orderRef.id))!;
    const snapshotRef = submitted.purchaseTermsRef as Ref;
    const proposed = await orderInput(planRef);
    const line = proposed.lines[0]!;
    return {
      meta: meta(),
      targetScope,
      targetOrderRef: orderRef,
      targetEntitlementRef: null,
      targetRenewalCycleRef: null,
      originalTermsRef: snapshotRef,
      proposedTermsRef: planRef,
      proposedTerms: {
        termsRecordRef: planRef,
        lines: [
          {
            productRef,
            quantity: 1,
            price: { currency: 'KRW', value: '1000' },
            period: null,
            conditionRefs: [
              ...new Map(
                line.conditionBindings.map((binding) => [
                  JSON.stringify(binding.sourceRef),
                  binding.sourceRef,
                ]),
              ).values(),
            ],
          },
        ],
      },
      priceBreakdown: proposed.priceConfirmation!.priceBreakdown,
      supersedesRef: null,
      agreementEvidenceRefs: input.agreementEvidenceRefs,
      paymentPlanRef: planRef,
    };
  }
  async function consentInput(proposalRef: Ref): Promise<U3ConsentInput> {
    const proposal = (await store.currentProtected('CommercialProposal', proposalRef.id))!;
    return {
      meta: meta(proposalRef.revision),
      targetScope,
      proposalRef,
      proposalRevision: Number(proposal.proposalRevision),
      termsFingerprint: String(proposal.termsFingerprint),
      decision: 'ACCEPT',
    };
  }
  const application = (orderRef: Ref, consentRef: Ref, planRef: Ref): U4ApplyPlanInput => ({
    meta: meta(orderRef.revision),
    targetScope,
    orderRef,
    customerConsentRef: consentRef,
    newTermsRef: planRef,
    changeKind: 'REVIEW_PAYMENT_PLAN_CHANGE',
    afterSalesDecisionRef: null,
  });
  return {
    ...f,
    productRef,
    offerRef,
    ingress,
    meta,
    targetScope,
    adapter,
    plans,
    planDraft,
    registration,
    registered,
    approval,
    approve,
    orders,
    orderInput,
    proposals,
    proposalInput,
    consentInput,
    application,
    grantConsent,
    evidence: input.agreementEvidenceRefs,
  };
}
