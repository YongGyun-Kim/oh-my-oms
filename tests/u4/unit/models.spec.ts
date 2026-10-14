import { describe, expect, it } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import {
  U4_MODELS,
  U4_SUPPORT_MODELS,
  validateModel,
  modelForData,
  rowModelVersion,
  storedModelData,
} from '@oms/persistence';
import { modelFixture, legacyProduct } from '../../u3/fixtures/models.js';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Money, u4Plan } from '../fixtures/contracts.js';

describe('U4 model originals and version boundaries', () => {
  const schema = new SchemaValidator();
  it('validates all nine business originals and eight protected auxiliary models', () => {
    expect(U4_MODELS).toHaveLength(9);
    expect(U4_SUPPORT_MODELS).toHaveLength(8);
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
  it('refuses refund portion totals and current operation mismatch', () => {
    const row = u4ModelFixture('RefundCase');
    expect(() =>
      validateModel('RefundCase', { ...row, requestedAmount: u4Money('2') }, schema),
    ).toThrow();
    const parts = structuredClone(row.portions) as { currentResult: { operationId: string } }[];
    parts[0]!.currentResult.operationId = 'other';
    expect(() => validateModel('RefundCase', { ...row, portions: parts }, schema)).toThrow();
  });
});
