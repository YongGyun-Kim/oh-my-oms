import { canonicalJson, fingerprint } from '@oms/contracts';
// Only immutable-evidence evaluators and the explicitly named recovery-only
// preservation/current-security verifiers below may change. Serving apps,
// providers, load scheduling and its DB/queue fixtures, build settings and locks
// are never exempt. Recovery verifiers are not imported by the measured service.
export const evaluationOnlyPaths = new Set([
  'scripts/u1/worker-recovery-evidence.ts',
  'scripts/u1/measurement-provenance.ts',
  'scripts/u1/requalify-performance.ts',
  'tests/u1/unit/worker-recovery-evidence.spec.ts',
  'tests/u1/unit/measurement-provenance.spec.ts',
  'tests/u1/unit/requalify-performance.spec.ts',
  'tests/u1/unit/skeleton.spec.ts',
  'tests/u1/fixtures/recovery-preservation.ts',
  'tests/u1/integration/recovery.spec.ts',
  'tests/u1/fixtures/recovery-security-oracle.ts',
  'tests/u1/integration/recovery-security.spec.ts',
]);
export function evaluationProvenance(
  measured: Record<string, string>,
  evaluated: Record<string, string>,
) {
  const paths = [...new Set([...Object.keys(measured), ...Object.keys(evaluated)])].sort();
  if (paths.length > 20000) throw new Error('측정 source 범위를 확인해야 합니다.');
  for (const identity of [measured, evaluated])
    for (const digest of Object.values(identity))
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('측정 source digest 형식이 다릅니다.');
  const delta = paths
    .filter((path) => measured[path] !== evaluated[path])
    .map((path) => ({
      path,
      measuredSha256: measured[path] ?? null,
      evaluatedSha256: evaluated[path] ?? null,
    }));
  if (
    delta.some(
      ({ path, evaluatedSha256 }) => !evaluationOnlyPaths.has(path) || evaluatedSha256 === null,
    )
  )
    throw new Error(
      '측정 runtime/config/fixture/부하 실행 source 변경은 재평가로 대체할 수 없습니다.',
    );
  return {
    measuredFullSourceDigest: fingerprint(measured),
    evaluationFullSourceDigest: fingerprint(evaluated),
    delta,
    runtimeConfigLoadSchedulingServingFixturesUnchanged: true as const,
  };
}
export function validateEvaluationProvenance(
  measured: Record<string, string>,
  evaluated: Record<string, string>,
  actual: ReturnType<typeof evaluationProvenance>,
) {
  if (canonicalJson(actual) !== canonicalJson(evaluationProvenance(measured, evaluated)))
    throw new Error('실제 측정/재평가 source 대조 증거가 다릅니다.');
}
