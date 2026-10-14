import type { Ref } from '@oms/contracts';
import type { EnterpriseVerification, VerificationResult } from '@oms/core';
export const syntheticBasis: Ref = {
  owner: 'OperationalAssurance',
  entity: 'OperationalEvidence',
  id: 'synthetic-profile-provenance',
  revision: 1,
};
export class SyntheticEnterpriseVerification implements EnterpriseVerification {
  readonly kind = 'SYNTHETIC' as const;
  knowledge: VerificationResult['knowledge'] = 'KNOWN';
  relationshipConfirmed = true;
  private result(): VerificationResult {
    return {
      knowledge: this.knowledge,
      reasonCode: 'SYNTHETIC_PROFILE_' + this.knowledge,
      evidenceRefs: [syntheticBasis],
      legalEntityConfirmed: this.knowledge === 'KNOWN',
      personConfirmed: this.knowledge === 'KNOWN',
      enterpriseRelationshipConfirmed: this.relationshipConfirmed,
      mandateConfirmed: this.relationshipConfirmed,
    };
  }
  async enterprise() {
    return this.result();
  }
  async administrator() {
    return this.result();
  }
}
