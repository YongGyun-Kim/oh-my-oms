import { describe, expect, it, vi } from 'vitest';
import { OperationalConnection, OperationalIncidents } from '@oms/integrations';
import type {
  Incident,
  IncidentCause,
  IncidentStore,
  IndependentFaultSource,
  OperationalSender,
} from '@oms/integrations';
class Store implements IncidentStore {
  readonly kind = 'SYNTHETIC';
  value: Incident | null = null;
  async read() {
    return this.value ? structuredClone(this.value) : null;
  }
  async compareAndSet(value: Incident, revision: number | null) {
    if ((this.value?.revision ?? null) !== revision) throw new Error('CAS conflict');
    this.value = structuredClone(value);
  }
}
function setup(cause: IncidentCause = 'APPLICATION') {
  const store = new Store();
  let at = Date.parse('2026-10-09T00:00:01Z');
  const sender: OperationalSender = { send: vi.fn(async () => 'ACCEPTED' as const) };
  const incidents = new OperationalIncidents(
    store,
    sender,
    () => new Date(at),
    true,
    async () => null,
  );
  const source: IndependentFaultSource = {
    kind: 'SYNTHETIC',
    verifyAndObserve: vi.fn(async (context) => {
      if (context !== 'trusted-native-fixture') throw new Error('native authority unknown');
      return {
        incidentId: 'original-incident',
        attemptId: 'original-attempt',
        eventId: 'original-event',
        faultAt: '2026-10-09T00:00:00Z',
        cause,
      };
    }),
    verifyReminder: async (context) => context === 'trusted-scheduler-fixture',
  };
  return {
    store,
    sender,
    incidents,
    source,
    connection: new OperationalConnection(incidents, source, true),
    advance: (milliseconds: number) => {
      at += milliseconds;
    },
  };
}
describe('독립 관측→원래incident→두채널·명시ACK/복구구분', () => {
  it('API/worker/두DB·배포·관측장애별원래t0를RDS/앱호출없이독립기록한다', async () => {
    for (const cause of [
      'APPLICATION',
      'WORKER',
      'PRIMARY',
      'JOURNAL',
      'DEPLOYMENT',
      'OBSERVATION',
      'ACCURACY',
    ] as const) {
      const f = setup(cause),
        result = await f.connection.detect('trusted-native-fixture');
      expect(result).toMatchObject({
        state: 'INCIDENT_RECORDED',
        record: {
          cause,
          faultAt: '2026-10-09T00:00:00Z',
          acknowledgedBy: null,
          verifiedRecoveryAt: null,
        },
      });
      expect(f.sender.send).toHaveBeenCalledTimes(2);
    }
  });
  it('native중복사건은원래시계/횟수를초기화하거나다시두채널발송하지않는다', async () => {
    const f = setup();
    const first = await f.connection.detect('trusted-native-fixture');
    f.advance(60000);
    expect(await f.connection.detect('trusted-native-fixture')).toEqual(first);
    expect(f.sender.send).toHaveBeenCalledTimes(2);
  });
  it('미등록/합성운영source와client몸체는감지/발송권위를만들지않는다', async () => {
    const f = setup();
    await expect(
      new OperationalConnection(f.incidents, { ...f.source, kind: 'UNREGISTERED' }, false).detect({
        actor: 'claimed',
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_SOURCE_UNREGISTERED' });
    expect(() => new OperationalConnection(f.incidents, f.source, false)).toThrow();
    await expect(f.connection.detect({ actor: 'claimed' })).rejects.toThrow('authority');
    expect(f.sender.send).not.toHaveBeenCalled();
  });
  it('metadata고장은ACK/통지기록성공으로숨기지않고원래네이티브대조가필요하다', async () => {
    const f = setup();
    vi.spyOn(f.store, 'read').mockRejectedValue(new Error('independent metadata unavailable'));
    await expect(f.connection.detect('trusted-native-fixture')).rejects.toThrow('unavailable');
    expect(f.sender.send).not.toHaveBeenCalled();
  });
  it('Slack/이메일장애는채널별UNKNOWN이며다른수락이나읽음을담당자ACK로쓰지않는다', async () => {
    const f = setup();
    vi.mocked(f.sender.send).mockImplementation(async (channel) =>
      channel === 'SLACK' ? 'ACCEPTED' : 'UNKNOWN',
    );
    const result = await f.connection.detect('trusted-native-fixture');
    expect(result).toMatchObject({
      record: {
        channels: { SLACK: 'ACCEPTED', EMAIL: 'UNKNOWN' },
        acknowledgedBy: null,
        verifiedRecoveryAt: null,
      },
    });
  });
  it('원래scheduler확인없는reminder는거절하고2분추가3회후도미해결이다', async () => {
    const f = setup();
    await f.connection.detect('trusted-native-fixture');
    await expect(
      f.connection.reminder({ actor: 'claimed' }, 'original-incident', 'fake'),
    ).rejects.toMatchObject({ code: 'OPERATION_SCHEDULER_UNCONFIRMED' });
    for (let i = 0; i < 4; i++) {
      f.advance(120000);
      await f.connection.reminder(
        'trusted-scheduler-fixture',
        'original-incident',
        'original-reminder-' + i,
      );
    }
    expect(f.store.value).toMatchObject({
      additionalNotices: 3,
      acknowledgedBy: null,
      verifiedRecoveryAt: null,
    });
    expect(f.sender.send).toHaveBeenCalledTimes(8);
  });
  it('전체원래30초budget은source관측과두채널의같은signal이며취소뒤새예산발송이없다', async () => {
    const f = setup();
    let signal: AbortSignal | undefined;
    vi.mocked(f.source.verifyAndObserve).mockImplementation(async (_context, original) => {
      signal = original;
      return {
        incidentId: 'original-incident',
        attemptId: 'original-attempt',
        eventId: 'original-event',
        faultAt: '2026-10-09T00:00:00Z',
        cause: 'APPLICATION',
      };
    });
    vi.mocked(f.sender.send).mockImplementation(async (_channel, _message, current) => {
      expect(current).toBe(signal);
      return 'ACCEPTED';
    });
    await f.connection.detect('trusted-native-fixture');
    await expect(
      f.connection.detect('trusted-native-fixture', AbortSignal.abort()),
    ).rejects.toThrow();
    expect(f.sender.send).toHaveBeenCalledTimes(2);
  });
  it('source비정상추가필드/관측실패는정상경로·30일가용성으로승격하지않는다', async () => {
    const f = setup();
    vi.mocked(f.source.verifyAndObserve).mockResolvedValueOnce(null);
    expect(await f.connection.detect('trusted-native-fixture')).toEqual({
      state: 'OBSERVED_NO_FAULT',
      realAvailabilityProven: false,
    });
    vi.mocked(f.source.verifyAndObserve).mockResolvedValueOnce({
      incidentId: 'original',
      attemptId: 'original',
      eventId: 'original',
      faultAt: '2026-10-09T00:00:00Z',
      cause: 'PRIMARY',
      password: 'forbidden',
    } as never);
    await expect(f.connection.detect('trusted-native-fixture')).rejects.toMatchObject({
      code: 'OPERATION_FAULT_METADATA',
    });
    expect(f.sender.send).not.toHaveBeenCalled();
  });
});
