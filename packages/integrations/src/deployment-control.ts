import { fingerprint, requireCondition } from '@oms/contracts';
import { evaluateRollback } from './deployment-compatibility.js';
import type { RollbackEvidence } from './deployment-compatibility.js';
import { validateDeploymentAttempt } from './deployment-store.js';

export interface DeploymentAttempt {
  incidentId: string;
  attemptId: string;
  revision: number;
  evidenceFingerprint: string;
  targetImage: string | null;
  state: 'CLAIMED' | 'APPLIED_UNVERIFIED' | 'UNKNOWN' | 'MANUAL_REQUIRED';
}
export interface DeploymentControlStore {
  readonly kind: 'DYNAMODB' | 'SYNTHETIC';
  read(incidentId: string, attemptId: string): Promise<DeploymentAttempt | null>;
  compareAndSet(value: DeploymentAttempt, expectedRevision: number | null): Promise<void>;
}
// This port represents trusted platform observations, never HTTP body flags.
// Real activation, exact manifest approval and current-security observations
// are independently supplied; the default activation guard rejects execution.
export interface DeploymentPlatform {
  observe(incidentId: string, attemptId: string, signal: AbortSignal): Promise<RollbackEvidence>;
  notifyStarted(incidentId: string, attemptId: string, signal: AbortSignal): Promise<void>;
  applyApplicationImage(
    image: string,
    originalAttemptId: string,
    signal: AbortSignal,
  ): Promise<void>;
}
export class DeploymentControl {
  constructor(
    private readonly store: DeploymentControlStore,
    private readonly platform: DeploymentPlatform,
    synthetic: boolean,
    private readonly activation: () => Promise<boolean> = async () => false,
  ) {
    requireCondition(
      store.kind !== 'SYNTHETIC' || synthetic,
      503,
      'DEPLOYMENT_SYNTHETIC_FORBIDDEN',
      '운영 제어에 합성metadata를 사용할 수 없습니다.',
    );
  }
  async rollback(
    incidentId: string,
    attemptId: string,
    signal: AbortSignal,
  ): Promise<DeploymentAttempt> {
    requireCondition(
      (await this.activation()) === true,
      503,
      'DEPLOYMENT_ACTIVATION_UNVERIFIED',
      '실제 배포 역할/manifest 승인/운영 준비 근거가 필요합니다.',
    );
    signal.throwIfAborted();
    const evidence = await this.platform.observe(incidentId, attemptId, signal);
    requireCondition(
      evidence.incidentId === incidentId && evidence.attemptId === attemptId,
      409,
      'DEPLOYMENT_ORIGINAL_ID',
      '원래 사건/시도를 대조해야 합니다.',
    );
    const decision = evaluateRollback(evidence);
    const previous = await this.store.read(incidentId, attemptId);
    if (previous) {
      validateDeploymentAttempt(previous);
      requireCondition(
        previous.evidenceFingerprint === decision.evidenceFingerprint,
        409,
        'DEPLOYMENT_ORIGINAL_CONFLICT',
        '같은 시도의 다른 근거는 새 적용을 만들 수 없습니다.',
      );
      return previous;
    }
    const claim: DeploymentAttempt = {
      incidentId,
      attemptId,
      revision: 1,
      evidenceFingerprint: decision.evidenceFingerprint,
      targetImage: decision.targetImage,
      state: decision.targetImage ? 'CLAIMED' : 'MANUAL_REQUIRED',
    };
    validateDeploymentAttempt(claim);
    await this.store.compareAndSet(claim, null);
    if (!decision.targetImage) return claim;
    let state: DeploymentAttempt['state'] = 'UNKNOWN';
    try {
      // Notification failure stays unconfirmed; it cannot erase the original
      // attempt. No second platform apply is created by a duplicate callback.
      await this.platform.notifyStarted(incidentId, attemptId, signal);
      signal.throwIfAborted();
      const current = await this.platform.observe(incidentId, attemptId, signal);
      requireCondition(
        fingerprint(current) === claim.evidenceFingerprint,
        409,
        'DEPLOYMENT_CURRENT_CHANGED',
        '적용 직전 현재 보안/작업/승인 근거가 변경됐습니다.',
      );
      const rechecked = evaluateRollback(current);
      requireCondition(
        rechecked.targetImage === claim.targetImage,
        409,
        'DEPLOYMENT_TARGET_CHANGED',
        '정확한 이전 완료 digest를 대조해야 합니다.',
      );
      signal.throwIfAborted();
      await this.platform.applyApplicationImage(claim.targetImage!, attemptId, signal);
      signal.throwIfAborted();
      state = 'APPLIED_UNVERIFIED'; // Task apply is not business recovery.
    } catch {
      state = 'UNKNOWN';
    }
    const actual = await this.store.read(incidentId, attemptId);
    if (actual) validateDeploymentAttempt(actual);
    requireCondition(
      actual?.revision === claim.revision &&
        actual.evidenceFingerprint === claim.evidenceFingerprint &&
        actual.state === 'CLAIMED',
      409,
      'DEPLOYMENT_CALLBACK_FENCED',
      '이전 적용 결과는 현재 제어 개정을 덮을 수 없습니다.',
    );
    const result = { ...actual, revision: actual.revision + 1, state };
    await this.store.compareAndSet(result, actual.revision);
    return result;
  }
}
