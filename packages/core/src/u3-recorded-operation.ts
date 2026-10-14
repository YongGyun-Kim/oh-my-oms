import { canonicalJson, requireCondition } from '@oms/contracts';
import type { InvocationTarget, Ref, TargetScope } from '@oms/contracts';
import { U3_SOURCE_CONTRACT } from '@oms/persistence';
import type { ModelData, U3Owner, U3Transaction } from '@oms/persistence';
import type { U3CurrentBasis } from './u3-current-basis.js';
import { ref, u3Ref } from './references.js';

const exact = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const verified = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'U3_RECORDED_SOURCE',
    '실제 보호된 소유자 접수·이력·결과의 정확한 결합이 필요합니다.',
  );
// 같은 원자 접수의 이력과 결과를 읽는다. 호출자는 현재 행위 권한을 별도로 검증한다.
export async function recordedOperation(
  scope: U3Transaction,
  basis: U3CurrentBasis,
  input: {
    owner: U3Owner;
    operation: string;
    afterRef: Ref;
    beforeRef: Ref | null;
    resultRef: Ref;
    target: InvocationTarget;
    targetScope: TargetScope;
    audience: 'CUSTOMER' | 'STAFF';
  },
): Promise<{ history: ModelData; receipt: ModelData }> {
  const historyModel =
    input.owner === 'CommercialAgreement'
      ? 'AgreementHistory'
      : input.owner === 'OrderAcceptance'
        ? 'OrderHistory'
        : 'CatalogHistory';
  const histories = await basis.collection(scope, historyModel, {
    afterRef: { id: input.afterRef.id },
  });
  const matches: { history: ModelData; receipt: ModelData }[] = [];
  for (const history of histories) {
    if (
      !exact(history.afterRef, input.afterRef) ||
      !exact(history.beforeRef, input.beforeRef) ||
      history.sourceRevision !== input.afterRef.revision
    )
      continue;
    const current = await scope.repository.store.currentProtected(
      'RequestReceipt',
      String(history.requestId),
    );
    verified(current);
    const receipt = await scope.current(ref('RequestReceipt', current!));
    if (receipt.operation !== input.operation) continue;
    verified(
      history.owner === input.owner &&
        history.actorAccountRef &&
        receipt.owner === input.owner &&
        receipt.audience === input.audience &&
        receipt.principalId === (history.actorAccountRef as Ref).id &&
        exact(receipt.targetIdentity, input.target) &&
        exact(receipt.targetScope, input.targetScope) &&
        exact(receipt.sourceContract, U3_SOURCE_CONTRACT) &&
        [input.afterRef, input.resultRef].every((reference) =>
          (history.resultRefs as Ref[]).some((value) => exact(value, reference)),
        ) &&
        [
          input.afterRef,
          input.resultRef,
          u3Ref(historyModel, history, scope.repository.store.schema),
        ].every((reference) =>
          (receipt.resultRefs as Ref[]).some((value) => exact(value, reference)),
        ),
    );
    matches.push({ history, receipt });
  }
  verified(matches.length === 1);
  return matches[0]!;
}
