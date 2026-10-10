import { DataSource } from 'typeorm';
import type { EntitySchema } from 'typeorm';
import { requireCondition } from '@oms/contracts';

export interface DatabaseConnection {
  url: string;
  applicationName: string;
  ca?: string;
  localSynthetic?: boolean;
  role?:
    'api-primary' | 'api-protection' | 'worker-primary' | 'worker-protection' | 'administrative';
  protectionMaterial?: 'append' | 'vault';
}
export function createDataSource(
  connection: DatabaseConnection,
  entities: EntitySchema[] = [],
): DataSource {
  const endpoint = new URL(connection.url);
  requireCondition(
    endpoint.protocol === 'postgres:' || endpoint.protocol === 'postgresql:',
    503,
    'DB_PROTOCOL',
    'PostgreSQL 연결이 필요합니다.',
  );
  const local =
    connection.localSynthetic === true &&
    ['localhost', '127.0.0.1', 'primary', 'journal'].includes(endpoint.hostname);
  requireCondition(
    local || connection.ca,
    503,
    'DB_TLS_REQUIRED',
    '검증할 PostgreSQL 인증서가 필요합니다.',
  );
  return new DataSource({
    type: 'postgres',
    url: connection.url,
    entities,
    synchronize: false,
    logging: false,
    ssl: local ? false : { ca: connection.ca, rejectUnauthorized: true },
    extra: {
      max:
        connection.protectionMaterial === 'vault'
          ? 1
          : connection.protectionMaterial === 'append'
            ? connection.role === 'worker-protection'
              ? 2
              : 4
            : {
                'api-primary': 10,
                'api-protection': 5,
                'worker-primary': 5,
                'worker-protection': 3,
                administrative: 2,
              }[connection.role ?? 'api-primary'],
      connectionTimeoutMillis: 500,
      statement_timeout: 2000,
      lock_timeout: 500,
      ...(connection.role && connection.role !== 'administrative'
        ? { options: '-c transaction_timeout=3000', idle_in_transaction_session_timeout: 3000 }
        : {}),
      application_name: connection.applicationName,
    },
  });
}
