import { describe, expect, it } from 'vitest';
import { SchemaValidator, U4_PROFILE, u4ExactSum } from '@oms/contracts';
import { u4Allocation, u4Money, u4Plan } from '../fixtures/contracts.js';

describe('U4 input boundaries', () => {
  const validator = new SchemaValidator();
  const validate = (definition: string, value: unknown) =>
    validator.validateUri(U4_PROFILE + '#/$defs/' + definition, value);

  it('uses exact integer KRW beyond Number precision and rejects invalid forms', () => {
    expect(u4ExactSum(['9007199254740993', '7'])).toBe('9007199254741000');
    for (const value of ['1.5', '-1', '01', '1e3', ''])
      expect(() => validate('Money', u4Money(value))).toThrow();
    expect(() => validate('Money', { currency: 'USD', value: '1' })).toThrow();
    expect(() => validate('PositiveMoney', u4Money('0'))).toThrow();
  });
  it('accepts finite maximum money and rejects addition overflow', () => {
    const maximum = '9'.repeat(4096);
    expect(validate('Money', u4Money(maximum))).toBeDefined();
    expect(() => validate('Money', u4Money('1' + '0'.repeat(4096)))).toThrow();
    expect(() => u4ExactSum([maximum, '1'])).toThrow();
  });
  it('counts labels in Unicode code points including non-BMP Korean context', () => {
    expect(validate('Label', '가'.repeat(100))).toHaveLength(100);
    expect(validate('Label', '😀'.repeat(100))).toHaveLength(200);
    for (const label of ['가'.repeat(101), '😀'.repeat(101), '', ' \n '])
      expect(() => validate('Label', label)).toThrow();
  });
  it('independently bounds descriptions and correction reasons at 2000 code points', () => {
    expect(validate('Description', '😀'.repeat(2000))).toBeDefined();
    expect(() => validate('Description', '😀'.repeat(2001))).toThrow();
    const input = u4Allocation();
    input.meta.reason = '가'.repeat(2000);
    expect(validate('AllocationBatchInput', input)).toBeDefined();
    input.meta.reason += '나';
    expect(() => validate('AllocationBatchInput', input)).toThrow();
  });
  it('bounds opaque document and transaction references without stripping or case folding', () => {
    expect(validate('ExternalReference', '😀'.repeat(256))).toBeDefined();
    expect(validate('ExternalReference', '00aA')).toBe('00aA');
    for (const value of ['😀'.repeat(257), '', '   '])
      expect(() => validate('ExternalReference', value)).toThrow();
  });
  it('accepts one and one hundred allocation rows and rejects zero and one hundred one', () => {
    for (const count of [1, 100])
      expect(validate('AllocationBatchInput', u4Allocation(count))).toBeDefined();
    for (const count of [0, 101])
      expect(() => validate('AllocationBatchInput', u4Allocation(count))).toThrow();
  });
  it('rejects duplicate invoices across differing expected revisions without merging them', () => {
    const input = u4Allocation();
    input.items[1]!.invoiceRef = { ...input.items[0]!.invoiceRef, revision: 2 };
    expect(() => validate('AllocationBatchInput', input)).toThrow();
    expect(input.items).toHaveLength(2);
  });
  it('verifies whole plan totals and stable obligation identity without an order-wide hundred-invoice cap', () => {
    const plan = u4Plan();
    plan.obligations[0]!.amount = u4Money('201');
    expect(() => validate('AgreedPaymentPlan', plan)).toThrow();
    plan.obligations = Array.from({ length: 101 }, (_, index) => ({
      ...plan.obligations[0]!,
      obligationKey: 'obligation-' + index,
      amount: u4Money('1'),
    }));
    plan.total = u4Money('101');
    expect(validate('AgreedPaymentPlan', plan)).toBeDefined();
    plan.obligations[100]!.obligationKey = 'obligation-0';
    expect(() => validate('AgreedPaymentPlan', plan)).toThrow();
  });
});
