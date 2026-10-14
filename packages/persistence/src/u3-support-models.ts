import { readFileSync } from 'node:fs';
import type { Model } from './model-catalog.js';
import { U2_MODELS } from './u2-model-catalog.js';

const legacy = (
  JSON.parse(readFileSync(new URL('../models/u1-v2.json', import.meta.url), 'utf8')) as {
    entities: Model[];
  }
).entities;
// C01 support models, separate from eighteen U3 business entities. Actual
// model/recovery version2 distinguishes these layouts from the model1 decoder.
export const U3_SUPPORT_MODELS: readonly Model[] = Object.freeze(
  [
    legacy.find((model) => model.name === 'StaffRole')!,
    legacy.find((model) => model.name === 'CustomerRole')!,
    U2_MODELS.find((model) => model.name === 'RoleRevisionState')!,
    U2_MODELS.find((model) => model.name === 'ScopeV2')!,
  ].map((model) => ({
    ...model,
    attributes: [
      { name: 'modelVersion', type: 'PositiveInteger', required: true, allowed_values: ['2'] },
      ...model.attributes.map((attribute) => {
        if (attribute.name === 'actions')
          return {
            ...attribute,
            type:
              'U3Contract:' +
              (model.name === 'StaffRole' ? 'LegacyStaffActionProjection' : 'RoleStateActions'),
          };
        if (model.name === 'ScopeV2' && attribute.name === 'predicate')
          return { ...attribute, type: 'U3Contract:ConsentScope' };
        if (model.name === 'ScopeV2' && attribute.name === 'action')
          return { ...attribute, type: 'U3Contract:ConsentAction' };
        return attribute;
      }),
      { name: 'sourceContract', type: 'U3Contract:SourceContract', required: true },
    ],
  })),
);
