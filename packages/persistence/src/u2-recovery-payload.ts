import { canonicalJson, requireCondition } from '@oms/contracts';
import type { ModelData } from './model-catalog.js';
import { U2_MODELS } from './u2-model-catalog.js';
const RAW_KEYS = new Set([
  'password',
  'totp',
  'code',
  'secret',
  'partySecret',
  'rawToken',
  'rawCode',
  'providerSession',
  'qrSecret',
  'ciphertext',
]);
export function assertNoRawRecoverySecrets(value: unknown, depth = 0): void {
  requireCondition(depth <= 16, 503, 'RECOVERY_DEPTH', '재구성 자료 중첩 상한입니다.');
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const item of value) assertNoRawRecoverySecrets(item, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      requireCondition(
        !RAW_KEYS.has(key),
        503,
        'RECOVERY_RAW_SECRET',
        '재구성 자료에 원문 비밀을 넣을 수 없습니다.',
      );
      assertNoRawRecoverySecrets(item, depth + 1);
    }
  }
}
export function validateU2RecoveryImage(model: string, data: ModelData): void {
  if (!U2_MODELS.some((entry) => entry.name === model)) return;
  assertNoRawRecoverySecrets(data);
  requireCondition(
    Buffer.byteLength(canonicalJson(data)) <= 65536,
    503,
    'RECOVERY_ROW_SIZE',
    '재구성 원본 크기를 확인하세요.',
  );
}
