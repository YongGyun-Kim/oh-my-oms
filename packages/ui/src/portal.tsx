'use client';
import { useEffect, useRef, useState } from 'react';
import type { Ref, TargetScope } from '@oms/contracts';
import { ApiFailure, BrowserApi } from './client.ts';
import { Login } from './login.tsx';
import { RecoveryClaim } from './recovery-claim.tsx';
import { InvitationAcceptance } from './invitation-acceptance.tsx';
import { ApplicationPanel } from './application-panel.tsx';
import { EnterprisePanel } from './enterprise-panel.tsx';
import { CatalogPanel } from './catalog-panel.tsx';
import { StaffRolePanel } from './staff-role-panel.tsx';
import { OrderPanel } from './order-panel.tsx';
import { ContextPicker } from './context-picker.tsx';
import { NoticePanel } from './notice-panel.tsx';
import { emptyRead } from './forms.tsx';
import type { IdentityView, Known, ProductView, CurrentEnterpriseContext } from './ui-types.ts';
export function Portal({ audience }: { audience: 'CUSTOMER' | 'STAFF' }) {
  const api = useRef(new BrowserApi()).current;
  const authenticationGeneration = useRef(0);
  const [identity, setIdentity] = useState<IdentityView | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitationToken, setInvitationToken] = useState('');
  const [error, setError] = useState('');
  const [enterprise, setEnterprise] = useState<Ref | null>(null);
  const [context, setContext] = useState<CurrentEnterpriseContext | null>(null);
  const [department, setDepartment] = useState('');
  const [site, setSite] = useState('');
  const [tab, setTab] = useState(audience === 'STAFF' ? 'roles' : 'applications');
  const [products, setProducts] = useState<ProductView[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  function clearProtected() {
    authenticationGeneration.current++;
    setLoading(false);
    api.reset();
    api.originals.suspend();
    setIdentity(null);
    setEnterprise(null);
    setContext(null);
    setProducts([]);
    setDepartment('');
    setSite('');
  }
  function report(failure: unknown) {
    if (failure instanceof ApiFailure && failure.superseded) return;
    setError(failure instanceof Error ? failure.message : '업무 결과를 확인할 수 없습니다.');
    if (failure instanceof ApiFailure && failure.status === 401) clearProtected();
  }
  async function authenticated(): Promise<void> {
    const generation = ++authenticationGeneration.current;
    try {
      const result = await api.read<Known<IdentityView>>('/identity');
      if (generation !== authenticationGeneration.current) return;
      if (!result.data.accountRef || result.data.phase !== 'MFA_VERIFIED')
        throw new ApiFailure(401, '현재 계정을 다시 확인하세요.');
      api.originals.activate(audience, result.data.accountRef.id);
      setIdentity(result.data);
      setError('');
    } catch (failure) {
      if (generation === authenticationGeneration.current) report(failure);
    } finally {
      if (generation === authenticationGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    const query = new URLSearchParams(window.location.search),
      raw = query.get('invitationToken');
    if (query.has('invitationToken')) {
      query.delete('invitationToken');
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + (query.size ? '?' + query.toString() : ''),
      );
      if (audience === 'CUSTOMER' && raw && /^[A-Za-z0-9_-]{43}$/.test(raw)) {
        setInvitationToken(raw);
        setTab('invitation');
      }
    }
    const leave = () => {
      clearProtected();
      setInvitationToken('');
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) void authenticated();
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', show);
    void authenticated();
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', show);
      authenticationGeneration.current++;
      api.reset();
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [tab, identity]);
  const selectedDepartment =
    context?.departments.find((value) => value.recordRef.id === department && value.active)
      ?.recordRef ?? null;
  const selectedSite =
    context?.sites.find((value) => value.recordRef.id === site && value.active)?.recordRef ?? null;
  const scope: TargetScope | null =
    context &&
    context.orderingContextPolicy.departmentUsage !== 'UNSET' &&
    context.orderingContextPolicy.siteUsage !== 'UNSET' &&
    (context.orderingContextPolicy.departmentUsage === 'NOT_USED' || selectedDepartment) &&
    (context.orderingContextPolicy.siteUsage === 'NOT_USED' || selectedSite)
      ? {
          enterpriseRef: context.enterpriseRef,
          contextPolicyRef: context.enterpriseRef,
          organisationRevision: context.enterpriseRef.revision,
          departmentRef:
            context.orderingContextPolicy.departmentUsage === 'USED' ? selectedDepartment : null,
          siteRef: context.orderingContextPolicy.siteUsage === 'USED' ? selectedSite : null,
        }
      : null;
  function add(product: ProductView) {
    if (products.length && products[0]!.productType !== product.productType) {
      report(
        new ApiFailure(
          400,
          '하드웨어와 소프트웨어는 별도 주문으로 제출합니다. 작성 중인 주문을 먼저 확인해 주세요.',
        ),
      );
      return;
    }
    if (!products.some((value) => value.productRef.id === product.productRef.id))
      setProducts((previous) => [...previous, product]);
    setTab('orders');
  }
  if (loading)
    return (
      <main>
        <p role="status">현재 인증을 확인하고 있습니다.</p>
      </main>
    );
  if (!identity)
    return (
      <main>
        <Login api={api} audience={audience} onAuthenticated={authenticated} />
        <RecoveryClaim api={api} />
        {audience === 'CUSTOMER' && (
          <InvitationAcceptance
            api={api}
            initialToken={invitationToken}
            onTokenConsumed={() => setInvitationToken('')}
          />
        )}
      </main>
    );
  const tabs = [
    ...(audience === 'STAFF' ? [['roles', '내부 역할']] : []),
    ['applications', audience === 'STAFF' ? '기업 이용 확인' : '기업 신청·결과'],
    ...(audience === 'CUSTOMER' ? [['enterprise', '기업 조직·역할']] : []),
    ['catalog', audience === 'STAFF' ? '판매 상품 관리' : '판매 상품'],
    ['orders', audience === 'STAFF' ? '주문 조건 확인' : '주문 작성·조회'],
    ['notices', '내 안내'],
    ...(audience === 'CUSTOMER' ? [['invitation', '내 기업 초대']] : []),
  ];
  return (
    <div className={'shell ' + (audience === 'STAFF' ? 'staff' : '')}>
      <a className="skip" href="#content">
        본문 바로가기
      </a>
      <aside>
        <p>
          <strong>주문 관리</strong>
        </p>
        <nav aria-label="업무 탐색">
          {tabs.map(([value, title]) => (
            <button
              key={value}
              aria-current={tab === value ? 'page' : undefined}
              onClick={() => {
                setTab(value!);
                setError('');
              }}
            >
              {title}
            </button>
          ))}
        </nav>
      </aside>
      <main id="content">
        <header className="context">
          <span>{audience === 'STAFF' ? '직원 업무' : '고객 업무'}</span>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await api.command('/identity/session-endings', emptyRead);
                clearProtected();
                setError('');
              } catch (failure) {
                report(failure);
              }
            }}
          >
            로그아웃
          </button>
        </header>
        {audience === 'CUSTOMER' && (
          <ContextPicker
            api={api}
            report={report}
            onSelect={(value) => {
              api.reset();
              setContext(value);
              setEnterprise(value?.enterpriseRef ?? null);
              setDepartment('');
              setSite('');
              setProducts([]);
            }}
            onManage={() => setTab('enterprise')}
          />
        )}
        <h1 ref={heading} tabIndex={-1}>
          {tabs.find(([value]) => value === tab)?.[1]}
        </h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {audience === 'STAFF' && identity.accountRef && (
          <div hidden={tab !== 'roles'}>
            <StaffRolePanel
              active={tab === 'roles'}
              api={api}
              accountRef={identity.accountRef}
              report={report}
            />
          </div>
        )}
        <div hidden={tab !== 'applications'}>
          <ApplicationPanel
            active={tab === 'applications'}
            api={api}
            audience={audience}
            report={report}
            onEnterprise={(value) => {
              setEnterprise(value);
              setTab('enterprise');
            }}
          />
        </div>
        {audience === 'CUSTOMER' && (
          <div hidden={tab !== 'enterprise'}>
            {enterprise ? (
              <EnterprisePanel
                active={tab === 'enterprise'}
                api={api}
                enterpriseRef={enterprise}
                report={report}
                onContext={setContext}
              />
            ) : (
              <p>자기 신청 결과에서 승인된 기업의 조직·권한 설정을 열어 주세요.</p>
            )}
          </div>
        )}
        <div hidden={tab !== 'catalog' && tab !== 'orders'}>
          {audience === 'CUSTOMER' && context && (
            <section className="section">
              <h2>주문 기업·조직 문맥</h2>
              <p>
                구매 기업: <strong>{context.legalName}</strong>
              </p>
              <p>
                부서 기준:{' '}
                {context.orderingContextPolicy.departmentUsage === 'NOT_USED'
                  ? '이 기업은 부서를 사용하지 않음'
                  : context.orderingContextPolicy.departmentUsage === 'UNSET'
                    ? '아직 미설정'
                    : '활성 부서 선택 필요'}{' '}
                · 사업장 기준:{' '}
                {context.orderingContextPolicy.siteUsage === 'NOT_USED'
                  ? '이 기업은 사업장을 사용하지 않음'
                  : context.orderingContextPolicy.siteUsage === 'UNSET'
                    ? '아직 미설정'
                    : '활성 사업장 선택 필요'}
              </p>
              {context.orderingContextPolicy.departmentUsage === 'USED' && (
                <>
                  <label htmlFor="orderDepartment">주문 부서</label>
                  <select
                    id="orderDepartment"
                    value={department}
                    onChange={(event) => {
                      api.reset();
                      setProducts([]);
                      setDepartment(event.target.value);
                    }}
                  >
                    <option value="">활성 부서 선택</option>
                    {context.departments
                      .filter((value) => value.active)
                      .map((value) => (
                        <option key={value.recordRef.id} value={value.recordRef.id}>
                          {value.label}
                        </option>
                      ))}
                  </select>
                </>
              )}
              {context.orderingContextPolicy.siteUsage === 'USED' && (
                <>
                  <label htmlFor="orderSite">주문 사업장</label>
                  <select
                    id="orderSite"
                    value={site}
                    onChange={(event) => {
                      api.reset();
                      setProducts([]);
                      setSite(event.target.value);
                    }}
                  >
                    <option value="">활성 사업장 선택</option>
                    {context.sites
                      .filter((value) => value.active)
                      .map((value) => (
                        <option key={value.recordRef.id} value={value.recordRef.id}>
                          {value.label}
                        </option>
                      ))}
                  </select>
                </>
              )}
              {!scope && (
                <p className="pending">
                  조직 기준을 명시하고 필요한 활성 부서·사업장을 선택해야 주문할 수 있습니다.
                </p>
              )}
            </section>
          )}
        </div>
        <div hidden={tab !== 'catalog'}>
          <CatalogPanel
            active={tab === 'catalog'}
            api={api}
            audience={audience}
            scope={scope}
            onChoose={add}
            report={report}
          />
        </div>
        <div hidden={tab !== 'orders'}>
          <OrderPanel
            key={
              (context?.enterpriseRef.id ?? 'none') +
              ':' +
              (scope?.organisationRevision ?? 0) +
              ':' +
              department +
              ':' +
              site
            }
            active={tab === 'orders'}
            api={api}
            audience={audience}
            scope={scope}
            selectedProducts={products}
            onNewDraft={() => setProducts([])}
            onRemove={(id) =>
              setProducts((previous) => previous.filter((value) => value.productRef.id !== id))
            }
            report={report}
          />
        </div>
        <div hidden={tab !== 'notices'}>
          <NoticePanel active={tab === 'notices'} api={api} report={report} />
        </div>
        {audience === 'CUSTOMER' && tab === 'invitation' && (
          <InvitationAcceptance
            api={api}
            initialToken={invitationToken}
            onTokenConsumed={() => setInvitationToken('')}
          />
        )}
      </main>
    </div>
  );
}
