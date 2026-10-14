import { readFileSync } from 'node:fs';
import type { Model } from './model-catalog.js';
import { U3_MODELS } from './u3-model-catalog.js';
import { U4_SUPPORT_MODELS } from './u4-support-models.js';
export { U4_SUPPORT_MODELS } from './u4-support-models.js';

export const U4_MODELS: readonly Model[] = Object.freeze(
  (
    JSON.parse(readFileSync(new URL('../models/u4-v1.json', import.meta.url), 'utf8')) as {
      entities: Model[];
    }
  ).entities,
);
export const U4_U3_MODELS: readonly Model[] = Object.freeze(
  U3_MODELS.filter((model) =>
    [
      'AgreementRevision',
      'CommercialProposal',
      'PurchaseTermsSnapshot',
      'OrderChangeApplication',
      'Order',
      'OrderLine',
    ].includes(model.name),
  ).map((model) => ({
    ...model,
    attributes: [
      ...model.attributes.map((attribute) =>
        attribute.name === 'modelVersion'
          ? { ...attribute, allowed_values: ['3'] }
          : ['paymentKind', 'requestedPaymentMode'].includes(attribute.name)
            ? { ...attribute, allowed_values: ['PREPAY', 'POSTPAY', 'MIXED'] }
            : attribute,
      ),
      { name: 'paymentPlan', type: 'U4Contract:AgreedPaymentPlan', required: true, nullable: true },
    ],
  })),
);
export const U4_PERSISTENCE_MODELS = Object.freeze([...U4_MODELS, ...U4_SUPPORT_MODELS]);
