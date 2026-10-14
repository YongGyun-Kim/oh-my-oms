import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@oms/contracts';
import {
  ProtectedStore,
  U4Repository,
  decodePayload,
  verifyU4RecoveryState,
  sealPayload,
  U4_SOURCE_CONTRACT,
  U4_PERSISTENCE_MODELS,
  restoreFromJournal,
  u4IdentityClaimId,
  type FaultBoundary,
} from '@oms/persistence';
import { modernProduct, sourceContract } from '../../u3/fixtures/models.js';
import { persistenceFixture, financialRequest } from '../fixtures/persistence.js';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Ref, u4Money } from '../fixtures/contracts.js';
import { seedSyntheticAccount } from '../../u1/fixtures/identity.js';

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
  const restore = async (observe: () => Promise<void>) => {
    const appendFunction = 'u1_append_entry(varchar,bigint,text,varchar,varchar,text)';
    const knownRoles = [
      'u1_journal_append',
      'u2_verify_journal_append',
      'u4_verify_journal_append',
    ];
    const granted = await sources.journalAdmin.query(
      "SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[]) AND has_function_privilege(oid,$2,'EXECUTE')",
      [knownRoles, appendFunction],
    );
    try {
      await observe();
    } finally {
      // 실패 시험도 다음 합성 시험의 역할 권한을 바꾸지 않는다.
      for (const role of granted)
        if (knownRoles.includes(role.rolname))
          await sources.journalAdmin.query(
            'GRANT EXECUTE ON FUNCTION ' + appendFunction + ' TO "' + role.rolname + '"',
          );
      await sources.journalAdmin.query('TRUNCATE u1_restore_append_role');
    }
  };
  const seedEnterprise = async () => {
    await seedSyntheticAccount(store, 'recovery-applicant', 'CUSTOMER');
    const request = financialRequest();
    await store.execute(
      { ...request, sourceContract: undefined, owner: 'EnterpriseAccess' },
      async (transaction) => {
        await transaction.put('EnterpriseApplication', {
          applicationId: 'recovery-application',
          applicantAccountRef: u4Ref('IdentityRecovery', 'Account', 'recovery-applicant'),
          legalName: '복구 합성 기업',
          designatedContact: 'recovery@example.invalid',
          registrationEvidenceRefs: [],
          state: 'PENDING',
          decisionBasis: null,
          initialAdministratorRef: null,
          submittedAt: '2026-12-01T00:00:00.000Z',
          revision: 1,
        });
        await transaction.put('Enterprise', {
          enterpriseId: 'pilot-a',
          applicationRef: u4Ref(
            'EnterpriseAccess',
            'EnterpriseApplication',
            'recovery-application',
          ),
          approvalState: 'UNVERIFIED',
          usageEnabled: false,
          orderingContextPolicy: {
            departmentUsage: 'UNSET',
            siteUsage: 'UNSET',
            setBy: null,
            setAt: null,
            reason: '합성 미설정',
          },
          administratorCount: 0,
          designatedNoticeContactRefs: [],
          revision: 1,
        });
      },
    );
  };

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
  it('PG는 modelVersion1인 모든 U4 업무·보조 원본의 legacy payload1 위장도 거절한다', async () => {
    for (const model of U4_PERSISTENCE_MODELS) {
      const data = u4ModelFixture(model.name);
      const key = model.attributes.find(
        (attribute) => attribute.unique && attribute.type === 'Identifier',
      )!.name;
      const payload = sealPayload({
        schemaVersion: 1,
        epoch: 'initial',
        commitOrder: 1,
        requestId: 'synthetic-legacy-disguise',
        correlationId: 'synthetic-correlation',
        previousDigest: null,
        rows: [
          {
            model: model.name,
            schemaVersion: 1,
            id: String(data[key]),
            revision: 1,
            data,
            deleted: false,
          },
        ],
      });
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
  it('복구 중 보류할 역할에 U4를 등록하고 임의 역할 등록은 거절한다', async () => {
    try {
      await sources.journalAdmin.query('INSERT INTO u1_restore_append_role VALUES($1)', [
        'u4_verify_journal_append',
      ]);
      expect(
        (
          await sources.journalAdmin.query(
            'SELECT count(*)::integer AS count FROM u1_restore_append_role',
          )
        )[0].count,
      ).toBe(1);
      await expect(
        sources.journalAdmin.query('INSERT INTO u1_restore_append_role VALUES($1)', [
          'unregistered-role',
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await sources.journalAdmin.query('TRUNCATE u1_restore_append_role');
    }
  });
  it('실제 원장 재생이 U4 식별·별칭·연결·잔액 원상을 복원한 뒤 append를 재개한다', async () => {
    await seedEnterprise();
    const paymentId = 'replayed-payment';
    const identity = {
      sourceProfileId: 'synthetic-source-profile',
      sourceProfileRevision: 1,
      sourceNamespace: 'synthetic-receiver',
      canonicalIdentity: 'canonical',
      aliases: ['alias'],
    };
    const expected = new Map<string, Record<string, unknown>>();
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => {
        const payment = { ...u4ModelFixture('PaymentEvidence', paymentId), identity };
        expected.set('PaymentEvidence', payment);
        await scope.transaction.put('PaymentEvidence', payment);
        for (const value of [identity.canonicalIdentity, ...identity.aliases]) {
          const claim = {
            ...u4ModelFixture('FinancialIdentityClaim'),
            claimId: u4IdentityClaimId(identity.sourceNamespace, value),
            canonicalPaymentId: paymentId,
            canonicalIdentity: value,
          };
          await scope.transaction.put('FinancialIdentityClaim', claim);
        }
        for (const name of [
          'FinancialPaymentBinding',
          'FinancialPaymentBalance',
          'FinancialInvoiceBinding',
          'FinancialApprovalBalance',
        ]) {
          const data = u4ModelFixture(name, paymentId);
          expected.set(name, data);
          await scope.transaction.put(name, data);
        }
      },
    );
    await restore(async () => {
      const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
      expect(report.entries).toBe(3);
      expect(report.rows).toBeGreaterThanOrEqual(7);
      for (const [name, data] of expected) {
        const key =
          name === 'PaymentEvidence'
            ? 'paymentEvidenceId'
            : name === 'FinancialInvoiceBinding'
              ? 'bindingId'
              : name === 'FinancialApprovalBalance'
                ? 'approvalRootId'
                : 'paymentId';
        const row = await sources.primaryAdmin.getRepository(name).findOneBy({ [key]: data[key] });
        expect(row).toMatchObject(data);
      }
      for (const value of [identity.canonicalIdentity, ...identity.aliases])
        expect(
          await sources.primaryAdmin
            .getRepository('FinancialIdentityClaim')
            .findOneBy({ claimId: u4IdentityClaimId(identity.sourceNamespace, value) }),
        ).toMatchObject({ canonicalPaymentId: paymentId, canonicalIdentity: value });
      expect(
        (await sources.primaryAdmin.query('SELECT enabled,auth_ready FROM u1_recovery_control'))[0],
      ).toMatchObject({ enabled: true, auth_ready: false });
      expect(
        (
          await sources.journalAdmin.query(
            "SELECT has_function_privilege('u4_verify_journal_append','u1_append_entry(varchar,bigint,text,varchar,varchar,text)','EXECUTE') AS allowed",
          )
        )[0].allowed,
      ).toBe(true);
    });
  });
  it('복구 후 식별 보조 원상이 누락되면 U4 append 권한과 writer를 계속 차단한다', async () => {
    await seedEnterprise();
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => {
        await scope.transaction.put('PaymentEvidence', {
          ...u4ModelFixture('PaymentEvidence', 'missing-claim'),
          identity: {
            sourceProfileId: 'synthetic-source-profile',
            sourceProfileRevision: 1,
            sourceNamespace: 'synthetic-receiver',
            canonicalIdentity: 'missing',
            aliases: [],
          },
          boundOrderRef: u4Ref('OrderAcceptance', 'Order'),
        });
      },
    );
    await restore(async () => {
      await expect(
        restoreFromJournal(sources.primaryAdmin, sources.journalAdmin),
      ).rejects.toMatchObject({ code: 'U4_RECOVERY_IDENTITY' });
      expect(
        (await sources.primaryAdmin.query('SELECT enabled,auth_ready FROM u1_recovery_control'))[0],
      ).toMatchObject({ enabled: false, auth_ready: false });
      expect(
        (
          await sources.journalAdmin.query(
            "SELECT has_function_privilege('u4_verify_journal_append','u1_append_entry(varchar,bigint,text,varchar,varchar,text)','EXECUTE') AS allowed",
          )
        )[0].allowed,
      ).toBe(false);
      expect(
        await sources.journalAdmin.query(
          'SELECT role_name FROM u1_restore_append_role WHERE role_name=$1',
          ['u4_verify_journal_append'],
        ),
      ).toHaveLength(1);
    });
  });
  it('서로 다른 접수로 누적된 101번째 잔액도 전체 원본 대조에서 제외하지 않는다', async () => {
    const rows = Array.from({ length: 101 }, (_, index) =>
      u4ModelFixture('FinancialPaymentBalance', 'aggregate-' + String(index).padStart(3, '0')),
    );
    for (let offset = 0; offset < rows.length; offset += 100)
      await repository.mutate(
        financialRequest(),
        async () => {},
        async (scope) =>
          scope.transaction.putNewBatch(
            'FinancialPaymentBalance',
            rows.slice(offset, offset + 100),
          ),
      );
    expect(
      (
        await sources.primaryApp.query(
          'SELECT count(*)::integer AS count FROM u1_financial_payment_balance',
        )
      )[0].count,
    ).toBe(101);
    await expect(
      sources.primaryAdmin.transaction((manager) => verifyU4RecoveryState(manager)),
    ).resolves.toBeUndefined();
    await repository.mutate(
      financialRequest(),
      async () => {},
      async (scope) => {
        await scope.lock(['aggregate-100'], [], []);
        const current = (await scope.optional('FinancialPaymentBalance', 'aggregate-100'))!;
        await scope.transaction.put(
          'FinancialPaymentBalance',
          { ...current, allocatedPrincipal: u4Money('1'), revision: 2 },
          1,
        );
      },
    );
    // 잔액 자체의 범위는 유효하지만 배분 원본이 없으므로 복구 준비를 차단해야 한다.
    await expect(
      sources.primaryAdmin.transaction((manager) => verifyU4RecoveryState(manager)),
    ).rejects.toMatchObject({ code: 'U4_RECOVERY_AGGREGATE' });
  });
});
