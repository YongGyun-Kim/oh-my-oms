import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, BrowserApi } from '@oms/ui/client';
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('브라우저 현재계정·원래요청·유한응답 경계', () => {
  it('실제요청은no-store와같은origincredential·serverCSRF를쓴다', async () => {
    const signals: AbortSignal[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.cache).toBe('no-store');
      expect(init.credentials).toBe('same-origin');
      signals.push(init.signal as AbortSignal);
      if (url.endsWith('/csrf')) return Response.json({ csrfToken: 'server-token' });
      expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('server-token');
      return Response.json({ requestId: 'original' });
    });
    vi.stubGlobal('fetch', fetch);
    expect(
      await new BrowserApi().command('/orders', { meta: { clientRequestId: 'original-key' } }),
    ).toEqual({ requestId: 'original' });
    expect(signals[0]).toBe(signals[1]);
  });
  it('계정전환은진행중본문읽기를abort하고옛본문을표시하지않는다', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const api = new BrowserApi();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        setTimeout(() => api.reset(), 5);
        return new Response(stream);
      }),
    );
    await expect(api.read('/identity')).rejects.toMatchObject({ status: 401 });
    expect(cancelled).toBe(true);
  });
  it('CSRF준비중계정전환은업무POST를발송하지않았다는근거를유지한다', async () => {
    const api = new BrowserApi();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const fetch = vi.fn(async () => {
      setTimeout(() => api.reset(), 5);
      return new Response(stream);
    });
    vi.stubGlobal('fetch', fetch);
    await expect(api.command('/orders', {})).rejects.toMatchObject({
      status: 401,
      requestNotSent: true,
    });
    expect(cancelled).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('CSRF미준비503은새로운업무원본을보내지않는다', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(new BrowserApi().command('/orders', {})).rejects.toMatchObject({
      status: 503,
      requestNotSent: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('입력1MiB초과는POST전거절하고실제수량/항목을암묵적으로자르지않는다', async () => {
    const fetch = vi.fn(async () => Response.json({ csrfToken: 'server' }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      new BrowserApi().command('/orders', { value: 'x'.repeat(1024 * 1024) }),
    ).rejects.toMatchObject({ status: 400, requestNotSent: true });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('응답4MiB초과는취소하고성공으로소비하지않는다', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3000000));
        controller.enqueue(new Uint8Array(3000000));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream)),
    );
    await expect(new BrowserApi().read('/orders')).rejects.toMatchObject({ status: 503 });
    expect(cancelled).toBe(true);
  });
  it('인증401은다른진행조회도취소하며다음계정에옛본문을남기지않는다', async () => {
    const api = new BrowserApi();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/slow') ? new Response(stream) : new Response('{}', { status: 401 }),
      ),
    );
    const slow = api.read('/slow');
    const slowChecked = expect(slow).rejects.toBeInstanceOf(ApiFailure);
    await expect(api.read('/identity')).rejects.toMatchObject({ status: 401 });
    await slowChecked;
    expect(cancelled).toBe(true);
  });
  it('업무응답503은원래발송불명을보존하고자동재시도/새키를만들지않는다', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/csrf')
        ? Response.json({ csrfToken: 'server' })
        : new Response('{}', { status: 503 }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(
      new BrowserApi().command('/orders', { meta: { clientRequestId: 'unchanged-original-key' } }),
    ).rejects.toMatchObject({ status: 503, requestNotSent: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
