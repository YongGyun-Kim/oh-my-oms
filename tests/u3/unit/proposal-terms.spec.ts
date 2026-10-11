import { describe, expect, it } from 'vitest';
import {
  declareFoundationOperations,
  declareU3Operations,
  OperationRegistry,
  SchemaValidator,
  U3_PROFILE,
} from '@oms/contracts';
import type { U3OrderPriceBreakdown, U3PriceAdjustment, U3ProposalView } from '@oms/contracts';
import {
  proposalTermsFingerprint,
  validateProposalPrice,
} from '../../../packages/core/src/proposal-terms.js';
import type { ProposalContent } from '../../../packages/core/src/proposal-terms.js';
import {
  consentInput,
  proposalInput,
  proposalPrice,
  proposalQuery,
  proposalTerms,
  registeredProposalInput,
} from '../fixtures/proposal-input.js';
import { fixtureRef } from '../fixtures/identity.js';

const schema = new SchemaValidator(),
  registry = new OperationRegistry(schema);
declareFoundationOperations(registry);
declareU3Operations(registry);
function content(): ProposalContent {
  const input = proposalInput();
  return {
    proposalRevision: 1,
    targetScope: input.targetScope,
    targetOrderRef: input.targetOrderRef,
    targetEntitlementRef: null,
    targetRenewalCycleRef: null,
    originalTerms: proposalTerms(input.originalTermsRef),
    proposedTerms: input.proposedTerms,
    originalPriceBreakdown: proposalPrice(),
    priceBreakdown: input.priceBreakdown,
    agreementEvidenceRefs: input.agreementEvidenceRefs,
  };
}
function adjustment(
  itemId: string,
  kind: U3PriceAdjustment['kind'],
  value: string,
): U3PriceAdjustment {
  return {
    itemId,
    kind,
    knowledge: 'KNOWN',
    amount: { currency: 'KRW', value },
    position: 'SEPARATE',
    includedInItemId: null,
    evidenceRefs: [fixtureRef('IdentityRecovery', 'VerificationEvidence')],
    confirmedByRef: fixtureRef('IdentityRecovery', 'Account'),
  };
}
describe('실제 registry3 제안·동의 생산자/소비자 계약', () => {
  it('고정 문맥·인라인 조건·원 단위 비용·정확 원본과 ScopeV2/RLS2 근거를 폐쇄 계약으로 연결한다', () => {
    const input = proposalInput(),
      consent = consentInput(),
      query = proposalQuery();
    expect(registeredProposalInput('createProposal', input)).toEqual(input);
    expect(registeredProposalInput('recordConsent', consent)).toEqual(consent);
    expect(registeredProposalInput('readProposal', query)).toEqual(query);
    expect(registry.lookup('CommercialAgreement', 'recordConsent', 3).action).toBe(
      'contract.consent',
    );
    expect(registry.lookup('CommercialAgreement', 'readProposal', 3).action).toBe('order.read');
    expect(() => schema.validate('ProposalInput', input)).toThrow();
    expect(() => schema.validate('ConsentInput', consent)).toThrow();
    const oldProposal = {
      meta: { ...input.meta, evidenceRefs: [] },
      targetOrderRef: input.targetOrderRef,
      targetEntitlementRef: null,
      targetRenewalCycleRef: null,
      originalTermsRef: input.originalTermsRef,
      proposedTermsRef: input.proposedTermsRef,
      agreementEvidenceRefs: [],
    };
    expect(schema.validate('ProposalInput', oldProposal, 2)).toEqual(oldProposal);
  });
  it('누락/다른 owner·entity·조건 개정·미등록 필드와 구형 문맥 입력을 차단한다', () => {
    const input = proposalInput();
    for (const changed of [
      { targetScope: null },
      { targetOrderRef: fixtureRef('CommercialAgreement', 'CommercialProposal') },
      { supersedesRef: fixtureRef('CommercialAgreement', 'AgreementRevision') },
      { proposedTermsRef: { ...input.proposedTermsRef, revision: 2 } },
      { proposedTermsRef: fixtureRef('CommercialAgreement', 'ProposedCommercialTerms') },
      { agreementEvidenceRefs: [fixtureRef('Unknown', 'VerificationEvidence')] },
      { sourceContract: { profile: U3_PROFILE, registryVersion: 2 } },
      { automaticallyApproved: true },
    ])
      expect(() => registeredProposalInput('createProposal', { ...input, ...changed })).toThrow();
    const missing: Partial<typeof input> = { ...input };
    delete missing.priceBreakdown;
    expect(() => registeredProposalInput('createProposal', missing)).toThrow();
    expect(() =>
      registeredProposalInput('readProposal', {
        targetRef: proposalQuery().targetRef,
        scope: input.targetScope,
      }),
    ).toThrow();
  });
  it('한 주문 또는 정확한 SW 권한/회차만 허용하고 잘못된 동의 개정·표시 fingerprint·직원 주장은 거절한다', () => {
    const input = proposalInput();
    const renewal = {
      ...input,
      targetOrderRef: null,
      targetEntitlementRef: fixtureRef('SoftwareLifecycle', 'EnterpriseEntitlement'),
      targetRenewalCycleRef: fixtureRef('SoftwareLifecycle', 'RenewalCycle'),
    };
    expect(registeredProposalInput('createProposal', renewal)).toEqual(renewal);
    for (const changed of [
      { targetOrderRef: null },
      { targetRenewalCycleRef: fixtureRef('SoftwareLifecycle', 'RenewalCycle') },
    ])
      expect(() => registeredProposalInput('createProposal', { ...input, ...changed })).toThrow();
    for (const changed of [
      { proposalRevision: 0 },
      { termsFingerprint: 'unconfirmed' },
      { targetScope: null },
      { decision: 'AGREE' },
      { staffConfirmed: true },
    ])
      expect(() =>
        registeredProposalInput('recordConsent', { ...consentInput(), ...changed }),
      ).toThrow();
  });
  it('실제 출력은 원래/새 조건과 비용·표시 fingerprint를 갖고 동의를 APPLIED로 표현하지 않는다', () => {
    const basis = content();
    const data: U3ProposalView = {
      proposalRef: fixtureRef('CommercialAgreement', 'CommercialProposal'),
      ...basis,
      termsFingerprint: proposalTermsFingerprint(basis, schema),
      consentRefs: [fixtureRef('CommercialAgreement', 'CustomerConsent')],
      state: 'ACCEPTED',
    };
    const output = {
      knowledge: 'KNOWN',
      data,
      sourceRefs: [data.proposalRef, fixtureRef('EnterpriseAccess', 'ScopeV2')],
      observedAt: '2026-10-12T00:00:00.000Z',
    };
    expect(
      schema.validateUri(registry.lookup('CommercialAgreement', 'readProposal', 3).output, output),
    ).toEqual(output);
    expect(() => schema.validate('ProposalViewResult', output)).toThrow();
    for (const changed of [
      { state: 'APPLIED' },
      { consentRefs: [fixtureRef('CommercialAgreement', 'AgreementApproval')] },
      { modelVersion: 1 },
    ])
      expect(() =>
        schema.validateUri(U3_PROFILE + '#/$defs/ProposalView', { ...data, ...changed }),
      ).toThrow();
    const applicationRef = fixtureRef('OrderAcceptance', 'OrderChangeApplication');
    const applied: U3ProposalView = {
      ...data,
      state: 'APPLIED',
      applicationRefs: [applicationRef],
    };
    expect(schema.validateUri(U3_PROFILE + '#/$defs/ProposalView', applied)).toEqual(applied);
    const appliedOutput = {
      ...output,
      data: applied,
      sourceRefs: [...output.sourceRefs, applicationRef],
    };
    const outputUri = registry.lookup('CommercialAgreement', 'readProposal', 3).output;
    expect(schema.validateUri(outputUri, appliedOutput)).toEqual(appliedOutput);
    expect(() => schema.validate('ProposalViewResult', appliedOutput)).toThrow();
    for (const changed of [
      { applicationRefs: [] },
      { applicationRefs: [fixtureRef('CommercialAgreement', 'OrderChangeApplication')] },
      { applicationRefs: [fixtureRef('OrderAcceptance', 'AcceptanceDecision')] },
      { applicationRefs: [{ ...applicationRef, unregistered: true }] },
      {
        targetOrderRef: null,
        targetEntitlementRef: fixtureRef('SoftwareLifecycle', 'EnterpriseEntitlement'),
        targetRenewalCycleRef: fixtureRef('SoftwareLifecycle', 'RenewalCycle'),
      },
    ]) {
      const invalid = { ...applied, ...changed };
      expect(() => schema.validateUri(U3_PROFILE + '#/$defs/ProposalView', invalid)).toThrow();
      expect(() => schema.validateUri(outputUri, { ...appliedOutput, data: invalid })).toThrow();
    }
    expect(() => schema.validateUri(outputUri, { ...output, data: applied })).toThrow();
    expect(() =>
      schema.validateUri(outputUri, {
        ...appliedOutput,
        sourceRefs: [...output.sourceRefs, { ...applicationRef, revision: 2 }],
      }),
    ).toThrow();
  });
});
describe('원 단위 제안 비용의 입력 정합성', () => {
  it('단가×수량·별도 비용/할인을 계산하며 단가/다른 항목에 포함된 금액을 중복 합산하지 않는다', () => {
    const terms = content().proposedTerms,
      price = proposalPrice();
    terms.lines[0]!.quantity = 2;
    price.lineAmounts[0] = { currency: 'KRW', value: '2000' };
    price.productAmount = { currency: 'KRW', value: '2000' };
    const tax = { ...adjustment('tax', 'TAX', '100'), position: 'UNIT_PRICE' as const };
    const fee = adjustment('fee', 'FEE', '200');
    const included = {
      ...adjustment('included', 'SHIPPING', '50'),
      position: 'OTHER_ITEM' as const,
      includedInItemId: fee.itemId,
    };
    price.adjustments = [tax, fee, included, adjustment('discount', 'DISCOUNT', '100')];
    price.total = { currency: 'KRW', value: '2100' };
    expect(validateProposalPrice(terms, price, schema)).toEqual(price);
    expect(price.adjustments[0]!.amount!.value).toBe('100');
  });
  it('미확인 비용을 0원/확정 합계로 승격하지 않고 UNKNOWN을 그대로 보존한다', () => {
    const price = proposalPrice();
    price.knowledge = 'UNKNOWN';
    price.total = null;
    price.adjustments = [
      {
        ...adjustment('tax', 'TAX', '0'),
        knowledge: 'UNKNOWN',
        amount: null,
        confirmedByRef: null,
        evidenceRefs: [],
      },
    ];
    expect(validateProposalPrice(content().proposedTerms, price, schema)).toEqual(price);
    expect(() =>
      validateProposalPrice(
        content().proposedTerms,
        { ...price, knowledge: 'KNOWN', total: { currency: 'KRW', value: '1000' } },
        schema,
      ),
    ).toThrow();
    expect(() =>
      validateProposalPrice(
        content().proposedTerms,
        { ...price, total: { currency: 'KRW', value: '1000' } },
        schema,
      ),
    ).toThrow();
  });
  it('다른 행 합계/누락 근거/포함 경로 순환/중복/확인되지 않은 0원을 거절한다', () => {
    const terms = content().proposedTerms;
    const invalidChanges: Partial<U3OrderPriceBreakdown>[] = [
      { lineAmounts: [{ currency: 'KRW', value: '999' }] },
      { lineAmounts: [] },
      { productAmount: { currency: 'KRW', value: '999' } },
      { total: { currency: 'KRW', value: '999' } },
      { adjustments: [{ ...adjustment('fee', 'FEE', '0'), evidenceRefs: [] }] },
      { adjustments: [adjustment('fee', 'FEE', '0'), adjustment('fee', 'FEE', '0')] },
      {
        adjustments: [
          {
            ...adjustment('fee', 'FEE', '0'),
            position: 'OTHER_ITEM' as const,
            includedInItemId: 'fee',
          },
        ],
      },
      {
        adjustments: [{ ...adjustment('fee', 'FEE', '100'), position: 'NOT_APPLICABLE' as const }],
      },
    ];
    for (const changed of invalidChanges)
      expect(() =>
        validateProposalPrice(terms, { ...proposalPrice(), ...changed }, schema),
      ).toThrow();
    const cycle = [
      { ...adjustment('a', 'TAX', '1'), position: 'OTHER_ITEM' as const, includedInItemId: 'b' },
      { ...adjustment('b', 'TAX', '1'), position: 'OTHER_ITEM' as const, includedInItemId: 'a' },
    ];
    expect(() =>
      validateProposalPrice(terms, { ...proposalPrice(), adjustments: cycle }, schema),
    ).toThrow();
  });
  it('KNOWN의 누락 행/소계는 거절하고 UNKNOWN의 명시 null은 확정 0원으로 바꾸지 않는다', () => {
    const terms = content().proposedTerms;
    for (const changed of [{ lineAmounts: [null] }, { productAmount: null }]) {
      expect(() =>
        validateProposalPrice(terms, { ...proposalPrice(), ...changed }, schema),
      ).toThrow();
      const unknown: U3OrderPriceBreakdown = {
        ...proposalPrice(),
        ...changed,
        knowledge: 'UNKNOWN',
        total: null,
      };
      expect(validateProposalPrice(terms, unknown, schema)).toEqual(unknown);
      expect(unknown.total).toBeNull();
    }
    const zeroTerms = structuredClone(terms);
    zeroTerms.lines[0]!.price.value = '0';
    const confirmedZero: U3OrderPriceBreakdown = {
      ...proposalPrice(),
      lineAmounts: [{ currency: 'KRW', value: '0' }],
      productAmount: { currency: 'KRW', value: '0' },
      total: { currency: 'KRW', value: '0' },
    };
    expect(validateProposalPrice(zeroTerms, confirmedZero, schema)).toEqual(confirmedZero);
    expect(() =>
      validateProposalPrice(zeroTerms, { ...confirmedZero, lineAmounts: [null] }, schema),
    ).toThrow();
  });
  it('소수/음수·전체 금액보다 큰 별도 할인은 묵시 반올림하지 않는다', () => {
    for (const value of ['1000.5', '-1']) {
      const terms = content().proposedTerms;
      terms.lines[0]!.price.value = value;
      expect(() => validateProposalPrice(terms, proposalPrice(), schema)).toThrow();
    }
    expect(() =>
      validateProposalPrice(
        content().proposedTerms,
        { ...proposalPrice(), adjustments: [adjustment('discount', 'DISCOUNT', '1001')] },
        schema,
      ),
    ).toThrow();
  });
  it('2^53을 넘는 허용 금액과 최대 Number 수량을 정수 문자열로 정확히 계산한다', () => {
    const terms = content().proposedTerms;
    terms.lines[0]!.price.value = '9007199254740993';
    terms.lines[0]!.quantity = 2;
    const price: U3OrderPriceBreakdown = {
      lineAmounts: [{ currency: 'KRW', value: '18014398509481986' }],
      productAmount: { currency: 'KRW', value: '18014398509481986' },
      adjustments: [adjustment('fee', 'FEE', '100'), adjustment('discount', 'DISCOUNT', '3')],
      total: { currency: 'KRW', value: '18014398509482083' },
      knowledge: 'KNOWN',
    };
    expect(validateProposalPrice(terms, price, schema)).toEqual(price);
    terms.lines[0]!.price.value = '1000';
    terms.lines[0]!.quantity = Number.MAX_SAFE_INTEGER;
    const value = '9007199254740991000';
    const maximumQuantity: U3OrderPriceBreakdown = {
      ...proposalPrice(),
      lineAmounts: [{ currency: 'KRW', value }],
      productAmount: { currency: 'KRW', value },
      total: { currency: 'KRW', value },
    };
    expect(validateProposalPrice(terms, maximumQuantity, schema)).toEqual(maximumQuantity);
    terms.lines[0]!.quantity = Number.MAX_SAFE_INTEGER + 1;
    expect(() => validateProposalPrice(terms, maximumQuantity, schema)).toThrow();
  });
  it('금액 선언의 4096자리 경계는 보존하고 곱/소계/비용 합산 결과가 실제 표현 한도를 넘으면 거절한다', () => {
    const terms = content().proposedTerms;
    const value = '9'.repeat(4096);
    terms.lines[0]!.price.value = value;
    const price: U3OrderPriceBreakdown = {
      ...proposalPrice(),
      lineAmounts: [{ currency: 'KRW', value }],
      productAmount: { currency: 'KRW', value },
      total: { currency: 'KRW', value },
    };
    expect(validateProposalPrice(terms, price, schema)).toEqual(price);
    const unknown: U3OrderPriceBreakdown = {
      ...price,
      lineAmounts: [null],
      productAmount: null,
      total: null,
      knowledge: 'UNKNOWN',
    };
    terms.lines[0]!.quantity = 2;
    expect(() => validateProposalPrice(terms, unknown, schema)).toThrow();
    terms.lines[0]!.quantity = 1;
    terms.lines.push(structuredClone(terms.lines[0]!));
    expect(() =>
      validateProposalPrice(terms, { ...unknown, lineAmounts: [null, null] }, schema),
    ).toThrow();
    terms.lines.pop();
    expect(() =>
      validateProposalPrice(
        terms,
        { ...price, adjustments: [adjustment('fee', 'FEE', '1')] },
        schema,
      ),
    ).toThrow();
    terms.lines[0]!.price.value = '1'.repeat(4097);
    expect(() => validateProposalPrice(terms, unknown, schema)).toThrow();
  });
});
describe('표시 조건 fingerprint와 저장 상태 개정의 분리', () => {
  it('대상·조건 원본 개정·금액·근거·내용 개정의 변경은 이전 동의 fingerprint와 다르다', () => {
    const original = content(),
      before = proposalTermsFingerprint(original, schema);
    for (const change of [
      (copy: ProposalContent) => {
        copy.targetOrderRef!.revision++;
      },
      (copy: ProposalContent) => {
        copy.proposalRevision++;
      },
      (copy: ProposalContent) => {
        copy.proposedTerms.termsRecordRef.revision++;
      },
      (copy: ProposalContent) => {
        copy.targetScope.enterpriseRef.id = 'other-company';
      },
      (copy: ProposalContent) => {
        copy.agreementEvidenceRefs[0]!.revision++;
      },
      (copy: ProposalContent) => {
        copy.originalPriceBreakdown.adjustments = [adjustment('fee', 'FEE', '50')];
        copy.originalPriceBreakdown.total!.value = '1050';
      },
    ]) {
      const copy = structuredClone(original);
      change(copy);
      expect(proposalTermsFingerprint(copy, schema)).not.toBe(before);
    }
    // OPEN→CONSENTED 등의 상태 변화는 조건이 같다면 표시 fingerprint를 바꾸지 않는다.
    const storedAfterConsent = { ...original, result: 'CONSENTED', revision: 2 };
    expect(proposalTermsFingerprint(storedAfterConsent, schema)).toBe(before);
  });
});
