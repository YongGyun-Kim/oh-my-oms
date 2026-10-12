import {
  canonicalJson,
  declareU3Operations,
  declareU3HostOperations,
  requireCondition,
} from '@oms/contracts';
import type { InvocationTarget, OperationRegistry, Ref, ServiceContext } from '@oms/contracts';
import {
  CommercialAgreement,
  CommercialProposal,
  U3CatalogQuery,
  U3CustomerAccess,
  U3OrderAcceptance,
  U3ProductCatalog,
  U3StaffAccess,
  U3OwnerQuery,
} from '@oms/core';
import type {
  U3AfterSalesRegistration,
  U3EvidenceRegistration,
  U3ReadinessRegistration,
  U3RenewalRegistration,
} from '@oms/core';
import type { ApiOwners } from './operations.js';
import type { OwnerDiagnostics } from '@oms/persistence';
import type { U3OwnerRecordQuery, U3AgreementPageQuery } from '@oms/core';
import { authenticationCall } from './authentication.js';

export interface U3ApiConfiguration {
  staffIngress: (proof: unknown) => Promise<boolean>;
  evidence?: U3EvidenceRegistration;
  readiness?: U3ReadinessRegistration[];
  renewal?: U3RenewalRegistration;
  afterSales?: U3AfterSalesRegistration;
  diagnostics?: OwnerDiagnostics;
}
export interface U3ApiOwners {
  catalog: U3ProductCatalog;
  products: U3CatalogQuery;
  agreement: CommercialAgreement;
  proposals: CommercialProposal;
  orders: U3OrderAcceptance;
  staff: U3StaffAccess;
  customer: U3CustomerAccess;
  queries: U3OwnerQuery;
}
// 서버가 명시 구성한 소유자만 사용한다. 요청 body의 profile/등록 주장은 해석하지 않는다.
export function createU3Owners(owners: ApiOwners, configuration: U3ApiConfiguration): U3ApiOwners {
  const { store, now } = owners,
    catalog = new U3ProductCatalog(store, now, configuration.staffIngress),
    agreement = new CommercialAgreement(
      store,
      now,
      configuration.staffIngress,
      configuration.evidence,
    );
  return {
    catalog,
    products: new U3CatalogQuery(catalog),
    agreement,
    proposals: new CommercialProposal(
      store,
      now,
      configuration.staffIngress,
      configuration.evidence,
      configuration.renewal,
    ),
    orders: new U3OrderAcceptance(
      store,
      now,
      configuration.staffIngress,
      configuration.evidence,
      configuration.readiness,
      configuration.afterSales,
    ),
    staff: new U3StaffAccess(store, now),
    customer: new U3CustomerAccess(owners.enterprise, now),
    queries: new U3OwnerQuery(
      store,
      now,
      configuration.staffIngress,
      agreement,
      configuration.diagnostics,
    ),
  };
}
export function bindU3Operations(registry: OperationRegistry, owners: ApiOwners): void {
  const u3 = owners.u3;
  requireCondition(u3, 503, 'U3_HOST_NOT_REGISTERED', '서버의 명시 U3 소유자 구성이 필요합니다.');
  declareU3Operations(registry);
  declareU3HostOperations(registry);
  const ingress = () => authenticationCall.getStore()?.ingress;
  const bind = <Input>(
    owner: string,
    name: string,
    handler: (context: ServiceContext, data: Input, target: InvocationTarget) => Promise<unknown>,
  ) =>
    registry.bind(owner, name, 3, async (invocation) => {
      const context = invocation.context as ServiceContext;
      await u3.catalog.requireIngress(context, ingress());
      return handler(context, invocation.data as Input, invocation.target);
    });
  const enterprise = (target: InvocationTarget): Ref => {
    requireCondition(
      target.kind === 'ENTERPRISE',
      400,
      'ENTERPRISE_TARGET',
      '정확한 기업 대상이 필요합니다.',
    );
    return target.enterpriseRef;
  };
  bind('EnterpriseAccess', 'defineStaffRole', u3.staff.defineRole.bind(u3.staff));
  bind('EnterpriseAccess', 'reviseStaffRole', u3.staff.reviseRole.bind(u3.staff));
  bind('EnterpriseAccess', 'deactivateStaffRole', u3.staff.deactivateRole.bind(u3.staff));
  bind('EnterpriseAccess', 'readStaffRoles', u3.staff.readRoles.bind(u3.staff));
  bind(
    'EnterpriseAccess',
    'defineCustomerRole',
    (context, data: Parameters<U3CustomerAccess['defineRole']>[1], target) => {
      requireCondition(
        canonicalJson(data.enterpriseRef) === canonicalJson(enterprise(target)),
        400,
        'U3_ROLE_TARGET',
        '입력과 현재 기업 대상이 다릅니다.',
      );
      return u3.customer.defineRole(context, data);
    },
  );
  bind('EnterpriseAccess', 'reviseCustomerRole', u3.customer.reviseRole.bind(u3.customer));
  bind('EnterpriseAccess', 'deactivateCustomerRole', u3.customer.deactivateRole.bind(u3.customer));
  bind(
    'EnterpriseAccess',
    'readCustomerRoles',
    (context, data: Parameters<U3CustomerAccess['readRoles']>[1], target) => {
      requireCondition(
        canonicalJson(data.enterpriseRef) === canonicalJson(enterprise(target)),
        400,
        'U3_ROLE_TARGET',
        '조회와 현재 기업 대상이 다릅니다.',
      );
      return u3.customer.readRoles(context, data);
    },
  );
  bind(
    'ProductCatalog',
    'registerProduct',
    (context, data: Parameters<U3ProductCatalog['register']>[1]) =>
      u3.catalog.register(context, data, null, ingress()),
  );
  bind(
    'ProductCatalog',
    'reviseProduct',
    (context, data: Parameters<U3ProductCatalog['register']>[1], target) => {
      requireCondition(
        target.kind === 'RECORD',
        400,
        'RECORD_TARGET',
        '정확한 상품 대상이 필요합니다.',
      );
      return u3.catalog.register(context, data, target.recordRef, ingress());
    },
  );
  bind(
    'ProductCatalog',
    'readCommonOffer',
    (context, data: Parameters<U3CatalogQuery['readCommonOffer']>[1]) =>
      u3.products.readCommonOffer(context, data, ingress()),
  );
  bind(
    'CommercialAgreement',
    'registerAgreement',
    (context, data: Parameters<CommercialAgreement['register']>[1]) =>
      u3.agreement.register(context, data, ingress()),
  );
  bind(
    'CommercialAgreement',
    'approveAgreement',
    (context, data: Parameters<CommercialAgreement['approve']>[1]) =>
      u3.agreement.approve(context, data, ingress()),
  );
  bind(
    'CommercialAgreement',
    'requestContractChange',
    u3.agreement.requestChange.bind(u3.agreement),
  );
  bind(
    'CommercialAgreement',
    'registerOfferException',
    (context, data: Parameters<CommercialAgreement['registerException']>[1]) =>
      u3.agreement.registerException(context, data, ingress()),
  );
  bind(
    'CommercialAgreement',
    'readApprovedTerms',
    (context, data: Parameters<CommercialAgreement['resolve']>[1]) =>
      u3.agreement.resolve(context, data, ingress()),
  );
  bind(
    'CommercialAgreement',
    'createProposal',
    (context, data: Parameters<CommercialProposal['create']>[1]) =>
      u3.proposals.create(context, data, ingress()),
  );
  bind('CommercialAgreement', 'recordConsent', u3.proposals.recordConsent.bind(u3.proposals));
  bind(
    'CommercialAgreement',
    'readProposal',
    (context, data: Parameters<CommercialProposal['read']>[1]) =>
      u3.proposals.read(context, data, ingress()),
  );
  bind('OrderAcceptance', 'submitOrder', u3.orders.submit.bind(u3.orders));
  bind(
    'OrderAcceptance',
    'decideOrder',
    (context, data: Parameters<U3OrderAcceptance['decide']>[1]) =>
      u3.orders.decide(context, data, ingress()),
  );
  bind(
    'OrderAcceptance',
    'applyApprovedChange',
    (context, data: Parameters<U3OrderAcceptance['apply']>[1]) =>
      u3.orders.apply(context, data, ingress()),
  );
  bind(
    'OrderAcceptance',
    'readAcceptedOrder',
    (context, data: Parameters<U3OrderAcceptance['read']>[1]) =>
      u3.orders.read(context, data, ingress()),
  );
  bind('WorkInquiry', 'readReceipt', (context, data: { requestId: string }, target) => {
    requireCondition(
      target.kind === 'REQUEST' && target.requestId === data.requestId,
      400,
      'REQUEST_TARGET',
      '입력과 정확한 접수 대상이 다릅니다.',
    );
    return owners.inquiry.readReceipt(context, data.requestId);
  });
  bind('WorkInquiry', 'lookupOriginalReceipt', owners.inquiry.lookupOriginal.bind(owners.inquiry));
  bind('WorkInquiry', 'probeOriginalReceipt', owners.inquiry.probeOriginal.bind(owners.inquiry));
  bind('EnterpriseAccess', 'grantStaffRole', owners.staff.grantRole.bind(owners.staff));
  bind(
    'EnterpriseAccess',
    'grantCustomerRole',
    (context, data: Parameters<ApiOwners['enterprise']['grantCustomerRole']>[2], target) =>
      owners.enterprise.grantCustomerRole(context, enterprise(target), data),
  );
  bind('CommercialAgreement', 'readAgreement', (context, data: U3AgreementPageQuery, target) =>
    u3.queries.readAgreement(context, enterprise(target), data, ingress()),
  );
  bind('CommercialAgreement', 'effectiveAgreement', (context, data: U3OwnerRecordQuery) =>
    u3.queries.effectiveAgreement(context, data, ingress()),
  );
  for (const owner of ['ProductCatalog', 'CommercialAgreement', 'OrderAcceptance'] as const) {
    bind(owner, 'readOwnerHistory', (context, data: U3OwnerRecordQuery) =>
      u3.queries.history(context, owner, data, ingress()),
    );
    bind(
      owner,
      'readOwnerDiagnostics',
      (context, data: Parameters<U3OwnerQuery['diagnostic']>[2]) =>
        u3.queries.diagnostic(context, owner, data, ingress()),
    );
  }
}
