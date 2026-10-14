import { runCommand } from '../u1/process.js';
import { initializeDatabases } from '../../tests/u1/fixtures/migrate.js';
import { prepareU2TestDatabases } from './prepare-test-databases.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
export async function primeNextTypes() {
  if (process.version !== 'v22.23.3' || process.env.NODE_ENV === 'production')
    throw Error('고정 local 합성 build 입력만 준비합니다.');
  mkdirSync('.reports/u2', { recursive: true, mode: 0o700 });
  for (const [app, port, api] of [
    ['customer-web', 3300, 34800],
    ['staff-web', 3301, 34801],
  ] as const) {
    const log = createWriteStream('.reports/u2/next-prime-' + app + '.log', { mode: 0o600 }),
      child = spawn(
        process.execPath,
        [
          'node_modules/next/dist/bin/next',
          'dev',
          'apps/' + app,
          '--hostname',
          '127.0.0.1',
          '--port',
          String(port),
        ],
        {
          shell: false,
          env: {
            ...process.env,
            NODE_ENV: 'development',
            OMS_LOCAL_SYNTHETIC: '1',
            OMS_WEB_ORIGIN: 'http://127.0.0.1:' + port,
            OMS_API_ORIGIN: 'http://127.0.0.1:' + api,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    try {
      const until = Date.now() + 120000;
      let ready = false;
      while (Date.now() < until && !ready) {
        if (child.exitCode !== null) throw Error('Next 합성 type 준비 시작 실패');
        try {
          const r = await fetch('http://127.0.0.1:' + port, { signal: AbortSignal.timeout(2000) });
          ready = r.ok;
          await r.body?.cancel();
        } catch {
          /* 실제 준비 관측 전에는 성공으로 다루지 않는다. */
        }
        if (!ready) await new Promise((done) => setTimeout(done, 250));
      }
      if (!ready) throw Error('Next 합성 type 준비 기한');
    } finally {
      if (child.exitCode === null)
        await new Promise<void>((done) => {
          const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
          child.once('exit', () => {
            clearTimeout(timer);
            done();
          });
          child.kill('SIGTERM');
        });
      await new Promise<void>((done) => log.end(done));
    }
  }
}
export async function bootstrapU2() {
  if (process.version !== 'v22.23.3' || process.env.NODE_ENV === 'production')
    throw Error('승인된 local/CI synthetic 도구만 준비합니다.');
  await runCommand(
    'node',
    ['--import', 'tsx', 'scripts/u1/local-databases.ts'],
    '.reports/u2/ci-databases.log',
  );
  await initializeDatabases();
  await runCommand(
    'node',
    ['--import', 'tsx', 'scripts/u1/prepare-test-databases.ts'],
    '.reports/u2/ci-u1-isolated-preparation.log',
  );
  await prepareU2TestDatabases();
  await primeNextTypes();
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--prime-types')) await primeNextTypes();
  else await bootstrapU2();
}
