import { requireCondition } from '@oms/contracts';
export type AvailabilityPath =
  | 'customer-login-mfa'
  | 'customer-order-read'
  | 'customer-order-accept'
  | 'staff-private-read'
  | 'staff-private-review';
export interface AvailabilityInterval {
  start: number;
  end: number;
  state: 'AVAILABLE' | 'UNAVAILABLE' | 'UNCONFIRMED';
  cause: string;
  planned: boolean;
}
export function availabilityForPath(
  path: AvailabilityPath,
  windowStart: number,
  windowEnd: number,
  intervals: readonly AvailabilityInterval[],
) {
  requireCondition(
    [
      'customer-login-mfa',
      'customer-order-read',
      'customer-order-accept',
      'staff-private-read',
      'staff-private-review',
    ].includes(path) &&
      Number.isFinite(windowStart) &&
      windowEnd - windowStart === 2592000000 &&
      intervals.length <= 10000,
    503,
    'SLI_WINDOW',
    '등록된 업무의 연속30일 관측 범위가 필요합니다.',
  );
  for (const value of intervals)
    requireCondition(
      Number.isFinite(value.start) &&
        Number.isFinite(value.end) &&
        value.end > value.start &&
        ['AVAILABLE', 'UNAVAILABLE', 'UNCONFIRMED'].includes(value.state) &&
        value.cause.length <= 128,
      503,
      'SLI_INTERVAL',
      '실제 관측 시간/미확인 원인이 필요합니다.',
    );
  const ordered = intervals
    .filter((value) => value.end > windowStart && value.start < windowEnd)
    .map((value) => ({
      ...value,
      start: Math.max(windowStart, value.start),
      end: Math.min(windowEnd, value.end),
    }));
  // Coverage is independent of success. Gaps are unknown, not 100% available.
  const points = [
    ...new Set([windowStart, windowEnd, ...ordered.flatMap((value) => [value.start, value.end])]),
  ].sort((a, b) => a - b);
  let unavailableMilliseconds = 0;
  let unconfirmedMilliseconds = 0;
  const causes = new Set<string>();
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1]!;
    const end = points[i]!;
    const active = ordered.filter((value) => value.start <= start && value.end >= end);
    if (active.some((value) => value.state === 'UNAVAILABLE')) {
      unavailableMilliseconds += end - start;
      for (const value of active.filter((value) => value.state !== 'AVAILABLE'))
        causes.add(value.cause);
    } else if (!active.length || active.some((value) => value.state === 'UNCONFIRMED')) {
      unconfirmedMilliseconds += end - start;
      for (const value of active) causes.add(value.cause);
      if (!active.length) causes.add('OBSERVATION_GAP');
    }
  }
  const consumedSeconds = (unavailableMilliseconds + unconfirmedMilliseconds) / 1000;
  return {
    path,
    windowStart,
    windowEnd,
    denominatorSeconds: 2592000,
    unavailableSeconds: unavailableMilliseconds / 1000,
    unconfirmedSeconds: unconfirmedMilliseconds / 1000,
    availability: 1 - consumedSeconds / 2592000,
    budgetSeconds: 2592,
    remainingSeconds: 2592 - consumedSeconds,
    causes: [...causes],
    realOperationProof: false,
  };
}
