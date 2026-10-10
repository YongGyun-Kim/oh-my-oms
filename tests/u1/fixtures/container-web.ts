import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { request } from 'node:https';
import { join } from 'node:path';
const folder = '.runtime/u1/container-tls';
mkdirSync(folder, { recursive: true, mode: 0o700 });
const keyPath = join(folder, 'key.pem');
const certPath = join(folder, 'cert.pem');
if (!existsSync(certPath)) {
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
      '/CN=customer.example.invalid',
      '-addext',
      'subjectAltName=DNS:customer.example.invalid,DNS:staff.example.invalid,DNS:api.example.invalid',
    ],
    { stdio: 'ignore' },
  );
  chmodSync(keyPath, 0o600);
}
const key = readFileSync(keyPath, 'utf8');
const cert = readFileSync(certPath, 'utf8');
const name = 'oms-u1-customer-runtime-verify';
const env = { ...process.env, OMS_TLS_KEY_PEM: key, OMS_TLS_CERT_PEM: cert };
execFileSync(
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
    '--name',
    name,
    '--publish',
    '127.0.0.1:33443:8443',
    '--env',
    'OMS_TLS_KEY_PEM',
    '--env',
    'OMS_TLS_CERT_PEM',
    '--env',
    'OMS_WEB_ORIGIN=https://customer.example.invalid',
    '--env',
    'OMS_API_ORIGIN=https://api.example.invalid:8443',
    '--env',
    'PORT=8443',
    'oms-u1-local:verification',
    '/usr/local/bin/node',
    '--import',
    'tsx',
    'apps/customer-web/server.ts',
  ],
  { env, stdio: 'ignore' },
);
const get = (path: string) =>
  new Promise<{ status: number; body: string; headers: Record<string, unknown> }>(
    (done, reject) => {
      const req = request(
        {
          hostname: 'customer.example.invalid',
          port: 33443,
          path,
          servername: 'customer.example.invalid',
          ca: cert,
          rejectUnauthorized: true,
          family: 4,
          headers: { Host: 'customer.example.invalid' },
          lookup: (_hostname, _options, callback) => callback(null, '127.0.0.1', 4),
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk) => {
            size += chunk.length;
            if (size > 4 * 1024 * 1024) req.destroy(new Error('TLS 응답 한도'));
            else chunks.push(chunk);
          });
          response.on('end', () =>
            done({
              status: response.statusCode!,
              body: Buffer.concat(chunks).toString(),
              headers: response.headers,
            }),
          );
        },
      );
      req.setTimeout(5000, () => req.destroy(new Error('TLS 조회 기한')));
      req.on('error', reject);
      req.end();
    },
  );
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      if ((await get('/health/live')).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((done) => setTimeout(done, 1000));
  }
  if (!ready) throw new Error('amd64 TLS UI 시작 확인 실패');
  const page = await get('/');
  if (
    page.status !== 200 ||
    !page.body.includes('lang="ko"') ||
    !String(page.headers['content-security-policy']).includes('nonce-') ||
    !String(page.headers['cache-control']).includes('no-store')
  )
    throw new Error('실제 TLS 한국어 동적 HTML/CSP 확인 실패');
  const unavailable = await get('/api/identity');
  if (unavailable.status !== 503) {
    writeFileSync('.reports/u1/container-bff-failure.json', JSON.stringify(unavailable));
  }
  if (unavailable.status !== 503) throw new Error('미등록 backend를 실제 인증으로 표시했습니다.');
  console.log(
    JSON.stringify({
      architecture: 'linux/amd64',
      node: '22.23.3',
      tlsChainAndHostnameVerified: true,
      htmlStatus: page.status,
      bffUnregisteredStatus: unavailable.status,
      nonceCsp: true,
      noStore: true,
    }),
  );
} catch (error) {
  writeFileSync(
    '.reports/u1/container-web-start-failure.log',
    execFileSync('docker', ['logs', name]).toString(),
  );
  throw error;
} finally {
  execFileSync('docker', ['stop', '--timeout', '20', name], { stdio: 'ignore' });
}
