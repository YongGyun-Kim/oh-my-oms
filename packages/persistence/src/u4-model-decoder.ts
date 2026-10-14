import { canonicalJson, fingerprint, requireCondition, type SchemaValidator } from '@oms/contracts';
import type { ModelData } from './model-catalog.js';
import { validateModel, rowModelVersion } from './model-catalog.js';
import { U4_PERSISTENCE_MODELS, U4_U3_MODELS, U4_VERSION3_MODELS } from './u4-model-catalog.js';

const check = (condition: unknown) =>
  requireCondition(
    condition,
    400,
    'U4_MODEL_CONSTRAINT',
    '금융 원본의 식별·현재 개정·금액 보존을 확인해야 합니다.',
  );
const amount = (value: unknown): bigint => BigInt((value as { value: string }).value);
export function u4IdentityClaimId(namespace: string, identity: string): string {
  return fingerprint({ namespace, identity });
}
export function u4ObligationBindingId(orderId: string, obligationKey: string): string {
  return fingerprint({ orderId, obligationKey });
}
export function validateU4ModelConstraints(
  name: string,
  data: ModelData,
  schema: SchemaValidator,
): void {
  if (data.modelVersion === 3 && ['StaffRole', 'RoleRevisionState'].includes(name)) {
    schema.validateUri(
      'urn:oms:contract:u4-financial:1#/$defs/SourceContract',
      data.sourceContract,
    );
    if (name === 'RoleRevisionState')
      check(
        data.roleRef === null &&
          data.staffRoleRef !== null &&
          (data.scopeRefs as unknown[]).length === 0,
      );
    return;
  }
  if (data.modelVersion === 3 && U4_U3_MODELS.some((model) => model.name === name)) {
    check(data.paymentPlan === null || typeof data.paymentPlan === 'object');
    if (name === 'Order' && data.paymentKind === 'MIXED') check(data.paymentPlan !== null);
    return;
  }
  if (!U4_PERSISTENCE_MODELS.some((model) => model.name === name)) return;
  check(data.modelVersion === 1);
  if (data.targetScope && data.enterpriseRef)
    check(
      canonicalJson((data.targetScope as { enterpriseRef: unknown }).enterpriseRef) ===
        canonicalJson(data.enterpriseRef),
    );
  if (['FinancialIdentityClaim', 'FinancialRefundIdentityClaim'].includes(name))
    check(
      data.claimId ===
        u4IdentityClaimId(String(data.sourceNamespace), String(data.canonicalIdentity)),
    );
  if (name === 'FinancialInvoiceBinding')
    check(
      data.bindingId === u4ObligationBindingId(String(data.orderId), String(data.obligationKey)),
    );
  if (name === 'PaymentEvidence' && data.lifecycle === 'CONFIRMED')
    check(
      data.identity !== null &&
        data.amount !== null &&
        data.actualPaidAt !== null &&
        data.confirmationRef !== null &&
        data.knowledge === 'KNOWN',
    );
  if (name === 'Invoice')
    schema.validateUri('urn:oms:contract:u4-financial:1#/$defs/PositiveMoney', data.amount);
  if (name === 'RefundCase') {
    const portions = data.portions as import('@oms/contracts').U4RefundStatePortion[];
    check(new Set(portions.map((portion) => portion.portionKey)).size === portions.length);
    check(
      portions.reduce((sum, portion) => sum + amount(portion.amount), 0n) ===
        amount(data.requestedAmount),
    );
    for (const portion of portions) {
      const result = portion.currentResult;
      check(
        result.portionKey === portion.portionKey &&
          result.operationId === portion.operationId &&
          result.attemptId === portion.attemptId,
      );
      check(
        amount(result.succeeded) +
          amount(result.failed) +
          amount(result.unknown) +
          amount(result.pending) ===
          amount(portion.amount),
      );
      check(amount(result.succeeded) === 0n || result.actualResultIdentity !== null);
    }
  }
  if (name === 'FinancialPaymentBalance') {
    const p = amount(data.principal),
      l = amount(data.allocatedPrincipal),
      ra = amount(data.allocatedRefunded),
      ru = amount(data.unallocatedRefunded),
      ha = amount(data.allocatedReserved),
      hu = amount(data.unallocatedReserved);
    check(l >= ra && l - ra >= ha && p - l - ru >= hu && p - l - ru >= 0n);
  }
  if (name === 'FinancialInvoiceBalance')
    check(
      amount(data.allocatedPrincipal) >= amount(data.refunded) + amount(data.reserved) &&
        amount(data.allocatedPrincipal) - amount(data.refunded) <= amount(data.amount),
    );
  if (name === 'FinancialApprovalBalance')
    check(amount(data.confirmed) + amount(data.reserved) <= amount(data.limit));
}
export function decodeU4Model(
  name: string,
  version: number,
  data: ModelData,
  schema: SchemaValidator,
): ModelData {
  check(
    U4_PERSISTENCE_MODELS.some((model) => model.name === name) ||
      U4_VERSION3_MODELS.some((model) => model.name === name),
  );
  check(rowModelVersion(name, data) === version);
  return validateModel(name, data, schema);
}
