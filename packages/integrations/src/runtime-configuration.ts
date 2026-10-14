import { readFileSync } from 'node:fs';
import { requireCondition } from '@oms/contracts';
import { collectorEndpoint } from './telemetry-policy.js';
import { tlsConfiguration } from './tls-configuration.js';
import type { CognitoConfiguration } from './cognito.js';
const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key];
  requireCondition(
    value && value.length <= 65536,
    503,
    'RUNTIME_CONFIGURATION_REQUIRED',
    '서버 실행 구성과 실제 준비 근거를 확인하세요.',
  );
  return value;
};
export interface RuntimeConfiguration {
  audience: 'CUSTOMER' | 'STAFF';
  primaryUrl: string;
  journalUrl: string;
  databaseCa: string;
  verifierKey: Buffer;
  cookieKey: Buffer;
  origin: string;
  transportHost: string;
  port: number;
  tls: { key: string; cert: string };
  cognito: CognitoConfiguration;
  queueUrls: Record<string, string>;
  telemetryEndpoint: string;
}
export interface WorkerConfiguration extends Pick<
  RuntimeConfiguration,
  'primaryUrl' | 'journalUrl' | 'databaseCa' | 'queueUrls' | 'telemetryEndpoint'
> {
  vaultUrl: string;
  vaultKey: Buffer;
  vaultKeyVersion: string;
  purposeVerifierKey: Buffer;
  purposeVerifierVersion: string;
  cognito: CognitoConfiguration;
}
export function u2WorkerConfiguration(env: NodeJS.ProcessEnv): WorkerConfiguration {
  requireCondition(
    env.NODE_ENV === 'production' && !env.OMS_LOCAL_SYNTHETIC && !env.OMS_U1_SYNTHETIC_PROFILE,
    503,
    'PRODUCTION_PROFILE_REQUIRED',
    '운영 worker에는 실제 실행 profile이 필요합니다.',
  );
  const secret = (name: string) => {
    const value = required(env, name);
    requireCondition(
      /^[a-f0-9]{64}$/.test(value),
      503,
      'CRYPTO_KEY_CONFIGURATION',
      '별도 서버 목적 키가 필요합니다.',
    );
    return Buffer.from(value, 'hex');
  };
  const purposeVerifierKey = secret('OMS_U2_PURPOSE_VERIFIER_KEY'),
    vaultKey = secret('OMS_U2_VAULT_KEY');
  requireCondition(
    !purposeVerifierKey.equals(vaultKey),
    503,
    'U2_KEY_SEPARATION',
    '목적 검증과 암호 자료 키는 분리해야 합니다.',
  );
  const version = (name: string) => {
    const value = required(env, name);
    requireCondition(
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value),
      503,
      'U2_KEY_VERSION',
      '명시 현재 키 버전이 필요합니다.',
    );
    return value;
  };
  const pool = (name: string) => ({
    poolId: required(env, 'OMS_' + name + '_POOL_ID'),
    clientId: required(env, 'OMS_' + name + '_CLIENT_ID'),
    clientSecret: env['OMS_' + name + '_CLIENT_SECRET'] ?? null,
  });
  return {
    primaryUrl: required(env, 'OMS_PRIMARY_DATABASE_URL'),
    journalUrl: required(env, 'OMS_JOURNAL_DATABASE_URL'),
    databaseCa: readFileSync(required(env, 'OMS_DATABASE_CA_FILE'), 'utf8'),
    queueUrls: {
      'u1-in-app-notice': required(env, 'OMS_NOTICE_QUEUE_URL'),
      'u2-identity': required(env, 'OMS_IDENTITY_QUEUE_URL'),
      'u2-handoff-delivery': required(env, 'OMS_HANDOFF_QUEUE_URL'),
      'u2-invitation-delivery': required(env, 'OMS_INVITATION_QUEUE_URL'),
    },
    vaultUrl: required(env, 'OMS_U2_VAULT_DATABASE_URL'),
    vaultKey,
    vaultKeyVersion: version('OMS_U2_VAULT_KEY_VERSION'),
    purposeVerifierKey,
    purposeVerifierVersion: version('OMS_U2_PURPOSE_VERIFIER_KEY_VERSION'),
    cognito: {
      region: 'ap-northeast-2',
      pools: { CUSTOMER: pool('CUSTOMER'), STAFF: pool('STAFF') },
    },
    telemetryEndpoint: collectorEndpoint(required(env, 'OMS_TELEMETRY_COLLECTOR_ORIGIN'), false),
  };
}
// Preserve the U1 worker's explicit legacy decoder. Current U2 runtime uses
// u2WorkerConfiguration; a legacy payload never supplies new capabilities.
export function workerConfiguration(
  env: NodeJS.ProcessEnv,
): Pick<
  WorkerConfiguration,
  'primaryUrl' | 'journalUrl' | 'databaseCa' | 'queueUrls' | 'telemetryEndpoint'
> {
  requireCondition(
    env.NODE_ENV === 'production' && !env.OMS_LOCAL_SYNTHETIC && !env.OMS_U1_SYNTHETIC_PROFILE,
    503,
    'PRODUCTION_PROFILE_REQUIRED',
    '운영 worker에는 실제 실행 profile이 필요합니다.',
  );
  return {
    primaryUrl: required(env, 'OMS_PRIMARY_DATABASE_URL'),
    journalUrl: required(env, 'OMS_JOURNAL_DATABASE_URL'),
    databaseCa: readFileSync(required(env, 'OMS_DATABASE_CA_FILE'), 'utf8'),
    queueUrls: { 'u1-in-app-notice': required(env, 'OMS_NOTICE_QUEUE_URL') },
    telemetryEndpoint: collectorEndpoint(required(env, 'OMS_TELEMETRY_COLLECTOR_ORIGIN'), false),
  };
}
export function runtimeConfiguration(env: NodeJS.ProcessEnv): RuntimeConfiguration {
  requireCondition(
    env.NODE_ENV === 'production' && !env.OMS_LOCAL_SYNTHETIC && !env.OMS_U1_SYNTHETIC_PROFILE,
    503,
    'PRODUCTION_PROFILE_REQUIRED',
    '운영 접점에는 실제 실행 profile이 필요합니다.',
  );
  const audience = required(env, 'OMS_AUDIENCE');
  requireCondition(
    audience === 'CUSTOMER' || audience === 'STAFF',
    503,
    'AUDIENCE_CONFIGURATION',
    '별도 고객/직원 접점이 필요합니다.',
  );
  const secret = (key: string) => {
    const value = required(env, key);
    requireCondition(
      /^[a-f0-9]{64}$/.test(value),
      503,
      'CRYPTO_KEY_CONFIGURATION',
      '서버 암호 키를 확인하세요.',
    );
    return Buffer.from(value, 'hex');
  };
  const origin = required(env, 'OMS_WEB_ORIGIN');
  const parsed = new URL(origin);
  requireCondition(
    parsed.protocol === 'https:' &&
      parsed.origin === origin &&
      !parsed.username &&
      !parsed.password,
    503,
    'WEB_ORIGIN_CONFIGURATION',
    '검증된 HTTPS 업무 origin이 필요합니다.',
  );
  const port = Number(required(env, 'PORT'));
  requireCondition(
    Number.isInteger(port) && port >= 1024 && port <= 65535,
    503,
    'LISTENER_CONFIGURATION',
    '유한 서버 listener가 필요합니다.',
  );
  const pool = (name: string) => ({
    poolId: required(env, 'OMS_' + name + '_POOL_ID'),
    clientId: required(env, 'OMS_' + name + '_CLIENT_ID'),
    clientSecret: env['OMS_' + name + '_CLIENT_SECRET'] ?? null,
  });
  const queueUrls: Record<string, string> = env.OMS_NOTICE_QUEUE_URL
    ? { 'u1-in-app-notice': env.OMS_NOTICE_QUEUE_URL }
    : {};
  return {
    audience,
    primaryUrl: required(env, 'OMS_PRIMARY_DATABASE_URL'),
    journalUrl: required(env, 'OMS_JOURNAL_DATABASE_URL'),
    databaseCa: readFileSync(required(env, 'OMS_DATABASE_CA_FILE'), 'utf8'),
    verifierKey: secret('OMS_IDENTITY_VERIFIER_KEY'),
    cookieKey: secret('OMS_COOKIE_KEY'),
    origin,
    transportHost: required(env, 'OMS_TRANSPORT_HOST'),
    port,
    tls: tlsConfiguration(env, required(env, 'OMS_TRANSPORT_HOST').split(':')[0]!),
    cognito: {
      region: 'ap-northeast-2',
      pools: { CUSTOMER: pool('CUSTOMER'), STAFF: pool('STAFF') },
    },
    queueUrls,
    telemetryEndpoint: collectorEndpoint(required(env, 'OMS_TELEMETRY_COLLECTOR_ORIGIN'), false),
  };
}

export function runtimeApiConfiguration(env: NodeJS.ProcessEnv) {
  const customer = runtimeConfiguration({
    ...env,
    OMS_AUDIENCE: 'CUSTOMER',
    OMS_WEB_ORIGIN: required(env, 'OMS_CUSTOMER_WEB_ORIGIN'),
    OMS_COOKIE_KEY: required(env, 'OMS_CUSTOMER_COOKIE_KEY'),
  });
  const staff = runtimeConfiguration({
    ...env,
    OMS_AUDIENCE: 'STAFF',
    OMS_WEB_ORIGIN: required(env, 'OMS_STAFF_WEB_ORIGIN'),
    OMS_COOKIE_KEY: required(env, 'OMS_STAFF_COOKIE_KEY'),
  });
  requireCondition(
    customer.origin !== staff.origin && !customer.cookieKey.equals(staff.cookieKey),
    503,
    'AUDIENCE_BOUNDARY_CONFIGURATION',
    '서로 다른 고객/직원 origin과 cookie 키가 필요합니다.',
  );
  return {
    customer,
    staff,
    u2: u2RuntimeConfiguration(env, [customer.verifierKey, customer.cookieKey, staff.cookieKey]),
  };
}
export interface U2RuntimeConfiguration {
  registration: 'UNREGISTERED';
  vaultUrl: string;
  vaultKey: Buffer;
  vaultKeyVersion: string;
  purposeVerifierKey: Buffer;
  purposeVerifierVersion: string;
}
export function u2RuntimeConfiguration(
  env: NodeJS.ProcessEnv,
  otherKeys: Buffer[] = [],
): U2RuntimeConfiguration | null {
  if (env.OMS_U2_RUNTIME_PROFILE === undefined) return null; // Explicit legacy host decoder, never U2 activation.
  requireCondition(
    env.OMS_U2_RUNTIME_PROFILE === 'UNREGISTERED',
    503,
    'U2_REAL_PROFILE_UNVERIFIED',
    '미확인 실제 준비를 environment 값으로 활성화할 수 없습니다.',
  );
  const key = (name: string) => {
      const value = required(env, name);
      requireCondition(
        /^[a-f0-9]{64}$/.test(value),
        503,
        'U2_KEY_CONFIGURATION',
        '별도 U2 서버 키가 필요합니다.',
      );
      return Buffer.from(value, 'hex');
    },
    version = (name: string) => {
      const value = required(env, name);
      requireCondition(
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value),
        503,
        'U2_KEY_VERSION',
        '명시 현재 U2 키 버전이 필요합니다.',
      );
      return value;
    },
    vaultKey = key('OMS_U2_VAULT_KEY'),
    purposeVerifierKey = key('OMS_U2_PURPOSE_VERIFIER_KEY');
  requireCondition(
    !vaultKey.equals(purposeVerifierKey) &&
      otherKeys.every((k) => !k.equals(vaultKey) && !k.equals(purposeVerifierKey)),
    503,
    'U2_KEY_SEPARATION',
    'identity/cookie/purpose/vault 키의 목적 분리가 필요합니다.',
  );
  return {
    registration: 'UNREGISTERED',
    vaultUrl: required(env, 'OMS_U2_VAULT_DATABASE_URL'),
    vaultKey,
    vaultKeyVersion: version('OMS_U2_VAULT_KEY_VERSION'),
    purposeVerifierKey,
    purposeVerifierVersion: version('OMS_U2_PURPOSE_VERIFIER_KEY_VERSION'),
  };
}
