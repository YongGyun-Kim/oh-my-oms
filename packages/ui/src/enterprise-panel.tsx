'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ActionScope, Ref } from '@oms/contracts';
import type { BrowserApi } from './client.ts';
import type { EnterpriseView, Known } from './ui-types.ts';
import { OriginalCommandResult, useBusinessCommand } from './business-command.tsx';
import { MemberPanel } from './member-panel.tsx';
import { commandMeta, ReasonField } from './forms.tsx';
const actions = [
  ['organisation.manage', '조직 관리'],
  ['user.manage', '담당자 관리'],
  ['role.manage', '역할 관리'],
  ['product.read', '상품 조회'],
  ['order.submit', '주문 제출'],
  ['order.read', '주문 조회'],
];
export function EnterprisePanel({
  api,
  enterpriseRef,
  report,
  onContext,
  active,
}: {
  active: boolean;
  api: BrowserApi;
  enterpriseRef: Ref;
  report: (error: unknown) => void;
  onContext: (view: EnterpriseView) => void;
}) {
  const command = useBusinessCommand(api, report);
  const [view, setView] = useState<EnterpriseView | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [review, setReview] = useState<string[] | null>(null);
  async function reload(cursor: string | null = null) {
    try {
      const result = await api.read<Known<EnterpriseView>>(
        '/enterprises/' +
          enterpriseRef.id +
          (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
      );
      setView(result.data);
      onContext(result.data);
    } catch (error) {
      setView(null);
      report(error);
    }
  }
  useEffect(() => {
    if (active) void reload();
    else setView(null);
  }, [enterpriseRef.id, active]);
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    try {
      await operation();
      await reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function policy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!view) return;
    const meta = commandMeta(data, view.enterpriseRef.revision);
    await run(async () => {
      await command.execute(
        'EnterpriseAccess',
        'setOrderingContextPolicy',
        { kind: 'ENTERPRISE', enterpriseRef: view.enterpriseRef },
        '/enterprises/' + view.enterpriseRef.id + '/ordering-context-policy-changes',
        { meta, departmentUsage: data.get('departmentUsage'), siteUsage: data.get('siteUsage') },
        view.enterpriseRef.revision,
      );
    });
  }
  async function organisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!view) return;
    const meta = commandMeta(data);
    await run(async () => {
      await command.execute(
        'EnterpriseAccess',
        'upsertOrganisation',
        { kind: 'ENTERPRISE', enterpriseRef: view.enterpriseRef },
        '/enterprises/' + view.enterpriseRef.id + '/organisation-changes',
        {
          meta,
          entityKind: data.get('entityKind'),
          label: data.get('label'),
          active: true,
          changeKind: 'CREATE',
          organisationRef: null,
        },
        view.enterpriseRef.revision,
      );
    });
  }
  async function role(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!view) return;
    const actionScopes: ActionScope[] = chosen.map((action) => ({
      action,
      kind: String(data.get('kind-' + action)) as ActionScope['kind'],
      enterpriseRef: view.enterpriseRef,
      departmentRefs: data
        .getAll('department-' + action)
        .map((id) => view.departments.find((value) => value.recordRef.id === id)!.recordRef),
      siteRefs: data
        .getAll('site-' + action)
        .map((id) => view.sites.find((value) => value.recordRef.id === id)!.recordRef),
    }));
    if (!review) {
      setReview(
        actionScopes.map(
          (scope) =>
            `${actions.find((value) => value[0] === scope.action)![1]}: ${scope.kind === 'ENTERPRISE_ALL' ? '기업 전체' : '선택한 부서·사업장 범위'}`,
        ),
      );
      return;
    }
    const meta = commandMeta(data);
    await run(async () => {
      await command.execute(
        'EnterpriseAccess',
        'defineCustomerRole',
        { kind: 'ENTERPRISE', enterpriseRef: view.enterpriseRef },
        '/enterprises/' + view.enterpriseRef.id + '/customer-roles',
        { meta, label: data.get('roleLabel'), actionScopes },
        view.enterpriseRef.revision,
      );
      setReview(null);
    });
  }
  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!view) return;
    const role = view.customerRoles.find((value) => value.roleRef.id === data.get('grantRole'));
    const member = view.memberships.find(
      (value) => value.membershipRef.id === data.get('grantMember'),
    );
    const knownId = String(data.get('knownAccountId') ?? '');
    if (!role || (!member && !knownId)) return;
    const accountRef = knownId
      ? {
          owner: 'IdentityRecovery',
          entity: 'Account',
          id: knownId,
          revision: Number(data.get('knownAccountRevision')),
        }
      : member!.accountRef;
    const meta = commandMeta(data);
    await run(async () => {
      await command.execute(
        'EnterpriseAccess',
        'grantCustomerRole',
        { kind: 'ENTERPRISE', enterpriseRef: view.enterpriseRef },
        '/enterprises/' + view.enterpriseRef.id + '/role-grant-changes',
        { meta, accountRef, roleRef: role.roleRef, decision: 'GRANT' },
        view.enterpriseRef.revision,
      );
    });
  }
  return (
    <section className="section" aria-busy={busy}>
      <h2>기업 조직·역할 관리</h2>
      <button className="secondary" onClick={() => reload()}>
        기업 상태 재확인
      </button>
      {view && (
        <>
          {view.administratorCount === 0 && (
            <p className="pending">
              현재 관리자 0명입니다. 별도 관리자 지정이 필요합니다. 다른 담당자의 유효한 업무 권한은
              유지됩니다.
            </p>
          )}
          {view.scopeGrants.some((scope) => scope.action === 'organisation.manage') && (
            <form onSubmit={policy}>
              <h3>주문 조직 기준 설정</h3>
              <p>부서/사업장을 사용하지 않는 경우와 아직 설정하지 않은 경우는 다릅니다.</p>
              {[
                ['departmentUsage', '부서 기준', view.orderingContextPolicy.departmentUsage],
                ['siteUsage', '사업장 기준', view.orderingContextPolicy.siteUsage],
              ].map(([name, label, current]) => (
                <div key={name}>
                  <label htmlFor={name}>
                    {label} · 현재{' '}
                    {current === 'UNSET' ? '미설정' : current === 'USED' ? '사용' : '사용하지 않음'}
                  </label>
                  <select id={name} name={name} required defaultValue="">
                    <option value="">명시적으로 선택하세요</option>
                    <option value="USED">사용</option>
                    <option value="NOT_USED">사용하지 않음</option>
                  </select>
                </div>
              ))}
              <ReasonField />
              <button disabled={busy || !!command.pending}>조직 기준 변경 제출</button>
            </form>
          )}
          {view.scopeGrants.some((scope) => scope.action === 'organisation.manage') && (
            <form onSubmit={organisation}>
              <h3>부서·사업장 등록</h3>
              <label htmlFor="entityKind">조직 종류</label>
              <select id="entityKind" name="entityKind">
                <option value="DEPARTMENT">부서</option>
                <option value="BUSINESS_SITE">사업장</option>
              </select>
              <label htmlFor="label">조직 이름</label>
              <input id="label" name="label" required maxLength={4096} />
              <ReasonField />
              <button disabled={busy || !!command.pending}>조직 등록 제출</button>
            </form>
          )}
          {view.scopeGrants.some((scope) => scope.action === 'role.manage') && (
            <form onSubmit={role} onChange={() => setReview(null)}>
              <h3>행위별 역할 정의</h3>
              <label htmlFor="roleLabel">역할 이름</label>
              <input id="roleLabel" name="roleLabel" required maxLength={4096} />
              <fieldset>
                <legend>명시적으로 허용할 행위와 범위</legend>
                {actions.map(([action, label]) => (
                  <fieldset key={action}>
                    <legend>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={chosen.includes(action!)}
                          onChange={(event) =>
                            setChosen((previous) =>
                              event.target.checked
                                ? [...previous, action!]
                                : previous.filter((value) => value !== action),
                            )
                          }
                        />
                        {label}
                      </label>
                    </legend>
                    {chosen.includes(action!) && (
                      <>
                        <label htmlFor={'kind-' + action}>이 행위의 범위</label>
                        <select
                          id={'kind-' + action}
                          name={'kind-' + action}
                          required
                          defaultValue=""
                        >
                          <option value="">범위를 선택하세요</option>
                          <option value="ENTERPRISE_ALL">기업 전체</option>
                          <option value="DEPARTMENT_SITE">선택 부서·사업장 조합</option>
                          <option value="DEPARTMENT_ALL_SITES">선택 부서의 전체 사업장</option>
                          <option value="SITE_ALL_DEPARTMENTS">선택 사업장의 전체 부서</option>
                        </select>
                        <label htmlFor={'department-' + action}>명시할 부서</label>
                        <select id={'department-' + action} name={'department-' + action} multiple>
                          {view.departments.map((value) => (
                            <option key={value.recordRef.id} value={value.recordRef.id}>
                              {value.label}
                              {value.active ? '' : ' (비활성)'}
                            </option>
                          ))}
                        </select>
                        <label htmlFor={'site-' + action}>명시할 사업장</label>
                        <select id={'site-' + action} name={'site-' + action} multiple>
                          {view.sites.map((value) => (
                            <option key={value.recordRef.id} value={value.recordRef.id}>
                              {value.label}
                              {value.active ? '' : ' (비활성)'}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </fieldset>
                ))}
              </fieldset>
              <ReasonField />
              {review && (
                <section aria-label="역할 최종 검토">
                  <h3>선택한 행위별 범위 검토</h3>
                  <ul>
                    {review.map((value, index) => (
                      <li key={index}>{value}</li>
                    ))}
                  </ul>
                  <p>역할 정의만으로 사용자에게 부여되지 않습니다.</p>
                </section>
              )}
              <button disabled={chosen.length === 0 || busy || !!command.pending}>
                {review ? '검토한 역할 정의 제출' : '행위별 범위 검토'}
              </button>
            </form>
          )}
          {view.scopeGrants.some((scope) => scope.action === 'role.manage') && (
            <form onSubmit={grant}>
              <h3>역할 별도 부여</h3>
              <label htmlFor="grantRole">부여할 역할</label>
              <select id="grantRole" name="grantRole" required defaultValue="">
                <option value="">역할 선택</option>
                {view.customerRoles.map((value) => (
                  <option key={value.roleRef.id} value={value.roleRef.id}>
                    {value.label}
                  </option>
                ))}
              </select>
              <label htmlFor="grantMember">현재 기업 담당자</label>
              <select id="grantMember" name="grantMember" defaultValue="">
                <option value="">담당자 선택</option>
                {view.memberships
                  .filter((value) => value.active)
                  .map((value) => (
                    <option key={value.membershipRef.id} value={value.membershipRef.id}>
                      {value.displayName}
                    </option>
                  ))}
              </select>
              <p>
                담당자 조회 권한이 없으면 전체 목록을 제공하지 않습니다. 확인된 소속 계정의
                번호·개정으로만 별도 지정할 수 있습니다.
              </p>
              <label htmlFor="knownGrantAccount">별도 확인한 역할 부여 계정 번호</label>
              <input id="knownGrantAccount" name="knownAccountId" maxLength={128} />
              <label htmlFor="knownGrantRevision">별도 확인한 부여 계정 개정</label>
              <input
                id="knownGrantRevision"
                name="knownAccountRevision"
                type="number"
                min={1}
                defaultValue={1}
              />
              <ReasonField />
              <button disabled={busy || !!command.pending}>선택한 역할 부여</button>
            </form>
          )}
          {view.scopeGrants.some((scope) => scope.action === 'user.manage') && (
            <MemberPanel api={api} view={view} reload={reload} report={report} />
          )}
          <div className="actions">
            {Object.entries(view.sectionCursors).map(
              ([section, cursor]) =>
                cursor && (
                  <button key={section} onClick={() => reload(cursor)}>
                    다음{' '}
                    {
                      (
                        {
                          departments: '부서',
                          sites: '사업장',
                          roles: '역할',
                          memberships: '담당자',
                        } as Record<string, string>
                      )[section]
                    }{' '}
                    페이지
                  </button>
                ),
            )}
          </div>
        </>
      )}
      <OriginalCommandResult command={command} />
    </section>
  );
}
