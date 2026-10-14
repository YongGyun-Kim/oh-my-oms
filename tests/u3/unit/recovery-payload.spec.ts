import { describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator } from '@oms/contracts';
import { decodePayload, sealPayload, validateRecoveryRow } from '@oms/persistence';
import type { RecoveryPayload, RecoveryRow } from '@oms/persistence';
import { modernProduct, legacyProduct, sourceContract } from '../fixtures/models.js';

const schema = new SchemaValidator();
const current: RecoveryRow = {
  model: 'Product',
  schemaVersion: 2,
  id: 'modern-product',
  revision: 1,
  data: modernProduct(),
  deleted: false,
};
const account: RecoveryRow = {
  model: 'Account',
  schemaVersion: 1,
  id: 'legacy-account',
  revision: 1,
  data: {
    accountId: 'legacy-account',
    loginIdentifier: 'legacy-login',
    displayName: '합성 담당자',
    contactAddress: 'legacy@example.invalid',
    active: true,
    identityBasis: [],
    revision: 1,
  },
  deleted: false,
};
const security: RecoveryRow = {
  model: 'AccountSecurityState',
  schemaVersion: 1,
  id: 'u2-state',
  revision: 1,
  data: {
    securityStateId: 'u2-state',
    accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'legacy-account', revision: 1 },
    securityGeneration: 1,
    epoch: 'initial',
    revision: 1,
  },
  deleted: false,
};
const payload = (rows: RecoveryRow[], schemaVersion: 1 | 2 = 2): RecoveryPayload =>
  sealPayload({
    schemaVersion,
    ...(schemaVersion === 2 ? { sourceContract } : {}),
    epoch: 'initial',
    commitOrder: 1,
    requestId: 'r',
    correlationId: 'c',
    previousDigest: null,
    rows,
  });
describe('과거 payload1과 U3 mixed payload2의 실제 decoder', () => {
  it('U3 model2·기존 U1/U2 model1을 각 실제 버전으로 검증한다', () => {
    const body = payload([current, account, security]);
    expect(decodePayload(canonicalJson(body), schema)).toEqual(body);
    expect(body.rows.map((row) => row.schemaVersion)).toEqual([2, 1, 1]);
  });
  it('기존 payload1의 bytes/hash를 v2/현재 값으로 재작성하지 않는다', () => {
    const old = {
      ...current,
      schemaVersion: 1 as const,
      id: 'legacy-product',
      data: legacyProduct(),
    };
    const body = payload([old, account], 1),
      text = canonicalJson(body);
    expect(canonicalJson(decodePayload(text, schema))).toBe(text);
    expect(decodePayload(text, schema).contentDigest).toBe(body.contentDigest);
    expect(decodePayload(text, schema).sourceContract).toBeUndefined();
  });
  it('v1 wrapper/v1 row로 U3 current marker를 downgrade하지 못한다', () => {
    expect(() => decodePayload(canonicalJson(payload([current], 1)), schema)).toThrow();
    expect(() =>
      decodePayload(canonicalJson(payload([{ ...current, schemaVersion: 1 }])), schema),
    ).toThrow();
    expect(() => validateRecoveryRow({ ...current, schemaVersion: 1 }, schema)).toThrow();
  });
  it('v2 wrapper에는 current row 및 정확한 sourceContract가 필수다', () => {
    expect(() => decodePayload(canonicalJson(payload([account])), schema)).toThrow();
    const body = payload([current]);
    const raw = { ...body } as Partial<RecoveryPayload>;
    delete raw.sourceContract;
    expect(() => decodePayload(canonicalJson(raw), schema)).toThrow();
    expect(() =>
      decodePayload(
        canonicalJson({ ...body, sourceContract: { ...sourceContract, registryVersion: 2 } }),
        schema,
      ),
    ).toThrow();
  });
  it('기존 U1/U2와 접수 키를 현재 model2라고 추정하지 않는다', () => {
    for (const row of [account, security])
      expect(() => validateRecoveryRow({ ...row, schemaVersion: 2 }, schema)).toThrow();
    expect(() =>
      validateRecoveryRow({ ...current, data: { ...current.data, modelVersion: 1 } }, schema),
    ).toThrow();
    expect(() => validateRecoveryRow({ ...current, model: 'NotRegistered' }, schema)).toThrow();
  });
  it('nested raw secret·누락/추가 field·변조/비정규 bytes를 보호 원상으로 받지 않는다', () => {
    expect(() =>
      validateRecoveryRow(
        { ...current, data: { ...current.data, password: 'synthetic-canary' } },
        schema,
      ),
    ).toThrow();
    const body = payload([current]);
    expect(() =>
      decodePayload(canonicalJson({ ...body, contentDigest: '0'.repeat(64) }), schema),
    ).toThrow();
    expect(() => decodePayload(JSON.stringify(body, null, 2), schema)).toThrow();
    expect(() => decodePayload(canonicalJson({ ...body, extra: true }), schema)).toThrow();
    expect(() => decodePayload(canonicalJson(payload([current, current])), schema)).toThrow();
  });
});
