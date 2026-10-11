import { randomUUID } from 'node:crypto';
import type { Money, Ref, U3OrderDecisionInput, U3OrderInput } from '@oms/contracts';
import { U3OrderAcceptance } from '@oms/core';
import type {
  U3ReadinessBinding,
  U3ReadinessObservation,
  U3ReadinessOwner,
  U3ReadinessRegistration,
} from '@oms/core';
import { U3_SOURCE_CONTRACT } from '@oms/persistence';
import type { ProtectedStore } from '@oms/persistence';
import { seedProposalAuthority } from './proposal.js';
import { syntheticCommercialEvidence } from './agreement.js';
import { registeredOrderInput } from './order-input.js';
import { buildCommonOffer } from '../../../packages/core/src/catalog-conditions.js';
import { catalogInput } from './catalog.js';

// 실제 등록 submit 생산자를 사용하는 로컬 fixture다. 소유자 callback은 운영 원본의 증거가 아니다.
export async function seedDecisionOrder(
  store: ProtectedStore,
  count = 1,
  confirmedPrice = true,
  software = false,
  term = false,
) {
  const f = await seedProposalAuthority(store, software);
  const evidence = (await f.input()).agreementEvidenceRefs;
  if (term) {
    if (!software) throw new Error('기간제 fixture는 SW 주문이어야 합니다.');
    const productRef: Ref = { ...f.productRef, revision: f.productRef.revision + 1 },
      offerRef: Ref = {
        owner: 'ProductCatalog',
        entity: 'CommonOfferRevision',
        id: randomUUID(),
        revision: 1,
      };
    const draft = catalogInput(offerRef);
    draft.productType = 'SOFTWARE';
    draft.softwareTermKind = 'TERM';
    draft.offerDraft!.conditions.push({
      conditionKey: 'PERIOD',
      value: {
        startDate: '2026-12-01',
        endDate: '2027-11-30',
        timeZone: 'Asia/Seoul',
        endRule: 'INCLUSIVE_DATE',
        ruleRef: offerRef,
      },
      effectiveWindow: draft.offerDraft!.effectiveWindow,
      evidenceRefs: [offerRef],
    });
    const built = buildCommonOffer(store, draft, productRef, offerRef, f.seller.now());
    await store.execute(
      {
        principalId: 'synthetic-u3-term-source',
        audience: 'SYSTEM',
        owner: 'ProductCatalog',
        operation: 'fixture-term-source',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
        sourceContract: U3_SOURCE_CONTRACT,
      },
      async (tx) => {
        await tx.put('CommonOfferRevision', built.offer!);
        await tx.put('Product', built.product, f.productRef.revision);
      },
    );
    f.productRef = productRef;
    f.offerRef = offerRef;
  }
  const resolved = await f.agreement.resolve(f.seller.customer, {
    targetScope: f.targetScope,
    productRef: f.productRef,
    commonOfferRevisionRef: f.offerRef,
  });
  const price = resolved.conditionBindings.find((binding) => binding.conditionKey === 'PRICE');
  if (!price || price.conditionKey !== 'PRICE')
    throw new Error('실제 등록된 가격 조건이 필요합니다.');
  const amount: Money = {
    currency: 'KRW',
    value: (BigInt(price.value.value) * BigInt(count)).toString(),
  };
  const input: U3OrderInput = registeredOrderInput<U3OrderInput>('submitOrder', {
    meta: f.meta(),
    targetScope: f.targetScope,
    productType: software ? 'SOFTWARE' : 'HARDWARE',
    provisionChoice: 'FULL',
    partialConsentRef: null,
    lines: Array.from({ length: count }, () => ({
      productRef: f.productRef,
      commonOfferRevisionRef: f.offerRef,
      agreementRevisionRefs: resolved.agreementRevisionRefs,
      conditionBindings: resolved.conditionBindings,
      quantity: 1,
      paymentMode: 'PREPAY',
      requestedActivationDate: term ? '2026-11-25' : null,
    })),
    priceConfirmation: confirmedPrice
      ? {
          confirmedByRef: f.registrant.actorAccountRef!,
          evidenceRefs: evidence,
          priceBreakdown: {
            lineAmounts: Array.from({ length: count }, () => structuredClone(price.value)),
            productAmount: structuredClone(amount),
            adjustments: [],
            total: structuredClone(amount),
            knowledge: 'KNOWN',
          },
        }
      : null,
  });
  const submitter = new U3OrderAcceptance(
    store,
    f.seller.now,
    async (proof) => proof === f.ingress,
    syntheticCommercialEvidence,
  );
  const receipt = await submitter.submit(f.seller.customer, input);
  const sourceRefs: Record<U3ReadinessOwner, Ref> = {
    FinancialSettlement: {
      owner: 'FinancialSettlement',
      entity: 'FinancialEligibility',
      id: randomUUID(),
      revision: 1,
    },
    HardwareFulfillment: {
      owner: 'HardwareFulfillment',
      entity: 'HardwareSupplyAssessment',
      id: randomUUID(),
      revision: 1,
    },
    SoftwareLifecycle: {
      owner: 'SoftwareLifecycle',
      entity: 'SoftwareSupplyAssessment',
      id: randomUUID(),
      revision: 1,
    },
  };
  const observe = (binding: U3ReadinessBinding): U3ReadinessObservation => ({
    binding: structuredClone(binding),
    knowledge: 'KNOWN',
    sourceRef: structuredClone(sourceRefs[binding.owner]),
    sourceRefs: [structuredClone(sourceRefs[binding.owner])],
    lines: binding.lines.map((line) => ({
      lineRef: structuredClone(line.lineRef),
      knowledge: 'KNOWN',
      readyQuantity: line.quantity,
      activationResolution: 'NOT_REQUIRED',
    })),
    observedAt: f.seller.now().toISOString(),
    expiresAt: new Date(f.seller.now().getTime() + 30000).toISOString(),
  });
  const registrations = (
    change?: (value: U3ReadinessObservation) => void,
  ): U3ReadinessRegistration[] =>
    (['FinancialSettlement', software ? 'SoftwareLifecycle' : 'HardwareFulfillment'] as const).map(
      (owner) => ({
        kind: 'LOCAL_SYNTHETIC',
        owner,
        ownerRegistration: 'synthetic-' + owner,
        async readReadiness(binding) {
          const result = observe(binding);
          change?.(result);
          return result;
        },
      }),
    );
  const service = (sources: U3ReadinessRegistration[] = registrations()) =>
    new U3OrderAcceptance(
      store,
      f.seller.now,
      async (proof) => proof === f.ingress,
      syntheticCommercialEvidence,
      sources,
    );
  const decision = (
    kind: U3OrderDecisionInput['decision'] = 'ACCEPT',
    target = receipt.targetRef!,
  ): U3OrderDecisionInput =>
    registeredOrderInput<U3OrderDecisionInput>('decideOrder', {
      meta: f.meta(target.revision),
      targetRef: target,
      targetScope: f.targetScope,
      decision: kind,
      basisRefs: kind === 'REJECT' ? evidence : [],
    });
  return { ...f, input, receipt, sourceRefs, observe, registrations, service, decision, evidence };
}
