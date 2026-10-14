import { describe, expect, it } from 'vitest';
import { SchemaValidator, canonicalJson } from '@oms/contracts';
import {
  sealPayload,
  decodePayload,
  assertNoRawRecoverySecrets,
  RECOVERY_SECURITY_MODELS,
  u2RecoverySecurityChangeAllowed,
} from '@oms/persistence';
const data = {
  securityStateId: 'security-fixture',
  accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'account-fixture', revision: 1 },
  securityGeneration: 1,
  epoch: 'initial',
  revision: 1,
};
const payload = () =>
  sealPayload({
    schemaVersion: 1,
    epoch: 'initial',
    commitOrder: 1,
    requestId: 'request-fixture',
    correlationId: 'trace-fixture',
    previousDigest: null,
    rows: [
      {
        model: 'AccountSecurityState',
        schemaVersion: 1,
        id: data.securityStateId,
        revision: 1,
        data,
        deleted: false,
      },
    ],
  });
describe('U2 재구성은 소비/회수/UNKNOWN/파기 원본만 저장', () => {
  const schema = new SchemaValidator();
  it('닫힌 등록 after-image와 canonical digest를 복원한다', () =>
    expect(decodePayload(canonicalJson(payload()), schema).rows[0]?.data).toEqual(data));
  it('원문 비밀은 nested/array 어디에도 허용되지 않는다', () => {
    for (const key of [
      'password',
      'totp',
      'code',
      'secret',
      'partySecret',
      'rawToken',
      'providerSession',
      'ciphertext',
    ])
      expect(() =>
        assertNoRawRecoverySecrets({ nested: [{ [key]: 'synthetic-canary' }] }),
      ).toThrow();
  });
  it('정당한 verifier/참조/소비 marker는 원문으로 오인하지 않는다', () =>
    expect(() =>
      assertNoRawRecoverySecrets({
        codeVerifier: 'a'.repeat(64),
        handleVerifier: 'b'.repeat(64),
        attemptCount: 5,
        state: 'EXHAUSTED',
      }),
    ).not.toThrow());
  it('duplicate after-image/변조 digest는 거절한다', () => {
    const p = payload();
    expect(() => decodePayload(canonicalJson({ ...p, commitOrder: 2 }), schema)).toThrow();
    expect(() =>
      decodePayload(canonicalJson(sealPayload({ ...p, rows: [...p.rows, ...p.rows] })), schema),
    ).toThrow();
  });
  it('세대/receipt/5실패/파기/UNKNOWN을 모두 현재 보안 oracle 범위에 포함한다', () => {
    for (const model of [
      'AccountSecurityState',
      'RecoveryHandoffGrant',
      'ClaimReceipt',
      'EnrollmentAuthority',
      'SecurityTombstone',
      'IdentityOperationResult',
      'IdentityExecutionSlot',
    ])
      expect(RECOVERY_SECURITY_MODELS).toContain(model);
  });
  it('세대 감소/종료 grant 부활은 restore 시 거절한다', () => {
    expect(
      u2RecoverySecurityChangeAllowed(
        'AccountSecurityState',
        { ...data, securityGeneration: 2 },
        data,
      ),
    ).toBe(false);
    expect(
      u2RecoverySecurityChangeAllowed(
        'RecoveryHandoffGrant',
        { state: 'EXHAUSTED', attemptCount: 5 },
        { state: 'ISSUED', attemptCount: 0 },
      ),
    ).toBe(false);
  });
  it('5실패 증가·회수만 허용하고 계정/목적 교체는 불가다', () => {
    const before = { state: 'ISSUED', attemptCount: 4, caseRef: 'original' },
      after = { ...before, state: 'EXHAUSTED', attemptCount: 5 };
    expect(u2RecoverySecurityChangeAllowed('RecoveryHandoffGrant', before, after)).toBe(true);
    expect(
      u2RecoverySecurityChangeAllowed('RecoveryHandoffGrant', before, {
        ...after,
        caseRef: 'other',
      }),
    ).toBe(false);
  });
  it('UNKNOWN 슬롯/provider 결과/tombstone은 인증 복원으로 지우거나 종료하지 않는다', () => {
    for (const model of ['IdentityOperationResult', 'IdentityExecutionSlot', 'SecurityTombstone'])
      expect(
        u2RecoverySecurityChangeAllowed(
          model,
          { state: 'UNKNOWN', revision: 1 },
          { state: 'CLOSED', revision: 2 },
        ),
      ).toBe(false);
  });
});
