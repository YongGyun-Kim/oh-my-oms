import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

mkdirSync('.runtime/u1', { recursive: true });
const path = '.runtime/u1/databases.env';
if (!existsSync(path)) {
  const names = ['PRIMARY_ADMIN', 'JOURNAL_ADMIN', 'APP', 'JOURNAL_APPEND'];
  writeFileSync(
    path,
    names.map((name) => `U1_${name}_PASSWORD=${randomBytes(32).toString('hex')}`).join('\n') + '\n',
    { mode: 0o600 },
  );
}
if (!readFileSync(path, 'utf8').includes('U1_DIAGNOSTIC_PASSWORD='))
  writeFileSync(
    path,
    readFileSync(path, 'utf8') + `U1_DIAGNOSTIC_PASSWORD=${randomBytes(32).toString('hex')}\n`,
    { mode: 0o600 },
  );
const env = { ...process.env };
for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
  const split = line.indexOf('=');
  env[line.slice(0, split)] = line.slice(split + 1);
}
const result = spawnSync(
  'docker',
  ['compose', '--env-file', path, '-f', 'tests/u1/docker-compose.yml', 'up', '-d', '--wait'],
  { env, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
