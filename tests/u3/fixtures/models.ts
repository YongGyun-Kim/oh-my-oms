import { U3_MODELS, modelDefinition } from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import { fixtureRef } from './identity.js';
import { orderFixture } from './commercial.js';

export const sourceContract = {
  profile: 'urn:oms:contract:u3-commercial:2',
  registryVersion: 3,
} as const;
export function modernProduct(id = 'modern-product'): ModelData {
  return {
    modelVersion: 2,
    productId: id,
    productType: 'HARDWARE',
    softwareTermKind: null,
    label: 'U3 합성 상품',
    salesDescription: '실제 판매/승인 원본이 아닌 자료',
    currentOfferRef: null,
    saleState: 'INCOMPLETE',
    revision: 1,
  };
}
export function legacyProduct(id = 'legacy-product'): ModelData {
  return {
    productId: id,
    productType: 'HARDWARE',
    softwareTermKind: null,
    label: '구형 합성 상품',
    salesDescription: '원래 의미 보존',
    currentOfferRef: fixtureRef('ProductCatalog', 'CommonOfferRevision', id + '-offer'),
    revision: 1,
  };
}
export function legacyOffer(product = legacyProduct()): ModelData {
  return {
    offerRevisionId: (product.currentOfferRef as { id: string }).id,
    productRef: fixtureRef('ProductCatalog', 'Product', String(product.productId)),
    visible: true,
    commonPrice: { currency: 'KRW', value: '1000.5' },
    salesConditionRefs: [],
    publishedAt: '2026-10-01T00:00:00.000Z',
    revision: 1,
  };
}
export function capturedLine() {
  return {
    ...orderFixture().lines[0]!,
    purchasePrice: { currency: 'KRW', value: '1000' },
    priceKnowledge: 'KNOWN',
    paymentTermsRef: fixtureRef('ProductCatalog', 'CommonOfferRevision', 'offer-0'),
    agreedPeriod: null,
    completionBasisRef: fixtureRef('ProductCatalog', 'CommonOfferRevision', 'offer-0'),
  };
}
export const priceBreakdown = () => ({
  lineAmounts: [{ currency: 'KRW', value: '1000' }],
  productAmount: { currency: 'KRW', value: '1000' },
  adjustments: [],
  total: { currency: 'KRW', value: '1000' },
  knowledge: 'KNOWN',
});

// Shape fixtures for every declared model. They establish neither protected
// person/source trust nor business authority; integration seeds actual rows separately.
export function modelFixture(name: string): ModelData {
  if (name === 'Product') return modernProduct();
  const model = U3_MODELS.find((entry) => entry.name === name)!;
  const reference = (entity: string) => fixtureRef(modelDefinition(entity).owner, entity);
  const line = capturedLine();
  const terms = {
    termsRecordRef: reference('CommonOfferRevision'),
    lines: [
      {
        productRef: line.productRef,
        quantity: 1,
        price: line.purchasePrice,
        period: null,
        conditionRefs: [],
      },
    ],
  };
  const values: Record<string, unknown> = {
    modelVersion: 2,
    owner: model.owner,
    quantity: 1,
    position: 1,
    commonPrice: { currency: 'KRW', value: '1000' },
    price: { currency: 'KRW', value: '1000' },
    purchasePrice: line.purchasePrice,
    priceKnowledge: 'KNOWN',
    targetScope: orderFixture().targetScope,
    enterpriseRef: orderFixture().targetScope.enterpriseRef,
    conditionBindings: line.conditionBindings,
    agreementRevisionRefs: line.agreementRevisionRefs,
    effectiveWindow: line.conditionBindings[0]!.effectiveWindow,
    capturedLines: [line],
    priceBreakdown: priceBreakdown(),
    catalogRevisionRefs: [line.commonOfferRevisionRef],
    commonOfferRevisionRef: line.commonOfferRevisionRef,
    originalTerms: terms,
    proposedTerms: terms,
    targetOrderRef: reference('Order'),
    targetEntitlementRef: null,
    targetRenewalCycleRef: null,
    lineAssessments: [
      {
        lineRef: reference('OrderLine'),
        assessments: [
          {
            sourceOwner: 'HardwareFulfillment',
            knowledge: 'UNKNOWN',
            reasonKind: 'UNVERIFIED',
            reasonCode: 'MODULE_NOT_REGISTERED',
            observedAt: '2026-10-11T00:00:00.000Z',
            sourceRevision: null,
            basisRefs: [],
          },
        ],
      },
    ],
    assessedSourceRevisions: [],
    acceptance: 'REVIEW_REQUIRED',
    decision: 'HOLD',
  };
  if (name === 'AgreementApproval') values.decision = 'APPROVE';
  if (name === 'CustomerConsent') values.decision = 'ACCEPT';
  if (name === 'ProvisionChoice') values.effectiveRevisionRef = reference('PurchaseTermsSnapshot');
  const result: ModelData = {};
  for (const attribute of model.attributes) {
    if (!attribute.required) continue;
    if (attribute.name in values) result[attribute.name] = values[attribute.name];
    else if (attribute.nullable) result[attribute.name] = null;
    else if (attribute.type === 'Identifier')
      result[attribute.name] = attribute.name + '-synthetic';
    else if (['Revision', 'PositiveInteger'].includes(attribute.type)) result[attribute.name] = 1;
    else if (attribute.type === 'Enum') result[attribute.name] = attribute.allowed_values![0];
    else if (attribute.type === 'Boolean') result[attribute.name] = true;
    else if (attribute.type === 'Instant') result[attribute.name] = '2026-10-11T00:00:00.000Z';
    else if (attribute.type === 'Ref') result[attribute.name] = reference(attribute.references!);
    else if (attribute.type === 'ExternalRef' || attribute.type === 'U3Contract:TermsRef')
      result[attribute.name] = reference('CommonOfferRevision');
    else if (attribute.type === 'RefList')
      result[attribute.name] = attribute.references ? [reference(attribute.references)] : [];
    else result[attribute.name] = '합성 원본';
  }
  return result;
}
