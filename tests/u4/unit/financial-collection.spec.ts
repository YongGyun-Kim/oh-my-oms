import { describe, expect, it, vi } from 'vitest';
import { ProtectedTransaction, U4Transaction } from '@oms/persistence';
import type { ModelData, RecoveryRow } from '@oms/persistence';
import { u4ModelFixture } from '../fixtures/models.js';

function fixture(count = 1) {
  const row = (index: number): ModelData => ({
    ...u4ModelFixture('PaymentAllocation'),
    allocationId: 'allocation-' + String(index).padStart(4, '0'),
  });
  const protectedRows = new Map(
    Array.from({ length: count }, (_, index) => {
      const data = row(index);
      return [String(data.allocationId), data] as const;
    }),
  );
  const rawRows = new Map([...protectedRows].map(([id, data]) => [id, structuredClone(data)]));
  const own: RecoveryRow[] = [];
  const matches = (data: ModelData, equals: Record<string, unknown>) =>
    Object.entries(equals).every(([key, value]) => data[key] === value);
  const page = (
    rows: Map<string, ModelData>,
    query: { cursor?: string | null; equals?: Record<string, unknown> },
  ) =>
    [...rows.values()]
      .filter(
        (data) =>
          (!query.cursor || String(data.allocationId) > query.cursor) &&
          matches(data, query.equals ?? {}),
      )
      .sort((a, b) => String(a.allocationId).localeCompare(String(b.allocationId)))
      .slice(0, 100);
  const transaction = {
    get: vi.fn(async (_model: string, id: string) => rawRows.get(id) ?? null),
    financialProtectedImage: vi.fn(
      async (_model: string, id: string) => protectedRows.get(id) ?? null,
    ),
    financialProtectedPage: vi.fn(
      async (_model: string, query: { cursor: string | null; equals: Record<string, unknown> }) =>
        page(protectedRows, query),
    ),
    financialCurrentPage: vi.fn(
      async (_model: string, equals: Record<string, unknown>, cursor: string | null) =>
        page(rawRows, { equals, cursor }),
    ),
    rows: () => own,
  };
  const scope = new U4Transaction(transaction as unknown as ProtectedTransaction, {
    epoch: 'initial',
    prefixes: [{ epoch: 'initial', commitOrder: 1 }],
  });
  const write = (data: ModelData) => {
    rawRows.set(String(data.allocationId), data);
    own.push({
      model: 'PaymentAllocation',
      schemaVersion: 1,
      id: String(data.allocationId),
      revision: Number(data.revision),
      data,
      deleted: false,
    });
  };
  const read = (equals: Record<string, unknown> = {}) =>
    scope.financialCollection(
      'PaymentAllocation',
      equals,
      new Date(Date.now() + 10000).toISOString(),
    );
  return { row, rawRows, protectedRows, transaction, scope, own, write, read };
}

describe('금융 전체 원본의 보호 prefix·현재 primary·자체 변경 대조', () => {
  it('101번째 원본까지 안정 cursor로 읽으며 첫100개를 전체 합계로 삼지 않는다', async () => {
    const f = fixture(101);
    expect(await f.read()).toHaveLength(101);
    expect(f.transaction.financialCurrentPage.mock.calls.map((args) => args[2])).toEqual([
      null,
      'allocation-0099',
    ]);
    expect(f.transaction.financialProtectedPage).toHaveBeenCalledTimes(2);
  });
  it('primary-only 추가는 보호 집합에 없으므로 HOLD한다', async () => {
    const f = fixture();
    f.rawRows.set('allocation-0001', f.row(1));
    await expect(f.read()).rejects.toMatchObject({ code: 'CURRENT_U4_NOT_PROTECTED' });
  });
  it('primary-only 삭제도 집합 비교에서 HOLD하며 남은 첫행만 합산하지 않는다', async () => {
    const f = fixture(2);
    f.rawRows.delete('allocation-0001');
    await expect(f.read()).rejects.toMatchObject({ code: 'CURRENT_U4_NOT_PROTECTED' });
  });
  it('같은 ID의 미보호 금액·조건 변경은 완전한 원상 비교에서 HOLD한다', async () => {
    const f = fixture();
    f.rawRows.get('allocation-0000')!.amount = { currency: 'KRW', value: '2' };
    await expect(f.read()).rejects.toMatchObject({ code: 'CURRENT_U4_NOT_PROTECTED' });
    const g = fixture();
    g.rawRows.get('allocation-0000')!.effect = 'REVERSED';
    await expect(g.read({ effect: 'APPLIED' })).rejects.toMatchObject({
      code: 'CURRENT_U4_NOT_PROTECTED',
    });
  });
  it('같은 트랜잭션의 정상 새 after-image는 보호 before-image와 합쳐 읽는다', async () => {
    const f = fixture();
    f.write(f.row(1));
    expect(await f.read()).toHaveLength(2);
    await f.scope.assertPremises();
  });
  it('정상 자체 변경이 조회 조건에서 빠지면 옛 보호 before-image를 집계하지 않는다', async () => {
    const f = fixture();
    f.write({ ...f.row(0), effect: 'REVERSED', revision: 2 });
    expect(await f.read({ effect: 'APPLIED' })).toEqual([]);
    expect(await f.read({ effect: 'REVERSED' })).toMatchObject([
      { revision: 2, effect: 'REVERSED' },
    ]);
  });
  it('정상 자체 변경이 조건 안으로 들어오면 그 after-image만 한 번 합산한다', async () => {
    const f = fixture();
    f.protectedRows.get('allocation-0000')!.effect = 'REVERSED';
    f.rawRows.get('allocation-0000')!.effect = 'REVERSED';
    f.write({ ...f.row(0), effect: 'APPLIED', revision: 2 });
    expect(await f.read({ effect: 'APPLIED' })).toHaveLength(1);
  });
  it('금융 외 소유자와 지난 기한은 읽기 전에 거절한다', async () => {
    const f = fixture();
    await expect(
      f.scope.financialCollection('StaffRole', {}, new Date(Date.now() + 1000).toISOString()),
    ).rejects.toMatchObject({ code: 'U4_LEDGER_MODEL' });
    await expect(
      f.scope.financialCollection('PaymentAllocation', {}, new Date(0).toISOString()),
    ).rejects.toMatchObject({ code: 'QUERY_DEADLINE' });
    expect(f.transaction.financialCurrentPage).not.toHaveBeenCalled();
  });
});
