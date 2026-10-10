import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OwnerDiagnostics, ProtectedStore } from '@oms/persistence';
import { initializeDatabases } from '../fixtures/migrate.js';
import { localSources } from '../fixtures/databases.js';
import { resetSyntheticDatabases } from '../fixtures/reset.js';
const sources = localSources();
let requestId: string;
let reader: OwnerDiagnostics;
const request = () => ({
  owner: 'EnterpriseAccess',
  requestRefs: [requestId],
  factRefs: [],
  from: '2026-10-01T00:00:00Z',
  to: '2026-10-31T00:00:00Z',
});
beforeAll(async () => {
  await initializeDatabases();
  for (const source of Object.values(sources)) await source.initialize();
});
beforeEach(async () => {
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
  const store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  const result = await store.execute(
    {
      principalId: 'synthetic-observer-profile',
      audience: 'SYSTEM',
      owner: 'EnterpriseAccess',
      operation: 'synthetic-diagnostic-fixture',
      target: { kind: 'NONE' },
      idempotencyKey: randomUUID(),
      input: {},
      correlationId: randomUUID(),
      epoch: 'initial',
    },
    async (transaction, id) => {
      await transaction.put('RequestReceipt', {
        requestId: id,
        principalId: 'synthetic-observer-profile',
        audience: 'SYSTEM',
        owner: 'EnterpriseAccess',
        operation: 'synthetic-diagnostic-fixture',
        targetIdentity: { kind: 'NONE' },
        requestFingerprint: 'synthetic',
        idempotencyKey: id,
        targetScope: null,
        requestState: 'RESULT_RECORDED',
        resultRefs: [],
        acceptedAt: '2026-10-08T00:00:00Z',
        updatedAt: '2026-10-08T00:00:00Z',
        revision: 1,
        correlationId: id,
      });
    },
  );
  requestId = result.requestId;
  await sources.primaryAdmin.query(
    'GRANT SELECT ON u1_diagnostic_metadata TO u1_diagnostic_reader',
  );
  reader = new OwnerDiagnostics(
    sources.diagnosticReader,
    'u1_verify_diagnostic_reader',
    new Set(['EnterpriseAccess']),
  );
});
afterAll(async () => {
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
});
type View = {
  coverage: string;
  storedReceiptRefs: { id: string }[];
  acknowledgedRequestRefs: string[];
  limitations: string[];
};
describe('C19 현재 읽기 전용 역할·원래 접수·기간·독립 ACK 대조', () => {
  it('보호 Receipt는 원래ID로 보이지만 독립 ACK 부재는 PARTIAL이다', async () => {
    const view = (await reader.read(request())) as View;
    expect(view.storedReceiptRefs[0]!.id).toBe(requestId);
    expect(view.acknowledgedRequestRefs).toEqual([]);
    expect(view.coverage).toBe('PARTIAL');
    expect(view.limitations.join(' ')).toContain('독립 성공 ACK');
  });
  it('DB writer 연결과 임의 owner 프로필은 거절한다', async () => {
    await expect(
      new OwnerDiagnostics(sources.primaryApp, 'u1_verify_app', new Set(['EnterpriseAccess'])).read(
        request(),
      ),
    ).rejects.toMatchObject({ code: 'DIAGNOSTIC_READER_REQUIRED' });
    await expect(reader.read({ ...request(), owner: 'ProductCatalog' })).rejects.toMatchObject({
      code: 'DIAGNOSTIC_SCOPE',
    });
  });
  it('현재 SELECT 회수는 즉시 거절하며 과거 진단 결과로 권한을 되살리지 않는다', async () => {
    await reader.read(request());
    await sources.primaryAdmin.query(
      'REVOKE SELECT ON u1_diagnostic_metadata FROM u1_diagnostic_reader',
    );
    await expect(reader.read(request())).rejects.toMatchObject({
      code: 'DIAGNOSTIC_READER_REQUIRED',
    });
  });
  it('기간 밖/다른 원래 접수는 없음을 확정하지 않고 UNAVAILABLE로 표시한다', async () => {
    for (const input of [
      { ...request(), from: '2026-10-09T00:00:00Z' },
      { ...request(), requestRefs: ['missing-original'] },
    ]) {
      const view = (await reader.read(input)) as View;
      expect(view.storedReceiptRefs).toEqual([]);
      expect(view.coverage).toBe('UNAVAILABLE');
      expect(view.limitations.join(' ')).toContain('확인하지 못한');
    }
  });
  it('metadata view에는 business JSON/복구 payload/신원 비밀 컬럼이 없다', async () => {
    const rows = await sources.diagnosticReader.query('SELECT * FROM u1_diagnostic_metadata');
    expect(Object.keys(rows[0]).sort()).toEqual([
      'id',
      'model',
      'occurred_at',
      'owner',
      'request_id',
      'revision',
      'state',
    ]);
    await expect(
      sources.diagnosticReader.query('SELECT ciphertext FROM u1_auth_ephemeral'),
    ).rejects.toMatchObject({ driverError: { code: '42501' } });
  });
  it('실제 read 역할에는 business/원장 쓰기·DDL·역할 승격이 없다', async () => {
    for (const sql of [
      'DELETE FROM u1_request_receipt',
      'CREATE TABLE u1_diagnostic_write_probe(id text)',
      'SET ROLE u1_app',
    ])
      await expect(sources.diagnosticReader.query(sql)).rejects.toMatchObject({
        driverError: { code: '42501' },
      });
  });
  it('독립 ACK source만 해당 원래ID를 인정하고 다른ID 관찰은 반환하지 않는다', async () => {
    const independent = new OwnerDiagnostics(
      sources.diagnosticReader,
      'u1_verify_diagnostic_reader',
      new Set(['EnterpriseAccess']),
      {
        observe: async () => ({
          requestRefs: [requestId, 'outside'],
          observedAt: new Date().toISOString(),
          complete: true,
        }),
      },
    );
    const view = (await independent.read(request())) as View;
    expect(view.acknowledgedRequestRefs).toEqual([requestId]);
    expect(view.coverage).toBe('PARTIAL');
  });
  it('진단 전후 원본/prefix/접수 개수는 같고 없는 사실은 근거 누락으로 남긴다', async () => {
    const before = await sources.primaryAdmin.query(
      'SELECT count(*)::int count FROM u1_entity_version',
    );
    const view = (await reader.read({
      ...request(),
      factRefs: [
        { owner: 'OrderAcceptance', entity: 'AcceptanceDecision', id: 'missing-fact', revision: 1 },
      ],
    })) as View;
    expect(view.limitations.join(' ')).toContain('사실 참조');
    expect(
      await sources.primaryAdmin.query('SELECT count(*)::int count FROM u1_entity_version'),
    ).toEqual(before);
  });
});
