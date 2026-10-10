import 'reflect-metadata';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { createApi } from '@oms/api';
import { ProtectedStore, createDataSource, materialSchemas } from '@oms/persistence';
import {
  PurposeVerifier,
  EnrollmentAuthorities,
  IdentityConsumer,
  NoticeWorker,
  U2Worker,
  ref,
} from '@oms/core';
import { runWorkerCycle } from '@oms/integrations';
import { initializeU2Databases, u2Sources } from '../../tests/u2/fixtures/databases.js';
import { resetU2Databases } from '../../tests/u2/fixtures/reset.js';
import { parseSyntheticCredentials } from './prepare-test-databases.js';
import { seedVerifiedRecoveryParty } from '../../tests/u2/fixtures/identity.js';
import { u2HttpHost } from '../../tests/u2/fixtures/http.js';
import { StatefulRecoveryProvider } from '../../tests/u2/fixtures/provider.js';
import { SyntheticQueue } from '../../tests/u1/fixtures/queue.js';
import {
  SyntheticIdentityProvider,
  syntheticPassword,
  syntheticFactor,
} from '../../tests/u1/fixtures/identity.js';
import { ContainerClient } from '../u1/container-client.js';
import { runtimeSourceIdentity } from './runtime-source.js';
import { validateTestReport } from '../u1/report-validation.js';
interface RuntimeProfile {
  verifier: string;
  vault: string;
  customerCookie: string;
  staffCookie: string;
  authentication: { password: string; factor: string };
}
export function parseRuntimeProfile(input: unknown): RuntimeProfile {
  const p = input as RuntimeProfile;
  if (
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p) ||
    Object.keys(p).sort().join(',') !==
      'authentication,customerCookie,staffCookie,vault,verifier' ||
    !['verifier', 'vault', 'customerCookie', 'staffCookie'].every(
      (key) =>
        typeof p[key as keyof RuntimeProfile] === 'string' &&
        /^[a-f0-9]{64}$/.test(p[key as keyof RuntimeProfile] as string),
    ) ||
    !p.authentication ||
    Object.keys(p.authentication).sort().join(',') !== 'factor,password' ||
    typeof p.authentication.password !== 'string' ||
    typeof p.authentication.factor !== 'string' ||
    !/^[a-f0-9]{48}$/.test(p.authentication.password) ||
    !/^[a-f0-9]{24}$/.test(p.authentication.factor)
  )
    throw Error('명시 closed private 합성 runtime profile이 필요합니다.');
  return p;
}
interface RuntimeNamespacePorts {
  initialize(): Promise<void>;
  sources(): { primaryAdmin: DataSource; journalAdmin: DataSource };
  reset(primary: DataSource, journal: DataSource): Promise<void>;
}
export async function prepareRuntimeNamespace(
  ports: RuntimeNamespacePorts = {
    initialize: initializeU2Databases,
    sources: u2Sources,
    reset: resetU2Databases,
  },
) {
  const old = process.env.OMS_U2_DATABASE_PROFILE;
  process.env.OMS_U2_DATABASE_PROFILE = 'e2e-isolated';
  let admins: DataSource[] = [];
  try {
    await ports.initialize();
    const { primaryAdmin, journalAdmin } = ports.sources();
    admins = [primaryAdmin, journalAdmin];
    for (const admin of admins) await admin.initialize();
    // Close the existing administrative pools before any same-image role starts.
    // Material-only initialization does not clear protected revision history.
    await ports.reset(primaryAdmin, journalAdmin);
  } finally {
    try {
      await Promise.all(
        admins.filter((admin) => admin.isInitialized).map((admin) => admin.destroy()),
      );
    } finally {
      if (old === undefined) delete process.env.OMS_U2_DATABASE_PROFILE;
      else process.env.OMS_U2_DATABASE_PROFILE = old;
    }
  }
}
interface RuntimeObservationPorts {
  state(id: string): string;
  logs(id: string): { stdout: Buffer; stderr: Buffer; status: number | null };
}
export function runtimeContainerObservation(
  id: string,
  role: string,
  tlsReady: boolean,
  ports: RuntimeObservationPorts = {
    state: (container) =>
      execFileSync(
        'docker',
        [
          'inspect',
          container,
          '--format',
          '{"running":{{.State.Running}},"exitCode":{{.State.ExitCode}},"oomKilled":{{.State.OOMKilled}}}',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    logs: (container) => {
      const result = spawnSync('docker', ['logs', container], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return {
        stdout: result.stdout ?? Buffer.alloc(0),
        stderr: result.stderr ?? Buffer.alloc(0),
        status: result.status,
      };
    },
  },
) {
  if (!/^[a-f0-9]{64}$/.test(id) || !['customer', 'staff', 'api', 'worker'].includes(role))
    throw Error('이번 실행이 생성한 정확한 role/container ID만 관측합니다.');
  const state = JSON.parse(ports.state(id)) as {
    running: boolean;
    exitCode: number;
    oomKilled: boolean;
  };
  if (
    typeof state.running !== 'boolean' ||
    !Number.isInteger(state.exitCode) ||
    typeof state.oomKilled !== 'boolean'
  )
    throw Error('container 종료 상태 관측 누락');
  const logs = ports.logs(id);
  if (logs.status !== 0) throw Error('container 원문 log 관측 실패');
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  return {
    containerId: id,
    role,
    tlsReady,
    ...state,
    stdoutBytes: logs.stdout.length,
    stdoutSha256: digest(logs.stdout),
    stderrBytes: logs.stderr.length,
    stderrSha256: digest(logs.stderr),
    revisionSequenceRejected: logs.stderr.includes(Buffer.from("code: 'REVISION_SEQUENCE'")),
    rawLogPersisted: false,
  };
}
export function assertContainerTarget(primary: string, journal: string, vault: string) {
  for (const [value, host, path] of [
    [primary, 'primary', '/oms_u2_e2e'],
    [journal, 'journal', '/oms_u2_journal_e2e'],
    [vault, 'journal', '/oms_u2_journal_e2e'],
  ]) {
    const u = new URL(value!);
    if (
      u.protocol !== 'postgresql:' ||
      u.hostname !== host ||
      u.pathname !== path ||
      u.port !== '5432'
    )
      throw Error('등록된 격리 U2 container DB만 허용합니다.');
  }
}
async function serveFixture() {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.OMS_U2_SYNTHETIC_PROFILE !== 'approved-local-only'
  )
    throw Error('명시 local same-image fixture만 허용합니다.');
  const p = process.env.OMS_CONTAINER_PRIMARY_URL!,
    j = process.env.OMS_CONTAINER_JOURNAL_URL!,
    v = process.env.OMS_CONTAINER_VAULT_URL!;
  assertContainerTarget(p, j, v);
  const worker = process.argv.includes('--serve-worker'),
    profile = parseRuntimeProfile(JSON.parse(readFileSync('/u2-profile/profile.json', 'utf8')));
  const primary = createDataSource(
    {
      url: p,
      applicationName: 'u2-container-' + (worker ? 'worker' : 'api'),
      localSynthetic: true,
      role: worker ? 'worker-primary' : 'api-primary',
    },
    materialSchemas(),
  );
  const journal = createDataSource({
    url: j,
    applicationName: 'u2-container-append',
    localSynthetic: true,
    role: worker ? 'worker-protection' : 'api-protection',
    protectionMaterial: 'append',
  });
  const vault = createDataSource({
    url: v,
    applicationName: 'u2-container-vault',
    localSynthetic: true,
    role: worker ? 'worker-protection' : 'api-protection',
    protectionMaterial: 'vault',
  });
  for (const s of [primary, journal, vault]) await s.initialize();
  const store = new ProtectedStore(primary, journal),
    hosts: { close(): Promise<void> }[] = [];
  let running = false;
  const stop = new AbortController();
  let timer: ReturnType<typeof setInterval> | undefined;
  if (worker) {
    const broker = new SyntheticQueue(),
      now = () => new Date(),
      authority = new EnrollmentAuthorities(
        store,
        new PurposeVerifier(Buffer.from(profile.verifier, 'hex'), 'fixture-key'),
        now,
        async () => false,
      ),
      consumer = new IdentityConsumer(store, new StatefulRecoveryProvider(), authority, now, true),
      notice = new NoticeWorker(store, broker, now, true),
      u2 = new U2Worker(store, broker, consumer, now, true);
    timer = setInterval(() => {
      if (running) return;
      running = true;
      void runWorkerCycle(notice, broker, stop.signal, () => {}, u2)
        .catch(() => console.error('same-image 원래 work 대조 미확인'))
        .finally(() => {
          running = false;
        });
    }, 100);
  } else {
    const f = await seedVerifiedRecoveryParty(store, vault, 'LOCAL_SYNTHETIC', undefined, false, {
        verifier: Buffer.from(profile.verifier, 'hex'),
        vault: Buffer.from(profile.vault, 'hex'),
      }),
      tls = { key: process.env.OMS_TLS_KEY_PEM!, cert: process.env.OMS_TLS_CERT_PEM! };
    const customer = await u2HttpHost(store, f, 'CUSTOMER', true, undefined, {
      port: 8443,
      origin: 'https://customer.example.invalid',
      tls,
      cookieKey: Buffer.from(profile.customerCookie, 'hex'),
      host: 'api.example.invalid',
      listenHost: '0.0.0.0',
      identityProvider: new SyntheticIdentityProvider(false, profile.authentication),
    });
    hosts.push(customer.app);
    const staff = await createApi(customer.owners, {
      audience: 'STAFF',
      origin: 'https://staff.example.invalid',
      transportHost: 'api.example.invalid:8444',
      cookieKey: Buffer.from(profile.staffCookie, 'hex'),
      tls,
      localSynthetic: true,
      staffAdmission: async (request) =>
        request.socket.remoteAddress === process.env.OMS_SYNTHETIC_STAFF_IP
          ? 'synthetic-private-ingress'
          : null,
    });
    await staff.app.listen(8444, '0.0.0.0');
    hosts.push(staff.app);
    writeFileSync(
      '/u2-results/subjects.json',
      JSON.stringify({
        customerId: f.customer.principalId,
        staffId: f.staff.principalId,
        enterpriseRef: f.enterpriseRef,
        sourceRef: ref('RecoveryCase', f.source),
      }),
      { mode: 0o600 },
    );
  }
  const close = async () => {
    stop.abort();
    if (timer) clearInterval(timer);
    while (running) await new Promise((done) => setTimeout(done, 25));
    for (const h of hosts) await h.close();
    for (const s of [primary, journal, vault]) await s.destroy();
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
  console.log(
    JSON.stringify({ ready: true, role: worker ? 'WORKER' : 'API', realActivationAllowed: false }),
  );
}
export async function runtimeSecurityReport() {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.OMS_U2_SYNTHETIC_PROFILE !== 'approved-local-only'
  )
    throw Error('격리 synthetic same-image 검증만 허용합니다.');
  const source = runtimeSourceIdentity(),
    folder = resolve('.runtime/u2/container-proof'),
    created: string[] = [],
    roles = new Map<string, string>(),
    readyRoles = new Set<string>();
  let passed = false;
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  mkdirSync(folder + '/results', { recursive: true, mode: 0o700 });
  mkdirSync('.reports/u2', { recursive: true, mode: 0o700 });
  validateTestReport(
    JSON.parse(readFileSync('.reports/u2/selected/project-runtime-security.json', 'utf8')),
    ['tests/u2/integration/runtime-security.spec.ts'],
  );
  const image = execFileSync(
    'docker',
    ['image', 'inspect', 'oms-u2-local:verification', '--format', '{{.Id}}'],
    { encoding: 'utf8' },
  ).trim();
  if (
    image !== readFileSync('.reports/u2/scanned-image-id.txt', 'utf8').trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(image)
  )
    throw Error('실제 스캔한 같은 제품 image가 필요합니다.');
  await prepareRuntimeNamespace();
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      folder + '/key.pem',
      '-out',
      folder + '/cert.pem',
      '-subj',
      '/CN=api.example.invalid',
      '-addext',
      'subjectAltName=DNS:customer.example.invalid,DNS:staff.example.invalid,DNS:api.example.invalid',
    ],
    { stdio: 'ignore' },
  );
  chmodSync(folder + '/key.pem', 0o600);
  const profile = {
    verifier: randomBytes(32).toString('hex'),
    vault: randomBytes(32).toString('hex'),
    customerCookie: randomBytes(32).toString('hex'),
    staffCookie: randomBytes(32).toString('hex'),
    authentication: { password: syntheticPassword, factor: syntheticFactor },
  };
  writeFileSync(folder + '/profile.json', JSON.stringify(profile), { mode: 0o600 });
  const c = parseSyntheticCredentials(readFileSync('.runtime/u2/test-databases.env', 'utf8')),
    cert = readFileSync(folder + '/cert.pem', 'utf8');
  const environment = {
    ...process.env,
    OMS_TLS_KEY_PEM: readFileSync(folder + '/key.pem', 'utf8'),
    OMS_TLS_CERT_PEM: cert,
    OMS_CONTAINER_PRIMARY_URL:
      'postgresql://u2_verify_app:' +
      encodeURIComponent(c.U2_APP_PASSWORD!) +
      '@primary:5432/oms_u2_e2e',
    OMS_CONTAINER_JOURNAL_URL:
      'postgresql://u2_verify_journal_append:' +
      encodeURIComponent(c.U2_JOURNAL_APPEND_PASSWORD!) +
      '@journal:5432/oms_u2_journal_e2e',
    OMS_CONTAINER_VAULT_URL:
      'postgresql://u2_verify_vault:' +
      encodeURIComponent(c.U2_VAULT_PASSWORD!) +
      '@journal:5432/oms_u2_journal_e2e',
    OMS_SYNTHETIC_STAFF_IP: '',
  };
  const start = (role: string, args: string[], command: string[]) => {
    const id = execFileSync(
      'docker',
      [
        'run',
        '--detach',
        '--platform',
        'linux/amd64',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=64m',
        '--network',
        'oms-u1_default',
        '--name',
        'oms-u2-proof-' + role,
        '--label',
        'oms.u2.proof=runtime-security',
        ...args,
        image,
        ...command,
      ],
      { env: environment, encoding: 'utf8' },
    ).trim();
    created.push(id);
    roles.set(id, role);
    return id;
  };
  const boundaries: string[] = [];
  try {
    let staffId = '';
    for (const [role, port, apiPort] of [
      ['customer', 35443, 8443],
      ['staff', 36443, 8444],
    ] as const) {
      const id = start(
        role,
        [
          '--network-alias',
          role + '.example.invalid',
          '--publish',
          '127.0.0.1:' + port + ':8443',
          '--env',
          'OMS_TLS_KEY_PEM',
          '--env',
          'OMS_TLS_CERT_PEM',
          '--env',
          'NODE_EXTRA_CA_CERTS=/u2-cert/cert.pem',
          '--mount',
          'type=bind,source=' + folder + '/cert.pem,target=/u2-cert/cert.pem,readonly',
          '--env',
          'PORT=8443',
          '--env',
          'OMS_WEB_ORIGIN=https://' + role + '.example.invalid',
          '--env',
          'OMS_API_ORIGIN=https://api.example.invalid:' + apiPort,
        ],
        ['/usr/local/bin/node', '--import', 'tsx', 'apps/' + role + '-web/server.ts'],
      );
      if (role === 'staff') staffId = id;
    }
    environment.OMS_SYNTHETIC_STAFF_IP = execFileSync(
      'docker',
      ['inspect', staffId, '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'],
      { encoding: 'utf8' },
    ).trim();
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(environment.OMS_SYNTHETIC_STAFF_IP))
      throw Error('합성 staff BFF의 실제 peer 주소가 필요합니다.');
    const fixtureArgs = [
      '--user',
      String(process.getuid!()) + ':' + String(process.getgid!()),
      '--network-alias',
      'api.example.invalid',
      '--env',
      'NODE_ENV=test',
      '--env',
      'OMS_U2_SYNTHETIC_PROFILE=approved-local-only',
      '--env',
      'OMS_CONTAINER_PRIMARY_URL',
      '--env',
      'OMS_CONTAINER_JOURNAL_URL',
      '--env',
      'OMS_CONTAINER_VAULT_URL',
      '--env',
      'OMS_TLS_KEY_PEM',
      '--env',
      'OMS_TLS_CERT_PEM',
      '--env',
      'OMS_SYNTHETIC_STAFF_IP',
      '--mount',
      'type=bind,source=' + resolve('tests') + ',target=/app/tests,readonly',
      '--mount',
      'type=bind,source=' + folder + '/profile.json,target=/u2-profile/profile.json,readonly',
      '--mount',
      'type=bind,source=' + folder + '/results,target=/u2-results',
    ];
    start('api', fixtureArgs, [
      '/usr/local/bin/node',
      '--import',
      'tsx',
      'scripts/u2/runtime-security-report.ts',
      '--serve-api',
    ]);
    const customer = new ContainerClient('customer', 35443, cert, profile.authentication),
      staff = new ContainerClient('staff', 36443, cert, profile.authentication);
    for (const client of [customer, staff]) {
      const until = Date.now() + 60000;
      let ready = false;
      while (Date.now() < until && !ready) {
        try {
          await client.refresh();
          ready = true;
        } catch {
          if (
            created.some(
              (id) =>
                execFileSync('docker', ['inspect', id, '--format', '{{.State.Running}}'], {
                  encoding: 'utf8',
                }).trim() !== 'true',
            )
          )
            throw Error('same-image fixture 시작 실패');
          await new Promise((done) => setTimeout(done, 250));
        }
      }
      if (!ready) throw Error('same-image TLS 준비 기한');
    }
    for (const role of ['customer', 'staff', 'api']) readyRoles.add(role);
    start('worker', fixtureArgs, [
      '/usr/local/bin/node',
      '--import',
      'tsx',
      'scripts/u2/runtime-security-report.ts',
      '--serve-worker',
    ]);
    const subject = JSON.parse(readFileSync(folder + '/results/subjects.json', 'utf8')) as {
      customerId: string;
      staffId: string;
      enterpriseRef: { id: string };
      sourceRef: unknown;
    };
    await customer.authenticate(subject.customerId);
    await staff.authenticate(subject.staffId);
    boundaries.push('현재 MFA/동일image TLS BFF');
    if (
      (await customer.request('/enterprises/' + subject.enterpriseRef.id + '/memberships'))
        .status !== 200
    )
      throw Error('same-image 실제 U2 현재 관리 투영 실패');
    boundaries.push('U2 현재 enterprise fence/관리 투영');
    for (const [path, data, headers] of [
      ['/identity/party-challenges', {}, { 'X-CSRF-Token': 'forged' }],
      ['/identity/party-challenges', {}, { Origin: 'https://attacker.invalid' }],
    ] as const) {
      if ((await customer.request(path, data, headers)).status !== 403)
        throw Error('same-image CSRF/origin 공격 허용');
    }
    boundaries.push('CSRF/origin 거절');
    if ((await customer.request('/identity?token=synthetic-private')).status !== 400)
      throw Error('URL 비밀 거절 실패');
    if (![403, 404].includes((await customer.request('/staff-role-directory')).status))
      throw Error('고객 STAFF route 허용');
    if (
      (await staff.request('/staff-role-directory?filter=' + encodeURIComponent("' OR TRUE--")))
        .status !== 400
    )
      throw Error('SQL filter injection 허용');
    boundaries.push('URL비밀/STAFF 분리/SQL filter 거절');
    const challenge = await customer.request<{ challengeId: string; partySecret?: string }>(
      '/identity/party-challenges',
      {},
    );
    if (challenge.status !== 200 || challenge.body.partySecret)
      throw Error('server party challenge/secret 투영 오류');
    const result = await customer.request<{ partySecret?: string }>(
      '/identity/recovery-cases/' + (subject.sourceRef as { id: string }).id + '/party-contexts',
      { caseRef: subject.sourceRef, challengeId: challenge.body.challengeId },
      { 'X-Target-Revision': '1' },
    );
    if (result.status !== 200 || result.body.partySecret)
      throw Error('same-image U2 party owner/secret boundary 오류');
    boundaries.push('U2 실제 목적 cookie/원문비노출');
    if (
      (
        await customer.request('/identity/recovery-requests', {
          loginIdentifier: 'a'.repeat(66000),
        })
      ).status !== 413
    )
      throw Error('same-image 입력 한도 실패');
    boundaries.push('64KiB 입력거절');
    for (const id of created) {
      const state = JSON.parse(execFileSync('docker', ['inspect', id], { encoding: 'utf8' }))[0];
      if (
        !state.State.Running ||
        state.Image !== image ||
        state.Config.Labels['oms.u2.proof'] !== 'runtime-security'
      )
        throw Error('4-role 현재 실행 image 대조 실패');
    }
    if (runtimeSourceIdentity().digest !== source.digest) throw Error('실행 중 source 변경');
    passed = true;
  } finally {
    const startup: unknown[] = [];
    let cleanupFailed = false;
    for (const id of created) {
      const role = roles.get(id)!;
      try {
        startup.push(runtimeContainerObservation(id, role, readyRoles.has(role)));
      } catch {
        startup.push({ containerId: id, role, observationMissing: true });
        cleanupFailed = true;
      }
      try {
        execFileSync('docker', ['stop', '--time', '30', id], { stdio: 'ignore' });
        execFileSync('docker', ['rm', id], { stdio: 'ignore' });
      } catch {
        startup.push({ containerId: id, role, cleanupIncomplete: true });
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) passed = false;
    writeFileSync(
      '.reports/u2/runtime-security.json',
      JSON.stringify(
        {
          passed,
          imageId: image,
          sameProductImageVerified: passed,
          sourceDigest: source.digest,
          roles: created.length,
          boundaries,
          startup,
          cleanupFailed,
          actualTlsVerification: passed,
          actualCognitoVerified: false,
          actualCompanyNetworkVerified: false,
          realActivationAllowed: false,
          observedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    if (cleanupFailed) throw Error('same-image 시작 관측 또는 정확 소유 container 정리 미완료');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--serve-api') || process.argv.includes('--serve-worker'))
    await serveFixture();
  else await runtimeSecurityReport();
}
