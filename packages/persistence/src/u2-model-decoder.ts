import type { SchemaValidator } from '@oms/contracts';
import { validateModel, type ModelData } from './model-catalog.js';
import { U2_MODELS } from './u2-model-catalog.js';
import { requireCondition } from '@oms/contracts';
export function validateU2ModelConstraints(model: string, data: ModelData): void {
  if (!U2_MODELS.some((entry) => entry.name === model)) return;
  if (model === 'VerificationEvidence')
    requireCondition(
      data.purpose === 'EMERGENCY_PRIVATE'
        ? data.operatorAuthorityRef !== null && data.operatorAuthorityRef !== undefined
        : data.operatorAuthorityRef === null || data.operatorAuthorityRef === undefined,
      400,
      'MODEL_VERIFICATION_AUTHORITY',
      '별도 비상 확인은 운영 권위 원본을 명시하고 일반 확인에 운영 권위를 섞지 않습니다.',
    );
  const lifetimes: Record<string, number> = {
    MembershipInvitation: 7 * 86400000,
    RecoveryHandoffGrant: 300000,
    PartyClaimContext: 300000,
    EnrollmentAuthority: 300000,
  };
  if (lifetimes[model]) {
    const lifetime = Date.parse(String(data.expiresAt)) - Date.parse(String(data.issuedAt));
    requireCondition(
      lifetime > 0 && lifetime <= lifetimes[model]!,
      400,
      'MODEL_TTL',
      '원래 목적의 수명이 다릅니다.',
    );
    if (model === 'MembershipInvitation')
      requireCondition(
        lifetime === lifetimes[model],
        400,
        'MODEL_TTL',
        '초대 수명은 원래 발급부터7일입니다.',
      );
  }
  if (model === 'RecoveryHandoffGrant') {
    requireCondition(
      Number(data.attemptCount) <= 5 &&
        (data.state !== 'EXHAUSTED' || data.attemptCount === 5) &&
        (data.state !== 'ISSUED' || Number(data.attemptCount) < 5),
      400,
      'MODEL_ATTEMPTS',
      '원래 인계 오류 상한이 다릅니다.',
    );
    requireCondition(
      (data.state === 'CLAIMED') === (data.claimReceiptRef !== null),
      400,
      'MODEL_CLAIM',
      '단회 claim 원본 연결이 다릅니다.',
    );
  }
  for (const key of [
    'codeVerifier',
    'tokenVerifier',
    'secretVerifier',
    'browserVerifier',
    'handleVerifier',
  ])
    if (key in data)
      requireCondition(
        /^[a-f0-9]{64}$/.test(String(data[key])),
        400,
        'MODEL_VERIFIER',
        '등록된 검증 자료가 필요합니다.',
      );
  if (model === 'RoleRevisionState') {
    requireCondition(
      (data.roleRef !== null) !== (data.staffRoleRef !== null),
      400,
      'MODEL_ROLE_KIND',
      '명시된 단일 역할 원본이 필요합니다.',
    );
    const actions = data.actions as unknown[],
      scopes = data.scopeRefs as unknown[];
    requireCondition(
      data.roleRef !== null
        ? actions.length === 0
        : scopes.length === 0 && (data.active === false || actions.length > 0),
      400,
      'MODEL_ROLE_ACTIONS',
      '역할 종류의 등록된 행위가 필요합니다.',
    );
  }
}

export function decodeU2Model(
  model: string,
  version: number,
  data: ModelData,
  schema: SchemaValidator,
): ModelData {
  if (version !== 1 || !U2_MODELS.some((entry) => entry.name === model))
    throw new Error('지원하는 U2 모델/decoder 버전이 아닙니다.');
  return validateModel(model, data, schema);
}
