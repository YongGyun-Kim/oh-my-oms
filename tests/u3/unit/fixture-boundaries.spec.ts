import { describe, expect, it } from 'vitest';
import { createDataSource } from '@oms/persistence';
import { assertU3DatabaseProfile, assertU3Endpoint } from '../fixtures/databases.js';
import {
  U3_DATABASES,
  u3SyntheticCredentials,
} from '../../../scripts/u3/prepare-test-databases.js';
import { SyntheticClock } from '../fixtures/clock.js';

describe('U3 로컬 합성 profile과 다른 소유자 DB 보호', () => {
  it('verification-isolated만 받으며 미설정/다른 profile은 거절한다', () => {
    expect(() => assertU3DatabaseProfile('verification-isolated')).not.toThrow();
    for (const value of ['', 'e2e-isolated', 'production', 'verification'])
      expect(() => assertU3DatabaseProfile(value)).toThrow();
  });
  const endpointCase = (url: string, kind: 'primary' | 'journal', accepted: boolean) => {
    const previous = process.env.OMS_U3_DATABASE_PROFILE;
    process.env.OMS_U3_DATABASE_PROFILE = 'verification-isolated';
    try {
      const db = createDataSource({
        url,
        applicationName: 'u3-fixture-shape',
        localSynthetic: true,
      });
      if (accepted) expect(() => assertU3Endpoint(db, kind)).not.toThrow();
      else expect(() => assertU3Endpoint(db, kind)).toThrow();
    } finally {
      if (previous === undefined) delete process.env.OMS_U3_DATABASE_PROFILE;
      else process.env.OMS_U3_DATABASE_PROFILE = previous;
    }
  };
  it('정확한 U3 primary/journal loopback·port·namespace만 초기화 대상으로 삼는다', () => {
    endpointCase(
      'postgresql://fixture:fixture@127.0.0.1:15432/' + U3_DATABASES.primary,
      'primary',
      true,
    );
    endpointCase(
      'postgresql://fixture:fixture@127.0.0.1:25432/' + U3_DATABASES.journal,
      'journal',
      true,
    );
  });
  it('U1/U2 보존 및 검증 DB 이름을 U3 namespace로 인정하지 않는다', () => {
    for (const name of ['oms_u1', 'oms_u1_verification', 'oms_u2_verification', 'oms_u3_e2e'])
      endpointCase('postgresql://fixture:fixture@127.0.0.1:15432/' + name, 'primary', false);
  });
  it('잘못된 local host/port 및 primary/journal 뒤바뀜을 거절한다', () => {
    for (const url of [
      'postgresql://fixture:fixture@localhost:15432/' + U3_DATABASES.primary,
      'postgresql://fixture:fixture@127.0.0.1:25432/' + U3_DATABASES.primary,
      'postgresql://fixture:fixture@127.0.0.1:15432/' + U3_DATABASES.journal,
    ])
      endpointCase(url, 'primary', false);
  });
  it('필수 자격 누락/추가를 거절하며 실제 원문을 검증 로그로 반환하지 않는다', () => {
    const keys = [
      'U3_PRIMARY_ADMIN_PASSWORD',
      'U3_JOURNAL_ADMIN_PASSWORD',
      'U3_APP_PASSWORD',
      'U3_JOURNAL_APPEND_PASSWORD',
      'U3_VAULT_PASSWORD',
    ];
    const bytes = keys.map((key) => key + '=synthetic').join('\n');
    expect(Object.keys(u3SyntheticCredentials(bytes)).sort()).toEqual([...keys].sort());
    expect(() =>
      u3SyntheticCredentials(
        keys
          .slice(1)
          .map((key) => key + '=synthetic')
          .join('\n'),
      ),
    ).toThrow();
    expect(() => u3SyntheticCredentials(bytes + '\nOTHER=synthetic')).toThrow();
  });
  it('fixture 시계는 실제 시간/권위로 승격되지 않고 유한 비음수 정수만 전진한다', () => {
    const clock = new SyntheticClock(),
      original = clock.now().getTime();
    clock.advance(1000);
    expect(clock.now().getTime()).toBe(original + 1000);
    for (const value of [-1, 0.5, Infinity]) expect(() => clock.advance(value)).toThrow();
  });
});
