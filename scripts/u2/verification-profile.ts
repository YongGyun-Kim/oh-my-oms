import runtimeProfile from '../../docs/u2/runtime-profile.json' with { type: 'json' };
import { canonicalJson, requireCondition } from '@oms/contracts';
import type { Phase } from '../u1/performance-statistics.js';

// Public measurement metadata only. No provider capability, credential or live-demand claim.
export const PILOT_PROFILE = Object.freeze(runtimeProfile.measurementProfile);
export const EXPANSION_PROFILE = Object.freeze(runtimeProfile.deferredExpansionProfile);
export function pilotActor(index: number) {
  requireCondition(
    Number.isInteger(index) && index >= 0 && index < PILOT_PROFILE.activeSessions,
    503,
    'PILOT_ACTOR',
    '등록된 pilot 활동 세션만 선택합니다.',
  );
  const customerSessions = PILOT_PROFILE.activeSessions - PILOT_PROFILE.staff;
  const staff = index >= customerSessions;
  return {
    company: index % PILOT_PROFILE.enterprises,
    audience: staff ? ('STAFF' as const) : ('CUSTOMER' as const),
    principalId: staff
      ? 'nfr-staff-' + (index - customerSessions)
      : 'nfr-customer-' + index * (PILOT_PROFILE.customers / PILOT_PROFILE.enterprises),
  };
}
export function profileCounts(
  profile: Pick<
    typeof PILOT_PROFILE,
    'enterprises' | 'customers' | 'staff' | 'products' | 'orders' | 'averageLines' | 'maximumLines'
  > = PILOT_PROFILE,
) {
  return {
    enterprises: profile.enterprises,
    customers: profile.customers,
    staff: profile.staff,
    products: profile.products,
    orders: profile.orders,
    averageItems: profile.averageLines,
    maximumItems: profile.maximumLines,
  };
}
export const mandatoryPilotPhases: readonly Phase[] = Object.freeze(
  [
    {
      name: 'NORMAL',
      rate: PILOT_PROFILE.normalRequestsPerSecond,
      seconds: PILOT_PROFILE.normalSeconds,
    },
    { name: 'PEAK', rate: PILOT_PROFILE.peakRequestsPerSecond, seconds: PILOT_PROFILE.peakSeconds },
    {
      name: 'RECOVERY',
      rate: PILOT_PROFILE.normalRequestsPerSecond,
      seconds: PILOT_PROFILE.recoverySeconds,
    },
    {
      name: 'HOLD',
      rate: PILOT_PROFILE.normalRequestsPerSecond,
      seconds: PILOT_PROFILE.maintainedSeconds,
    },
  ].map((phase) => Object.freeze(phase)),
);
export function registeredProfileCounts(seed: unknown) {
  if (seed === PILOT_PROFILE.id) return profileCounts();
  if (seed === EXPANSION_PROFILE.id) return profileCounts(EXPANSION_PROFILE);
  throw Error('미등록 검증 profile을 추정하지 않습니다.');
}
export function assertPilotCounts(counts: unknown) {
  requireCondition(
    canonicalJson(counts) === canonicalJson(profileCounts()),
    503,
    'PILOT_PROFILE_COUNTS',
    '현재 pilot의 동일 전체 규모 선언이 필요합니다.',
  );
}
export function assertPilotRestorationScale(counts: {
  orders: unknown;
  lines: unknown;
  products: unknown;
}) {
  requireCondition(
    counts &&
      Number(counts.orders) >= PILOT_PROFILE.orders &&
      Number(counts.lines) >= PILOT_PROFILE.orders * PILOT_PROFILE.averageLines &&
      Number(counts.products) >= PILOT_PROFILE.products,
    503,
    'PILOT_RESTORATION_SCALE',
    '등록된 현재 pilot 규모의 실제 DB 원본이 필요합니다.',
  );
}
export function validatePilotPerformance(value: unknown): void {
  const report = value as Record<string, unknown> | null;
  requireCondition(
    report &&
      report.verificationProfileId === PILOT_PROFILE.id &&
      report.finished === true &&
      report.passed === true &&
      report.workerRecoveryVerified === true &&
      Array.isArray(report.phases) &&
      report.phases.length === mandatoryPilotPhases.length,
    503,
    'PILOT_PERFORMANCE_REPORT',
    '현재 pilot의 완료된 전체 부하/회복/유지 증거가 필요합니다.',
  );
  assertPilotCounts(report.profile);
  const phases = report.phases as Record<string, unknown>[];
  for (let index = 0; index < mandatoryPilotPhases.length; index++) {
    const expected = mandatoryPilotPhases[index]!,
      phase = phases[index]!;
    requireCondition(
      phase &&
        phase.phase === expected.name &&
        phase.targetRate === expected.rate &&
        phase.durationSeconds === expected.seconds &&
        phase.requests === expected.rate * expected.seconds &&
        phase.readRequests === expected.rate * expected.seconds * 0.8 &&
        phase.writeRequests === expected.rate * expected.seconds * 0.2 &&
        phase.passed === true &&
        phase.accuracyFailures === 0 &&
        Number.isFinite(phase.elapsedMilliseconds) &&
        Number(phase.elapsedMilliseconds) >= expected.seconds * 1000 &&
        Number(phase.elapsedMilliseconds) <= expected.seconds * 1000 + 10000,
      503,
      'PILOT_PERFORMANCE_PHASE',
      '현재 단계의 원래 요청 구성/기간/정확성 검증이 필요합니다.',
    );
    if (expected.name !== 'PEAK')
      requireCondition(
        Number.isFinite(phase.readP95) &&
          Number(phase.readP95) >= 0 &&
          Number(phase.readP95) <= runtimeProfile.qualityFloors.readP95Milliseconds &&
          Number.isFinite(phase.writeP95) &&
          Number(phase.writeP95) >= 0 &&
          Number(phase.writeP95) <= runtimeProfile.qualityFloors.changeP95Milliseconds &&
          Number.isFinite(phase.errorRate) &&
          Number(phase.errorRate) >= 0 &&
          Number(phase.errorRate) <= runtimeProfile.qualityFloors.technicalErrorRate,
        503,
        'PILOT_PERFORMANCE_QUALITY',
        '원래 정상 응답/오류 기준을 유지합니다.',
      );
  }
}
