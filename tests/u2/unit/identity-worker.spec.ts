import { describe, it, expect } from 'vitest';
import { ExecutionBudget } from '@oms/contracts';
import { identitySubjectKey, identityObservationMatches, boundedIdentityCall } from '@oms/core';
import type { RecoveryProviderTarget, RecoveryProviderObservation } from '@oms/core';
import type { QueueBroker, QueueMessage } from '@oms/core';
import { runWorkerCycle } from '@oms/integrations';
const r = { owner: 'IdentityRecovery', entity: 'ProviderBinding', id: 'binding', revision: 1 },
  target: RecoveryProviderTarget = {
    approvedOperationId: 'work',
    workId: 'work',
    caseRef: { ...r, entity: 'RecoveryCase' },
    accountRef: { ...r, entity: 'Account' },
    bindingRef: r,
    issuer: 'issuer',
    subject: 'subject',
    audience: 'CUSTOMER',
    bindingGeneration: 1,
    securityGeneration: 2,
    epoch: 'epoch',
    inputDigest: 'a'.repeat(64),
    deadlineAt: '2026-10-10T00:05:00Z',
  },
  known: RecoveryProviderObservation = {
    approvedOperationId: 'work',
    workId: 'work',
    bindingRef: r,
    inputDigest: target.inputDigest,
    epoch: 'epoch',
    providerRequestId: 'synthetic-response',
    knowledge: 'KNOWN',
    effect: 'REMOVED',
    terminal: true,
    evidenceRefs: [target.caseRef],
    observedAt: '2026-10-10T00:00:00Z',
  };
describe('identity worker의 원래 결과/subject 직렬 키', () => {
  it('같은 issuer/subject는 다른 binding generation에서도 같은 mutation 예약 키를 쓴다', () => {
    const changed = {
      ...target,
      bindingRef: { ...r, id: 'new-binding', revision: 2 },
      bindingGeneration: 2,
      securityGeneration: 3,
    };
    expect(identitySubjectKey(target.issuer, target.subject)).toBe(
      identitySubjectKey(changed.issuer, changed.subject),
    );
  });
  it('다른 issuer/subject는 한 provider 원본으로 혼합하지 않는다', () => {
    expect(identitySubjectKey('other', target.subject)).not.toBe(
      identitySubjectKey(target.issuer, target.subject),
    );
    expect(identitySubjectKey(target.issuer, 'other')).not.toBe(
      identitySubjectKey(target.issuer, target.subject),
    );
  });
  it('정확한 terminal 제거는 원래 work의 결과 후보다', () =>
    expect(identityObservationMatches(target, known, 'REMOVE_ORIGINAL_FACTOR')).toBe(true));
  it('다른 input/epoch/work/binding 개정은 원래 callback이 아니다', () => {
    for (const change of [
      { workId: 'other' },
      { approvedOperationId: 'other' },
      { epoch: 'other' },
      { inputDigest: 'b'.repeat(64) },
      { bindingRef: { ...r, revision: 2 } },
    ])
      expect(
        identityObservationMatches(target, { ...known, ...change }, 'REMOVE_ORIGINAL_FACTOR'),
      ).toBe(false);
  });
  it('signout/새 factor 결과를 제거 결과로 대체하지 않는다', () => {
    expect(
      identityObservationMatches(
        target,
        { ...known, effect: 'SIGNED_OUT' },
        'REMOVE_ORIGINAL_FACTOR',
      ),
    ).toBe(false);
    expect(
      identityObservationMatches(
        target,
        { ...known, effect: 'FACTOR_VERIFIED' },
        'REMOVE_ORIGINAL_FACTOR',
      ),
    ).toBe(false);
  });
  it('실제 종료/격리 근거 없는 수락은 KNOWN이 아니다', () => {
    for (const change of [{ terminal: false }, { providerRequestId: '' }, { evidenceRefs: [] }])
      expect(
        identityObservationMatches(target, { ...known, ...change }, 'REMOVE_ORIGINAL_FACTOR'),
      ).toBe(false);
  });
  it('UNKNOWN은 동일 원래 callback에서 불명으로 유지하며 성공 재시도 허가가 아니다', () =>
    expect(
      identityObservationMatches(
        target,
        {
          ...known,
          knowledge: 'UNKNOWN',
          terminal: false,
          effect: 'UNCONFIRMED',
          evidenceRefs: [],
        },
        'REMOVE_ORIGINAL_FACTOR',
      ),
    ).toBe(true));
  it('새 subject의 격리도 원래 work/input/terminal 근거가 있어야 인정한다', () => {
    expect(
      identityObservationMatches(
        target,
        { ...known, effect: 'ISOLATED' },
        'REMOVE_ORIGINAL_FACTOR',
      ),
    ).toBe(true);
    expect(
      identityObservationMatches(
        target,
        { ...known, effect: 'ISOLATED', terminal: false },
        'REMOVE_ORIGINAL_FACTOR',
      ),
    ).toBe(false);
  });
  it('취소를 무시하는 provider도 유한 대기로 끝나며 늦은 callback은 그 호출을 성공으로 바꾸지 않는다', async () => {
    const cancellation = new AbortController(),
      budget = new ExecutionBudget(5000, () => Date.now(), cancellation.signal);
    let resolve!: (value: string) => void;
    const pending = boundedIdentityCall(
      budget,
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    cancellation.abort();
    await expect(pending).rejects.toMatchObject({ code: 'EXECUTION_DEADLINE' });
    resolve('late');
    await expect(pending).rejects.toMatchObject({ code: 'EXECUTION_DEADLINE' });
  });
  it('provider 오류와 예산 내 결과를 원래대로 반환하고 취소로 재송신하지 않는다', async () => {
    const budget = new ExecutionBudget(5000);
    expect(await boundedIdentityCall(budget, async () => known)).toBe(known);
    await expect(
      boundedIdentityCall(budget, async () => {
        throw Error('synthetic');
      }),
    ).rejects.toThrow('synthetic');
  });
});
describe('4-consumer runtime의 공유 lane/예산/원래 routing', () => {
  const names = [
    'u1-in-app-notice',
    'u2-identity',
    'u2-handoff-delivery',
    'u2-invitation-delivery',
  ];
  it('각 consumer 수신은 정확 owner에게 보내며 전체 소비 동시성은4를 넘지 않는다', async () => {
    const calls: string[] = [],
      seen: string[] = [],
      budgets: ExecutionBudget[] = [],
      failure: string[] = [];
    let active = 0,
      maximum = 0;
    const broker = {
      kind: 'SYNTHETIC',
      receive: async (consumer: string) => {
        calls.push(consumer);
        budgets.push(ExecutionBudget.current()!);
        return Array.from({ length: 3 }, (_, i) => ({
          id: consumer + '-' + i,
          consumer,
          receiptHandle: 'synthetic',
          body: {},
        }));
      },
    } as unknown as QueueBroker;
    const consume = async (message: QueueMessage, owner: 'u1' | 'u2') => {
      expect(message.consumer === 'u1-in-app-notice' ? 'u1' : 'u2').toBe(owner);
      seen.push(message.id);
      budgets.push(ExecutionBudget.current()!);
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 3));
      active--;
      if (message.id === 'u2-identity-0') throw Error('synthetic-original-failure');
    };
    const result = await runWorkerCycle(
      { relayBatch: async () => 0, consume: (message) => consume(message, 'u1') },
      broker,
      new AbortController().signal,
      (_error, message) => failure.push(message.id),
      { relayBatch: async () => 0, consume: (message) => consume(message, 'u2') },
    );
    expect(calls).toEqual(names);
    expect(seen).toHaveLength(12);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(maximum).toBe(4);
    expect(result).toEqual({ attempted: 12, succeeded: 11, failed: 1, unstarted: 0 });
    expect(failure).toEqual(['u2-identity-0']);
    expect(budgets.every((value) => value === budgets[0])).toBe(true);
  });
  it('한 consumer receive 실패/poison은 다른 세 원래 consumer를 중단하거나 ACK하지 않는다', async () => {
    const failures: string[] = [],
      seen: string[] = [];
    const broker = {
      kind: 'SYNTHETIC',
      receive: async (consumer: string) => {
        if (consumer === 'u2-identity') throw Error('synthetic-receive');
        return [{ id: consumer, consumer, receiptHandle: 'synthetic', body: {} }];
      },
      takeReceiveRejections: () => [
        {
          consumer: 'u2-identity',
          index: 0,
          messageId: 'poison',
          code: 'INVALID_ENVELOPE',
          action: 'NO_ACK_WAIT_REDRIVE',
        },
      ],
    } as unknown as QueueBroker;
    const worker = {
      relayBatch: async () => 0,
      consume: async (message: QueueMessage) => {
        seen.push(message.id);
      },
    };
    const result = await runWorkerCycle(
      worker,
      broker,
      new AbortController().signal,
      (_error, message) => failures.push(message.id),
      worker,
    );
    expect(result.succeeded).toBe(3);
    expect(seen).toEqual(expect.arrayContaining(names.filter((name) => name !== 'u2-identity')));
    expect(failures).toEqual(['receive-unconfirmed-u2-identity', 'poison']);
  });
  it('consumer retarget 또는 batch 상한 초과는 한 effect도 보내기 전 차단한다', async () => {
    let calls = 0;
    const worker = {
      relayBatch: async () => 0,
      consume: async () => {
        calls++;
      },
    };
    const broker = {
      kind: 'SYNTHETIC',
      receive: async (consumer: string) => [
        {
          id: 'forged',
          consumer: consumer === 'u2-identity' ? 'unregistered' : consumer,
          receiptHandle: 'synthetic',
          body: {},
        },
      ],
    } as unknown as QueueBroker;
    await expect(
      runWorkerCycle(worker, broker, new AbortController().signal, () => {}, worker),
    ).rejects.toMatchObject({ code: 'WORKER_ROUTE_BINDING' });
    expect(calls).toBe(0);
  });
});
