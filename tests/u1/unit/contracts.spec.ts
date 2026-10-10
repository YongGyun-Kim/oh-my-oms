import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  fingerprint,
  OmsError,
  requireCondition,
  SchemaValidator,
} from '@oms/contracts';

const ref = { owner: 'EnterpriseAccess', entity: 'Enterprise', id: 'enterprise-a', revision: 1 };
const meta = {
  clientRequestId: 'request-a',
  expectedRevision: null,
  reason: '합성 시험',
  evidenceRefs: [],
};
const scope = {
  enterpriseRef: ref,
  departmentRef: null,
  siteRef: null,
  contextPolicyRef: ref,
  organisationRevision: 1,
};
const line = {
  productRef: { owner: 'ProductCatalog', entity: 'Product', id: 'product-a', revision: 1 },
  commonOfferRevisionRef: {
    owner: 'ProductCatalog',
    entity: 'CommonOfferRevision',
    id: 'offer-a',
    revision: 1,
  },
  agreementRevisionRef: null,
  quantity: 1,
  paymentMode: 'PREPAY',
  requestedActivationDate: null,
};
const order = (count: number) => ({
  meta,
  targetScope: scope,
  productType: 'HARDWARE',
  lines: Array.from({ length: count }, () => ({ ...line })),
  provisionChoice: 'FULL',
  partialConsentRef: null,
});

describe('canonical schema2020-12 계약', () => {
  const schema = new SchemaValidator();
  it('유효100항목을 구매 수량과 별개로 허용한다', () => {
    const data = order(100);
    data.lines[0]!.quantity = 1000;
    expect(schema.validate('OrderInput', data)).toEqual(data);
  });
  it('101항목 전체를 거절하고 원본 입력을 줄이지 않는다', () => {
    const data = order(101);
    expect(() => schema.validate('OrderInput', data)).toThrow(OmsError);
    expect(data.lines).toHaveLength(101);
  });
  it('이전v1 decoder가 새 제한과 별도로 보존된다', () => {
    expect(schema.validate('OrderInput', order(101), 1)).toEqual(order(101));
  });
  it('0항목/양수가 아닌 수량을 거절한다', () => {
    expect(() => schema.validate('OrderInput', order(0))).toThrow();
    const data = order(1);
    data.lines[0]!.quantity = 0;
    expect(() => schema.validate('OrderInput', data)).toThrow();
  });
  it('명시NULL과 required 누락을 구별한다', () => {
    const data = order(1) as Record<string, unknown>;
    delete (data.targetScope as Record<string, unknown>).departmentRef;
    expect(() => schema.validate('OrderInput', data)).toThrow();
  });
  it('미등록 input property와 잘못된 Money를 거절한다', () => {
    expect(() =>
      schema.validate('Money', { currency: 'KRW', value: '1.23', role: 'admin' }),
    ).toThrow();
    expect(() => schema.validate('Money', { currency: 'USD', value: '1' })).toThrow();
    expect(() => schema.validate('Money', { currency: 'KRW', value: '0.1' })).not.toThrow();
    expect(() => schema.validate('Money', { currency: 'KRW', value: 0.1 })).toThrow();
  });
  it('실제 달력 날짜와 timestamp 형식을 검증한다', () => {
    expect(() => schema.validate('Date', '2026-02-30')).toThrow();
    expect(() => schema.validate('Instant', 'yesterday')).toThrow();
    expect(schema.validate('Date', '2026-12-01')).toBe('2026-12-01');
  });
  it('CE01–04의 required/null/closed schema를 검증한다', () => {
    const base = 'urn:oms:contract:foundation:1#/$defs/';
    expect(
      schema.validateUri(base + 'SetOrderingContextPolicyInput', {
        meta,
        departmentUsage: 'USED',
        siteUsage: 'NOT_USED',
      }),
    ).toBeTruthy();
    expect(() =>
      schema.validateUri(base + 'SetOrderingContextPolicyInput', {
        meta,
        departmentUsage: 'UNSET',
        siteUsage: 'NOT_USED',
      }),
    ).toThrow();
    expect(() =>
      schema.validateUri(base + 'DesignateInitialAdministratorInput', { meta, accountRef: ref }),
    ).toThrow();
    expect(() =>
      schema.validateUri(base + 'ApplicationFilter', { status: null, cursor: null, pageSize: 101 }),
    ).toThrow();
    expect(() =>
      schema.validateUri(base + 'ReviewAssessmentViewResult', { knowledge: 'UNKNOWN', data: null }),
    ).toThrow();
  });
});

describe('정규 내용 식별과 오류', () => {
  it('객체 key 순서만 다르면 같은 식별자를 갖는다', () => {
    expect(fingerprint({ b: 1, a: null })).toBe(fingerprint({ a: null, b: 1 }));
  });
  it('품목 순서·원래 내용 변경은 다른 식별자를 갖는다', () => {
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });
  it('숫자/문자열과 정확한 decimal 문자열을 구별한다', () => {
    expect(fingerprint('0.10')).not.toBe(fingerprint(0.1));
    expect(canonicalJson({ value: '12345678901234567890.1234' })).toContain(
      '12345678901234567890.1234',
    );
  });
  it('NaN/infinity/unsafe integer/undefined를 거절한다', () => {
    for (const value of [NaN, Infinity, 9007199254740992, undefined])
      expect(() => canonicalJson(value)).toThrow();
  });
  it('prototype를 가진 객체를 JSON으로 가장하지 않는다', () => {
    expect(() => canonicalJson(new Date())).toThrow();
  });
  it('명시적 boolean/null/문자열을 보존한다', () => {
    expect(canonicalJson([true, false, null, '한글'])).toBe('[true,false,null,"한글"]');
  });
  it('거절 status/code를 유지하고 정상조건은 통과한다', () => {
    expect(() => requireCondition(true, 400, 'BAD', '거절')).not.toThrow();
    try {
      requireCondition(false, 403, 'DENY', '권한 없음');
    } catch (error) {
      expect(error).toMatchObject({ name: 'OmsError', status: 403, code: 'DENY' });
    }
  });
});
