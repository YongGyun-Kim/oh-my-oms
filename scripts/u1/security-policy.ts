export interface SecurityException {
  id: string;
  owner: string;
  reason: string;
  expiresAt: string;
  reviewAt: string;
  residualRisk: string;
  findingIds: string[];
}
export interface SecretExposure {
  id: string;
  observedAt: string;
  credentialRef: string;
  revoked: boolean;
  replacementVerified: boolean;
  usageReviewed: boolean;
  impactReviewed: boolean;
  logsReviewed: boolean;
  backupsReviewed: boolean;
}
function closed(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== keys.sort().join(',')
  )
    throw new Error('보안 대응에는 등록된 최소 필드만 허용합니다.');
}
function reference(value: unknown): void {
  if (typeof value !== 'string' || Array.from(value).length < 1 || Array.from(value).length > 128)
    throw new Error('민감 원문이 아닌 유한 담당/근거 참조가 필요합니다.');
}
function explanation(value: unknown): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096)
    throw new Error('담당자의 명시 사유/잔여위험이 필요합니다.');
}
function at(value: unknown): number {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new Error('확인된 만료/재검토 시각이 필요합니다.');
  return Date.parse(value);
}
export function evaluateSecurityExceptions(values: unknown, now: Date) {
  if (!Array.isArray(values) || values.length > 100)
    throw new Error('유한 보안 예외 목록이 필요합니다.');
  const ids = new Set<string>();
  const evaluated = values.map((value) => {
    closed(value, ['id', 'owner', 'reason', 'expiresAt', 'reviewAt', 'residualRisk', 'findingIds']);
    reference(value.id);
    reference(value.owner);
    explanation(value.reason);
    explanation(value.residualRisk);
    const expiry = at(value.expiresAt);
    const review = at(value.reviewAt);
    if (ids.has(value.id as string) || review > expiry)
      throw new Error('예외 identity와 만료 이전 재검토를 대조해야 합니다.');
    ids.add(value.id as string);
    if (
      !Array.isArray(value.findingIds) ||
      !value.findingIds.length ||
      value.findingIds.length > 64
    )
      throw new Error('원래 발견 참조가 필요합니다.');
    value.findingIds.forEach(reference);
    if (new Set(value.findingIds).size !== value.findingIds.length)
      throw new Error('원래 발견 참조를 중복할 수 없습니다.');
    return {
      id: value.id as string,
      state:
        expiry <= now.getTime()
          ? 'EXPIRED'
          : review <= now.getTime()
            ? 'REVIEW_REQUIRED'
            : 'DOCUMENTED_RESIDUAL_RISK',
      countsAsPassed: false,
      waivesHighCritical: false,
    };
  });
  return { evaluated, hasUnresolvedRisk: evaluated.length > 0, countsAsPassed: false };
}
export function evaluateSecretExposures(values: unknown) {
  if (!Array.isArray(values) || values.length > 100)
    throw new Error('유한 비밀 노출 대응 목록이 필요합니다.');
  const ids = new Set<string>();
  return values.map((value) => {
    closed(value, [
      'id',
      'observedAt',
      'credentialRef',
      'revoked',
      'replacementVerified',
      'usageReviewed',
      'impactReviewed',
      'logsReviewed',
      'backupsReviewed',
    ]);
    reference(value.id);
    reference(value.credentialRef);
    at(value.observedAt);
    if (ids.has(value.id as string)) throw new Error('원래 노출 사건 identity가 중복됩니다.');
    ids.add(value.id as string);
    const checks = [
      'revoked',
      'replacementVerified',
      'usageReviewed',
      'impactReviewed',
      'logsReviewed',
      'backupsReviewed',
    ] as const;
    for (const check of checks)
      if (typeof value[check] !== 'boolean')
        throw new Error('대응 확인은 명시 boolean이어야 합니다.');
    return {
      id: value.id as string,
      state: checks.every((check) => value[check] === true)
        ? 'RESPONSE_EVIDENCE_COMPLETE'
        : 'OBSERVED_OPEN',
      remaining: checks.filter((check) => value[check] !== true),
      realIncidentVerified: false,
    };
  });
}
