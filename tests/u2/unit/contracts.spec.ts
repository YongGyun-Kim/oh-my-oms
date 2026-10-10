import { describe, expect, it } from 'vitest';
import {
  SchemaValidator,
  declareU2Operations,
  declareFoundationOperations,
  OperationRegistry,
  U2_PROFILE,
} from '@oms/contracts';
import type { ScopeV2 } from '@oms/contracts';

const ref = (entity: string, owner = 'EnterpriseAccess') => ({
  owner,
  entity,
  id: entity + '-fixture',
  revision: 1,
});
const schema = new SchemaValidator();
const validate = (name: string, value: unknown) =>
  schema.validateUri(U2_PROFILE + '#/$defs/' + name, value);
const scope: ScopeV2 = {
  enterpriseRef: ref('Enterprise'),
  action: 'order.submit',
  kind: 'DEPARTMENT_SITE',
  departmentSelector: { kind: 'EXACT', ref: ref('Department') },
  siteSelector: { kind: 'EXACT', ref: ref('BusinessSite') },
  sourcePolicyRevision: 1,
};
describe('U2 작업 봉투의 별도 닫힌 profile', () => {
  const work = {
    workId: 'work',
    requestId: 'request',
    owner: 'IdentityRecovery',
    operationId: 'IdentityRecovery.deliverHandoff',
    targetRef: ref('RecoveryHandoffGrant', 'IdentityRecovery'),
    sourceFactRef: ref('FactEnvelope', 'U1Host'),
    executionPermitRef: ref('ExecutionPermit', 'EnterpriseAccess'),
    expectedRevision: 1,
    notBefore: '2026-10-10T00:00:00Z',
    deadlineAt: '2026-10-10T00:05:00Z',
    attempt: 0,
    correlationId: 'trace',
  };
  it('원래 operation/owner/대상과 정확한 metadata만 U2에서 읽는다', () =>
    expect(validate('U2Work', work)).toEqual(work));
  it('새 봉투를 구형 Work validator에 주입하지 않는다', () =>
    expect(() => schema.validate('Work', work)).toThrow());
  it('미등록 operation이나 null target/expected revision은 추측하지 않는다', () => {
    for (const change of [
      { operationId: 'IdentityRecovery.other' },
      { targetRef: null },
      { expectedRevision: null },
    ])
      expect(() => validate('U2Work', { ...work, ...change })).toThrow();
  });
  it('다른 소유자/Case와 Grant의 혼합 target은 거절한다', () => {
    for (const change of [
      { owner: 'EnterpriseAccess' },
      { targetRef: ref('RecoveryCase', 'IdentityRecovery') },
      { targetRef: ref('RecoveryHandoffGrant', 'EnterpriseAccess') },
    ])
      expect(() => validate('U2Work', { ...work, ...change })).toThrow();
  });
  it('추가 비밀/epoch/system 필드를 큐 body에 넣지 못한다', () => {
    for (const change of [{ code: 'private' }, { system: true }, { epoch: 'untrusted' }])
      expect(() => validate('U2Work', { ...work, ...change })).toThrow();
  });
});

describe('U2 별도 closed profile와 기존 계약의 병행', () => {
  it('EXACT 한 쌍과 등록된 행위를 받는다', () => expect(validate('ScopeV2', scope)).toEqual(scope));
  it('빈 배열/추가 role/system 필드로 wildcard를 만들지 못한다', () => {
    for (const extra of [{ role: 'admin' }, { departmentRefs: [] }, { system: true }])
      expect(() => validate('ScopeV2', { ...scope, ...extra })).toThrow();
  });
  it('kind별 ALL/EXACT/NOT_USED 조합을 고정한다', () => {
    expect(() => validate('ScopeV2', { ...scope, siteSelector: { kind: 'ALL' } })).toThrow();
    expect(
      validate('ScopeV2', {
        ...scope,
        kind: 'SITE_ALL_DEPARTMENTS',
        departmentSelector: { kind: 'ALL' },
      }),
    ).toBeTruthy();
    expect(() =>
      validate('ScopeV2', {
        ...scope,
        kind: 'SITE_ALL_DEPARTMENTS',
        siteSelector: { kind: 'NOT_USED' },
      }),
    ).toThrow();
  });
  it('EXACT에는 Ref가 필수이고 NOT_USED/ALL에는 Ref가 금지다', () => {
    for (const selector of [
      { kind: 'EXACT' },
      { kind: 'NOT_USED', ref: ref('Department') },
      { kind: 'ALL', ref: ref('Department') },
    ])
      expect(() => validate('AxisSelector', selector)).toThrow();
  });
  it('누락 policy revision·미등록 행위·잘못된 enum을 거절한다', () => {
    for (const partial of [
      { sourcePolicyRevision: null },
      { action: 'staff.role.manage' },
      { kind: 'WILDCARD' },
    ])
      expect(() => validate('ScopeV2', { ...scope, ...partial })).toThrow();
  });
  it('인계 code와 party secret은 정확한 정규 형식만 받는다', () => {
    const data = {
      meta: {
        clientRequestId: 'fixture-request',
        expectedRevision: 1,
        reason: '합성',
        evidenceRefs: [],
      },
      grantRef: ref('RecoveryHandoffGrant', 'IdentityRecovery'),
      caseRef: ref('RecoveryCase', 'IdentityRecovery'),
      challengeId: 'fixture-challenge',
      code: 'A'.repeat(16),
      partySecret: 'A'.repeat(43),
    };
    expect(validate('ClaimHandoffInput', data)).toEqual(data);
    expect(() => validate('ClaimHandoffInput', { ...data, partySecret: 'B'.repeat(43) })).toThrow();
    expect(() =>
      validate('ClaimHandoffInput', { ...data, grantRef: ref('Account', 'IdentityRecovery') }),
    ).toThrow();
    for (const code of ['1', ' A'.repeat(8), 'A'.repeat(17)])
      expect(() => validate('ClaimHandoffInput', { ...data, code })).toThrow();
  });
  it('새 목적을 기존 common 제한 purpose enum에 주입하지 않는다', () => {
    const old = {
      audience: 'CUSTOMER',
      correlationId: 'trace',
      deadlineAt: '2026-10-09T00:00:00Z',
      subjectAccountRef: ref('Account', 'IdentityRecovery'),
      challengeId: 'challenge',
      purpose: 'INVITATION_ACCEPTANCE',
      verificationBasisRefs: [],
    };
    expect(() => schema.validate('LimitedIdentityContext', old)).toThrow();
  });
  it('추가 operation version1과 기존 version2는 별도 등록하며 미등록 binding은 실패다', async () => {
    const registry = new OperationRegistry(schema);
    declareFoundationOperations(registry);
    declareU2Operations(registry);
    expect(registry.lookup('EnterpriseAccess', 'acceptMembershipInvitation', 1).contract).toBe(
      'u2-access-additions',
    );
    expect(registry.lookup('EnterpriseAccess', 'defineCustomerRole', 2).version).toBe(2);
    expect(() => registry.lookup('EnterpriseAccess', 'acceptMembershipInvitation', 2)).toThrow();
    const targetSchema = registry.lookup(
      'EnterpriseAccess',
      'acceptMembershipInvitation',
      1,
    ).targetSchema!;
    expect(() =>
      schema.validateSchema(targetSchema, {
        kind: 'RECORD',
        recordRef: ref('RecoveryHandoffGrant', 'IdentityRecovery'),
      }),
    ).toThrow();
    await expect(
      registry.invoke('EnterpriseAccess', 'acceptMembershipInvitation', 1, {
        context: {
          attemptId: 'attempt',
          audience: 'CUSTOMER',
          correlationId: 'trace',
          deadlineAt: '2026-10-09T00:00:00Z',
        },
        target: { kind: 'NONE' },
        data: {},
      }),
    ).rejects.toMatchObject({ code: 'MODULE_NOT_REGISTERED' });
  });
});
