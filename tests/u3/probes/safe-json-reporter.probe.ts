import { mkdirSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { OmsError } from '@oms/contracts';
import { QueryFailedError } from 'typeorm';

// 기본 suite에 포함하지 않는 DB 없는 제어된 실패다. 원문 sentinel은 private JSON에만 남긴다.
beforeAll(() => mkdirSync('.reports/u3/diagnostic-probe', { recursive: true, mode: 0o700 }));
it('실제 business 오류의 코드', (test) => {
  test.task.meta.u3BudgetPhases = [
    {
      phase: 'READ_100',
      milliseconds: 1,
      requestRemainingAtEntry: 9999,
      methods: {},
    },
  ];
  throw new OmsError(503, 'EXECUTION_DEADLINE', 'synthetic-private-diagnostic-message');
});
it('실제 driver 오류의 코드', () => {
  throw new QueryFailedError(
    'synthetic-private-query',
    ['synthetic-private-parameter'],
    Object.assign(new Error('synthetic-private-driver-message'), { code: '55P03' }),
  );
});
it('matcher의 actual 문자열을 실제 코드로 추측하지 않음', async () => {
  await expect(
    Promise.reject(new OmsError(409, 'STALE_U3_REFERENCE', 'synthetic-private-matcher')),
  ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
});
it('예상한 rejection은 정상 통과이며 실패 진단에 넣지 않음', async (test) => {
  test.task.meta.u3SafeFailure = { forged: 'synthetic-private-passed-meta' };
  await expect(
    Promise.reject(new OmsError(403, 'ACTION_DENIED', 'synthetic-private-expected')),
  ).rejects.toMatchObject({ code: 'ACTION_DENIED' });
});
