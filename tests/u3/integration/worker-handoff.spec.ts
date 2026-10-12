import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import type { Ref, Work } from '@oms/contracts';
import { NoticeWorker } from '@oms/core';
import { ProtectedStore, U3_SOURCE_CONTRACT } from '@oms/persistence';
import { SyntheticQueue } from '../../u1/fixtures/queue.js';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedDecisionOrder } from '../fixtures/order-decision.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';

describe('실제 U3 주문 사실→기존 최소 통지 consumer·보호 원본 경계', () => {
  const sources = u3Sources();
  let store: ProtectedStore;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  async function fixture(count = 1) {
    const f = await seedDecisionOrder(store, count),
      queue = new SyntheticQueue(),
      worker = new NoticeWorker(store, queue, f.seller.now, true);
    const work = await store.list('WorkItem', {
      equals: { requestId: f.receipt.requestId },
      limit: 2,
    });
    expect(work).toHaveLength(1);
    const outboxes = await store.list('OutboxDelivery', {
      equals: { workRef: { id: work[0]!.workId } },
      limit: 2,
    });
    expect(outboxes).toHaveLength(1);
    await worker.relayOne(String(outboxes[0]!.outboxId));
    const message = (await queue.receive('u1-in-app-notice'))[0]!;
    return { ...f, queue, worker, work: work[0]!, message };
  }
  const originalOrder = async (id: string) => {
    const order = (await store.currentProtected('Order', id))!;
    return canonicalJson({
      order,
      lines: await Promise.all(
        (order.lineRefs as Ref[]).map((reference) =>
          store.currentProtected('OrderLine', reference.id),
        ),
      ),
      snapshot: await store.currentProtected(
        'PurchaseTermsSnapshot',
        (order.purchaseTermsRef as Ref).id,
      ),
    });
  };
  it('원래 row2/profile2 생산자를 닫힌 decoder로 대조하고 중복 전달에도 최소 통지 하나만 보호한다', async () => {
    const f = await fixture(100),
      before = await originalOrder(f.receipt.targetRef!.id),
      payload = await assertProtectedCandidate(
        sources.primaryAdmin,
        sources.journalAdmin,
        f.receipt.requestId,
        store.schema,
      );
    expect(payload.schemaVersion).toBe(2);
    expect(payload.sourceContract).toEqual(U3_SOURCE_CONTRACT);
    expect(payload.rows.find((row) => row.model === 'Order')!.schemaVersion).toBe(2);
    expect(payload.rows.find((row) => row.model === 'WorkItem')!.data.sourceContract).toEqual(
      U3_SOURCE_CONTRACT,
    );
    const result = await f.worker.consume(f.message);
    expect(await f.worker.consume(f.message)).toEqual(result);
    const notices = await store.list('NotificationIntent', {
      equals: { sourceFactRef: f.work.sourceFactRef },
      limit: 2,
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      recipientAccountRefs: [f.seller.customer.actorAccountRef],
      minimalText: '주문 진행을 확인해 주세요.',
      loginPath: '/orders',
      requiredActionRefs: [],
    });
    expect(
      await store.list('ConsumerProcessingMark', {
        equals: { deliveryId: f.work.workId },
        limit: 2,
      }),
    ).toHaveLength(1);
    expect(f.queue.acknowledgements).toEqual([f.message.id, f.message.id]);
    expect(await originalOrder(f.receipt.targetRef!.id)).toBe(before);
    const effect = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      result.requestId,
      store.schema,
    );
    expect(effect.schemaVersion).toBe(1); // 기존 notification:2 소비자와 U3 생산자 계약은 구분한다.
    expect(effect.rows.find((row) => row.model === 'WorkItem')!.data.sourceContract).toEqual(
      U3_SOURCE_CONTRACT,
    );
    expect(
      effect.rows.some((row) =>
        [
          'Order',
          'OrderLine',
          'PurchaseTermsSnapshot',
          'AcceptanceDecision',
          'OrderChangeApplication',
        ].includes(row.model),
      ),
    ).toBe(false);
  });
  it('나중 판단 사실이 먼저 도착해도 원래 주문 개정 통지를 처리하며 업무 최신 상태는 되돌리지 않는다', async () => {
    const f = await fixture(),
      decided = await f
        .service()
        .decide(await f.requestContext(f.registrant), f.decision(), f.ingress),
      laterWork = (
        await store.list('WorkItem', { equals: { requestId: decided.requestId }, limit: 2 })
      )[0]!,
      laterOutbox = (
        await store.list('OutboxDelivery', {
          equals: { workRef: { id: laterWork.workId } },
          limit: 2,
        })
      )[0]!;
    await f.worker.relayOne(String(laterOutbox.outboxId));
    const laterMessage = (await f.queue.receive('u1-in-app-notice'))[0]!,
      before = await originalOrder(f.receipt.targetRef!.id);
    expect((laterMessage.body as Work).expectedRevision).toBe(2);
    await f.worker.consume(laterMessage);
    await f.worker.consume(f.message);
    expect(
      await store.list('NotificationIntent', {
        equals: { sourceFactRef: f.work.sourceFactRef },
        limit: 2,
      }),
    ).toHaveLength(1);
    expect(
      await store.list('NotificationIntent', {
        equals: { sourceFactRef: laterWork.sourceFactRef },
        limit: 2,
      }),
    ).toHaveLength(1);
    expect(await originalOrder(f.receipt.targetRef!.id)).toBe(before);
    expect((await store.currentProtected('Order', f.receipt.targetRef!.id))!).toMatchObject({
      revision: 2,
      state: 'ACCEPTED',
    });
    expect(await store.list('OrderChangeApplication')).toHaveLength(0);
  });
  it('소비자·작업·원본 참조·클라이언트 version 위조는 ACK·효과·업무 판단 전에 거절한다', async () => {
    const f = await fixture(),
      before = await originalOrder(f.receipt.targetRef!.id),
      body = f.message.body as Work;
    for (const message of [
      { ...f.message, consumer: 'unregistered' },
      {
        ...f.message,
        body: { ...body, owner: 'OrderAcceptance', operationId: 'OrderAcceptance.decideOrder' },
      },
      {
        ...f.message,
        body: {
          ...body,
          sourceFactRef: { ...body.sourceFactRef!, revision: body.sourceFactRef!.revision + 1 },
        },
      },
      { ...f.message, body: { ...body, registryVersion: 3, sourceContract: U3_SOURCE_CONTRACT } },
    ])
      await expect(f.worker.consume(message)).rejects.toThrow();
    expect(f.queue.acknowledgements).toHaveLength(0);
    expect(
      await store.list('NotificationIntent', {
        equals: { sourceFactRef: f.work.sourceFactRef },
        limit: 2,
      }),
    ).toHaveLength(0);
    expect(await originalOrder(f.receipt.targetRef!.id)).toBe(before);
  });
  it('보호된 Work의 source metadata만 구형으로 바꿔도 실제 원래 Fact/Receipt와 불일치하여 차단한다', async () => {
    const f = await fixture(),
      current = (await store.currentProtected('WorkItem', String(f.work.workId)))!;
    await store.execute(
      {
        principalId: 'synthetic-u3-source-negative',
        audience: 'SYSTEM',
        owner: 'U1Host',
        operation: 'fixture-work-source-downgrade',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put(
          'WorkItem',
          { ...current, sourceContract: null, revision: Number(current.revision) + 1 },
          Number(current.revision),
        );
      },
    );
    await expect(f.worker.consume(f.message)).rejects.toMatchObject({
      code: 'U3_NOTICE_SOURCE_BINDING',
    });
    expect(f.queue.acknowledgements).toHaveLength(0);
    expect(
      await store.list('NotificationIntent', {
        equals: { sourceFactRef: f.work.sourceFactRef },
        limit: 2,
      }),
    ).toHaveLength(0);
  });
  it('원래 후보 digest 변조와 primary-only Fact 오염을 보호 prefix만으로 통과시키지 않는다', async () => {
    const f = await fixture();
    await sources.primaryAdmin.query(
      'UPDATE u1_recovery_candidate SET digest=$1 WHERE request_id=$2',
      ['0'.repeat(64), f.receipt.requestId],
    );
    await expect(f.worker.consume(f.message)).rejects.toMatchObject({
      code: 'U3_NOTICE_SOURCE_BINDING',
    });
    expect(f.queue.acknowledgements).toHaveLength(0);
    expect(
      await store.list('NotificationIntent', {
        equals: { sourceFactRef: f.work.sourceFactRef },
        limit: 2,
      }),
    ).toHaveLength(0);
    const actual = (
      await sources.journalAdmin.query(
        "SELECT digest FROM u1_protected_entry WHERE payload_text::jsonb->>'requestId'=$1",
        [f.receipt.requestId],
      )
    )[0]!;
    await sources.primaryAdmin.query(
      'UPDATE u1_recovery_candidate SET digest=$1 WHERE request_id=$2',
      [actual.digest, f.receipt.requestId],
    );
    await sources.primaryAdmin.query(
      'UPDATE u1_fact_envelope SET "correlationId"=$1 WHERE "eventId"=$2',
      [randomUUID(), (f.work.sourceFactRef as Ref).id],
    );
    await expect(f.worker.consume(f.message)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(f.queue.acknowledgements).toHaveLength(0);
  });
  it('실제 현재 permit 회수는 원래 업무 사실이 유효해도 신규 통지 효과를 막는다', async () => {
    const f = await fixture(),
      permit = (await store.currentProtected(
        'ExecutionPermit',
        (f.work.executionPermitRef as Ref).id,
      ))!;
    await store.execute(
      {
        principalId: 'synthetic-u3-permit-negative',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'fixture-revoke-notice-permit',
        target: null,
        input: { synthetic: true },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put(
          'ExecutionPermit',
          { ...permit, allowed: false, revision: Number(permit.revision) + 1 },
          Number(permit.revision),
        );
      },
    );
    await expect(f.worker.consume(f.message)).rejects.toMatchObject({ code: 'WORK_PERMIT' });
    expect(f.queue.acknowledgements).toHaveLength(0);
    expect(
      await store.list('NotificationIntent', {
        equals: { sourceFactRef: f.work.sourceFactRef },
        limit: 2,
      }),
    ).toHaveLength(0);
  });
});
