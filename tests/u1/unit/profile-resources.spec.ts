import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { resourceObservation } from '../../../scripts/u1/profile-observations.js';
let folder: string;
let mode: string;
const calls: { command: string; args: readonly string[] }[] = [];
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'oms-u1-resources-'));
  writeFileSync(
    folder + '/telemetry.json',
    JSON.stringify({ process: { rss: 100 }, sdk: { dropped: 0 } }),
  );
  mode = 'valid';
  calls.length = 0;
});
afterEach(() => rmSync(folder, { recursive: true }));
const source = () =>
  ({
    query: vi.fn(async (sql: string) =>
      sql.includes('GROUP BY')
        ? [{ state: 'REVIEW_REQUIRED', count: 100000 }]
        : [{ connections: 24, active: 1, lock_waits: 0 }],
    ),
  }) as unknown as DataSource;
const ports = () => ({
  telemetryPath: folder + '/telemetry.json',
  execute: async (command: string, args: readonly string[], _options: unknown) => {
    void _options;
    calls.push({ command, args });
    if (mode === 'command-fail') throw new Error('실제 도구 실패');
    let stdout = '';
    if (command === 'lsof') stdout = mode === 'invalid-pid' ? 'attacker' : '123\n';
    else if (command === 'ps') stdout = mode === 'invalid-metric' ? '123 NaN 0' : '123 1024 1.5';
    else if (args[0] === 'ps')
      stdout = [
        {
          ID: 'one',
          Labels: 'com.docker.compose.project=oms-u1,com.docker.compose.service=primary',
        },
        {
          ID: 'two',
          Labels: 'com.docker.compose.project=oms-u1,com.docker.compose.service=journal',
        },
      ]
        .slice(0, mode === 'one-pg' ? 1 : 2)
        .map((row) => JSON.stringify(row))
        .join('\n');
    else if (args[0] === 'stats')
      stdout =
        mode === 'invalid-json' ? '{' : JSON.stringify({ ID: 'one', MemUsage: '1MiB / 1GiB' });
    return { stdout, stderr: '' };
  },
});
describe('부하 자원/원래 backlog 관측·누락 실패(도구 포트 단위)', () => {
  it('실제 두 listener/PG pair만 측정하며 held 원본을 backlog에서 삭제하지 않는다', async () => {
    const result = await resourceObservation(source(), source(), ports() as never);
    expect(result.backlog).toEqual([{ state: 'REVIEW_REQUIRED', count: 100000 }]);
    expect(result.web[0]!.processes[0]!.rssBytes).toBe(1024 * 1024);
    expect(result.primary.connections).toBe(24);
  });
  it('명시 project/service의 PG ID만 stats에 전달한다', async () => {
    await resourceObservation(source(), source(), ports() as never);
    expect(calls.find((call) => call.args[0] === 'stats')?.args.slice(-2)).toEqual(['one', 'two']);
  });
  it('무효 listener PID는 ps 명령이나 성공 자원으로 변환하지 않는다', async () => {
    mode = 'invalid-pid';
    await expect(resourceObservation(source(), source(), ports() as never)).rejects.toThrow(
      '프로세스',
    );
    expect(calls.some((call) => call.command === 'ps')).toBe(false);
  });
  it('NaN 메모리/CPU를 정상 수치로 보고하지 않는다', async () => {
    mode = 'invalid-metric';
    await expect(resourceObservation(source(), source(), ports() as never)).rejects.toThrow(
      '자원 값',
    );
  });
  it('두 PG 중 하나라도 없으면 전체 저장 자원 통과가 아니다', async () => {
    mode = 'one-pg';
    await expect(resourceObservation(source(), source(), ports() as never)).rejects.toThrow(
      '두 PG',
    );
  });
  it('도구 종료 실패·손상 stats는 원본 업무 성공과 별도로 실패한다', async () => {
    mode = 'command-fail';
    await expect(resourceObservation(source(), source(), ports() as never)).rejects.toThrow('도구');
    mode = 'invalid-json';
    await expect(resourceObservation(source(), source(), ports() as never)).rejects.toThrow();
  });
  it('API/worker RSS 또는 SDK drop 근거 누락은 관측 성공이 아니다', async () => {
    writeFileSync(folder + '/telemetry.json', '{}');
    await expect(resourceObservation(source(), source(), ports() as never)).rejects.toThrow(
      '근거 누락',
    );
  });
  it('DB 관측 오류는 0개 연결/빈 backlog로 숨기지 않는다', async () => {
    const db = source();
    vi.mocked(db.query).mockRejectedValue(new Error('DB observation error'));
    await expect(resourceObservation(db, source(), ports() as never)).rejects.toThrow(
      'observation',
    );
  });
});
