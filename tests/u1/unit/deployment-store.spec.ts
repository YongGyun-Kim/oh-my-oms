import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDeploymentStore } from '@oms/integrations';
import type { DeploymentAttempt } from '@oms/integrations';
const row = (): DeploymentAttempt => ({
  incidentId: 'incident:원본',
  attemptId: 'attempt:원본',
  revision: 1,
  evidenceFingerprint: 'a'.repeat(64),
  targetImage: 'sha256:' + 'b'.repeat(64),
  state: 'CLAIMED',
});
function fixture(result: Record<string, unknown> = {}) {
  const send = vi.fn(async () => result);
  return {
    send,
    store: new DynamoDeploymentStore('synthetic-metadata', { send } as unknown as DynamoDBClient),
  };
}
describe('독립배포Dynamo의닫힌최소metadata·원래claim CAS', () => {
  it('원래시도별분리된PK/recordId를부재조건으로생성한다', async () => {
    const f = fixture();
    await f.store.compareAndSet(row(), null);
    expect((f.send.mock.calls[0] as unknown as [{ input: unknown }])[0].input).toMatchObject({
      ConditionExpression: 'attribute_not_exists(incidentId)',
      Item: {
        incidentId: { S: 'incident:원본' },
        recordId: { S: 'DEPLOYMENT#attempt:원본' },
        revision: { N: '1' },
      },
    });
  });
  it('현재개정조건과rev+1만갱신한다', async () => {
    const f = fixture();
    await f.store.compareAndSet({ ...row(), revision: 2, state: 'UNKNOWN' }, 1);
    expect((f.send.mock.calls[0] as unknown as [{ input: unknown }])[0].input).toMatchObject({
      ConditionExpression: 'revision = :revision',
      ExpressionAttributeValues: { ':revision': { N: '1' } },
    });
    await expect(f.store.compareAndSet({ ...row(), revision: 3 }, 1)).rejects.toThrow();
  });
  it('consistent읽기로같은원래시도/개정의최소상태를대조한다', async () => {
    const data = row();
    const f = fixture({ Item: { metadata: { S: JSON.stringify(data) }, revision: { N: '1' } } });
    expect(await f.store.read(data.incidentId, data.attemptId)).toEqual(data);
    expect((f.send.mock.calls[0] as unknown as [{ input: unknown }])[0].input).toMatchObject({
      ConsistentRead: true,
    });
  });
  it('부재와접속불명을구분하고후자를새실행으로만들지않는다', async () => {
    expect(await fixture().store.read('absent', 'original')).toBeNull();
    const store = new DynamoDeploymentStore('synthetic-metadata', {
      send: async () => {
        throw new Error('synthetic unknown');
      },
    } as unknown as DynamoDBClient);
    await expect(store.read('id', 'attempt')).rejects.toThrow('unknown');
  });
  it('타시도/다른개정/미등록업무필드는조회에서거절한다', async () => {
    for (const data of [
      { ...row(), attemptId: 'other' },
      { ...row(), revision: 2 },
      { ...row(), password: 'forbidden' },
    ])
      await expect(
        fixture({
          Item: { metadata: { S: JSON.stringify(data) }, revision: { N: '1' } },
        }).store.read(row().incidentId, row().attemptId),
      ).rejects.toThrow();
  });
  it('과대자료/잘못된JSON/null은유한읽기에서거절한다', async () => {
    for (const text of ['x'.repeat(4097), '{', 'null'])
      await expect(
        fixture({ Item: { metadata: { S: text }, revision: { N: '1' } } }).store.read(
          'id',
          'attempt',
        ),
      ).rejects.toThrow();
  });
  it('latesttag/불법상태·순번과빈ID는SDK전에거절한다', async () => {
    const f = fixture();
    for (const value of [
      { ...row(), targetImage: 'latest' },
      { ...row(), state: 'COMPLETED' },
      { ...row(), revision: 0 },
      { ...row(), incidentId: '' },
    ])
      await expect(f.store.compareAndSet(value as DeploymentAttempt, null)).rejects.toThrow();
    await expect(f.store.read('id', '')).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
    expect(() => new DynamoDeploymentStore('')).toThrow();
  });
  it('조건부쓰기실패는수락/복구상태로숨기지않는다', async () => {
    const store = new DynamoDeploymentStore('synthetic-metadata', {
      send: async () => {
        throw new Error('synthetic CAS');
      },
    } as unknown as DynamoDBClient);
    await expect(store.compareAndSet(row(), null)).rejects.toThrow('CAS');
  });
});
