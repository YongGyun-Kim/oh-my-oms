import 'reflect-metadata';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
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
import { canonicalJson, fingerprint, requireCondition } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import { recoveryResources } from '../../tests/u1/fixtures/recovery-resources.js';
import {
  ProtectedStore,
  reconcileRecoveredSecurity,
  restoreFromJournal,
  ALL_MODELS,
  primaryAttribute,
  tableName,
  modelDefinition,
} from '@oms/persistence';
import { u2Sources } from '../../tests/u2/fixtures/databases.js';
import { SyntheticIdentityProvider } from '../../tests/u1/fixtures/identity.js';
import {
  captureSyntheticSecuritySnapshot,
  SyntheticCurrentSecurityOracle,
} from '../../tests/u1/fixtures/recovery-security-oracle.js';
import { seedClaimedRecovery, seedU2RecoveryGraph } from '../../tests/u2/fixtures/identity.js';
import {
  PILOT_PROFILE,
  profileCounts,
  pilotActor,
  assertPilotCounts,
  assertPilotRestorationScale,
  validatePilotPerformance,
} from './verification-profile.js';
import { runtimeSourceIdentity, sha256 } from './runtime-source.js';
import type { DataSource } from 'typeorm';
export const U2_PROFILE_ACK_OPERATIONS = Object.freeze({
  EnterpriseAccess: [
    'reviseCustomerRole',
    'updateMembership',
    'issueMembershipInvitation',
    'resendMembershipInvitation',
    'revokeMembershipInvitation',
    'acceptMembershipInvitation',
    'grantCustomerRole',
  ],
  IdentityRecovery: ['requestRecovery'],
});
export function assertProfileAcknowledgement(
  ack: {
    requestId: string;
    targetRef: Ref;
    owner: string;
    clientRequestId: string;
    company: number;
    principalId?: string;
    operation?: string;
    requestFingerprint?: string;
    receiptDigest?: string;
    verificationProfileId?: string;
    actorIndex?: number;
  },
  receipt: Record<string, unknown> | null,
  target: Record<string, unknown> | null,
  key: Record<string, unknown> | undefined,
) {
  const u2 = Object.hasOwn(U2_PROFILE_ACK_OPERATIONS, ack.owner);
  const actor = ack.verificationProfileId === undefined ? null : pilotActor(ack.actorIndex!);
  if (actor)
    requireCondition(
      ack.verificationProfileId === PILOT_PROFILE.id && actor.company === ack.company,
      503,
      'PROFILE_ACK_PROFILE',
      '원래 pilot actor/company 결합이 필요합니다.',
    );
  const principal =
    u2 && ack.operation === 'requestRecovery'
      ? ack.principalId
      : actor
        ? actor.principalId
        : ack.company >= 90
          ? 'nfr-staff-' + (ack.company - 90)
          : 'nfr-customer-' + ack.company * 10;
  requireCondition(
    Number.isInteger(ack.company) &&
      ack.company >= 0 &&
      ack.company < 100 &&
      (u2 || ['OrderAcceptance', 'ProductCatalog'].includes(ack.owner)) &&
      receipt &&
      target &&
      target[primaryAttribute(modelDefinition(ack.targetRef.entity)).name] === ack.targetRef.id &&
      Number(target.revision ?? 1) === ack.targetRef.revision &&
      key &&
      receipt.requestId === ack.requestId &&
      receipt.principalId === principal &&
      receipt.owner === ack.owner &&
      receipt.idempotencyKey === ack.clientRequestId &&
      Array.isArray(receipt.resultRefs) &&
      receipt.resultRefs.some((value) => canonicalJson(value) === canonicalJson(ack.targetRef)) &&
      key.principalId === principal &&
      key.owner === ack.owner &&
      key.requestId === ack.requestId &&
      (!u2 ||
        (U2_PROFILE_ACK_OPERATIONS[ack.owner as keyof typeof U2_PROFILE_ACK_OPERATIONS].includes(
          ack.operation ?? '',
        ) &&
          receipt.operation === ack.operation &&
          receipt.requestFingerprint === ack.requestFingerprint &&
          fingerprint(receipt) === ack.receiptDigest &&
          receipt.audience === (actor?.audience ?? (ack.company >= 90 ? 'STAFF' : 'CUSTOMER')) &&
          (ack.operation !== 'requestRecovery' ||
            /^recovery-request:[a-f0-9-]{36}$/.test(String(principal))))),
    503,
    'PROFILE_ACK_ORIGINAL',
    '원래 closed owner/operation·protected Receipt/Key/target의 독립 ACK 대조가 필요합니다.',
  );
}
export async function verifyProfileAcknowledgements(
  store: ProtectedStore,
  path: string,
  expectedProfileId?: string,
) {
  const stream = createReadStream(path, { highWaterMark: 65536 });
  let bytes = 0;
  stream.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > 64 * 1024 * 1024) stream.destroy(Error('ACK byte 상한 초과'));
  });
  const lines = createInterface({ input: stream, crlfDelay: Infinity }),
    ids = new Set<string>();
  let count = 0;
  try {
    for await (const line of lines) {
      requireCondition(
        Buffer.byteLength(line) <= 4096 && ++count <= 100000,
        503,
        'PROFILE_ACK_LIMIT',
        '원래 유한 ACK 항목 상한을 확인하세요.',
      );
      const ack = JSON.parse(line) as Parameters<typeof assertProfileAcknowledgement>[0];
      if (expectedProfileId !== undefined)
        requireCondition(
          expectedProfileId === PILOT_PROFILE.id && ack.verificationProfileId === expectedProfileId,
          503,
          'PROFILE_ACK_PROFILE',
          '현재 실행과 같은 pilot의 ACK만 전수 대조합니다.',
        );
      store.schema.validate('Id', ack.requestId);
      store.schema.validate('Ref', ack.targetRef);
      store.schema.validate('Id', ack.clientRequestId);
      requireCondition(
        !ids.has(ack.requestId),
        503,
        'PROFILE_ACK_DUPLICATE',
        '복제 ACK는 원래 성공 목록으로 세지 않습니다.',
      );
      ids.add(ack.requestId);
      const receipt = await store.read('RequestReceipt', ack.requestId),
        target = await store.readRevision(
          ack.targetRef.entity,
          ack.targetRef.id,
          ack.targetRef.revision,
        );
      const rows = (await store.primary.query(
        'SELECT data FROM u1_request_key WHERE request_id=$1 LIMIT 1',
        [ack.requestId],
      )) as { data: Record<string, unknown> }[];
      assertProfileAcknowledgement(ack, receipt, target, rows[0]?.data);
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  requireCondition(count > 0, 503, 'PROFILE_ACK_EMPTY', '빈 ACK 목록은 RPO0 근거가 아닙니다.');
  return {
    acknowledgements: count,
    missingOrChanged: 0,
    source: path,
    verifiedAt: new Date().toISOString(),
  };
}
// A keyset stream hashes all material business originals, never a capped sample.
async function preservationManifest(source: DataSource) {
  const models = ALL_MODELS.filter(
    (model) => !['WorkItem', 'RecoveryWorkHold', 'OutboxDelivery'].includes(model.name),
  );
  const results: Record<string, { rows: number; digest: string }> = {};
  for (const model of models) {
    const pk = primaryAttribute(model).name;
    const hash = createHash('sha256');
    let cursor: string | null = null;
    let rows = 0;
    for (;;) {
      const page = (await source.query(
        `SELECT to_jsonb(t) AS data FROM "${tableName(model.name)}" t ${cursor === null ? '' : `WHERE "${pk}">$1`} ORDER BY "${pk}" LIMIT 25`,
        cursor === null ? [] : [cursor],
      )) as { data: Record<string, unknown> }[];
      if (page.length === 0) break;
      for (const row of page) {
        hash.update(canonicalJson(row.data) + '\n');
        cursor = String(row.data[pk]);
        rows++;
      }
    }
    results[model.name] = { rows, digest: hash.digest('hex') };
  }
  for (const name of ['WorkItem', 'OutboxDelivery']) {
    const model = ALL_MODELS.find((model) => model.name === name)!;
    const pk = primaryAttribute(model).name;
    const hash = createHash('sha256');
    let cursor: string | null = null;
    let rows = 0;
    for (;;) {
      const page = (await source.query(
        `SELECT to_jsonb(t) AS data FROM "${tableName(name)}" t ${cursor === null ? '' : `WHERE "${pk}">$1`} ORDER BY "${pk}" LIMIT 25`,
        cursor === null ? [] : [cursor],
      )) as { data: Record<string, unknown> }[];
      if (!page.length) break;
      for (const row of page) {
        cursor = String(row.data[pk]);
        const data = { ...row.data };
        for (const field of ['state', 'revision', 'leaseOwner', 'leaseUntil', 'leaseGeneration'])
          delete data[field];
        hash.update(canonicalJson(data) + '\n');
        rows++;
      }
    }
    results[name + 'OriginalIdentity'] = { rows, digest: hash.digest('hex') };
  }
  // Tombstones are not copied back into material rows. Hash latest protected deleted IDs separately.
  const tombstoneHash = createHash('sha256');
  let afterModel = '';
  let afterId = '';
  let deleted = 0;
  for (;;) {
    // Bound the identity scan BEFORE looking up protected history. A global
    // DISTINCT over full after-images sorts the entire journal-sized table.
    // Advance over every identity, including live/unprotected candidates.
    const page = (await source.query(
      `SELECT c.model,c.id,latest.data,COALESCE(latest.deleted,false) AS deleted FROM (SELECT DISTINCT model,id FROM u1_entity_version WHERE (model,id)>($1,$2) ORDER BY model,id LIMIT 25) c LEFT JOIN LATERAL (SELECT v.data,v.deleted FROM u1_entity_version v JOIN u1_protected_prefix p ON p.epoch=v.epoch AND v.commit_order<=p.commit_order JOIN u1_epoch_sequence e ON e.epoch=v.epoch WHERE v.model=c.model AND v.id=c.id ORDER BY e.generation DESC,v.commit_order DESC LIMIT 1) latest ON true ORDER BY c.model,c.id`,
      [afterModel, afterId],
    )) as { model: string; id: string; data: unknown; deleted: boolean }[];
    if (!page.length) break;
    for (const row of page) {
      if (row.deleted) {
        const { model, id, data } = row;
        tombstoneHash.update(canonicalJson({ model, id, data }) + '\n');
        deleted++;
      }
      afterModel = row.model;
      afterId = row.id;
    }
  }
  return { models: results, tombstones: { rows: deleted, digest: tombstoneHash.digest('hex') } };
}

async function runRestore(interrupt: boolean, faultAt: string) {
  if (!Number.isFinite(Date.parse(faultAt)) || Date.parse(faultAt) > Date.now())
    throw new Error('원래 복구 장애 t0가 필요합니다.');
  const child = spawn(
    'node',
    [
      '--import',
      'tsx',
      'scripts/u2/recovery.ts',
      '--restore-child',
      ...(interrupt ? ['--interrupt-at-50'] : []),
    ],
    {
      env: { ...process.env, OMS_U2_FAULT_AT: faultAt },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let killed = false;
  let output = '';
  let diagnosticBytes = 0;
  let streamError: unknown = null;
  let peakRss = 0;
  const remaining = Math.max(1, Date.parse(faultAt) + 30 * 60000 - Date.now());
  const deadline = setTimeout(() => child.kill('SIGKILL'), remaining);
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
    if (output.length > 65536) {
      streamError = new Error('복구 관측 stream 한도');
      child.kill('SIGKILL');
      return;
    }
    for (;;) {
      const index = output.indexOf('\n');
      if (index < 0) break;
      const line = output.slice(0, index);
      output = output.slice(index + 1);
      let event: { phase: string; rss: number };
      try {
        event = JSON.parse(line);
        if (typeof event.phase !== 'string' || !Number.isFinite(event.rss) || event.rss < 1)
          throw new Error('관측 형식');
      } catch (error) {
        streamError = error;
        child.kill('SIGKILL');
        return;
      }
      peakRss = Math.max(peakRss, event.rss);
      if (event.phase === 'PARTIAL_REPLAY_READY' && interrupt) {
        killed = true;
        child.kill('SIGKILL');
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    diagnosticBytes += Buffer.byteLength(chunk);
    if (diagnosticBytes > 65536) {
      streamError = new Error('복구 진단 한도');
      child.kill('SIGKILL');
    }
  });
  let exit: { code: number | null; signal: string | null };
  try {
    exit = await new Promise<{ code: number | null; signal: string | null }>((done, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => done({ code, signal }));
    });
  } finally {
    clearTimeout(deadline);
  }
  if (streamError) throw new Error('실제 복구 child 관측 오류');
  if (interrupt ? !killed || exit.signal !== 'SIGKILL' : exit.code !== 0)
    throw new Error('실제 큰 복구 프로세스 종료/재시작 검증 실패: ' + JSON.stringify(exit));
  return { exit, peakRss, interrupted: killed };
}

async function restoreChild() {
  const sources = u2Sources();
  await sources.primaryAdmin.initialize();
  await sources.journalAdmin.initialize();
  let replayed = 0;
  try {
    const report = await restoreFromJournal(
      sources.primaryAdmin,
      sources.journalAdmin,
      async (observation) => {
        if (
          observation.phase === 'REPLAYED' &&
          ++replayed === 50 &&
          process.argv.includes('--interrupt-at-50')
        ) {
          console.log(
            JSON.stringify({
              phase: 'PARTIAL_REPLAY_READY',
              replayed,
              rss: process.memoryUsage().rss,
            }),
          );
          await new Promise<void>(() => {});
        }
        if (observation.phase === 'REPLAYED' && replayed % 1000 === 0)
          console.log(
            JSON.stringify({ phase: 'REPLAY_PROGRESS', replayed, rss: process.memoryUsage().rss }),
          );
      },
    );
    writeFileSync('.reports/u2/restore-result.json', JSON.stringify(report), { mode: 0o600 });
    console.log(JSON.stringify({ phase: 'RESTORED', rss: process.memoryUsage().rss }));
  } finally {
    await sources.primaryAdmin.destroy();
    await sources.journalAdmin.destroy();
  }
}
export async function recoverProfile() {
  if (
    process.version !== 'v22.23.3' ||
    process.env.NODE_ENV === 'production' ||
    process.env.OMS_U2_SYNTHETIC_PROFILE !== 'approved-local-only' ||
    process.env.OMS_U2_DATABASE_PROFILE !== 'verification-isolated'
  )
    throw Error('기존 U2 전체 합성 원본의 명시 복원만 허용합니다.');
  validatePilotPerformance(JSON.parse(readFileSync('.reports/u2/performance.json', 'utf8')));
  const measured = JSON.parse(readFileSync('.reports/u2/performance-source.json', 'utf8'));
  if (canonicalJson(measured.sourceIdentity) !== canonicalJson(runtimeSourceIdentity()))
    throw Error('실제 현재 source의 부하·복원만 허용합니다.');
  mkdirSync('.reports/u2', { recursive: true, mode: 0o700 });
  const sources = u2Sources();
  for (const source of Object.values(sources)) await source.initialize();
  const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  const profile = JSON.parse(readFileSync('.runtime/u2/performance-profile.json', 'utf8')) as {
    verifier: string;
    credentials: { password: string; factor: string };
    seed: string;
    counts: unknown;
  };
  requireCondition(
    profile.seed === PILOT_PROFILE.id,
    503,
    'RECOVERY_PREPARED_PROFILE',
    '같은 pilot 준비 원본으로만 복원합니다.',
  );
  assertPilotCounts(profile.counts);
  await seedClaimedRecovery(store, sources.vault);
  await seedU2RecoveryGraph(store, 'EXHAUSTED');
  let faultAt = '';
  let passed = false;
  const observations: Record<string, unknown> = {};

  try {
    const counts = (
      await sources.primaryAdmin.query(
        'SELECT (SELECT count(*)::text FROM u1_order) AS orders,(SELECT count(*)::text FROM u1_order_line) AS lines,(SELECT count(*)::text FROM u1_product) AS products',
      )
    )[0];
    assertPilotRestorationScale(counts);
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
      const ackFiles = ['.reports/u2/performance-ack.jsonl'];
      const independent = [];
      for (const path of ackFiles) {
        independent.push({
          path,
          sha256: sha256(readFileSync(path)),
          ...(await verifyProfileAcknowledgements(store, path, PILOT_PROFILE.id)),
        });
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
      await sources.primaryAdmin.destroy();
      await sources.journalAdmin.destroy();
      observations.interruption = await runRestore(true, faultAt);
      await sources.primaryAdmin.initialize();
      await sources.journalAdmin.initialize();
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
      observations.faultAcknowledgementScope = {
        externalMutationRequestsIssuedDuringFault: 0,
        fenceChecks: 3,
        successfulMutationAcknowledgementsDuringFault: 0,
        source:
          '완료된 같은source 부하/probe의 모든 보호 mutation ACK stream; fault 동안 새 외부 mutation 발급 없음',
      };
      await sources.primaryAdmin.destroy();
      await sources.journalAdmin.destroy();
      observations.restart = await runRestore(false, faultAt);
      await sources.primaryAdmin.initialize();
      await sources.journalAdmin.initialize();
      const restored = JSON.parse(readFileSync('.reports/u2/restore-result.json', 'utf8')) as {
        epoch: string;
        entries: number;
        rows: number;
        workHolds: number;
      };
      observations.restore = restored;
      if ((await store.read('Product', String(target.productId)))?.label !== originalLabel)
        throw new Error('원래 상품 원본을 복구하지 못했습니다.');
      const recovered = [];
      for (const item of independent) {
        if (sha256(readFileSync(item.path)) !== item.sha256)
          throw new Error('독립 ACK stream 원문이 fault 중 변경됐습니다.');
        recovered.push({
          path: item.path,
          ...(await verifyProfileAcknowledgements(store, item.path, PILOT_PROFILE.id)),
        });
      }
      observations.recoveredAcknowledgements = recovered;
      const restoredSecurity = await captureSyntheticSecuritySnapshot(sources.primaryApp);
      const changedSecurityIds = new Set([
        ...Object.keys(oracle.snapshot.rows),
        ...Object.keys(restoredSecurity.rows),
      ]);
      const changedSecurityRows = [...changedSecurityIds].filter(
        (id) =>
          canonicalJson(oracle.snapshot.rows[id] ?? null) !==
          canonicalJson(restoredSecurity.rows[id] ?? null),
      ).length;
      observations.changedSecurityRows = changedSecurityRows;
      const originalUnknowns = Object.entries(oracle.snapshot.rows).filter(
        ([, row]) => row.state === 'UNKNOWN' || row.knowledge === 'UNKNOWN',
      );
      observations.originalUnknowns = originalUnknowns.length;
      observations.originalUnknownPreserved =
        originalUnknowns.length > 0 &&
        originalUnknowns.every(
          ([id, row]) => canonicalJson(row) === canonicalJson(restoredSecurity.rows[id] ?? null),
        );
      if (changedSecurityRows !== 0 || observations.originalUnknownPreserved !== true)
        throw Error('U2/current 보호 세대·소비·회수·실패·UNKNOWN 보안 원본 불일치');
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
      const ackStream = createReadStream('.reports/u2/performance-ack.jsonl', {
        highWaterMark: 65536,
      });
      const ackLines = createInterface({ input: ackStream, crlfDelay: Infinity });
      try {
        for await (const line of ackLines) {
          const item = JSON.parse(line);
          if (
            item.owner === 'OrderAcceptance' &&
            item.company === 0 &&
            item.actorIndex === 0 &&
            item.verificationProfileId === PILOT_PROFILE.id
          ) {
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
      '.reports/u2/large-recovery.json',
      JSON.stringify(
        {
          passed,
          verificationProfileId: PILOT_PROFILE.id,
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
    writeFileSync(
      '.reports/u2/recovery.json',
      JSON.stringify(
        {
          passed,
          sourceDigest: runtimeSourceIdentity().digest,
          verificationProfileId: PILOT_PROFILE.id,
          profile: profileCounts(),
          beforeCounts: observations.beforeCounts,
          detailPath: '.reports/u2/large-recovery.json',
          detailSha256: sha256(readFileSync('.reports/u2/large-recovery.json')),
          ackMissingOrChanged: passed ? 0 : null,
          authorityResurrections: observations.changedSecurityRows === 0 ? 0 : null,
          originalUnknownPreserved: observations.originalUnknownPreserved === true,
          freshMfaReadVerified: observations.allowedBusinessResumed === true,
          rtoMilliseconds: observations.elapsedMilliseconds ?? null,
          realActivationAllowed: false,
          observedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.OMS_U2_SYNTHETIC_PROFILE !== 'approved-local-only' ||
    process.env.OMS_U2_DATABASE_PROFILE !== 'verification-isolated'
  )
    throw Error('명시 local U2 복원만 허용합니다.');
  if (process.argv.includes('--restore-child')) await restoreChild();
  else await recoverProfile();
}
