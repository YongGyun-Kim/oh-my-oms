import 'reflect-metadata';
import { readFileSync } from 'node:fs';
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
import { localSources } from './databases.js';
import { SyntheticIdentityProvider } from './identity.js';
import { SyntheticEnterpriseVerification } from './enterprise.js';
import { fixtureTelemetry } from './telemetry.js';
import { SyntheticQueue } from './queue.js';
import { runWorkerCycle } from '@oms/integrations';
if (
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
)
  throw new Error('명시적 합성 성능 profile만 실행할 수 있습니다.');
const profile = JSON.parse(readFileSync('.runtime/u1/performance-profile.json', 'utf8')) as {
  verifier: string;
  cookieKey: string;
  credentials: { password: string; factor: string };
};
const sources = localSources();
await sources.primaryApp.initialize();
await sources.journalAppend.initialize();
const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
const now = () => new Date();
const broker = new SyntheticQueue();
const telemetry = await fixtureTelemetry(() => broker.snapshot());
const identity = new IdentityRecovery(
  store,
  new SyntheticIdentityProvider(false, profile.credentials),
  {
    synthetic: true,
    verifierKey: Buffer.from(profile.verifier, 'hex'),
    now,
    staffIngress: async (proof) => proof === 'synthetic-private-ingress',
  },
);
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
const api = await createApi(owners, {
  audience: 'CUSTOMER',
  origin: 'http://127.0.0.1:3100',
  transportHost: '127.0.0.1:34700',
  cookieKey: Buffer.from(profile.cookieKey, 'hex'),
  localSynthetic: true,
  telemetry: telemetry.port,
  staffAdmission: async () => null,
});
await api.app.listen(34700, '127.0.0.1');
const staffApi = await createApi(owners, {
  audience: 'STAFF',
  origin: 'http://127.0.0.1:3200',
  transportHost: '127.0.0.1:34701',
  cookieKey: Buffer.from(profile.cookieKey, 'hex'),
  localSynthetic: true,
  telemetry: telemetry.port,
  staffAdmission: async () => 'synthetic-private-ingress',
});
await staffApi.app.listen(34701, '127.0.0.1');
const workerSources = localSources();
await workerSources.primaryApp.initialize();
await workerSources.journalAppend.initialize();
const worker = new NoticeWorker(
  new ProtectedStore(workerSources.primaryApp, workerSources.journalAppend),
  broker,
  now,
  true,
  telemetry.port,
);
let stopped = false;
const stop = new AbortController();
let running = false;
const timer = setInterval(() => {
  if (stopped || running) return;
  running = true;
  void (async () => {
    await runWorkerCycle(worker, broker, stop.signal, () => {
      console.error('합성 메시지의 원래 작업 대조 필요: ACK하지 않음');
    });
  })()
    .catch(() => console.error('합성 성능 worker 원래 작업 대조 필요'))
    .finally(() => {
      running = false;
    });
}, 100);
async function close() {
  stopped = true;
  stop.abort();
  clearInterval(timer);
  await api.app.close();
  await staffApi.app.close();
  while (running) await new Promise((done) => setTimeout(done, 100));
  await sources.primaryApp.destroy();
  await sources.journalAppend.destroy();
  await workerSources.primaryApp.destroy();
  await workerSources.journalAppend.destroy();
  await telemetry.close();
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
console.log('명시적 전체 부하 API/worker 준비: 실제 외부망/provider 증거가 아닙니다.');
