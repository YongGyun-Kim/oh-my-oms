'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Receipt, TargetScope } from '@oms/contracts';
import type { BrowserApi } from './client.ts';
import type { Known, ProductView, ReviewView } from './ui-types.ts';
import { OriginalCommandResult, useBusinessCommand } from './business-command.tsx';
import { commandMeta, ReasonField } from './forms.tsx';
import { formatKrw } from './catalog-panel.tsx';
import { startProgressPolling } from './polling.ts';
interface DraftLine {
  product: ProductView;
  quantity: number;
  paymentMode: 'PREPAY' | 'POSTPAY';
  activation: string;
}
const reasonText: Record<string, string> = {
  UNVERIFIED: '미확인 조건',
  SPECIAL_CONDITION: '특례 조건',
  CONFLICT: '상충 조건',
  TECHNICAL_FAILURE: '조건 조회 실패',
};
export function OrderPanel({
  api,
  audience,
  scope,
  selectedProducts,
  onRemove,
  onNewDraft,
  report,
  active,
}: {
  active: boolean;
  api: BrowserApi;
  audience: 'CUSTOMER' | 'STAFF';
  scope: TargetScope | null;
  selectedProducts: ProductView[];
  onRemove: (id: string) => void;
  onNewDraft: () => void;
  report: (error: unknown) => void;
}) {
  const command = useBusinessCommand(api, report);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [view, setView] = useState<ReviewView | null>(null);
  const [orderId, setOrderId] = useState('');
  const [lookupInput, setLookupInput] = useState('');
  useEffect(() => {
    setLines((previous) =>
      selectedProducts.map(
        (product) =>
          previous.find((line) => line.product.productRef.id === product.productRef.id) ?? {
            product,
            quantity: 1,
            paymentMode: 'PREPAY',
            activation: '',
          },
      ),
    );
    setReviewing(false);
  }, [selectedProducts]);
  useEffect(() => {
    setReviewing(false);
  }, [JSON.stringify(scope)]);
  useEffect(() => {
    if (command.result?.owner === 'OrderAcceptance' && command.result.targetRef) {
      setReceipt(command.result);
      setOrderId(command.result.targetRef.id);
      setLookupInput(command.result.targetRef.id);
    }
  }, [command.result]);
  async function reload(id = orderId) {
    if (!id) return;
    try {
      const result = await api.read<Known<ReviewView>>(
        '/orders/' + encodeURIComponent(id) + '/review-assessment',
      );
      setView(result.data);
    } catch (error) {
      setView(null);
      report(error);
    }
  }
  useEffect(() => {
    if (!active) {
      setView(null);
      return;
    }
    if (!orderId) return;
    void reload(orderId);
    return startProgressPolling(
      () => reload(orderId),
      () => active && document.visibilityState === 'visible',
      () => Date.now(),
      report,
    );
  }, [orderId, active]);
  function change(index: number, values: Partial<DraftLine>) {
    setLines((previous) =>
      previous.map((line, i) => (i === index ? { ...line, ...values } : line)),
    );
    setReviewing(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (receipt || !scope || lines.length === 0) return;
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    const data = new FormData(event.currentTarget);
    const meta = commandMeta(data);
    setBusy(true);
    try {
      const result = await command.execute(
        'OrderAcceptance',
        'submitOrder',
        { kind: 'NONE' },
        '/orders',
        {
          meta,
          targetScope: scope,
          productType: lines[0]!.product.productType,
          lines: lines.map((line) => ({
            productRef: line.product.productRef,
            commonOfferRevisionRef: line.product.commonOfferRevisionRef,
            agreementRevisionRef: null,
            quantity: line.quantity,
            paymentMode: line.paymentMode,
            requestedActivationDate:
              line.product.productType === 'SOFTWARE' && line.activation ? line.activation : null,
          })),
          provisionChoice: 'FULL',
          partialConsentRef: null,
        },
      );
      setReceipt(result);
      setOrderId(result.targetRef!.id);
      setLookupInput(result.targetRef!.id);
      await reload(result.targetRef!.id);
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section" aria-busy={busy}>
      <h2>{audience === 'STAFF' ? '주문 전체 조건 확인' : '주문 작성·원래 진행 조회'}</h2>
      {audience === 'CUSTOMER' && lines.length > 0 && (
        <form onSubmit={submit}>
          <fieldset disabled={!!receipt}>
            <legend>주문 초안</legend>
            <p>
              하드웨어와 소프트웨어는 별도 주문입니다. 주문당 최대100개 상품 항목이며 구매 수량과
              구별합니다.
            </p>
            {lines.map((line, index) => (
              <fieldset key={line.product.productRef.id + ':' + index}>
                <legend>
                  {index + 1}. {line.product.label}
                </legend>
                <p>
                  등록 공통 가격: {formatKrw(line.product.commonPrice.value)} · 기업 적용 조건:
                  미확인
                </p>
                <label htmlFor={'quantity-' + index}>구매 수량</label>
                <input
                  id={'quantity-' + index}
                  type="number"
                  min={1}
                  max={Number.MAX_SAFE_INTEGER}
                  required
                  value={line.quantity}
                  onChange={(event) => change(index, { quantity: Number(event.target.value) })}
                />
                <label htmlFor={'payment-' + index}>요청 지급 방식</label>
                <select
                  id={'payment-' + index}
                  value={line.paymentMode}
                  onChange={(event) =>
                    change(index, { paymentMode: event.target.value as DraftLine['paymentMode'] })
                  }
                >
                  <option value="PREPAY">선불</option>
                  <option value="POSTPAY">후불</option>
                </select>
                {line.product.productType === 'SOFTWARE' && (
                  <>
                    <label htmlFor={'activation-' + index}>요청 활성화 날짜</label>
                    <input
                      id={'activation-' + index}
                      type="date"
                      value={line.activation}
                      onChange={(event) => change(index, { activation: event.target.value })}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    onRemove(line.product.productRef.id);
                    setReviewing(false);
                  }}
                >
                  이 상품 항목 제거
                </button>
              </fieldset>
            ))}
            <p>
              전체 상품이 준비되는 일괄 제공을 요청합니다. 실제 공급·가격·계약·지급·발급 조건은
              담당자의 전체 확인이 필요합니다.
            </p>
            <ReasonField />
            {reviewing && (
              <section aria-label="주문 전체 검토">
                <h3>전체 주문 검토</h3>
                <p>{lines.length}개 상품 항목 · 전체 일괄 제공 요청</p>
                <p>
                  아직 확인되지 않은 기업 적용 가격과 공급 조건을 확인된 것으로 간주하지 않습니다.
                </p>
              </section>
            )}
            <button
              disabled={!!receipt || busy || !scope || lines.length > 100 || !!command.pending}
            >
              {reviewing ? '검토한 전체 주문 제출' : '전체 주문 검토'}
            </button>
          </fieldset>
        </form>
      )}
      {receipt && (
        <button
          type="button"
          disabled={busy || !!command.pending}
          onClick={() => {
            onNewDraft();
            setReceipt(null);
            setReviewing(false);
            command.beginNewIntent();
          }}
        >
          접수된 주문과 별도로 새 주문 작성
        </button>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const original = lookupInput.trim();
          setOrderId(original);
          setView(null);
          void reload(original);
        }}
      >
        <label htmlFor="originalOrder">원래 주문번호</label>
        <input
          id="originalOrder"
          value={lookupInput}
          onChange={(event) => setLookupInput(event.target.value)}
          maxLength={128}
          required
        />
        <button className="secondary" disabled={busy}>
          원래 주문 결과 재확인
        </button>
      </form>
      {receipt && (
        <p className="pending" role="status">
          접수번호: {receipt.requestId} · 전체 조건 확인 대기. 판매 확정·지급 확인·상품 제공 완료는
          아직 확인되지 않았습니다.
        </p>
      )}
      {view && (
        <section>
          <h3>전체 확인 대기 사유</h3>
          <p className="pending">{view.lines.length}개 상품 항목 전체 조건 확인 대기</p>
          <ul>
            {view.lines.map((line, index) => (
              <li key={line.lineRef.id}>
                <strong>
                  상품 항목 {index + 1} · {line.quantity}개
                </strong>
                <ul>
                  {line.assessments.map((assessment, i) => (
                    <li key={i}>{reasonText[assessment.reasonKind] ?? '조건 확인 필요'}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p>남은 조치: 담당자의 모든 상품 조건 확인</p>
        </section>
      )}
      <OriginalCommandResult command={command} />
    </section>
  );
}
