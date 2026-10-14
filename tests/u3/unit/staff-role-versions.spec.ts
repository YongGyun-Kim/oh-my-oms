import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  declareU3Operations,
  OperationRegistry,
  SchemaValidator,
  U3_PROFILE,
} from '@oms/contracts';
import {
  decodeU2Model,
  decodeU3SupportModel,
  storedModelData,
  U3_MODELS,
  U3_SUPPORT_MODELS,
  U3_PERSISTENCE_MODELS,
  U3_SOURCE_CONTRACT,
  validateRecoveryRow,
} from '@oms/persistence';

const schema = new SchemaValidator();
const role = {
  staffRoleId: 'role',
  label: '합성 구형 역할',
  actions: ['product.register'],
  revision: 1,
};
const state = {
  roleStateId: 'state',
  roleRef: null,
  staffRoleRef: { owner: 'EnterpriseAccess', entity: 'StaffRole', id: 'role', revision: 1 },
  active: true,
  scopeRefs: [],
  actions: ['identity.person.verify'],
  revision: 1,
};
const currentRole = { ...role, modelVersion: 2, actions: [], sourceContract: U3_SOURCE_CONTRACT };
const currentState = {
  ...state,
  modelVersion: 2,
  actions: ['contract.approve'],
  sourceContract: U3_SOURCE_CONTRACT,
};
describe('C01 지원 모델의 실제 버전과 닫힌 U3 행위', () => {
  it('18개 업무 모델과 별개 지원4개를 실제 modelVersion2로 등록한다', () => {
    expect(U3_MODELS).toHaveLength(18);
    expect(U3_SUPPORT_MODELS.map((model) => model.name)).toEqual([
      'StaffRole',
      'CustomerRole',
      'RoleRevisionState',
      'ScopeV2',
    ]);
    expect(U3_PERSISTENCE_MODELS).toHaveLength(22);
    for (const model of U3_SUPPORT_MODELS)
      expect(model.attributes.find((attribute) => attribute.name === 'modelVersion')).toMatchObject(
        { required: true, allowed_values: ['2'] },
      );
  });
  it('구형 StaffRole 최소1행위와 U2 원본 bytes/decoder 의미를 보존한다', () => {
    const bytes = canonicalJson(state);
    expect(decodeU3SupportModel('StaffRole', 1, role, schema)).toEqual(role);
    expect(decodeU2Model('RoleRevisionState', 1, state, schema)).toEqual(state);
    expect(canonicalJson(decodeU2Model('RoleRevisionState', 1, state, schema))).toBe(bytes);
    expect(() => decodeU3SupportModel('StaffRole', 1, { ...role, actions: [] }, schema)).toThrow();
    expect(() =>
      decodeU2Model('RoleRevisionState', 1, { ...state, actions: ['contract.approve'] }, schema),
    ).toThrow();
  });
  it('빈 base 투영과 신규 권한은 명시 model2/profile2/registry3에서만 허용한다', () => {
    expect(decodeU3SupportModel('StaffRole', 2, currentRole, schema)).toEqual(currentRole);
    expect(decodeU3SupportModel('RoleRevisionState', 2, currentState, schema)).toEqual(
      currentState,
    );
    expect(() => decodeU2Model('RoleRevisionState', 1, currentState, schema)).toThrow();
    expect(() => decodeU3SupportModel('StaffRole', 1, currentRole, schema)).toThrow();
    expect(() => decodeU3SupportModel('StaffRole', 2, role, schema)).toThrow();
  });
  it('누락/null/위조 profile이나 새 marker 없는 metadata로 구형 의미를 확장하지 않는다', () => {
    for (const sourceContract of [
      undefined,
      null,
      { ...U3_SOURCE_CONTRACT, registryVersion: 2 },
      { ...U3_SOURCE_CONTRACT, profile: 'urn:oms:contract:common:2' },
    ])
      expect(() =>
        decodeU3SupportModel('RoleRevisionState', 2, { ...currentState, sourceContract }, schema),
      ).toThrow();
    expect(() =>
      decodeU3SupportModel(
        'RoleRevisionState',
        1,
        { ...state, sourceContract: U3_SOURCE_CONTRACT },
        schema,
      ),
    ).toThrow();
  });
  it('unknown/중복/빈/과다 행위 및 직원 profile의 고객 역할 혼합을 거절한다', () => {
    for (const actions of [
      ['arbitrary.action'],
      ['contract.approve', 'contract.approve'],
      [],
      Array.from({ length: 18 }, () => 'contract.approve'),
    ])
      expect(() =>
        decodeU3SupportModel('RoleRevisionState', 2, { ...currentState, actions }, schema),
      ).toThrow();
    expect(() =>
      decodeU3SupportModel(
        'RoleRevisionState',
        2,
        {
          ...currentState,
          roleRef: {
            owner: 'EnterpriseAccess',
            entity: 'CustomerRole',
            id: 'customer-role',
            revision: 1,
          },
          staffRoleRef: null,
          actions: [],
        },
        schema,
      ),
    ).toThrow();
  });
  it('expand NULL만 과거 bytes에서 제외하고 marker 없이 새 metadata를 섞으면 거절한다', () => {
    expect(
      storedModelData('StaffRole', { ...role, modelVersion: null, sourceContract: null }),
    ).toEqual(role);
    expect(
      storedModelData('RoleRevisionState', { ...state, modelVersion: null, sourceContract: null }),
    ).toEqual(state);
    expect(() =>
      storedModelData('RoleRevisionState', {
        ...state,
        modelVersion: null,
        sourceContract: U3_SOURCE_CONTRACT,
      }),
    ).toThrow();
  });
  it('보호 Row도 실제 version2이며 wrapper/row downgrade를 거절한다', () => {
    const row = {
      model: 'RoleRevisionState',
      schemaVersion: 2 as const,
      id: 'state',
      revision: 1,
      data: currentState,
      deleted: false,
    };
    expect(() => validateRecoveryRow(row, schema)).not.toThrow();
    expect(() => validateRecoveryRow({ ...row, schemaVersion: 1 }, schema)).toThrow();
  });
  it('C01 v3 관리와 실제 U3 registry 직원 행위는 17개 폐쇄 목록에 포함된다', () => {
    const registry = new OperationRegistry(schema);
    declareU3Operations(registry);
    for (const [owner, name] of [
      ['CommercialAgreement', 'registerAgreement'],
      ['CommercialAgreement', 'approveAgreement'],
      ['CommercialAgreement', 'createProposal'],
      ['OrderAcceptance', 'decideOrder'],
      ['OrderAcceptance', 'applyApprovedChange'],
    ]) {
      const action = registry.lookup(owner!, name!, 3).action!;
      expect(() =>
        schema.validateUri(U3_PROFILE + '#/$defs/StaffActionList', [action]),
      ).not.toThrow();
    }
    for (const name of [
      'defineStaffRole',
      'reviseStaffRole',
      'deactivateStaffRole',
      'readStaffRoles',
    ])
      expect(registry.lookup('EnterpriseAccess', name, 3).action).toBe('staff.role.manage');
    expect(() =>
      schema.validateUri(U3_PROFILE + '#/$defs/StaffRoleInput', {
        meta: { clientRequestId: 'id', expectedRevision: null, reason: '합성', evidenceRefs: [] },
        label: '합성',
        actions: ['arbitrary.action'],
      }),
    ).toThrow();
  });
});
