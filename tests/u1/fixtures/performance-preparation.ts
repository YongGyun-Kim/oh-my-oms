import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  IdentityRecovery,
  EnterpriseAccess,
  EnterpriseOrganisation,
  ProductCatalog,
  StaffAccess,
  ref,
} from '@oms/core';
import type { Ref, CommandMeta } from '@oms/contracts';
import { ProtectedStore } from '@oms/persistence';
import { localSources } from './databases.js';
import { initializeDatabases } from './migrate.js';
import { assertEmptyPerformanceStores } from './empty-performance-stores.js';
import { seedSyntheticAccount, SyntheticIdentityProvider } from './identity.js';
import { seedMinimumStaffManager } from './staff-bootstrap.js';
import { SyntheticEnterpriseVerification, syntheticBasis } from './enterprise.js';
import { seedHistoricalOrders } from './performance-orders.js';
if (
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
)
  throw new Error('명시적 로컬 합성 성능 profile만 준비할 수 있습니다.');
const sources = localSources();
await initializeDatabases();
for (const source of Object.values(sources)) await source.initialize();
await assertEmptyPerformanceStores(sources.primaryAdmin, sources.journalAdmin);
const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
const now = () => new Date();
const credentials = {
  password: randomBytes(24).toString('hex'),
  factor: randomBytes(12).toString('hex'),
};
const verifier = randomBytes(32);
const identity = new IdentityRecovery(store, new SyntheticIdentityProvider(false, credentials), {
  synthetic: true,
  verifierKey: verifier,
  now,
  staffIngress: async (proof) => proof === 'synthetic-private-ingress',
});
const access = new EnterpriseAccess(store, new SyntheticEnterpriseVerification(), now, true);
const staffAccess = new StaffAccess(store, now);
const organisation = new EnterpriseOrganisation(access, now);
const catalog = new ProductCatalog(store, now);
const meta = (expectedRevision: number | null = null): CommandMeta => ({
  clientRequestId: randomUUID(),
  expectedRevision,
  reason: '명시적 합성 성능 자료 준비',
  evidenceRefs: [syntheticBasis],
});
const tokens = new Map<string, string>();
async function login(id: string, audience: 'CUSTOMER' | 'STAFF') {
  const ingress = audience === 'STAFF' ? 'synthetic-private-ingress' : null;
  const start = await identity.login(
    audience,
    id + '@example.invalid',
    credentials.password,
    'performance-peer-' + id,
    ingress,
  );
  await identity.verifyFactor(
    start.challengeId!,
    credentials.factor,
    'performance-peer-' + id,
    ingress,
  );
  const issued = await identity.issueRecoveryCodes(start.challengeId!, ingress);
  const result = await identity.acknowledgeRecoveryCodes(
    start.challengeId!,
    issued.setId,
    true,
    ingress,
  );
  tokens.set(id, result.sessionToken!);
}
async function context(id: string, audience: 'CUSTOMER' | 'STAFF') {
  return identity.authenticate(
    tokens.get(id)!,
    audience,
    randomUUID(),
    audience === 'STAFF' ? 'synthetic-private-ingress' : null,
  );
}
async function active(id: string, audience: 'CUSTOMER' | 'STAFF', operation: string) {
  await identity.recordRegisteredActivity(
    tokens.get(id)!,
    audience,
    operation,
    randomUUID(),
    audience === 'STAFF' ? 'synthetic-private-ingress' : null,
  );
}
try {
  for (let i = 0; i < 1000; i++) await seedSyntheticAccount(store, 'nfr-customer-' + i, 'CUSTOMER');
  for (let i = 0; i < 10; i++) await seedSyntheticAccount(store, 'nfr-staff-' + i, 'STAFF');
  await seedMinimumStaffManager(store, 'nfr-staff-0', now());
  await login('nfr-staff-0', 'STAFF');
  const staffRole = await staffAccess.defineRole(await context('nfr-staff-0', 'STAFF'), {
    meta: meta(),
    label: '합성 성능 준비 직원',
    actions: [
      'application.read',
      'enterprise.approve',
      'enterprise.initial-administrator.designate',
      'product.register',
      'product.read',
      'order.read',
      'order.review.read',
    ],
  });
  await staffAccess.grantRole(await context('nfr-staff-0', 'STAFF'), {
    meta: meta(),
    accountRef: (await context('nfr-staff-0', 'STAFF')).actorAccountRef!,
    roleRef: staffRole.targetRef!,
    decision: 'GRANT',
  });
  const enterprises: Ref[] = [];
  for (let company = 0; company < 100; company++) {
    const admin = 'nfr-customer-' + company * 10;
    await login(admin, 'CUSTOMER');
    const application = await access.apply(await context(admin, 'CUSTOMER'), {
      meta: meta(),
      legalName: '합성 성능 기업 ' + company,
      designatedContact: admin + '@example.invalid',
      registrationEvidenceRefs: [syntheticBasis],
    });
    const approved = await access.approve(await context('nfr-staff-0', 'STAFF'), {
      meta: meta(1),
      targetRef: application.targetRef!,
      decision: 'APPROVE',
      basisRefs: [syntheticBasis],
    });
    await active('nfr-staff-0', 'STAFF', 'approveEnterprise');
    const enterprise = approved.resultRefs.find((value) => value.entity === 'Enterprise')!;
    await access.designate(await context('nfr-staff-0', 'STAFF'), enterprise, {
      meta: meta(1),
      accountRef: (await context(admin, 'CUSTOMER')).actorAccountRef!,
      basisRefs: [syntheticBasis],
      label: '명시적 합성 최초 관리자',
      actionScopes: ['organisation.manage', 'user.manage', 'role.manage'].map((action) => ({
        action,
        kind: 'ENTERPRISE_ALL',
        enterpriseRef: enterprise,
        departmentRefs: [],
        siteRefs: [],
      })),
    });
    await active('nfr-staff-0', 'STAFF', 'designateInitialAdministrator');
    await access.setOrderingPolicy(
      await context(admin, 'CUSTOMER'),
      { ...enterprise, revision: 2 },
      { meta: meta(2), departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
    );
    await active(admin, 'CUSTOMER', 'setOrderingContextPolicy');
    for (let member = 1; member < 10; member++) {
      const current = (await store.read('Enterprise', enterprise.id))!;
      const account = (await store.read('Account', 'nfr-customer-' + (company * 10 + member)))!;
      await organisation.membership(await context(admin, 'CUSTOMER'), ref('Enterprise', current), {
        meta: meta(),
        accountRef: ref('Account', account),
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      });
      await active(admin, 'CUSTOMER', 'upsertMembership');
    }
    const current = ref('Enterprise', (await store.read('Enterprise', enterprise.id))!);
    const tradeRole = await access.defineCustomerRole(await context(admin, 'CUSTOMER'), current, {
      meta: meta(),
      label: '명시적 합성 주문 역할',
      actionScopes: ['product.read', 'order.submit', 'order.read'].map((action) => ({
        action,
        kind: 'ENTERPRISE_ALL',
        enterpriseRef: current,
        departmentRefs: [],
        siteRefs: [],
      })),
    });
    for (let member = 0; member < 10; member++) {
      const account = (await store.read('Account', 'nfr-customer-' + (company * 10 + member)))!;
      await access.grantCustomerRole(await context(admin, 'CUSTOMER'), current, {
        meta: meta(),
        accountRef: ref('Account', account),
        roleRef: tradeRole.targetRef!,
        decision: 'GRANT',
      });
      await active(admin, 'CUSTOMER', 'grantCustomerRole');
    }
    enterprises.push(current);
    if (company % 10 === 0)
      console.log('명시적 기업 승인/별도 관리자/구성원·거래 grant 준비:', company + 1);
  }
  const products: { productRef: Ref; offerRef: Ref; productType: 'HARDWARE' | 'SOFTWARE' }[] = [];
  for (let i = 0; i < 10000; i++) {
    const productType = i % 2 === 0 ? 'HARDWARE' : 'SOFTWARE';
    const product = await catalog.register(await context('nfr-staff-0', 'STAFF'), {
      meta: meta(),
      productType,
      softwareTermKind: productType === 'SOFTWARE' ? 'TERM' : null,
      label: '합성 성능 품목 ' + i,
      salesDescription: '실제 공급/지급/발급 조건 미확인',
      commonPrice: { currency: 'KRW', value: '100' },
      salesConditionRefs: [],
    });
    products.push({
      productRef: product.targetRef!,
      offerRef: product.resultRefs.find((value) => value.entity === 'CommonOfferRevision')!,
      productType,
    });
    await active('nfr-staff-0', 'STAFF', 'registerProduct');
    if (i % 1000 === 0) console.log('실제 상품 owner 등록:', i + 1);
  }
  await seedHistoricalOrders(store, enterprises, products);
  for (const token of tokens.values()) await identity.logout(token);
  mkdirSync('.runtime/u1', { recursive: true });
  writeFileSync(
    '.runtime/u1/performance-profile.json',
    JSON.stringify({
      verifier: verifier.toString('hex'),
      cookieKey: randomBytes(32).toString('hex'),
      credentials,
      enterprises,
      products: products.slice(0, 100),
      preparedAt: new Date().toISOString(),
      counts: {
        enterprises: 100,
        customers: 1000,
        staff: 10,
        products: 10000,
        orders: 100000,
        averageItems: 5,
        maximumItems: 50,
      },
    }),
    { mode: 0o600 },
  );
  console.log('전체 합성 저장 규모 준비 완료. 실제 기업/외부 효과/성능 통과 증거가 아닙니다.');
} finally {
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
}
