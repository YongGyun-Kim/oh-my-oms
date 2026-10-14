import { requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext, TargetScope } from '@oms/contracts';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { modelDefinition } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { ref } from './references.js';
import type { OrderingPolicy } from './scopes.js';
const targets: Record<string, { history: string; actions: string[] }> = {
  EnterpriseApplication: { history: 'AccessHistory', actions: ['application.read'] },
  Enterprise: {
    history: 'AccessHistory',
    actions: ['enterprise.approve', 'enterprise.initial-administrator.designate'],
  },
  StaffRole: { history: 'AccessHistory', actions: ['staff.role.manage'] },
  StaffRoleGrant: { history: 'AccessHistory', actions: ['staff.role.manage'] },
  Product: { history: 'CatalogHistory', actions: ['product.read'] },
  Order: { history: 'OrderHistory', actions: ['order.read'] },
};
// Read-only projection of the original history. It cannot traverse to another
// record's payload or infer financial/license access from a related reference.
export class HistoryQuery {
  private readonly authorization: Authorization;
  constructor(
    private readonly store: ProtectedStore,
    private readonly now: () => Date,
  ) {
    this.authorization = new Authorization(store, now);
  }
  private async admitted(context: ServiceContext, target: Ref): Promise<ModelData> {
    await this.authorization.identity(context);
    const definition = targets[target.entity];
    requireCondition(
      definition && modelDefinition(target.entity).owner === target.owner,
      404,
      'NOT_FOUND',
      '대상을 확인할 수 없습니다.',
    );
    if (context.audience === 'CUSTOMER') {
      requireCondition(target.entity === 'Order', 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      const order = await this.store.read('Order', target.id);
      requireCondition(order, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      const scope = order.targetScope as TargetScope;
      await this.authorization.relation(context, scope.enterpriseRef.id);
      const original = await this.store.readRevision(
        'Enterprise',
        scope.enterpriseRef.id,
        scope.organisationRevision,
      );
      requireCondition(
        original,
        503,
        'ORIGINAL_POLICY_MISSING',
        '원래 조직 기준을 확인해야 합니다.',
      );
      await this.authorization.requireCustomer(
        context,
        'order.read',
        scope,
        original.orderingContextPolicy as OrderingPolicy,
      );
    } else
      for (const action of definition.actions)
        await this.authorization.requireStaff(context, action);
    const record = await this.store.read(target.entity, target.id);
    requireCondition(record, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    return record;
  }
  async read(
    context: ServiceContext,
    target: Ref,
    input: { cursor: string | null; pageSize: number },
  ): Promise<unknown> {
    this.store.schema.validate('Ref', target);
    await this.admitted(context, target);
    const identity = { owner: target.owner, entity: target.entity, id: target.id };
    const rows = await this.store.list(targets[target.entity]!.history, {
      anyOf: [{ beforeRef: identity }, { afterRef: identity }, { resultRefs: [identity] }],
      cursor: input.cursor,
      limit: input.pageSize,
    });
    let reviewAllowed = target.entity !== 'Order';
    if (target.entity === 'Order' && context.audience === 'STAFF') {
      try {
        await this.authorization.requireStaff(context, 'order.review.read');
        reviewAllowed = true;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ACTION_DENIED'))
          throw error;
      }
    }
    const items = rows.map((row) => ({
      historyRef: ref(targets[target.entity]!.history, row),
      actorAccountRef: context.audience === 'STAFF' ? row.actorAccountRef : null,
      verifiedPersonRef: context.audience === 'STAFF' ? row.verifiedPersonRef : null,
      occurredAt: row.occurredAt,
      reason: row.reason,
      beforeRef: row.beforeRef,
      afterRef: row.afterRef,
      evidenceRefs: reviewAllowed ? row.evidenceRefs : [],
      requestId: row.requestId,
      resultRefs: reviewAllowed
        ? row.resultRefs
        : (row.resultRefs as Ref[]).filter(
            (value) =>
              value.owner === 'OrderAcceptance' && ['Order', 'OrderLine'].includes(value.entity),
          ),
      correctionOf: row.correctionOf,
      sourceRevision: row.sourceRevision,
    }));
    await this.admitted(context, target);
    return this.store.schema.validate('HistoryView', {
      historyRefs: items.map((row) => row.historyRef),
      sourceFactRefs: [],
      correctionRefs: items.flatMap((row) => (row.correctionOf ? [row.correctionOf] : [])),
      observedAt: this.now().toISOString(),
      items,
      nextCursor: rows.length === input.pageSize ? String(rows.at(-1)!.historyId) : null,
    });
  }
}
