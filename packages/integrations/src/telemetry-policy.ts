import { createHash } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
export type TelemetryOutcome =
  | 'SUCCESS'
  | 'ACCEPTED_NOT_COMPLETED'
  | 'ACCESS_REFUSAL'
  | 'BUSINESS_REFUSAL'
  | 'NON_DISCLOSURE'
  | 'OVERLOADED'
  | 'TECHNICAL_FAILURE'
  | 'UNKNOWN_EXTERNAL';
export function httpOutcome(status: number): TelemetryOutcome {
  return status === 202
    ? 'ACCEPTED_NOT_COMPLETED'
    : status === 401 || status === 403
      ? 'ACCESS_REFUSAL'
      : status === 404
        ? 'NON_DISCLOSURE'
        : status === 429
          ? 'OVERLOADED'
          : status >= 500 || status === 0
            ? 'TECHNICAL_FAILURE'
            : status >= 400
              ? 'BUSINESS_REFUSAL'
              : 'SUCCESS';
}
export function correlationHash(value: string): string {
  const length = Array.from(value).length;
  requireCondition(
    length >= 1 && length <= 128,
    503,
    'TELEMETRY_CORRELATION',
    '등록된 원래 상관 식별자가 필요합니다.',
  );
  return createHash('sha256').update(value).digest('hex');
}
export function resultKnowledge(value: unknown): string[] {
  const found = new Set<string>();
  let nodes = 0;
  const walk = (data: unknown, depth: number) => {
    if (!data || typeof data !== 'object' || depth > 8 || ++nodes > 2000) return;
    if (Array.isArray(data)) {
      for (const child of data.slice(0, 100)) walk(child, depth + 1);
      return;
    }
    const object = data as Record<string, unknown>;
    // Registered DTO state fields only: existence KNOWN must not hide unknown effective price.
    for (const field of [
      'knowledge',
      'priceKnowledge',
      'scopeProjectionKnowledge',
      'confirmation',
    ]) {
      const state = object[field];
      if (
        typeof state === 'string' &&
        ['KNOWN', 'UNKNOWN', 'CONFLICT', 'UNAVAILABLE'].includes(state)
      )
        found.add(state);
    }
    for (const field of ['data', 'items', 'lines', 'assessments'])
      if (field in object) walk(object[field], depth + 1);
  };
  walk(value, 0);
  return [...found];
}
export function collectorEndpoint(value: string, synthetic: boolean): string {
  const url = new URL(value);
  requireCondition(
    !url.username && !url.password && !url.search && !url.hash && url.pathname === '/',
    503,
    'TELEMETRY_ENDPOINT',
    '고정 collector origin이 필요합니다.',
  );
  requireCondition(
    url.protocol === 'https:' ||
      (synthetic &&
        process.env.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname)),
    503,
    'TELEMETRY_TLS',
    'collector TLS 경계를 확인해야 합니다.',
  );
  return url.origin;
}
