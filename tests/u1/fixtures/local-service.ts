import 'reflect-metadata';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createApi } from '@oms/api';
import {
  Assessments,
  EnterpriseAccess,
  IdentityRecovery,
  NoticeWorker,
  NotificationDelivery,
  OrderAcceptance,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
} from '@oms/core';
import { ProtectedStore } from '@oms/persistence';
import { initializeDatabases } from './migrate.js';
import { localSources } from './databases.js';
import { resetSyntheticDatabases } from './reset.js';
import { seedSyntheticAccount, SyntheticIdentityProvider } from './identity.js';
import { SyntheticEnterpriseVerification } from './enterprise.js';
import { seedMinimumStaffManager } from './staff-bootstrap.js';
import { SyntheticQueue } from './queue.js';
if (
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
)
  throw new Error('명시적 합성 로컬 profile만 실행할 수 있습니다.');
const sources = localSources();
await initializeDatabases();
for (const source of Object.values(sources)) await source.initialize();
if (process.argv.includes('--reset-synthetic'))
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
mkdirSync('.runtime/u1', { recursive: true });
const profilePath = '.runtime/u1/profile.json';
const profile = existsSync(profilePath)
  ? (JSON.parse(readFileSync(profilePath, 'utf8')) as {
      verifier: string;
      customerCookie: string;
      staffCookie: string;
    })
  : {
      verifier: randomBytes(32).toString('hex'),
      customerCookie: randomBytes(32).toString('hex'),
      staffCookie: randomBytes(32).toString('hex'),
    };
if (Object.values(profile).some((value) => !/^[a-f0-9]{64}$/.test(value)))
  throw new Error('합성 profile 키 형식을 확인하세요.');
writeFileSync(profilePath, JSON.stringify(profile), { mode: 0o600 });
const credentialsPath = '.runtime/u1/login-fixture.json';
const credentials = existsSync(credentialsPath)
  ? (JSON.parse(readFileSync(credentialsPath, 'utf8')) as { password: string; factor: string })
  : { password: randomBytes(24).toString('hex'), factor: randomBytes(12).toString('hex') };
if (!/^[a-f0-9]{48}$/.test(credentials.password) || !/^[a-f0-9]{24}$/.test(credentials.factor))
  throw new Error('합성 로그인 fixture 형식 확인이 필요합니다.');
writeFileSync(credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
const now = () => new Date();
for (const [id, audience] of [
  ['customer', 'CUSTOMER'],
  ['other', 'CUSTOMER'],
  ['unrelated', 'CUSTOMER'],
  ['staff', 'STAFF'],
] as const)
  if (!(await store.read('Account', id))) await seedSyntheticAccount(store, id, audience);
if (
  (await store.list('StaffRoleGrant', { equals: { accountRef: { id: 'staff' } }, limit: 1 }))
    .length === 0
)
  await seedMinimumStaffManager(store, 'staff', now());
const identity = new IdentityRecovery(store, new SyntheticIdentityProvider(false, credentials), {
  synthetic: true,
  verifierKey: Buffer.from(profile.verifier, 'hex'),
  now,
  staffIngress: async (proof) => proof === 'synthetic-private-ingress',
});
const owners = {
  store,
  identity,
  enterprise: new EnterpriseAccess(store, new SyntheticEnterpriseVerification(), now, true),
  catalog: new ProductCatalog(store, now),
  orders: new OrderAcceptance(store, new Assessments(now), now),
  staff: new StaffAccess(store, now),
  inquiry: new WorkInquiry(store, now),
  notices: new NotificationDelivery(store, now),
  now,
};
const customer = await createApi(owners, {
  audience: 'CUSTOMER',
  origin: 'http://127.0.0.1:3100',
  transportHost: '127.0.0.1:3400',
  cookieKey: Buffer.from(profile.customerCookie, 'hex'),
  localSynthetic: true,
  staffAdmission: async () => null,
});
const staff = await createApi(owners, {
  audience: 'STAFF',
  origin: 'http://127.0.0.1:3200',
  transportHost: '127.0.0.1:3401',
  cookieKey: Buffer.from(profile.staffCookie, 'hex'),
  localSynthetic: true,
  staffAdmission: async (request) =>
    request.socket.remoteAddress === '127.0.0.1' ? 'synthetic-private-ingress' : null,
});
await customer.app.listen(3400, '127.0.0.1');
await staff.app.listen(3401, '127.0.0.1');
const broker = new SyntheticQueue();
const worker = new NoticeWorker(store, broker, now, true);
let processing = false;
const timer = setInterval(() => {
  if (processing) return;
  processing = true;
  void (async () => {
    await worker.relayBatch();
    for (const message of await broker.receive('u1-in-app-notice', AbortSignal.timeout(30000)))
      await worker.consume(message);
  })()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : '합성 worker 대조 필요');
    })
    .finally(() => {
      processing = false;
    });
}, 1000);
async function close() {
  clearInterval(timer);
  await customer.app.close();
  await staff.app.close();
  while (processing) await new Promise((done) => setTimeout(done, 50));
  for (const source of Object.values(sources)) await source.destroy();
}
process.once('SIGTERM', () => {
  void close().then(() => process.exit(0));
});
process.once('SIGINT', () => {
  void close().then(() => process.exit(0));
});
console.log(
  '명시적 합성 로컬 API/worker 접점 준비: customer3400/staff3401. 실제 Cognito/회사망/외부 큐 증거가 아닙니다.',
);
