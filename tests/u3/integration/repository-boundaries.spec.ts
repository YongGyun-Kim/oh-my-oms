import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, ExecutionBudget } from '@oms/contracts';
import type { ServiceContext, U3ProductInput, Ref } from '@oms/contracts';
import { U3Commands, ref } from '@oms/core';
import { ProtectedStore, U3Repository, U3_SOURCE_CONTRACT, decodePayload } from '@oms/persistence';
import type { FaultBoundary, ModelData, U3Transaction, WriteRequest } from '@oms/persistence';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedU3CommandAuthority } from '../fixtures/command-authority.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';
import { modernProduct, modelFixture, capturedLine, priceBreakdown } from '../fixtures/models.js';
import { orderFixture, productFixture } from '../fixtures/commercial.js';

describe('U3 실제 접수 저장·현재 전제·실패/재전송 경계', () => {
  const sources = u3Sources();
  let store: ProtectedStore, authority: Awaited<ReturnType<typeof seedU3CommandAuthority>>;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    authority = await seedU3CommandAuthority(store);
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  const input = (): U3ProductInput => ({
    ...productFixture(),
    meta: { ...productFixture().meta, clientRequestId: randomUUID() },
  });
  const product = (
    commands: U3Commands,
    data: U3ProductInput,
    context = authority.staff,
    callback?: (scope: U3Transaction) => Promise<void>,
  ) =>
    commands.run(
      context,
      'ProductCatalog',
      'registerProduct',
      { kind: 'NONE' },
      data,
      { scope: null },
      async (scope) => {
        const value = { ...modernProduct(randomUUID()), label: data.label };
        await scope.transaction.put('Product', value);
        await callback?.(scope);
        return {
          target: ref('Product', value),
          refs: [ref('Product', value)],
          state: 'RESULT_RECORDED',
        };
      },
    );
  const request = (data = input()): WriteRequest => ({
    principalId: authority.staff.principalId,
    audience: 'STAFF',
    owner: 'ProductCatalog',
    operation: 'registerProduct',
    target: { kind: 'NONE' },
    idempotencyKey: data.meta.clientRequestId,
    input: data,
    correlationId: authority.staff.correlationId,
    epoch: 'initial',
    sourceContract: U3_SOURCE_CONTRACT,
  });
  const counts = async () =>
    await Promise.all(
      ['Product', 'CatalogHistory'].map(
        async (model) => (await store.list(model, { limit: 100 })).length,
      ),
    );
  function faulty(boundary: FaultBoundary, message: string) {
    let triggered = false;
    return new ProtectedStore(sources.primaryApp, sources.journalAppend, async (observed) => {
      if (!triggered && observed === boundary) {
        triggered = true;
        throw Error(message);
      }
    });
  }
  it('실제 registry3 명령은 상품/model2·원래 결과·이력·등록계약 사실을 한 보호 후보에 기록한다', async () => {
    const commands = new U3Commands(store, authority.now),
      data = input();
    const receipt = await product(commands, data);
    expect(await counts()).toEqual([1, 1]);
    const record = (await store.read('RequestReceipt', receipt.requestId))!;
    expect(record.sourceContract).toEqual(U3_SOURCE_CONTRACT);
    const saved = (
      await sources.primaryAdmin.query(
        'SELECT payload_text FROM u1_recovery_candidate WHERE request_id=$1',
        [receipt.requestId],
      )
    )[0];
    const payload = decodePayload(saved.payload_text, store.schema);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.sourceContract).toEqual(U3_SOURCE_CONTRACT);
    expect(payload.rows.map((row) => row.model)).toEqual([
      'Product',
      'CatalogHistory',
      'RequestReceipt',
      'FactEnvelope',
      'RequestKey',
    ]);
    expect(payload.rows.find((row) => row.model === 'Product')?.schemaVersion).toBe(2);
    expect(payload.rows.find((row) => row.model === 'FactEnvelope')?.data.sourceContract).toEqual(
      U3_SOURCE_CONTRACT,
    );
    await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      receipt.requestId,
      store.schema,
    );
  });
  it('업무 callback 실패는 상품·접수·이력·보호 후보를 전체 rollback한다', async () => {
    const commands = new U3Commands(store, authority.now),
      data = input();
    await expect(
      product(commands, data, authority.staff, async () => {
        throw Error('synthetic-apply-failure');
      }),
    ).rejects.toThrow('synthetic-apply-failure');
    expect(await counts()).toEqual([0, 0]);
    expect(
      await commands.original(
        authority.staff,
        'ProductCatalog',
        'registerProduct',
        { kind: 'NONE' },
        data,
        { scope: null },
      ),
    ).toMatchObject({ knowledge: 'UNKNOWN', requestId: null, reasonCode: 'NO_ORIGINAL' });
  });
  it('deferred FK 실패도 primary 접수/보호 후보 없는 전체 rollback이다', async () => {
    await expect(
      product(new U3Commands(store, authority.now), input(), authority.staff, async (scope) => {
        const missing = {
          ...modernProduct('missing-offer'),
          currentOfferRef: {
            owner: 'ProductCatalog',
            entity: 'CommonOfferRevision',
            id: 'absent',
            revision: 1,
          },
        };
        await scope.transaction.put('Product', missing);
      }),
    ).rejects.toThrow();
    expect(await counts()).toEqual([0, 0]);
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'registerProduct' } }),
    ).toHaveLength(0);
  });
  it('primary commit 뒤 장애는 성공을 반환하지 않으며 동일 key가 handler 재실행 없이 재보호한다', async () => {
    const data = input(),
      commands = new U3Commands(
        faulty('PRIMARY_COMMITTED', 'synthetic-primary-response-loss'),
        authority.now,
      );
    let calls = 0;
    await expect(
      product(commands, data, authority.staff, async () => {
        calls++;
      }),
    ).rejects.toThrow('synthetic-primary-response-loss');
    expect(await sources.primaryAdmin.getRepository('Product').count()).toBe(1);
    expect(await counts()).toEqual([0, 0]);
    const inquiry = await commands.original(
      authority.staff,
      'ProductCatalog',
      'registerProduct',
      { kind: 'NONE' },
      data,
      { scope: null },
    );
    expect(inquiry).toMatchObject({ knowledge: 'UNKNOWN', reasonCode: 'PROTECTION_UNCONFIRMED' });
    const replay = await product(commands, data, authority.staff, async () => {
      calls++;
    });
    expect(calls).toBe(1);
    expect(await counts()).toEqual([1, 1]);
    expect(replay.requestId).toBe(inquiry.knowledge === 'UNKNOWN' ? inquiry.requestId : null);
  });
  it('별도 보호 DB 연결 실패는 primary commit과 구분하고 같은 후보 대조 후에만 성공한다', async () => {
    const data = input(),
      journalFailure = new ProtectedStore(sources.primaryApp, sources.primaryApp),
      broken = new U3Commands(journalFailure, authority.now);
    await expect(product(broken, data)).rejects.toThrow();
    expect(await counts()).toEqual([0, 0]);
    expect(await new U3Repository(store).original(request(data))).toMatchObject({
      knowledge: 'UNKNOWN',
      reasonCode: 'PROTECTION_UNCONFIRMED',
    });
    const recovered = await product(
      new U3Commands(store, authority.now),
      data,
      authority.staff,
      async () => {
        throw Error('handler must not replay');
      },
    );
    expect(recovered.requestState).toBe('RESULT_RECORDED');
    expect(await counts()).toEqual([1, 1]);
  });
  it('primary commit 뒤 원래 실행 예산 만료는 보호 성공을 추정하지 않고 같은 접수로 회복한다', async () => {
    const data = input();
    let time = Date.now(),
      calls = 0;
    const constrained = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'PRIMARY_COMMITTED') time += 5001;
      },
    );
    await expect(
      new ExecutionBudget(5000, () => time).run(() =>
        product(new U3Commands(constrained, authority.now), data, authority.staff, async () => {
          calls++;
        }),
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_DEADLINE' });
    expect(await new U3Repository(store).original(request(data))).toMatchObject({
      knowledge: 'UNKNOWN',
      reasonCode: 'PROTECTION_UNCONFIRMED',
    });
    await product(new U3Commands(store, authority.now), data, authority.staff, async () => {
      calls++;
    });
    expect(calls).toBe(1);
    expect(await counts()).toEqual([1, 1]);
  });
  it.each(['JOURNAL_PROTECTED', 'VISIBILITY_UPDATED'] as const)(
    '%s 뒤 응답 유실은 원래 단일 접수/이력으로 대조한다',
    async (boundary) => {
      const data = input(),
        commands = new U3Commands(
          faulty(boundary, 'synthetic-protected-response-loss'),
          authority.now,
        );
      let calls = 0;
      await expect(
        product(commands, data, authority.staff, async () => {
          calls++;
        }),
      ).rejects.toThrow('synthetic-protected-response-loss');
      const replay = await product(commands, data, authority.staff, async () => {
        calls++;
      });
      expect(calls).toBe(1);
      expect(await counts()).toEqual([1, 1]);
      expect(
        await commands.original(
          authority.staff,
          'ProductCatalog',
          'registerProduct',
          { kind: 'NONE' },
          data,
          { scope: null },
        ),
      ).toEqual({ knowledge: 'KNOWN', receipt: replay });
    },
  );
  it('응답 뒤 연결 유실을 모사한 재제출과 inquiry는 보호된 동일 결과를 보존한다', async () => {
    const data = input(),
      commands = new U3Commands(store, authority.now);
    const receipt = await product(commands, data);
    const original = canonicalJson(await store.read('RequestReceipt', receipt.requestId));
    const replay = await product(commands, data, authority.staff, async () => {
      throw Error('reapply prohibited');
    });
    expect(replay).toEqual(receipt);
    expect(canonicalJson(await store.read('RequestReceipt', receipt.requestId))).toBe(original);
    expect(await counts()).toEqual([1, 1]);
  });
  it('동일 key의 다른 입력은 원래 결과를 보존하고 conflict로 끝난다', async () => {
    const data = input(),
      commands = new U3Commands(store, authority.now);
    const receipt = await product(commands, data);
    const changed = { ...data, label: '다른 상품' };
    await expect(product(commands, changed)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(
      commands.original(
        authority.staff,
        'ProductCatalog',
        'registerProduct',
        { kind: 'NONE' },
        changed,
        { scope: null },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect((await store.read('Product', receipt.targetRef!.id))?.label).toBe(data.label);
    expect(await counts()).toEqual([1, 1]);
  });
  it('동일 key의 동시 요청은 하나의 handler/상품/접수로 직렬화한다', async () => {
    const commands = new U3Commands(store, authority.now),
      data = input();
    let calls = 0;
    const results = await Promise.all([
      product(commands, data, authority.staff, async () => {
        calls++;
      }),
      product(commands, data, authority.staff, async () => {
        calls++;
      }),
    ]);
    expect(calls).toBe(1);
    expect(results[0]).toEqual(results[1]);
    expect(await counts()).toEqual([1, 1]);
  });
  it('동일 key의 경쟁하는 다른 내용은 하나만 접수하고 다른 요청은 conflict다', async () => {
    const commands = new U3Commands(store, authority.now),
      data = input();
    const results = await Promise.allSettled([
      product(commands, data),
      product(commands, { ...data, label: '다른 동시 입력' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await counts()).toEqual([1, 1]);
  });
  it('업무 수행 중 현재 직원 역할이 primary-only 변경되면 전체 접수를 중단한다', async () => {
    await expect(
      product(new U3Commands(store, authority.now), input(), authority.staff, async () => {
        await sources.primaryAdmin
          .getRepository('StaffRoleGrant')
          .update(
            { staffGrantId: authority.staffGrant.staffGrantId },
            { revokedAt: authority.now().toISOString(), revision: 2 },
          );
      }),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    expect(await counts()).toEqual([0, 0]);
  });
  it('현재 권한 회수 뒤에는 이전 성공 결과도 반환하지 않는다', async () => {
    const commands = new U3Commands(store, authority.now),
      data = input();
    await product(commands, data);
    await sources.primaryAdmin
      .getRepository('StaffRoleGrant')
      .update(
        { staffGrantId: authority.staffGrant.staffGrantId },
        { revokedAt: authority.now().toISOString(), revision: 2 },
      );
    await expect(
      commands.original(
        authority.staff,
        'ProductCatalog',
        'registerProduct',
        { kind: 'NONE' },
        data,
        { scope: null },
      ),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
  });
  it('원래 읽은 current Ref의 primary-only 변동은 새 변경/이력을 전체 rollback한다', async () => {
    const commands = new U3Commands(store, authority.now),
      first = await product(commands, input());
    await expect(
      product(commands, input(), authority.staff, async (scope) => {
        await scope.current(first.targetRef!);
        await sources.primaryAdmin
          .getRepository('Product')
          .update({ productId: first.targetRef!.id }, { label: '보호되지 않은 변경', revision: 2 });
      }),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    expect(await store.list('CatalogHistory')).toHaveLength(1);
    expect(await store.read('Product', first.targetRef!.id)).toMatchObject({ revision: 1 });
    expect(await sources.primaryAdmin.getRepository('Product').count()).toBe(1);
  });
  it('같은 개정을 기대한 동시 변경은 하나만 반영하고 stale 적용을 거절한다', async () => {
    const commands = new U3Commands(store, authority.now),
      first = await product(commands, input()),
      target = first.targetRef!;
    const revise = (label: string) => {
      const data = { ...input(), label, meta: { ...input().meta, expectedRevision: 1 } };
      return commands.run(
        authority.staff,
        'ProductCatalog',
        'reviseProduct',
        { kind: 'RECORD', recordRef: target },
        data,
        { scope: null },
        async (scope) => {
          const current = await scope.transaction.get('Product', target.id),
            changed = { ...current!, label, revision: 2 };
          await scope.transaction.put('Product', changed, 1);
          return {
            target: ref('Product', changed),
            refs: [ref('Product', changed)],
            state: 'RESULT_RECORDED',
          };
        },
      );
    };
    const results = await Promise.allSettled([revise('개정 A'), revise('개정 B')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = (
      results.find((result) => result.status === 'rejected') as PromiseRejectedResult
    ).reason;
    // A contender can observe the first primary commit before its separate
    // protection ack, or the protected revision2 after that ack. Both refuse
    // stale application; neither state authorizes another mutation.
    expect(['STALE_U3_REFERENCE', 'CURRENT_AUTH_NOT_PROTECTED']).toContain(refused.code);
    expect((await store.read('Product', target.id))?.revision).toBe(2);
    expect(await store.list('CatalogHistory')).toHaveLength(2);
  });
  it('다른 소유자 쓰기는 최종 원자 commit 전에 거절한다', async () => {
    const repo = new U3Repository(store);
    await expect(
      repo.mutate(
        request(),
        async () => {},
        async (scope) => {
          const current = (await scope.transaction.get('Account', authority.staff.principalId))!;
          await scope.transaction.put(
            'Account',
            { ...current, displayName: '직접 변경', revision: 2 },
            1,
          );
        },
      ),
    ).rejects.toMatchObject({ code: 'U3_WRITE_OWNER' });
    expect((await store.read('Account', authority.staff.principalId))?.revision).toBe(1);
  });
  it('writer fence/다른 epoch는 callback 실행이나 접수를 허용하지 않는다', async () => {
    const repo = new U3Repository(store);
    let calls = 0;
    await expect(
      repo.mutate(
        { ...request(), epoch: 'not-current' },
        async () => {},
        async () => {
          calls++;
        },
      ),
    ).rejects.toMatchObject({ code: 'WRITER_FENCED' });
    await sources.primaryAdmin.query('UPDATE u1_recovery_control SET enabled=false');
    await expect(
      product(new U3Commands(store, authority.now), input(), authority.staff, async () => {
        calls++;
      }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
    expect(await sources.primaryAdmin.getRepository('Product').count()).toBe(0);
  });
  it('보호 확인 뒤 복구 epoch가 바뀌어도 이전 세대로 성공을 반환하지 않는다', async () => {
    const data = input();
    const fenced = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'VISIBILITY_UPDATED')
          await sources.primaryAdmin.query(
            "UPDATE u1_recovery_control SET epoch='different-epoch'",
          );
      },
    );
    await expect(product(new U3Commands(fenced, authority.now), data)).rejects.toMatchObject({
      code: 'WRITER_FENCED',
    });
    expect(await sources.primaryAdmin.getRepository('Product').count()).toBe(1);
    const saved = (
      await sources.primaryAdmin.query(
        'SELECT request_id,payload_text FROM u1_recovery_candidate ORDER BY commit_order DESC LIMIT 1',
      )
    )[0];
    await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      saved.request_id,
      store.schema,
    );
  });
  it('고객/SYSTEM·만료 문맥은 직원 상품 등록 경로를 우회하지 못한다', async () => {
    const commands = new U3Commands(store, authority.now);
    for (const context of [
      authority.customer,
      { ...authority.staff, audience: 'SYSTEM' } as ServiceContext,
      { ...authority.staff, deadlineAt: '2000-01-01T00:00:00.000Z' },
    ])
      await expect(product(commands, input(), context)).rejects.toThrow();
    expect(await counts()).toEqual([0, 0]);
  });
  it('기업/조직 TargetScope가 다르거나 미사용 축에 조직을 넣으면 접수하지 않는다', async () => {
    const commands = new U3Commands(store, authority.now),
      data = orderFixture();
    const scope = {
      ...data.targetScope,
      enterpriseRef: authority.enterpriseRef,
      contextPolicyRef: authority.enterpriseRef,
      organisationRevision: authority.enterpriseRef.revision,
    };
    for (const changed of [
      { ...scope, enterpriseRef: { ...authority.enterpriseRef, id: 'other-enterprise' } },
      {
        ...scope,
        departmentRef: {
          owner: 'EnterpriseAccess',
          entity: 'Department',
          id: 'absent',
          revision: 1,
        },
      },
    ]) {
      await expect(
        commands.run(
          authority.customer,
          'OrderAcceptance',
          'submitOrder',
          { kind: 'NONE' },
          { ...data, targetScope: changed },
          { scope: changed },
          async () => {
            throw Error('apply must not run');
          },
        ),
      ).rejects.toThrow();
    }
    expect(await store.list('Order')).toHaveLength(0);
  });
  it('합성 주문 전체 행/최초 스냅샷/선택/접수/이력/fact/work/outbox는 같은 후보에서 원자 보호된다', async () => {
    // Storage graph verification only. This deliberately does not claim that
    // contract, provision, price approval, or external owner facts are genuine.
    const commands = new U3Commands(store, authority.now),
      data = orderFixture();
    data.meta.clientRequestId = randomUUID();
    data.targetScope = {
      ...data.targetScope,
      enterpriseRef: authority.enterpriseRef,
      contextPolicyRef: authority.enterpriseRef,
      organisationRevision: authority.enterpriseRef.revision,
    };
    const line = capturedLine();
    line.agreementRevisionRefs = [];
    line.conditionBindings = line.conditionBindings.filter(
      (binding) => binding.sourceRef.entity === 'CommonOfferRevision',
    );
    data.lines = [
      {
        productRef: line.productRef,
        commonOfferRevisionRef: line.commonOfferRevisionRef,
        agreementRevisionRefs: line.agreementRevisionRefs,
        conditionBindings: line.conditionBindings,
        quantity: line.quantity,
        paymentMode: line.paymentMode,
        requestedActivationDate: line.requestedActivationDate,
      },
    ];
    await store.execute(
      { ...request(), operation: 'fixture-storage-sources', idempotencyKey: randomUUID() },
      async (tx) => {
        await tx.put('Product', modernProduct(line.productRef.id));
        const offer = {
          ...modelFixture('CommonOfferRevision'),
          offerRevisionId: line.commonOfferRevisionRef.id,
          productRef: line.productRef,
          conditionBindings: line.conditionBindings,
        };
        await tx.put('CommonOfferRevision', offer);
      },
    );
    const receipt = await commands.run(
      authority.customer,
      'OrderAcceptance',
      'submitOrder',
      { kind: 'NONE' },
      data,
      { scope: data.targetScope },
      async (scope, requestId) => {
        const id = randomUUID(),
          orderRef: Ref = { owner: 'OrderAcceptance', entity: 'Order', id, revision: 1 };
        const orderLine: ModelData = {
          ...modelFixture('OrderLine'),
          ...line,
          requestedPaymentMode: line.paymentMode,
          orderRef,
          lineId: randomUUID(),
          position: 1,
        };
        delete orderLine.paymentMode;
        const terms = {
          ...modelFixture('PurchaseTermsSnapshot'),
          purchaseTermsId: randomUUID(),
          orderRef,
          capturedLines: [line],
          agreementRevisionRefs: [],
          catalogRevisionRefs: [line.commonOfferRevisionRef],
          conditionBindings: line.conditionBindings,
          priceBreakdown: priceBreakdown(),
        };
        const choice = {
          ...modelFixture('ProvisionChoice'),
          provisionChoiceId: randomUUID(),
          orderRef,
          effectiveRevisionRef: ref('PurchaseTermsSnapshot', terms),
        };
        const order = {
          ...modelFixture('Order'),
          orderId: id,
          enterpriseRef: authority.enterpriseRef,
          requesterAccountRef: authority.customer.actorAccountRef,
          submissionRequestId: requestId,
          targetScope: data.targetScope,
          submittedAt: authority.now().toISOString(),
          lineRefs: [ref('OrderLine', orderLine)],
          purchaseTermsRef: ref('PurchaseTermsSnapshot', terms),
          provisionChoiceRef: ref('ProvisionChoice', choice),
          acceptanceRef: null,
          state: 'REVIEW',
          changeApplicationRefs: [],
        };
        await scope.transaction.put('Order', order);
        await scope.transaction.put('OrderLine', orderLine);
        await scope.transaction.put('PurchaseTermsSnapshot', terms);
        await scope.transaction.put('ProvisionChoice', choice);
        return {
          target: orderRef,
          refs: [
            orderRef,
            ref('OrderLine', orderLine),
            ref('PurchaseTermsSnapshot', terms),
            ref('ProvisionChoice', choice),
          ],
          state: 'REVIEW_REQUIRED',
          notice: true,
        };
      },
    );
    const candidate = (
      await sources.primaryAdmin.query(
        'SELECT payload_text FROM u1_recovery_candidate WHERE request_id=$1',
        [receipt.requestId],
      )
    )[0];
    const payload = decodePayload(candidate.payload_text, store.schema);
    expect(payload.rows.map((row) => row.model)).toEqual([
      'Order',
      'OrderLine',
      'PurchaseTermsSnapshot',
      'ProvisionChoice',
      'OrderHistory',
      'RequestReceipt',
      'FactEnvelope',
      'ExecutionPermit',
      'WorkItem',
      'OutboxDelivery',
      'RequestKey',
    ]);
    expect(
      payload.rows
        .filter((row) => ['RequestReceipt', 'FactEnvelope', 'WorkItem'].includes(row.model))
        .every(
          (row) => canonicalJson(row.data.sourceContract) === canonicalJson(U3_SOURCE_CONTRACT),
        ),
    ).toBe(true);
    expect((await store.read('Order', receipt.targetRef!.id))?.targetScope).toEqual(
      data.targetScope,
    );
    expect(await store.list('OrderLine')).toHaveLength(1);
    await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      receipt.requestId,
      store.schema,
    );
  });
});
