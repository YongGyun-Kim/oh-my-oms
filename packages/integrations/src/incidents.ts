import { ExecutionBudget, requireCondition } from '@oms/contracts';
import { validateIncident } from './incident-types.js';
import type {
  Incident,
  IncidentStore,
  OperationalSender,
  IncidentCause,
} from './incident-types.js';
// Independent operational state: no API/worker, account/grant or RDS dependency.
// A sender acceptance is NEVER a human ACK, manual start or business recovery.
export class OperationalIncidents {
  constructor(
    private readonly store: IncidentStore,
    private readonly sender: OperationalSender,
    private readonly now: () => Date,
    synthetic: boolean,
    private readonly verifiedOperator: (trustedContext: unknown) => Promise<string | null>,
    private readonly verifiedRecovery: (incident: Incident) => Promise<boolean> = async () => false,
  ) {
    requireCondition(
      store.kind !== 'SYNTHETIC' || synthetic,
      503,
      'SYNTHETIC_OPERATION_FORBIDDEN',
      '운영에 합성metadata를 등록할 수 없습니다.',
    );
  }
  async start(input: {
    incidentId: string;
    attemptId: string;
    eventId: string;
    faultAt: string;
    cause: IncidentCause;
    action?: 'AUTO_RECOVERY_STARTED' | 'MANUAL_REQUIRED';
  }): Promise<Incident> {
    const prior = await this.store.read(input.incidentId);
    if (prior) {
      validateIncident(prior);
      requireCondition(
        prior.attemptId === input.attemptId && prior.faultAt === input.faultAt,
        409,
        'INCIDENT_ORIGINAL_CONFLICT',
        '원래 사건/시도/t0를 대조해야 합니다.',
      );
      return prior;
    }
    const at = this.now().toISOString();
    const incident: Incident = {
      incidentId: input.incidentId,
      attemptId: input.attemptId,
      revision: 1,
      faultAt: input.faultAt,
      firstUrgentAt: at,
      lastNoticeAt: at,
      additionalNotices: 0,
      acknowledgedBy: null,
      manualStartedAt: null,
      verifiedRecoveryAt: null,
      eventIds: [input.eventId],
      channels: { SLACK: 'UNCONFIRMED', EMAIL: 'UNCONFIRMED' },
      cause: input.cause,
    };
    validateIncident(incident);
    requireCondition(
      Date.parse(input.faultAt) <= this.now().getTime(),
      503,
      'INCIDENT_FUTURE_FAULT',
      'fault t0를 현재 감지시각으로 초기화할 수 없습니다.',
    );
    await this.store.compareAndSet(incident, null);
    requireCondition(
      input.action === undefined ||
        ['AUTO_RECOVERY_STARTED', 'MANUAL_REQUIRED'].includes(input.action),
      503,
      'INCIDENT_ACTION',
      '실제 시작/수동 필요의 등록된 사건 근거가 필요합니다.',
    );
    return this.deliver(incident, input.action ?? 'MANUAL_REQUIRED');
  }
  private async deliver(
    incident: Incident,
    action: Parameters<OperationalSender['send']>[1]['action'],
  ): Promise<Incident> {
    const signal = ExecutionBudget.current()?.signalWithin(30000) ?? AbortSignal.timeout(30000);
    const message = {
      incidentId: incident.incidentId,
      attemptId: incident.attemptId,
      cause: incident.cause,
      action,
    };
    const result = await Promise.all(
      (['SLACK', 'EMAIL'] as const).map(async (channel) => {
        try {
          return await this.sender.send(channel, message, signal);
        } catch {
          return 'UNKNOWN' as const;
        }
      }),
    );
    const current = await this.store.read(incident.incidentId);
    requireCondition(
      current && current.revision === incident.revision && current.attemptId === incident.attemptId,
      409,
      'INCIDENT_CALLBACK_FENCED',
      '이전 통지결과는 새 운영개정을 덮을 수 없습니다.',
    );
    const updated = {
      ...current,
      revision: current.revision + 1,
      channels: { SLACK: result[0]!, EMAIL: result[1]! },
    };
    validateIncident(updated);
    await this.store.compareAndSet(updated, current.revision);
    return updated;
  }
  async remind(id: string, eventId: string): Promise<Incident> {
    const current = await this.store.read(id);
    requireCondition(current, 404, 'INCIDENT_NOT_FOUND', '원래 사건이 없습니다.');
    validateIncident(current);
    if (
      current.eventIds.includes(eventId) ||
      current.acknowledgedBy !== null ||
      current.verifiedRecoveryAt !== null ||
      current.additionalNotices === 3 ||
      this.now().getTime() - Date.parse(current.lastNoticeAt) < 120000
    )
      return current;
    const updated = {
      ...current,
      revision: current.revision + 1,
      lastNoticeAt: this.now().toISOString(),
      additionalNotices: current.additionalNotices + 1,
      eventIds: [...current.eventIds, eventId],
      channels: { SLACK: 'UNCONFIRMED' as const, EMAIL: 'UNCONFIRMED' as const },
    };
    validateIncident(updated);
    await this.store.compareAndSet(updated, current.revision);
    return this.deliver(updated, 'ACK_REMINDER');
  }
  async acknowledge(
    id: string,
    expectedRevision: number,
    trustedContext: unknown,
  ): Promise<Incident> {
    const actor = await this.verifiedOperator(trustedContext);
    requireCondition(
      actor,
      403,
      'OPERATION_OPERATOR_UNCONFIRMED',
      '실제 검증된 담당자 mapping이 필요합니다.',
    );
    const current = await this.store.read(id);
    requireCondition(
      current && current.revision === expectedRevision,
      409,
      'INCIDENT_REVISION',
      '현재 원래 사건의 개정을 확인하세요.',
    );
    validateIncident(current);
    const updated = { ...current, revision: current.revision + 1, acknowledgedBy: actor };
    validateIncident(updated);
    await this.store.compareAndSet(updated, current.revision);
    return updated;
  }
  async nextAttempt(
    id: string,
    expectedRevision: number,
    attemptId: string,
    eventId: string,
  ): Promise<Incident> {
    const current = await this.store.read(id);
    requireCondition(
      current && current.revision === expectedRevision && current.attemptId !== attemptId,
      409,
      'INCIDENT_REVISION',
      '다음 시도는 현재 원래 사건 개정과 다른 시도ID를 대조해야 합니다.',
    );
    validateIncident(current);
    const updated = {
      ...current,
      attemptId,
      revision: current.revision + 1,
      lastNoticeAt: this.now().toISOString(),
      eventIds: [...current.eventIds, eventId],
      channels: { SLACK: 'UNCONFIRMED' as const, EMAIL: 'UNCONFIRMED' as const },
    };
    validateIncident(updated);
    await this.store.compareAndSet(updated, current.revision);
    return this.deliver(updated, 'AUTO_RECOVERY_STARTED');
  }
  async manualStart(
    id: string,
    expectedRevision: number,
    trustedContext: unknown,
  ): Promise<Incident> {
    const actor = await this.verifiedOperator(trustedContext);
    requireCondition(
      actor,
      403,
      'OPERATION_OPERATOR_UNCONFIRMED',
      '확인된 담당자의 실제 대응 시작 근거가 필요합니다.',
    );
    const current = await this.store.read(id);
    requireCondition(
      current && current.revision === expectedRevision,
      409,
      'INCIDENT_REVISION',
      '원래 사건의 현재 개정이 필요합니다.',
    );
    validateIncident(current);
    const updated = {
      ...current,
      revision: current.revision + 1,
      manualStartedAt: this.now().toISOString(),
    };
    await this.store.compareAndSet(updated, current.revision);
    return updated;
  }
  async recordRecovery(id: string, expectedRevision: number): Promise<Incident> {
    const current = await this.store.read(id);
    requireCondition(
      current && current.revision === expectedRevision,
      409,
      'INCIDENT_REVISION',
      '원래 사건의 현재 개정이 필요합니다.',
    );
    validateIncident(current);
    requireCondition(
      (await this.verifiedRecovery(current)) === true,
      503,
      'OPERATION_RECOVERY_UNCONFIRMED',
      '핵심 업무/원래ACK/현재권한/정확성의 독립 복구 확인이 필요합니다.',
    );
    const updated = {
      ...current,
      revision: current.revision + 1,
      verifiedRecoveryAt: this.now().toISOString(),
      channels: { SLACK: 'UNCONFIRMED' as const, EMAIL: 'UNCONFIRMED' as const },
    };
    await this.store.compareAndSet(updated, current.revision);
    return this.deliver(updated, 'VERIFIED_RECOVERY');
  }
  status(incident: Incident) {
    validateIncident(incident);
    const elapsed = this.now().getTime() - Date.parse(incident.faultAt);
    return {
      incidentId: incident.incidentId,
      attemptId: incident.attemptId,
      unresolved: incident.verifiedRecoveryAt === null,
      unacknowledged: incident.acknowledgedBy === null,
      manualParallelRequired: elapsed >= 420000 && incident.verifiedRecoveryAt === null,
      manualStartOverdue: elapsed >= 600000 && incident.manualStartedAt === null,
      recoveryOverdue: elapsed >= 1800000 && incident.verifiedRecoveryAt === null,
      ackOverdue:
        this.now().getTime() - Date.parse(incident.firstUrgentAt) >= 180000 &&
        incident.acknowledgedBy === null,
      remindersExhausted: incident.additionalNotices === 3,
      realDeliveryVerified: false,
    };
  }
}
