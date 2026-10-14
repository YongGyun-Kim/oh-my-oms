import { describe, expect, it } from 'vitest';
import {
  verifyU4CompletionLink,
  verifyU4InvoiceCompletionState,
  type ModelData,
} from '@oms/persistence';
import { u4ModelFixture } from '../fixtures/models.js';
import { u4Ref } from '../fixtures/contracts.js';

function fixture() {
  const basis = u4ModelFixture('FinancialCompletionBasis', 'invoice');
  const view = basis.completionView as { providedTranches: { trancheRef: unknown }[] };
  const h1 = u4Ref('FinancialSettlement', 'FinancialHistory', 'due-history');
  const h2 = u4Ref('FinancialSettlement', 'FinancialHistory', 'correction-history');
  const anchor: ModelData = {
    ...u4ModelFixture('Invoice', 'invoice'),
    revision: 2,
    orderRef: basis.orderRef,
    chargeTermsRef: basis.termsSnapshotRef,
    dueBasis: basis.dueBasis,
    dueDate: '2026-12-31',
    providedTrancheRefs: view.providedTranches.map((value) => value.trancheRef),
    historyRefs: [h1],
  };
  const anchorRef = u4Ref('FinancialSettlement', 'Invoice', 'invoice', 2);
  Object.assign(basis, { invoiceRef: anchorRef, historyRefs: [h1] });
  const corrected: ModelData = {
    ...anchor,
    revision: 3,
    dueDate: null,
    providedTrancheRefs: [],
    correctionOf: anchorRef,
    historyRefs: [h1, h2],
  };
  const correctedRef = u4Ref('FinancialSettlement', 'Invoice', 'invoice', 3);
  const dueHistory: ModelData = {
    ...u4ModelFixture('FinancialHistory', h1.id),
    afterRef: anchorRef,
    requestRef: 'due-request',
  };
  const correctionHistory: ModelData = {
    ...u4ModelFixture('FinancialHistory', h2.id),
    beforeRef: anchorRef,
    afterRef: correctedRef,
    correctionOf: h1,
    requestRef: 'correction-request',
  };
  const receipt = (id: string, operation: string, resultRefs: unknown[]): ModelData => ({
    requestId: id,
    owner: 'FinancialSettlement',
    operation,
    sourceContract: basis.sourceContract,
    targetScope: basis.targetScope,
    resultRefs,
  });
  const dueReceipt = receipt('due-request', 'reconcileInvoiceDue', [
    anchorRef,
    h1,
    u4Ref('FinancialSettlement', 'FinancialCompletionBasis', 'invoice'),
  ]);
  const correctionReceipt = receipt('correction-request', 'correctInvoice', [correctedRef, h2]);
  const images = new Map<string, ModelData>([
    ['Invoice/invoice/2', anchor],
    ['FinancialHistory/' + h1.id + '/1', dueHistory],
    ['FinancialHistory/' + h2.id + '/1', correctionHistory],
    ['RequestReceipt/due-request/1', dueReceipt],
    ['RequestReceipt/correction-request/1', correctionReceipt],
  ]);
  const read = async (model: string, id: string, revision: number) =>
    images.get([model, id, revision].join('/')) ?? null;
  return {
    basis,
    anchor,
    corrected,
    dueHistory,
    correctionHistory,
    dueReceipt,
    correctionReceipt,
    images,
    read,
  };
}

describe('기한 원래 근거와 후속 정상 청구 정정의 정확한 연결', () => {
  it('현재 계산 개정은 실제 기한 접수·이력·basis 결과 참조가 일치해야 한다', async () => {
    const f = fixture();
    expect(await verifyU4CompletionLink(f.anchor, f.basis, f.read)).toBe('CURRENT');
  });
  it('기한을 비운 정상 청구 정정은 원래 basis를 삭제하거나 새 계산으로 가장하지 않는다', async () => {
    const f = fixture();
    const before = structuredClone(f.basis);
    expect(await verifyU4CompletionLink(f.corrected, f.basis, f.read)).toBe('CORRECTED');
    expect(f.basis).toEqual(before);
  });
  it('원래 Invoice·기한 이력·기한 접수 중 하나라도 누락되면 과거 Ref만으로 허용하지 않는다', async () => {
    for (const key of [
      'Invoice/invoice/2',
      'FinancialHistory/due-history/1',
      'RequestReceipt/due-request/1',
    ]) {
      const f = fixture();
      f.images.delete(key);
      await expect(verifyU4CompletionLink(f.corrected, f.basis, f.read)).rejects.toMatchObject({
        code: 'U4_DUE_BASIS_MISSING',
      });
    }
    const empty = fixture();
    empty.basis.historyRefs = [];
    await expect(
      verifyU4CompletionLink(empty.corrected, empty.basis, empty.read),
    ).rejects.toMatchObject({ code: 'U4_DUE_BASIS_MISSING', status: 503 });
  });
  it('위조 작업명·다른 source 버전·접수 결과 누락은 정상 정정이 아니다', async () => {
    for (const patch of [
      { operation: 'reconcileInvoiceDue' },
      { sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 } },
      { resultRefs: [] },
    ]) {
      const f = fixture();
      Object.assign(f.correctionReceipt, patch);
      await expect(verifyU4CompletionLink(f.corrected, f.basis, f.read)).rejects.toMatchObject({
        code: 'U4_DUE_BASIS_MISSING',
      });
    }
  });
  it('다른 기업/의무·정정 beforeRef나 불변 이력 prefix 변경은 HOLD다', async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.corrected.targetScope = {
          ...(f.corrected.targetScope as object),
          enterpriseRef: u4Ref('EnterpriseAccess', 'Enterprise', 'other'),
        };
      },
      (f: ReturnType<typeof fixture>) => {
        f.corrected.obligationKey = 'other';
      },
      (f: ReturnType<typeof fixture>) => {
        f.correctionHistory.beforeRef = u4Ref('FinancialSettlement', 'Invoice', 'other', 2);
      },
      (f: ReturnType<typeof fixture>) => {
        f.corrected.historyRefs = [
          u4Ref('FinancialSettlement', 'FinancialHistory', 'other'),
          (f.corrected.historyRefs as unknown[])[1],
        ];
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(verifyU4CompletionLink(f.corrected, f.basis, f.read)).rejects.toMatchObject({
        code: 'U4_DUE_BASIS_MISSING',
      });
    }
  });
  it('중간 개정 공백·산출값의 임의 유지·이력 정정 연결 위조를 거절한다', async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.corrected.revision = 4;
      },
      (f: ReturnType<typeof fixture>) => {
        f.corrected.dueDate = '2026-12-31';
      },
      (f: ReturnType<typeof fixture>) => {
        f.correctionHistory.correctionOf = null;
      },
      (f: ReturnType<typeof fixture>) => {
        f.dueReceipt.resultRefs = [f.basis.invoiceRef];
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(verifyU4CompletionLink(f.corrected, f.basis, f.read)).rejects.toMatchObject({
        code: 'U4_DUE_BASIS_MISSING',
      });
    }
  });
  it('고정/미산출 구형 원상은 basis가 없어도 되지만 실제 기한 접수 뒤 누락은 HOLD다', async () => {
    const f = fixture();
    expect(
      await verifyU4InvoiceCompletionState(
        { ...f.anchor, historyRefs: [], dueDate: null },
        null,
        f.read,
      ),
    ).toBeNull();
    await expect(verifyU4InvoiceCompletionState(f.corrected, null, f.read)).rejects.toMatchObject({
      code: 'U4_DUE_BASIS_MISSING',
    });
  });
});
