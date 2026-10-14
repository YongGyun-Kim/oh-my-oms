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
  /((?:packages\/persistence\/src\/(?:protected-write|protected-store|protected-transaction|u4-repository|recovery-types|model-catalog|u4-model-decoder|recovery-security-observation|recovery-security-write|recovery-security)|packages\/core\/src\/(?:u4-commercial-adapter|u4-payment-plan|u4-commercial-order|u4-order-terms|u4-plan-proposal|u4-proposal-proof|u4-staff-access|u4-financial-access|u4-financial-source|u4-financial-commands|u4-financial-ledger|u3-current-basis|authorization)|tests\/u4\/fixtures\/(?:commercial-plan|financial-flow|security-oracle)|tests\/u4\/integration\/(?:persistence|concurrency|protection-replay|commercial-plan|renewal-plan|staff-access|financial-flow|financial-ledger|financial-races|financial-corrections|financial-cancellation|financial-binding)\.spec)\.ts):(\d+):(\d+)/g;

// 메시지·SQL·매개변수·환경·임의 속성은 읽거나 직렬화하지 않는다.
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
  const stack =
    typeof row.stackStr === 'string'
      ? row.stackStr
      : typeof row.stack === 'string'
        ? row.stack
        : '';
  return {
    code: typeof code === 'string' ? code : 'UNCLASSIFIED_ERROR',
    name: typeof row.name === 'string' && NAMES.has(row.name) ? row.name : 'Error',
    locations: [...stack.matchAll(LOCATION)]
      .slice(0, 5)
      .map((match) => ({ file: match[1]!, line: Number(match[2]), column: Number(match[3]) })),
  };
}
