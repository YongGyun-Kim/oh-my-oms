import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore } from '@oms/persistence';
import {
  IdentityConsumer,
  identityProviderCircuitKey,
  relayU2Outbox,
  U2Worker,
  ref,
} from '@oms/core';
import type { RecoveryProviderPort } from '@oms/core';
import { recoveryCapabilities } from '@oms/integrations';
import { StatefulRecoveryProvider } from '../fixtures/provider.js';
import { SyntheticQueue } from '../fixtures/queue.js';
import { seedClaimedRecovery } from '../fixtures/identity.js';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { u2Meta } from '../fixtures/enterprise.js';
describe('C21 원래 protected intent/단회 subject mutation과 UNKNOWN', () => {
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
  async function fixture(manualNow?: () => Date) {
    const f = await seedClaimedRecovery(store, sources.vault, manualNow),
      provider = new StatefulRecoveryProvider(f.now),
      consumer = new IdentityConsumer(
        store,
        provider,
        f.authorities,
        f.now,
        true,
        f.vault,
        f.verifier,
      ),
      input = { meta: u2Meta(Number(f.current.revision)), caseRef: ref('RecoveryCase', f.current) };
    return {
      ...f,
      provider,
      consumer,
      input,
      prepare: () => consumer.prepare(f.purpose, input),
      works: () =>
        store.list('WorkItem', {
          equals: { owner: 'IdentityRecovery', targetRef: { id: f.source.caseId } },
        }),
    };
  }
  it('원래 모든 binding의 제거/signout intent를 새 한 case 개정과 보호하며 동일 준비는 새 effect를 만들지 않는다', async () => {
    const f = await fixture(),
      receipt = await f.prepare(),
      works = await f.works();
    expect(works).toHaveLength(2);
    expect(
      works.every(
        (work) => work.expectedRevision === 4 && work.attempt === 0 && work.state === 'PENDING',
      ),
    ).toBe(true);
    expect(await store.list('IdentityOperationResult')).toHaveLength(2);
    expect(f.provider.calls).toHaveLength(0);
    expect((await f.prepare()).requestId).toBe(receipt.requestId);
  });
  it('실제 stateful 원래 제거/signout은 각각1회이며 재관측은 새 SDK mutation이 아니다', async () => {
    const f = await fixture();
    await f.prepare();
    const works = await f.works();
    for (const work of works) {
      const result = await f.consumer.consume(String(work.workId));
      expect((await store.currentProtected('IdentityOperationResult', result.id))?.knowledge).toBe(
        'KNOWN',
      );
      expect((await store.currentProtected('WorkItem', String(work.workId)))?.attempt).toBe(1);
      expect((await f.consumer.consume(String(work.workId))).id).toBe(result.id);
    }
    expect(f.provider.calls).toHaveLength(2);
    expect(f.provider.maximum).toBe(1);
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'ENROLMENT_ONLY',
    );
  });
  it('같은 subject의 concurrent 두 work는 보호 예약이 하나만 SDK에 들여보낸다', async () => {
    const f = await fixture();
    await f.prepare();
    const works = await f.works();
    let release!: () => void;
    f.provider.barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = f.consumer.consume(String(works[0]!.workId));
    for (let i = 0; i < 200 && f.provider.calls.length === 0; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(f.provider.calls).toHaveLength(1);
    await expect(f.consumer.consume(String(works[1]!.workId))).rejects.toMatchObject({
      code: 'IDENTITY_SUBJECT_BUSY',
    });
    release();
    await first;
    f.provider.barrier = null;
    await f.consumer.consume(String(works[1]!.workId));
    expect(f.provider.maximum).toBe(1);
  });
  it('UNKNOWN은 원래 slot/subject 예약을 유지하고 새 수단·다른 work·같은 mutation 재송신을 막는다', async () => {
    const f = await fixture();
    await f.prepare();
    f.provider.mode = 'UNKNOWN';
    const works = await f.works(),
      result = await f.consumer.consume(String(works[0]!.workId));
    expect((await store.currentProtected('IdentityOperationResult', result.id))?.knowledge).toBe(
      'UNKNOWN',
    );
    expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('UNKNOWN');
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
    expect(
      (await store.list('EndpointCircuit')).some(
        (row) => row.probeOwner === works[0]!.workId && row.state === 'REVIEW_REQUIRED',
      ),
    ).toBe(true);
    await expect(f.consumer.consume(String(works[0]!.workId))).rejects.toThrow();
    await expect(f.consumer.consume(String(works[1]!.workId))).rejects.toThrow();
    expect(f.provider.calls).toHaveLength(1);
  });
  it('다른 intent callback와 예외/늦은 응답 불명도 현재 성공을 만들지 않는다', async () => {
    const f = await fixture();
    await f.prepare();
    f.provider.mode = 'FORGED';
    const work = (await f.works())[0]!,
      result = await f.consumer.consume(String(work.workId));
    expect((await store.currentProtected('IdentityOperationResult', result.id))?.knowledge).toBe(
      'UNKNOWN',
    );
    expect(f.provider.calls).toHaveLength(1);
  });
  it('현재 보안 세대 변경/primary-only permit 회수는 SDK 실행 전에 거절한다', async () => {
    const f = await fixture();
    await f.prepare();
    const work = (await f.works())[0]!,
      permit = (await store.currentProtected(
        'ExecutionPermit',
        (work.executionPermitRef as { id: string }).id,
      ))!;
    await sources.primaryAdmin
      .getRepository('ExecutionPermit')
      .update(
        { permitId: permit.permitId },
        { allowed: false, revision: Number(permit.revision) + 1 },
      );
    await expect(f.consumer.consume(String(work.workId))).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(f.provider.calls).toHaveLength(0);
  });
  it('미등록 실제 provider는 원래 당사자 case/authority를 보호 HOLD하며 work/실계정 호출을 만들지 않는다', async () => {
    const f = await fixture(),
      unregistered: RecoveryProviderPort = {
        capabilities: recoveryCapabilities('COGNITO', 'UNREGISTERED'),
        execute: f.provider.execute.bind(f.provider),
        beginFactor: f.provider.beginFactor.bind(f.provider),
        verifyFactor: f.provider.verifyFactor.bind(f.provider),
        observeOriginal: f.provider.observeOriginal.bind(f.provider),
      },
      consumer = new IdentityConsumer(store, unregistered, f.authorities, f.now, true),
      receipt = await consumer.prepare(f.purpose, f.input);
    expect(receipt.requestState).toBe('REVIEW_REQUIRED');
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
    expect(await f.works()).toHaveLength(0);
    expect(f.provider.calls).toHaveLength(0);
  });
  it('확인 당사자의 새 첫 password는30초 암호 자료/원래 HMAC intent로만 단회 전달하며 MFA 완료와 다르다', async () => {
    const f = await fixture();
    await f.prepare();
    for (const work of await f.works()) await f.consumer.consume(String(work.workId));
    const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      password = 'synthetic-party-private-' + randomUUID(),
      input = {
        meta: u2Meta(Number(source.revision)),
        caseRef: ref('RecoveryCase', source),
        password,
      },
      prepared = await f.consumer.prepareFirstFactor(f.purpose, input),
      work = (
        await store.list('WorkItem', {
          equals: { operationId: 'IdentityRecovery.replaceFirstFactor' },
        })
      )[0]!;
    expect(
      Date.parse(String(work.deadlineAt)) - Date.parse(String(work.notBefore)),
    ).toBeLessThanOrEqual(30000);
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [work.workId]),
    ).toHaveLength(1);
    const rows = await sources.primaryAdmin.query(
      'SELECT count(*)::int AS count FROM u1_recovery_candidate WHERE position($1 in payload_text)>0',
      [password],
    );
    expect(rows[0].count).toBe(0);
    expect((await f.consumer.prepareFirstFactor(f.purpose, input)).requestId).toBe(
      prepared.requestId,
    );
    const result = await f.consumer.consume(String(work.workId));
    expect((await store.currentProtected('IdentityOperationResult', result.id))?.effect).toBe(
      'PASSWORD_REPLACED',
    );
    expect(
      f.provider.calls.filter((call) => call.operation === 'REPLACE_FIRST_FACTOR'),
    ).toHaveLength(1);
    await f.consumer.consume(String(work.workId));
    expect(
      f.provider.calls.filter((call) => call.operation === 'REPLACE_FIRST_FACTOR'),
    ).toHaveLength(1);
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [work.workId]),
    ).toHaveLength(0);
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'ENROLMENT_ONLY',
    );
    expect(
      (await store.list('IdentitySession')).filter((row) => row.phase === 'MFA_VERIFIED'),
    ).toHaveLength(2);
  });
  it('옛 효과 미종료·다른 목적 문맥·바뀐 동일 요청 비밀은 첫 수단의 새 효과를 만들지 않는다', async () => {
    const f = await fixture();
    await f.prepare();
    let source = (await store.currentProtected('RecoveryCase', f.source.caseId))!;
    await expect(
      f.consumer.prepareFirstFactor(f.purpose, {
        meta: u2Meta(Number(source.revision)),
        caseRef: ref('RecoveryCase', source),
        password: 'synthetic-private-first',
      }),
    ).rejects.toMatchObject({ code: 'FIRST_FACTOR_ORIGINAL_EFFECTS' });
    for (const work of await f.works()) await f.consumer.consume(String(work.workId));
    source = (await store.currentProtected('RecoveryCase', f.source.caseId))!;
    const input = {
      meta: u2Meta(Number(source.revision)),
      caseRef: ref('RecoveryCase', source),
      password: 'synthetic-private-first',
    };
    await expect(f.consumer.prepareFirstFactor({ ...f.purpose }, input)).rejects.toMatchObject({
      code: 'PURPOSE_AUTHORITY_REQUIRED',
    });
    await f.consumer.prepareFirstFactor(f.purpose, input);
    await expect(
      f.consumer.prepareFirstFactor(f.purpose, { ...input, password: 'synthetic-other-first' }),
    ).rejects.toThrow();
    expect(
      f.provider.calls.filter((call) => call.operation === 'REPLACE_FIRST_FACTOR'),
    ).toHaveLength(0);
  });
  it('첫 password mutation UNKNOWN은 새 factor/같은 SDK 재송신 없이 원래 slot·subject를 HOLD하고 암호 자료를 파기한다', async () => {
    const f = await fixture();
    await f.prepare();
    for (const work of await f.works()) await f.consumer.consume(String(work.workId));
    const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!;
    await f.consumer.prepareFirstFactor(f.purpose, {
      meta: u2Meta(Number(source.revision)),
      caseRef: ref('RecoveryCase', source),
      password: 'synthetic-private-first',
    });
    const work = (
      await store.list('WorkItem', {
        equals: { operationId: 'IdentityRecovery.replaceFirstFactor' },
      })
    )[0]!;
    f.provider.mode = 'UNKNOWN';
    const result = await f.consumer.consume(String(work.workId));
    expect((await store.currentProtected('IdentityOperationResult', result.id))?.knowledge).toBe(
      'UNKNOWN',
    );
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
    expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('UNKNOWN');
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [work.workId]),
    ).toHaveLength(0);
    await expect(f.consumer.consume(String(work.workId))).rejects.toThrow();
    expect(
      f.provider.calls.filter((call) => call.operation === 'REPLACE_FIRST_FACTOR'),
    ).toHaveLength(1);
  });
  it('provider fifth unknown은30초 창의 OPEN을 보호하며 원래 UNKNOWN subject를 풀지 않는다', async () => {
    const f = await fixture();
    await f.prepare();
    const works = await f.works(),
      binding = (await store.currentProtected(
        'ProviderBinding',
        (f.current.bindingRef as { id: string }).id,
      ))!,
      id = identityProviderCircuitKey(String(binding.issuer)),
      circuit = {
        endpointId: id,
        state: 'CLOSED',
        failureCount: 4,
        windowStartedAt: f.now().toISOString(),
        openedAt: null,
        probeOwner: null,
        probeDeadlineAt: null,
        probeToken: null,
        probeGeneration: 1,
        probeEpoch: null,
        revision: 1,
      };
    await f.execute('fixture-current-provider-breaker', async (tx) =>
      tx.put('EndpointCircuit', circuit),
    );
    f.provider.mode = 'UNKNOWN';
    await f.consumer.consume(String(works[0]!.workId));
    expect(await store.currentProtected('EndpointCircuit', id)).toMatchObject({
      state: 'OPEN',
      failureCount: 5,
    });
    expect(f.provider.calls).toHaveLength(1);
    await expect(f.consumer.consume(String(works[1]!.workId))).rejects.toThrow();
    expect(f.provider.calls).toHaveLength(1);
  });
  it('이미 OPEN인 공유 provider 접점은 새 subject mutation을 시작하지 않는다', async () => {
    const f = await fixture();
    await f.prepare();
    const work = (await f.works())[0]!,
      binding = (await store.currentProtected(
        'ProviderBinding',
        (f.current.bindingRef as { id: string }).id,
      ))!,
      id = identityProviderCircuitKey(String(binding.issuer));
    await f.execute('fixture-open-provider-breaker', async (tx) =>
      tx.put('EndpointCircuit', {
        endpointId: id,
        state: 'OPEN',
        failureCount: 5,
        windowStartedAt: f.now().toISOString(),
        openedAt: f.now().toISOString(),
        probeOwner: null,
        probeDeadlineAt: null,
        probeToken: null,
        probeGeneration: 1,
        probeEpoch: null,
        revision: 1,
      }),
    );
    await expect(f.consumer.consume(String(work.workId))).rejects.toMatchObject({
      code: 'IDENTITY_PROVIDER_CIRCUIT',
    });
    expect(f.provider.calls).toHaveLength(0);
    expect((await store.currentProtected('WorkItem', String(work.workId)))?.attempt).toBe(0);
  });
  it('UNKNOWN의 원래 실제 종료 관측은 SDK 재송신 없이 결과/subject 예약만 확정하고 slot·case·권위 HOLD를 유지한다', async () => {
    const f = await fixture();
    await f.prepare();
    f.provider.mode = 'UNKNOWN';
    const work = (await f.works())[0]!;
    await f.consumer.consume(String(work.workId));
    const observed = await f.consumer.reobserve(String(work.workId));
    expect(await store.currentProtected('IdentityOperationResult', observed.id)).toMatchObject({
      knowledge: 'KNOWN',
      terminal: true,
    });
    expect((await store.currentProtected('WorkItem', String(work.workId)))?.state).toBe(
      'RESULT_RECORDED',
    );
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
    expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('UNKNOWN');
    expect((await store.list('EnrollmentAuthority'))[0]?.state).toBe('HOLD');
    expect(f.provider.calls).toHaveLength(1);
    expect((await f.consumer.reobserve(String(work.workId))).revision).toBe(observed.revision);
    expect(f.provider.calls).toHaveLength(1);
  });
  it('다른 원래 intent/probe 결과는 UNKNOWN을 해소하지 않고 새 수단/subject 예약도 풀지 않는다', async () => {
    const f = await fixture();
    await f.prepare();
    f.provider.mode = 'UNKNOWN';
    const work = (await f.works())[0]!;
    await f.consumer.consume(String(work.workId));
    const original = f.provider.original.get(String(work.workId))!;
    f.provider.original.set(String(work.workId), { ...original, inputDigest: '0'.repeat(64) });
    await expect(f.consumer.reobserve(String(work.workId))).rejects.toMatchObject({
      code: 'IDENTITY_ORIGINAL_RESULT',
    });
    expect(
      (await store.currentProtected('IdentityOperationResult', String(work.workId)))?.knowledge,
    ).toBe('UNKNOWN');
    expect(
      (await store.list('EndpointCircuit')).some(
        (row) => row.state === 'REVIEW_REQUIRED' && row.probeOwner === work.workId,
      ),
    ).toBe(true);
    expect(f.provider.calls).toHaveLength(1);
  });
  it('U2 relay는 원래 Work/permit/Fact/consumer만 발행하며 보호 PUBLISHED 재관측으로 복제하지 않는다', async () => {
    const f = await fixture();
    await f.prepare();
    const work = (await f.works())[0]!,
      outbox = (
        await store.list('OutboxDelivery', { equals: { workRef: { id: work.workId } } })
      )[0]!,
      queue = new SyntheticQueue();
    await relayU2Outbox(store, queue, String(outbox.outboxId), f.now, (item, tx) =>
      f.consumer.assertPrepared(item, tx),
    );
    expect(queue.messages).toHaveLength(1);
    expect(queue.messages[0]?.consumer).toBe('u2-identity');
    expect(queue.messages[0]?.body).toMatchObject({
      workId: work.workId,
      targetRef: work.targetRef,
      operationId: work.operationId,
    });
    expect((await store.currentProtected('OutboxDelivery', String(outbox.outboxId)))?.state).toBe(
      'PUBLISHED',
    );
    expect(f.provider.calls).toHaveLength(0);
    await relayU2Outbox(store, queue, String(outbox.outboxId), f.now, (item, tx) =>
      f.consumer.assertPrepared(item, tx),
    );
    expect(queue.messages).toHaveLength(1);
  });
  it('U2 발행 응답 UNKNOWN은 원래 Outbox/시도·기한을 보존하며 자동 같은 발행을 재송신하지 않는다', async () => {
    const f = await fixture();
    await f.prepare();
    const work = (await f.works())[0]!,
      outbox = (
        await store.list('OutboxDelivery', { equals: { workRef: { id: work.workId } } })
      )[0]!,
      queue = new SyntheticQueue();
    queue.failAfterPublish = true;
    await expect(
      relayU2Outbox(store, queue, String(outbox.outboxId), f.now, (item, tx) =>
        f.consumer.assertPrepared(item, tx),
      ),
    ).rejects.toThrow();
    expect(queue.messages).toHaveLength(1);
    expect(await store.currentProtected('OutboxDelivery', String(outbox.outboxId))).toMatchObject({
      state: 'UNKNOWN',
      attempt: 1,
      deadlineAt: outbox.deadlineAt,
    });
    await expect(
      relayU2Outbox(store, queue, String(outbox.outboxId), f.now, (item, tx) =>
        f.consumer.assertPrepared(item, tx),
      ),
    ).rejects.toMatchObject({ code: 'U2_PUBLISH_REVIEW' });
    expect(queue.messages).toHaveLength(1);
  });
  it('실제 U2 큐 consumer는 보호 원래 C21 result/Receipt 뒤 ACK하고 중복 delivery를 새 SDK mutation으로 보내지 않는다', async () => {
    const f = await fixture();
    await f.prepare();
    const work = (await f.works())[0]!,
      outbox = (
        await store.list('OutboxDelivery', { equals: { workRef: { id: work.workId } } })
      )[0]!,
      queue = new SyntheticQueue(),
      worker = new U2Worker(store, queue, f.consumer, f.now, true);
    await worker.relayOne(String(outbox.outboxId));
    const message = (await queue.receive('u2-identity'))[0]!,
      first = await worker.consume(message);
    expect(first.resultRef.entity).toBe('IdentityOperationResult');
    expect(queue.acknowledgements).toEqual([message.id]);
    expect(f.provider.calls).toHaveLength(1);
    expect((await worker.consume(message)).resultRef).toEqual(first.resultRef);
    expect(f.provider.calls).toHaveLength(1);
  });
  it('위조 envelope/consumer/발행 ID는 SDK/ACK 전 차단하고 원래 UNKNOWN은 보호 중단으로 구별해 ACK한다', async () => {
    const f = await fixture();
    await f.prepare();
    const work = (await f.works())[0]!,
      outbox = (
        await store.list('OutboxDelivery', { equals: { workRef: { id: work.workId } } })
      )[0]!,
      queue = new SyntheticQueue(),
      worker = new U2Worker(store, queue, f.consumer, f.now, true);
    await worker.relayOne(String(outbox.outboxId));
    const message = (await queue.receive('u2-identity'))[0]!;
    await expect(worker.consume({ ...message, id: 'other-publish-id' })).rejects.toMatchObject({
      code: 'U2_DELIVERY_BINDING',
    });
    await expect(
      worker.consume({
        ...message,
        body: { ...(message.body as object), requestId: 'other-request' },
      }),
    ).rejects.toMatchObject({ code: 'WORK_ENVELOPE_MISMATCH' });
    expect(queue.acknowledgements).toHaveLength(0);
    expect(f.provider.calls).toHaveLength(0);
    f.provider.mode = 'UNKNOWN';
    expect((await worker.consume(message)).disposition).toBe('CONTROL_REVIEW_REQUIRED');
    expect(queue.acknowledgements).toEqual([message.id]);
    expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('UNKNOWN');
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
  });
  it('OPEN30초 이후 원래 read-only 재관측 probe는 전체 한 lease만 열고 새 SDK mutation/slot 재개를 만들지 않는다', async () => {
    let time = Date.now() + 1000;
    const f = await fixture(() => new Date(time));
    await f.prepare();
    const work = (await f.works())[0]!,
      binding = (await store.currentProtected(
        'ProviderBinding',
        (f.current.bindingRef as { id: string }).id,
      ))!,
      id = identityProviderCircuitKey(String(binding.issuer));
    await f.execute('fixture-provider-four-failures', async (tx) =>
      tx.put('EndpointCircuit', {
        endpointId: id,
        state: 'CLOSED',
        failureCount: 4,
        windowStartedAt: f.now().toISOString(),
        openedAt: null,
        probeOwner: null,
        probeDeadlineAt: null,
        probeToken: null,
        probeGeneration: 1,
        probeEpoch: null,
        revision: 1,
      }),
    );
    f.provider.mode = 'UNKNOWN';
    await f.consumer.consume(String(work.workId));
    await expect(f.consumer.reobserve(String(work.workId))).rejects.toMatchObject({
      code: 'IDENTITY_PROVIDER_CIRCUIT',
    });
    time += 30000;
    let release!: () => void,
      calls = 0;
    const original = f.provider.observeOriginal.bind(f.provider),
      barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
    f.provider.observeOriginal = async (...input) => {
      calls++;
      await barrier;
      return original(...input);
    };
    const first = f.consumer.reobserve(String(work.workId));
    for (let i = 0; i < 200 && calls === 0; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls).toBe(1);
    await expect(f.consumer.reobserve(String(work.workId))).rejects.toMatchObject({
      code: 'IDENTITY_PROVIDER_CIRCUIT',
    });
    release();
    await first;
    expect(await store.currentProtected('EndpointCircuit', id)).toMatchObject({
      state: 'CLOSED',
      failureCount: 0,
      probeOwner: null,
      probeToken: null,
    });
    expect(f.provider.calls).toHaveLength(1);
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
    expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('UNKNOWN');
  });
});
