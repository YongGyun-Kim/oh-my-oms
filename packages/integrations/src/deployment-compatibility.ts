import { fingerprint, requireCondition } from '@oms/contracts';
export interface ReleaseIdentity {
  sourceSha: string;
  imageDigest: string;
  schemaDigest: string;
  registryDigest: string;
  recoveryDecoderDigest: string;
  configRevision: string;
  keyGeneration: string;
  bindingGeneration: string;
  epoch: string;
  acceptedWorkVersions: number[];
}
export interface RollbackEvidence {
  incidentId: string;
  attemptId: string;
  current: ReleaseIdentity;
  previous: ReleaseIdentity;
  previousState: 'COMPLETED' | 'FAILED' | 'UNKNOWN';
  pendingWorkVersions: number[];
  originalKeysRetained: boolean;
  currentSecurityConfirmed: boolean;
  stagedCompatibilityPassed: boolean;
  manifestApproved: boolean;
}
function closed(value: unknown, keys: readonly string[]): void {
  requireCondition(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === [...keys].sort().join(','),
    503,
    'DEPLOYMENT_CLOSED_INPUT',
    '등록된 전체 release/제어 필드만 허용합니다.',
  );
}
export function validateRelease(value: ReleaseIdentity): void {
  closed(value, [
    'sourceSha',
    'imageDigest',
    'schemaDigest',
    'registryDigest',
    'recoveryDecoderDigest',
    'configRevision',
    'keyGeneration',
    'bindingGeneration',
    'epoch',
    'acceptedWorkVersions',
  ]);
  requireCondition(
    typeof value.sourceSha === 'string' &&
      typeof value.imageDigest === 'string' &&
      /^[a-f0-9]{40}$/.test(value.sourceSha) &&
      /^sha256:[a-f0-9]{64}$/.test(value.imageDigest),
    503,
    'RELEASE_IDENTITY',
    '원래 검증 source/image identity가 필요합니다.',
  );
  for (const key of ['schemaDigest', 'registryDigest', 'recoveryDecoderDigest'] as const)
    requireCondition(
      typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key]),
      503,
      'RELEASE_SCHEMA_IDENTITY',
      '닫힌 schema/등록/복구 decoder identity가 필요합니다.',
    );
  for (const key of ['configRevision', 'keyGeneration', 'bindingGeneration', 'epoch'] as const)
    requireCondition(
      typeof value[key] === 'string' && value[key].length >= 1 && value[key].length <= 128,
      503,
      'RELEASE_CONFIGURATION',
      '현재 구성/보안/세대 identity가 필요합니다.',
    );
  requireCondition(
    Array.isArray(value.acceptedWorkVersions) &&
      value.acceptedWorkVersions.length >= 1 &&
      value.acceptedWorkVersions.length <= 8 &&
      value.acceptedWorkVersions.every((version) => Number.isInteger(version) && version > 0) &&
      new Set(value.acceptedWorkVersions).size === value.acceptedWorkVersions.length,
    503,
    'RELEASE_WORK_DECODER',
    '등록된 유한 원래작업 decoder가 필요합니다.',
  );
}
// Application rollback is deliberately different from journal recovery. This
// returns an exact task/image target, never a DB downgrade/snapshot action.
export function evaluateRollback(evidence: RollbackEvidence) {
  closed(evidence, [
    'incidentId',
    'attemptId',
    'current',
    'previous',
    'previousState',
    'pendingWorkVersions',
    'originalKeysRetained',
    'currentSecurityConfirmed',
    'stagedCompatibilityPassed',
    'manifestApproved',
  ]);
  for (const key of [
    'originalKeysRetained',
    'currentSecurityConfirmed',
    'stagedCompatibilityPassed',
    'manifestApproved',
  ] as const)
    requireCondition(
      typeof evidence[key] === 'boolean',
      503,
      'DEPLOYMENT_BOOLEAN',
      '승인/보호 상태는 명시적 boolean이어야 합니다.',
    );
  requireCondition(
    ['COMPLETED', 'FAILED', 'UNKNOWN'].includes(evidence.previousState) &&
      Array.isArray(evidence.pendingWorkVersions) &&
      evidence.pendingWorkVersions.every((value) => Number.isInteger(value) && value > 0) &&
      new Set(evidence.pendingWorkVersions).size === evidence.pendingWorkVersions.length,
    503,
    'DEPLOYMENT_PENDING_DECODER',
    '원래 상태/대기 decoder version을 대조하세요.',
  );
  validateRelease(evidence.current);
  validateRelease(evidence.previous);
  requireCondition(
    typeof evidence.incidentId === 'string' &&
      typeof evidence.attemptId === 'string' &&
      evidence.incidentId.length >= 1 &&
      evidence.incidentId.length <= 128 &&
      evidence.attemptId.length >= 1 &&
      evidence.attemptId.length <= 128 &&
      evidence.pendingWorkVersions.length <= 8,
    503,
    'ROLLBACK_EVIDENCE',
    '원래 사건/시도와 현재 대기작업 증거가 필요합니다.',
  );
  const retained = [
    'schemaDigest',
    'registryDigest',
    'recoveryDecoderDigest',
    'configRevision',
    'keyGeneration',
    'bindingGeneration',
    'epoch',
  ] as const;
  const reasons: string[] = [];
  if (evidence.previousState !== 'COMPLETED') reasons.push('NO_PREVIOUS_COMPLETED_TARGET');
  if (retained.some((key) => evidence.current[key] !== evidence.previous[key]))
    reasons.push('CURRENT_DATA_SECURITY_COMPATIBILITY_UNPROVEN');
  if (
    evidence.pendingWorkVersions.some(
      (version) => !evidence.previous.acceptedWorkVersions.includes(version),
    )
  )
    reasons.push('ORIGINAL_PENDING_WORK_DECODER_MISSING');
  if (!evidence.originalKeysRetained || !evidence.currentSecurityConfirmed)
    reasons.push('CURRENT_AUTH_OR_ORIGINAL_EFFECT_UNCONFIRMED');
  if (!evidence.stagedCompatibilityPassed || !evidence.manifestApproved)
    reasons.push('PINNED_STAGING_OR_APPROVAL_MISSING');
  return {
    incidentId: evidence.incidentId,
    attemptId: evidence.attemptId,
    state: reasons.length ? 'MANUAL_RECONCILIATION_REQUIRED' : 'APPLICATION_ROLLBACK_ELIGIBLE',
    targetImage: reasons.length ? null : evidence.previous.imageDigest,
    reasons,
    preservesDatabase: true,
    preservesOriginalKeys: true,
    securityAuthorityUnchanged: true,
    evidenceFingerprint: fingerprint(evidence),
  } as const;
}
