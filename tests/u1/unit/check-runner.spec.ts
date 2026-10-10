import { beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  completed: [] as string[],
  fail: '',
  report: null as null | { passed: boolean; completed: string[] },
}));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  writeFileSync: (_path: string, value: string) => {
    state.report = JSON.parse(value);
  },
}));
vi.mock('../../../scripts/u1/process.js', () => ({
  runCommand: async (_cmd: string, args: string[], _path: string) => {
    void _path;
    if (args[0] === state.fail) throw new Error(args[0] + ' actual failure');
    state.completed.push(args[0]!);
  },
}));
import { checkUnit } from '../../../scripts/u1/check.js';
beforeEach(() => {
  state.completed = [];
  state.fail = '';
  state.report = null;
});
describe('전체 타입/lint/format 실행 순서와 실패 기록', () => {
  it('세 실제 검사 도구가 모두 종료돼야 통과다', async () => {
    await checkUnit();
    expect(state.completed).toEqual(['tsc', 'eslint', 'prettier']);
    expect(state.report).toMatchObject({ passed: true, completed: ['type', 'lint', 'format'] });
  });
  it('type 실패는 나머지 검사와 완료를 표시하지 않는다', async () => {
    state.fail = 'tsc';
    await expect(checkUnit()).rejects.toThrow('failure');
    expect(state.report).toMatchObject({ passed: false, completed: [] });
  });
  it('lint 실패는 type 완료만 보존한다', async () => {
    state.fail = 'eslint';
    await expect(checkUnit()).rejects.toThrow('failure');
    expect(state.report).toMatchObject({ passed: false, completed: ['type'] });
  });
  it('format 실패도 전체 green이 아니다', async () => {
    state.fail = 'prettier';
    await expect(checkUnit()).rejects.toThrow('failure');
    expect(state.report).toMatchObject({ passed: false, completed: ['type', 'lint'] });
  });
  it('고정 Node 이외 런타임은 제품 검사를 시작하지 않는다', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'version')!;
    Object.defineProperty(process, 'version', { value: 'v22.23.1' });
    try {
      await expect(checkUnit()).rejects.toThrow('22.23.3');
      expect(state.completed).toEqual([]);
    } finally {
      Object.defineProperty(process, 'version', descriptor);
    }
  });
});
