import { canonicalJson, ExecutionBudget, requireCondition, type Ref } from '@oms/contracts';
import type { ModelData } from './model-catalog.js';

const exact = (left: unknown, right: unknown) =>
  left !== undefined && right !== undefined && canonicalJson(left) === canonicalJson(right);
const source = { profile: 'urn:oms:contract:u4-financial:1', registryVersion: 4 };
const hold = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'U4_DUE_BASIS_MISSING',
    '완료 근거의 원래 청구·기한 접수와 모든 후속 정정 이력을 확인해야 합니다.',
  );
const invoiceRef = (value: ModelData): Ref => ({
  owner: 'FinancialSettlement',
  entity: 'Invoice',
  id: String(value.invoiceId),
  revision: Number(value.revision),
});
type ReadRevision = (model: string, id: string, revision: number) => Promise<ModelData | null>;

export async function verifyU4InvoiceCompletionState(
  invoice: ModelData,
  basis: ModelData | null,
  read: ReadRevision,
): Promise<'CURRENT' | 'CORRECTED' | null> {
  if (basis) return verifyU4CompletionLink(invoice, basis, read);
  for (const reference of invoice.historyRefs as Ref[]) {
    ExecutionBudget.current()?.check();
    if (reference.owner !== 'FinancialSettlement' || reference.entity !== 'FinancialHistory')
      continue;
    const entry = await read('FinancialHistory', reference.id, reference.revision);
    hold(entry);
    const after = entry!.afterRef as Ref | null;
    if (after?.entity !== 'Invoice' || after.id !== invoice.invoiceId) continue;
    const receipt = await read('RequestReceipt', String(entry!.requestRef), 1);
    hold(receipt);
    hold(
      !(
        receipt!.owner === 'FinancialSettlement' &&
        receipt!.operation === 'reconcileInvoiceDue' &&
        exact(receipt!.sourceContract, source)
      ),
    );
  }
  return null;
}

// 현재 원상과 복구 원상 모두 같은 불변 개정 체인을 확인한다. 과거 Ref라는 이유만으로 허용하지 않는다.
export async function verifyU4CompletionLink(
  invoice: ModelData,
  basis: ModelData,
  read: ReadRevision,
): Promise<'CURRENT' | 'CORRECTED'> {
  const anchorRef = basis.invoiceRef as Ref;
  hold(
    anchorRef.owner === 'FinancialSettlement' &&
      anchorRef.entity === 'Invoice' &&
      anchorRef.id === invoice.invoiceId &&
      basis.invoiceId === invoice.invoiceId &&
      exact(basis.sourceContract, source) &&
      anchorRef.revision <= Number(invoice.revision) &&
      exact(invoice.targetScope, basis.targetScope) &&
      (invoice.orderRef as Ref).id === (basis.orderRef as Ref).id,
  );
  async function history(value: ModelData, operation: string) {
    const reference = (value.historyRefs as Ref[]).at(-1);
    hold(reference?.owner === 'FinancialSettlement' && reference.entity === 'FinancialHistory');
    const entry = await read('FinancialHistory', reference!.id, reference!.revision);
    hold(
      entry &&
        entry.historyId === reference!.id &&
        Number(entry.revision) === reference!.revision &&
        exact(entry.afterRef, invoiceRef(value)) &&
        exact(entry.targetScope, value.targetScope),
    );
    const receipt = await read('RequestReceipt', String(entry!.requestRef), 1);
    hold(
      receipt &&
        receipt.requestId === entry!.requestRef &&
        receipt.owner === 'FinancialSettlement' &&
        receipt.operation === operation &&
        exact(receipt.sourceContract, source) &&
        exact(receipt.targetScope, value.targetScope) &&
        (receipt.resultRefs as Ref[]).some((item) => exact(item, invoiceRef(value))) &&
        (receipt.resultRefs as Ref[]).some((item) => exact(item, reference)),
    );
    return { entry: entry!, receipt: receipt!, reference: reference! };
  }
  let current = invoice;
  while (Number(current.revision) > anchorRef.revision) {
    ExecutionBudget.current()?.check();
    const previousRef = current.correctionOf as Ref | null;
    hold(
      previousRef &&
        exact(previousRef, { ...invoiceRef(current), revision: Number(current.revision) - 1 }),
    );
    const previous = await read('Invoice', anchorRef.id, previousRef!.revision);
    hold(
      previous &&
        exact(invoiceRef(previous), previousRef) &&
        current.invoiceId === previous.invoiceId &&
        current.obligationKey === previous.obligationKey &&
        (current.orderRef as Ref).id === (previous.orderRef as Ref).id &&
        exact(current.targetScope, previous.targetScope) &&
        exact((current.historyRefs as Ref[]).slice(0, -1), previous.historyRefs),
    );
    const cancelled = current.lifecycle === 'CANCELLED';
    hold(
      cancelled ||
        (current.lifecycle === 'ISSUED' &&
          (current.providedTrancheRefs as Ref[]).length === 0 &&
          (current.dueDate === null ||
            ((current.dueBasis as { kind: string; date?: string }).kind === 'FIXED_DATE' &&
              current.dueDate === (current.dueBasis as { date: string }).date))),
    );
    const recorded = await history(current, cancelled ? 'cancelInvoice' : 'correctInvoice');
    hold(
      exact(recorded.entry.beforeRef, previousRef) &&
        exact(recorded.entry.correctionOf, (previous!.historyRefs as Ref[]).at(-1)),
    );
    current = previous!;
  }
  hold(
    exact(invoiceRef(current), anchorRef) &&
      current.dueDate !== null &&
      exact(current.orderRef, basis.orderRef) &&
      exact(current.chargeTermsRef, basis.termsSnapshotRef) &&
      exact(current.dueBasis, basis.dueBasis) &&
      exact(
        current.providedTrancheRefs,
        (basis.completionView as { providedTranches: { trancheRef: Ref }[] }).providedTranches.map(
          (value) => value.trancheRef,
        ),
      ),
  );
  const recorded = await history(current, 'reconcileInvoiceDue');
  hold(
    exact(recorded.reference, (basis.historyRefs as Ref[]).at(-1)) &&
      (recorded.receipt.resultRefs as Ref[]).some((value) =>
        exact(value, {
          owner: 'FinancialSettlement',
          entity: 'FinancialCompletionBasis',
          id: basis.invoiceId,
          revision: basis.revision,
        }),
      ),
  );
  return anchorRef.revision === Number(invoice.revision) ? 'CURRENT' : 'CORRECTED';
}
