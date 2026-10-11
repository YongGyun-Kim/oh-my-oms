import { describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator, U3_PROFILE } from '@oms/contracts';
import {
  decodeAppliedTerms,
  decodeU3Model,
  physicalData,
  storedModelData,
  U3_MODELS,
} from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import { appliedTermsFixture } from '../fixtures/applied-terms.js';
import { modelFixture } from '../fixtures/models.js';

const schema = new SchemaValidator();
describe('등록 인라인 적용 조건·역사 원상과 현재 조건 decoder 분리', () => {
  it('18개 업무 모델 유지·선택 nullable 등록이며 구형 missing/null bytes를 추정하지 않는다', () => {
    expect(U3_MODELS).toHaveLength(18);
    const model = U3_MODELS.find((value) => value.name === 'OrderChangeApplication')!;
    expect(model.attributes.find((value) => value.name === 'appliedTerms')).toEqual({
      name: 'appliedTerms',
      type: 'U3Contract:AppliedTerms',
      required: false,
      nullable: true,
    });
    for (const old of [
      modelFixture('OrderChangeApplication'),
      { ...modelFixture('OrderChangeApplication'), appliedTerms: null },
    ]) {
      const bytes = canonicalJson(old);
      expect(decodeU3Model('OrderChangeApplication', 2, old, schema)).toEqual(old);
      expect(canonicalJson(old)).toBe(bytes);
      expect(() => decodeAppliedTerms(old, schema)).toThrowError(
        expect.objectContaining({ code: 'APPLIED_TERMS_UNCONFIRMED' }),
      );
    }
  });
  it('닫힌 값·실제 새 조건 원본·저장/내용 개정 분리를 보존하고 복사본으로 반환한다', () => {
    const applied = appliedTermsFixture(),
      application: ModelData = { ...modelFixture('OrderChangeApplication'), appliedTerms: applied };
    applied.proposalRevision = 2;
    const original = canonicalJson(application),
      value = decodeAppliedTerms(application, schema);
    expect(value.proposalRevision).toBe(2);
    expect(application.revision).toBe(1);
    value.priceBreakdown.total!.value = '1';
    expect(canonicalJson(application)).toBe(original);
    expect(
      storedModelData(
        'OrderChangeApplication',
        physicalData('OrderChangeApplication', application),
      ),
    ).toEqual(application);
    expect(() => decodeU3Model('OrderChangeApplication', 1, application, schema)).toThrow();
    expect(() => decodeAppliedTerms({ ...application, modelVersion: 1 }, schema)).toThrow();
    expect(() =>
      decodeAppliedTerms(
        { ...application, sourceContract: { profile: U3_PROFILE, registryVersion: 3 } },
        schema,
      ),
    ).toThrow();
  });
  it('누락/열린 필드·UNKNOWN·금액/행/기간/지급/조건·지문/원본 매핑 모순을 차단한다', () => {
    const changes: ((value: ReturnType<typeof appliedTermsFixture>) => void)[] = [
      (value) => {
        Object.assign(value, { approved: true });
      },
      (value) => {
        value.termsFingerprint = 'known';
      },
      (value) => {
        value.proposalRevision = 0;
      },
      (value) => {
        value.priceBreakdown.knowledge = 'UNKNOWN';
        value.priceBreakdown.total = null;
      },
      (value) => {
        value.priceBreakdown.lineAmounts[0] = null;
      },
      (value) => {
        value.priceBreakdown.productAmount = { currency: 'KRW', value: '1001' };
      },
      (value) => {
        value.terms.lines[0]!.quantity = 2;
      },
      (value) => {
        value.capturedLines[0]!.conditionBindings = [];
      },
      (value) => {
        value.capturedLines[0]!.paymentTermsRef = null;
      },
      (value) => {
        value.terms.lines[0]!.conditionRefs = [];
      },
      (value) => {
        value.capturedLines[0]!.agreedPeriod = {
          startDate: '2027-01-01',
          endDate: '2026-12-01',
          timeZone: 'Asia/Seoul',
          endRule: 'INCLUSIVE_DATE',
          ruleRef: value.terms.termsRecordRef,
        };
      },
    ];
    for (const change of changes) {
      const value = appliedTermsFixture();
      change(value);
      expect(() => schema.validateUri(U3_PROFILE + '#/$defs/AppliedTerms', value)).toThrow();
    }
    const value = {
      ...modelFixture('OrderChangeApplication'),
      appliedTerms: appliedTermsFixture(),
    };
    expect(() =>
      decodeAppliedTerms({ ...value, actualApplicationResult: 'CONFIRMATION_REQUIRED' }, schema),
    ).toThrow();
    expect(() =>
      decodeAppliedTerms(
        { ...value, changedTermsRef: { ...value.appliedTerms.terms.termsRecordRef, revision: 2 } },
        schema,
      ),
    ).toThrow();
    const missing = structuredClone(value.appliedTerms);
    Reflect.deleteProperty(missing, 'targetScope');
    expect(() => schema.validateUri(U3_PROFILE + '#/$defs/AppliedTerms', missing)).toThrow();
  });
});
