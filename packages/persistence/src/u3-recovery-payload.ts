import { canonicalJson, requireCondition } from '@oms/contracts';
import { U3_MODELS } from './u3-model-catalog.js';
import type { ModelData } from './model-catalog.js';
import { assertNoRawRecoverySecrets } from './u2-recovery-payload.js';

export function validateU3RecoveryImage(model: string, version: number, data: ModelData): void {
  if (!U3_MODELS.some((entry) => entry.name === model)) {
    requireCondition(
      version === 1,
      503,
      'RECOVERY_MODEL_VERSION',
      '기존 소유자는 실제 등록된 model version1이어야 합니다.',
    );
    return;
  }
  requireCondition(
    version === (data.modelVersion === 2 ? 2 : 1),
    503,
    'RECOVERY_MODEL_VERSION',
    'U3 원상과 명시 model version이 다릅니다.',
  );
  if (version === 2) {
    assertNoRawRecoverySecrets(data);
    requireCondition(
      Buffer.byteLength(canonicalJson(data)) <= 4 * 1024 * 1024,
      503,
      'RECOVERY_ROW_SIZE',
      '전체 보호 원상 크기 한도를 넘을 수 없습니다.',
    );
  }
}
