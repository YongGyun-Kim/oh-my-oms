import { describe, expect, it } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import {
  U4_MODELS,
  U4_SUPPORT_MODELS,
  validateModel,
  modelForData,
  rowModelVersion,
  storedModelData,
  recordedSourceContract,
  U4_SOURCE_CONTRACT,
} from '@oms/persistence';
import { modelFixture, legacyProduct } from '../../u3/fixtures/models.js';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Money, u4Plan, u4Ref, u4Scope } from '../fixtures/contracts.js';

describe('U4 model originals and version boundaries', () => {
  const schema = new SchemaValidator();
  it('공통 금융 사실의 정확한 계약4에서만 실제 사람 검증 Ref를 보존한다', () => {
    const fact = {
      eventId: 'synthetic-financial-fact',
      sourceOwner: 'FinancialSettlement',
      aggregateRef: u4Ref('FinancialSettlement', 'Invoice'),
      aggregateVersion: 1,
      sourceFactRef: u4Ref('FinancialSettlement', 'FinancialHistory'),
      targetScope: u4Scope(),
      causationRequestId: 'synthetic-request',
      correlationId: 'synthetic-correlation',
      schemaVersion: 'urn:oms:contract:u4-financial:1',
      supersedesFactRef: null,
      evidenceRefs: [
        u4Ref('IdentityRecovery', 'PersonVerification'),
        u4Ref('IdentityRecovery', 'VerificationEvidence'),
      ],
      occurredAt: '2026-12-01T00:00:00.000Z',
      sourceContract: U4_SOURCE_CONTRACT,
    };
    expect(validateModel('FactEnvelope', fact, schema)).toBe(fact);
    for (const sourceContract of [
      null,
      { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 },
      { ...U4_SOURCE_CONTRACT, registryVersion: 3 },
      { ...U4_SOURCE_CONTRACT, extra: true },
      { profile: 'urn:oms:contract:unregistered:1', registryVersion: 4 },
    ])
      expect(() => validateModel('FactEnvelope', { ...fact, sourceContract }, schema)).toThrow();
    expect(() =>
      validateModel(
        'FactEnvelope',
        { ...fact, evidenceRefs: [u4Ref('IdentityRecovery', 'UnregisteredEvidence')] },
        schema,
      ),
    ).toThrow();
    const legacy = { ...fact, evidenceRefs: [], sourceContract: null };
    expect(validateModel('FactEnvelope', legacy, schema)).toBe(legacy);
  });
  it('업무 원본9개와 기존 보조8개·새 완료 근거 원상1개를 검증한다', () => {
    expect(U4_MODELS).toHaveLength(9);
    expect(U4_SUPPORT_MODELS).toHaveLength(9);
    expect(
      U4_SUPPORT_MODELS.filter((model) => model.name === 'FinancialCompletionBasis'),
    ).toHaveLength(1);
    for (const model of [...U4_MODELS, ...U4_SUPPORT_MODELS])
      expect(validateModel(model.name, u4ModelFixture(model.name), schema)).toBeDefined();
  });
  it('rejects missing and null mandatory identity and version fields', () => {
    const claim = u4ModelFixture('FinancialIdentityClaim');
    for (const field of [
      'claimId',
      'canonicalPaymentId',
      'sourceNamespace',
      'canonicalIdentity',
      'modelVersion',
    ]) {
      const missing = { ...claim };
      delete missing[field];
      expect(() => validateModel('FinancialIdentityClaim', missing, schema)).toThrow();
      expect(() =>
        validateModel('FinancialIdentityClaim', { ...claim, [field]: null }, schema),
      ).toThrow();
    }
  });
  it('does not confirm a candidate from a checkbox or absent real identity', () => {
    const payment = u4ModelFixture('PaymentEvidence');
    expect(() =>
      validateModel('PaymentEvidence', { ...payment, lifecycle: 'CONFIRMED' }, schema),
    ).toThrow();
    expect(() =>
      validateModel('PaymentEvidence', { ...payment, arbitraryConfirmation: true }, schema),
    ).toThrow();
  });
  it('keeps exact principal and reservation conservation', () => {
    const balance = u4ModelFixture('FinancialPaymentBalance');
    expect(() =>
      validateModel(
        'FinancialPaymentBalance',
        { ...balance, allocatedPrincipal: u4Money('80'), unallocatedReserved: u4Money('21') },
        schema,
      ),
    ).toThrow();
    expect(
      validateModel(
        'FinancialPaymentBalance',
        { ...balance, allocatedPrincipal: u4Money('80'), unallocatedReserved: u4Money('20') },
        schema,
      ),
    ).toBeDefined();
  });
  it('detects canonical claim material and obligation binding mismatches', () => {
    expect(() =>
      validateModel(
        'FinancialIdentityClaim',
        { ...u4ModelFixture('FinancialIdentityClaim'), canonicalIdentity: 'different' },
        schema,
      ),
    ).toThrow();
    expect(() =>
      validateModel(
        'FinancialInvoiceBinding',
        { ...u4ModelFixture('FinancialInvoiceBinding'), orderId: 'different' },
        schema,
      ),
    ).toThrow();
  });
  it('distinguishes legacy/version2 bytes from explicit U3 version3', () => {
    const old = modelFixture('Order');
    expect(rowModelVersion('Order', old)).toBe(2);
    expect(() => validateModel('Order', { ...old, paymentPlan: u4Plan() }, schema)).toThrow();
    const current = { ...old, modelVersion: 3, paymentKind: 'MIXED', paymentPlan: u4Plan() };
    expect(validateModel('Order', current, schema)).toBe(current);
    expect(rowModelVersion('Order', current)).toBe(3);
    expect(modelForData('Product', legacyProduct()).name).toBe('Product');
    expect(() => storedModelData('Order', { ...old, paymentPlan: u4Plan() })).toThrow();
  });
  it('model3 계약의 합의 근거 목록은 U4 Ref로 검증하며 기존 model2·위조 거절을 보존한다', () => {
    const evidence = {
      owner: 'IdentityRecovery',
      entity: 'VerificationEvidence',
      id: 'synthetic-proof',
      revision: 1,
    };
    const old = { ...modelFixture('AgreementRevision'), agreementEvidenceRefs: [evidence] };
    expect(validateModel('AgreementRevision', old, schema)).toBe(old);
    const { planRevision, total, obligations, knowledge } = u4Plan();
    const current = {
      ...old,
      modelVersion: 3,
      paymentPlan: null,
      paymentPlanDraft: { planRevision, total, obligations, knowledge },
    };
    expect(validateModel('AgreementRevision', current, schema)).toBe(current);
    for (const original of [old, current])
      expect(() =>
        validateModel(
          'AgreementRevision',
          { ...original, agreementEvidenceRefs: [{ ...evidence, entity: 'UnregisteredEvidence' }] },
          schema,
        ),
      ).toThrow();
  });
  it('refuses refund portion totals and current operation mismatch', () => {
    const row = u4ModelFixture('RefundCase');
    expect(() =>
      validateModel('RefundCase', { ...row, requestedAmount: u4Money('2') }, schema),
    ).toThrow();
    const parts = structuredClone(row.portions) as { currentResult: { operationId: string } }[];
    parts[0]!.currentResult.operationId = 'other';
    expect(() => validateModel('RefundCase', { ...row, portions: parts }, schema)).toThrow();
  });
  it('공통 원본의 U4 계약을 정확히 판독하면서 구버전과 위조 거절을 유지한다', () => {
    expect(recordedSourceContract({}, schema)).toEqual({ knowledge: 'UNKNOWN' });
    expect(
      recordedSourceContract(
        { sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 } },
        schema,
      ),
    ).toEqual({
      knowledge: 'KNOWN',
      profile: 'urn:oms:contract:u3-commercial:2',
      registryVersion: 3,
    });
    expect(recordedSourceContract({ sourceContract: U4_SOURCE_CONTRACT }, schema)).toEqual({
      knowledge: 'KNOWN',
      ...U4_SOURCE_CONTRACT,
    });
    for (const sourceContract of [
      { profile: 'urn:oms:contract:unregistered:1', registryVersion: 4 },
      { ...U4_SOURCE_CONTRACT, registryVersion: 3 },
      { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 4 },
      { ...U4_SOURCE_CONTRACT, arbitrary: true },
    ])
      expect(() => recordedSourceContract({ sourceContract }, schema)).toThrow();
  });
  it('기한은 정확한 달력 문자열 또는 미산출 null이며 Date 객체/잘못된 날짜를 받지 않는다', () => {
    const invoice = u4ModelFixture('Invoice');
    for (const dueDate of [null, '2026-12-01'])
      expect(validateModel('Invoice', { ...invoice, dueDate }, schema)).toBeDefined();
    for (const dueDate of [
      new Date('2026-12-01T00:00:00.000Z'),
      '2026-02-30',
      '2026-13-01',
      'not-a-date',
    ])
      expect(() => validateModel('Invoice', { ...invoice, dueDate }, schema)).toThrow();
  });
});
