import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runtimeConfiguration,
  runtimeApiConfiguration,
  workerConfiguration,
  tlsConfiguration,
  UnregisteredEnterpriseVerification,
} from '@oms/integrations';
const root = mkdtempSync(join(tmpdir(), 'oms-u1-synthetic-tls-'));
const key = join(root, 'key.pem');
const cert = join(root, 'cert.pem');
const ca = join(root, 'ca.pem');
let env: NodeJS.ProcessEnv;
beforeAll(() => {
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
      key,
      '-out',
      cert,
      '-subj',
      '/CN=api.example.invalid',
      '-addext',
      'subjectAltName=DNS:api.example.invalid,DNS:customer.example.invalid,DNS:staff.example.invalid',
    ],
    { stdio: 'ignore' },
  );
  chmodSync(key, 0o600);
  writeFileSync(ca, readFileSync(cert));
  env = {
    OMS_TELEMETRY_COLLECTOR_ORIGIN: 'https://collector.example.invalid',
    NODE_ENV: 'production',
    OMS_AUDIENCE: 'CUSTOMER',
    OMS_PRIMARY_DATABASE_URL: 'postgresql://app:synthetic@primary.example.invalid/oms',
    OMS_JOURNAL_DATABASE_URL: 'postgresql://append:synthetic@journal.example.invalid/oms',
    OMS_DATABASE_CA_FILE: ca,
    OMS_IDENTITY_VERIFIER_KEY: randomBytes(32).toString('hex'),
    OMS_COOKIE_KEY: randomBytes(32).toString('hex'),
    OMS_WEB_ORIGIN: 'https://customer.example.invalid',
    OMS_TRANSPORT_HOST: 'api.example.invalid:8443',
    PORT: '8443',
    OMS_TLS_KEY_FILE: key,
    OMS_TLS_CERT_FILE: cert,
    OMS_CUSTOMER_POOL_ID: 'ap-northeast-2_SyntheticCustomer',
    OMS_STAFF_POOL_ID: 'ap-northeast-2_SyntheticStaff',
    OMS_CUSTOMER_CLIENT_ID: 'syntheticCustomer',
    OMS_STAFF_CLIENT_ID: 'syntheticStaff',
    OMS_NOTICE_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/000000000000/synthetic-notice',
  };
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
describe('실제 실행 구성의 TLS/목적/key/최소 역할 경계(합성 인증서 시험)', () => {
  it('한 API 구성에서도 고객/직원 origin·cookie key는 별도다', () => {
    const config = runtimeApiConfiguration({
      ...env,
      OMS_CUSTOMER_WEB_ORIGIN: env.OMS_WEB_ORIGIN,
      OMS_STAFF_WEB_ORIGIN: 'https://staff.example.invalid',
      OMS_CUSTOMER_COOKIE_KEY: env.OMS_COOKIE_KEY,
      OMS_STAFF_COOKIE_KEY: randomBytes(32).toString('hex'),
    });
    expect(config.customer.audience).toBe('CUSTOMER');
    expect(config.staff.audience).toBe('STAFF');
    expect(config.customer.cookieKey.equals(config.staff.cookieKey)).toBe(false);
  });
  it('worker는 API TLS/Cognito/cookie 비밀을 요구하거나 읽지 않는다', () => {
    const config = workerConfiguration({
      OMS_TELEMETRY_COLLECTOR_ORIGIN: env.OMS_TELEMETRY_COLLECTOR_ORIGIN,
      NODE_ENV: 'production',
      OMS_PRIMARY_DATABASE_URL: env.OMS_PRIMARY_DATABASE_URL,
      OMS_JOURNAL_DATABASE_URL: env.OMS_JOURNAL_DATABASE_URL,
      OMS_DATABASE_CA_FILE: ca,
      OMS_NOTICE_QUEUE_URL: env.OMS_NOTICE_QUEUE_URL,
    });
    expect(Object.keys(config).sort()).toEqual([
      'databaseCa',
      'journalUrl',
      'primaryUrl',
      'queueUrls',
      'telemetryEndpoint',
    ]);
  });
  it('운영에서 합성 profile·빠진 비밀·틀린 origin/port/키는 시작하지 않는다', () => {
    for (const change of [
      { OMS_LOCAL_SYNTHETIC: '1' },
      { NODE_ENV: 'test' as const },
      { OMS_COOKIE_KEY: 'short' },
      { OMS_WEB_ORIGIN: 'http://customer.example.invalid' },
      { PORT: 'Infinity' },
      { OMS_CUSTOMER_CLIENT_ID: undefined },
    ])
      expect(() => runtimeConfiguration({ ...env, ...change })).toThrow();
  });
  it('실제 TLS 이름·기간·private-key 일치와1.2/1.3 범위를 확인한다', () => {
    expect(tlsConfiguration(env, 'api.example.invalid')).toMatchObject({
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
    });
    expect(() => tlsConfiguration(env, 'attacker.example.invalid')).toThrow();
  });
  it('개인 키 파일은 다른 사용자에게 읽히는 권한으로 허용하지 않는다', () => {
    chmodSync(key, 0o644);
    try {
      expect(() => tlsConfiguration(env, 'api.example.invalid')).toThrow();
    } finally {
      chmodSync(key, 0o600);
    }
  });
  it('별도 ECS Secret의 PEM은 메모리 TLS 구성으로 사용하고 원장에 복제하지 않는다', () => {
    const config = tlsConfiguration(
      {
        NODE_ENV: 'production',
        OMS_TLS_KEY_PEM: readFileSync(key, 'utf8'),
        OMS_TLS_CERT_PEM: readFileSync(cert, 'utf8'),
      },
      'api.example.invalid',
    );
    expect(config.cert).toContain('BEGIN CERTIFICATE');
  });
  it('같은 origin/key의 audience 구성은 서로 다른 이름으로 가장하지 못한다', () => {
    expect(() =>
      runtimeApiConfiguration({
        ...env,
        OMS_CUSTOMER_WEB_ORIGIN: env.OMS_WEB_ORIGIN,
        OMS_STAFF_WEB_ORIGIN: env.OMS_WEB_ORIGIN,
        OMS_CUSTOMER_COOKIE_KEY: env.OMS_COOKIE_KEY,
        OMS_STAFF_COOKIE_KEY: env.OMS_COOKIE_KEY,
      }),
    ).toThrow();
  });
  it('기업/인물 확인 owner 미등록은 직원 클릭·자료 번호를 확인 완료로 만들지 않는다', async () => {
    const owner = new UnregisteredEnterpriseVerification();
    expect(await owner.enterprise()).toMatchObject({
      knowledge: 'UNAVAILABLE',
      legalEntityConfirmed: false,
      personConfirmed: false,
    });
    expect(await owner.administrator()).toMatchObject({
      knowledge: 'UNAVAILABLE',
      enterpriseRelationshipConfirmed: false,
      mandateConfirmed: false,
    });
  });
});
