import { readFileSync } from 'node:fs';
import type { Model } from './model-catalog.js';
import { U3_MODELS } from './u3-model-catalog.js';
import { U4_SUPPORT_MODELS } from './u4-support-models.js';
import { U4_ACCESS_MODELS } from './u4-access-models.js';
export { U4_SUPPORT_MODELS } from './u4-support-models.js';
export { U4_ACCESS_MODELS } from './u4-access-models.js';

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
          : attribute.name === 'conditionBindings'
            ? { ...attribute, type: 'U4Contract:ConditionBindings' }
            : attribute.name === 'capturedLines'
              ? { ...attribute, type: 'U4Contract:CapturedLines' }
              : attribute.name === 'appliedTerms'
                ? { ...attribute, type: 'U4Contract:AppliedTerms' }
                : attribute.name === 'changeKind'
                  ? {
                      ...attribute,
                      allowed_values: ['REVIEW_PAYMENT_PLAN_CHANGE', 'ACCEPTED_AFTERSALES_CHANGE'],
                    }
                  : ['paymentKind', 'requestedPaymentMode'].includes(attribute.name)
                    ? { ...attribute, allowed_values: ['PREPAY', 'POSTPAY', 'MIXED'] }
                    : attribute,
      ),
      { name: 'paymentPlan', type: 'U4Contract:AgreedPaymentPlan', required: true, nullable: true },
      ...(model.name === 'AgreementRevision'
        ? [
            {
              name: 'paymentPlanDraft',
              type: 'U4Contract:PaymentPlanDraft',
              required: true,
              nullable: true,
            },
          ]
        : []),
      ...(model.name === 'Order' || model.name === 'PurchaseTermsSnapshot'
        ? [{ name: 'renewalCycleRef', type: 'U4Contract:Ref', required: false, nullable: true }]
        : []),
    ],
  })),
);
export const U4_PERSISTENCE_MODELS = Object.freeze([...U4_MODELS, ...U4_SUPPORT_MODELS]);
export const U4_VERSION3_MODELS = Object.freeze([...U4_U3_MODELS, ...U4_ACCESS_MODELS]);
