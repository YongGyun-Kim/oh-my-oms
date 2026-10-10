import { describe, expect, it } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import {
  U2_MODELS,
  MODELS,
  ALL_MODELS,
  modelDefinition,
  decodeU2Model,
  materialSchemas,
  validateModel,
  physicalData,
  validateU2ModelConstraints,
  u2CodeSecurityStateId,
} from '@oms/persistence';

const schema = new SchemaValidator();
describe('확인 근거의 별도 비상 운영 원본', () => {
  it('기존 일반 확인의 Account 권위와 bytes를 유지하며 운영 Ref를 기본값으로 만들지 않는다', () => {
    const data = { purpose: 'RECOVERY' };
    validateU2ModelConstraints('VerificationEvidence', data);
    expect(data).toEqual({ purpose: 'RECOVERY' });
  });
  it('비상 확인에는 별도 명시 운영 원본이 필요하다', () => {
    expect(() =>
      validateU2ModelConstraints('VerificationEvidence', { purpose: 'EMERGENCY_PRIVATE' }),
    ).toThrow();
    expect(() =>
      validateU2ModelConstraints('VerificationEvidence', {
        purpose: 'EMERGENCY_PRIVATE',
        operatorAuthorityRef: null,
      }),
    ).toThrow();
  });
  it('일반 확인은 비상 운영 Ref를 섞어서 직원 확인을 우회하지 않는다', () => {
    expect(() =>
      validateU2ModelConstraints('VerificationEvidence', {
        purpose: 'RECOVERY',
        operatorAuthorityRef: {
          owner: 'IdentityRecovery',
          entity: 'EmergencyOperatorAuthority',
          id: 'operator',
          revision: 1,
        },
      }),
    ).toThrow();
  });
});
const accountRef = {
  owner: 'IdentityRecovery',
  entity: 'Account',
  id: 'fixture-account',
  revision: 1,
};
const security = {
  securityStateId: 'fixture-security',
  revision: 1,
  accountRef,
  securityGeneration: 1,
  epoch: 'initial',
};
describe('U2 additive 모델과 원래 ID/decoder', () => {
  it('기존 MODELS versioned 목록은 보존하고 물리 schema는 추가 모델을 등록한다', () => {
    expect(MODELS).toHaveLength(43);
    expect(ALL_MODELS.length).toBe(MODELS.length + U2_MODELS.length);
    expect(materialSchemas().map((value) => value.options.name)).toContain('RecoveryHandoffGrant');
  });
  it('closed security 모델의 정확한 owner/ID를 등록한다', () => {
    expect(decodeU2Model('AccountSecurityState', 1, security, schema)).toEqual(security);
    expect(modelDefinition('Account').attributes[0]?.name).toBe('accountId');
  });
  it('code 보안 매핑은 현재 legacy 입장과 실제 발급 세대를 명시 구별하며 안정 집합 ID를 참조한다', () => {
    const row = {
      codeSecurityId: 'code-security-set',
      revision: 1,
      codeSetRef: { ...accountRef, entity: 'RecoveryCodeSet', id: 'set' },
      bindingRef: { ...accountRef, entity: 'ProviderBinding', id: 'binding' },
      securityStateRef: { ...accountRef, entity: 'AccountSecurityState', id: 'fixture-security' },
      securityGeneration: 1,
      origin: 'CURRENT_LEGACY_ADMISSION',
      establishedAt: '2026-10-10T00:00:00Z',
      epoch: 'initial',
    };
    expect(() => validateModel('RecoveryCodeSecurityState', row, schema)).not.toThrow();
    expect(() =>
      validateModel(
        'RecoveryCodeSecurityState',
        { ...row, origin: 'INFERRED_PAST_GENERATION' },
        schema,
      ),
    ).toThrow();
    expect(() =>
      validateModel('RecoveryCodeSecurityState', { ...row, securityGeneration: null }, schema),
    ).toThrow();
    expect(() =>
      schema.validate('Ref', { ...accountRef, entity: 'RecoveryCodeSecurityState' }),
    ).toThrow();
  });
  it('미등록 decoder version/model을 실패로 처리한다', () => {
    expect(() => decodeU2Model('AccountSecurityState', 2, security, schema)).toThrow();
    expect(() => decodeU2Model('Account', 1, security, schema)).toThrow();
  });
  it('추가 원문 secret/미등록 필드는 원본 저장 전에 거절한다', () => {
    expect(() =>
      validateModel('AccountSecurityState', { ...security, password: 'synthetic-canary' }, schema),
    ).toThrow();
  });
  it('필수 security generation/null/비정수 상태를 거절한다', () => {
    for (const securityGeneration of [null, 0, 1.5, '1'])
      expect(() =>
        validateModel('AccountSecurityState', { ...security, securityGeneration }, schema),
      ).toThrow();
  });
  it('다른 owner/entity를 Account FK로 연결하지 않는다', () => {
    expect(() =>
      validateModel(
        'AccountSecurityState',
        { ...security, accountRef: { ...accountRef, owner: 'EnterpriseAccess' } },
        schema,
      ),
    ).toThrow();
  });
  it('physical mapping은 원래 Ref를 유지하고 key에 stable ID를 넣는다', () => {
    expect(physicalData('AccountSecurityState', security)).toMatchObject({
      accountRef,
      accountRefKey: accountRef.id,
    });
  });
  it('최대 길이 legacy set ID도 안정 ID를 바꾸지 않고 유한 매핑 key를 가진다', () => {
    const id = 's'.repeat(128);
    expect(u2CodeSecurityStateId(id)).toHaveLength(78);
    expect(u2CodeSecurityStateId(id)).toBe(u2CodeSecurityStateId(id));
    expect(u2CodeSecurityStateId(id)).not.toBe(u2CodeSecurityStateId('other'));
  });
  it('U2 지정 근거는 명시 새 decoder로 읽으며 원래 foundation decoder를 넓히지 않는다', () => {
    const basis = {
      actorAccountRef: accountRef,
      verifiedPersonRef: null,
      evidenceRefs: [
        { owner: 'IdentityRecovery', entity: 'VerificationEvidence', id: 'evidence', revision: 1 },
      ],
      targetRevision: 1,
      decision: 'DESIGNATE',
      knowledge: 'KNOWN',
      decidedAt: '2026-10-09T00:00:00Z',
      reason: '합성 재지정',
    };
    expect(() =>
      schema.validateUri('urn:oms:contract:foundation:1#/$defs/DecisionBasisSnapshot', basis),
    ).toThrow();
    expect(() =>
      validateModel(
        'EnterpriseMembership',
        {
          membershipId: 'member',
          accountRef,
          enterpriseRef: {
            owner: 'EnterpriseAccess',
            entity: 'Enterprise',
            id: 'enterprise',
            revision: 1,
          },
          departmentRef: null,
          siteRef: null,
          active: true,
          administrator: true,
          designationBasis: basis,
          revision: 1,
        },
        schema,
      ),
    ).not.toThrow();
  });
  it('인계/claim/authority/HOLD/파기 모델에 원래 관계와 상태가 있다', () => {
    for (const name of [
      'RecoveryHandoffGrant',
      'ClaimReceipt',
      'EnrollmentAuthority',
      'EmergencyRecoveryCase',
      'AdministratorRestoration',
      'SecurityTombstone',
    ])
      expect(modelDefinition(name).attributes.map((attribute) => attribute.name)).toContain(
        'revision',
      );
    expect(
      modelDefinition('RecoveryHandoffGrant').attributes.map((attribute) => attribute.name),
    ).toEqual(
      expect.arrayContaining([
        'caseRef',
        'bindingGeneration',
        'securityGeneration',
        'attemptCount',
        'expiresAt',
        'claimReceiptRef',
      ]),
    );
  });
});
describe('U2 모델 수명/단회 경계', () => {
  const issued = Date.parse('2026-10-09T00:00:00Z'),
    grant = {
      issuedAt: new Date(issued).toISOString(),
      expiresAt: new Date(issued + 300000).toISOString(),
      attemptCount: 0,
      state: 'ISSUED',
      claimReceiptRef: null,
      codeVerifier: 'a'.repeat(64),
    };
  it('인계 수명5분과 오류5회/receipt의 닫힌 상태를 대조한다', () => {
    expect(() => validateU2ModelConstraints('RecoveryHandoffGrant', grant)).not.toThrow();
    for (const changed of [
      { expiresAt: new Date(issued + 300001).toISOString() },
      { expiresAt: new Date(issued).toISOString() },
      { attemptCount: 6 },
      { state: 'CLAIMED' },
      { state: 'EXHAUSTED', attemptCount: 4 },
    ])
      expect(() =>
        validateU2ModelConstraints('RecoveryHandoffGrant', { ...grant, ...changed }),
      ).toThrow();
    expect(() =>
      validateU2ModelConstraints('RecoveryHandoffGrant', {
        ...grant,
        state: 'EXHAUSTED',
        attemptCount: 5,
      }),
    ).not.toThrow();
  });
  it('초대 수명7일은 재발송용 연장값으로 바뀌지 않는다', () => {
    const invitation = {
      issuedAt: new Date(issued).toISOString(),
      expiresAt: new Date(issued + 7 * 86400000).toISOString(),
      tokenVerifier: 'b'.repeat(64),
    };
    expect(() => validateU2ModelConstraints('MembershipInvitation', invitation)).not.toThrow();
    expect(() =>
      validateU2ModelConstraints('MembershipInvitation', {
        ...invitation,
        expiresAt: new Date(issued + 8 * 86400000).toISOString(),
      }),
    ).toThrow();
  });
});
