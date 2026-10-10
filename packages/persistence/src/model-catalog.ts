import { OmsError, SchemaValidator, requireCondition } from '@oms/contracts';
import { readFileSync } from 'node:fs';
import type { EntitySchemaColumnOptions, EntitySchemaOptions } from 'typeorm';
import { EntitySchema } from 'typeorm';
import { validateAttribute } from './model-attribute.js';
import { U2_MODELS } from './u2-model-catalog.js';
import { validateU2ModelConstraints } from './u2-model-decoder.js';

export interface Attribute {
  name: string;
  type: string;
  required: boolean;
  unique?: boolean;
  nullable?: boolean;
  references?: string;
  allowed_values?: string[];
  minimum?: number;
  min_items?: number;
}
export interface Model {
  name: string;
  owner: string;
  attributes: Attribute[];
  constraints: string[];
}
export type ModelData = Record<string, unknown>;
const catalog = JSON.parse(
  readFileSync(new URL('../models/u1-v2.json', import.meta.url), 'utf8'),
) as { entities: Model[] };
// Preserve the U1 catalog's public versioned projection for old consumers.
// Physical registration and current decoders use the additive full catalog.
export const MODELS = Object.freeze(catalog.entities);
export const ALL_MODELS = Object.freeze([...MODELS, ...U2_MODELS]);
const modelByName = new Map(ALL_MODELS.map((model) => [model.name, model]));

export function modelDefinition(name: string): Model {
  const model = modelByName.get(name);
  requireCondition(model, 503, 'MODEL_NOT_REGISTERED', '원본 모델이 등록되지 않았습니다.');
  return model;
}
export function primaryAttribute(model: Model): Attribute {
  const attribute = model.attributes.find((a) => a.unique && a.type === 'Identifier');
  requireCondition(attribute, 503, 'MODEL_KEY_MISSING', '원본 식별자 등록이 없습니다.');
  return attribute;
}
export function tableName(name: string): string {
  return 'u1_' + name.replace(/[A-Z]/g, (x, index) => (index ? '_' : '') + x.toLowerCase());
}

function columnType(attribute: Attribute): EntitySchemaColumnOptions['type'] {
  if (['Revision', 'PositiveInteger', 'NonNegativeInteger'].includes(attribute.type))
    return 'bigint';
  if (attribute.type === 'Boolean') return 'boolean';
  if (attribute.type === 'Instant') return 'timestamptz';
  if (attribute.type === 'LocalDate') return 'date';
  if (
    [
      'Identifier',
      'NonEmptyText',
      'ProtectedReference',
      'Audience',
      'Enum',
      'BusinessOwner',
      'LoginPath',
      'OptionalPurpose',
      'ReceiptState',
      'CustomerAction',
      'ScopeKind',
      'KnowledgeState',
    ].includes(attribute.type)
  )
    return 'varchar';
  return 'jsonb';
}
export function materialSchemas(): EntitySchema<ModelData>[] {
  return ALL_MODELS.map((model) => {
    const columns: Record<string, EntitySchemaColumnOptions> = {};
    const foreignKeys: NonNullable<EntitySchemaOptions<ModelData>['foreignKeys']> = [];
    const checks: { expression: string }[] = [];
    for (const attribute of model.attributes) {
      const type = columnType(attribute);
      const numeric = type === 'bigint';
      columns[attribute.name] = {
        type,
        nullable: attribute.nullable || attribute.type === 'OptionalPurpose' || !attribute.required,
        primary: attribute === primaryAttribute(model),
        unique: attribute.unique && attribute !== primaryAttribute(model),
      };
      if (type === 'varchar')
        columns[attribute.name]!.length = attribute.type === 'Identifier' ? 128 : 4096;
      if (numeric) {
        columns[attribute.name]!.transformer = {
          to: (v: unknown) => v,
          from: (v: string | null) => (v === null ? null : Number(v)),
        };
        checks.push({
          expression: `"${attribute.name}" >= ${attribute.minimum ?? (attribute.type === 'NonNegativeInteger' ? 0 : 1)}`,
        });
      }
      if (type === 'timestamptz')
        columns[attribute.name]!.transformer = {
          to: (v: string | null) => (v === null ? null : new Date(v)),
          from: (v: Date | null) => (v === null ? null : v.toISOString()),
        };
      if (attribute.allowed_values)
        checks.push({
          expression: `"${attribute.name}" IN (${attribute.allowed_values.map((v) => "'" + v.replaceAll("'", "''") + "'").join(',')})`,
        });
      const target = attribute.references && modelByName.get(attribute.references);
      if (target && !attribute.type.endsWith('List')) {
        const fk = attribute.name + 'Key';
        columns[fk] = {
          type: 'varchar',
          length: 128,
          nullable: attribute.nullable || !attribute.required,
        };
        foreignKeys.push({
          target: target.name,
          columnNames: [fk],
          referencedColumnNames: [primaryAttribute(target).name],
          onDelete: 'NO ACTION',
          deferrable: 'INITIALLY DEFERRED',
        });
      }
    }
    const uniques =
      model.name === 'ConsumerProcessingMark'
        ? [{ columns: ['consumer', 'deliveryKind', 'deliveryId'] }]
        : undefined;
    return new EntitySchema<ModelData>({
      name: model.name,
      tableName: tableName(model.name),
      columns,
      foreignKeys,
      checks,
      uniques,
    });
  });
}

export function validateModel(name: string, data: ModelData, schema: SchemaValidator): ModelData {
  const definition = modelDefinition(name);
  const attributeContext = {
    schema,
    columnType,
    findModel: (name: string) => modelByName.get(name),
    u2DecisionBasis:
      name === 'EnterpriseMembership' &&
      !!data.designationBasis &&
      ((data.designationBasis as { evidenceRefs?: { entity: string }[] }).evidenceRefs ?? []).some(
        (source) => U2_MODELS.some((model) => model.name === source.entity),
      ),
    u2:
      U2_MODELS.some((model) => model.name === name) ||
      ['RequestReceipt', 'IdentityHistory', 'AccessHistory'].includes(name) ||
      (name === 'FactEnvelope' && data.schemaVersion === 'u2-access-additions:1') ||
      (name === 'WorkItem' &&
        [
          'EnterpriseAccess.deliverInvitation',
          'IdentityRecovery.deliverHandoff',
          'IdentityRecovery.removeOriginalFactor',
          'IdentityRecovery.signOutOriginalSessions',
          'IdentityRecovery.replaceFirstFactor',
        ].includes(String(data.operationId))),
  };
  const names = new Set(definition.attributes.map((a) => a.name));
  for (const key of Object.keys(data))
    requireCondition(
      names.has(key),
      400,
      'UNKNOWN_MODEL_FIELD',
      '원본에 등록되지 않은 필드입니다.',
    );
  for (const attribute of definition.attributes) {
    const value = data[attribute.name];
    requireCondition(
      value !== undefined || !attribute.required,
      400,
      'MODEL_FIELD_REQUIRED',
      '필수 원본 값이 없습니다.',
    );
    if (
      value === undefined ||
      (value === null && (attribute.nullable || attribute.type === 'OptionalPurpose'))
    )
      continue;
    if (value === null)
      throw new OmsError(400, 'MODEL_NULL_NOT_ALLOWED', '필수 원본 값은 NULL일 수 없습니다.');
    validateAttribute(attribute, value, attributeContext);
  }
  validateU2ModelConstraints(name, data);
  return data;
}

export function physicalData(name: string, data: ModelData): ModelData {
  const output = { ...data };
  for (const attribute of modelDefinition(name).attributes) {
    if (
      attribute.references &&
      modelByName.has(attribute.references) &&
      !attribute.type.endsWith('List')
    ) {
      const value = data[attribute.name];
      output[attribute.name + 'Key'] =
        value === null ? null : typeof value === 'object' ? (value as { id: string }).id : value;
    }
  }
  return output;
}
