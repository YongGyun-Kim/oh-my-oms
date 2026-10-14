'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiFailure } from './client.ts';
import type { BrowserApi } from './client.ts';
import type { CurrentEnterpriseContext, CustomerContextView, Page } from './ui-types.ts';
export function ContextPicker({
  api,
  onSelect,
  onManage,
  report,
}: {
  api: BrowserApi;
  onSelect: (context: CurrentEnterpriseContext | null) => void;
  onManage: () => void;
  report: (error: unknown) => void;
}) {
  const requestGeneration = useRef(0);
  const [page, setPage] = useState<Page<CustomerContextView> | null>(null);
  const [selected, setSelected] = useState<CustomerContextView | null>(null);
  const [busy, setBusy] = useState(false);
  async function reload(
    cursor: string | null = null,
    section: 'departments' | 'sites' | 'scopes' | null = null,
  ) {
    const generation = ++requestGeneration.current;
    setBusy(true);
    try {
      const query = new URLSearchParams({
        pageSize: '25',
        ...(section && selected
          ? {
              enterpriseRef: JSON.stringify(selected.enterpriseRef),
              [section === 'departments'
                ? 'departmentCursor'
                : section === 'sites'
                  ? 'siteCursor'
                  : 'scopeCursor']: cursor!,
            }
          : cursor
            ? { cursor }
            : {}),
      });
      const result = await api.read<Page<CustomerContextView>>(
        '/customer-enterprise-contexts?' + query,
      );
      if (generation !== requestGeneration.current) return;
      setPage(result);
      if (selected) {
        const current =
          result.items.find((value) => value.data.enterpriseRef.id === selected.enterpriseRef.id)
            ?.data ?? null;
        setSelected(current);
        onSelect(current);
      }
    } catch (error) {
      if (
        generation !== requestGeneration.current ||
        (error instanceof ApiFailure && error.superseded)
      )
        return;
      setPage(null);
      setSelected(null);
      onSelect(null);
      report(error);
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }
  useEffect(() => {
    void reload();
    return () => {
      requestGeneration.current++;
    };
  }, []);
  return (
    <section className="section" aria-busy={busy}>
      <h2>내 현재 기업 문맥</h2>
      <p>
        기업 신청 여부와 별개로 확인된 본인 소속과 현재 명시적 행위 범위만 조회합니다. 이 선택은
        거래 권한을 부여하지 않습니다.
      </p>
      <button className="secondary" disabled={busy} onClick={() => reload()}>
        현재 소속·행위 재확인
      </button>
      <label htmlFor="current-enterprise">현재 업무 기업 선택</label>
      <select
        id="current-enterprise"
        disabled={busy}
        value={selected?.enterpriseRef.id ?? ''}
        onChange={(event) => {
          const value =
            page?.items.find((item) => item.data.enterpriseRef.id === event.target.value)?.data ??
            null;
          setSelected(value);
          onSelect(value);
        }}
      >
        <option value="">본인 기업을 명시적으로 선택하세요</option>
        {page?.items.map((item) => (
          <option key={item.data.enterpriseRef.id} value={item.data.enterpriseRef.id}>
            {item.data.legalName}
          </option>
        ))}
      </select>
      {page && page.items.length === 0 && (
        <p>현재 확인된 소속·허용 문맥이 없습니다. 직원 또는 기업 관리자 확인이 필요합니다.</p>
      )}
      {page?.nextCursor && (
        <button disabled={busy} onClick={() => reload(page.nextCursor)}>
          다음 소속 기업 페이지
        </button>
      )}
      {selected && (
        <>
          <p>조회된 현재 행위: {selected.availableActions.join(', ') || '없음'}</p>
          {selected.managementAvailable && (
            <button className="secondary" onClick={onManage}>
              선택 기업의 허용 관리 업무 열기
            </button>
          )}
          <p>
            각 행위의 범위는 개별로 유지되며 서로 다른 부서·사업장 조합을 합쳐 권한을 만들지
            않습니다.
          </p>
          <ul>
            {selected.actionScopes.map((scope, index) => (
              <li key={index}>
                {scope.action} · {scope.kind} · 부서{' '}
                {scope.departmentRefs.map((ref) => ref.id).join(', ') || '미사용/전체 조건'} ·
                사업장 {scope.siteRefs.map((ref) => ref.id).join(', ') || '미사용/전체 조건'}
              </li>
            ))}
          </ul>
          {Object.entries(selected.sectionCursors).map(
            ([section, cursor]) =>
              cursor && (
                <button
                  key={section}
                  disabled={busy}
                  onClick={() => reload(cursor, section as 'departments' | 'sites' | 'scopes')}
                >
                  다음{' '}
                  {section === 'departments'
                    ? '허용 부서'
                    : section === 'sites'
                      ? '허용 사업장'
                      : '행위 범위'}{' '}
                  페이지
                </button>
              ),
          )}
        </>
      )}
    </section>
  );
}
