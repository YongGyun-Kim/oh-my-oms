import { canonicalJson, requireCondition, SchemaValidator } from '@oms/contracts';
import type { Ref, U4DueBasis } from '@oms/contracts';

export interface U4ProvisionTranche {
  trancheId: string;
  trancheRef: Ref;
  orderRef: Ref;
  orderLineRef: Ref;
  termsSnapshotRef: Ref;
  completionBasis: 'HW_DELIVERY' | 'HW_CUSTOMER_ACCEPTANCE' | 'SW_ISSUANCE_AVAILABLE_AND_START';
  completionState: 'PENDING' | 'COMPLETED' | 'REVERSED' | 'UNKNOWN' | 'CONFLICT';
  completedQuantity: number | null;
  completedAt: string | null;
  hardwareDeliveredAt: string | null;
  customerAcceptedAt: string | null;
  softwareIssuedAt: string | null;
  resultAvailableAt: string | null;
  contractualStartAt: string | null;
  sourceRevision: number;
  correctionOf: Ref | null;
  correctedAt: string | null;
  evidenceRefs: Ref[];
}
export interface U4CompletionLine {
  lineRef: Ref;
  quantity: number;
  completionBasisRef: Ref;
}
export interface U4CompletionScope {
  orderRef: Ref;
  termsSnapshotRef: Ref;
  productType: 'HARDWARE' | 'SOFTWARE';
  lines: U4CompletionLine[];
}
const exact = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const defaultSchema = new SchemaValidator();
const hold = (condition: unknown) =>
  requireCondition(
    condition,
    503,
    'U4_DUE_UNVERIFIED',
    '현재 약정과 실제 완료 원본을 확인해야 합니다.',
  );
const dayMillis = 86400000;

function dateValue(value: string): number {
  const timestamp = Date.parse(value + 'T00:00:00.000Z');
  hold(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(timestamp));
  hold(new Date(timestamp).toISOString().slice(0, 10) === value && value.slice(0, 4) !== '0000');
  return timestamp;
}
export function u4KstDate(instant: string): string {
  defaultSchema.validate('Instant', instant);
  const timestamp = Date.parse(instant) + 9 * 3600000;
  hold(Number.isFinite(timestamp) && Math.abs(timestamp) <= 8640000000000000);
  const value = new Date(timestamp).toISOString().slice(0, 10);
  dateValue(value);
  return value;
}
export function u4KstDueDate(instant: string, days: number): string {
  hold(Number.isSafeInteger(days) && days >= 0);
  const base = dateValue(u4KstDate(instant));
  // 유한 날짜 범위를 넘는 합의는 반복/잘라내기/반올림으로 계산하지 않는다.
  hold(days <= Math.floor((dateValue('9999-12-31') - base) / dayMillis));
  const value = new Date(base + days * dayMillis).toISOString().slice(0, 10);
  dateValue(value);
  return value;
}
export function u4IsDelayCandidate(dueDate: string, now: string): boolean {
  dateValue(dueDate);
  return u4KstDate(now) > dueDate;
}

export function u4FullCompletion(
  expected: U4CompletionScope,
  tranches: U4ProvisionTranche[],
  schema = defaultSchema,
): { completedAt: string; sourceRefs: Ref[] } {
  hold(expected.lines.length > 0 && expected.lines.length <= 100);
  // 첫 버전은 품목별 단일 FULL 완료만 지원한다. 여러 부분 건을 임의 합산하지 않는다.
  hold(tranches.length === expected.lines.length);
  hold(new Set(tranches.map((value) => value.trancheId)).size === tranches.length);
  const sourceRefs: Ref[] = [];
  let completedAt: string | null = null;
  for (const line of expected.lines) {
    const matches = tranches.filter((value) => exact(value.orderLineRef, line.lineRef));
    hold(matches.length === 1);
    const value = matches[0]!;
    schema.validateUri('urn:oms:contract:common:2#/$defs/ProvisionTranche', value);
    hold(
      exact(value.orderRef, expected.orderRef) &&
        exact(value.termsSnapshotRef, expected.termsSnapshotRef) &&
        value.completionState === 'COMPLETED' &&
        value.completedQuantity === line.quantity &&
        value.completedAt !== null &&
        value.evidenceRefs.length > 0 &&
        value.trancheRef.owner ===
          (expected.productType === 'HARDWARE' ? 'HardwareFulfillment' : 'SoftwareLifecycle'),
    );
    let actual: string | null;
    if (expected.productType === 'HARDWARE') {
      hold(['HW_DELIVERY', 'HW_CUSTOMER_ACCEPTANCE'].includes(value.completionBasis));
      actual =
        value.completionBasis === 'HW_DELIVERY'
          ? value.hardwareDeliveredAt
          : value.customerAcceptedAt;
    } else {
      hold(value.completionBasis === 'SW_ISSUANCE_AVAILABLE_AND_START');
      const times = [value.softwareIssuedAt, value.resultAvailableAt, value.contractualStartAt];
      hold(times.every((time) => time !== null && Number.isFinite(Date.parse(time))));
      actual = times.reduce((latest, time) =>
        Date.parse(time!) > Date.parse(latest!) ? time : latest,
      );
    }
    hold(actual !== null && Date.parse(actual) === Date.parse(value.completedAt!));
    if (completedAt === null || Date.parse(actual!) > Date.parse(completedAt)) completedAt = actual;
    sourceRefs.push(value.trancheRef, ...value.evidenceRefs);
  }
  hold(completedAt !== null);
  return { completedAt: completedAt!, sourceRefs };
}

export function u4DueFromFact(basis: U4DueBasis, confirmedAt: string | null): string | null {
  defaultSchema.validateUri('urn:oms:contract:u4-financial:1#/$defs/DueBasis', basis);
  if (basis.kind === 'FIXED_DATE') {
    dateValue(basis.date);
    return basis.date;
  }
  return confirmedAt === null ? null : u4KstDueDate(confirmedAt, basis.days);
}
