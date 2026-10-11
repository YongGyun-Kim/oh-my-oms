import { describe, expect, it } from 'vitest';
import {
  SchemaValidator,
  U3_PROFILE,
  declareU3Operations,
  OperationRegistry,
} from '@oms/contracts';
import { Commands } from '@oms/core';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { U3_SOURCE_CONTRACT } from '@oms/persistence';
import { fixtureRef } from '../fixtures/identity.js';

const schema = new SchemaValidator();
const role = fixtureRef('EnterpriseAccess', 'CustomerRole');
const refs = [
  role,
  fixtureRef('EnterpriseAccess', 'RoleRevisionState'),
  fixtureRef('EnterpriseAccess', 'ScopeV2'),
];
const output = () => ({
  requestId: 'protected-receipt',
  requestState: 'RESULT_RECORDED',
  owner: 'EnterpriseAccess',
  targetRef: role,
  resultRefs: refs,
  acceptedAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
  statusRevision: 1,
  retryAfterMilliseconds: null,
});
const record = (resultRefs = refs): ModelData => ({
  requestId: 'protected-receipt',
  requestState: 'RESULT_RECORDED',
  owner: 'EnterpriseAccess',
  resultRefs,
  acceptedAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
  revision: 1,
});
const commands = new Commands({ schema } as unknown as ProtectedStore, () => new Date());
describe('접수 응답은 보호 원본의 등록 profile과 실제 폐쇄 output 계약을 따른다', () => {
  it('실제 C01 등록3 output이 생산한 역할/상태/술어 Ref를 허용하고 common2는 거절한다', () => {
    const registry = new OperationRegistry(schema);
    declareU3Operations(registry);
    for (const name of ['defineCustomerRole', 'reviseCustomerRole', 'deactivateCustomerRole']) {
      expect(
        schema.validateUri(registry.lookup('EnterpriseAccess', name, 3).output, output()),
      ).toEqual(output());
    }
    expect(() => schema.validate('Receipt', output())).toThrow();
  });
  it('검증된 KNOWN source는 새 output을 선택하고 원본이나 응답에 표시를 덧붙이지 않는다', () => {
    const original = { ...record(), sourceContract: U3_SOURCE_CONTRACT },
      before = structuredClone(original);
    expect(commands.receipt(original)).toEqual(output());
    expect(original).toEqual(before);
    expect(commands.receipt(original)).not.toHaveProperty('sourceContract');
  });
  it.each([undefined, null])(
    '출처 %j는 구형 응답 의미를 유지하고 새 Ref를 추정하지 않는다',
    (sourceContract) => {
      const legacy = record([role]);
      if (sourceContract === null) legacy.sourceContract = null;
      expect(commands.receipt(legacy)).toEqual({ ...output(), resultRefs: [role] });
      expect(() => commands.receipt({ ...record(), sourceContract })).toThrow();
      expect(() =>
        commands.receipt({ ...record(), profile: U3_PROFILE, registryVersion: 3 }),
      ).toThrow();
    },
  );
  it.each([
    { ...U3_SOURCE_CONTRACT, registryVersion: 2 },
    { ...U3_SOURCE_CONTRACT, profile: 'urn:oms:contract:common:2' },
    { ...U3_SOURCE_CONTRACT, extra: true },
  ])('불명확하거나 위조된 source %j는 구형으로 fallback하지 않는다', (sourceContract) => {
    expect(() => commands.receipt({ ...record(), sourceContract })).toThrow();
  });
  it('미등록 owner/entity/field·버전·NULL/시간 오류는 새 output에서도 폐쇄 거절한다', () => {
    for (const changed of [
      { resultRefs: [fixtureRef('UnknownOwner', 'ScopeV2')] },
      { resultRefs: [fixtureRef('EnterpriseAccess', 'UnknownEntity')] },
      { resultRefs: [{ ...refs[2]!, modelVersion: 2 }] },
      { registryVersion: 3 },
      { sourceContract: U3_SOURCE_CONTRACT },
      { statusRevision: 0 },
      { acceptedAt: 'invalid-date' },
      { resultRefs: null },
      { owner: 'UnknownOwner' },
    ])
      expect(() =>
        schema.validateUri(U3_PROFILE + '#/$defs/Receipt', { ...output(), ...changed }),
      ).toThrow();
    const nullable = { ...output(), targetRef: null };
    expect(schema.validateUri(U3_PROFILE + '#/$defs/Receipt', nullable)).toEqual(nullable);
    for (const field of Object.keys(output())) {
      const missing: Record<string, unknown> = { ...output() };
      delete missing[field];
      expect(() => schema.validateUri(U3_PROFILE + '#/$defs/Receipt', missing)).toThrow();
    }
  });
});
