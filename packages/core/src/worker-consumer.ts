import type { Receipt, Work } from '@oms/contracts';
import { ExecutionBudget, canonicalJson, requireCondition } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import { randomUUID } from 'node:crypto';
import type { QueueMessage } from './queue.js';
import { workerFailureOutcome } from './worker-observation.js';
import { CONSUMER, envelope, ReceiptResult, WorkerInternal } from './worker-state.js';
import type { ProtectedStore, ModelData, ProtectedTransaction } from '@oms/persistence';
import type { QueueBroker } from './queue.js';
import { validateQueueWork } from './queue.js';
import { assertU2WorkPermit, u2WorkEnvelope, U2_WORK_OPERATIONS } from './identity-work.js';
import { relayU2Outbox } from './worker-relay.js';
import { Authorization } from './authorization.js';
import { IdentityConsumer } from './identity-consumer.js';
import { boundedIdentityCall, identitySubjectKey } from './identity-consumer.js';
import { PurposeSecretVault } from '@oms/persistence';
import type { RecoveryHandoffs } from './recovery-handoff.js';
import type { EnterpriseInvitations } from './enterprise-invitations.js';
import { ref } from './references.js';
import { fingerprint } from '@oms/contracts';
export function originalWorkExpired(deadlineAt: string, now: Date): boolean {
  const deadline = Date.parse(deadlineAt);
  requireCondition(
    Number.isFinite(deadline) && Number.isFinite(now.getTime()),
    400,
    'WORK_DEADLINE',
    '원래 유효 기한/시각을 확인하세요.',
  );
  return deadline <= now.getTime();
}
export async function consume(host: WorkerInternal, message: QueueMessage): Promise<ReceiptResult> {
  const correlation =
    typeof (message.body as Partial<Work> | null)?.correlationId === 'string'
      ? (message.body as Work).correlationId
      : randomUUID();
  const observation = host.observed('NotificationDelivery.consume', correlation);
  try {
    const result = await host.consumeOriginal(message);
    host.completeObserved(observation, {
      outcome: result.disposition === 'CONTROL_REVIEW_REQUIRED' ? 'BUSINESS_REFUSAL' : 'SUCCESS',
      knowledge: ['KNOWN', 'UNKNOWN'],
    });
    return result;
  } catch (error) {
    host.completeObserved(observation, { outcome: workerFailureOutcome(error) });
    throw error;
  }
}
export async function consumeOriginal(
  host: WorkerInternal,
  message: QueueMessage,
): Promise<ReceiptResult> {
  const outer = ExecutionBudget.current() ?? new ExecutionBudget(30000, () => host.now().getTime());
  return outer.run(async () => {
    requireCondition(
      message.consumer === CONSUMER,
      403,
      'CONSUMER_NOT_REGISTERED',
      '소비자 binding이 없습니다.',
    );
    const incoming = host.store.schema.validate<Work>('Work', message.body);
    const work = await host.store.read('WorkItem', incoming.workId);
    requireCondition(work, 503, 'WORK_NOT_PROTECTED', '원래 작업 보호를 확인해야 합니다.');
    if (originalWorkExpired(String(work.deadlineAt), host.now())) {
      const immutable = (value: Work) => {
        const { attempt: _attempt, ...rest } = value;
        void _attempt;
        return rest;
      };
      requireCondition(
        canonicalJson(immutable(incoming)) === canonicalJson(immutable(envelope(work))),
        403,
        'WORK_ENVELOPE_MISMATCH',
        '큐 사본은 만료 중단 원본을 대체할 수 없습니다.',
      );
      const deliveries = await host.store.list('OutboxDelivery', {
        equals: { consumer: CONSUMER, workRef: { id: incoming.workId } },
        limit: 2,
      });
      requireCondition(
        deliveries.length === 1 &&
          deliveries[0]!.transportMessageId === message.id &&
          ['PUBLISHED', 'REVIEW_REQUIRED'].includes(String(deliveries[0]!.state)),
        403,
        'EXPIRED_DELIVERY_BINDING',
        '원래 발행/수신 식별자의 만료 중단만 기록합니다.',
      );
      const outbox = deliveries[0]!;
      return new ExecutionBudget(
        Math.min(3000, outer.remaining()),
        () => host.now().getTime(),
        outer.signal,
      ).run(async () => {
        let result: ReceiptResult;
        if (outbox.state === 'PUBLISHED') result = await host.holdExpired(outbox, work);
        else {
          await host.store.currentProtected('WorkItem', String(work.workId));
          await host.store.currentProtected('OutboxDelivery', String(outbox.outboxId));
          const receipts = await host.store.list('RequestReceipt', {
            equals: {
              operation: 'reviewExpiredOriginalOutbox',
              owner: 'NotificationDelivery',
              resultRefs: [{ entity: 'WorkItem', id: incoming.workId }],
            },
            limit: 2,
          });
          requireCondition(
            receipts.length === 1 && work.state === 'REVIEW_REQUIRED',
            503,
            'EXPIRED_CONTROL_NOT_PROTECTED',
            '원래 보호된 중단 결과가 필요합니다.',
          );
          result = {
            requestId: String(receipts[0]!.requestId),
            resultRef: (receipts[0]!.resultRefs as Ref[])[0]!,
            disposition: 'CONTROL_REVIEW_REQUIRED',
          };
        }
        if (host.broker)
          await host.broker.acknowledge(message, ExecutionBudget.current()!.signalWithin(500));
        return result;
      });
    }
    const remaining = Math.min(
      outer.remaining(),
      Date.parse(String(work.deadlineAt)) - host.now().getTime(),
    );
    requireCondition(remaining > 0, 409, 'WORK_DEADLINE', '원래 작업 잔여 기한을 확인해야 합니다.');
    return new ExecutionBudget(remaining, () => host.now().getTime(), outer.signal).run(
      async () => {
        const receipt = (await host.operations.invoke(
          'NotificationDelivery',
          'materialiseInApp',
          2,
          { context: host.context(work), target: { kind: 'NONE' }, data: incoming },
        )) as Receipt;
        // ACK shares the original Work/processing budget after protected effect.
        if (host.broker)
          await host.broker.acknowledge(message, ExecutionBudget.current()!.signalWithin(30000));
        return { requestId: receipt.requestId, resultRef: receipt.targetRef! };
      },
    );
  });
}
export interface U2DeliveryHandler {
  readonly profile: 'LOCAL_SYNTHETIC' | 'UNREGISTERED';
  assert(work: ModelData, transaction?: ProtectedTransaction): Promise<void>;
  execute(work: ModelData, budget: ExecutionBudget): Promise<Ref>;
}
export interface PrivatePurposeReceiver {
  readonly profile: 'LOCAL_SYNTHETIC' | 'UNREGISTERED';
  send(
    envelope: {
      deliveryId: string;
      routeRef: Ref;
      targetRef: Ref;
      purpose: 'HANDOFF' | 'INVITATION_TOKEN';
    },
    privateBytes: Buffer,
    budget: ExecutionBudget,
  ): Promise<{ deliveryId: string; routeRef: Ref; knowledge: 'KNOWN' | 'UNKNOWN' }>;
}
export class PrivateU2Delivery implements U2DeliveryHandler {
  readonly profile: 'LOCAL_SYNTHETIC' | 'UNREGISTERED';
  private readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    private readonly vault: PurposeSecretVault,
    private readonly receiver: PrivatePurposeReceiver,
    private readonly now: () => Date,
    private readonly synthetic: boolean,
    private readonly handoffs?: RecoveryHandoffs,
    private readonly invitations?: EnterpriseInvitations,
  ) {
    requireCondition(
      (!handoffs || handoffs.store === store) &&
        (!invitations || invitations.store === store) &&
        (receiver.profile === 'UNREGISTERED' ||
          (receiver.profile === 'LOCAL_SYNTHETIC' && synthetic)),
      503,
      'PRIVATE_RECEIVER_REGISTRATION',
      '현재 server-owned 원본/격리 local 수신 경계가 필요합니다.',
    );
    this.profile = receiver.profile;
    this.authorization = new Authorization(store, now);
  }
  async assert(work: ModelData, tx?: ProtectedTransaction): Promise<void> {
    requireCondition(
      this.profile === 'LOCAL_SYNTHETIC' && this.synthetic,
      503,
      'U2_PRIVATE_RECEIVER_HOLD',
      '실제 수신/국내 경로/권위 미확인에서는 원문을 전달하지 않습니다.',
    );
    await assertU2WorkPermit(this.store, work, this.now, tx);
    if (work.operationId === 'IdentityRecovery.deliverHandoff') {
      requireCondition(
        this.handoffs,
        503,
        'HANDOFF_DELIVERY_UNREGISTERED',
        '원래 인계 모듈이 필요합니다.',
      );
      await this.handoffs.assertDelivery(work.targetRef as Ref);
    } else {
      requireCondition(
        work.operationId === 'EnterpriseAccess.deliverInvitation' && this.invitations,
        503,
        'INVITATION_DELIVERY_UNREGISTERED',
        '원래 초대 모듈이 필요합니다.',
      );
      await this.invitations.assertDelivery(work.targetRef as Ref, tx);
    }
  }
  async execute(work: ModelData, outer: ExecutionBudget): Promise<Ref> {
    const existing = await this.store.list('RequestReceipt', {
      equals: {
        operation: 'deliverU2PurposeMaterial',
        owner: work.owner,
        idempotencyKey: 'private-' + work.workId,
      },
      limit: 2,
    });
    if (existing[0]) {
      const receipt = (await this.authorization.lookup(
        'RequestReceipt',
        String(existing[0].requestId),
      ))!;
      return ref('RequestReceipt', receipt);
    }
    await this.assert(work);
    const token = randomUUID(),
      claim = await this.store.execute(
        {
          principalId: 'u2-worker-identity',
          audience: 'SYSTEM',
          owner: String(work.owner),
          operation: 'claimU2PurposeDelivery',
          target: { workId: work.workId },
          idempotencyKey: 'private-claim-' + work.workId,
          input: { workId: work.workId, targetRef: work.targetRef },
          correlationId: String(work.correlationId),
          epoch: String(work.epoch),
        },
        async (tx) => {
          const current = (await this.authorization.lookup('WorkItem', String(work.workId), tx))!;
          await this.assert(current, tx);
          requireCondition(
            current.state === 'PENDING' && current.attempt === 0,
            409,
            'U2_DELIVERY_ALREADY_STARTED',
            '원래 단회 비공개 전달이 이미 시작됐습니다.',
          );
          await tx.put(
            'WorkItem',
            {
              ...current,
              state: 'PROCESSING',
              attempt: 1,
              leaseOwner: token,
              leaseUntil: new Date(
                Math.min(this.now().getTime() + 5000, Date.parse(String(work.deadlineAt))),
              ).toISOString(),
              leaseGeneration: Number(current.leaseGeneration) + 1,
              revision: Number(current.revision) + 1,
            },
            Number(current.revision),
          );
        },
      );
    requireCondition(
      !claim.replay,
      409,
      'U2_DELIVERY_ALREADY_STARTED',
      '이미 시작한 원래 전달은 새 send가 아닙니다.',
    );
    let known = false,
      routeRef: Ref | null = null,
      privateBytes: Buffer | null = null;
    try {
      const budget = new ExecutionBudget(
        Math.max(
          1,
          Math.min(
            5000,
            outer.remaining() - 1000,
            Date.parse(String(work.deadlineAt)) - this.now().getTime() - 1000,
          ),
        ),
        () => this.now().getTime(),
        outer.signal,
      );
      await this.assert(work);
      const material =
        work.operationId === 'IdentityRecovery.deliverHandoff'
          ? await this.handoffs!.deliveryMaterial(work.targetRef as Ref)
          : await this.invitations!.deliveryMaterial(work.targetRef as Ref);
      routeRef = material.routeRef;
      privateBytes = await this.vault.read(material.binding, material.permit);
      requireCondition(
        /^[A-Za-z0-9_-]+$/.test(privateBytes.toString('utf8')) &&
          privateBytes.length === (material.binding.purpose === 'HANDOFF' ? 16 : 43),
        503,
        'U2_PRIVATE_MATERIAL',
        '원래 정규 목적 bytes만 전달합니다.',
      );
      await this.assert(work);
      const bytes = privateBytes,
        observed = await boundedIdentityCall(budget, async () => {
          const lease = await this.authorization.lookup('WorkItem', String(work.workId));
          requireCondition(
            lease?.state === 'PROCESSING' &&
              lease.leaseOwner === token &&
              lease.attempt === 1 &&
              this.now().getTime() < Date.parse(String(lease.leaseUntil)),
            409,
            'U2_DELIVERY_FENCED',
            '현재 원래 단회 전달 lease가 필요합니다.',
          );
          await this.assert(lease);
          privateBytes = null;
          try {
            return await this.receiver.send(
              {
                deliveryId: String(work.workId),
                routeRef: material.routeRef,
                targetRef: work.targetRef as Ref,
                purpose: material.binding.purpose as 'HANDOFF' | 'INVITATION_TOKEN',
              },
              bytes,
              budget,
            );
          } finally {
            bytes.fill(0);
          }
        });
      known =
        Object.keys(observed).sort().join(',') === 'deliveryId,knowledge,routeRef' &&
        observed.deliveryId === work.workId &&
        canonicalJson(observed.routeRef) === canonicalJson(material.routeRef) &&
        observed.knowledge === 'KNOWN';
    } catch {
      known = false;
    } finally {
      privateBytes?.fill(0);
    }
    const committed = await this.store.execute(
      {
        principalId: 'u2-worker-identity',
        audience: 'SYSTEM',
        owner: String(work.owner),
        operation: 'deliverU2PurposeMaterial',
        target: { workId: work.workId },
        idempotencyKey: 'private-' + work.workId,
        input: { workId: work.workId, routeRef, knowledge: known ? 'KNOWN' : 'UNKNOWN' },
        correlationId: String(work.correlationId),
        epoch: String(work.epoch),
      },
      async (tx, requestId) => {
        const current = (await this.authorization.lookup('WorkItem', String(work.workId), tx))!;
        requireCondition(
          current.state === 'PROCESSING' &&
            current.attempt === 1 &&
            current.leaseOwner === token &&
            current.epoch === work.epoch,
          409,
          'U2_DELIVERY_FENCED',
          '원래 현재 단회 전달 lease만 결과를 기록합니다.',
        );
        known = known && this.now().getTime() < Date.parse(String(current.leaseUntil));
        const result = {
            ...current,
            state: known ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED',
            leaseOwner: null,
            leaseUntil: null,
            revision: Number(current.revision) + 1,
          },
          at = this.now().toISOString();
        await tx.put('WorkItem', result, Number(current.revision));
        if (known && work.operationId === 'EnterpriseAccess.deliverInvitation')
          await tx.put('SecurityTombstone', {
            tombstoneId: randomUUID(),
            revision: 1,
            targetRef: work.targetRef,
            purpose: 'INVITATION_TOKEN',
            reason: 'PRIVATE_DELIVERY_CONFIRMED',
            destroyedAt: at,
            epoch: work.epoch,
          });
        await tx.put('RequestReceipt', {
          requestId,
          principalId: 'u2-worker-identity',
          audience: 'SYSTEM',
          operation: 'deliverU2PurposeMaterial',
          targetIdentity: { kind: 'RECORD', recordRef: work.targetRef },
          requestFingerprint: fingerprint({ workId: work.workId, routeRef }),
          idempotencyKey: 'private-' + work.workId,
          owner: work.owner,
          targetScope: null,
          requestState: known ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED',
          resultRefs: [ref('WorkItem', result)],
          acceptedAt: at,
          updatedAt: at,
          revision: 1,
          correlationId: work.correlationId,
        });
        const model = work.owner === 'IdentityRecovery' ? 'IdentityHistory' : 'AccessHistory';
        await tx.put(model, {
          historyId: randomUUID(),
          owner: work.owner,
          actorAccountRef: null,
          verifiedPersonRef: null,
          occurredAt: at,
          reason: known
            ? '등록된 local 비공개 수신으로 전달; actual 수신 실증과 별개'
            : '원래 비공개 전달 결과 불명; 자동 재송신 없음',
          beforeRef: ref('WorkItem', current),
          afterRef: ref('WorkItem', result),
          evidenceRefs: [],
          requestId,
          resultRefs: [ref('WorkItem', result)],
          correctionOf: null,
          sourceRevision: result.revision,
        });
      },
    );
    if (known && work.operationId === 'EnterpriseAccess.deliverInvitation')
      await this.invitations!.destroyDelivered(work.targetRef as Ref);
    return { owner: 'U1Host', entity: 'RequestReceipt', id: committed.requestId, revision: 1 };
  }
}
export class U2Worker {
  readonly consumers = Object.freeze([
    'u2-identity',
    'u2-handoff-delivery',
    'u2-invitation-delivery',
  ]);
  private readonly authorization: Authorization;
  private cursor: string | null = null;
  private sourceIndex = 0;
  private readonly sourceCursors: Record<string, string | null> = {
    RecoveryHandoffGrant: null,
    MembershipInvitation: null,
    EnrollmentAuthority: null,
  };
  private readonly failures: { workRef: Ref; code: string; consumer: string }[] = [];
  constructor(
    readonly store: ProtectedStore,
    private readonly broker: QueueBroker,
    private readonly identity: IdentityConsumer,
    private readonly now: () => Date,
    private readonly synthetic: boolean,
    private readonly deliveries: Partial<
      Record<'u2-handoff-delivery' | 'u2-invitation-delivery', U2DeliveryHandler>
    > = {},
  ) {
    requireCondition(
      identity.store === store &&
        (broker.kind !== 'SYNTHETIC' || synthetic) &&
        Object.entries(deliveries).every(
          ([key, value]) =>
            ['u2-handoff-delivery', 'u2-invitation-delivery'].includes(key) &&
            value &&
            typeof value.assert === 'function' &&
            typeof value.execute === 'function' &&
            (value.profile === 'UNREGISTERED' ||
              (value.profile === 'LOCAL_SYNTHETIC' && synthetic)),
        ),
      503,
      'U2_WORKER_REGISTRATION',
      '현재 server-owned 모듈/닫힌 local 전달 profile이 필요합니다.',
    );
    this.authorization = new Authorization(store, now);
  }
  private async assertSource(work: ModelData, tx?: ProtectedTransaction) {
    const operation = U2_WORK_OPERATIONS[work.operationId as keyof typeof U2_WORK_OPERATIONS];
    requireCondition(operation, 403, 'U2_WORK_BINDING', '등록된 현재 U2 작업만 처리합니다.');
    if (operation.consumer === 'u2-identity') {
      await this.identity.assertPrepared(work, tx);
      return;
    }
    const handler =
      this.deliveries[operation.consumer as 'u2-handoff-delivery' | 'u2-invitation-delivery'];
    requireCondition(
      handler?.profile === 'LOCAL_SYNTHETIC' && this.synthetic,
      503,
      'U2_PRIVATE_RECEIVER_HOLD',
      'actual 수신/국내 경로가 미등록이면 전달을 보류합니다.',
    );
    await handler.assert(work, tx);
  }
  relayOne(outboxId: string): Promise<void> {
    return relayU2Outbox(this.store, this.broker, outboxId, this.now, (work, tx) =>
      this.assertSource(work, tx),
    );
  }
  private async stop(work: ModelData, outbox: ModelData, reason: string): Promise<ReceiptResult> {
    const epoch = await this.store.currentEpoch(),
      budget = new ExecutionBudget(3000, () => this.now().getTime());
    return budget.run(async () => {
      const previous = await this.store.list('RequestReceipt', {
        equals: {
          owner: work.owner,
          operation: 'stopOriginalU2Work',
          idempotencyKey: 'stop-' + work.workId + '-' + outbox.outboxId,
        },
        limit: 2,
      });
      if (previous[0]) {
        await this.authorization.lookup('WorkItem', String(work.workId));
        await this.authorization.lookup('OutboxDelivery', String(outbox.outboxId));
        const receipt = (await this.authorization.lookup(
          'RequestReceipt',
          String(previous[0].requestId),
        ))!;
        requireCondition(
          ['REVIEW_REQUIRED', 'RESULT_RECORDED'].includes(String(work.state)) &&
            outbox.state === 'REVIEW_REQUIRED',
          503,
          'U2_STOP_NOT_PROTECTED',
          '원래 보호 중단 상태를 대조하세요.',
        );
        return {
          requestId: String(receipt.requestId),
          resultRef: (receipt.resultRefs as Ref[])[0]!,
          disposition: 'CONTROL_REVIEW_REQUIRED' as const,
        };
      }
      await assertU2WorkPermit(this.store, work, this.now, undefined, true);
      const commit = await this.store.execute(
        {
          principalId: 'u2-worker-identity',
          audience: 'SYSTEM',
          owner: String(work.owner),
          operation: 'stopOriginalU2Work',
          target: { workId: work.workId, outboxId: outbox.outboxId },
          idempotencyKey: 'stop-' + work.workId + '-' + outbox.outboxId,
          input: {
            workId: work.workId,
            outboxId: outbox.outboxId,
            deadlineAt: work.deadlineAt,
            reason,
          },
          correlationId: String(work.correlationId),
          epoch,
        },
        async (tx, requestId) => {
          const current = (await this.authorization.lookup('WorkItem', String(work.workId), tx))!,
            delivery = (await this.authorization.lookup(
              'OutboxDelivery',
              String(outbox.outboxId),
              tx,
            ))!;
          await assertU2WorkPermit(this.store, current, this.now, tx, true);
          requireCondition(
            canonicalJson(u2WorkEnvelope(current)) === canonicalJson(u2WorkEnvelope(work)) &&
              delivery.revision === outbox.revision &&
              delivery.epoch === current.epoch &&
              ['PENDING', 'PUBLISHED', 'REVIEW_REQUIRED'].includes(String(delivery.state)),
            409,
            'U2_STOP_BINDING',
            '원래 current 작업/발행의 보호 중단만 적용합니다.',
          );
          const stopped = {
              ...current,
              state: current.state === 'RESULT_RECORDED' ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED',
              leaseOwner: null,
              leaseUntil: null,
              revision: Number(current.revision) + 1,
            },
            refs: Ref[] = [ref('WorkItem', stopped)];
          await tx.put('WorkItem', stopped, Number(current.revision));
          await tx.put(
            'OutboxDelivery',
            { ...delivery, state: 'REVIEW_REQUIRED', revision: Number(delivery.revision) + 1 },
            Number(delivery.revision),
          );
          const target = await this.authorization.lookup(
            (current.targetRef as Ref).entity,
            (current.targetRef as Ref).id,
            tx,
          );
          if (
            target &&
            (current.targetRef as Ref).entity === 'RecoveryHandoffGrant' &&
            target.state === 'ISSUED'
          ) {
            const next = {
              ...target,
              state:
                this.now().getTime() >= Date.parse(String(target.expiresAt))
                  ? 'EXPIRED'
                  : 'REVOKED',
              revision: Number(target.revision) + 1,
            };
            await tx.put('RecoveryHandoffGrant', next, Number(target.revision));
            refs.push(ref('RecoveryHandoffGrant', next));
            await tx.put('SecurityTombstone', {
              tombstoneId: randomUUID(),
              revision: 1,
              targetRef: { ...ref('RecoveryHandoffGrant', target), revision: 1 },
              purpose: 'HANDOFF',
              reason,
              destroyedAt: this.now().toISOString(),
              epoch,
            });
          }
          if (
            target &&
            (current.targetRef as Ref).entity === 'MembershipInvitation' &&
            target.state === 'PENDING' &&
            this.now().getTime() >= Date.parse(String(target.expiresAt))
          ) {
            const next = { ...target, state: 'EXPIRED', revision: Number(target.revision) + 1 };
            await tx.put('MembershipInvitation', next, Number(target.revision));
            refs.push(ref('MembershipInvitation', next));
            await tx.put('SecurityTombstone', {
              tombstoneId: randomUUID(),
              revision: 1,
              targetRef: ref('MembershipInvitation', target),
              purpose: 'INVITATION_TOKEN',
              reason,
              destroyedAt: this.now().toISOString(),
              epoch,
            });
          }
          if (
            target &&
            (current.targetRef as Ref).entity === 'RecoveryCase' &&
            !['COMPLETED', 'CLOSED', 'REJECTED'].includes(String(target.state))
          ) {
            const next = {
              ...target,
              state: 'HOLD',
              holdReason: reason,
              revision: Number(target.revision) + 1,
            };
            await tx.put('RecoveryCase', next, Number(target.revision));
            refs.push(ref('RecoveryCase', next));
            if (target.enrollmentAuthorityRef) {
              const authority = await this.authorization.lookup(
                'EnrollmentAuthority',
                (target.enrollmentAuthorityRef as Ref).id,
                tx,
              );
              if (authority && ['ACTIVE', 'HOLD'].includes(String(authority.state)))
                await tx.put(
                  'EnrollmentAuthority',
                  { ...authority, state: 'HOLD', revision: Number(authority.revision) + 1 },
                  Number(authority.revision),
                );
            }
            const intent = await this.authorization.lookup(
              'IdentityOperationResult',
              String(current.workId),
              tx,
            );
            if (current.attempt === 1 && intent?.knowledge !== 'KNOWN') {
              if (intent) {
                await tx.put(
                  'IdentityOperationResult',
                  {
                    ...intent,
                    knowledge: 'UNKNOWN',
                    effect: 'UNCONFIRMED',
                    terminal: false,
                    revision: Number(intent.revision) + 1,
                  },
                  Number(intent.revision),
                );
                const binding = await this.store.readRevision(
                  'ProviderBinding',
                  (intent.bindingRef as Ref).id,
                  (intent.bindingRef as Ref).revision,
                );
                requireCondition(
                  binding,
                  503,
                  'U2_STOP_BINDING',
                  '원래 subject 예약의 binding 원본이 필요합니다.',
                );
                const reservation = await this.authorization.lookup(
                  'EndpointCircuit',
                  identitySubjectKey(String(binding.issuer), String(binding.subject)),
                  tx,
                );
                requireCondition(
                  reservation &&
                    reservation.probeOwner === current.workId &&
                    reservation.probeEpoch === current.epoch &&
                    reservation.probeToken &&
                    (!current.leaseOwner || reservation.probeToken === current.leaseOwner),
                  503,
                  'U2_STOP_RESERVATION',
                  '시작된 원래 subject 예약을 보존해야 합니다.',
                );
                if (reservation.state !== 'REVIEW_REQUIRED')
                  await tx.put(
                    'EndpointCircuit',
                    {
                      ...reservation,
                      state: 'REVIEW_REQUIRED',
                      revision: Number(reservation.revision) + 1,
                    },
                    Number(reservation.revision),
                  );
              }
              const slots = await tx.list(
                'IdentityExecutionSlot',
                { accountRef: { id: (target.accountRef as Ref).id }, state: 'ACTIVE' },
                2,
              );
              requireCondition(
                slots.length <= 1,
                503,
                'U2_STOP_SLOT',
                '원래 단일 불명 실행 경계를 대조하세요.',
              );
              if (slots[0])
                await tx.put(
                  'IdentityExecutionSlot',
                  {
                    ...slots[0],
                    state: 'UNKNOWN',
                    originalOperationRef: ref('WorkItem', current),
                    revision: Number(slots[0].revision) + 1,
                  },
                  Number(slots[0].revision),
                );
            }
          }
          if (
            current.operationId === 'IdentityRecovery.replaceFirstFactor' &&
            target?.enrollmentAuthorityRef
          )
            await tx.put('SecurityTombstone', {
              tombstoneId: randomUUID(),
              revision: 1,
              targetRef: { ...(target.enrollmentAuthorityRef as Ref), revision: 1 },
              purpose: 'FIRST_FACTOR',
              reason,
              destroyedAt: this.now().toISOString(),
              epoch,
            });
          const at = this.now().toISOString(),
            historyModel =
              current.owner === 'IdentityRecovery' ? 'IdentityHistory' : 'AccessHistory';
          await tx.put('RequestReceipt', {
            requestId,
            principalId: 'u2-worker-identity',
            audience: 'SYSTEM',
            operation: 'stopOriginalU2Work',
            targetIdentity: { kind: 'RECORD', recordRef: current.targetRef },
            requestFingerprint: fingerprint({
              workId: current.workId,
              outboxId: outbox.outboxId,
              reason,
            }),
            idempotencyKey: 'stop-' + current.workId + '-' + outbox.outboxId,
            owner: current.owner,
            targetScope: null,
            requestState: 'REVIEW_REQUIRED',
            resultRefs: refs,
            acceptedAt: at,
            updatedAt: at,
            revision: 1,
            correlationId: current.correlationId,
          });
          await tx.put(historyModel, {
            historyId: randomUUID(),
            owner: current.owner,
            actorAccountRef: null,
            verifiedPersonRef: null,
            occurredAt: at,
            reason: '원래 U2 작업의 보호 중단; 새 business 효과/기한 없음',
            beforeRef: ref('WorkItem', current),
            afterRef: ref('WorkItem', stopped),
            evidenceRefs: [],
            requestId,
            resultRefs: refs,
            correctionOf: null,
            sourceRevision: stopped.revision,
          });
        },
      );
      const receipt = (await this.authorization.lookup('RequestReceipt', commit.requestId))!;
      return {
        requestId: commit.requestId,
        resultRef: (receipt.resultRefs as Ref[])[0]!,
        disposition: 'CONTROL_REVIEW_REQUIRED',
      };
    });
  }
  takeFailures() {
    return this.failures.splice(0);
  }
  async sweepSources(): Promise<{ scanned: number; expired: number; blocked: number }> {
    const descriptors = [
        {
          model: 'RecoveryHandoffGrant',
          id: 'grantId',
          states: ['ISSUED'],
          owner: 'IdentityRecovery',
          purposes: ['HANDOFF'],
        },
        {
          model: 'MembershipInvitation',
          id: 'invitationId',
          states: ['PENDING', 'RECONFIRMATION_REQUIRED'],
          owner: 'EnterpriseAccess',
          purposes: ['INVITATION_TOKEN'],
        },
        {
          model: 'EnrollmentAuthority',
          id: 'authorityId',
          states: ['ACTIVE', 'HOLD'],
          owner: 'IdentityRecovery',
          purposes: ['ENROLLMENT_HANDLE', 'PROVIDER_CHALLENGE', 'FIRST_FACTOR'],
        },
      ],
      descriptor = descriptors[this.sourceIndex++ % descriptors.length]!;
    const rows = await this.store.list(descriptor.model, {
      anyOf: descriptor.states.map((state) => ({ state })),
      cursor: this.sourceCursors[descriptor.model],
      limit: 25,
    });
    let expired = 0,
      blocked = 0;
    for (const row of rows) {
      this.sourceCursors[descriptor.model] = String(row[descriptor.id]);
      if (this.now().getTime() < Date.parse(String(row.expiresAt))) continue;
      try {
        const visible = (await this.authorization.lookup(
            descriptor.model,
            String(row[descriptor.id]),
          ))!,
          epoch = await this.store.currentEpoch();
        await new ExecutionBudget(3000, () => this.now().getTime()).run(() =>
          this.store.execute(
            {
              principalId: 'u2-worker-identity',
              audience: 'SYSTEM',
              owner: descriptor.owner,
              operation: 'expireOriginalU2Source',
              target: ref(descriptor.model, visible),
              idempotencyKey: 'source-expiry-' + descriptor.model + '-' + row[descriptor.id],
              input: { sourceRef: ref(descriptor.model, visible), expiresAt: visible.expiresAt },
              correlationId: String(row[descriptor.id]),
              epoch,
            },
            async (tx, requestId) => {
              const current = (await this.authorization.lookup(
                descriptor.model,
                String(row[descriptor.id]),
                tx,
              ))!;
              requireCondition(
                current.revision === visible.revision &&
                  descriptor.states.includes(String(current.state)) &&
                  this.now().getTime() >= Date.parse(String(current.expiresAt)),
                409,
                'U2_SOURCE_EXPIRY_CHANGED',
                '원래 현재 source/기한을 대조하세요.',
              );
              const next = { ...current, state: 'EXPIRED', revision: Number(current.revision) + 1 },
                refs: Ref[] = [ref(descriptor.model, next)];
              await tx.put(descriptor.model, next, Number(current.revision));
              for (const purpose of descriptor.purposes)
                await tx.put('SecurityTombstone', {
                  tombstoneId: randomUUID(),
                  revision: 1,
                  targetRef:
                    descriptor.model === 'MembershipInvitation'
                      ? ref(descriptor.model, current)
                      : { ...ref(descriptor.model, current), revision: 1 },
                  purpose,
                  reason: 'ORIGINAL_SOURCE_EXPIRED',
                  destroyedAt: this.now().toISOString(),
                  epoch,
                });
              if (descriptor.model === 'EnrollmentAuthority' && current.sourceRef) {
                const source = await this.authorization.lookup(
                  'RecoveryCase',
                  (current.sourceRef as Ref).id,
                  tx,
                );
                requireCondition(
                  source &&
                    (source.enrollmentAuthorityRef as Ref | null)?.id === current.authorityId,
                  503,
                  'U2_SOURCE_EXPIRY_BINDING',
                  '원래 제한 권위와 case를 대조하세요.',
                );
                if (!['COMPLETED', 'CLOSED', 'REJECTED', 'HOLD'].includes(String(source.state))) {
                  const held = {
                    ...source,
                    state: 'HOLD',
                    holdReason: 'ORIGINAL_ENROLLMENT_AUTHORITY_EXPIRED',
                    revision: Number(source.revision) + 1,
                  };
                  await tx.put('RecoveryCase', held, Number(source.revision));
                  refs.push(ref('RecoveryCase', held));
                } /* 원래 UNKNOWN/실행 slot은 만료 자체로 종료됐다고 추정하지 않습니다. */
              }
              const at = this.now().toISOString();
              await tx.put('RequestReceipt', {
                requestId,
                principalId: 'u2-worker-identity',
                audience: 'SYSTEM',
                operation: 'expireOriginalU2Source',
                targetIdentity: { kind: 'RECORD', recordRef: ref(descriptor.model, current) },
                requestFingerprint: fingerprint({
                  sourceRef: ref(descriptor.model, current),
                  expiresAt: current.expiresAt,
                }),
                idempotencyKey: 'source-expiry-' + descriptor.model + '-' + row[descriptor.id],
                owner: descriptor.owner,
                targetScope: null,
                requestState: 'REVIEW_REQUIRED',
                resultRefs: refs,
                acceptedAt: at,
                updatedAt: at,
                revision: 1,
                correlationId: String(row[descriptor.id]),
              });
              await tx.put(
                descriptor.owner === 'IdentityRecovery' ? 'IdentityHistory' : 'AccessHistory',
                {
                  historyId: randomUUID(),
                  owner: descriptor.owner,
                  actorAccountRef: null,
                  verifiedPersonRef: null,
                  occurredAt: at,
                  reason: '원래 source 기한 만료; 실행/외부 UNKNOWN 보존',
                  beforeRef: ref(descriptor.model, current),
                  afterRef: ref(descriptor.model, next),
                  evidenceRefs: [],
                  requestId,
                  resultRefs: refs,
                  correctionOf: null,
                  sourceRevision: next.revision,
                },
              );
            },
          ),
        );
        expired++;
      } catch (error) {
        blocked++;
        if (this.failures.length < 100)
          this.failures.push({
            workRef: ref(descriptor.model, row),
            consumer: 'u2-source-expiry',
            code:
              typeof (error as { code?: unknown }).code === 'string'
                ? String((error as { code: string }).code)
                : 'U2_SOURCE_EXPIRY_UNCONFIRMED',
          });
      }
    }
    if (rows.length < 25) this.sourceCursors[descriptor.model] = null;
    return { scanned: rows.length, expired, blocked };
  }
  async relayBatch(): Promise<number> {
    const rows = await this.store.list('OutboxDelivery', {
      equals: { state: 'PENDING' },
      anyOf: this.consumers.map((consumer) => ({ consumer })),
      cursor: this.cursor,
      limit: 25,
    });
    let published = 0;
    for (const row of rows) {
      try {
        const work = (await this.authorization.lookup('WorkItem', (row.workRef as Ref).id))!;
        if (
          originalWorkExpired(String(work.deadlineAt), this.now()) ||
          work.epoch !== (await this.store.currentEpoch())
        )
          await this.stop(
            work,
            (await this.authorization.lookup('OutboxDelivery', String(row.outboxId)))!,
            'ORIGINAL_WORK_EXPIRED_OR_EPOCH_FENCED',
          );
        else {
          await this.relayOne(String(row.outboxId));
          published++;
        }
      } catch (error) {
        if (this.failures.length < 100)
          this.failures.push({
            workRef: row.workRef as Ref,
            consumer: String(row.consumer),
            code:
              typeof (error as { code?: unknown }).code === 'string'
                ? String((error as { code: string }).code)
                : 'U2_RELAY_UNCONFIRMED',
          });
      }
      this.cursor = String(row.outboxId);
    }
    if (rows.length < 25) this.cursor = null;
    return published;
  }
  async consume(message: QueueMessage): Promise<ReceiptResult> {
    const outer =
        ExecutionBudget.current() ?? new ExecutionBudget(30000, () => this.now().getTime()),
      incoming = validateQueueWork(this.store.schema, message.body, message.consumer),
      work = await this.authorization.lookup('WorkItem', incoming.workId),
      original = await this.store.readRevision('WorkItem', incoming.workId, 1);
    requireCondition(
      work && original && Object.hasOwn(U2_WORK_OPERATIONS, String(work.operationId)),
      403,
      'U2_WORK_BINDING',
      '원래 현재 보호 작업/epoch를 대조하세요.',
    );
    const immutable = (value: Work) => {
      const { attempt: _attempt, ...rest } = value;
      void _attempt;
      return rest;
    };
    requireCondition(
      canonicalJson(immutable(incoming)) === canonicalJson(immutable(u2WorkEnvelope(original))),
      403,
      'WORK_ENVELOPE_MISMATCH',
      '큐 사본은 원래 operation/target/기한을 대체할 수 없습니다.',
    );
    const outboxes = await this.store.list('OutboxDelivery', {
      equals: { consumer: message.consumer, workRef: { id: incoming.workId } },
      limit: 2,
    });
    requireCondition(
      outboxes.length === 1,
      403,
      'U2_DELIVERY_BINDING',
      '단일 원래 발행을 대조하세요.',
    );
    const outbox = (await this.authorization.lookup(
      'OutboxDelivery',
      String(outboxes[0]!.outboxId),
    ))!;
    requireCondition(
      ['PUBLISHED', 'REVIEW_REQUIRED'].includes(String(outbox.state)) &&
        outbox.transportMessageId === message.id &&
        outbox.epoch === work.epoch,
      403,
      'U2_DELIVERY_BINDING',
      '원래 protected 발행/수신 식별자가 필요합니다.',
    );
    if (
      outbox.state === 'REVIEW_REQUIRED' ||
      originalWorkExpired(String(work.deadlineAt), this.now()) ||
      work.epoch !== (await this.store.currentEpoch())
    ) {
      const stopped = await this.stop(work, outbox, 'ORIGINAL_WORK_EXPIRED_OR_EPOCH_FENCED');
      await this.broker.acknowledge(
        message,
        new ExecutionBudget(500, () => this.now().getTime()).signal,
      );
      return stopped;
    }
    const remaining = Math.min(
      outer.remaining(),
      Date.parse(String(work.deadlineAt)) - this.now().getTime(),
    );
    return new ExecutionBudget(remaining, () => this.now().getTime(), outer.signal).run(
      async () => {
        let resultRef: Ref;
        if (message.consumer === 'u2-identity')
          resultRef = await this.identity.consume(incoming.workId);
        else {
          if (work.state === 'PENDING') {
            await assertU2WorkPermit(this.store, work, this.now);
            await this.assertSource(work);
          }
          const handler =
            this.deliveries[message.consumer as 'u2-handoff-delivery' | 'u2-invitation-delivery']!;
          resultRef = await handler.execute(work, ExecutionBudget.current()!);
          requireCondition(
            resultRef.owner === 'U1Host' && resultRef.entity === 'RequestReceipt',
            503,
            'U2_DELIVERY_RESULT',
            '원래 전달 소유자의 보호 Receipt만 ACK합니다.',
          );
        }
        const current = (await this.authorization.lookup('WorkItem', incoming.workId))!,
          result = await this.authorization.lookup(resultRef.entity, resultRef.id);
        requireCondition(
          result &&
            result.revision === resultRef.revision &&
            ['RESULT_RECORDED', 'REVIEW_REQUIRED'].includes(String(current.state)),
          503,
          'U2_RESULT_NOT_PROTECTED',
          '원래 효과/중단의 현재 보호 결과를 대조하세요.',
        );
        const receipts = await this.store.list('RequestReceipt', {
            equals: {
              owner: work.owner,
              resultRefs: [{ entity: resultRef.entity, id: resultRef.id }],
            },
            limit: 100,
          }),
          receipt =
            resultRef.entity === 'RequestReceipt' && result.operation === 'deliverU2PurposeMaterial'
              ? result
              : receipts.find(
                  (row) =>
                    row.operation === 'recordOriginalIdentityMutation' ||
                    row.operation === 'reobserveOriginalIdentityMutation' ||
                    row.operation === 'deliverU2PurposeMaterial',
                );
        requireCondition(receipt, 503, 'U2_RESULT_RECEIPT', '원래 처리/중단 Receipt를 대조하세요.');
        await this.authorization.lookup('RequestReceipt', String(receipt.requestId));
        await this.broker.acknowledge(message, ExecutionBudget.current()!.signalWithin(500));
        return {
          requestId: String(receipt.requestId),
          resultRef,
          ...(current.state === 'REVIEW_REQUIRED'
            ? { disposition: 'CONTROL_REVIEW_REQUIRED' as const }
            : {}),
        };
      },
    );
  }
}
