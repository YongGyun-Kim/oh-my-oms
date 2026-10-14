import { canonicalJson, OmsError, requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext, U4DueBasis, U4InvoiceDueInput } from '@oms/contracts';
import type { ModelData } from '@oms/persistence';
import { u4ObligationBindingId, verifyU4InvoiceCompletionState } from '@oms/persistence';
import { U4CommercialOrder } from './u4-commercial-order.js';
import { U4FinancialAccess } from './u4-financial-access.js';
import { U4FinancialLedger } from './u4-financial-ledger.js';
import { u4DueFromFact, u4FullCompletion } from './u4-due-basis.js';
import { U4OwnerSources } from './u4-owner-sources.js';
import type { U4CompletionFactView } from './u4-owner-sources.js';
import { u4Ref } from './references.js';
const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const hold = (condition: unknown, code = 'U4_DUE_UNVERIFIED') =>
  requireCondition(condition, 503, code, '현재 실제 완료·계약·청구의 원래 개정을 대조해야 합니다.');

export function u4CompletionTransition(
  previous: U4CompletionFactView,
  next: U4CompletionFactView,
): 'SAME' | 'NEXT' {
  hold(
    previous.coverage === 'CURRENT' &&
      next.coverage === 'CURRENT' &&
      exact({ ...previous.aggregateRef, revision: next.aggregateRef.revision }, next.aggregateRef),
  );
  if (next.latestSourceRevision === previous.latestSourceRevision) {
    hold(
      exact(
        [next.latestSourceFactRef, next.providedTranches, next.correctionRefs],
        [previous.latestSourceFactRef, previous.providedTranches, previous.correctionRefs],
      ),
      'U4_DUE_CONFLICT',
    );
    return 'SAME';
  }
  hold(next.latestSourceRevision === previous.latestSourceRevision + 1, 'U4_DUE_SEQUENCE');
  hold(next.providedTranches.length === previous.providedTranches.length, 'U4_DUE_SEQUENCE');
  for (const old of previous.providedTranches) {
    const values = next.providedTranches.filter(
      (value) => value.trancheId === old.trancheId && exact(value.orderLineRef, old.orderLineRef),
    );
    hold(values.length === 1, 'U4_DUE_SEQUENCE');
    const current = values[0]!;
    if (current.sourceRevision === old.sourceRevision) hold(exact(current, old), 'U4_DUE_CONFLICT');
    else
      hold(
        current.sourceRevision === old.sourceRevision + 1 &&
          exact(current.correctionOf, old.trancheRef) &&
          current.correctedAt !== null &&
          next.correctionRefs.some((reference) => exact(reference, old.trancheRef)),
        'U4_DUE_SEQUENCE',
      );
  }
  return 'NEXT';
}

export class U4InvoiceDue {
  private readonly orders: U4CommercialOrder;
  private readonly ledger: U4FinancialLedger;
  constructor(
    readonly access: U4FinancialAccess,
    readonly owners = new U4OwnerSources(access.adapter.store, access.adapter.now),
  ) {
    this.orders = new U4CommercialOrder(access.adapter);
    this.ledger = new U4FinancialLedger(access.adapter.store);
  }
  private reference(model: string, value: ModelData) {
    return u4Ref(model, value, this.access.adapter.store.schema);
  }
  reconcileInvoiceDue(context: ServiceContext, input: U4InvoiceDueInput, proof: unknown) {
    return this.access.run(
      context,
      'reconcileInvoiceDue',
      { kind: 'RECORD', recordRef: input.invoiceRef },
      input,
      proof,
      async (scope, mutation) => {
        const current = await this.orders.current(scope, input.orderRef);
        hold(
          current.order.state === 'ACCEPTED' && exact(current.order.targetScope, input.targetScope),
        );
        await this.orders.commercial(scope, current);
        const invoice = await scope.current(input.invoiceRef),
          basis = invoice.dueBasis as U4DueBasis;
        hold(
          exact(invoice.targetScope, input.targetScope) &&
            (invoice.orderRef as Ref).id === input.orderRef.id &&
            invoice.lifecycle === 'ISSUED' &&
            invoice.planRevision === current.plan.planRevision &&
            basis.kind === 'CONFIRMED_FACT_PLUS_DAYS',
        );
        if (basis.kind === 'FIXED_DATE')
          throw new OmsError(
            503,
            'U4_DUE_UNVERIFIED',
            '고정 기한을 실제 완료일 산식으로 바꾸지 않습니다.',
          );
        const obligation = current.plan.obligations.find(
          (value) => value.obligationKey === invoice.obligationKey,
        );
        hold(
          obligation &&
            exact(obligation.dueBasis, basis) &&
            exact(obligation.amount, invoice.amount),
        );
        const owner =
          current.order.productType === 'HARDWARE' ? 'HardwareFulfillment' : 'SoftwareLifecycle';
        hold(basis.sourceOwner === owner);
        await scope.lock([], [input.invoiceRef.id], []);
        await this.ledger.invoice(scope, invoice);
        const invoiceBinding = await scope.optional(
          'FinancialInvoiceBinding',
          u4ObligationBindingId(input.orderRef.id, String(invoice.obligationKey)),
        );
        hold(invoiceBinding && exact(invoiceBinding.invoiceRef, input.invoiceRef));
        const original = await scope.optional('FinancialCompletionBasis', input.invoiceRef.id);
        const link = await verifyU4InvoiceCompletionState(
          invoice,
          original,
          scope.readSource().readRevision,
        );
        if (!original)
          hold(
            invoice.dueDate === null && (invoice.providedTrancheRefs as Ref[]).length === 0,
            'U4_DUE_BASIS_MISSING',
          );
        const observation = await this.owners.completion(
          {
            owner,
            orderRef: input.orderRef,
            termsSnapshotRef: current.order.purchaseTermsRef as Ref,
            productType: current.order.productType as 'HARDWARE' | 'SOFTWARE',
            lines: current.lines.map((line) => ({
              lineRef: this.reference('OrderLine', line),
              quantity: Number(line.quantity),
              completionBasisRef: line.completionBasisRef as Ref,
            })),
            targetScope: input.targetScope,
            epoch: mutation.epoch,
            requestDigest: mutation.requestDigest,
            dueBasis: basis,
            query: input.completionQuery,
          },
          scope.readSource(),
        );
        const view = observation.view;
        if (original) {
          const transition = u4CompletionTransition(
            original.completionView as unknown as U4CompletionFactView,
            view,
          );
          if (transition === 'SAME') {
            hold(exact(original.confirmedFact, observation.confirmedFact), 'U4_DUE_CONFLICT');
            requireCondition(
              link === 'CORRECTED',
              409,
              'U4_DUE_ALREADY_CURRENT',
              '같은 실제 사건 개정은 기한 효과를 다시 만들지 않습니다. 원래 접수를 확인하세요.',
            );
          }
          if (transition === 'NEXT' && basis.event === 'AGREED_CONFIRMED_FACT')
            hold(
              view.correctionRefs.some((reference) =>
                exact(reference, (original.confirmedFact as { sourceRef: Ref }).sourceRef),
              ),
              'U4_DUE_SEQUENCE',
            );
        }
        const complete =
          basis.event === 'ACTUAL_PROVISION_COMPLETION'
            ? u4FullCompletion(
                {
                  orderRef: input.orderRef,
                  termsSnapshotRef: current.order.purchaseTermsRef as Ref,
                  productType: current.order.productType as 'HARDWARE' | 'SOFTWARE',
                  lines: current.lines.map((line) => ({
                    lineRef: this.reference('OrderLine', line),
                    quantity: Number(line.quantity),
                    completionBasisRef: line.completionBasisRef as Ref,
                  })),
                },
                view.providedTranches,
                this.access.adapter.store.schema,
              )
            : {
                completedAt: observation.confirmedFact!.confirmedAt,
                sourceRefs: [observation.confirmedFact!.sourceRef],
              };
        const next = {
          ...invoice,
          dueDate: u4DueFromFact(basis, complete.completedAt),
          providedTrancheRefs: view.providedTranches.map((value) => value.trancheRef),
          correctionOf: input.invoiceRef,
          revision: Number(invoice.revision) + 1,
          historyRefs: [...(invoice.historyRefs as Ref[]), mutation.historyRef],
        };
        await scope.transaction.put('Invoice', next, Number(invoice.revision));
        const reference = this.reference('Invoice', next);
        await scope.transaction.put(
          'FinancialInvoiceBinding',
          {
            ...invoiceBinding!,
            invoiceRef: reference,
            historyRefs: [...(invoiceBinding!.historyRefs as Ref[]), mutation.historyRef],
            revision: Number(invoiceBinding!.revision) + 1,
          },
          Number(invoiceBinding!.revision),
        );
        const saved = {
          modelVersion: 1,
          invoiceId: input.invoiceRef.id,
          invoiceRef: reference,
          orderRef: input.orderRef,
          termsSnapshotRef: current.order.purchaseTermsRef,
          sourceOwner: owner,
          dueBasis: basis,
          completionView: view,
          confirmedFact: observation.confirmedFact,
          epoch: mutation.epoch,
          sourceContract: { profile: 'urn:oms:contract:u4-financial:1', registryVersion: 4 },
          targetScope: input.targetScope,
          historyRefs: [
            ...((original?.historyRefs as Ref[] | undefined) ?? []),
            mutation.historyRef,
          ],
          revision: original ? Number(original.revision) + 1 : 1,
        };
        await scope.transaction.put(
          'FinancialCompletionBasis',
          saved,
          original ? Number(original.revision) : null,
        );
        return {
          target: reference,
          refs: [reference, this.reference('FinancialCompletionBasis', saved)],
          before: input.invoiceRef,
          sourceRefs: [
            input.orderRef,
            current.plan.agreementRevisionRef,
            basis.ruleRef,
            view.latestSourceFactRef,
            view.aggregateRef,
            ...view.correctionRefs,
            ...complete.sourceRefs,
          ],
        };
      },
    );
  }
}
