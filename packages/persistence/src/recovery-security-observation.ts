import { requireCondition, SchemaValidator, U3_PROFILE, U4_PROFILE } from '@oms/contracts';
import {
  modelDefinition,
  primaryAttribute,
  rowModelVersion,
  validateModel,
} from './model-catalog.js';
import type { CurrentSecurityAuthority, RecoverySecurityObservation } from './recovery-security.js';

export const LEGACY_RECOVERY_OBSERVATION_PROFILE = 'urn:oms:contract:foundation:1';

// This configuration belongs to the server-registered authority adapter. An
// observation/provider response cannot select or widen its decoder contract.
export function registeredRecoveryObservationProfile(
  authority: Pick<CurrentSecurityAuthority, 'kind' | 'observationProfile'>,
): string {
  requireCondition(
    authority.kind === 'REGISTERED_CURRENT_OWNER' || authority.kind === 'SYNTHETIC',
    503,
    'RECOVERY_SECURITY_SOURCE_UNREGISTERED',
    '등록된 현재 owner 관측이 필요합니다.',
  );
  const profile =
    authority.observationProfile === undefined
      ? LEGACY_RECOVERY_OBSERVATION_PROFILE
      : authority.observationProfile;
  requireCondition(
    profile === LEGACY_RECOVERY_OBSERVATION_PROFILE ||
      profile === U3_PROFILE ||
      profile === U4_PROFILE,
    503,
    'RECOVERY_OBSERVATION_PROFILE',
    '서버에 등록된 관측 계약이 필요합니다.',
  );
  return profile!;
}

export function validateRecoverySecurityObservation(
  schema: SchemaValidator,
  registeredProfile: string,
  input: unknown,
): RecoverySecurityObservation {
  requireCondition(
    registeredProfile === LEGACY_RECOVERY_OBSERVATION_PROFILE ||
      registeredProfile === U3_PROFILE ||
      registeredProfile === U4_PROFILE,
    503,
    'RECOVERY_OBSERVATION_PROFILE',
    '등록되지 않은 관측 계약입니다.',
  );
  const observation = schema.validateUri<RecoverySecurityObservation>(
    registeredProfile + '#/$defs/RecoverySecurityObservation',
    input,
  );
  requireCondition(
    observation.sourceOwner === modelDefinition(observation.model).owner,
    503,
    'RECOVERY_OBSERVATION_OWNER',
    '관측 모델의 원래 owner가 필요합니다.',
  );
  if (observation.currentData !== null) {
    const current = validateModel(observation.model, observation.currentData, schema);
    const actualVersion = rowModelVersion(observation.model, current);
    requireCondition(
      (registeredProfile === LEGACY_RECOVERY_OBSERVATION_PROFILE
        ? actualVersion === 1
        : observation.modelVersion === actualVersion) &&
        current[primaryAttribute(modelDefinition(observation.model)).name] === observation.id &&
        current.revision === observation.sourceRevision,
      503,
      'RECOVERY_OBSERVATION_MODEL_VERSION',
      '관측 frame과 실제 원본의 버전/대상이 일치해야 합니다.',
    );
  }
  return observation;
}
