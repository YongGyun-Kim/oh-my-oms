import { createHash } from 'node:crypto';
import { OmsError } from './errors.js';

function canonicalValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) && !Number.isSafeInteger(value))
      throw new OmsError(400, 'INVALID_NUMBER', '정확히 표현할 수 없는 정수입니다.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalValue).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(record)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonicalValue(record[k]))
        .join(',') +
      '}'
    );
  }
  throw new OmsError(400, 'INVALID_JSON', '지원하지 않는 JSON 값입니다.');
}
export function canonicalJson(value: unknown): string {
  return canonicalValue(value);
}
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
