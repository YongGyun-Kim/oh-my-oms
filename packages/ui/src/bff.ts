import { NextRequest, NextResponse } from 'next/server.js';
import { PayloadLimit, readLimited } from './limited-stream.ts';
// BFF configuration is server-only; no provider secret/session appears in a client bundle.
export async function proxy(
  request: NextRequest,
  path: string[],
  audience: 'CUSTOMER' | 'STAFF',
): Promise<NextResponse> {
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(request.method === 'GET' ? 5000 : 10000),
  ]);
  const browserOrigin = process.env.OMS_WEB_ORIGIN;
  const apiOrigin = process.env.OMS_API_ORIGIN;
  if (!browserOrigin || !apiOrigin)
    return NextResponse.json(
      { detail: '업무 접점이 아직 준비되지 않았습니다.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  const browser = new URL(browserOrigin);
  const backend = new URL(apiOrigin);
  const local = process.env.OMS_LOCAL_SYNTHETIC === '1' && process.env.NODE_ENV !== 'production';
  const normalizedSyntheticLoopback =
    local &&
    browser.hostname === '127.0.0.1' &&
    request.nextUrl.hostname === 'localhost' &&
    request.headers.get('host') === browser.host &&
    request.nextUrl.protocol === browser.protocol &&
    request.nextUrl.port === browser.port;
  if (
    (!normalizedSyntheticLoopback && request.nextUrl.origin !== browserOrigin) ||
    browser.pathname !== '/' ||
    backend.pathname !== '/' ||
    ((browser.protocol !== 'https:' || backend.protocol !== 'https:') &&
      !(
        local &&
        ['localhost', '127.0.0.1'].includes(browser.hostname) &&
        ['localhost', '127.0.0.1'].includes(backend.hostname)
      ))
  )
    return NextResponse.json({ detail: '허용된 업무 접점이 아닙니다.' }, { status: 403 });
  if (request.method !== 'GET' && request.headers.get('origin') !== browserOrigin)
    return NextResponse.json({ detail: '허용된 화면에서 다시 요청하세요.' }, { status: 403 });
  if (
    ['token', 'invitationToken', 'code', 'partySecret', 'secret', 'response', 'password'].some(
      (key) => request.nextUrl.searchParams.has(key),
    )
  )
    return NextResponse.json(
      { detail: '비공개 확인 값은 원래 화면의 보호된 입력으로 보내세요.' },
      { status: 400, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
    );
  if (
    path.some(
      (part) =>
        typeof part !== 'string' ||
        Array.from(part).length < 1 ||
        Array.from(part).length > 128 ||
        part === '.' ||
        part === '..',
    ) ||
    path.length > 6 ||
    ![
      'identity',
      'security',
      'enterprise-applications',
      'customer-enterprise-contexts',
      'enterprises',
      'membership-invitations',
      'memberships',
      'customer-roles',
      ...(audience === 'STAFF' ? ['administrator-restorations'] : []),
      'products',
      'orders',
      'requests',
      'notifications',
      ...(audience === 'STAFF'
        ? ['staff-roles', 'staff-role-directory', 'staff-role-grant-changes', 'records']
        : []),
    ].includes(path[0] ?? '')
  )
    return NextResponse.json({ detail: '업무 접점을 찾을 수 없습니다.' }, { status: 404 });
  const headers = new Headers({
    Accept: 'application/json',
    Origin: request.headers.get('origin') ?? browserOrigin,
  });
  for (const key of [
    'Content-Type',
    'X-CSRF-Token',
    'Idempotency-Key',
    'X-Target-Revision',
    'X-Correlation-Id',
  ]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  const cookiePrefix = '__Host-oms-' + audience.toLowerCase();
  const cookies = request.cookies
    .getAll()
    .filter((cookie) =>
      [
        cookiePrefix,
        cookiePrefix + '-browser',
        cookiePrefix + '-party',
        cookiePrefix + '-purpose',
      ].includes(cookie.name),
    );
  if (cookies.length)
    headers.set('Cookie', cookies.map((cookie) => cookie.name + '=' + cookie.value).join('; '));
  // Company ingress attestation is intentionally absent until its real trust profile is registered.
  // BFF identity or a client header alone must never certify a staff device/network.
  try {
    const body =
      request.method === 'GET' ? undefined : await readLimited(request.body, 65536, signal);
    if (body && body.byteLength > 65536)
      return NextResponse.json({ detail: '입력 크기를 확인하세요.' }, { status: 413 });
    const result = await fetch(
      new URL(
        '/' + path.map((part) => encodeURIComponent(part)).join('/') + request.nextUrl.search,
        backend,
      ),
      {
        method: request.method,
        headers,
        body: body as BodyInit | undefined,
        cache: 'no-store',
        redirect: 'error',
        signal,
      },
    );
    let content: Uint8Array | undefined;
    try {
      content = await readLimited(result.body, 4 * 1024 * 1024, signal);
    } catch {
      throw new Error('응답을 유한 크기로 대조해야 합니다.');
    }
    const forwarded = new Headers({
      'Cache-Control': 'no-store, private',
      'Content-Type': result.headers.get('content-type') ?? 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    for (const value of result.headers.getSetCookie()) forwarded.append('Set-Cookie', value);
    const correlation = result.headers.get('x-correlation-id');
    if (correlation) forwarded.set('X-Correlation-Id', correlation);
    signal.throwIfAborted();
    return new NextResponse(content as BodyInit | null | undefined, {
      status: result.status,
      headers: forwarded,
    });
  } catch (error) {
    if (error instanceof PayloadLimit)
      return NextResponse.json({ detail: '입력 크기를 확인하세요.' }, { status: 413 });
    return NextResponse.json(
      { detail: '처리 결과를 아직 확인할 수 없습니다. 원래 요청 결과를 다시 확인하세요.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
