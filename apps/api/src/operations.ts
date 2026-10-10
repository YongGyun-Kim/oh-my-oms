import { declareFoundationOperations, OperationRegistry, requireCondition } from '@oms/contracts';
import type { ServiceContext, InvocationTarget, Ref, TargetScope } from '@oms/contracts';
import {
  CustomerContexts,
  EnterpriseOrganisation,
  EnterpriseQuery,
  CatalogQuery,
  HistoryQuery,
} from '@oms/core';
import type {
  EnterpriseAccess,
  IdentityRecovery,
  ProductCatalog,
  OrderAcceptance,
  StaffAccess,
  WorkInquiry,
  NotificationDelivery,
  IdentityConsumer,
} from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
export interface ApiOwners {
  store: ProtectedStore;
  identity: IdentityRecovery;
  enterprise: EnterpriseAccess;
  catalog: ProductCatalog;
  orders: OrderAcceptance;
  staff: StaffAccess;
  inquiry: WorkInquiry;
  notices: NotificationDelivery;
  now: () => Date;
  identityConsumer?: IdentityConsumer;
  personRegistration?: 'LOCAL_SYNTHETIC' | 'UNREGISTERED';
  u2RateKey?: Buffer;
}
// These handlers own one primary transaction before journal protection. This capability
// is explicit; a future external-effect handler cannot inherit no-acceptance evidence.
const primaryAtomicCommands = new Set([
  'EnterpriseAccess:applyEnterprise',
  'EnterpriseAccess:approveEnterprise',
  'EnterpriseAccess:designateInitialAdministrator',
  'EnterpriseAccess:setOrderingContextPolicy',
  'EnterpriseAccess:upsertOrganisation',
  'EnterpriseAccess:upsertMembership',
  'EnterpriseAccess:defineCustomerRole',
  'EnterpriseAccess:grantCustomerRole',
  'EnterpriseAccess:defineStaffRole',
  'EnterpriseAccess:grantStaffRole',
  'ProductCatalog:registerProduct',
  'ProductCatalog:reviseProduct',
  'OrderAcceptance:submitOrder',
  'NotificationDelivery:recordNoticeRead',
]);
export function isPrimaryAtomicCommand(owner: string, operation: string): boolean {
  return primaryAtomicCommands.has(owner + ':' + operation);
}
export function businessOperations(owners: ApiOwners): OperationRegistry {
  const registry = new OperationRegistry(owners.store.schema);
  declareFoundationOperations(registry);
  const enterpriseQuery = new EnterpriseQuery(owners.enterprise, owners.now);
  const organisation = new EnterpriseOrganisation(owners.enterprise, owners.now);
  const products = new CatalogQuery(owners.catalog, owners.now);
  // Casting occurs only after the registry validates the declared canonical input and target.
  const bind = <Input>(
    owner: string,
    name: string,
    operation: (
      context: ServiceContext,
      input: Input,
      target: InvocationTarget,
    ) => Promise<unknown>,
  ) =>
    registry.bind(owner, name, 2, (invocation) =>
      operation(invocation.context as ServiceContext, invocation.data as Input, invocation.target),
    );
  const enterpriseTarget = (target: InvocationTarget): Ref => {
    requireCondition(
      target.kind === 'ENTERPRISE',
      400,
      'ENTERPRISE_TARGET',
      '기업 대상이 필요합니다.',
    );
    return target.enterpriseRef;
  };
  const recordTarget = (target: InvocationTarget): Ref => {
    requireCondition(target.kind === 'RECORD', 400, 'RECORD_TARGET', '원본 대상이 필요합니다.');
    return target.recordRef;
  };
  bind('EnterpriseAccess', 'applyEnterprise', owners.enterprise.apply.bind(owners.enterprise));
  bind('EnterpriseAccess', 'approveEnterprise', owners.enterprise.approve.bind(owners.enterprise));
  bind(
    'EnterpriseAccess',
    'designateInitialAdministrator',
    (context, data: Parameters<EnterpriseAccess['designate']>[2], target) =>
      owners.enterprise.designate(context, enterpriseTarget(target), data),
  );
  bind(
    'EnterpriseAccess',
    'setOrderingContextPolicy',
    (context, data: Parameters<EnterpriseAccess['setOrderingPolicy']>[2], target) =>
      owners.enterprise.setOrderingPolicy(context, enterpriseTarget(target), data),
  );
  bind('EnterpriseAccess', 'readApplication', (context, data: { targetRef: Ref }) =>
    owners.enterprise.readApplication(context, data.targetRef.id),
  );
  bind(
    'EnterpriseAccess',
    'readCustomerContexts',
    (context, data: Parameters<CustomerContexts['list']>[1]) =>
      new CustomerContexts(owners.enterprise, owners.now).list(context, data),
  );
  bind(
    'EnterpriseAccess',
    'listOwnApplications',
    (context, data: Parameters<EnterpriseQuery['applications']>[1]) =>
      enterpriseQuery.applications(context, data, true),
  );
  bind('WorkInquiry', 'probeOriginalReceipt', owners.inquiry.probeOriginal.bind(owners.inquiry));
  bind(
    'WorkInquiry',
    'readRecordHistory',
    (context, data: { cursor: string | null; pageSize: number }, target) =>
      new HistoryQuery(owners.store, owners.now).read(context, recordTarget(target), data),
  );
  bind(
    'WorkInquiry',
    'readHistory',
    (context, data: { cursor: string | null; pageSize: number }, target) =>
      new HistoryQuery(owners.store, owners.now).read(context, recordTarget(target), data),
  );
  bind('WorkInquiry', 'lookupOriginalReceipt', owners.inquiry.lookupOriginal.bind(owners.inquiry));
  bind(
    'EnterpriseAccess',
    'listApplications',
    (context, data: Parameters<EnterpriseQuery['applications']>[1]) =>
      enterpriseQuery.applications(context, data),
  );
  bind(
    'EnterpriseAccess',
    'readEnterprise',
    (context, data: Parameters<EnterpriseQuery['enterprise']>[2], target) =>
      enterpriseQuery.enterprise(context, enterpriseTarget(target), data),
  );
  bind(
    'EnterpriseAccess',
    'upsertOrganisation',
    (context, data: Parameters<EnterpriseOrganisation['upsert']>[2], target) =>
      organisation.upsert(context, enterpriseTarget(target), data),
  );
  bind(
    'EnterpriseAccess',
    'upsertMembership',
    (context, data: Parameters<EnterpriseOrganisation['membership']>[2], target) =>
      organisation.membership(context, enterpriseTarget(target), data),
  );
  bind(
    'EnterpriseAccess',
    'defineCustomerRole',
    (context, data: Parameters<EnterpriseAccess['defineCustomerRole']>[2], target) =>
      owners.enterprise.defineCustomerRole(context, enterpriseTarget(target), data),
  );
  bind(
    'EnterpriseAccess',
    'grantCustomerRole',
    (context, data: Parameters<EnterpriseAccess['grantCustomerRole']>[2], target) =>
      owners.enterprise.grantCustomerRole(context, enterpriseTarget(target), data),
  );
  bind('EnterpriseAccess', 'readStaffRoles', owners.staff.readRoles.bind(owners.staff));
  bind('EnterpriseAccess', 'defineStaffRole', owners.staff.defineRole.bind(owners.staff));
  bind('EnterpriseAccess', 'grantStaffRole', owners.staff.grantRole.bind(owners.staff));
  bind(
    'ProductCatalog',
    'registerProduct',
    (context, data: Parameters<ProductCatalog['register']>[1]) =>
      owners.catalog.register(context, data),
  );
  bind(
    'ProductCatalog',
    'reviseProduct',
    (context, data: Parameters<ProductCatalog['register']>[1], target) =>
      owners.catalog.register(context, data, recordTarget(target)),
  );
  bind(
    'WorkInquiry',
    'listVisibleProducts',
    (context, data: { scope: TargetScope | null; cursor: string | null; pageSize: number }) =>
      products.list(context, data),
  );
  bind('OrderAcceptance', 'submitOrder', owners.orders.submit.bind(owners.orders));
  bind('OrderAcceptance', 'readReviewAssessment', (context, data: { targetRef: Ref }) =>
    owners.orders.readReview(context, data.targetRef.id),
  );
  bind('WorkInquiry', 'readReceipt', (context, _data: { requestId: string }, target) => {
    requireCondition(target.kind === 'REQUEST', 400, 'REQUEST_TARGET', '접수 대상이 필요합니다.');
    return owners.inquiry.readReceipt(context, target.requestId);
  });
  bind(
    'NotificationDelivery',
    'readNotices',
    (context, data: { cursor: string | null; pageSize: number }) =>
      owners.notices.read(context, data.cursor, data.pageSize),
  );
  bind('NotificationDelivery', 'recordNoticeRead', owners.notices.recordRead.bind(owners.notices));
  bind('IdentityRecovery', 'readIdentity', (context) => owners.identity.readIdentity(context));
  return registry;
}
