import { canonicalJson, requireCondition } from '@oms/contracts';
import type { ConditionBinding, EffectiveWindow, Ref, U3OfferExceptionInput } from '@oms/contracts';
import type { ModelData } from '@oms/persistence';
import { withinEffectiveWindow } from './catalog-conditions.js';

export function overlappingWindows(left: EffectiveWindow, right: EffectiveWindow): boolean {
  const before = (a: EffectiveWindow, b: EffectiveWindow) =>
    a.endAt !== null &&
    (Date.parse(a.endAt) < Date.parse(b.startAt) ||
      (Date.parse(a.endAt) === Date.parse(b.startAt) && !(a.endInclusive && b.startInclusive)));
  return !before(left, right) && !before(right, left);
}
export function assertNoCommercialConflict(candidate: ModelData, existing: ModelData[]): void {
  const products = candidate.productRefs as Ref[],
    conditions = candidate.conditionBindings as ConditionBinding[];
  for (const other of existing) {
    if (
      other.state !== 'APPROVED' ||
      other.agreementRevisionId === candidate.agreementRevisionId ||
      !(other.productRefs as Ref[]).some((value) =>
        products.some((product) => product.id === value.id),
      )
    )
      continue;
    for (const condition of conditions)
      for (const prior of other.conditionBindings as ConditionBinding[])
        requireCondition(
          condition.conditionKey !== prior.conditionKey ||
            !overlappingWindows(
              candidate.effectiveWindow as EffectiveWindow,
              other.effectiveWindow as EffectiveWindow,
            ) ||
            !overlappingWindows(condition.effectiveWindow, prior.effectiveWindow) ||
            canonicalJson(condition.value) === canonicalJson(prior.value),
          409,
          'AGREEMENT_CONDITION_CONFLICT',
          '같은 기업·상품·조건의 상충하는 유효 구간을 해결해야 합니다.',
        );
  }
}
export function resolveConditionBindings(
  common: ConditionBinding[],
  agreements: ModelData[],
  at: Date,
): ConditionBinding[] {
  const resolved = new Map(
    common
      .filter((value) => withinEffectiveWindow(value.effectiveWindow, at))
      .map((value) => [value.conditionKey, value]),
  );
  const corporate = new Map<ConditionBinding['conditionKey'], ConditionBinding>();
  for (const agreement of agreements) {
    if (
      agreement.state !== 'APPROVED' ||
      !withinEffectiveWindow(agreement.effectiveWindow as EffectiveWindow, at)
    )
      continue;
    for (const binding of agreement.conditionBindings as ConditionBinding[]) {
      if (!withinEffectiveWindow(binding.effectiveWindow, at)) continue;
      const previous = corporate.get(binding.conditionKey);
      requireCondition(
        !previous || canonicalJson(previous.value) === canonicalJson(binding.value),
        409,
        'AGREEMENT_CONDITION_CONFLICT',
        '상충한 기업 조건을 공통 가격으로 대체할 수 없습니다.',
      );
      // 같은 값도 근거를 임의로 최근 입력으로 바꾸지 않는다. 조건별 개정은 조회에서 함께 보존한다.
      if (!previous) corporate.set(binding.conditionKey, binding);
    }
  }
  for (const [key, value] of corporate) resolved.set(key, value);
  return [...resolved.values()];
}

export function approvedExceptionTerms(agreement: ModelData, input: U3OfferExceptionInput) {
  requireCondition(
    agreement.modelVersion === 2 && agreement.state === 'APPROVED' && agreement.approvalRef,
    409,
    'EXCEPTION_APPROVAL_REQUIRED',
    '입력이나 현재 포인터만으로 예외를 승인할 수 없습니다.',
  );
  const bindings = agreement.conditionBindings as ConditionBinding[],
    visibility = bindings.filter((value) => value.conditionKey === 'VISIBILITY'),
    price = bindings.filter((value) => value.conditionKey === 'PRICE');
  requireCondition(
    visibility.length === 1 &&
      visibility[0]!.value === input.visibility &&
      price.length <= 1 &&
      canonicalJson(price[0]?.value ?? null) === canonicalJson(input.price) &&
      [...visibility, ...price].every(
        (value) =>
          canonicalJson(value.sourceRef) === canonicalJson(input.agreementRevisionRef) &&
          value.evidenceRefs.length > 0,
      ),
    409,
    'EXCEPTION_CONTENT_MISMATCH',
    '공개·가격·근거는 정확한 승인 개정의 조건과 일치해야 합니다.',
  );
  const window = structuredClone(agreement.effectiveWindow as EffectiveWindow);
  for (const binding of [...visibility, ...price]) {
    const candidate = binding.effectiveWindow;
    requireCondition(
      overlappingWindows(window, candidate),
      409,
      'EXCEPTION_EFFECTIVE_WINDOW',
      '승인과 조건이 함께 유효한 구간이 필요합니다.',
    );
    const start = Date.parse(candidate.startAt) - Date.parse(window.startAt);
    if (start > 0) {
      window.startAt = candidate.startAt;
      window.startInclusive = candidate.startInclusive;
    } else if (start === 0) window.startInclusive &&= candidate.startInclusive;
    if (candidate.endAt !== null) {
      if (window.endAt === null || Date.parse(candidate.endAt) < Date.parse(window.endAt)) {
        window.endAt = candidate.endAt;
        window.endInclusive = candidate.endInclusive;
      } else if (candidate.endAt === window.endAt) window.endInclusive &&= candidate.endInclusive;
    }
  }
  return { visible: input.visibility, price: input.price, effectiveWindow: window };
}
