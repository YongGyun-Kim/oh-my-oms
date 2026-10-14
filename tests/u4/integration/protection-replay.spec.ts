import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import {
  ProtectedStore,
  U4Repository,
  decodePayload,
  verifyU4RecoveryState,
  sealPayload,
  U4_SOURCE_CONTRACT,
  type FaultBoundary,
} from '@oms/persistence';
import { modernProduct, sourceContract } from '../../u3/fixtures/models.js';
import { persistenceFixture, financialRequest } from '../fixtures/persistence.js';
import { u4ModelFixture } from '../fixtures/models.js';

describe('U4 보호 실패·응답 유실·구형 접수 회귀', () => {
  const { sources, store, repository } = persistenceFixture();
  const faulty = (boundary: FaultBoundary) =>
    new U4Repository(
      new ProtectedStore(sources.primaryApp, sources.journalAppend, async (at) => {
        if (at === boundary) throw new Error('SYNTHETIC_FAULT');
      }),
    );
  const write = (repo: U4Repository, request = financialRequest()) =>
    repo.mutate(
      request,
      async () => {},
      async (scope) =>
        scope.transaction.put(
          'FinancialPaymentBalance',
          u4ModelFixture('FinancialPaymentBalance', 'protected'),
        ),
    );

  it('primary 후 보호 실패를 성공으로 반환하지 않고 원래 요청만 다시 확인한다', async () => {
    const request = financialRequest();
    await expect(write(faulty('PRIMARY_COMMITTED'), request)).rejects.toThrow();
    expect(await store.read('FinancialPaymentBalance', 'protected')).toBeNull();
    const retried = await repository.mutate(
      request,
      async () => {},
      async () => {
        throw new Error('REPLAY_MUST_NOT_EXECUTE');
      },
    );
    expect(retried.replay).toBe(true);
    expect(await store.currentProtected('FinancialPaymentBalance', 'protected')).toBeDefined();
    expect(
      (
        await sources.primaryApp.query(
          'SELECT count(*)::integer AS count FROM u1_financial_payment_balance',
        )
      )[0].count,
    ).toBe(1);
  });
  it('보호 후 응답 유실에도 같은 원래 접수/후보를 재사용한다', async () => {
    const request = financialRequest();
    await expect(write(faulty('VISIBILITY_UPDATED'), request)).rejects.toThrow();
    const candidate = (
      await sources.primaryApp.query('SELECT request_id FROM u1_recovery_candidate')
    )[0];
    const replayed = await write(repository, request);
    expect(replayed.requestId).toBe(candidate.request_id);
    expect(replayed.replay).toBe(true);
    expect(
      (
        await sources.journalAdmin.query(
          'SELECT count(*)::integer AS count FROM u1_protected_entry',
        )
      )[0].count,
    ).toBe(1);
  });
  it('재전송에도 현재 권한 검사를 실행하고 회수된 권한이면 원래 결과를 노출하지 않는다', async () => {
    const request = financialRequest();
    await write(repository, request);
    await expect(
      repository.mutate(
        request,
        async () => {
          throw new Error('SYNTHETIC_AUTH_REVOKED');
        },
        async () => {},
      ),
    ).rejects.toThrow('SYNTHETIC_AUTH_REVOKED');
    expect(
      (
        await sources.primaryApp.query(
          'SELECT count(*)::integer AS count FROM u1_recovery_candidate',
        )
      )[0].count,
    ).toBe(1);
  });
  it('미보호 선행 변경을 새 소비의 원금으로 사용하지 않는다', async () => {
    await expect(write(faulty('PRIMARY_COMMITTED'))).rejects.toThrow();
    await expect(
      repository.mutate(
        financialRequest(),
        async () => {},
        async (scope) => {
          await scope.optional('FinancialPaymentBalance', 'protected');
          await scope.transaction.put(
            'FinancialPaymentBalance',
            u4ModelFixture('FinancialPaymentBalance', 'dependent'),
          );
        },
      ),
    ).rejects.toMatchObject({ code: 'CURRENT_U4_NOT_PROTECTED' });
    expect(
      await sources.primaryApp
        .getRepository('FinancialPaymentBalance')
        .findOneBy({ paymentId: 'dependent' }),
    ).toBeNull();
  });
  it('primary commit 뒤 epoch 변경을 성공 응답으로 반환하지 않는다', async () => {
    const changing = new U4Repository(
      new ProtectedStore(sources.primaryApp, sources.journalAppend, async (at) => {
        if (at === 'PRIMARY_COMMITTED')
          await sources.primaryAdmin.query(
            "UPDATE u1_recovery_control SET epoch='changed' WHERE singleton=true",
          );
      }),
    );
    await expect(write(changing)).rejects.toMatchObject({ code: 'WRITER_FENCED' });
  });
  it('보호 원상에 보조 기록과 정확한 U4 계약을 함께 보존한다', async () => {
    await write(repository);
    const entries = await sources.journalAdmin.query(
      'SELECT payload_text FROM u1_protected_entry ORDER BY commit_order',
    );
    const payload = decodePayload(entries[0].payload_text, store.schema);
    expect(payload.schemaVersion).toBe(3);
    expect(payload.sourceContract?.registryVersion).toBe(4);
    expect(
      payload.rows.some(
        (row) => row.model === 'FinancialPaymentBalance' && row.schemaVersion === 1,
      ),
    ).toBe(true);
    expect(canonicalJson(payload) === entries[0].payload_text).toBe(true);
  });
  it('기존 U3 접수·버전2 원상과 선택 replay callback 없는 동작을 유지한다', async () => {
    const request = { ...financialRequest(), owner: 'ProductCatalog', sourceContract };
    const first = await store.execute(request, async (transaction) =>
      transaction.put('Product', modernProduct()),
    );
    const repeated = await store.execute(request, async () => {
      throw new Error('LEGACY_REPLAY_MUST_NOT_EXECUTE');
    });
    expect(repeated.requestId).toBe(first.requestId);
    expect(repeated.replay).toBe(true);
    const entries = await sources.journalAdmin.query('SELECT payload_text FROM u1_protected_entry');
    expect(decodePayload(entries[0].payload_text, store.schema).schemaVersion).toBe(2);
  });
  it('보조 유일 제약이 누락된 복구 상태를 준비 완료로 통과시키지 않는다', async () => {
    await sources.primaryAdmin.query('DROP INDEX u4_payment_identity');
    try {
      await expect(
        sources.primaryAdmin.transaction((manager) => verifyU4RecoveryState(manager)),
      ).rejects.toMatchObject({ code: 'U4_RECOVERY_CONSTRAINTS' });
    } finally {
      await sources.primaryAdmin.query(
        'CREATE UNIQUE INDEX u4_payment_identity ON u1_financial_identity_claim("sourceNamespace","canonicalIdentity")',
      );
    }
  });
  it('PG append도 구형 payload의 새 행 위장과 잘못된 U4 profile을 거절한다', async () => {
    const row = {
      model: 'FinancialPaymentBalance',
      schemaVersion: 1 as const,
      id: 'protected',
      revision: 1,
      data: u4ModelFixture('FinancialPaymentBalance', 'protected'),
      deleted: false,
    };
    const common = {
      epoch: 'initial',
      commitOrder: 1,
      requestId: 'synthetic-invalid',
      correlationId: 'synthetic-correlation',
      previousDigest: null,
    };
    const invalid = [
      sealPayload({ ...common, schemaVersion: 3, sourceContract, rows: [row] }),
      sealPayload({
        ...common,
        schemaVersion: 2,
        sourceContract,
        rows: [{ ...row, schemaVersion: 3, data: { ...row.data, modelVersion: 3 } }],
      }),
      sealPayload({
        ...common,
        schemaVersion: 1,
        rows: [{ ...row, schemaVersion: 3, data: { ...row.data, modelVersion: 3 } }],
      }),
      sealPayload({
        ...common,
        schemaVersion: 3,
        sourceContract: U4_SOURCE_CONTRACT,
        rows: [{ ...row, schemaVersion: 3, data: { ...row.data, modelVersion: 2 } }],
      }),
    ];
    for (const payload of invalid) {
      const { contentDigest, ...body } = payload;
      await expect(
        sources.journalAppend.query('SELECT u1_append_entry($1,$2,$3,$4,$5,$6)', [
          payload.epoch,
          payload.commitOrder,
          canonicalJson(payload),
          contentDigest,
          null,
          canonicalJson(body),
        ]),
      ).rejects.toMatchObject({ code: '22023' });
    }
  });
});
