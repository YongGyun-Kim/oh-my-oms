import { createServer } from 'node:https';
import type { Server } from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { ContainerClient } from '../../../scripts/u1/container-client.js';
let folder: string, cert: string, server: Server, port: number;
let mode: string;
const inputs: { path: string; cookie: string; body: unknown }[] = [];
beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'oms-u1-client-tls-'));
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
      folder + '/key',
      '-out',
      folder + '/cert',
      '-subj',
      '/CN=customer.example.invalid',
      '-addext',
      'subjectAltName=DNS:customer.example.invalid,DNS:staff.example.invalid',
    ],
    { stdio: 'ignore' },
  );
  cert = readFileSync(folder + '/cert', 'utf8');
  server = createServer({ key: readFileSync(folder + '/key'), cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (value) => chunks.push(value));
    req.on('end', () => {
      const path = req.url!;
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      inputs.push({ path, cookie: req.headers.cookie ?? '', body });
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'invalid-json') {
        res.end('{');
        return;
      }
      if (mode === 'oversize') {
        res.end('a'.repeat(4 * 1024 * 1024 + 1));
        return;
      }
      if (mode === 'no-response') return;
      if (mode === 'denied' && path.includes('/responses')) {
        res.writeHead(401);
        res.end(JSON.stringify({ type: 'urn:fixture:denied' }));
        return;
      }
      let value: unknown = {};
      if (path === '/api/security/csrf') {
        res.setHeader(
          'Set-Cookie',
          '__Host-transport-fixture=random; Path=/; Secure; HttpOnly; SameSite=Strict',
        );
        value = { csrfToken: 'transport-fixture-only' };
      } else if (path === '/api/identity/challenges') value = { challengeId: 'password' };
      else if (path.includes('/password/responses')) value = { challengeId: 'factor' };
      else if (path.includes('/factor/responses'))
        value = { phase: mode === 'codes' ? 'MFA_REQUIRED' : 'MFA_VERIFIED' };
      else if (path.endsWith('/recovery-code-issues')) value = { setId: 'codes' };
      else if (path.endsWith('/recovery-code-acknowledgements')) value = { phase: 'MFA_VERIFIED' };
      else if (path === '/api/identity')
        value = { data: { accountRef: { id: mode === 'wrong-account' ? 'other' : 'account' } } };
      res.end(JSON.stringify(value));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as { port: number }).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  rmSync(folder, { recursive: true });
});
beforeEach(() => {
  mode = 'normal';
  inputs.length = 0;
});
const client = () =>
  new ContainerClient('customer', port, cert, { password: 'not-real', factor: 'not-real' });
describe('컨테이너 클라이언트 실제 CA/hostname·유한 TLS 전송(신원 fixture 단위)', () => {
  it('실제 TLS 요청/JSON와 private cookie를 다음 요청에 전달한다', async () => {
    const value = client();
    await value.refresh();
    await value.request('/identity');
    expect(inputs[1]!.cookie).toContain('__Host-transport-fixture=random');
  });
  it('클라이언트가 password/factor/current Account 전송 단계를 생략하지 않는다', async () => {
    await client().authenticate('account');
    expect(inputs.map((value) => value.path)).toContain(
      '/api/identity/challenges/factor/responses',
    );
    expect(inputs.at(-1)!.path).toBe('/api/identity');
  });
  it('코드 보관 확인이 필요하면 별도 발급/acknowledge 경로를 실행한다', async () => {
    mode = 'codes';
    await client().authenticate('account');
    expect(inputs.map((value) => value.path)).toContain(
      '/api/identity/challenges/factor/recovery-code-issues',
    );
    expect(
      inputs.find((value) => value.path.endsWith('recovery-code-acknowledgements'))!.body,
    ).toMatchObject({ stored: true, setId: 'codes' });
  });
  it('MFA 거절은 쿠키/현재 identity 성공으로 바꾸지 않는다', async () => {
    mode = 'denied';
    await expect(client().authenticate('account')).rejects.toThrow('password');
    expect(inputs.some((value) => value.path === '/api/identity')).toBe(false);
  });
  it('다른 현재 Account는 실제 인증 연결 통과가 아니다', async () => {
    mode = 'wrong-account';
    await expect(client().authenticate('account')).rejects.toThrow('identity');
  });
  it('잘못된 CA를 TLS bypass로 수용하지 않는다', async () => {
    await expect(
      new ContainerClient('customer', port, 'untrusted', { password: 'x', factor: 'x' }).request(
        '/identity',
      ),
    ).rejects.toThrow();
  });
  it('손상 JSON/4MiB 초과 응답은 전수 버퍼 성공으로 만들지 않는다', async () => {
    mode = 'invalid-json';
    await expect(client().request('/identity')).rejects.toThrow();
    mode = 'oversize';
    await expect(client().request('/identity')).rejects.toThrow('응답 한도');
  });
  it('미완료 TLS 응답은 유한 5초 조회 기한으로 중단한다', async () => {
    mode = 'no-response';
    await expect(client().request('/identity')).rejects.toThrow('기한');
  });
});
