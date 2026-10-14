import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fingerprint } from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';
import {
  collectWorkerRecovery,
  evaluateWorkerRecovery,
  validateWorkerRecoveryEvidence,
} from '../../../scripts/u1/worker-recovery-evidence.js';
import type { WorkRecoveryRow } from '../../../scripts/u1/worker-recovery-evidence.js';
import { runtimeSourceDigest } from '../../../scripts/u1/runtime-source.js';
const phase = { phase: 'RECOVERY', from: '2026-10-08T10:00:00Z', to: '2026-10-08T10:01:00Z' };
const row: WorkRecoveryRow = {
  workId: '원래작업',
  requestId: '원래접수',
  correlationHash: 'a'.repeat(64),
  state: 'RESULT_RECORDED',
  acknowledged: true,
  notBefore: phase.from,
  deadlineAt: '2026-10-08T10:05:00Z',
  start: { observedAt: '2026-10-08T10:00:01Z', delayMilliseconds: 1000 },
};
const folders: string[] = [];
afterEach(() => {
  for (const path of folders.splice(0)) rmSync(path, { recursive: true });
});
describe('새 eligible Work의 회복 metadata 포트 검증(실제 부하 성공 자료 아님)', () => {
  it('원래ID와기한·종료 및 first-start를 가진 새 Work만 계산한다', () => {
    const result = evaluateWorkerRecovery(phase, [row], 0);
    expect(result.passed).toBe(true);
    expect(result.eligibleWork).toBe(1);
    expect(result.startedWork).toBe(1);
    expect(result.p95Milliseconds).toBe(1000);
  });
  it('표본0건과 missing 원본은 타이밍 통과가 아니다', () => {
    expect(evaluateWorkerRecovery(phase, [], 0).passed).toBe(false);
    expect(evaluateWorkerRecovery(phase, [row], 1).passed).toBe(false);
  });
  it('PENDING·PROCESSING·REVIEW_REQUIRED는 완료된 내부효과가 아니다', () => {
    for (const state of ['PENDING', 'PROCESSING', 'REVIEW_REQUIRED'])
      expect(evaluateWorkerRecovery(phase, [{ ...row, state }], 0).passed).toBe(false);
  });
  it('정상 first-start 일부로 뒤의 미시작 Work를 숨기지 않는다', () => {
    const result = evaluateWorkerRecovery(
      phase,
      [row, { ...row, workId: '다음원래작업', start: null }],
      0,
    );
    expect(result.passed).toBe(false);
    expect(result.stalledWork).toBe(1);
  });
  it('p95 10초 초과·잘못된 수치·기한 뒤 처리는 통과가 아니다', () => {
    for (const delayMilliseconds of [-1, 10001])
      expect(
        evaluateWorkerRecovery(phase, [{ ...row, start: { ...row.start!, delayMilliseconds } }], 0)
          .passed,
      ).toBe(false);
    expect(evaluateWorkerRecovery(phase, [{ ...row, acknowledged: false }], 0).passed).toBe(false);
    expect(() =>
      evaluateWorkerRecovery(
        phase,
        [{ ...row, start: { ...row.start!, delayMilliseconds: NaN } }],
        0,
      ),
    ).toThrow('JSON');
    expect(
      evaluateWorkerRecovery(
        phase,
        [{ ...row, start: { ...row.start!, observedAt: row.deadlineAt } }],
        0,
      ).passed,
    ).toBe(false);
  });
  it('회복 초기에 지연되어도5분 안 정상창 종료로 확인하며 전체 분포를 보존한다', () => {
    const recovery = { phase: 'RECOVERY', from: phase.from, to: '2026-10-08T10:05:00Z' };
    const rows = [60000, 20000, 1000, 1000, 1000].map((delay, index) => {
      const due = new Date(Date.parse(phase.from) + index * 60000).toISOString();
      return {
        ...row,
        workId: '원래' + index,
        notBefore: due,
        deadlineAt: '2026-10-08T10:10:00Z',
        start: {
          observedAt: new Date(Date.parse(due) + delay).toISOString(),
          delayMilliseconds: delay,
        },
      };
    });
    const result = evaluateWorkerRecovery(recovery, rows, 0);
    expect(result.passed).toBe(true);
    expect(result.p95Milliseconds).toBe(60000);
    expect(result.recoveryConfirmedBy).toBe('2026-10-08T10:03:00.000Z');
    expect(result.recoveryWindows).toHaveLength(5);
    expect(result.recoveryWindows.map((value) => value.eligibleWork)).toEqual([1, 1, 1, 1, 1]);
    expect(evaluateWorkerRecovery({ ...recovery, phase: 'HOLD' }, rows, 0).passed).toBe(false);
    expect(
      evaluateWorkerRecovery(
        recovery,
        rows.map((value, index) => (index === 4 ? { ...value, start: null } : value)),
        0,
      ).passed,
    ).toBe(false);
  });
  it('뒤 창의 재정체와 빈 마지막 창·5분 뒤 회복은 통과로 숨기지 않는다', () => {
    const recovery = { phase: 'RECOVERY', from: phase.from, to: '2026-10-08T10:05:00Z' };
    const rows = Array.from({ length: 5 }, (_, index) => {
      const due = new Date(Date.parse(phase.from) + index * 60000).toISOString();
      return {
        ...row,
        workId: '원래' + index,
        notBefore: due,
        deadlineAt: '2026-10-08T10:10:00Z',
        start: {
          observedAt: new Date(Date.parse(due) + 1000).toISOString(),
          delayMilliseconds: index === 4 ? 10001 : 1000,
        },
      };
    });
    expect(evaluateWorkerRecovery(recovery, rows, 0).passed).toBe(false);
    expect(evaluateWorkerRecovery(recovery, rows.slice(0, 4), 0).passed).toBe(false);
    const late = { ...recovery, to: '2026-10-08T10:06:00Z' };
    const lateDue = '2026-10-08T10:05:00Z';
    expect(
      evaluateWorkerRecovery(
        late,
        [
          ...rows,
          {
            ...row,
            notBefore: lateDue,
            deadlineAt: '2026-10-08T10:10:00Z',
            start: { observedAt: '2026-10-08T10:05:01Z', delayMilliseconds: 1000 },
          },
        ],
        0,
      ).passed,
    ).toBe(false);
  });
  it('아직due가아닌자료를 현재 phase 첫 시작으로 세지 않는다', () => {
    expect(
      evaluateWorkerRecovery(phase, [{ ...row, notBefore: '2026-10-08T10:02:00Z' }], 0)
        .eligibleWork,
    ).toBe(0);
  });
  it('3개phase의원래주문만닫힌포트로대조하며staff상품과과거관측을제외한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oms-work-proof-'));
    folders.push(dir);
    const paths = {
      acks: join(dir, 'acks.jsonl'),
      starts: join(dir, 'starts.jsonl'),
      report: join(dir, 'report.json'),
      consumes: join(dir, 'consumes.jsonl'),
    };
    const phases = ['NORMAL', 'RECOVERY', 'HOLD'].map((name, index) => ({
      phase: name,
      from: `2026-10-08T10:${index}0:00Z`,
      to: `2026-10-08T10:${index}1:00Z`,
    }));
    const acks = phases.map((value, index) => ({
      owner: 'OrderAcceptance',
      requestId: '접수' + index,
      correlationId: '상관' + index,
      observedAt: value.from,
    }));
    writeFileSync(
      paths.acks,
      [
        ...acks,
        {
          owner: 'ProductCatalog',
          requestId: '상품접수',
          correlationId: '상품상관',
          observedAt: phase.from,
        },
      ]
        .map((value) => JSON.stringify(value))
        .join('\n') + '\n',
    );
    writeFileSync(
      paths.starts,
      acks
        .map((ack) =>
          JSON.stringify({
            operation: 'NotificationDelivery.firstProcessing',
            outcome: 'SUCCESS',
            correlationHash: createHash('sha256').update(ack.correlationId).digest('hex'),
            observedAt: ack.observedAt,
            delayMilliseconds: 1,
          }),
        )
        .join('\n') + '\n',
    );
    writeFileSync(
      paths.consumes,
      acks
        .map((ack) =>
          JSON.stringify({
            operation: 'NotificationDelivery.consume',
            outcome: 'SUCCESS',
            correlationHash: createHash('sha256').update(ack.correlationId).digest('hex'),
          }),
        )
        .join('\n') + '\n',
    );
    const store = {
      list: async (_model: string, query: { equals: { requestId: string } }) => {
        const index = acks.findIndex((ack) => ack.requestId === query.equals.requestId);
        return [
          {
            owner: 'NotificationDelivery',
            workId: '작업' + index,
            requestId: acks[index]!.requestId,
            correlationId: acks[index]!.correlationId,
            state: 'RESULT_RECORDED',
            notBefore: phases[index]!.from,
            deadlineAt: '2026-10-08T11:00:00Z',
          },
        ];
      },
      primary: { query: async () => [] },
    } as unknown as ProtectedStore;
    const source = {
      runId: '단위포트',
      profileId: '합성단위',
      sourceIdentity: { 'apps/api/fixture.ts': 'a'.repeat(64) },
    };
    const report = await collectWorkerRecovery(store, phases, source, paths);
    expect(report.passed).toBe(true);
    expect(report.phases.map((value) => value.eligibleWork)).toEqual([1, 1, 1]);
    expect(JSON.parse(readFileSync(paths.report, 'utf8')).actualSqsRecoveryVerified).toBe(false);
    const performance = {
      runId: source.runId,
      sourceDigest: runtimeSourceDigest(source.sourceIdentity),
      workerRecoveryVerified: true,
      workerRecoveryEvidenceDigest: fingerprint(report),
    };
    expect(() =>
      validateWorkerRecoveryEvidence(
        report,
        source,
        performance,
        source.sourceIdentity,
        report.ackSha256,
      ),
    ).not.toThrow();
    for (const mutate of [
      () => ({ ...report, passed: false }),
      () => ({ ...report, runId: '과거실행' }),
      () => ({ ...report, sourceDigest: 'b'.repeat(64) }),
      () => ({ ...report, phases: report.phases.slice(0, 2) }),
      () => ({
        ...report,
        phases: report.phases.map((value, index) =>
          index === 1 ? { ...value, stalledWork: 1 } : value,
        ),
      }),
    ])
      expect(() =>
        validateWorkerRecoveryEvidence(
          mutate(),
          source,
          performance,
          source.sourceIdentity,
          report.ackSha256,
        ),
      ).toThrow();
    expect(() =>
      validateWorkerRecoveryEvidence(
        report,
        source,
        performance,
        source.sourceIdentity,
        '다른ACK해시',
      ),
    ).toThrow();
    expect(() =>
      validateWorkerRecoveryEvidence(
        report,
        source,
        { ...performance, workerRecoveryVerified: 'true' } as never,
        source.sourceIdentity,
        report.ackSha256,
      ),
    ).toThrow();
  });
  it('잘못된주문관계·없는Work를현재원본으로부풀리지않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oms-work-missing-'));
    folders.push(dir);
    const paths = {
      acks: join(dir, 'acks'),
      starts: join(dir, 'starts'),
      report: join(dir, 'report'),
      consumes: join(dir, 'consumes'),
    };
    writeFileSync(
      paths.acks,
      JSON.stringify({
        owner: 'OrderAcceptance',
        requestId: '원래접수',
        correlationId: '원래상관',
        observedAt: phase.from,
      }) + '\n',
    );
    writeFileSync(paths.starts, '');
    writeFileSync(paths.consumes, '');
    const source = { runId: '단위포트', profileId: '합성단위', sourceIdentity: {} };
    for (const values of [
      [],
      [{ requestId: '다른접수', correlationId: '원래상관', owner: 'NotificationDelivery' }],
    ]) {
      const report = await collectWorkerRecovery(
        {
          list: async () => values,
          primary: { query: async () => [] },
        } as unknown as ProtectedStore,
        [phase],
        source,
        paths,
      );
      expect(report.passed).toBe(false);
      expect(report.phases[0]!.missingWork).toBe(1);
    }
  });
});
