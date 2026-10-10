// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { BrowserApi } from '@oms/ui/client';
import { EnterprisePanel } from '../../../packages/ui/src/enterprise-panel.tsx';
import type { EnterpriseView } from '../../../packages/ui/src/ui-types.ts';
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  writable: true,
  configurable: true,
});
const roots: Root[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  sessionStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const enterprise = {
  owner: 'EnterpriseAccess',
  entity: 'Enterprise',
  id: 'enterprise',
  revision: 3,
};
function view(actions: string[]): EnterpriseView {
  return {
    enterpriseRef: enterprise,
    legalName: '현재 허용 기업',
    administratorCount: 0,
    orderingContextPolicy: { departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
    scopeGrants: actions.map((action) => ({
      action,
      kind: 'ENTERPRISE_ALL',
      enterpriseRef: enterprise,
      departmentRefs: [],
      siteRefs: [],
    })),
    departments: [
      {
        recordRef: {
          owner: 'EnterpriseAccess',
          entity: 'Department',
          id: 'department',
          revision: 1,
        },
        label: '허용 부서',
        active: true,
      },
    ],
    sites: [
      {
        recordRef: { owner: 'EnterpriseAccess', entity: 'BusinessSite', id: 'site', revision: 1 },
        label: '허용 사업장',
        active: true,
      },
    ],
    customerRoles: [
      {
        roleRef: { owner: 'EnterpriseAccess', entity: 'CustomerRole', id: 'role', revision: 1 },
        label: '명시 역할',
        actionScopes: [],
      },
    ],
    memberships: [],
    sectionCursors: { departments: null, sites: null, roles: null, memberships: null },
  };
}
async function fixture(actions: string[], value = view(actions), failure = false) {
  const api = new BrowserApi();
  api.originals.activate('CUSTOMER', 'account');
  const read = vi.spyOn(api, 'read');
  if (failure) read.mockRejectedValue(new Error('현재 grant 불명'));
  else read.mockResolvedValue({ knowledge: 'KNOWN', data: value });
  const command = vi.spyOn(api, 'command').mockResolvedValue({
    requestId: 'protected-request',
    owner: 'EnterpriseAccess',
    requestState: 'RESULT_RECORDED',
    targetRef: enterprise,
  });
  const report = vi.fn(),
    onContext = vi.fn();
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <EnterprisePanel
        api={api}
        enterpriseRef={enterprise}
        report={report}
        onContext={onContext}
        active
      />,
    ),
  );
  return { container, command, read, report, onContext };
}
function form(container: Element, title: string) {
  return [...container.querySelectorAll('form')].find(
    (form) => form.querySelector('h3')?.textContent === title,
  )!;
}
const send = (form: HTMLFormElement) =>
  act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
function field(form: Element, name: string, value: string) {
  const input = form.querySelector<HTMLInputElement | HTMLSelectElement>('[name="' + name + '"]')!;
  input.value = value;
}
describe('기업 관리 PC 각 행위 facet·별도 범위/지정 입력', () => {
  it('role.manage만으로 역할 facet을 열되 조직/소속 directory를 노출하지 않는다', async () => {
    const f = await fixture(['role.manage']);
    expect(f.container.textContent).toContain('역할 별도 부여');
    expect(f.container.textContent).not.toContain('주문 조직 기준 설정');
    expect(f.container.textContent).not.toContain('현재 허용 담당자 관리');
    expect(f.container.textContent).toContain('현재 관리자 0명');
  });
  it('user.manage만으로 담당자 facet을 열되 역할/조직 관리를 자동 제공하지 않는다', async () => {
    const f = await fixture(['user.manage']);
    expect(f.container.textContent).toContain('현재 허용 담당자 관리');
    expect(f.container.textContent).not.toContain('역할 별도 부여');
    expect(f.container.textContent).not.toContain('주문 조직 기준 설정');
  });
  it('현재 조직 정책 개정과 NOT_USED를 명시해 제출한다', async () => {
    const f = await fixture(['organisation.manage']);
    const target = form(f.container, '주문 조직 기준 설정');
    field(target, 'departmentUsage', 'NOT_USED');
    field(target, 'siteUsage', 'NOT_USED');
    await send(target);
    expect(f.command).toHaveBeenCalledWith(
      '/enterprises/enterprise/ordering-context-policy-changes',
      expect.objectContaining({
        departmentUsage: 'NOT_USED',
        siteUsage: 'NOT_USED',
        meta: expect.objectContaining({ expectedRevision: 3 }),
      }),
      expect.objectContaining({ 'X-Target-Revision': '3' }),
      expect.any(Function),
    );
  });
  it('조직 생성은 선택한 entity와 현재 기업 target만 전달한다', async () => {
    const f = await fixture(['organisation.manage']);
    const target = form(f.container, '부서·사업장 등록');
    field(target, 'entityKind', 'DEPARTMENT');
    field(target, 'label', '새 부서');
    await send(target);
    expect(f.command.mock.calls[0]![1]).toMatchObject({
      entityKind: 'DEPARTMENT',
      label: '새 부서',
      active: true,
      changeKind: 'CREATE',
      organisationRef: null,
    });
  });
  it('역할은 행위별 범위 최종검토 전 제출하지 않고 선택 부서/사업장을 연결한다', async () => {
    const f = await fixture(['role.manage']);
    const target = form(f.container, '행위별 역할 정의');
    const check = [...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')][4]!;
    await act(async () => check.click());
    field(target, 'kind-order.submit', 'DEPARTMENT_SITE');
    field(target, 'department-order.submit', 'department');
    field(target, 'site-order.submit', 'site');
    field(target, 'roleLabel', '명시 주문 범위');
    await send(target);
    expect(f.command).not.toHaveBeenCalled();
    expect(f.container.textContent).toContain('선택한 행위별 범위 검토');
    await send(target);
    expect(f.command.mock.calls[0]![1]).toMatchObject({
      actionScopes: [
        {
          action: 'order.submit',
          kind: 'DEPARTMENT_SITE',
          departmentRefs: [{ id: 'department' }],
          siteRefs: [{ id: 'site' }],
        },
      ],
    });
  });
  it('directory 없이 별도 확인 계정 번호/개정으로 역할을 지정하고 자동 소속 생성하지 않는다', async () => {
    const f = await fixture(['role.manage']);
    const target = form(f.container, '역할 별도 부여');
    field(target, 'grantRole', 'role');
    field(target, 'knownAccountId', 'confirmed-account');
    field(target, 'knownAccountRevision', '2');
    await send(target);
    expect(f.command.mock.calls[0]![1]).toMatchObject({
      accountRef: { id: 'confirmed-account', revision: 2 },
      roleRef: { id: 'role' },
      decision: 'GRANT',
    });
    expect(f.command).toHaveBeenCalledTimes(1);
  });
  it('현재 조회가 실패하면 이전 권한/관리 form을 그대로 유지하지 않는다', async () => {
    const f = await fixture(['role.manage'], view(['role.manage']), true);
    expect(f.container.querySelectorAll('form')).toHaveLength(0);
    expect(f.report).toHaveBeenCalledOnce();
    expect(f.onContext).not.toHaveBeenCalled();
  });
  it('등록된 다음 section cursor로 조회하고 받은 현재 projection만 전달한다', async () => {
    const value = view(['role.manage']);
    value.sectionCursors.roles = 'opaque:cursor';
    const f = await fixture(['role.manage'], value);
    const button = [...f.container.querySelectorAll('button')].find(
      (button) => button.textContent === '다음 역할 페이지',
    )!;
    await act(async () => button.click());
    expect(f.read.mock.calls.at(-1)![0]).toContain('cursor=opaque%3Acursor');
    expect(f.onContext).toHaveBeenCalledTimes(2);
  });
  it('담당자 변경은 Account개정/별도근거와 현재 기업 개정을 유지한다', async () => {
    const f = await fixture(['user.manage']);
    const target = f.container.querySelector('form')!;
    field(target, 'accountId', 'confirmed-account');
    field(target, 'accountRevision', '2');
    await send(target);
    expect(f.command.mock.calls[0]![0]).toBe('/enterprises/enterprise/membership-changes');
    expect(f.command.mock.calls[0]![1]).toMatchObject({
      accountRef: { id: 'confirmed-account', revision: 2 },
      administrator: false,
      departmentRef: null,
      siteRef: null,
    });
  });
});
