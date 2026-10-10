import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { runCommand } from './process.js';
import { ciLocalHealth } from './ci-local-health.js';
if (
  process.version !== 'v22.23.3' ||
  process.env.CI !== 'true' ||
  process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only' ||
  process.env.NODE_ENV === 'production'
)
  throw new Error('격리된 fresh CI의 명시 합성 전체 증거만 준비할 수 있습니다.');
mkdirSync('.reports/u1', { recursive: true, mode: 0o700 });
let passed = false;
const stages: string[] = [];
try {
  await runCommand(
    'node',
    ['--import', 'tsx', 'tests/u1/fixtures/performance-preparation.ts'],
    '.reports/u1/ci-profile-preparation.log',
    3600000,
  );
  stages.push('full-protected-profile-prepared');
  await runCommand(
    'node',
    ['--import', 'tsx', 'tests/u1/fixtures/performance-staff.ts'],
    '.reports/u1/ci-staff-profile.log',
  );
  await runCommand('npm', ['run', 'test:u1:profile'], '.reports/u1/ci-profile-probes.log');
  stages.push('profile-regressions');
  const output = createWriteStream('.reports/u1/ci-profile-service.log', { mode: 0o600 });
  const service = spawn('node', ['--import', 'tsx', 'tests/u1/fixtures/performance-service.ts'], {
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  service.stdout.pipe(output, { end: false });
  service.stderr.pipe(output, { end: false });
  const webServers = ['customer', 'staff'].map((audience, index) => {
    const child = spawn('npm', ['run', 'dev:u1:' + audience], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        OMS_LOCAL_SYNTHETIC: '1',
        OMS_WEB_ORIGIN: 'http://127.0.0.1:' + (index === 0 ? '3100' : '3200'),
        OMS_API_ORIGIN: 'http://127.0.0.1:' + (index === 0 ? '34700' : '34701'),
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    return child;
  });
  try {
    const deadline = Date.now() + 60000;
    let live = false;
    while (Date.now() < deadline && !live) {
      if (service.exitCode !== null) throw new Error('전체 profile 서비스 시작 실패');
      try {
        live = await ciLocalHealth(34700, '/health/live');
      } catch {
        /* Startup is bounded; no healthy claim until observed. */
      }
      if (!live) await new Promise((done) => setTimeout(done, 100));
    }
    if (!live) throw new Error('전체 profile 서비스 준비 기한 초과');
    for (const port of [3100, 3200]) {
      let ready = false;
      while (Date.now() < deadline && !ready) {
        try {
          ready = await ciLocalHealth(port, '/');
        } catch {
          /* Explicit bounded startup remains unconfirmed. */
        }
        if (!ready) await new Promise((done) => setTimeout(done, 100));
      }
      if (!ready) throw new Error('Next BFF 준비 기한 초과');
    }
    await runCommand(
      'node',
      ['--import', 'tsx', 'scripts/u1/performance.ts'],
      '.reports/u1/ci-whole-performance.log',
      3600000,
    );
    stages.push('whole-50-minute-profile');
  } finally {
    for (const child of [service, ...webServers])
      if (child.exitCode === null) {
        const ended = once(child, 'exit');
        child.kill('SIGTERM');
        const force = setTimeout(() => child.kill('SIGKILL'), 30000);
        await ended;
        clearTimeout(force);
      }
    output.end();
  }
  await runCommand(
    'node',
    ['--import', 'tsx', 'scripts/u1/verify-acks.ts'],
    '.reports/u1/ci-ack-preservation.log',
  );
  stages.push('independent-ack-preservation');
  await runCommand(
    'node',
    ['--import', 'tsx', 'scripts/u1/large-recovery.ts'],
    '.reports/u1/ci-large-recovery.log',
    3600000,
  );
  stages.push('full-recovery-and-current-authentication');
  await runCommand(
    'node',
    ['--import', 'tsx', 'scripts/u1/container-positive.ts'],
    '.reports/u1/ci-container-positive.log',
  );
  stages.push('four-role-tls-container-path');
  await runCommand('npm', ['run', 'test:u1:integration'], '.reports/u1/ci-final-integration.log');
  await runCommand('npm', ['run', 'test:u1:unit'], '.reports/u1/ci-final-unit.log');
  await runCommand('npm', ['run', 'test:u1:coverage'], '.reports/u1/ci-final-coverage.log');
  await runCommand(
    'node',
    ['--import', 'tsx', 'scripts/u1/runtime-security-report.ts'],
    '.reports/u1/ci-runtime-security.log',
  );
  for (const name of [
    'runtime-security',
    'deployment-compatibility',
    'large-recovery',
    'accessibility',
  ])
    if (JSON.parse(readFileSync('.reports/u1/' + name + '.json', 'utf8')).passed !== true)
      throw new Error('필수 실제 실행 보고서가 없습니다: ' + name);
  passed = true;
} finally {
  writeFileSync(
    '.reports/u1/ci-proof-summary.json',
    JSON.stringify(
      {
        passed,
        stages,
        actualAwsDeploymentPerformed: false,
        realActivationAllowed: false,
        sourceCommit: process.env.GITHUB_SHA ?? null,
        observedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
