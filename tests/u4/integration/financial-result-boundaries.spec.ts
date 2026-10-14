import { beforeEach, describe, expect, it } from 'vitest';
import type { TestContext } from 'vitest';
import type { Ref } from '@oms/contracts';
import { restoreFromJournal } from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import { seedU4OwnerFacts } from '../fixtures/owner-facts.js';
import { persistenceFixture } from '../fixtures/persistence.js';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Ref } from '../fixtures/contracts.js';

describe('실제100항목 명령·전체101근거·정확한 원래 접수의 보호 경계', () => {
  const { store, sources, repository } = persistenceFixture();
  async function allProtected(model: string) {
    const values: ModelData[] = [];
    for await (const value of store.scan(model, {}, new Date(Date.now() + 5000).toISOString()))
      values.push(value);
    return values;
  }
  const counts = () =>
    sources.primaryAdmin.query(
      'SELECT (SELECT count(*) FROM u1_request_receipt)::integer AS receipt, (SELECT count(*) FROM u1_financial_history)::integer AS history, (SELECT count(*) FROM u1_fact_envelope)::integer AS fact, (SELECT count(*) FROM u1_financial_eligibility)::integer AS eligibility',
    );
  describe('정상 생산자100개 준비와 금융 경계 실행', () => {
    async function prepare(context: TestContext) {
      const startedAt = performance.now();
      let completedInvoices = 0;
      const mark = (stage: string) =>
        Object.assign(context.task.meta, {
          u4Boundary: {
            stage,
            enteredAtMs: Math.round(performance.now() - startedAt),
            completedInvoices,
          },
        });
      mark('PREPARE');
      const f = await seedU4OwnerFacts(store, { obligationCount: 100 });
      expect(f.plan.obligations).toHaveLength(100);
      expect(f.plan.total.value).toBe('1000');
      const invoices: Ref[] = [];
      mark('INVOICES');
      for (let index = 0; index < 100; index++) {
        invoices.push(
          (
            await f.financial.registerInvoice(
              await f.actor(),
              await f.invoiceInput(index),
              f.ingress,
            )
          ).targetRef!,
        );
        completedInvoices = index + 1;
        mark('INVOICES');
      }
      mark('PAYMENT');
      const document = 'synthetic-batch100-source';
      f.registerTruth(document, '1001', f.identity('synthetic-batch100-transaction'));
      const record = f.recordInput(document);
      record.amount = { currency: 'KRW', value: '1001' };
      const reviewed = await f.financial.recordPaymentEvidence(await f.actor(), record, f.ingress);
      const confirmed = await f.financial.confirmPaymentEvidence(
        await f.actor(),
        f.confirmInput(reviewed.targetRef!, document),
        f.ingress,
      );
      return { f, invoices, confirmed };
    }
    let prepared: Awaited<ReturnType<typeof prepare>>;
    // 준비는 기존120초 안에서 정상 명령으로만 수행한다. 공통 reset 뒤 매번 독립 원상을 만든다.
    beforeEach(async (context) => {
      prepared = await prepare(context);
    }, 120000);

    it('정상100항목102결과/마지막오류 전체rollback·101번째근거 stale와 원래접수 복구를 검증한다', async (context) => {
      const { f, invoices, confirmed } = prepared;
      const startedAt = performance.now();
      const mark = (stage: string) =>
        Object.assign(context.task.meta, {
          u4Boundary: {
            stage,
            enteredAtMs: Math.round(performance.now() - startedAt),
            completedInvoices: invoices.length,
          },
        });
      // 본문 경과는 준비와 별도로0부터 센다. 제품10초/DB2초/lock500ms 예산은 그대로다.
      mark('ROLLBACK');
      const before = await counts();
      const cash = await store.currentProtected('FinancialPaymentBalance', confirmed.targetRef!.id);
      const balances = await allProtected('FinancialInvoiceBalance');
      expect(balances).toHaveLength(100);
      // 총1001은 P 안에 있지만 마지막 청구10에11을 배분할 수 없다.
      const bad = f.allocationInput(confirmed.targetRef!, invoices, [
        ...Array<string>(99).fill('10'),
        '11',
      ]);
      mark('ROLLBACK');
      await expect(
        f.financial.allocatePaymentBatch(await f.actor(), bad, f.ingress),
      ).rejects.toMatchObject({ code: 'U4_INVOICE_LIMIT' });
      expect(await counts()).toEqual(before);
      expect(await allProtected('PaymentAllocation')).toEqual([]);
      expect(await allProtected('FinancialInvoiceBalance')).toEqual(balances);
      expect(
        await store.currentProtected('FinancialPaymentBalance', confirmed.targetRef!.id),
      ).toEqual(cash);
      const invalid101 = {
        ...bad,
        meta: f.meta(confirmed.targetRef!.revision),
        items: [...bad.items, bad.items[0]!],
      };
      await expect(
        f.financial.allocatePaymentBatch(await f.actor(), invalid101, f.ingress),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(await counts()).toEqual(before);

      const input = f.allocationInput(confirmed.targetRef!, invoices, [
        ...Array<string>(99).fill('10'),
        '9',
      ]);
      mark('ALLOCATE_100');
      const allocated = await f.financial.allocatePaymentBatch(await f.actor(), input, f.ingress);
      expect(allocated.resultRefs).toHaveLength(102);
      expect(
        allocated.resultRefs.filter((value) => value.entity === 'PaymentAllocation'),
      ).toHaveLength(100);
      expect(
        allocated.resultRefs.filter((value) => value.entity === 'PaymentEvidence'),
      ).toHaveLength(1);
      expect(
        allocated.resultRefs.filter((value) => value.entity === 'FinancialHistory'),
      ).toHaveLength(1);
      expect(await f.financial.allocatePaymentBatch(await f.actor(), input, f.ingress)).toEqual(
        allocated,
      );
      expect(await allProtected('PaymentAllocation')).toHaveLength(100);
      mark('ASSESS_100');
      const eligibilityInput = await f.eligibilityInput('PROVISION');
      const recorded = await f.eligibility.evaluateFinancialEligibility(
        await f.actor(),
        eligibilityInput,
        f.ingress,
      );
      expect(
        await store.currentProtected('FinancialEligibility', recorded.targetRef!.id),
      ).toMatchObject({ decision: 'HOLD', paymentBasisRefs: expect.any(Array) });
      const originalBasis = (await store.currentProtected(
        'FinancialEligibility',
        recorded.targetRef!.id,
      ))!;
      expect(originalBasis.paymentBasisRefs).toHaveLength(100);
      mark('ALLOCATE_101');
      const added = await f.financial.allocatePaymentBatch(
        await f.actor(),
        f.allocationInput(allocated.targetRef!, [invoices[99]!], ['1']),
        f.ingress,
      );
      const lastAllocation = added.resultRefs.find(
        (value) => value.entity === 'PaymentAllocation',
      )!;
      const completeAllocations = await allProtected('PaymentAllocation');
      expect(completeAllocations).toHaveLength(101);
      expect(completeAllocations.some((value) => value.allocationId === lastAllocation.id)).toBe(
        true,
      );
      mark('ASSESS_101');
      await expect(
        repository.read((scope) =>
          f.eligibility.currentRecorded(scope, recorded.targetRef!, eligibilityInput),
        ),
      ).rejects.toMatchObject({ code: 'U4_ELIGIBILITY_STALE' });
      const currentInput = await f.eligibilityInput('PROVISION');
      const current = await f.eligibility.evaluateFinancialEligibility(
        await f.actor(),
        currentInput,
        f.ingress,
      );
      const currentBasis = (await store.currentProtected(
        'FinancialEligibility',
        current.targetRef!.id,
      ))!;
      expect(currentBasis.decision).toBe('ALLOW');
      expect(currentBasis.paymentBasisRefs).toHaveLength(101);
      expect(currentBasis.paymentBasisRefs).toContainEqual(lastAllocation);
      const facts = await store.list('FactEnvelope', {
        equals: { aggregateRef: current.targetRef },
      });
      expect(facts).toHaveLength(1);
      expect((facts[0]!.evidenceRefs as Ref[]).length).toBeGreaterThan(100);
      expect(
        (facts[0]!.evidenceRefs as Ref[]).filter((value) => value.entity === 'PaymentAllocation'),
      ).toHaveLength(101);
      expect(facts[0]!.evidenceRefs).toContainEqual(lastAllocation);
      mark('LEDGER');
      const ledger = await repository.read(async (scope) =>
        f.financial.ledger.payment(scope, await scope.current(added.targetRef!)),
      );
      expect(ledger).toMatchObject({
        principal: 1001n,
        allocated: 1000n,
        available: 1n,
        ra: 0n,
        ru: 0n,
        ha: 0n,
        hu: 0n,
      });
      expect(await f.financial.allocatePaymentBatch(await f.actor(), input, f.ingress)).toEqual(
        allocated,
      );
      expect(await allProtected('PaymentAllocation')).toHaveLength(101);
      const originalReceipt = (await store.currentProtected(
        'RequestReceipt',
        allocated.requestId,
      ))!;
      expect(originalReceipt.resultRefs).toEqual(allocated.resultRefs);
      const appendFunction = 'u1_append_entry(varchar,bigint,text,varchar,varchar,text)';
      const roles = ['u1_journal_append', 'u2_verify_journal_append', 'u4_verify_journal_append'];
      const granted = await sources.journalAdmin.query(
        "SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[]) AND has_function_privilege(oid,$2,'EXECUTE')",
        [roles, appendFunction],
      );
      try {
        mark('RESTORE');
        const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
        expect(report.entries).toBeGreaterThan(100);
        expect(
          await sources.primaryAdmin
            .getRepository('RequestReceipt')
            .findOneBy({ requestId: allocated.requestId }),
        ).toMatchObject(originalReceipt);
        expect(
          await sources.primaryAdmin
            .getRepository('FinancialEligibility')
            .findOneBy({ financialEligibilityId: current.targetRef!.id }),
        ).toMatchObject({ paymentBasisRefs: currentBasis.paymentBasisRefs, decision: 'ALLOW' });
        expect(
          (
            await sources.primaryAdmin.query(
              'SELECT enabled,auth_ready FROM u1_recovery_control WHERE singleton=true',
            )
          )[0],
        ).toMatchObject({ enabled: true, auth_ready: false });
      } finally {
        for (const { rolname } of granted)
          if (roles.includes(rolname))
            await sources.journalAdmin.query(
              'GRANT EXECUTE ON FUNCTION ' + appendFunction + ' TO "' + rolname + '"',
            );
        await sources.journalAdmin.query('TRUNCATE u1_restore_append_role');
      }
      mark('DONE');
      // 실제 명령·판단·복구 전체를 기존120초 안에서 검증한다. 단언이나 원본 대조는 생략하지 않는다.
    }, 120000);
  });

  it('정상100품목의 현재 순수조회와 실제 STAFF 판단은 전체 품목근거를 보존한다', async (context) => {
    const startedAt = performance.now();
    const mark = (stage: string) =>
      Object.assign(context.task.meta, {
        u4Boundary: {
          stage,
          enteredAtMs: Math.round(performance.now() - startedAt),
          completedInvoices: 0,
        },
      });
    mark('PREPARE');
    const f = await seedU4OwnerFacts(store, { lineCount: 100, onPreparationStage: mark });
    expect(f.lines).toHaveLength(100);
    const order = (await store.currentProtected('Order', f.orderRef.id))!;
    const actualLineRefs = order.lineRefs as Ref[];
    expect(actualLineRefs).toHaveLength(100);
    expect(new Set(actualLineRefs.map((value) => value.id)).size).toBe(100);
    expect(new Set(f.lines.map((value) => value.lineId)).size).toBe(100);
    expect(f.lines.map((value) => value.lineId).sort()).toEqual(
      actualLineRefs.map((value) => value.id).sort(),
    );
    expect(f.plan.total.value).toBe('100000');
    mark('ASSESS_100');
    const input = await f.eligibilityInput('SALE_ACCEPTANCE');
    const view = await f.eligibility.assessEligibility(await f.actor(), input, f.ingress);
    expect(view.decision).toBe('ALLOW');
    expect(view.basisRefs.length).toBeGreaterThan(100);
    expect(view.basisRefs.filter((value) => value.entity === 'OrderLine')).toHaveLength(100);
    const result = await f.eligibility.evaluateFinancialEligibility(
      await f.actor(),
      input,
      f.ingress,
    );
    const facts = await store.list('FactEnvelope', { equals: { aggregateRef: result.targetRef } });
    expect(facts).toHaveLength(1);
    expect((facts[0]!.evidenceRefs as Ref[]).length).toBeGreaterThan(100);
    expect(
      (facts[0]!.evidenceRefs as Ref[]).filter((value) => value.entity === 'OrderLine'),
    ).toHaveLength(100);
    expect(
      (
        await repository.read((scope) =>
          f.eligibility.currentRecorded(scope, result.targetRef!, input),
        )
      ).decision,
    ).toBe('ALLOW');
    mark('DONE');
  });

  it('기한이 끝난 STAFF 계산은 새 접수·판단·이력·Fact를 쓰기 전에 거절한다', async () => {
    const f = await seedU4OwnerFacts(store);
    const before = await counts();
    const actor = {
      ...(await f.actor()),
      deadlineAt: new Date(f.seller.now().getTime() - 1).toISOString(),
    };
    await expect(
      f.eligibility.evaluateFinancialEligibility(
        actor,
        await f.eligibilityInput('PROVISION'),
        f.ingress,
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_DEADLINE' });
    expect(await counts()).toEqual(before);
  });

  it('서버 근거가4MiB를 넘으면 보호접수 성공 전 전체 원상을 롤백한다', async () => {
    const f = await seedU4OwnerFacts(store);
    const before = await counts();
    const input = await f.eligibilityInput('PROVISION');
    const sourceRefs = Array.from({ length: 22000 }, (_, index) =>
      u4Ref(
        'FinancialSettlement',
        'PaymentAllocation',
        'x'.repeat(120) + String(index).padStart(8, '0'),
      ),
    );
    // 신뢰한 생산자 내부의 과대 결과를 주입하는 음성 경계다. 실제 원금/은행 원본으로 승격하지 않는다.
    await expect(
      f.access.run(
        await f.actor(),
        'evaluateFinancialEligibility',
        { kind: 'RECORD', recordRef: input.orderRef },
        input,
        f.ingress,
        async (scope, mutation) => {
          const data = {
            ...u4ModelFixture('FinancialEligibility', 'synthetic-oversized-basis'),
            orderRef: input.orderRef,
            agreementRevisionRef: input.agreementRevisionRef,
            planRevision: input.planRevision,
            targetScope: input.targetScope,
            historyRefs: [mutation.historyRef],
          };
          await scope.transaction.put('FinancialEligibility', data);
          const target = u4Ref(
            'FinancialSettlement',
            'FinancialEligibility',
            'synthetic-oversized-basis',
          );
          return { target, refs: [target], before: null, sourceRefs };
        },
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_SIZE' });
    expect(await counts()).toEqual(before);
    expect(
      await store.currentProtected('FinancialEligibility', 'synthetic-oversized-basis'),
    ).toBeNull();
    expect(input).not.toHaveProperty('sourceEvidence');
  });
});
