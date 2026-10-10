import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoIncidentStore } from '@oms/integrations';
import type { Incident } from '@oms/integrations';
const row = (): Incident => ({
  incidentId: 'synthetic-incident',
  attemptId: 'original-attempt',
  revision: 1,
  faultAt: '2026-10-09T00:00:00Z',
  firstUrgentAt: '2026-10-09T00:00:01Z',
  lastNoticeAt: '2026-10-09T00:00:01Z',
  additionalNotices: 0,
  acknowledgedBy: null,
  manualStartedAt: null,
  verifiedRecoveryAt: null,
  eventIds: ['original-event'],
  channels: { SLACK: 'UNCONFIRMED', EMAIL: 'UNKNOWN' },
  cause: 'APPLICATION',
});
function fixture(result: Record<string, unknown> = {}) {
  const send = vi.fn(async () => result);
  return {
    send,
    store: new DynamoIncidentStore('synthetic-metadata', { send } as unknown as DynamoDBClient),
  };
}
describe('독립Dynamo SDK 계약: 조건부개정/consistent읽기/닫힌최소metadata', () => {
  it('실제새incident은원래PK/STATE/개정1과부재조건으로만생성한다', async () => {
    const f = fixture();
    await f.store.compareAndSet(row(), null);
    expect((f.send.mock.calls[0] as unknown as [{ input: unknown }])[0].input).toMatchObject({
      ConditionExpression: 'attribute_not_exists(incidentId)',
      Item: {
        incidentId: { S: 'synthetic-incident' },
        recordId: { S: 'STATE' },
        revision: { N: '1' },
      },
    });
  });
  it('개정전이는정확한이전개정조건으로만쓴다', async () => {
    const f = fixture();
    await f.store.compareAndSet({ ...row(), revision: 2 }, 1);
    expect((f.send.mock.calls[0] as unknown as [{ input: unknown }])[0].input).toMatchObject({
      ConditionExpression: 'revision = :revision',
      ExpressionAttributeValues: { ':revision': { N: '1' } },
    });
  });
  it('metadata읽기는consistent하고같은원래ID/개정을대조한다', async () => {
    const data = row();
    const f = fixture({ Item: { metadata: { S: JSON.stringify(data) }, revision: { N: '1' } } });
    expect(await f.store.read(data.incidentId)).toEqual(data);
    expect((f.send.mock.calls[0] as unknown as [{ input: unknown }])[0].input).toMatchObject({
      ConsistentRead: true,
      Key: { incidentId: { S: data.incidentId }, recordId: { S: 'STATE' } },
    });
  });
  it('없음과접속실패를구별한다', async () => {
    expect(await fixture().store.read('absent')).toBeNull();
    const store = new DynamoIncidentStore('synthetic-metadata', {
      send: async () => {
        throw new Error('synthetic metadata outage');
      },
    } as unknown as DynamoDBClient);
    await expect(store.read('id')).rejects.toThrow('outage');
  });
  it('다른ID/개정·unknown업무필드·과대한행은조회로승인하지않는다', async () => {
    for (const data of [
      { ...row(), incidentId: 'other' },
      { ...row(), revision: 2 },
      { ...row(), password: 'sensitive' },
    ])
      await expect(
        fixture({
          Item: { metadata: { S: JSON.stringify(data) }, revision: { N: '1' } },
        }).store.read('synthetic-incident'),
      ).rejects.toThrow();
    await expect(
      fixture({ Item: { metadata: { S: 'x'.repeat(65537) } } }).store.read('id'),
    ).rejects.toThrow();
  });
  it('현재rev+1/명시boolean상태가아닌변경은발송이전에거절한다', async () => {
    const f = fixture();
    await expect(f.store.compareAndSet({ ...row(), revision: 3 }, 1)).rejects.toThrow();
    await expect(f.store.compareAndSet({ ...row(), additionalNotices: 4 }, null)).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
  });
  it('잘못된table/id는SDK에전달하지않는다', async () => {
    expect(() => new DynamoIncidentStore('')).toThrow();
    const f = fixture();
    await expect(f.store.read('')).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
  });
  it('조건부갱신실패를성공이나새개정으로숨기지않는다', async () => {
    const store = new DynamoIncidentStore('synthetic-metadata', {
      send: async () => {
        throw new Error('synthetic conditional failure');
      },
    } as unknown as DynamoDBClient);
    await expect(store.compareAndSet(row(), null)).rejects.toThrow('conditional');
  });
});
