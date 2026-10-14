import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson, U4_PROFILE } from '@oms/contracts';
import {
  modelDefinition,
  rowModelVersion,
  U4_SOURCE_CONTRACT,
  registeredRecoveryObservationProfile,
} from '@oms/persistence';
import type { CurrentSecurityAuthority, RecoverySecurityObservation } from '@oms/persistence';
import type { SyntheticSecuritySnapshot } from '../../u1/fixtures/recovery-security-oracle.js';

// 격리 시험의 독립 합성 관측이다. 운영 현재 owner 등록이나 신원 확인의 증거가 아니다.
export class U4SyntheticSecurityOracle implements CurrentSecurityAuthority {
  readonly kind = 'SYNTHETIC';
  readonly observationProfile = U4_PROFILE;
  private checkId = '';
  private observedAt = '';
  private readonly observed = new Set<string>();
  private digest = createHash('sha256');
  constructor(private readonly snapshot: SyntheticSecuritySnapshot) {
    if (process.env.NODE_ENV === 'production') throw new Error('운영 합성 관측 금지');
    registeredRecoveryObservationProfile(this);
  }
  async begin(_epoch: string, _faultAt: string, signal: AbortSignal) {
    signal.throwIfAborted();
    this.checkId = randomUUID();
    this.observedAt = new Date().toISOString();
    this.observed.clear();
    this.digest = createHash('sha256');
    return { checkId: this.checkId, asOf: this.observedAt };
  }
  async observe(
    checkId: string,
    model: string,
    id: string,
    signal: AbortSignal,
  ): Promise<RecoverySecurityObservation> {
    signal.throwIfAborted();
    const key = model + '/' + id,
      data = this.snapshot.rows[key];
    if (checkId !== this.checkId || this.observed.has(key))
      throw new Error('원래 단일 합성 관측 필요');
    this.observed.add(key);
    const observation: RecoverySecurityObservation = {
      observationVersion: 3,
      sourceContract: U4_SOURCE_CONTRACT,
      modelVersion: data ? rowModelVersion(model, data) : null,
      checkId,
      model,
      id,
      sourceOwner: modelDefinition(model).owner,
      sourceRevision: data ? Number(data.revision) : null,
      currentData: data ? structuredClone(data) : null,
      evidenceId: randomUUID(),
      observedAt: this.observedAt,
      knowledge: data ? 'KNOWN' : 'UNKNOWN',
    };
    this.digest.update(canonicalJson(observation) + '\n');
    return observation;
  }
  async seal(checkId: string, digest: string, records: number, signal: AbortSignal) {
    signal.throwIfAborted();
    return {
      checkId,
      digest,
      records,
      complete:
        checkId === this.checkId &&
        digest === this.digest.digest('hex') &&
        records === this.observed.size &&
        Object.keys(this.snapshot.rows).every((key) => this.observed.has(key)),
    };
  }
}
