import type { Ref, ServiceContext, TargetScope } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';
import { Authorization } from './authorization.js';
import type { Assessment } from './order-assessment.js';
import { ref } from './references.js';
import type { OrderingPolicy } from './scopes.js';

export interface OrderReviewHost {
  readonly store: ProtectedStore;
  readonly authorization: Authorization;
  readonly now: () => Date;
  originalPolicy(target: TargetScope): Promise<OrderingPolicy>;
}
export async function readReview(
  host: OrderReviewHost,
  context: ServiceContext,
  id: string,
): Promise<unknown> {
  await host.authorization.identity(context);
  if (context.audience === 'STAFF')
    await host.authorization.requireStaff(context, 'order.review.read');
  const order = await host.store.read('Order', id);
  requireCondition(order, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
  const scope = order.targetScope as TargetScope;
  const policy = await host.originalPolicy(scope);
  if (context.audience === 'STAFF')
    await host.authorization.requireStaff(context, 'order.review.read');
  else {
    const members = await host.store.list('EnterpriseMembership', {
      equals: {
        accountRef: { id: context.principalId },
        enterpriseRef: { id: scope.enterpriseRef.id },
        active: true,
      },
      limit: 2,
    });
    requireCondition(members.length === 1, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    await host.authorization.requireCustomer(context, 'order.read', scope, policy);
  }
  const decision = await host.store.read('AcceptanceDecision', (order.acceptanceRef as Ref).id);
  requireCondition(decision, 503, 'ASSESSMENT_NOT_PROTECTED', '판단 보호를 확인해야 합니다.');
  const lines = [];
  for (const lineRef of order.lineRefs as Ref[]) {
    const line = await host.store.read('OrderLine', lineRef.id);
    requireCondition(line, 503, 'ORDER_LINE_MISSING', '주문 원본 항목을 확인해야 합니다.');
    const assessments = (
      decision.lineAssessments as { lineRef: Ref; assessments: Assessment[] }[]
    ).find((value) => value.lineRef.id === lineRef.id)?.assessments;
    requireCondition(
      assessments?.length,
      503,
      'ASSESSMENT_MISSING',
      '남은 판단을 확인해야 합니다.',
    );
    lines.push({
      lineRef,
      productRef: line.productRef,
      commonOfferRevisionRef: line.commonOfferRevisionRef,
      quantity: line.quantity,
      requestedPaymentMode: line.requestedPaymentMode,
      requestedActivationDate: line.requestedActivationDate,
      assessments: assessments.map(({ basisRefs: _basis, ...value }) => {
        void _basis;
        return value;
      }),
    });
  }
  await host.authorization.identity(context);
  return host.store.schema.validateUri(
    'urn:oms:contract:foundation:1#/$defs/ReviewAssessmentViewResult',
    {
      knowledge: 'KNOWN',
      data: {
        orderRef: ref('Order', order),
        targetScope: scope,
        productType: order.productType,
        acceptance: decision.acceptance,
        requestId: order.submissionRequestId,
        lines,
        nextActions: ['담당자의 전체 조건 확인 필요'],
      },
      sourceRefs: [ref('Order', order), ref('AcceptanceDecision', decision)],
      observedAt: host.now().toISOString(),
    },
  );
}
