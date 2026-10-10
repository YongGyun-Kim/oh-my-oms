import type { Ref } from '@oms/contracts';
import type { ModelData } from '@oms/persistence';
import { modelDefinition, primaryAttribute } from '@oms/persistence';
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
