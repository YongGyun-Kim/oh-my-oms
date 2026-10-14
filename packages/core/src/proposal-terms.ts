import { canonicalJson, fingerprint, requireCondition, U3_PROFILE } from '@oms/contracts';
import type {
  Ref,
  SchemaValidator,
  TargetScope,
  U3OrderPriceBreakdown,
  U3ProposalTerms,
} from '@oms/contracts';

const check = (condition: unknown, message: string) =>
  requireCondition(condition, 409, 'PROPOSAL_PRICE_UNCONFIRMED', message);
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const money = (value: bigint) => ({ currency: 'KRW', value: value.toString() });
const bounded = (amount: bigint, schema: SchemaValidator) => {
  check(amount >= 0n, '원 단위 계산 결과는 비음수여야 합니다.');
  // 돈은 정수 문자열이다. Number의 수량/개정 한도를 금액에 적용하지 않는다.
  schema.validateUri(U3_PROFILE + '#/$defs/Money', money(amount));
};

// 입력 산술 검증일 뿐, 직원 확인·현재 근거/권한 원본을 대신하지 않는다.
// UNKNOWN은 그대로 보존하며 유효한 고객 동의 대상으로 승격하지 않는다.
export function validateProposalPrice(
  terms: U3ProposalTerms,
  price: U3OrderPriceBreakdown,
  schema: SchemaValidator,
): U3OrderPriceBreakdown {
  schema.validateUri(U3_PROFILE + '#/$defs/ProposalTerms', terms);
  schema.validateUri(U3_PROFILE + '#/$defs/OrderPriceBreakdown', price);
  const amounts = terms.lines.map((line) => {
    const amount = BigInt(line.price.value) * BigInt(line.quantity);
    bounded(amount, schema);
    return amount;
  });
  const product = amounts.reduce((sum, amount) => sum + amount, 0n);
  bounded(product, schema);
  check(price.lineAmounts.length === amounts.length, '제안 행과 금액의 개수가 다릅니다.');
  if (price.knowledge === 'KNOWN')
    check(
      price.productAmount !== null && price.lineAmounts.every((amount) => amount !== null),
      '확정 제안에는 모든 행 금액과 상품 소계가 필요합니다.',
    );
  for (const [index, amount] of price.lineAmounts.entries())
    check(
      amount === null || equal(amount, money(amounts[index]!)),
      '단가×수량과 확인한 행 금액이 다릅니다.',
    );
  check(
    price.productAmount === null || equal(price.productAmount, money(product)),
    '상품 금액 합계가 다릅니다.',
  );
  const adjustments = new Map(price.adjustments.map((item) => [item.itemId, item]));
  check(adjustments.size === price.adjustments.length, '비용·할인의 식별자를 중복할 수 없습니다.');
  let total = product;
  for (const item of price.adjustments) {
    schema.validateUri(U3_PROFILE + '#/$defs/PriceAdjustment', item);
    if (item.knowledge !== 'KNOWN') {
      check(
        item.amount === null && item.confirmedByRef === null,
        '미확인 비용을 확정 금액으로 사용할 수 없습니다.',
      );
      continue;
    }
    check(
      item.amount !== null && item.confirmedByRef !== null && item.evidenceRefs.length > 0,
      '확인한 비용의 금액·직원·근거가 필요합니다.',
    );
    if (item.position === 'OTHER_ITEM') {
      const seen = new Set([item.itemId]);
      let current = item;
      while (current.position === 'OTHER_ITEM') {
        const parent =
          current.includedInItemId === null ? undefined : adjustments.get(current.includedInItemId);
        check(
          parent &&
            !seen.has(parent.itemId) &&
            parent.knowledge === 'KNOWN' &&
            parent.position !== 'NOT_APPLICABLE',
          '포함 금액의 실제 항목과 순환 없는 확인 경로가 필요합니다.',
        );
        seen.add(parent!.itemId);
        current = parent!;
      }
    } else {
      check(item.includedInItemId === null, '다른 항목 포함 참조를 임의로 붙일 수 없습니다.');
      if (item.position === 'NOT_APPLICABLE')
        check(item.amount!.value === '0', '적용하지 않는 비용은 확인한 0원이어야 합니다.');
      if (item.position === 'SEPARATE')
        total += (item.kind === 'DISCOUNT' ? -1n : 1n) * BigInt(item.amount!.value);
    }
  }
  bounded(total, schema);
  if (price.knowledge === 'KNOWN') {
    check(
      price.adjustments.every((item) => item.knowledge === 'KNOWN'),
      '미확인 비용을 0원으로 추정할 수 없습니다.',
    );
    check(equal(price.total, money(total)), '확인한 비용·할인을 반영한 전체 합계가 다릅니다.');
  } else check(price.total === null, '미확인 합계를 확정 금액으로 표시할 수 없습니다.');
  return structuredClone(price);
}

export interface ProposalContent {
  proposalRevision: number;
  targetScope: TargetScope;
  targetOrderRef: Ref | null;
  targetEntitlementRef: Ref | null;
  targetRenewalCycleRef: Ref | null;
  originalTerms: U3ProposalTerms;
  proposedTerms: U3ProposalTerms;
  originalPriceBreakdown: U3OrderPriceBreakdown;
  priceBreakdown: U3OrderPriceBreakdown;
  agreementEvidenceRefs: Ref[];
}
// 상태/전송 키는 제외하되, 화면에 제시한 대상·원래/새 조건·원 단위 비용·근거는 모두 고정한다.
export function proposalTermsFingerprint(
  content: ProposalContent,
  schema: SchemaValidator,
): string {
  schema.validateUri(U3_PROFILE + '#/$defs/Revision', content.proposalRevision);
  schema.validateUri(U3_PROFILE + '#/$defs/TargetScope', content.targetScope);
  schema.validateUri(U3_PROFILE + '#/$defs/ProposalTerms', content.originalTerms);
  schema.validateUri(U3_PROFILE + '#/$defs/ProposalTerms', content.proposedTerms);
  schema.validateUri(U3_PROFILE + '#/$defs/Refs', content.agreementEvidenceRefs);
  for (const reference of [
    content.targetOrderRef,
    content.targetEntitlementRef,
    content.targetRenewalCycleRef,
  ])
    if (reference !== null) schema.validateUri(U3_PROFILE + '#/$defs/Ref', reference);
  check(
    content.targetOrderRef !== null
      ? content.targetOrderRef.owner === 'OrderAcceptance' &&
          content.targetOrderRef.entity === 'Order' &&
          content.targetEntitlementRef === null &&
          content.targetRenewalCycleRef === null
      : content.targetEntitlementRef?.owner === 'SoftwareLifecycle' &&
          content.targetEntitlementRef.entity === 'EnterpriseEntitlement' &&
          content.targetRenewalCycleRef?.owner === 'SoftwareLifecycle' &&
          content.targetRenewalCycleRef.entity === 'RenewalCycle',
    '정확한 주문 또는 SW 권한·회차가 필요합니다.',
  );
  validateProposalPrice(content.proposedTerms, content.priceBreakdown, schema);
  validateProposalPrice(content.originalTerms, content.originalPriceBreakdown, schema);
  return fingerprint({
    proposalRevision: content.proposalRevision,
    targetScope: content.targetScope,
    targetOrderRef: content.targetOrderRef,
    targetEntitlementRef: content.targetEntitlementRef,
    targetRenewalCycleRef: content.targetRenewalCycleRef,
    originalTerms: content.originalTerms,
    proposedTerms: content.proposedTerms,
    originalPriceBreakdown: content.originalPriceBreakdown,
    priceBreakdown: content.priceBreakdown,
    agreementEvidenceRefs: content.agreementEvidenceRefs,
  });
}
