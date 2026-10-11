import { readFileSync } from 'node:fs';
import type { Model } from './model-catalog.js';

// File lineage v1 contains the first U3 current layout (model version 2).
// Existing names keep their stable physical keys; logical aliases are documented.
export const U3_MODELS: readonly Model[] = Object.freeze(
  (
    JSON.parse(readFileSync(new URL('../models/u3-v1.json', import.meta.url), 'utf8')) as {
      entities: Model[];
    }
  ).entities,
);
export const U3_MODEL_VERSION = 2;

export function physicalU3Model(legacy: Model | undefined, current: Model): Model {
  if (!legacy) return current;
  const currentAttributes = new Map(
    current.attributes.map((attribute) => [attribute.name, attribute]),
  );
  const attributes = legacy.attributes.map((old) => {
    const next = currentAttributes.get(old.name);
    currentAttributes.delete(old.name);
    if (!next) return { ...old, required: false, nullable: true };
    return {
      ...next,
      required: old.required && next.required,
      nullable: old.nullable || next.nullable || !old.required || !next.required,
      ...(old.allowed_values && next.allowed_values
        ? { allowed_values: [...new Set([...old.allowed_values, ...next.allowed_values])] }
        : {}),
    };
  });
  attributes.push(
    ...[...currentAttributes.values()].map((attribute) => ({
      ...attribute,
      required: false,
      nullable: true,
    })),
  );
  return { ...current, attributes };
}
