import { requireCondition } from '@oms/contracts';
export type IncidentCause =
  | 'APPLICATION'
  | 'WORKER'
  | 'PRIMARY'
  | 'JOURNAL'
  | 'DEPLOYMENT'
  | 'OBSERVATION'
  | 'CHANNEL'
  | 'ACCURACY';
export interface Incident {
  incidentId: string;
  attemptId: string;
  revision: number;
  faultAt: string;
  firstUrgentAt: string;
  lastNoticeAt: string;
  additionalNotices: number;
  acknowledgedBy: string | null;
  manualStartedAt: string | null;
  verifiedRecoveryAt: string | null;
  eventIds: string[];
  channels: {
    SLACK: 'UNCONFIRMED' | 'ACCEPTED' | 'UNKNOWN';
    EMAIL: 'UNCONFIRMED' | 'ACCEPTED' | 'UNKNOWN';
  };
  cause: IncidentCause;
}
export interface IncidentStore {
  readonly kind: 'DYNAMODB' | 'SYNTHETIC';
  read(id: string): Promise<Incident | null>;
  compareAndSet(value: Incident, expectedRevision: number | null): Promise<void>;
}
export interface OperationalSender {
  send(
    channel: 'SLACK' | 'EMAIL',
    message: {
      incidentId: string;
      attemptId: string;
      cause: IncidentCause;
      action: 'AUTO_RECOVERY_STARTED' | 'MANUAL_REQUIRED' | 'ACK_REMINDER' | 'VERIFIED_RECOVERY';
    },
    signal: AbortSignal,
  ): Promise<'ACCEPTED' | 'UNKNOWN'>;
}
export function validateIncident(value: unknown): asserts value is Incident {
  requireCondition(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    503,
    'INCIDENT_METADATA',
    '명시적 운영 metadata가 필요합니다.',
  );
  const data = value as Incident;
  requireCondition(
    Object.keys(data).sort().join(',') ===
      'acknowledgedBy,additionalNotices,attemptId,cause,channels,eventIds,faultAt,firstUrgentAt,incidentId,lastNoticeAt,manualStartedAt,revision,verifiedRecoveryAt',
    503,
    'INCIDENT_METADATA',
    '운영metadata에는 등록된 최소필드만 허용합니다.',
  );
  for (const key of ['incidentId', 'attemptId'] as const)
    requireCondition(
      typeof data[key] === 'string' &&
        Array.from(data[key]).length >= 1 &&
        Array.from(data[key]).length <= 128,
      503,
      'INCIDENT_ID',
      '원래 사건/시도 ID가 필요합니다.',
    );
  for (const key of ['faultAt', 'firstUrgentAt', 'lastNoticeAt'] as const)
    requireCondition(
      typeof data[key] === 'string' && Number.isFinite(Date.parse(data[key])),
      503,
      'INCIDENT_TIME',
      '원래 fault/통지시각이 필요합니다.',
    );
  for (const key of ['manualStartedAt', 'verifiedRecoveryAt'] as const)
    requireCondition(
      data[key] === null ||
        (typeof data[key] === 'string' && Number.isFinite(Date.parse(data[key]!))),
      503,
      'INCIDENT_TIME',
      '실제 대응/검증 시각이 필요합니다.',
    );
  requireCondition(
    data.acknowledgedBy === null ||
      (typeof data.acknowledgedBy === 'string' &&
        data.acknowledgedBy.length >= 1 &&
        data.acknowledgedBy.length <= 128),
    503,
    'INCIDENT_ACK',
    '확인된 담당자 식별자만 허용합니다.',
  );
  requireCondition(
    Number.isInteger(data.revision) &&
      data.revision >= 1 &&
      Number.isInteger(data.additionalNotices) &&
      data.additionalNotices >= 0 &&
      data.additionalNotices <= 3 &&
      Array.isArray(data.eventIds) &&
      data.eventIds.length >= 1 &&
      data.eventIds.length <= 128 &&
      data.eventIds.every((id) => typeof id === 'string' && id.length >= 1 && id.length <= 128) &&
      new Set(data.eventIds).size === data.eventIds.length,
    503,
    'INCIDENT_LIMIT',
    '유한 원래 시도/이벤트/추가알림을 대조해야 합니다.',
  );
  requireCondition(
    [
      'APPLICATION',
      'WORKER',
      'PRIMARY',
      'JOURNAL',
      'DEPLOYMENT',
      'OBSERVATION',
      'CHANNEL',
      'ACCURACY',
    ].includes(data.cause) &&
      data.channels !== null &&
      typeof data.channels === 'object' &&
      Object.keys(data.channels).sort().join(',') === 'EMAIL,SLACK' &&
      Object.values(data.channels).every((state) =>
        ['UNCONFIRMED', 'ACCEPTED', 'UNKNOWN'].includes(state),
      ),
    503,
    'INCIDENT_CHANNEL',
    '최소 두채널의 수락/불명을 구별해야 합니다.',
  );
}
