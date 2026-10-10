import type { Audience, ScopeV2 } from '@oms/contracts';
import { canonicalJson, ExecutionBudget, requireCondition, SchemaValidator } from '@oms/contracts';
import type { DataSource } from 'typeorm';
import type { ModelData } from './model-catalog.js';
import { modelDefinition } from './model-catalog.js';
import { ProtectedTransaction } from './protected-transaction.js';
import * as protectedwrite from './protected-write.js';
import { decodePayload } from './recovery-types.js';
import { currentSecurityMatches } from './security-state.js';

export interface WriteRequest {
  principalId: string;
  audience: Audience;
  owner: string;
  operation: string;
  target: unknown;
  idempotencyKey: string;
  input: unknown;
  correlationId: string;
  epoch: string;
}
export type FaultBoundary = 'PRIMARY_COMMITTED' | 'JOURNAL_PROTECTED' | 'VISIBILITY_UPDATED';
export interface CommitResult {
  requestId: string;
  commitOrder: number;
  replay: boolean;
}
export interface Candidate {
  epoch: string;
  commit_order: string;
  request_id: string;
  payload_text: string;
  digest: string;
}
export interface Prefix {
  commit_order: string;
  digest: string | null;
}
export interface ModelQuery {
  equals?: Record<string, unknown>;
  anyOf?: Record<string, unknown>[];
  u2ScopeClauses?: Record<string, unknown>[];
  u2RoleManagement?: {
    scopes: readonly ScopeV2[];
    departmentUsage: 'UNSET' | 'USED' | 'NOT_USED';
    siteUsage: 'UNSET' | 'USED' | 'NOT_USED';
    active: boolean | null;
  };
  ids?: string[];
  cursor?: string | null;
  limit?: number;
}
// 고정된 보호 version 조회만 조합한다. 외부 입력은 JSON parameter로만 전달한다.
function u2RolePredicate(alias: string, parameter: number): string {
  const configuration = `$${parameter}::jsonb`;
  const latest = (model: string, condition: string) =>
    `SELECT item.data FROM u1_entity_version item JOIN u1_protected_prefix protected ON protected.epoch=item.epoch AND item.commit_order<=protected.commit_order JOIN u1_epoch_sequence sequence ON sequence.epoch=item.epoch WHERE item.model='${model}' AND ${condition} ORDER BY sequence.generation DESC,item.commit_order DESC LIMIT 1`;
  const axis = (axis: 'departmentSelector' | 'siteSelector', candidate: string) =>
    `(manager.value->'${axis}'->>'kind'='ALL' OR (manager.value->'${axis}'->>'kind'=${candidate}->'${axis}'->>'kind' AND (manager.value->'${axis}'->>'kind'<>'EXACT' OR (manager.value->'${axis}'->'ref'->>'id'=${candidate}->'${axis}'->'ref'->>'id' AND manager.value->'${axis}'->'ref'->>'owner'=${candidate}->'${axis}'->'ref'->>'owner' AND manager.value->'${axis}'->'ref'->>'entity'=${candidate}->'${axis}'->'ref'->>'entity'))))`;
  const covered = (candidate: string) =>
    `EXISTS(SELECT 1 FROM jsonb_array_elements(${configuration}->'scopes') manager WHERE ${axis('departmentSelector', candidate)} AND ${axis('siteSelector', candidate)})`;
  const roleId = `${alias}.data->>'roleId'`,
    roleEnterprise = `${alias}.data->'enterpriseRef'->>'id'`;
  const state = latest('RoleRevisionState', `item.data->'roleRef'->>'id'=${roleId}`);
  const scopes = `NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state.data->'scopeRefs') reference LEFT JOIN LATERAL (${latest('ScopeV2', "item.id=reference.value->>'id'")}) scope ON true WHERE scope.data IS NULL OR scope.data->>'revision'<>reference.value->>'revision' OR scope.data->'enterpriseRef'->>'id'<>${roleEnterprise} OR NOT ${covered("scope.data->'predicate'")})`;
  const selection = (field: 'department' | 'site') => {
    const exactKinds =
        field === 'department'
          ? "'DEPARTMENT_SITE','DEPARTMENT_ALL_SITES'"
          : "'DEPARTMENT_SITE','SITE_ALL_DEPARTMENTS'",
      refs = field === 'department' ? 'departmentRefs' : 'siteRefs';
    return `CASE WHEN scope.data->>'kind' NOT IN(${exactKinds}) THEN jsonb_build_array(jsonb_build_object('kind','ALL')) WHEN jsonb_array_length(scope.data->'${refs}')=0 THEN CASE WHEN original.data->'orderingContextPolicy'->>'${field}Usage'='NOT_USED' THEN jsonb_build_array(jsonb_build_object('kind','NOT_USED')) ELSE '[]'::jsonb END ELSE (SELECT jsonb_agg(jsonb_build_object('kind','EXACT','ref',selected.value)) FROM jsonb_array_elements(scope.data->'${refs}') selected) END`;
  };
  const legacy = `NOT EXISTS(SELECT 1 FROM jsonb_array_elements(${alias}.data->'actionScopeRefs') reference LEFT JOIN LATERAL (${latest('ActionScope', "item.id=reference.value->>'id'")}) scope ON true LEFT JOIN LATERAL (${latest('Enterprise', "item.id=scope.data->'enterpriseRef'->>'id' AND item.revision=(scope.data->'enterpriseRef'->>'revision')::integer")}) original ON true WHERE scope.data IS NULL OR original.data IS NULL OR scope.data->'enterpriseRef'->>'id'<>${roleEnterprise} OR (scope.data->>'kind'='DEPARTMENT_SITE' AND (jsonb_array_length(scope.data->'departmentRefs')>1 OR jsonb_array_length(scope.data->'siteRefs')>1)) OR jsonb_array_length(${selection('department')})=0 OR jsonb_array_length(${selection('site')})=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(${selection('department')}) department CROSS JOIN jsonb_array_elements(${selection('site')}) site WHERE NOT ${covered("jsonb_build_object('departmentSelector',department.value,'siteSelector',site.value)")}))`;
  return ` AND EXISTS(SELECT 1 FROM (SELECT 1) anchor LEFT JOIN LATERAL (${state}) state ON true WHERE (${configuration}->'active'='null'::jsonb OR COALESCE((state.data->>'active')::boolean,true)=(${configuration}->>'active')::boolean) AND CASE WHEN state.data IS NULL THEN ${legacy} ELSE state.data->'roleRef'->>'revision'=${alias}.data->>'revision' AND ${scopes} END)`;
}
export class ProtectedStore {
  readonly schema = new SchemaValidator();
  constructor(
    readonly primary: DataSource,
    readonly journal: DataSource,
    private readonly fault?: (boundary: FaultBoundary) => Promise<void>,
  ) {}
  async currentEpoch(): Promise<string> {
    ExecutionBudget.current()?.check();
    const rows = (await this.primary.query(
      'SELECT epoch,enabled FROM u1_recovery_control WHERE singleton=true',
    )) as { epoch: string; enabled: boolean }[];
    requireCondition(rows[0]?.enabled, 503, 'WRITER_FENCED', '복구 중에는 변경할 수 없습니다.');
    return rows[0].epoch;
  }
  execute(
    request: WriteRequest,
    operation: (transaction: ProtectedTransaction, requestId: string) => Promise<void>,
  ): Promise<CommitResult> {
    return protectedwrite.execute(
      {
        primary: this.primary,
        schema: this.schema,
        fault: this.fault,
        currentEpoch: this.currentEpoch.bind(this),
        protect: this.protect.bind(this),
      },
      request,
      operation,
    );
  }
  async protect(candidate: Candidate): Promise<void> {
    ExecutionBudget.current()?.check();
    const payload = decodePayload(candidate.payload_text, this.schema);
    const { contentDigest: _digest, ...body } = payload;
    void _digest;
    await this.journal.query('SELECT u1_append_entry($1,$2,$3,$4,$5,$6)', [
      payload.epoch,
      payload.commitOrder,
      candidate.payload_text,
      payload.contentDigest,
      payload.previousDigest,
      canonicalJson(body),
    ]);
    const boundary = (await this.journal.query(
      'SELECT commit_order,digest FROM u1_journal_prefix WHERE epoch=$1',
      [payload.epoch],
    )) as Prefix[];
    requireCondition(
      boundary[0] && Number(boundary[0].commit_order) >= payload.commitOrder,
      503,
      'PROTECTION_GAP',
      '앞선 접수 보호를 확인해야 합니다.',
    );
    await this.fault?.('JOURNAL_PROTECTED');
    await this.primary.query(
      'INSERT INTO u1_protected_prefix VALUES($1,$2,$3) ON CONFLICT(epoch) DO UPDATE SET commit_order=excluded.commit_order,digest=excluded.digest WHERE u1_protected_prefix.commit_order<=excluded.commit_order',
      [payload.epoch, boundary[0].commit_order, boundary[0].digest],
    );
    await this.fault?.('VISIBILITY_UPDATED');
  }
  async protectPending(epoch: string, limit = 25): Promise<number> {
    requireCondition(
      Number.isInteger(limit) && limit > 0 && limit <= 100,
      400,
      'BATCH_LIMIT',
      '보호 대조 묶음 크기가 다릅니다.',
    );
    const candidates = (await this.primary.query(
      'SELECT c.* FROM u1_recovery_candidate c LEFT JOIN u1_protected_prefix p USING(epoch) WHERE c.epoch=$1 AND c.commit_order>COALESCE(p.commit_order,0) ORDER BY c.commit_order LIMIT $2',
      [epoch, limit],
    )) as Candidate[];
    for (const candidate of candidates) await this.protect(candidate);
    return candidates.length;
  }
  async read(model: string, id: string): Promise<ModelData | null> {
    await this.currentEpoch();
    modelDefinition(model);
    const rows = (await this.primary.query(
      `SELECT v.data,v.deleted FROM u1_entity_version v JOIN u1_protected_prefix p ON p.epoch=v.epoch AND v.commit_order<=p.commit_order JOIN u1_epoch_sequence e ON e.epoch=v.epoch WHERE v.model=$1 AND v.id=$2 ORDER BY e.generation DESC,v.commit_order DESC LIMIT 1`,
      [model, id],
    )) as { data: ModelData; deleted: boolean }[];
    return rows[0] && !rows[0].deleted ? rows[0].data : null;
  }
  async list(model: string, query: ModelQuery = {}): Promise<ModelData[]> {
    await this.currentEpoch();
    modelDefinition(model);
    const limit = query.limit ?? 25;
    requireCondition(
      Number.isInteger(limit) && limit >= 1 && limit <= 100,
      400,
      'PAGE_LIMIT',
      '목록 크기는 1~100입니다.',
    );
    const filter = query.equals ?? {};
    const alternatives = query.anyOf ?? [];
    requireCondition(alternatives.length <= 8, 400, 'FILTER_LIMIT', '조회 조건 개수를 확인하세요.');
    for (const part of [filter, ...alternatives])
      for (const key of Object.keys(part))
        requireCondition(
          modelDefinition(model).attributes.some((attribute) => attribute.name === key),
          400,
          'FILTER_FIELD',
          '등록된 목록 필드가 아닙니다.',
        );
    if (query.cursor) this.schema.validate('Id', query.cursor);
    if (query.ids !== undefined) {
      requireCondition(
        Array.isArray(query.ids) && query.ids.length <= 100,
        400,
        'FILTER_IDS',
        '유한 현재 원본 ID 목록이 필요합니다.',
      );
      for (const id of query.ids) this.schema.validate('Id', id);
    }
    const parameters: unknown[] = [model, query.cursor ?? null, filter, limit, ...alternatives];
    let scopeParameter: number | null = null;
    let roleParameter: number | null = null;
    if (query.u2ScopeClauses !== undefined) {
      requireCondition(
        ['EnterpriseMembership', 'MembershipInvitation'].includes(model) &&
          query.u2ScopeClauses.length > 0 &&
          query.u2ScopeClauses.length <= 2000 &&
          filter.enterpriseRef !== undefined,
        400,
        'U2_SCOPE_FILTER',
        '명시 기업/등록 소속 모델의 유한 전체 술어가 필요합니다.',
      );
      for (const clause of query.u2ScopeClauses) {
        requireCondition(
          clause &&
            typeof clause === 'object' &&
            !Array.isArray(clause) &&
            Object.keys(clause).every((key) => ['departmentRef', 'siteRef'].includes(key)),
          400,
          'U2_SCOPE_FILTER',
          '등록 조직 축의 전체 술어만 허용합니다.',
        );
        for (const value of Object.values(clause)) {
          requireCondition(
            value === null ||
              (typeof value === 'object' &&
                value !== null &&
                !Array.isArray(value) &&
                Object.keys(value).join(',') === 'id'),
            400,
            'U2_SCOPE_FILTER',
            '정규 조직 참조/NOT_USED가 필요합니다.',
          );
          if (value !== null) this.schema.validate('Id', (value as { id: unknown }).id);
        }
      }
      scopeParameter = parameters.push(JSON.stringify(query.u2ScopeClauses));
    }
    if (query.u2RoleManagement !== undefined) {
      const management = query.u2RoleManagement;
      requireCondition(
        model === 'CustomerRole' &&
          typeof (filter.enterpriseRef as { id?: unknown } | undefined)?.id === 'string' &&
          management.scopes.length > 0 &&
          management.scopes.length <= 2000 &&
          ['UNSET', 'USED', 'NOT_USED'].includes(management.departmentUsage) &&
          ['UNSET', 'USED', 'NOT_USED'].includes(management.siteUsage) &&
          (management.active === null || typeof management.active === 'boolean'),
        400,
        'U2_ROLE_FILTER',
        '현재 기업/행위의 유한 역할 술어가 필요합니다.',
      );
      for (const scope of management.scopes) {
        this.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/ScopeV2', scope);
        requireCondition(
          scope.action === 'role.manage' &&
            scope.enterpriseRef.id === (filter.enterpriseRef as { id: string }).id,
          400,
          'U2_ROLE_FILTER',
          '같은 기업의 명시 역할 관리 술어가 필요합니다.',
        );
      }
      roleParameter = parameters.push(JSON.stringify(management));
    }
    const idsFilter =
      query.ids === undefined ? '' : ` AND v.id=ANY($${parameters.push(query.ids)}::text[])`;
    const alternativesFor = (alias: string) =>
      (alternatives.length
        ? ' AND (' +
          alternatives.map((_part, index) => `${alias}.data @> $${index + 5}::jsonb`).join(' OR ') +
          ')'
        : '') +
      (scopeParameter === null
        ? ''
        : ` AND EXISTS(SELECT 1 FROM jsonb_array_elements($${scopeParameter}::jsonb) scope_clause WHERE ${alias}.data @> scope_clause.value)`) +
      (roleParameter === null ? '' : u2RolePredicate(alias, roleParameter));
    // GIN narrows candidate identities before newest-protected-version lookup.
    // Recheck the latest version afterwards: an older matching version must not
    // revive a removed grant, deleted row, changed tenant or completed Work.
    const rows = (await this.primary.query(
      `WITH candidates AS (SELECT DISTINCT v.id FROM u1_entity_version v WHERE v.model=$1 AND ($2::text IS NULL OR v.id>$2) AND v.data @> $3::jsonb${alternativesFor('v')}${idsFilter}) SELECT latest.data FROM candidates c CROSS JOIN LATERAL (SELECT v.data,v.deleted FROM u1_entity_version v JOIN u1_protected_prefix p ON p.epoch=v.epoch AND v.commit_order<=p.commit_order JOIN u1_epoch_sequence e ON e.epoch=v.epoch WHERE v.model=$1 AND v.id=c.id ORDER BY e.generation DESC,v.commit_order DESC LIMIT 1) latest WHERE NOT latest.deleted AND latest.data @> $3::jsonb${alternativesFor('latest')} ORDER BY c.id LIMIT $4`,
      parameters,
    )) as { data: ModelData }[];
    return rows.map((row) => row.data);
  }
  async readRevision(model: string, id: string, revision: number): Promise<ModelData | null> {
    await this.currentEpoch();
    modelDefinition(model);
    this.schema.validate('Revision', revision);
    const rows = (await this.primary.query(
      'SELECT v.data,v.deleted FROM u1_entity_version v JOIN u1_protected_prefix p ON p.epoch=v.epoch AND v.commit_order<=p.commit_order WHERE v.model=$1 AND v.id=$2 AND v.revision=$3 LIMIT 1',
      [model, id, revision],
    )) as { data: ModelData; deleted: boolean }[];
    return rows[0] && !rows[0].deleted ? rows[0].data : null;
  }
  async currentProtected(model: string, id: string): Promise<ModelData | null> {
    ExecutionBudget.current()?.check();
    const state = (await this.primary.query(
      'SELECT enabled,auth_ready FROM u1_recovery_control WHERE singleton=true',
    )) as { enabled: boolean; auth_ready: boolean }[];
    requireCondition(
      state[0]?.enabled && state[0].auth_ready,
      503,
      'RECOVERY_SECURITY_UNCONFIRMED',
      '복구 후 현재 보안 근거를 독립 확인해야 합니다.',
    );
    const visible = await this.read(model, id);
    const current = await this.primary.getRepository<ModelData>(model).findOne({
      where: {
        [modelDefinition(model).attributes.find(
          (attribute) => attribute.unique && attribute.type === 'Identifier',
        )!.name]: id,
      },
    });
    requireCondition(
      currentSecurityMatches(model, visible, current),
      503,
      'CURRENT_AUTH_NOT_PROTECTED',
      '현재 권한/인증 변경의 보호를 확인해야 합니다.',
    );
    return visible;
  }
  async *scan(
    model: string,
    equals: Record<string, unknown>,
    deadlineAt: string,
  ): AsyncGenerator<ModelData> {
    let cursor: string | null = null;
    const key = modelDefinition(model).attributes.find(
      (attribute) => attribute.unique && attribute.type === 'Identifier',
    )!.name;
    while (true) {
      requireCondition(
        Date.now() < Date.parse(deadlineAt),
        503,
        'QUERY_DEADLINE',
        '권한 조회 기한을 초과했습니다.',
      );
      const page = await this.list(model, { equals, cursor, limit: 100 });
      for (const record of page) yield record;
      if (page.length < 100) return;
      cursor = String(page.at(-1)![key]);
    }
  }
}
