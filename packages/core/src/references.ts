import { requireCondition, U3_PROFILE, U4_PROFILE } from '@oms/contracts';
import type { Ref, SchemaValidator } from '@oms/contracts';
import type { ModelData } from '@oms/persistence';
import {
  modelDefinition,
  modelForData,
  primaryAttribute,
  U3_PERSISTENCE_MODELS,
  U4_U3_MODELS,
  U4_PERSISTENCE_MODELS,
  validateModel,
} from '@oms/persistence';
export function ref(model: string, data: ModelData): Ref {
  const definition = modelDefinition(model);
  return {
    owner: definition.owner,
    entity: model,
    id: String(data[primaryAttribute(definition).name]),
    revision: Number(data.revision ?? data.aggregateVersion ?? data.sourceVersion ?? 1),
  };
}
export function sameRef(left: Ref | null, right: Ref | null): boolean {
  return left === null || right === null
    ? left === right
    : left.owner === right.owner && left.entity === right.entity && left.id === right.id;
}

// 구형 ref()의 의미는 유지한다. model2 이력의 sourceRevision도 실제 put row 개정으로 발급한다.
export function u3Ref(model: string, data: ModelData, schema: SchemaValidator): Ref {
  requireCondition(
    data.modelVersion === 2 && U3_PERSISTENCE_MODELS.some((value) => value.name === model),
    400,
    'U3_REFERENCE_MODEL',
    '실제 등록된 U3 model2 원상이 필요합니다.',
  );
  validateModel(model, data, schema);
  const definition = modelForData(model, data);
  const revisionField = ['revision', 'aggregateVersion', 'sourceVersion', 'sourceRevision'].find(
    (field) => definition.attributes.some((attribute) => attribute.name === field),
  );
  const revision = revisionField ? data[revisionField] : undefined;
  requireCondition(
    typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1,
    400,
    'U3_REFERENCE_REVISION',
    '등록 원본의 실제 저장 개정을 확인해야 합니다.',
  );
  return schema.validateUri<Ref>(U3_PROFILE + '#/$defs/Ref', {
    owner: definition.owner,
    entity: model,
    id: String(data[primaryAttribute(definition).name]),
    revision,
  });
}
export function u4Ref(model: string, data: ModelData, schema: SchemaValidator): Ref {
  requireCondition(
    (data.modelVersion === 3 && U4_U3_MODELS.some((entry) => entry.name === model)) ||
      (data.modelVersion === 1 && U4_PERSISTENCE_MODELS.some((entry) => entry.name === model)),
    400,
    'U4_REFERENCE_MODEL',
    '명시 U4 원본 버전이 필요합니다.',
  );
  validateModel(model, data, schema);
  const definition = modelForData(model, data);
  const field = ['revision', 'aggregateVersion', 'sourceVersion', 'sourceRevision'].find((name) =>
    definition.attributes.some((attribute) => attribute.name === name),
  );
  const revision = field ? data[field] : undefined;
  requireCondition(
    typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1,
    400,
    'U4_REFERENCE_REVISION',
    '등록 원본의 실제 저장 개정이 필요합니다.',
  );
  return schema.validateUri<Ref>(U4_PROFILE + '#/$defs/Ref', {
    owner: definition.owner,
    entity: model,
    id: String(data[primaryAttribute(definition).name]),
    revision,
  });
}
