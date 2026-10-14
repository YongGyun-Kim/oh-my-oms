import type { Knowledge, Ref } from '@oms/contracts';
export interface VerificationResult {
  knowledge: Knowledge;
  reasonCode: string;
  evidenceRefs: Ref[];
  legalEntityConfirmed: boolean;
  personConfirmed: boolean;
  enterpriseRelationshipConfirmed: boolean;
  mandateConfirmed: boolean;
}
// This owner port supplies business/person decisions. C19 evidence or an email match cannot supply them.
export interface EnterpriseVerification {
  readonly kind: 'REGISTERED' | 'SYNTHETIC' | 'UNREGISTERED';
  enterprise(applicationRef: Ref, basisRefs: Ref[]): Promise<VerificationResult>;
  administrator(
    enterpriseRef: Ref,
    accountRef: Ref,
    personLinkRef: Ref,
    basisRefs: Ref[],
  ): Promise<VerificationResult>;
}
