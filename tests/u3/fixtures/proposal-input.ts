import { randomUUID } from 'node:crypto';
import { declareU3Operations, OperationRegistry, SchemaValidator } from '@oms/contracts';
import type {
  Ref,
  U3ConsentInput,
  U3OrderPriceBreakdown,
  U3ProposalInput,
  U3ProposalQuery,
  U3ProposalTerms,
} from '@oms/contracts';
import { fixtureMeta } from './commercial.js';
import { fixtureRef, fixtureScope } from './identity.js';

const schema = new SchemaValidator(),
  registry = new OperationRegistry(schema);
declareU3Operations(registry);
export function registeredProposalInput<T>(
  operation: 'createProposal' | 'recordConsent' | 'readProposal',
  input: T,
): T {
  return schema.validateUri<T>(registry.lookup('CommercialAgreement', operation, 3).input, input);
}
// DTO 형식 자료이며, 실제 원본·권한·직원 확인·갱신 회차를 증명하지 않는다.
export function proposalTerms(termsRecordRef: Ref): U3ProposalTerms {
  return {
    termsRecordRef,
    lines: [
      {
        productRef: fixtureRef('ProductCatalog', 'Product'),
        quantity: 1,
        price: { currency: 'KRW', value: '1000' },
        period: null,
        conditionRefs: [fixtureRef('ProductCatalog', 'CommonOfferRevision')],
      },
    ],
  };
}
export function proposalPrice(): U3OrderPriceBreakdown {
  return {
    lineAmounts: [{ currency: 'KRW', value: '1000' }],
    productAmount: { currency: 'KRW', value: '1000' },
    adjustments: [],
    total: { currency: 'KRW', value: '1000' },
    knowledge: 'KNOWN',
  };
}
export function proposalInput(): U3ProposalInput {
  const proposedTermsRef = fixtureRef('CommercialAgreement', 'AgreementRevision');
  return registeredProposalInput('createProposal', {
    meta: {
      ...fixtureMeta(),
      clientRequestId: randomUUID(),
      evidenceRefs: [fixtureRef('EnterpriseAccess', 'ScopeV2')],
    },
    targetScope: fixtureScope(),
    targetOrderRef: fixtureRef('OrderAcceptance', 'Order'),
    targetEntitlementRef: null,
    targetRenewalCycleRef: null,
    originalTermsRef: fixtureRef('OrderAcceptance', 'PurchaseTermsSnapshot'),
    proposedTermsRef,
    proposedTerms: proposalTerms(proposedTermsRef),
    priceBreakdown: proposalPrice(),
    supersedesRef: null,
    agreementEvidenceRefs: [fixtureRef('IdentityRecovery', 'VerificationEvidence')],
  });
}
export function consentInput(
  proposalRef = fixtureRef('CommercialAgreement', 'CommercialProposal'),
  termsFingerprint = 'a'.repeat(64),
): U3ConsentInput {
  return registeredProposalInput('recordConsent', {
    meta: {
      ...fixtureMeta(proposalRef.revision),
      clientRequestId: randomUUID(),
      evidenceRefs: [fixtureRef('EnterpriseAccess', 'RoleRevisionState')],
    },
    targetScope: fixtureScope(),
    proposalRef,
    proposalRevision: proposalRef.revision,
    termsFingerprint,
    decision: 'ACCEPT',
  });
}
export function proposalQuery(): U3ProposalQuery {
  return registeredProposalInput('readProposal', {
    targetRef: fixtureRef('CommercialAgreement', 'CommercialProposal'),
    targetScope: fixtureScope(),
  });
}
