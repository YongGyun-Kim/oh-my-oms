import { canonicalJson, fingerprint, requireCondition, SchemaValidator } from '@oms/contracts';
import { modelDefinition, primaryAttribute, validateModel } from './model-catalog.js';
import type { ModelData } from './model-catalog.js';
import { validateU2RecoveryImage } from './u2-recovery-payload.js';
import { validateU3RecoveryImage } from './u3-recovery-payload.js';
import { rowModelVersion } from './model-catalog.js';
import type { FinancialSourceContract } from '@oms/contracts';
import { validateU4RecoveryImage, validateU4RecoveryPayload } from './u4-recovery-payload.js';

export interface RecoveryRow {
  model: string;
  schemaVersion: 1 | 2 | 3;
  id: string;
  revision: number;
  data: ModelData;
  deleted: boolean;
}
export interface RecoveryPayload {
  schemaVersion: 1 | 2 | 3;
  sourceContract?: FinancialSourceContract;
  epoch: string;
  commitOrder: number;
  requestId: string;
  correlationId: string;
  rows: RecoveryRow[];
  previousDigest: string | null;
  contentDigest: string;
}
export interface RequestKey {
  scopedKey: string;
  requestId: string;
  inputFingerprint: string;
  principalId: string;
  audience: string;
  owner: string;
  operation: string;
  target: unknown;
}
export function validateRecoveryRow(row: RecoveryRow, schema: SchemaValidator): void {
  if (row.model === 'RequestKey') {
    requireCondition(
      row.schemaVersion === 1,
      503,
      'RECOVERY_KEY_SCHEMA',
      '접수 키의 실제 등록 버전은1입니다.',
    );
    const data = row.data;
    requireCondition(
      Object.keys(data).sort().join(',') ===
        'audience,inputFingerprint,operation,owner,principalId,requestId,scopedKey,target',
      503,
      'RECOVERY_KEY_SCHEMA',
      '접수 키 원본 필드가 다릅니다.',
    );
    for (const field of ['scopedKey', 'inputFingerprint'])
      requireCondition(
        typeof data[field] === 'string' && /^[a-f0-9]{64}$/.test(data[field] as string),
        503,
        'RECOVERY_KEY_SCHEMA',
        '접수 키 해시가 다릅니다.',
      );
    for (const field of ['requestId', 'principalId']) schema.validate('Id', data[field]);
    requireCondition(
      ['CUSTOMER', 'STAFF', 'SYSTEM'].includes(String(data.audience)) &&
        typeof data.owner === 'string' &&
        typeof data.operation === 'string',
      503,
      'RECOVERY_KEY_SCHEMA',
      '접수 키 권위가 다릅니다.',
    );
    requireCondition(
      row.id === data.scopedKey && row.revision === 1 && !row.deleted,
      503,
      'RECOVERY_KEY_SCHEMA',
      '접수 키 식별자가 다릅니다.',
    );
    return;
  }
  const definition = modelDefinition(row.model);
  validateModel(row.model, row.data, schema);
  requireCondition(
    row.schemaVersion === rowModelVersion(row.model, row.data),
    503,
    'RECOVERY_MODEL_VERSION',
    '원상 decoder의 실제 등록 버전이 다릅니다.',
  );
  validateU2RecoveryImage(row.model, row.data);
  if (!validateU4RecoveryImage(row.model, row.schemaVersion, row.data))
    validateU3RecoveryImage(row.model, row.schemaVersion, row.data);
  requireCondition(
    row.id === row.data[primaryAttribute(definition).name] &&
      row.revision ===
        (row.data.revision ??
          row.data.aggregateVersion ??
          row.data.sourceVersion ??
          row.data.sourceRevision ??
          1),
    503,
    'RECOVERY_ROW_ID',
    '복구 원본 식별자/개정이 다릅니다.',
  );
}
export function sealPayload(payload: Omit<RecoveryPayload, 'contentDigest'>): RecoveryPayload {
  return { ...payload, contentDigest: fingerprint(payload) };
}
export function decodePayload(text: string, schema: SchemaValidator): RecoveryPayload {
  requireCondition(
    Buffer.byteLength(text) <= 4 * 1024 * 1024,
    503,
    'RECOVERY_SIZE',
    '복구 자료 크기가 초과되었습니다.',
  );
  const raw = JSON.parse(text) as { schemaVersion?: unknown };
  const payload = schema.validateUri<RecoveryPayload>(
    raw?.schemaVersion === 3
      ? 'urn:oms:contract:u4-financial:1#/$defs/RecoveryPayload'
      : raw?.schemaVersion === 2
        ? 'urn:oms:contract:u3-commercial:2#/$defs/RecoveryPayload'
        : 'urn:oms:contract:foundation:1#/$defs/RecoveryPayload',
    raw,
  );
  const { contentDigest, ...body } = payload;
  requireCondition(
    fingerprint(body) === contentDigest && canonicalJson(payload) === text,
    503,
    'RECOVERY_DIGEST',
    '복구 자료 정규화/내용 해시가 다릅니다.',
  );
  for (const row of payload.rows) validateRecoveryRow(row, schema);
  validateU4RecoveryPayload(payload);
  requireCondition(
    new Set(payload.rows.map((row) => row.model + '/' + row.id)).size === payload.rows.length,
    503,
    'RECOVERY_DUPLICATE_ROW',
    '복구 자료 원본이 중복되었습니다.',
  );
  return payload;
}
