import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fingerprint } from '@oms/contracts';
const state = vi.hoisted(() => ({ files: new Map<string, string>(), output: null as unknown }));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  const path = await import('node:path');
  const fixtureKey = (requested: string): string | null => {
    const relative = path
      .relative(process.cwd(), path.resolve(requested))
      .split(path.sep)
      .join('/');
    return relative.startsWith('.reports/u1/') ? relative : null;
  };
  const fixture = (requested: string): string | null => {
    const key = fixtureKey(requested);
    if (key === null) return null;
    const value = state.files.get(key);
    if (value === undefined)
      throw Object.assign(new Error('mock report fixture not found'), {
        code: 'ENOENT',
        path: requested,
      });
    return value;
  };
  return {
    ...fs,
    readFileSync: (path: string) => {
      const value = fixture(path);
      if (value !== null) return value;
      return fs.readFileSync(path, 'utf8');
    },
    writeFileSync: (_path: string, value: string) => {
      state.output = JSON.parse(value);
    },
    statSync: (path: string) => {
      const value = fixture(path);
      return value === null ? fs.statSync(path) : { size: Buffer.byteLength(value) };
    },
  };
});
import { specFiles } from '../../../scripts/u1/runtime-security-report.js';
import { verifySkeleton } from '../../../scripts/u1/verify-skeleton.js';
import { runtimeSourceIdentity, runtimeSourceDigest } from '../../../scripts/u1/runtime-source.js';
import { evaluationProvenance } from '../../../scripts/u1/measurement-provenance.js';
import { evaluateWorkerRecovery } from '../../../scripts/u1/worker-recovery-evidence.js';
const set = (path: string, value: unknown) =>
  state.files.set('.reports/u1/' + path + '.json', JSON.stringify(value));
const report = (files: string[]) => ({
  success: true,
  numTotalTests: files.length,
  numPassedTests: files.length,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: files.map((name) => ({ name: '/workspace/' + name })),
});
beforeEach(() => {
  state.files.clear();
  state.output = null;
  const identity = runtimeSourceIdentity();
  const source = {
    runId: '단위-보고서-포트-실제실행아님',
    profileId: '합성-단위-포트',
    sourceIdentity: identity,
  };
  const ack = '보고서 포트 단위 표본';
  state.files.set('.reports/u1/performance-ack.jsonl', ack);
  const worker = {
    passed: true,
    runId: source.runId,
    profileId: source.profileId,
    sourceDigest: runtimeSourceDigest(identity),
    evaluationSourceIdentity: identity,
    evaluationProvenance: evaluationProvenance(identity, identity),
    ackSha256: createHash('sha256').update(ack).digest('hex'),
    phases: ['NORMAL', 'RECOVERY', 'HOLD'].map((phase) =>
      evaluateWorkerRecovery(
        { phase, from: '2026-10-08T10:00:00Z', to: '2026-10-08T10:01:00Z' },
        [
          {
            workId: '표본',
            requestId: '표본접수',
            correlationHash: 'a'.repeat(64),
            state: 'RESULT_RECORDED',
            acknowledged: true,
            notBefore: '2026-10-08T10:00:00Z',
            deadlineAt: '2026-10-08T10:05:00Z',
            start: { observedAt: '2026-10-08T10:00:01Z', delayMilliseconds: 1000 },
          },
        ],
        0,
      ),
    ),
  };
  set('worker-recovery-profile', worker);
  set('performance-source', source);
  for (const [name, folder] of [
    ['unit', 'unit'],
    ['integration', 'integration'],
    ['profile-probes', 'profile'],
  ])
    set(name!, report(specFiles('tests/u1/' + folder)));
  set('coverage/coverage-summary', { total: { lines: { pct: 80, total: 100, covered: 80 } } });
  set('performance', {
    finished: true,
    passed: true,
    runId: source.runId,
    sourceDigest: worker.sourceDigest,
    workerRecoveryVerified: true,
    workerRecoveryEvidenceDigest: fingerprint(worker),
    phases: [
      ['NORMAL', 20, 1800],
      ['PEAK', 100, 300],
      ['RECOVERY', 20, 300],
      ['HOLD', 20, 600],
    ].map(([phase, rate, seconds]) => ({
      phase,
      targetRate: rate,
      durationSeconds: seconds,
      requests: Number(rate) * Number(seconds),
      accuracyFailures: 0,
      passed: true,
    })),
  });
  set('e2e', { stats: { expected: 4, skipped: 0, unexpected: 0, flaky: 0 } });
  for (const path of [
    'check',
    'security',
    'runtime-security',
    'large-recovery',
    'deployment-compatibility',
    'accessibility',
  ])
    set(path, { passed: true });
  set('ack-preservation', { acknowledgements: 5647, missingOrChanged: 0 });
});
describe('Unit 완료 검증기의 전수 필수 보고서 fence(보고서 포트 단위)', () => {
  it('상대와 절대 경로는 같은 보고서 fixture를 읽는다', () => {
    const report = '.reports/u1/large-recovery.json';
    expect(readFileSync(report, 'utf8')).toBe(readFileSync(resolve(report), 'utf8'));
    expect(readFileSync(report, 'utf8')).toBe(state.files.get(report));
  });
  it('fixture의 stat은 실제 disk 크기가 아닌 fixture 크기다', () => {
    const report = '.reports/u1/large-recovery.json';
    expect(statSync(report).size).toBe(Buffer.byteLength(state.files.get(report)!));
    expect(statSync(resolve(report)).size).toBe(statSync(report).size);
  });
  it('보고서 fixture 누락 read는 두 경로 모두 ENOENT이며 disk fallback이 없다', () => {
    const report = '.reports/u1/large-recovery.json';
    state.files.delete(report);
    for (const path of [report, resolve(report)])
      expect(() => readFileSync(path)).toThrow(expect.objectContaining({ code: 'ENOENT' }));
  });
  it('보고서 fixture 누락 stat도 두 경로 모두 ENOENT다', () => {
    const report = '.reports/u1/large-recovery.json';
    state.files.delete(report);
    for (const path of [report, resolve(report)])
      expect(() => statSync(path)).toThrow(expect.objectContaining({ code: 'ENOENT' }));
  });
  it('보고서 namespace 밖 실제 source 읽기와 stat은 유지한다', () => {
    const source = 'packages/contracts/src/schema.ts';
    expect(readFileSync(source, 'utf8')).toContain('class SchemaValidator');
    expect(statSync(source).isFile()).toBe(true);
    expect(runtimeSourceIdentity()[source]).toMatch(/^[a-f0-9]{64}$/);
  });
  it('전체 각 증거가 있을 때에도 실제 활성화는 허용하지 않는다', () => {
    verifySkeleton();
    expect(state.output).toMatchObject({ passed: true, realActivationAllowed: false });
  });
  it('재평가 provenance 누락/변조는 정상 source guard를 우회하지 못한다', () => {
    const previous = state.files.get('.reports/u1/worker-recovery-profile.json')!;
    const performance = JSON.parse(state.files.get('.reports/u1/performance.json')!);
    for (const field of ['evaluationSourceIdentity', 'evaluationProvenance']) {
      const worker = JSON.parse(previous);
      delete worker[field];
      set('worker-recovery-profile', worker);
      set('performance', { ...performance, workerRecoveryEvidenceDigest: fingerprint(worker) });
      expect(() => verifySkeleton()).toThrow();
    }
  });
  it('필터 unit/integration/profile 보고서는 전체완료로 인정하지 않는다', () => {
    for (const path of ['unit', 'integration', 'profile-probes']) {
      const previous = state.files.get('.reports/u1/' + path + '.json')!;
      set(path, { ...JSON.parse(previous), testResults: [] });
      expect(() => verifySkeleton()).toThrow('선택 실행');
      state.files.set('.reports/u1/' + path + '.json', previous);
    }
  });
  it('80%미만 전체 분모를 빼고 통과시키지 않는다', () => {
    set('coverage/coverage-summary', {
      total: { lines: { pct: 79.9, total: 1000, covered: 799 } },
    });
    expect(() => verifySkeleton()).toThrow('80%');
  });
  it('미완료50분·짧은profile은 통과가 아니다', () => {
    set('performance', { finished: false, passed: true, phases: [] });
    expect(() => verifySkeleton()).toThrow('50분');
  });
  it('HTTP 성공뿐이고 worker회복이 실패한 보고서는 전체완료가 아니다', () => {
    set('worker-recovery-profile', { passed: false });
    expect(() => verifySkeleton()).toThrow();
    expect(state.output).toBeNull();
  });
  it('PC skip/flaky/unexpected를 다른 시험으로 대신하지 않는다', () => {
    for (const key of ['skipped', 'flaky', 'unexpected']) {
      set('e2e', { stats: { expected: 4, skipped: 0, flaky: 0, unexpected: 0, [key]: 1 } });
      expect(() => verifySkeleton()).toThrow('PC UI');
    }
  });
  it('각 최소 운영/복구/보안/AA 보고서의 literaltrue만 완료다', () => {
    for (const path of [
      'check',
      'security',
      'runtime-security',
      'large-recovery',
      'deployment-compatibility',
      'accessibility',
    ]) {
      for (const passed of [false, 'true', null]) {
        set(path, { passed });
        expect(() => verifySkeleton()).toThrow('필수 보고서');
      }
      set(path, { passed: true });
    }
  });
  it('독립 ACK0건/한 건의 보존 오류도 RPO0 통과가 아니다', () => {
    for (const value of [
      { acknowledgements: 0, missingOrChanged: 0 },
      { acknowledgements: 5647, missingOrChanged: 1 },
    ]) {
      set('ack-preservation', value);
      expect(() => verifySkeleton()).toThrow('ACK');
    }
  });
  it('필수 보고서가 실제로 없으면 새 성공 산출물을 만들지 않는다', () => {
    state.files.delete('.reports/u1/large-recovery.json');
    expect(() => verifySkeleton()).toThrow();
    expect(state.output).toBeNull();
  });
});
