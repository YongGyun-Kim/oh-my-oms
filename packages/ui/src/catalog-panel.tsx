'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { TargetScope } from '@oms/contracts';
import type { BrowserApi } from './client.ts';
import type { Page, ProductView } from './ui-types.ts';
import { OriginalCommandResult, useBusinessCommand } from './business-command.tsx';
import { commandMeta, ReasonField } from './forms.tsx';
export function formatKrw(value: string): string {
  const [integer, decimal] = value.split('.');
  return (
    integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    (decimal === undefined ? '' : '.' + decimal) +
    '원'
  );
}
export function CatalogPanel({
  api,
  audience,
  scope,
  onChoose,
  report,
  active,
}: {
  active: boolean;
  api: BrowserApi;
  audience: 'CUSTOMER' | 'STAFF';
  scope: TargetScope | null;
  onChoose: (product: ProductView) => void;
  report: (error: unknown) => void;
}) {
  const command = useBusinessCommand(api, report);
  const [page, setPage] = useState<Page<ProductView> | null>(null);
  const [busy, setBusy] = useState(false);
  const [productType, setProductType] = useState('HARDWARE');
  async function reload(cursor: string | null = null) {
    try {
      const query = new URLSearchParams({
        pageSize: '25',
        ...(cursor ? { cursor } : {}),
        ...(scope ? { scope: JSON.stringify(scope) } : {}),
      });
      setPage(await api.read<Page<ProductView>>('/products?' + query));
    } catch (error) {
      setPage(null);
      report(error);
    }
  }
  useEffect(() => {
    setPage(null);
  }, [
    active,
    scope?.enterpriseRef.id,
    scope?.organisationRevision,
    scope?.departmentRef?.id,
    scope?.siteRef?.id,
  ]);
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const meta = commandMeta(data);
    setBusy(true);
    try {
      await command.execute('ProductCatalog', 'registerProduct', { kind: 'NONE' }, '/products', {
        meta,
        productType,
        softwareTermKind: productType === 'SOFTWARE' ? data.get('softwareTermKind') : null,
        label: data.get('label'),
        salesDescription: data.get('description'),
        commonPrice: { currency: 'KRW', value: data.get('price') },
        salesConditionRefs: [],
      });
      await reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section" aria-busy={busy}>
      <h2>{audience === 'STAFF' ? '판매 상품 관리' : '판매 상품'}</h2>
      {audience === 'STAFF' && (
        <form onSubmit={register}>
          <label htmlFor="productType">상품 타입</label>
          <select
            id="productType"
            value={productType}
            onChange={(event) => setProductType(event.target.value)}
          >
            <option value="HARDWARE">하드웨어</option>
            <option value="SOFTWARE">소프트웨어</option>
          </select>
          {productType === 'SOFTWARE' && (
            <>
              <label htmlFor="softwareTermKind">소프트웨어 이용형</label>
              <select id="softwareTermKind" name="softwareTermKind" required defaultValue="">
                <option value="">이용형 선택</option>
                <option value="PERPETUAL">영구형</option>
                <option value="TERM">기간제</option>
              </select>
            </>
          )}
          <label htmlFor="productLabel">상품 이름</label>
          <input id="productLabel" name="label" required maxLength={4096} />
          <label htmlFor="description">판매 설명</label>
          <textarea id="description" name="description" required rows={3} maxLength={4096} />
          <label htmlFor="price">공통 가격 (원)</label>
          <input
            id="price"
            name="price"
            inputMode="decimal"
            required
            pattern="[0-9]+([.][0-9]{1,2})?"
          />
          <ReasonField />
          <button disabled={busy || !!command.pending}>판매 상품 등록</button>
        </form>
      )}
      <button
        className="secondary"
        disabled={busy || (audience === 'CUSTOMER' && !scope)}
        onClick={() => reload()}
      >
        현재 판매 상품 조회
      </button>
      {audience === 'CUSTOMER' && !scope && <p>먼저 자기 기업과 주문 조직 문맥을 선택해 주세요.</p>}
      {page && (
        <div className="table-scroll" tabIndex={0} aria-label="판매 상품 표">
          <table>
            <caption>현재 권한의 판매 상품</caption>
            <thead>
              <tr>
                <th>상품</th>
                <th>타입·이용형</th>
                <th>공통 가격</th>
                <th>기업 적용 가격</th>
                <th>행동</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.data.productRef.id}>
                  <td>
                    {item.data.label}
                    <p className="muted">{item.data.salesDescription}</p>
                  </td>
                  <td>
                    {item.data.productType === 'HARDWARE' ? '하드웨어' : '소프트웨어'}{' '}
                    {item.data.softwareTermKind === 'TERM'
                      ? '기간제'
                      : item.data.softwareTermKind === 'PERPETUAL'
                        ? '영구형'
                        : ''}
                  </td>
                  <td>{formatKrw(item.data.commonPrice.value)}</td>
                  <td>
                    {item.data.resolvedPrice
                      ? formatKrw(item.data.resolvedPrice.value)
                      : '미확인 · 담당자 조건 확인 필요'}
                  </td>
                  <td>
                    {audience === 'CUSTOMER' && (
                      <button disabled={busy} onClick={() => onChoose(item.data)}>
                        주문에 추가
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {page.items.length === 0 && <p>조회한 범위의 판매 상품이 없습니다.</p>}
          {page.nextCursor && (
            <button onClick={() => reload(page.nextCursor)}>다음 상품 페이지</button>
          )}
        </div>
      )}
      <OriginalCommandResult command={command} />
    </section>
  );
}
