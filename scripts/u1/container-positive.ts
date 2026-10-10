import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ProtectedStore } from '@oms/persistence';
import { ContainerClient } from './container-client.js';
import { containerBusinessFlow } from './container-flow.js';
import { localSources, databaseCredentials } from '../../tests/u1/fixtures/databases.js';
import { initializeDatabases } from '../../tests/u1/fixtures/migrate.js';
import { resetSyntheticDatabases } from '../../tests/u1/fixtures/reset.js';
import {
  seedSyntheticAccount,
  syntheticPassword,
  syntheticFactor,
} from '../../tests/u1/fixtures/identity.js';
import { seedMinimumStaffManager } from '../../tests/u1/fixtures/staff-bootstrap.js';
if (
  process.version !== 'v22.23.3' ||
  process.env.NODE_ENV === 'production' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
)
  throw new Error('명시 합성 4-role TLS 검증만 실행합니다.');
process.env.OMS_U1_DATABASE_PROFILE = 'e2e-isolated';
await initializeDatabases();
const sources = localSources();
for (const source of Object.values(sources)) await source.initialize();
const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
for (const [id, audience] of [
  ['customer', 'CUSTOMER'],
  ['staff', 'STAFF'],
] as const)
  await seedSyntheticAccount(store, id, audience);
await seedMinimumStaffManager(store, 'staff', new Date());
const folder = resolve('.runtime/u1/container-positive');
mkdirSync(folder, { recursive: true, mode: 0o700 });
const keyPath = folder + '/key.pem';
const certPath = folder + '/cert.pem';
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
    keyPath,
    '-out',
    certPath,
    '-subj',
    '/CN=api.example.invalid',
    '-addext',
    'subjectAltName=DNS:customer.example.invalid,DNS:staff.example.invalid,DNS:api.example.invalid',
  ],
  { stdio: 'ignore' },
);
chmodSync(keyPath, 0o600);
const profile = {
  verifier: randomBytes(32).toString('hex'),
  customerCookie: randomBytes(32).toString('hex'),
  staffCookie: randomBytes(32).toString('hex'),
  credentials: { password: syntheticPassword, factor: syntheticFactor },
};
writeFileSync(folder + '/profile.json', JSON.stringify(profile), { mode: 0o600 });
const cert = readFileSync(certPath, 'utf8');
const secret = databaseCredentials();
const image = execFileSync(
  'docker',
  ['image', 'inspect', 'oms-u1-local:verification', '--format', '{{.Id}}'],
  { encoding: 'utf8' },
).trim();
const environment = {
  ...process.env,
  OMS_TLS_KEY_PEM: readFileSync(keyPath, 'utf8'),
  OMS_TLS_CERT_PEM: cert,
  OMS_CONTAINER_PRIMARY_URL:
    'postgresql://u1_verify_app:' +
    encodeURIComponent(secret.U1_APP_PASSWORD!) +
    '@primary:5432/oms_u1_e2e',
  OMS_CONTAINER_JOURNAL_URL:
    'postgresql://u1_verify_journal_append:' +
    encodeURIComponent(secret.U1_JOURNAL_APPEND_PASSWORD!) +
    '@journal:5432/oms_u1_journal_e2e',
};
const created: string[] = [];
let passed = false;
let business: Awaited<ReturnType<typeof containerBusinessFlow>> | undefined;
let workerMarks = 0;
function start(role: string, args: string[], command: string[]) {
  const id = execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--platform',
      'linux/amd64',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      '--network',
      'oms-u1_default',
      '--name',
      'oms-u1-positive-' + role,
      '--label',
      'oms.u1.proof=container-positive',
      ...args,
      image,
      ...command,
    ],
    { env: environment, encoding: 'utf8' },
  ).trim();
  created.push(id);
  return id;
}
try {
  start(
    'api',
    [
      '--network-alias',
      'api.example.invalid',
      '--user',
      String(process.getuid!()) + ':' + String(process.getgid!()),
      '--env',
      'NODE_ENV=test',
      '--env',
      'OMS_U1_SYNTHETIC_PROFILE=approved-local-only',
      '--env',
      'OMS_CONTAINER_FIXTURE_ROLE=API',
      '--env',
      'OMS_CONTAINER_PRIMARY_URL',
      '--env',
      'OMS_CONTAINER_JOURNAL_URL',
      '--env',
      'OMS_TLS_KEY_PEM',
      '--env',
      'OMS_TLS_CERT_PEM',
      '--mount',
      'type=bind,source=' + resolve('tests') + ',target=/app/tests,readonly',
      '--mount',
      'type=bind,source=' + folder + ',target=/u1-profile,readonly',
    ],
    ['/usr/local/bin/node', '--import', 'tsx', 'tests/u1/fixtures/container-service.ts'],
  );
  start(
    'worker',
    [
      '--user',
      String(process.getuid!()) + ':' + String(process.getgid!()),
      '--env',
      'NODE_ENV=test',
      '--env',
      'OMS_U1_SYNTHETIC_PROFILE=approved-local-only',
      '--env',
      'OMS_CONTAINER_FIXTURE_ROLE=WORKER',
      '--env',
      'OMS_CONTAINER_PRIMARY_URL',
      '--env',
      'OMS_CONTAINER_JOURNAL_URL',
      '--mount',
      'type=bind,source=' + resolve('tests') + ',target=/app/tests,readonly',
    ],
    ['/usr/local/bin/node', '--import', 'tsx', 'tests/u1/fixtures/container-service.ts'],
  );
  for (const [role, port, apiPort] of [
    ['customer', 33443, 8443],
    ['staff', 34443, 8444],
  ] as const)
    start(
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
        'NODE_EXTRA_CA_CERTS=/u1-cert/cert.pem',
        '--mount',
        'type=bind,source=' + certPath + ',target=/u1-cert/cert.pem,readonly',
        '--env',
        'PORT=8443',
        '--env',
        'OMS_WEB_ORIGIN=https://' + role + '.example.invalid',
        '--env',
        'OMS_API_ORIGIN=https://api.example.invalid:' + apiPort,
      ],
      ['/usr/local/bin/node', '--import', 'tsx', 'apps/' + role + '-web/server.ts'],
    );
  const customer = new ContainerClient('customer', 33443, cert, profile.credentials);
  const staff = new ContainerClient('staff', 34443, cert, profile.credentials);
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
          throw new Error('4-role 컨테이너 종료');
        await new Promise((done) => setTimeout(done, 250));
      }
    }
    if (!ready) throw new Error('4-role TLS BFF 준비 기한');
  }
  business = await containerBusinessFlow(customer, staff);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    workerMarks = Number(
      (
        await sources.primaryApp.query(
          'SELECT count(*)::int AS count FROM u1_consumer_processing_mark',
        )
      )[0].count,
    );
    if (workerMarks > 0) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  if (workerMarks === 0) throw new Error('별도 worker 보호 처리 증거가 없습니다.');
  for (const id of created) {
    const state = JSON.parse(execFileSync('docker', ['inspect', id], { encoding: 'utf8' }))[0];
    if (
      !state.State.Running ||
      state.Image !== image ||
      state.Config.Labels['oms.u1.proof'] !== 'container-positive'
    )
      throw new Error('현재 4-role/image 소유 대조 실패');
  }
  passed = true;
} finally {
  mkdirSync('.reports/u1', { recursive: true, mode: 0o700 });
  writeFileSync(
    '.reports/u1/container-positive.json',
    JSON.stringify(
      {
        passed,
        image,
        containerIds: created,
        business,
        workerMarks,
        roles: created.length,
        actualTlsVerification: true,
        actualProviderVerified: false,
        actualCompanyNetworkVerified: false,
        actualAwsDeploymentPerformed: false,
        realActivationAllowed: false,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  for (const id of created)
    try {
      execFileSync('docker', ['stop', '--time', '30', id], { stdio: 'ignore' });
    } catch {}
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
}
