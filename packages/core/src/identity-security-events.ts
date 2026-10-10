import type { Audience } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import { randomUUID } from 'node:crypto';
import type { FactorRemovalProof } from './identity-provider.js';
import type { IdentityInternal } from './identity-state.js';
import type { Authorization } from './authorization.js';
import type { ModelData, ProtectedTransaction } from '@oms/persistence';
import type { Ref } from '@oms/contracts';
import { ref } from './references.js';
export async function fenceOtherAccountBindings(
  authorization: Authorization,
  transaction: ProtectedTransaction,
  selected: ModelData,
): Promise<{ originals: Ref[]; changed: Ref[]; factors: Ref[] }> {
  const equals = { accountRef: { id: (selected.accountRef as Ref).id }, active: true },
    raw = await transaction.list('ProviderBinding', equals, 3),
    visible = await authorization.store.list('ProviderBinding', { equals, limit: 3 });
  requireCondition(
    raw.length <= 2 &&
      raw.length === visible.length &&
      raw.every((row) => visible.some((source) => source.bindingId === row.bindingId)) &&
      raw.some((row) => row.bindingId === selected.bindingId),
    503,
    'CURRENT_BINDINGS_NOT_PROTECTED',
    '계정의 모든 현재 연결을 보호 원본과 대조해야 합니다.',
  );
  const originals: Ref[] = [],
    changed: Ref[] = [];
  for (const row of raw) {
    const current = await authorization.lookup(
      'ProviderBinding',
      String(row.bindingId),
      transaction,
    );
    requireCondition(
      current?.active,
      503,
      'CURRENT_BINDINGS_NOT_PROTECTED',
      '계정의 현재 연결 보호가 필요합니다.',
    );
    originals.push(ref('ProviderBinding', current));
    if (row.bindingId === selected.bindingId) continue;
    const next = {
      ...current,
      authRevision: Number(current.authRevision) + 1,
      revision: Number(current.revision) + 1,
    };
    await transaction.put('ProviderBinding', next, Number(current.revision));
    changed.push(ref('ProviderBinding', next));
  }
  const factorEquals = { accountRef: { id: (selected.accountRef as Ref).id }, state: 'VERIFIED' },
    rawFactors = await transaction.list('MfaEnrollment', factorEquals, 100),
    visibleFactors = await authorization.store.list('MfaEnrollment', {
      equals: factorEquals,
      limit: 100,
    });
  requireCondition(
    rawFactors.length < 100 &&
      rawFactors.length === visibleFactors.length &&
      rawFactors.every((row) =>
        visibleFactors.some((source) => source.enrollmentId === row.enrollmentId),
      ),
    503,
    'CURRENT_FACTORS_NOT_PROTECTED',
    '계정의 원래 모든 유효 수단을 유한 보호 원본과 대조해야 합니다.',
  );
  const factors: Ref[] = [];
  for (const row of rawFactors) {
    const current = await authorization.lookup(
      'MfaEnrollment',
      String(row.enrollmentId),
      transaction,
    );
    requireCondition(
      current?.state === 'VERIFIED',
      503,
      'CURRENT_FACTORS_NOT_PROTECTED',
      '원래 유효 수단의 현재 보호가 필요합니다.',
    );
    factors.push(ref('MfaEnrollment', current));
  }
  return { originals, changed, factors };
}
export async function recordRegisteredActivity(
  host: IdentityInternal,
  token: string,
  audience: Exclude<Audience, 'SYSTEM'>,
  operation: string,
  correlationId: string,
  ingressProof: unknown,
): Promise<void> {
  // API invokes this only after a registered authorised operation succeeds; never a client activity flag.
  const active = [
    'applyEnterprise',
    'approveEnterprise',
    'designateInitialAdministrator',
    'setOrderingContextPolicy',
    'upsertOrganisation',
    'upsertMembership',
    'defineCustomerRole',
    'grantCustomerRole',
    'defineStaffRole',
    'grantStaffRole',
    'registerProduct',
    'reviseProduct',
    'submitOrder',
    'recordNoticeRead',
    'inviteMembership',
    'revokeMembershipInvitation',
    'resendMembershipInvitation',
    'updateMembership',
    'reviseCustomerRole',
    'deactivateCustomerRole',
    'reviseStaffRole',
    'deactivateStaffRole',
    'restoreAdministrator',
    'resumeAdministratorRestoration',
    'closeAdministratorRestoration',
    'verifyRecoveryParty',
    'issueHandoff',
    'resumeRecovery',
    'closeRecovery',
  ];
  if (!active.includes(operation)) return;
  const context = await host.authenticate(token, audience, correlationId, ingressProof);
  const id = context.identityAssertionRef.id;
  await host.mutate(randomUUID(), { sessionId: id, operation }, async (transaction) => {
    const session = await transaction.get('IdentitySession', id);
    requireCondition(
      session?.phase === 'MFA_VERIFIED' &&
        session.revision === context.identityAssertionRef.revision,
      401,
      'SESSION_CHANGED',
      '현재 세션을 다시 확인하세요.',
    );
    const account = await transaction.get('Account', context.principalId);
    requireCondition(account?.active, 401, 'ACCOUNT_INACTIVE', '현재 계정을 확인하세요.');
    await transaction.put(
      'IdentitySession',
      {
        ...session,
        lastActiveAt: host.runtime.now().toISOString(),
        revision: Number(session.revision) + 1,
      },
      Number(session.revision),
    );
  });
}
export async function recordConfirmedFactorRemoval(
  host: IdentityInternal,
  challengeId: string,
  observed: FactorRemovalProof,
): Promise<void> {
  return host.withAttempt(challengeId, async (attempt) => {
    requireCondition(attempt.recovery, 403, 'RECOVERY_PURPOSE_REQUIRED', '복구 목적을 확인하세요.');
    // This owner-internal method must receive the registered provider's observed original result.
    requireCondition(
      observed.terminal === true &&
        observed.outcome === 'REMOVED' &&
        observed.originalOperationRef &&
        observed.evidenceRefs.length > 0 &&
        observed.issuer === attempt.proof.issuer &&
        observed.subject === attempt.proof.subject &&
        observed.audience === attempt.proof.audience,
      503,
      'REMOVAL_PROOF_REQUIRED',
      '원래 인증 수단 제거의 종료 결과가 필요합니다.',
    );
    await host.mutate(
      randomUUID(),
      { bindingId: attempt.binding.bindingId, purpose: 'REMOVAL_CONFIRMED' },
      async (transaction) => {
        await host.checkAttemptCurrent(attempt, transaction);
        const binding = await transaction.get('ProviderBinding', String(attempt.binding.bindingId));
        requireCondition(binding, 401, 'RECOVERY_DENIED', '현재 연결을 확인하세요.');
        const updated = {
          ...binding,
          removalState: 'COMPLETED',
          revision: Number(binding.revision) + 1,
        };
        await transaction.put('ProviderBinding', updated, Number(binding.revision));
        attempt.binding = updated;
      },
    );
  });
}
