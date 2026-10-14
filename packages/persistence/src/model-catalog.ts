import { OmsError, SchemaValidator, requireCondition } from '@oms/contracts';
import { readFileSync } from 'node:fs';
import type { EntitySchemaColumnOptions, EntitySchemaOptions } from 'typeorm';
import { EntitySchema } from 'typeorm';
import { validateAttribute } from './model-attribute.js';
import { U2_MODELS } from './u2-model-catalog.js';
import { validateU2ModelConstraints } from './u2-model-decoder.js';
import { U3_MODELS, U3_PERSISTENCE_MODELS, physicalU3Model } from './u3-model-catalog.js';
import { validateU3ModelConstraints } from './u3-model-decoder.js';
import { U4_PERSISTENCE_MODELS, U4_U3_MODELS } from './u4-model-catalog.js';
import { validateU4ModelConstraints } from './u4-model-decoder.js';

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
const legacyModels = [...MODELS, ...U2_MODELS];
const u3ByName = new Map(U3_PERSISTENCE_MODELS.map((model) => [model.name, model]));
const u4ByName = new Map(U4_PERSISTENCE_MODELS.map((model) => [model.name, model]));
const u4U3ByName = new Map(U4_U3_MODELS.map((model) => [model.name, model]));
const physicalCurrent = (model: Model, current: Model) => {
  const previous = physicalU3Model(model, current);
  const u4 = u4U3ByName.get(current.name);
  return u4 ? physicalU3Model(previous, u4) : previous;
};
export const ALL_MODELS = Object.freeze([
  ...MODELS.map<Model>((model) => {
    const current = u3ByName.get(model.name);
    if (current) return physicalCurrent(model, current);
    if (['RequestReceipt', 'WorkItem', 'FactEnvelope'].includes(model.name))
      return {
        ...model,
        attributes: [
          ...model.attributes,
          {
            name: 'sourceContract',
            type: 'SharedContract:SourceContract',
            required: false,
            nullable: true,
          },
        ],
      };
    return model;
  }),
  ...U2_MODELS.map<Model>((model) => {
    const current = u3ByName.get(model.name);
    return current ? physicalCurrent(model, current) : model;
  }),
  ...U3_MODELS.filter((model) => !MODELS.some((old) => old.name === model.name)).map((model) =>
    u4U3ByName.has(model.name) ? physicalU3Model(model, u4U3ByName.get(model.name)!) : model,
  ),
  ...U4_PERSISTENCE_MODELS,
]);
requireCondition(
  new Set(ALL_MODELS.map((model) => model.name)).size === ALL_MODELS.length,
  503,
  'DUPLICATE_MODEL',
  '물리 모델 이름은 한 번만 등록해야 합니다.',
);
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
  if (
    ['U4Contract:Label', 'U4Contract:Description', 'U4Contract:ExternalReference'].includes(
      attribute.type,
    )
  )
    return 'varchar';
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
      'U3Contract:ConsentAction',
      'ScopeKind',
      'KnowledgeState',
    ].includes(attribute.type)
  )
    return 'varchar';
  return 'jsonb';
}
export function materialSchemas(models: readonly Model[] = ALL_MODELS): EntitySchema<ModelData>[] {
  return models.map((model) => {
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
  const definition = modelForData(name, data);
  const attributeContext = {
    schema,
    columnType,
    findModel: (name: string) => modelByName.get(name),
    u3: data.modelVersion === 2 && u3ByName.has(name),
    u4: u4ByName.has(name) || data.modelVersion === 3,
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
  validateU3ModelConstraints(name, data, schema);
  validateU4ModelConstraints(name, data, schema);
  return data;
}

export function modelForData(name: string, data: ModelData): Model {
  const financial = u4ByName.get(name);
  if (financial) {
    requireCondition(
      data.modelVersion === 1,
      400,
      'MODEL_VERSION',
      'U4 원본은 명시 modelVersion1이 필요합니다.',
    );
    return financial;
  }
  if (data.modelVersion === 3 && u4U3ByName.has(name)) return u4U3ByName.get(name)!;
  const current = u3ByName.get(name);
  if (!current) return modelDefinition(name);
  if (data.modelVersion === 2) return current;
  const legacy = legacyModels.find((model) => model.name === name);
  requireCondition(
    data.modelVersion === undefined && legacy,
    400,
    'MODEL_VERSION',
    '현재 U3 원본은 명시 modelVersion2, 과거 원본은 등록된 구형 decoder가 필요합니다.',
  );
  return legacy;
}
export function rowModelVersion(name: string, data: ModelData): 1 | 2 | 3 {
  if (data.modelVersion === 3 && u4U3ByName.has(name)) return 3;
  return modelForData(name, data) === u3ByName.get(name) ? 2 : 1;
}
// Physical NULLs introduced by expand migration are not invented legacy fields.
export function storedModelData(name: string, physical: ModelData): ModelData {
  const financialVariant = u4U3ByName.get(name);
  if (financialVariant && physical.modelVersion !== 3) {
    const previous = new Set(
      (u3ByName.get(name)?.attributes ?? []).map((attribute) => attribute.name),
    );
    for (const attribute of financialVariant.attributes)
      requireCondition(
        previous.has(attribute.name) || physical[attribute.name] == null,
        503,
        'MODEL_VERSION_MIX',
        '구형 원본에 새 약정 필드를 섞을 수 없습니다.',
      );
  }
  if (u4ByName.has(name) || (physical.modelVersion === 3 && u4U3ByName.has(name))) {
    const definition = modelForData(name, physical);
    const names = new Set(definition.attributes.map((attribute) => attribute.name));
    for (const attribute of modelDefinition(name).attributes)
      requireCondition(
        names.has(attribute.name) || physical[attribute.name] == null,
        503,
        'MODEL_VERSION_MIX',
        '등록 버전 밖의 원본 값이 섞였습니다.',
      );
    return Object.fromEntries(
      definition.attributes
        .filter((attribute) => physical[attribute.name] !== undefined)
        .map((attribute) => [attribute.name, physical[attribute.name]]),
    );
  }
  const u3 = u3ByName.get(name),
    legacy = legacyModels.find((model) => model.name === name);
  if (!u3)
    return Object.fromEntries(
      modelDefinition(name)
        .attributes.filter(
          (attribute) =>
            !['U3Contract:SourceContract', 'SharedContract:SourceContract'].includes(
              attribute.type,
            ) ||
            (physical[attribute.name] !== null && physical[attribute.name] !== undefined),
        )
        .map((attribute) => [attribute.name, physical[attribute.name]]),
    );
  if (!legacy)
    return Object.fromEntries(
      modelDefinition(name)
        .attributes.filter(
          (attribute) =>
            physical[attribute.name] !== undefined &&
            (attribute.required || physical[attribute.name] !== null),
        )
        .map((attribute) => [attribute.name, physical[attribute.name]]),
    );
  if (physical.modelVersion === 2) {
    const names = new Set(u3.attributes.map((attribute) => attribute.name));
    for (const old of legacy.attributes)
      requireCondition(
        names.has(old.name) || physical[old.name] === null || physical[old.name] === undefined,
        503,
        'MODEL_VERSION_MIX',
        '현재 U3 원본에 구형 전용 값을 섞을 수 없습니다.',
      );
    return Object.fromEntries(
      u3.attributes
        .filter(
          (attribute) =>
            physical[attribute.name] !== undefined &&
            (attribute.required || physical[attribute.name] !== null),
        )
        .map((attribute) => [attribute.name, physical[attribute.name]]),
    );
  }
  const names = new Set(legacy.attributes.map((attribute) => attribute.name));
  for (const attribute of u3.attributes)
    requireCondition(
      names.has(attribute.name) ||
        physical[attribute.name] === null ||
        physical[attribute.name] === undefined,
      503,
      'MODEL_VERSION_MIX',
      '구형 원본에 현재 U3 값을 추정할 수 없습니다.',
    );
  return Object.fromEntries(
    legacy.attributes.map((attribute) => [attribute.name, physical[attribute.name]]),
  );
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
