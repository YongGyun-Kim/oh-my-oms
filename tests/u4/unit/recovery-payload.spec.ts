import { describe, expect, it } from 'vitest';
import { canonicalJson, SchemaValidator } from '@oms/contracts';
import { decodePayload, sealPayload, U4_SOURCE_CONTRACT, type RecoveryRow } from '@oms/persistence';
import { u4ModelFixture } from '../fixtures/models.js';
import { modelFixture, legacyProduct } from '../../u3/fixtures/models.js';
import { u4Plan } from '../fixtures/contracts.js';

const row = (): RecoveryRow => ({
  model: 'FinancialPaymentBalance',
  schemaVersion: 1,
  id: 'payment',
  revision: 1,
  data: { ...u4ModelFixture('FinancialPaymentBalance'), paymentId: 'payment' },
  deleted: false,
});
const envelope = (rows: RecoveryRow[]) =>
  sealPayload({
    schemaVersion: 3,
    sourceContract: U4_SOURCE_CONTRACT,
    epoch: 'initial',
    commitOrder: 1,
    requestId: 'request',
    correlationId: 'correlation',
    previousDigest: null,
    rows,
  });
describe('U4 recovery payload compatibility', () => {
  const schema = new SchemaValidator();
  it('preserves U4 auxiliary originals with profile4 and payload3', () => {
    const value = envelope([row()]);
    expect(decodePayload(canonicalJson(value), schema)).toEqual(value);
  });
  it('새 완료 근거 원상을 보호하고 구형 payload1/2 위장을 거절한다', () => {
    const data = u4ModelFixture('FinancialCompletionBasis');
    const value = envelope([
      {
        model: 'FinancialCompletionBasis',
        schemaVersion: 1,
        id: String(data.invoiceId),
        revision: 1,
        data,
        deleted: false,
      },
    ]);
    expect(decodePayload(canonicalJson(value), schema).rows[0]!.data).toEqual(data);
    const { contentDigest: _digest, sourceContract: _source, ...body } = value;
    expect(_digest).toBeDefined();
    expect(_source).toEqual(U4_SOURCE_CONTRACT);
    expect(() =>
      decodePayload(canonicalJson(sealPayload({ ...body, schemaVersion: 1 })), schema),
    ).toThrow();
    expect(() =>
      decodePayload(
        canonicalJson(
          sealPayload({
            ...body,
            schemaVersion: 2,
            sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 },
          }),
        ),
        schema,
      ),
    ).toThrow();
  });
  it('식별 claim을 aliases 목록을 가진 PaymentIdentity 값 객체로 오인하지 않는다', () => {
    const data = u4ModelFixture('FinancialIdentityClaim');
    const value = envelope([
      {
        model: 'FinancialIdentityClaim',
        schemaVersion: 1,
        id: String(data.claimId),
        revision: 1,
        data,
        deleted: false,
      },
    ]);
    expect(decodePayload(canonicalJson(value), schema).rows[0]!.data).toEqual(data);
    expect(Object.hasOwn(data, 'aliases')).toBe(false);
  });
  it('rejects U4 originals disguised as a legacy payload', () => {
    const { sourceContract: _source, ...base } = envelope([row()]);
    void _source;
    const { contentDigest: _digest, ...body } = base;
    void _digest;
    expect(() =>
      decodePayload(canonicalJson(sealPayload({ ...body, schemaVersion: 1 })), schema),
    ).toThrow();
  });
  it('rejects model-version mismatches and deletions that free identity reservations', () => {
    expect(() =>
      decodePayload(canonicalJson(envelope([{ ...row(), schemaVersion: 2 }])), schema),
    ).toThrow();
    expect(() =>
      decodePayload(canonicalJson(envelope([{ ...row(), deleted: true }])), schema),
    ).toThrow();
  });
  it('still reads exact legacy U1 and U3 version2 original bytes', () => {
    const legacy = legacyProduct('old-product');
    const old = sealPayload({
      schemaVersion: 1,
      epoch: 'initial',
      commitOrder: 1,
      requestId: 'old',
      correlationId: 'correlation',
      previousDigest: null,
      rows: [
        {
          model: 'Product',
          schemaVersion: 1,
          id: 'old-product',
          revision: 1,
          data: legacy,
          deleted: false,
        },
      ],
    });
    expect(decodePayload(canonicalJson(old), schema).rows[0]!.data).toEqual(legacy);
    const modern = modelFixture('Product');
    const current = sealPayload({
      schemaVersion: 2,
      sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 },
      epoch: 'initial',
      commitOrder: 1,
      requestId: 'v2',
      correlationId: 'correlation',
      previousDigest: null,
      rows: [
        {
          model: 'Product',
          schemaVersion: 2,
          id: String(modern.productId),
          revision: 1,
          data: modern,
          deleted: false,
        },
      ],
    });
    expect(decodePayload(canonicalJson(current), schema).rows[0]!.schemaVersion).toBe(2);
  });
  it('requires explicit version3 for new U3 plan representations', () => {
    const order = {
      ...modelFixture('Order'),
      modelVersion: 3,
      paymentKind: 'MIXED',
      paymentPlan: u4Plan(),
    };
    const value = envelope([
      {
        model: 'Order',
        schemaVersion: 3,
        id: String(modelFixture('Order').orderId),
        revision: 1,
        data: order,
        deleted: false,
      },
    ]);
    expect(decodePayload(canonicalJson(value), schema).rows[0]!.schemaVersion).toBe(3);
    expect(() =>
      decodePayload(canonicalJson(envelope([{ ...value.rows[0]!, schemaVersion: 2 }])), schema),
    ).toThrow();
  });
  it('detects changed digest, noncanonical bytes, duplicate originals, and missing fields', () => {
    const value = envelope([row()]);
    expect(() => decodePayload(JSON.stringify(value, null, 2), schema)).toThrow();
    expect(() =>
      decodePayload(canonicalJson({ ...value, requestId: 'changed' }), schema),
    ).toThrow();
    expect(() => decodePayload(canonicalJson(envelope([row(), row()])), schema)).toThrow();
    const bad = row();
    delete bad.data.principal;
    expect(() => decodePayload(canonicalJson(envelope([bad])), schema)).toThrow();
  });
});
