import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server.js';
import { protectPage } from '@oms/ui/security-proxy';
afterEach(() => vi.unstubAllEnvs());
describe('민감 HTML/RSC의 nonce CSP·동적 no-store', () => {
  it('매 요청 nonce가 달라 HTML을 공유 cache로 재사용하지 않는다', () => {
    const request = new NextRequest('https://customer.example.invalid');
    const first = protectPage(request);
    const second = protectPage(request);
    expect(first.headers.get('content-security-policy')).not.toBe(
      second.headers.get('content-security-policy'),
    );
    expect(first.headers.get('cache-control')).toBe('no-store, private');
  });
  it('외부script/frame/object/base 삽입을 허용하지 않는다', () => {
    const csp = protectPage(new NextRequest('https://customer.example.invalid')).headers.get(
      'content-security-policy',
    )!;
    for (const part of [
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ])
      expect(csp).toContain(part);
    expect(csp).not.toContain('unsafe-inline');
  });
  it('운영 CSP는 unsafe-eval을 제외하고 HTTPS를 유지한다', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = protectPage(new NextRequest('https://customer.example.invalid'));
    expect(response.headers.get('content-security-policy')).not.toContain('unsafe-eval');
    expect(response.headers.get('strict-transport-security')).toContain('31536000');
  });
  it('개발 디버그 eval은 명시적 development에서만 허용한다', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      protectPage(new NextRequest('http://127.0.0.1:3100')).headers.get('content-security-policy'),
    ).toContain('unsafe-eval');
  });
  it('클라이언트 x-nonce/CSP는 서버 nonce를 지정하지 못한다', () => {
    const response = protectPage(
      new NextRequest('https://staff.example.invalid', {
        headers: { 'x-nonce': 'attacker', 'Content-Security-Policy': 'allow-all' },
      }),
    );
    expect(response.headers.get('x-middleware-request-x-nonce')).not.toBe('attacker');
    expect(response.headers.get('content-security-policy')).not.toContain('allow-all');
  });
  it('RSC preload도 민감 header/no-store 보호를 유지한다', () => {
    const response = protectPage(
      new NextRequest('https://staff.example.invalid?_rsc=synthetic', { headers: { RSC: '1' } }),
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
