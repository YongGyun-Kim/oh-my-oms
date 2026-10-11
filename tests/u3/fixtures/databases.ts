import { readFileSync } from 'node:fs';
import { createDataSource, materialSchemas } from '@oms/persistence';
import type { DataSource } from 'typeorm';
import {
  U3_DATABASES,
  u3SyntheticCredentials,
} from '../../../scripts/u3/prepare-test-databases.js';

export function assertU3DatabaseProfile(value = process.env.OMS_U3_DATABASE_PROFILE): void {
  if (value !== 'verification-isolated')
    throw new Error('명시적인 verification-isolated U3 합성 DB profile이 필요합니다.');
}
export function assertU3Endpoint(source: DataSource, kind: 'primary' | 'journal'): void {
  assertU3DatabaseProfile();
  if (source.options.type !== 'postgres' || !source.options.url)
    throw new Error('U3 합성 PostgreSQL만 허용합니다.');
  const url = new URL(source.options.url);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== (kind === 'primary' ? '15432' : '25432') ||
    url.pathname !== '/' + U3_DATABASES[kind] ||
    source.options.synchronize !== false
  )
    throw new Error('다른 DB 또는 자동 synchronize는 허용하지 않습니다.');
}
export function u3Sources(role: 'api' | 'worker' = 'api') {
  assertU3DatabaseProfile();
  const c = u3SyntheticCredentials(readFileSync('.runtime/u3/test-databases.env', 'utf8'));
  const source = (user: string, key: string, kind: 'primary' | 'journal', models = false) => {
    const db = createDataSource(
      {
        url:
          'postgresql://' +
          user +
          ':' +
          encodeURIComponent(c[key]!) +
          '@127.0.0.1:' +
          (kind === 'primary' ? '15432' : '25432') +
          '/' +
          U3_DATABASES[kind],
        applicationName: 'u3-synthetic-verification',
        localSynthetic: true,
        role: user.endsWith('admin')
          ? 'administrative'
          : kind === 'primary'
            ? role === 'api'
              ? 'api-primary'
              : 'worker-primary'
            : role === 'api'
              ? 'api-protection'
              : 'worker-protection',
        protectionMaterial:
          user === 'u3_verify_vault'
            ? 'vault'
            : user === 'u3_verify_journal_append'
              ? 'append'
              : undefined,
      },
      models ? materialSchemas() : [],
    );
    assertU3Endpoint(db, kind);
    return db;
  };
  return {
    primaryAdmin: source('u1_primary_admin', 'U3_PRIMARY_ADMIN_PASSWORD', 'primary', true),
    journalAdmin: source('u1_journal_admin', 'U3_JOURNAL_ADMIN_PASSWORD', 'journal'),
    primaryApp: source('u3_verify_app', 'U3_APP_PASSWORD', 'primary', true),
    journalAppend: source('u3_verify_journal_append', 'U3_JOURNAL_APPEND_PASSWORD', 'journal'),
    vault: source('u3_verify_vault', 'U3_VAULT_PASSWORD', 'journal'),
  };
}
