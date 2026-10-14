import { readFileSync } from 'node:fs';
import { createDataSource, migrateDiagnosticView } from '@oms/persistence';
import type { DataSource } from 'typeorm';
import { parseSyntheticCredentials } from '../../../scripts/u2/prepare-test-databases.js';
import { U3_DATABASES } from '../../../scripts/u3/prepare-test-databases.js';
import { assertU3DatabaseProfile, assertU3Endpoint } from './databases.js';

// 기존 로컬 U1 읽기 전용 login을 U3 합성 DB metadata view에만 연결한다.
// token/자격은 반환·로그·새 파일로 기록하지 않는다. 운영 구성의 증거가 아니다.
export function u3DiagnosticSource(): DataSource {
  assertU3DatabaseProfile();
  const credentials = parseSyntheticCredentials(
    readFileSync('.runtime/u1/test-databases.env', 'utf8'),
  );
  if (!credentials.U1_DIAGNOSTIC_PASSWORD)
    throw new Error('기존 로컬 읽기 전용 검증 자격이 필요합니다.');
  const source = createDataSource({
    url:
      'postgresql://u1_verify_diagnostic_reader:' +
      encodeURIComponent(credentials.U1_DIAGNOSTIC_PASSWORD) +
      '@127.0.0.1:15432/' +
      U3_DATABASES.primary,
    applicationName: 'u3-readonly-diagnostic',
    localSynthetic: true,
    role: 'api-primary',
  });
  assertU3Endpoint(source, 'primary');
  return source;
}
export async function prepareU3DiagnosticView(primary: DataSource): Promise<void> {
  assertU3Endpoint(primary, 'primary');
  await migrateDiagnosticView(primary);
  await primary.query(
    'GRANT USAGE ON SCHEMA public TO u1_diagnostic_reader; GRANT SELECT ON u1_diagnostic_metadata TO u1_diagnostic_reader',
  );
}
