import type {
  Ref,
  U4InvoiceInput,
  U4PaymentEvidenceInput,
  U4ConfirmPaymentInput,
  U4AllocationBatchInput,
  U4Evidence,
  U4PaymentIdentity,
} from '@oms/contracts';
import { canonicalJson } from '@oms/contracts';
import {
  StaffAccess,
  U4StaffAccess,
  U4FinancialCommands,
  U4FinancialAccess,
  U4FinancialSource,
} from '@oms/core';
import type { U4PaymentSourceProfile, U4FinancialImpactRegistration } from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import { seedU4CommercialPlan } from './commercial-plan.js';
import type { U4FixtureShape } from './commercial-plan.js';

// 격리 합성 원본이다. 입력을 그대로 확인으로 반사하지 않고 별도로 등록한 실제값과 대조한다.
export async function seedU4FinancialFlow(
  store: ProtectedStore,
  agreedEndAt: string | null = null,
  shape: U4FixtureShape = {},
) {
  const f = await seedU4CommercialPlan(store, false, agreedEndAt, shape);
  const roles = new U4StaffAccess(store, f.seller.now, async (proof) => proof === f.ingress);
  const role = await roles.defineRole(
    await f.requestContext(f.seller.staff),
    {
      meta: f.meta(),
      label: '합성 금융 등록',
      actions: ['financial.read', 'financial.manage'],
    },
    f.ingress,
  );
  const grantInput = {
    meta: f.meta(),
    accountRef: f.registrant.actorAccountRef!,
    roleRef: role.targetRef!,
    decision: 'GRANT' as const,
  };
  const grant = await new StaffAccess(store, f.seller.now).grantRole(
    await f.requestContext(f.seller.staff),
    grantInput,
  );
  const approved = await f.approve();
  async function acceptedOrder() {
    shape.onPreparationStage?.('SUBMIT_ORDER');
    const submitted = await f
      .orders()
      .submit(await f.requestContext(f.seller.customer), await f.orderInput(approved.targetRef!));
    shape.onPreparationStage?.('ACCEPT_ORDER');
    return (
      await f.orders().decide(
        await f.requestContext(f.registrant),
        {
          meta: f.meta(1),
          targetRef: submitted.targetRef!,
          targetScope: f.targetScope,
          decision: 'ACCEPT',
          basisRefs: [],
        },
        f.ingress,
      )
    ).targetRef!;
  }
  const orderRef = await acceptedOrder();
  const plan = (await store.currentProtected('Order', orderRef.id))!
    .paymentPlan as import('@oms/contracts').U4AgreedPaymentPlan;
  const actor = () => f.requestContext(f.registrant);
  const evidence = (documentReference = 'u4-synthetic-document'): U4Evidence => ({
    documentReference,
    verifiedByRef: f.registrant.actorAccountRef!,
    verifiedAt: f.seller.now().toISOString(),
    summary: '격리 원본 확인',
  });
  const identity = (key = 'u4-synthetic-transaction', revision = 1): U4PaymentIdentity => ({
    sourceProfileId: 'u4-synthetic-bank',
    sourceProfileRevision: revision,
    sourceNamespace: 'u4-synthetic-bank-namespace',
    canonicalIdentity: key,
    aliases: ['alias-' + key],
  });
  type Truth = {
    identity: U4PaymentIdentity;
    value: string;
    actualPaidAt: string;
    state: 'CONFIRMED' | 'REVOKED';
    enterpriseId: string;
  };
  const truths = new Map<string, Truth>();
  const registerTruth = (
    document: string,
    value = '100',
    transaction = identity(),
    enterpriseId = f.seller.enterpriseRef.id,
  ) => {
    const truth: Truth = {
      identity: transaction,
      value,
      actualPaidAt: f.seller.now().toISOString(),
      state: 'CONFIRMED',
      enterpriseId,
    };
    truths.set(document, truth);
    return truth;
  };
  const profiles: U4PaymentSourceProfile[] = [1, 2].map((revision) => ({
    kind: 'LOCAL_SYNTHETIC',
    profileId: 'u4-synthetic-bank',
    revision,
    namespace: 'u4-synthetic-bank-namespace',
    async verify(binding) {
      const truth = truths.get(binding.evidence.documentReference);
      const matches =
        truth &&
        truth.value === binding.amount.value &&
        binding.amount.currency === 'KRW' &&
        truth.actualPaidAt === binding.actualPaidAt &&
        canonicalJson(truth.identity) === canonicalJson(binding.identity) &&
        binding.enterpriseRef.id === truth.enterpriseId;
      return {
        binding,
        knowledge: matches ? 'KNOWN' : 'UNKNOWN',
        state: matches ? truth.state : 'UNCONFIRMED',
        observedAt: f.seller.now().toISOString(),
        expiresAt: new Date(f.seller.now().getTime() + 30000).toISOString(),
      };
    },
  }));
  const impacts: U4FinancialImpactRegistration[] = [
    {
      kind: 'LOCAL_SYNTHETIC',
      owner: 'HardwareFulfillment',
      async read(binding) {
        return {
          binding,
          knowledge: 'KNOWN',
          clear: true,
          sourceRefs: [
            {
              owner: 'HardwareFulfillment',
              entity: 'HardwareHistory',
              id: 'u4-synthetic-no-progress',
              revision: 1,
            },
          ],
          observedAt: f.seller.now().toISOString(),
          expiresAt: new Date(f.seller.now().getTime() + 30000).toISOString(),
        };
      },
    },
  ];
  const access = new U4FinancialAccess(f.adapter);
  const commands = (registered = true, effects = true) =>
    new U4FinancialCommands(
      access,
      new U4FinancialSource(
        store,
        f.seller.now,
        registered ? profiles : [],
        effects ? impacts : [],
      ),
    );
  const financial = commands();
  async function invoiceInput(index: number, targetOrder = orderRef): Promise<U4InvoiceInput> {
    const order = (await store.currentProtected('Order', targetOrder.id))!;
    const obligation = plan.obligations[index]!;
    return {
      meta: f.meta(targetOrder.revision),
      targetScope: f.targetScope,
      orderRef: targetOrder,
      chargeTermsRef: order.purchaseTermsRef as Ref,
      planRevision: plan.planRevision,
      obligationKey: obligation.obligationKey,
      label: obligation.label,
      amount: obligation.amount,
      dueBasis: obligation.dueBasis,
      renewalCycleRefs: [],
      sourceEvidence: evidence(),
      correctionOf: null,
    };
  }
  const invoices = async () => {
    const first = await financial.registerInvoice(await actor(), await invoiceInput(0), f.ingress);
    const second = await financial.registerInvoice(await actor(), await invoiceInput(1), f.ingress);
    return [first.targetRef!, second.targetRef!];
  };
  const recordInput = (
    document = 'u4-synthetic-payment',
    targetOrder: Ref | null = orderRef,
  ): U4PaymentEvidenceInput => ({
    meta: f.meta(),
    targetScope: f.targetScope,
    enterpriseRef: f.seller.enterpriseRef,
    sourceEvidence: evidence(document),
    amount: { currency: 'KRW', value: '100' },
    actualPaidAt: f.seller.now().toISOString(),
    identity: null,
    orderRef: targetOrder,
    correctionOf: null,
  });
  const confirmInput = (
    paymentRef: Ref,
    document = 'u4-synthetic-payment',
  ): U4ConfirmPaymentInput => {
    const truth = truths.get(document)!;
    return {
      meta: f.meta(paymentRef.revision),
      targetScope: f.targetScope,
      paymentEvidenceRef: paymentRef,
      sourceEvidence: evidence(document),
      amount: { currency: 'KRW', value: truth.value },
      actualPaidAt: truth.actualPaidAt,
      identity: truth.identity,
    };
  };
  async function payment(
    document = 'u4-synthetic-payment',
    transaction = identity(),
    targetOrder: Ref | null = orderRef,
  ) {
    registerTruth(document, '100', transaction);
    const input = recordInput(document, targetOrder);
    const recorded = await financial.recordPaymentEvidence(await actor(), input, f.ingress);
    const confirmed = await financial.confirmPaymentEvidence(
      await actor(),
      confirmInput(recorded.targetRef!, document),
      f.ingress,
    );
    return { input, recorded, confirmed };
  }
  const allocationInput = (
    paymentRef: Ref,
    invoiceRefs: Ref[],
    values = ['60', '40'],
    targetOrder = orderRef,
  ): U4AllocationBatchInput => ({
    meta: f.meta(paymentRef.revision),
    targetScope: f.targetScope,
    orderRef: targetOrder,
    paymentEvidenceRef: paymentRef,
    items: invoiceRefs.map((invoiceRef, index) => ({
      invoiceRef,
      amount: { currency: 'KRW', value: values[index]! },
    })),
    renewalCycleRefs: [],
    sourceEvidence: evidence(),
  });
  return {
    ...f,
    financial,
    commands,
    access,
    role,
    grant,
    grantInput,
    actor,
    approved,
    orderRef,
    plan,
    evidence,
    identity,
    registerTruth,
    acceptedOrder,
    invoiceInput,
    invoices,
    recordInput,
    confirmInput,
    payment,
    allocationInput,
  };
}
