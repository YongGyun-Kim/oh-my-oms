import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import {
  NoticeWorker,
  ref,
  U2Worker,
  PrivateU2Delivery,
  IdentityConsumer,
  EnrollmentAuthorities,
} from '@oms/core';
import type { Ref } from '@oms/contracts';
import { SyntheticQueue } from '../fixtures/queue.js';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2Enterprise, u2Meta } from '../fixtures/enterprise.js';
import { seedVerifiedRecoveryParty, seedClaimedRecovery } from '../fixtures/identity.js';
import { StatefulRecoveryProvider } from '../fixtures/provider.js';
describe('만료 PUBLISHED Work의 protected control과 원래 효과 비실행', () => {
  const sources = u2Sources(),
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  beforeAll(async () => {
    await initializeU2Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => resetU2Databases(sources.primaryAdmin, sources.journalAdmin));
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  async function fixture(activeStore = store) {
    await seedU2Enterprise(activeStore);
    let time = Date.now() + 1000;
    const now = () => new Date(time),
      queue = new SyntheticQueue(() => time),
      outbox = (
        await store.list('OutboxDelivery', {
          equals: { consumer: 'u1-in-app-notice', state: 'PENDING' },
          limit: 1,
        })
      )[0]!,
      work = (await store.currentProtected('WorkItem', (outbox.workRef as { id: string }).id))!,
      outcomes: string[] = [],
      worker = new NoticeWorker(activeStore, queue, now, true, {
        begin: () => ({
          finish: (result) => {
            outcomes.push(result.outcome);
          },
        }),
      });
    await worker.relayOne(String(outbox.outboxId));
    const published = (await store.currentProtected('OutboxDelivery', String(outbox.outboxId)))!,
      permit = (await store.currentProtected(
        'ExecutionPermit',
        (work.executionPermitRef as { id: string }).id,
      ))!;
    time = Date.parse(String(work.deadlineAt));
    const message = (await queue.receive('u1-in-app-notice'))[0]!;
    return {
      queue,
      worker,
      outbox: published,
      work,
      permit,
      message,
      outcomes,
      advance: (ms: number) => {
        time += ms;
      },
      execute: (operation: string, callback: Parameters<ProtectedStore['execute']>[1]) =>
        store.execute(
          {
            principalId: 'synthetic-control-fixture',
            audience: 'SYSTEM',
            owner: 'NotificationDelivery',
            operation,
            target: null,
            idempotencyKey: randomUUID(),
            input: { workId: work.workId },
            correlationId: randomUUID(),
            epoch: 'initial',
          },
          callback,
        ),
    };
  }
  it('정각 만료 PUBLISHED/PENDING은 원래 ID/기한/permit를 유지한 REVIEW_REQUIRED로 보호하고 business 효과 없이 stop ACK한다', async () => {
    const f = await fixture(),
      before = await store.list('NotificationIntent'),
      result = await f.worker.consume(f.message),
      work = (await store.currentProtected('WorkItem', String(f.work.workId)))!,
      outbox = (await store.currentProtected('OutboxDelivery', String(f.outbox.outboxId)))!;
    expect(result.disposition).toBe('CONTROL_REVIEW_REQUIRED');
    expect(work).toMatchObject({
      state: 'REVIEW_REQUIRED',
      workId: f.work.workId,
      deadlineAt: f.work.deadlineAt,
      operationId: f.work.operationId,
      targetRef: f.work.targetRef,
    });
    expect(outbox).toMatchObject({
      state: 'REVIEW_REQUIRED',
      transportMessageId: f.outbox.transportMessageId,
      deadlineAt: f.outbox.deadlineAt,
    });
    expect(
      await store.currentProtected(
        'ExecutionPermit',
        (f.work.executionPermitRef as { id: string }).id,
      ),
    ).toEqual(f.permit);
    expect(await store.list('NotificationIntent')).toEqual(before);
    expect(f.queue.acknowledgements).toEqual([f.message.id]);
    expect(f.outcomes.at(-1)).toBe('BUSINESS_REFUSAL');
  });
  it('직후 만료도 같은 원래 control이며 새 기한/첫 business 처리 이력을 만들지 않는다', async () => {
    const f = await fixture();
    f.advance(1);
    await f.worker.consume(f.message);
    expect((await store.currentProtected('WorkItem', String(f.work.workId)))?.deadlineAt).toBe(
      f.work.deadlineAt,
    );
    expect(await store.list('ConsumerProcessingMark')).toHaveLength(0);
    expect(await store.list('NotificationIntent')).toHaveLength(0);
  });
  it('다른 published 메시지 ID나 retargeted queue 사본은 control/ACK를 만들지 않는다', async () => {
    const f = await fixture();
    await expect(f.worker.consume({ ...f.message, id: 'other-delivery' })).rejects.toMatchObject({
      code: 'EXPIRED_DELIVERY_BINDING',
    });
    await expect(
      f.worker.consume({
        ...f.message,
        body: { ...(f.message.body as object), correlationId: 'other' },
      }),
    ).rejects.toMatchObject({ code: 'WORK_ENVELOPE_MISMATCH' });
    expect((await store.currentProtected('WorkItem', String(f.work.workId)))?.state).toBe(
      'PENDING',
    );
    expect(f.queue.acknowledgements).toHaveLength(0);
  });
  it('primary-only outbox 변경은 이전 PUBLISHED 보호 원본으로 stop ACK하지 않는다', async () => {
    const f = await fixture();
    await sources.primaryAdmin
      .getRepository('OutboxDelivery')
      .update(
        { outboxId: f.outbox.outboxId },
        { state: 'UNKNOWN', revision: Number(f.outbox.revision) + 1 },
      );
    await expect(f.worker.consume(f.message)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(f.queue.acknowledgements).toHaveLength(0);
    expect((await store.read('WorkItem', String(f.work.workId)))?.state).toBe('PENDING');
  });
  it('원래 permit/사실의 대상·소비자 관계가 다르면 만료 execution을 완화하지 않고 거절한다', async () => {
    const f = await fixture(),
      id = randomUUID(),
      changed = {
        ...f.work,
        executionPermitRef: { ...(f.work.executionPermitRef as object), id },
        revision: 2,
      };
    await f.execute('fixture-mismatched-control', async (tx) => tx.put('WorkItem', changed, 1));
    await expect(
      f.worker.consume({
        ...f.message,
        body: { ...(f.message.body as object), executionPermitRef: changed.executionPermitRef },
      }),
    ).rejects.toMatchObject({ code: 'EXPIRED_CONTROL_BINDING' });
    expect(f.queue.acknowledgements).toHaveLength(0);
  });
  it('보호된 같은 control 재관측은 한 receipt/이력이며 ACK 이후에도 새 effect가 아니다', async () => {
    const f = await fixture(),
      first = await f.worker.consume(f.message),
      second = await f.worker.consume(f.message);
    expect(second.requestId).toBe(first.requestId);
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'reviewExpiredOriginalOutbox' } }),
    ).toHaveLength(1);
    expect(await store.list('NotificationIntent')).toHaveLength(0);
  });
  it('보호 stop 이후 primary-only work를 다시 PENDING으로 되돌린 사본은 ACK를 차단한다', async () => {
    const f = await fixture();
    await f.worker.consume(f.message);
    const work = (await store.read('WorkItem', String(f.work.workId)))!;
    await sources.primaryAdmin
      .getRepository('WorkItem')
      .update({ workId: f.work.workId }, { state: 'PENDING', revision: Number(work.revision) + 1 });
    const count = f.queue.acknowledgements.length;
    await expect(f.worker.consume(f.message)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(f.queue.acknowledgements).toHaveLength(count);
  });
  it('이미 PROCESSING 개정이 된 원래 발행 snapshot도 target/기한을 보존한 control로 닫는다', async () => {
    const f = await fixture();
    await f.execute('fixture-original-processing', async (tx) =>
      tx.put('WorkItem', { ...f.work, state: 'PROCESSING', revision: 2 }, 1),
    );
    const result = await f.worker.consume(f.message);
    expect(result.disposition).toBe('CONTROL_REVIEW_REQUIRED');
    expect((await store.currentProtected('WorkItem', String(f.work.workId)))?.state).toBe(
      'REVIEW_REQUIRED',
    );
    expect(await store.list('NotificationIntent')).toHaveLength(0);
  });
  it('control primary commit crash는 보호 ACK 전 차단하고 연속 prefix 복구 후 원래 단일 receipt를 재관측한다', async () => {
    let enabled = false,
      failed = false;
    const crashed = new ProtectedStore(
        sources.primaryApp,
        sources.journalAppend,
        async (boundary) => {
          if (enabled && !failed && boundary === 'PRIMARY_COMMITTED') {
            failed = true;
            throw Error('synthetic-expired-control-primary-crash');
          }
        },
      ),
      f = await fixture(crashed);
    enabled = true;
    await expect(f.worker.consume(f.message)).rejects.toThrow(
      'synthetic-expired-control-primary-crash',
    );
    expect(f.queue.acknowledgements).toHaveLength(0);
    expect((await store.read('WorkItem', String(f.work.workId)))?.state).toBe('PENDING');
    expect(
      (await sources.primaryAdmin.getRepository('WorkItem').findOneBy({ workId: f.work.workId }))
        ?.state,
    ).toBe('REVIEW_REQUIRED');
    await store.protectPending(await store.currentEpoch());
    const result = await f.worker.consume(f.message);
    expect(result.disposition).toBe('CONTROL_REVIEW_REQUIRED');
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'reviewExpiredOriginalOutbox' } }),
    ).toHaveLength(1);
    expect(await store.list('NotificationIntent')).toHaveLength(0);
    expect(f.queue.acknowledgements).toEqual([f.message.id]);
  });
  async function privateDelivery(
    profile: 'LOCAL_SYNTHETIC' | 'UNREGISTERED' = 'LOCAL_SYNTHETIC',
    unknown = false,
  ) {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    await f.handoffs.verifyParty(f.staff, f.verifyInput);
    const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      issued = await f.handoffs.issue(f.staff, {
        meta: u2Meta(2),
        caseRef: ref('RecoveryCase', source),
        verificationRef: source.verificationRef as Ref,
        partyContextRef: source.partyContextRef as Ref,
        deliveryRouteRef: ref('RegisteredContact', f.contact),
      }),
      workRef = issued.resultRefs.find((row) => row.entity === 'WorkItem')!,
      work = (await store.currentProtected('WorkItem', workRef.id))!,
      outbox = (
        await store.list('OutboxDelivery', { equals: { workRef: { id: work.workId } } })
      )[0]!,
      authorities = new EnrollmentAuthorities(store, f.verifier, f.now, async () => false),
      provider = new StatefulRecoveryProvider(f.now),
      identity = new IdentityConsumer(store, provider, authorities, f.now, true),
      queue = new SyntheticQueue(),
      received: { routeRef: Ref; validBytes: boolean }[] = [],
      receiver = {
        profile,
        send: async (envelope: { deliveryId: string; routeRef: Ref }, bytes: Buffer) => {
          received.push({
            routeRef: envelope.routeRef,
            validBytes: /^[A-Za-z0-9_-]{16}$/.test(bytes.toString()),
          });
          return {
            deliveryId: envelope.deliveryId,
            routeRef: envelope.routeRef,
            knowledge: unknown ? ('UNKNOWN' as const) : ('KNOWN' as const),
          };
        },
      },
      delivery = new PrivateU2Delivery(store, f.vault, receiver, f.now, true, f.handoffs),
      worker = new U2Worker(store, queue, identity, f.now, true, {
        'u2-handoff-delivery': delivery,
      });
    return { ...f, source, issued, work, outbox, queue, received, delivery, worker };
  }
  it('원래 확인 당사자/route의 local private 전달만 보호 Receipt/이력 뒤 ACK하며 큐에 raw code를 넣지 않는다', async () => {
    const f = await privateDelivery();
    await f.worker.relayOne(String(f.outbox.outboxId));
    const message = (await f.queue.receive('u2-handoff-delivery'))[0]!;
    expect(Object.keys(message.body as object).sort()).not.toContain('code');
    const result = await f.worker.consume(message);
    expect(result.resultRef.entity).toBe('RequestReceipt');
    expect(f.received).toEqual([
      { routeRef: ref('RegisteredContact', f.contact), validBytes: true },
    ]);
    expect(f.queue.acknowledgements).toEqual([message.id]);
    expect((await store.currentProtected('WorkItem', String(f.work.workId)))?.state).toBe(
      'RESULT_RECORDED',
    );
    expect(
      (await store.currentProtected('RecoveryHandoffGrant', f.issued.targetRef!.id))?.state,
    ).toBe('ISSUED');
    await f.worker.consume(message);
    expect(f.received).toHaveLength(1);
  });
  it('private receiver 미등록은 발행/원문 read/send 전에 HOLD이며 actual 수신 증거를 만들지 않는다', async () => {
    const f = await privateDelivery('UNREGISTERED');
    await expect(f.worker.relayOne(String(f.outbox.outboxId))).rejects.toMatchObject({
      code: 'U2_PRIVATE_RECEIVER_HOLD',
    });
    expect(f.received).toHaveLength(0);
    expect(f.queue.messages).toHaveLength(0);
    expect((await store.currentProtected('WorkItem', String(f.work.workId)))?.attempt).toBe(0);
  });
  it('발행 후 확인자 현재 권위 회수는 private 원문 전달/ACK를 차단한다', async () => {
    const f = await privateDelivery();
    await f.worker.relayOne(String(f.outbox.outboxId));
    const message = (await f.queue.receive('u2-handoff-delivery'))[0]!,
      grant = (
        await store.list('StaffRoleGrant', { equals: { accountRef: { id: f.staff.principalId } } })
      )[0]!;
    const role = (await store.currentProtected('StaffRole', (grant.roleRef as Ref).id))!;
    await f.access.reviseStaffRole(f.staff, {
      meta: u2Meta(Number(role.revision)),
      roleRef: ref('StaffRole', role),
      label: String(role.label),
      actions: (role.actions as string[]).filter((action) => action !== 'identity.recovery.verify'),
    });
    await expect(f.worker.consume(message)).rejects.toThrow();
    expect(f.received).toHaveLength(0);
    expect(f.queue.acknowledgements).toHaveLength(0);
  });
  it('private send UNKNOWN은 보호 중단과 구별되며 같은 메시지를 재전송하지 않는다', async () => {
    const f = await privateDelivery('LOCAL_SYNTHETIC', true);
    await f.worker.relayOne(String(f.outbox.outboxId));
    const message = (await f.queue.receive('u2-handoff-delivery'))[0]!,
      result = await f.worker.consume(message);
    expect(result.disposition).toBe('CONTROL_REVIEW_REQUIRED');
    expect((await store.currentProtected('WorkItem', String(f.work.workId)))?.state).toBe(
      'REVIEW_REQUIRED',
    );
    await f.worker.consume(message);
    expect(f.received).toHaveLength(1);
  });
  async function expiringPrivateDelivery(activeStore = store) {
    let time = Date.now();
    const now = () => new Date(time),
      f = await seedVerifiedRecoveryParty(activeStore, sources.vault, 'LOCAL_SYNTHETIC', now);
    time = Date.now() + 1000;
    await f.handoffs.verifyParty(f.staff, f.verifyInput);
    const source = (await activeStore.currentProtected('RecoveryCase', f.source.caseId))!;
    const issued = await f.handoffs.issue(f.staff, {
      meta: u2Meta(2),
      caseRef: ref('RecoveryCase', source),
      verificationRef: source.verificationRef as Ref,
      partyContextRef: source.partyContextRef as Ref,
      deliveryRouteRef: ref('RegisteredContact', f.contact),
    });
    const work = (await activeStore.currentProtected(
        'WorkItem',
        issued.resultRefs.find((row) => row.entity === 'WorkItem')!.id,
      ))!,
      outbox = (
        await activeStore.list('OutboxDelivery', { equals: { workRef: { id: work.workId } } })
      )[0]!,
      queue = new SyntheticQueue(() => time),
      received: string[] = [];
    const authorities = new EnrollmentAuthorities(activeStore, f.verifier, now, async () => false),
      identity = new IdentityConsumer(
        activeStore,
        new StatefulRecoveryProvider(now),
        authorities,
        now,
        true,
      );
    const delivery = new PrivateU2Delivery(
        activeStore,
        f.vault,
        {
          profile: 'LOCAL_SYNTHETIC',
          send: async (envelope) => {
            received.push(envelope.deliveryId);
            return {
              deliveryId: envelope.deliveryId,
              routeRef: envelope.routeRef,
              knowledge: 'KNOWN',
            };
          },
        },
        now,
        true,
        f.handoffs,
      ),
      worker = new U2Worker(activeStore, queue, identity, now, true, {
        'u2-handoff-delivery': delivery,
      });
    await worker.relayOne(String(outbox.outboxId));
    const message = (await queue.receive('u2-handoff-delivery'))[0]!;
    return {
      ...f,
      issued,
      work,
      outbox,
      worker,
      queue,
      received,
      message,
      at: (offset: number) => {
        time = Date.parse(String(work.deadlineAt)) + offset;
      },
    };
  }
  it.each([0, 1])(
    'U2 원래 handoff 정각/직후 만료(%ims)는 원문 send 없이 grant 파기 marker와 보호 control ACK만 만든다',
    async (offset) => {
      const f = await expiringPrivateDelivery();
      f.at(offset);
      const permit = await store.currentProtected(
          'ExecutionPermit',
          (f.work.executionPermitRef as Ref).id,
        ),
        result = await f.worker.consume(f.message);
      expect(result.disposition).toBe('CONTROL_REVIEW_REQUIRED');
      expect(f.received).toHaveLength(0);
      expect(f.queue.acknowledgements).toEqual([f.message.id]);
      expect(await store.currentProtected('WorkItem', String(f.work.workId))).toMatchObject({
        state: 'REVIEW_REQUIRED',
        attempt: 0,
        deadlineAt: f.work.deadlineAt,
      });
      expect(
        await store.currentProtected('OutboxDelivery', String(f.outbox.outboxId)),
      ).toMatchObject({
        state: 'REVIEW_REQUIRED',
        transportMessageId: f.message.id,
        deadlineAt: f.outbox.deadlineAt,
      });
      expect(
        await store.currentProtected('RecoveryHandoffGrant', f.issued.targetRef!.id),
      ).toMatchObject({ state: 'EXPIRED' });
      expect(
        await store.list('SecurityTombstone', {
          equals: { targetRef: { id: f.issued.targetRef!.id }, purpose: 'HANDOFF' },
        }),
      ).toHaveLength(1);
      expect(
        await store.currentProtected('ExecutionPermit', (f.work.executionPermitRef as Ref).id),
      ).toEqual(permit);
      expect((await f.worker.consume(f.message)).requestId).toBe(result.requestId);
      expect(
        await store.list('RequestReceipt', { equals: { operation: 'stopOriginalU2Work' } }),
      ).toHaveLength(1);
    },
  );
  it('U2 만료 control도 primary-only 변경에서는 원문/ACK 없이 차단한다', async () => {
    const f = await expiringPrivateDelivery();
    f.at(0);
    await sources.primaryAdmin
      .getRepository('OutboxDelivery')
      .update({ outboxId: f.outbox.outboxId }, { state: 'UNKNOWN', revision: 4 });
    await expect(f.worker.consume(f.message)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(f.received).toHaveLength(0);
    expect(f.queue.acknowledgements).toHaveLength(0);
  });
  it('U2 만료 control의 primary commit crash는 prefix 보호 후 동일 receipt 재관측으로만 ACK한다', async () => {
    let enabled = false,
      failed = false;
    const crashed = new ProtectedStore(
        sources.primaryApp,
        sources.journalAppend,
        async (boundary) => {
          if (enabled && !failed && boundary === 'PRIMARY_COMMITTED') {
            failed = true;
            throw Error('synthetic-u2-control-primary-crash');
          }
        },
      ),
      f = await expiringPrivateDelivery(crashed);
    f.at(0);
    enabled = true;
    await expect(f.worker.consume(f.message)).rejects.toThrow('synthetic-u2-control-primary-crash');
    expect(f.queue.acknowledgements).toHaveLength(0);
    await store.protectPending(await store.currentEpoch());
    expect((await f.worker.consume(f.message)).disposition).toBe('CONTROL_REVIEW_REQUIRED');
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'stopOriginalU2Work' } }),
    ).toHaveLength(1);
    expect(f.received).toHaveLength(0);
    expect(f.queue.acknowledgements).toEqual([f.message.id]);
  });
  it('source 만료 sweep은 직전 유효 grant를 보존하고 정각 후 유한 원본 marker/이력만 보호한다', async () => {
    const f = await expiringPrivateDelivery();
    f.at(-1);
    expect(await f.worker.sweepSources()).toMatchObject({ scanned: 1, expired: 0, blocked: 0 });
    expect(
      (await store.currentProtected('RecoveryHandoffGrant', f.issued.targetRef!.id))?.state,
    ).toBe('ISSUED');
    f.at(0);
    await f.worker.sweepSources();
    await f.worker.sweepSources();
    expect(await f.worker.sweepSources()).toMatchObject({ expired: 1, blocked: 0 });
    expect(
      (await store.currentProtected('RecoveryHandoffGrant', f.issued.targetRef!.id))?.state,
    ).toBe('EXPIRED');
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'expireOriginalU2Source' } }),
    ).toHaveLength(1);
    expect(f.received).toHaveLength(0);
    expect(f.queue.acknowledgements).toHaveLength(0);
  });
  it('별도 post-claim5분 권위 만료는 case HOLD/비밀 marker를 보호하되 원래 slot/UNKNOWN을 끝난 효과로 바꾸지 않는다', async () => {
    const f = await seedClaimedRecovery(store, sources.vault),
      clock = () => new Date(Date.parse(String(f.authority.expiresAt))),
      provider = new StatefulRecoveryProvider(clock),
      identity = new IdentityConsumer(store, provider, f.authorities, clock, true),
      queue = new SyntheticQueue(),
      worker = new U2Worker(store, queue, identity, clock, true),
      before = await store.list('IdentityExecutionSlot');
    await worker.sweepSources();
    await worker.sweepSources();
    expect(await worker.sweepSources()).toMatchObject({ expired: 1, blocked: 0 });
    expect(
      await store.currentProtected('EnrollmentAuthority', String(f.authority.authorityId)),
    ).toMatchObject({ state: 'EXPIRED', expiresAt: f.authority.expiresAt });
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
    expect(await store.list('IdentityExecutionSlot')).toEqual(before);
    expect(
      await store.list('SecurityTombstone', {
        equals: { targetRef: { id: f.authority.authorityId }, reason: 'ORIGINAL_SOURCE_EXPIRED' },
      }),
    ).toHaveLength(3);
    expect(provider.calls).toHaveLength(0);
    expect(queue.acknowledgements).toHaveLength(0);
  });
});
