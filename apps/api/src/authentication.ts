import { AsyncLocalStorage } from 'node:async_hooks';
import { requireCondition } from '@oms/contracts';
import type { OperationRegistry } from '@oms/contracts';
import type { IdentityOutcome, IdentityRecovery } from '@oms/core';
interface AuthenticationCall {
  network: string;
  ingress: unknown;
  sessionToken?: string;
  browserBinding?: string;
  incomingSession?: string;
  ended?: boolean;
  subjectAccountId?: string;
}
export const authenticationCall = new AsyncLocalStorage<AuthenticationCall>();
export function bindAuthentication(registry: OperationRegistry, identity: IdentityRecovery): void {
  const call = () => {
    const value = authenticationCall.getStore();
    requireCondition(value, 503, 'AUTHENTICATION_HOST_REQUIRED', '인증 실행 접점이 필요합니다.');
    return value;
  };
  const outcomeView = async (outcome: IdentityOutcome) => {
    const value = call();
    value.sessionToken = outcome.sessionToken;
    value.browserBinding = outcome.browserBinding;
    value.subjectAccountId = outcome.accountId;
    return identity.publicView(outcome);
  };
  registry.bind('IdentityRecovery', 'endSession', 2, async () => {
    const value = call();
    requireCondition(value.incomingSession, 401, 'SESSION_REQUIRED', '로그인이 필요합니다.');
    await identity.logout(value.incomingSession);
    value.ended = true;
    return { ended: true };
  });
  registry.bind('IdentityRecovery', 'startLogin', 2, async (invocation) => {
    const data = invocation.data as { loginIdentifier: string };
    const value = call();
    const prepared = await identity.startLogin(
      invocation.context.audience as 'CUSTOMER' | 'STAFF',
      data.loginIdentifier,
      value.ingress,
    );
    return identity.publicView({ ...prepared, phase: 'CHALLENGE_REQUIRED' });
  });
  registry.bind('IdentityRecovery', 'completeChallenge', 2, async (invocation) => {
    const data = invocation.data as { challengeId: string; response: string };
    const value = call();
    return outcomeView(
      await identity.completeChallenge(
        data.challengeId,
        data.response,
        value.network,
        value.ingress,
      ),
    );
  });
  registry.bind('IdentityRecovery', 'prepareMfa', 2, async (invocation) => {
    const data = invocation.data as { challengeId: string };
    return {
      challengeId: data.challengeId,
      ...(await identity.beginEnrolment(data.challengeId, call().ingress)),
    };
  });
  registry.bind('IdentityRecovery', 'verifyMfaEnrolment', 2, async (invocation) => {
    const data = invocation.data as { challengeId: string; response: string };
    const value = call();
    return outcomeView(
      await identity.completeEnrolment(
        data.challengeId,
        data.response,
        value.network,
        value.ingress,
      ),
    );
  });
  registry.bind('IdentityRecovery', 'issueRecoveryCodes', 2, async (invocation) => {
    const data = invocation.data as { challengeId: string };
    return {
      challengeId: data.challengeId,
      ...(await identity.issueRecoveryCodes(data.challengeId, call().ingress)),
    };
  });
  registry.bind('IdentityRecovery', 'acknowledgeRecoveryCodes', 2, async (invocation) => {
    const data = invocation.data as { challengeId: string; setId: string; stored: boolean };
    return outcomeView(
      await identity.acknowledgeRecoveryCodes(
        data.challengeId,
        data.setId,
        data.stored,
        call().ingress,
      ),
    );
  });
}
