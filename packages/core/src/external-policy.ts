import { randomInt, randomUUID } from 'node:crypto';
import { fingerprint, requireCondition } from '@oms/contracts';
import type { ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import type { Ref } from '@oms/contracts';
export type ExternalResult = 'KNOWN' | 'UNKNOWN' | 'SAFE_TRANSIENT' | 'PERMANENT';
export interface AttemptClaim {
  attemptToken: string;
  attemptCount: number;
  epoch: string;
  deadlineAt: string;
}
export interface ProbeClaim {
  token: string;
  generation: number;
  epoch: string;
  deadlineAt: string;
}
export interface ProbeTerminationAuthority {
  observeOriginalProbe(evidenceRef: Ref): Promise<{
    endpointId: string;
    token: string;
    generation: number;
    epoch: string;
    terminated: boolean;
  }>;
}
export function retryDelay(attemptCount: number, unitRandom: number): number {
  requireCondition(
    Number.isInteger(attemptCount) &&
      attemptCount >= 1 &&
      attemptCount <= 3 &&
      unitRandom >= 0 &&
      unitRandom <= 1,
    400,
    'RETRY_POLICY',
    '추가 시도/지연 범위가 다릅니다.',
  );
  return Math.floor([5000, 20000, 80000][attemptCount - 1]! * unitRandom);
}
export class ExternalPolicy {
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
    private readonly random = () => randomInt(0, 1000001) / 1000000,
    private readonly termination: ProbeTerminationAuthority | null = null,
  ) {}
  private async change(
    id: string,
    operation: string,
    input: unknown,
    apply: (transaction: ProtectedTransaction) => Promise<void>,
    key: string = randomUUID(),
  ): Promise<void> {
    await this.store.execute(
      {
        principalId: 'u1-worker-policy',
        audience: 'SYSTEM',
        owner: 'NotificationDelivery',
        operation,
        target: { operationId: id },
        idempotencyKey: key,
        input,
        correlationId: id,
        epoch: await this.store.currentEpoch(),
      },
      (transaction) => apply(transaction),
    );
  }
  async begin(
    id: string,
    workId: string,
    endpointId: string,
    originalDeadlineAt: string,
  ): Promise<AttemptClaim> {
    let budget: AttemptClaim | undefined;
    const now = this.now();
    await this.change(
      id,
      'beginExternalAttempt',
      { id, workId, endpointId },
      async (transaction) => {
        const previous = await transaction.get('ExternalAttempt', id);
        if (previous)
          requireCondition(
            previous.operationKey === id &&
              previous.workId === workId &&
              previous.endpointId === endpointId &&
              previous.state === 'SAFE_TRANSIENT',
            409,
            'EXTERNAL_ORIGINAL_RECONCILIATION',
            '이미 시작된 원래 외부 결과를 먼저 대조해야 합니다.',
          );
        const deadline = previous
          ? Date.parse(String(previous.deadlineAt))
          : Math.min(Date.parse(originalDeadlineAt), now.getTime() + 5 * 60000);
        const count = Number(previous?.attemptCount ?? 0);
        requireCondition(
          Number.isFinite(deadline) &&
            now.getTime() < deadline &&
            count < 4 &&
            (!previous || Date.parse(String(previous.notBefore)) <= now.getTime()),
          409,
          'EXTERNAL_RETRY_BUDGET',
          '원래 누적 시도/시작/기한 예산을 확인하세요.',
        );
        const circuit = await transaction.get('EndpointCircuit', endpointId);
        requireCondition(
          !circuit || circuit.state === 'CLOSED',
          503,
          'ENDPOINT_CIRCUIT_OPEN',
          '접점 검증/대조 전 외부 실행을 제한합니다.',
        );
        budget = {
          attemptToken: randomUUID(),
          attemptCount: count + 1,
          epoch: await this.store.currentEpoch(),
          deadlineAt: new Date(Math.min(deadline, now.getTime() + 30000)).toISOString(),
        };
        await transaction.put(
          'ExternalAttempt',
          {
            attemptId: id,
            operationKey: id,
            workId,
            endpointId,
            firstAttemptAt: previous?.firstAttemptAt ?? now.toISOString(),
            deadlineAt: new Date(deadline).toISOString(),
            notBefore: previous?.notBefore ?? now.toISOString(),
            attemptCount: count + 1,
            state: 'RUNNING',
            attemptToken: budget.attemptToken,
            epoch: budget.epoch,
            attemptDeadlineAt: budget.deadlineAt,
            revision: Number(previous?.revision ?? 0) + 1,
          },
          previous ? Number(previous.revision) : null,
        );
      },
    );
    requireCondition(
      budget,
      503,
      'EXTERNAL_BUDGET_UNKNOWN',
      '원래 외부 시도 보호를 확인해야 합니다.',
    );
    return budget;
  }
  async finish(
    id: string,
    result: ExternalResult,
    claim: AttemptClaim,
    after?: (transaction: ProtectedTransaction, recordedResult: ExternalResult) => Promise<void>,
    observation: Record<string, unknown> = {},
  ): Promise<void> {
    const now = this.now();
    await this.change(
      id,
      'recordExternalOutcome',
      { id, result, claim, observation },
      async (transaction) => {
        const attempt = await transaction.get('ExternalAttempt', id);
        requireCondition(
          attempt?.state === 'RUNNING',
          409,
          'EXTERNAL_ORIGINAL_RECONCILIATION',
          '원래 진행 중인 호출 결과를 대조하세요.',
        );
        requireCondition(
          attempt.attemptToken === claim.attemptToken &&
            attempt.attemptCount === claim.attemptCount &&
            attempt.epoch === claim.epoch &&
            claim.epoch === (await this.store.currentEpoch()) &&
            attempt.attemptDeadlineAt === claim.deadlineAt,
          409,
          'EXTERNAL_ATTEMPT_NOT_CURRENT',
          '늦은/중복 결과는 원래 시도와 세대를 대조해야 합니다.',
        );
        if (now.getTime() > Date.parse(String(attempt.attemptDeadlineAt))) result = 'UNKNOWN';
        const count = Number(attempt.attemptCount);
        const retry =
          result === 'SAFE_TRANSIENT' &&
          count < 4 &&
          now.getTime() < Date.parse(String(attempt.deadlineAt));
        const notBefore = retry
          ? new Date(now.getTime() + retryDelay(count, this.random())).toISOString()
          : String(attempt.notBefore);
        await transaction.put(
          'ExternalAttempt',
          {
            ...attempt,
            state:
              result === 'KNOWN'
                ? 'KNOWN'
                : result === 'UNKNOWN'
                  ? 'UNKNOWN'
                  : retry
                    ? 'SAFE_TRANSIENT'
                    : 'REVIEW_REQUIRED',
            notBefore,
            revision: Number(attempt.revision) + 1,
          },
          Number(attempt.revision),
        );
        if (result === 'SAFE_TRANSIENT') {
          const endpointId = String(attempt.endpointId);
          const previous = await transaction.get('EndpointCircuit', endpointId);
          const withinWindow =
            previous && now.getTime() - Date.parse(String(previous.windowStartedAt)) < 30000;
          const failures = withinWindow ? Number(previous.failureCount) + 1 : 1;
          const alreadyOpen = previous && previous.state !== 'CLOSED';
          await transaction.put(
            'EndpointCircuit',
            {
              endpointId,
              state: alreadyOpen ? previous.state : failures >= 5 ? 'OPEN' : 'CLOSED',
              failureCount: failures,
              windowStartedAt: withinWindow ? previous.windowStartedAt : now.toISOString(),
              openedAt: alreadyOpen ? previous.openedAt : failures >= 5 ? now.toISOString() : null,
              probeOwner: alreadyOpen ? previous.probeOwner : null,
              probeDeadlineAt: alreadyOpen ? previous.probeDeadlineAt : null,
              probeToken: alreadyOpen ? previous.probeToken : null,
              probeGeneration: previous?.probeGeneration ?? 1,
              probeEpoch: alreadyOpen ? previous.probeEpoch : null,
              revision: Number(previous?.revision ?? 0) + 1,
            },
            previous ? Number(previous.revision) : null,
          );
        } else if (result === 'KNOWN') {
          const previous = await transaction.get('EndpointCircuit', String(attempt.endpointId));
          if (previous?.state === 'CLOSED')
            await transaction.put(
              'EndpointCircuit',
              {
                ...previous,
                failureCount: 0,
                windowStartedAt: now.toISOString(),
                revision: Number(previous.revision) + 1,
              },
              Number(previous.revision),
            );
        }
        await after?.(transaction, result);
      },
      fingerprint({ id, token: claim.attemptToken, operation: 'recordExternalOutcome' }),
    );
  }
  async claimHarmlessProbe(
    endpointId: string,
    owner: string,
    hasRegisteredProbe: boolean,
  ): Promise<ProbeClaim> {
    let claimed: ProbeClaim | undefined;
    requireCondition(
      hasRegisteredProbe,
      503,
      'HARMLESS_PROBE_NOT_REGISTERED',
      '부작용 없는 검증 probe가 등록되지 않았습니다.',
    );
    await this.change(
      endpointId,
      'claimHarmlessProbe',
      { endpointId, owner },
      async (transaction) => {
        const circuit = await transaction.get('EndpointCircuit', endpointId);
        const now = this.now();
        requireCondition(
          circuit?.state === 'OPEN' &&
            circuit.openedAt &&
            now.getTime() - Date.parse(String(circuit.openedAt)) >= 30000,
          409,
          'PROBE_BUSY_OR_NOT_DUE',
          '접점 전체에서 하나의 검증만 허용합니다.',
        );
        claimed = {
          token: randomUUID(),
          generation: Number(circuit.probeGeneration) + 1,
          epoch: await this.store.currentEpoch(),
          deadlineAt: new Date(now.getTime() + 30000).toISOString(),
        };
        await transaction.put(
          'EndpointCircuit',
          {
            ...circuit,
            state: 'HALF_OPEN',
            probeOwner: owner,
            probeDeadlineAt: claimed.deadlineAt,
            probeToken: claimed.token,
            probeGeneration: claimed.generation,
            probeEpoch: claimed.epoch,
            revision: Number(circuit.revision) + 1,
          },
          Number(circuit.revision),
        );
      },
    );
    requireCondition(claimed, 503, 'PROBE_CLAIM_UNKNOWN', '원래 probe 보호를 확인해야 합니다.');
    return claimed;
  }
  async completeHarmlessProbe(
    endpointId: string,
    owner: string,
    knownHealthy: boolean,
    claim: ProbeClaim,
  ): Promise<void> {
    await this.change(
      endpointId,
      'recordHarmlessProbe',
      { endpointId, owner, knownHealthy },
      async (transaction) => {
        const circuit = await transaction.get('EndpointCircuit', endpointId);
        const now = this.now();
        requireCondition(
          circuit?.state === 'HALF_OPEN' &&
            circuit.probeOwner === owner &&
            circuit.probeToken === claim.token &&
            circuit.probeGeneration === claim.generation &&
            circuit.probeEpoch === claim.epoch &&
            claim.epoch === (await this.store.currentEpoch()) &&
            Date.parse(String(circuit.probeDeadlineAt)) > now.getTime(),
          409,
          'PROBE_NOT_CURRENT',
          '현재 probe의 원래 결과가 필요합니다.',
        );
        await transaction.put(
          'EndpointCircuit',
          {
            ...circuit,
            state: knownHealthy ? 'CLOSED' : 'OPEN',
            failureCount: knownHealthy ? 0 : circuit.failureCount,
            windowStartedAt: now.toISOString(),
            openedAt: knownHealthy ? null : now.toISOString(),
            probeOwner: null,
            probeDeadlineAt: null,
            revision: Number(circuit.revision) + 1,
          },
          Number(circuit.revision),
        );
      },
    );
  }
  async holdExpiredProbe(endpointId: string): Promise<void> {
    await this.change(endpointId, 'holdExpiredProbe', { endpointId }, async (transaction) => {
      const circuit = await transaction.get('EndpointCircuit', endpointId);
      requireCondition(
        circuit?.state === 'HALF_OPEN' &&
          Date.parse(String(circuit.probeDeadlineAt)) <= this.now().getTime(),
        409,
        'PROBE_NOT_EXPIRED',
        '원래 probe 종료 기한을 확인하세요.',
      );
      await transaction.put(
        'EndpointCircuit',
        { ...circuit, state: 'REVIEW_REQUIRED', revision: Number(circuit.revision) + 1 },
        Number(circuit.revision),
      );
    });
  }
  async reconcileTerminatedProbe(endpointId: string, evidenceRef: Ref): Promise<void> {
    requireCondition(
      this.termination,
      503,
      'PROBE_TERMINATION_AUTHORITY_REQUIRED',
      '등록된 실행 종료/격리 확인 권위가 필요합니다.',
    );
    const observed = await this.termination.observeOriginalProbe(evidenceRef);
    await this.change(
      endpointId,
      'reconcileTerminatedProbe',
      { endpointId, evidenceRef },
      async (transaction) => {
        const circuit = await transaction.get('EndpointCircuit', endpointId);
        requireCondition(
          circuit?.state === 'REVIEW_REQUIRED' &&
            observed.terminated &&
            observed.endpointId === endpointId &&
            observed.token === circuit.probeToken &&
            observed.generation === circuit.probeGeneration &&
            observed.epoch === circuit.probeEpoch &&
            observed.epoch === (await this.store.currentEpoch()),
          409,
          'PROBE_TERMINATION_UNCONFIRMED',
          '원래 probe의 실제 종료/격리를 대조해야 합니다.',
        );
        await transaction.put(
          'EndpointCircuit',
          {
            ...circuit,
            state: 'OPEN',
            openedAt: this.now().toISOString(),
            probeOwner: null,
            probeDeadlineAt: null,
            probeToken: null,
            probeEpoch: null,
            revision: Number(circuit.revision) + 1,
          },
          Number(circuit.revision),
        );
      },
    );
  }
}
