import type { Model } from './model-catalog.js';
import { U3_SUPPORT_MODELS } from './u3-support-models.js';

// U2 소유의 명시 새 직원 역할 표현이다. 구형 역할을 새 행위로 승격하지 않는다.
export const U4_ACCESS_MODELS: readonly Model[] = Object.freeze(
  U3_SUPPORT_MODELS.filter((model) => ['StaffRole', 'RoleRevisionState'].includes(model.name)).map(
    (model) => ({
      ...model,
      attributes: model.attributes.map((attribute) =>
        attribute.name === 'modelVersion'
          ? { ...attribute, allowed_values: ['3'] }
          : attribute.name === 'sourceContract'
            ? { ...attribute, type: 'U4Contract:SourceContract' }
            : attribute.name === 'actions'
              ? {
                  ...attribute,
                  type:
                    'U4Contract:' +
                    (model.name === 'StaffRole'
                      ? 'LegacyStaffActionProjection'
                      : 'StaffActionList'),
                }
              : attribute,
      ),
    }),
  ),
);
