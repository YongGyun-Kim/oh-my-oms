import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OperationRegistry,
  SchemaValidator,
  declareFoundationOperations,
  declareU3Operations,
  U3_PROFILE,
  U3_REGISTRY_VERSION,
  OmsError,
} from '@oms/contracts';
import type { Operation, Receipt, U3OrderInput } from '@oms/contracts';
import { fixtureContext, fixtureRef } from '../fixtures/identity.js';
import {
  fixtureMeta,
  orderFixture,
  orderViewFixture,
  productFixture,
} from '../fixtures/commercial.js';

const schema = new SchemaValidator();
const validate = (definition: string, data: unknown) =>
  schema.validateUri(U3_PROFILE + '#/$defs/' + definition, data);
const receipt: Receipt = {
  requestId: 'request',
  requestState: 'REVIEW_REQUIRED',
  owner: 'OrderAcceptance',
  targetRef: fixtureRef('OrderAcceptance', 'Order'),
  resultRefs: [],
  acceptedAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  statusRevision: 1,
  retryAfterMilliseconds: null,
};

describe('U3 profile 개정2와 registry3의 구형 원본 보존', () => {
  it('기존 두 common profile의 소수 Money 의미를 같은 ID에서 바꾸지 않는다', () => {
    const money = { currency: 'KRW', value: '1000.5' };
    expect(schema.validate('Money', money, 1)).toEqual(money);
    expect(schema.validate('Money', money, 2)).toEqual(money);
    expect(() => validate('Money', money)).toThrow();
  });
  it('신규 OrderInput은 common1/common2와 같은 계약이라고 표시하지 않는다', () => {
    const input = orderFixture();
    expect(validate('OrderInput', input)).toEqual(input);
    expect(() => schema.validate('OrderInput', input, 1)).toThrow();
    expect(() => schema.validate('OrderInput', input, 2)).toThrow();
    const line = input.lines[0]!;
    const old = {
      ...input,
      lines: [
        {
          productRef: line.productRef,
          commonOfferRevisionRef: line.commonOfferRevisionRef,
          quantity: line.quantity,
          paymentMode: line.paymentMode,
          requestedActivationDate: line.requestedActivationDate,
          agreementRevisionRef: null,
        },
      ],
    };
    expect(schema.validate('OrderInput', old, 2)).toEqual(old);
    expect(() => validate('OrderInput', old)).toThrow();
  });
  it('기존 operation2와 신규 operation3을 별도로 등록하고 중복은 거절한다', () => {
    const registry = new OperationRegistry(schema);
    declareFoundationOperations(registry);
    declareU3Operations(registry);
    expect(registry.lookup('OrderAcceptance', 'submitOrder', 2).contract).toBe('C05');
    expect(registry.lookup('OrderAcceptance', 'submitOrder', 3).contract).toBe('u3-commercial');
    expect(U3_REGISTRY_VERSION).toBe(3);
    expect(() => declareU3Operations(registry)).toThrow();
    expect(() => registry.lookup('OrderAcceptance', 'submitOrder', 4)).toThrow();
    expect(() => registry.lookup('UnknownOwner', 'submitOrder', 3)).toThrow();
  });
  it('profile2를 registry2로 오등록하거나 다른 contract로 위장하지 못한다', () => {
    const registry = new OperationRegistry(schema);
    declareU3Operations(registry);
    const operation = registry.lookup('OrderAcceptance', 'submitOrder', 3);
    for (const change of [{ version: 2 }, { contract: 'common' }])
      expect(() => new OperationRegistry(schema).declare({ ...operation, ...change })).toThrow();
  });
  it('모든 새 definition의 참조가 compile되며 malformed schema를 입력 오류로 숨기지 않는다', () => {
    const document = JSON.parse(
      readFileSync('packages/contracts/schemas/u3-commercial-v2.json', 'utf8'),
    ) as { $defs: Record<string, unknown> };
    for (const definition of Object.keys(document.$defs)) {
      try {
        validate(definition, null);
      } catch (error) {
        expect(error).toBeInstanceOf(OmsError);
      }
    }
    expect(Object.keys(document.$defs).length).toBeGreaterThan(30);
  });
});

describe('닫힌 원 단위 값·기간·대상 계약', () => {
  it.each(['0', '1000', '9007199254740992'])(
    'Money %s는 문자열 정수로 손실 없이 보존한다',
    (value) => {
      expect(validate('Money', { currency: 'KRW', value })).toEqual({ currency: 'KRW', value });
    },
  );
  it.each(['1.0', '1.5', '-1', '01', '1e3', '+1', ' 1', ''])(
    '잘못된 금액 %s를 반올림하지 않는다',
    (value) => {
      expect(() => validate('Money', { currency: 'KRW', value })).toThrow();
    },
  );
  it('다른 통화·number·추가 필드를 거절한다', () => {
    for (const value of [
      { currency: 'USD', value: '1' },
      { currency: 'KRW', value: 1 },
      { currency: 'KRW', value: '1', taxRate: 0.1 },
    ])
      expect(() => validate('Money', value)).toThrow();
  });
  it('unknown owner/entity와 값 객체·추가 field를 Ref로 전송하지 않는다', () => {
    for (const reference of [
      fixtureRef('Unknown', 'Order'),
      fixtureRef('OrderAcceptance', 'PriceTerms'),
      fixtureRef('CommercialAgreement', 'Order'),
      { ...fixtureRef('ProductCatalog', 'Product'), field: 'price' },
      fixtureRef('ProductCatalog', 'Product', 'p', 0),
      fixtureRef('ProductCatalog', 'Product', 'p', Number.MAX_SAFE_INTEGER + 1),
    ])
      expect(() => validate('Ref', reference)).toThrow();
  });
  it('TargetScope를 누락/null/타 owner·entity로 치환하지 않는다', () => {
    const original = orderFixture();
    for (const targetScope of [
      null,
      { ...original.targetScope, organisationRevision: 0 },
      { ...original.targetScope, enterpriseRef: fixtureRef('ProductCatalog', 'Product') },
      { ...original.targetScope, departmentRef: fixtureRef('EnterpriseAccess', 'BusinessSite') },
    ])
      expect(() => validate('OrderInput', { ...original, targetScope })).toThrow();
    const missing = { ...original.targetScope } as Partial<U3OrderInput['targetScope']>;
    delete missing.contextPolicyRef;
    expect(() => validate('OrderInput', { ...original, targetScope: missing })).toThrow();
  });
  it('HW/SW의 기간형·전송 enum을 구별하고 필수 값을 추측하지 않는다', () => {
    const product = productFixture();
    expect(validate('ProductInput', product)).toEqual(product);
    expect(
      validate('ProductInput', { ...product, productType: 'SOFTWARE', softwareTermKind: 'TERM' }),
    ).toBeTruthy();
    for (const change of [
      { productType: 'HW' },
      { softwareTermKind: 'TERM' },
      { productType: 'SOFTWARE' },
      { commonPrice: { currency: 'KRW', value: '1.5' } },
    ])
      expect(() => validate('ProductInput', { ...product, ...change })).toThrow();
  });
  it('유효 구간은 명시 경계·시점을 보존하고 종료 없음과 누락을 구별한다', () => {
    const window = orderFixture().lines[0]!.conditionBindings[0]!.effectiveWindow;
    expect(validate('EffectiveWindow', window)).toEqual(window);
    for (const change of [
      { endAt: '2026-09-01T00:00:00Z' },
      { startAt: 'invalid' },
      { startInclusive: null },
    ])
      expect(() => validate('EffectiveWindow', { ...window, ...change })).toThrow();
    expect(() => validate('EffectiveWindow', { startAt: window.startAt, endAt: null })).toThrow();
  });
  it('Period의 한국 시간·종료 규칙과 날짜 순서를 검증한다', () => {
    const period = {
      startDate: '2026-12-01',
      endDate: '2027-11-30',
      timeZone: 'Asia/Seoul',
      endRule: 'INCLUSIVE_DATE',
      ruleRef: fixtureRef('ProductCatalog', 'CommonOfferRevision'),
    };
    expect(validate('Period', period)).toEqual(period);
    for (const change of [
      { startDate: '2026-02-30' },
      { endDate: '2026-01-01' },
      { timeZone: 'UTC' },
      { endRule: null },
    ])
      expect(() => validate('Period', { ...period, ...change })).toThrow();
  });
});

describe('모든 입력행의 조건·계약 개정과 snapshot 합집합', () => {
  it.each([1, 100])('%i행을 원래 순서와 조건 그대로 검증한다', (count) => {
    expect(validate('OrderInput', orderFixture(count))).toEqual(orderFixture(count));
    expect(validate('OrderView', orderViewFixture(count))).toEqual(orderViewFixture(count));
  });
  it.each([0, 101])('%i행을 자동 분할·절삭하지 않는다', (count) => {
    expect(() => validate('OrderInput', orderFixture(count))).toThrow();
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('잘못된 수량 %s를 거절한다', (quantity) => {
    const input = orderFixture();
    input.lines[0]!.quantity = quantity;
    expect(() => validate('OrderInput', input)).toThrow();
  });
  it('단일 지급/FULL/null 조건을 다른 enum·혼합·추가 필드로 우회하지 않는다', () => {
    const input = orderFixture(2);
    input.lines[1]!.paymentMode = 'POSTPAY';
    expect(() => validate('OrderInput', input)).toThrow();
    for (const change of [
      { provisionChoice: 'PARTIAL' },
      { productType: 'HW' },
      { operation: 'submitOrder' },
      { partialConsentRef: fixtureRef('CommercialAgreement', 'CustomerConsent') },
    ])
      expect(() => validate('OrderInput', { ...orderFixture(), ...change })).toThrow();
  });
  it('한 행에서 다른 조건에 적용한 두 기업 계약을 모두 보존한다', () => {
    const input = orderFixture(),
      line = input.lines[0]!;
    const second = fixtureRef('CommercialAgreement', 'AgreementRevision', 'payment-agreement');
    line.conditionBindings[1]!.sourceRef = second;
    line.agreementRevisionRefs.push(second);
    expect(validate('OrderInput', input)).toEqual(input);
    line.agreementRevisionRefs.pop();
    expect(() => validate('OrderInput', input)).toThrow();
  });
  it('상충/중복 conditionKey·잘못된 값·공통 개정·초안 근거를 거절한다', () => {
    for (const mode of ['duplicate', 'wrong-value', 'wrong-offer', 'draft']) {
      const input = orderFixture(),
        line = input.lines[0]!;
      if (mode === 'duplicate')
        line.conditionBindings.push(structuredClone(line.conditionBindings[0]!));
      if (mode === 'wrong-value')
        (line.conditionBindings[0] as unknown as { value: unknown }).value = { mode: 'PREPAY' };
      if (mode === 'wrong-offer') line.conditionBindings[1]!.sourceRef.id = 'other-offer';
      if (mode === 'draft') line.conditionBindings[0]!.sourceRef.entity = 'AgreementHistory';
      expect(() => validate('OrderInput', input)).toThrow();
    }
  });
  it('스냅샷의 전체 계약·공통 개정·조건 합집합에서 누락/추가/개정 치환을 거절한다', () => {
    for (const mode of ['agreement', 'offer', 'binding', 'revision']) {
      const view = orderViewFixture(2);
      if (mode === 'agreement') view.agreementRevisionRefs.pop();
      if (mode === 'offer') view.commonOfferRevisionRefs.pop();
      if (mode === 'binding') view.conditionBindings.pop();
      if (mode === 'revision')
        view.agreementRevisionRefs[0] = { ...view.agreementRevisionRefs[0]!, revision: 2 };
      expect(() => validate('OrderView', view)).toThrow();
    }
  });
  it('조건 없음의 명시 빈 목록을 형식상 보존하지만 실제 확인 완료로 승격하지 않는다', () => {
    const input = orderFixture();
    input.lines[0]!.conditionBindings = [];
    input.lines[0]!.agreementRevisionRefs = [];
    expect(validate('OrderInput', input)).toEqual(input);
    expect(() =>
      validate('OrderInput', {
        ...input,
        lines: [{ ...input.lines[0], agreementRevisionRefs: null }],
      }),
    ).toThrow();
  });
});

describe('정확한 제안·동의·수락 전후 changeKind', () => {
  const change = () => ({
    meta: fixtureMeta(1),
    orderRef: fixtureRef('OrderAcceptance', 'Order'),
    changeKind: 'REVIEW_PRICE_CHANGE',
    afterSalesDecisionRef: null,
    customerConsentRef: fixtureRef('CommercialAgreement', 'CustomerConsent'),
    newTermsRef: fixtureRef('CommercialAgreement', 'CommercialProposal'),
  });
  it('수락 전은 명시 null, 수락 후는 정확한 U7 결정 참조만 허용한다', () => {
    expect(validate('ApplyOrderChangeInput', change())).toEqual(change());
    const accepted = {
      ...change(),
      changeKind: 'ACCEPTED_AFTERSALES_CHANGE',
      afterSalesDecisionRef: fixtureRef('AfterSalesDecision', 'AfterSalesDecisionRecord'),
    };
    expect(validate('ApplyOrderChangeInput', accepted)).toEqual(accepted);
    expect(() =>
      validate('ApplyOrderChangeInput', { ...accepted, afterSalesDecisionRef: null }),
    ).toThrow();
    expect(() =>
      validate('ApplyOrderChangeInput', {
        ...change(),
        afterSalesDecisionRef: accepted.afterSalesDecisionRef,
      }),
    ).toThrow();
  });
  it('필수 U7/null 분기·expectedRevision·동의/새 조건 원본을 추측하지 않는다', () => {
    const missing: Partial<ReturnType<typeof change>> = { ...change() };
    delete missing.afterSalesDecisionRef;
    expect(() => validate('ApplyOrderChangeInput', missing)).toThrow();
    for (const replacement of [
      { meta: fixtureMeta(null) },
      { meta: fixtureMeta(2) },
      { changeKind: 'ANY' },
      { customerConsentRef: fixtureRef('OrderAcceptance', 'Order') },
      { newTermsRef: fixtureRef('CommercialAgreement', 'AppliedTerms') },
    ])
      expect(() => validate('ApplyOrderChangeInput', { ...change(), ...replacement })).toThrow();
  });
  it('제안은 주문 하나 또는 정확한 SW 권한·회차 쌍이며 둘 다/둘 없음은 거절한다', () => {
    const proposal = {
      meta: fixtureMeta(),
      targetOrderRef: fixtureRef('OrderAcceptance', 'Order'),
      targetEntitlementRef: null,
      targetRenewalCycleRef: null,
      originalTermsRef: fixtureRef('OrderAcceptance', 'PurchaseTermsSnapshot'),
      proposedTermsRef: fixtureRef('CommercialAgreement', 'AgreementHistory'),
      agreementEvidenceRefs: [],
    };
    expect(validate('ProposalInput', proposal)).toEqual(proposal);
    expect(
      validate('ProposalInput', {
        ...proposal,
        targetOrderRef: null,
        targetEntitlementRef: fixtureRef('SoftwareLifecycle', 'EnterpriseEntitlement'),
        targetRenewalCycleRef: fixtureRef('SoftwareLifecycle', 'RenewalCycle'),
      }),
    ).toBeTruthy();
    for (const partial of [
      { targetOrderRef: null },
      { targetEntitlementRef: fixtureRef('SoftwareLifecycle', 'EnterpriseEntitlement') },
    ])
      expect(() => validate('ProposalInput', { ...proposal, ...partial })).toThrow();
  });
  it('고객 ACCEPT는 정확한 제안 개정에 결합하고 논리 AGREE·직원 주장으로 바꾸지 않는다', () => {
    const consent = {
      meta: fixtureMeta(1),
      proposalRef: fixtureRef('CommercialAgreement', 'CommercialProposal'),
      proposalRevision: 1,
      decision: 'ACCEPT',
    };
    expect(validate('ConsentInput', consent)).toEqual(consent);
    for (const replacement of [
      { proposalRevision: 2 },
      { decision: 'AGREE' },
      { meta: fixtureMeta(2) },
      { employeeConfirmed: true },
    ])
      expect(() => validate('ConsentInput', { ...consent, ...replacement })).toThrow();
  });
  it('직원 전체 판단의 ACCEPT/REJECT/HOLD와 현재 원본 개정을 구별한다', () => {
    const data = {
      meta: fixtureMeta(1),
      targetRef: fixtureRef('OrderAcceptance', 'Order'),
      decision: 'HOLD',
      basisRefs: [],
    };
    expect(validate('OrderDecisionInput', data)).toEqual(data);
    expect(() => validate('OrderDecisionInput', { ...data, decision: 'PARTIAL_ACCEPT' })).toThrow();
    expect(() => validate('OrderDecisionInput', { ...data, meta: fixtureMeta(2) })).toThrow();
  });
});

describe('registry 입력·대상·producer 경계', () => {
  const registryFixture = () => {
    const registry = new OperationRegistry(schema);
    declareU3Operations(registry);
    return registry;
  };
  it('미등록 binding은 성공 stub이 아니며 source authority를 만들지 않는다', async () => {
    await expect(
      registryFixture().invoke('OrderAcceptance', 'submitOrder', 3, {
        context: fixtureContext(),
        target: { kind: 'NONE' },
        data: orderFixture(),
      }),
    ).rejects.toMatchObject({ code: 'MODULE_NOT_REGISTERED' });
  });
  it('정확한 input/output만 왕복시키고 STAFF 제출/unknown input은 handler 전에 거절한다', async () => {
    const registry = registryFixture();
    let calls = 0;
    registry.bind('OrderAcceptance', 'submitOrder', 3, async () => {
      calls++;
      return receipt;
    });
    const invocation = {
      context: fixtureContext(),
      target: { kind: 'NONE' as const },
      data: orderFixture(),
    };
    expect(await registry.invoke('OrderAcceptance', 'submitOrder', 3, invocation)).toEqual(receipt);
    await expect(
      registry.invoke('OrderAcceptance', 'submitOrder', 3, {
        ...invocation,
        context: fixtureContext('STAFF'),
      }),
    ).rejects.toMatchObject({ code: 'WRONG_AUDIENCE' });
    await expect(
      registry.invoke('OrderAcceptance', 'submitOrder', 3, {
        ...invocation,
        data: { ...invocation.data, version: 2 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(calls).toBe(1);
  });
  it('record target의 owner/entity는 등록 contract와 일치해야 한다', async () => {
    const registry = registryFixture();
    let calls = 0;
    registry.bind('ProductCatalog', 'reviseProduct', 3, async () => {
      calls++;
      return receipt;
    });
    await expect(
      registry.invoke('ProductCatalog', 'reviseProduct', 3, {
        context: fixtureContext('STAFF'),
        target: { kind: 'RECORD', recordRef: fixtureRef('OrderAcceptance', 'Order') },
        data: productFixture(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(calls).toBe(0);
  });
  it('추가 producer field는 INVALID_PRODUCER이며 성공으로 반환하지 않는다', async () => {
    const registry = registryFixture();
    registry.bind('OrderAcceptance', 'submitOrder', 3, async () => ({
      ...receipt,
      privateNotes: 'fixture',
    }));
    await expect(
      registry.invoke('OrderAcceptance', 'submitOrder', 3, {
        context: fixtureContext(),
        target: { kind: 'NONE' },
        data: orderFixture(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PRODUCER', status: 503 });
  });
  it('조회 producer의 누락 snapshot 합집합도 INVALID_PRODUCER다', async () => {
    const registry = registryFixture(),
      view = orderViewFixture(2);
    view.agreementRevisionRefs.pop();
    registry.bind('OrderAcceptance', 'readAcceptedOrder', 3, async () => ({
      knowledge: 'KNOWN',
      data: view,
      sourceRefs: [],
      observedAt: receipt.acceptedAt,
    }));
    await expect(
      registry.invoke('OrderAcceptance', 'readAcceptedOrder', 3, {
        context: fixtureContext(),
        target: { kind: 'NONE' },
        data: { targetRef: view.orderRef },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PRODUCER' });
  });
  it('운영 등록 목록 자체는 profile3 혼합/가짜 source version 없이 declare된다', () => {
    const operations = JSON.parse(
      readFileSync('packages/contracts/schemas/u3-operations-v2.json', 'utf8'),
    ) as Operation[];
    expect(operations.length).toBe(23);
    const registry = registryFixture();
    for (const operation of operations) {
      expect(operation.version).toBe(3);
      expect(operation.contract).toBe('u3-commercial');
      expect(registry.lookup(operation.owner, operation.name, operation.version)).toEqual(
        operation,
      );
    }
  });
});
