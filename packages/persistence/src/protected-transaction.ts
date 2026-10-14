import type { EntityManager } from 'typeorm';
import { canonicalJson, ExecutionBudget, requireCondition, SchemaValidator } from '@oms/contracts';
import {
  modelDefinition,
  primaryAttribute,
  physicalData,
  validateModel,
  tableName,
  storedModelData,
  rowModelVersion,
} from './model-catalog.js';
import type { ModelData } from './model-catalog.js';
import type { RecoveryRow } from './recovery-types.js';
import { U3_PERSISTENCE_MODELS } from './u3-model-catalog.js';
import { U4_PERSISTENCE_MODELS, U4_U3_MODELS } from './u4-model-catalog.js';
import type { FinancialSourceContract } from '@oms/contracts';

export class ProtectedTransaction {
  private readonly changes = new Map<string, RecoveryRow>();
  constructor(
    private readonly manager: EntityManager,
    private readonly schema: SchemaValidator,
    private readonly sourceContract?: FinancialSourceContract,
  ) {}
  private assertWriteVersion(model: string, data: ModelData): void {
    if (this.sourceContract !== undefined)
      this.schema.validateUri(
        this.sourceContract.profile + '#/$defs/SourceContract',
        this.sourceContract,
      );
    if (
      this.sourceContract &&
      ['RequestReceipt', 'WorkItem', 'FactEnvelope', 'StaffRole', 'RoleRevisionState'].includes(
        model,
      )
    ) {
      this.schema.validateUri(
        this.sourceContract.profile + '#/$defs/SourceContract',
        data.sourceContract,
      );
      requireCondition(
        canonicalJson(data.sourceContract) === canonicalJson(this.sourceContract),
        400,
        'WRITE_CONTRACT_SOURCE',
        '접수/전달 원본의 실제 등록 계약을 보존해야 합니다.',
      );
    }
    if (U4_PERSISTENCE_MODELS.some((entry) => entry.name === model) || data.modelVersion === 3) {
      requireCondition(
        this.sourceContract?.profile === 'urn:oms:contract:u4-financial:1' &&
          (U4_PERSISTENCE_MODELS.some((entry) => entry.name === model)
            ? data.modelVersion === 1
            : U4_U3_MODELS.some((entry) => entry.name === model) && data.modelVersion === 3),
        400,
        'WRITE_CONTRACT_REQUIRED',
        '새 금융/약정 원본은 정확한 U4 변경 계약과 버전이 필요합니다.',
      );
      return;
    }
    if (!U3_PERSISTENCE_MODELS.some((entry) => entry.name === model)) return;
    requireCondition(
      data.modelVersion !== 2 || this.sourceContract !== undefined,
      400,
      'WRITE_CONTRACT_REQUIRED',
      '새 U3 쓰기는 실제 등록 profile/operation version을 명시해야 합니다.',
    );
    requireCondition(
      !this.sourceContract || data.modelVersion === 2,
      400,
      'WRITE_MODEL_VERSION',
      '새 U3 명령을 구형 model version으로 기록할 수 없습니다.',
    );
  }
  async countCurrentAuthWindows(at: string): Promise<number> {
    this.schema.validate('Instant', at);
    ExecutionBudget.current()?.check();
    const rows = await this.manager.query(
      'SELECT count(*)::integer AS count FROM u1_auth_attempt_window WHERE "resetAt">$1::timestamptz',
      [at],
    );
    return Number(rows[0].count);
  }
  async financialProtectedImage(
    model: string,
    id: string,
    prefixes: readonly { epoch: string; commitOrder: number }[],
  ): Promise<ModelData | null> {
    this.schema.validate('Id', id);
    modelDefinition(model);
    ExecutionBudget.current()?.check();
    const rows = await this.manager.query(
      `SELECT v.data,v.deleted FROM u1_entity_version v JOIN u1_epoch_sequence e ON e.epoch=v.epoch JOIN jsonb_to_recordset($3::jsonb) AS boundary(epoch text,"commitOrder" bigint) ON boundary.epoch=v.epoch AND v.commit_order<=boundary."commitOrder" WHERE v.model=$1 AND v.id=$2 ORDER BY e.generation DESC,v.commit_order DESC LIMIT 1`,
      [model, id, JSON.stringify(prefixes)],
    );
    return rows[0] && !rows[0].deleted ? validateModel(model, rows[0].data, this.schema) : null;
  }
  async lockFinancialRows(
    paymentIds: readonly string[],
    invoiceIds: readonly string[],
    approvalRootIds: readonly string[],
  ): Promise<void> {
    for (const [model, ids] of [
      ['FinancialPaymentBalance', paymentIds],
      ['FinancialInvoiceBalance', invoiceIds],
      ['FinancialApprovalBalance', approvalRootIds],
    ] as const) {
      const sorted = [...new Set(ids)].sort();
      for (const id of sorted) this.schema.validate('Id', id);
      if (sorted.length === 0) continue;
      const key = primaryAttribute(modelDefinition(model)).name;
      await this.manager.query(
        'SELECT "' +
          key +
          '" FROM "' +
          tableName(model) +
          '" WHERE "' +
          key +
          '"=ANY($1::text[]) ORDER BY "' +
          key +
          '" FOR UPDATE',
        [sorted],
      );
    }
  }
  async get(model: string, id: string): Promise<ModelData | null> {
    ExecutionBudget.current()?.check();
    const key = primaryAttribute(modelDefinition(model)).name;
    const found = await this.manager
      .getRepository<ModelData>(model)
      .findOne({ where: { [key]: id } });
    if (!found) return null;
    const result: ModelData = {};
    for (const attribute of modelDefinition(model).attributes)
      result[attribute.name] = found[attribute.name];
    return storedModelData(model, result);
  }
  async list(
    model: string,
    equals: Record<string, unknown> = {},
    limit = 100,
  ): Promise<ModelData[]> {
    ExecutionBudget.current()?.check();
    const definition = modelDefinition(model);
    requireCondition(
      Number.isInteger(limit) && limit >= 1 && limit <= 100,
      400,
      'PAGE_LIMIT',
      '목록 크기는 1~100입니다.',
    );
    const parameters: unknown[] = [];
    const predicates: string[] = [];
    for (const [key, value] of Object.entries(equals)) {
      requireCondition(
        definition.attributes.some((attribute) => attribute.name === key),
        400,
        'FILTER_FIELD',
        '등록된 원본 필드가 아닙니다.',
      );
      parameters.push(value);
      predicates.push(
        value === null
          ? `"${key}" IS NULL`
          : typeof value === 'object'
            ? `"${key}" @> $${parameters.length}::jsonb`
            : `"${key}"=$${parameters.length}`,
      );
      if (value === null) parameters.pop();
    }
    parameters.push(limit);
    const found = (await this.manager.query(
      `SELECT * FROM "${tableName(model)}" ${predicates.length ? 'WHERE ' + predicates.join(' AND ') : ''} ORDER BY "${primaryAttribute(definition).name}" LIMIT $${parameters.length}`,
      parameters,
    )) as ModelData[];
    // Raw PG bigint/timestamp values use the same transformers as EntitySchema reads.
    for (const record of found)
      for (const attribute of definition.attributes) {
        if (
          ['Revision', 'PositiveInteger', 'NonNegativeInteger'].includes(attribute.type) &&
          record[attribute.name] !== null
        )
          record[attribute.name] = Number(record[attribute.name]);
        if (attribute.type === 'Instant' && record[attribute.name] instanceof Date)
          record[attribute.name] = (record[attribute.name] as Date).toISOString();
      }
    return found.map((record) =>
      storedModelData(
        model,
        Object.fromEntries(
          modelDefinition(model).attributes.map((attribute) => [
            attribute.name,
            record[attribute.name],
          ]),
        ),
      ),
    );
  }
  async put(model: string, data: ModelData, expectedRevision: number | null = null): Promise<void> {
    ExecutionBudget.current()?.check();
    this.assertWriteVersion(model, data);
    validateModel(model, data, this.schema);
    const definition = modelDefinition(model);
    const id = data[primaryAttribute(definition).name] as string;
    const previous = await this.get(model, id);
    requireCondition(
      !previous || rowModelVersion(model, previous) === rowModelVersion(model, data),
      409,
      'MODEL_UPGRADE_REQUIRED',
      '구형 원본을 새 쓰기로 추정 변환할 수 없습니다.',
    );
    if (expectedRevision !== null)
      requireCondition(
        previous?.revision === expectedRevision,
        409,
        'STALE_REVISION',
        '현재 원본 개정이 다릅니다.',
      );
    const revision = Number(
      data.revision ?? data.aggregateVersion ?? data.sourceVersion ?? data.sourceRevision ?? 1,
    );
    requireCondition(
      !previous ||
        revision ===
          Number(
            previous.revision ??
              previous.aggregateVersion ??
              previous.sourceVersion ??
              previous.sourceRevision ??
              1,
          ) +
            1,
      409,
      'REVISION_SEQUENCE',
      '원본 개정은 하나씩 증가해야 합니다.',
    );
    await this.manager.getRepository<ModelData>(model).save(physicalData(model, data));
    this.changes.set(model + '/' + id, {
      model,
      schemaVersion: rowModelVersion(model, data),
      id,
      revision,
      data,
      deleted: false,
    });
  }
  async putNewBatch(model: string, records: readonly ModelData[]): Promise<void> {
    ExecutionBudget.current()?.check();
    requireCondition(
      records.length > 0 && records.length <= 100,
      400,
      'BATCH_LIMIT',
      '새 원본 배치는1~100행이어야 합니다.',
    );
    const definition = modelDefinition(model);
    const key = primaryAttribute(definition).name;
    const ids = new Set<string>();
    for (const data of records) {
      this.assertWriteVersion(model, data);
      validateModel(model, data, this.schema);
      const id = data[key] as string;
      const revision = Number(
        data.revision ?? data.aggregateVersion ?? data.sourceVersion ?? data.sourceRevision ?? 1,
      );
      requireCondition(
        revision === 1 && !ids.has(id) && !this.changes.has(model + '/' + id),
        409,
        'NEW_BATCH_CONFLICT',
        '새 원본만 한 번 등록할 수 있습니다.',
      );
      ids.add(id);
    }
    // INSERT, not upsert/save: existing IDs and unique/FK violations fail the
    // same primary transaction. Deferrable relationship constraints still run
    // at COMMIT before a recovery candidate can be protected or acknowledged.
    await this.manager
      .getRepository<ModelData>(model)
      .insert(records.map((data) => physicalData(model, data)));
    for (const data of records) {
      const id = data[key] as string;
      this.changes.set(model + '/' + id, {
        model,
        schemaVersion: rowModelVersion(model, data),
        id,
        revision: 1,
        data,
        deleted: false,
      });
    }
  }
  async remove(model: string, id: string, expectedRevision: number): Promise<void> {
    ExecutionBudget.current()?.check();
    const current = await this.get(model, id);
    requireCondition(
      current?.revision === expectedRevision,
      409,
      'STALE_REVISION',
      '삭제할 원본 개정이 다릅니다.',
    );
    const deleted = { ...current, revision: expectedRevision + 1 };
    this.assertWriteVersion(model, deleted);
    await this.manager
      .getRepository(model)
      .delete({ [primaryAttribute(modelDefinition(model)).name]: id });
    this.changes.set(model + '/' + id, {
      model,
      schemaVersion: rowModelVersion(model, deleted),
      id,
      revision: expectedRevision + 1,
      data: deleted,
      deleted: true,
    });
  }
  rows(): RecoveryRow[] {
    return [...this.changes.values()];
  }
  async assertAuthLease(id: string, leaseId: string): Promise<void> {
    const rows = (await this.manager.query(
      'SELECT id FROM u1_auth_ephemeral WHERE id=$1 AND lease_id=$2 AND lease_until>clock_timestamp() AND deadline_at>clock_timestamp() FOR UPDATE',
      [id, leaseId],
    )) as { id: string }[];
    requireCondition(
      rows.length === 1,
      503,
      'CHALLENGE_LEASE_LOST',
      '현재 인증 처리 임대를 확인해야 합니다.',
    );
  }
}
