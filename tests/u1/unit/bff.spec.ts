import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server.js';
import { proxy } from '@oms/ui/bff';
const origin = 'https://customer.example.invalid';
type NextInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;
const request = (init: NextInit = {}) =>
  new NextRequest(origin + '/api/identity', {
    ...init,
    headers: { Origin: origin, ...init.headers },
    ...(init.body ? { duplex: 'half' } : {}),
  } as NextInit);
beforeEach(() => {
  vi.stubEnv('OMS_WEB_ORIGIN', origin);
  vi.stubEnv('OMS_API_ORIGIN', 'https://api.example.invalid');
  vi.stubEnv('OMS_LOCAL_SYNTHETIC', '0');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('양쪽 BFF 실제 stream·한도·원래 기한', () => {
  it('canonical opaque ID의콜론/한글/구분문자를ASCII사업제한없이segment인코딩한다', async () => {
    const original = 'order:원본.?#/%';
    const fetch = vi.fn(async () => Response.json({ knowledge: 'UNKNOWN' }));
    vi.stubGlobal('fetch', fetch);
    expect(
      (await proxy(request(), ['orders', original, 'review-assessment'], 'CUSTOMER')).status,
    ).toBe(200);
    const url = String((fetch.mock.calls[0] as unknown as [URL])[0]);
    expect(url).toBe(
      'https://api.example.invalid/orders/' + encodeURIComponent(original) + '/review-assessment',
    );
    expect(decodeURIComponent(new URL(url).pathname.split('/')[2]!)).toBe(original);
  });
  it('URI dot traversal이나미등록namespace는backend요청을만들지않는다', async () => {
    const fetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', fetch);
    for (const path of [['orders', '..', 'identity'], ['orders', '.'], ['staff-roles']])
      expect((await proxy(request(), path, 'CUSTOMER')).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('NextURL의127→localhost정규화는명시적합성동일Host/scheme/port만대응한다', async () => {
    vi.stubEnv('OMS_WEB_ORIGIN', 'http://127.0.0.1:3100');
    vi.stubEnv('OMS_API_ORIGIN', 'http://127.0.0.1:3400');
    vi.stubEnv('OMS_LOCAL_SYNTHETIC', '1');
    vi.stubEnv('NODE_ENV', 'development');
    const fetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', fetch);
    const valid = new NextRequest('http://127.0.0.1:3100/api/identity', {
      headers: { host: '127.0.0.1:3100' },
    });
    expect(valid.nextUrl.hostname).toBe('localhost');
    expect((await proxy(valid, ['identity'], 'CUSTOMER')).status).toBe(200);
    expect(
      (
        await proxy(
          new NextRequest('http://127.0.0.1:3100/api/identity', {
            headers: { host: 'attacker.invalid' },
          }),
          ['identity'],
          'CUSTOMER',
        )
      ).status,
    ).toBe(403);
    vi.stubEnv('NODE_ENV', 'production');
    expect((await proxy(valid, ['identity'], 'CUSTOMER')).status).toBe(403);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('고객cookie만전달하고clientprincipal/직원망header를전달하지않는다', async () => {
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get('Cookie')).toBe('__Host-oms-customer=own');
      expect(headers.has('X-Staff-Network')).toBe(false);
      expect(headers.has('X-Principal-Id')).toBe(false);
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    const result = await proxy(
      request({
        headers: {
          Cookie: '__Host-oms-customer=own; __Host-oms-staff=private',
          'X-Staff-Network': 'true',
          'X-Principal-Id': 'admin',
        },
      }),
      ['identity'],
      'CUSTOMER',
    );
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toContain('no-store');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('미준비접점·잘못된Origin·경로이탈은backend호출전거절한다', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('OMS_API_ORIGIN', '');
    expect((await proxy(request(), ['identity'], 'CUSTOMER')).status).toBe(503);
    vi.stubEnv('OMS_API_ORIGIN', 'https://api.example.invalid');
    expect(
      (
        await proxy(
          request({ method: 'POST', headers: { Origin: 'https://attacker.invalid' }, body: '{}' }),
          ['identity'],
          'CUSTOMER',
        )
      ).status,
    ).toBe(403);
    expect((await proxy(request(), ['..', 'staff-roles'], 'CUSTOMER')).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('chunked입력1MiB초과는즉시cancel/413이며거짓ContentLength를믿지않는다', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(700000));
        controller.enqueue(new Uint8Array(700000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await proxy(
      request({ method: 'POST', body: stream, headers: { 'Content-Length': '1' } }),
      ['orders'],
      'CUSTOMER',
    );
    expect(result.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('입력상한안의여러chunk는같은budget으로backend에전달한다', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'));
        controller.enqueue(new TextEncoder().encode('}'));
        controller.close();
      },
    });
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('{}');
      expect(init.signal).toBeDefined();
      return new Response('{}');
    });
    vi.stubGlobal('fetch', fetch);
    expect(
      (await proxy(request({ method: 'POST', body: stream }), ['orders'], 'CUSTOMER')).status,
    ).toBe(200);
  });
  it('chunked응답4MiB초과는즉시cancel하고성공ACK대신대조필요503을반환한다', async () => {
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
      vi.fn(async () => new Response(stream, { status: 202, headers: { 'Content-Length': '1' } })),
    );
    const result = await proxy(request(), ['requests', 'original'], 'CUSTOMER');
    expect(result.status).toBe(503);
    expect(cancelled).toBe(true);
    expect((await result.json()).detail).toContain('원래 요청');
  });
  it('입력중clientabort는느린stream을닫고backend새요청을만들지않는다', async () => {
    let cancelled = false;
    const abort = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = proxy(
      request({ method: 'POST', body: stream, signal: abort.signal }),
      ['orders'],
      'CUSTOMER',
    );
    abort.abort();
    expect((await result).status).toBe(503);
    expect(cancelled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('응답중clientabort도같은signal로stream을닫고late본문을반환하지않는다', async () => {
    let cancelled = false;
    const abort = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        setTimeout(() => abort.abort(), 5);
        return new Response(stream);
      }),
    );
    const result = await proxy(request({ signal: abort.signal }), ['identity'], 'CUSTOMER');
    expect(result.status).toBe(503);
    expect(cancelled).toBe(true);
  });
  it('조회의실제5초원래기한은늦은backend응답body읽기에새5초를주지않는다', async () => {
    let cancelled = false;
    const started = Date.now();
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return new Response(stream);
      }),
    );
    const result = await proxy(request(), ['identity'], 'CUSTOMER');
    const elapsed = Date.now() - started;
    expect(result.status).toBe(503);
    expect(cancelled).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(4900);
    expect(elapsed).toBeLessThan(5150);
  });
});
