import { describe, expect, it } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
const validator = new SchemaValidator();
const root = 'urn:oms:contract:foundation:1#/$defs/';
const ref = { owner: 'ProductCatalog', entity: 'CommonOfferRevision', id: 'offer', revision: 1 };
const captured = {
  sourceOfferRef: ref,
  displayedPrice: { currency: 'KRW', value: '100' },
  requestedPaymentMode: 'PREPAY',
  requestedActivationDate: null,
  agreedPeriod: null,
  paymentTermsRef: null,
  completionBasisRef: null,
  agreementRevisionRef: null,
  knowledge: {
    displayedPrice: 'KNOWN',
    enterprisePrice: 'UNKNOWN',
    agreedPeriod: 'UNKNOWN',
    paymentTerms: 'UNKNOWN',
    completionBasis: 'UNKNOWN',
    agreement: 'UNKNOWN',
  },
  evidenceRefs: [],
};
const assessment = {
  sourceOwner: 'HardwareFulfillment',
  knowledge: 'UNKNOWN',
  reasonKind: 'UNVERIFIED',
  reasonCode: 'MODULE_NOT_REGISTERED',
  observedAt: '2026-10-08T00:00:00Z',
  sourceRevision: null,
  basisRefs: [],
};
const basis = {
  actorAccountRef: null,
  verifiedPersonRef: null,
  evidenceRefs: [],
  targetRevision: 1,
  decision: 'APPROVE',
  knowledge: 'UNKNOWN',
  reasonCode: 'INSUFFICIENT_BASIS',
  decidedAt: '2026-10-08T00:00:00Z',
  reason: '합성 근거 대기',
};
describe('전체 after-image의 닫힌 업무 snapshot 계약', () => {
  it('실제 표시 공통가격과 미확인 기업/기간/지급을 따로 보존한다', () => {
    expect(validator.validateUri(root + 'CapturedLineTermsSnapshot', captured)).toEqual(captured);
  });
  it('nested unknown 비밀/행위필드는 원장 snapshot에 들어가지 못한다', () => {
    for (const value of [
      { ...captured, providerToken: 'canary' },
      { ...captured, knowledge: { ...captured.knowledge, role: 'admin' } },
    ])
      expect(() => validator.validateUri(root + 'CapturedLineTermsSnapshot', value)).toThrow();
  });
  it('다른 offer owner와 계약되지 않은 실제 기간 객체는 성공으로 저장하지 않는다', () => {
    for (const value of [
      { ...captured, sourceOfferRef: { ...ref, entity: 'Product' } },
      { ...captured, agreedPeriod: { start: '2026-12-01' } },
    ])
      expect(() => validator.validateUri(root + 'CapturedLineTermsSnapshot', value)).toThrow();
  });
  it('결정 근거는 확인 시각/개정/행위자·사유를 보존하고 arbitrary 객체는 거절한다', () => {
    expect(validator.validateUri(root + 'DecisionBasisSnapshot', basis)).toEqual(basis);
    expect(() =>
      validator.validateUri(root + 'DecisionBasisSnapshot', { ...basis, password: 'canary' }),
    ).toThrow();
  });
  it('각 외부 owner 판단은4가지 사유·현재 관측·원본 개정만 인정한다', () => {
    expect(validator.validateUri(root + 'OwnerAssessmentSnapshot', assessment)).toEqual(assessment);
    for (const value of [
      { ...assessment, sourceOwner: 'FakeAvailability' },
      { ...assessment, reasonKind: 'SUCCESS' },
      { ...assessment, observedAt: 'unknown' },
      { ...assessment, sourceRevision: 0 },
    ])
      expect(() => validator.validateUri(root + 'OwnerAssessmentSnapshot', value)).toThrow();
  });
  it('100/101 품목 경계는 captured terms와 assessment 두 snapshot에서 일치한다', () => {
    const line = {
      lineRef: { owner: 'OrderAcceptance', entity: 'OrderLine', id: 'line', revision: 1 },
      assessments: [assessment],
    };
    expect(() =>
      validator.validateUri(
        root + 'CapturedLineTermsListSnapshot',
        Array.from({ length: 100 }, () => captured),
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateUri(
        root + 'LineAssessmentListSnapshot',
        Array.from({ length: 100 }, () => line),
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateUri(
        root + 'CapturedLineTermsListSnapshot',
        Array.from({ length: 101 }, () => captured),
      ),
    ).toThrow();
    expect(() =>
      validator.validateUri(
        root + 'LineAssessmentListSnapshot',
        Array.from({ length: 101 }, () => line),
      ),
    ).toThrow();
  });
  it('없는 평가·다른 품목 참조를 보호된 전체 판단으로 만들지 않는다', () => {
    const line = { lineRef: { ...ref, entity: 'Product' }, assessments: [] };
    expect(() => validator.validateUri(root + 'LineAssessmentListSnapshot', [line])).toThrow();
  });
  it('조직 정책은 미설정/미사용을 구별하고 secret/이름 기반 자동 정책은 거절한다', () => {
    expect(() =>
      validator.validateUri(root + 'OrderingContextPolicySnapshot', {
        departmentUsage: 'UNSET',
        siteUsage: 'NOT_USED',
        setBy: null,
        setAt: null,
        reason: '명시적 합성 기준',
      }),
    ).not.toThrow();
    expect(() =>
      validator.validateUri(root + 'OrderingContextPolicySnapshot', {
        departmentUsage: 'UNSET',
        siteUsage: 'NOT_USED',
        setBy: null,
        setAt: null,
        reason: '명시적 합성 기준',
        password: 'canary',
      }),
    ).toThrow();
  });
});
