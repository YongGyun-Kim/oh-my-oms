import type {
  Observation,
  ObservationPort,
  Receipt,
  Ref,
  ServiceContext,
  Work,
} from '@oms/contracts';
import { OperationRegistry } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { Commands } from './commands.js';
import { ExternalPolicy } from './external-policy.js';
import type { QueueBroker, QueueMessage } from './queue.js';
export const CONSUMER = 'u1-in-app-notice';
export function envelope(data: ModelData): Work {
  return {
    workId: String(data.workId),
    requestId: String(data.requestId),
    owner: String(data.owner),
    operationId: String(data.operationId),
    targetRef: data.targetRef as Ref | null,
    sourceFactRef: data.sourceFactRef as Ref | null,
    executionPermitRef: data.executionPermitRef as Ref,
    expectedRevision: data.expectedRevision as number | null,
    notBefore: String(data.notBefore),
    deadlineAt: String(data.deadlineAt),
    attempt: Number(data.attempt),
    correlationId: String(data.correlationId),
  };
}
export interface ReceiptResult {
  requestId: string;
  resultRef: Ref;
  disposition?: 'CONTROL_REVIEW_REQUIRED';
}
export interface WorkerInternal {
  readonly store: ProtectedStore;
  readonly broker: QueueBroker | null;
  readonly now: () => Date;
  readonly telemetry: ObservationPort | undefined;
  readonly commands: Commands;
  readonly policy: ExternalPolicy;
  readonly operations: OperationRegistry;
  relayCursor: string | null;
  lastReconciliationAt: number;
  observed(operation: string, correlation: string): Observation | undefined;
  completeObserved(
    observation: Observation | undefined,
    metadata: Parameters<Observation['finish']>[0],
  ): void;
  context(work: ModelData): ServiceContext;
  permit(work: ModelData, transaction?: ProtectedTransaction): Promise<ModelData>;
  relayOne(outboxId: string): Promise<void>;
  relayOriginal(outboxId: string, observe: (correlation: string) => void): Promise<void>;
  relayBatch(): Promise<number>;
  holdExpired(outbox: ModelData, work: ModelData): Promise<ReceiptResult>;
  consume(message: QueueMessage): Promise<ReceiptResult>;
  consumeOriginal(message: QueueMessage): Promise<ReceiptResult>;
  processOriginalWork(incoming: Work, work: ModelData): Promise<Receipt>;
  firstProcessing(work: ModelData): Promise<void>;
}
