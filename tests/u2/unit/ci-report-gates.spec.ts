import { it, expect, vi } from 'vitest';
import { REQUIRED_PROOFS, validateReleaseProof } from '../../../scripts/u2/release-validation.js';
import type { ValidationProof } from '../../../scripts/u2/release-validation.js';
import {
  PILOT_PROFILE,
  profileCounts,
  mandatoryPilotPhases,
} from '../../../scripts/u2/verification-profile.js';
import { sha256 } from '../../../scripts/u2/runtime-source.js';
import type { SourceIdentity } from '../../../scripts/u2/runtime-source.js';
import {
  collectCommandProof,
  collectProjectProof,
  PROJECT_COMMANDS,
  preserveOutput,
  securityOutputPaths,
  runProofCommand,
} from '../../../scripts/u2/ci-full-proof.js';
import type { ProofPorts } from '../../../scripts/u2/ci-full-proof.js';
import { securityU2 } from '../../../scripts/u2/security.js';
import {
  resourceObservation,
  collectCurrentWorkerRecovery,
  profileValidateU2Receipt,
} from '../../../scripts/u2/performance.js';
import { Readable, Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import type { ProtectedStore } from '@oms/persistence';
import { SchemaValidator, fingerprint } from '@oms/contracts';
import { verifyProfileAcknowledgements } from '../../../scripts/u2/recovery.js';
import CoverageEvidenceReporter from '../../../scripts/u2/coverage-evidence.js';
import type { Vitest, TestModule } from 'vitest/node';
import { resolve, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import type { DataSource } from 'typeorm';
import { spawnSync } from 'node:child_process';
import { syntheticPassword, syntheticFactor } from '../../u1/fixtures/identity.js';
import {
  prepareRuntimeNamespace,
  runtimeContainerObservation,
  parseRuntimeProfile,
} from '../../../scripts/u2/runtime-security-report.js';
it('부하의 실제 U2 receipt 검증은 등록 초대·개정 결과 Ref를 허용하고 원래 common Receipt를 확장하지 않는다', () => {
  const schema = new SchemaValidator();
  for (const entity of ['MembershipInvitation', 'RoleRevisionState', 'ScopeV2']) {
    const receipt = {
      requestId: 'fixture-request',
      owner: 'EnterpriseAccess',
      requestState: entity === 'MembershipInvitation' ? 'ACCEPTED' : 'RESULT_RECORDED',
      targetRef: {
        owner: 'EnterpriseAccess',
        entity: 'CustomerRole',
        id: 'fixture-role',
        revision: 1,
      },
      resultRefs: [{ owner: 'EnterpriseAccess', entity, id: 'fixture-result', revision: 1 }],
      acceptedAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
      statusRevision: 1,
      retryAfterMilliseconds: null,
    };
    expect(() => schema.validate('Receipt', receipt)).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(profileValidateU2Receipt(schema, receipt) === receipt).toBe(true);
    for (const invalid of [
      { ...receipt, unexpected: true },
      { ...receipt, resultRefs: [{ ...receipt.resultRefs[0], entity: 'UnregisteredPurpose' }] },
      { ...receipt, resultRefs: [{ ...receipt.resultRefs[0], owner: 'UnregisteredOwner' }] },
      { ...receipt, resultRefs: [{ ...receipt.resultRefs[0], revision: 0 }] },
      { ...receipt, targetRef: { ...receipt.targetRef, extra: true } },
    ])
      expect(() => profileValidateU2Receipt(schema, invalid)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' }),
      );
  }
});
it('same-image private profile은 누락·unknown·mixed 키/인증 형식을 기본값 없이 거절한다', () => {
  const profile = {
    verifier: 'a'.repeat(64),
    vault: 'b'.repeat(64),
    customerCookie: 'c'.repeat(64),
    staffCookie: 'd'.repeat(64),
    authentication: { password: 'e'.repeat(48), factor: 'f'.repeat(24) },
  };
  expect(parseRuntimeProfile(profile) === profile).toBe(true);
  for (const invalid of [
    null,
    [],
    {},
    { ...profile, unknown: true },
    { ...profile, verifier: 'unknown' },
    { ...profile, authentication: undefined },
    { ...profile, authentication: { ...profile.authentication, realProvider: true } },
    { ...profile, authentication: { ...profile.authentication, password: 42 } },
    { ...profile, authentication: { ...profile.authentication, factor: 'wrong-format' } },
  ])
    expect(() => parseRuntimeProfile(invalid)).toThrow('명시 closed private 합성 runtime profile');
});
it('별도 Node 프로세스의 임의 합성 credential은 원래 client와 다르고 명시 private profile만 같은 인증을 검증한다', () => {
  const observed = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import {SyntheticIdentityProvider} from './tests/u1/fixtures/identity.ts';
    let input=''; for await(const chunk of process.stdin) input+=chunk;
    const credentials=JSON.parse(input), login='fixture@example.invalid';
    let defaultRejected=false;
    try { await new SyntheticIdentityProvider().password('CUSTOMER',login,credentials.password); }
    catch(error) { defaultRejected=error.status===401 && error.code==='AUTHENTICATION_DENIED'; }
    const shared=new SyntheticIdentityProvider(false,credentials);
    const proof=await shared.password('CUSTOMER',login,credentials.password);
    const factor=await shared.factor(proof,credentials.factor);
    let wrongPasswordRejected=false, wrongFactorRejected=false;
    try { await shared.password('CUSTOMER',login,'wrong-private-fixture-password'); }
    catch(error) { wrongPasswordRejected=error.status===401; }
    try { await shared.factor(proof,'wrong-private-fixture-factor'); }
    catch(error) { wrongFactorRejected=error.status===401; }
    console.log(JSON.stringify({defaultRejected,sharedVerified:factor.verified && factor.subject===login && factor.audience==='CUSTOMER',wrongPasswordRejected,wrongFactorRejected}));
  `,
    ],
    {
      input: JSON.stringify({ password: syntheticPassword, factor: syntheticFactor }),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  expect(observed.status).toBe(0);
  expect(JSON.parse(observed.stdout)).toEqual({
    defaultRejected: true,
    sharedVerified: true,
    wrongPasswordRejected: true,
    wrongFactorRejected: true,
  });
});
for (const failure of ['none', 'schema', 'journal-connect', 'reset'])
  it(
    'same-image namespace 준비 ' +
      failure +
      '는 e2e만 초기화하고 host admin을 role 시작 전에 닫는다',
    async () => {
      const events: string[] = [];
      const admin = (name: string) => ({
        isInitialized: false,
        async initialize() {
          events.push('open:' + name);
          if (failure === 'journal-connect' && name === 'journal')
            throw Error('fixture connection');
          this.isInitialized = true;
        },
        async destroy() {
          events.push('close:' + name);
          this.isInitialized = false;
        },
      });
      const primary = admin('primary'),
        journal = admin('journal');
      vi.stubEnv('OMS_U2_DATABASE_PROFILE', 'verification-isolated');
      try {
        const run = prepareRuntimeNamespace({
          async initialize() {
            events.push('schema');
            expect(process.env.OMS_U2_DATABASE_PROFILE).toBe('e2e-isolated');
            if (failure === 'schema') throw Error('fixture schema');
          },
          sources: () => ({
            primaryAdmin: primary as unknown as DataSource,
            journalAdmin: journal as unknown as DataSource,
          }),
          async reset(p, j) {
            events.push('reset');
            expect(p).toBe(primary);
            expect(j).toBe(journal);
            expect(process.env.OMS_U2_DATABASE_PROFILE).toBe('e2e-isolated');
            if (failure === 'reset') throw Error('fixture reset');
          },
        });
        if (failure === 'none') await run;
        else await expect(run).rejects.toThrow();
        expect(process.env.OMS_U2_DATABASE_PROFILE).toBe('verification-isolated');
        expect(primary.isInitialized || journal.isInitialized).toBe(false);
        expect(events).toEqual(
          failure === 'schema'
            ? ['schema']
            : failure === 'journal-connect'
              ? ['schema', 'open:primary', 'open:journal', 'close:primary']
              : [
                  'schema',
                  'open:primary',
                  'open:journal',
                  'reset',
                  'close:primary',
                  'close:journal',
                ],
        );
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
it('same-image namespace 준비는 원래 profile 부재도 그대로 복원한다', async () => {
  const old = process.env.OMS_U2_DATABASE_PROFILE;
  delete process.env.OMS_U2_DATABASE_PROFILE;
  try {
    await expect(
      prepareRuntimeNamespace({
        initialize: async () => {
          throw Error('fixture');
        },
        sources: () => {
          throw Error('미실행');
        },
        reset: async () => {
          throw Error('미실행');
        },
      }),
    ).rejects.toThrow();
    expect(process.env.OMS_U2_DATABASE_PROFILE).toBeUndefined();
  } finally {
    if (old !== undefined) process.env.OMS_U2_DATABASE_PROFILE = old;
  }
});
it('same-image 종료 관측은 원문 stdout/stderr를 출력하지 않고 exact hash/exit/OOM/TLS 근거만 보존한다', () => {
  const stdout = Buffer.from('private fixture output\r\n'),
    stderr = Buffer.from("private fixture bytes\ncode: 'REVISION_SEQUENCE'\n"),
    state = vi.fn(() => JSON.stringify({ running: false, exitCode: 1, oomKilled: false })),
    logs = vi.fn(() => ({ stdout, stderr, status: 0 })),
    id = 'a'.repeat(64);
  const observed = runtimeContainerObservation(id, 'api', false, { state, logs });
  expect(observed).toMatchObject({
    containerId: id,
    role: 'api',
    running: false,
    exitCode: 1,
    oomKilled: false,
    tlsReady: false,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    stdoutBytes: stdout.length,
    stderrBytes: stderr.length,
    revisionSequenceRejected: true,
    rawLogPersisted: false,
  });
  expect(JSON.stringify(observed)).not.toContain('private fixture');
  expect(state).toHaveBeenCalledWith(id);
  expect(logs).toHaveBeenCalledWith(id);
  expect(() => runtimeContainerObservation('other-id', 'api', false, { state, logs })).toThrow();
  expect(() => runtimeContainerObservation(id, 'unowned', false, { state, logs })).toThrow();
  expect(state).toHaveBeenCalledTimes(1);
  expect(() =>
    runtimeContainerObservation(id, 'api', false, { state: () => '{}', logs }),
  ).toThrow();
  expect(() =>
    runtimeContainerObservation(id, 'api', false, {
      state,
      logs: () => ({ stdout, stderr, status: 1 }),
    }),
  ).toThrow();
});
const io = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  modified: new Map<string, number>(),
  source: undefined as SourceIdentity | undefined,
  run: vi.fn(),
}));
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  const name = (p: string) => (p.startsWith('/') ? relative(process.cwd(), p) : p);
  const report = (p: unknown) => typeof p === 'string' && name(p).startsWith('.reports/');
  return {
    ...original,
    createReadStream: (p: string) => {
      if (!report(p)) return original.createReadStream(p);
      const bytes = io.files.get(name(p));
      if (!bytes) throw Object.assign(Error('fixture stream 없음'), { code: 'ENOENT' });
      return Readable.from([bytes]);
    },
    existsSync: (p: string) => (report(p) ? io.files.has(name(p)) : original.existsSync(p)),
    readFileSync: (p: string, encoding?: string) => {
      if (typeof p !== 'string') return original.readFileSync(p, encoding as BufferEncoding);
      if (!report(p) && !io.files.has(name(p)))
        return original.readFileSync(p, encoding as BufferEncoding);
      const bytes = io.files.get(name(p));
      if (!bytes) throw Object.assign(Error('fixture report 없음'), { code: 'ENOENT' });
      return encoding ? bytes.toString(encoding as BufferEncoding) : bytes;
    },
    writeFileSync: (p: string, bytes: string | Buffer) => {
      if (!report(p)) throw Error('격리 controller fixture 밖 write 금지');
      io.files.set(name(p), Buffer.from(bytes));
      io.modified.set(name(p), Date.now());
    },
    mkdirSync: (p: string) => {
      if (!report(p)) throw Error('격리 controller fixture 밖 directory 금지');
    },
    statSync: (p: string) =>
      report(p)
        ? { mtimeMs: io.modified.get(name(p)) ?? 0, size: io.files.get(name(p))?.length ?? 0 }
        : original.statSync(p),
  };
});
vi.mock('../../../scripts/u1/process.js', () => ({ runCommand: io.run }));
vi.mock('../../../scripts/u2/runtime-source.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../scripts/u2/runtime-source.js')>()),
  runtimeSourceIdentity: () => io.source!,
}));
const source: SourceIdentity = {
  version: 1,
  head: 'a'.repeat(40),
  digest: 'b'.repeat(64),
  lock: 'c'.repeat(64),
  files: {
    'tests/u1/unit/one.spec.ts': 'd'.repeat(64),
    'tests/u1/integration/one.spec.ts': 'd'.repeat(64),
    'tests/u2/unit/one.spec.ts': 'd'.repeat(64),
    'tests/u2/integration/one.spec.ts': 'd'.repeat(64),
  },
  tools: { node: 'v22.23.3', vitest: '5.0.3', v8: '5.0.3', typescript: '6.0.3' },
};
function controllerFixture() {
  io.files.clear();
  io.modified.clear();
  io.run.mockReset();
  io.source = source;
  io.files.set('.reports/u1/unit.json', Buffer.from('preserved-original-unit'));
  io.files.set('.reports/u1/integration.json', Buffer.from('preserved-original-integration'));
  io.run.mockImplementation(async (command: string, args: string[]) => {
    const spec = PROJECT_COMMANDS.find(
      (row) =>
        row.command[0] === command && JSON.stringify(row.command.slice(1)) === JSON.stringify(args),
    );
    if (!spec) throw Error('등록되지 않은 fixture 명령');
    io.files.set(spec.path, Buffer.from(JSON.stringify({ unitDouble: true, key: spec.key })));
    io.modified.set(spec.path, Date.now());
  });
  return {
    decode: (path: string) => JSON.parse(io.files.get(path)!.toString()),
    file: '.reports/u2/validation-u1.json',
    keys: ['u1-unit', 'u1-integration', 'u1-coverage'],
  };
}
it('security 실행은 scanner 하위 raw/log/policy/image-id의 이전·완료 bytes를 각각 고유 hash archive로 보존한다', async () => {
  controllerFixture();
  const spec = PROJECT_COMMANDS.find((row) => row.key === 'security')!,
    paths = [spec.path, '.reports/u2/project-security.log', ...securityOutputPaths()],
    originals = new Map(paths.map((path) => [path, Buffer.from('original\r\n' + path + '\0')])),
    results = new Map(paths.map((path) => [path, Buffer.from('current\r\n' + path + '\0')]));
  for (const [path, bytes] of originals) io.files.set(path, bytes);
  const legacy = new Map(
      ['.reports/u1/unit.json', '.reports/u1/integration.json'].map((path) => [
        path,
        sha256(io.files.get(path)!),
      ]),
    ),
    receiptPath = '.reports/u2/validation-source.json',
    previousReceipt = Buffer.from('previous receipt bytes');
  io.files.set(receiptPath, previousReceipt);
  io.run.mockImplementation(async (command: string, args: string[]) => {
    expect([command, ...args]).toEqual(spec.command);
    for (const [path, bytes] of originals) {
      expect(
        io.files.get('.reports/u2/history/' + sha256(bytes) + '-' + path.split('/').at(-1)),
      ).toEqual(bytes);
      expect(io.files.get(path)).toEqual(bytes);
    }
    for (const [path, bytes] of results) {
      io.files.set(path, bytes);
      io.modified.set(path, Date.now());
    }
  });
  const result = await collectCommandProof(spec, source, io.run);
  expect(result.passed).toBe(true);
  expect(result.sha256).toBe(sha256(results.get(spec.path)!));
  for (const [path, bytes] of results)
    expect(
      io.files.get('.reports/u2/history/' + sha256(bytes) + '-' + path.split('/').at(-1)),
    ).toEqual(bytes);
  for (const [path, hash] of legacy) expect(sha256(io.files.get(path)!)).toBe(hash);
  expect(io.files.get(receiptPath)).toEqual(previousReceipt);
  expect(io.source).toEqual(source);
});
for (const fault of ['partial', 'missing', 'stale'])
  it(
    'security 실패 ' +
      fault +
      '의 존재하는 상세bytes만 보존하고 누락/옛 출력은 현재 성공으로 만들지 않는다',
    async () => {
      controllerFixture();
      const spec = PROJECT_COMMANDS.find((row) => row.key === 'security')!,
        rawPath = '.reports/u2/sast.json',
        raw = Buffer.from('partial scanner details\r\n'),
        logPath = '.reports/u2/container-security.log',
        log = Buffer.from('failed scanner export\r\n');
      if (fault === 'stale') {
        io.files.set(rawPath, raw);
        io.files.set(spec.path, Buffer.from('old stage summary'));
        io.modified.set(spec.path, 0);
      }
      io.run.mockImplementation(async () => {
        if (fault === 'partial') {
          io.files.set(rawPath, raw);
          io.files.set(logPath, log);
          io.files.set(spec.path, Buffer.from('failed stage summary'));
          io.modified.set(spec.path, Date.now());
        }
        throw Error('검사 준비/실행 실패 fixture');
      });
      const result = await collectCommandProof(spec, source, io.run);
      expect(result.passed).toBe(false);
      expect(io.files.has('.reports/u2/container-security.json')).toBe(false);
      if (fault === 'missing') {
        expect(result.sha256).toBe(sha256(''));
        expect(io.files.has(rawPath)).toBe(false);
        expect([...io.files.keys()].some((path) => path.startsWith('.reports/u2/history/'))).toBe(
          false,
        );
      } else {
        expect(io.files.get('.reports/u2/history/' + sha256(raw) + '-sast.json')).toEqual(raw);
        if (fault === 'stale') expect(result.sha256).toBe(sha256(''));
        else
          expect(
            io.files.get('.reports/u2/history/' + sha256(log) + '-container-security.log'),
          ).toEqual(log);
      }
      expect(io.run).toHaveBeenCalledTimes(1);
      expect(io.files.get('.reports/u1/unit.json')!.toString()).toBe('preserved-original-unit');
    },
  );
for (const phase of ['before', 'after'])
  it(
    'security ' + phase + '에 이미 있는 hash-named archive가 다른bytes면 실행 또는 성공을 차단한다',
    async () => {
      controllerFixture();
      const spec = PROJECT_COMMANDS.find((row) => row.key === 'security')!,
        rawPath = '.reports/u2/sast.json',
        raw = Buffer.from('actual scanner bytes'),
        archive = '.reports/u2/history/' + sha256(raw) + '-sast.json';
      if (phase === 'before') io.files.set(rawPath, raw);
      io.files.set(archive, Buffer.from('corrupted isolated archive'));
      const previous = Buffer.from('original failed receipt');
      io.files.set('.reports/u2/validation-source.json', previous);
      io.run.mockImplementation(async () => {
        io.files.set(rawPath, raw);
        io.files.set(spec.path, Buffer.from('stage result'));
        io.modified.set(spec.path, Date.now());
      });
      await expect(collectCommandProof(spec, source, io.run)).rejects.toMatchObject({
        code: 'PROOF_HISTORY_BYTES',
      });
      expect(io.run).toHaveBeenCalledTimes(phase === 'before' ? 0 : 1);
      expect(io.files.get(rawPath)).toEqual(raw);
      expect(io.files.get('.reports/u2/validation-source.json')).toEqual(previous);
      expect(io.files.get('.reports/u1/integration.json')!.toString()).toBe(
        'preserved-original-integration',
      );
    },
  );
it('일치하는 기존 archive는 재작성하지 않고 누락 상세를 생성하지 않으며 exactbytes로 검증한다', () => {
  controllerFixture();
  const path = '.reports/u2/sast.log',
    bytes = Buffer.from('scanner log\r\n\0');
  io.files.set(path, bytes);
  preserveOutput(path);
  const archive = '.reports/u2/history/' + sha256(bytes) + '-sast.log';
  io.modified.set(archive, 123);
  preserveOutput(path);
  preserveOutput('.reports/u2/container-security.json');
  expect(io.modified.get(archive)).toBe(123);
  expect(io.files.get(archive)).toEqual(bytes);
  expect(io.files.get(path)).toEqual(bytes);
  expect(io.files.has('.reports/u2/container-security.json')).toBe(false);
});
for (const fault of [
  'none',
  'partial',
  'skip',
  'failed-test',
  'runner-error',
  'no-test',
  'interrupted',
  'source-change',
  'raw-mismatch',
  'missing-run',
])
  it(
    'coverage reporter ' +
      fault +
      '는 종료 뒤 실제 원문/runner/suite를 대조하고 부분 자료를 overall 근거로 만들지 않는다',
    () => {
      controllerFixture();
      const golden = JSON.parse(readFileSync('tests/u2/fixtures/coverage-export.json', 'utf8'));
      const app = 'apps/example.ts',
        absolute = resolve(app),
        folder = '.reports/u2/unit-reporter';
      io.source = { ...source, files: { ...source.files, [app]: sha256(golden.source) } };
      io.files.set(app, Buffer.from(golden.source));
      const raw = { [absolute]: { ...golden.file, path: absolute } };
      io.files.set(folder + '/coverage-final.json', Buffer.from(JSON.stringify(raw)));
      let close!: () => void;
      const reporter = new CoverageEvidenceReporter({ unit: 'u2' });
      reporter.onInit({
        config: { coverage: { reportsDirectory: resolve(folder) } },
        onClose: (callback: () => void) => {
          close = callback;
        },
      } as unknown as Vitest);
      reporter.onTestRunStart();
      reporter.onCoverage({ toJSON: () => (fault === 'raw-mismatch' ? {} : raw) });
      const modules = ['tests/u2/unit/one.spec.ts', 'tests/u2/integration/one.spec.ts']
        .slice(0, fault === 'partial' ? 1 : 2)
        .map((moduleId) => ({
          moduleId: resolve(moduleId),
          children: {
            allTests: () =>
              fault === 'no-test'
                ? []
                : [
                    {
                      result: () => ({
                        state:
                          fault === 'skip'
                            ? 'skipped'
                            : fault === 'failed-test'
                              ? 'failed'
                              : 'passed',
                      }),
                    },
                  ],
          },
        })) as unknown as TestModule[];
      if (fault !== 'missing-run')
        reporter.onTestRunEnd(
          modules,
          fault === 'runner-error' ? [Error('fixture runner failure')] : [],
          fault === 'interrupted' ? 'interrupted' : 'passed',
        );
      if (fault === 'source-change') io.source = { ...io.source, lock: 'changed-lock' };
      const exit = process.exitCode;
      try {
        if (['none', 'partial'].includes(fault)) {
          close();
          const evidence = JSON.parse(io.files.get(folder + '/evidence.json')!.toString());
          expect(evidence.passed).toBe(true);
          expect(evidence.completeScope).toBe(fault === 'none');
          expect(evidence.rawHash).toBe(sha256(io.files.get(folder + '/coverage-final.json')!));
          expect(evidence.files[app].executable.length).toBe(golden.expected.total);
        } else expect(() => close()).toThrow();
      } finally {
        process.exitCode = exit;
      }
    },
  );
for (const fault of [
  'none',
  'missing-file',
  'duplicate',
  'missing-receipt',
  'missing-key',
  'wrong-historical-target',
  'copied-digest',
  'unregistered-owner',
  'empty',
])
  it(
    '독립 ACK stream ' + fault + '는 실제 schema·원래 receipt/key·정확 과거 Ref를 전수 대조한다',
    async () => {
      controllerFixture();
      const targetRef = {
        owner: 'EnterpriseAccess',
        entity: 'CustomerRole',
        id: 'original-role',
        revision: 2,
      };
      const receipt = {
        requestId: 'original-request',
        owner: 'EnterpriseAccess',
        operation: 'reviseCustomerRole',
        principalId: 'nfr-customer-0',
        audience: 'CUSTOMER',
        idempotencyKey: 'original-key',
        requestFingerprint: 'original-input',
        resultRefs: [targetRef],
      };
      const ack = {
        requestId: receipt.requestId,
        owner: receipt.owner,
        operation: receipt.operation,
        company: 0,
        clientRequestId: receipt.idempotencyKey,
        principalId: receipt.principalId,
        requestFingerprint: receipt.requestFingerprint,
        targetRef,
        receiptDigest: fingerprint(receipt),
      };
      if (fault === 'copied-digest') ack.receiptDigest = 'copied';
      if (fault === 'unregistered-owner') ack.owner = 'UnregisteredOwner';
      const path = '.reports/u2/unit-independent-ack.jsonl';
      if (fault !== 'missing-file')
        io.files.set(
          path,
          Buffer.from(
            fault === 'empty'
              ? ''
              : JSON.stringify(ack) +
                  '\n' +
                  (fault === 'duplicate' ? JSON.stringify(ack) + '\n' : ''),
          ),
        );
      const store = {
        schema: new SchemaValidator(),
        read: vi.fn(async () => (fault === 'missing-receipt' ? null : receipt)),
        readRevision: vi.fn(async () => ({
          roleId: fault === 'wrong-historical-target' ? 'other-role' : targetRef.id,
          revision: 2,
        })),
        primary: {
          query: vi.fn(async () =>
            fault === 'missing-key'
              ? []
              : [
                  {
                    data: {
                      owner: receipt.owner,
                      principalId: receipt.principalId,
                      requestId: receipt.requestId,
                    },
                  },
                ],
          ),
        },
      } as unknown as ProtectedStore;
      const result = verifyProfileAcknowledgements(store, path);
      if (fault === 'none') {
        expect(await result).toMatchObject({
          acknowledgements: 1,
          missingOrChanged: 0,
          source: path,
        });
        expect(store.readRevision).toHaveBeenCalledWith('CustomerRole', 'original-role', 2);
        expect(store.primary.query).toHaveBeenCalledWith(expect.stringContaining('request_id=$1'), [
          'original-request',
        ]);
      } else await expect(result).rejects.toThrow();
    },
  );
for (const fault of [
  'none',
  'missing-work',
  'ambiguous-work',
  'wrong-request',
  'wrong-correlation',
  'wrong-owner',
  'missing-start',
  'missing-ack',
  'nonterminal',
])
  it(
    'worker 회복 collector의 ' + fault + '는 원래 ID/첫보호처리/업무종료/queue ACK 전체를 요구한다',
    async () => {
      controllerFixture();
      const origin = Date.parse('2026-10-10T00:00:00Z'),
        phases = [
          {
            phase: 'NORMAL',
            from: new Date(origin).toISOString(),
            to: new Date(origin + 60000).toISOString(),
          },
          {
            phase: 'RECOVERY',
            from: new Date(origin + 60000).toISOString(),
            to: new Date(origin + 360000).toISOString(),
          },
          {
            phase: 'HOLD',
            from: new Date(origin + 360000).toISOString(),
            to: new Date(origin + 960000).toISOString(),
          },
        ];
      const originals = new Map<string, Record<string, unknown>>(),
        acks: unknown[] = [],
        starts: unknown[] = [],
        ends: unknown[] = [];
      for (let minute = 0; minute < 16; minute++) {
        const requestId = 'original-request-' + minute,
          correlationId = 'original-correlation-' + minute,
          due = origin + minute * 60000 + 1000,
          correlationHash = createHash('sha256').update(correlationId).digest('hex');
        acks.push({
          owner: 'OrderAcceptance',
          requestId,
          correlationId,
          observedAt: new Date(due).toISOString(),
        });
        originals.set(requestId, {
          workId: 'original-work-' + minute,
          requestId,
          correlationId,
          owner: 'NotificationDelivery',
          state: 'RESULT_RECORDED',
          notBefore: new Date(due).toISOString(),
          deadlineAt: new Date(due + 300000).toISOString(),
        });
        starts.push({
          operation: 'NotificationDelivery.firstProcessing',
          outcome: 'SUCCESS',
          correlationHash,
          observedAt: new Date(due + 100).toISOString(),
          delayMilliseconds: 100,
        });
        ends.push({
          operation: 'NotificationDelivery.consume',
          outcome: 'SUCCESS',
          correlationHash,
        });
      }
      if (fault === 'missing-start') starts.shift();
      if (fault === 'missing-ack') ends.shift();
      const first = originals.get('original-request-0')!;
      if (fault === 'wrong-request') first.requestId = 'different';
      if (fault === 'wrong-correlation') first.correlationId = 'different';
      if (fault === 'wrong-owner') first.owner = 'UnregisteredOwner';
      if (fault === 'nonterminal') first.state = 'REVIEW_REQUIRED';
      const paths = {
        acks: '.reports/u2/unit-acks.jsonl',
        starts: '.reports/u2/unit-starts.jsonl',
        consumes: '.reports/u2/unit-ends.jsonl',
        report: '.reports/u2/unit-recovery.json',
      };
      for (const [path, rows] of [
        [paths.acks, acks],
        [paths.starts, starts],
        [paths.consumes, ends],
      ] as const)
        io.files.set(path, Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n') + '\n'));
      const store = {
        list: vi.fn(async (_model: string, query: { equals: { requestId: string } }) => {
          const row = originals.get(query.equals.requestId)!;
          if (query.equals.requestId === 'original-request-0' && fault === 'missing-work')
            return [];
          return query.equals.requestId === 'original-request-0' && fault === 'ambiguous-work'
            ? [row, row]
            : [row];
        }),
        primary: { query: vi.fn(async () => []) },
      } as unknown as ProtectedStore;
      const result = await collectCurrentWorkerRecovery(
        store,
        phases,
        { runId: 'unit-double', profileId: 'unit-double', sourceIdentity: source },
        paths,
      );
      expect(result.passed).toBe(fault === 'none');
      expect(result.ackSha256).toBe(sha256(io.files.get(paths.acks)!));
      if (fault === 'none')
        expect(
          result.phases.map((row) => [row.eligibleWork, row.acknowledgedWork, row.latencyPassed]),
        ).toEqual([
          [1, 1, true],
          [5, 5, true],
          [10, 10, true],
        ]);
      else expect(result.phases[0]!.passed).toBe(false);
      expect(JSON.parse(io.files.get(paths.report)!.toString()).actualSqsRecoveryVerified).toBe(
        false,
      );
    },
  );
for (const fault of [
  'none',
  'missing-bff',
  'zero-rss',
  'nonfinite-cpu',
  'missing-pg',
  'bad-container-json',
  'missing-telemetry',
  'zero-api-rss',
])
  it(
    '부하 자원 관측 ' +
      fault +
      '는 실제 process/두PG/telemetry 자료를 대조하며 역할 계획만으로 통과하지 않는다',
    async () => {
      controllerFixture();
      const path = '.reports/u2/telemetry-live.json';
      io.files.set(
        path,
        Buffer.from(
          JSON.stringify(
            fault === 'missing-telemetry'
              ? {}
              : {
                  process: { rss: fault === 'zero-api-rss' ? 0 : 1024 },
                  sdk: { queueDepth: 0 },
                  queue: { visibleCopies: 0 },
                },
          ),
        ),
      );
      const query = vi.fn(async (sql: string) =>
        sql.includes('GROUP BY state')
          ? [{ state: 'PENDING', count: 2 }]
          : [{ connections: 17, active: 2, lock_waits: 0 }],
      );
      const primary = { query } as unknown as DataSource,
        journal = {
          query: vi.fn(async () => [{ connections: 10, active: 1, lock_waits: 0 }]),
        } as unknown as DataSource;
      const execute = vi.fn(
        async (
          command: string,
          args: string[],
          options: { timeout: number; maxBuffer: number },
        ) => {
          expect(options).toEqual({ timeout: 5000, maxBuffer: 65536 });
          let stdout = '';
          if (command === 'lsof') stdout = fault === 'missing-bff' ? '' : '123';
          else if (command === 'ps')
            stdout =
              fault === 'zero-rss'
                ? '123 0 1'
                : fault === 'nonfinite-cpu'
                  ? '123 128 NaN'
                  : '123 128 1';
          else if (command === 'docker' && args[0] === 'ps')
            stdout =
              fault === 'bad-container-json'
                ? 'broken'
                : [
                    { ID: 'primary-fixture', Labels: 'com.docker.compose.service=primary' },
                    ...(fault === 'missing-pg'
                      ? []
                      : [{ ID: 'journal-fixture', Labels: 'com.docker.compose.service=journal' }]),
                  ]
                    .map((row) => JSON.stringify(row))
                    .join('\n');
          else if (command === 'docker' && args[0] === 'stats')
            stdout = JSON.stringify({ ID: 'primary-fixture', MemUsage: '1MiB' });
          else throw Error('등록되지 않은 자원 관측 fixture');
          return { stdout, stderr: '' };
        },
      ) as unknown as NonNullable<Parameters<typeof resourceObservation>[2]>['execute'];
      const measured = resourceObservation(primary, journal, { execute, telemetryPath: path });
      if (fault === 'none') {
        const actual = await measured;
        expect(actual.primary.connections).toBe(17);
        expect(actual.journal.connections).toBe(10);
        expect(actual.web.map((row) => [row.port, row.processes[0]!.rssBytes])).toEqual([
          [3300, 128 * 1024],
          [3301, 128 * 1024],
        ]);
        expect(actual.apiWorkerCombinedProcess.rss).toBe(1024);
        expect(actual.backlog).toEqual([{ state: 'PENDING', count: 2 }]);
      } else await expect(measured).rejects.toThrow();
    },
  );
for (const fault of [
  'none',
  'command-failure',
  'dependency',
  'sast-finding',
  'sast-error',
  'secret',
  'missing-scan',
  'stale-synth',
  'iac',
  'image-id',
  'image-vulnerability',
])
  it(
    'scanner runner의 격리 ' + fault + ' 원문은 실제 판정·후속 차단·실활성 false를 유지한다',
    async () => {
      controllerFixture();
      const template = Buffer.from(JSON.stringify({ Resources: {} }));
      io.files.set('.reports/u2/cdk.out/OmsU2Synthetic.template.json', template);
      io.files.set(
        '.reports/u2/synth.json',
        Buffer.from(
          JSON.stringify({
            passed: true,
            sourceDigest: fault === 'stale-synth' ? 'stale' : source.digest,
            templateSha256: sha256(template),
          }),
        ),
      );
      const called: string[] = [];
      io.run.mockImplementation(async (command: string, args: string[], log: string) => {
        const write = (path: string, data: unknown) =>
          io.files.set(path, Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)));
        if (command === 'npm' && JSON.stringify(args) === JSON.stringify(['audit', '--json'])) {
          called.push('dependency');
          if (fault === 'command-failure') throw Error('실행 실패 fixture');
          write(log, { metadata: { vulnerabilities: { high: fault === 'dependency' ? 1 : 0 } } });
          return;
        }
        if (command.endsWith('/semgrep') && args[0] === 'scan') {
          called.push('sast');
          write(args[args.indexOf('--output') + 1]!, {
            results: fault === 'sast-finding' ? [{ check_id: 'unit-negative' }] : [],
            errors: fault === 'sast-error' ? [{ type: 'parse-error' }] : [],
          });
          return;
        }
        if (command === 'docker' && args[0] === 'image' && args[1] === 'inspect') {
          called.push('image-id');
          write(log, fault === 'image-id' ? 'unknown' : 'sha256:' + 'e'.repeat(64));
          return;
        }
        if (command.endsWith('/trivy')) {
          called.push(args[0]!);
          const path = args[args.indexOf('--output') + 1]!;
          if (args[0] === 'fs')
            write(
              path,
              fault === 'missing-scan'
                ? {}
                : {
                    Results: [
                      { Secrets: fault === 'secret' ? [{ RuleID: 'synthetic-exposure' }] : [] },
                    ],
                  },
            );
          else if (args[0] === 'config')
            write(path, {
              Results: [
                {
                  Misconfigurations:
                    fault === 'iac'
                      ? [{ ID: 'UNIT-ACTIONABLE', Severity: 'HIGH', Status: 'FAIL' }]
                      : [],
                },
              ],
            });
          else if (args[0] === 'image') {
            expect(args.at(-1)).toBe('sha256:' + 'e'.repeat(64));
            write(path, {
              Results: [
                { Vulnerabilities: fault === 'image-vulnerability' ? [{ Severity: 'HIGH' }] : [] },
              ],
            });
          } else throw Error('등록되지 않은 scanner fixture');
          return;
        }
        throw Error('등록되지 않은 실제 runner argv fixture');
      });
      if (fault === 'none') await securityU2();
      else await expect(securityU2()).rejects.toThrow();
      const result = JSON.parse(io.files.get('.reports/u2/security.json')!.toString());
      expect(result.passed).toBe(fault === 'none');
      expect(result.realActivationAllowed).toBe(false);
      if (fault === 'none')
        expect(called).toEqual(['dependency', 'sast', 'fs', 'config', 'image-id', 'image']);
      else if (!['image-id', 'image-vulnerability'].includes(fault))
        expect(called).not.toContain('image');
      if (fault === 'secret')
        expect(
          JSON.parse(io.files.get('.reports/u2/security-policy.json')!.toString())
            .observedExposureInThisRun,
        ).toBe(true);
      expect(io.files.get('.reports/u1/unit.json')!.toString()).toBe('preserved-original-unit');
    },
  );
it('controller는 source 변경 후 중단된 raw coverage/기존 receipt bytes를 hash history에 보존하고 새 명령으로 수집한다', async () => {
  const f = controllerFixture(),
    oldBytes = Buffer.from('interrupted-raw-coverage'),
    oldResult = Buffer.from('failed-test-details');
  io.files.set('.reports/u2/coverage/coverage-final.json', oldBytes);
  io.files.set('.reports/u2/coverage.json', oldResult);
  const interruptedScanner = Buffer.from('scanner interrupted before receipt\r\n');
  io.files.set('.reports/u2/container-security.log', interruptedScanner);
  io.files.set(
    f.file,
    Buffer.from(
      JSON.stringify({ version: 1, source: { ...source, head: '0'.repeat(40) }, reports: {} }),
    ),
  );
  vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
  try {
    await collectProjectProof('u1', io.run);
    expect(
      io.files.get('.reports/u2/history/' + sha256(oldBytes) + '-coverage-final.json'),
    ).toEqual(oldBytes);
    expect(io.files.get('.reports/u2/history/' + sha256(oldResult) + '-coverage.json')).toEqual(
      oldResult,
    );
    expect(
      io.files.get('.reports/u2/history/' + sha256(interruptedScanner) + '-container-security.log'),
    ).toEqual(interruptedScanner);
    expect(f.decode(f.file).source).toEqual(source);
    expect(io.run).toHaveBeenCalledTimes(3);
  } finally {
    vi.unstubAllEnvs();
  }
});
for (const fault of ['different-source', 'contradictory-receipt'])
  it('project job은 ' + fault + ' unit 기여를 합쳐 성공으로 만들지 않는다', async () => {
    controllerFixture();
    const one = {
      version: 1,
      source,
      reports: {
        'u1-unit': { path: 'one', command: ['same'], sha256: 'a'.repeat(64), passed: true },
      },
    };
    const two = {
      version: 1,
      source: fault === 'different-source' ? { ...source, lock: 'changed-lock' } : source,
      reports: { 'u1-unit': { ...one.reports['u1-unit'], sha256: 'b'.repeat(64) } },
    };
    io.files.set('.reports/u2/validation-u1.json', Buffer.from(JSON.stringify(one)));
    io.files.set('.reports/u2/validation-u2.json', Buffer.from(JSON.stringify(two)));
    vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
    try {
      await expect(collectProjectProof('project', io.run)).rejects.toThrow();
      expect(io.run).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
it('격리 controller fixture는 명시 U1 project output만 실행·보존하고 같은 source의 완료 명령을 재실행하지 않는다', async () => {
  const f = controllerFixture();
  vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
  try {
    await collectProjectProof('u1', io.run);
    expect(Object.keys(f.decode(f.file).reports)).toEqual(f.keys);
    expect(io.run).toHaveBeenCalledTimes(3);
    expect(io.files.get('.reports/u1/unit.json')!.toString()).toBe('preserved-original-unit');
    await collectProjectProof('u1', io.run);
    expect(io.run).toHaveBeenCalledTimes(3);
    expect(f.decode('.reports/project/u1-job-summary.json').passed).toBe(true);
  } finally {
    vi.unstubAllEnvs();
  }
});
for (const fault of [
  'execution-failure',
  'missing-output',
  'source-change',
  'legacy-overwrite',
  'prior-failure',
  'prior-byte-change',
])
  it(
    '격리 controller ' + fault + '는 이후 명령/성공 summary를 차단하고 실패 receipt를 남긴다',
    async () => {
      const f = controllerFixture();
      vi.stubEnv('OMS_U2_SYNTHETIC_PROFILE', 'approved-local-only');
      const first = PROJECT_COMMANDS[0]!;
      if (fault.startsWith('prior-')) {
        io.files.set(first.path, Buffer.from('original'));
        io.files.set(
          f.file,
          Buffer.from(
            JSON.stringify({
              version: 1,
              source,
              reports: {
                'u1-unit': {
                  ...first,
                  command: first.command,
                  sha256: fault === 'prior-byte-change' ? '0'.repeat(64) : '1'.repeat(64),
                  passed: fault !== 'prior-failure',
                },
              },
            }),
          ),
        );
      } else
        io.run.mockImplementation(async () => {
          if (fault === 'execution-failure') throw Error('실제 실행 오류 fixture');
          if (fault !== 'missing-output') {
            io.files.set(first.path, Buffer.from('fixture-result'));
            io.modified.set(first.path, Date.now());
          }
          if (fault === 'source-change') io.source = { ...source, lock: 'different-lock' };
          if (fault === 'legacy-overwrite')
            io.files.set('.reports/u1/unit.json', Buffer.from('changed'));
        });
      try {
        await expect(collectProjectProof('u1', io.run)).rejects.toThrow();
        expect(io.run).toHaveBeenCalledTimes(fault.startsWith('prior-') ? 0 : 1);
        expect(f.decode('.reports/project/u1-job-summary.json').passed).toBe(false);
        expect(f.decode(f.file).reports['u1-unit'].passed).toBe(fault === 'prior-byte-change');
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
function fixture() {
  const reports: Record<string, unknown> = {},
    proof: ValidationProof = { version: 1, source, reports: {} };
  for (const key of REQUIRED_PROOFS) {
    proof.reports[key] = {
      path: key,
      sha256: 'f'.repeat(64),
      command: ['synthetic-unit-double-only'],
      passed: true,
      startedAt: '2026-10-10T00:00:00Z',
      finishedAt: '2026-10-10T00:01:00Z',
    };
    reports[key] = { passed: true };
  }
  for (const unit of ['u1', 'u2'])
    for (const layer of ['unit', 'integration'])
      reports[unit + '-' + layer] = {
        success: true,
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        testResults: [{ name: '/fixture/tests/' + unit + '/' + layer + '/one.spec.ts' }],
      };
  reports['u2-e2e'] = { stats: { expected: 3, skipped: 0, unexpected: 0, flaky: 0 } };
  reports['coverage-aggregate'] = {
    passed: true,
    source,
    threshold: 80,
    numerator: 80,
    denominator: 100,
  };
  reports['runtime-security'] = {
    passed: true,
    sameProductImageVerified: true,
    imageId: 'sha256:' + 'e'.repeat(64),
  };
  reports.security = { passed: true, imageId: 'sha256:' + 'e'.repeat(64) };
  reports.recovery = {
    passed: true,
    ackMissingOrChanged: 0,
    authorityResurrections: 0,
    rtoMilliseconds: 1800000,
    originalUnknownPreserved: true,
    freshMfaReadVerified: true,
    verificationProfileId: PILOT_PROFILE.id,
    profile: profileCounts(),
    beforeCounts: { orders: 10000, lines: 50000, products: 1000 },
  };
  reports.performance = {
    passed: true,
    finished: true,
    workerRecoveryVerified: true,
    verificationProfileId: PILOT_PROFILE.id,
    profile: profileCounts(),
    phases: mandatoryPilotPhases.map(
      ({ name: phase, rate: targetRate, seconds: durationSeconds }) => ({
        phase,
        targetRate,
        durationSeconds,
        requests: Number(targetRate) * Number(durationSeconds),
        accuracyFailures: 0,
        passed: true,
        elapsedMilliseconds: Number(durationSeconds) * 1000,
        readRequests: Number(targetRate) * Number(durationSeconds) * 0.8,
        writeRequests: Number(targetRate) * Number(durationSeconds) * 0.2,
        readP95: 10,
        writeP95: 20,
        errorRate: 0,
      }),
    ),
  };
  return { proof, reports, read: (path: string) => reports[path] };
}
it('모든 current 실행 근거가 있고 원래 전체 하한을 만족한 경우에도 실활성은 false다', () => {
  const f = fixture();
  expect(validateReleaseProof(f.proof, source, f.read).realActivationAllowed).toBe(false);
});
for (const key of REQUIRED_PROOFS)
  it(key + ' 누락/취소/실패를 성공으로 다루지 않는다', () => {
    const f = fixture();
    delete f.proof.reports[key];
    expect(() => validateReleaseProof(f.proof, source, f.read)).toThrow();
  });
it('다른 source/lock·선택 suite/skip/flaky·79%·same-image없음·복원 부활·UNKNOWN손실·50분미달을 차단한다', () => {
  for (const key of [
    'source',
    'skip',
    'partial',
    'flaky',
    'coverage',
    'image',
    'different-scanned-image',
    'rto',
    'resurrection',
    'unknown',
    'duration',
  ]) {
    const f = fixture();
    if (key === 'source') f.proof.source = { ...source, lock: 'different' };
    if (key === 'skip') (f.reports['u2-unit'] as { numPendingTests: number }).numPendingTests = 1;
    if (key === 'partial')
      (f.reports['u1-integration'] as { testResults: unknown[] }).testResults = [];
    if (key === 'flaky') (f.reports['u2-e2e'] as { stats: { flaky: number } }).stats.flaky = 1;
    if (key === 'coverage')
      (f.reports['coverage-aggregate'] as { numerator: number }).numerator = 79;
    if (key === 'image')
      (
        f.reports['runtime-security'] as { sameProductImageVerified: boolean }
      ).sameProductImageVerified = false;
    if (key === 'different-scanned-image')
      (f.reports.security as { imageId: string }).imageId = 'sha256:' + 'd'.repeat(64);
    if (key === 'rto')
      (f.reports.recovery as { rtoMilliseconds: number }).rtoMilliseconds = 1800001;
    if (key === 'resurrection')
      (f.reports.recovery as { authorityResurrections: number }).authorityResurrections = 1;
    if (key === 'unknown')
      (f.reports.recovery as { originalUnknownPreserved: boolean }).originalUnknownPreserved =
        false;
    if (key === 'duration')
      (
        f.reports.performance as { phases: { durationSeconds: number }[] }
      ).phases[0]!.durationSeconds = 299;
    expect(() => validateReleaseProof(f.proof, source, f.read)).toThrow();
  }
});
it('명령 실제 argv/새 output bytes와 시작-종료 source를 수집하며 전역 보고서 원본을 보존한다', async () => {
  const files = new Map([
    ['.reports/u1/unit.json', Buffer.from('original-unit')],
    ['.reports/u1/integration.json', Buffer.from('original-integration')],
  ]);
  const ports: ProofPorts = {
    identity: () => source,
    exists: (p) => files.has(p),
    read: (p) => files.get(p)!,
    mtime: () => Date.now(),
  };
  let observed: string[] = [];
  const result = await collectCommandProof(
    {
      key: 'unit-test-double',
      command: ['node', '--selected'],
      path: '.reports/u2/selected/proof.json',
    },
    source,
    async (c, a) => {
      observed = [c, ...a];
      files.set('.reports/u2/selected/proof.json', Buffer.from('{"success":true}'));
    },
    ports,
  );
  expect(observed).toEqual(['node', '--selected']);
  expect(result.passed).toBe(true);
  expect(result.sha256).toHaveLength(64);
  expect(files.get('.reports/u1/unit.json')!.toString()).toBe('original-unit');
});
it('child 실행 결과와 stale 산출물의 실제 bytes/hash를 분리하며 exit0만으로 준비 성공을 만들지 않는다', async () => {
  const bytes = Buffer.from('old-source-profile');
  const ports: ProofPorts = {
    identity: () => source,
    exists: (path) => path === '.runtime/u2/performance-profile.json',
    read: () => bytes,
    mtime: () => 1,
  };
  const execution = {
    observed: true,
    exitCode: 0,
    signal: null,
    errorCode: null,
    expired: false,
    logFailed: false,
    stdoutBytes: 0,
    stderrBytes: 0,
  };
  const result = await collectCommandProof(
    {
      key: 'prepare-double',
      command: ['node', '--prepare'],
      path: '.runtime/u2/performance-profile.json',
    },
    source,
    async () => execution,
    ports,
  );
  expect(result).toMatchObject({
    passed: false,
    sha256: sha256(''),
    execution,
    artifact: {
      exists: true,
      fresh: false,
      bytes: bytes.length,
      sha256: sha256(bytes),
      modifiedAtMilliseconds: 1,
    },
  });
});
it('새 산출물이 있어도 child 실패·signal·spawn error·기한 종료를 성공으로 재분류하지 않는다', async () => {
  const bytes = Buffer.from('fresh-but-failed');
  const ports: ProofPorts = {
    identity: () => source,
    exists: (path) => path === '.reports/u2/selected/child-double.json',
    read: () => bytes,
    mtime: () => Date.now(),
  };
  for (const failure of [
    { exitCode: 7 },
    { signal: 'SIGTERM' },
    { errorCode: 'ENOENT' },
    { expired: true },
    { logFailed: true },
  ]) {
    const execution = {
      observed: true,
      exitCode: 0,
      signal: null,
      errorCode: null,
      expired: false,
      logFailed: false,
      stdoutBytes: 0,
      stderrBytes: 0,
      ...failure,
    };
    const result = await collectCommandProof(
      {
        key: 'child-double',
        command: ['node', '--selected'],
        path: '.reports/u2/selected/child-double.json',
      },
      source,
      async () => execution,
      ports,
    );
    expect(result, JSON.stringify(failure)).toMatchObject({
      passed: false,
      execution,
      artifact: { fresh: true, sha256: sha256(bytes) },
    });
  }
});
it('실제 작은 child의 argv·환경·stdout/stderr bytes와 종료0/7을 원문 body 출력 없이 관측한다', async () => {
  for (const exit of [0, 7]) {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(bytes, _encoding, callback) {
        chunks.push(Buffer.from(bytes));
        callback();
      },
    });
    const result = await runProofCommand(
      process.execPath,
      [
        '-e',
        'if(process.argv[1]!=="selected"||process.env.SEMGREP_SEND_METRICS!=="off"||process.env.SEMGREP_ENABLE_VERSION_CHECK!=="0"||process.env.SEMGREP_APP_TOKEN!==undefined) process.exit(9);process.stdout.write("out");process.stderr.write("err");process.exit(Number(process.argv[2]))',
        'selected',
        String(exit),
      ],
      '.reports/u2/selected/virtual-child.log',
      2000,
      sink,
    );
    expect(result).toEqual({
      observed: true,
      exitCode: exit,
      signal: null,
      errorCode: null,
      expired: false,
      logFailed: false,
      stdoutBytes: 3,
      stderrBytes: 3,
    });
    expect(Buffer.concat(chunks).length).toBe(6);
    expect(sink.writableFinished).toBe(true);
  }
});
it('실제 spawn 실패와 유한 기한 SIGTERM을 각각 보존하고 로그 sink 오류도 실패로 남긴다', async () => {
  const sink = () =>
    new Writable({
      write(_bytes, _encoding, callback) {
        callback();
      },
    });
  const missing = await runProofCommand(
    '/nonexistent/oms-selected-child',
    [],
    '.reports/u2/selected/virtual-child.log',
    2000,
    sink(),
  );
  expect(missing).toMatchObject({
    observed: true,
    errorCode: 'ENOENT',
    signal: null,
    expired: false,
    stdoutBytes: 0,
    stderrBytes: 0,
  });
  expect(missing.exitCode).not.toBe(0);
  const expired = await runProofCommand(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    '.reports/u2/selected/virtual-child.log',
    200,
    sink(),
  );
  expect(expired).toMatchObject({
    observed: true,
    signal: 'SIGTERM',
    expired: true,
    errorCode: null,
  });
  const broken = new Writable({
    write(_bytes, _encoding, callback) {
      callback(Error('isolated-sink-failure'));
    },
  });
  const logFailure = await runProofCommand(
    process.execPath,
    ['-e', 'process.stdout.write("x");setInterval(()=>{},1000)'],
    '.reports/u2/selected/virtual-child.log',
    2000,
    broken,
  );
  expect(logFailure).toMatchObject({ observed: true, logFailed: true, signal: 'SIGTERM' });
  for (const timeout of [0, 3600001, 1.5])
    expect(() =>
      runProofCommand(
        process.execPath,
        [],
        '.reports/u2/selected/virtual-child.log',
        timeout,
        sink(),
      ),
    ).toThrow();
});
for (const mode of ['failed', 'missing', 'stale', 'source-changed', 'legacy-overwrite'])
  it('실행 수집기 ' + mode + '은 성공 proof로 만들지 않는다', async () => {
    const files = new Map([['.reports/u1/unit.json', Buffer.from('original-unit')]]);
    let current = source;
    const ports: ProofPorts = {
      identity: () => current,
      exists: (p) => files.has(p),
      read: (p) => files.get(p)!,
      mtime: () => (mode === 'stale' ? 0 : Date.now()),
    };
    const result = await collectCommandProof(
      {
        key: 'unit-test-double',
        command: ['node', '--selected'],
        path: '.reports/u2/selected/proof.json',
      },
      source,
      async () => {
        if (mode === 'failed') throw Error('synthetic failure');
        if (mode !== 'missing') files.set('.reports/u2/selected/proof.json', Buffer.from('result'));
        if (mode === 'source-changed') current = { ...source, lock: 'different' };
        if (mode === 'legacy-overwrite') files.set('.reports/u1/unit.json', Buffer.from('changed'));
      },
      ports,
    );
    expect(result.passed).toBe(false);
  });
