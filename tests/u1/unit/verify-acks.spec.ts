import { mkdtempSync, writeFileSync, rmSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';
import { verifyAcknowledgements } from '../../../scripts/u1/verify-acks.js';
let folder: string;
const target = { owner: 'OrderAcceptance', entity: 'Order', id: 'order', revision: 1 };
const ack = () => ({
  requestId: 'request',
  targetRef: target,
  owner: 'OrderAcceptance',
  clientRequestId: 'original-key',
  company: 0,
  observedAt: new Date().toISOString(),
});
const receipt = () => ({
  principalId: 'nfr-customer-0',
  owner: 'OrderAcceptance',
  idempotencyKey: 'original-key',
  resultRefs: [target],
});
const data = () => ({
  principalId: 'nfr-customer-0',
  owner: 'OrderAcceptance',
  requestId: 'request',
});
let store: ProtectedStore;
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'oms-u1-ack-unit-'));
  store = {
    schema: new SchemaValidator(),
    read: vi.fn(async () => receipt()),
    readRevision: vi.fn(async () => ({ orderId: 'order' })),
    primary: { query: vi.fn(async () => [{ data: data() }]) },
  } as unknown as ProtectedStore;
});
afterEach(() => rmSync(folder, { recursive: true }));
const file = (rows: unknown[]) => {
  const path = folder + '/ack.jsonl';
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n'));
  return path;
};
describe('독립 원래 ACK 원본 대조(닫힌 canonical·stream 경계)', () => {
  it('원래 principal/owner/key/개정/Receipt결과를 모두 대조한다', async () => {
    expect(await verifyAcknowledgements(store, file([ack()]))).toMatchObject({
      acknowledgements: 1,
      missingOrChanged: 0,
    });
    expect(store.readRevision).toHaveBeenCalledWith('Order', 'order', 1);
  });
  it('중복·기업범위·다른owner 자료를 성공 접수로 세지 않는다', async () => {
    for (const rows of [
      [ack(), ack()],
      [{ ...ack(), company: 100 }],
      [{ ...ack(), company: '0' }],
      [{ ...ack(), owner: 'Unknown' }],
    ])
      await expect(verifyAcknowledgements(store, file(rows))).rejects.toThrow('scope');
  });
  it('빈 ACK/손상 JSON은 RPO0을 증명하지 못한다', async () => {
    await expect(verifyAcknowledgements(store, file([]))).rejects.toThrow('빈 ACK');
    const path = file([]);
    writeFileSync(path, '{');
    await expect(verifyAcknowledgements(store, path)).rejects.toThrow();
  });
  it('canonical 미등록 ref/빈 원래ID를 거절한다', async () => {
    for (const change of [
      { requestId: '' },
      { targetRef: { ...target, entity: 'Unknown' } },
      { clientRequestId: '' },
    ])
      await expect(
        verifyAcknowledgements(store, file([{ ...ack(), ...change }])),
      ).rejects.toThrow();
  });
  it('원본 Receipt/개정이 없거나 key가 바뀌면 데이터 보존 실패다', async () => {
    for (const record of [
      null,
      { ...receipt(), idempotencyKey: 'new-key' },
      { ...receipt(), resultRefs: [] },
    ]) {
      vi.mocked(store.read).mockResolvedValue(record as never);
      await expect(verifyAcknowledgements(store, file([ack()]))).rejects.toThrow('대조');
    }
    vi.mocked(store.read).mockResolvedValue(receipt());
    vi.mocked(store.readRevision).mockResolvedValue(null);
    await expect(verifyAcknowledgements(store, file([ack()]))).rejects.toThrow('대조');
  });
  it('외부 target가 같아도 원래 key의 주체/owner/requestID가 바뀌면 실패한다', async () => {
    for (const change of [
      { principalId: 'other' },
      { owner: 'ProductCatalog' },
      { requestId: 'new-request' },
    ]) {
      vi.mocked(store.primary.query).mockResolvedValue([{ data: { ...data(), ...change } }]);
      await expect(verifyAcknowledgements(store, file([ack()]))).rejects.toThrow('대조');
    }
  });
  it('직원10개 매핑을 고객 principal로 대체하지 않는다', async () => {
    vi.mocked(store.read).mockResolvedValue({
      ...receipt(),
      principalId: 'nfr-staff-0',
      owner: 'ProductCatalog',
    });
    vi.mocked(store.primary.query).mockResolvedValue([
      { data: { ...data(), principalId: 'nfr-staff-0', owner: 'ProductCatalog' } },
    ]);
    expect(
      (
        await verifyAcknowledgements(
          store,
          file([{ ...ack(), company: 90, owner: 'ProductCatalog' }]),
        )
      ).missingOrChanged,
    ).toBe(0);
  });
  it('64MiB 파일/4KiB 한 줄 상한을 검사 전에 적용한다', async () => {
    const path = file([]);
    truncateSync(path, 64 * 1024 * 1024 + 1);
    await expect(verifyAcknowledgements(store, path)).rejects.toThrow('유한 범위');
    writeFileSync(path, 'a'.repeat(4097));
    await expect(verifyAcknowledgements(store, path)).rejects.toThrow('항목');
  });
});
