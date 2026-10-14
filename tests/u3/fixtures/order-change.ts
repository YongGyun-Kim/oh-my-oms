import { randomUUID } from 'node:crypto';
import type {
  Money,
  U3ApplyOrderChangeInput,
  U3OrderView,
  U3ProposalInput,
  U3ProposalView,
} from '@oms/contracts';
import { CommercialProposal, StaffAccess, U3OrderAcceptance, U3StaffAccess } from '@oms/core';
import type { U3AfterSalesRegistration } from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import { seedDecisionOrder } from './order-decision.js';
import { syntheticCommercialEvidence } from './agreement.js';
import { registeredOrderInput, orderQuery } from './order-input.js';
import { registeredProposalInput } from './proposal-input.js';

// 실제 생산자 흐름이다. 소유자/신원 근거는 여전히 로컬 합성이며 운영 확인을 주장하지 않는다.
export async function seedOrderChange(
  store: ProtectedStore,
  accepted = false,
  confirmedOriginal = true,
) {
  const f = await seedDecisionOrder(store, 1, confirmedOriginal);
  const role = await new U3StaffAccess(store, f.seller.now).defineRole(
    await f.requestContext(f.seller.staff),
    {
      meta: f.meta(),
      label: '합성 주문 변경 적용',
      actions: ['order.change.apply'],
    },
  );
  await new StaffAccess(store, f.seller.now).grantRole(await f.requestContext(f.seller.staff), {
    meta: f.meta(),
    accountRef: f.registrant.actorAccountRef!,
    roleRef: role.targetRef!,
    decision: 'GRANT',
  });
  const service = (afterSales?: U3AfterSalesRegistration) =>
    new U3OrderAcceptance(
      store,
      f.seller.now,
      async (proof) => proof === f.ingress,
      syntheticCommercialEvidence,
      f.registrations(),
      afterSales,
    );
  const orders = service();
  const orderRef = accepted
    ? (await orders.decide(await f.requestContext(f.registrant), f.decision(), f.ingress))
        .targetRef!
    : f.receipt.targetRef!;
  await f.approvePrice(); // 실제 다른 사람 승인 생산자로 1000원에서 기업 가격900원으로 바뀐다.
  const proposals = new CommercialProposal(
    store,
    f.seller.now,
    async (proof) => proof === f.ingress,
    syntheticCommercialEvidence,
  );
  async function proposalInput(target = orderRef): Promise<U3ProposalInput> {
    const orderView = (await orders.read(
      await f.requestContext(f.seller.customer),
      orderQuery(target, f.targetScope),
    )) as {
      data: U3OrderView;
    };
    const resolved = await f.agreement.resolve(await f.requestContext(f.seller.customer), {
      targetScope: f.targetScope,
      productRef: f.productRef,
      commonOfferRevisionRef: f.offerRef,
    });
    const price = resolved.conditionBindings.find((binding) => binding.conditionKey === 'PRICE');
    if (!price || price.conditionKey !== 'PRICE') throw new Error('가격 원본이 필요합니다.');
    const amount: Money = { currency: 'KRW', value: price.value.value };
    return registeredProposalInput<U3ProposalInput>('createProposal', {
      meta: f.meta(),
      targetScope: f.targetScope,
      targetOrderRef: target,
      targetEntitlementRef: null,
      targetRenewalCycleRef: null,
      originalTermsRef: orderView.data.currentTermsRef!,
      proposedTermsRef: price.sourceRef,
      proposedTerms: {
        termsRecordRef: price.sourceRef,
        lines: [
          {
            productRef: f.productRef,
            quantity: 1,
            price: structuredClone(price.value),
            period: null,
            conditionRefs: [
              ...new Map(
                resolved.conditionBindings.map((binding) => [
                  JSON.stringify(binding.sourceRef),
                  binding.sourceRef,
                ]),
              ).values(),
            ],
          },
        ],
      },
      priceBreakdown: {
        lineAmounts: [structuredClone(amount)],
        productAmount: structuredClone(amount),
        adjustments: [],
        total: structuredClone(amount),
        knowledge: 'KNOWN',
      },
      supersedesRef: null,
      agreementEvidenceRefs: f.evidence,
    });
  }
  const input = await proposalInput(),
    created = await proposals.create(await f.requestContext(f.registrant), input, f.ingress);
  const display = (await proposals.read(await f.requestContext(f.seller.customer), {
    targetRef: created.targetRef!,
    targetScope: f.targetScope,
  })) as { data: U3ProposalView };
  await f.grant();
  const consent = await proposals.recordConsent(await f.requestContext(f.seller.customer), {
    meta: f.meta(created.targetRef!.revision),
    targetScope: f.targetScope,
    proposalRef: created.targetRef!,
    proposalRevision: display.data.proposalRevision,
    termsFingerprint: display.data.termsFingerprint,
    decision: 'ACCEPT',
  });
  const consentRef = consent.resultRefs.find(
    (reference) => reference.entity === 'CustomerConsent',
  )!;
  const application = (target = orderRef): U3ApplyOrderChangeInput =>
    registeredOrderInput<U3ApplyOrderChangeInput>('applyApprovedChange', {
      meta: f.meta(target.revision),
      targetScope: f.targetScope,
      orderRef: target,
      customerConsentRef: consentRef,
      newTermsRef: input.proposedTermsRef,
      ...(accepted
        ? {
            changeKind: 'ACCEPTED_AFTERSALES_CHANGE',
            afterSalesDecisionRef: {
              owner: 'AfterSalesDecision',
              entity: 'AfterSalesDecisionRecord',
              id: randomUUID(),
              revision: 1,
            },
          }
        : { changeKind: 'REVIEW_PRICE_CHANGE', afterSalesDecisionRef: null }),
    });
  return {
    ...f,
    service,
    orders,
    orderRef,
    proposals,
    proposalInput,
    created,
    display: display.data,
    consent,
    consentRef,
    application,
  };
}
