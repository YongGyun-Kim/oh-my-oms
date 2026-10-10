import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, lstatSync } from 'node:fs';
import {
  IdentityRecovery,
  EnterpriseAccess,
  EnterpriseOrganisation,
  ProductCatalog,
  StaffAccess,
  ref,
  PurposeVerifier,
  EnrollmentAuthorities,
  PartyClaimContexts,
  RecoveryHandoffs,
  RecoveryCases,
  SavedCodeRecoveries,
  RecoveryCompletions,
  IdentityConsumer,
  U2Worker,
  PrivateU2Delivery,
  EnterpriseInvitations,
  invitationBinding,
} from '@oms/core';
import type { QueueMessage } from '@oms/core';
import type { Ref, CommandMeta, SchemaValidator } from '@oms/contracts';
import { ProtectedStore, PurposeSecretVault, authorizeProtectedVault } from '@oms/persistence';
import { StatefulRecoveryProvider } from '../../tests/u2/fixtures/provider.js';
import { canonicalJson, requireCondition, OmsError } from '@oms/contracts';
import { u2Sources, initializeU2Databases } from '../../tests/u2/fixtures/databases.js';
import { backfillU2SecurityState, u2EnterpriseFenceId, U2_STAFF_FENCE_ID } from '@oms/persistence';

import {
  seedSyntheticAccount,
  SyntheticIdentityProvider,
} from '../../tests/u1/fixtures/identity.js';
import { seedMinimumStaffManager } from '../../tests/u1/fixtures/staff-bootstrap.js';
import {
  SyntheticEnterpriseVerification,
  syntheticBasis,
} from '../../tests/u1/fixtures/enterprise.js';
import { seedHistoricalOrders } from '../../tests/u1/fixtures/performance-orders.js';

import {
  existsSync,
  readFileSync,
  createWriteStream,
  appendFileSync,
  createReadStream,
  statSync,
} from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { runtimeSourceIdentity } from './runtime-source.js';
import type { SourceIdentity } from './runtime-source.js';
import { resetU2Databases } from '../../tests/u2/fixtures/reset.js';
import {
  PILOT_PROFILE,
  profileCounts,
  registeredProfileCounts,
  pilotActor,
  assertPilotCounts,
  mandatoryPilotPhases as mandatoryPhases,
} from './verification-profile.js';
export interface PerformancePreparationPorts {
  read: () => Buffer | null;
  archive: (bytes: Buffer) => Promise<void>;
  remove: () => void;
  prepare: () => Promise<void>;
}
export const measurementOutputPaths = [
  'performance.json',
  'performance-source.json',
  'performance-samples.jsonl',
  'performance-ack.jsonl',
  'worker-first-start.jsonl',
  'worker-consume.jsonl',
  'work-first-start-profile.json',
  'worker-recovery-profile.json',
  'ui-under-load.json',
  'profile-resources.json',
  'profile-purpose-probe.json',
].map((name) => '.reports/u2/' + name);
export async function archiveMeasurementOutputs(ports?: {
  read: (path: string) => Buffer | null;
  archive: (path: string) => Promise<void>;
  remove: (path: string) => void;
}) {
  requireCondition(
    process.env.NODE_ENV !== 'production' &&
      process.env.OMS_U2_SYNTHETIC_PROFILE === 'approved-local-only' &&
      process.env.OMS_U2_DATABASE_PROFILE === 'verification-isolated',
    503,
    'PERFORMANCE_OUTPUT_ADMISSION',
    '같은 local verification 실행의 원문만 보존/교체합니다.',
  );
  const io = ports ?? {
    read: (path: string) => (existsSync(path) ? readFileSync(path) : null),
    archive: async (path: string) => {
      const { preserveOutput } = await import('./ci-full-proof.js');
      preserveOutput(path);
    },
    remove: (path: string) => unlinkSync(path),
  };
  const previous = new Map(measurementOutputPaths.map((path) => [path, io.read(path)]));
  for (const [path, bytes] of previous)
    if (bytes !== null) {
      await io.archive(path);
      requireCondition(
        io.read(path)?.equals(bytes),
        503,
        'PERFORMANCE_OUTPUT_CHANGED',
        '기존 측정 원문의 exact archive/현재 bytes가 필요합니다.',
      );
    }
  // Only the owned ACK admission sentinel is removed after every old output is archived.
  // Other raw files are preserved before their subsequent owning writer replaces them.
  if (previous.get('.reports/u2/performance-ack.jsonl') !== null)
    io.remove('.reports/u2/performance-ack.jsonl');
}
function preparationMetadata(bytes: Buffer) {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(bytes.toString()) as Record<string, unknown>;
  } catch {
    throw Error('합성 성능 profile 형식이 확인되지 않습니다.');
  }
  const keys = [
    'verifier',
    'purposeKey',
    'rateKey',
    'vaultKey',
    'customerCookieKey',
    'staffCookieKey',
    'id',
    'seed',
    'credentials',
    'enterprises',
    'roles',
    'members',
    'contacts',
    'products',
    'preparedAt',
    'counts',
  ];
  requireCondition(
    value &&
      Object.keys(value).sort().join(',') === keys.sort().join(',') &&
      [PILOT_PROFILE.id, 'u2-capacity-v1'].includes(String(value.seed)) &&
      typeof value.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.id),
    503,
    'PERFORMANCE_PROFILE_REGISTRATION',
    '등록된 닫힌 합성 성능 profile만 준비합니다.',
  );
  const counts = value.counts as Record<string, unknown> | undefined;
  requireCondition(
    counts && canonicalJson(counts) === canonicalJson(registeredProfileCounts(value.seed)),
    503,
    'PERFORMANCE_PROFILE_SCALE',
    '원래 전체 규모 선언이 필요합니다. 실제 DB 규모 검증을 대체하지 않습니다.',
  );
  return { id: value.id, seed: value.seed };
}
export async function prepareFreshPerformanceProfile(ports?: PerformancePreparationPorts) {
  requireCondition(
    process.env.NODE_ENV !== 'production' &&
      process.env.OMS_U2_SYNTHETIC_PROFILE === 'approved-local-only' &&
      process.env.OMS_U2_DATABASE_PROFILE === 'verification-isolated',
    503,
    'PERFORMANCE_PREPARATION_ADMISSION',
    '명시 local 합성 verification namespace만 새로 준비합니다.',
  );
  const path = '.runtime/u2/performance-profile.json';
  const io = ports ?? {
    read: () => {
      if (!existsSync(path)) return null;
      const stat = lstatSync(path);
      requireCondition(
        stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600,
        503,
        'PERFORMANCE_PROFILE_FILE',
        '원래 private profile의 파일 종류/권한이 필요합니다.',
      );
      return readFileSync(path);
    },
    archive: async (bytes: Buffer) => {
      const { preserveOutput } = await import('./ci-full-proof.js');
      preserveOutput(path);
      requireCondition(
        readFileSync('.reports/u2/history/' + sha256(bytes) + '-performance-profile.json').equals(
          bytes,
        ),
        503,
        'PERFORMANCE_PROFILE_ARCHIVE',
        '원래 profile의 exact archive가 필요합니다.',
      );
    },
    remove: () => unlinkSync(path),
    prepare: async () => {
      await archiveMeasurementOutputs();
      await preparePerformanceProfile(true);
    },
  };
  const before = io.read();
  const old = before ? preparationMetadata(before) : null;
  if (before) {
    await io.archive(before);
    requireCondition(
      io.read()?.equals(before),
      503,
      'PERFORMANCE_PROFILE_CHANGED',
      'archive 후 원래 bytes가 바뀌었습니다.',
    );
    io.remove();
  }
  await io.prepare();
  const after = io.read();
  requireCondition(
    after,
    503,
    'PERFORMANCE_PREPARATION_MISSING',
    '완료된 새 준비 산출물이 필요합니다.',
  );
  const current = preparationMetadata(after);
  requireCondition(
    current.seed === PILOT_PROFILE.id,
    503,
    'PERFORMANCE_PREPARATION_PROFILE',
    '현재 pilot 준비 산출물만 실행합니다. 기존 확장 profile은 archive 용도입니다.',
  );
  requireCondition(
    !before || (!after.equals(before) && current.id !== old!.id),
    503,
    'PERFORMANCE_PREPARATION_STALE',
    'touch/재직렬화한 이전 profile은 새 준비가 아닙니다.',
  );
  return {
    previousSha256: before ? sha256(before) : null,
    currentSha256: sha256(after),
    preparationCompleted: true,
    actualScaleVerified: false,
  };
}
export async function preparePerformanceProfile(resetOwnedFixture = false) {
  if (existsSync('.runtime/u2/performance-profile.json'))
    throw Error('기존 U2 성능/ACK profile을 초기화하지 않습니다. 명시 검토가 필요합니다.');
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.OMS_U2_SYNTHETIC_PROFILE !== 'approved-local-only'
  )
    throw new Error('명시적 로컬 합성 성능 profile만 준비할 수 있습니다.');
  const sources = u2Sources();
  await initializeU2Databases();
  for (const source of Object.values(sources)) await source.initialize();

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
    if (resetOwnedFixture) await resetU2Databases(sources.primaryAdmin, sources.journalAdmin);
    for (let i = 0; i < PILOT_PROFILE.customers; i++)
      await seedSyntheticAccount(store, 'nfr-customer-' + i, 'CUSTOMER');
    for (let i = 0; i < PILOT_PROFILE.staff; i++)
      await seedSyntheticAccount(store, 'nfr-staff-' + i, 'STAFF');
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
        'staff.role.manage',
      ],
    });
    await staffAccess.grantRole(await context('nfr-staff-0', 'STAFF'), {
      meta: meta(),
      accountRef: (await context('nfr-staff-0', 'STAFF')).actorAccountRef!,
      roleRef: staffRole.targetRef!,
      decision: 'GRANT',
    });
    const enterprises: Ref[] = [];
    const roles: Ref[] = [],
      members: Ref[] = [],
      contacts: Ref[] = [];
    for (let company = 0; company < PILOT_PROFILE.enterprises; company++) {
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
        await organisation.membership(
          await context(admin, 'CUSTOMER'),
          ref('Enterprise', current),
          {
            meta: meta(),
            accountRef: ref('Account', account),
            departmentRef: null,
            siteRef: null,
            active: true,
            administrator: false,
          },
        );
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
      roles.push(tradeRole.targetRef!);
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
      const member = (
        await store.list('EnterpriseMembership', {
          equals: {
            enterpriseRef: { id: current.id },
            accountRef: { id: 'nfr-customer-' + (company * 10 + 9) },
          },
          limit: 2,
        })
      )[0]!;
      members.push(ref('EnterpriseMembership', member));
      if (company % 10 === 0)
        console.log('명시적 기업 승인/별도 관리자/구성원·거래 grant 준비:', company + 1);
    }
    const products: { productRef: Ref; offerRef: Ref; productType: 'HARDWARE' | 'SOFTWARE' }[] = [];
    for (let i = 0; i < PILOT_PROFILE.products; i++) {
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
    await seedHistoricalOrders(store, enterprises, products, PILOT_PROFILE.orders);
    for (let index = 1; index < 10; index++)
      await staffAccess.grantRole(await context('nfr-staff-0', 'STAFF'), {
        meta: meta(),
        accountRef: ref('Account', (await store.read('Account', 'nfr-staff-' + index))!),
        roleRef: staffRole.targetRef!,
        decision: 'GRANT',
      });
    await backfillU2SecurityState(store);
    await store.execute(
      {
        principalId: 'u2-profile-contact-setup',
        audience: 'SYSTEM',
        owner: 'U1Host',
        operation: 'u2-profile-contact-setup',
        target: null,
        idempotencyKey: randomUUID(),
        input: { profile: PILOT_PROFILE.id },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        for (let company = 0; company < PILOT_PROFILE.enterprises; company++) {
          const contact = {
            contactId: randomUUID(),
            revision: 1,
            accountRef: null,
            address: 'profile-recipient-' + company + '@example.invalid',
            state: 'VERIFIED',
            contactVersion: 1,
            verifiedAt: now().toISOString(),
          };
          await tx.put('RegisteredContact', contact);
          contacts.push(ref('RegisteredContact', contact));
        }
      },
    );
    await store.execute(
      {
        principalId: 'synthetic-u2-performance-backfill',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-current-fences',
        target: null,
        idempotencyKey: randomUUID(),
        input: { count: PILOT_PROFILE.enterprises },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put('StaffAuthorityFence', {
          fenceId: U2_STAFF_FENCE_ID,
          authorityRevision: 1,
          revision: 1,
        });
        for (const enterpriseRef of enterprises)
          await tx.put('EnterpriseAccessFence', {
            fenceId: u2EnterpriseFenceId(enterpriseRef.id),
            enterpriseRef,
            accessRevision: 1,
            revision: 1,
          });
      },
    );
    for (const token of tokens.values()) await identity.logout(token);
    mkdirSync('.runtime/u2', { recursive: true });
    writeFileSync(
      '.runtime/u2/performance-profile.json',
      JSON.stringify({
        verifier: verifier.toString('hex'),
        purposeKey: randomBytes(32).toString('hex'),
        rateKey: randomBytes(32).toString('hex'),
        vaultKey: randomBytes(32).toString('hex'),
        customerCookieKey: randomBytes(32).toString('hex'),
        staffCookieKey: randomBytes(32).toString('hex'),
        id: randomUUID(),
        seed: PILOT_PROFILE.id,
        credentials,
        enterprises,
        roles,
        members,
        contacts,
        products: products.slice(0, 100),
        preparedAt: new Date().toISOString(),
        counts: profileCounts(),
      }),
      { mode: 0o600 },
    );
    console.log('전체 합성 저장 규모 준비 완료. 실제 기업/외부 효과/성능 통과 증거가 아닙니다.');
  } finally {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  }
}

import { createApi } from '@oms/api';
import {
  Assessments,
  NoticeWorker,
  NotificationDelivery,
  OrderAcceptance,
  WorkInquiry,
} from '@oms/core';
import type { Receipt, TargetScope } from '@oms/contracts';
import { fingerprint } from '@oms/contracts';
import { runWorkerCycle } from '@oms/integrations';
import { SyntheticQueue } from '../../tests/u1/fixtures/queue.js';
import { SyntheticHttpClient } from '../../tests/u1/fixtures/http-client.js';
import { ProfileUi } from '../u1/profile-ui.js';
import { evaluateSamples, percentile } from '../u1/performance-statistics.js';
import type { Phase, Sample } from '../u1/performance-statistics.js';
import { firstStartEvidence } from '../u1/profile-observations.js';
import { evaluateWorkerRecovery } from '../u1/worker-recovery-evidence.js';
import type { WorkRecoveryRow, WorkRecoveryPhase } from '../u1/worker-recovery-evidence.js';
import { sha256 } from './runtime-source.js';
import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DataSource } from 'typeorm';
const executeResource = promisify(execFile);
interface Profile {
  verifier: string;
  purposeKey: string;
  rateKey: string;
  vaultKey: string;
  customerCookieKey: string;
  staffCookieKey: string;
  credentials: { password: string; factor: string };
  enterprises: Ref[];
  roles: Ref[];
  members: Ref[];
  contacts: Ref[];
  products: { productRef: Ref; offerRef: Ref; productType: 'HARDWARE' | 'SOFTWARE' }[];
  counts: Record<string, number>;
  id: string;
  seed: string;
}
import { createServer } from 'node:http';

import { RuntimeTelemetry, correlationHash } from '@oms/integrations';
import { apiObservationOperations } from '../../apps/api/src/observation.js';
import type { ObservationPort } from '@oms/contracts';
// Explicitly local, bounded OTLP collector. It proves SDK delivery to this
// synthetic endpoint, never Seoul CloudWatch/backend retention or real alerts.
async function performanceTelemetry(queueSnapshot?: () => Record<string, unknown>) {
  let traceBatches = 0;
  let metricBatches = 0;
  let bytes = 0;
  let rejected = 0;
  const server = createServer((request, response) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        rejected++;
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      bytes += size;
      if (request.url === '/v1/traces') traceBatches++;
      else if (request.url === '/v1/metrics') metricBatches++;
      else {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxHeadersCount = 25;
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('합성 collector 주소');
  const sdk = new RuntimeTelemetry(
    'http://127.0.0.1:' + address.port,
    true,
    new Set([
      ...apiObservationOperations,
      'NotificationDelivery.relay',
      'NotificationDelivery.consume',
      'NotificationDelivery.firstProcessing',
    ]),
  );
  const port: ObservationPort = {
    begin: (role, audience, operation, correlation) => {
      const observation = sdk.begin(role, audience, operation, correlation);
      let complete = false;
      return {
        finish: (metadata) => {
          if (complete) return;
          complete = true;
          observation.finish(metadata);
          if (operation === 'NotificationDelivery.consume')
            appendFileSync(
              '.reports/u2/worker-consume.jsonl',
              JSON.stringify({
                observedAt: new Date().toISOString(),
                correlationHash: correlationHash(correlation),
                operation,
                outcome: metadata.outcome,
              }) + '\n',
              { mode: 0o600 },
            );
          if (metadata.eligibleDelayMilliseconds !== undefined)
            appendFileSync(
              '.reports/u2/worker-first-start.jsonl',
              JSON.stringify({
                observedAt: new Date().toISOString(),
                correlationHash: correlationHash(correlation),
                operation,
                outcome: metadata.outcome,
                delayMilliseconds: metadata.eligibleDelayMilliseconds,
              }) + '\n',
              { mode: 0o600 },
            );
        },
      };
    },
  };
  const save = () =>
    writeFileSync(
      '.reports/u2/telemetry-live.json',
      JSON.stringify(
        {
          synthetic: true,
          realDeliveryVerified: false,
          observedAt: new Date().toISOString(),
          collector: { traceBatches, metricBatches, bytes, rejected },
          sdk: sdk.snapshot(),
          process: { rss: process.memoryUsage().rss, cpuMicroseconds: process.cpuUsage() },
          queue: queueSnapshot?.() ?? null,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  const timer = setInterval(save, 5000);
  timer.unref();
  return {
    port,
    close: async () => {
      clearInterval(timer);
      await sdk.close();
      save();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}
export async function resourceObservation(
  primary: DataSource,
  journal: DataSource,
  ports = { execute: executeResource, telemetryPath: '.reports/u2/telemetry-live.json' },
) {
  const db = async (source: DataSource) =>
    (
      await source.query(
        `SELECT count(*)::integer AS connections,count(*) FILTER(WHERE state='active')::integer AS active,count(*) FILTER(WHERE wait_event_type='Lock')::integer AS lock_waits FROM pg_stat_activity WHERE datname=current_database()`,
      )
    )[0];
  const backlog = (await primary.query(
    `SELECT state,count(*)::integer AS count FROM u1_work_item GROUP BY state ORDER BY state`,
  )) as { state: string; count: number }[];
  const web = [];
  for (const port of [3300, 3301]) {
    const found = await ports.execute('lsof', ['-nP', '-tiTCP:' + port, '-sTCP:LISTEN'], {
      timeout: 5000,
      maxBuffer: 65536,
    });
    const ids = found.stdout.trim().split(/\s+/);
    if (ids.some((id) => !/^\d+$/.test(id))) throw new Error('현재 BFF 프로세스 확인 실패');
    const result = await ports.execute('ps', ['-p', ids.join(','), '-o', 'pid=,rss=,%cpu='], {
      timeout: 5000,
      maxBuffer: 65536,
    });
    web.push({
      port,
      processes: result.stdout
        .trim()
        .split('\n')
        .map((line) => {
          const [pid, rss, cpu] = line.trim().split(/\s+/).map(Number);
          if (
            ![pid, rss, cpu].every((value) => Number.isFinite(value) && value! >= 0) ||
            !Number.isInteger(pid) ||
            pid! < 1 ||
            rss! < 1
          )
            throw new Error('실제 BFF 자원 값 확인 실패');
          return { pid, rssBytes: rss! * 1024, cpuPercent: cpu };
        }),
    });
  }
  const containers = await ports.execute(
    'docker',
    ['ps', '--filter', 'label=com.docker.compose.project=oms-u1', '--format', '{{json .}}'],
    { timeout: 5000, maxBuffer: 65536 },
  );
  const rows = containers.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { ID: string; Labels: string });
  const ids = rows
    .filter((row) => /com\.docker\.compose\.service=(primary|journal)(,|$)/.test(row.Labels))
    .map((row) => row.ID);
  if (ids.length !== 2) throw new Error('현재 두 PG 컨테이너 자원 근거 실패');
  const stats = await ports.execute(
    'docker',
    ['stats', '--no-stream', '--format', '{{json .}}', ...ids],
    { timeout: 5000, maxBuffer: 65536 },
  );
  const telemetry = JSON.parse(readFileSync(ports.telemetryPath, 'utf8'));
  if (
    !telemetry.process ||
    !Number.isFinite(telemetry.process.rss) ||
    telemetry.process.rss < 1 ||
    !telemetry.sdk
  )
    throw new Error('API/worker 관측 자원 근거 누락');
  return {
    observedAt: new Date().toISOString(),
    primary: await db(primary),
    journal: await db(journal),
    backlog,
    web,
    postgresContainers: stats.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    apiWorkerCombinedProcess: telemetry.process,
    telemetry: telemetry.sdk,
    queue: telemetry.queue ?? null,
    roleLayout:
      '로컬 API/worker 동일 측정 프로세스·BFF 두 별도 프로세스·두 PG 컨테이너; Fargate 4-role 용량 증거 아님',
  };
}
async function records(path: string, visit: (record: Record<string, unknown>) => void) {
  if (statSync(path).size > 64 * 1024 * 1024) throw new Error('측정 metadata 파일 범위 초과');
  const input = createReadStream(path, { highWaterMark: 65536 });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  try {
    for await (const line of lines) {
      if (++count > 100000 || Buffer.byteLength(line) > 4096)
        throw new Error('측정 metadata의 유한 범위 초과');
      visit(JSON.parse(line));
    }
  } finally {
    lines.close();
    input.destroy();
  }
}
export async function collectCurrentWorkerRecovery(
  store: ProtectedStore,
  phases: readonly WorkRecoveryPhase[],
  source: {
    runId: string;
    profileId: string;
    sourceIdentity: SourceIdentity;
  },
  paths = {
    acks: '.reports/u2/performance-ack.jsonl',
    starts: '.reports/u2/worker-first-start.jsonl',
    consumes: '.reports/u2/worker-consume.jsonl',
    report: '.reports/u2/worker-recovery-profile.json',
  },
) {
  const acks: { requestId: string; correlationId: string; observedAt: string }[] = [];
  await records(paths.acks, (value) => {
    // Staff product registration does not create a notification Work.
    if (value.owner === 'OrderAcceptance') acks.push(value as (typeof acks)[number]);
  });
  const startByCorrelation = new Map<string, { observedAt: string; delayMilliseconds: number }>();
  await records(paths.starts, (value) => {
    if (value.operation === 'NotificationDelivery.firstProcessing' && value.outcome === 'SUCCESS') {
      const hash = String(value.correlationHash);
      const current = startByCorrelation.get(hash);
      if (!current || String(value.observedAt) < current.observedAt)
        startByCorrelation.set(hash, {
          observedAt: String(value.observedAt),
          delayMilliseconds: Number(value.delayMilliseconds),
        });
    }
  });
  const results = [];
  const completedByCorrelation = new Set<string>();
  await records(paths.consumes, (value) => {
    if (value.operation === 'NotificationDelivery.consume' && value.outcome === 'SUCCESS')
      completedByCorrelation.add(String(value.correlationHash));
  });
  for (const phase of phases) {
    const rows: WorkRecoveryRow[] = [];
    let missingWork = 0;
    for (const ack of acks.filter(
      (value) => value.observedAt >= phase.from && value.observedAt <= phase.to,
    )) {
      const work = await store.list('WorkItem', {
        equals: { owner: 'NotificationDelivery', requestId: ack.requestId },
        limit: 25,
      });
      // The registered minimum in-app path creates one original Work per order.
      // Ambiguous/missing originals are not a successful timing sample.
      if (
        work.length !== 1 ||
        work[0]!.requestId !== ack.requestId ||
        work[0]!.correlationId !== ack.correlationId ||
        work[0]!.owner !== 'NotificationDelivery'
      ) {
        missingWork++;
        continue;
      }
      const original = work[0]!;
      const hash = createHash('sha256').update(ack.correlationId).digest('hex');
      const start = startByCorrelation.get(hash) ?? null;
      rows.push({
        workId: String(original.workId),
        requestId: String(original.requestId),
        correlationHash: hash,
        state: String(original.state),
        acknowledged: completedByCorrelation.has(hash),
        notBefore: String(original.notBefore),
        deadlineAt: String(original.deadlineAt),
        start,
      });
    }
    results.push(evaluateWorkerRecovery(phase, rows, missingWork));
  }
  const report = {
    passed: results.length === 3 && results.every((result) => result.passed),
    runId: source.runId,
    profileId: source.profileId,
    sourceDigest: source.sourceIdentity.digest,
    evaluationSourceIdentity: runtimeSourceIdentity(),
    ackSha256: sha256(readFileSync(paths.acks)),
    phases: results,
    primaryTechnicalBacklogNotAck: await store.primary.query(
      `SELECT state,count(*)::integer AS count,count(*) FILTER(WHERE "notBefore"<=now() AND "deadlineAt">now())::integer AS currently_due_before_deadline FROM u1_work_item WHERE owner='NotificationDelivery' GROUP BY state ORDER BY state`,
    ),
    observedAt: new Date().toISOString(),
    actualSqsRecoveryVerified: false,
    scope:
      '로컬 보호된 신규 주문 Work의 원래ID·due/deadline·첫 보호처리·종료 전수 대조; 과거 business REVIEW_REQUIRED 제외',
  };
  writeFileSync(paths.report, JSON.stringify(report, null, 2), { mode: 0o600 });
  return report;
}

async function startPerformanceServices(profile: Profile) {
  const sources = u2Sources(),
    workerSources = u2Sources('worker');
  for (const s of [
    sources.primaryApp,
    sources.journalAppend,
    sources.vault,
    workerSources.primaryApp,
    workerSources.journalAppend,
    workerSources.vault,
  ])
    await s.initialize();
  const store = new ProtectedStore(sources.primaryApp, sources.journalAppend),
    now = () => new Date(),
    broker = new SyntheticQueue(),
    telemetry = await performanceTelemetry(() => broker.snapshot());
  const verifier = new PurposeVerifier(
      Buffer.from(profile.purposeKey, 'hex'),
      'u2-profile-verifier',
    ),
    vault = new PurposeSecretVault(
      sources.vault,
      Buffer.from(profile.vaultKey, 'hex'),
      'u2-profile-vault',
      (b, p, a) => authorizeProtectedVault(store, b, p, a),
      Date.now,
    ),
    staffIngress = async (proof: unknown) => proof === 'synthetic-private-ingress',
    authorities = new EnrollmentAuthorities(store, verifier, now, staffIngress),
    parties = new PartyClaimContexts(store, verifier, now, staffIngress),
    handoffs = new RecoveryHandoffs(
      store,
      verifier,
      vault,
      now,
      'LOCAL_SYNTHETIC',
      parties,
      staffIngress,
    );
  const identity = new IdentityRecovery(
    store,
    new SyntheticIdentityProvider(false, profile.credentials),
    {
      synthetic: true,
      verifierKey: Buffer.from(profile.verifier, 'hex'),
      now,
      staffIngress: async (proof) => proof === 'synthetic-private-ingress',
    },
    {
      parties,
      handoffs,
      authorities,
      cases: new RecoveryCases(
        store,
        Buffer.from(profile.purposeKey, 'hex'),
        now,
        staffIngress,
        async (digest) => {
          requireCondition(
            /^[a-f0-9]{64}$/.test(digest),
            503,
            'PROFILE_ADMISSION_SOURCE',
            'HTTP 공유 admission 뒤의 원래 identifier digest가 필요합니다.',
          );
        },
      ),
      savedCodes: new SavedCodeRecoveries(store, verifier, vault, now, 'LOCAL_SYNTHETIC'),
      completions: new RecoveryCompletions(store, authorities, now, 'LOCAL_SYNTHETIC'),
    },
  );
  const owners = {
    store,
    identity,
    enterprise: new EnterpriseAccess(store, new SyntheticEnterpriseVerification(), now, true, {
      verifier,
      vault,
      authorities,
    }),
    catalog: new ProductCatalog(store, now),
    orders: new OrderAcceptance(store, new Assessments(now), now),
    staff: new StaffAccess(store, now),
    inquiry: new WorkInquiry(store, now),
    notices: new NotificationDelivery(store, now),
    now,
    u2RateKey: Buffer.from(profile.rateKey, 'hex'),
    personRegistration: 'LOCAL_SYNTHETIC' as const,
  };
  const apis: Awaited<ReturnType<typeof createApi>>[] = [];
  for (const audience of ['CUSTOMER', 'STAFF'] as const) {
    const staff = audience === 'STAFF',
      port = staff ? 34801 : 34800;
    const api = await createApi(owners, {
      audience,
      origin: 'http://127.0.0.1:' + (staff ? 3301 : 3300),
      transportHost: '127.0.0.1:' + port,
      cookieKey: Buffer.from(staff ? profile.staffCookieKey : profile.customerCookieKey, 'hex'),
      localSynthetic: true,
      telemetry: telemetry.port,
      staffAdmission: async (request) =>
        staff && request.socket.remoteAddress === '127.0.0.1' ? 'synthetic-private-ingress' : null,
    });
    await api.app.listen(port, '127.0.0.1');
    apis.push(api);
  }
  const workers = new NoticeWorker(
      new ProtectedStore(workerSources.primaryApp, workerSources.journalAppend),
      broker,
      now,
      true,
      telemetry.port,
    ),
    stop = new AbortController();
  const workerStore = new ProtectedStore(workerSources.primaryApp, workerSources.journalAppend),
    workerVault = new PurposeSecretVault(
      workerSources.vault,
      Buffer.from(profile.vaultKey, 'hex'),
      'u2-profile-vault',
      (b, p, a) => authorizeProtectedVault(workerStore, b, p, a),
      Date.now,
    ),
    workerAuthorities = new EnrollmentAuthorities(workerStore, verifier, now, staffIngress),
    workerAccess = new EnterpriseAccess(
      workerStore,
      new SyntheticEnterpriseVerification(),
      now,
      true,
      { verifier, vault: workerVault, authorities: workerAuthorities },
    ),
    invitationOwner = new EnterpriseInvitations(
      workerAccess,
      verifier,
      workerVault,
      workerAuthorities,
      now,
    ),
    deliveredTokens = new Map<
      string,
      { invitationRef: Ref; response: string; receivedAt: number }
    >(),
    delivery = new PrivateU2Delivery(
      workerStore,
      workerVault,
      {
        profile: 'LOCAL_SYNTHETIC',
        send: async (envelope, bytes, budget) => {
          budget.check();
          const contact = await workerStore.currentProtected(
              'RegisteredContact',
              envelope.routeRef.id,
            ),
            invitation = await workerStore.currentProtected(
              'MembershipInvitation',
              envelope.targetRef.id,
            );
          requireCondition(
            envelope.purpose === 'INVITATION_TOKEN' &&
              contact?.state === 'VERIFIED' &&
              canonicalJson(ref('RegisteredContact', contact)) ===
                canonicalJson(envelope.routeRef) &&
              invitation &&
              canonicalJson(ref('MembershipInvitation', invitation)) ===
                canonicalJson(envelope.targetRef) &&
              verifier.matches(
                bytes.toString(),
                invitationBinding(invitation),
                String(invitation.tokenVerifier),
              ),
            503,
            'PROFILE_RECEIVER_ORIGINAL',
            '현재 연락/초대 원본의 정확한 합성 전달만 허용합니다.',
          );
          const original = await workerStore.currentProtected('WorkItem', envelope.deliveryId);
          requireCondition(
            original?.state === 'PROCESSING' &&
              original.attempt === 1 &&
              canonicalJson(original.targetRef) === canonicalJson(envelope.targetRef),
            503,
            'PROFILE_RECEIVER_PROCESSING',
            '실제 보호 PROCESSING 뒤에만 private send를 시작합니다.',
          );
          if (!u2Starts.has(envelope.deliveryId))
            u2Starts.set(envelope.deliveryId, {
              workId: envelope.deliveryId,
              consumer: 'u2-invitation-delivery',
              observedAt: now().toISOString(),
              delayMilliseconds: now().getTime() - Date.parse(String(original.notBefore)),
            });
          deliveredTokens.set(envelope.routeRef.id, {
            invitationRef: envelope.targetRef,
            response: bytes.toString(),
            receivedAt: now().getTime(),
          });
          requireCondition(
            deliveredTokens.size <= 100,
            503,
            'PROFILE_RECEIVER_CAPACITY',
            '등록된100개 합성 연락 경로의 메모리 상한을 유지합니다.',
          );
          return {
            deliveryId: envelope.deliveryId,
            routeRef: envelope.routeRef,
            knowledge: 'KNOWN',
          };
        },
      },
      now,
      true,
      undefined,
      invitationOwner,
    ),
    u2 = new U2Worker(
      workerStore,
      broker,
      new IdentityConsumer(
        workerStore,
        new StatefulRecoveryProvider(now),
        workerAuthorities,
        now,
        true,
        workerVault,
        verifier,
      ),
      now,
      true,
      { 'u2-invitation-delivery': delivery },
    );
  const u2Starts = new Map<
    string,
    { workId: string; observedAt: string; delayMilliseconds: number; consumer: string }
  >();
  const consumer = {
    relayBatch: () => u2.relayBatch(),
    consume: (message: QueueMessage) => u2.consume(message),
  };
  let running = false;
  let sweepAt = 0;
  let workerFailures = 0;
  const workerFailureReasons = new ProfileWorkerFailures();
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void (async () => {
      if (Date.now() - sweepAt >= 1000) {
        sweepAt = Date.now();
        const source = await u2.sweepSources(),
          terminal = await workerVault.sweepTerminal(workerStore),
          expired = await workerVault.sweepExpired(workerStore);
        workerFailures += source.blocked + terminal.blocked + expired.blocked;
        workerFailureReasons.record('sweep-source-blocked', source.blocked);
        workerFailureReasons.record('vault-terminal-blocked', terminal.blocked);
        if (terminal.blocked)
          console.log(
            JSON.stringify({
              event: 'profile-terminal-sweep-blocked',
              phase: 'TERMINAL_SWEEP',
              observedAt: now().toISOString(),
              blocked: terminal.blocked,
              codes: terminal.failures.map((failure) =>
                failure.code === 'CURRENT_AUTH_NOT_PROTECTED'
                  ? 'CURRENT_AUTH_NOT_PROTECTED'
                  : 'UNCLASSIFIED',
              ),
            }),
          );
        workerFailureReasons.record('vault-expired-blocked', expired.blocked);
        for (const [id, material] of deliveredTokens)
          if (Date.now() - material.receivedAt >= 30000) deliveredTokens.delete(id);
      }
      return runWorkerCycle(
        workers,
        broker,
        stop.signal,
        () => {
          workerFailures++;
          workerFailureReasons.record('ack-unconfirmed');
          console.error('합성 부하 원래 작업 실패: ACK 미확인');
        },
        consumer,
      );
    })()
      .catch(() => {
        workerFailures++;
        workerFailureReasons.record('worker-cycle-exception');
        console.error('합성 worker 경계 미확인');
      })
      .finally(() => {
        running = false;
      });
  }, 100);
  const children = [
    ['customer-web', 3300, 34800],
    ['staff-web', 3301, 34801],
  ].map(([app, web, api]) =>
    spawn(
      process.execPath,
      [
        'node_modules/next/dist/bin/next',
        'dev',
        'apps/' + app,
        '--hostname',
        '127.0.0.1',
        '--port',
        String(web),
      ],
      {
        stdio: ['ignore', 'ignore', 'ignore'],
        env: {
          ...process.env,
          NODE_ENV: 'development',
          OMS_LOCAL_SYNTHETIC: '1',
          OMS_WEB_ORIGIN: 'http://127.0.0.1:' + web,
          OMS_API_ORIGIN: 'http://127.0.0.1:' + api,
        },
      },
    ),
  );
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    stop.abort();
    clearInterval(timer);
    while (running) await pause(50);
    deliveredTokens.clear();
    for (const c of children) c.kill('SIGTERM');
    const forceChildren = setTimeout(() => {
      for (const c of children) if (c.exitCode === null) c.kill('SIGKILL');
    }, 5000);
    await Promise.all(
      children.map((c) =>
        c.exitCode !== null
          ? Promise.resolve()
          : new Promise<void>((done) => c.once('exit', () => done())),
      ),
    );
    for (const api of apis) await api.app.close();
    clearTimeout(forceChildren);
    for (const s of Object.values(sources).concat(Object.values(workerSources)))
      if (s.isInitialized) await s.destroy();
    await telemetry.close();
  };
  try {
    for (const port of [3300, 3301]) {
      const started = Date.now();
      while (true) {
        if (children.some((c) => c.exitCode !== null)) throw Error('합성 BFF 시작 실패');
        try {
          const response = await fetch('http://127.0.0.1:' + port, {
            signal: AbortSignal.timeout(1000),
          });
          await response.body?.cancel();
          if (response.ok) break;
        } catch {}
        if (Date.now() - started > 120000) throw Error('합성 BFF 준비 기한');
        await pause(250);
      }
    }
  } catch (e) {
    await close();
    throw e;
  }
  return {
    close,
    store,
    owners,
    verifier,
    vault,
    authorities,
    u2Starts,
    deliveredTokens,
    broker,
    workerFailureCount: () => workerFailures,
    workerFailureReasons: () => workerFailureReasons.snapshot(),
  };
}
// This is a measured purpose-path preparation probe, separate from the fixed
// Registered pilot 80/20 samples. The independent probe never supplies a load result.
export async function profileInvitationProbe(input: {
  store: ProtectedStore;
  manager: SyntheticHttpClient;
  recipient: SyntheticHttpClient;
  recipientId: string;
  enterpriseRef: Ref;
  contactRef: Ref;
  receive: (invitationRef: Ref) => Promise<string>;
}) {
  const rows: {
    operation: string;
    expectedStatus: number;
    status: number;
    milliseconds: number;
  }[] = [];
  async function call<T>(
    client: SyntheticHttpClient,
    operation: string,
    expectedStatus: number,
    path: string,
    data?: unknown,
    headers?: Record<string, string>,
  ) {
    const start = performance.now();
    const result = await client.request<T>(path, data, headers);
    rows.push({
      operation,
      expectedStatus,
      status: result.response.status,
      milliseconds: performance.now() - start,
    });
    requireCondition(
      result.response.status === expectedStatus,
      503,
      'PROFILE_PURPOSE_PROBE_RESPONSE',
      '등록된 목적 단계의 실제 응답이 다릅니다: ' + operation,
    );
    return result.body;
  }
  const at = new Date(),
    account = (await input.store.currentProtected('Account', input.recipientId))!,
    bindings = await input.store.list('ProviderBinding', {
      equals: { accountRef: { id: input.recipientId }, audience: 'CUSTOMER', active: true },
      limit: 2,
    });
  requireCondition(
    account?.active && bindings.length === 1,
    503,
    'PROFILE_PURPOSE_PROBE_ACCOUNT',
    '원래 profile의 실제 활성 recipient binding이 필요합니다.',
  );
  const binding = (await input.store.currentProtected(
      'ProviderBinding',
      String(bindings[0]!.bindingId),
    ))!,
    policy = {
      policyId: randomUUID(),
      revision: 1,
      purpose: 'INVITATION_ACCEPTANCE',
      requiredSourceKinds: ['SYNTHETIC'],
      synthetic: true,
      active: true,
      expiresAt: new Date(at.getTime() + 3600000).toISOString(),
      retentionSeconds: 300,
    },
    evidence = {
      evidenceId: randomUUID(),
      revision: 1,
      accountRef: ref('Account', account),
      bindingRef: ref('ProviderBinding', binding),
      policyRef: ref('VerificationPolicy', policy),
      purpose: 'INVITATION_ACCEPTANCE',
      sourceKind: 'SYNTHETIC',
      authorityRef: ref('Account', account),
      observedAt: at.toISOString(),
      expiresAt: new Date(at.getTime() + 300000).toISOString(),
      synthetic: true,
      state: 'CONFIRMED',
      contactRef: input.contactRef,
      contactVersion: 1,
      enterpriseRef: null,
      caseRef: null,
      partyContextRef: null,
      challengeId: null,
    };
  await input.store.execute(
    {
      principalId: 'u2-profile-synthetic-contact-proof',
      audience: 'SYSTEM',
      owner: 'U1Host',
      operation: 'u2-profile-synthetic-contact-proof',
      target: null,
      idempotencyKey: randomUUID(),
      input: { profile: PILOT_PROFILE.id, contactRef: input.contactRef },
      correlationId: randomUUID(),
      epoch: await input.store.currentEpoch(),
    },
    async (tx) => {
      await tx.put('VerificationPolicy', policy);
      await tx.put('VerificationEvidence', evidence);
    },
  );
  const requestId = randomUUID();
  const issued = await call<Receipt>(
    input.manager,
    'inviteMembership',
    202,
    '/enterprises/' + input.enterpriseRef.id + '/membership-invitations',
    {
      meta: {
        clientRequestId: requestId,
        expectedRevision: null,
        reason: '합성 profile의 실제 목적 수락 준비',
        evidenceRefs: [],
      },
      enterpriseRef: input.enterpriseRef,
      contactRef: input.contactRef,
      contactVersion: 1,
      departmentRef: null,
      siteRef: null,
      roleRefs: [],
      expectedMembershipRevision: null,
      reactivate: false,
    },
    { 'Idempotency-Key': requestId, 'X-Target-Revision': String(input.enterpriseRef.revision) },
  );
  requireCondition(
    issued.targetRef?.entity === 'MembershipInvitation' && issued.owner === 'EnterpriseAccess',
    503,
    'PROFILE_PURPOSE_PROBE_ISSUANCE',
    '원래 보호 초대 ACK가 필요합니다.',
  );
  let response = await input.receive(issued.targetRef);
  try {
    const common = {
      invitationRef: issued.targetRef,
      response,
      contactVerificationRef: ref('VerificationEvidence', evidence),
    };
    const purpose = await call<{ phase: string; handle?: string }>(
      input.recipient,
      'issueInvitationPurpose',
      202,
      '/membership-invitations/' + issued.targetRef.id + '/purpose-authorities',
      common,
      { 'X-Target-Revision': '1' },
    );
    requireCondition(
      purpose.phase === 'ENROLMENT_ONLY' && purpose.handle === undefined,
      503,
      'PROFILE_PURPOSE_PROBE_AUTHORITY',
      '실제 제한 목적만 cookie로 교환해야 합니다.',
    );
    await input.recipient.refreshCsrf();
    const own = await call<{ state: string }>(
      input.recipient,
      'readOwnInvitation',
      200,
      '/membership-invitations/' + issued.targetRef.id,
    );
    requireCondition(
      own.state === 'PENDING',
      503,
      'PROFILE_PURPOSE_PROBE_BEFORE',
      '수락 전 자료는 원래 PENDING입니다.',
    );
    const key = randomUUID();
    const accepted = await call<Receipt>(
      input.recipient,
      'acceptMembershipInvitation',
      202,
      '/membership-invitations/' + issued.targetRef.id + '/acceptances',
      {
        ...common,
        meta: {
          clientRequestId: key,
          expectedRevision: 1,
          reason: '합성 본인의 명시적 초대 수락',
          evidenceRefs: [],
        },
      },
      { 'Idempotency-Key': key, 'X-Target-Revision': '1' },
    );
    const member = await input.store.currentProtected(
      'EnterpriseMembership',
      accepted.targetRef!.id,
    );
    requireCondition(
      member?.active &&
        (member.accountRef as Ref).id === input.recipientId &&
        (member.enterpriseRef as Ref).id === input.enterpriseRef.id,
      503,
      'PROFILE_PURPOSE_PROBE_EFFECT',
      '실제 본인 소속의 단일 보호 효과가 필요합니다.',
    );
    const after = await call<{ state: string }>(
      input.recipient,
      'readOwnInvitation',
      200,
      '/membership-invitations/' + issued.targetRef.id,
    );
    requireCondition(
      after.state === 'ACCEPTED',
      503,
      'PROFILE_PURPOSE_PROBE_AFTER',
      '전달 ACK를 실제 수락으로 바꾸지 않습니다.',
    );
    return {
      passed: true,
      operations: rows,
      requestIds: [issued.requestId, accepted.requestId],
      acknowledgements: await Promise.all(
        [issued, accepted].map(async (wire, index) => {
          const original = await input.store.currentProtected('RequestReceipt', wire.requestId);
          requireCondition(
            original &&
              original.owner === 'EnterpriseAccess' &&
              original.operation ===
                ['issueMembershipInvitation', 'acceptMembershipInvitation'][index] &&
              original.requestId === wire.requestId &&
              original.idempotencyKey === [requestId, key][index] &&
              (original.resultRefs as Ref[]).some(
                (value) => canonicalJson(value) === canonicalJson(wire.targetRef),
              ),
            503,
            'PROFILE_PROBE_ACK',
            '원래 보호된 수락/발급 ACK가 필요합니다.',
          );
          return {
            requestId: wire.requestId,
            targetRef: wire.targetRef,
            owner: original.owner,
            operation: original.operation,
            principalId: original.principalId,
            clientRequestId: original.idempotencyKey,
            requestFingerprint: original.requestFingerprint,
            receiptDigest: fingerprint(original),
            observedAt: new Date().toISOString(),
          };
        }),
      ),
      actualProtectedMembership: true,
      actualNoticeDeliveryClaimed: false,
    };
  } finally {
    response = '';
  }
}
export async function collectU2ProfileStarts(
  service: Awaited<ReturnType<typeof startPerformanceServices>>,
  from: string,
  to: string,
  ackPath = '.reports/u2/performance-ack.jsonl',
) {
  const acknowledgements: { requestId: string; observedAt: string; operation: string }[] = [];
  await records(ackPath, (row) => {
    if (
      ['issueMembershipInvitation', 'resendMembershipInvitation'].includes(String(row.operation)) &&
      String(row.observedAt) >= from &&
      String(row.observedAt) <= to
    )
      acknowledgements.push(row as unknown as (typeof acknowledgements)[number]);
  });
  const rows = [];
  let missingOrUnconfirmed = 0;
  const unconfirmedReasons = {
    WORK_MISSING: 0,
    ORIGINAL_UNCONFIRMED: 0,
    FIRST_START_MISSING: 0,
    START_TIME_INVALID: 0,
    RESULT_NOT_RECORDED: 0,
    OUTBOX_CARDINALITY: 0,
    QUEUE_ACK_UNCONFIRMED: 0,
  };
  const startedDelays: number[] = [];
  for (const ack of acknowledgements) {
    const work = await service.store.list('WorkItem', {
      equals: {
        owner: 'EnterpriseAccess',
        operationId: 'EnterpriseAccess.deliverInvitation',
        requestId: ack.requestId,
      },
      limit: 2,
    });
    if (work.length !== 1) {
      missingOrUnconfirmed++;
      unconfirmedReasons.WORK_MISSING++;
      continue;
    }
    const original = await service.store.currentProtected('WorkItem', String(work[0]!.workId));
    if (!original) {
      missingOrUnconfirmed++;
      unconfirmedReasons.ORIGINAL_UNCONFIRMED++;
      continue;
    }
    const id = String(original.workId),
      start = service.u2Starts.get(id),
      outbox = await service.store.list('OutboxDelivery', {
        equals: { workRef: { id }, consumer: 'u2-invitation-delivery' },
        limit: 2,
      });
    const validTime =
      !!start &&
      Number.isFinite(start.delayMilliseconds) &&
      start.delayMilliseconds >= 0 &&
      Number.isFinite(Date.parse(start.observedAt)) &&
      Date.parse(start.observedAt) >= Date.parse(String(original.notBefore)) &&
      Date.parse(start.observedAt) < Date.parse(String(original.deadlineAt));
    if (validTime) startedDelays.push(start!.delayMilliseconds);
    if (
      !start ||
      !Number.isFinite(start.delayMilliseconds) ||
      start.delayMilliseconds < 0 ||
      !Number.isFinite(Date.parse(start.observedAt)) ||
      Date.parse(start.observedAt) < Date.parse(String(original.notBefore)) ||
      Date.parse(start.observedAt) >= Date.parse(String(original.deadlineAt)) ||
      original.state !== 'RESULT_RECORDED' ||
      outbox.length !== 1 ||
      !originalInvitationQueueAcknowledged(
        original,
        await service.store.currentProtected('OutboxDelivery', String(outbox[0]!.outboxId)),
        service.broker.messages,
        service.broker.acknowledgements,
      )
    ) {
      missingOrUnconfirmed++;
      if (!start) unconfirmedReasons.FIRST_START_MISSING++;
      else if (!validTime) unconfirmedReasons.START_TIME_INVALID++;
      else if (original.state !== 'RESULT_RECORDED') unconfirmedReasons.RESULT_NOT_RECORDED++;
      else if (outbox.length !== 1) unconfirmedReasons.OUTBOX_CARDINALITY++;
      else unconfirmedReasons.QUEUE_ACK_UNCONFIRMED++;
      continue;
    }
    rows.push({
      requestId: ack.requestId,
      ...start,
      protectedState: original.state,
      queueAcknowledged: true,
    });
  }
  const p95 = percentile(
    rows.map((row) => row.delayMilliseconds),
    0.95,
  );
  return {
    passed: rows.length > 0 && missingOrUnconfirmed === 0 && p95 !== null && p95 <= 10000,
    samples: rows.length,
    p95Milliseconds: p95,
    missingOrUnconfirmed,
    startedSamples: startedDelays.length,
    startedP95Milliseconds: percentile(startedDelays, 0.95),
    unconfirmedReasons,
    normalFrom: from,
    normalTo: to,
    actualProtectedProcessingBeforeSend: true,
    eligibleSource: 'protected original invitation+current private receiver',
    rows,
  };
}

export function originalInvitationQueueAcknowledged(
  work: Record<string, unknown>,
  outbox: Record<string, unknown> | null,
  messages: readonly QueueMessage[],
  acknowledged: readonly string[],
) {
  const copies = messages.filter((row) => row.id === outbox?.transportMessageId);
  if (
    !outbox ||
    copies.length !== 1 ||
    outbox.state !== 'PUBLISHED' ||
    outbox.epoch !== work.epoch ||
    (outbox.workRef as Ref)?.id !== work.workId ||
    outbox.consumer !== 'u2-invitation-delivery' ||
    !acknowledged.includes(copies[0]!.id)
  )
    return false;
  const message = copies[0]!,
    incoming = message.body as Record<string, unknown>;
  return (
    message.consumer === outbox.consumer &&
    incoming &&
    [
      'workId',
      'requestId',
      'owner',
      'operationId',
      'notBefore',
      'deadlineAt',
      'correlationId',
      'targetRef',
      'sourceFactRef',
      'executionPermitRef',
      'expectedRevision',
    ].every((field) => canonicalJson(incoming[field]) === canonicalJson(work[field]))
  );
}

export async function collectU2ProfileRecovery(
  store: ProtectedStore,
  phases: readonly WorkRecoveryPhase[],
  starts: ReadonlyMap<string, { observedAt: string; delayMilliseconds: number }>,
  queueAcknowledgements: readonly string[],
  queueMessages: readonly QueueMessage[],
  ackPath = '.reports/u2/performance-ack.jsonl',
) {
  const acks: { requestId: string; observedAt: string }[] = [];
  await records(ackPath, (row) => {
    if (
      row.owner === 'EnterpriseAccess' &&
      ['issueMembershipInvitation', 'resendMembershipInvitation'].includes(String(row.operation))
    )
      acks.push(row as unknown as (typeof acks)[number]);
  });
  const results = [];
  for (const phase of phases) {
    const rows: (WorkRecoveryRow & { protectedState: string })[] = [];
    let missingWork = 0;
    for (const ack of acks.filter(
      (row) => row.observedAt >= phase.from && row.observedAt <= phase.to,
    )) {
      const work = await store.list('WorkItem', {
        equals: {
          owner: 'EnterpriseAccess',
          operationId: 'EnterpriseAccess.deliverInvitation',
          requestId: ack.requestId,
        },
        limit: 2,
      });
      if (work.length !== 1) {
        missingWork++;
        continue;
      }
      const original = await store.currentProtected('WorkItem', String(work[0]!.workId));
      if (!original) {
        missingWork++;
        continue;
      }
      const id = String(original.workId);
      const outbox = await store.list('OutboxDelivery', {
        equals: { workRef: { id }, consumer: 'u2-invitation-delivery' },
        limit: 2,
      });
      rows.push({
        workId: id,
        requestId: String(original.requestId),
        correlationHash: createHash('sha256').update(String(original.correlationId)).digest('hex'),
        state: String(original.state),
        protectedState: String(original.state),
        acknowledged:
          outbox.length === 1 &&
          originalInvitationQueueAcknowledged(
            original,
            await store.currentProtected('OutboxDelivery', String(outbox[0]!.outboxId)),
            queueMessages,
            queueAcknowledgements,
          ),
        notBefore: String(original.notBefore),
        deadlineAt: String(original.deadlineAt),
        start: starts.get(id) ?? null,
      });
    }
    results.push(evaluateWorkerRecovery(phase, rows, missingWork));
  }
  return {
    passed: results.length === 3 && results.every((row) => row.passed),
    phases: results,
    protectedTerminalState: 'RESULT_RECORDED',
    actualExternalDeliveryVerified: false,
    scope:
      '합성 private receiver의 보호 PROCESSING 이후 첫 시작·원래 Work/Outbox/queue ACK·원래 due/deadline 전수 대조',
  };
}

export async function profileCurrentScope(
  store: ProtectedStore,
  prepared: TargetScope,
): Promise<TargetScope> {
  const current = await store.currentProtected('Enterprise', prepared.enterpriseRef.id);
  requireCondition(
    current?.approvalState === 'APPROVED' && current.usageEnabled === true,
    503,
    'PROFILE_ENTERPRISE_CURRENT',
    '부하의 현재 보호 승인/이용 기업이 필요합니다.',
  );
  const enterpriseRef = ref('Enterprise', current);
  return {
    ...prepared,
    enterpriseRef,
    contextPolicyRef: enterpriseRef,
    organisationRevision: enterpriseRef.revision,
  };
}

export class ProfileWorkerFailures {
  private readonly counts = {
    'sweep-source-blocked': 0,
    'vault-terminal-blocked': 0,
    'vault-expired-blocked': 0,
    'ack-unconfirmed': 0,
    'worker-cycle-exception': 0,
  };
  record(reason: keyof ProfileWorkerFailures['counts'], count = 1): void {
    requireCondition(
      Object.hasOwn(this.counts, reason) && Number.isSafeInteger(count) && count >= 0,
      503,
      'PROFILE_FAILURE_OBSERVATION',
      '닫힌 source의 정확한 실패 수가 필요합니다.',
    );
    this.counts[reason] += count;
    if (count > 0)
      console.error(
        JSON.stringify({
          event: 'profile-worker-failure',
          reason,
          count,
          observedAt: new Date().toISOString(),
        }),
      );
  }
  snapshot() {
    return { ...this.counts };
  }
}

export function profileSafeProblemCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const codes = [
    'invalid_input',
    'not_found',
    'organisation_revision',
    'product_offer_changed',
    'reconfirmation_required',
    'invitation_not_pending',
    'invitation_revision',
    'action_denied',
    'enterprise_not_enabled',
    'current_auth_not_protected',
    'query_deadline',
    'rate_limit',
    'idempotency_conflict',
    'stale_revision',
    'membership_confirmation_required',
  ];
  return typeof value === 'string' && codes.some((code) => value === 'urn:oms:problem:' + code)
    ? value.slice('urn:oms:problem:'.length).toUpperCase()
    : 'UNCLASSIFIED';
}

export async function profileCurrentInvitation(
  owner: EnterpriseInvitations,
  prepared: Ref | undefined,
): Promise<Ref | null> {
  if (!prepared) return null;
  const row = await owner.store.currentProtected('MembershipInvitation', prepared.id);
  requireCondition(row, 503, 'PROFILE_INVITATION_CURRENT', '보호된 원래 초대가 필요합니다.');
  const current = ref('MembershipInvitation', row);
  try {
    await owner.assertDelivery(current);
    return current;
  } catch (error) {
    if (
      error instanceof OmsError &&
      ['RECONFIRMATION_REQUIRED', 'INVITATION_NOT_PENDING'].includes(error.code)
    )
      return null;
    throw error;
  }
}

export function profileRecoveryInput(loginIdentifier: string, response: string) {
  return { loginIdentifier, recoveryResponse: response };
}
export function profileValidateU2Receipt(schema: SchemaValidator, value: unknown): Receipt {
  return schema.validateUri<Receipt>(
    'urn:oms:contract:u2-access-additions:1#/$defs/Receipt',
    value,
  );
}
export function profileReceiptResultMatches(
  operation: string,
  result: Receipt & { disposition?: string },
  receipt: Record<string, unknown>,
  originalInput: Record<string, unknown>,
) {
  const registered = {
    requestRecovery: ['IdentityRecovery', 'requestRecovery', 'ACCEPTED'],
    inviteMembership: ['EnterpriseAccess', 'issueMembershipInvitation', 'ACCEPTED'],
    resendMembershipInvitation: ['EnterpriseAccess', 'resendMembershipInvitation', 'ACCEPTED'],
    revokeMembershipInvitation: [
      'EnterpriseAccess',
      'revokeMembershipInvitation',
      'RESULT_RECORDED',
    ],
    grantCustomerRole: ['EnterpriseAccess', 'grantCustomerRole', 'RESULT_RECORDED'],
    reviseCustomerRole: ['EnterpriseAccess', 'reviseCustomerRole', 'RESULT_RECORDED'],
    updateMembership: ['EnterpriseAccess', 'updateMembership', 'RESULT_RECORDED'],
  }[operation];
  if (!registered) return false;
  const [owner, persistedOperation, state] = registered;
  if (
    result.owner !== owner ||
    receipt.owner !== owner ||
    receipt.operation !== persistedOperation ||
    result.requestId !== receipt.requestId ||
    result.statusRevision !== receipt.revision ||
    result.acceptedAt !== receipt.acceptedAt ||
    result.updatedAt !== receipt.updatedAt ||
    result.requestState !== state ||
    receipt.requestState !== state ||
    typeof receipt.idempotencyKey !== 'string' ||
    !receipt.idempotencyKey ||
    typeof receipt.requestFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(receipt.requestFingerprint)
  )
    return false;
  if (operation === 'requestRecovery')
    return (
      result.targetRef === null &&
      result.resultRefs.length === 0 &&
      (receipt.targetIdentity as { kind?: string })?.kind === 'NONE' &&
      receipt.principalId === 'recovery-request:' + receipt.idempotencyKey
    );
  if (
    receipt.idempotencyKey !==
      (originalInput.meta as { clientRequestId?: string })?.clientRequestId ||
    receipt.requestFingerprint !== fingerprint(originalInput)
  )
    return false;
  return (
    !!result.targetRef &&
    result.resultRefs.some((r) => canonicalJson(r) === canonicalJson(result.targetRef)) &&
    result.resultRefs.every((r) =>
      (receipt.resultRefs as Ref[]).some((p) => canonicalJson(p) === canonicalJson(r)),
    )
  );
}
export async function measurePerformanceProfile() {
  const profile = JSON.parse(
    readFileSync('.runtime/u2/performance-profile.json', 'utf8'),
  ) as Profile;
  requireCondition(
    profile.seed === PILOT_PROFILE.id,
    503,
    'PERFORMANCE_CURRENT_PROFILE',
    '현재 pilot 준비 원본만 측정합니다.',
  );
  assertPilotCounts(profile.counts);
  if (existsSync('.reports/u2/performance-ack.jsonl'))
    throw Error('이전 ACK/측정 보존: 새 실행의 명시 검토가 필요합니다.');
  const service = await startPerformanceServices(profile);
  try {
    const clients: SyntheticHttpClient[] = [];
    mkdirSync('.reports/u2', { recursive: true });
    const ack = createWriteStream('.reports/u2/performance-ack.jsonl', { flags: 'w', mode: 0o600 });
    const samplesLog = createWriteStream('.reports/u2/performance-samples.jsonl', {
      flags: 'w',
      mode: 0o600,
    });
    const reports: unknown[] = [];
    let sequence = 0;
    let outstanding = 0;
    let maxOutstanding = 0;
    const sourceIdentity = runtimeSourceIdentity();
    const sourceDigest = sourceIdentity.digest;
    const runId = randomUUID();
    writeFileSync(
      '.reports/u2/performance-source.json',
      JSON.stringify(
        {
          sourceIdentity,
          runId,
          node: process.version,
          profileId: profile.id,
          initialHistoricalProfile: profile.counts,
          priorAcknowledgementsPreserved: true,
          apiConfiguration: {
            origins: ['http://127.0.0.1:3300', 'http://127.0.0.1:3301'],
            backendPorts: [34800, 34801],
            nextMode: 'development',
            synthetic: true,
            poolBudget: {
              primary: { api: 10, worker: 5, administrative: 2, total: 17, rolling: 32 },
              journal: {
                appendApi: 4,
                vaultApi: 1,
                appendWorker: 2,
                vaultWorker: 1,
                administrative: 2,
                total: 10,
                rolling: 18,
              },
            },
            companyIngress: 'explicit-synthetic-private-ingress',
          },
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    for (let i = 0; i < PILOT_PROFILE.activeSessions; i++) {
      const actor = pilotActor(i),
        staff = actor.audience === 'STAFF';
      const client = new SyntheticHttpClient(
        'http://127.0.0.1:' + (staff ? '3301' : '3300'),
        profile.credentials,
        '/api',
      );
      await client.authenticate(actor.principalId);
      clients.push(client);
      if (i % 10 === 9)
        console.log('현재 MFA 활동 세션 준비:', i + 1, '/', PILOT_PROFILE.activeSessions);
      await new Promise((done) => setTimeout(done, 1600));
    }
    const purposeProbe = await profileInvitationProbe({
      store: service.store,
      manager: clients[0]!,
      recipient: clients[1]!,
      recipientId: 'nfr-customer-10',
      enterpriseRef: profile.enterprises[0]!,
      contactRef: profile.contacts[0]!,
      receive: async (invitationRef) => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const delivered = service.deliveredTokens.get(profile.contacts[0]!.id);
          if (
            delivered &&
            delivered.invitationRef.id === invitationRef.id &&
            Date.now() - delivered.receivedAt <= 30000
          ) {
            service.deliveredTokens.delete(profile.contacts[0]!.id);
            return delivered.response;
          }
          await pause(20);
        }
        throw Error('원래 local private 전달/수신이 실제로 확인되지 않았습니다.');
      },
    });
    for (const [index, item] of purposeProbe.acknowledgements.entries()) {
      if (
        !ack.write(
          JSON.stringify({
            ...item,
            company: pilotActor(index).company,
            actorIndex: index,
            verificationProfileId: PILOT_PROFILE.id,
            correlationId: item.clientRequestId,
          }) + '\n',
        )
      )
        await new Promise<void>((done) => ack.once('drain', done));
    }
    writeFileSync(
      '.reports/u2/profile-purpose-probe.json',
      JSON.stringify(
        {
          ...purposeProbe,
          sourceDigest,
          profileId: profile.id,
          includedInFixedPhaseCounts: false,
          realActivationAllowed: false,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    // Acceptance changed this account's original access fence. Only a real
    // Fresh password+MFA rejoins the registered pilot participants.
    await clients[1]!.authenticate('nfr-customer-10');
    console.log(
      '등록된 pilot의 실제 BFF→HTTP 합성 MFA/현재 세션 준비 완료. 전체10분 profile을 시작합니다.',
    );
    const ui = new ProfileUi();
    const representatives = [0, PILOT_PROFILE.activeSessions - PILOT_PROFILE.staff] as const;
    requireCondition(
      pilotActor(representatives[0]).audience === 'CUSTOMER' &&
        pilotActor(representatives[1]).audience === 'STAFF',
      503,
      'PERFORMANCE_UI_REPRESENTATIVES',
      '현재 등록된 고객/직원 대표 세션이 필요합니다.',
    );
    await ui.start(clients, representatives);
    const metricSources = u2Sources();
    await metricSources.primaryAdmin.initialize();
    await metricSources.journalAdmin.initialize();
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
    const pendingInvitations = new Map<number, Ref>();
    const profileInvitations = new EnterpriseInvitations(
      service.owners.enterprise,
      service.verifier,
      service.vault,
      service.authorities,
      () => new Date(),
    );
    const routeCounts: Record<string, number> = {};
    async function invoke(number: number, samples: Sample[]) {
      const actorIndex =
        (number + Math.floor(number / PILOT_PROFILE.activeSessions)) % PILOT_PROFILE.activeSessions;
      const actor = pilotActor(actorIndex),
        company = actor.company,
        staff = actor.audience === 'STAFF';
      const client = clients[actorIndex]!;
      const write = number % 5 === 4;
      const start = performance.now();
      outstanding++;
      maxOutstanding = Math.max(maxOutstanding, outstanding);
      let status = 0;
      let accuracy = true;
      let bytes = 0;
      let operation = 'UNSTARTED';
      let problemCode: string | null = null;
      let responseState: string | null = null;
      let protectedReceiptState: string | null = null;
      try {
        const scope = await profileCurrentScope(service.store, scopes[company]!);
        let result;
        if (write && !staff && Math.floor(number / 5) % 12 !== 0) {
          const key = randomUUID();
          const mode = Math.floor(number / 5) % 6;
          let path: string;
          let data: Record<string, unknown>;
          let expectedOwner = 'EnterpriseAccess';
          let revision: number | null = null;
          const meta = (r: number | null = null) => ({
            clientRequestId: key,
            expectedRevision: r,
            reason: '합성 U2 현재 관리 의도의 별도 변경',
            evidenceRefs: [],
          });
          if (Math.floor(number / 5) % 20 === 19) {
            operation = 'requestRecovery';
            expectedOwner = 'IdentityRecovery';
            path = '/identity/recovery-requests';
            data = profileRecoveryInput(
              'nfr-customer-' + (number % PILOT_PROFILE.customers) + '@example.invalid',
              '합성 본인 확인 전 접수; 업무 권위 없음',
            );
          } else if (mode === 0) {
            operation = 'grantCustomerRole';
            const member = (await service.store.currentProtected(
              'EnterpriseMembership',
              profile.members[company]!.id,
            ))!;
            const role = (await service.store.currentProtected(
              'CustomerRole',
              profile.roles[company]!.id,
            ))!;
            const existing = await service.store.list('CustomerRoleGrant', {
              equals: {
                membershipRef: { id: member.membershipId },
                roleRef: { id: role.roleId },
                revokedAt: null,
              },
              limit: 2,
            });
            path = '/enterprises/' + scope.enterpriseRef.id + '/role-grant-changes';
            revision = scope.enterpriseRef.revision;
            data = {
              meta: meta(existing[0] ? Number(existing[0].revision) : null),
              accountRef: member.accountRef,
              roleRef: ref('CustomerRole', role),
              decision: existing.length ? 'REVOKE' : 'GRANT',
            };
          } else if (mode === 1) {
            operation = 'reviseCustomerRole';
            const row = (await service.store.currentProtected(
              'CustomerRole',
              profile.roles[company]!.id,
            ))!;
            const roleRef = ref('CustomerRole', row);
            revision = roleRef.revision;
            path = '/customer-roles/' + roleRef.id + '/revisions';
            data = {
              meta: meta(revision),
              roleRef,
              label: '합성 U2 현재 역할 개정 ' + number,
              predicates: ['product.read', 'order.submit', 'order.read'].map((action) => ({
                enterpriseRef: scope.enterpriseRef,
                action,
                kind: 'ENTERPRISE_ALL',
                departmentSelector: { kind: 'ALL' },
                siteSelector: { kind: 'ALL' },
                sourcePolicyRevision: scope.enterpriseRef.revision,
              })),
            };
          } else if (mode === 2) {
            operation = 'updateMembership';
            const row = (await service.store.currentProtected(
              'EnterpriseMembership',
              profile.members[company]!.id,
            ))!;
            const membershipRef = ref('EnterpriseMembership', row);
            revision = membershipRef.revision;
            path = '/memberships/' + membershipRef.id + '/revisions';
            data = {
              meta: meta(revision),
              membershipRef,
              departmentRef: null,
              siteRef: null,
              active: true,
              administrator: false,
            };
          } else {
            const existing = await profileCurrentInvitation(
              profileInvitations,
              pendingInvitations.get(company),
            );
            if (!existing || mode === 3) {
              operation = 'inviteMembership';
              path = '/enterprises/' + scope.enterpriseRef.id + '/membership-invitations';
              revision = scope.enterpriseRef.revision;
              data = {
                meta: meta(),
                enterpriseRef: scope.enterpriseRef,
                contactRef: profile.contacts[company],
                contactVersion: 1,
                departmentRef: null,
                siteRef: null,
                roleRefs: [],
                expectedMembershipRevision: null,
                reactivate: false,
              };
            } else {
              const row = (await service.store.currentProtected(
                'MembershipInvitation',
                existing.id,
              ))!;
              const sourceRef = ref('MembershipInvitation', row);
              revision = sourceRef.revision;
              operation = mode === 4 ? 'resendMembershipInvitation' : 'revokeMembershipInvitation';
              path =
                '/membership-invitations/' +
                sourceRef.id +
                (mode === 4 ? '/resends' : '/revocations');
              data = { meta: meta(revision), sourceRef };
            }
          }
          result = await client.request<
            Receipt & { disposition?: string; receipt?: { requestId: string } }
          >(path, data, {
            'Idempotency-Key': key,
            'X-Correlation-Id': key,
            ...(revision === null ? {} : { 'X-Target-Revision': String(revision) }),
          });
          status = result.response.status;
          problemCode = profileSafeProblemCode((result.body as unknown as { type?: unknown }).type);
          responseState = ['ACCEPTED', 'RESULT_RECORDED', 'REVIEW_REQUIRED', 'UNKNOWN'].includes(
            String(result.body.requestState),
          )
            ? result.body.requestState
            : null;
          bytes = Buffer.byteLength(JSON.stringify(result.body));
          const requestId = result.body.requestId ?? result.body.receipt?.requestId;
          accuracy = false;
          if (status === (operation === 'requestRecovery' ? 200 : 202) && requestId) {
            profileValidateU2Receipt(service.store.schema, result.body);
            const receipt = await service.store.currentProtected('RequestReceipt', requestId);
            protectedReceiptState = [
              'ACCEPTED',
              'RESULT_RECORDED',
              'REVIEW_REQUIRED',
              'UNKNOWN',
            ].includes(String(receipt?.requestState))
              ? String(receipt?.requestState)
              : null;
            const protectedOperation =
              operation === 'inviteMembership' ? 'issueMembershipInvitation' : operation;
            requireCondition(
              receipt?.owner === expectedOwner && receipt.operation === protectedOperation,
              503,
              'PROFILE_U2_ORIGINAL_RECEIPT',
              '등록된 원래 U2 owner/operation protected receipt가 필요합니다.',
            );
            const targetRef = (result.body.targetRef ??
              (receipt.resultRefs as Ref[]).find(
                (value) => value.entity !== 'IdentityHistory',
              )) as Ref;
            requireCondition(
              targetRef,
              503,
              'PROFILE_U2_TARGET',
              '원래 보호 결과 target이 필요합니다.',
            );
            const observed = {
              requestId,
              targetRef,
              owner: expectedOwner,
              operation: protectedOperation,
              transportOperation: operation,
              principalId: receipt.principalId,
              clientRequestId: receipt.idempotencyKey,
              requestFingerprint: receipt.requestFingerprint,
              receiptDigest: fingerprint(receipt),
              protectedRequestState: receipt.requestState,
              acceptanceIsExternalCompletion: false,
              correlationId: key,
              company,
              actorIndex,
              verificationProfileId: PILOT_PROFILE.id,
              observedAt: new Date().toISOString(),
            };
            if (!ack.write(JSON.stringify(observed) + '\n'))
              await new Promise<void>((done) => ack.once('drain', done));
            accuracy = profileReceiptResultMatches(operation, result.body, receipt, data);
            if (operation === 'inviteMembership' || operation === 'resendMembershipInvitation')
              pendingInvitations.set(company, targetRef);
            if (operation === 'revokeMembershipInvitation') pendingInvitations.delete(company);
          }
        } else if (write) {
          const product = profile.products[number % profile.products.length]!;
          const key = randomUUID();
          operation = staff ? 'registerProduct' : 'submitOrder';
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
                    requestedActivationDate:
                      product.productType === 'SOFTWARE' ? '2026-12-01' : null,
                  })),
                  provisionChoice: 'FULL',
                  partialConsentRef: null,
                },
            { 'Idempotency-Key': key, 'X-Correlation-Id': key },
          );
          status = result.response.status;
          problemCode = profileSafeProblemCode((result.body as unknown as { type?: unknown }).type);
          responseState = ['ACCEPTED', 'RESULT_RECORDED', 'REVIEW_REQUIRED', 'UNKNOWN'].includes(
            String(result.body.requestState),
          )
            ? result.body.requestState
            : null;
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
              operation,
              clientRequestId: key,
              correlationId: key,
              company,
              actorIndex,
              verificationProfileId: PILOT_PROFILE.id,
              observedAt: new Date().toISOString(),
            };
            if (!ack.write(JSON.stringify(observed) + '\n'))
              await new Promise<void>((done) => ack.once('drain', done));
          }
        } else {
          const historical =
            company +
            PILOT_PROFILE.enterprises *
              (Math.floor(number / 500) % (PILOT_PROFILE.orders / PILOT_PROFILE.enterprises));
          const select = Math.floor(number / 5) % 4;
          const path =
            select === 0
              ? '/orders/nfr-order-' + String(historical).padStart(6, '0') + '/review-assessment'
              : select === 1
                ? '/identity'
                : select === 2
                  ? staff
                    ? '/staff-role-directory'
                    : '/enterprises/' + scope.enterpriseRef.id + '/memberships'
                  : staff
                    ? '/identity'
                    : '/enterprises/' + scope.enterpriseRef.id + '/customer-roles';
          operation =
            select === 0
              ? 'readOrderAssessment'
              : select === 1
                ? 'readIdentity'
                : select === 2
                  ? staff
                    ? 'readStaffRoles'
                    : 'readMemberships'
                  : staff
                    ? 'readIdentity'
                    : 'readCustomerRoles';
          result = await client.request<Record<string, unknown>>(path);
          status = result.response.status;
          problemCode = profileSafeProblemCode(result.body.type);
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
      } catch (error) {
        status = 0;
        accuracy = true;
        problemCode =
          error instanceof OmsError
            ? profileSafeProblemCode('urn:oms:problem:' + error.code.toLowerCase())
            : 'UNCLASSIFIED_EXCEPTION';
      } finally {
        routeCounts[operation] = (routeCounts[operation] ?? 0) + 1;
        outstanding--;
        const sample: Sample = {
          milliseconds: performance.now() - start,
          kind: write ? 'WRITE' : 'READ',
          status,
          accuracy,
          bytes,
          ...(operation === 'requestRecovery'
            ? { operation: 'requestRecovery' as const, expectedStatus: 200 as const }
            : {}),
        };
        samples.push(sample);
        if (
          !samplesLog.write(
            JSON.stringify({
              number,
              company,
              operation,
              problemCode,
              responseState,
              protectedReceiptState,
              accuracyReason:
                status === 0
                  ? 'EXCEPTION'
                  : !accuracy
                    ? 'RESULT_BINDING'
                    : 'NO_ACCURACY_MISMATCH_OBSERVED',
              observedAt: new Date().toISOString(),
              ...sample,
            }) + '\n',
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
      const routesBefore = { ...routeCounts };
      const workerReasonsBefore = service.workerFailureReasons();
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
          ...(await resourceObservation(metricSources.primaryAdmin, metricSources.journalAdmin)),
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
      if (phase.name !== 'PEAK')
        workRanges.push({ phase: phase.name, from: phaseFrom, to: phaseTo });
      const report = {
        ...evaluateSamples(samples, phase, elapsed),
        workerFailureReasons: Object.fromEntries(
          Object.entries(service.workerFailureReasons()).map(([reason, count]) => [
            reason,
            count - workerReasonsBefore[reason as keyof typeof workerReasonsBefore],
          ]),
        ),
        routeCounts: Object.fromEntries(
          Object.entries(routeCounts).map(([name, count]) => [
            name,
            count - (routesBefore[name] ?? 0),
          ]),
        ),
      };
      reports.push(report);
      writeFileSync(
        '.reports/u2/performance.json',
        JSON.stringify(
          {
            runId,
            sourceDigest,
            verificationProfileId: PILOT_PROFILE.id,
            profile: profile.counts,
            u2RouteCounts: routeCounts,
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
      writeFileSync('.reports/u2/ui-under-load.json', JSON.stringify(uiResult, null, 2), {
        mode: 0o600,
      });
      const normalRange = normalRanges[0];
      if (!normalRange) throw new Error('NORMAL 시작/종료 근거 없음');
      const firstStart = await firstStartEvidence(normalRange.from, normalRange.to, {
        acks: '.reports/u2/performance-ack.jsonl',
        starts: '.reports/u2/worker-first-start.jsonl',
      });
      const u2FirstStart = await collectU2ProfileStarts(service, normalRange.from, normalRange.to);
      writeFileSync(
        '.reports/u2/work-first-start-profile.json',
        JSON.stringify(
          {
            passed: firstStart.passed && u2FirstStart.passed,
            notification: firstStart,
            u2: u2FirstStart,
          },
          null,
          2,
        ),
        {
          mode: 0o600,
        },
      );
      const notificationRecovery = await collectCurrentWorkerRecovery(
        new ProtectedStore(metricSources.primaryAdmin, metricSources.journalAdmin),
        workRanges,
        { runId, profileId: profile.id, sourceIdentity },
      );
      const u2Recovery = await collectU2ProfileRecovery(
        service.store,
        workRanges,
        service.u2Starts,
        service.broker.acknowledgements,
        service.broker.messages,
      );
      const workRecovery = {
        ...notificationRecovery,
        passed: notificationRecovery.passed && u2Recovery.passed,
        u2: u2Recovery,
      };
      writeFileSync(
        '.reports/u2/worker-recovery-profile.json',
        JSON.stringify(workRecovery, null, 2),
        {
          mode: 0o600,
        },
      );
      const resourceResult = {
        passed: profileResourcesWithinBudget(resourceSamples, resourceFailures),
        samples: resourceSamples,
        failures: resourceFailures,
        actualFargateCapacityVerified: false,
      };
      writeFileSync('.reports/u2/profile-resources.json', JSON.stringify(resourceResult, null, 2), {
        mode: 0o600,
      });
      passed =
        passed &&
        uiResult.passed &&
        firstStart.passed &&
        u2FirstStart.passed &&
        purposeProbe.passed &&
        service.workerFailureCount() === 0 &&
        resourceResult.passed &&
        workRecovery.passed;
      writeFileSync(
        '.reports/u2/performance.json',
        JSON.stringify(
          {
            runId,
            sourceDigest,
            verificationProfileId: PILOT_PROFILE.id,
            workerRecoveryVerified: workRecovery.passed,
            workerRecoveryEvidenceDigest: fingerprint(workRecovery),
            uiReadiness: uiResult.passed,
            workFirstStart: firstStart.passed,
            u2WorkFirstStart: u2FirstStart.passed,
            u2WorkerRecovery: u2Recovery.passed,
            u2RouteCounts: routeCounts,
            purposeProbe: purposeProbe.passed,
            workerFailures: service.workerFailureCount(),
            workerFailureReasons: service.workerFailureReasons(),
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
      if (metricSources.primaryAdmin.isInitialized) await metricSources.primaryAdmin.destroy();
      if (metricSources.journalAdmin.isInitialized) await metricSources.journalAdmin.destroy();
      await new Promise<void>((done) => samplesLog.end(done));
    }
  } finally {
    await service.close();
  }
}
export { mandatoryPhases };
export function profileResourcesWithinBudget(samples: readonly unknown[], failures: number) {
  return (
    samples.length > 0 &&
    failures === 0 &&
    samples.every((row) => {
      const r = row as { primary?: { connections?: number }; journal?: { connections?: number } };
      return [r.primary?.connections, r.journal?.connections].every(
        (n) => Number.isSafeInteger(n) && Number(n) > 0 && Number(n) <= 32,
      );
    })
  );
}
export interface PerformanceCommandPorts {
  hasProfile: () => boolean;
  prepare: () => Promise<unknown>;
  measure: () => Promise<void>;
}
export async function runPerformanceCommand(
  args: readonly string[],
  ports: PerformanceCommandPorts = {
    hasProfile: () => existsSync('.runtime/u2/performance-profile.json'),
    prepare: prepareFreshPerformanceProfile,
    measure: measurePerformanceProfile,
  },
) {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.OMS_U2_SYNTHETIC_PROFILE !== 'approved-local-only'
  )
    throw Error('명시 로컬 합성 부하만 허용합니다.');
  requireCondition(
    args.length === 0 || (args.length === 1 && args[0] === '--prepare'),
    400,
    'PERFORMANCE_COMMAND',
    '등록된 준비/측정 명령만 허용합니다.',
  );
  if (args[0] === '--prepare') {
    await ports.prepare();
    return;
  }
  if (!ports.hasProfile()) await ports.prepare();
  await ports.measure();
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runPerformanceCommand(process.argv.slice(2));
}
