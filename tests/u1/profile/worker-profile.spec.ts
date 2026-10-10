import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityRecovery, NoticeWorker } from '@oms/core';
import { ProtectedStore } from '@oms/persistence';
import { localSources } from '../fixtures/databases.js';
import { SyntheticIdentityProvider } from '../fixtures/identity.js';
import { SyntheticQueue } from '../fixtures/queue.js';
const sources = localSources();
let store: ProtectedStore;
let identity: IdentityRecovery;
let token: string;
let queue: SyntheticQueue;
let worker: NoticeWorker;
beforeAll(async () => {
  await sources.primaryApp.initialize();
  await sources.journalAppend.initialize();
  const profile = JSON.parse(readFileSync('.runtime/u1/performance-profile.json', 'utf8'));
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  identity = new IdentityRecovery(
    store,
    new SyntheticIdentityProvider(false, profile.credentials),
    {
      synthetic: true,
      verifierKey: Buffer.from(profile.verifier, 'hex'),
      now: () => new Date(),
      staffIngress: async (proof) => proof === 'synthetic-private-ingress',
    },
  );
  const start = await identity.login(
    'STAFF',
    'nfr-staff-8@example.invalid',
    profile.credentials.password,
    randomUUID(),
    'synthetic-private-ingress',
  );
  const completed = await identity.verifyFactor(
    start.challengeId!,
    profile.credentials.factor,
    randomUUID(),
    'synthetic-private-ingress',
  );
  if (completed.phase !== 'MFA_VERIFIED') throw new Error('준비 profile의 MFA를 확인해야 합니다.');
  token = completed.sessionToken!;
  queue = new SyntheticQueue();
  worker = new NoticeWorker(store, queue, () => new Date(), true);
});
afterAll(async () => {
  await identity.logout(token);
  await sources.primaryApp.destroy();
  await sources.journalAppend.destroy();
});
describe('100k 기존자료/held Work 뒤 실제 신규 보안 통지의relay·효과·ACK', () => {
  it('보호된 신규 security Fact/Work를 실제 큐adapter에 전달한다', async () => {
    await worker.relayBatch();
    expect(queue.messages.length).toBeGreaterThan(0);
    for (const message of queue.messages)
      expect((message.body as { owner: string }).owner).toBe('NotificationDelivery');
  });
  it('현재 주체의 최소 효과가 보호된 후 원래 message를ACK한다', async () => {
    for (const message of queue.messages) {
      const result = await worker.consume(message);
      const intent = await store.read('NotificationIntent', result.resultRef.id);
      expect(intent?.minimalText).toBe('인증 보안 상태를 확인해 주세요.');
      expect(intent?.loginPath).toBe('/identity');
      expect(JSON.stringify(intent)).not.toContain('verifiers');
    }
    expect(queue.acknowledgements.length).toBe(queue.messages.length);
  });
  it('관측 시작/종료 실패에도 보호된 효과의 원래ID 중복 대조는 업무 결과를 바꾸지 않는다', async () => {
    for (const mode of ['begin', 'finish']) {
      const observer = {
        begin: () => {
          if (mode === 'begin') throw new Error('synthetic observation unavailable');
          return {
            finish: () => {
              throw new Error('synthetic exporter unavailable');
            },
          };
        },
      };
      const observed = new NoticeWorker(store, queue, () => new Date(), true, observer);
      const original = await worker.consume(queue.messages[0]!);
      expect(await observed.consume(queue.messages[0]!)).toEqual(original);
    }
  });
  it('동일 원래 Work의 중복 메시지는 새 통지 효과를 만들지 않는다', async () => {
    const first = await worker.consume(queue.messages[0]!);
    const second = await worker.consume(queue.messages[0]!);
    expect(second).toEqual(first);
  });
  it('fact owner/entity 전체와 다른 target은 같은id라도 거절한다', async () => {
    const original = queue.messages[0]!;
    const altered = structuredClone(original);
    const body = altered.body as { targetRef: { owner: string } };
    body.targetRef.owner = 'OrderAcceptance';
    await expect(worker.consume(altered)).rejects.toThrow();
  });
  it('원래 requestId/correlationId를 큐사본이 바꿀 수 없다', async () => {
    const altered = structuredClone(queue.messages[0]!);
    (altered.body as { correlationId: string }).correlationId = 'different-correlation';
    await expect(worker.consume(altered)).rejects.toThrow();
  });
  it('전체100k 과거 확인대기 Work는 원래ID/상태로 유지한다', async () => {
    const old = await store.read('WorkItem', 'nfr-work-0');
    expect(old).toMatchObject({
      workId: 'nfr-work-0',
      requestId: 'nfr-historical-request-0',
      correlationId: 'nfr-historical-request-0',
      state: 'REVIEW_REQUIRED',
    });
  });
  it('relay 재조회는 이미 보호된효과의PUBLISHED 원본을 다시 발행하지 않는다', async () => {
    const count = queue.messages.length;
    await worker.relayBatch();
    expect(queue.messages.length).toBe(count);
  });
});
