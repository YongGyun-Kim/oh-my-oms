import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  OperationRegistry,
  SchemaValidator,
  U3_PROFILE,
  U4_PROFILE,
  declareU4Operations,
} from '@oms/contracts';
import type { Invocation } from '@oms/contracts';
import {
  decodePayload,
  decodeU3SupportModel,
  decodeU4Model,
  rowModelVersion,
  sealPayload,
  U4_SOURCE_CONTRACT,
  validateModel,
  registeredRecoveryObservationProfile,
  validateRecoverySecurityObservation,
  recoverySecurityChangeAllowed,
} from '@oms/persistence';
import { u4Ref } from '../fixtures/contracts.js';

const schema = new SchemaValidator();
const role = () => ({
  modelVersion: 3,
  staffRoleId: 'financial-role',
  label: '금융 조회',
  actions: [],
  revision: 1,
  sourceContract: U4_SOURCE_CONTRACT,
});
const state = () => ({
  modelVersion: 3,
  roleStateId: 'financial-state',
  roleRef: null,
  staffRoleRef: u4Ref('EnterpriseAccess', 'StaffRole', 'financial-role'),
  active: true,
  scopeRefs: [],
  actions: ['financial.read'],
  revision: 1,
  sourceContract: U4_SOURCE_CONTRACT,
});
const frame = () => ({
  observationVersion: 3,
  sourceContract: U4_SOURCE_CONTRACT,
  modelVersion: 3,
  checkId: 'check',
  model: 'RoleRevisionState',
  id: 'financial-state',
  sourceOwner: 'EnterpriseAccess',
  sourceRevision: 1,
  currentData: state(),
  evidenceId: 'synthetic-proof',
  observedAt: '2026-12-01T00:00:00Z',
  knowledge: 'KNOWN',
});

describe('U4 명시 직원 금융 역할의 닫힌 계약·버전·복구', () => {
  it('금융 역할의 새 계약을 허용하고 구형 wire와 소유자 검증의 경계를 보존한다', () => {
    const input = {
      meta: {
        clientRequestId: 'key',
        expectedRevision: null,
        reason: '합성 정의',
        evidenceRefs: [],
      },
      label: '금융 조회',
      actions: ['financial.read'],
    };
    expect(schema.validateUri(U4_PROFILE + '#/$defs/StaffRoleInput', input)).toEqual(input);
    // 기존 common wire는 일반 문자열 목록이다. 실제 구형 생산자의 STAFF_ACTIONS 검증은 DB 통합에서 확인한다.
    expect(schema.validateUri('urn:oms:contract:common:2#/$defs/StaffRoleInput', input)).toEqual(
      input,
    );
    expect(() => schema.validateUri(U3_PROFILE + '#/$defs/StaffRoleInput', input)).toThrow();
    for (const actions of [
      [],
      ['payment.read'],
      ['financial.admin'],
      ['financial.read', 'financial.read'],
    ])
      expect(() =>
        schema.validateUri(U4_PROFILE + '#/$defs/StaffRoleInput', { ...input, actions }),
      ).toThrow();
    expect(() =>
      schema.validateUri(U4_PROFILE + '#/$defs/StaffRoleInput', { ...input, autoGrant: true }),
    ).toThrow();
  });
  it('등록4의 직원 역할과 금융 조회는 정확한 소유자·대상·audience/행위로 닫힌다', async () => {
    const registry = new OperationRegistry(schema);
    declareU4Operations(registry);
    const operation = registry.lookup('EnterpriseAccess', 'reviseStaffRole', 4);
    expect(operation).toMatchObject({
      action: 'staff.role.manage',
      audience: ['STAFF'],
      targetKind: 'RECORD',
    });
    expect(() =>
      schema.validateSchema(operation.targetSchema!, {
        kind: 'RECORD',
        recordRef: u4Ref('IdentityRecovery', 'Account'),
      }),
    ).toThrow();
    expect(() => registry.lookup('FinancialSettlement', 'defineStaffRole', 4)).toThrow();
    for (const [staffName, customerName] of [
      ['readFinancial', 'readCustomerFinancial'],
      ['listFinancial', 'listCustomerFinancial'],
      ['readFinancialHistory', 'readCustomerFinancialHistory'],
    ]) {
      expect(registry.lookup('FinancialSettlement', staffName!, 4)).toMatchObject({
        audience: ['STAFF'],
        action: 'financial.read',
      });
      expect(registry.lookup('FinancialSettlement', customerName!, 4)).toMatchObject({
        audience: ['CUSTOMER'],
        action: 'payment.read',
      });
      for (const [name, audience] of [
        [staffName, 'CUSTOMER'],
        [customerName, 'STAFF'],
      ]) {
        registry.bind('FinancialSettlement', name!, 4, async () => {
          throw new Error('허용되지 않은 handler 진입');
        });
        await expect(
          registry.invoke('FinancialSettlement', name!, 4, {
            context: { audience },
            target: { kind: 'NONE' },
            data: {},
          } as unknown as Invocation),
        ).rejects.toMatchObject({ code: 'WRONG_AUDIENCE' });
      }
    }
  });
  it('금융 전용 role3은 가짜 구형 권한을 채우지 않고 빈 legacy 투영을 보존한다', () => {
    expect(decodeU4Model('StaffRole', 3, role(), schema).actions).toEqual([]);
    expect(rowModelVersion('StaffRole', role())).toBe(3);
    expect(() =>
      decodeU3SupportModel(
        'StaffRole',
        1,
        { staffRoleId: 'old', label: 'old', actions: [], revision: 1 },
        schema,
      ),
    ).toThrow();
    expect(() => decodeU3SupportModel('StaffRole', 2, role(), schema)).toThrow();
  });
  it('상태3의 source4·직원 단일 소유와 닫힌 행위 목록을 검증한다', () => {
    expect(validateModel('RoleRevisionState', state(), schema)).toEqual(state());
    for (const patch of [
      { sourceContract: { profile: U3_PROFILE, registryVersion: 3 } },
      { roleRef: u4Ref('EnterpriseAccess', 'CustomerRole') },
      { scopeRefs: [u4Ref('EnterpriseAccess', 'ScopeV2')] },
      { actions: ['payment.read'] },
      { forged: true },
    ])
      expect(() => validateModel('RoleRevisionState', { ...state(), ...patch }, schema)).toThrow();
  });
  it('직원 role3 원상은 payload3/source4로만 읽고 row버전·구형 위장을 거절한다', () => {
    const rows = [
      {
        model: 'StaffRole',
        schemaVersion: 3 as const,
        id: 'financial-role',
        revision: 1,
        data: role(),
        deleted: false,
      },
    ];
    const body = {
      schemaVersion: 3 as const,
      sourceContract: U4_SOURCE_CONTRACT,
      epoch: 'initial',
      commitOrder: 1,
      requestId: 'request',
      correlationId: 'correlation',
      rows,
      previousDigest: null,
    };
    expect(decodePayload(canonicalJson(sealPayload(body)), schema).rows).toEqual(rows);
    for (const patch of [
      { schemaVersion: 2 as const },
      { rows: [{ ...rows[0]!, schemaVersion: 2 as const }] },
      { sourceContract: { profile: U3_PROFILE, registryVersion: 3 } as const },
    ])
      expect(() =>
        decodePayload(canonicalJson(sealPayload({ ...body, ...patch })), schema),
      ).toThrow();
  });
  it('관측3은 서버의 명시 U4 등록과 실제 role3에만 결합하고 구형 관측을 승격하지 않는다', () => {
    expect(
      registeredRecoveryObservationProfile({ kind: 'SYNTHETIC', observationProfile: U4_PROFILE }),
    ).toBe(U4_PROFILE);
    expect(validateRecoverySecurityObservation(schema, U4_PROFILE, frame()).modelVersion).toBe(3);
    for (const profile of [U3_PROFILE, 'urn:oms:contract:foundation:1'])
      expect(() => validateRecoverySecurityObservation(schema, profile, frame())).toThrow();
    for (const patch of [
      { modelVersion: 2 },
      { sourceOwner: 'IdentityRecovery' },
      { model: 'Invoice' },
      { sourceContract: { profile: U4_PROFILE, registryVersion: 3 } },
    ])
      expect(() =>
        validateRecoverySecurityObservation(schema, U4_PROFILE, { ...frame(), ...patch }),
      ).toThrow();
    expect(() =>
      registeredRecoveryObservationProfile({
        kind: 'UNREGISTERED',
        observationProfile: U4_PROFILE,
      }),
    ).toThrow();
  });
  it('복구 현재 원본은 비활성만 허용하고 금융 행위 확대·재활성·버전 전환은 금지한다', () => {
    const before = state(),
      disabled = { ...before, active: false, revision: 2 };
    expect(recoverySecurityChangeAllowed('RoleRevisionState', before, disabled)).toBe(true);
    for (const after of [
      { ...disabled, actions: ['financial.read', 'financial.manage'] },
      { ...disabled, modelVersion: 2 },
      { ...disabled, sourceContract: { profile: U3_PROFILE, registryVersion: 3 } },
    ])
      expect(recoverySecurityChangeAllowed('RoleRevisionState', before, after)).toBe(false);
    expect(
      recoverySecurityChangeAllowed('RoleRevisionState', disabled, { ...before, revision: 3 }),
    ).toBe(false);
  });
  it('U4 관측은 기존 보안 모델1/2를 계속 대조하지만 금융 업무를 보안 원본으로 추가하지 않는다', () => {
    const oldRole = { staffRoleId: 'old', label: 'old', actions: ['order.read'], revision: 1 };
    expect(
      validateRecoverySecurityObservation(schema, U4_PROFILE, {
        ...frame(),
        model: 'StaffRole',
        id: 'old',
        modelVersion: 1,
        currentData: oldRole,
      }).currentData,
    ).toEqual(oldRole);
    const currentRole = {
      ...oldRole,
      modelVersion: 2,
      sourceContract: { profile: U3_PROFILE, registryVersion: 3 },
    };
    expect(
      validateRecoverySecurityObservation(schema, U4_PROFILE, {
        ...frame(),
        model: 'StaffRole',
        id: 'old',
        modelVersion: 2,
        currentData: currentRole,
      }).modelVersion,
    ).toBe(2);
    expect(() =>
      validateRecoverySecurityObservation(schema, U4_PROFILE, {
        ...frame(),
        model: 'Account',
        sourceOwner: 'IdentityRecovery',
      }),
    ).toThrow();
  });
});
