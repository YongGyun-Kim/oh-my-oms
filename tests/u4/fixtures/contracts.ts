import type {
  Ref,
  TargetScope,
  U4AgreedPaymentPlan,
  U4AllocationBatchInput,
  U4Evidence,
} from '@oms/contracts';

export const u4Ref = (owner: string, entity: string, id = 'synthetic', revision = 1): Ref => ({
  owner,
  entity,
  id,
  revision,
});
export const u4Money = (value: string) => ({ currency: 'KRW' as const, value });
export function u4Scope(): TargetScope {
  return {
    enterpriseRef: u4Ref('EnterpriseAccess', 'Enterprise', 'pilot-a'),
    departmentRef: null,
    siteRef: null,
    contextPolicyRef: u4Ref('EnterpriseAccess', 'Enterprise', 'pilot-a'),
    organisationRevision: 1,
  };
}
export function u4Evidence(): U4Evidence {
  return {
    documentReference: 'synthetic-document-only',
    verifiedByRef: u4Ref('IdentityRecovery', 'Account', 'staff-verifier'),
    verifiedAt: '2026-12-01T00:00:00Z',
    summary: '격리 합성 원본 확인',
  };
}
export function u4Plan(): U4AgreedPaymentPlan {
  return {
    planRevision: 1,
    total: u4Money('1000'),
    obligations: [
      {
        obligationKey: 'first',
        label: '제공 전 약정',
        amount: u4Money('200'),
        description: '합성 사전 지급 의무',
        dueBasis: { kind: 'FIXED_DATE', date: '2026-12-01' },
        requiredBeforeProvision: true,
        agreementEvidenceRefs: [u4Ref('CommercialAgreement', 'AgreementRevision')],
      },
      {
        obligationKey: 'second',
        label: '설치 검수 후 약정',
        amount: u4Money('800'),
        description: '합성 완료 후 지급 의무',
        dueBasis: {
          kind: 'CONFIRMED_FACT_PLUS_DAYS',
          sourceOwner: 'HardwareFulfillment',
          event: 'ACTUAL_PROVISION_COMPLETION',
          ruleRef: u4Ref('CommercialAgreement', 'AgreementRevision'),
          calendar: 'KST_CALENDAR_DAYS',
          days: 30,
        },
        requiredBeforeProvision: false,
        agreementEvidenceRefs: [u4Ref('CommercialAgreement', 'AgreementRevision')],
      },
    ],
    agreementRevisionRef: u4Ref('CommercialAgreement', 'AgreementRevision'),
    agreementApprovalRef: u4Ref('CommercialAgreement', 'AgreementApproval'),
    customerConsentRef: null,
    knowledge: 'KNOWN',
  };
}
export function u4Allocation(count = 2): U4AllocationBatchInput {
  return {
    meta: {
      clientRequestId: 'synthetic-request',
      expectedRevision: 1,
      reason: '합성 수동 배분',
      evidenceRefs: [],
    },
    targetScope: u4Scope(),
    orderRef: u4Ref('OrderAcceptance', 'Order'),
    paymentEvidenceRef: u4Ref('FinancialSettlement', 'PaymentEvidence'),
    items: Array.from({ length: count }, (_, index) => ({
      invoiceRef: u4Ref('FinancialSettlement', 'Invoice', 'invoice-' + index),
      amount: u4Money('1'),
    })),
    renewalCycleRefs: [],
    sourceEvidence: u4Evidence(),
  };
}
