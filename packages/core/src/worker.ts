import type { Observation, ObservationPort, Receipt, ServiceContext, Work } from '@oms/contracts';
import { declareFoundationOperations, OperationRegistry, requireCondition } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { Commands } from './commands.js';
import { ExternalPolicy } from './external-policy.js';
import type { QueueBroker, QueueMessage } from './queue.js';
import * as workerauthority from './worker-authority.js';
import * as workerconsumer from './worker-consumer.js';
import * as workereffect from './worker-effect.js';
import * as workerprocessing from './worker-processing.js';
import * as workerrelay from './worker-relay.js';
import { ReceiptResult, WorkerInternal } from './worker-state.js';
import * as workertraversal from './worker-traversal.js';

export class NoticeWorker {
  private readonly internal: WorkerInternal;
  private readonly commands: Commands;
  private readonly policy: ExternalPolicy;
  private readonly operations;
  private relayCursor: string | null = null;
  private lastReconciliationAt = 0;
  constructor(
    readonly store: ProtectedStore,
    private readonly broker: QueueBroker | null,
    private readonly now: () => Date,
    synthetic: boolean,
    private readonly telemetry?: ObservationPort,
  ) {
    requireCondition(
      broker?.kind !== 'SYNTHETIC' || synthetic,
      503,
      'SYNTHETIC_BROKER_FORBIDDEN',
      '운영에 합성 큐를 등록할 수 없습니다.',
    );
    this.commands = new Commands(store, now);
    this.policy = new ExternalPolicy(store, now);
    this.operations = new OperationRegistry(store.schema);
    declareFoundationOperations(this.operations);
    this.operations.bind('NotificationDelivery', 'materialiseInApp', 2, async (invocation) => {
      requireCondition(
        invocation.context.audience === 'SYSTEM' &&
          'principalId' in invocation.context &&
          invocation.context.principalId === 'u1-worker-notice',
        403,
        'WORK_PRINCIPAL',
        '등록된 SYSTEM 소비자만 실행할 수 있습니다.',
      );
      const incoming = invocation.data as Work;
      const work = await store.read('WorkItem', incoming.workId);
      requireCondition(work, 503, 'WORK_NOT_PROTECTED', '원래 작업 보호를 확인해야 합니다.');
      return this.processOriginalWork(incoming, work);
    });
    const owner = () => this;
    this.internal = {
      store,
      broker,
      now,
      telemetry,
      commands: this.commands,
      policy: this.policy,
      operations: this.operations,
      get relayCursor() {
        return owner().relayCursor;
      },
      set relayCursor(value) {
        owner().relayCursor = value;
      },
      get lastReconciliationAt() {
        return owner().lastReconciliationAt;
      },
      set lastReconciliationAt(value) {
        owner().lastReconciliationAt = value;
      },
      observed: this.observed.bind(this),
      completeObserved: this.completeObserved.bind(this),
      context: this.context.bind(this),
      permit: this.permit.bind(this),
      relayOne: this.relayOne.bind(this),
      relayOriginal: this.relayOriginal.bind(this),
      relayBatch: this.relayBatch.bind(this),
      holdExpired: this.holdExpired.bind(this),
      consume: this.consume.bind(this),
      consumeOriginal: this.consumeOriginal.bind(this),
      processOriginalWork: this.processOriginalWork.bind(this),
      firstProcessing: this.firstProcessing.bind(this),
    };
  }
  private observed(operation: string, correlation: string): Observation | undefined {
    return workerauthority.observed(this.internal, operation, correlation);
  }
  private completeObserved(
    observation: Observation | undefined,
    metadata: Parameters<Observation['finish']>[0],
  ): void {
    return workerauthority.completeObserved(this.internal, observation, metadata);
  }
  private context(work: ModelData): ServiceContext {
    return workerauthority.context(this.internal, work);
  }
  private permit(work: ModelData, transaction?: ProtectedTransaction): Promise<ModelData> {
    return workerauthority.permit(this.internal, work, transaction);
  }
  relayOne(outboxId: string): Promise<void> {
    return workerrelay.relayOne(this.internal, outboxId);
  }
  private relayOriginal(outboxId: string, observe: (correlation: string) => void): Promise<void> {
    return workerrelay.relayOriginal(this.internal, outboxId, observe);
  }
  relayBatch(): Promise<number> {
    return workertraversal.relayBatch(this.internal);
  }
  private holdExpired(outbox: ModelData, work: ModelData): Promise<ReceiptResult> {
    return workertraversal.holdExpired(this.internal, outbox, work);
  }
  consume(message: QueueMessage): Promise<ReceiptResult> {
    return workerconsumer.consume(this.internal, message);
  }
  private consumeOriginal(message: QueueMessage): Promise<ReceiptResult> {
    return workerconsumer.consumeOriginal(this.internal, message);
  }
  private processOriginalWork(incoming: Work, work: ModelData): Promise<Receipt> {
    return workereffect.processOriginalWork(this.internal, incoming, work);
  }
  private firstProcessing(work: ModelData): Promise<void> {
    return workerprocessing.firstProcessing(this.internal, work);
  }
}
