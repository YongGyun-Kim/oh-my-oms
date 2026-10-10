import type { Audience, ServiceContext } from '@oms/contracts';
import { ExecutionBudget, requireCondition } from '@oms/contracts';
import type { ProtectedTransaction } from '@oms/persistence';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Attempt, IdentityInternal, IdentityOutcome } from './identity-state.js';
import { ref } from './references.js';
import { assertBusinessIdentityReleased } from './enrollment-authority.js';
export async function checkAttemptCurrent(
  host: IdentityInternal,
  attempt: Attempt,
  transaction: ProtectedTransaction,
): Promise<void> {
  requireCondition(
    attempt.challengeId && attempt.leaseId,
    503,
    'CHALLENGE_LEASE_REQUIRED',
    '인증 처리 임대가 필요합니다.',
  );
  await transaction.assertAuthLease(attempt.challengeId, attempt.leaseId);
  const binding = await transaction.get('ProviderBinding', String(attempt.binding.bindingId));
  const account = await transaction.get(
    'Account',
    (attempt.binding.accountRef as { id: string }).id,
  );
  requireCondition(
    binding?.active &&
      account?.active &&
      binding.generation === attempt.binding.generation &&
      binding.authRevision === attempt.binding.authRevision,
    401,
    'IDENTITY_CHANGED',
    '신원 연결이 변경되어 다시 인증해야 합니다.',
  );
}
export async function finish(
  host: IdentityInternal,
  challengeId: string,
  attempt: Attempt,
): Promise<IdentityOutcome> {
  requireCondition(attempt.factor, 403, 'MFA_REQUIRED', 'MFA 확인이 필요합니다.');
  await assertBusinessIdentityReleased(
    host.store,
    (attempt.binding.accountRef as { id: string }).id,
  );
  const token = randomBytes(32).toString('base64url');
  const sessionId = host.sessionId(token);
  const now = host.runtime.now().toISOString();
  const epoch = await host.store.currentEpoch();
  await host.mutate(
    challengeId + ':finish',
    { sessionId, purpose: 'MFA_VERIFIED' },
    async (transaction) => {
      await host.checkAttemptCurrent(attempt, transaction);
      await assertBusinessIdentityReleased(
        host.store,
        (attempt.binding.accountRef as { id: string }).id,
        transaction,
      );
      const enrollment = {
        enrollmentId: randomUUID(),
        accountRef: attempt.binding.accountRef,
        state: 'VERIFIED',
        protectedMethodRef: attempt.factor!.methodRef,
        verificationEvidenceRefs: attempt.factor!.evidenceRefs,
        revision: 1,
      };
      await transaction.put('MfaEnrollment', enrollment);
      await transaction.put('IdentitySession', {
        sessionId,
        accountRef: attempt.binding.accountRef,
        audience: attempt.proof.audience,
        phase: 'MFA_VERIFIED',
        purpose: null,
        deadlineAt: new Date(host.runtime.now().getTime() + 8 * 3600000).toISOString(),
        mfaEnrollmentRef: ref('MfaEnrollment', enrollment),
        revision: 1,
        issuedAt: now,
        lastActiveAt: now,
        bindingGeneration: attempt.binding.generation,
        authRevision: attempt.binding.authRevision,
        recoveryEpoch: epoch,
      });
    },
  );
  attempt.consumed = true;
  return {
    challengeId: null,
    phase: 'MFA_VERIFIED',
    accountId: (attempt.binding.accountRef as { id: string }).id,
    sessionToken: token,
  };
}
export async function authenticate(
  host: IdentityInternal,
  token: string,
  audience: Exclude<Audience, 'SYSTEM'>,
  correlationId: string,
  ingressProof: unknown,
): Promise<ServiceContext> {
  await host.ingress(audience, ingressProof);
  requireCondition(
    /^[A-Za-z0-9_-]{43}$/.test(token),
    401,
    'SESSION_REQUIRED',
    '로그인이 필요합니다.',
  );
  const session = await host.store.currentProtected('IdentitySession', host.sessionId(token));
  const now = host.runtime.now().getTime();
  requireCondition(
    session?.phase === 'MFA_VERIFIED' &&
      session.audience === audience &&
      Date.parse(String(session.deadlineAt)) > now &&
      now - Date.parse(String(session.lastActiveAt)) < (audience === 'STAFF' ? 15 : 30) * 60000 &&
      session.recoveryEpoch === (await host.store.currentEpoch()),
    401,
    'SESSION_EXPIRED',
    '로그인을 다시 확인하세요.',
  );
  const account = await host.store.currentProtected(
    'Account',
    (session.accountRef as { id: string }).id,
  );
  requireCondition(account?.active, 401, 'ACCOUNT_INACTIVE', '현재 계정을 확인하세요.');
  await assertBusinessIdentityReleased(host.store, String(account.accountId));
  const bindings = await host.store.list('ProviderBinding', {
    equals: { accountRef: { id: account.accountId }, audience, active: true },
    limit: 2,
  });
  requireCondition(bindings.length === 1, 401, 'BINDING_CHANGED', '신원 연결을 다시 확인하세요.');
  const binding = await host.store.currentProtected(
    'ProviderBinding',
    String(bindings[0]!.bindingId),
  );
  requireCondition(
    binding?.generation === session.bindingGeneration &&
      binding?.authRevision === session.authRevision,
    401,
    'BINDING_CHANGED',
    '신원 연결을 다시 확인하세요.',
  );
  const enrollment = await host.store.currentProtected(
    'MfaEnrollment',
    (session.mfaEnrollmentRef as { id: string }).id,
  );
  requireCondition(
    enrollment?.state === 'VERIFIED',
    401,
    'MFA_INVALIDATED',
    'MFA를 다시 확인하세요.',
  );
  return {
    principalId: String(account.accountId),
    actorAccountRef: ref('Account', account),
    verifiedPersonRef: null,
    identityAssertionRef: ref('IdentitySession', session),
    audience,
    accessEvaluationRef: null,
    executionPermitRef: null,
    correlationId,
    deadlineAt: ExecutionBudget.current()?.deadlineAt ?? new Date(now + 10000).toISOString(),
  };
}
export async function logout(host: IdentityInternal, token: string): Promise<void> {
  const id = host.sessionId(token);
  await host.mutate(randomUUID(), { sessionId: id, purpose: 'LOGOUT' }, async (transaction) => {
    const session = await transaction.get('IdentitySession', id);
    requireCondition(session, 401, 'SESSION_REQUIRED', '로그인이 필요합니다.');
    await transaction.put(
      'IdentitySession',
      { ...session, phase: 'INVALIDATED', revision: Number(session.revision) + 1 },
      Number(session.revision),
    );
  });
}
