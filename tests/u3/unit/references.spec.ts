import { describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator } from '@oms/contracts';
import { ref, u3Ref } from '@oms/core';
import type { ModelData } from '@oms/persistence';
import { modelFixture, sourceContract } from '../fixtures/models.js';
import { fixtureRef } from '../fixtures/identity.js';

const schema = new SchemaValidator();
describe('U3 등록 원상의 개정 참조와 구형 ref 의미 분리', () => {
  it('immutable history의 실제 sourceRevision2를 새 ref2로 발급하고 구형 helper 의미/bytes는 유지한다', () => {
    const history: ModelData = { ...modelFixture('AgreementHistory'), sourceRevision: 2 };
    const bytes = canonicalJson(history);
    expect(ref('AgreementHistory', history).revision).toBe(1);
    expect(u3Ref('AgreementHistory', history, schema)).toEqual({
      owner: 'CommercialAgreement',
      entity: 'AgreementHistory',
      id: history.historyId,
      revision: 2,
    });
    expect(canonicalJson(history)).toBe(bytes);
    const proposal = { ...modelFixture('CommercialProposal'), revision: 3, proposalRevision: 2 };
    expect(u3Ref('CommercialProposal', proposal, schema).revision).toBe(3);
  });
  it('임의 modelVersion marker/미등록 model·필드·개정 누락·변조 source는 ref 발급 근거가 아니다', () => {
    const history = modelFixture('AgreementHistory');
    for (const changed of [
      { modelVersion: 1 },
      { sourceRevision: 0 },
      { sourceRevision: 1.5 },
      { revision: 2 },
      { extra: true },
    ])
      expect(() => u3Ref('AgreementHistory', { ...history, ...changed }, schema)).toThrow();
    const missing = { ...history };
    delete missing.sourceRevision;
    expect(() => u3Ref('AgreementHistory', missing, schema)).toThrow();
    expect(() => u3Ref('RequestReceipt', { modelVersion: 2 }, schema)).toThrow();
    const role = {
      modelVersion: 2,
      roleId: 'registered-role',
      enterpriseRef: fixtureRef('EnterpriseAccess', 'Enterprise'),
      label: '합성 동의 역할',
      actionScopeRefs: [],
      revision: 1,
      sourceContract,
    };
    expect(u3Ref('CustomerRole', role, schema).revision).toBe(1);
    expect(() =>
      u3Ref(
        'CustomerRole',
        { ...role, sourceContract: { ...sourceContract, registryVersion: 2 } },
        schema,
      ),
    ).toThrow();
  });
});
