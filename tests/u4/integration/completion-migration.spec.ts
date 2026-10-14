import { describe, expect, it } from 'vitest';
import { restoreFromJournal } from '@oms/persistence';
import { initializeU4Databases } from '../fixtures/databases.js';
import { seedU4OwnerFacts } from '../fixtures/owner-facts.js';
import { persistenceFixture } from '../fixtures/persistence.js';

describe('기존 U4 원본을 유지한 완료 근거 추가와 보호 원장 재생', () => {
  const { store, sources } = persistenceFixture();
  const appendFunction = 'u1_append_entry(varchar,bigint,text,varchar,varchar,text)';
  async function restoring(run: () => Promise<void>) {
    const allowed = ['u1_journal_append', 'u2_verify_journal_append', 'u4_verify_journal_append'];
    const granted = await sources.journalAdmin.query(
      "SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[]) AND has_function_privilege(oid,$2,'EXECUTE')",
      [allowed, appendFunction],
    );
    try {
      await run();
    } finally {
      for (const { rolname } of granted)
        if (allowed.includes(rolname))
          await sources.journalAdmin.query(
            'GRANT EXECUTE ON FUNCTION ' + appendFunction + ' TO "' + rolname + '"',
          );
      await sources.journalAdmin.query('TRUNCATE u1_restore_append_role');
    }
  }
  it('raw PostgreSQL date와 정상 ORM LocalDate 판독을 실제 driver에서 구별한다', async () => {
    const rows = await sources.primaryAdmin.query("SELECT DATE '2026-12-01' AS value");
    expect(rows[0].value).toBeInstanceOf(Date);
    expect(() => store.schema.validate('Date', rows[0].value)).toThrow();
    const column = sources.primaryAdmin
      .getMetadata('Invoice')
      .findColumnWithPropertyName('dueDate')!;
    const normalized = sources.primaryAdmin.driver.prepareHydratedValue(rows[0].value, column);
    expect(normalized).toBe('2026-12-01');
    expect(store.schema.validate('Date', normalized)).toBe(normalized);
  });
  it('새 빈 table이 없는 구형 U4에서도 기존 원본·보호prefix 보존 후 명시 추가/역할 부여가 된다', async () => {
    const f = await seedU4OwnerFacts(store),
      invoices = await f.invoices();
    const original = await store.currentProtected('Invoice', invoices[0]!.id);
    const uncalculated = await store.currentProtected('Invoice', invoices[1]!.id);
    const prefix = await sources.primaryAdmin.query(
      'SELECT * FROM u1_protected_prefix ORDER BY epoch',
    );
    const journal = await sources.journalAdmin.query(
      'SELECT * FROM u1_journal_prefix ORDER BY epoch',
    );
    expect(
      (
        await sources.primaryAdmin.query(
          'SELECT count(*)::integer AS count FROM u1_financial_completion_basis',
        )
      )[0].count,
    ).toBe(0);
    // 새 빈 table만 제외해 fa6e0f1의 원본이 있는 상태를 만든다. 기존 행/이력은 지우지 않는다.
    await sources.primaryAdmin.query('DROP TABLE u1_financial_completion_basis');
    try {
      expect(
        (
          await sources.primaryAdmin.query(
            "SELECT to_regclass('public.u1_financial_completion_basis') IS NULL AS absent",
          )
        )[0].absent,
      ).toBe(true);
      await initializeU4Databases();
      expect(await store.currentProtected('Invoice', invoices[0]!.id)).toEqual(original);
      expect(await store.currentProtected('Invoice', invoices[1]!.id)).toEqual(uncalculated);
      expect(
        await sources.primaryAdmin.query('SELECT * FROM u1_protected_prefix ORDER BY epoch'),
      ).toEqual(prefix);
      expect(
        await sources.journalAdmin.query('SELECT * FROM u1_journal_prefix ORDER BY epoch'),
      ).toEqual(journal);
      const result = await f.due.reconcileInvoiceDue(
        await f.actor(),
        f.dueInput(invoices[1]!),
        f.ingress,
      );
      expect(
        await store.currentProtected('FinancialCompletionBasis', result.targetRef!.id),
      ).toMatchObject({ invoiceRef: result.targetRef, modelVersion: 1 });
      expect(
        (
          await sources.primaryAdmin.query(
            "SELECT has_table_privilege('u4_verify_app','u1_financial_completion_basis','SELECT') AND has_table_privilege('u4_verify_app','u1_financial_completion_basis','INSERT') AND has_table_privilege('u4_verify_app','u1_financial_completion_basis','UPDATE') AS allowed",
          )
        )[0].allowed,
      ).toBe(true);
      await expect(
        sources.primaryApp.query('ALTER TABLE u1_financial_completion_basis ENABLE TRIGGER ALL'),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      // 실패 시에도 U4 소유의 추가 schema/권한만 복구한다. 데이터 reset은 하지 않는다.
      await initializeU4Databases();
    }
  });
  it('원장 재생은 고정/미산출 청구와 정상 정정 중간 원상의 원래 완료 근거를 복원한다', async () => {
    const f = await seedU4OwnerFacts(store),
      invoices = await f.invoices();
    const original = await store.currentProtected('Invoice', invoices[0]!.id);
    const result = await f.due.reconcileInvoiceDue(
      await f.actor(),
      f.dueInput(invoices[1]!),
      f.ingress,
    );
    const basis = await store.currentProtected('FinancialCompletionBasis', result.targetRef!.id);
    const corrected = await f.financial.correctInvoice(
      await f.actor(),
      {
        ...(await f.invoiceInput(1)),
        meta: f.meta(result.targetRef!.revision),
        correctionOf: result.targetRef!,
      },
      f.ingress,
    );
    const intermediate = await store.currentProtected('Invoice', corrected.targetRef!.id);
    expect(intermediate).toMatchObject({ dueDate: null, correctionOf: result.targetRef });
    await restoring(async () => {
      const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
      expect(report.entries).toBeGreaterThan(0);
      expect(
        await sources.primaryAdmin
          .getRepository('Invoice')
          .findOneBy({ invoiceId: invoices[0]!.id }),
      ).toMatchObject(original!);
      expect(
        await sources.primaryAdmin
          .getRepository('Invoice')
          .findOneBy({ invoiceId: corrected.targetRef!.id }),
      ).toMatchObject(intermediate!);
      expect(
        await sources.primaryAdmin
          .getRepository('FinancialCompletionBasis')
          .findOneBy({ invoiceId: result.targetRef!.id }),
      ).toMatchObject(basis!);
      expect(
        (
          await sources.primaryAdmin.query(
            'SELECT enabled,auth_ready FROM u1_recovery_control WHERE singleton=true',
          )
        )[0],
      ).toMatchObject({ enabled: true, auth_ready: false });
      expect(
        (
          await sources.journalAdmin.query(
            "SELECT has_function_privilege('u4_verify_journal_append',$1,'EXECUTE') AS allowed",
            [appendFunction],
          )
        )[0].allowed,
      ).toBe(true);
    });
  });
  it('실제 기한 기록의 basis가 재생 후 빠지면 writer와 append를 재개하지 않는다', async () => {
    const f = await seedU4OwnerFacts(store);
    const result = await f.due.reconcileInvoiceDue(
      await f.actor(),
      f.dueInput((await f.invoices())[1]!),
      f.ingress,
    );
    await restoring(async () => {
      await expect(
        restoreFromJournal(sources.primaryAdmin, sources.journalAdmin, async (event) => {
          if (event.phase === 'REPLAYED' && event.requestId === result.requestId)
            await sources.primaryAdmin.query(
              'DELETE FROM u1_financial_completion_basis WHERE "invoiceId"=$1',
              [result.targetRef!.id],
            );
        }),
      ).rejects.toMatchObject({ code: 'U4_RECOVERY_COMPLETION' });
      expect(
        (
          await sources.primaryAdmin.query(
            'SELECT enabled,auth_ready FROM u1_recovery_control WHERE singleton=true',
          )
        )[0],
      ).toMatchObject({ enabled: false, auth_ready: false });
      expect(
        (
          await sources.journalAdmin.query(
            "SELECT has_function_privilege('u4_verify_journal_append',$1,'EXECUTE') AS allowed",
            [appendFunction],
          )
        )[0].allowed,
      ).toBe(false);
    });
  });
  it('정상 정정으로 기한을 비운 중간 상태도 원래 basis가 누락되면 복구를 재개하지 않는다', async () => {
    const f = await seedU4OwnerFacts(store);
    const result = await f.due.reconcileInvoiceDue(
      await f.actor(),
      f.dueInput((await f.invoices())[1]!),
      f.ingress,
    );
    const corrected = await f.financial.correctInvoice(
      await f.actor(),
      {
        ...(await f.invoiceInput(1)),
        meta: f.meta(result.targetRef!.revision),
        correctionOf: result.targetRef!,
      },
      f.ingress,
    );
    await restoring(async () => {
      await expect(
        restoreFromJournal(sources.primaryAdmin, sources.journalAdmin, async (event) => {
          if (event.phase === 'REPLAYED' && event.requestId === corrected.requestId)
            await sources.primaryAdmin.query(
              'DELETE FROM u1_financial_completion_basis WHERE "invoiceId"=$1',
              [result.targetRef!.id],
            );
        }),
      ).rejects.toMatchObject({ code: 'U4_RECOVERY_COMPLETION' });
      expect(
        (
          await sources.primaryAdmin.query(
            'SELECT enabled,auth_ready FROM u1_recovery_control WHERE singleton=true',
          )
        )[0],
      ).toMatchObject({ enabled: false, auth_ready: false });
      expect(
        (
          await sources.journalAdmin.query(
            "SELECT has_function_privilege('u4_verify_journal_append',$1,'EXECUTE') AS allowed",
            [appendFunction],
          )
        )[0].allowed,
      ).toBe(false);
    });
  });
});
