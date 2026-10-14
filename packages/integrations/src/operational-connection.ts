import { ExecutionBudget, requireCondition } from '@oms/contracts';
import type { IncidentCause } from './incident-types.js';
import type { OperationalIncidents } from './incidents.js';
export interface NativeFault {
  incidentId: string;
  attemptId: string;
  eventId: string;
  faultAt: string;
  cause: IncidentCause;
}
// Provider/native-rule authority is verified outside any client body. Real
// IAM/operator/probe registrations remain unavailable until their IG evidence.
export interface IndependentFaultSource {
  readonly kind: 'REGISTERED' | 'SYNTHETIC' | 'UNREGISTERED';
  verifyAndObserve(nativeContext: unknown, signal: AbortSignal): Promise<NativeFault | null>;
  verifyReminder?(
    nativeContext: unknown,
    incidentId: string,
    eventId: string,
    signal: AbortSignal,
  ): Promise<boolean>;
}
export class OperationalConnection {
  constructor(
    private readonly incidents: OperationalIncidents,
    private readonly source: IndependentFaultSource,
    synthetic: boolean,
  ) {
    requireCondition(
      source.kind !== 'SYNTHETIC' || synthetic,
      503,
      'OPERATION_SYNTHETIC_FORBIDDEN',
      '운영 native 증거에 합성 관측을 사용할 수 없습니다.',
    );
  }
  async detect(nativeContext: unknown, incoming?: AbortSignal) {
    requireCondition(
      this.source.kind !== 'UNREGISTERED',
      503,
      'OPERATION_SOURCE_UNREGISTERED',
      '실제 native/probe/운영 신뢰 등록을 확인해야 합니다.',
    );
    const budget = new ExecutionBudget(30000, Date.now, incoming);
    return budget.run(async () => {
      const fault = await this.source.verifyAndObserve(nativeContext, budget.signal);
      budget.check();
      if (fault === null)
        return { state: 'OBSERVED_NO_FAULT' as const, realAvailabilityProven: false };
      requireCondition(
        fault !== null &&
          typeof fault === 'object' &&
          !Array.isArray(fault) &&
          Object.keys(fault).sort().join(',') === 'attemptId,cause,eventId,faultAt,incidentId',
        503,
        'OPERATION_FAULT_METADATA',
        '검증된 native 원래 사건의 최소metadata가 필요합니다.',
      );
      const record = await this.incidents.start(fault);
      return { state: 'INCIDENT_RECORDED' as const, record, realAvailabilityProven: false };
    });
  }
  async reminder(
    nativeContext: unknown,
    incidentId: string,
    eventId: string,
    incoming?: AbortSignal,
  ) {
    requireCondition(
      this.source.kind !== 'UNREGISTERED',
      503,
      'OPERATION_SOURCE_UNREGISTERED',
      '등록된 독립 scheduler 경계가 필요합니다.',
    );
    const budget = new ExecutionBudget(30000, Date.now, incoming);
    return budget.run(async () => {
      requireCondition(
        (await this.source.verifyReminder?.(nativeContext, incidentId, eventId, budget.signal)) ===
          true,
        403,
        'OPERATION_SCHEDULER_UNCONFIRMED',
        '실제 등록된 원래 scheduler 이벤트 근거가 필요합니다.',
      );
      return this.incidents.remind(incidentId, eventId);
    });
  }
}
