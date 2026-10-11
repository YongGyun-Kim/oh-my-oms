import { randomUUID } from 'node:crypto';
import { canonicalJson } from '@oms/contracts';
import type { TargetScope, U3ProposalInput, U3ProposalTerms } from '@oms/contracts';
import { CommercialAgreement, StaffAccess, U3StaffAccess, U3CustomerAccess } from '@oms/core';
import type { ProtectedStore, ModelData } from '@oms/persistence';
import { U3_SOURCE_CONTRACT } from '@oms/persistence';
import { seedAgreementAuthority, syntheticCommercialEvidence } from './agreement.js';
import { agreementApprovalInput } from './agreement-input.js';
import { catalogInput } from './catalog.js';
import { buildCommonOffer } from '../../../packages/core/src/catalog-conditions.js';
import { fixtureMeta } from './commercial.js';
import { fixtureRef, fixtureScope } from './identity.js';
import { modelFixture } from './models.js';
import { consentRoleInput } from './consent-role.js';
import { registeredProposalInput } from './proposal-input.js';

// 주문/카탈로그/U6 자료는 로컬 합성 원본이다. U3 실제 보호/권한 경계를 시험하며 U4~U7 운영 완료 증거가 아니다.
export async function seedProposalAuthority(store: ProtectedStore, software = false) {
  const f = await seedAgreementAuthority(store),
    ingress = 'synthetic-private-ingress',
    meta = (revision: number | null = null) => ({
      ...fixtureMeta(revision),
      clientRequestId: randomUUID(),
    });
  const staffRole = await new U3StaffAccess(store, f.seller.now).defineRole(
    await f.requestContext(f.seller.staff),
    {
      meta: meta(),
      label: '합성 제안·조회 직원',
      actions: ['contract.propose', 'order.read'],
    },
  );
  await new StaffAccess(store, f.seller.now).grantRole(await f.requestContext(f.seller.staff), {
    meta: meta(),
    accountRef: f.registrant.actorAccountRef!,
    roleRef: staffRole.targetRef!,
    decision: 'GRANT',
  });
  const roles = new U3CustomerAccess(f.seller.access, f.seller.now);
  const consentRole = await roles.defineRole(
    await f.requestContext(f.seller.customer),
    consentRoleInput(f.seller.enterpriseRef),
  );
  async function grant(decision: 'GRANT' | 'REVOKE' = 'GRANT') {
    return f.seller.access.grantCustomerRole(
      await f.requestContext(f.seller.customer),
      f.seller.enterpriseRef,
      {
        meta: meta(decision === 'GRANT' ? null : 1),
        accountRef: f.seller.customer.actorAccountRef!,
        roleRef: consentRole.targetRef!,
        decision,
      },
    );
  }
  const targetScope: TargetScope = {
    ...fixtureScope(),
    enterpriseRef: f.seller.enterpriseRef,
    contextPolicyRef: f.seller.enterpriseRef,
    organisationRevision: f.seller.enterpriseRef.revision,
  };
  let productRef = f.productRef,
    offerRef = f.offerRef;
  if (software) {
    productRef = fixtureRef('ProductCatalog', 'Product', randomUUID());
    offerRef = fixtureRef('ProductCatalog', 'CommonOfferRevision', randomUUID());
    const input = {
      ...catalogInput(offerRef),
      productType: 'SOFTWARE' as const,
      softwareTermKind: 'PERPETUAL' as const,
    };
    const built = buildCommonOffer(store, input, productRef, offerRef, f.seller.now());
    await store.execute(
      {
        principalId: 'synthetic-proposal-software',
        audience: 'SYSTEM',
        owner: 'ProductCatalog',
        operation: 'fixture-proposal-software',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
        sourceContract: U3_SOURCE_CONTRACT,
      },
      async (tx) => {
        await tx.put('Product', built.product);
        await tx.put('CommonOfferRevision', built.offer!);
      },
    );
  }
  const offer = (await store.currentProtected('CommonOfferRevision', offerRef.id))!;
  const line = {
    productRef,
    commonOfferRevisionRef: offerRef,
    agreementRevisionRefs: [],
    conditionBindings: offer.conditionBindings,
    quantity: 1,
    paymentMode: 'PREPAY',
    requestedActivationDate: null,
    purchasePrice: { currency: 'KRW', value: '1000' },
    priceKnowledge: 'KNOWN',
    paymentTermsRef: offerRef,
    agreedPeriod: null,
    completionBasisRef: offerRef,
  };
  const price = {
    lineAmounts: [{ currency: 'KRW', value: '1000' }],
    productAmount: { currency: 'KRW', value: '1000' },
    adjustments: [],
    total: { currency: 'KRW', value: '1000' },
    knowledge: 'KNOWN',
  };
  const orderRef = fixtureRef('OrderAcceptance', 'Order', randomUUID()),
    snapshotRef = fixtureRef('OrderAcceptance', 'PurchaseTermsSnapshot', randomUUID()),
    lineRef = fixtureRef('OrderAcceptance', 'OrderLine', randomUUID()),
    provisionRef = fixtureRef('OrderAcceptance', 'ProvisionChoice', randomUUID());
  const order: ModelData = {
    ...modelFixture('Order'),
    orderId: orderRef.id,
    enterpriseRef: targetScope.enterpriseRef,
    requesterAccountRef: f.seller.customer.actorAccountRef,
    targetScope,
    purchaseTermsRef: snapshotRef,
    lineRefs: [lineRef],
    provisionChoiceRef: provisionRef,
    acceptanceRef: null,
    productType: software ? 'SOFTWARE' : 'HARDWARE',
    changeApplicationRefs: [],
    state: 'REVIEW',
    revision: 1,
  };
  const orderLine: ModelData = {
    modelVersion: 2,
    lineId: lineRef.id,
    orderRef,
    productRef,
    commonOfferRevisionRef: offerRef,
    quantity: line.quantity,
    requestedPaymentMode: line.paymentMode,
    requestedActivationDate: line.requestedActivationDate,
    purchasePrice: line.purchasePrice,
    priceKnowledge: line.priceKnowledge,
    paymentTermsRef: line.paymentTermsRef,
    agreedPeriod: line.agreedPeriod,
    completionBasisRef: line.completionBasisRef,
    position: 1,
    agreementRevisionRefs: line.agreementRevisionRefs,
    conditionBindings: line.conditionBindings,
    revision: 1,
  };
  const provision: ModelData = {
    modelVersion: 2,
    provisionChoiceId: provisionRef.id,
    orderRef,
    choice: 'FULL',
    consentRef: null,
    effectiveRevisionRef: snapshotRef,
    revision: 1,
  };
  const snapshot: ModelData = {
    modelVersion: 2,
    purchaseTermsId: snapshotRef.id,
    orderRef,
    catalogRevisionRefs: [offerRef],
    agreementRevisionRefs: [],
    conditionBindings: line.conditionBindings,
    capturedLines: [line],
    priceBreakdown: price,
    capturedAt: f.seller.now().toISOString(),
    revision: 1,
  };
  await store.execute(
    {
      principalId: 'synthetic-proposal-order',
      audience: 'SYSTEM',
      owner: 'OrderAcceptance',
      operation: 'fixture-proposal-order',
      target: null,
      input: { synthetic: true },
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      epoch: await store.currentEpoch(),
      sourceContract: U3_SOURCE_CONTRACT,
    },
    async (tx) => {
      // 실제 내부 참조 그래프를 한 후보에 저장한다. 순환 FK는 기존 INITIALLY DEFERRED를 사용한다.
      await tx.put('Order', order);
      await tx.put('OrderLine', orderLine);
      await tx.put('ProvisionChoice', provision);
      await tx.put('PurchaseTermsSnapshot', snapshot);
    },
  );
  const agreement = new CommercialAgreement(
    store,
    f.seller.now,
    async (proof) => proof === ingress,
    syntheticCommercialEvidence,
  );
  async function input(): Promise<U3ProposalInput> {
    const resolved = await agreement.resolve(await f.requestContext(f.seller.customer), {
      targetScope,
      productRef,
      commonOfferRevisionRef: offerRef,
    });
    const source = resolved.conditionBindings.find((value) => value.conditionKey === 'PRICE')!;
    const selectedRef = source.sourceRef;
    const value = source.value as { currency: 'KRW'; value: string };
    return registeredProposalInput<U3ProposalInput>('createProposal', {
      meta: meta(),
      targetScope,
      targetOrderRef: orderRef,
      targetEntitlementRef: null,
      targetRenewalCycleRef: null,
      originalTermsRef: snapshotRef,
      proposedTermsRef: selectedRef,
      proposedTerms: {
        termsRecordRef: selectedRef,
        lines: [
          {
            productRef,
            quantity: 1,
            price: value,
            period: null,
            conditionRefs: [
              ...new Map(
                resolved.conditionBindings.map((value) => [
                  canonicalJson(value.sourceRef),
                  value.sourceRef,
                ]),
              ).values(),
            ],
          },
        ],
      },
      priceBreakdown: {
        lineAmounts: [value],
        productAmount: value,
        adjustments: [],
        total: value,
        knowledge: 'KNOWN',
      },
      supersedesRef: null,
      agreementEvidenceRefs: f.input().agreementEvidenceRefs,
    });
  }
  async function approvePrice() {
    const data = f.input();
    data.productRefs = [productRef];
    data.commercialTermsRef = offerRef;
    data.provisionTermsRef = offerRef;
    const registered = await agreement.register(
      await f.requestContext(f.registrant),
      data,
      ingress,
    );
    return agreement.approve(
      await f.requestContext(f.approver),
      agreementApprovalInput(registered.targetRef!, data.agreementEvidenceRefs),
      ingress,
    );
  }
  const renewalTerms: U3ProposalTerms = {
    termsRecordRef: fixtureRef('CommercialAgreement', 'AgreementRevision', randomUUID()),
    lines: [
      {
        productRef,
        quantity: 1,
        price: { currency: 'KRW', value: '1000' },
        period: null,
        conditionRefs: [offerRef],
      },
    ],
  };
  return {
    ...f,
    ingress,
    meta,
    targetScope,
    productRef,
    offerRef,
    orderRef,
    snapshotRef,
    order,
    snapshot,
    input,
    agreement,
    approvePrice,
    roles,
    consentRole,
    grant,
    renewalTerms,
  };
}
