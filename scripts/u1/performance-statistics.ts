export interface Sample {
  milliseconds: number;
  kind: 'READ' | 'WRITE';
  status: number;
  accuracy: boolean;
  bytes: number;
  operation?: 'requestRecovery';
  expectedStatus?: 200 | 202;
}
export interface Phase {
  name: string;
  rate: number;
  seconds: number;
}
export const mandatoryPhases: readonly Phase[] = [
  { name: 'NORMAL', rate: 20, seconds: 1800 },
  { name: 'PEAK', rate: 100, seconds: 300 },
  { name: 'RECOVERY', rate: 20, seconds: 300 },
  { name: 'HOLD', rate: 20, seconds: 600 },
];
export function percentile(values: number[], quantile: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * quantile) - 1)]!;
}
export function evaluateSamples(
  samples: readonly Sample[],
  phase: Phase,
  elapsedMilliseconds: number,
) {
  const reads = samples.filter((row) => row.kind === 'READ');
  const writes = samples.filter((row) => row.kind === 'WRITE');
  const validStatusContract = (row: Sample) =>
    (row.kind === 'READ' || row.kind === 'WRITE') &&
    (row.expectedStatus === undefined ||
      (row.kind === 'WRITE' && row.operation === 'requestRecovery' && row.expectedStatus === 200));
  const invalidStatusContracts = samples.filter((row) => !validStatusContract(row)).length;
  // This profile contains valid, authorised requests; unexpected refusals count
  // as technical/functional failure, never as successful access checks.
  const technical = samples.filter(
    (row) =>
      !validStatusContract(row) ||
      row.status !== (row.expectedStatus ?? (row.kind === 'READ' ? 200 : 202)),
  );
  // The registered endpoints never return redirects or a different 2xx
  // success. Burst backpressure remains a separately disclosed failure, but
  // a false success/redirect cannot be accepted as a valid burst result.
  const unexpectedResponseFailures = technical.filter(
    (row) => row.status >= 200 && row.status < 400,
  ).length;
  const accuracyFailures = samples.filter((row) => !row.accuracy).length;
  const readP95 = percentile(
    reads.map((row) => row.milliseconds),
    0.95,
  );
  const writeP95 = percentile(
    writes.map((row) => row.milliseconds),
    0.95,
  );
  const errorRate = technical.length / Math.max(1, samples.length);
  const normalCriteria =
    phase.name === 'PEAK' ||
    (readP95 !== null &&
      readP95 <= 1000 &&
      writeP95 !== null &&
      writeP95 <= 2000 &&
      errorRate <= 0.001);
  return {
    phase: phase.name,
    targetRate: phase.rate,
    durationSeconds: phase.seconds,
    elapsedMilliseconds,
    requests: samples.length,
    readRequests: reads.length,
    writeRequests: writes.length,
    readP95,
    writeP95,
    technicalFailures: technical.length,
    invalidStatusContracts,
    unexpectedResponseFailures,
    errorRate,
    accuracyFailures,
    normalCriteriaApplied: phase.name !== 'PEAK',
    maximumResponseBytes: Math.max(0, ...samples.map((row) => row.bytes)),
    passed:
      elapsedMilliseconds >= phase.seconds * 1000 &&
      elapsedMilliseconds <= phase.seconds * 1000 + 10000 &&
      samples.length === phase.rate * phase.seconds &&
      reads.length === phase.rate * phase.seconds * 0.8 &&
      normalCriteria &&
      accuracyFailures === 0 &&
      unexpectedResponseFailures === 0 &&
      invalidStatusContracts === 0 &&
      samples.every((row) => row.bytes <= 4 * 1024 * 1024),
  };
}
