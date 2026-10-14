import { describe, expect, it, vi } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import {
  ProtectedTransaction,
  U4Transaction,
  U4Repository,
  U4_SOURCE_CONTRACT,
  type ProtectedStore,
  type ModelData,
  type WriteRequest,
} from '@oms/persistence';
import type { EntityManager } from 'typeorm';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Ref } from '../fixtures/contracts.js';

function scopeFixture() {
  let raw: ModelData | null = u4ModelFixture('FinancialPaymentBalance');
  const protectedImage = structuredClone(raw);
  const transaction = {
    get: vi.fn(async () => raw),
    financialProtectedImage: vi.fn(async () => protectedImage),
    rows: vi.fn(() => []),
    lockFinancialRows: vi.fn(async () => {}),
  };
  return {
    scope: new U4Transaction(transaction as unknown as ProtectedTransaction, {
      epoch: 'initial',
      prefixes: [{ epoch: 'initial', commitOrder: 1 }],
    }),
    transaction,
    setRaw: (next: ModelData | null) => {
      raw = next;
    },
    protectedImage,
  };
}
describe('U4 same-transaction repository premises', () => {
  it('reads protected images using the same transaction and captured prefix', async () => {
    const fixture = scopeFixture();
    expect(await fixture.scope.optional('FinancialPaymentBalance', 'payment')).toEqual(
      fixture.protectedImage,
    );
    expect(fixture.transaction.financialProtectedImage).toHaveBeenCalledWith(
      'FinancialPaymentBalance',
      'payment',
      [{ epoch: 'initial', commitOrder: 1 }],
    );
  });
  it('holds primary changes not included in the confirmed prefix', async () => {
    const fixture = scopeFixture();
    fixture.setRaw({ ...fixture.protectedImage, revision: 2 });
    await expect(
      fixture.scope.optional('FinancialPaymentBalance', 'payment'),
    ).rejects.toMatchObject({ code: 'CURRENT_U4_NOT_PROTECTED' });
  });
  it('refuses an owner/entity mismatch before reading data', async () => {
    const fixture = scopeFixture();
    await expect(
      fixture.scope.current(u4Ref('OrderAcceptance', 'PaymentEvidence')),
    ).rejects.toMatchObject({ code: 'U4_REFERENCE_OWNER' });
    expect(fixture.transaction.get).not.toHaveBeenCalled();
  });
  it('refuses a stale expected source revision', async () => {
    const fixture = scopeFixture();
    await expect(
      fixture.scope.current(u4Ref('FinancialSettlement', 'FinancialPaymentBalance', 'payment', 2)),
    ).rejects.toMatchObject({ code: 'STALE_U4_REFERENCE' });
  });
  it('rechecks premises after work and detects changed original bytes', async () => {
    const fixture = scopeFixture();
    await fixture.scope.optional('FinancialPaymentBalance', 'payment');
    fixture.setRaw({ ...fixture.protectedImage, revision: 2 });
    await expect(fixture.scope.assertPremises()).rejects.toMatchObject({
      code: 'U4_PREMISE_CHANGED',
    });
  });
  it('locks shared payment/invoice/approval rows in deterministic order', async () => {
    const query = vi.fn(async () => []);
    const transaction = new ProtectedTransaction(
      { query } as unknown as EntityManager,
      new SchemaValidator(),
      U4_SOURCE_CONTRACT,
    );
    await transaction.lockFinancialRows(['b', 'a', 'a'], ['invoice-b', 'invoice-a'], ['root']);
    expect(query.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      [['a', 'b']],
      [['invoice-a', 'invoice-b']],
      [['root']],
    ]);
    expect(String((query.mock.calls[0] as unknown[])[0])).toContain('financial_payment_balance');
    expect(String((query.mock.calls[2] as unknown[])[0])).toContain('financial_approval_balance');
  });
  it('rejects writes to another owner even when the protected callback ran', async () => {
    const transaction = {
      rows: () => [
        {
          model: 'Product',
          schemaVersion: 2,
          data: {},
          id: 'product',
          revision: 1,
          deleted: false,
        },
      ],
    } as unknown as ProtectedTransaction;
    const store = {
      schema: new SchemaValidator(),
      currentEpoch: async () => 'initial',
      primary: { query: async () => [] },
      execute: async (
        _request: unknown,
        operation: (tx: ProtectedTransaction, requestId: string) => Promise<void>,
      ) => {
        await operation(transaction, 'request');
        return { requestId: 'request', commitOrder: 1, replay: false };
      },
    } as unknown as ProtectedStore;
    const request: WriteRequest = {
      principalId: 'staff',
      audience: 'STAFF',
      owner: 'FinancialSettlement',
      operation: 'synthetic',
      target: null,
      idempotencyKey: 'key',
      input: {},
      correlationId: 'correlation',
      epoch: 'initial',
      sourceContract: U4_SOURCE_CONTRACT,
    };
    await expect(
      new U4Repository(store).mutate(
        request,
        async () => {},
        async () => {},
      ),
    ).rejects.toMatchObject({ code: 'U4_WRITE_OWNER' });
  });
});
