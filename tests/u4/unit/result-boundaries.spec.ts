import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  declareU4Operations,
  OperationRegistry,
  SchemaValidator,
  U4_PROFILE,
  type Ref,
} from '@oms/contracts';
import {
  decodePayload,
  sealPayload,
  U4_SOURCE_CONTRACT,
  validateModel,
  type ModelData,
} from '@oms/persistence';
import { u4Ref, u4Scope } from '../fixtures/contracts.js';

const schema = new SchemaValidator();
const payment = u4Ref('FinancialSettlement', 'PaymentEvidence', 'payment');
const history = u4Ref('FinancialSettlement', 'FinancialHistory', 'history');
const refs = (count = 100) => [
  payment,
  ...Array.from({ length: count }, (_, index) =>
    u4Ref('FinancialSettlement', 'PaymentAllocation', 'allocation-' + index),
  ),
  history,
];
const receipt = (resultRefs = refs()): ModelData => ({
  requestId: 'synthetic-request',
  principalId: 'synthetic-staff',
  audience: 'STAFF',
  operation: 'allocatePaymentBatch',
  owner: 'FinancialSettlement',
  targetIdentity: { kind: 'RECORD', recordRef: payment },
  targetScope: u4Scope(),
  requestFingerprint: 'a'.repeat(64),
  idempotencyKey: 'synthetic-key',
  requestState: 'RESULT_RECORDED',
  resultRefs,
  acceptedAt: '2026-12-01T00:00:00.000Z',
  updatedAt: '2026-12-01T00:00:00.000Z',
  revision: 1,
  correlationId: 'synthetic-correlation',
  sourceContract: U4_SOURCE_CONTRACT,
});
const fact = (evidenceRefs: Ref[]): ModelData => ({
  eventId: 'synthetic-fact',
  sourceOwner: 'FinancialSettlement',
  aggregateRef: u4Ref('FinancialSettlement', 'FinancialEligibility'),
  aggregateVersion: 1,
  sourceFactRef: history,
  targetScope: u4Scope(),
  causationRequestId: 'synthetic-request',
  correlationId: 'synthetic-correlation',
  schemaVersion: U4_PROFILE,
  supersedesFactRef: null,
  evidenceRefs,
  occurredAt: '2026-12-01T00:00:00.000Z',
  sourceContract: U4_SOURCE_CONTRACT,
});
const envelope = (model: string, id: string, data: ModelData) =>
  sealPayload({
    schemaVersion: 3,
    sourceContract: U4_SOURCE_CONTRACT,
    epoch: 'initial',
    commitOrder: 1,
    requestId: 'synthetic-request',
    correlationId: 'synthetic-correlation',
    previousDigest: null,
    rows: [{ model, schemaVersion: 1, id, revision: 1, data, deleted: false }],
  });

describe('배분100입력의102결과와 금융 전체 근거의 좁은 source4 표현', () => {
  it('서로 다른100개 배분과 입금/이력102개를 허용하고103개·중복·다른종류를 거절한다', () => {
    expect(schema.validateUri(U4_PROFILE + '#/$defs/AllocationResultRefs', refs())).toHaveLength(
      102,
    );
    for (const changed of [
      refs(101),
      [payment, history],
      [...refs(99), history],
      [payment, u4Ref('FinancialSettlement', 'Invoice'), history],
    ])
      expect(() =>
        schema.validateUri(U4_PROFILE + '#/$defs/AllocationResultRefs', changed),
      ).toThrow();
  });
  it('실제 배분 선언은 별도 닫힌 output이며 target/payment·추가필드를 검증한다', () => {
    const registry = new OperationRegistry(schema);
    declareU4Operations(registry);
    const output = registry.lookup('FinancialSettlement', 'allocatePaymentBatch', 4).output;
    expect(output).toBe(U4_PROFILE + '#/$defs/AllocationReceipt');
    const result = {
      requestId: 'synthetic-request',
      requestState: 'RESULT_RECORDED',
      owner: 'FinancialSettlement',
      targetRef: payment,
      resultRefs: refs(),
      acceptedAt: '2026-12-01T00:00:00.000Z',
      updatedAt: '2026-12-01T00:00:00.000Z',
      statusRevision: 1,
      retryAfterMilliseconds: null,
    };
    expect(schema.validateUri(output, result)).toBe(result);
    for (const patch of [{ targetRef: history }, { extra: true }, { resultRefs: refs(101) }])
      expect(() => schema.validateUri(output, { ...result, ...patch })).toThrow();
  });
  it('저장 접수는 정확한 source4/owner/operation에서만102개 결과를 보존한다', () => {
    const value = receipt();
    expect(validateModel('RequestReceipt', value, schema)).toBe(value);
    for (const patch of [
      { owner: 'OrderAcceptance' },
      { operation: 'correctInvoice' },
      { sourceContract: null },
      { sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 } },
      { sourceContract: { ...U4_SOURCE_CONTRACT, registryVersion: 3 } },
    ])
      expect(() => validateModel('RequestReceipt', { ...value, ...patch }, schema)).toThrow();
  });
  it('일반/구형/다른operation의 기존100개 한도는 그대로이고101개는 거절한다', () => {
    const legacyRefs = Array.from({ length: 101 }, (_, index) =>
      u4Ref('FinancialSettlement', 'Invoice', 'invoice-' + index),
    );
    for (const patch of [
      { operation: 'correctInvoice' },
      { owner: 'OrderAcceptance' },
      { sourceContract: null },
      { sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 } },
    ]) {
      expect(
        validateModel('RequestReceipt', { ...receipt(legacyRefs.slice(0, 100)), ...patch }, schema),
      ).toBeDefined();
      expect(() =>
        validateModel('RequestReceipt', { ...receipt(legacyRefs), ...patch }, schema),
      ).toThrow();
    }
  });
  it('정확한 금융 Fact evidenceRefs는 전체101개 이상을 자르지 않고 보존한다', () => {
    const sources = Array.from({ length: 201 }, (_, index) =>
      u4Ref('FinancialSettlement', 'PaymentAllocation', 'allocation-' + index),
    );
    const value = fact(sources);
    expect(validateModel('FactEnvelope', value, schema)).toBe(value);
    expect(value.evidenceRefs).toEqual(sources);
    expect(() =>
      validateModel(
        'FactEnvelope',
        { ...value, evidenceRefs: [...sources, u4Ref('FinancialSettlement', 'UnknownEvidence')] },
        schema,
      ),
    ).toThrow();
  });
  it('다른owner/schema/구형Fact의100개 제한과 잘못된 source 거절은 유지한다', () => {
    const sources = Array.from({ length: 101 }, (_, index) =>
      u4Ref('FinancialSettlement', 'Invoice', 'invoice-' + index),
    );
    for (const patch of [
      { sourceOwner: 'HardwareFulfillment' },
      { schemaVersion: 'urn:oms:contract:common:2' },
      { sourceContract: null },
      { sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 } },
    ]) {
      expect(
        validateModel('FactEnvelope', { ...fact(sources.slice(0, 100)), ...patch }, schema),
      ).toBeDefined();
      expect(() => validateModel('FactEnvelope', { ...fact(sources), ...patch }, schema)).toThrow();
    }
    expect(() =>
      validateModel(
        'FactEnvelope',
        { ...fact(sources), sourceContract: { ...U4_SOURCE_CONTRACT, registryVersion: 3 } },
        schema,
      ),
    ).toThrow();
  });
  it('102결과와 전체근거는 같은 payload3/source4의 복구 원상에서도 폐쇄 검증된다', () => {
    const result = receipt();
    const value = envelope('RequestReceipt', 'synthetic-request', result);
    expect(decodePayload(canonicalJson(value), schema).rows[0]!.data).toEqual(result);
    const sources = fact(refs());
    expect(
      decodePayload(canonicalJson(envelope('FactEnvelope', 'synthetic-fact', sources)), schema)
        .rows[0]!.data,
    ).toEqual(sources);
    expect(() =>
      decodePayload(
        canonicalJson(
          envelope('RequestReceipt', 'synthetic-request', {
            ...result,
            operation: 'correctInvoice',
          }),
        ),
        schema,
      ),
    ).toThrow();
  });
  it('개수 상한을 바꾸지 않아도 기존4MiB payload 사전차단은 유지한다', () => {
    // 한 개의 byte 경계 fixture이며 실제 DB 부하나 대량 복구 시험이 아니다.
    const sources = Array.from({ length: 22000 }, (_, index) =>
      u4Ref(
        'FinancialSettlement',
        'PaymentAllocation',
        'x'.repeat(120) + String(index).padStart(8, '0'),
      ),
    );
    const text = canonicalJson(envelope('FactEnvelope', 'synthetic-fact', fact(sources)));
    expect(Buffer.byteLength(text)).toBeGreaterThan(4 * 1024 * 1024);
    expect(() => decodePayload(text, schema)).toThrowError(
      expect.objectContaining({ code: 'RECOVERY_SIZE' }),
    );
  });
});
