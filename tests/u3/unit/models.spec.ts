import { describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator } from '@oms/contracts';
import {
  MODELS,
  ALL_MODELS,
  U3_MODELS,
  modelDefinition,
  materialSchemas,
  decodeU3Model,
  physicalData,
  recordedSourceContract,
  storedModelData,
  rowModelVersion,
  currentSecurityMatches,
  validateModel,
} from '@oms/persistence';
import {
  modelFixture,
  modernProduct,
  legacyProduct,
  legacyOffer,
  capturedLine,
  sourceContract,
} from '../fixtures/models.js';

const schema = new SchemaValidator();
describe('18개 논리 모델과 단일 물리 등록', () => {
  it('제안 선택 expand는 과거 bytes를 보존하고 저장 개정/내용 개정이 다른 동의도 등록 형식을 유지한다', () => {
    const old = modelFixture('CommercialProposal'),
      before = canonicalJson(old);
    expect(decodeU3Model('CommercialProposal', 2, old, schema)).toEqual(old);
    expect(canonicalJson(old)).toBe(before);
    const complete = {
      ...old,
      originalPriceBreakdown: old.priceBreakdown,
      termsFingerprint: 'a'.repeat(64),
      supersedesRef: null,
    };
    expect(decodeU3Model('CommercialProposal', 2, complete, schema)).toEqual(complete);
    for (const change of [
      { termsFingerprint: 'client-known' },
      { originalPriceBreakdown: null },
      {
        supersedesRef: {
          owner: 'CommercialAgreement',
          entity: 'AgreementRevision',
          id: 'other',
          revision: 1,
        },
      },
    ])
      expect(() =>
        decodeU3Model('CommercialProposal', 2, { ...complete, ...change }, schema),
      ).toThrow();
    const consent = { ...modelFixture('CustomerConsent'), proposalRevision: 2 };
    expect(decodeU3Model('CustomerConsent', 2, consent, schema)).toEqual(consent);
  });
  it('U1 공개43개 projection을 유지하고 U3 18개를 중복 없이 연결한다', () => {
    expect(MODELS).toHaveLength(43);
    expect(U3_MODELS).toHaveLength(18);
    expect(new Set(ALL_MODELS.map((model) => model.name)).size).toBe(ALL_MODELS.length);
    expect(materialSchemas().map((model) => model.options.name)).toEqual(
      ALL_MODELS.map((model) => model.name),
    );
    for (const current of U3_MODELS)
      expect(ALL_MODELS.filter((model) => model.name === current.name)).toHaveLength(1);
  });
  it.each(U3_MODELS.map((model) => model.name))(
    '%s의 current model2를 실제 닫힌 decoder로 읽는다',
    (name) => {
      const data = modelFixture(name);
      expect(decodeU3Model(name, 2, data, schema)).toEqual(data);
      expect(() => decodeU3Model(name, 2, { ...data, extra: true }, schema)).toThrow();
      const missing = { ...data };
      delete missing.modelVersion;
      expect(() => decodeU3Model(name, 2, missing, schema)).toThrow();
    },
  );
  it('기존 stable key·owner를 재명명하지 않는다', () => {
    expect(modelDefinition('CommonOfferRevision').attributes[0]?.name).toBe('offerRevisionId');
    expect(modelDefinition('OrderLine').attributes[0]?.name).toBe('lineId');
    expect(modelDefinition('AcceptanceDecision').attributes[0]?.name).toBe('decisionId');
    for (const current of U3_MODELS)
      expect(modelDefinition(current.name).owner).toBe(current.owner);
  });
  it('구형 원본을 새 필드/승인/정수 가격으로 추정하지 않는다', () => {
    const product = legacyProduct(),
      offer = legacyOffer(product),
      before = canonicalJson(offer);
    expect(decodeU3Model('Product', 1, product, schema)).toEqual(product);
    expect(decodeU3Model('CommonOfferRevision', 1, offer, schema)).toEqual(offer);
    expect(canonicalJson(offer)).toBe(before);
    expect((offer.commonPrice as { value: string }).value).toBe('1000.5');
    expect(() => decodeU3Model('Product', 2, product, schema)).toThrow();
    expect(() => decodeU3Model('Product', 1, modernProduct(), schema)).toThrow();
    expect(() => decodeU3Model('EnterpriseContract', 1, {}, schema)).toThrow();
  });
  it('version3/unknown model/명시1/문자열2를 decoder 선택으로 속이지 않는다', () => {
    for (const version of [0, 3])
      expect(() => decodeU3Model('Product', version, modernProduct(), schema)).toThrow();
    expect(() => decodeU3Model('NotRegistered', 2, {}, schema)).toThrow();
    for (const modelVersion of [1, '2', null])
      expect(() =>
        decodeU3Model('Product', 2, { ...modernProduct(), modelVersion }, schema),
      ).toThrow();
  });
});
describe('금액·기간·미확인·원본 버전 보존', () => {
  it('current 원 단위만 허용하고 NULL·0원·UNKNOWN을 구별한다', () => {
    const offer = modelFixture('CommonOfferRevision');
    expect(() =>
      decodeU3Model(
        'CommonOfferRevision',
        2,
        { ...offer, commonPrice: { currency: 'KRW', value: '1.5' } },
        schema,
      ),
    ).toThrow();
    const line = modelFixture('OrderLine');
    expect(
      decodeU3Model(
        'OrderLine',
        2,
        { ...line, priceKnowledge: 'UNKNOWN', purchasePrice: null },
        schema,
      ),
    ).toBeTruthy();
    expect(() =>
      decodeU3Model('OrderLine', 2, { ...line, priceKnowledge: 'UNKNOWN' }, schema),
    ).toThrow();
    expect(() => decodeU3Model('OrderLine', 2, { ...line, purchasePrice: null }, schema)).toThrow();
  });
  it('잘못된 기간·행 위치·수량과 snapshot 계약 누락을 거절한다', () => {
    const line = modelFixture('OrderLine');
    for (const partial of [
      { position: 101 },
      { quantity: 0 },
      { quantity: 1.5 },
      { agreementRevisionRefs: [] },
      {
        agreedPeriod: {
          startDate: '2027-01-01',
          endDate: '2026-12-01',
          timeZone: 'Asia/Seoul',
          endRule: 'INCLUSIVE_DATE',
          ruleRef: line.commonOfferRevisionRef,
        },
      },
    ])
      expect(() => decodeU3Model('OrderLine', 2, { ...line, ...partial }, schema)).toThrow();
    const snapshot = modelFixture('PurchaseTermsSnapshot');
    expect(() =>
      decodeU3Model('PurchaseTermsSnapshot', 2, { ...snapshot, agreementRevisionRefs: [] }, schema),
    ).toThrow();
  });
  it('추가 nested source field·정수 변환/자동 backfill을 허용하지 않는다', () => {
    const snapshot = modelFixture('PurchaseTermsSnapshot');
    expect(() =>
      decodeU3Model(
        'PurchaseTermsSnapshot',
        2,
        { ...snapshot, capturedLines: [{ ...capturedLine(), password: 'synthetic-canary' }] },
        schema,
      ),
    ).toThrow();
    expect(() =>
      decodeU3Model(
        'Product',
        2,
        { ...modernProduct(), revision: Number.MAX_SAFE_INTEGER + 1 },
        schema,
      ),
    ).toThrow();
  });
  it('expand의 NULL 컬럼은 구형 읽기에서 제거하되 새 값이 섞이면 거절한다', () => {
    const old = legacyProduct();
    expect(storedModelData('Product', { ...old, modelVersion: null, saleState: null })).toEqual(
      old,
    );
    expect(() =>
      storedModelData('Product', { ...old, modelVersion: null, saleState: 'OFFERABLE' }),
    ).toThrow();
    expect(rowModelVersion('Product', old)).toBe(1);
    expect(rowModelVersion('Product', modernProduct())).toBe(2);
  });
  it('과거 Receipt의 미기록 실제 contract version을 UNKNOWN으로 보존한다', () => {
    const receipt = { requestId: 'old', resultRefs: [], requestState: 'RESULT_RECORDED' };
    expect(recordedSourceContract(receipt, schema)).toEqual({ knowledge: 'UNKNOWN' });
    expect(receipt).toEqual({ requestId: 'old', resultRefs: [], requestState: 'RESULT_RECORDED' });
    expect(recordedSourceContract({ ...receipt, sourceContract }, schema)).toEqual({
      knowledge: 'KNOWN',
      ...sourceContract,
    });
    expect(() =>
      recordedSourceContract(
        { ...receipt, sourceContract: { ...sourceContract, registryVersion: 2 } },
        schema,
      ),
    ).toThrow();
  });
  it.each(['RequestReceipt', 'WorkItem', 'FactEnvelope'])(
    '%s의 새 metadata 부재만 과거 projection에서 제거하며 실제 값 변경은 거절한다',
    (name) => {
      const legacy = MODELS.find((model) => model.name === name)!;
      const original = Object.fromEntries(
        legacy.attributes.map((attribute) => [attribute.name, 'synthetic-' + attribute.name]),
      );
      for (const missing of [null, undefined]) {
        const projected = storedModelData(name, { ...original, sourceContract: missing });
        expect(projected).toEqual(original);
        expect(canonicalJson(projected)).toBe(canonicalJson(original));
      }
      for (const value of [sourceContract, { ...sourceContract, registryVersion: 2 }, 'forged']) {
        const changed = { ...original, sourceContract: value };
        expect(storedModelData(name, changed)).toEqual(changed);
        expect(currentSecurityMatches(name, original, changed)).toBe(false);
      }
      const versionField = name === 'FactEnvelope' ? 'aggregateVersion' : 'revision';
      expect(legacy.attributes.some((attribute) => attribute.name === versionField)).toBe(true);
      const changed = { ...original, [versionField]: 2, sourceContract: null };
      expect(canonicalJson(storedModelData(name, changed))).not.toBe(canonicalJson(original));
      if (name === 'FactEnvelope')
        expect(() => validateModel(name, { ...original, revision: 2 }, schema)).toThrowError(
          expect.objectContaining({ code: 'UNKNOWN_MODEL_FIELD' }),
        );
    },
  );
  it('현재 FK는 안정 ID를 보존하며 잘못된 대상 타입은 decoder가 거절한다', () => {
    const contract = modelFixture('EnterpriseContract');
    expect(physicalData('EnterpriseContract', contract)).toMatchObject({
      enterpriseRefKey: (contract.enterpriseRef as { id: string }).id,
    });
    expect(() =>
      decodeU3Model(
        'EnterpriseContract',
        2,
        {
          ...contract,
          enterpriseRef: { owner: 'ProductCatalog', entity: 'Product', id: 'p', revision: 1 },
        },
        schema,
      ),
    ).toThrow();
  });
});
