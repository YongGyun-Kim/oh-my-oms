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
  it('명시 연결 정정은 정확한 이전·새 주문과 직원 금융 권한의 닫힌 계약4다', () => {
    const allocation = u4Allocation();
    const input = {
      meta: allocation.meta,
      targetScope: allocation.targetScope,
      paymentEvidenceRef: allocation.paymentEvidenceRef,
      previousOrderRef: u4Ref('OrderAcceptance', 'Order', 'previous'),
      orderRef: allocation.orderRef,
      sourceEvidence: u4Evidence(),
    };
    expect(validate('PaymentBindingCorrectionInput', input)).toBe(input);
    for (const patch of [
      { previousOrderRef: null },
      { paymentEvidenceRef: input.orderRef },
      { automatic: true },
    ])
      expect(() => validate('PaymentBindingCorrectionInput', { ...input, ...patch })).toThrow();
    const registry = new OperationRegistry(validator);
    declareU3Operations(registry);
    declareU4Operations(registry);
    expect(registry.lookup('FinancialSettlement', 'correctPaymentBinding', 4)).toMatchObject({
      action: 'financial.manage',
      audience: ['STAFF'],
      targetKind: 'RECORD',
    });
    expect(() => registry.lookup('FinancialSettlement', 'correctPaymentBinding', 3)).toThrow();
  });

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
    expect(operation.audience).toEqual(['STAFF']);
    expect(operation.action).toBe('financial.read');
    expect(registry.lookup('FinancialSettlement', 'readCustomerFinancial', 4)).toMatchObject({
      action: 'payment.read',
      audience: ['CUSTOMER'],
    });
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
  it('직원 기한 재대조·순수 현재 조회는 정확한 별도 닫힌 선언으로 등록한다', () => {
    const registry = new OperationRegistry(validator);
    declareU4Operations(registry);
    const operation = registry.lookup('FinancialSettlement', 'reconcileInvoiceDue', 4);
    expect(operation).toMatchObject({
      audience: ['STAFF'],
      action: 'financial.manage',
      kind: 'command',
    });
    const input = {
      meta: u4Allocation().meta,
      targetScope: u4Allocation().targetScope,
      orderRef: u4Ref('OrderAcceptance', 'Order'),
      invoiceRef: u4Ref('FinancialSettlement', 'Invoice'),
      completionQuery: {
        sourceFactRef: u4Ref('HardwareFulfillment', 'HardwareHistory'),
        aggregateRef: u4Ref('HardwareFulfillment', 'HardwareFulfillmentCase'),
        minimumSourceRevision: 1,
      },
      sourceEvidence: u4Evidence(),
    };
    expect(validator.validateUri(operation.input, input)).toBe(input);
    for (const changed of [
      { ...input, invented: true },
      { ...input, invoiceRef: input.orderRef },
      { ...input, completionQuery: { ...input.completionQuery, invented: true } },
    ])
      expect(() => validator.validateUri(operation.input, changed)).toThrow();
    expect(registry.lookup('FinancialSettlement', 'assessEligibility', 4)).toMatchObject({
      audience: ['STAFF'],
      kind: 'query',
      output: U4_PROFILE + '#/$defs/CurrentEligibilityView',
    });
    expect(() =>
      validator.validateUri(
        'urn:oms:contract:u3-commercial:2#/$defs/Ref',
        u4Ref('FinancialSettlement', 'FinancialCompletionBasis'),
      ),
    ).toThrow();
  });
  it('U4 접수는 정확한 새 보조 Ref만 확장하고 구형 접수와 공통 scalar를 보존한다', () => {
    const receipt = {
      requestId: 'synthetic-receipt',
      requestState: 'RESULT_RECORDED',
      owner: 'FinancialSettlement',
      targetRef: u4Ref('FinancialSettlement', 'Invoice'),
      resultRefs: [u4Ref('FinancialSettlement', 'Invoice')],
      acceptedAt: '2026-12-01T00:00:00.000Z',
      updatedAt: '2026-12-01T00:00:00.000Z',
      statusRevision: 1,
      retryAfterMilliseconds: null,
    };
    expect(validate('Receipt', receipt)).toBe(receipt);
    for (const entity of ['FinancialCompletionBasis', 'FinancialRestriction']) {
      const added = { ...receipt, resultRefs: [u4Ref('FinancialSettlement', entity)] };
      expect(validate('Receipt', added)).toBe(added);
      expect(() =>
        validator.validateUri('urn:oms:contract:u3-commercial:2#/$defs/Receipt', added),
      ).toThrow();
      expect(() => validator.validate('Receipt', added)).toThrow();
    }
    for (const changed of [
      { ...receipt, targetRef: u4Ref('HardwareFulfillment', 'FinancialCompletionBasis') },
      { ...receipt, resultRefs: [u4Ref('FinancialSettlement', 'UnknownBasis')] },
      {
        ...receipt,
        resultRefs: [
          { ...receipt.targetRef, sourceContract: { profile: U4_PROFILE, registryVersion: 3 } },
        ],
      },
      { ...receipt, extra: true },
      { ...receipt, statusRevision: 0 },
      { ...receipt, requestState: 'UNKNOWN' },
    ])
      expect(() => validate('Receipt', changed)).toThrow();
  });
});
