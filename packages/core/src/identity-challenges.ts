import type { Audience, ServiceContext } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import { createHmac, randomUUID } from 'node:crypto';
import { IdentityBrowser } from './identity-browser.js';
import type {
  Attempt,
  IdentityInternal,
  IdentityOutcome,
  LoginPreparation,
} from './identity-state.js';
import { ref } from './references.js';
import { Authorization } from './authorization.js';
import { assertBusinessIdentityReleased } from './enrollment-authority.js';
export async function limit(
  host: IdentityInternal,
  subject: string,
  network: string,
): Promise<void> {
  const now = host.runtime.now();
  let denied = false;
  await host.mutate(randomUUID(), { kind: 'authentication-attempt' }, async (transaction) => {
    for (const [label, value, maximum] of [
      ['subject', subject, 10],
      ['network', network, 100],
      ['global', 'all', 1000],
    ] as const) {
      const id = createHmac('sha256', host.runtime.verifierKey)
        .update(label + ':' + value)
        .digest('hex');
      const previous = await transaction.get('AuthAttemptWindow', id);
      const count =
        previous && Date.parse(String(previous.resetAt)) > now.getTime()
          ? Number(previous.count) + 1
          : 1;
      const resetAt =
        previous && Date.parse(String(previous.resetAt)) > now.getTime()
          ? String(previous.resetAt)
          : new Date(now.getTime() + 60000).toISOString();
      await transaction.put(
        'AuthAttemptWindow',
        { windowId: id, count, resetAt, revision: Number(previous?.revision ?? 0) + 1 },
        previous ? Number(previous.revision) : null,
      );
      if (count > maximum) denied = true;
    }
  });
  requireCondition(
    !denied,
    429,
    'AUTH_ATTEMPT_LIMIT',
    '인증 시도가 많습니다. 잠시 후 다시 확인하세요.',
  );
}
export async function ingress(
  host: IdentityInternal,
  audience: Audience,
  ingressProof: unknown,
): Promise<void> {
  requireCondition(
    audience !== 'STAFF' || (await host.runtime.staffIngress(ingressProof)),
    403,
    'STAFF_INGRESS_REQUIRED',
    '승인된 직원 접점이 필요합니다.',
  );
}
export async function withAttempt<R>(
  host: IdentityInternal,
  id: string,
  operation: (attempt: Attempt) => Promise<R>,
): Promise<R> {
  return host.challenges.withLease(id, async (lease) => {
    const attempt = lease.value;
    requireCondition(
      attempt.kind === 'MFA' &&
        attempt.clientBinding === IdentityBrowser.current(host.runtime.synthetic),
      401,
      'CHALLENGE_BROWSER_MISMATCH',
      '현재 접점에서 인증을 다시 시작하세요.',
    );
    const binding = await host.store.currentProtected(
      'ProviderBinding',
      String(attempt.binding.bindingId),
    );
    const account = await host.store.currentProtected(
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
      '현재 신원 연결을 다시 확인하세요.',
    );
    requireCondition(
      attempt.deadline > host.runtime.now().getTime(),
      401,
      'CHALLENGE_EXPIRED',
      '인증을 다시 시작하세요.',
    );
    attempt.leaseId = lease.leaseId;
    attempt.challengeId = id;
    try {
      const result = await operation(attempt);
      lease.consumed = attempt.consumed === true;
      return result;
    } finally {
      delete attempt.leaseId;
      delete attempt.challengeId;
      delete attempt.consumed;
    }
  });
}
export async function completeChallenge(
  host: IdentityInternal,
  challengeId: string,
  response: string,
  network: string,
  ingressProof: unknown,
): Promise<IdentityOutcome> {
  // Inspection selects the owner phase only; each selected operation acquires its own current lease.
  const selected = (await host.preparations.inspect(challengeId)) as LoginPreparation | Attempt;
  requireCondition(
    selected.clientBinding === IdentityBrowser.current(host.runtime.synthetic),
    401,
    'CHALLENGE_BROWSER_MISMATCH',
    '현재 접점에서 인증을 다시 시작하세요.',
  );
  return selected.kind === 'PASSWORD'
    ? host.completePassword(challengeId, response, network, ingressProof)
    : host.verifyFactor(challengeId, response, network, ingressProof);
}
export async function readIdentity(
  host: IdentityInternal,
  context: ServiceContext,
): Promise<unknown> {
  const currentAuthorization = new Authorization(host.store, host.runtime.now);
  await currentAuthorization.identity(context);
  await assertBusinessIdentityReleased(host.store, context.principalId);
  const session = await host.store.currentProtected(
    'IdentitySession',
    context.identityAssertionRef.id,
  );
  requireCondition(
    session?.phase === 'MFA_VERIFIED' &&
      (session.accountRef as { id: string }).id === context.principalId,
    401,
    'SESSION_REQUIRED',
    '로그인이 필요합니다.',
  );
  await currentAuthorization.identity(context);
  return {
    knowledge: 'KNOWN',
    data: {
      accountRef: context.actorAccountRef,
      challengeId: null,
      phase: 'MFA_VERIFIED',
      personLinkRef: context.verifiedPersonRef,
      resultRefs: [context.identityAssertionRef],
    },
    sourceRefs: [context.identityAssertionRef],
    observedAt: host.runtime.now().toISOString(),
  };
}
export async function publicView(
  host: IdentityInternal,
  outcome: {
    challengeId: string | null;
    phase: string;
    accountId?: string;
  },
): Promise<unknown> {
  const account = outcome.accountId
    ? await host.store.currentProtected('Account', outcome.accountId)
    : null;
  return {
    accountRef: account ? ref('Account', account) : null,
    challengeId: outcome.challengeId,
    phase: outcome.phase,
    personLinkRef: null,
    resultRefs: [],
  };
}
