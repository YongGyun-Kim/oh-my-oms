import { createHmac, randomUUID } from 'node:crypto';
import { fingerprint, requireCondition } from '@oms/contracts';
import type { PreIdentityContext, Receipt, Ref } from '@oms/contracts';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { IdentityBrowser } from './identity-browser.js';
import { ref } from './references.js';
import type { IdentityInternal } from './identity-state.js';
import type { CodeVerifier } from './recovery-codes.js';
import type { PurposeSecretVault, VaultBinding } from '@oms/persistence';
import { PurposeVerifier, generatePurposeSecret } from './purpose-verifier.js';
import { EnrollmentAuthorities } from './enrollment-authority.js';
import { partySecretBinding } from './party-claim-context.js';
import { u2CodeSecurityStateId } from '@oms/persistence';
import { fenceOtherAccountBindings } from './identity-security-events.js';
export interface RecoveryRequestInput {
  loginIdentifier: string;
  recoveryResponse?: string;
}
// Anonymous admission has a uniform minimal receipt. It neither verifies the
// named person nor links the requester's existing browser as the case party.
export class RecoveryCases {
  private readonly authorization: Authorization;
  private readonly key: Buffer;
  constructor(
    readonly store: ProtectedStore,
    key: Buffer,
    private readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
    private readonly admit: (identifierDigest: string) => Promise<void>,
  ) {
    requireCondition(
      key.length >= 32,
      503,
      'RECOVERY_REQUEST_KEY',
      '복구 접수의 별도 보호 키가 필요합니다.',
    );
    this.key = Buffer.from(key);
    this.authorization = new Authorization(store, now);
  }
  async request(
    context: PreIdentityContext,
    input: RecoveryRequestInput,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    this.store.schema.validate('PreIdentityContext', context);
    this.store.schema.validate('RecoveryInput', input);
    requireCondition(
      this.now().getTime() < Date.parse(context.deadlineAt),
      401,
      'RECOVERY_REQUEST_EXPIRED',
      '현재 복구 접수 접점을 확인하세요.',
    );
    requireCondition(
      context.audience !== 'STAFF' || (await this.staffIngress(ingressProof)),
      403,
      'STAFF_INGRESS_REQUIRED',
      '사설 직원 접점이 필요합니다.',
    );
    IdentityBrowser.current(false);
    const digest = createHmac('sha256', this.key)
        .update('oms-u2-recovery-request:1\0')
        .update(JSON.stringify(input))
        .digest('hex'),
      identifierDigest = createHmac('sha256', this.key)
        .update('oms-u2-recovery-identifier:1\0')
        .update(JSON.stringify([context.audience, input.loginIdentifier]))
        .digest('hex');
    await this.admit(identifierDigest);
    const safe = { requestDigest: digest },
      principalId = 'recovery-request:' + context.attemptId,
      target = { kind: 'NONE' };
    const commit = await this.store.execute(
      {
        principalId,
        audience: context.audience,
        owner: 'IdentityRecovery',
        operation: 'requestRecovery',
        target,
        idempotencyKey: context.attemptId,
        input: safe,
        correlationId: context.correlationId,
        epoch: await this.store.currentEpoch(),
      },
      async (tx, requestId) => {
        requireCondition(
          this.now().getTime() < Date.parse(context.deadlineAt),
          401,
          'RECOVERY_REQUEST_EXPIRED',
          '현재 접수 기한을 확인하세요.',
        );
        const accounts = await this.store.list('Account', {
            equals: { loginIdentifier: input.loginIdentifier },
            limit: 2,
          }),
          resultRefs: import('@oms/contracts').Ref[] = [];
        let source: ModelData | null = null;
        if (accounts.length === 1) {
          const account = await this.authorization.lookup(
            'Account',
            String(accounts[0]!.accountId),
            tx,
          );
          if (account?.active) {
            const bindings = await this.store.list('ProviderBinding', {
                equals: {
                  accountRef: { id: account.accountId },
                  audience: context.audience,
                  active: true,
                },
                limit: 2,
              }),
              states = await this.store.list('AccountSecurityState', {
                equals: { accountRef: { id: account.accountId } },
                limit: 2,
              });
            if (bindings.length === 1 && states.length === 1) {
              const binding = await this.authorization.lookup(
                  'ProviderBinding',
                  String(bindings[0]!.bindingId),
                  tx,
                ),
                security = await this.authorization.lookup(
                  'AccountSecurityState',
                  String(states[0]!.securityStateId),
                  tx,
                );
              if (binding?.active && security) {
                source = {
                  caseId: randomUUID(),
                  revision: 1,
                  accountRef: ref('Account', account),
                  bindingRef: ref('ProviderBinding', binding),
                  bindingGeneration: binding.generation,
                  securityGeneration: security.securityGeneration,
                  parentRef: null,
                  method: 'MANUAL',
                  reason: '본인 확인 전 복구 접수',
                  createdAt: this.now().toISOString(),
                  deadlineAt: new Date(this.now().getTime() + 300000).toISOString(),
                  holdReason: 'AWAITING_VERIFICATION',
                  verificationRef: null,
                  partyContextRef: null,
                  enrollmentAuthorityRef: null,
                  originalOperationRefs: [],
                  noticeRef: null,
                  epoch: await this.store.currentEpoch(),
                  state: 'REQUESTED',
                  previousBindingRef: null,
                  previousSecurityGeneration: null,
                  originalBindingRefs: [],
                  originalFactorRefs: [],
                  originalCodeSetRefs: [],
                  originalSessionRefs: [],
                };
                await tx.put('RecoveryCase', source);
                resultRefs.push(ref('RecoveryCase', source));
              }
            }
          }
        }
        const at = this.now().toISOString(),
          history = {
            historyId: randomUUID(),
            owner: 'IdentityRecovery',
            actorAccountRef: null,
            verifiedPersonRef: null,
            occurredAt: at,
            reason: '본인 확인 전 복구 접수',
            beforeRef: null,
            afterRef: source ? ref('RecoveryCase', source) : null,
            evidenceRefs: [],
            requestId,
            resultRefs,
            correctionOf: null,
            sourceRevision: 1,
          };
        await tx.put('IdentityHistory', history);
        await tx.put('RequestReceipt', {
          requestId,
          principalId,
          audience: context.audience,
          owner: 'IdentityRecovery',
          operation: 'requestRecovery',
          targetIdentity: target,
          requestFingerprint: fingerprint(safe),
          idempotencyKey: context.attemptId,
          targetScope: null,
          requestState: 'ACCEPTED',
          resultRefs: [...resultRefs, ref('IdentityHistory', history)],
          acceptedAt: at,
          updatedAt: at,
          revision: 1,
          correlationId: context.correlationId,
        });
      },
    );
    const receipt = await this.store.read('RequestReceipt', commit.requestId);
    requireCondition(
      receipt &&
        receipt.principalId === principalId &&
        receipt.audience === context.audience &&
        this.now().getTime() < Date.parse(context.deadlineAt),
      503,
      'RECOVERY_REQUEST_NOT_PROTECTED',
      '원래 복구 접수의 보호를 확인하세요.',
    );
    return this.store.schema.validate('Receipt', {
      requestId: receipt.requestId,
      requestState: 'ACCEPTED',
      owner: 'IdentityRecovery',
      targetRef: null,
      resultRefs: [],
      acceptedAt: receipt.acceptedAt,
      updatedAt: receipt.updatedAt,
      statusRevision: receipt.revision,
      retryAfterMilliseconds: null,
    });
  }
}
export function savedCodeSetCurrent(set: ModelData, binding: ModelData): boolean {
  return (
    set.confirmed === true &&
    set.invalidated === false &&
    (set.accountRef as Ref).id === (binding.accountRef as Ref).id &&
    (set.bindingRef as Ref).id === binding.bindingId &&
    set.generation === binding.generation
  );
}
export class SavedCodeRecoveries {
  private readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    private readonly verifier: PurposeVerifier,
    private readonly vault: PurposeSecretVault,
    private readonly now: () => Date,
    private readonly registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED',
  ) {
    this.authorization = new Authorization(store, now);
  }
  private binding(authority: ModelData): VaultBinding {
    return {
      id: String(authority.handleVaultRef),
      purpose: 'ENROLLMENT_HANDLE',
      targetRef: { ...ref('EnrollmentAuthority', authority), revision: 1 },
      accountRef: authority.accountRef as Ref,
      audience: authority.audience as 'CUSTOMER' | 'STAFF',
      bindingGeneration: Number(authority.bindingGeneration),
      sourceRevision: 1,
      expiresAt: String(authority.expiresAt),
      keyVersion: this.vault.keyVersion,
    };
  }
  async prepare(
    host: IdentityInternal,
    challengeId: string,
    ingressProof: unknown = null,
  ): Promise<Ref> {
    requireCondition(
      host.store === this.store,
      503,
      'SAVED_CODE_STORE',
      '현재 신원 서비스와 같은 보호 원본이 필요합니다.',
    );
    return host.withAttempt(challengeId, async (attempt) => {
      await host.ingress(attempt.proof.audience, ingressProof);
      IdentityBrowser.current(false);
      if (attempt.recoveryCaseRef) {
        const current = await this.authorization.lookup('RecoveryCase', attempt.recoveryCaseRef.id);
        requireCondition(
          current &&
            (current.accountRef as Ref).id === (attempt.binding.accountRef as Ref).id &&
            current.epoch === (await this.store.currentEpoch()),
          409,
          'SAVED_CASE_CHANGED',
          '원래 직접 복구 case를 확인하세요.',
        );
        return attempt.recoveryCaseRef;
      }
      const id =
        'saved-case-' +
        createHmac('sha256', host.runtime.verifierKey)
          .update('oms-u2-saved-case:1\0' + challengeId)
          .digest('hex');
      await host.mutate(challengeId + ':prepare-saved-recovery', { caseId: id }, async (tx) => {
        await host.checkAttemptCurrent(attempt, tx);
        const states = await tx.list(
          'AccountSecurityState',
          { accountRef: { id: (attempt.binding.accountRef as Ref).id } },
          2,
        );
        requireCondition(
          states.length === 1,
          503,
          'CURRENT_SECURITY_REQUIRED',
          '현재 단일 보안 세대가 필요합니다.',
        );
        const security = await this.authorization.lookup(
          'AccountSecurityState',
          String(states[0]!.securityStateId),
          tx,
        );
        requireCondition(
          security,
          503,
          'CURRENT_SECURITY_REQUIRED',
          '현재 보안 세대의 보호가 필요합니다.',
        );
        const slots = await tx.list(
          'IdentityExecutionSlot',
          { accountRef: { id: (attempt.binding.accountRef as Ref).id } },
          100,
        );
        requireCondition(
          slots.length < 100,
          503,
          'RECOVERY_SLOT_SCAN_LIMIT',
          '유한 원래 실행 slot 대조가 필요합니다.',
        );
        const unresolved = slots.filter((slot) =>
          ['ACTIVE', 'UNKNOWN'].includes(String(slot.state)),
        );
        for (const slot of unresolved)
          await this.authorization.lookup('IdentityExecutionSlot', String(slot.slotId), tx);
        const created: ModelData = {
          caseId: id,
          revision: 1,
          accountRef: attempt.binding.accountRef,
          bindingRef: ref('ProviderBinding', attempt.binding),
          bindingGeneration: attempt.binding.generation,
          securityGeneration: security.securityGeneration,
          parentRef: unresolved[0]?.caseRef ?? null,
          method: 'SAVED_CODE',
          reason: 'password 확인 뒤 사전 코드 복구 준비',
          createdAt: this.now().toISOString(),
          deadlineAt: new Date(attempt.deadline).toISOString(),
          holdReason:
            this.registration === 'LOCAL_SYNTHETIC'
              ? 'AWAITING_UNUSED_CODE'
              : 'REAL_ACTIVATION_UNVERIFIED',
          verificationRef: null,
          partyContextRef: null,
          enrollmentAuthorityRef: null,
          originalOperationRefs: unresolved.flatMap((slot) =>
            slot.originalOperationRef ? [slot.originalOperationRef] : [],
          ),
          noticeRef: null,
          epoch: await this.store.currentEpoch(),
          state: this.registration === 'LOCAL_SYNTHETIC' ? 'REQUESTED' : 'HOLD',
          previousBindingRef: null,
          previousSecurityGeneration: null,
          originalBindingRefs: [],
          originalFactorRefs: [],
          originalCodeSetRefs: [],
          originalSessionRefs: [],
        };
        await tx.put('RecoveryCase', created);
      });
      const prepared = await this.authorization.lookup('RecoveryCase', id);
      requireCondition(
        prepared &&
          (prepared.accountRef as Ref).id === (attempt.binding.accountRef as Ref).id &&
          prepared.method === 'SAVED_CODE',
        503,
        'SAVED_CASE_NOT_PROTECTED',
        '원래 직접 복구 준비의 보호가 필요합니다.',
      );
      attempt.recoveryCaseRef = ref('RecoveryCase', prepared);
      return attempt.recoveryCaseRef;
    });
  }
  async consume(
    host: IdentityInternal,
    caseRef: Ref,
    challengeId: string,
    setId: string,
    code: string,
    network: string,
    ingressProof: unknown = null,
  ): Promise<{ outcome: unknown; handle: string }> {
    requireCondition(
      host.store === this.store,
      503,
      'SAVED_CODE_STORE',
      '현재 신원 서비스와 같은 보호 원본이 필요합니다.',
    );
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/RecoveryCase',
      caseRef,
    );
    this.store.schema.validate('Id', challengeId);
    this.store.schema.validate('Id', setId);
    requireCondition(
      /^[a-f0-9]{32}$/.test(code),
      401,
      'RECOVERY_DENIED',
      '현재 사전 복구 코드를 확인하세요.',
    );
    requireCondition(
      this.registration === 'LOCAL_SYNTHETIC' &&
        host.runtime.synthetic &&
        host.provider.kind === 'SYNTHETIC',
      503,
      'REAL_ACTIVATION_UNVERIFIED',
      '실제 제공자/신원 복구 준비 미확인은 보류합니다.',
    );
    const browser = IdentityBrowser.current(false),
      source = await this.authorization.lookup('RecoveryCase', caseRef.id);
    requireCondition(source, 404, 'NOT_FOUND', '원래 직접 복구 진행을 확인하세요.');
    const binding = await this.store.readRevision(
      'ProviderBinding',
      (source.previousBindingRef as Ref | null)?.id ?? (source.bindingRef as Ref).id,
      (source.previousBindingRef as Ref | null)?.revision ?? (source.bindingRef as Ref).revision,
    );
    requireCondition(
      binding,
      503,
      'SAVED_BINDING_ORIGINAL',
      '원래 직접 복구 연결의 보호가 필요합니다.',
    );
    const safe = {
        caseRef,
        challengeId,
        setId,
        responseDigest: createHmac('sha256', host.runtime.verifierKey)
          .update('oms-u2-saved-recovery:1\0')
          .update(JSON.stringify([caseRef, challengeId, setId, code, browser]))
          .digest('hex'),
      },
      principalId = 'password-attempt:' + challengeId,
      key = challengeId + ':consume-saved-recovery',
      target = { kind: 'RECORD', recordRef: caseRef };
    const existing = await this.store.list('RequestReceipt', {
      equals: {
        principalId,
        owner: 'IdentityRecovery',
        operation: 'verifySavedCodeRecovery',
        idempotencyKey: key,
        targetIdentity: target,
      },
      limit: 2,
    });
    if (existing[0]) {
      requireCondition(
        existing[0].requestFingerprint === fingerprint(safe),
        409,
        'IDEMPOTENCY_CONFLICT',
        '원래 직접 복구 요청 내용이 다릅니다.',
      );
      await host.ingress(existing[0].audience as 'CUSTOMER' | 'STAFF', ingressProof);
      return this.result(existing[0], browser);
    }
    return host.withAttempt(challengeId, async (attempt) => {
      await host.ingress(attempt.proof.audience, ingressProof);
      await host.limit((attempt.binding.accountRef as Ref).id, network);
      requireCondition(
        attempt.recoveryCaseRef?.id === caseRef.id &&
          attempt.recoveryCaseRef.revision === caseRef.revision &&
          source.method === 'SAVED_CODE' &&
          source.state === 'REQUESTED' &&
          source.revision === caseRef.revision &&
          (source.accountRef as Ref).id === (attempt.binding.accountRef as Ref).id,
        403,
        'SAVED_PASSWORD_CONTEXT',
        '실제 password challenge에 결합한 원래 직접 복구가 필요합니다.',
      );
      const handle = generatePurposeSecret('ENROLLMENT_HANDLE'),
        committed = await this.store.execute(
          {
            principalId,
            audience: attempt.proof.audience,
            owner: 'IdentityRecovery',
            operation: 'verifySavedCodeRecovery',
            target,
            idempotencyKey: key,
            input: safe,
            correlationId: challengeId,
            epoch: await this.store.currentEpoch(),
          },
          async (tx, requestId) => {
            await host.checkAttemptCurrent(attempt, tx);
            const current = await this.authorization.lookup('RecoveryCase', caseRef.id, tx);
            requireCondition(
              current?.revision === caseRef.revision &&
                current.state === 'REQUESTED' &&
                current.securityGeneration === source.securityGeneration &&
                this.now().getTime() < Date.parse(String(current.deadlineAt)),
              409,
              'SAVED_CASE_CHANGED',
              '현재 원래 직접 복구 개정/기한이 필요합니다.',
            );
            const selected = await this.authorization.lookup('RecoveryCodeSet', setId, tx),
              currentBinding = await this.authorization.lookup(
                'ProviderBinding',
                String(attempt.binding.bindingId),
                tx,
              );
            requireCondition(
              selected && currentBinding && savedCodeSetCurrent(selected, currentBinding),
              401,
              'RECOVERY_DENIED',
              '현재 확인된 코드 집합/연결이 필요합니다.',
            );
            const consumed = host.codes.consume(
              selected.verifiers as CodeVerifier[],
              host.codes.digest(
                (currentBinding.accountRef as Ref).id,
                Number(currentBinding.generation),
                setId,
                code,
              ),
            );
            const states = await tx.list(
              'AccountSecurityState',
              { accountRef: { id: (currentBinding.accountRef as Ref).id } },
              2,
            );
            requireCondition(
              states.length === 1,
              503,
              'CURRENT_SECURITY_REQUIRED',
              '현재 단일 보안 세대가 필요합니다.',
            );
            const security = await this.authorization.lookup(
              'AccountSecurityState',
              String(states[0]!.securityStateId),
              tx,
            );
            requireCondition(
              security && security.securityGeneration === current.securityGeneration,
              409,
              'SAVED_SECURITY_CHANGED',
              '원래 직접 복구 보안 세대가 변경됐습니다.',
            );
            const codeSecurity = await this.authorization.lookup(
              'RecoveryCodeSecurityState',
              u2CodeSecurityStateId(setId),
              tx,
            );
            requireCondition(
              codeSecurity &&
                (codeSecurity.codeSetRef as Ref).id === setId &&
                (codeSecurity.codeSetRef as Ref).revision === selected.revision &&
                (codeSecurity.bindingRef as Ref).id === currentBinding.bindingId &&
                (codeSecurity.securityStateRef as Ref).id === security.securityStateId &&
                codeSecurity.securityGeneration === security.securityGeneration &&
                codeSecurity.epoch === (await this.store.currentEpoch()),
              401,
              'CODE_SECURITY_GENERATION',
              '현재 보호된 코드 집합/보안 세대의 명시 매핑이 필요합니다.',
            );
            const nextBinding: ModelData = {
                ...currentBinding,
                authRevision: Number(currentBinding.authRevision) + 1,
                removalState: 'UNKNOWN',
                revision: Number(currentBinding.revision) + 1,
              },
              nextSecurity = {
                ...security,
                securityGeneration: Number(security.securityGeneration) + 1,
                revision: Number(security.revision) + 1,
              },
              at = this.now(),
              claimId = randomUUID(),
              authorityId = randomUUID(),
              partyId = randomUUID();
            const slots = await tx.list(
              'IdentityExecutionSlot',
              { accountRef: { id: (currentBinding.accountRef as Ref).id } },
              100,
            );
            requireCondition(
              slots.length < 100,
              503,
              'RECOVERY_SLOT_SCAN_LIMIT',
              '유한 원래 실행 slot 대조가 필요합니다.',
            );
            const unresolved = slots.filter((slot) =>
              ['ACTIVE', 'UNKNOWN'].includes(String(slot.state)),
            );
            for (const slot of unresolved)
              await this.authorization.lookup('IdentityExecutionSlot', String(slot.slotId), tx);
            const held =
              unresolved.length > 0 || (current.originalOperationRefs as Ref[]).length > 0;
            const authorityRef: Ref = {
                owner: 'IdentityRecovery',
                entity: 'EnrollmentAuthority',
                id: authorityId,
                revision: 1,
              },
              partyRef: Ref = {
                owner: 'IdentityRecovery',
                entity: 'PartyClaimContext',
                id: partyId,
                revision: 1,
              },
              claimRef: Ref = {
                owner: 'IdentityRecovery',
                entity: 'ClaimReceipt',
                id: claimId,
                revision: 1,
              };
            const nextCase: ModelData = {
              ...current,
              bindingRef: ref('ProviderBinding', nextBinding),
              previousBindingRef: ref('ProviderBinding', currentBinding),
              previousSecurityGeneration: current.securityGeneration,
              securityGeneration: nextSecurity.securityGeneration,
              state: held ? 'HOLD' : 'ENROLMENT_ONLY',
              holdReason: held ? 'ORIGINAL_EFFECT_UNCONFIRMED' : 'RESOLVED',
              partyContextRef: partyRef,
              enrollmentAuthorityRef: authorityRef,
              revision: Number(current.revision) + 1,
            };
            const sets = await tx.list(
              'RecoveryCodeSet',
              { accountRef: { id: (currentBinding.accountRef as Ref).id }, invalidated: false },
              100,
            );
            requireCondition(
              sets.length < 100,
              503,
              'RECOVERY_CODE_SCAN_LIMIT',
              '유한 현재 코드 집합 대조가 필요합니다.',
            );
            for (const set of sets) {
              await this.authorization.lookup('RecoveryCodeSet', String(set.setId), tx);
              await tx.put(
                'RecoveryCodeSet',
                {
                  ...set,
                  verifiers: set.setId === setId ? consumed : set.verifiers,
                  invalidated: true,
                  revision: Number(set.revision) + 1,
                },
                Number(set.revision),
              );
            }
            nextCase.originalCodeSetRefs = sets.map((set) => ref('RecoveryCodeSet', set));
            const party: ModelData = {
              partyContextId: partyId,
              revision: 1,
              accountRef: current.accountRef,
              caseRef: ref('RecoveryCase', nextCase),
              audience: attempt.proof.audience,
              challengeId,
              bindingRef: ref('ProviderBinding', nextBinding),
              bindingGeneration: nextBinding.generation,
              securityGeneration: nextSecurity.securityGeneration,
              keyVersion: this.verifier.keyVersion,
              issuedAt: at.toISOString(),
              expiresAt: new Date(at.getTime() + 300000).toISOString(),
              state: 'VERIFIED',
              verificationRef: null,
              epoch: current.epoch,
              secretVerifier: '',
              browserVerifier: '',
            };
            party.secretVerifier = this.verifier.digest(
              generatePurposeSecret('PARTY_CONTEXT'),
              partySecretBinding(party),
            );
            party.browserVerifier = this.verifier.digest(
              browser,
              partySecretBinding(party, 'PARTY_BROWSER'),
            );
            const authority: ModelData = {
              authorityId,
              revision: 1,
              accountRef: current.accountRef,
              bindingRef: ref('ProviderBinding', nextBinding),
              bindingGeneration: nextBinding.generation,
              securityGeneration: nextSecurity.securityGeneration,
              audience: attempt.proof.audience,
              purpose: 'MFA_REENROLMENT',
              sourceRef: ref('RecoveryCase', nextCase),
              invitationRef: null,
              contactVerificationRef: null,
              claimReceiptRef: claimRef,
              verificationRef: null,
              partyContextRef: partyRef,
              challengeId,
              handleVerifier: '',
              handleVaultRef: randomUUID(),
              keyVersion: this.verifier.keyVersion,
              issuedAt: at.toISOString(),
              expiresAt: party.expiresAt,
              state: held ? 'HOLD' : 'ACTIVE',
              epoch: current.epoch,
            };
            const codec = new EnrollmentAuthorities(
              this.store,
              this.verifier,
              this.now,
              async () => false,
            );
            authority.handleVerifier = this.verifier.digest(handle, codec.binding(authority));
            await this.vault.prepareEnrollmentHandle(Buffer.from(handle), this.binding(authority), {
              authorityRef: ref('RecoveryCodeSet', selected),
              targetRef: authorityRef,
              purpose: 'ENROLLMENT_HANDLE',
              operation: 'identity.saved-code.prepare-handle',
              epoch: String(current.epoch),
              deadlineAt: new Date(Math.min(at.getTime() + 10000, attempt.deadline)).toISOString(),
            });
            const bindingFences = await fenceOtherAccountBindings(
              this.authorization,
              tx,
              currentBinding,
            );
            nextCase.originalBindingRefs = bindingFences.originals;
            nextCase.originalFactorRefs = bindingFences.factors;
            await tx.put('ProviderBinding', nextBinding, Number(currentBinding.revision));
            await tx.put('AccountSecurityState', nextSecurity, Number(security.revision));
            await tx.put('PartyClaimContext', party);
            await tx.put('EnrollmentAuthority', authority);
            await tx.put('ClaimReceipt', {
              claimReceiptId: claimId,
              revision: 1,
              grantRef: null,
              caseRef: ref('RecoveryCase', nextCase),
              partyContextRef: partyRef,
              accountRef: current.accountRef,
              authorityRef,
              requestRef: ref('RequestReceipt', { requestId, revision: 1 }),
              consumedAt: at.toISOString(),
              epoch: current.epoch,
            });
            await tx.put('RecoveryCase', nextCase, Number(current.revision));
            if (!held)
              await tx.put('IdentityExecutionSlot', {
                slotId: randomUUID(),
                revision: 1,
                accountRef: current.accountRef,
                bindingRef: ref('ProviderBinding', nextBinding),
                caseRef: ref('RecoveryCase', nextCase),
                state: 'ACTIVE',
                originalOperationRef: null,
                deadlineAt: authority.expiresAt,
                epoch: current.epoch,
              });
            const resultRefs = [
                ...bindingFences.changed,
                ref('RecoveryCase', nextCase),
                claimRef,
                authorityRef,
                partyRef,
                ref('ProviderBinding', nextBinding),
                ref('AccountSecurityState', nextSecurity),
              ],
              history = {
                historyId: randomUUID(),
                owner: 'IdentityRecovery',
                actorAccountRef: current.accountRef,
                verifiedPersonRef: null,
                occurredAt: at.toISOString(),
                reason: 'password와 현재 미사용 사전 코드의 단회 직접 복구',
                beforeRef: caseRef,
                afterRef: ref('RecoveryCase', nextCase),
                evidenceRefs: attempt.proof.evidenceRefs,
                requestId,
                resultRefs,
                correctionOf: null,
                sourceRevision: nextCase.revision,
              };
            await tx.put('IdentityHistory', history);
            await tx.put('RequestReceipt', {
              requestId,
              principalId,
              audience: attempt.proof.audience,
              owner: 'IdentityRecovery',
              operation: 'verifySavedCodeRecovery',
              targetIdentity: target,
              requestFingerprint: fingerprint(safe),
              idempotencyKey: key,
              targetScope: null,
              requestState: held ? 'REVIEW_REQUIRED' : 'RESULT_RECORDED',
              resultRefs: [...resultRefs, ref('IdentityHistory', history)],
              acceptedAt: at.toISOString(),
              updatedAt: at.toISOString(),
              revision: 1,
              correlationId: challengeId,
            });
          },
        );
      const receipt = await this.store.read('RequestReceipt', committed.requestId);
      requireCondition(
        receipt,
        503,
        'SAVED_CODE_NOT_PROTECTED',
        '직접 복구 원래 결과의 보호가 필요합니다.',
      );
      return this.result(receipt, browser);
    });
  }
  private async result(
    receipt: ModelData,
    browser: string,
  ): Promise<{ outcome: unknown; handle: string }> {
    const claimRef = (receipt.resultRefs as Ref[]).find((row) => row.entity === 'ClaimReceipt');
    requireCondition(
      claimRef,
      503,
      'SAVED_CLAIM_REQUIRED',
      '원래 직접 복구 claim의 보호가 필요합니다.',
    );
    const claim = await this.authorization.lookup('ClaimReceipt', claimRef.id),
      authority =
        claim &&
        (await this.authorization.lookup('EnrollmentAuthority', (claim.authorityRef as Ref).id)),
      party =
        claim &&
        (await this.authorization.lookup('PartyClaimContext', (claim.partyContextRef as Ref).id));
    requireCondition(
      claim &&
        authority &&
        party &&
        (claim.requestRef as Ref).id === receipt.requestId &&
        authority.epoch === (await this.store.currentEpoch()) &&
        ['ACTIVE', 'HOLD'].includes(String(authority.state)) &&
        this.now().getTime() < Date.parse(String(authority.expiresAt)) &&
        this.verifier.matches(
          browser,
          partySecretBinding(party, 'PARTY_BROWSER'),
          String(party.browserVerifier),
        ),
      401,
      'SAVED_RESULT_REQUIRED',
      '원래 password 접점의 남은 직접 복구 결과만 확인합니다.',
    );
    const check = async () => {
      const binding = await this.authorization.lookup(
          'ProviderBinding',
          (authority.bindingRef as Ref).id,
        ),
        states = await this.store.list('AccountSecurityState', {
          equals: { accountRef: { id: (authority.accountRef as Ref).id } },
          limit: 2,
        });
      requireCondition(
        binding?.active &&
          binding.revision === (authority.bindingRef as Ref).revision &&
          binding.generation === authority.bindingGeneration &&
          states.length === 1,
        401,
        'PURPOSE_SECURITY_CHANGED',
        '현재 직접 복구 신원 연결을 확인하세요.',
      );
      const security = await this.authorization.lookup(
          'AccountSecurityState',
          String(states[0]!.securityStateId),
        ),
        current = await this.authorization.lookup(
          'EnrollmentAuthority',
          String(authority.authorityId),
        );
      requireCondition(
        security?.securityGeneration === authority.securityGeneration &&
          current &&
          current.revision === authority.revision &&
          ['ACTIVE', 'HOLD'].includes(String(current.state)) &&
          this.now().getTime() < Date.parse(String(current.expiresAt)),
        401,
        'PURPOSE_SECURITY_CHANGED',
        '현재 직접 복구 제한 권위를 확인하세요.',
      );
    };
    await check();
    const binding = this.binding(authority),
      bytes = await this.vault.read(binding, {
        authorityRef: binding.targetRef,
        targetRef: binding.targetRef,
        purpose: 'ENROLLMENT_HANDLE',
        operation: 'identity.enrollment.handle',
        epoch: String(authority.epoch),
        deadlineAt: new Date(
          Math.min(this.now().getTime() + 10000, Date.parse(String(authority.expiresAt))),
        ).toISOString(),
      });
    await check();
    return {
      handle: bytes.toString(),
      outcome: this.store.schema.validateUri(
        'urn:oms:contract:u2-access-additions:1#/$defs/LimitedOutcome',
        {
          claimReceiptRef: claimRef,
          authorityRef: ref('EnrollmentAuthority', authority),
          purpose: 'MFA_REENROLMENT',
          expiresAt: authority.expiresAt,
          phase: 'ENROLMENT_ONLY',
        },
      ),
    };
  }
}
