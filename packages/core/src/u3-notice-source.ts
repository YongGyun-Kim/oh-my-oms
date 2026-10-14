import {
  canonicalJson,
  declareU3Operations,
  OperationRegistry,
  requireCondition,
} from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import { decodePayload, recordedSourceContract, U3_SOURCE_CONTRACT } from '@oms/persistence';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';

const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const bound: (value: unknown) => asserts value = (value) =>
  requireCondition(
    value,
    403,
    'U3_NOTICE_SOURCE_BINDING',
    '실제 보호된 U3 주문 접수·사실·작업의 정확한 결합이 필요합니다.',
  );
const registries = new WeakMap<ProtectedStore, OperationRegistry>();
const immutableWorkFields = [
  'workId',
  'requestId',
  'owner',
  'operationId',
  'targetRef',
  'sourceFactRef',
  'executionPermitRef',
  'expectedRevision',
  'notBefore',
  'deadlineAt',
  'correlationId',
  'epoch',
  'sourceContract',
] as const;

// 소비 작업은 기존 최소 통지 계약이다. 생산자의 registry3/profile2는 큐의 주장이 아닌 보호 원본에서 선택한다.
export async function assertU3NoticeSource(
  store: ProtectedStore,
  work: ModelData,
  fact: ModelData,
  transaction?: ProtectedTransaction,
): Promise<void> {
  const target = work.targetRef as Ref;
  const original =
    target?.owner === 'OrderAcceptance' && target.entity === 'Order'
      ? await store.readRevision('Order', target.id, target.revision)
      : null;
  const workSource = recordedSourceContract(work, store.schema),
    factSource = recordedSourceContract(fact, store.schema);
  if (
    workSource.knowledge !== 'KNOWN' &&
    factSource.knowledge !== 'KNOWN' &&
    original?.modelVersion !== 2
  )
    return;
  bound(
    workSource.knowledge === 'KNOWN' &&
      factSource.knowledge === 'KNOWN' &&
      exact(work.sourceContract, U3_SOURCE_CONTRACT) &&
      exact(fact.sourceContract, U3_SOURCE_CONTRACT) &&
      original?.modelVersion === 2,
  );
  const currentWork = await store.currentProtected('WorkItem', String(work.workId)),
    currentFact = await store.currentProtected('FactEnvelope', String(fact.eventId));
  bound(
    currentWork &&
      currentFact &&
      immutableWorkFields.every((field) => exact(currentWork[field], work[field])) &&
      exact(currentFact, fact),
  );
  if (transaction) {
    const rawWork = await transaction.get('WorkItem', String(work.workId)),
      rawFact = await transaction.get('FactEnvelope', String(fact.eventId));
    bound(exact(rawWork, currentWork) && exact(rawFact, currentFact));
  }
  const receipt = await store.currentProtected('RequestReceipt', String(work.requestId));
  bound(
    receipt &&
      recordedSourceContract(receipt, store.schema).knowledge === 'KNOWN' &&
      exact(receipt.sourceContract, U3_SOURCE_CONTRACT),
  );
  bound(
    receipt!.owner === 'OrderAcceptance' &&
      ['submitOrder', 'decideOrder', 'applyApprovedChange'].includes(String(receipt!.operation)),
  );
  let registry = registries.get(store);
  if (!registry) {
    registry = new OperationRegistry(store.schema);
    declareU3Operations(registry);
    registries.set(store, registry);
  }
  const declaration = registry.lookup('OrderAcceptance', String(receipt!.operation), 3);
  bound(
    declaration.kind === 'command' &&
      declaration.audience.includes(receipt!.audience as 'CUSTOMER' | 'STAFF') &&
      (receipt!.resultRefs as Ref[]).some((reference) => exact(reference, target)) &&
      fact.sourceOwner === receipt!.owner &&
      fact.causationRequestId === receipt!.requestId &&
      exact(fact.sourceFactRef, target) &&
      exact(fact.targetScope, receipt!.targetScope),
  );
  const rows = await store.primary.query(
    'SELECT c.payload_text,c.digest,c.commit_order,c.epoch,c.request_id,p.commit_order AS protected_order FROM u1_recovery_candidate c JOIN u1_protected_prefix p USING(epoch) WHERE c.request_id=$1 LIMIT 2',
    [receipt!.requestId],
  );
  bound(rows.length === 1);
  const candidate = rows[0],
    payload = decodePayload(candidate.payload_text, store.schema);
  const protectedRows = await store.journal.query(
    'SELECT payload_text,digest,previous_digest FROM u1_protected_entry WHERE epoch=$1 AND commit_order=$2',
    [candidate.epoch, candidate.commit_order],
  );
  bound(
    payload.schemaVersion === 2 &&
      exact(payload.sourceContract, U3_SOURCE_CONTRACT) &&
      payload.epoch === work.epoch &&
      payload.epoch === candidate.epoch &&
      payload.commitOrder === Number(candidate.commit_order) &&
      payload.commitOrder <= Number(candidate.protected_order) &&
      payload.requestId === receipt!.requestId &&
      payload.requestId === candidate.request_id &&
      payload.contentDigest === candidate.digest &&
      protectedRows.length === 1 &&
      protectedRows[0].payload_text === candidate.payload_text &&
      protectedRows[0].digest === payload.contentDigest &&
      protectedRows[0].previous_digest === payload.previousDigest,
  );
  const row = (model: string, id: string) =>
    payload.rows.find((entry) => entry.model === model && entry.id === id && !entry.deleted);
  const sourceWork = row('WorkItem', String(work.workId)),
    sourceFact = row('FactEnvelope', String(fact.eventId)),
    sourceReceipt = row('RequestReceipt', String(receipt!.requestId)),
    sourceOrder = row('Order', target.id),
    key = payload.rows.find((entry) => entry.model === 'RequestKey');
  bound(
    sourceWork?.schemaVersion === 1 &&
      sourceFact?.schemaVersion === 1 &&
      sourceReceipt?.schemaVersion === 1 &&
      sourceOrder?.schemaVersion === 2 &&
      sourceOrder.revision === target.revision &&
      exact(sourceOrder.data, original) &&
      exact(sourceFact.data, fact) &&
      exact(sourceReceipt.data, receipt) &&
      immutableWorkFields.every((field) => exact(sourceWork.data[field], work[field])) &&
      key &&
      key.data.owner === receipt!.owner &&
      key.data.operation === receipt!.operation &&
      key.data.principalId === receipt!.principalId &&
      key.data.audience === receipt!.audience &&
      exact(key.data.target, receipt!.targetIdentity),
  );
}
