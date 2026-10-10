import { beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  mode: 'clean',
  calls: [] as { command: string; args: string[] }[],
}));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    mkdirSync: vi.fn(),
    readFileSync: (path: string, ...args: unknown[]) =>
      state.files.has(String(path))
        ? state.files.get(String(path))
        : fs.readFileSync(path, ...(args as [BufferEncoding])),
    writeFileSync: (path: string, value: string) => {
      state.files.set(path, value);
    },
  };
});
vi.mock('../../../scripts/u1/cdk-bundle.js', () => ({
  verifyCdkBundle: vi.fn(() => {
    if (state.mode === 'physical') throw new Error('취약 bytes 남음');
  }),
}));
vi.mock('../../../scripts/u1/process.js', () => ({
  runCommand: vi.fn(async (command: string, args: string[], log: string) => {
    state.calls.push({ command, args });
    if (state.mode === 'tool-error') throw new Error('도구 종료 실패');
    if (command === 'npm' && args[0] === 'audit')
      state.files.set(
        log,
        JSON.stringify({ metadata: { vulnerabilities: { high: state.mode === 'audit' ? 1 : 0 } } }),
      );
    if (command.includes('semgrep'))
      state.files.set(
        '.reports/u1/sast.json',
        JSON.stringify({
          results: state.mode === 'sast' ? [{}] : [],
          errors: state.mode === 'sast-error' ? [{}] : [],
        }),
      );
    if (args.includes('secret'))
      state.files.set(
        '.reports/u1/secrets.json',
        JSON.stringify(
          state.mode === 'missing-report'
            ? {}
            : { Results: [{ Secrets: state.mode === 'secret' ? [{}] : [] }] },
        ),
      );
    if (command === 'npm' && args[0] === 'run')
      state.files.set(
        '.reports/u1/cdk.out/OmsU1Synthetic.template.json',
        JSON.stringify({ Resources: {} }),
      );
    if (args[0] === 'config')
      state.files.set(
        '.reports/u1/iac-security.json',
        JSON.stringify({
          Results: [
            {
              Misconfigurations:
                state.mode === 'iac'
                  ? [
                      {
                        ID: 'UNREGISTERED',
                        Severity: 'HIGH',
                        Status: 'FAIL',
                        CauseMetadata: { Resource: 'unknown' },
                      },
                    ]
                  : [],
            },
          ],
        }),
      );
    if (command === 'docker') state.files.set(log, 'sha256:' + 'a'.repeat(64) + '\n');
    if (args[0] === 'image')
      state.files.set(
        '.reports/u1/container-security.json',
        JSON.stringify({
          Results: [
            { Vulnerabilities: [{ Severity: state.mode === 'container' ? 'HIGH' : 'MEDIUM' }] },
          ],
        }),
      );
  }),
}));
import { securityUnit } from '../../../scripts/u1/security.js';
beforeEach(() => {
  state.files.clear();
  state.mode = 'clean';
  state.calls = [];
  state.files.set('docs/u1/security-exceptions.json', '[]');
  state.files.set('docs/u1/secret-exposures.json', '[]');
});
const summary = () => JSON.parse(state.files.get('.reports/u1/security.json')!);
describe('보안 실행기 fail closed 결과 집계(도구 단위 fixture, 실제 scan 대체 아님)', () => {
  it('실제 fixed image ID를 scanner에 전달하고 medium 원문을 숨기지 않는다', async () => {
    await securityUnit();
    expect(summary()).toMatchObject({ passed: true, realActivationAllowed: false });
    expect(
      state.calls
        .find((call) => call.command.includes('trivy') && call.args[0] === 'image')
        ?.args.at(-1),
    ).toBe('sha256:' + 'a'.repeat(64));
    expect(
      JSON.parse(state.files.get('.reports/u1/container-security.json')!).Results[0]
        .Vulnerabilities,
    ).toHaveLength(1);
  });
  it('physical bundle 거절 시 audit green도 실행 성공이 아니다', async () => {
    state.mode = 'physical';
    await expect(securityUnit()).rejects.toThrow('bytes');
    expect(state.calls).toHaveLength(0);
  });
  it('audit high 하나라도 검사 통과를 차단한다', async () => {
    state.mode = 'audit';
    await expect(securityUnit()).rejects.toThrow('취약점');
    expect(summary().passed).toBe(false);
  });
  it('SAST 발견과 실행 오류를 각각 실패로 남긴다', async () => {
    for (const mode of ['sast', 'sast-error']) {
      state.mode = mode;
      await expect(securityUnit()).rejects.toThrow('SAST');
      expect(summary().passed).toBe(false);
    }
  });
  it('secret 발견은 실제 노출 관측으로 기록하고 통과를 막는다', async () => {
    state.mode = 'secret';
    await expect(securityUnit()).rejects.toThrow('비밀');
    expect(
      JSON.parse(state.files.get('.reports/u1/security-policy.json')!).observedExposureInThisRun,
    ).toBe(true);
    expect(summary().passed).toBe(false);
  });
  it('결과 배열 누락은 빈 findings 성공으로 강제 변환하지 않는다', async () => {
    state.mode = 'missing-report';
    await expect(securityUnit()).rejects.toThrow('결과 배열');
    expect(summary().passed).toBe(false);
  });
  it('미등록 인프라 high와 container high는 예외 없이 실패한다', async () => {
    for (const mode of ['iac', 'container']) {
      state.mode = mode;
      await expect(securityUnit()).rejects.toThrow('high/critical');
      expect(summary().passed).toBe(false);
    }
  });
  it('도구 자체 실패와 변형 SAST 규칙은 검사 완료로 표시하지 않는다', async () => {
    state.mode = 'tool-error';
    await expect(securityUnit()).rejects.toThrow('종료 실패');
    expect(summary().passed).toBe(false);
    state.mode = 'clean';
    state.files.set('scripts/u1/security-rules/typescript.yaml', 'tampered');
    await expect(securityUnit()).rejects.toThrow('원문');
  });
});
