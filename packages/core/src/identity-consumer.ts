import { randomUUID } from 'node:crypto';
import { canonicalJson, ExecutionBudget, fingerprint, requireCondition } from '@oms/contracts';
import type { CommandMeta, Ref, Receipt, ServiceContext } from '@oms/contracts';
import type {
  ModelData,
  ProtectedStore,
  ProtectedTransaction,
  WriteRequest,
} from '@oms/persistence';
import { PurposeSecretVault } from '@oms/persistence';
import type { VaultBinding, VaultPermit } from '@oms/persistence';
import { PurposeVerifier } from './purpose-verifier.js';
import { Authorization } from './authorization.js';
import { EnrollmentAuthorities } from './enrollment-authority.js';
import { runU2AccessCommand } from './enterprise-memberships.js';
import { enqueueU2Work, U2_WORK_OPERATIONS } from './identity-work.js';
import { identityResultDigest } from './recovery-completion.js';
import type {
  RecoveryProviderPort,
  RecoveryProviderOperation,
  RecoveryProviderTarget,
  RecoveryProviderObservation,
} from './identity-provider.js';
import { ref } from './references.js';
import { rejectSecretEcho } from './recovery-handoff.js';

const C21_OPERATIONS = Object.freeze({
  'IdentityRecovery.removeOriginalFactor': 'REMOVE_ORIGINAL_FACTOR',
  'IdentityRecovery.signOutOriginalSessions': 'SIGN_OUT_ORIGINAL_SESSIONS',
  'IdentityRecovery.replaceFirstFactor': 'REPLACE_FIRST_FACTOR',
} as const);
// An SDK that ignores cancellation must not hold the worker lane indefinitely.
// Cancellation is uncertainty, never proof that the remote mutation stopped.
export async function boundedIdentityCall<T>(
  budget: ExecutionBudget,
  operation: () => Promise<T>,
): Promise<T> {
  budget.check();
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      try {
        budget.check();
      } catch (error) {
        reject(error);
      }
    };
    budget.signal.addEventListener('abort', abort, { once: true });
    if (budget.signal.aborted) abort();
  });
  try {
    return await Promise.race([budget.run(operation), cancelled]);
  } finally {
    budget.signal.removeEventListener('abort', abort);
  }
}
export function identitySubjectKey(issuer: string, subject: string): string {
  return 'c21-subject-' + fingerprint({ issuer, subject });
}
export function identityProviderCircuitKey(issuer: string): string {
  return 'c21-provider-' + fingerprint({ issuer });
}
export function identityObservationMatches(
  target: RecoveryProviderTarget,
  result: RecoveryProviderObservation,
  operation: RecoveryProviderOperation,
): boolean {
  const expected =
    operation === 'REMOVE_ORIGINAL_FACTOR'
      ? 'REMOVED'
      : operation === 'SIGN_OUT_ORIGINAL_SESSIONS'
        ? 'SIGNED_OUT'
        : operation === 'REPLACE_FIRST_FACTOR'
          ? 'PASSWORD_REPLACED'
          : 'FACTOR_VERIFIED';
  return (
    result.approvedOperationId === target.approvedOperationId &&
    result.workId === target.workId &&
    canonicalJson(result.bindingRef) === canonicalJson(target.bindingRef) &&
    result.inputDigest === target.inputDigest &&
    result.epoch === target.epoch &&
    (result.knowledge !== 'KNOWN' ||
      (result.terminal === true &&
        [expected, 'ISOLATED'].includes(result.effect) &&
        result.providerRequestId.length > 0 &&
        result.evidenceRefs.length > 0))
  );
}
export class IdentityConsumer {
  readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    private readonly provider: RecoveryProviderPort,
    private readonly authorities: EnrollmentAuthorities,
    private readonly now: () => Date,
    synthetic: boolean,
    private readonly vault?: PurposeSecretVault,
    private readonly verifier?: PurposeVerifier,
  ) {
    requireCondition(
      authorities.store === store &&
        (!['LOCAL_SYNTHETIC', 'LOCAL_SDK_DOUBLE'].includes(provider.capabilities.profile) ||
          synthetic),
      503,
      'IDENTITY_PROVIDER_REGISTRATION',
      '현재 보호 원본/명시 local provider 경계가 필요합니다.',
    );
    this.authorization = new Authorization(store, now);
  }
  private supported(): boolean {
    const caps = this.provider.capabilities;
    return (
      caps.profile === 'LOCAL_SYNTHETIC' &&
      caps.originalTermination &&
      caps.sdkMaxAttempts === 1 &&
      caps.subjectMutationLimit === 1 &&
      caps.realActivation === false &&
      Object.values(C21_OPERATIONS).every((operation) => caps.operations.includes(operation))
    );
  }
  async assertPrepared(work: ModelData, tx?: ProtectedTransaction): Promise<void> {
    const current = await this.authorization.lookup('WorkItem', String(work.workId), tx);
    requireCondition(
      current &&
        canonicalJson(current) === canonicalJson(work) &&
        current.state === 'PENDING' &&
        current.attempt === 0,
      409,
      'IDENTITY_ORIGINAL_PENDING',
      '현재 원래 단회 작업 준비 개정만 발행합니다.',
    );
    await this.current(current, tx);
  }
  private async workerChange(
    request: WriteRequest,
    apply: (tx: ProtectedTransaction, requestId: string) => Promise<void>,
  ) {
    return this.store.execute(request, async (tx, requestId) => {
      await apply(tx, requestId);
      const id = (request.target as { workId: string }).workId,
        intent = await tx.get('IdentityOperationResult', id),
        source = intent && (await tx.get('RecoveryCase', (intent.caseRef as Ref).id));
      requireCondition(
        source,
        503,
        'IDENTITY_HISTORY_SOURCE',
        '원래 identity operation의 보호 case 이력 관계가 필요합니다.',
      );
      const refs = tx.rows().map((row) => ref(row.model, row.data)),
        at = this.now().toISOString();
      await tx.put('RequestReceipt', {
        requestId,
        principalId: request.principalId,
        audience: request.audience,
        operation: request.operation,
        targetIdentity: { kind: 'RECORD', recordRef: ref('RecoveryCase', source) },
        requestFingerprint: fingerprint(request.input),
        idempotencyKey: request.idempotencyKey,
        owner: 'IdentityRecovery',
        targetScope: null,
        requestState:
          source.state === 'HOLD'
            ? 'REVIEW_REQUIRED'
            : request.operation === 'claimOriginalIdentityMutation'
              ? 'ACCEPTED'
              : 'RESULT_RECORDED',
        resultRefs: refs,
        acceptedAt: at,
        updatedAt: at,
        revision: 1,
        correlationId: request.correlationId,
      });
      if (!tx.rows().some((row) => row.model === 'IdentityHistory'))
        await tx.put('IdentityHistory', {
          historyId: randomUUID(),
          owner: 'IdentityRecovery',
          actorAccountRef: source.accountRef,
          verifiedPersonRef: null,
          occurredAt: at,
          reason: '원래 C21 단회 작업/결과의 보호 기록',
          beforeRef: ref('RecoveryCase', source),
          afterRef: refs[0] ?? null,
          evidenceRefs: [],
          requestId,
          resultRefs: refs,
          correctionOf: null,
          sourceRevision: source.revision,
        });
    });
  }
  private passwordBinding(authority: ModelData, id: string, expiresAt: string): VaultBinding {
    return {
      id,
      purpose: 'FIRST_FACTOR',
      targetRef: ref('EnrollmentAuthority', { ...authority, revision: 1 }),
      accountRef: authority.accountRef as Ref,
      audience: authority.audience as 'CUSTOMER' | 'STAFF',
      bindingGeneration: Number(authority.bindingGeneration),
      sourceRevision: 1,
      expiresAt,
      keyVersion: this.vault!.keyVersion,
    };
  }
  private passwordPermit(authority: ModelData, destruction = false): VaultPermit {
    return {
      authorityRef: ref('EnrollmentAuthority', { ...authority, revision: 1 }),
      targetRef: ref('EnrollmentAuthority', { ...authority, revision: 1 }),
      purpose: 'FIRST_FACTOR',
      operation: 'identity.first-factor.replace',
      epoch: String(authority.epoch),
      deadlineAt: new Date(
        destruction
          ? this.now().getTime() + 5000
          : Math.min(this.now().getTime() + 5000, Date.parse(String(authority.expiresAt))),
      ).toISOString(),
    };
  }
  async prepareFirstFactor(
    context: ServiceContext,
    input: { meta: CommandMeta; caseRef: Ref; password: string },
  ): Promise<Receipt> {
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/PasswordReplacementInput',
      input,
    );
    rejectSecretEcho({ meta: input.meta, caseRef: input.caseRef }, [input.password]);
    requireCondition(
      this.vault && this.verifier && this.supported(),
      503,
      'FIRST_FACTOR_HOLD',
      '현재 exact provider/vault/capability 등록이 필요합니다.',
    );
    requireCondition(
      input.password.length <= 256 && /^\S+$/.test(input.password),
      400,
      'RECOVERY_PASSWORD_FORMAT',
      '제공자 허용 범위의 새 첫 수단을 입력하세요.',
    );
    const original = await this.store.readRevision(
      'RecoveryCase',
      input.caseRef.id,
      input.caseRef.revision,
    );
    requireCondition(original, 404, 'NOT_FOUND', '원래 case를 확인하세요.');
    const id =
        'c21-password-' +
        fingerprint({ caseId: input.caseRef.id, requestId: input.meta.clientRequestId }),
      bytes = Buffer.from(input.password, 'utf8'),
      digest = this.verifier.inputDigest(
        'C21_REPLACE_FIRST_FACTOR',
        {
          caseRef: input.caseRef,
          bindingRef: original.bindingRef,
          operationId: id,
          securityGeneration: original.securityGeneration,
          epoch: original.epoch,
        },
        bytes,
      ),
      safe = { meta: input.meta, caseRef: input.caseRef, inputDigest: digest };
    let source: ModelData, authority: ModelData;
    const guard = async (tx?: ProtectedTransaction) => {
      await this.authorities.assert(context, 'MFA_REENROLMENT', tx);
    };
    const authorize = async (tx?: ProtectedTransaction) => {
      authority = await this.authorities.assert(context, 'MFA_REENROLMENT', tx);
      source = (await this.authorization.lookup('RecoveryCase', input.caseRef.id, tx))!;
      requireCondition(
        source &&
          source.revision === input.caseRef.revision &&
          source.revision === input.meta.expectedRevision &&
          source.state === 'ENROLMENT_ONLY' &&
          ['MANUAL', 'EMERGENCY'].includes(String(source.method)) &&
          (source.enrollmentAuthorityRef as Ref).id === authority.authorityId &&
          (source.originalOperationRefs as Ref[]).length >= 2,
        409,
        'FIRST_FACTOR_SOURCE',
        '현재 원래 확인 당사자/제한 단계가 필요합니다.',
      );
      for (const selected of source.originalOperationRefs as Ref[]) {
        const work = await this.authorization.lookup('WorkItem', selected.id, tx);
        requireCondition(
          work?.state === 'RESULT_RECORDED' &&
            [
              'IdentityRecovery.removeOriginalFactor',
              'IdentityRecovery.signOutOriginalSessions',
            ].includes(String(work.operationId)),
          409,
          'FIRST_FACTOR_ORIGINAL_EFFECTS',
          '원래 제거/signout 종료 이후 새 첫 수단을 입력하세요.',
        );
      }
      const slots =
        (await tx?.list(
          'IdentityExecutionSlot',
          { accountRef: { id: context.principalId }, state: 'ACTIVE' },
          2,
        )) ??
        (await this.store.list('IdentityExecutionSlot', {
          equals: { accountRef: { id: context.principalId }, state: 'ACTIVE' },
          limit: 2,
        }));
      requireCondition(
        slots.length === 1 && (slots[0]!.caseRef as Ref).id === source.caseId,
        409,
        'RECOVERY_EFFECT_UNKNOWN',
        '원래 단일 실행 경계를 대조하세요.',
      );
    };
    try {
      return await runU2AccessCommand(
        this,
        context,
        'replaceFirstFactor',
        { kind: 'RECORD', recordRef: input.caseRef },
        safe,
        authorize,
        async (tx, requestId) => {
          const deadline = new Date(
              Math.min(this.now().getTime() + 30000, Date.parse(String(authority.expiresAt))),
            ).toISOString(),
            next = {
              ...source,
              originalOperationRefs: [
                ...(source.originalOperationRefs as Ref[]),
                { owner: 'U1Host', entity: 'WorkItem', id, revision: 1 },
              ],
              revision: Number(source.revision) + 1,
            };
          await this.vault!.create(
            bytes,
            this.passwordBinding(authority, id, deadline),
            this.passwordPermit(authority),
          );
          await enqueueU2Work(
            tx,
            context,
            requestId,
            'IdentityRecovery.replaceFirstFactor',
            ref('RecoveryCase', next),
            String(source.epoch),
            this.now(),
            deadline,
            id,
          );
          await tx.put('IdentityOperationResult', {
            operationResultId: id,
            revision: 1,
            caseRef: ref('RecoveryCase', next),
            bindingRef: source.bindingRef,
            operationId: id,
            inputDigest: digest,
            providerRequestId: 'UNCONFIRMED',
            knowledge: 'UNAVAILABLE',
            effect: 'UNCONFIRMED',
            evidenceRefs: [],
            terminal: false,
            observedAt: this.now().toISOString(),
            epoch: source.epoch,
          });
          await tx.put('RecoveryCase', next, Number(source.revision));
          return {
            target: ref('RecoveryCase', next),
            refs: [
              ref('RecoveryCase', next),
              { owner: 'U1Host', entity: 'WorkItem', id, revision: 1 },
            ],
            scope: null,
            state: 'ACCEPTED',
            before: ref('RecoveryCase', source),
          };
        },
        this.now,
        guard,
        'IdentityRecovery',
      );
    } finally {
      bytes.fill(0);
    }
  }
  async prepare(
    context: ServiceContext,
    input: { meta: CommandMeta; caseRef: Ref },
  ): Promise<Receipt> {
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/CommandMeta',
      input.meta,
    );
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/RecoveryCase',
      input.caseRef,
    );
    let source: ModelData, authority: ModelData;
    const authorize = async (tx?: ProtectedTransaction) => {
      authority = await this.authorities.assert(context, 'MFA_REENROLMENT', tx);
      source = (await this.authorization.lookup('RecoveryCase', input.caseRef.id, tx))!;
      requireCondition(
        source &&
          source.revision === input.caseRef.revision &&
          source.revision === input.meta.expectedRevision &&
          source.state === 'ENROLMENT_ONLY' &&
          (source.accountRef as Ref).id === context.principalId &&
          (source.enrollmentAuthorityRef as Ref).id === authority.authorityId &&
          (source.originalOperationRefs as Ref[]).length === 0,
        409,
        'IDENTITY_WORK_PREPARATION',
        '현재 원래 당사자/새 단일 실행 준비가 필요합니다.',
      );
    };
    return runU2AccessCommand(
      this,
      context,
      'prepareRecoveryProviderWork',
      { kind: 'RECORD', recordRef: input.caseRef },
      input,
      authorize,
      async (tx, requestId) => {
        if (!this.supported()) {
          const held = {
              ...source,
              state: 'HOLD',
              holdReason: 'PROVIDER_ORIGINAL_TERMINATION_UNREGISTERED',
              revision: Number(source.revision) + 1,
            },
            limited = { ...authority, state: 'HOLD', revision: Number(authority.revision) + 1 };
          await tx.put('RecoveryCase', held, Number(source.revision));
          await tx.put('EnrollmentAuthority', limited, Number(authority.revision));
          return {
            target: ref('RecoveryCase', held),
            refs: [ref('RecoveryCase', held), ref('EnrollmentAuthority', limited)],
            scope: null,
            state: 'REVIEW_REQUIRED',
            before: ref('RecoveryCase', source),
          };
        }
        const bindings = source.originalBindingRefs as Ref[];
        requireCondition(
          bindings.length >= 1 && bindings.length <= 2,
          503,
          'IDENTITY_ORIGINAL_BINDINGS',
          '계정의 모든 원래 연결을 대조해야 합니다.',
        );
        const planned = bindings.flatMap((bindingRef) =>
            (
              [
                'IdentityRecovery.removeOriginalFactor',
                'IdentityRecovery.signOutOriginalSessions',
              ] as const
            ).map((operation) => ({
              bindingRef,
              operation: operation as keyof typeof C21_OPERATIONS,
              id: randomUUID(),
            })),
          ),
          next: ModelData = {
            ...source,
            originalOperationRefs: planned.map((item) => ({
              owner: 'U1Host',
              entity: 'WorkItem',
              id: item.id,
              revision: 1,
            })),
            revision: Number(source.revision) + 1,
          };
        for (const item of planned) {
          const binding = await this.store.readRevision(
            'ProviderBinding',
            item.bindingRef.id,
            item.bindingRef.revision,
          );
          requireCondition(
            binding && (binding.accountRef as Ref).id === context.principalId,
            403,
            'IDENTITY_ORIGINAL_BINDINGS',
            '원래 계정/주체의 보호 snapshot이 필요합니다.',
          );
          await enqueueU2Work(
            tx,
            context,
            requestId,
            item.operation,
            ref('RecoveryCase', next),
            String(source.epoch),
            this.now(),
            String(authority.expiresAt),
            item.id,
          );
          await tx.put('IdentityOperationResult', {
            operationResultId: item.id,
            revision: 1,
            caseRef: ref('RecoveryCase', next),
            bindingRef: item.bindingRef,
            operationId: item.id,
            inputDigest: identityResultDigest(next, item.bindingRef, item.id),
            providerRequestId: 'UNCONFIRMED',
            knowledge: 'UNAVAILABLE',
            effect: 'UNCONFIRMED',
            evidenceRefs: [],
            terminal: false,
            observedAt: this.now().toISOString(),
            epoch: source.epoch,
          });
        }
        await tx.put('RecoveryCase', next, Number(source.revision));
        return {
          target: ref('RecoveryCase', next),
          refs: [ref('RecoveryCase', next), ...(next.originalOperationRefs as Ref[])],
          scope: null,
          state: 'ACCEPTED',
          before: ref('RecoveryCase', source),
        };
      },
      this.now,
      async (tx) => {
        await this.authorities.assert(context, 'MFA_REENROLMENT', tx, true, true);
      },
      'IdentityRecovery',
    );
  }
  private async current(
    work: ModelData,
    tx?: ProtectedTransaction,
  ): Promise<{
    source: ModelData;
    authority: ModelData;
    intent: ModelData;
    binding: ModelData;
    target: RecoveryProviderTarget;
  }> {
    requireCondition(
      this.supported() &&
        Object.hasOwn(C21_OPERATIONS, String(work.operationId)) &&
        work.owner === 'IdentityRecovery' &&
        work.epoch === (await this.store.currentEpoch()),
      503,
      'IDENTITY_PROVIDER_HOLD',
      '현재 원래 provider/operation/epoch의 실제 local 지원이 필요합니다.',
    );
    const source = (await this.authorization.lookup(
        'RecoveryCase',
        (work.targetRef as Ref).id,
        tx,
      ))!,
      authority =
        source &&
        (await this.authorization.lookup(
          'EnrollmentAuthority',
          (source.enrollmentAuthorityRef as Ref).id,
          tx,
        )),
      intent = await this.authorization.lookup('IdentityOperationResult', String(work.workId), tx),
      permitRef = work.executionPermitRef as Ref,
      permit = await this.authorization.lookup('ExecutionPermit', permitRef.id, tx),
      factRef = work.sourceFactRef as Ref,
      fact = await this.authorization.lookup('FactEnvelope', factRef.id, tx);
    requireCondition(
      source &&
        source.revision === work.expectedRevision &&
        source.state === 'ENROLMENT_ONLY' &&
        authority?.state === 'ACTIVE' &&
        (authority.sourceRef as Ref).id === source.caseId &&
        authority.epoch === work.epoch &&
        authority.securityGeneration === source.securityGeneration &&
        intent &&
        (intent.caseRef as Ref).id === source.caseId &&
        intent.operationId === work.workId &&
        intent.epoch === work.epoch &&
        Date.parse(String(work.notBefore)) <= this.now().getTime() &&
        this.now().getTime() < Date.parse(String(work.deadlineAt)) &&
        this.now().getTime() < Date.parse(String(authority.expiresAt)),
      409,
      'IDENTITY_CURRENT_WORK',
      '현재 원래 case/제한 authority/intent/기한을 대조하세요.',
    );
    const descriptor = U2_WORK_OPERATIONS[work.operationId as keyof typeof U2_WORK_OPERATIONS];
    requireCondition(
      permitRef.owner === 'EnterpriseAccess' &&
        permitRef.entity === 'ExecutionPermit' &&
        permit?.revision === permitRef.revision &&
        permit.allowed &&
        permit.workId === work.workId &&
        permit.consumer === descriptor.consumer &&
        permit.principalId === 'u2-worker-identity' &&
        permit.audience === 'SYSTEM' &&
        permit.action === descriptor.action &&
        permit.owner === work.owner &&
        permit.operationId === work.operationId &&
        permit.epoch === work.epoch &&
        permit.deadlineAt === work.deadlineAt &&
        canonicalJson(permit.sourceFactRef) === canonicalJson(work.sourceFactRef) &&
        factRef.owner === 'U1Host' &&
        factRef.entity === 'FactEnvelope' &&
        fact &&
        canonicalJson(ref('FactEnvelope', fact)) === canonicalJson(factRef) &&
        fact.aggregateVersion === work.expectedRevision &&
        canonicalJson(fact?.aggregateRef) === canonicalJson(work.targetRef) &&
        fact?.causationRequestId === work.requestId &&
        fact.correlationId === work.correlationId,
      403,
      'IDENTITY_EXECUTION_PERMIT',
      '등록된 exact operation/work/target/원래 사실/permit가 필요합니다.',
    );
    const account = await this.authorization.lookup('Account', (source.accountRef as Ref).id, tx),
      currentBinding = await this.authorization.lookup(
        'ProviderBinding',
        (source.bindingRef as Ref).id,
        tx,
      ),
      states = await this.store.list('AccountSecurityState', {
        equals: { accountRef: { id: (source.accountRef as Ref).id } },
        limit: 2,
      });
    requireCondition(
      account?.active &&
        currentBinding?.active &&
        canonicalJson(ref('ProviderBinding', currentBinding)) ===
          canonicalJson(source.bindingRef) &&
        states.length === 1,
      409,
      'IDENTITY_CURRENT_SECURITY',
      '현재 활성 계정/연결/보안 세대를 대조하세요.',
    );
    const security = await this.authorization.lookup(
      'AccountSecurityState',
      String(states[0]!.securityStateId),
      tx,
    );
    requireCondition(
      security?.securityGeneration === source.securityGeneration,
      409,
      'IDENTITY_CURRENT_SECURITY',
      '현재 보안 세대가 변경됐습니다.',
    );
    const bindingRef = intent.bindingRef as Ref,
      binding = await this.store.readRevision(
        'ProviderBinding',
        bindingRef.id,
        bindingRef.revision,
      );
    requireCondition(
      binding &&
        (work.operationId === 'IdentityRecovery.replaceFirstFactor'
          ? canonicalJson(source.bindingRef) === canonicalJson(bindingRef)
          : (source.originalBindingRefs as Ref[]).some(
              (value) => canonicalJson(value) === canonicalJson(bindingRef),
            )) &&
        (binding.accountRef as Ref).id === (source.accountRef as Ref).id &&
        (work.operationId === 'IdentityRecovery.replaceFirstFactor'
          ? /^[a-f0-9]{64}$/.test(String(intent.inputDigest))
          : intent.inputDigest === identityResultDigest(source, bindingRef, String(work.workId))),
      403,
      'IDENTITY_ORIGINAL_TARGET',
      '다른 subject/binding/input을 현재 원래 효과로 재해석하지 않습니다.',
    );
    const target: RecoveryProviderTarget = {
      approvedOperationId: String(work.workId),
      workId: String(work.workId),
      caseRef: work.targetRef as Ref,
      accountRef: source.accountRef as Ref,
      bindingRef,
      issuer: String(binding.issuer),
      subject: String(binding.subject),
      audience: binding.audience as 'CUSTOMER' | 'STAFF',
      bindingGeneration: Number(binding.generation),
      securityGeneration: Number(source.securityGeneration),
      epoch: String(work.epoch),
      inputDigest: String(intent.inputDigest),
      deadlineAt: String(work.deadlineAt),
    };
    return { source, authority, intent, binding, target };
  }
  async consume(workId: string): Promise<Ref> {
    let work = (await this.authorization.lookup('WorkItem', workId))!;
    requireCondition(work, 404, 'NOT_FOUND', '원래 작업이 없습니다.');
    if (work.state === 'RESULT_RECORDED') {
      const result = await this.authorization.lookup('IdentityOperationResult', workId);
      requireCondition(
        result?.knowledge === 'KNOWN' && result.terminal,
        503,
        'IDENTITY_RESULT_NOT_PROTECTED',
        '원래 현재 보호 결과가 필요합니다.',
      );
      return ref('IdentityOperationResult', result);
    }
    const initial = await this.current(work);
    requireCondition(
      work.state === 'PENDING' && work.attempt === 0,
      409,
      'IDENTITY_ORIGINAL_PENDING',
      '이미 시작한 원래 mutation은 다시 보내지 않습니다.',
    );
    const subjectId = identitySubjectKey(initial.target.issuer, initial.target.subject),
      token = randomUUID(),
      deadline = new Date(
        Math.min(this.now().getTime() + 5000, Date.parse(String(work.deadlineAt))),
      ).toISOString();
    let generation = 1;
    await this.workerChange(
      {
        principalId: 'u2-worker-identity',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'claimOriginalIdentityMutation',
        target: { workId },
        idempotencyKey: token,
        input: { workId, subjectId, inputDigest: initial.target.inputDigest },
        correlationId: String(work.correlationId),
        epoch: String(work.epoch),
      },
      async (tx) => {
        const raw = (await this.authorization.lookup('WorkItem', workId, tx))!;
        await this.current(raw, tx);
        const providerCircuit = await this.authorization.lookup(
          'EndpointCircuit',
          identityProviderCircuitKey(initial.target.issuer),
          tx,
        );
        requireCondition(
          !providerCircuit ||
            (providerCircuit.state === 'CLOSED' && providerCircuit.probeOwner === null),
          503,
          'IDENTITY_PROVIDER_CIRCUIT',
          '현재 접점의 등록된 부작용 없는 단일 검증 전에는 호출을 보류합니다.',
        );
        requireCondition(
          raw.state === 'PENDING' && raw.attempt === 0,
          409,
          'IDENTITY_ORIGINAL_PENDING',
          '원래 단회 mutation이 이미 시작됐습니다.',
        );
        const previous = await tx.get('EndpointCircuit', subjectId);
        if (previous) {
          await this.authorization.lookup('EndpointCircuit', subjectId, tx);
          requireCondition(
            previous.state === 'CLOSED' && previous.probeOwner === null,
            409,
            'IDENTITY_SUBJECT_BUSY',
            '같은 subject의 원래 mutation 종료/격리를 먼저 대조하세요.',
          );
          generation = Number(previous.probeGeneration) + 1;
        }
        const reservation = {
          endpointId: subjectId,
          state: 'CLOSED',
          failureCount: 0,
          windowStartedAt: this.now().toISOString(),
          openedAt: null,
          probeOwner: workId,
          probeDeadlineAt: deadline,
          probeToken: token,
          probeGeneration: generation,
          probeEpoch: work.epoch,
          revision: previous ? Number(previous.revision) + 1 : 1,
        };
        await tx.put(
          'EndpointCircuit',
          reservation,
          previous ? Number(previous.revision) : undefined,
        );
        await tx.put(
          'WorkItem',
          {
            ...raw,
            state: 'PROCESSING',
            attempt: 1,
            leaseOwner: token,
            leaseUntil: deadline,
            leaseGeneration: Number(raw.leaseGeneration) + 1,
            revision: Number(raw.revision) + 1,
          },
          Number(raw.revision),
        );
      },
    );
    work = (await this.authorization.lookup('WorkItem', workId))!;
    const captured = await this.current(work),
      operation = C21_OPERATIONS[work.operationId as keyof typeof C21_OPERATIONS];
    let observed: RecoveryProviderObservation;
    try {
      const budget = new ExecutionBudget(
        Math.max(1, Date.parse(deadline) - this.now().getTime()),
        () => this.now().getTime(),
      );
      observed = await boundedIdentityCall(budget, async () => {
        await this.current(work);
        const circuit = await this.authorization.lookup(
          'EndpointCircuit',
          identityProviderCircuitKey(captured.target.issuer),
        );
        requireCondition(
          !circuit || (circuit.state === 'CLOSED' && circuit.probeOwner === null),
          503,
          'IDENTITY_PROVIDER_CIRCUIT',
          '현재 접점 검증 전에는 호출하지 않습니다.',
        );
        let secret: Buffer | null = null;
        if (operation === 'REPLACE_FIRST_FACTOR') {
          requireCondition(
            this.vault,
            503,
            'FIRST_FACTOR_VAULT_REQUIRED',
            '원래 첫 수단 암호 자료가 필요합니다.',
          );
          secret = await this.vault.read(
            this.passwordBinding(captured.authority, workId, String(work.deadlineAt)),
            this.passwordPermit(captured.authority),
          );
        }
        try {
          return await this.provider.execute(
            operation,
            { ...captured.target, deadlineAt: deadline },
            secret,
            budget,
          );
        } finally {
          secret?.fill(0);
        }
      });
      await this.current(work);
      requireCondition(
        identityObservationMatches(captured.target, observed, operation) &&
          Number.isFinite(Date.parse(observed.observedAt)) &&
          Date.parse(observed.observedAt) >= Date.parse(String(captured.authority.issuedAt)) &&
          Date.parse(observed.observedAt) <= this.now().getTime() &&
          observed.evidenceRefs.length <= 20,
        503,
        'IDENTITY_ORIGINAL_RESULT',
        '원래 operation/target/input/epoch/관측시각 결과가 필요합니다.',
      );
    } catch {
      observed = {
        approvedOperationId: workId,
        workId,
        bindingRef: captured.target.bindingRef,
        inputDigest: captured.target.inputDigest,
        epoch: captured.target.epoch,
        providerRequestId: 'UNCONFIRMED',
        knowledge: 'UNKNOWN',
        effect: 'UNCONFIRMED',
        terminal: false,
        evidenceRefs: [],
        observedAt: this.now().toISOString(),
      };
    }
    const known = observed.knowledge === 'KNOWN' && observed.terminal === true;
    await this.workerChange(
      {
        principalId: 'u2-worker-identity',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'recordOriginalIdentityMutation',
        target: { workId },
        idempotencyKey: 'result-' + token,
        input: { workId, token, observed },
        correlationId: String(work.correlationId),
        epoch: String(work.epoch),
      },
      async (tx) => {
        const current = (await this.authorization.lookup('WorkItem', workId, tx))!,
          reservation = (await this.authorization.lookup('EndpointCircuit', subjectId, tx))!,
          intent = (await this.authorization.lookup('IdentityOperationResult', workId, tx))!;
        requireCondition(
          current.state === 'PROCESSING' &&
            current.attempt === 1 &&
            current.leaseOwner === token &&
            reservation.probeOwner === workId &&
            reservation.probeToken === token &&
            reservation.probeGeneration === generation &&
            reservation.probeEpoch === work.epoch &&
            intent.revision === 1 &&
            intent.inputDigest === captured.target.inputDigest,
          409,
          'IDENTITY_RESULT_FENCED',
          '원래 lease/token/intent 개정만 결과를 확정합니다.',
        );
        const result = {
          ...intent,
          knowledge: known ? 'KNOWN' : 'UNKNOWN',
          effect: known ? observed.effect : 'UNCONFIRMED',
          terminal: known,
          providerRequestId: observed.providerRequestId || 'UNCONFIRMED',
          evidenceRefs: observed.evidenceRefs,
          observedAt: observed.observedAt,
          revision: 2,
        };
        await tx.put('IdentityOperationResult', result, 1);
        await tx.put(
          'WorkItem',
          {
            ...current,
            state: known ? 'RESULT_RECORDED' : 'REVIEW_REQUIRED',
            leaseOwner: null,
            leaseUntil: null,
            revision: Number(current.revision) + 1,
          },
          Number(current.revision),
        );
        await tx.put(
          'EndpointCircuit',
          {
            ...reservation,
            state: known ? 'CLOSED' : 'REVIEW_REQUIRED',
            probeOwner: known ? null : workId,
            probeToken: known ? null : token,
            probeDeadlineAt: known ? null : reservation.probeDeadlineAt,
            revision: Number(reservation.revision) + 1,
          },
          Number(reservation.revision),
        );
        if (operation === 'REPLACE_FIRST_FACTOR')
          await tx.put('SecurityTombstone', {
            tombstoneId: randomUUID(),
            targetRef: ref('EnrollmentAuthority', { ...captured.authority, revision: 1 }),
            purpose: 'FIRST_FACTOR',
            destroyedAt: this.now().toISOString(),
            reason: 'ORIGINAL_FIRST_FACTOR_ATTEMPT_TERMINAL',
            epoch: work.epoch,
            revision: 1,
          });
        const endpointId = identityProviderCircuitKey(captured.target.issuer),
          circuit = await this.authorization.lookup('EndpointCircuit', endpointId, tx),
          within =
            !!circuit && this.now().getTime() - Date.parse(String(circuit.windowStartedAt)) < 30000,
          failures = known ? 0 : within ? Number(circuit!.failureCount) + 1 : 1,
          open = (!!circuit && circuit.state !== 'CLOSED') || failures >= 5;
        await tx.put(
          'EndpointCircuit',
          {
            endpointId,
            state: open ? 'OPEN' : 'CLOSED',
            failureCount: failures,
            windowStartedAt: within && !known ? circuit!.windowStartedAt : this.now().toISOString(),
            openedAt: open ? (circuit?.openedAt ?? this.now().toISOString()) : null,
            probeOwner: circuit?.probeOwner ?? null,
            probeDeadlineAt: circuit?.probeDeadlineAt ?? null,
            probeToken: circuit?.probeToken ?? null,
            probeGeneration: circuit?.probeGeneration ?? 1,
            probeEpoch: circuit?.probeEpoch ?? null,
            revision: Number(circuit?.revision ?? 0) + 1,
          },
          circuit ? Number(circuit.revision) : undefined,
        );
        if (!known) {
          const source = (await this.authorization.lookup(
              'RecoveryCase',
              captured.source.caseId as string,
              tx,
            ))!,
            authority = (await this.authorization.lookup(
              'EnrollmentAuthority',
              String(captured.authority.authorityId),
              tx,
            ))!,
            slots = await tx.list(
              'IdentityExecutionSlot',
              { accountRef: { id: (source.accountRef as Ref).id }, state: 'ACTIVE' },
              2,
            );
          requireCondition(
            slots.length === 1 && (slots[0]!.caseRef as Ref).id === source.caseId,
            503,
            'IDENTITY_SLOT_REQUIRED',
            '원래 단일 실행 slot을 대조하세요.',
          );
          await tx.put(
            'IdentityExecutionSlot',
            {
              ...slots[0]!,
              state: 'UNKNOWN',
              originalOperationRef: ref('WorkItem', current),
              revision: Number(slots[0]!.revision) + 1,
            },
            Number(slots[0]!.revision),
          );
          await tx.put(
            'RecoveryCase',
            {
              ...source,
              state: 'HOLD',
              holdReason: 'ORIGINAL_PROVIDER_MUTATION_UNKNOWN',
              revision: Number(source.revision) + 1,
            },
            Number(source.revision),
          );
          await tx.put(
            'EnrollmentAuthority',
            { ...authority, state: 'HOLD', revision: Number(authority.revision) + 1 },
            Number(authority.revision),
          );
        }
      },
    );
    if (operation === 'REPLACE_FIRST_FACTOR')
      await this.vault!.destroy(
        this.passwordBinding(captured.authority, workId, String(work.deadlineAt)),
        this.passwordPermit(captured.authority, true),
      );
    const result = (await this.authorization.lookup('IdentityOperationResult', workId))!;
    return ref('IdentityOperationResult', result);
  }
  async reobserve(workId: string): Promise<Ref> {
    requireCondition(
      this.supported(),
      503,
      'IDENTITY_PROVIDER_HOLD',
      '실제 원래 종료/격리 관측이 등록된 provider만 대조합니다.',
    );
    const work = (await this.authorization.lookup('WorkItem', workId))!,
      result = (await this.authorization.lookup('IdentityOperationResult', workId))!,
      intent = await this.store.readRevision('IdentityOperationResult', workId, 1);
    requireCondition(
      work &&
        Object.hasOwn(C21_OPERATIONS, String(work.operationId)) &&
        work.owner === 'IdentityRecovery' &&
        work.epoch === (await this.store.currentEpoch()) &&
        work.attempt === 1 &&
        result &&
        intent &&
        result.operationId === workId &&
        intent.inputDigest === result.inputDigest &&
        intent.epoch === work.epoch,
      409,
      'IDENTITY_ORIGINAL_OBSERVATION',
      '현재 원래 단회 intent/epoch를 대조하세요.',
    );
    if (result.knowledge === 'KNOWN' && result.terminal && work.state === 'RESULT_RECORDED')
      return ref('IdentityOperationResult', result);
    requireCondition(
      work.state === 'REVIEW_REQUIRED' && result.knowledge === 'UNKNOWN',
      409,
      'IDENTITY_ORIGINAL_OBSERVATION',
      '원래 불명 호출 결과만 재관측합니다.',
    );
    const source = await this.store.readRevision(
        'RecoveryCase',
        (intent.caseRef as Ref).id,
        (intent.caseRef as Ref).revision,
      ),
      binding = await this.store.readRevision(
        'ProviderBinding',
        (intent.bindingRef as Ref).id,
        (intent.bindingRef as Ref).revision,
      );
    requireCondition(
      source &&
        binding &&
        (work.targetRef as Ref).id === source.caseId &&
        (binding.accountRef as Ref).id === (source.accountRef as Ref).id,
      503,
      'IDENTITY_ORIGINAL_TARGET',
      '원래 계정/연결 snapshot이 필요합니다.',
    );
    const target: RecoveryProviderTarget = {
        approvedOperationId: workId,
        workId,
        caseRef: intent.caseRef as Ref,
        accountRef: source.accountRef as Ref,
        bindingRef: intent.bindingRef as Ref,
        issuer: String(binding.issuer),
        subject: String(binding.subject),
        audience: binding.audience as 'CUSTOMER' | 'STAFF',
        bindingGeneration: Number(binding.generation),
        securityGeneration: Number(source.securityGeneration),
        epoch: String(intent.epoch),
        inputDigest: String(intent.inputDigest),
        deadlineAt: String(work.deadlineAt),
      },
      subjectId = identitySubjectKey(target.issuer, target.subject),
      reservation = (await this.authorization.lookup('EndpointCircuit', subjectId))!;
    requireCondition(
      reservation?.state === 'REVIEW_REQUIRED' &&
        reservation.probeOwner === workId &&
        reservation.probeEpoch === work.epoch &&
        reservation.probeToken,
      409,
      'IDENTITY_ORIGINAL_RESERVATION',
      '원래 불명 subject 예약을 대조하세요.',
    );
    const budget = new ExecutionBudget(3000, () => this.now().getTime()),
      observed = await this.observeWithCircuit(target, budget),
      operation = C21_OPERATIONS[work.operationId as keyof typeof C21_OPERATIONS];
    requireCondition(
      identityObservationMatches(target, observed, operation),
      503,
      'IDENTITY_ORIGINAL_RESULT',
      '현재 probe가 아닌 원래 effect의 종료/격리 증거가 필요합니다.',
    );
    if (observed.knowledge !== 'KNOWN' || !observed.terminal)
      return ref('IdentityOperationResult', result);
    requireCondition(
      Number.isFinite(Date.parse(observed.observedAt)) &&
        Date.parse(observed.observedAt) <= this.now().getTime() &&
        observed.evidenceRefs.length <= 20,
      503,
      'IDENTITY_ORIGINAL_RESULT',
      '원래 제공자 관측 시각/유한 근거를 대조하세요.',
    );
    await this.workerChange(
      {
        principalId: 'u2-worker-identity',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'reobserveOriginalIdentityMutation',
        target: { workId },
        idempotencyKey:
          'observe-' +
          fingerprint({ workId, revision: result.revision, token: reservation.probeToken }),
        input: { target, observed },
        correlationId: String(work.correlationId),
        epoch: String(work.epoch),
      },
      async (tx, requestId) => {
        const current = (await this.authorization.lookup('WorkItem', workId, tx))!,
          currentResult = (await this.authorization.lookup('IdentityOperationResult', workId, tx))!,
          currentReservation = (await this.authorization.lookup('EndpointCircuit', subjectId, tx))!;
        requireCondition(
          current.revision === work.revision &&
            current.state === 'REVIEW_REQUIRED' &&
            currentResult.revision === result.revision &&
            currentResult.knowledge === 'UNKNOWN' &&
            currentReservation.revision === reservation.revision &&
            currentReservation.probeToken === reservation.probeToken &&
            currentReservation.probeGeneration === reservation.probeGeneration &&
            currentReservation.probeEpoch === work.epoch,
          409,
          'IDENTITY_RESULT_FENCED',
          '현재 원래 결과/예약 개정만 종료 관측을 확정합니다.',
        );
        const updated = {
          ...currentResult,
          knowledge: 'KNOWN',
          effect: observed.effect,
          terminal: true,
          providerRequestId: observed.providerRequestId,
          evidenceRefs: observed.evidenceRefs,
          observedAt: observed.observedAt,
          revision: Number(currentResult.revision) + 1,
        };
        await tx.put('IdentityOperationResult', updated, Number(currentResult.revision));
        await tx.put(
          'WorkItem',
          { ...current, state: 'RESULT_RECORDED', revision: Number(current.revision) + 1 },
          Number(current.revision),
        );
        await tx.put(
          'EndpointCircuit',
          {
            ...currentReservation,
            state: 'CLOSED',
            probeOwner: null,
            probeToken: null,
            probeDeadlineAt: null,
            revision: Number(currentReservation.revision) + 1,
          },
          Number(currentReservation.revision),
        );
        await tx.put('IdentityHistory', {
          historyId: randomUUID(),
          owner: 'IdentityRecovery',
          actorAccountRef: source.accountRef,
          verifiedPersonRef: null,
          occurredAt: this.now().toISOString(),
          reason: '원래 불명 provider 호출의 종료/격리 관측; 새 권위 재개 없음',
          beforeRef: ref('IdentityOperationResult', currentResult),
          afterRef: ref('IdentityOperationResult', updated),
          evidenceRefs: [],
          requestId,
          resultRefs: [ref('IdentityOperationResult', updated)],
          correctionOf: null,
          sourceRevision: updated.revision,
        });
      },
    );
    // A terminal observation releases only this subject reservation. The case,
    // UNKNOWN slot and expired/revoked purpose authority never auto-resume.
    return ref(
      'IdentityOperationResult',
      (await this.authorization.lookup('IdentityOperationResult', workId))!,
    );
  }
  private async observeWithCircuit(
    target: RecoveryProviderTarget,
    budget: ExecutionBudget,
  ): Promise<RecoveryProviderObservation> {
    const endpointId = identityProviderCircuitKey(target.issuer),
      circuit = await this.authorization.lookup('EndpointCircuit', endpointId);
    if (!circuit || circuit.state === 'CLOSED')
      return boundedIdentityCall(budget, () => this.provider.observeOriginal(target, budget));
    requireCondition(
      (circuit.state === 'OPEN' &&
        this.now().getTime() >= Date.parse(String(circuit.openedAt)) + 30000) ||
        (circuit.state === 'HALF_OPEN' &&
          this.now().getTime() >= Date.parse(String(circuit.probeDeadlineAt))),
      503,
      'IDENTITY_PROVIDER_CIRCUIT',
      '접점 제한30초와 단일 원래 read-only probe를 지켜야 합니다.',
    );
    const token = randomUUID(),
      generation = Number(circuit.probeGeneration) + 1;
    await this.workerChange(
      {
        principalId: 'u2-worker-identity',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'claimOriginalIdentityReadProbe',
        target: { workId: target.workId },
        idempotencyKey: token,
        input: { endpointId, workId: target.workId },
        correlationId: target.workId,
        epoch: target.epoch,
      },
      async (tx) => {
        const current = (await this.authorization.lookup('EndpointCircuit', endpointId, tx))!;
        requireCondition(
          current.revision === circuit.revision,
          409,
          'IDENTITY_PROVIDER_PROBE_BUSY',
          '전체 replica의 단일 read-only probe가 이미 시작됐습니다.',
        );
        await tx.put(
          'EndpointCircuit',
          {
            ...current,
            state: 'HALF_OPEN',
            probeOwner: target.workId,
            probeToken: token,
            probeGeneration: generation,
            probeEpoch: target.epoch,
            probeDeadlineAt: new Date(
              this.now().getTime() + Math.min(3000, budget.remaining()),
            ).toISOString(),
            revision: Number(current.revision) + 1,
          },
          Number(current.revision),
        );
      },
    );
    let observation: RecoveryProviderObservation | null = null,
      failed: unknown = null;
    try {
      observation = await boundedIdentityCall(budget, () =>
        this.provider.observeOriginal(target, budget),
      );
    } catch (error) {
      failed = error;
    }
    const operation =
        C21_OPERATIONS[
          (await this.authorization.lookup('WorkItem', target.workId))!
            .operationId as keyof typeof C21_OPERATIONS
        ],
      known =
        !!observation &&
        identityObservationMatches(target, observation, operation) &&
        observation.knowledge === 'KNOWN' &&
        observation.terminal &&
        Number.isFinite(Date.parse(observation.observedAt)) &&
        Date.parse(observation.observedAt) <= this.now().getTime() &&
        observation.evidenceRefs.length <= 20;
    await this.workerChange(
      {
        principalId: 'u2-worker-identity',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'recordOriginalIdentityReadProbe',
        target: { workId: target.workId },
        idempotencyKey: 'probe-' + token,
        input: { endpointId, token, known },
        correlationId: target.workId,
        epoch: target.epoch,
      },
      async (tx) => {
        const current = (await this.authorization.lookup('EndpointCircuit', endpointId, tx))!;
        requireCondition(
          current.state === 'HALF_OPEN' &&
            current.probeToken === token &&
            current.probeGeneration === generation &&
            current.probeEpoch === target.epoch,
          409,
          'IDENTITY_PROVIDER_PROBE_FENCED',
          '원래 단일 probe lease만 접점 결과를 보호합니다.',
        );
        const success = known && this.now().getTime() < Date.parse(String(current.probeDeadlineAt));
        await tx.put(
          'EndpointCircuit',
          {
            ...current,
            state: success ? 'CLOSED' : 'OPEN',
            failureCount: success ? 0 : Number(current.failureCount),
            openedAt: success ? null : this.now().toISOString(),
            windowStartedAt: this.now().toISOString(),
            probeOwner: null,
            probeToken: null,
            probeDeadlineAt: null,
            revision: Number(current.revision) + 1,
          },
          Number(current.revision),
        );
      },
    );
    if (failed) throw failed;
    requireCondition(
      observation,
      503,
      'IDENTITY_PROVIDER_PROBE_UNKNOWN',
      '원래 read-only 관측이 미확인입니다.',
    );
    return observation;
  }
}
