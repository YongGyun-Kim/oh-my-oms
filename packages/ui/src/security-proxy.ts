import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';
export function protectPage(request: NextRequest): NextResponse {
  const nonce = randomBytes(24).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}; style-src 'self' 'nonce-${nonce}'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'${development ? '' : '; upgrade-insecure-requests'}`;
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store, private');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  if (!development) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
