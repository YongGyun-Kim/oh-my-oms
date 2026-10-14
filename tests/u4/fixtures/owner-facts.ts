import { canonicalJson } from '@oms/contracts';
import type {
  Ref,
  U4EligibilityInput,
  U4InvoiceDueInput,
  U4RestrictionInput,
} from '@oms/contracts';
import { U4Eligibility, U4InvoiceDue, U4OwnerSources } from '@oms/core';
import type {
  U4CompletionObservation,
  U4CompletionRegistration,
  U4CompletionFactView,
} from '@oms/core';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { seedU4FinancialFlow } from './financial-flow.js';

// 실제 U5 생산자 등록을 뜻하지 않는다. 정상 금융/사람/보호 원본 위에 격리 소유자 truth를 결합한다.
export async function seedU4OwnerFacts(store: ProtectedStore) {
  const f = await seedU4FinancialFlow(store);
  const order = (await store.currentProtected('Order', f.orderRef.id))!;
  const lines: ModelData[] = [];
  for (const reference of order.lineRefs as Ref[])
    lines.push((await store.currentProtected('OrderLine', reference.id))!);
  const aggregateRef: Ref = {
    owner: 'HardwareFulfillment',
    entity: 'HardwareFulfillmentCase',
    id: 'synthetic-u4-hardware-case',
    revision: 1,
  };
  const factRef: Ref = {
    owner: 'HardwareFulfillment',
    entity: 'HardwareHistory',
    id: 'synthetic-u4-completion-fact',
    revision: 7,
  };
  const completedAt = new Date(f.seller.now().getTime() - 86400000).toISOString();
  const truth: U4CompletionFactView = {
    requestedSourceFactRef: factRef,
    latestSourceFactRef: factRef,
    aggregateRef,
    latestSourceRevision: 1,
    providedTranches: lines.map((line, index) => ({
      trancheId: 'synthetic-u4-tranche-' + index,
      trancheRef: {
        owner: 'HardwareFulfillment',
        entity: 'ShipmentTranche',
        id: 'synthetic-u4-tranche-' + index,
        revision: 7,
      },
      orderRef: f.orderRef,
      orderLineRef: (order.lineRefs as Ref[])[index]!,
      termsSnapshotRef: order.purchaseTermsRef as Ref,
      completionBasis: 'HW_DELIVERY',
      completionState: 'COMPLETED',
      completedQuantity: Number(line.quantity),
      completedAt,
      hardwareDeliveredAt: completedAt,
      customerAcceptedAt: null,
      softwareIssuedAt: null,
      resultAvailableAt: null,
      contractualStartAt: null,
      sourceRevision: 1,
      correctionOf: null,
      correctedAt: null,
      evidenceRefs: [factRef],
    })),
    correctionRefs: [],
    coverage: 'CURRENT',
    observedAt: f.seller.now().toISOString(),
  };
  let change = (value: U4CompletionObservation) => value;
  const registration: U4CompletionRegistration = {
    kind: 'LOCAL_SYNTHETIC',
    owner: 'HardwareFulfillment',
    ownerRegistration: 'u4-actual-completion-synthetic',
    async readCompletion(binding) {
      const matches =
        canonicalJson(binding.orderRef) === canonicalJson(f.orderRef) &&
        canonicalJson(binding.targetScope) === canonicalJson(f.targetScope) &&
        canonicalJson(binding.termsSnapshotRef) === canonicalJson(order.purchaseTermsRef) &&
        binding.lines.length === lines.length &&
        binding.lines.every(
          (line, index) =>
            canonicalJson(line.lineRef) === canonicalJson((order.lineRefs as Ref[])[index]) &&
            line.quantity === Number(lines[index]!.quantity) &&
            canonicalJson(line.completionBasisRef) ===
              canonicalJson(lines[index]!.completionBasisRef),
        );
      return change({
        binding,
        knowledge: matches ? 'KNOWN' : 'CONFLICT',
        view: {
          ...structuredClone(truth),
          requestedSourceFactRef: binding.query.sourceFactRef,
          observedAt: f.seller.now().toISOString(),
        },
        confirmedFact: null,
        expiresAt: new Date(f.seller.now().getTime() + 30000).toISOString(),
      });
    },
  };
  const owners = new U4OwnerSources(store, f.seller.now, [registration]),
    eligibility = new U4Eligibility(f.access, owners),
    due = new U4InvoiceDue(f.access, owners);
  async function eligibilityInput(
    purpose: 'SALE_ACCEPTANCE' | 'PROVISION',
    orderRef = f.orderRef,
  ): Promise<U4EligibilityInput> {
    const current = (await store.currentProtected('Order', orderRef.id))!;
    return {
      meta: f.meta(orderRef.revision),
      targetScope: f.targetScope,
      orderRef,
      assessmentPurpose: purpose,
      agreementRevisionRef: (current.paymentPlan as typeof f.plan).agreementRevisionRef,
      planRevision: (current.paymentPlan as typeof f.plan).planRevision,
      orderLineRefs: current.lineRefs as Ref[],
      renewalCycleRefs: current.renewalCycleRef ? [current.renewalCycleRef as Ref] : [],
    };
  }
  const restrictionInput = (
    effect: 'RESTRICT' | 'RELEASE',
    purpose: 'SALE_ACCEPTANCE' | 'PROVISION' = 'PROVISION',
  ): U4RestrictionInput => ({
    meta: f.meta(f.orderRef.revision),
    targetScope: f.targetScope,
    orderRef: f.orderRef,
    restrictionKey: 'synthetic-contract-limit',
    assessmentPurpose: purpose,
    effect,
    agreementRevisionRef: f.plan.agreementRevisionRef,
    sourceEvidence: f.evidence('synthetic-manual-restriction'),
  });
  const dueInput = (invoiceRef: Ref): U4InvoiceDueInput => ({
    meta: f.meta(invoiceRef.revision),
    targetScope: f.targetScope,
    orderRef: f.orderRef,
    invoiceRef,
    completionQuery: {
      sourceFactRef: truth.latestSourceFactRef,
      aggregateRef: truth.aggregateRef,
      minimumSourceRevision: truth.latestSourceRevision,
    },
    sourceEvidence: f.evidence('synthetic-owner-fact-check'),
  });
  const advance = (instant = completedAt) => {
    const original = structuredClone(truth);
    truth.latestSourceRevision += 1;
    truth.aggregateRef = { ...truth.aggregateRef, revision: truth.latestSourceRevision };
    truth.latestSourceFactRef = {
      ...truth.latestSourceFactRef,
      revision: truth.latestSourceFactRef.revision + 4,
    };
    truth.correctionRefs = original.providedTranches.map((value) => value.trancheRef);
    truth.providedTranches = original.providedTranches.map((value) => ({
      ...value,
      sourceRevision: value.sourceRevision + 1,
      trancheRef: { ...value.trancheRef, revision: value.trancheRef.revision + 4 },
      correctionOf: value.trancheRef,
      correctedAt: f.seller.now().toISOString(),
      completedAt: instant,
      hardwareDeliveredAt: instant,
    }));
  };
  return {
    ...f,
    order,
    lines,
    truth,
    eligibility,
    due,
    owners,
    eligibilityInput,
    restrictionInput,
    dueInput,
    advance,
    changeObservation: (transform: typeof change) => {
      change = transform;
    },
  };
}
