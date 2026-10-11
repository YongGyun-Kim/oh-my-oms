import { describe, expect, it } from 'vitest';
import {
  declareU3Operations,
  OperationRegistry,
  SchemaValidator,
  U3_PROFILE,
} from '@oms/contracts';
import {
  agreementRegistrationInput,
  agreementApprovalInput,
  commercialTermsInput,
  registeredAgreementInput,
} from '../fixtures/agreement-input.js';
import { fixtureRef, fixtureScope } from '../fixtures/identity.js';
import { productFixture, orderFixture } from '../fixtures/commercial.js';

const schema = new SchemaValidator(),
  registry = new OperationRegistry(schema);
declareU3Operations(registry);
const enterprise = fixtureRef('EnterpriseAccess', 'Enterprise', 'company'),
  product = fixtureRef('ProductCatalog', 'Product', 'product'),
  offer = fixtureRef('ProductCatalog', 'CommonOfferRevision', 'offer'),
  proofs = ['a', 'b'].map((id) => fixtureRef('IdentityRecovery', 'VerificationEvidence', id)),
  agreement = fixtureRef('CommercialAgreement', 'AgreementRevision', 'agreement'),
  contract = fixtureRef('CommercialAgreement', 'EnterpriseContract', 'contract', 2);
describe('DB 준비 전에 실제 registry3 선언과 동일한 command fixture 입력 검사', () => {
  it('실제 등록 factory의 모든 필드와 닫힌 U2 proof refs를 선언된 input으로 검사한다', () => {
    const input = agreementRegistrationInput(enterprise, product, offer, proofs);
    expect(
      schema.validateUri(
        registry.lookup('CommercialAgreement', 'registerAgreement', 3).input,
        input,
      ),
    ).toEqual(input);
    expect(input.conditions[0]!.evidenceRefs).toEqual(proofs);
    expect(() => schema.validate('Ref', proofs[0])).toThrow();
  });
  it('같은 등록 operation의 새 계약 개정은 exact contractRef/expectedRevision을 보존한다', () => {
    const input = agreementRegistrationInput(enterprise, product, offer, proofs, contract);
    expect(input.contractRef).toEqual(contract);
    expect(input.meta.expectedRevision).toBe(2);
    expect(registeredAgreementInput('registerAgreement', input)).toEqual(input);
  });
  it('승인 factory와 Meta 근거는 U3 참조를 사용하고 common DecisionInput은 그대로 거절한다', () => {
    const input = agreementApprovalInput(agreement, proofs);
    input.meta.evidenceRefs = proofs;
    expect(registeredAgreementInput('approveAgreement', input)).toEqual(input);
    expect(() => schema.validate('DecisionInput', input)).toThrow();
    expect(() =>
      registeredAgreementInput('approveAgreement', { ...input, basisRefs: [] }),
    ).toThrow();
  });
  it('기업 조건 조회 factory는 실제 선언의 제품/offer/고정 범위를 담는다', () => {
    const input = commercialTermsInput({
      productRef: product,
      commonOfferRevisionRef: offer,
      targetScope: fixtureScope('company'),
    });
    expect(
      schema.validateUri(
        registry.lookup('CommercialAgreement', 'readApprovedTerms', 3).input,
        input,
      ),
    ).toEqual(input);
  });
  it('unknown owner/entity와 알려진 원본의 잘못된 owner/entity 결합을 거절한다', () => {
    const input = agreementRegistrationInput(enterprise, product, offer, proofs);
    for (const reference of [
      { ...proofs[0]!, owner: 'unknown' },
      { ...proofs[0]!, entity: 'UnknownProof' },
      { ...proofs[0]!, owner: 'EnterpriseAccess' },
    ])
      expect(() =>
        registeredAgreementInput('registerAgreement', {
          ...input,
          agreementEvidenceRefs: [reference],
        }),
      ).toThrow();
    expect(() =>
      registeredAgreementInput('registerAgreement', { ...input, productRefs: [agreement] }),
    ).toThrow();
    expect(() =>
      registeredAgreementInput('approveAgreement', {
        ...agreementApprovalInput(agreement, proofs),
        targetRef: product,
      }),
    ).toThrow();
  });
  it('추가 field/생략/클라이언트 sourceRef/version 입력은 실제 폐쇄 선언에서 거절한다', () => {
    const input = agreementRegistrationInput(enterprise, product, offer, proofs);
    for (const changed of [
      { ...input, version: 2 },
      { ...input, operation: 'registerAgreement' },
      { ...input, conditions: [{ ...input.conditions[0], sourceRef: agreement }] },
      { ...input, effectiveWindow: undefined },
    ])
      expect(() => registeredAgreementInput('registerAgreement', changed)).toThrow();
    expect(() =>
      registeredAgreementInput('readApprovedTerms', {
        productRef: product,
        commonOfferRevisionRef: offer,
      }),
    ).toThrow();
    expect(() => registry.lookup('CommercialAgreement', 'registerAgreement', 2)).toThrow();
  });
  it('Ref/개정의 strict 조건과 기존 U3 상품/주문 command factory도 유지한다', () => {
    expect(() =>
      schema.validateUri(U3_PROFILE + '#/$defs/Ref', { ...proofs[0], revision: 0 }),
    ).toThrow();
    expect(() =>
      schema.validateUri(U3_PROFILE + '#/$defs/Ref', { ...proofs[0], privateField: true }),
    ).toThrow();
    expect(
      schema.validateUri(
        registry.lookup('ProductCatalog', 'registerProduct', 3).input,
        productFixture(),
      ),
    ).toEqual(productFixture());
    expect(
      schema.validateUri(
        registry.lookup('OrderAcceptance', 'submitOrder', 3).input,
        orderFixture(),
      ),
    ).toEqual(orderFixture());
  });
});
