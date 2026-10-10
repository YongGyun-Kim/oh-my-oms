import { readFileSync, writeFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Receipt, Ref, TargetScope } from '@oms/contracts';
import { SyntheticHttpClient } from '../../tests/u1/fixtures/http-client.js';
import { mandatoryPhases, evaluateSamples } from './performance-statistics.js';
import type { Phase, Sample } from './performance-statistics.js';
import { ProfileUi } from './profile-ui.js';
import { firstStartEvidence, resourceObservation } from './profile-observations.js';
import { localSources } from '../../tests/u1/fixtures/databases.js';
import { setTimeout as pause } from 'node:timers/promises';
import { fingerprint } from '@oms/contracts';
import { ProtectedStore } from '@oms/persistence';
import { runtimeSourceIdentity, runtimeSourceDigest } from './runtime-source.js';
import { collectWorkerRecovery } from './worker-recovery-evidence.js';
interface Profile {
  credentials: { password: string; factor: string };
  enterprises: Ref[];
  products: { productRef: Ref; offerRef: Ref; productType: 'HARDWARE' | 'SOFTWARE' }[];
  counts: Record<string, number>;
  id: string;
}
if (
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
)
  throw new Error('명시적 합성 전체 부하 환경이 필요합니다.');
const profile = JSON.parse(readFileSync('.runtime/u1/performance-profile.json', 'utf8')) as Profile;
const clients: SyntheticHttpClient[] = [];
mkdirSync('.reports/u1', { recursive: true });
const ack = createWriteStream('.reports/u1/performance-ack.jsonl', { flags: 'w', mode: 0o600 });
const samplesLog = createWriteStream('.reports/u1/performance-samples.jsonl', {
  flags: 'w',
  mode: 0o600,
});
const reports: unknown[] = [];
let sequence = 0;
let outstanding = 0;
let maxOutstanding = 0;
const sourceIdentity = runtimeSourceIdentity();
const sourceDigest = runtimeSourceDigest(sourceIdentity);
const runId = randomUUID();
writeFileSync(
  '.reports/u1/performance-source.json',
  JSON.stringify(
    {
      sourceIdentity,
      runId,
      node: process.version,
      profileId: profile.id,
      initialHistoricalProfile: profile.counts,
      priorAcknowledgementsPreserved: true,
      apiConfiguration: {
        origins: ['http://127.0.0.1:3100', 'http://127.0.0.1:3200'],
        backendPorts: [34700, 34701],
        nextMode: 'development',
        synthetic: true,
        poolPerProcess: 8,
        companyIngress: 'explicit-synthetic-private-ingress',
      },
      capturedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
for (let i = 0; i < 100; i++) {
  const staff = i >= 90;
  const client = new SyntheticHttpClient(
    'http://127.0.0.1:' + (staff ? '3200' : '3100'),
    profile.credentials,
    '/api',
  );
  await client.authenticate(staff ? 'nfr-staff-' + (i - 90) : 'nfr-customer-' + i * 10);
  clients.push(client);
  if (i % 10 === 9) console.log('현재 MFA 활동 세션 준비:', i + 1, '/100');
  await new Promise((done) => setTimeout(done, 1600));
}
console.log(
  '고객90/직원10의100개 실제 BFF→HTTP 합성 MFA/현재 세션 준비 완료. 전체50분 프로필을 시작합니다.',
);
const ui = new ProfileUi();
await ui.start(clients);
const metricSources = localSources();
await metricSources.primaryApp.initialize();
await metricSources.journalAppend.initialize();
const resourceSamples: unknown[] = [];
let resourceFailures = 0;
const normalRanges: { from: string; to: string }[] = [];
const workRanges: { phase: string; from: string; to: string }[] = [];
const scopes: TargetScope[] = profile.enterprises.map((enterpriseRef) => ({
  enterpriseRef,
  contextPolicyRef: enterpriseRef,
  organisationRevision: enterpriseRef.revision,
  departmentRef: null,
  siteRef: null,
}));
async function invoke(number: number, samples: Sample[]) {
  const company = Math.floor(number / 5) % 100;
  const client = clients[company]!;
  const write = number % 5 === 4;
  const start = performance.now();
  outstanding++;
  maxOutstanding = Math.max(maxOutstanding, outstanding);
  let status = 0;
  let accuracy = true;
  let bytes = 0;
  try {
    const scope = scopes[company]!;
    let result;
    if (write) {
      const product = profile.products[number % profile.products.length]!;
      const key = randomUUID();
      const staff = company >= 90;
      const meta = {
        clientRequestId: key,
        expectedRevision: null,
        reason: '합성 전체 부하의 명시적 별도 업무',
        evidenceRefs: [],
      };
      result = await client.request<Receipt>(
        staff ? '/products' : '/orders',
        staff
          ? {
              meta,
              productType: product.productType,
              softwareTermKind: product.productType === 'SOFTWARE' ? 'TERM' : null,
              label: '합성 부하 신규 품목 ' + number,
              salesDescription: '실제 외부 공급 조건 미확인',
              commonPrice: { currency: 'KRW', value: '100' },
              salesConditionRefs: [],
            }
          : {
              meta,
              targetScope: scope,
              productType: product.productType,
              lines: Array.from({ length: 5 }, () => ({
                productRef: product.productRef,
                commonOfferRevisionRef: product.offerRef,
                agreementRevisionRef: null,
                quantity: 1,
                paymentMode: 'PREPAY',
                requestedActivationDate: product.productType === 'SOFTWARE' ? '2026-12-01' : null,
              })),
              provisionChoice: 'FULL',
              partialConsentRef: null,
            },
        { 'Idempotency-Key': key, 'X-Correlation-Id': key },
      );
      status = result.response.status;
      bytes = Buffer.byteLength(JSON.stringify(result.body));
      accuracy =
        status === 202 &&
        result.body.owner === (staff ? 'ProductCatalog' : 'OrderAcceptance') &&
        result.body.requestState === (staff ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED') &&
        !!result.body.requestId;
      if (status !== 202) accuracy = true;
      if (status === 202) {
        const observed = {
          requestId: result.body.requestId,
          targetRef: result.body.targetRef,
          owner: result.body.owner,
          clientRequestId: key,
          correlationId: key,
          company,
          observedAt: new Date().toISOString(),
        };
        if (!ack.write(JSON.stringify(observed) + '\n'))
          await new Promise<void>((done) => ack.once('drain', done));
      }
    } else {
      const historical = company + 100 * (Math.floor(number / 500) % 1000);
      const select = number % 4;
      const path =
        select === 0
          ? '/orders/nfr-order-' + String(historical).padStart(6, '0') + '/review-assessment'
          : select === 1
            ? company >= 90
              ? '/orders/nfr-order-' + String(historical).padStart(6, '0') + '/history'
              : '/requests/nfr-historical-request-' + historical
            : select === 2
              ? '/products?' + new URLSearchParams({ scope: JSON.stringify(scope), pageSize: '25' })
              : '/enterprise-applications';
      result = await client.request<Record<string, unknown>>(path);
      status = result.response.status;
      bytes = Buffer.byteLength(JSON.stringify(result.body));
      accuracy = status === 200;
      if (status !== 200) accuracy = true;
      if (status === 200 && select === 0) {
        const data = result.body.data as {
          targetScope: TargetScope;
          acceptance: string;
          lines: unknown[];
        };
        accuracy =
          data.targetScope.enterpriseRef.id === scope.enterpriseRef.id &&
          data.acceptance === 'REVIEW_REQUIRED' &&
          data.lines.length > 0;
      }
    }
  } catch {
    status = 0;
    accuracy = true;
  } finally {
    outstanding--;
    const sample: Sample = {
      milliseconds: performance.now() - start,
      kind: write ? 'WRITE' : 'READ',
      status,
      accuracy,
      bytes,
    };
    samples.push(sample);
    if (
      !samplesLog.write(
        JSON.stringify({ number, company, observedAt: new Date().toISOString(), ...sample }) + '\n',
      )
    )
      await new Promise<void>((done) => samplesLog.once('drain', done));
  }
}
async function run(phase: Phase) {
  console.log(
    JSON.stringify({
      event: 'phase-start',
      phase: phase.name,
      rate: phase.rate,
      durationSeconds: phase.seconds,
      at: new Date().toISOString(),
    }),
  );
  const phaseFrom = new Date().toISOString();
  const observers = new AbortController();
  const observe = (operation: () => Promise<void>, milliseconds: number) =>
    (async () => {
      while (!observers.signal.aborted) {
        try {
          await operation();
        } catch {
          resourceFailures++;
        }
        try {
          await pause(milliseconds, undefined, { signal: observers.signal });
        } catch {
          break;
        }
      }
    })();
  const uiObservation = observe(() => ui.probe(phase.name), 120000);
  const resources = observe(async () => {
    resourceSamples.push({
      ...(await resourceObservation(metricSources.primaryApp, metricSources.journalAppend)),
      phase: phase.name,
    });
  }, 10000);
  const samples: Sample[] = [];
  const start = performance.now();
  let issued = 0;
  const running = new Set<Promise<void>>();
  const total = phase.rate * phase.seconds;
  while (issued < total) {
    const due = start + (issued * 1000) / phase.rate;
    const delay = due - performance.now();
    if (delay > 0) await new Promise((done) => setTimeout(done, delay));
    if (running.size >= 256) {
      await Promise.race(running);
      continue;
    }
    const request = invoke(sequence++, samples).finally(() => running.delete(request));
    running.add(request);
    issued++;
  }
  await Promise.all(running);
  const elapsed = performance.now() - start;
  const phaseTo = new Date().toISOString();
  observers.abort();
  await Promise.all([uiObservation, resources]);
  if (phase.name === 'NORMAL') normalRanges.push({ from: phaseFrom, to: phaseTo });
  if (phase.name !== 'PEAK') workRanges.push({ phase: phase.name, from: phaseFrom, to: phaseTo });
  const report = evaluateSamples(samples, phase, elapsed);
  reports.push(report);
  writeFileSync(
    '.reports/u1/performance.json',
    JSON.stringify(
      {
        runId,
        sourceDigest,
        profile: profile.counts,
        phases: reports,
        maxOutstanding,
        finished: false,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(report));
  return report.passed;
}
try {
  let passed = true;
  for (const phase of mandatoryPhases) passed = (await run(phase)) && passed;
  await new Promise<void>((done) => ack.end(done));
  // The last admitted original may finish after the last HTTP response. This
  // bounded quiescence observes it; it does not alter the fixed phase duration/rate.
  await pause(30000);
  const uiResult = ui.report();
  writeFileSync('.reports/u1/ui-under-load.json', JSON.stringify(uiResult, null, 2), {
    mode: 0o600,
  });
  const normalRange = normalRanges[0];
  if (!normalRange) throw new Error('NORMAL 시작/종료 근거 없음');
  const firstStart = await firstStartEvidence(normalRange.from, normalRange.to);
  writeFileSync('.reports/u1/work-first-start-profile.json', JSON.stringify(firstStart, null, 2), {
    mode: 0o600,
  });
  const workRecovery = await collectWorkerRecovery(
    new ProtectedStore(metricSources.primaryApp, metricSources.journalAppend),
    workRanges,
    { runId, profileId: profile.id, sourceIdentity },
  );
  const resourceResult = {
    passed: resourceSamples.length > 0 && resourceFailures === 0,
    samples: resourceSamples,
    failures: resourceFailures,
    actualFargateCapacityVerified: false,
  };
  writeFileSync('.reports/u1/profile-resources.json', JSON.stringify(resourceResult, null, 2), {
    mode: 0o600,
  });
  passed =
    passed && uiResult.passed && firstStart.passed && resourceResult.passed && workRecovery.passed;
  writeFileSync(
    '.reports/u1/performance.json',
    JSON.stringify(
      {
        runId,
        sourceDigest,
        workerRecoveryVerified: workRecovery.passed,
        workerRecoveryEvidenceDigest: fingerprint(workRecovery),
        uiReadiness: uiResult.passed,
        workFirstStart: firstStart.passed,
        resourceObservations: resourceResult.passed,
        profile: profile.counts,
        phases: reports,
        maxOutstanding,
        finished: true,
        passed,
        limitations: [
          '명시적 로컬 합성 데이터·provider/망/큐 profile. AWS 실환경/30일 가용성 증거 아님.',
          '두 Next 개발 서버를 포함한 로컬 측정이며 production/AWS 자원 성능 증거는 별도입니다.',
          '초기 실패 실행의 보호된 ACK와 추가 자료를 그대로 유지한 더 큰 저장 규모입니다.',
        ],
        observedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
} finally {
  if (!ack.writableFinished) await new Promise<void>((done) => ack.end(done));
  await ui.close();
  if (metricSources.primaryApp.isInitialized) await metricSources.primaryApp.destroy();
  if (metricSources.journalAppend.isInitialized) await metricSources.journalAppend.destroy();
  await new Promise<void>((done) => samplesLog.end(done));
}
