import type { Audience } from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import { randomUUID } from 'node:crypto';
import { IdentityBrowser } from './identity-browser.js';
import type { IdentityInternal, IdentityOutcome } from './identity-state.js';
export async function startLogin(
  host: IdentityInternal,
  audience: Exclude<Audience, 'SYSTEM'>,
  loginIdentifier: string,
  ingressProof: unknown,
): Promise<{ challengeId: string; phase: 'PASSWORD_REQUIRED' }> {
  await host.ingress(audience, ingressProof);
  requireCondition(
    typeof loginIdentifier === 'string' &&
      loginIdentifier.length > 0 &&
      loginIdentifier.length <= 4096,
    400,
    'LOGIN_INPUT_INVALID',
    '로그인 정보를 확인하세요.',
  );
  const challengeId = randomUUID();
  await host.preparations.create(
    challengeId,
    {
      kind: 'PASSWORD',
      audience,
      loginIdentifier,
      deadline: host.runtime.now().getTime() + 5 * 60000,
      clientBinding: IdentityBrowser.current(host.runtime.synthetic),
    },
    new Date(Date.now() + 5 * 60000),
  );
  return { challengeId, phase: 'PASSWORD_REQUIRED' };
}
export async function completePassword(
  host: IdentityInternal,
  challengeId: string,
  password: string,
  network: string,
  ingressProof: unknown,
): Promise<IdentityOutcome> {
  return host.preparations.withLease(challengeId, async (lease) => {
    const prepared = lease.value;
    requireCondition(
      prepared.kind === 'PASSWORD' &&
        prepared.clientBinding === IdentityBrowser.current(host.runtime.synthetic) &&
        prepared.deadline > host.runtime.now().getTime(),
      401,
      'CHALLENGE_BROWSER_MISMATCH',
      '현재 접점에서 인증을 다시 시작하세요.',
    );
    requireCondition(
      typeof password === 'string' && password.length > 0 && password.length <= 4096,
      400,
      'PASSWORD_INPUT_INVALID',
      '인증 정보를 확인하세요.',
    );
    const result = await host.login(
      prepared.audience,
      prepared.loginIdentifier,
      password,
      network,
      ingressProof,
    );
    lease.consumed = true;
    return { ...result, browserBinding: IdentityBrowser.next(host.runtime.synthetic) };
  });
}
export async function login(
  host: IdentityInternal,
  audience: Exclude<Audience, 'SYSTEM'>,
  login: string,
  password: string,
  network: string,
  ingressProof: unknown,
): Promise<IdentityOutcome> {
  await host.ingress(audience, ingressProof);
  await host.limit(login, network);
  const proof = await host.provider.password(audience, login, password);
  requireCondition(
    proof.audience === audience && proof.evidenceRefs.length > 0,
    401,
    'PROVIDER_PROOF_REQUIRED',
    '신원 근거를 확인할 수 없습니다.',
  );
  await host.recordProviderProof(proof);
  const matched = await host.store.list('ProviderBinding', {
    equals: { issuer: proof.issuer, subject: proof.subject, audience, active: true },
    limit: 2,
  });
  requireCondition(
    matched.length === 1,
    401,
    'ACTIVE_BINDING_REQUIRED',
    '등록된 신원 연결을 확인하세요.',
  );
  const binding = await host.store.currentProtected(
    'ProviderBinding',
    String(matched[0]!.bindingId),
  );
  requireCondition(binding, 401, 'ACTIVE_BINDING_REQUIRED', '등록된 신원 연결을 확인하세요.');
  const account = await host.store.currentProtected(
    'Account',
    (binding.accountRef as { id: string }).id,
  );
  requireCondition(account?.active, 401, 'ACCOUNT_INACTIVE', '현재 계정을 확인하세요.');
  const challengeId = randomUUID();
  await host.challenges.create(
    challengeId,
    {
      kind: 'MFA',
      clientBinding: IdentityBrowser.next(host.runtime.synthetic),
      proof,
      binding,
      deadline: host.runtime.now().getTime() + 5 * 60000,
      factor: null,
      issuedSet: null,
      secretHandle: null,
      recovery: false,
    },
    new Date(Date.now() + 5 * 60000),
  );
  return { challengeId, phase: 'MFA_REQUIRED', accountId: String(account.accountId) };
}
