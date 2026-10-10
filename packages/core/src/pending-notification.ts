import { randomUUID } from 'node:crypto';
import type { Ref, ServiceContext, TargetScope } from '@oms/contracts';
import type { ProtectedTransaction } from '@oms/persistence';
import { ref } from './references.js';
// Registered SYSTEM purpose: derive only a minimal in-app notice from this committed owner fact.
export async function enqueueMinimumNotice(
  transaction: ProtectedTransaction,
  context: ServiceContext,
  requestId: string,
  aggregateRef: Ref,
  scope: TargetScope | null,
  epoch: string,
  now: Date,
): Promise<Ref> {
  const workId = randomUUID();
  const factId = randomUUID();
  const deadline = new Date(now.getTime() + 5 * 60000).toISOString();
  const fact = {
    eventId: factId,
    sourceOwner: aggregateRef.owner,
    aggregateRef,
    aggregateVersion: aggregateRef.revision,
    sourceFactRef: aggregateRef,
    targetScope: scope,
    causationRequestId: requestId,
    correlationId: context.correlationId,
    schemaVersion: '1.0.0',
    supersedesFactRef: null,
    evidenceRefs: [],
    occurredAt: now.toISOString(),
  };
  const permit = {
    permitId: randomUUID(),
    workId,
    consumer: 'u1-in-app-notice',
    principalId: 'u1-worker-notice',
    audience: 'SYSTEM',
    action: 'notification.materialise',
    owner: 'NotificationDelivery',
    operationId: 'NotificationDelivery.materialiseInApp',
    sourceFactRef: ref('FactEnvelope', fact),
    targetScope: scope,
    epoch,
    allowed: true,
    deadlineAt: deadline,
    revision: 1,
  };
  const work = {
    workId,
    requestId,
    owner: 'NotificationDelivery',
    operationId: 'NotificationDelivery.materialiseInApp',
    targetRef: aggregateRef,
    sourceFactRef: ref('FactEnvelope', fact),
    executionPermitRef: ref('ExecutionPermit', permit),
    expectedRevision: aggregateRef.revision,
    notBefore: now.toISOString(),
    deadlineAt: deadline,
    attempt: 0,
    state: 'PENDING',
    revision: 1,
    correlationId: context.correlationId,
    epoch,
    leaseOwner: null,
    leaseUntil: null,
    leaseGeneration: 1,
  };
  await transaction.put('FactEnvelope', fact);
  await transaction.put('ExecutionPermit', permit);
  await transaction.put('WorkItem', work);
  await transaction.put('OutboxDelivery', {
    outboxId: randomUUID(),
    workRef: ref('WorkItem', work),
    consumer: 'u1-in-app-notice',
    epoch,
    state: 'PENDING',
    transportMessageId: null,
    attempt: 0,
    firstAttemptAt: null,
    deadlineAt: deadline,
    revision: 1,
  });
  return ref('FactEnvelope', fact);
}
