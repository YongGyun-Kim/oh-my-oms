const CODES = new Set([
  '22023',
  '23502',
  '23503',
  '23505',
  '42501',
  '40001',
  '40P01',
  '55P03',
  '57014',
  'INVALID_INPUT',
  'INVALID_JSON',
  'EMPTY_COMMIT',
  'MODEL_VERSION',
  'MODEL_VERSION_MIX',
  'U4_RECOVERY_PROFILE',
  'U4_RECOVERY_MODEL_VERSION',
  'U4_RECOVERY_CONSTRAINTS',
  'U4_RECOVERY_RESERVATION',
  'RECOVERY_DIGEST',
  'RECOVERY_SIZE',
  'WRITER_FENCED',
  'CURRENT_U4_NOT_PROTECTED',
  'IDEMPOTENCY_CONFLICT',
  'REVISION_SEQUENCE',
  'WRITE_CONTRACT_REQUIRED',
  'U4_SOURCE_UNVERIFIED',
  'U4_PAYMENT_LIMIT',
  'U4_INVOICE_LIMIT',
  'STALE_U4_REFERENCE',
  'QUERY_DEADLINE',
  'AUTHORIZATION_FENCE_CHANGED',
  'CURRENT_AUTH_NOT_PROTECTED',
  'EXECUTION_DEADLINE',
  'MFA_REQUIRED',
  'U4_PREMISE_CHANGED',
  'U4_LEDGER_UNCONFIRMED',
  'U4_FINANCIAL_BUSY',
  'U4_OWNER_UNREGISTERED',
  'U4_DUE_UNVERIFIED',
  'U4_DUE_CONFLICT',
  'U4_DUE_SEQUENCE',
  'U4_DUE_ALREADY_CURRENT',
  'U4_DUE_BASIS_MISSING',
  'U4_ELIGIBILITY_BASIS',
  'U4_ELIGIBILITY_STALE',
  'U4_ELIGIBILITY_ACCESS',
  'U4_RESTRICTION_BASIS',
  'U4_READ_ONLY',
  'U4_RECOVERY_COMPLETION',
  'U4_FEE_ADJUSTMENT_UNSUPPORTED',
]);
const NAMES = new Set([
  'Error',
  'AssertionError',
  'OmsError',
  'QueryFailedError',
  'TypeError',
  'RangeError',
]);
const LOCATION =
  /((?:packages\/persistence\/src\/(?:protected-write|protected-store|protected-transaction|u4-repository|recovery-types|model-catalog|u4-model-decoder|u4-completion-link|u4-recovery-verification|recovery-security-observation|recovery-security-write|recovery-security)|packages\/core\/src\/(?:u4-commercial-adapter|u4-payment-plan|u4-commercial-order|u4-order-terms|u4-plan-proposal|u4-proposal-proof|u4-staff-access|u4-financial-access|u4-financial-source|u4-financial-commands|u4-financial-ledger|u4-due-basis|u4-owner-sources|u4-invoice-due|u4-eligibility|u3-current-basis|authorization)|tests\/u4\/fixtures\/(?:commercial-plan|financial-flow|security-oracle|owner-facts)|tests\/u4\/unit\/(?:due-basis|owner-sources|eligibility|completion-basis|completion-link|result-boundaries)\.spec|tests\/u4\/integration\/(?:persistence|concurrency|protection-replay|commercial-plan|renewal-plan|staff-access|financial-flow|financial-ledger|financial-races|financial-corrections|financial-cancellation|financial-binding|owner-facts|completion-migration|financial-result-boundaries)\.spec)\.ts):(\d+):(\d+)/g;

// 설치된 Vitest의 고정 timeout 문구만 분류한다. 원문·SQL·매개변수·환경은 보존하지 않는다.
export function safeU4Error(value: unknown): {
  code: string;
  name: string;
  locations: { file: string; line: number; column: number }[];
} {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const driver =
    row.driverError && typeof row.driverError === 'object'
      ? (row.driverError as { code?: unknown })
      : {};
  const code = [row.code, driver.code].find(
    (candidate) => typeof candidate === 'string' && CODES.has(candidate),
  );
  const testTimeout =
    row.name === 'Error' &&
    row.message ===
      'Test timed out in 120000ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".';
  const stack =
    typeof row.stackStr === 'string'
      ? row.stackStr
      : typeof row.stack === 'string'
        ? row.stack
        : '';
  return {
    code:
      typeof code === 'string' ? code : testTimeout ? 'VITEST_TEST_TIMEOUT' : 'UNCLASSIFIED_ERROR',
    name: typeof row.name === 'string' && NAMES.has(row.name) ? row.name : 'Error',
    locations: [...stack.matchAll(LOCATION)]
      .slice(0, 5)
      .map((match) => ({ file: match[1]!, line: Number(match[2]), column: Number(match[3]) })),
  };
}
