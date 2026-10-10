import { describe, expect, it } from 'vitest';
import type { Work } from '@oms/contracts';
import { SyntheticQueue } from '../fixtures/queue.js';
const work = { workId: '원래작업', requestId: '원래접수', correlationId: '원래상관' } as Work;
describe('명시 합성 큐의30초visibility·5회수신·미ACK원본', () => {
  it('수신한 미ACK 메시지는30초 동안 다른 수신에서 보이지 않는다', async () => {
    let time = 0;
    const queue = new SyntheticQueue(() => time);
    await queue.publish('consumer', work);
    expect(await queue.receive('consumer')).toHaveLength(1);
    expect(await queue.receive('consumer')).toHaveLength(0);
    time = 29999;
    expect(await queue.receive('consumer')).toHaveLength(0);
    time = 30000;
    expect(await queue.receive('consumer')).toHaveLength(1);
  });
  it('앞의 진행 불명 메시지가 다음 visible 원래 작업을 막지 않는다', async () => {
    const queue = new SyntheticQueue(() => 0);
    await queue.publish('consumer', work);
    await queue.receive('consumer');
    await queue.publish('consumer', { ...work, workId: '다음원래작업' });
    const next = await queue.receive('consumer');
    expect(next).toHaveLength(1);
    expect((next[0]!.body as Work).workId).toBe('다음원래작업');
  });
  it('5회 미ACK 수신 후 별도DLQ로 보존하며 완료나ACK로 바꾸지 않는다', async () => {
    let time = 0;
    const queue = new SyntheticQueue(() => time);
    await queue.publish('consumer', work);
    for (let i = 0; i < 5; i++) {
      expect(await queue.receive('consumer')).toHaveLength(1);
      time += 30000;
    }
    expect(await queue.receive('consumer')).toHaveLength(0);
    expect(await queue.receive('consumer')).toHaveLength(0);
    expect(queue.deadLetters).toHaveLength(1);
    expect(queue.acknowledgements).toHaveLength(0);
    expect(queue.deadLetters[0]!.body).toEqual(work);
    expect(queue.snapshot()).toMatchObject({
      deadLetterCopies: 1,
      acknowledgedCopies: 0,
      visibleCopies: 0,
      actualSqsVerified: false,
    });
  });
  it('각 재수신 handle은 달라도원래Work/request/correlation은 유지한다', async () => {
    let time = 0;
    const queue = new SyntheticQueue(() => time);
    await queue.publish('consumer', work);
    const first = (await queue.receive('consumer'))[0]!;
    time = 30000;
    const second = (await queue.receive('consumer'))[0]!;
    expect(second.id).toBe(first.id);
    expect(second.receiptHandle).not.toBe(first.receiptHandle);
    expect(second.body).toEqual(first.body);
    await expect(queue.acknowledge(first)).rejects.toThrow();
    expect(queue.acknowledgements).toHaveLength(0);
    await queue.acknowledge(second);
    expect(await queue.receive('consumer')).toHaveLength(0);
  });
  it('소비자 불일치는 전달하지 않는다', async () => {
    const queue = new SyntheticQueue();
    await queue.publish('other', work);
    expect(await queue.receive('consumer')).toHaveLength(0);
  });
  it('종료된 수신은visibility세대를 변경하지 않는다', async () => {
    const queue = new SyntheticQueue();
    await queue.publish('consumer', work);
    const stop = new AbortController();
    stop.abort();
    await expect(queue.receive('consumer', stop.signal)).rejects.toThrow();
    expect(await queue.receive('consumer')).toHaveLength(1);
  });
  it('존재하지 않는 handle을 성공ACK로 관측하지 않는다', async () => {
    const queue = new SyntheticQueue();
    await expect(
      queue.acknowledge({
        id: 'unknown',
        receiptHandle: 'unknown',
        consumer: 'consumer',
        body: work,
      }),
    ).rejects.toThrow();
    expect(queue.acknowledgements).toHaveLength(0);
  });
});
