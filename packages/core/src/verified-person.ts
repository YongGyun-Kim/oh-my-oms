import { requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import type { ProtectedStore, ModelData } from '@oms/persistence';
import { ref } from './references.js';
import { Authorization } from './authorization.js';
export interface PersonRelation {
  knowledge: 'KNOWN' | 'UNKNOWN' | 'CONFLICT';
  relation: 'SAME' | 'DIFFERENT' | 'UNCONFIRMED';
  sourceRefs: Ref[];
  synthetic: boolean;
}
// Actual recognized identity/retention/provider policy remains unregistered.
// A local synthetic registration cannot activate actual person decisions.
export class VerifiedPerson {
  constructor(
    private readonly store: ProtectedStore,
    private readonly registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED',
    private readonly now: () => Date = () => new Date(),
  ) {}
  async read(context: ServiceContext, sourceRef: Ref): Promise<unknown> {
    const authorization = new Authorization(this.store, this.now);
    await authorization.requireStaff(context, 'identity.person.verify');
    requireCondition(
      sourceRef.owner === 'IdentityRecovery' && sourceRef.entity === 'VerifiedPersonLink',
      404,
      'NOT_FOUND',
      '원래 확인 대상을 확인할 수 없습니다.',
    );
    const source = await this.store.currentProtected('VerifiedPersonLink', sourceRef.id);
    requireCondition(
      source && source.revision === sourceRef.revision,
      404,
      'NOT_FOUND',
      '원래 확인 대상을 확인할 수 없습니다.',
    );
    const accountRef = (source.accountRefs as Ref[])[0];
    requireCondition(
      accountRef,
      503,
      'CURRENT_PERSON_NOT_PROTECTED',
      '현재 동일인 결합을 확인하세요.',
    );
    const confirmed =
      this.registration === 'LOCAL_SYNTHETIC' ? await this.confirmedLink(accountRef.id) : null;
    await authorization.requireStaff(context, 'identity.person.verify');
    requireCondition(
      await this.store
        .currentProtected('VerifiedPersonLink', sourceRef.id)
        .then((current) => current?.revision === source.revision),
      409,
      'CURRENT_PERSON_CHANGED',
      '현재 동일인 원본이 변경됐습니다.',
    );
    return this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/VerifiedPersonView',
      {
        accountRef,
        personLinkRef: confirmed ? ref('VerifiedPersonLink', confirmed) : null,
        knowledge: confirmed ? 'KNOWN' : 'UNKNOWN',
        policyRef: confirmed ? (source.policyRef ?? null) : null,
        observedAt: this.now().toISOString(),
      },
    );
  }
  private async confirmedLink(accountId: string): Promise<ModelData | null> {
    const matches = await this.store.list('VerifiedPersonLink', {
      equals: { accountRefs: [{ id: accountId }] },
      limit: 2,
    });
    const raw = await this.store.primary.query(
      'SELECT "personLinkId" AS id FROM u1_verified_person_link WHERE "accountRefs" @> $1::jsonb LIMIT 2',
      [JSON.stringify([{ id: accountId }])],
    );
    requireCondition(
      raw.length === matches.length &&
        raw.every((row: { id: string }) => matches.some((link) => link.personLinkId === row.id)),
      503,
      'CURRENT_PERSON_NOT_PROTECTED',
      '현재 동일인 원본의 보호가 필요합니다.',
    );
    if (matches.length !== 1) return null;
    const link = await this.store.currentProtected(
      'VerifiedPersonLink',
      String(matches[0]!.personLinkId),
    );
    if (!link) return null;
    const checks = await this.store.list('PersonVerification', {
      equals: { personLinkRef: { id: link.personLinkId } },
      limit: 2,
    });
    const currentChecks = await this.store.primary.query(
      'SELECT "personVerificationId" AS id FROM u1_person_verification WHERE "personLinkRef"->>\'id\'=$1 LIMIT 2',
      [link.personLinkId],
    );
    requireCondition(
      currentChecks.length === checks.length &&
        currentChecks.every((row: { id: string }) =>
          checks.some((check) => check.personVerificationId === row.id),
        ),
      503,
      'CURRENT_PERSON_NOT_PROTECTED',
      '현재 확인 결정의 보호가 필요합니다.',
    );
    if (checks.length !== 1) return null;
    const check = await this.store.currentProtected(
      'PersonVerification',
      String(checks[0]!.personVerificationId),
    );
    if (
      !check ||
      check.state !== 'CONFIRMED' ||
      Date.parse(String(check.expiresAt)) <= this.now().getTime()
    )
      return null;
    const policy = await this.store.currentProtected(
      'VerificationPolicy',
      (check.policyRef as Ref).id,
    );
    if (
      !policy ||
      policy.revision !== (check.policyRef as Ref).revision ||
      !policy.active ||
      policy.synthetic !== true ||
      Date.parse(String(policy.expiresAt)) <= this.now().getTime()
    )
      return null;
    const kinds = new Set<string>();
    for (const evidenceRef of check.evidenceRefs as Ref[]) {
      const evidence = await this.store.currentProtected('VerificationEvidence', evidenceRef.id);
      if (
        !evidence ||
        evidence.revision !== evidenceRef.revision ||
        evidence.state !== 'CONFIRMED' ||
        evidence.synthetic !== true ||
        (evidence.policyRef as Ref).id !== policy.policyId ||
        Date.parse(String(evidence.expiresAt)) <= this.now().getTime()
      )
        return null;
      kinds.add(String(evidence.sourceKind));
    }
    const required = policy.requiredSourceKinds as string[];
    if (required.length === 0 || !required.every((kind) => kinds.has(kind))) return null;
    return link;
  }
  async compare(left: Ref, right: Ref): Promise<PersonRelation> {
    for (const account of [left, right]) {
      this.store.schema.validateUri(
        'urn:oms:contract:u2-access-additions:1#/$defs/Account',
        account,
      );
      const current = await this.store.currentProtected('Account', account.id);
      requireCondition(current?.active, 403, 'PERSON_ACCOUNT', '현재 계정이 필요합니다.');
    }
    if (left.id === right.id)
      return {
        knowledge: 'KNOWN',
        relation: 'SAME',
        sourceRefs: [left],
        synthetic: this.registration === 'LOCAL_SYNTHETIC',
      };
    if (this.registration !== 'LOCAL_SYNTHETIC')
      return { knowledge: 'UNKNOWN', relation: 'UNCONFIRMED', sourceRefs: [], synthetic: false };
    const l = await this.confirmedLink(left.id),
      r = await this.confirmedLink(right.id);
    if (!l || !r)
      return { knowledge: 'UNKNOWN', relation: 'UNCONFIRMED', sourceRefs: [], synthetic: true };
    return {
      knowledge: 'KNOWN',
      relation: l.personLinkId === r.personLinkId ? 'SAME' : 'DIFFERENT',
      sourceRefs: [ref('VerifiedPersonLink', l), ref('VerifiedPersonLink', r)],
      synthetic: true,
    };
  }
}
