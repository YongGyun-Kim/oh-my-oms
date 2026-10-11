import { canonicalJson, requireCondition } from '@oms/contracts';
import type { ConditionBinding, EffectiveWindow, Ref } from '@oms/contracts';
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
