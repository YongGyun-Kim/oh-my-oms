import { describe, expect, it } from 'vitest';
import {
  declareU3Operations,
  OperationRegistry,
  SchemaValidator,
  U3_PROFILE,
} from '@oms/contracts';
import { fixtureRef, fixtureScope } from '../fixtures/identity.js';

describe('현재 보호 조회의 U3-only scope·출력 참조 연결', () => {
  const schema = new SchemaValidator(),
    registry = new OperationRegistry(schema);
  declareU3Operations(registry);
  it('효력/이력은 고정 scope를 명시 운반하고 구형 RecordQuery를 덮어쓰지 않는다', () => {
    const input = {
      targetRef: fixtureRef('CommercialAgreement', 'EnterpriseContract'),
      targetScope: fixtureScope(),
    };
    expect(
      schema.validateUri(
        registry.lookup('CommercialAgreement', 'effectiveAgreement', 3).input,
        input,
      ),
    ).toEqual(input);
    for (const owner of ['ProductCatalog', 'CommercialAgreement', 'OrderAcceptance']) {
      expect(
        schema.validateUri(registry.lookup(owner, 'readOwnerHistory', 3).input, input),
      ).toEqual(input);
      expect(() =>
        schema.validateUri(registry.lookup(owner, 'readOwnerHistory', 3).input, {
          targetRef: input.targetRef,
        }),
      ).toThrow();
      expect(() =>
        schema.validateUri(registry.lookup(owner, 'readOwnerHistory', 3).input, {
          ...input,
          version: 3,
        }),
      ).toThrow();
    }
    expect(() => schema.validate('RecordQuery', input)).toThrow();
  });
  it('정확한 새 개정/조건 참조를 출력하고 unknown owner/entity·미등록 필드를 거절한다', () => {
    const view = {
      enterpriseRef: fixtureRef('EnterpriseAccess', 'Enterprise'),
      approvedRevisionRef: fixtureRef('CommercialAgreement', 'AgreementRevision'),
      offerExceptionRefs: [],
      commercialTermsRef: fixtureRef('ProductCatalog', 'CommonOfferRevision'),
      provisionTermsRef: null,
      renewalTermsRef: null,
      proposalRefs: [],
      consentRefs: [],
    };
    expect(schema.validateUri(U3_PROFILE + '#/$defs/AgreementView', view)).toEqual(view);
    expect(schema.validate('AgreementView', view)).toEqual(view); // 공통 계약으로 표현 가능한 값의 호환성을 보존한다.
    for (const changed of [
      { approvedRevisionRef: { ...view.approvedRevisionRef, owner: 'Unknown' } },
      { commercialTermsRef: { ...view.commercialTermsRef, entity: 'Unknown' } },
      { effective: true },
    ])
      expect(() =>
        schema.validateUri(U3_PROFILE + '#/$defs/AgreementView', { ...view, ...changed }),
      ).toThrow();
  });
});
