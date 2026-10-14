import { requireCondition } from '@oms/contracts';
import { U4_PERSISTENCE_MODELS, U4_VERSION3_MODELS } from './u4-model-catalog.js';
import type { ModelData } from './model-catalog.js';
import type { RecoveryPayload } from './recovery-types.js';

export function validateU4RecoveryImage(model: string, version: number, data: ModelData): boolean {
  const u4 = U4_PERSISTENCE_MODELS.some((entry) => entry.name === model);
  const u3 = version === 3 && U4_VERSION3_MODELS.some((entry) => entry.name === model);
  if (!u4 && !u3) return false;
  requireCondition(
    u4 ? version === 1 && data.modelVersion === 1 : data.modelVersion === 3,
    503,
    'U4_RECOVERY_MODEL_VERSION',
    '등록된 금융 원상 버전이 필요합니다.',
  );
  return true;
}
export function validateU4RecoveryPayload(payload: RecoveryPayload): void {
  requireCondition(
    !payload.rows.some(
      (row) => row.deleted && U4_PERSISTENCE_MODELS.some((model) => model.name === row.model),
    ),
    503,
    'U4_RECOVERY_DELETE',
    '금융 원본/식별 예약의 삭제 원상은 허용하지 않습니다.',
  );
  const financial = payload.rows.some(
    (row) =>
      U4_PERSISTENCE_MODELS.some((model) => model.name === row.model) || row.schemaVersion === 3,
  );
  requireCondition(
    !financial ||
      (payload.schemaVersion === 3 &&
        payload.sourceContract?.profile === 'urn:oms:contract:u4-financial:1' &&
        payload.sourceContract.registryVersion === 4),
    503,
    'U4_RECOVERY_PROFILE',
    '금융 원상은 정확한 변경 계약에 결합해야 합니다.',
  );
}
