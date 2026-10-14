import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { ApiSecurity } from '@oms/api';
const origin = 'https://customer.example.invalid';
function security(audience: 'CUSTOMER' | 'STAFF' = 'CUSTOMER') {
  return new ApiSecurity({
    audience,
    origin,
    cookieKey: randomBytes(32),
    tls: { key: 'UNIT-BOUNDARY-NOT-A-REAL-KEY', cert: 'UNIT-BOUNDARY-NOT-A-REAL-CERT' },
    localSynthetic: false,
    staffAdmission: async () => null,
  });
}
const request = (headers: Record<string, string> = {}) =>
  ({ headers: { host: 'customer.example.invalid', ...headers } }) as Request;
function response() {
  const headers: Record<string, unknown> = {};
  return {
    headers,
    value: {
      append: (key: string, value: string) => {
        headers[key] = value;
      },
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      },
    } as unknown as Response,
  };
}
describe('HTTP 인증/CSRF/host 현재 접점 기본 경계', () => {
  it('운영HTTP와짧은키·origin경로설정을거절한다', () => {
    expect(
      () =>
        new ApiSecurity({
          audience: 'CUSTOMER',
          origin: 'http://customer.example.invalid',
          cookieKey: randomBytes(32),
          tls: { key: 'UNIT-BOUNDARY-NOT-A-REAL-KEY', cert: 'UNIT-BOUNDARY-NOT-A-REAL-CERT' },
          localSynthetic: false,
          staffAdmission: async () => null,
        }),
    ).toThrow();
    expect(
      () =>
        new ApiSecurity({
          audience: 'CUSTOMER',
          origin: origin + '/path',
          cookieKey: randomBytes(1),
          localSynthetic: false,
          staffAdmission: async () => null,
        }),
    ).toThrow();
  });
  it('cookie는hostbound·Secure·HttpOnly이며현재서버결합만검증한다', () => {
    const adapter = security();
    const result = response();
    const nonce = adapter.rotateBrowser(result.value);
    const header = String(result.headers['Set-Cookie']);
    expect(header).toContain('__Host-');
    expect(header).toContain('Secure; HttpOnly; SameSite=Strict');
    expect(adapter.browser(request({ cookie: header.split(';')[0]! }))).toBe(nonce);
  });
  it('변조되거나다른접점이서명한cookie는거절한다', () => {
    const adapter = security();
    const result = response();
    adapter.rotateBrowser(result.value);
    const cookie = String(result.headers['Set-Cookie']).split(';')[0]!;
    expect(() => security().browser(request({ cookie }))).toThrow();
    expect(() => adapter.browser(request({ cookie: cookie + 'changed' }))).toThrow();
  });
  it('중복cookie와과대cookie를암묵적으로선택하지않는다', () => {
    const adapter = security();
    expect(() =>
      adapter.cookieValue(
        request({ cookie: adapter.cookie + '=a; ' + adapter.cookie + '=b' }),
        adapter.cookie,
      ),
    ).toThrow();
    expect(() =>
      adapter.cookieValue(request({ cookie: 'x'.repeat(8193) }), adapter.cookie),
    ).toThrow();
  });
  it('CSRF는브라우저와현재세션에묶이며MFA후이전token은효력이없다', () => {
    const adapter = security();
    const nonce = randomBytes(32).toString('base64url');
    const csrf = adapter.csrf(nonce, null);
    const original = request({ origin, 'x-csrf-token': csrf });
    expect(() => adapter.verifyMutation(original, nonce, null)).not.toThrow();
    expect(() => adapter.verifyMutation(original, nonce, 'new-session')).toThrow();
  });
  it('정확한Origin없이유효한CSRFtoken만으로업무변경을허용하지않는다', () => {
    const adapter = security();
    const nonce = randomBytes(32).toString('base64url');
    const token = adapter.csrf(nonce, null);
    expect(() =>
      adapter.verifyMutation(
        request({ origin: 'https://attacker.invalid', 'x-csrf-token': token }),
        nonce,
        null,
      ),
    ).toThrow();
    expect(() => adapter.verifyMutation(request({ 'x-csrf-token': token }), nonce, null)).toThrow();
  });
  it('Host와직원망위조header는신뢰admission을대체하지않는다', async () => {
    await expect(security().admission(request({ host: 'attacker.invalid' }))).rejects.toThrow();
    await expect(
      security('STAFF').admission(request({ 'x-staff-network': 'true' })),
    ).rejects.toMatchObject({ code: 'STAFF_INGRESS_REQUIRED' });
  });
  it('업무응답은no-store·CSP·frame거절·보호sessioncookie를쓴다', () => {
    const adapter = security();
    const result = response();
    adapter.headers(result.value);
    expect(result.headers['Cache-Control']).toContain('no-store');
    expect(result.headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(() => adapter.establish(result.value, 'fake')).toThrow();
  });
});
