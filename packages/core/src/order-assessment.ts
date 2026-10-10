import type { Knowledge, Ref } from '@oms/contracts';
export interface Assessment {
  sourceOwner: string;
  knowledge: Knowledge;
  reasonKind: 'UNVERIFIED' | 'SPECIAL_CONDITION' | 'CONFLICT' | 'TECHNICAL_FAILURE';
  reasonCode: string;
  observedAt: string;
  sourceRevision: number | null;
  basisRefs: Ref[];
}
export interface AssessmentOwner {
  readonly owner:
    'CommercialAgreement' | 'FinancialSettlement' | 'HardwareFulfillment' | 'SoftwareLifecycle';
  assess(input: {
    enterpriseRef: Ref;
    productRef: Ref;
    quantity: number;
    agreementRevisionRef: Ref | null;
    paymentMode: string;
    requestedActivationDate: string | null;
  }): Promise<Assessment>;
}
export class Assessments {
  private readonly owners = new Map<string, AssessmentOwner>();
  constructor(
    private readonly now: () => Date,
    owners: AssessmentOwner[] = [],
  ) {
    for (const owner of owners) {
      if (this.owners.has(owner.owner))
        throw new Error('동일 판단 소유자를 두 번 등록할 수 없습니다.');
      this.owners.set(owner.owner, owner);
    }
  }
  async line(
    input: Parameters<AssessmentOwner['assess']>[0],
    type: 'HARDWARE' | 'SOFTWARE',
  ): Promise<Assessment[]> {
    const result: Assessment[] = [];
    for (const owner of [
      'CommercialAgreement',
      'FinancialSettlement',
      type === 'HARDWARE' ? 'HardwareFulfillment' : 'SoftwareLifecycle',
    ]) {
      const binding = this.owners.get(owner);
      if (!binding) {
        result.push({
          sourceOwner: owner,
          knowledge: 'UNKNOWN',
          reasonKind: 'UNVERIFIED',
          reasonCode: 'MODULE_NOT_REGISTERED',
          observedAt: this.now().toISOString(),
          sourceRevision: null,
          basisRefs: [],
        });
        continue;
      }
      try {
        const observed = await binding.assess(input);
        if (
          observed.sourceOwner !== owner ||
          !['KNOWN', 'UNKNOWN', 'CONFLICT', 'UNAVAILABLE'].includes(observed.knowledge)
        )
          throw new Error('잘못된 판단 계약');
        result.push(observed);
      } catch {
        result.push({
          sourceOwner: owner,
          knowledge: 'UNAVAILABLE',
          reasonKind: 'TECHNICAL_FAILURE',
          reasonCode: 'OWNER_QUERY_FAILED',
          observedAt: this.now().toISOString(),
          sourceRevision: null,
          basisRefs: [],
        });
      }
    }
    return result;
  }
}
