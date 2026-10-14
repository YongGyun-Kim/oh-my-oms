import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCommand } from '../../../scripts/u1/process.js';
const directory = mkdtempSync(join(tmpdir(), 'oms-u1-process-'));
const log = (name: string) => join(directory, name + '.log');
afterAll(() => rmSync(directory, { recursive: true, force: true }));
describe('shell 없는 유한 필수 검사 실행과 실패 기록', () => {
  it('실제 성공도 stdout/stderr가 모두 끝난 보고서를 남긴다', async () => {
    await runCommand(
      process.execPath,
      ['-e', "console.log('one');console.error('two')"],
      log('success'),
    );
    expect(readFileSync(log('success'), 'utf8')).toContain('one');
    expect(readFileSync(log('success'), 'utf8')).toContain('two');
  });
  it('0 아닌 exit를 green으로 만들지 않는다', async () =>
    expect(
      runCommand(process.execPath, ['-e', 'process.exit(42)'], log('failure')),
    ).rejects.toThrow('exit=42'));
  it('없는 검사 도구는 skip 성공이 아니라 실패다', async () =>
    expect(runCommand(join(directory, 'missing-tool'), [], log('missing'))).rejects.toThrow());
  it('기한 뒤 프로세스를 종료하고 실패한다', async () =>
    expect(
      runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], log('timeout'), 20),
    ).rejects.toThrow('기한'));
  it('인수의 셸 치환 문자열을 실제 코드로 실행하지 않는다', async () => {
    await runCommand(
      process.execPath,
      ['-e', 'console.log(process.argv[1])', '$(echo unexpected)'],
      log('literal'),
    );
    expect(readFileSync(log('literal'), 'utf8')).toContain('$(echo unexpected)');
  });
  it('무한/음수/비정수 기한은 시작 전에 거절한다', () => {
    for (const milliseconds of [0, -1, 1.5, Infinity, 3600001])
      expect(() => runCommand(process.execPath, [], log('invalid'), milliseconds)).toThrow();
  });
});
