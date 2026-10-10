import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mandatoryPhases,
  preparePerformanceProfile,
  profileResourcesWithinBudget,
  ProfileWorkerFailures,
  profileSafeProblemCode,
  runPerformanceCommand,
  prepareFreshPerformanceProfile,
  archiveMeasurementOutputs,
} from '../../../scripts/u2/performance.js';
import { u2Sources } from '../fixtures/databases.js';
import { assertContainerTarget } from '../../../scripts/u2/runtime-security-report.js';
import { PROJECT_COMMANDS, coverageOutputPaths } from '../../../scripts/u2/ci-full-proof.js';
import { runtimeSourceIdentity, sha256 } from '../../../scripts/u2/runtime-source.js';
import {
  assertProfileAcknowledgement,
  U2_PROFILE_ACK_OPERATIONS,
} from '../../../scripts/u2/recovery.js';
import { fingerprint } from '@oms/contracts';
import {
  PILOT_PROFILE,
  EXPANSION_PROFILE,
  pilotActor,
  profileCounts,
  registeredProfileCounts,
  validatePilotPerformance,
  assertPilotRestorationScale,
} from '../../../scripts/u2/verification-profile.js';
import { mandatoryPhases as legacyPhases } from '../../../scripts/u1/performance-statistics.js';
import { seedHistoricalOrders } from '../../u1/fixtures/performance-orders.js';
import type { ProtectedStore } from '@oms/persistence';
import type { Ref } from '@oms/contracts';
function preparationFixture(id: string) {
  return Buffer.from(
    JSON.stringify({
      verifier: 'a'.repeat(64),
      purposeKey: 'b'.repeat(64),
      rateKey: 'c'.repeat(64),
      vaultKey: 'd'.repeat(64),
      customerCookieKey: 'e'.repeat(64),
      staffCookieKey: 'f'.repeat(64),
      id,
      seed: PILOT_PROFILE.id,
      credentials: {},
      enterprises: [],
      roles: [],
      members: [],
      contacts: [],
      products: [],
      preparedAt: new Date().toISOString(),
      counts: profileCounts(),
    }),
  );
}
it('새 준비 admission은 old bytes archive 후 교체하고 재직렬화/누락/변조 archive를 거절한다', async () => {
  const prior = {
    synthetic: process.env.OMS_U2_SYNTHETIC_PROFILE,
    db: process.env.OMS_U2_DATABASE_PROFILE,
  };
  process.env.OMS_U2_SYNTHETIC_PROFILE = 'approved-local-only';
  process.env.OMS_U2_DATABASE_PROFILE = 'verification-isolated';
  const old = preparationFixture('11111111-1111-1111-1111-111111111111'),
    current = preparationFixture('22222222-2222-2222-2222-222222222222');
  try {
    for (const fault of [
      'none',
      'archive-mismatch',
      'concurrent-change',
      'same-id',
      'missing',
      'seed-error',
      'invalid-profile',
      'wrong-scale',
      'unknown-profile-key',
    ]) {
      let live: Buffer | null = fault === 'invalid-profile' ? Buffer.from('{') : Buffer.from(old);
      if (fault === 'wrong-scale') {
        const changed = JSON.parse(old.toString());
        changed.counts.orders = 1;
        live = Buffer.from(JSON.stringify(changed));
      }
      if (fault === 'unknown-profile-key')
        live = Buffer.from(JSON.stringify({ ...JSON.parse(old.toString()), foreignProfile: true }));
      let archive: Buffer | null = null;
      const order: string[] = [];
      const ports = {
        read: () => live,
        archive: async (bytes: Buffer) => {
          order.push('archive');
          archive = Buffer.from(bytes);
          if (fault === 'archive-mismatch') throw Error('ARCHIVE_BYTE_MISMATCH');
          if (fault === 'concurrent-change') live = Buffer.from(current);
        },
        remove: () => {
          order.push('remove');
          live = null;
        },
        prepare: async () => {
          order.push('prepare');
          if (fault === 'seed-error') throw Error('SEED_FAILED');
          live =
            fault === 'missing'
              ? null
              : fault === 'same-id'
                ? Buffer.from(JSON.stringify(JSON.parse(old.toString()), null, 2))
                : Buffer.from(current);
        },
      };
      if (fault === 'none') {
        const outcome = await prepareFreshPerformanceProfile(ports);
        expect(order).toEqual(['archive', 'remove', 'prepare']);
        expect((archive as Buffer | null)?.equals(old)).toBe(true);
        expect(live?.equals(current)).toBe(true);
        expect(outcome).toMatchObject({ preparationCompleted: true, actualScaleVerified: false });
      } else {
        await expect(prepareFreshPerformanceProfile(ports), fault).rejects.toThrow();
        if (
          [
            'archive-mismatch',
            'concurrent-change',
            'invalid-profile',
            'wrong-scale',
            'unknown-profile-key',
          ].includes(fault)
        )
          expect(order.includes('remove') || order.includes('prepare')).toBe(false);
        if (fault === 'archive-mismatch') expect(live?.equals(old)).toBe(true);
      }
    }
    let cold: Buffer | null = null;
    const archive = vi.fn(async () => {}),
      remove = vi.fn();
    const prepared = await prepareFreshPerformanceProfile({
      read: () => cold,
      archive,
      remove,
      prepare: async () => {
        cold = Buffer.from(current);
      },
    });
    expect(prepared).toMatchObject({
      previousSha256: null,
      currentSha256: sha256(current),
      preparationCompleted: true,
      actualScaleVerified: false,
    });
    expect(archive).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    for (const db of ['e2e-isolated', 'unregistered']) {
      process.env.OMS_U2_DATABASE_PROFILE = db;
      const read = vi.fn(() => old),
        archive = vi.fn(async () => {}),
        remove = vi.fn(),
        prepare = vi.fn(async () => {});
      await expect(
        prepareFreshPerformanceProfile({ read, archive, remove, prepare }),
      ).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
      expect(archive).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
    }
  } finally {
    if (prior.synthetic === undefined) delete process.env.OMS_U2_SYNTHETIC_PROFILE;
    else process.env.OMS_U2_SYNTHETIC_PROFILE = prior.synthetic;
    if (prior.db === undefined) delete process.env.OMS_U2_DATABASE_PROFILE;
    else process.env.OMS_U2_DATABASE_PROFILE = prior.db;
  }
});
it('명시 --prepare는 old profile 존재 여부와 무관하게 새 준비를 호출하고 측정을 시작하지 않는다', async () => {
  const prior = process.env.OMS_U2_SYNTHETIC_PROFILE;
  process.env.OMS_U2_SYNTHETIC_PROFILE = 'approved-local-only';
  try {
    const prepare = vi.fn(async () => {}),
      measure = vi.fn(async () => {});
    await runPerformanceCommand(['--prepare'], { hasProfile: () => true, prepare, measure });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(measure).not.toHaveBeenCalled();
    for (const invalid of [['--prepare', '--unknown'], ['--unknown']])
      await expect(
        runPerformanceCommand(invalid, { hasProfile: () => true, prepare, measure }),
      ).rejects.toMatchObject({ code: 'PERFORMANCE_COMMAND' });
    expect(prepare).toHaveBeenCalledTimes(1);
  } finally {
    if (prior === undefined) delete process.env.OMS_U2_SYNTHETIC_PROFILE;
    else process.env.OMS_U2_SYNTHETIC_PROFILE = prior;
  }
});
it('worker 실패 관측은 source별 정확 수를 보존하고 알 수 없는 source/음수/분수는 거절한다', () => {
  const port = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const failures = new ProfileWorkerFailures();
    failures.record('sweep-source-blocked', 2);
    failures.record('vault-terminal-blocked', 1);
    failures.record('vault-expired-blocked', 3);
    failures.record('ack-unconfirmed');
    failures.record('worker-cycle-exception');
    failures.record('ack-unconfirmed', 0);
    expect(failures.snapshot()).toEqual({
      'sweep-source-blocked': 2,
      'vault-terminal-blocked': 1,
      'vault-expired-blocked': 3,
      'ack-unconfirmed': 1,
      'worker-cycle-exception': 1,
    });
    const detached = failures.snapshot();
    detached['ack-unconfirmed'] = 99;
    expect(failures.snapshot()['ack-unconfirmed']).toBe(1);
    for (const count of [-1, 0.5, NaN, Infinity])
      expect(() => failures.record('ack-unconfirmed', count)).toThrow();
    expect(() => failures.record('unknown' as 'ack-unconfirmed')).toThrow();
    expect(port).toHaveBeenCalledTimes(5);
    for (const [message] of port.mock.calls)
      expect(Object.keys(JSON.parse(String(message))).sort()).toEqual([
        'count',
        'event',
        'observedAt',
        'reason',
      ]);
  } finally {
    port.mockRestore();
  }
});
it('problem 관측은 닫힌 비식별 코드만 남기며 원문 객체/자유 문자열을 반환하지 않는다', () => {
  expect(profileSafeProblemCode('urn:oms:problem:organisation_revision')).toBe(
    'ORGANISATION_REVISION',
  );
  expect(profileSafeProblemCode('urn:oms:problem:not_found')).toBe('NOT_FOUND');
  expect(profileSafeProblemCode(undefined)).toBeNull();
  for (const value of [
    { type: 'private arbitrary body' },
    'private arbitrary message',
    'urn:oms:problem:unknown',
  ])
    expect(profileSafeProblemCode(value)).toBe('UNCLASSIFIED');
});
it('pilot10분 정의를 사용하되 기존 U1/후속 확장50분 profile은 유지한다', () => {
  expect(mandatoryPhases).toEqual([
    { name: 'NORMAL', rate: 5, seconds: 300 },
    { name: 'PEAK', rate: 20, seconds: 60 },
    { name: 'RECOVERY', rate: 5, seconds: 120 },
    { name: 'HOLD', rate: 5, seconds: 120 },
  ]);
  expect(legacyPhases.reduce((sum, phase) => sum + phase.seconds, 0)).toBe(3000);
  expect(EXPANSION_PROFILE.orders).toBe(100000);
  expect(PILOT_PROFILE.planningTargets).toEqual({ customerEnterprises: 10, dailyOrders: 1000 });
  expect(PILOT_PROFILE.requestsAreValidationAssumptions).toBe(true);
});
it('pilot 고객/직원 actor는 현재 기업과 원래 account를 정확히 연결하고 unknown/범위 밖을 거절한다', () => {
  for (let index = 0; index < 20; index++) {
    const actor = pilotActor(index);
    expect(actor).toEqual({
      company: index % 10,
      audience: index < 10 ? 'CUSTOMER' : 'STAFF',
      principalId: index < 10 ? 'nfr-customer-' + index * 10 : 'nfr-staff-' + (index - 10),
    });
  }
  for (const index of [-1, 20, 0.5, NaN]) expect(() => pilotActor(index)).toThrow();
  expect(() => registeredProfileCounts('foreign-profile')).toThrow();
  expect(registeredProfileCounts(EXPANSION_PROFILE.id).orders).toBe(100000);
});
it('pilot report는 동일 규모/기간·80/20·원래 오류/응답/정확성 기준과 실제 복원 규모를 요구한다', () => {
  const report = {
    verificationProfileId: PILOT_PROFILE.id,
    finished: true,
    passed: true,
    workerRecoveryVerified: true,
    profile: profileCounts(),
    phases: mandatoryPhases.map((p) => ({
      phase: p.name,
      targetRate: p.rate,
      durationSeconds: p.seconds,
      elapsedMilliseconds: p.seconds * 1000,
      requests: p.rate * p.seconds,
      readRequests: p.rate * p.seconds * 0.8,
      writeRequests: p.rate * p.seconds * 0.2,
      readP95: 1000,
      writeP95: 2000,
      errorRate: 0.001,
      accuracyFailures: 0,
      passed: true,
    })),
  };
  expect(() => validatePilotPerformance(report)).not.toThrow();
  for (const fault of [
    'mixed-profile',
    'wrong-scale',
    'duration',
    'mix',
    'accuracy',
    'response',
    'error',
    'incomplete',
  ]) {
    const changed = structuredClone(report);
    if (fault === 'mixed-profile') changed.verificationProfileId = EXPANSION_PROFILE.id;
    if (fault === 'wrong-scale') changed.profile.orders = 100000;
    if (fault === 'duration') changed.phases[0]!.durationSeconds = 299;
    if (fault === 'mix') changed.phases[0]!.readRequests--;
    if (fault === 'accuracy') changed.phases[0]!.accuracyFailures = 1;
    if (fault === 'response') changed.phases[0]!.readP95 = 1001;
    if (fault === 'error') changed.phases[0]!.errorRate = 0.0011;
    if (fault === 'incomplete') changed.finished = false;
    expect(() => validatePilotPerformance(changed), fault).toThrow();
  }
  expect(() =>
    assertPilotRestorationScale({ orders: 10000, lines: 50000, products: 1000 }),
  ).not.toThrow();
  for (const counts of [
    { orders: 9999, lines: 50000, products: 1000 },
    { orders: 10000, lines: 49999, products: 1000 },
    { orders: 10000, lines: 50000, products: 999 },
  ])
    expect(() => assertPilotRestorationScale(counts)).toThrow();
});
it('private 확장 profile은 exact archive 뒤 새 pilot로 교체하며 혼용/재직렬화로 승격하지 않는다', async () => {
  const prior = {
    synthetic: process.env.OMS_U2_SYNTHETIC_PROFILE,
    db: process.env.OMS_U2_DATABASE_PROFILE,
  };
  process.env.OMS_U2_SYNTHETIC_PROFILE = 'approved-local-only';
  process.env.OMS_U2_DATABASE_PROFILE = 'verification-isolated';
  try {
    const legacy = JSON.parse(
      preparationFixture('11111111-1111-1111-1111-111111111111').toString(),
    );
    legacy.seed = EXPANSION_PROFILE.id;
    legacy.counts = profileCounts(EXPANSION_PROFILE);
    for (const mode of ['valid', 'mixed', 'old-output']) {
      let live: Buffer | null = Buffer.from(
        JSON.stringify(mode === 'mixed' ? { ...legacy, counts: profileCounts() } : legacy),
      );
      const archive = vi.fn(async () => {}),
        remove = vi.fn(() => {
          live = null;
        });
      const prepare = vi.fn(async () => {
        live =
          mode === 'old-output'
            ? Buffer.from(JSON.stringify({ ...legacy, id: '22222222-2222-2222-2222-222222222222' }))
            : preparationFixture('22222222-2222-2222-2222-222222222222');
      });
      const run = () =>
        prepareFreshPerformanceProfile({ read: () => live, archive, remove, prepare });
      if (mode === 'valid')
        await expect(run()).resolves.toMatchObject({ preparationCompleted: true });
      else await expect(run()).rejects.toThrow();
      if (mode === 'mixed') {
        expect(archive).not.toHaveBeenCalled();
        expect(prepare).not.toHaveBeenCalled();
      }
    }
  } finally {
    if (prior.synthetic === undefined) delete process.env.OMS_U2_SYNTHETIC_PROFILE;
    else process.env.OMS_U2_SYNTHETIC_PROFILE = prior.synthetic;
    if (prior.db === undefined) delete process.env.OMS_U2_DATABASE_PROFILE;
    else process.env.OMS_U2_DATABASE_PROFILE = prior.db;
  }
});
it('이전 측정 원문 전부 archive 검증 후 ACK sentinel만 제거하고 변조 archive는 교체 전에 차단한다', async () => {
  const prior = {
    synthetic: process.env.OMS_U2_SYNTHETIC_PROFILE,
    db: process.env.OMS_U2_DATABASE_PROFILE,
  };
  process.env.OMS_U2_SYNTHETIC_PROFILE = 'approved-local-only';
  process.env.OMS_U2_DATABASE_PROFILE = 'verification-isolated';
  try {
    for (const mismatch of [false, true]) {
      const ack = '.reports/u2/performance-ack.jsonl',
        report = '.reports/u2/performance.json',
        files = new Map([
          [ack, Buffer.from('original-independent-ACK')],
          [report, Buffer.from('original-failed-report')],
        ]),
        archives = new Map<string, Buffer>(),
        removed: string[] = [];
      const run = () =>
        archiveMeasurementOutputs({
          read: (p) => files.get(p) ?? null,
          archive: async (p) => {
            archives.set(p, Buffer.from(files.get(p)!));
            if (mismatch) throw Error('ARCHIVE_MISMATCH');
          },
          remove: (p) => {
            removed.push(p);
            files.delete(p);
          },
        });
      if (mismatch) {
        await expect(run()).rejects.toThrow();
        expect(removed).toEqual([]);
        expect(files.has(ack)).toBe(true);
      } else {
        await run();
        expect(removed).toEqual([ack]);
        expect(archives.get(ack)!.toString()).toBe('original-independent-ACK');
        expect(files.get(report)!.toString()).toBe('original-failed-report');
      }
    }
  } finally {
    if (prior.synthetic === undefined) delete process.env.OMS_U2_SYNTHETIC_PROFILE;
    else process.env.OMS_U2_SYNTHETIC_PROFILE = prior.synthetic;
    if (prior.db === undefined) delete process.env.OMS_U2_DATABASE_PROFILE;
    else process.env.OMS_U2_DATABASE_PROFILE = prior.db;
  }
});
it('합성 주문 fixture의 가변 규모는 평균5/최대50·원래기업/품목/확인대기 원본을 보존한다', async () => {
  const captured = new Map<string, Record<string, unknown>[]>();
  const store = {
    currentEpoch: async () => 'initial',
    execute: async (_meta: unknown, callback: (tx: unknown) => Promise<void>) =>
      callback({
        putNewBatch: async (model: string, rows: Record<string, unknown>[]) =>
          captured.set(model, [...(captured.get(model) ?? []), ...rows]),
      }),
  } as unknown as ProtectedStore;
  const refs: Ref[] = ['one', 'two'].map((id) => ({
    owner: 'EnterpriseAccess',
    entity: 'Enterprise',
    id,
    revision: 1,
  }));
  const products = refs.map((source, index) => ({
    productRef: { ...source, owner: 'ProductCatalog', entity: 'Product', id: 'product-' + index },
    offerRef: {
      ...source,
      owner: 'ProductCatalog',
      entity: 'CommonOfferRevision',
      id: 'offer-' + index,
    },
    productType: index === 0 ? ('HARDWARE' as const) : ('SOFTWARE' as const),
  }));
  await seedHistoricalOrders(store, refs, products, 100);
  const orders = captured.get('Order')!,
    lines = captured.get('OrderLine')!;
  expect(orders).toHaveLength(100);
  expect(lines).toHaveLength(500);
  expect(Math.max(...orders.map((row) => (row.lineRefs as unknown[]).length))).toBe(50);
  expect(new Set(orders.map((row) => (row.enterpriseRef as Ref).id))).toEqual(
    new Set(['one', 'two']),
  );
  expect(
    captured.get('AcceptanceDecision')!.every((row) => row.acceptance === 'REVIEW_REQUIRED'),
  ).toBe(true);
  for (const invalid of [0, 99, 100001])
    await expect(seedHistoricalOrders(store, refs, products, invalid)).rejects.toThrow();
});
it('현재 local 비밀/생성물 격리 규칙도 source identity에 포함하고 U2 세 경로를 정확히 제외한다', () => {
  const bytes = readFileSync('.gitignore'),
    source = runtimeSourceIdentity();
  expect(source.files['.gitignore']).toBe(sha256(bytes));
  for (const path of ['.runtime/u2/', '.reports/u2/', '.reports/project/'])
    expect(bytes.toString().split('\n')).toContain(path);
  expect(
    Object.keys(source.files).some(
      (path) => path.startsWith('.runtime/') || path.startsWith('.reports/'),
    ),
  ).toBe(false);
});
it('same-image 공격 fixture는 기존 U1/실제 DB/다른 host를 거절한다', () => {
  const p = 'postgresql://synthetic:synthetic@primary:5432/oms_u2_e2e',
    j = 'postgresql://synthetic:synthetic@journal:5432/oms_u2_journal_e2e';
  expect(() => assertContainerTarget(p, j, j)).not.toThrow();
  for (const bad of [
    p.replace('oms_u2_e2e', 'oms_u1_e2e'),
    p.replace('primary', 'real.example.invalid'),
    p.replace('5432', '5444'),
    p.replace('postgresql', 'http'),
  ])
    expect(() => assertContainerTarget(bad, j, j)).toThrow();
  expect(() => assertContainerTarget(p, j, p)).toThrow();
});
it('project 수집은 U1 정확 명시 output과 U2-only coverage, 실제 전체 명령을 분리한다', () => {
  for (const layer of ['unit', 'integration']) {
    const c = PROJECT_COMMANDS.find((x) => x.key === 'u1-' + layer)!;
    expect(c.command).toContain('--outputFile=.reports/project/current-u1-' + layer + '.json');
    expect(c.command).toContain('--reporter=json');
  }
  expect(PROJECT_COMMANDS.find((x) => x.key === 'u1-coverage')?.command).toContain(
    'tests/project/vitest.u1.coverage.config.ts',
  );
  expect(PROJECT_COMMANDS.find((x) => x.key === 'u2-coverage')?.command).toEqual([
    'npm',
    'run',
    'test:u2:coverage',
  ]);
  expect(new Set(PROJECT_COMMANDS.map((x) => x.key)).size).toBe(PROJECT_COMMANDS.length);
});
it('새 수집 전 raw coverage와 기존 reporter 원문을 두 unit 각각 보존한다', () => {
  for (const unit of ['u1', 'u2'] as const) {
    const paths = coverageOutputPaths(unit);
    expect(paths).toHaveLength(5);
    expect(paths.some((path) => path.endsWith('/coverage-final.json'))).toBe(true);
    expect(paths.some((path) => path.endsWith('/evidence.json'))).toBe(true);
    expect(paths).toContain(
      unit === 'u1'
        ? '.reports/project/current-u1-coverage-tests.json'
        : '.reports/u2/coverage.json',
    );
    expect(paths.every((path) => !path.startsWith('.reports/u1/'))).toBe(true);
  }
});
it('명시 synthetic admission 없이 준비/reset하지 않는다', async () => {
  const before = process.env.OMS_U2_SYNTHETIC_PROFILE;
  delete process.env.OMS_U2_SYNTHETIC_PROFILE;
  try {
    await expect(preparePerformanceProfile()).rejects.toThrow();
  } finally {
    if (before === undefined) delete process.env.OMS_U2_SYNTHETIC_PROFILE;
    else process.env.OMS_U2_SYNTHETIC_PROFILE = before;
  }
});
it('API/worker/append/vault/공유 admin은 원래 역할별 pool 상한으로 계산된다', () => {
  const previous = process.env.OMS_U2_DATABASE_PROFILE;
  process.env.OMS_U2_DATABASE_PROFILE = 'verification-isolated';
  try {
    const api = u2Sources(),
      worker = u2Sources('worker');
    const cap = (s: typeof api.primaryApp) => (s.options.extra as { max: number }).max;
    expect([
      cap(api.primaryApp),
      cap(worker.primaryApp),
      cap(api.journalAppend),
      cap(api.vault),
      cap(worker.journalAppend),
      cap(worker.vault),
      cap(api.primaryAdmin),
      cap(api.journalAdmin),
    ]).toEqual([10, 5, 4, 1, 2, 1, 2, 2]);
  } finally {
    if (previous === undefined) delete process.env.OMS_U2_DATABASE_PROFILE;
    else process.env.OMS_U2_DATABASE_PROFILE = previous;
  }
});
it('성능 owning callsite는 U1 DB/보고서를 초기화하지 않고 독립 ACK와 pool 총계를 검사한다', () => {
  const source = readFileSync('scripts/u2/performance.ts', 'utf8');
  expect(source).not.toContain('.reports/u1/');
  expect(source).not.toContain('.runtime/u1/');
  expect(source).toContain("u2Sources('worker')");
  expect(source).toContain('performance-ack.jsonl');
  expect(source).toContain('metricSources.primaryAdmin.initialize()');
});
it('실제 관측 누락/오류/33 연결은 역할 계획만으로 통과시키지 않는다', () => {
  const at = (primary: number, journal: number) => ({
    primary: { connections: primary },
    journal: { connections: journal },
  });
  expect(profileResourcesWithinBudget([at(17, 10), at(32, 18)], 0)).toBe(true);
  for (const [rows, failures] of [
    [[], 0],
    [[at(33, 18)], 0],
    [[at(32, 33)], 0],
    [[at(17, 10)], 1],
    [[{}], 0],
    [[at(-1, 10)], 0],
  ] as const)
    expect(profileResourcesWithinBudget(rows, failures)).toBe(false);
});
it('U2 독립 ACK는 closed owner/operation·원래 보호 receipt/key/target 전체와 일치해야 한다', () => {
  expect(U2_PROFILE_ACK_OPERATIONS.EnterpriseAccess).toContain('issueMembershipInvitation');
  expect(U2_PROFILE_ACK_OPERATIONS.EnterpriseAccess).not.toContain('inviteMembership');
  const targetRef = {
    owner: 'EnterpriseAccess',
    entity: 'CustomerRole',
    id: 'synthetic-role',
    revision: 2,
  };
  const receipt = {
    requestId: 'synthetic-request',
    principalId: 'nfr-customer-0',
    audience: 'CUSTOMER',
    owner: 'EnterpriseAccess',
    operation: 'reviseCustomerRole',
    idempotencyKey: 'synthetic-key',
    requestFingerprint: 'original-input-digest',
    resultRefs: [targetRef],
  };
  const ack = {
    requestId: receipt.requestId,
    targetRef,
    owner: receipt.owner,
    operation: receipt.operation,
    principalId: receipt.principalId,
    clientRequestId: receipt.idempotencyKey,
    company: 0,
    requestFingerprint: receipt.requestFingerprint,
    receiptDigest: fingerprint(receipt),
  };
  const key = {
    principalId: receipt.principalId,
    owner: receipt.owner,
    requestId: receipt.requestId,
  };
  expect(() =>
    assertProfileAcknowledgement(ack, receipt, { roleId: targetRef.id, revision: 2 }, key),
  ).not.toThrow();
  for (const field of [
    'owner',
    'operation',
    'principal',
    'fingerprint',
    'receipt',
    'key',
    'target',
    'missing',
    'audience',
  ]) {
    const a = structuredClone(ack),
      r = structuredClone(receipt),
      k = structuredClone(key);
    if (field === 'owner') a.owner = 'UnregisteredOwner';
    if (field === 'operation') a.operation = 'unregistered-effect';
    if (field === 'principal') r.principalId = 'nfr-customer-10';
    if (field === 'fingerprint') a.requestFingerprint = 'other-input';
    if (field === 'receipt') a.receiptDigest = 'other-result';
    if (field === 'key') k.requestId = 'other-request';
    if (field === 'target') a.targetRef.id = 'other-target';
    if (field === 'audience') r.audience = 'STAFF';
    expect(() =>
      assertProfileAcknowledgement(
        a,
        field === 'missing' ? null : r,
        { roleId: targetRef.id, revision: 2 },
        k,
      ),
    ).toThrow();
  }
});
it('U2 ACK 확장은 기존 U1 두 owner의 principal/key/resultRef 대조를 약화하지 않는다', () => {
  const targetRef = {
    owner: 'OrderAcceptance',
    entity: 'Order',
    id: 'synthetic-order',
    revision: 1,
  };
  const ack = {
    requestId: 'synthetic-request',
    targetRef,
    owner: 'OrderAcceptance',
    clientRequestId: 'synthetic-key',
    company: 0,
  };
  const receipt = {
    requestId: ack.requestId,
    principalId: 'nfr-customer-0',
    owner: ack.owner,
    idempotencyKey: ack.clientRequestId,
    resultRefs: [targetRef],
  };
  const key = {
    principalId: receipt.principalId,
    owner: receipt.owner,
    requestId: receipt.requestId,
  };
  expect(() =>
    assertProfileAcknowledgement(ack, receipt, { orderId: targetRef.id, revision: 1 }, key),
  ).not.toThrow();
  const currentAck = { ...ack, verificationProfileId: PILOT_PROFILE.id, actorIndex: 0 };
  expect(() =>
    assertProfileAcknowledgement(currentAck, receipt, { orderId: targetRef.id, revision: 1 }, key),
  ).not.toThrow();
  for (const changed of [
    { ...currentAck, company: 1 },
    { ...currentAck, actorIndex: 10 },
    { ...currentAck, verificationProfileId: EXPANSION_PROFILE.id },
  ])
    expect(() =>
      assertProfileAcknowledgement(changed, receipt, { orderId: targetRef.id, revision: 1 }, key),
    ).toThrow();
  const staffTarget = {
    owner: 'ProductCatalog',
    entity: 'Product',
    id: 'synthetic-product',
    revision: 1,
  };
  const staffAck = {
    ...currentAck,
    actorIndex: 10,
    owner: 'ProductCatalog',
    targetRef: staffTarget,
  };
  const staffReceipt = {
      ...receipt,
      owner: staffAck.owner,
      principalId: 'nfr-staff-0',
      resultRefs: [staffTarget],
    },
    staffKey = { ...key, principalId: 'nfr-staff-0', owner: staffAck.owner };
  expect(() =>
    assertProfileAcknowledgement(
      staffAck,
      staffReceipt,
      { productId: staffTarget.id, revision: 1 },
      staffKey,
    ),
  ).not.toThrow();
  expect(() => assertProfileAcknowledgement(ack, receipt, null, key)).toThrow();
  expect(() =>
    assertProfileAcknowledgement(
      ack,
      receipt,
      { orderId: targetRef.id, revision: 1 },
      { ...key, principalId: 'other' },
    ),
  ).toThrow();
  expect(() =>
    assertProfileAcknowledgement(
      { ...ack, company: -1 },
      receipt,
      { orderId: targetRef.id, revision: 1 },
      key,
    ),
  ).toThrow();
});
