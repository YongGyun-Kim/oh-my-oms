import type { EnterpriseVerification, VerificationResult } from '@oms/core';
// Until the actual legal/person/company/mandate owner profile is registered,
// a staff click or an evidence number cannot manufacture verification.
export class UnregisteredEnterpriseVerification implements EnterpriseVerification {
  readonly kind = 'UNREGISTERED' as const;
  private unavailable(): VerificationResult {
    return {
      knowledge: 'UNAVAILABLE',
      reasonCode: 'VERIFICATION_PROFILE_NOT_REGISTERED',
      evidenceRefs: [],
      legalEntityConfirmed: false,
      personConfirmed: false,
      enterpriseRelationshipConfirmed: false,
      mandateConfirmed: false,
    };
  }
  async enterprise(): Promise<VerificationResult> {
    return this.unavailable();
  }
  async administrator(): Promise<VerificationResult> {
    return this.unavailable();
  }
}
