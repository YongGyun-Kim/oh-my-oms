import { requireCondition } from './errors.js';
import type { U4AgreedPaymentPlan, U4AllocationItem, U4RefundInput } from './u4-types.js';

const check = (condition: unknown) =>
  requireCondition(condition, 400, 'INVALID_INPUT', '금융 입력의 금액·식별·개정을 확인하세요.');

// Financial values use the shared KRW shape with a stricter integer boundary.
// The 4096 digit bound is checked again after exact addition, before serialization.
export function u4ExactSum(values: readonly string[]): string {
  check(values.every((value) => /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 4096));
  const sum = values.reduce((total, value) => total + BigInt(value), 0n).toString();
  check(sum.length <= 4096);
  return sum;
}
function distinct(values: string[]): void {
  check(new Set(values).size === values.length);
}
function validateNested(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) validateNested(child);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const row = value as Record<string, unknown>;
  if (typeof row.sourceNamespace === 'string' && typeof row.canonicalIdentity === 'string') {
    const aliases = row.aliases as string[];
    distinct([row.canonicalIdentity, ...aliases]);
  }
  if (row.knowledge === 'KNOWN' && Array.isArray(row.obligations) && row.total) {
    const plan = row as unknown as U4AgreedPaymentPlan;
    distinct(plan.obligations.map((obligation) => obligation.obligationKey));
    check(
      u4ExactSum(plan.obligations.map((obligation) => obligation.amount.value)) ===
        plan.total.value,
    );
    for (const obligation of plan.obligations) check(obligation.agreementEvidenceRefs.length > 0);
  }
  for (const child of Object.values(row)) validateNested(child);
}

// Called only after closed schema validation. Owner sources and source profiles
// are still independently verified inside the protected business transaction.
export function validateU4Semantics(definition: string, value: unknown): void {
  validateNested(value);
  if (definition === 'AllocationItems' || definition === 'AllocationBatchInput') {
    const items = (
      definition === 'AllocationItems' ? value : (value as { items: unknown }).items
    ) as U4AllocationItem[];
    distinct(
      items.map(
        (item) => item.invoiceRef.owner + ':' + item.invoiceRef.entity + ':' + item.invoiceRef.id,
      ),
    );
    u4ExactSum(items.map((item) => item.amount.value));
  }
  if (definition === 'RefundInput') {
    const input = value as U4RefundInput;
    distinct(input.portions.map((portion) => portion.portionKey));
    check(
      u4ExactSum(input.portions.map((portion) => portion.amount.value)) ===
        input.requestedAmount.value,
    );
    for (const portion of input.portions)
      check((portion.allocationRef === null) === (portion.invoiceRef === null));
  }
  if (definition === 'RefundResultInput') {
    const results = (value as { results: { portionKey: string }[] }).results;
    distinct(results.map((result) => result.portionKey));
  }
}
