import { canonicalJson, requireCondition } from '@oms/contracts';
import type {
  RecoveryProviderCapabilities,
  RecoveryProviderOperation,
  RecoveryProviderTarget,
  RecoveryProviderObservation,
} from '@oms/core';
export const RECOVERY_PROVIDER_OPERATIONS = Object.freeze([
  'REMOVE_ORIGINAL_FACTOR',
  'SIGN_OUT_ORIGINAL_SESSIONS',
  'REPLACE_FIRST_FACTOR',
  'BEGIN_NEW_FACTOR',
  'VERIFY_NEW_FACTOR',
] as const);
export function recoveryCapabilities(
  provider: 'COGNITO' | 'KEYCLOAK' | 'SYNTHETIC',
  profile: 'LOCAL_SYNTHETIC' | 'LOCAL_SDK_DOUBLE' | 'UNREGISTERED',
): RecoveryProviderCapabilities {
  requireCondition(
    profile !== 'LOCAL_SYNTHETIC' || provider === 'SYNTHETIC',
    503,
    'PROVIDER_CAPABILITY_PROFILE',
    '합성 실제 원본 관측은 local provider에만 등록합니다.',
  );
  requireCondition(
    profile !== 'LOCAL_SDK_DOUBLE' || provider === 'COGNITO',
    503,
    'PROVIDER_CAPABILITY_PROFILE',
    'SDK double과 실제 provider 활성화를 구별하세요.',
  );
  return Object.freeze({
    provider,
    profile,
    operations: profile === 'UNREGISTERED' ? Object.freeze([]) : RECOVERY_PROVIDER_OPERATIONS,
    sdkMaxAttempts: 1 as const,
    subjectMutationLimit: 1 as const,
    originalTermination: profile === 'LOCAL_SYNTHETIC',
    lateEffectIsolation: profile === 'LOCAL_SYNTHETIC',
    realActivation: false as const,
  });
}
export function assertRecoveryCapability(
  capabilities: RecoveryProviderCapabilities,
  operation: RecoveryProviderOperation,
): void {
  requireCondition(
    capabilities.profile !== 'UNREGISTERED' &&
      capabilities.operations.includes(operation) &&
      capabilities.sdkMaxAttempts === 1 &&
      capabilities.subjectMutationLimit === 1 &&
      capabilities.realActivation === false,
    503,
    'RECOVERY_PROVIDER_HOLD',
    '실제 capability/현재 실행 profile이 미확인인 복구는 보류합니다.',
  );
}
export function assertRecoveryObservation(
  target: RecoveryProviderTarget,
  result: RecoveryProviderObservation,
): void {
  requireCondition(
    result.approvedOperationId === target.approvedOperationId &&
      result.workId === target.workId &&
      canonicalJson(result.bindingRef) === canonicalJson(target.bindingRef) &&
      result.inputDigest === target.inputDigest &&
      result.epoch === target.epoch &&
      result.evidenceRefs.length <= 20 &&
      Number.isFinite(Date.parse(result.observedAt)),
    503,
    'PROVIDER_ORIGINAL_RESULT',
    '다른 원래 operation/target/input/epoch 결과로 현재 effect를 대체하지 않습니다.',
  );
  requireCondition(
    result.knowledge !== 'KNOWN' ||
      (result.terminal &&
        result.effect !== 'UNCONFIRMED' &&
        result.providerRequestId.length > 0 &&
        result.evidenceRefs.length > 0),
    503,
    'PROVIDER_ORIGINAL_RESULT',
    '수락/probe가 아닌 원래 종료/격리의 실제 근거가 필요합니다.',
  );
}
