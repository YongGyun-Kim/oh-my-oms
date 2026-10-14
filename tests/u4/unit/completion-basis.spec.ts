import { describe, expect, it } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import { u4CompletionTransition } from '@oms/core';
import type { U4CompletionFactView } from '@oms/core';
import { decodeU4Model, validateModel } from '@oms/persistence';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Ref } from '../fixtures/contracts.js';

const schema = new SchemaValidator();
const view = (): U4CompletionFactView => ({
  requestedSourceFactRef: u4Ref('HardwareFulfillment', 'HardwareHistory', 'fact', 7),
  latestSourceFactRef: u4Ref('HardwareFulfillment', 'HardwareHistory', 'fact', 7),
  aggregateRef: u4Ref('HardwareFulfillment', 'HardwareFulfillmentCase', 'case', 3),
  latestSourceRevision: 3,
  coverage: 'CURRENT',
  correctionRefs: [],
  observedAt: '2026-12-02T00:00:00.000Z',
  providedTranches: [
    {
      trancheId: 'actual-synthetic-tranche',
      trancheRef: u4Ref('HardwareFulfillment', 'ShipmentTranche', 'tranche', 7),
      orderRef: u4Ref('OrderAcceptance', 'Order'),
      orderLineRef: u4Ref('OrderAcceptance', 'OrderLine'),
      termsSnapshotRef: u4Ref('OrderAcceptance', 'PurchaseTermsSnapshot'),
      completionBasis: 'HW_DELIVERY',
      completionState: 'COMPLETED',
      completedQuantity: 1,
      completedAt: '2026-12-01T00:00:00.000Z',
      hardwareDeliveredAt: '2026-12-01T00:00:00.000Z',
      customerAcceptedAt: null,
      softwareIssuedAt: null,
      resultAvailableAt: null,
      contractualStartAt: null,
      sourceRevision: 1,
      correctionOf: null,
      correctedAt: null,
      evidenceRefs: [u4Ref('HardwareFulfillment', 'HardwareHistory')],
    },
  ],
});
const next = () => {
  const previous = view(),
    value = structuredClone(previous);
  value.aggregateRef.revision = 4;
  value.latestSourceRevision = 4;
  value.latestSourceFactRef = { ...value.latestSourceFactRef, revision: 11 };
  const tranche = value.providedTranches[0]!;
  tranche.sourceRevision = 2;
  tranche.correctionOf = previous.providedTranches[0]!.trancheRef;
  tranche.trancheRef = { ...tranche.trancheRef, revision: 11 };
  tranche.correctedAt = '2026-12-02T00:00:00.000Z';
  value.correctionRefs = [previous.providedTranches[0]!.trancheRef];
  return value;
};
describe('실제 완료 원상의 독립 개정·닫힌 보존', () => {
  it('같은 실제 사건 개정은 관측 시점만 달라도 새 효과가 아니다', () => {
    expect(
      u4CompletionTransition(view(), { ...view(), observedAt: '2026-12-03T00:00:00.000Z' }),
    ).toBe('SAME');
  });
  it('같은 개정의 내용 변경은 최신 값으로 덮지 않는다', () => {
    const changed = view();
    changed.providedTranches[0]!.completedQuantity = 2;
    expect(() => u4CompletionTransition(view(), changed)).toThrow();
  });
  it('원래 tranche Ref와 정정 관계를 가진 한 단계 높은 개정을 확인한다', () => {
    expect(u4CompletionTransition(view(), next())).toBe('NEXT');
  });
  it('aggregate·tranche 개정의 역순과 공백을 최소값 통과로 허용하지 않는다', () => {
    for (const revision of [2, 5]) {
      const changed = next();
      changed.latestSourceRevision = revision;
      changed.aggregateRef.revision = revision;
      expect(() => u4CompletionTransition(view(), changed)).toThrow();
    }
    const changed = next();
    changed.providedTranches[0]!.sourceRevision = 3;
    expect(() => u4CompletionTransition(view(), changed)).toThrow();
  });
  it('완료 건 누락·다른 품목·다른 aggregate를 정정으로 합치지 않는다', () => {
    const missing = next();
    missing.providedTranches = [];
    const line = next();
    line.providedTranches[0]!.orderLineRef.id = 'other';
    const aggregate = next();
    aggregate.aggregateRef.id = 'other';
    for (const changed of [missing, line, aggregate])
      expect(() => u4CompletionTransition(view(), changed)).toThrow();
  });
  it('원본 Ref7→11·aggregate3→4·tranche1→2를 서로 같은 버전으로 비교하지 않는다', () => {
    const current = next();
    expect(current.providedTranches[0]!.trancheRef.revision).toBe(11);
    expect(u4CompletionTransition(view(), current)).toBe('NEXT');
    current.providedTranches[0]!.correctionOf = null;
    expect(() => u4CompletionTransition(view(), current)).toThrow();
  });
  it('보조 원상은 model1/source4의 정확한 닫힌 원본만 허용한다', () => {
    const value = u4ModelFixture('FinancialCompletionBasis');
    expect(decodeU4Model('FinancialCompletionBasis', 1, value, schema)).toEqual(value);
    for (const changed of [
      { ...value, modelVersion: 2 },
      { ...value, unknown: true },
      { ...value, sourceOwner: 'SoftwareLifecycle' },
      {
        ...value,
        sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 },
      },
    ])
      expect(() => validateModel('FinancialCompletionBasis', changed, schema)).toThrow();
    expect(() =>
      schema.validate('Ref', u4Ref('FinancialSettlement', 'FinancialCompletionBasis')),
    ).toThrow();
    expect(() =>
      schema.validateUri(
        'urn:oms:contract:u4-financial:1#/$defs/Ref',
        u4Ref('FinancialSettlement', 'FinancialCompletionBasis'),
      ),
    ).not.toThrow();
  });
  it('순수 현재 뷰는 원본 개정/가짜 Ref를 허용하지 않고 구형 판단 뷰를 변경하지 않는다', () => {
    const value = {
      orderRef: u4Ref('OrderAcceptance', 'Order'),
      assessmentPurpose: 'PROVISION',
      planRevision: 1,
      agreementRevisionRef: u4Ref('CommercialAgreement', 'AgreementRevision'),
      decision: 'HOLD',
      basisRefs: [],
      evaluatedAt: '2026-12-01T00:00:00.000Z',
    };
    expect(() =>
      schema.validateUri('urn:oms:contract:u4-financial:1#/$defs/CurrentEligibilityView', value),
    ).not.toThrow();
    for (const extra of [
      { sourceRevision: 1 },
      { eligibilityRef: u4Ref('FinancialSettlement', 'FinancialEligibility') },
    ])
      expect(() =>
        schema.validateUri('urn:oms:contract:u4-financial:1#/$defs/CurrentEligibilityView', {
          ...value,
          ...extra,
        }),
      ).toThrow();
    const { evaluatedAt: _at, ...original } = value;
    expect(_at).toBeDefined();
    expect(() =>
      schema.validateUri('urn:oms:contract:u4-financial:1#/$defs/EligibilityView', {
        ...original,
        sourceRevision: 1,
        renewalCycleRefs: [],
      }),
    ).not.toThrow();
    expect(() =>
      schema.validateUri('urn:oms:contract:u4-financial:1#/$defs/EligibilityView', value),
    ).toThrow();
  });
});
