// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextPicker } from '../../../packages/ui/src/context-picker.js';
import { ApiFailure, BrowserApi } from '../../../packages/ui/src/client.js';
import type { CustomerContextView, Page } from '../../../packages/ui/src/ui-types.js';
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  writable: true,
  configurable: true,
});
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const context = (managementAvailable = false): CustomerContextView => ({
  enterpriseRef: {
    owner: 'EnterpriseAccess',
    entity: 'Enterprise',
    id: 'confirmed-enterprise',
    revision: 4,
  },
  legalName: '본인 확인 기업',
  orderingContextPolicy: { departmentUsage: 'NOT_USED', siteUsage: 'NOT_USED' },
  departments: [],
  sites: [],
  actionScopes: [],
  availableActions: managementAvailable ? ['role.manage'] : ['order.submit'],
  managementAvailable,
  sectionCursors: { departments: null, sites: null, scopes: null },
});
const page = (data: CustomerContextView | null): Page<CustomerContextView> => ({
  items: data
    ? [{ knowledge: 'KNOWN', data, sourceRefs: [], observedAt: new Date().toISOString() }]
    : [],
  nextCursor: null,
  observedAt: new Date().toISOString(),
});
async function render(api: BrowserApi) {
  const selected = vi.fn();
  const manage = vi.fn();
  const report = vi.fn();
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () =>
    root!.render(<ContextPicker api={api} onSelect={selected} onManage={manage} report={report} />),
  );
  return { selected, manage, report };
}
async function choose() {
  await act(async () => {
    const select = document.querySelector('select')!;
    select.value = 'confirmed-enterprise';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((value) => value.textContent === label)!;
describe('현재본인기업 선택·관리facet·세대·페이지 경계', () => {
  it('자기신청없는확인담당자도선택하지만선택전자동거래기업을만들지않는다', async () => {
    const api = new BrowserApi();
    vi.spyOn(api, 'read').mockResolvedValue(page(context()));
    const result = await render(api);
    expect(result.selected).not.toHaveBeenCalled();
    await choose();
    expect(result.selected).toHaveBeenCalledWith(context());
    expect(document.body.textContent).toContain('이 선택은 거래 권한을 부여하지 않습니다.');
  });
  it('trade전용주체에게관리진입과directory를제공하지않는다', async () => {
    const api = new BrowserApi();
    vi.spyOn(api, 'read').mockResolvedValue(page(context()));
    await render(api);
    await choose();
    expect(button('선택 기업의 허용 관리 업무 열기')).toBeUndefined();
    expect(document.body.textContent).toContain('order.submit');
    expect(document.querySelector('table')).toBeNull();
  });
  it('role관리만있는현재주체도명시적인관리진입을선택한다', async () => {
    const api = new BrowserApi();
    vi.spyOn(api, 'read').mockResolvedValue(page(context(true)));
    const result = await render(api);
    await choose();
    await act(async () => button('선택 기업의 허용 관리 업무 열기').click());
    expect(result.manage).toHaveBeenCalledOnce();
  });
  it('현재소속회수재조회는이전기업문맥을비우고확인안내를보인다', async () => {
    const api = new BrowserApi();
    vi.spyOn(api, 'read').mockResolvedValueOnce(page(context())).mockResolvedValueOnce(page(null));
    const result = await render(api);
    await choose();
    await act(async () => button('현재 소속·행위 재확인').click());
    expect(result.selected).toHaveBeenLastCalledWith(null);
    expect(document.body.textContent).toContain('현재 확인된 소속·허용 문맥이 없습니다.');
  });
  it('현재503은KNOWN선택을유지하지않고실제오류를보고한다', async () => {
    const api = new BrowserApi();
    const failure = new ApiFailure(503, '현재 원본 대조');
    vi.spyOn(api, 'read').mockRejectedValue(failure);
    const result = await render(api);
    expect(result.report).toHaveBeenCalledWith(failure);
    expect(result.selected).toHaveBeenCalledWith(null);
  });
  it('이전문맥요청의superseded취소는새선택을삭제하지않는다', async () => {
    const api = new BrowserApi();
    vi.spyOn(api, 'read')
      .mockResolvedValueOnce(page(context()))
      .mockRejectedValueOnce(new ApiFailure(401, '이전문맥취소', false, true));
    const result = await render(api);
    await choose();
    await act(async () => button('현재 소속·행위 재확인').click());
    expect(result.selected).toHaveBeenCalledTimes(1);
    expect(result.report).not.toHaveBeenCalled();
    expect(document.querySelector('select')!.value).toBe('confirmed-enterprise');
  });
  it('기업목록keyset페이지를명시적으로조회하며옛선택은그페이지에없으면비운다', async () => {
    const api = new BrowserApi();
    const first = { ...page(context()), nextCursor: 'member-original-id' };
    const read = vi
      .spyOn(api, 'read')
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(page(null));
    const result = await render(api);
    await choose();
    await act(async () => button('다음 소속 기업 페이지').click());
    expect(read.mock.calls[1]![0]).toContain('cursor=member-original-id');
    expect(result.selected).toHaveBeenLastCalledWith(null);
  });
  it('개별scope페이지는선택기업원본과원래cursor를보내고조합권한을합성하지않는다', async () => {
    const api = new BrowserApi();
    const data = {
      ...context(),
      sectionCursors: { departments: null, sites: null, scopes: 'scope:원본' },
    };
    const read = vi.spyOn(api, 'read').mockResolvedValue(page(data));
    await render(api);
    await choose();
    await act(async () => button('다음 행위 범위 페이지').click());
    const query = new URL(read.mock.calls[1]![0], 'https://test.invalid').searchParams;
    expect(query.get('scopeCursor')).toBe('scope:원본');
    expect(JSON.parse(query.get('enterpriseRef')!)).toEqual(data.enterpriseRef);
    expect(document.body.textContent).toContain(
      '서로 다른 부서·사업장 조합을 합쳐 권한을 만들지 않습니다.',
    );
  });
});
