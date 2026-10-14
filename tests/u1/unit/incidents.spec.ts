import { describe, expect, it } from 'vitest';
import { OperationalIncidents, validateIncident } from '@oms/integrations';
import type { Incident, IncidentStore, OperationalSender } from '@oms/integrations';
function fixture() {
  let clock = new Date('2026-10-09T00:00:00Z');
  let saved: Incident | null = null;
  let unavailable = false;
  const deliveries: unknown[] = [];
  const store: IncidentStore = {
    kind: 'SYNTHETIC',
    read: async () => {
      if (unavailable) throw new Error('합성 metadata 불가');
      return saved ? structuredClone(saved) : null;
    },
    compareAndSet: async (value, revision) => {
      if (unavailable) throw new Error('합성 metadata 불가');
      if ((saved?.revision ?? null) !== revision) throw new Error('합성CAS 충돌');
      validateIncident(value);
      saved = structuredClone(value);
    },
  };
  const sender: OperationalSender = {
    send: async (channel, message) => {
      deliveries.push({ channel, message });
      return channel === 'SLACK' ? 'ACCEPTED' : 'UNKNOWN';
    },
  };
  const service = new OperationalIncidents(
    store,
    sender,
    () => clock,
    true,
    async (context) => (context === 'trusted-synthetic-operator' ? 'synthetic-operator' : null),
  );
  const start = () =>
    service.start({
      incidentId: 'synthetic-incident',
      attemptId: 'original-attempt',
      eventId: 'original-event',
      faultAt: '2026-10-08T23:59:00Z',
      cause: 'APPLICATION',
    });
  return {
    service,
    store,
    sender,
    start,
    deliveries,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
    unavailable: () => {
      unavailable = true;
    },
  };
}
describe('독립운영metadata/2채널수락/명시ACK/기한·원래사건보존(합성authority)', () => {
  it('복구 시도 시작 직후 두채널을 생성하고 수락/미확인을ACK로승격하지않는다', async () => {
    const f = fixture();
    const row = await f.start();
    expect(f.deliveries).toHaveLength(2);
    expect(row.channels).toEqual({ SLACK: 'ACCEPTED', EMAIL: 'UNKNOWN' });
    expect(row.acknowledgedBy).toBeNull();
    expect(row.manualStartedAt).toBeNull();
    expect(row.verifiedRecoveryAt).toBeNull();
  });
  it('같은incident/attempt/event 재시작은추가외부효과를만들지않는다', async () => {
    const f = fixture();
    const first = await f.start();
    expect(await f.start()).toEqual(first);
    expect(f.deliveries).toHaveLength(2);
  });
  it('2분간격 추가3회뒤에도UNACK/UNRESOLVED·원래t0를유지한다', async () => {
    const f = fixture();
    await f.start();
    let last: Incident | null = null;
    for (let i = 0; i < 5; i++) {
      f.advance(120000);
      last = await f.service.remind('synthetic-incident', 'event-' + i);
    }
    expect(f.deliveries).toHaveLength(8);
    expect(last?.additionalNotices).toBe(3);
    expect(f.service.status(last!)).toMatchObject({
      unresolved: true,
      unacknowledged: true,
      manualParallelRequired: true,
      manualStartOverdue: true,
      remindersExhausted: true,
    });
    expect(last?.faultAt).toBe('2026-10-08T23:59:00Z');
  });
  it('사용자body actor/role는실제trustedOperator mapping을대체하지않는다', async () => {
    const f = fixture();
    const row = await f.start();
    await expect(
      f.service.acknowledge(row.incidentId, row.revision, {
        actor: 'synthetic-operator',
        role: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_OPERATOR_UNCONFIRMED' });
    expect((await f.store.read(row.incidentId))?.acknowledgedBy).toBeNull();
  });
  it('명시ACK는반복을멈추지만수동시작/복구완료를만들지않는다', async () => {
    const f = fixture();
    const row = await f.start();
    const ack = await f.service.acknowledge(
      row.incidentId,
      row.revision,
      'trusted-synthetic-operator',
    );
    f.advance(240000);
    expect(await f.service.remind(row.incidentId, 'new-event')).toEqual(ack);
    expect(ack.manualStartedAt).toBeNull();
    expect(ack.verifiedRecoveryAt).toBeNull();
  });
  it('metadata 불가는발송/ACK/횟수저장 성공을가장하지않는다', async () => {
    const f = fixture();
    f.unavailable();
    await expect(f.start()).rejects.toThrow('metadata 불가');
    expect(f.deliveries).toEqual([]);
  });
  it('명시다음시도도원래t0/긴급시계/횟수를초기화하지않는다', async () => {
    const f = fixture();
    const row = await f.start();
    f.advance(120000);
    const next = await f.service.nextAttempt(
      row.incidentId,
      row.revision,
      'next-attempt',
      'next-event',
    );
    expect(next.faultAt).toBe(row.faultAt);
    expect(next.firstUrgentAt).toBe(row.firstUrgentAt);
    expect(f.deliveries).toHaveLength(4);
    await expect(
      f.service.acknowledge(row.incidentId, row.revision, 'trusted-synthetic-operator'),
    ).rejects.toMatchObject({ code: 'INCIDENT_REVISION' });
  });
  it('운영합성store·unverified복구·업무상세/알수없는필드를허용하지않는다', async () => {
    const f = fixture();
    expect(
      () =>
        new OperationalIncidents(
          f.store,
          f.sender,
          () => new Date(),
          false,
          async () => null,
        ),
    ).toThrow();
    const row = await f.start();
    await expect(f.service.recordRecovery(row.incidentId, row.revision)).rejects.toMatchObject({
      code: 'OPERATION_RECOVERY_UNCONFIRMED',
    });
    expect(() => validateIncident({ ...row, customer: 'sensitive' })).toThrow();
  });
});
