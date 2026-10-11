import { randomUUID } from 'node:crypto';
import { declareU3Operations, OperationRegistry, SchemaValidator } from '@oms/contracts';
import type {
  Ref,
  U3AgreementRegistrationInput,
  U3AgreementApprovalInput,
  U3CommercialTermsQuery,
} from '@oms/contracts';
import { fixtureMeta } from './commercial.js';
import { catalogInput } from './catalog.js';

const schema = new SchemaValidator(),
  registry = new OperationRegistry(schema);
declareU3Operations(registry);
export function registeredAgreementInput<T>(
  operation: 'registerAgreement' | 'approveAgreement' | 'readApprovedTerms',
  input: T,
): T {
  return schema.validateUri<T>(registry.lookup('CommercialAgreement', operation, 3).input, input);
}
export function agreementRegistrationInput(
  enterpriseRef: Ref,
  productRef: Ref,
  offerRef: Ref,
  proofRefs: Ref[],
  contractRef: Ref | null = null,
): U3AgreementRegistrationInput {
  const effectiveWindow = catalogInput(offerRef).offerDraft!.effectiveWindow;
  return registeredAgreementInput('registerAgreement', {
    meta: { ...fixtureMeta(contractRef?.revision ?? null), clientRequestId: randomUUID() },
    enterpriseRef,
    productRefs: [productRef],
    commercialTermsRef: offerRef,
    provisionTermsRef: offerRef,
    renewalTermsRef: null,
    agreementEvidenceRefs: proofRefs,
    contractRef,
    effectiveWindow,
    conditions: [
      {
        conditionKey: 'PRICE',
        value: { currency: 'KRW', value: '900' },
        effectiveWindow,
        evidenceRefs: proofRefs,
      },
    ],
  });
}
export function agreementApprovalInput(targetRef: Ref, basisRefs: Ref[]): U3AgreementApprovalInput {
  return registeredAgreementInput('approveAgreement', {
    meta: { ...fixtureMeta(targetRef.revision), clientRequestId: randomUUID() },
    targetRef,
    decision: 'APPROVE',
    basisRefs,
  });
}
export function commercialTermsInput(input: U3CommercialTermsQuery): U3CommercialTermsQuery {
  return registeredAgreementInput('readApprovedTerms', input);
}
