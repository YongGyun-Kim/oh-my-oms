// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Portal } from '../../../packages/ui/src/portal.js';
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});
describe('현재Portal 인증세대·StrictMode cleanup/새로고침·old본문 차단', () => {
  for (const [status, phase] of [
    [401, 'MFA_VERIFIED'],
    [503, 'MFA_VERIFIED'],
    [200, 'CHALLENGE_REQUIRED'],
    [200, 'RECOVERY_REVIEW'],
  ] as const)
    it('현재 ' + status + '/' + phase + '는 완전MFA 업무본문으로표시하지않는다', async () => {
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const fetch = vi.fn(async () =>
        Response.json(
          {
            knowledge: 'KNOWN',
            data: {
              accountRef: {
                owner: 'IdentityRecovery',
                entity: 'Account',
                id: 'synthetic',
                revision: 1,
              },
              phase,
              personLinkRef: null,
              resultRefs: [],
            },
            detail: '현재 확인 필요',
          },
          { status },
        ),
      );
      vi.stubGlobal('fetch', fetch);
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => {
        root!.render(<Portal audience="CUSTOMER" />);
      });
      await act(async () => {
        await new Promise((done) => setTimeout(done, 10));
      });
      expect(container.textContent).toContain('고객 로그인');
      expect(container.textContent).not.toContain('고객 업무');
      expect(container.textContent).not.toContain('현재 인증을 확인하고 있습니다.');
      expect(fetch).toHaveBeenCalledOnce();
    });
  it('이전 mount의 취소401이 다음 mount의 유효한 현재인증을지우지않는다', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let identities = 0;
    let cancelled = 0;
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/identity') {
        identities++;
        if (identities === 1)
          return new Promise<Response>((_done, reject) => {
            options.signal!.addEventListener(
              'abort',
              () => {
                cancelled++;
                reject(new Error('synthetic previous mount abort'));
              },
              { once: true },
            );
          });
        await new Promise((done) => setTimeout(done, 10));
        options.signal!.throwIfAborted();
        return Response.json({
          knowledge: 'KNOWN',
          data: {
            accountRef: {
              owner: 'IdentityRecovery',
              entity: 'Account',
              id: 'verified-synthetic-account',
              revision: 1,
            },
            phase: 'MFA_VERIFIED',
            personLinkRef: null,
            resultRefs: [],
          },
        });
      }
      return Response.json({ items: [], nextCursor: null, observedAt: new Date().toISOString() });
    });
    vi.stubGlobal('fetch', fetch);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StrictMode>
          <Portal audience="CUSTOMER" />
        </StrictMode>,
      );
      await new Promise((done) => setTimeout(done, 30));
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 30));
    });
    expect(cancelled).toBe(1);
    expect(identities).toBe(2);
    expect(container.textContent).toContain('고객 업무');
    expect(container.textContent).toContain('기업 신청·결과');
    expect(container.textContent).not.toContain('고객 로그인');
  });
  it('pagehide는허용본문을비우고persisted pageshow는현재신원을재대조한다', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let allowed = true;
    const fetch = vi.fn(async (url: string) =>
      url === '/api/identity'
        ? allowed
          ? Response.json({
              knowledge: 'KNOWN',
              data: {
                accountRef: {
                  owner: 'IdentityRecovery',
                  entity: 'Account',
                  id: 'current-synthetic-account',
                  revision: 1,
                },
                phase: 'MFA_VERIFIED',
                personLinkRef: null,
                resultRefs: [],
              },
            })
          : Response.json({ detail: '현재 인증 필요' }, { status: 401 })
        : Response.json({ items: [], nextCursor: null }),
    );
    vi.stubGlobal('fetch', fetch);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<Portal audience="CUSTOMER" />);
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 10));
    });
    expect(container.textContent).toContain('고객 업무');
    await act(async () =>
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
    );
    expect(container.textContent).toContain('고객 로그인');
    allowed = false;
    await act(async () =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    );
    await act(async () => {
      await new Promise((done) => setTimeout(done, 10));
    });
    expect(container.textContent).not.toContain('고객 업무');
    expect(container.textContent).toContain('고객 로그인');
  });
});
