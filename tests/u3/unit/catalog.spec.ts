import { describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator, U3_PROFILE } from '@oms/contracts';
import type { U3ProductInput } from '@oms/contracts';
import {
  buildCommonOffer,
  commonOfferSources,
  withinEffectiveWindow,
} from '../../../packages/core/src/catalog-conditions.js';
import { fixtureRef } from '../fixtures/identity.js';
import { catalogInput } from '../fixtures/catalog.js';

const schema = new SchemaValidator(),
  basis = fixtureRef('ProductCatalog', 'CommonOfferRevision', 'basis'),
  productRef = fixtureRef('ProductCatalog', 'Product', 'server-product'),
  offerRef = fixtureRef('ProductCatalog', 'CommonOfferRevision', 'server-offer'),
  now = new Date('2026-10-12T00:00:00.000Z');
const build = (input: U3ProductInput) =>
  buildCommonOffer({ schema }, input, productRef, offerRef, now);
describe('U3 상품 조건의 판매 정보·기간·정수·초안 경계', () => {
  it('HW 완성 조건을 서버 상품/offer 참조와 정확한 값으로 보존한다', () => {
    const input = catalogInput(basis),
      original = canonicalJson(input);
    const { product, offer } = build(input);
    expect(product).toMatchObject({
      modelVersion: 2,
      saleState: 'OFFERABLE',
      currentOfferRef: offerRef,
    });
    expect(offer).toMatchObject({ productRef, commonPrice: input.commonPrice, visible: true });
    expect(
      (offer!.conditionBindings as { sourceRef: unknown }[]).every(
        (value) => canonicalJson(value.sourceRef) === canonicalJson(offerRef),
      ),
    ).toBe(true);
    expect(canonicalJson(input)).toBe(original);
  });
  it('명시 null 초안은 INCOMPLETE이며 offer/확정 조건을 추측 생성하지 않는다', () => {
    const result = build({ ...catalogInput(basis), offerDraft: null });
    expect(result).toMatchObject({
      product: { saleState: 'INCOMPLETE', currentOfferRef: null },
      offer: null,
    });
  });
  it('필수 조건/개정 근거/항목 근거의 미확인을 공개 조건으로 승격하지 않는다', () => {
    for (const omit of ['PAYMENT', 'PROVISION', 'COMPLETION']) {
      const input = catalogInput(basis);
      input.offerDraft!.conditions = input.offerDraft!.conditions.filter(
        (value) => value.conditionKey !== omit,
      );
      expect(build(input)).toMatchObject({
        product: { saleState: 'INCOMPLETE' },
        offer: { visible: false },
      });
    }
    const input = catalogInput(basis);
    input.offerDraft!.revisionEvidenceRefs = [];
    expect(build(input).product.saleState).toBe('INCOMPLETE');
    input.offerDraft!.revisionEvidenceRefs = [basis];
    input.offerDraft!.conditions[0]!.evidenceRefs = [];
    expect(() => build(input)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    input.offerDraft!.conditions[0]!.evidenceRefs = Array.from({ length: 101 }, (_, index) => ({
      ...basis,
      id: 'basis-' + index,
    }));
    expect(() => build(input)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
  it('SW 영구형은 기간 없이, 기간제는 명시 기간이 있어야 판매 조건이 완성된다', () => {
    const input = {
      ...catalogInput(basis),
      productType: 'SOFTWARE' as const,
      softwareTermKind: 'PERPETUAL' as const,
    };
    expect(build(input).product.saleState).toBe('OFFERABLE');
    const term: U3ProductInput = { ...input, softwareTermKind: 'TERM' };
    expect(build(term).product.saleState).toBe('INCOMPLETE');
    term.offerDraft!.conditions.push({
      conditionKey: 'PERIOD',
      value: {
        startDate: '2026-12-01',
        endDate: '2027-11-30',
        timeZone: 'Asia/Seoul',
        endRule: 'INCLUSIVE_DATE',
        ruleRef: basis,
      },
      effectiveWindow: term.offerDraft!.effectiveWindow,
      evidenceRefs: [basis],
    });
    expect(build(term).product.saleState).toBe('OFFERABLE');
    expect(() => build({ ...term, softwareTermKind: 'PERPETUAL' })).toThrow();
    const period = term.offerDraft!.conditions.find((value) => value.conditionKey === 'PERIOD')!;
    if (period.conditionKey === 'PERIOD') period.value.endDate = '2026-11-30';
    expect(() => build(term)).toThrow();
  });
  it('원 미만/음수/표현 범위 초과 금액과 HW/SW 이용형 오류를 거절한다', () => {
    for (const value of ['1000.5', '-1', '9007199254740992'])
      expect(() =>
        build({ ...catalogInput(basis), commonPrice: { currency: 'KRW', value } }),
      ).toThrow();
    expect(() => build({ ...catalogInput(basis), softwareTermKind: 'TERM' })).toThrow();
    expect(() => build({ ...catalogInput(basis), productType: 'SOFTWARE' })).toThrow();
  });
  it('중복 조건과 서로 다른 단가를 자동 선택/반올림하지 않는다', () => {
    const duplicate = catalogInput(basis);
    duplicate.offerDraft!.conditions.push(duplicate.offerDraft!.conditions[0]!);
    expect(() => build(duplicate)).toThrow();
    expect(() =>
      build({ ...catalogInput(basis), commonPrice: { currency: 'KRW', value: '2000' } }),
    ).toThrow();
  });
  it('공통 비공개 기본값은 완성된 판매 상태와 별도로 보존한다', () => {
    const privateOffer = catalogInput(basis);
    const visibility = privateOffer.offerDraft!.conditions.find(
      (value) => value.conditionKey === 'VISIBILITY',
    )!;
    if (visibility.conditionKey === 'VISIBILITY') visibility.value = false;
    expect(build(privateOffer)).toMatchObject({
      product: { saleState: 'OFFERABLE' },
      offer: { visible: false },
    });
    expect(build({ ...privateOffer, saleState: 'SUSPENDED' })).toMatchObject({
      product: { saleState: 'SUSPENDED' },
      offer: { visible: false },
    });
    expect(build({ ...catalogInput(basis), saleState: 'SUSPENDED' })).toMatchObject({
      product: { saleState: 'SUSPENDED' },
      offer: { visible: true },
    });
  });
  it('미완성·미래·만료 조건은 명시 판매 가능 입력으로도 승격하지 않는다', () => {
    expect(
      build({ ...catalogInput(basis), offerDraft: null, saleState: 'OFFERABLE' }).product.saleState,
    ).toBe('INCOMPLETE');
    for (const effectiveWindow of [
      { ...catalogInput(basis).offerDraft!.effectiveWindow, startAt: '2026-12-01T00:00:00.000Z' },
      { ...catalogInput(basis).offerDraft!.effectiveWindow, endAt: '2026-10-11T00:00:00.000Z' },
    ]) {
      const input = catalogInput(basis);
      input.offerDraft!.effectiveWindow = effectiveWindow;
      input.saleState = 'OFFERABLE';
      expect(build(input).product.saleState).toBe('INCOMPLETE');
    }
  });
  it('유효 구간 시작/종료의 명시 포함 여부를 각각 따른다', () => {
    const window = {
      startAt: now.toISOString(),
      endAt: now.toISOString(),
      startInclusive: true,
      endInclusive: true,
    };
    expect(withinEffectiveWindow(window, now)).toBe(true);
    expect(withinEffectiveWindow({ ...window, startInclusive: false }, now)).toBe(false);
    expect(withinEffectiveWindow({ ...window, endInclusive: false }, now)).toBe(false);
  });
  it('공통 근거는 정확한 refs의 합집합이고 기업 사적 조건은 공통 공개로 바꾸지 않는다', () => {
    expect(commonOfferSources(catalogInput(basis))).toEqual([basis]);
    expect(() =>
      commonOfferSources(
        catalogInput(fixtureRef('CommercialAgreement', 'AgreementRevision', 'private')),
      ),
    ).toThrow();
  });
  it('클라이언트 발급 offer sourceRef/unknown field는 닫힌 draft에서 거절하고 구형 입력을 보존한다', () => {
    const input = catalogInput(basis);
    expect(() =>
      schema.validateUri(U3_PROFILE + '#/$defs/ProductInput', {
        ...input,
        offerDraft: {
          ...input.offerDraft,
          conditions: [{ ...input.offerDraft!.conditions[0], sourceRef: offerRef }],
        },
      }),
    ).toThrow();
    const { offerDraft: _draft, ...legacy } = input;
    expect(_draft).not.toBeNull();
    expect(schema.validate('ProductInput', legacy)).toEqual(legacy);
    expect(() => schema.validateUri(U3_PROFILE + '#/$defs/ProductInput', legacy)).toThrow();
  });
  it('U3 기업 상품 출력만 비공개 공통가격 null을 허용하며 기존 common 출력과 값/참조 경계는 유지한다', () => {
    const view = {
      productRef,
      commonOfferRevisionRef: offerRef,
      productType: 'HARDWARE',
      softwareTermKind: null,
      label: '합성 상품',
      salesDescription: '승인된 기업 상품 정보',
      visible: true,
      commonPrice: null,
      resolvedPrice: { currency: 'KRW', value: '900' },
      salesConditionRefs: [],
      priceKnowledge: 'KNOWN',
    };
    expect(schema.validateUri(U3_PROFILE + '#/$defs/ProductView', view)).toEqual(view);
    const { commonPrice: _private, ...legacyV1 } = view;
    expect(_private).toBeNull();
    expect(schema.validate('ProductView', legacyV1, 1)).toEqual(legacyV1);
    expect(() => schema.validate('ProductView', view, 1)).toThrow();
    expect(() => schema.validate('ProductView', view, 2)).toThrow();
    expect(
      schema.validate(
        'ProductView',
        { ...view, commonPrice: { currency: 'KRW', value: '1000' } },
        2,
      ),
    ).toBeTruthy();
    expect(
      schema.validateUri(U3_PROFILE + '#/$defs/ProductViewResult', {
        knowledge: 'KNOWN',
        data: view,
        sourceRefs: [productRef, offerRef],
        observedAt: now.toISOString(),
      }),
    ).toBeTruthy();
    for (const change of [
      { label: '' },
      { label: 'x'.repeat(4097) },
      { salesDescription: '' },
      { productType: 'HW' },
      { softwareTermKind: 'UNKNOWN' },
      { visible: 'true' },
      { priceKnowledge: 'YES' },
      { resolvedPrice: { currency: 'KRW', value: '900.5' } },
      { commonPrice: { currency: 'USD', value: '1000' } },
      { productRef: { ...productRef, revision: 0 } },
      { productRef: { ...productRef, owner: 'Unknown' } },
      { salesConditionRefs: [{ ...basis, extra: true }] },
      { privateNotes: '허용하지 않은 원본' },
    ])
      expect(() =>
        schema.validateUri(U3_PROFILE + '#/$defs/ProductView', { ...view, ...change }),
      ).toThrow();
    expect(() => schema.validateUri(U3_PROFILE + '#/$defs/ProductView', legacyV1)).toThrow();
    for (const saleState of ['INCOMPLETE', 'UNKNOWN', null])
      expect(() =>
        schema.validateUri(U3_PROFILE + '#/$defs/ProductInput', {
          ...catalogInput(basis),
          saleState,
        }),
      ).toThrow();
  });
});
