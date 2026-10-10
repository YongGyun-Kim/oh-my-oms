import { randomUUID } from 'node:crypto';
import { fingerprint, requireCondition } from '@oms/contracts';
import type { CommandMeta, Receipt, Ref, ServiceContext, TargetScope } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { ref } from './references.js';
export interface ChangeResult {
  target: Ref | null;
  refs: Ref[];
  scope: TargetScope | null;
  state: Receipt['requestState'];
  before?: Ref | null;
}
export class Commands {
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
  ) {}
  async run(
    context: ServiceContext,
    owner: string,
    operation: string,
    target: unknown,
    input: { meta: CommandMeta },
    history: string,
    authorize: (transaction?: ProtectedTransaction) => Promise<void>,
    apply: (transaction: ProtectedTransaction, requestId: string) => Promise<ChangeResult>,
  ): Promise<Receipt> {
    this.store.schema.validate('CommandMeta', input.meta);
    await authorize();
    const key = input.meta.clientRequestId;
    const commit = await this.store.execute(
      {
        principalId: context.principalId,
        audience: context.audience,
        owner,
        operation,
        target,
        idempotencyKey: key,
        input,
        correlationId: context.correlationId,
        epoch: await this.store.currentEpoch(),
      },
      async (transaction, requestId) => {
        await authorize(transaction);
        const result = await apply(transaction, requestId);
        const now = this.now().toISOString();
        const historyRecord = {
          historyId: randomUUID(),
          owner,
          actorAccountRef: context.actorAccountRef,
          verifiedPersonRef: context.verifiedPersonRef,
          occurredAt: now,
          reason: input.meta.reason,
          beforeRef: result.before ?? null,
          afterRef: result.target,
          evidenceRefs: input.meta.evidenceRefs,
          requestId,
          resultRefs: result.refs,
          correctionOf: null,
          sourceRevision: result.target?.revision ?? 1,
        };
        await transaction.put(history, historyRecord);
        await transaction.put('RequestReceipt', {
          requestId,
          principalId: context.principalId,
          audience: context.audience,
          operation,
          targetIdentity: target,
          requestFingerprint: fingerprint(input),
          idempotencyKey: key,
          owner,
          targetScope: result.scope,
          requestState: result.state,
          resultRefs: [...result.refs, ref(history, historyRecord)],
          acceptedAt: now,
          updatedAt: now,
          revision: 1,
          correlationId: context.correlationId,
        });
      },
    );
    // Response/replay must still satisfy current access; no stale authority in a stored receipt.
    await authorize();
    const original = await this.store.read('RequestReceipt', commit.requestId);
    requireCondition(original, 503, 'RECEIPT_NOT_PROTECTED', '원래 접수 보호를 확인해야 합니다.');
    return this.receipt(original);
  }
  receipt(record: ModelData): Receipt {
    const refs = record.resultRefs as Ref[];
    return this.store.schema.validate<Receipt>('Receipt', {
      requestId: record.requestId,
      requestState: record.requestState,
      owner: record.owner,
      targetRef: refs.find((value) => !value.entity.endsWith('History')) ?? null,
      resultRefs: refs,
      acceptedAt: record.acceptedAt,
      updatedAt: record.updatedAt,
      statusRevision: record.revision,
      retryAfterMilliseconds: null,
    });
  }
}
