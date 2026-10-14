import { runRestore } from './large-restore-runner.js';
import { readFileSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  IdentityRecovery,
  Assessments,
  OrderAcceptance,
  EnterpriseAccess,
  ProductCatalog,
  StaffAccess,
  WorkInquiry,
  NotificationDelivery,
} from '@oms/core';
import { createApi } from '@oms/api';
import { SyntheticHttpClient } from '../../tests/u1/fixtures/http-client.js';
import { SyntheticEnterpriseVerification } from '../../tests/u1/fixtures/enterprise.js';
import { preservationManifest } from '../../tests/u1/fixtures/recovery-preservation.js';
import { canonicalJson } from '@oms/contracts';
import { recoveryResources } from '../../tests/u1/fixtures/recovery-resources.js';
import { ProtectedStore, reconcileRecoveredSecurity } from '@oms/persistence';
import { localSources } from '../../tests/u1/fixtures/databases.js';
import { SyntheticIdentityProvider } from '../../tests/u1/fixtures/identity.js';
import {
  captureSyntheticSecuritySnapshot,
  SyntheticCurrentSecurityOracle,
} from '../../tests/u1/fixtures/recovery-security-oracle.js';
import { verifyAcknowledgements } from './verify-acks.js';
import { validatePerformance } from './report-validation.js';
import { admitCurrentWorkerRecovery } from './worker-recovery-evidence.js';
if (
  process.version !== 'v22.23.3' ||
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only' ||
  process.env.OMS_U1_DATABASE_PROFILE
)
  throw new Error('기존 원본의 명시 합성 큰 복구만 허용합니다.');
validatePerformance(JSON.parse(readFileSync('.reports/u1/performance.json', 'utf8')));
admitCurrentWorkerRecovery();
mkdirSync('.reports/u1', { recursive: true, mode: 0o700 });
const sources = localSources();
for (const source of Object.values(sources)) await source.initialize();
const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
const profile = JSON.parse(readFileSync('.runtime/u1/performance-profile.json', 'utf8')) as {
  verifier: string;
  credentials: { password: string; factor: string };
};
let faultAt = '';
let passed = false;
const observations: Record<string, unknown> = {};

try {
  const counts = (
    await sources.primaryAdmin.query(
      'SELECT (SELECT count(*)::text FROM u1_order) AS orders,(SELECT count(*)::text FROM u1_order_line) AS lines,(SELECT count(*)::text FROM u1_product) AS products',
    )
  )[0];
  if (
    Number(counts.orders) < 100000 ||
    Number(counts.lines) < 500000 ||
    Number(counts.products) < 10000
  )
    throw new Error('전체 규모를 줄인 복구는 허용하지 않습니다.');
  observations.beforeCounts = counts;
  const resources: unknown[] = [];
  let observing = false;
  let resourceFailures = 0;
  resources.push(await recoveryResources(sources.primaryAdmin, sources.journalAdmin));
  const resourceTimer = setInterval(() => {
    if (observing) return;
    observing = true;
    void recoveryResources(sources.primaryAdmin, sources.journalAdmin)
      .then((value) => resources.push(value))
      .catch(() => {
        resourceFailures++;
      })
      .finally(() => {
        observing = false;
      });
  }, 10000);
  observations.resources = resources;
  try {
    const ackFiles = ['.reports/u1/interrupted-ack.jsonl', '.reports/u1/performance-ack.jsonl'];
    const independent = [];
    for (const path of ackFiles) {
      try {
        independent.push({ path, ...(await verifyAcknowledgements(store, path)) });
      } catch (error) {
        if (
          path.endsWith('interrupted-ack.jsonl') &&
          (error as NodeJS.ErrnoException).code === 'ENOENT' &&
          process.env.CI === 'true'
        )
          continue;
        throw error;
      }
    }
    observations.beforeAcknowledgements = independent;
    const originalManifest = await preservationManifest(sources.primaryAdmin);
    observations.originalManifest = originalManifest;
    const oracle = new SyntheticCurrentSecurityOracle(
      await captureSyntheticSecuritySnapshot(sources.primaryApp),
    );
    const target = (await store.list('Product', { limit: 1 }))[0]!;
    const originalLabel = target.label;
    faultAt = new Date().toISOString();
    await sources.primaryAdmin.query('UPDATE u1_product SET label=$1 WHERE "productId"=$2', [
      '합성 실제 논리 손상 주입',
      target.productId,
    ]);
    observations.interruption = await runRestore(true, faultAt);
    const fenced = (
      await sources.primaryAdmin.query(
        'SELECT enabled,auth_ready FROM u1_recovery_control WHERE singleton=true',
      )
    )[0];
    if (fenced.enabled !== false || fenced.auth_ready !== false)
      throw new Error('실제 process interrupt 후writer/auth fence가 없습니다.');
    for (const action of [
      () => store.read('Product', String(target.productId)),
      () => store.list('Account'),
      () => store.currentEpoch(),
    ]) {
      let denied = false;
      try {
        await action();
      } catch {
        denied = true;
      }
      if (!denied) throw new Error('부분 복구 중 조회/ACK가 열렸습니다.');
    }
    observations.restart = await runRestore(false, faultAt);
    const restored = JSON.parse(readFileSync('.reports/u1/large-restore-result.json', 'utf8')) as {
      epoch: string;
      entries: number;
      rows: number;
      workHolds: number;
    };
    observations.restore = restored;
    if ((await store.read('Product', String(target.productId)))?.label !== originalLabel)
      throw new Error('원래 상품 원본을 복구하지 못했습니다.');
    const recovered = [];
    for (const item of independent)
      recovered.push({ path: item.path, ...(await verifyAcknowledgements(store, item.path)) });
    observations.recoveredAcknowledgements = recovered;
    observations.authentication = await reconcileRecoveredSecurity(
      sources.primaryAdmin,
      store,
      oracle,
      true,
      restored.epoch,
      faultAt,
    );
    const identity = new IdentityRecovery(
      store,
      new SyntheticIdentityProvider(false, profile.credentials),
      {
        synthetic: true,
        verifierKey: Buffer.from(profile.verifier, 'hex'),
        now: () => new Date(),
        staffIngress: async (value) => value === 'synthetic-private-ingress',
      },
    );
    let originalAck: {
      requestId: string;
      targetRef: { id: string };
      owner: string;
      company: number;
    } | null = null;
    const ackStream = createReadStream('.reports/u1/performance-ack.jsonl', {
      highWaterMark: 65536,
    });
    const ackLines = createInterface({ input: ackStream, crlfDelay: Infinity });
    try {
      for await (const line of ackLines) {
        const item = JSON.parse(line);
        if (item.owner === 'OrderAcceptance' && item.company === 0) {
          originalAck = item;
          break;
        }
      }
    } finally {
      ackLines.close();
      ackStream.destroy();
    }
    if (!originalAck) throw new Error('원래 고객0의 주문 ACK가 없습니다.');
    const recoveredManifest = await preservationManifest(sources.primaryAdmin);
    if (canonicalJson(originalManifest) !== canonicalJson(recoveredManifest))
      throw new Error('원래 전체 업무/효과/회수·파기 원본 전수 manifest가 다릅니다.');
    observations.materialPreservation = recoveredManifest;
    const now = () => new Date();
    const host = await createApi(
      {
        store,
        identity,
        enterprise: new EnterpriseAccess(store, new SyntheticEnterpriseVerification(), now, true),
        catalog: new ProductCatalog(store, now),
        orders: new OrderAcceptance(store, new Assessments(now), now),
        staff: new StaffAccess(store, now),
        inquiry: new WorkInquiry(store, now),
        notices: new NotificationDelivery(store, now),
        now,
      },
      {
        audience: 'CUSTOMER',
        origin: 'http://127.0.0.1:34687',
        cookieKey: Buffer.from(profile.verifier, 'hex'),
        localSynthetic: true,
        staffAdmission: async () => null,
      },
    );
    await host.app.listen(34687, '127.0.0.1');
    try {
      const client = new SyntheticHttpClient('http://127.0.0.1:34687', profile.credentials);
      await client.authenticate('nfr-customer-0');
      const review = await client.request<{ data: { requestId: string } }>(
        '/orders/' + originalAck.targetRef.id + '/review-assessment',
      );
      if (review.response.status !== 200 || review.body.data.requestId !== originalAck.requestId)
        throw new Error('복구 후 실제 HTTP 현재 허용 업무/원래ID 재개 실패');
      observations.allowedBusinessTransport = '실제 Nest HTTP·현재 MFA·현재 grant·원래 주문 조회';
    } finally {
      await host.app.close();
    }
    observations.allowedBusinessResumed = true;
    const elapsed = Date.now() - Date.parse(faultAt);
    if (elapsed > 30 * 60000)
      throw new Error('원래t0→보호/현재보안/실제허용업무 재개가30분을넘었습니다.');
    observations.elapsedMilliseconds = elapsed;
    if (resourceFailures) throw new Error('복구 중 실제 자원 관측 실패');
    resources.push(await recoveryResources(sources.primaryAdmin, sources.journalAdmin));
    passed = true;
  } finally {
    clearInterval(resourceTimer);
    while (observing) await new Promise((done) => setTimeout(done, 25));
  }
} finally {
  writeFileSync(
    '.reports/u1/large-recovery.json',
    JSON.stringify(
      {
        passed,
        faultAt,
        observations,
        actualProcessSigkill: Boolean(
          (observations.interruption as { interrupted?: boolean } | undefined)?.interrupted,
        ),
        actualAwsDisaster: false,
        realActivationAllowed: false,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
}
