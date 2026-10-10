import type { CommandMeta, Receipt, Ref, ServiceContext } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import type { ProtectedTransaction } from '@oms/persistence';
import { EnterpriseInternal } from './enterprise-access-state.js';
import { ref } from './references.js';
import type { OrderingPolicy } from './scopes.js';
export async function setOrderingPolicy(
  host: EnterpriseInternal,
  context: ServiceContext,
  enterpriseRef: Ref,
  input: {
    meta: CommandMeta;
    departmentUsage: 'USED' | 'NOT_USED';
    siteUsage: 'USED' | 'NOT_USED';
  },
): Promise<Receipt> {
  host.store.schema.validateUri(
    'urn:oms:contract:foundation:1#/$defs/SetOrderingContextPolicyInput',
    input,
  );
  await host.authorization.relation(context, enterpriseRef.id);
  const existing = await host.store.read('Enterprise', enterpriseRef.id);
  requireCondition(existing, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
  const target = host.managementTarget(existing);
  const authorize = async (transaction?: ProtectedTransaction) => {
    const member = await host.authorization.requireCustomer(
      context,
      'organisation.manage',
      target,
      existing.orderingContextPolicy as OrderingPolicy,
      transaction,
    );
    requireCondition(
      member.administrator,
      403,
      'ADMINISTRATOR_REQUIRED',
      '기업 관리자 지정이 필요합니다.',
    );
  };
  return host.commands.run(
    context,
    'EnterpriseAccess',
    'setOrderingContextPolicy',
    { kind: 'ENTERPRISE', enterpriseRef },
    input,
    'AccessHistory',
    authorize,
    async (transaction) => {
      const enterprise = await transaction.get('Enterprise', enterpriseRef.id);
      requireCondition(
        enterprise && enterprise.revision === input.meta.expectedRevision,
        409,
        'STALE_REVISION',
        '기업 조직 개정을 다시 확인하세요.',
      );
      const updated = {
        ...enterprise,
        orderingContextPolicy: {
          departmentUsage: input.departmentUsage,
          siteUsage: input.siteUsage,
          setBy: context.actorAccountRef,
          setAt: host.now().toISOString(),
          reason: input.meta.reason,
        },
        revision: Number(enterprise.revision) + 1,
      };
      await transaction.put('Enterprise', updated, Number(enterprise.revision));
      return {
        target: ref('Enterprise', updated),
        refs: [ref('Enterprise', updated)],
        scope: target,
        state: 'RESULT_RECORDED',
        before: ref('Enterprise', enterprise),
      };
    },
  );
}
