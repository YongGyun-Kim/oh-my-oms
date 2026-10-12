// 진단은 성공 증거가 아니다. 실제 오류의 닫힌 scalar만 읽고 원문/기대값을 추측하지 않는다.
export const diagnosticCodes = [
  'UNKNOWN',
  'EXECUTION_DEADLINE',
  'REQUEST_DEADLINE_EXPIRED',
  'REQUEST_UNAVAILABLE',
  'CURRENT_U3_NOT_PROTECTED',
  'CURRENT_AUTH_NOT_PROTECTED',
  'STALE_U3_REFERENCE',
  'U3_PREMISE_CHANGED',
  'ORDER_TERMS_CHAIN',
  'ORDER_SNAPSHOT_UNCONFIRMED',
  'U3_PROOF_UNCONFIRMED',
  'ORDER_READINESS_UNCONFIRMED',
  'ORDER_READINESS_CHANGED',
  'ORDER_CONDITIONS_CHANGED',
  'WRITER_FENCED',
  'RECOVERY_SECURITY_UNCONFIRMED',
  'PROTECTION_GAP',
  'STAFF_NETWORK_REQUIRED',
  'ACTION_DENIED',
  'NOT_FOUND',
  'SYNTHETIC_APPLY_RESPONSE_LOSS',
  'SYNTHETIC_APPLY_ROLLBACK',
  'SYNTHETIC_APPLY_PROTECTION',
] as const;
const sqlStates = [
  'UNKNOWN',
  '23503',
  '23505',
  '55P03',
  '57014',
  '25P02',
  '25P04',
  '08006',
  '57P01',
] as const;
const kinds = ['BUSINESS', 'DATABASE', 'QUERY_RUNNER_RELEASED', 'ASSERTION', 'UNKNOWN'] as const;
export const diagnosticPhases = [
  'SUBMISSION_100',
  'DECISION_SEED_SUBMISSION_100',
  'DECISION_100',
  'READ_100',
  'APPLY_REVIEW',
  'APPLY_RESPONSE_LOSS',
  'APPLY_ROLLBACK',
  'APPLY_PROTECTION',
  'HTTP_APPLY',
] as const;
export const diagnosticMethods = [
  'currentProtected',
  'transactionGet',
  'assertPremises',
  'protectedExecute',
  'protect',
  'transactionPut',
  'putNewBatch',
  'validateUri',
  'validateSchema',
] as const;
export type DiagnosticPhase = (typeof diagnosticPhases)[number];
export type DiagnosticMethod = (typeof diagnosticMethods)[number];
export interface SafeError {
  kind: (typeof kinds)[number];
  code: (typeof diagnosticCodes)[number];
  sqlState: (typeof sqlStates)[number];
}
export interface SafeAggregate {
  calls: number;
  milliseconds: number;
  entryRemainingMinimum: number | null;
  exitRemainingMinimum: number | null;
  rejectedCalls: number;
  rejectedErrors: SafeError[];
}
export interface SafePhase {
  phase: DiagnosticPhase;
  milliseconds: number;
  requestRemainingAtEntry: number | null;
  methods: Partial<Record<DiagnosticMethod, SafeAggregate>>;
}
export interface SafeHttp {
  phase: 'HTTP_APPLY';
  status: number;
  code: (typeof diagnosticCodes)[number];
}
export interface SafeFailure {
  version: 1;
  errors: SafeError[];
  phases: SafePhase[];
  http: SafeHttp[];
}
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));
const member = <T extends string>(values: readonly T[], value: unknown): value is T =>
  values.some((candidate) => candidate === value);
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const remaining = (value: unknown): value is number | null =>
  value === null || finite(value, -1800000, 10000);

export function observedError(error: unknown): SafeError {
  const value = object(error),
    driver = object(value?.driverError);
  const code = member(diagnosticCodes, value?.code) ? value.code : 'UNKNOWN';
  const sqlState = member(sqlStates, driver?.code)
    ? driver.code
    : member(sqlStates, value?.code)
      ? value.code
      : 'UNKNOWN';
  const kind =
    code !== 'UNKNOWN'
      ? 'BUSINESS'
      : sqlState !== 'UNKNOWN'
        ? 'DATABASE'
        : ['QueryRunnerAlreadyReleasedError', 'QueryRunnerAlreadyReleased'].some(
              (name) => name === value?.name,
            )
          ? 'QUERY_RUNNER_RELEASED'
          : value?.name === 'AssertionError'
            ? 'ASSERTION'
            : 'UNKNOWN';
  return { kind, code, sqlState };
}
export function observedHttp(status: number, body: unknown): SafeHttp {
  const value = object(body);
  const code =
    diagnosticCodes.find(
      (candidate) =>
        candidate !== 'UNKNOWN' && value?.type === 'urn:oms:problem:' + candidate.toLowerCase(),
    ) ?? 'UNKNOWN';
  return { phase: 'HTTP_APPLY', status, code };
}
function safeError(value: unknown): value is SafeError {
  const data = object(value);
  return (
    !!data &&
    exactKeys(data, ['kind', 'code', 'sqlState']) &&
    member(kinds, data.kind) &&
    member(diagnosticCodes, data.code) &&
    member(sqlStates, data.sqlState)
  );
}
function safePhase(value: unknown): value is SafePhase {
  const data = object(value),
    methods = object(data?.methods);
  return (
    !!data &&
    !!methods &&
    exactKeys(data, ['phase', 'milliseconds', 'requestRemainingAtEntry', 'methods']) &&
    member(diagnosticPhases, data.phase) &&
    finite(data.milliseconds, 0, 1800000) &&
    remaining(data.requestRemainingAtEntry) &&
    Object.keys(methods).length <= diagnosticMethods.length &&
    Object.entries(methods).every(([name, raw]) => {
      const metric = object(raw);
      return (
        member(diagnosticMethods, name) &&
        !!metric &&
        exactKeys(metric, [
          'calls',
          'milliseconds',
          'entryRemainingMinimum',
          'exitRemainingMinimum',
          'rejectedCalls',
          'rejectedErrors',
        ]) &&
        finite(metric.calls, 0, 100000) &&
        Number.isSafeInteger(metric.calls) &&
        finite(metric.rejectedCalls, 0, Number(metric.calls)) &&
        Number.isSafeInteger(metric.rejectedCalls) &&
        finite(metric.milliseconds, 0, 1800000) &&
        remaining(metric.entryRemainingMinimum) &&
        remaining(metric.exitRemainingMinimum) &&
        Array.isArray(metric.rejectedErrors) &&
        metric.rejectedErrors.length <= 3 &&
        metric.rejectedErrors.every(safeError)
      );
    })
  );
}
function safeHttp(value: unknown): value is SafeHttp {
  const data = object(value);
  return (
    !!data &&
    exactKeys(data, ['phase', 'status', 'code']) &&
    data.phase === 'HTTP_APPLY' &&
    finite(data.status, 100, 599) &&
    Number.isSafeInteger(data.status) &&
    member(diagnosticCodes, data.code)
  );
}
// 새 meta가 오염되면 진단을 생략한다. 원래 시험 실패/수락 판정은 변경하지 않는다.
export function safeFailure(value: unknown): SafeFailure | null {
  const data = object(value);
  if (
    !data ||
    !exactKeys(data, ['version', 'errors', 'phases', 'http']) ||
    data.version !== 1 ||
    !Array.isArray(data.errors) ||
    data.errors.length > 3 ||
    !data.errors.every(safeError) ||
    !Array.isArray(data.phases) ||
    data.phases.length > 8 ||
    !data.phases.every(safePhase) ||
    !Array.isArray(data.http) ||
    data.http.length > 3 ||
    !data.http.every(safeHttp)
  )
    return null;
  const result: SafeFailure = {
    version: 1,
    errors: data.errors,
    phases: data.phases,
    http: data.http,
  };
  return structuredClone(result);
}
