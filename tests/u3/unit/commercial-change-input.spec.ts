import { describe, expect, it } from 'vitest';
import { SchemaValidator, U3_PROFILE } from '@oms/contracts';
import type { EffectiveWindow, U3OfferExceptionInput } from '@oms/contracts';
import { approvedExceptionTerms } from '../../../packages/core/src/commercial-terms.js';
import {
  agreementRegistrationInput,
  contractChangeInput,
  offerExceptionInput,
  registeredAgreementInput,
} from '../fixtures/agreement-input.js';
import { fixtureRef, fixtureScope } from '../fixtures/identity.js';

const schema = new SchemaValidator(),
  scope = fixtureScope(),
  contractRef = fixtureRef('CommercialAgreement', 'EnterpriseContract'),
  agreementRef = fixtureRef('CommercialAgreement', 'AgreementRevision', 'revision', 2),
  productRef = fixtureRef('ProductCatalog', 'Product'),
  offerRef = fixtureRef('ProductCatalog', 'CommonOfferRevision'),
  proofs = [fixtureRef('IdentityRecovery', 'VerificationEvidence')],
  window: EffectiveWindow = {
    startAt: '2026-10-01T00:00:00.000Z',
    endAt: null,
    startInclusive: true,
    endInclusive: false,
  };
const approved = () => ({
  modelVersion: 2,
  state: 'APPROVED',
  approvalRef: fixtureRef('CommercialAgreement', 'AgreementApproval'),
  effectiveWindow: window,
  conditionBindings: [
    {
      conditionKey: 'VISIBILITY',
      value: true,
      sourceRef: agreementRef,
      evidenceRefs: proofs,
      effectiveWindow: window,
    },
    {
      conditionKey: 'PRICE',
      value: { currency: 'KRW', value: '900' },
      sourceRef: agreementRef,
      evidenceRefs: proofs,
      effectiveWindow: window,
    },
  ],
});
const input = () => offerExceptionInput(scope.enterpriseRef, productRef, agreementRef);
describe('고객 변경 요청·승인 예외의 실제 registry3 입력', () => {
  it('현재 계약/고정 조직/근거를 갖는 생산자 DTO를 실제 등록 스키마로 검증한다', () => {
    const request = contractChangeInput(scope, contractRef, proofs),
      exception = input();
    expect(registeredAgreementInput('requestContractChange', request)).toEqual(request);
    exception.meta.evidenceRefs = proofs;
    expect(registeredAgreementInput('registerOfferException', exception)).toEqual(exception);
    const registration = agreementRegistrationInput(
      scope.enterpriseRef,
      productRef,
      offerRef,
      proofs,
      contractRef,
    );
    registration.changeRequestRef = fixtureRef('CommercialAgreement', 'ContractChangeRequest');
    expect(registeredAgreementInput('registerAgreement', registration)).toEqual(registration);
    expect(() =>
      schema.validateUri('urn:oms:contract:common:2#/$defs/ContractChangeInput', request),
    ).toThrow();
  });
  it('대상 계약/문맥 누락·미등록 필드·잘못된 owner/entity/version을 거절한다', () => {
    const request = contractChangeInput(scope, contractRef);
    for (const changed of [
      { contractRef: null },
      { targetScope: null },
      { contractRef: fixtureRef('OrderAcceptance', 'Order') },
      { agreementEvidenceRefs: [fixtureRef('UnknownOwner', 'VerificationEvidence')] },
      { extra: true },
      { modelVersion: 1 },
    ])
      expect(() =>
        registeredAgreementInput('requestContractChange', { ...request, ...changed }),
      ).toThrow();
    const missing = { ...request } as Record<string, unknown>;
    delete missing.contractRef;
    expect(() => registeredAgreementInput('requestContractChange', missing)).toThrow();
  });
  it('예외의 소수 단가·잘못된 승인 종류·미등록 입력은 스키마에서 거절한다', () => {
    for (const changed of [
      { price: { currency: 'KRW', value: '900.5' } },
      { agreementRevisionRef: fixtureRef('CommercialAgreement', 'EnterpriseContract') },
      { approval: true },
    ])
      expect(() =>
        registeredAgreementInput('registerOfferException', { ...input(), ...changed }),
      ).toThrow();
  });
});
describe('예외 기록은 승인 내용과 구간의 투영이다', () => {
  it('승인 가격/공개와 정확 source 개정이 일치하는 내용만 반환한다', () => {
    expect(approvedExceptionTerms(approved(), input())).toEqual({
      visible: true,
      price: input().price,
      effectiveWindow: window,
    });
  });
  it('미승인/자기 입력만으로 승인하거나 조건 없는 공개를 추정하지 않는다', () => {
    for (const changed of [
      { state: 'REGISTERED', approvalRef: null },
      { state: 'APPROVED', approvalRef: null },
      { conditionBindings: approved().conditionBindings.slice(1) },
    ])
      expect(() => approvedExceptionTerms({ ...approved(), ...changed }, input())).toThrow();
  });
  it('다른 가격·공개·source 개정·누락 근거는 승인 내용과 동등하지 않다', () => {
    for (const changed of [
      { price: { currency: 'KRW', value: '800' } },
      { visibility: false },
      { agreementRevisionRef: { ...agreementRef, revision: 1 } },
    ])
      expect(() =>
        approvedExceptionTerms(approved(), { ...input(), ...changed } as U3OfferExceptionInput),
      ).toThrow();
    const noProof = approved();
    noProof.conditionBindings[0]!.evidenceRefs = [];
    expect(() => approvedExceptionTerms(noProof, input())).toThrow();
  });
  it('미래 유효 조건을 현재 조건으로 바꾸지 않고 실제 교집합/경계 규칙을 보존한다', () => {
    const value = approved();
    value.conditionBindings[0]!.effectiveWindow = {
      startAt: '2099-01-01T00:00:00.000Z',
      endAt: '2099-12-31T00:00:00.000Z',
      startInclusive: false,
      endInclusive: true,
    };
    expect(approvedExceptionTerms(value, input()).effectiveWindow).toEqual(
      value.conditionBindings[0]!.effectiveWindow,
    );
    expect(value.effectiveWindow).toEqual(window);
    schema.validateUri(
      U3_PROFILE + '#/$defs/EffectiveWindow',
      approvedExceptionTerms(value, input()).effectiveWindow,
    );
  });
});
