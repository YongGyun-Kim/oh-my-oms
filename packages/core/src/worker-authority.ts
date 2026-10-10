import type { Observation, Ref, ServiceContext } from '@oms/contracts';
import { canonicalJson, requireCondition } from '@oms/contracts';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import { ref } from './references.js';
import { CONSUMER, WorkerInternal } from './worker-state.js';
export function observed(
  host: WorkerInternal,
  operation: string,
  correlation: string,
): Observation | undefined {
  try {
    return host.telemetry?.begin('worker', 'SYSTEM', operation, correlation);
  } catch {
    console.error(
      JSON.stringify({
        event: 'telemetry-start-failed',
        role: 'worker',
        businessOutcomeUnchanged: true,
      }),
    );
    return undefined;
  }
}
export function completeObserved(
  host: WorkerInternal,
  observation: Observation | undefined,
  metadata: Parameters<Observation['finish']>[0],
): void {
  try {
    observation?.finish(metadata);
  } catch {
    console.error(
      JSON.stringify({
        event: 'telemetry-finish-failed',
        role: 'worker',
        businessOutcomeUnchanged: true,
      }),
    );
  }
}
export function context(host: WorkerInternal, work: ModelData): ServiceContext {
  return {
    principalId: 'u1-worker-notice',
    actorAccountRef: null,
    verifiedPersonRef: null,
    identityAssertionRef: work.executionPermitRef as Ref,
    audience: 'SYSTEM',
    accessEvaluationRef: null,
    executionPermitRef: work.executionPermitRef as Ref,
    correlationId: String(work.correlationId),
    deadlineAt: String(work.deadlineAt),
  };
}
export async function permit(
  host: WorkerInternal,
  work: ModelData,
  transaction?: ProtectedTransaction,
): Promise<ModelData> {
  requireCondition(
    work.epoch === (await host.store.currentEpoch()),
    403,
    'WORK_EPOCH_FENCED',
    '복구 후 원래 작업/외부 결과와 현재 허가를 대조해야 합니다.',
  );
  const permitRef = work.executionPermitRef as Ref;
  requireCondition(
    permitRef.owner === 'EnterpriseAccess' && permitRef.entity === 'ExecutionPermit',
    403,
    'WORK_PERMIT',
    '실행 허가 원본이 필요합니다.',
  );
  const permit = await host.store.currentProtected('ExecutionPermit', permitRef.id);
  const current = transaction ? await transaction.get('ExecutionPermit', permitRef.id) : permit;
  requireCondition(
    permit &&
      current?.revision === permit.revision &&
      permit.revision === permitRef.revision &&
      permit.allowed &&
      permit.workId === work.workId &&
      permit.consumer === CONSUMER &&
      permit.principalId === 'u1-worker-notice' &&
      permit.audience === 'SYSTEM' &&
      permit.action === 'notification.materialise' &&
      permit.owner === 'NotificationDelivery' &&
      permit.operationId === work.operationId &&
      work.operationId === 'NotificationDelivery.materialiseInApp' &&
      permit.epoch === work.epoch &&
      work.epoch === (await host.store.currentEpoch()) &&
      Date.parse(String(permit.deadlineAt)) > host.now().getTime(),
    403,
    'WORK_PERMIT',
    '현재 목적/소비자/세대/기한의 실행 허가가 필요합니다.',
  );
  const sourceFactRef = work.sourceFactRef as Ref;
  requireCondition(
    sourceFactRef?.owner === 'U1Host' && sourceFactRef.entity === 'FactEnvelope',
    403,
    'WORK_CAUSATION',
    '원래 업무 사실의 전체 참조가 필요합니다.',
  );
  const fact = await host.store.read('FactEnvelope', sourceFactRef.id);
  requireCondition(
    fact &&
      canonicalJson(ref('FactEnvelope', fact)) === canonicalJson(sourceFactRef) &&
      canonicalJson(permit.sourceFactRef) === canonicalJson(sourceFactRef) &&
      canonicalJson(fact.aggregateRef) === canonicalJson(work.targetRef) &&
      fact.sourceOwner === (work.targetRef as Ref).owner &&
      fact.aggregateVersion === work.expectedRevision &&
      fact.causationRequestId === work.requestId &&
      fact.correlationId === work.correlationId,
    403,
    'WORK_CAUSATION',
    '원래 사실/전체대상/소유자/접수/개정을 대조해야 합니다.',
  );
  return fact;
}
