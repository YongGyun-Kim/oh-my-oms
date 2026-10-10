import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { Request, Response } from 'express';
import type { ObservationPort } from '@oms/contracts';
export interface ApiSecurityConfiguration {
  audience: 'CUSTOMER' | 'STAFF';
  origin: string;
  transportHost?: string;
  tls?: { key: string; cert: string };
  activationAdmission?: () => Promise<void>;
  telemetry?: ObservationPort;
  cookieKey: Buffer;
  localSynthetic: boolean;
  staffAdmission: (request: Request) => Promise<unknown | null>;
}
export class ApiSecurity {
  readonly cookie: string;
  readonly browserCookie: string;
  constructor(readonly configuration: ApiSecurityConfiguration) {
    const origin = new URL(configuration.origin);
    requireCondition(
      configuration.cookieKey.length >= 32 &&
        origin.origin === configuration.origin &&
        (origin.protocol === 'https:' ||
          (configuration.localSynthetic && ['localhost', '127.0.0.1'].includes(origin.hostname))),
      503,
      'HTTP_SECURITY_CONFIGURATION',
      '인증 접점의 host/TLS/키 구성을 확인하세요.',
    );
    if (configuration.transportHost)
      requireCondition(
        /^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(configuration.transportHost),
        503,
        'TRANSPORT_HOST_CONFIGURATION',
        '검증된 내부 전송 host가 필요합니다.',
      );
    requireCondition(
      configuration.localSynthetic || (configuration.tls?.key && configuration.tls.cert),
      503,
      'LISTENER_TLS_REQUIRED',
      '운영 API의 실제 TLS listener가 필요합니다.',
    );
    this.cookie = '__Host-oms-' + configuration.audience.toLowerCase();
    this.browserCookie = this.cookie + '-browser';
  }
  private digest(value: string): string {
    return createHmac('sha256', this.configuration.cookieKey)
      .update(this.configuration.audience + ':' + this.configuration.origin + ':' + value)
      .digest('base64url');
  }
  private equal(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
  cookieValue(request: Request, name: string): string | null {
    const header = request.headers.cookie ?? '';
    requireCondition(header.length <= 8192, 400, 'COOKIE_LIMIT', '인증 접점 정보를 확인하세요.');
    const matches = header
      .split(';')
      .map((value) => value.trim())
      .filter((value) => value.startsWith(name + '='));
    requireCondition(
      matches.length <= 1,
      401,
      'COOKIE_AMBIGUOUS',
      '현재 인증 접점을 다시 확인하세요.',
    );
    return matches[0]?.slice(name.length + 1) ?? null;
  }
  private setCookie(response: Response, name: string, value: string): void {
    response.append(
      'Set-Cookie',
      `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`,
    );
  }
  browser(request: Request): string | null {
    const raw = this.cookieValue(request, this.browserCookie);
    if (!raw) return null;
    const [nonce, deadline, signature] = raw.split('.');
    requireCondition(
      nonce &&
        /^[A-Za-z0-9_-]{43}$/.test(nonce) &&
        deadline &&
        /^\d{13}$/.test(deadline) &&
        Number(deadline) > Date.now() &&
        signature &&
        this.equal(signature, this.digest('browser:' + nonce + '.' + deadline)),
      401,
      'BROWSER_COOKIE_INVALID',
      '현재 접점에서 인증을 다시 시작하세요.',
    );
    return nonce;
  }
  rotateBrowser(response: Response, nonce = randomBytes(32).toString('base64url')): string {
    const raw = nonce + '.' + (Date.now() + 8 * 3600000);
    this.setCookie(response, this.browserCookie, raw + '.' + this.digest('browser:' + raw));
    return nonce;
  }
  csrf(browser: string, session: string | null): string {
    return this.digest('csrf:' + browser + ':' + (session ?? 'pre-identity'));
  }
  verifyMutation(request: Request, browser: string, session: string | null): void {
    requireCondition(
      request.headers.origin === this.configuration.origin,
      403,
      'ORIGIN_REJECTED',
      '허용된 업무 접점에서 다시 요청하세요.',
    );
    const token = request.headers['x-csrf-token'];
    requireCondition(
      typeof token === 'string' && this.equal(token, this.csrf(browser, session)),
      403,
      'CSRF_REJECTED',
      '화면의 인증 접점 정보를 새로 확인하세요.',
    );
  }
  async admission(request: Request): Promise<unknown> {
    requireCondition(
      request.headers.host ===
        (this.configuration.transportHost ?? new URL(this.configuration.origin).host),
      403,
      'HOST_REJECTED',
      '허용된 업무 접점이 아닙니다.',
    );
    if (this.configuration.audience === 'CUSTOMER') return null;
    const result = await this.configuration.staffAdmission(request);
    requireCondition(
      result !== null,
      403,
      'STAFF_INGRESS_REQUIRED',
      '승인된 직원 접점이 필요합니다.',
    );
    return result;
  }
  session(request: Request): string | null {
    return this.cookieValue(request, this.cookie);
  }
  establish(response: Response, session: string, browser?: string): void {
    requireCondition(
      /^[A-Za-z0-9_-]{43}$/.test(session),
      503,
      'SESSION_PRODUCER_INVALID',
      '인증 결과를 다시 확인하세요.',
    );
    this.setCookie(response, this.cookie, session);
    this.rotateBrowser(response, browser);
  }
  headers(response: Response): void {
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
}
