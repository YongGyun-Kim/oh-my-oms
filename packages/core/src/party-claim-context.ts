import { randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { Ref, PreIdentityContext } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { PurposeVerifier, generatePurposeSecret } from './purpose-verifier.js';
import type { SecretBinding } from './purpose-verifier.js';
import { ref } from './references.js';
import { IdentityBrowser } from './identity-browser.js';
import { Authorization } from './authorization.js';
export function partySecretBinding(
  row: ModelData,
  purpose: 'PARTY_CONTEXT' | 'PARTY_BROWSER' = 'PARTY_CONTEXT',
): SecretBinding {
  return {
    purpose,
    targetRef: { ...ref('PartyClaimContext', row), revision: 1 },
    accountRef: row.accountRef as Ref,
    bindingRef: row.bindingRef as Ref,
    bindingGeneration: Number(row.bindingGeneration),
    securityGeneration: Number(row.securityGeneration),
    sourceRevision: (row.caseRef as Ref).revision,
    epoch: String(row.epoch),
    challengeId: String(row.challengeId),
    keyVersion: String(row.keyVersion),
  };
}
export class PartyClaimContexts {
  private readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    private readonly verifier: PurposeVerifier,
    private readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
  ) {
    this.authorization = new Authorization(store, now);
  }
  async create(
    context: PreIdentityContext,
    input: { caseRef: Ref; challengeId: string },
    ingressProof: unknown = null,
  ): Promise<unknown> {
    this.store.schema.validate('PreIdentityContext', context);
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/PartyContextInput',
      input,
    );
    requireCondition(
      context.attemptId === input.challengeId &&
        this.now().getTime() < Date.parse(context.deadlineAt),
      401,
      'PARTY_CHALLENGE_REQUIRED',
      '서버의 새 당사자 진행 challenge가 필요합니다.',
    );
    requireCondition(
      context.audience !== 'STAFF' || (await this.staffIngress(ingressProof)),
      403,
      'STAFF_INGRESS_REQUIRED',
      '사설 직원 접점이 필요합니다.',
    );
    const previousBrowser = IdentityBrowser.current(false),
      browser = IdentityBrowser.next(false);
    requireCondition(
      browser !== previousBrowser,
      401,
      'PARTY_BROWSER_ROTATION_REQUIRED',
      '익명 접수와 별도의 새 당사자 접점이 필요합니다.',
    );
    const source = await this.authorization.lookup('RecoveryCase', input.caseRef.id);
    requireCondition(
      source &&
        source.revision === input.caseRef.revision &&
        !['COMPLETED', 'REJECTED', 'CLOSED'].includes(String(source.state)),
      404,
      'NOT_FOUND',
      '당사자 진행을 다시 확인하세요.',
    );
    const binding = await this.authorization.lookup(
      'ProviderBinding',
      (source.bindingRef as Ref).id,
    );
    requireCondition(
      binding?.audience === context.audience &&
        binding.active &&
        binding.generation === source.bindingGeneration &&
        source.epoch === (await this.store.currentEpoch()),
      404,
      'NOT_FOUND',
      '당사자 진행을 다시 확인하세요.',
    );
    const at = this.now(),
      secret = generatePurposeSecret('PARTY_CONTEXT'),
      row: ModelData = {
        partyContextId: randomUUID(),
        revision: 1,
        accountRef: source.accountRef,
        caseRef: input.caseRef,
        audience: context.audience,
        challengeId: input.challengeId,
        secretVerifier: '',
        browserVerifier: '',
        bindingRef: source.bindingRef,
        bindingGeneration: source.bindingGeneration,
        securityGeneration: source.securityGeneration,
        keyVersion: this.verifier.keyVersion,
        issuedAt: at.toISOString(),
        expiresAt: new Date(at.getTime() + 300000).toISOString(),
        state: 'PENDING',
        verificationRef: null,
        epoch: source.epoch,
      };
    row.secretVerifier = this.verifier.digest(secret, partySecretBinding(row));
    row.browserVerifier = this.verifier.digest(browser, partySecretBinding(row, 'PARTY_BROWSER'));
    await this.store.execute(
      {
        principalId: 'party-progress:' + context.attemptId,
        audience: context.audience,
        owner: 'IdentityRecovery',
        operation: 'createPartyContext',
        target: { kind: 'RECORD', recordRef: input.caseRef },
        idempotencyKey: randomUUID(),
        input: { partyContextId: row.partyContextId, challengeId: row.challengeId },
        correlationId: context.correlationId,
        epoch: String(row.epoch),
      },
      async (tx) => {
        const current = await this.authorization.lookup('RecoveryCase', input.caseRef.id, tx);
        requireCondition(
          current &&
            current.revision === source.revision &&
            current.epoch === row.epoch &&
            !['COMPLETED', 'REJECTED', 'CLOSED'].includes(String(current.state)),
          409,
          'PARTY_CASE_CHANGED',
          '원래 당사자 진행이 변경됐습니다.',
        );
        requireCondition(
          this.now().getTime() < Date.parse(context.deadlineAt),
          401,
          'PARTY_CHALLENGE_REQUIRED',
          '당사자 접점 기한을 확인하세요.',
        );
        await tx.put('PartyClaimContext', row);
      },
    );
    // Creating PENDING never links it as a verified case party, changes security
    // generation, locks business access or returns account/decision information.
    return this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/PartyContextView',
      {
        partyContextRef: ref('PartyClaimContext', row),
        challengeId: row.challengeId,
        partySecret: secret,
        expiresAt: row.expiresAt,
      },
    );
  }
  async assert(
    contextRef: Ref,
    secret: string,
    caseRef: Ref,
    challengeId: string,
    transaction?: ProtectedTransaction,
    claimedRef?: Ref,
  ): Promise<ModelData> {
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/PartyClaimContext',
      contextRef,
    );
    const row = await this.authorization.lookup('PartyClaimContext', contextRef.id, transaction);
    requireCondition(
      row &&
        row.revision === contextRef.revision &&
        row.state === 'VERIFIED' &&
        (row.caseRef as Ref).id === caseRef.id &&
        row.challengeId === challengeId &&
        row.epoch === (await this.store.currentEpoch()),
      403,
      'PARTY_CONTEXT_REQUIRED',
      '현재 확인 당사자의 원래 진행 문맥이 필요합니다.',
    );
    if (claimedRef) {
      this.store.schema.validateUri(
        'urn:oms:contract:u2-access-additions:1#/$defs/ClaimReceipt',
        claimedRef,
      );
      const claim = await this.authorization.lookup('ClaimReceipt', claimedRef.id, transaction),
        authority =
          claim &&
          (await this.authorization.lookup(
            'EnrollmentAuthority',
            (claim.authorityRef as Ref).id,
            transaction,
          )),
        grant =
          claim && claim.grantRef
            ? await this.authorization.lookup(
                'RecoveryHandoffGrant',
                (claim.grantRef as Ref).id,
                transaction,
              )
            : null;
      requireCondition(
        claim &&
          claim.revision === claimedRef.revision &&
          claim.requestRef !== null &&
          (claim.partyContextRef as Ref).id === row.partyContextId &&
          (claim.partyContextRef as Ref).revision === row.revision &&
          (claim.caseRef as Ref).id === caseRef.id &&
          grant?.state === 'CLAIMED' &&
          (grant.claimReceiptRef as Ref).id === claimedRef.id &&
          authority &&
          ['ACTIVE', 'HOLD'].includes(String(authority.state)) &&
          (authority.partyContextRef as Ref).id === row.partyContextId &&
          authority.challengeId === challengeId &&
          authority.epoch === row.epoch &&
          this.now().getTime() < Date.parse(String(authority.expiresAt)),
        403,
        'PARTY_CONTEXT_REQUIRED',
        '원래 보호 claim의 남은 제한 기한이 필요합니다.',
      );
    } else
      requireCondition(
        this.now().getTime() < Date.parse(String(row.expiresAt)),
        403,
        'PARTY_CONTEXT_REQUIRED',
        '원래 미소비 당사자 진행 기한이 필요합니다.',
      );
    requireCondition(
      this.verifier.matches(secret, partySecretBinding(row), String(row.secretVerifier)) &&
        this.verifier.matches(
          IdentityBrowser.current(false),
          partySecretBinding(row, 'PARTY_BROWSER'),
          String(row.browserVerifier),
        ),
      403,
      'PARTY_CONTEXT_REQUIRED',
      '현재 확인 당사자의 원래 접점이 필요합니다.',
    );
    return row;
  }
}
