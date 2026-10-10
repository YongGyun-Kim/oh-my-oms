import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, it, expect } from 'vitest';
import { firstStartEvidence } from '../../../scripts/u1/profile-observations.js';
const folders: string[] = [];
const from = '2026-10-09T00:00:00.000Z',
  to = '2026-10-09T00:30:00.000Z';
const ack = (id = 'original') => ({
  requestId: id,
  targetRef: { id: 'order-' + id },
  correlationId: id,
  observedAt: from,
});
const start = (id = 'original', delay = 100) => ({
  operation: 'NotificationDelivery.firstProcessing',
  outcome: 'SUCCESS',
  observedAt: from,
  correlationHash: createHash('sha256').update(id).digest('hex'),
  delayMilliseconds: delay,
});
function files(acks: unknown[], starts: unknown[]) {
  const folder = mkdtempSync(join(tmpdir(), 'oms-u1-start-proof-'));
  folders.push(folder);
  const paths = { acks: folder + '/acks.jsonl', starts: folder + '/starts.jsonl' };
  writeFileSync(paths.acks, acks.map((value) => JSON.stringify(value)).join('\n'));
  writeFileSync(paths.starts, starts.map((value) => JSON.stringify(value)).join('\n'));
  return paths;
}
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true });
});
describe('NORMAL 원래 신규 ACK에 결합한 보호 처리 시작 증거', () => {
  it('실제 신규 ACK correlation과 등록된 firstProcessing만 원래 ID로 보고한다', async () => {
    expect(await firstStartEvidence(from, to, files([ack()], [start()]))).toMatchObject({
      passed: true,
      samples: 1,
      p95Milliseconds: 100,
      originalSamples: [{ requestId: 'original' }],
    });
  });
  it('과거 준비/중단/held Work의 관측을 NORMAL 표본으로 섞지 않는다', async () => {
    const before = '2026-10-08T00:00:00.000Z';
    const value = await firstStartEvidence(
      from,
      to,
      files(
        [{ ...ack(), observedAt: before }, ack('new')],
        [{ ...start(), observedAt: before }, start('new')],
      ),
    );
    expect(value.samples).toBe(1);
  });
  it('빈 ACK와 일치하지 않는 correlation은 0건으로 실패한다', async () => {
    expect((await firstStartEvidence(from, to, files([], [start()]))).passed).toBe(false);
    expect((await firstStartEvidence(from, to, files([ack()], [start('other')]))).passed).toBe(
      false,
    );
  });
  it('consumer 완료/기술 실패/결과 불명은 first durable processing이 아니다', async () => {
    const values = [
      { ...start(), operation: 'NotificationDelivery.consume' },
      { ...start(), outcome: 'TECHNICAL_FAILURE' },
    ];
    expect((await firstStartEvidence(from, to, files([ack()], values))).passed).toBe(false);
  });
  it('p95 10초 경계를 넘는 실제 지연은 실패한다', async () => {
    expect(
      (await firstStartEvidence(from, to, files([ack()], [start('original', 10001)]))).passed,
    ).toBe(false);
    expect(
      (await firstStartEvidence(from, to, files([ack()], [start('original', 10000)]))).passed,
    ).toBe(true);
  });
  it('음수/NaN 지연을 정상 시작으로 강제 변환하지 않는다', async () => {
    for (const delay of [-1, 'invalid'])
      await expect(
        firstStartEvidence(from, to, files([ack()], [{ ...start(), delayMilliseconds: delay }])),
      ).rejects.toThrow('시간 근거');
  });
  it('전체 표본을 검사하되 원래 ID 샘플 출력은 64개로 제한한다', async () => {
    const acks = Array.from({ length: 70 }, (_, i) => ack(String(i)));
    const starts = Array.from({ length: 70 }, (_, i) => start(String(i), i));
    const result = await firstStartEvidence(from, to, files(acks, starts));
    expect(result.samples).toBe(70);
    expect(result.originalSamples).toHaveLength(64);
    expect(result.maximumMilliseconds).toBe(69);
  });
  it('손상 JSON/없는 자료는 성공 보고서를 만들지 않는다', async () => {
    const paths = files([ack()], [start()]);
    writeFileSync(paths.starts, '{');
    await expect(firstStartEvidence(from, to, paths)).rejects.toThrow();
    rmSync(paths.acks);
    await expect(firstStartEvidence(from, to, paths)).rejects.toThrow();
  });
});
