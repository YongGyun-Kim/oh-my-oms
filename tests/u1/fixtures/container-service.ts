import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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
import { ProtectedStore, createDataSource, materialSchemas } from '@oms/persistence';
import { SyntheticIdentityProvider } from './identity.js';
import { SyntheticEnterpriseVerification } from './enterprise.js';
import { SyntheticQueue } from './queue.js';
import { runWorkerCycle } from '@oms/integrations';
if (
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only' ||
  !['API', 'WORKER'].includes(process.env.OMS_CONTAINER_FIXTURE_ROLE ?? '')
)
  throw new Error('등록된 명시 합성 컨테이너 fixture만 허용합니다.');
const primary = new URL(process.env.OMS_CONTAINER_PRIMARY_URL!);
const journal = new URL(process.env.OMS_CONTAINER_JOURNAL_URL!);
if (
  primary.hostname !== 'primary' ||
  journal.hostname !== 'journal' ||
  primary.pathname !== '/oms_u1_e2e' ||
  journal.pathname !== '/oms_u1_journal_e2e'
)
  throw new Error('원래 대량자료와 격리된 합성 PG pair만 허용합니다.');
const app = createDataSource(
  { url: primary.href, applicationName: 'u1-container-fixture', localSynthetic: true },
  materialSchemas(),
);
const append = createDataSource({
  url: journal.href,
  applicationName: 'u1-container-fixture-journal',
  localSynthetic: true,
});
await app.initialize();
await append.initialize();
const store = new ProtectedStore(app, append);
const now = () => new Date();
const hosts: { close: () => Promise<void> }[] = [];
let running = false;
const stop = new AbortController();
let timer: ReturnType<typeof setInterval> | undefined;
if (process.env.OMS_CONTAINER_FIXTURE_ROLE === 'API') {
  const profile = JSON.parse(readFileSync('/u1-profile/profile.json', 'utf8')) as {
    verifier: string;
    customerCookie: string;
    staffCookie: string;
    credentials: { password: string; factor: string };
  };
  const identity = new IdentityRecovery(
    store,
    new SyntheticIdentityProvider(false, profile.credentials),
    {
      synthetic: true,
      verifierKey: Buffer.from(profile.verifier, 'hex'),
      now,
      staffIngress: async (proof) => proof === 'explicit-container-synthetic-ingress',
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
  for (const [audience, port, name, key] of [
    ['CUSTOMER', 8443, 'customer', profile.customerCookie],
    ['STAFF', 8444, 'staff', profile.staffCookie],
  ] as const) {
    const host = await createApi(owners, {
      audience,
      origin: 'https://' + name + '.example.invalid',
      transportHost: 'api.example.invalid:' + port,
      cookieKey: Buffer.from(key, 'hex'),
      tls: { key: process.env.OMS_TLS_KEY_PEM!, cert: process.env.OMS_TLS_CERT_PEM! },
      localSynthetic: true,
      staffAdmission: async (request) =>
        request.socket.remoteAddress ? 'explicit-container-synthetic-ingress' : null,
    });
    await host.app.listen(port, '0.0.0.0');
    hosts.push(host.app);
  }
} else {
  @Module({})
  class FixtureWorkerModule {}
  const host = await NestFactory.createApplicationContext(FixtureWorkerModule, { logger: false });
  hosts.push(host);
  const queue = new SyntheticQueue();
  const worker = new NoticeWorker(store, queue, now, true);
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void (async () => {
      await runWorkerCycle(worker, queue, stop.signal, () => {
        console.error('원래 합성 메시지 대조 필요: ACK하지 않음');
      });
    })()
      .catch(() => console.error('원래 합성 worker 결과 대조 필요'))
      .finally(() => {
        running = false;
      });
  }, 100);
}
async function close() {
  stop.abort();
  if (timer) clearInterval(timer);
  for (const host of hosts) await host.close();
  while (running) await new Promise((done) => setTimeout(done, 25));
  await app.destroy();
  await append.destroy();
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
console.log(
  JSON.stringify({
    ready: true,
    role: process.env.OMS_CONTAINER_FIXTURE_ROLE,
    actualProviderVerified: false,
  }),
);
