import { randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import type { ProtectedTransaction } from '@oms/persistence';
import type { ProtectedStore, ModelData } from '@oms/persistence';
import { canonicalJson } from '@oms/contracts';
import { Authorization } from './authorization.js';
import { ref } from './references.js';
export const U2_WORK_OPERATIONS = Object.freeze({
  'EnterpriseAccess.deliverInvitation': {
    owner: 'EnterpriseAccess',
    entity: 'MembershipInvitation',
    consumer: 'u2-invitation-delivery',
    action: 'enterprise.invitation.deliver',
  },
  'IdentityRecovery.deliverHandoff': {
    owner: 'IdentityRecovery',
    entity: 'RecoveryHandoffGrant',
    consumer: 'u2-handoff-delivery',
    action: 'identity.handoff.deliver',
  },
  'IdentityRecovery.removeOriginalFactor': {
    owner: 'IdentityRecovery',
    entity: 'RecoveryCase',
    consumer: 'u2-identity',
    action: 'identity.factor.remove',
  },
  'IdentityRecovery.signOutOriginalSessions': {
    owner: 'IdentityRecovery',
    entity: 'RecoveryCase',
    consumer: 'u2-identity',
    action: 'identity.sessions.signout',
  },
  'IdentityRecovery.replaceFirstFactor': {
    owner: 'IdentityRecovery',
    entity: 'RecoveryCase',
    consumer: 'u2-identity',
    action: 'identity.first-factor.replace',
  },
});
export async function enqueueU2Work(
  transaction: ProtectedTransaction,
  context: Pick<ServiceContext, 'correlationId'>,
  requestId: string,
  operation: keyof typeof U2_WORK_OPERATIONS,
  target: Ref,
  epoch: string,
  now: Date,
  deadlineAt: string,
  plannedWorkId?: string,
): Promise<{ workRef: Ref; factRef: Ref }> {
  const binding = U2_WORK_OPERATIONS[operation];
  requireCondition(
    target.owner === binding.owner &&
      target.entity === binding.entity &&
      now.getTime() < Date.parse(deadlineAt),
    503,
    'U2_WORK_BINDING',
    '등록된 원래 작업/대상/기한이 필요합니다.',
  );
  const fact = {
    eventId: randomUUID(),
    sourceOwner: target.owner,
    aggregateRef: target,
    aggregateVersion: target.revision,
    sourceFactRef: target,
    targetScope: null,
    causationRequestId: requestId,
    correlationId: context.correlationId,
    schemaVersion: 'u2-access-additions:1',
    supersedesFactRef: null,
    evidenceRefs: [],
    occurredAt: now.toISOString(),
  };
  const workId = plannedWorkId ?? randomUUID(),
    deadline = new Date(Math.min(Date.parse(deadlineAt), now.getTime() + 300000)).toISOString();
  const permit = {
    permitId: randomUUID(),
    workId,
    consumer: binding.consumer,
    principalId: 'u2-worker-identity',
    audience: 'SYSTEM',
    action: binding.action,
    owner: binding.owner,
    operationId: operation,
    sourceFactRef: ref('FactEnvelope', fact),
    targetScope: null,
    epoch,
    allowed: true,
    deadlineAt: deadline,
    revision: 1,
  };
  const work = {
    workId,
    requestId,
    owner: binding.owner,
    operationId: operation,
    targetRef: target,
    sourceFactRef: ref('FactEnvelope', fact),
    executionPermitRef: ref('ExecutionPermit', permit),
    expectedRevision: target.revision,
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
    consumer: binding.consumer,
    epoch,
    state: 'PENDING',
    transportMessageId: null,
    attempt: 0,
    firstAttemptAt: null,
    deadlineAt: deadline,
    revision: 1,
  });
  return { workRef: ref('WorkItem', work), factRef: ref('FactEnvelope', fact) };
}
export function u2WorkEnvelope(data: ModelData) {
  return {
    workId: String(data.workId),
    requestId: String(data.requestId),
    owner: String(data.owner),
    operationId: String(data.operationId),
    targetRef: data.targetRef as Ref,
    sourceFactRef: data.sourceFactRef as Ref,
    executionPermitRef: data.executionPermitRef as Ref,
    expectedRevision: Number(data.expectedRevision),
    notBefore: String(data.notBefore),
    deadlineAt: String(data.deadlineAt),
    attempt: Number(data.attempt),
    correlationId: String(data.correlationId),
  };
}
export async function assertU2WorkPermit(
  store: ProtectedStore,
  work: ModelData,
  now: () => Date,
  tx?: ProtectedTransaction,
  control = false,
): Promise<void> {
  const authorization = new Authorization(store, now),
    descriptor = U2_WORK_OPERATIONS[work.operationId as keyof typeof U2_WORK_OPERATIONS];
  requireCondition(
    descriptor &&
      work.owner === descriptor.owner &&
      (control || work.epoch === (await store.currentEpoch())),
    403,
    'U2_WORK_BINDING',
    '현재 등록된 owner/operation/epoch가 필요합니다.',
  );
  const selected = work.executionPermitRef as Ref,
    visible = await authorization.lookup('ExecutionPermit', selected.id, tx),
    permit = control
      ? await store.readRevision('ExecutionPermit', selected.id, selected.revision)
      : visible,
    factRef = work.sourceFactRef as Ref,
    fact = await authorization.lookup('FactEnvelope', factRef.id, tx);
  requireCondition(
    visible &&
      selected.owner === 'EnterpriseAccess' &&
      selected.entity === 'ExecutionPermit' &&
      permit?.revision === selected.revision &&
      permit.allowed &&
      permit.consumer === descriptor.consumer &&
      permit.principalId === 'u2-worker-identity' &&
      permit.audience === 'SYSTEM' &&
      permit.owner === descriptor.owner &&
      permit.operationId === work.operationId &&
      permit.action === descriptor.action &&
      permit.workId === work.workId &&
      permit.epoch === work.epoch &&
      permit.deadlineAt === work.deadlineAt &&
      canonicalJson(permit.sourceFactRef) === canonicalJson(factRef) &&
      factRef.owner === 'U1Host' &&
      factRef.entity === 'FactEnvelope' &&
      fact &&
      canonicalJson(ref('FactEnvelope', fact)) === canonicalJson(factRef) &&
      canonicalJson(fact.aggregateRef) === canonicalJson(work.targetRef) &&
      fact.aggregateVersion === work.expectedRevision &&
      fact.causationRequestId === work.requestId &&
      fact.correlationId === work.correlationId &&
      ((!control &&
        permit.allowed &&
        visible.revision === permit.revision &&
        now().getTime() < Date.parse(String(work.deadlineAt)) &&
        now().getTime() >= Date.parse(String(work.notBefore))) ||
        control),
    403,
    'U2_WORK_PERMIT',
    'exact 원래 permit/consumer/target/사실/기한을 대조하세요.',
  );
}
