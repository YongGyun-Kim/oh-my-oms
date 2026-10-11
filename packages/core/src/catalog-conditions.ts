import { canonicalJson, requireCondition, U3_PROFILE } from '@oms/contracts';
import type { ConditionBinding, EffectiveWindow, Ref, U3ProductInput } from '@oms/contracts';
import type { ModelData, ProtectedStore } from '@oms/persistence';

export function withinEffectiveWindow(window: EffectiveWindow, at: Date): boolean {
  const now = at.getTime(),
    start = Date.parse(window.startAt),
    end = window.endAt === null ? null : Date.parse(window.endAt);
  return (
    (window.startInclusive ? now >= start : now > start) &&
    (end === null || (window.endInclusive ? now <= end : now < end))
  );
}
// 판매 조건의 등록 내용만 다룬다. 대금 지급·재고·발급의 실제 이행 사실이 아니다.
export function buildCommonOffer(
  store: Pick<ProtectedStore, 'schema'>,
  input: U3ProductInput,
  productRef: Ref,
  offerRef: Ref,
  at: Date,
): { product: ModelData; offer: ModelData | null } {
  store.schema.validateUri(U3_PROFILE + '#/$defs/ProductInput', input);
  const draft = input.offerDraft;
  const product: ModelData = {
    modelVersion: 2,
    productId: productRef.id,
    revision: productRef.revision,
    productType: input.productType,
    softwareTermKind: input.softwareTermKind,
    label: input.label,
    salesDescription: input.salesDescription,
    currentOfferRef: draft ? offerRef : null,
    saleState: 'INCOMPLETE',
  };
  if (!draft) return { product, offer: null };
  requireCondition(
    new Set(draft.conditions.map((value) => value.conditionKey)).size === draft.conditions.length,
    400,
    'CATALOG_CONDITION_DUPLICATE',
    '같은 공통 조건 항목을 중복할 수 없습니다.',
  );
  const conditions: ConditionBinding[] = draft.conditions.map((value) => ({
    ...value,
    sourceRef: offerRef,
  }));
  store.schema.validateUri(U3_PROFILE + '#/$defs/ConditionBindings', conditions);
  const price = conditions.find((value) => value.conditionKey === 'PRICE'),
    visibility = conditions.find((value) => value.conditionKey === 'VISIBILITY'),
    period = conditions.find((value) => value.conditionKey === 'PERIOD');
  requireCondition(
    !price || canonicalJson(price.value) === canonicalJson(input.commonPrice),
    400,
    'CATALOG_PRICE_MISMATCH',
    '공통 단가와 PRICE 조건이 다릅니다.',
  );
  requireCondition(
    input.softwareTermKind === 'TERM' || !period,
    400,
    'CATALOG_PERIOD_KIND',
    '기간제 SW에만 이용 기간을 등록합니다.',
  );
  const complete =
    ['PRICE', 'VISIBILITY', 'PAYMENT', 'PROVISION', 'COMPLETION'].every((key) =>
      conditions.some((value) => value.conditionKey === key),
    ) &&
    (input.softwareTermKind !== 'TERM' || !!period) &&
    draft.revisionEvidenceRefs.length > 0 &&
    conditions.every((value) => value.evidenceRefs.length > 0);
  const active =
    withinEffectiveWindow(draft.effectiveWindow, at) &&
    conditions.every((value) => withinEffectiveWindow(value.effectiveWindow, at));
  // 미완성/미래/만료 초안을 유효 공통 조건으로 추정하지 않는다.
  product.saleState =
    complete && active ? (visibility?.value === true ? 'OFFERABLE' : 'SUSPENDED') : 'INCOMPLETE';
  return {
    product,
    offer: {
      modelVersion: 2,
      offerRevisionId: offerRef.id,
      revision: 1,
      productRef,
      visible: product.saleState === 'OFFERABLE',
      commonPrice: input.commonPrice,
      salesConditionRefs: input.salesConditionRefs,
      publishedAt: at.toISOString(),
      effectiveWindow: draft.effectiveWindow,
      conditionBindings: conditions,
      revisionEvidenceRefs: draft.revisionEvidenceRefs,
    },
  };
}
export function commonOfferSources(input: U3ProductInput): Ref[] {
  const sources = [...input.meta.evidenceRefs, ...input.salesConditionRefs];
  if (input.offerDraft) {
    sources.push(...input.offerDraft.revisionEvidenceRefs);
    for (const condition of input.offerDraft.conditions) {
      sources.push(...condition.evidenceRefs);
      if (condition.conditionKey === 'PAYMENT' || condition.conditionKey === 'PROVISION')
        sources.push(condition.value.termsRef);
      else if (condition.conditionKey === 'PERIOD') sources.push(condition.value.ruleRef);
      else if (condition.conditionKey === 'COMPLETION' || condition.conditionKey === 'RENEWAL')
        sources.push(condition.value);
    }
  }
  // 기업 사적 합의는 CommercialAgreement가 별도 정보 권한으로 합성한다.
  requireCondition(
    sources.every((value) => value.owner !== 'CommercialAgreement'),
    403,
    'CATALOG_PRIVATE_SOURCE',
    '기업 사적 조건을 공통 판매 정보로 공개할 수 없습니다.',
  );
  return [...new Map(sources.map((value) => [canonicalJson(value), value])).values()];
}
