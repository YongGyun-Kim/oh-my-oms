import { canonicalJson, requireCondition, U3_PROFILE } from '@oms/contracts';
import type {
  Money,
  Ref,
  SchemaValidator,
  U3OrderPriceBreakdown,
  U3PriceConfirmation,
  U3ProposalTerms,
} from '@oms/contracts';
import type { U3Transaction } from '@oms/persistence';
import type { Authorization } from './authorization.js';
import type { U3CurrentBasis } from './u3-current-basis.js';
import { validateProposalPrice } from './proposal-terms.js';

export function unconfirmedOrderPrice(
  terms: U3ProposalTerms,
  schema: SchemaValidator,
): U3OrderPriceBreakdown {
  schema.validateUri(U3_PROFILE + '#/$defs/ProposalTerms', terms);
  const amounts: Money[] = terms.lines.map((line) => ({
    currency: 'KRW',
    value: (BigInt(line.price.value) * BigInt(line.quantity)).toString(),
  }));
  for (const amount of amounts) schema.validateUri(U3_PROFILE + '#/$defs/Money', amount);
  const productAmount: Money = {
    currency: 'KRW',
    value: amounts.reduce((sum, amount) => sum + BigInt(amount.value), 0n).toString(),
  };
  schema.validateUri(U3_PROFILE + '#/$defs/Money', productAmount);
  // 빈 조정 목록은 비용 면제의 증명이 아니다. 확인 자료가 없는 총액은 UNKNOWN으로 보존한다.
  return {
    lineAmounts: amounts,
    productAmount,
    adjustments: [],
    total: null,
    knowledge: 'UNKNOWN',
  };
}

export async function confirmedOrderPrice(
  scope: U3Transaction,
  terms: U3ProposalTerms,
  confirmation: U3PriceConfirmation,
  enterpriseRef: Ref,
  epoch: string,
  digest: string,
  basis: U3CurrentBasis,
  authorization: Authorization,
): Promise<U3OrderPriceBreakdown> {
  const schema = basis.store.schema;
  schema.validateUri(U3_PROFILE + '#/$defs/PriceConfirmation', confirmation);
  requireCondition(
    confirmation.priceBreakdown.knowledge === 'KNOWN' && confirmation.evidenceRefs.length > 0,
    503,
    'ORDER_PRICE_UNCONFIRMED',
    '전체 금액·적용 여부를 확인한 직원 원본이 필요합니다.',
  );
  validateProposalPrice(terms, confirmation.priceBreakdown, schema);
  const proof = { epoch, approvalDigest: digest, targetEnterpriseRef: enterpriseRef };
  const validate = async (account: Ref, evidence: Ref[]) => {
    await scope.current(account);
    await authorization.requireStaffSource(account, 'order.decide', scope.transaction);
    await basis.evidence(
      scope,
      evidence,
      basis.registration.agreementPurpose,
      account,
      enterpriseRef,
      undefined,
      proof,
    );
  };
  // 전체 포함 여부·적용 없음·0원도 같은 정확한 digest에 결합한 소유자의 확인이 필요하다.
  await validate(confirmation.confirmedByRef, confirmation.evidenceRefs);
  for (const item of confirmation.priceBreakdown.adjustments) {
    requireCondition(
      item.knowledge === 'KNOWN' && item.confirmedByRef && item.evidenceRefs.length > 0,
      503,
      'ORDER_PRICE_UNCONFIRMED',
      '각 비용·할인의 실제 확인 직원과 근거가 필요합니다.',
    );
    if (
      canonicalJson(item.confirmedByRef) !== canonicalJson(confirmation.confirmedByRef) ||
      canonicalJson(item.evidenceRefs) !== canonicalJson(confirmation.evidenceRefs)
    )
      await validate(item.confirmedByRef!, item.evidenceRefs);
  }
  return structuredClone(confirmation.priceBreakdown);
}
