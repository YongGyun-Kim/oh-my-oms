import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '@oms/contracts';
import type { DataSource } from 'typeorm';
import { RECOVERY_SECURITY_MODELS, modelDefinition, primaryAttribute } from '@oms/persistence';
import type {
  CurrentSecurityAuthority,
  ModelData,
  RecoverySecurityObservation,
} from '@oms/persistence';
export interface SyntheticSecuritySnapshot {
  capturedAt: string;
  rows: Record<string, ModelData>;
}
export async function captureSyntheticSecuritySnapshot(
  primary: DataSource,
): Promise<SyntheticSecuritySnapshot> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('실제 신원/권한을 합성 oracle로 승인할 수 없습니다.');
  const rows: Record<string, ModelData> = {};
  for (const model of RECOVERY_SECURITY_MODELS) {
    const definition = modelDefinition(model),
      key = primaryAttribute(definition).name;
    let cursor: string | null = null;
    for (;;) {
      const query = primary
        .getRepository<ModelData>(model)
        .createQueryBuilder('record')
        .orderBy('record.' + key, 'ASC')
        .take(25);
      if (cursor !== null) query.where('\"record\".\"' + key + '\" > :cursor', { cursor });
      const page = await query.getMany();
      for (const row of page) {
        const id = String(row[key]);
        rows[model + '/' + id] = Object.fromEntries(
          definition.attributes
            .filter((field) => row[field.name] !== undefined)
            .map((field) => [field.name, row[field.name]]),
        );
        cursor = id;
      }
      if (page.length < 25) break;
    }
  }
  return { capturedAt: new Date().toISOString(), rows };
}
// The declared synthetic owner truth lives outside primary/journal and is
// checked anew after the fault. It is never a Cognito/company/mandate proof.
export class SyntheticCurrentSecurityOracle implements CurrentSecurityAuthority {
  readonly kind = 'SYNTHETIC';
  private generation = 0;
  private checkId = '';
  private asOf = '';
  private checkGeneration = 0;
  private readonly observed = new Set<string>();
  private digest = createHash('sha256');
  constructor(readonly snapshot: SyntheticSecuritySnapshot) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('운영에 합성 현재 보안 oracle을 등록할 수 없습니다.');
  }
  update(model: string, id: string, data: ModelData): void {
    this.snapshot.rows[model + '/' + id] = structuredClone(data);
    this.generation++;
  }
  async begin(_epoch: string, _faultAt: string, signal: AbortSignal) {
    signal.throwIfAborted();
    this.checkId = randomUUID();
    this.asOf = new Date().toISOString();
    this.checkGeneration = this.generation;
    this.observed.clear();
    this.digest = createHash('sha256');
    return { checkId: this.checkId, asOf: this.asOf };
  }
  async observe(
    checkId: string,
    model: string,
    id: string,
    signal: AbortSignal,
  ): Promise<RecoverySecurityObservation> {
    signal.throwIfAborted();
    if (checkId !== this.checkId || this.generation !== this.checkGeneration)
      throw new Error('합성 owner 원래 snapshot이 변경됐습니다.');
    const key = model + '/' + id,
      data = this.snapshot.rows[key];
    if (this.observed.has(key)) throw new Error('동일 보안 원본을 중복 관측할 수 없습니다.');
    this.observed.add(key);
    const result: RecoverySecurityObservation = {
      checkId,
      model,
      id,
      sourceOwner: modelDefinition(model).owner,
      sourceRevision: data ? Number(data.revision) : null,
      currentData: data ? structuredClone(data) : null,
      evidenceId: 'synthetic-owner-observation-' + randomUUID(),
      observedAt: this.asOf,
      knowledge: data ? 'KNOWN' : 'UNKNOWN',
    };
    this.digest.update(canonicalJson(result) + '\n');
    return result;
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
        this.checkGeneration === this.generation &&
        records === this.observed.size &&
        Object.keys(this.snapshot.rows).every((key) => this.observed.has(key)),
    };
  }
}
