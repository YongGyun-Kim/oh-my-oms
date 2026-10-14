import { describe, expect, it } from 'vitest';
import {
  OperationRegistry,
  SchemaValidator,
  U4_PROFILE,
  U4_REGISTRY_VERSION,
  declareU3Operations,
  declareU4Operations,
  type Operation,
} from '@oms/contracts';
import { u4Allocation, u4Evidence, u4Plan, u4Ref } from '../fixtures/contracts.js';

describe('U4 closed contracts', () => {
  const validator = new SchemaValidator();
  const validate = (definition: string, value: unknown) =>
    validator.validateUri(U4_PROFILE + '#/$defs/' + definition, value);

  it('accepts explicit mixed obligations and free contract labels', () => {
    const plan = u4Plan();
    plan.obligations[0]!.label = '초기 환경 검증 합의액';
    expect(validate('AgreedPaymentPlan', plan)).toBe(plan);
    expect(validate('AllocationBatchInput', u4Allocation())).toBeDefined();
  });
  it('separates U4 registry4 from legacy U3 registry3', () => {
    const registry = new OperationRegistry(validator);
    declareU3Operations(registry);
    declareU4Operations(registry);
    expect(registry.lookup('FinancialSettlement', 'registerInvoice', 4).input).toContain(
      U4_PROFILE,
    );
    expect(registry.lookup('OrderAcceptance', 'submitOrder', 3).version).toBe(3);
    expect(() => registry.lookup('FinancialSettlement', 'registerInvoice', 3)).toThrow();
  });
  it('refuses a forged profile/version and mismatched contract declaration', () => {
    const registry = new OperationRegistry(validator);
    declareU4Operations(registry);
    const operation = registry.lookup('FinancialSettlement', 'registerInvoice', 4);
    for (const patch of [{ version: 3 }, { contract: 'u3-commercial' }])
      expect(() =>
        new OperationRegistry(validator).declare({ ...operation, ...patch } as Operation),
      ).toThrow();
    expect(U4_REGISTRY_VERSION).toBe(4);
  });
  it('rejects unknown fields and fake evidence business references', () => {
    expect(() => validate('Evidence', { ...u4Evidence(), uploadedFile: 'arbitrary' })).toThrow();
    expect(() => validate('Ref', u4Ref('FinancialSettlement', 'PaymentIdentity'))).toThrow();
    expect(() =>
      validate('Evidence', { owner: 'Bank', entity: 'Document', id: 'x', revision: 1 }),
    ).toThrow();
  });
  it('constrains registered target owner and query output against private data', () => {
    const registry = new OperationRegistry(validator);
    declareU4Operations(registry);
    const operation = registry.lookup('FinancialSettlement', 'readFinancial', 4);
    expect(() =>
      validator.validateSchema(operation.targetSchema!, {
        kind: 'RECORD',
        recordRef: u4Ref('ProductCatalog', 'Product'),
      }),
    ).toThrow();
    expect(
      validator.validateSchema(operation.targetSchema!, {
        kind: 'RECORD',
        recordRef: u4Ref('OrderAcceptance', 'Order'),
      }),
    ).toBeDefined();
    expect(operation.audience).toEqual(['CUSTOMER', 'STAFF']);
    expect(registry.lookup('FinancialSettlement', 'recordPaymentEvidence', 4).audience).toEqual([
      'STAFF',
    ]);
  });
  it('preserves opaque transaction identity and rejects duplicate aliases', () => {
    const identity = {
      sourceProfileId: 'synthetic-only',
      sourceProfileRevision: 2,
      sourceNamespace: 'synthetic-receiver',
      canonicalIdentity: '00aA',
      aliases: ['00AA'],
    };
    expect(validate('PaymentIdentity', identity)).toBe(identity);
    expect(() => validate('PaymentIdentity', { ...identity, aliases: ['00aA'] })).toThrow();
  });
  it('requires explicit purpose and closed result revisions', () => {
    expect(() => validate('AssessmentPurpose', 'PAYMENT_OK')).toThrow();
    expect(validate('AssessmentPurpose', 'SALE_ACCEPTANCE')).toBe('SALE_ACCEPTANCE');
    expect(() => validate('SourceContract', { profile: U4_PROFILE, registryVersion: 3 })).toThrow();
    expect(validate('SourceContract', { profile: U4_PROFILE, registryVersion: 4 })).toBeDefined();
  });
  it('keeps legacy closed inputs from silently accepting new payment fields', () => {
    const query = {
      targetRef: u4Ref('OrderAcceptance', 'Order'),
      targetScope: u4Allocation().targetScope,
      plan: u4Plan(),
    };
    expect(() =>
      validator.validateUri('urn:oms:contract:u3-commercial:2#/$defs/OrderQuery', query),
    ).toThrow();
    expect(() => validate('DueBasis', { kind: 'CONFIRMED_FACT_PLUS_DAYS', days: 30 })).toThrow();
  });
});
