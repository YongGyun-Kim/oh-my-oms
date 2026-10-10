// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserApi, ApiFailure } from '@oms/ui/client';
import { OrderPanel } from '../../../packages/ui/src/order-panel.tsx';
import type { TargetScope } from '@oms/contracts';
import type { ProductView } from '../../../packages/ui/src/ui-types.ts';
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  writable: true,
  configurable: true,
});
afterEach(() => {
  sessionStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const enterprise = {
  owner: 'EnterpriseAccess',
  entity: 'Enterprise',
  id: 'synthetic-enterprise',
  revision: 3,
};
const scope: TargetScope = {
  enterpriseRef: enterprise,
  contextPolicyRef: enterprise,
  organisationRevision: 3,
  departmentRef: null,
  siteRef: null,
};
const product: ProductView = {
  productRef: { owner: 'ProductCatalog', entity: 'Product', id: 'synthetic-product', revision: 1 },
  commonOfferRevisionRef: {
    owner: 'ProductCatalog',
    entity: 'CommonOfferRevision',
    id: 'synthetic-offer',
    revision: 1,
  },
  productType: 'HARDWARE',
  softwareTermKind: null,
  label: '합성 HW',
  salesDescription: '미확인',
  commonPrice: { currency: 'KRW', value: '100' },
  resolvedPrice: null,
  priceKnowledge: 'UNKNOWN',
};
const receipt = {
  owner: 'OrderAcceptance',
  requestId: 'same-request',
  requestState: 'REVIEW_REQUIRED',
  targetRef: { owner: 'OrderAcceptance', entity: 'Order', id: 'same-order', revision: 1 },
};
async function fixture(currentScope: TargetScope | null = scope, selection = [product]) {
  const api = new BrowserApi();
  api.originals.activate('CUSTOMER', 'customer');
  const submit = vi.spyOn(api, 'command').mockResolvedValue(receipt);
  const read = vi
    .spyOn(api, 'read')
    .mockResolvedValue({ data: { lines: [], requestId: 'same-request' } });
  const onNewDraft = vi.fn();
  const onRemove = vi.fn();
  const report = vi.fn();
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <OrderPanel
        api={api}
        audience="CUSTOMER"
        scope={currentScope}
        selectedProducts={selection}
        onRemove={onRemove}
        onNewDraft={onNewDraft}
        report={report}
        active={false}
      />,
    ),
  );
  const send = () =>
    act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  return {
    api,
    submit,
    read,
    container,
    send,
    onNewDraft,
    onRemove,
    close: async () => act(async () => root.unmount()),
  };
}
describe('주문 초안·검토·같은 접수 보호·명시적 새 주문', () => {
  it('첫 검토는 업무 송신이 아니며 두번째 명시 제출만 송신한다', async () => {
    const view = await fixture();
    await view.send();
    expect(view.submit).not.toHaveBeenCalled();
    await view.send();
    expect(view.submit).toHaveBeenCalledOnce();
    await view.close();
  });
  it('보호 접수 후 같은 초안의 반복 submit 이벤트도 새 주문을 만들지 않는다', async () => {
    const view = await fixture();
    await view.send();
    await view.send();
    await view.send();
    expect(view.submit).toHaveBeenCalledOnce();
    expect((view.container.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    expect(view.container.textContent).toContain('same-request');
    await view.close();
  });
  it('새 주문 작성은 명시 버튼으로만 접수 잠금을 풀고 이전 상품을 비운다', async () => {
    const view = await fixture();
    await view.send();
    await view.send();
    const button = [...view.container.querySelectorAll('button')].find(
      (value) => value.textContent === '접수된 주문과 별도로 새 주문 작성',
    )!;
    await act(async () => button.click());
    expect(view.onNewDraft).toHaveBeenCalledOnce();
    expect((view.container.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(false);
    expect(view.submit).toHaveBeenCalledOnce();
    await view.close();
  });
  it('timeout 후 같은 원래 Receipt 대조도 재제출을 잠근다', async () => {
    const view = await fixture();
    view.submit.mockRejectedValue(new ApiFailure(503, '합성 응답 유실'));
    await view.send();
    await view.send();
    view.read.mockResolvedValue({ disposition: 'RECEIPT', receipt });
    const button = [...view.container.querySelectorAll('button')].find(
      (value) => value.textContent === '원래 접수 결과 확인',
    )!;
    await act(async () => button.click());
    await view.send();
    expect(view.submit).toHaveBeenCalledOnce();
    expect(view.container.textContent).toContain('same-request');
    expect((view.container.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    await view.close();
  });
  it('명시적인 기업/조직 문맥이 없으면 검토·submit 모두 송신하지 않는다', async () => {
    const view = await fixture(null);
    await view.send();
    await view.send();
    expect(view.submit).not.toHaveBeenCalled();
    await view.close();
  });
  it('SW 주문에는 요청 활성화 날짜가 있으며 실제 기간 확정으로 표기하지 않는다', async () => {
    const view = await fixture(scope, [
      { ...product, productType: 'SOFTWARE', softwareTermKind: 'TERM' },
    ]);
    expect(view.container.querySelector('input[type=date]')).not.toBeNull();
    expect(view.container.textContent).toContain('기업 적용 조건: 미확인');
    await view.close();
  });
  it('구매 수량은 상품 항목 수와 별개이고 원래 제시 개정으로 제출한다', async () => {
    const view = await fixture();
    await view.send();
    await view.send();
    const submitted = view.submit.mock.calls[0]![1] as {
      lines: { quantity: number; commonOfferRevisionRef: unknown }[];
    };
    expect(submitted.lines).toHaveLength(1);
    expect(submitted.lines[0]!.quantity).toBe(1);
    expect(submitted.lines[0]!.commonOfferRevisionRef).toEqual(product.commonOfferRevisionRef);
    await view.close();
  });
});
