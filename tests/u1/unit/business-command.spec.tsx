// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserApi, ApiFailure } from '@oms/ui/client';
import {
  OriginalCommandResult,
  useBusinessCommand,
} from '../../../packages/ui/src/business-command.tsx';
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
const input = {
  meta: {
    clientRequestId: 'original-key',
    expectedRevision: null,
    reason: '합성 요청',
    evidenceRefs: [],
  },
};
async function fixture() {
  const api = new BrowserApi();
  api.originals.activate('CUSTOMER', 'customer');
  let command!: ReturnType<typeof useBusinessCommand>;
  const report = vi.fn();
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  function Host() {
    command = useBusinessCommand(api, report);
    return <OriginalCommandResult command={command} />;
  }
  await act(async () => root.render(<Host />));
  return {
    api,
    command: () => command,
    close: async () => act(async () => root.unmount()),
    report,
  };
}
async function reject(view: Awaited<ReturnType<typeof fixture>>, status = 503, notSent = false) {
  vi.spyOn(view.api, 'command').mockRejectedValue(new ApiFailure(status, '합성 실패', notSent));
  await act(async () => {
    await expect(
      view.command().execute('OrderAcceptance', 'submitOrder', { kind: 'NONE' }, '/orders', input),
    ).rejects.toThrow();
  });
}
describe('불명 업무 원래키·명시적 부재 대조·새 의도', () => {
  it.each([403, 409, 503])(
    '%s 응답만으로 부재를 추정하지 않고 원래키를 보존한다',
    async (status) => {
      const view = await fixture();
      await reject(view, status);
      expect(view.command().pending?.clientRequestId).toBe('original-key');
      expect(view.command().pending?.delivery).toBe('UNKNOWN');
      await view.close();
    },
  );
  it('전송 전 실패는 원래 참조를 제거하고 새 요청을 막지 않는다', async () => {
    const view = await fixture();
    await reject(view, 503, true);
    expect(view.command().pending).toBeNull();
    await view.close();
  });
  it('NOT_ACCEPTED 뒤에도 자동 재전송하지 않고 명시적 새 의도 선택을 기다린다', async () => {
    const view = await fixture();
    await reject(view, 403);
    const read = vi
      .spyOn(view.api, 'read')
      .mockResolvedValue({ disposition: 'NOT_ACCEPTED', clientRequestId: 'original-key' });
    await act(async () => view.command().reconcile());
    expect(read.mock.calls[0]![0]).toContain('/requests/original-probe?');
    expect(view.command().notAccepted).toBe(true);
    expect(view.command().pending).not.toBeNull();
    await act(async () => view.command().reviewNewIntent());
    expect(view.command().pending).toBeNull();
    expect(view.api.command).toHaveBeenCalledOnce();
    await view.close();
  });
  it('UNCONFIRMED와 다른키의 부재 응답은 원래 참조를 해제하지 않는다', async () => {
    const view = await fixture();
    await reject(view);
    const read = vi
      .spyOn(view.api, 'read')
      .mockResolvedValue({ disposition: 'UNCONFIRMED', clientRequestId: 'original-key' });
    await act(async () => view.command().reconcile());
    expect(view.command().notAccepted).toBe(false);
    read.mockResolvedValue({ disposition: 'NOT_ACCEPTED', clientRequestId: 'different-key' });
    await act(async () => view.command().reconcile());
    expect(view.command().notAccepted).toBe(false);
    expect(view.command().pending).not.toBeNull();
    await view.close();
  });
  it('보호된 원래 Receipt를 대조하면 같은 접수번호로 표시하고 참조를 해제한다', async () => {
    const view = await fixture();
    await reject(view);
    vi.spyOn(view.api, 'read').mockResolvedValue({
      disposition: 'RECEIPT',
      receipt: { requestId: 'original-request', requestState: 'REVIEW_REQUIRED' },
    });
    await act(async () => view.command().reconcile());
    expect(view.command().result?.requestId).toBe('original-request');
    expect(view.command().pending).toBeNull();
    expect(document.body.textContent).toContain('original-request');
    await view.close();
  });
  it('컴포넌트 해제·새로고침 후에도 현재 계정의 원래키로 대조한다', async () => {
    const first = await fixture();
    await reject(first);
    await first.close();
    const second = await fixture();
    expect(second.command().pending?.clientRequestId).toBe('original-key');
    vi.spyOn(second.api, 'read').mockResolvedValue({
      disposition: 'UNCONFIRMED',
      clientRequestId: 'original-key',
    });
    await act(async () => second.command().reconcile());
    expect(second.command().pending?.clientRequestId).toBe('original-key');
    await second.close();
  });
});
