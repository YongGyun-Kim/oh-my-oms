import { canonicalJson } from './canonical.js';
import { requireCondition } from './errors.js';
import type { Ref } from './types.js';
import type { ConditionBinding, U3OrderLineInput, U3OrderView } from './u3-types.js';

const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const set = (values: unknown[]) => [...new Set(values.map(canonicalJson))].sort();
const check = (condition: unknown, detail: string) =>
  requireCondition(condition, 400, 'INVALID_INPUT', detail);

function validateLine(
  line: Pick<
    U3OrderLineInput,
    'commonOfferRevisionRef' | 'agreementRevisionRefs' | 'conditionBindings'
  >,
): void {
  const bindings = line.conditionBindings;
  check(
    new Set(bindings.map((value) => value.conditionKey)).size === bindings.length,
    '한 행의 같은 조건 항목을 중복하거나 상충하게 등록할 수 없습니다.',
  );
  const agreementRefs: Ref[] = [];
  for (const binding of bindings) {
    if (binding.sourceRef.owner === 'CommercialAgreement') {
      // Draft histories cannot masquerade as an approved corporate condition.
      check(
        binding.sourceRef.entity === 'AgreementRevision',
        '승인 기업 조건의 정확한 개정이 필요합니다.',
      );
      agreementRefs.push(binding.sourceRef);
    } else {
      check(
        equal(binding.sourceRef, line.commonOfferRevisionRef),
        '행의 공통 조건 개정과 매핑이 다릅니다.',
      );
    }
  }
  check(
    equal(set(agreementRefs), set(line.agreementRevisionRefs)),
    '행별 기업 계약 개정은 적용 조건의 정확한 합집합이어야 합니다.',
  );
}
function validatePeriods(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) validatePeriods(child);
    return;
  }
  const row = value as Record<string, unknown>;
  if ('startAt' in row && 'endAt' in row)
    check(
      row.endAt === null || Date.parse(String(row.endAt)) >= Date.parse(String(row.startAt)),
      '유효 구간의 종료는 시작보다 빠를 수 없습니다.',
    );
  if ('startDate' in row && 'endDate' in row)
    check(
      String(row.endDate) >= String(row.startDate),
      '이용 기간의 종료는 시작보다 빠를 수 없습니다.',
    );
  for (const child of Object.values(row)) validatePeriods(child);
}
function validateSnapshot(view: U3OrderView): void {
  for (const line of view.lines) validateLine(line);
  check(
    equal(
      set(view.lines.flatMap((line) => line.agreementRevisionRefs)),
      set(view.agreementRevisionRefs),
    ),
    '주문 전체 계약 개정의 합집합이 행별 매핑과 다릅니다.',
  );
  check(
    equal(
      set(view.lines.map((line) => line.commonOfferRevisionRef)),
      set(view.commonOfferRevisionRefs),
    ),
    '주문 전체 공통 조건 개정의 합집합이 다릅니다.',
  );
  check(
    equal(set(view.lines.flatMap((line) => line.conditionBindings)), set(view.conditionBindings)),
    '주문 전체 조건 매핑의 합집합이 다릅니다.',
  );
}
// Runs only after closed AJV validation. Cross-field meaning is not source trust:
// owners still verify current protected sources, authority, purpose and targets.
export function validateU3Semantics(definition: string, value: unknown): void {
  validatePeriods(value);
  const data = value as Record<string, unknown>;
  if (definition === 'ConditionBindings') {
    const bindings = value as ConditionBinding[];
    check(
      new Set(bindings.map((binding) => binding.conditionKey)).size === bindings.length,
      '조건 항목을 중복할 수 없습니다.',
    );
  }
  if (definition === 'ProductInput')
    check(
      data.productType === 'HARDWARE'
        ? data.softwareTermKind === null
        : data.softwareTermKind !== null,
      'HW/SW의 이용형을 확인하세요.',
    );
  if (definition === 'OrderLineInput' || definition === 'OrderLineView')
    validateLine(value as U3OrderLineInput);
  if (definition === 'CapturedLine' || definition === 'CapturedLines') {
    const lines = definition === 'CapturedLine' ? [data] : (value as Record<string, unknown>[]);
    for (const line of lines) {
      validateLine(line as unknown as U3OrderLineInput);
      check(
        (line.priceKnowledge === 'KNOWN') === (line.purchasePrice !== null),
        '미확인 구매 가격을0원/확정 금액으로 치환할 수 없습니다.',
      );
    }
  }
  if (definition === 'PriceAdjustment')
    check(
      (data.knowledge === 'KNOWN') ===
        (data.amount !== null &&
          data.confirmedByRef !== null &&
          (data.evidenceRefs as unknown[]).length > 0),
      '미확인 비용과 확정0원은 다른 상태입니다.',
    );
  if (definition === 'OrderPriceBreakdown' && data.knowledge === 'KNOWN') {
    check(
      data.total !== null &&
        data.productAmount !== null &&
        (data.lineAmounts as unknown[]).every((amount) => amount !== null),
      '확정 합계에는 확인한 모든 행 금액이 필요합니다.',
    );
    for (const adjustment of data.adjustments as Record<string, unknown>[])
      validateU3Semantics('PriceAdjustment', adjustment);
  }
  if (definition === 'OrderInput') {
    const lines = data.lines as U3OrderLineInput[];
    for (const line of lines) validateLine(line);
    check(
      lines.every((line) => line.paymentMode === lines[0]!.paymentMode),
      '첫 배포 주문은 단일 지급 종류만 지원합니다.',
    );
  }
  if (definition === 'OrderView') validateSnapshot(value as U3OrderView);
  if (definition === 'OrderViewResult' && data.knowledge === 'KNOWN')
    validateSnapshot(data.data as U3OrderView);
  if (definition === 'ProposalInput') {
    const order = data.targetOrderRef !== null;
    check(
      order
        ? data.targetEntitlementRef === null && data.targetRenewalCycleRef === null
        : data.targetEntitlementRef !== null && data.targetRenewalCycleRef !== null,
      '주문 또는 정확한 SW 권한·갱신 회차를 선택해야 합니다.',
    );
  }
  if (definition === 'ConsentInput') {
    check(
      data.proposalRevision === (data.proposalRef as Ref).revision &&
        (data.meta as { expectedRevision: number }).expectedRevision === data.proposalRevision,
      '동의의 정확한 제안 개정이 다릅니다.',
    );
  }
  if (
    definition === 'ApplyOrderChangeInput' ||
    definition === 'OrderDecisionInput' ||
    definition === 'AgreementApprovalInput'
  ) {
    const target = (data.orderRef ?? data.targetRef) as Ref;
    check(
      (data.meta as { expectedRevision: number }).expectedRevision === target.revision,
      '명령의 예상 개정과 원본 참조 개정이 다릅니다.',
    );
  }
}
