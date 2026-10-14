import { describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator } from '@oms/contracts';
import { decodePayload, sealPayload, validateRecoveryRow } from '@oms/persistence';
import type { RecoveryRow } from '@oms/persistence';
const schema = new SchemaValidator();
const data = {
  accountId: 'person',
  loginIdentifier: 'synthetic@example.invalid',
  displayName: '합성',
  contactAddress: 'synthetic@example.invalid',
  active: true,
  identityBasis: [],
  revision: 1,
};
const row: RecoveryRow = {
  model: 'Account',
  id: 'person',
  revision: 1,
  schemaVersion: 1,
  data,
  deleted: false,
};
function payload(rows = [row]) {
  return sealPayload({
    schemaVersion: 1,
    epoch: 'initial',
    commitOrder: 1,
    requestId: 'request',
    correlationId: 'correlation',
    rows,
    previousDigest: null,
  });
}
describe('완전 복구 자료 디코더', () => {
  it('등록 원본 after-image와 내용 해시를 검증한다', () =>
    expect(decodePayload(canonicalJson(payload()), schema)).toEqual(payload()));
  it('정규 JSON 이외 공백/키 순서는 거절한다', () =>
    expect(() => decodePayload(JSON.stringify(payload()), schema)).toThrow());
  it('해시가 달라진 본문은 거절한다', () =>
    expect(() =>
      decodePayload(canonicalJson({ ...payload(), correlationId: 'changed' }), schema),
    ).toThrow());
  it('등록되지 않은 모델은 거절한다', () =>
    expect(() =>
      decodePayload(canonicalJson(payload([{ ...row, model: 'Unknown' }])), schema),
    ).toThrow());
  it('원본 필수 필드 또는 식별자/개정 차이는 거절한다', () => {
    expect(() =>
      decodePayload(canonicalJson(payload([{ ...row, data: { accountId: 'person' } }])), schema),
    ).toThrow();
    expect(() => validateRecoveryRow({ ...row, id: 'other' }, schema)).toThrow();
    expect(() => validateRecoveryRow({ ...row, revision: 2 }, schema)).toThrow();
  });
  it('같은 payload의 중복 원본은 거절한다', () =>
    expect(() => decodePayload(canonicalJson(payload([row, row])), schema)).toThrow());
  it('유한 크기와 빈 변경을 거절한다', () => {
    expect(() => decodePayload(' '.repeat(4194305), schema)).toThrow();
    expect(() => decodePayload(canonicalJson(payload([])), schema)).toThrow();
  });
  it('접수 키 원본 필드, audience, 해시, 식별자도 검증한다', () => {
    const key: RecoveryRow = {
      model: 'RequestKey',
      schemaVersion: 1,
      id: 'a'.repeat(64),
      revision: 1,
      deleted: false,
      data: {
        scopedKey: 'a'.repeat(64),
        requestId: 'request',
        inputFingerprint: 'b'.repeat(64),
        principalId: 'person',
        audience: 'CUSTOMER',
        owner: 'IdentityRecovery',
        operation: 'register',
        target: null,
      },
    };
    expect(() => validateRecoveryRow(key, schema)).not.toThrow();
    for (const change of [{ extra: true }, { audience: 'PUBLIC' }, { inputFingerprint: 'short' }])
      expect(() =>
        validateRecoveryRow({ ...key, data: { ...key.data, ...change } }, schema),
      ).toThrow();
    expect(() => validateRecoveryRow({ ...key, deleted: true }, schema)).toThrow();
  });
});
