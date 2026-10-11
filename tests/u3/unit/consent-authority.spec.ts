import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  SchemaValidator,
  declareU3Operations,
  OperationRegistry,
} from '@oms/contracts';
import { currentConsentScope, validateConsentScope } from '@oms/core';
import {
  decodeU2Model,
  decodeU3SupportModel,
  storedModelData,
  U3_SOURCE_CONTRACT,
  validateRecoveryRow,
  materialSchemas,
  U2_MODELS,
} from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import {
  consentPredicate,
  consentRoleInput,
  registeredConsentRoleInput,
} from '../fixtures/consent-role.js';
import { fixtureRef } from '../fixtures/identity.js';
import { fixtureMeta } from '../fixtures/commercial.js';

const schema = new SchemaValidator(),
  enterpriseRef = fixtureRef('EnterpriseAccess', 'Enterprise'),
  roleRef = fixtureRef('EnterpriseAccess', 'CustomerRole'),
  scopeRef = fixtureRef('EnterpriseAccess', 'ScopeV2'),
  legacyRole = {
    roleId: roleRef.id,
    enterpriseRef,
    label: '원래 역할',
    actionScopeRefs: [],
    revision: 1,
  },
  role = { ...legacyRole, modelVersion: 2, sourceContract: U3_SOURCE_CONTRACT },
  predicate = consentPredicate(enterpriseRef),
  row = {
    modelVersion: 2,
    scopeId: scopeRef.id,
    enterpriseRef,
    action: predicate.action,
    kind: predicate.kind,
    predicate,
    revision: 1,
    sourceContract: U3_SOURCE_CONTRACT,
  },
  state = {
    modelVersion: 2,
    roleStateId: 'state',
    roleRef,
    staffRoleRef: null,
    active: true,
    scopeRefs: [scopeRef],
    actions: [],
    revision: 1,
    sourceContract: U3_SOURCE_CONTRACT,
  };
describe('실제 C01 동의 권한의 명시 버전과 폐쇄 계약', () => {
  it('폐쇄 동의 action의 physical type은 기존 varchar4096을 그대로 보존한다', () => {
    const previous = materialSchemas(U2_MODELS).find((model) => model.options.name === 'ScopeV2')!,
      current = materialSchemas().find((model) => model.options.name === 'ScopeV2')!;
    expect(current.options.columns.action).toEqual(previous.options.columns.action);
    expect(current.options.columns.action).toMatchObject({ type: 'varchar', length: 4096 });
  });
  it('native registry3 생산/개정/비활성/조회와 별도 동의 행위를 등록한다', () => {
    const registry = new OperationRegistry(schema);
    declareU3Operations(registry);
    expect(registry.lookup('CommercialAgreement', 'recordConsent', 3).action).toBe(
      'contract.consent',
    );
    const input = consentRoleInput(enterpriseRef);
    expect(registeredConsentRoleInput('defineCustomerRole', input)).toEqual(input);
    expect(
      registeredConsentRoleInput('reviseCustomerRole', {
        meta: fixtureMeta(1),
        roleRef,
        label: input.label,
        predicates: input.predicates,
      }),
    ).toHaveProperty('roleRef', roleRef);
    expect(
      registeredConsentRoleInput('deactivateCustomerRole', { meta: fixtureMeta(1), roleRef }),
    ).toHaveProperty('roleRef', roleRef);
    expect(
      registeredConsentRoleInput('readCustomerRoles', {
        enterpriseRef,
        cursor: null,
        pageSize: 10,
      }),
    ).toHaveProperty('enterpriseRef', enterpriseRef);
  });
  it('역할2·고객 상태2·술어2를 실제 decoder로 검증하고 구형 역할 bytes를 보존한다', () => {
    for (const [name, value] of [
      ['CustomerRole', role],
      ['RoleRevisionState', state],
      ['ScopeV2', row],
    ] as const)
      expect(decodeU3SupportModel(name, 2, value, schema)).toEqual(value);
    const bytes = canonicalJson(legacyRole);
    expect(canonicalJson(decodeU3SupportModel('CustomerRole', 1, legacyRole, schema))).toBe(bytes);
    expect(
      storedModelData('CustomerRole', { ...legacyRole, modelVersion: null, sourceContract: null }),
    ).toEqual(legacyRole);
    expect(() => decodeU2Model('ScopeV2', 1, row, schema)).toThrow();
  });
  it('기존 Scope URI는 동의 action을 받아들이지 않으며 다른 읽기/제출 행위도 동의로 바꾸지 않는다', () => {
    expect(() =>
      schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/ScopeV2', predicate),
    ).toThrow();
    for (const action of ['order.read', 'order.submit', 'role.manage', 'arbitrary.consent'])
      expect(() => validateConsentScope({ ...predicate, action })).toThrow();
  });
  it('본문 version/SourceContract/extra flags 및 잘못된 조직 술어는 입력에서 거절한다', () => {
    const input = consentRoleInput(enterpriseRef);
    for (const change of [
      { modelVersion: 2 },
      { sourceContract: U3_SOURCE_CONTRACT },
      { authorize: true },
      { predicates: [{ ...predicate, kind: 'DEPARTMENT_SITE' }] },
    ])
      expect(() =>
        registeredConsentRoleInput('defineCustomerRole', { ...input, ...change }),
      ).toThrow();
    expect(() => validateConsentScope({ ...predicate, sourcePolicyRevision: 2 })).toThrow();
  });
  it('직원 상태·고객 상태를 섞거나 새 고객 역할에 구형 투영을 넣으면 거절한다', () => {
    expect(() =>
      decodeU3SupportModel(
        'RoleRevisionState',
        2,
        { ...state, actions: ['contract.approve'] },
        schema,
      ),
    ).toThrow();
    expect(() =>
      decodeU3SupportModel(
        'RoleRevisionState',
        2,
        {
          ...state,
          roleRef: null,
          staffRoleRef: fixtureRef('EnterpriseAccess', 'StaffRole'),
          scopeRefs: [],
          actions: [],
        },
        schema,
      ),
    ).toThrow();
    expect(() =>
      decodeU3SupportModel(
        'CustomerRole',
        2,
        { ...role, actionScopeRefs: [fixtureRef('EnterpriseAccess', 'ActionScope')] },
        schema,
      ),
    ).toThrow();
  });
  it.each([
    undefined,
    null,
    { ...U3_SOURCE_CONTRACT, registryVersion: 2 },
    { ...U3_SOURCE_CONTRACT, profile: 'urn:oms:contract:common:2' },
  ])('출처 %j는 현재 동의 모델 decoder/권위 대조에서 거절한다', (sourceContract) => {
    expect(() =>
      decodeU3SupportModel('CustomerRole', 2, { ...role, sourceContract }, schema),
    ).toThrow();
    expect(() => currentConsentScope({ ...row, sourceContract }, state)).toThrow();
  });
  it('원래 모델 버전1/누락 marker와 새 술어를 결합하지 않는다', () => {
    expect(() => currentConsentScope(row, { ...state, modelVersion: 1 })).toThrow();
    expect(() => currentConsentScope({ ...row, modelVersion: 1 }, state)).toThrow();
    const oldScope: ModelData = { ...row };
    delete oldScope.modelVersion;
    delete oldScope.sourceContract;
    expect(() => decodeU2Model('ScopeV2', 1, oldScope, schema)).toThrow();
  });
  it('혼합 보호 후보의 각 새 모델을 row/wrapper 버전으로 명시하며 downgrade를 거절한다', () => {
    for (const [name, value, id] of [
      ['CustomerRole', role, roleRef.id],
      ['RoleRevisionState', state, 'state'],
      ['ScopeV2', row, scopeRef.id],
    ] as const) {
      const recovered = {
        model: name,
        schemaVersion: 2 as const,
        id,
        revision: 1,
        data: value,
        deleted: false,
      };
      expect(() => validateRecoveryRow(recovered, schema)).not.toThrow();
      expect(() => validateRecoveryRow({ ...recovered, schemaVersion: 1 }, schema)).toThrow();
      expect(() =>
        validateRecoveryRow(
          {
            ...recovered,
            data: { ...value, sourceContract: { ...U3_SOURCE_CONTRACT, registryVersion: 2 } },
          },
          schema,
        ),
      ).toThrow();
    }
  });
});
