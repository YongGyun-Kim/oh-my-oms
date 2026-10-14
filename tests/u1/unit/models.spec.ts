import { describe, expect, it } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import {
  MODELS,
  materialSchemas,
  modelDefinition,
  physicalData,
  primaryAttribute,
  tableName,
  validateModel,
  createDataSource,
} from '@oms/persistence';

const schema = new SchemaValidator();
const account = {
  accountId: 'synthetic-account',
  loginIdentifier: 'synthetic-login',
  displayName: '합성 담당자',
  contactAddress: 'synthetic@example.invalid',
  active: true,
  identityBasis: [],
  revision: 1,
};
describe('등록된 TypeORM 원본 모델', () => {
  it('43개 원본과 owner별 이력을 실제 EntitySchema로 연결한다', () => {
    expect(MODELS).toHaveLength(43);
    expect(materialSchemas().map((x) => x.options.name)).toContain('OrderHistory');
    expect(materialSchemas().map((x) => x.options.name)).not.toContain('OwnerHistoryEntry');
  });
  it('계정 required/개정/원본 ID를 보존한다', () => {
    expect(validateModel('Account', account, schema)).toEqual(account);
    expect(primaryAttribute(modelDefinition('Account')).name).toBe('accountId');
    expect(tableName('EnterpriseMembership')).toBe('u1_enterprise_membership');
  });
  it('누락/미등록 field와 잘못된 개정을 거절한다', () => {
    expect(() => validateModel('Account', { ...account, accountId: undefined }, schema)).toThrow();
    expect(() => validateModel('Account', { ...account, isAdmin: true }, schema)).toThrow();
    expect(() => validateModel('Account', { ...account, revision: 0 }, schema)).toThrow();
  });
  it('필수NULL과 boolean coercion을 허용하지 않는다', () => {
    expect(() => validateModel('Account', { ...account, active: 'true' }, schema)).toThrow();
    expect(() => validateModel('Account', { ...account, identityBasis: null }, schema)).toThrow();
  });
  it('없는 모델/PK를 조용히 생성하지 않는다', () => {
    expect(() => modelDefinition('Unknown')).toThrow();
    expect(() =>
      primaryAttribute({ name: 'Bad', owner: 'Bad', attributes: [], constraints: [] }),
    ).toThrow();
  });
  it('외래 원본의 안정키를 별도 FK 열에 연결한다', () => {
    const value = {
      accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'account-a', revision: 1 },
      enterpriseRef: {
        owner: 'EnterpriseAccess',
        entity: 'Enterprise',
        id: 'enterprise-a',
        revision: 1,
      },
      departmentRef: null,
      siteRef: null,
    };
    expect(physicalData('EnterpriseMembership', value)).toMatchObject({
      accountRefKey: 'account-a',
      enterpriseRefKey: 'enterprise-a',
      departmentRefKey: null,
      siteRefKey: null,
    });
  });
  it('Receipt/Work의 원래 correlation과 세션 binding·epoch 확장을 등록한다', () => {
    expect(
      modelDefinition('RequestReceipt').attributes.some((a) => a.name === 'correlationId'),
    ).toBe(true);
    expect(modelDefinition('WorkItem').attributes.some((a) => a.name === 'correlationId')).toBe(
      true,
    );
    expect(
      modelDefinition('IdentitySession').attributes.some((a) => a.name === 'recoveryEpoch'),
    ).toBe(true);
  });
  it('참조 payload의 unknown field를 거절한다', () => {
    expect(() =>
      validateModel(
        'Account',
        {
          ...account,
          identityBasis: [
            {
              owner: 'IdentityRecovery',
              entity: 'IdentityHistory',
              id: 'proof',
              revision: 1,
              password: 'canary',
            },
          ],
        },
        schema,
      ),
    ).toThrow();
  });
});
describe('PostgreSQL 연결 구성 경계', () => {
  it('운영 연결의 인증서 검증·유한 pool/timeout을 고정한다', () => {
    const source = createDataSource({
      url: 'postgresql://user:placeholder@database.example.invalid/oms',
      applicationName: 'u1-test',
      ca: 'synthetic-ca',
      role: 'api-primary',
    });
    expect(source.options).toMatchObject({
      synchronize: false,
      logging: false,
      ssl: { rejectUnauthorized: true },
      extra: {
        max: 10,
        connectionTimeoutMillis: 500,
        statement_timeout: 2000,
        lock_timeout: 500,
        options: '-c transaction_timeout=3000',
        idle_in_transaction_session_timeout: 3000,
      },
    });
  });
  it('PostgreSQL 외 protocol을 거절한다', () => {
    expect(() =>
      createDataSource({
        url: 'mysql://127.0.0.1/db',
        applicationName: 'test',
        localSynthetic: true,
      }),
    ).toThrow();
  });
  it('운영 연결의 TLS 누락을 거절한다', () => {
    expect(() =>
      createDataSource({
        url: 'postgresql://database.example.invalid/oms',
        applicationName: 'test',
      }),
    ).toThrow();
  });
  it('원격 서버에 localSynthetic으로 TLS를 생략하지 못한다', () => {
    expect(() =>
      createDataSource({
        url: 'postgresql://database.example.invalid/oms',
        applicationName: 'test',
        localSynthetic: true,
      }),
    ).toThrow();
  });
  it('localhost도 합성 설정의 명시값 없이 TLS를 생략하지 못한다', () => {
    expect(() =>
      createDataSource({ url: 'postgresql://127.0.0.1/oms', applicationName: 'test' }),
    ).toThrow();
  });
  it('명시적 로컬 합성 연결만 비TLS fixture로 사용한다', () => {
    const source = createDataSource({
      url: 'postgresql://127.0.0.1/oms',
      applicationName: 'test',
      localSynthetic: true,
    });
    expect(source.options).toMatchObject({ ssl: false });
  });
});
