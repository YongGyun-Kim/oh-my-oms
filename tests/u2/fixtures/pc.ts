import { readFileSync, statSync } from 'node:fs';
import { randomUUID, createHmac } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { ProtectedStore, PurposeSecretVault, authorizeProtectedVault } from '@oms/persistence';
import type { ModelData, VaultBinding } from '@oms/persistence';
import {
  EnterpriseAccess,
  EnterpriseInvitations,
  EnrollmentAuthorities,
  PurposeVerifier,
  PartyClaimContexts,
  RecoveryHandoffs,
  ref,
} from '@oms/core';
import type { ServiceContext, Ref } from '@oms/contracts';
import { u2Sources } from './databases.js';
import { SyntheticEnterpriseVerification, u2Meta } from './enterprise.js';
test.afterEach(async ({ page }) => {
  // Failure context is a DOM diagnostic, not permission to retain raw values.
  if (!page.isClosed())
    await page
      .evaluate(() => {
        document.querySelectorAll('output.secret,textarea#codes').forEach((node) => {
          node.textContent = '';
          if (node instanceof HTMLTextAreaElement) node.value = '';
        });
        document.querySelectorAll('input').forEach((node) => {
          if (node.type === 'password' || ['code', 'factor', 'savedCode'].includes(node.name))
            node.value = '';
        });
      })
      .catch(() => undefined);
});
export function pcFixture() {
  const path = '.runtime/u2/e2e-fixture.json';
  if ((statSync(path).mode & 0o777) !== 0o600) throw Error('합성 fixture 권한이 다릅니다.');
  const f = JSON.parse(readFileSync(path, 'utf8')) as {
    synthetic: boolean;
    sourceRef: Ref;
    staff: ServiceContext;
    customer: ServiceContext;
    customerId: string;
    staffId: string;
    inviteeId: string;
    enterpriseRef: Ref;
    contact: ModelData;
    evidence: ModelData;
    policy: ModelData;
    password: string;
    factorClockAt: number;
    initialSecrets: Record<string, string>;
    verifierKey: string;
    vaultKey: string;
  };
  if (!f.synthetic || !Number.isSafeInteger(f.factorClockAt) || f.factorClockAt < 0)
    throw Error('명시 합성 fixture와 별도 TOTP 시계만 허용합니다.');
  return f;
}
export function totp(secret: Buffer, milliseconds = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(milliseconds / 30000)));
  const digest = createHmac('sha1', secret).update(counter).digest(),
    offset = digest.at(-1)! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function decodeBase32(value: string) {
  let bits = 0,
    buffer = 0;
  const bytes: number[] = [],
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  for (const letter of value) {
    const n = alphabet.indexOf(letter);
    if (n < 0) throw Error('합성 TOTP 키 형식이 다릅니다.');
    buffer = (buffer << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
export async function pcLogin(
  page: Page,
  id: string,
  audience: 'CUSTOMER' | 'STAFF' = 'CUSTOMER',
  diagnosticFault?: 'MFA_BODY_UNAVAILABLE',
) {
  const f = pcFixture();
  const started = performance.now();
  let sequence = 0;
  const emit = (stage: string, details: Record<string, string | number | boolean | null> = {}) =>
    console.log(
      JSON.stringify({
        event: 'pc-network-boundary',
        audience,
        sequence: ++sequence,
        elapsedMilliseconds: performance.now() - started,
        stage,
        ...details,
      }),
    );
  const fixedPhase = (value: unknown) =>
    typeof value === 'string' &&
    [
      'PASSWORD_REQUIRED',
      'CHALLENGE_REQUIRED',
      'MFA_REQUIRED',
      'MFA_VERIFIED',
      'RECOVERY_REVIEW',
      'ENROLMENT_ONLY',
      'INVALIDATED',
    ].includes(value)
      ? value
      : null;
  const fixedCode = (value: unknown) =>
    typeof value === 'string' &&
    [
      'INVALID_INPUT',
      'INVALID_CREDENTIALS',
      'INVALID_FACTOR',
      'CHALLENGE_EXPIRED',
      'FACTOR_REJECTED',
      'STAFF_INGRESS_REQUIRED',
      'UNAVAILABLE',
    ].includes(value)
      ? value
      : null;
  const operation = (url: string) => {
    const path = new URL(url).pathname;
    return !path.startsWith('/api/identity/')
      ? null
      : path.endsWith('/recovery-code-issues')
        ? 'RECOVERY_CODE_ISSUE'
        : path.endsWith('/responses')
          ? 'CHALLENGE_RESPONSE'
          : path.endsWith('/identity')
            ? 'IDENTITY_READ'
            : 'IDENTITY_OTHER';
  };
  const readBody = async (
    response: import('@playwright/test').Response,
    lane: 'OBSERVER' | 'WAITER',
  ) => {
    const op = operation(response.url())!;
    let bytes: Buffer | undefined;
    let bodyCompleted = false;
    emit('BODY_READ_STARTED', {
      lane,
      operation: op,
      status: response.status(),
      pageClosed: page.isClosed(),
    });
    try {
      // Fault injection affects only the test observer; the browser's actual
      // API/BFF request, response and authentication state remain untouched.
      if (lane === 'WAITER' && diagnosticFault === 'MFA_BODY_UNAVAILABLE')
        throw Error('Network.getResponseBody');
      bytes = await response.body();
      bodyCompleted = true;
      emit('BODY_READ_COMPLETED', { lane, operation: op });
      emit('JSON_PARSE_STARTED', { lane, operation: op });
      const body = JSON.parse(bytes.toString('utf8')) as { phase?: unknown; code?: unknown };
      const safe = { phase: fixedPhase(body.phase), code: fixedCode(body.code) };
      emit('JSON_PARSE_COMPLETED', {
        lane,
        operation: op,
        phase: safe.phase,
        problemCode: safe.code,
      });
      return { ...safe, available: true, unavailableReason: null };
    } catch (error) {
      const reason = bodyCompleted
        ? 'JSON_PARSE_INVALID'
        : String((error as Error).message).includes('Network.getResponseBody')
          ? 'CDP_RESPONSE_BODY'
          : 'BODY_READ_OTHER';
      emit(bodyCompleted ? 'JSON_PARSE_FAILED' : 'BODY_READ_FAILED', {
        lane,
        operation: op,
        reason,
        pageClosed: page.isClosed(),
      });
      emit('BODY_UNAVAILABLE', { lane, operation: op, reason, status: response.status() });
      return { phase: null, code: null, available: false, unavailableReason: reason };
    } finally {
      bytes?.fill(0);
    }
  };
  const observe = async (response: import('@playwright/test').Response) => {
    const op = operation(response.url());
    if (!op) return;
    emit('RESPONSE_HEADERS', {
      lane: 'OBSERVER',
      operation: op,
      status: response.status(),
      pageClosed: page.isClosed(),
    });
    const body = await readBody(response, 'OBSERVER');
    console.log(
      JSON.stringify({
        event: 'pc-identity-response-boundary',
        audience,
        operation: op,
        status: response.status(),
        phase: body?.phase ?? null,
        problemCode: body?.code ?? null,
      }),
    );
  };
  const requestFinished = (request: import('@playwright/test').Request) => {
    const op = operation(request.url());
    if (op) emit('REQUEST_FINISHED', { operation: op, pageClosed: page.isClosed() });
  };
  const requestFailed = (request: import('@playwright/test').Request) => {
    const op = operation(request.url());
    if (op) emit('REQUEST_FAILED', { operation: op, pageClosed: page.isClosed() });
  };
  const navigated = (frame: import('@playwright/test').Frame) =>
    emit('FRAME_NAVIGATED', { mainFrame: frame === page.mainFrame() });
  const closed = () => emit('PAGE_CLOSED', { pageClosed: true });
  page.on('response', observe);
  page.on('requestfinished', requestFinished);
  page.on('requestfailed', requestFailed);
  page.on('framenavigated', navigated);
  page.on('close', closed);
  try {
    await page.goto(audience === 'STAFF' ? 'http://127.0.0.1:3301' : 'http://127.0.0.1:3300');
    await page.getByLabel('로그인 이메일', { exact: true }).fill(id + '@example.invalid');
    await page.getByLabel('비밀번호', { exact: true }).fill(f.password);
    await page.getByRole('button', { name: '로그인 확인', exact: true }).click();
    const generatedAt = Date.now();
    await page
      .getByLabel('인증 앱 코드', { exact: true })
      .fill(totp(Buffer.from(f.initialSecrets[id]!, 'base64'), f.factorClockAt));
    const mfaResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/responses') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '추가 인증 확인', exact: true }).click();
    const observed = await mfaResponse,
      responseAt = Date.now();
    emit('RESPONSE_HEADERS', {
      lane: 'WAITER',
      operation: 'CHALLENGE_RESPONSE',
      status: observed.status(),
      pageClosed: page.isClosed(),
    });
    expect(observed.status()).toBe(200);
    const body = await readBody(observed, 'WAITER');
    console.log(
      JSON.stringify({
        event: 'pc-mfa-boundary',
        audience,
        generatedAt: new Date(generatedAt).toISOString(),
        responseAt: new Date(responseAt).toISOString(),
        generatedStep: Math.floor(f.factorClockAt / 30000),
        clockKind: 'PC_TOTP_ONLY_INJECTED',
        responseStep: Math.floor(responseAt / 30000),
        status: observed.status(),
        phase: body.phase,
        problemCode: body.code,
        bodyObservation: body.available ? 'AVAILABLE' : 'BODY_UNAVAILABLE',
        businessCookiePresent: (await page.context().cookies()).some(
          (cookie) => cookie.name === '__Host-oms-' + audience.toLowerCase(),
        ),
      }),
    );
    const logout = page.getByRole('button', { name: '로그아웃', exact: true }),
      stored = page.getByRole('checkbox', {
        name: '복구 코드를 안전한 장소에 보관했습니다.',
        exact: true,
      });
    await expect
      .poll(async () => (await logout.isVisible()) || (await stored.isVisible()))
      .toBe(true);
    const recoveryCodeAcknowledged = await stored.isVisible();
    if (recoveryCodeAcknowledged) {
      await stored.check();
      await page.getByRole('button', { name: '보관 확인 후 업무 시작', exact: true }).click();
    }
    await expect.poll(() => logout.isVisible()).toBe(true);
    const businessCookiePresent = (await page.context().cookies()).some(
      (cookie) => cookie.name === '__Host-oms-' + audience.toLowerCase(),
    );
    expect(businessCookiePresent).toBe(true);
    return {
      mfaStatus: observed.status(),
      mfaBodyObserved: body.available,
      mfaBodyUnavailableReason: body.unavailableReason,
      recoveryCodeAcknowledged,
      businessCookiePresent,
      authenticatedUi: await logout.isVisible(),
    };
  } finally {
    page.off('response', observe);
    page.off('requestfinished', requestFinished);
    page.off('requestfailed', requestFailed);
    page.off('framenavigated', navigated);
    page.off('close', closed);
  }
}
export async function pcSource<T>(
  callback: (
    store: ProtectedStore,
    vault: PurposeSecretVault,
    verifier: PurposeVerifier,
    f: ReturnType<typeof pcFixture>,
  ) => Promise<T>,
) {
  const sources = u2Sources();
  for (const s of Object.values(sources)) await s.initialize();
  const store = new ProtectedStore(sources.primaryApp, sources.journalAppend),
    f = pcFixture(),
    verifier = new PurposeVerifier(Buffer.from(f.verifierKey, 'base64'), 'fixture-key'),
    vault = new PurposeSecretVault(
      sources.vault,
      Buffer.from(f.vaultKey, 'base64'),
      'vault-key',
      (b, p, a) => authorizeProtectedVault(store, b, p, a),
    );
  try {
    return await callback(store, vault, verifier, f);
  } finally {
    for (const s of Object.values(sources)) await s.destroy();
  }
}
export async function fixtureWrite(
  store: ProtectedStore,
  operation: string,
  callback: Parameters<ProtectedStore['execute']>[1],
) {
  return store.execute(
    {
      principalId: 'synthetic-u2-pc-source-owner',
      audience: 'SYSTEM',
      owner: 'IdentityRecovery',
      operation,
      target: null,
      idempotencyKey: randomUUID(),
      input: { synthetic: true },
      correlationId: randomUUID(),
      epoch: await store.currentEpoch(),
    },
    callback,
  );
}
const context = (source: ServiceContext) => ({
  ...source,
  deadlineAt: new Date(Date.now() + 10000).toISOString(),
  correlationId: randomUUID(),
});
export async function originalHandoff(caseId: string, challengeId: string) {
  return pcSource(async (store, vault, verifier, f) => {
    const source = (await store.currentProtected('RecoveryCase', caseId))!,
      parties = new PartyClaimContexts(
        store,
        verifier,
        () => new Date(),
        async (p) => p === 'synthetic-private-ingress',
      ),
      handoffs = new RecoveryHandoffs(
        store,
        verifier,
        vault,
        () => new Date(),
        'LOCAL_SYNTHETIC',
        parties,
        async (p) => p === 'synthetic-private-ingress',
      ),
      rows = await store.list('PartyClaimContext', {
        equals: { caseRef: { id: caseId }, challengeId, state: 'PENDING' },
        limit: 2,
      });
    if (rows.length !== 1) throw Error('원래 실제 PC 당사자가 필요합니다.');
    const party = rows[0]!,
      evidence = {
        ...f.evidence,
        evidenceId: randomUUID(),
        revision: 1,
        caseRef: ref('RecoveryCase', source),
        partyContextRef: ref('PartyClaimContext', party),
        challengeId: party.challengeId,
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };
    await fixtureWrite(store, 'fixture-pc-current-party-observation', async (tx) =>
      tx.put('VerificationEvidence', evidence),
    );
    await handoffs.verifyParty(context(f.staff), {
      meta: u2Meta(Number(source.revision)),
      caseRef: ref('RecoveryCase', source),
      partyContextRef: ref('PartyClaimContext', party),
      policyRef: ref('VerificationPolicy', f.policy),
      evidenceRefs: [ref('VerificationEvidence', evidence)],
      decision: 'CONFIRM',
    });
    const verified = (await store.currentProtected('RecoveryCase', caseId))!,
      receipt = await handoffs.issue(context(f.staff), {
        meta: u2Meta(Number(verified.revision)),
        caseRef: ref('RecoveryCase', verified),
        verificationRef: verified.verificationRef as Ref,
        partyContextRef: verified.partyContextRef as Ref,
        deliveryRouteRef: ref('RegisteredContact', f.contact),
      }),
      grant = (await store.currentProtected('RecoveryHandoffGrant', receipt.targetRef!.id))!;
    const material = await vaultSourceBinding(store, vault, grant, 'HANDOFF');
    return { grantRef: receipt.targetRef!, caseRef: ref('RecoveryCase', verified), code: material };
  });
}
async function vaultSourceBinding(
  store: ProtectedStore,
  vault: PurposeSecretVault,
  row: ModelData,
  purpose: 'HANDOFF' | 'INVITATION_TOKEN',
) {
  // Metadata is current protected source; exact separate vault material only.
  const binding: VaultBinding = {
    id: String(row.vaultRef),
    purpose,
    targetRef: ref(purpose === 'HANDOFF' ? 'RecoveryHandoffGrant' : 'MembershipInvitation', row),
    accountRef: purpose === 'HANDOFF' ? (row.accountRef as Ref) : null,
    audience: 'CUSTOMER',
    bindingGeneration: purpose === 'HANDOFF' ? Number(row.bindingGeneration) : null,
    sourceRevision: Number(row.revision),
    expiresAt: String(row.vaultExpiresAt ?? row.expiresAt),
    keyVersion: vault.keyVersion,
  };
  const bytes = await vault.read(binding, {
    authorityRef: binding.targetRef,
    targetRef: binding.targetRef,
    purpose,
    operation: purpose === 'HANDOFF' ? 'identity.handoff.deliver' : 'enterprise.invitation.deliver',
    epoch: await store.currentEpoch(),
    deadlineAt: new Date(Date.now() + 10000).toISOString(),
  });
  try {
    return bytes.toString();
  } finally {
    bytes.fill(0);
  }
}
export async function originalInvitation() {
  return pcSource(async (store, vault, verifier, f) => {
    const account = (await store.currentProtected('Account', f.inviteeId))!,
      binding = (
        await store.list('ProviderBinding', {
          equals: { accountRef: { id: f.inviteeId }, audience: 'CUSTOMER', active: true },
          limit: 2,
        })
      )[0]!,
      contact = {
        ...f.contact,
        contactId: randomUUID(),
        accountRef: ref('Account', account),
        revision: 1,
      },
      policy = {
        ...f.policy,
        policyId: randomUUID(),
        purpose: 'INVITATION_ACCEPTANCE',
        revision: 1,
      },
      evidence = {
        ...f.evidence,
        evidenceId: randomUUID(),
        accountRef: ref('Account', account),
        bindingRef: ref('ProviderBinding', binding),
        policyRef: ref('VerificationPolicy', policy),
        contactRef: ref('RegisteredContact', contact),
        purpose: 'INVITATION_ACCEPTANCE',
        caseRef: null,
        partyContextRef: null,
        challengeId: null,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        revision: 1,
      };
    await fixtureWrite(store, 'fixture-pc-contact-original', async (tx) => {
      await tx.put('RegisteredContact', contact);
      await tx.put('VerificationPolicy', policy);
      await tx.put('VerificationEvidence', evidence);
    });
    const access = new EnterpriseAccess(
        store,
        new SyntheticEnterpriseVerification(),
        () => new Date(),
        true,
      ),
      authorities = new EnrollmentAuthorities(
        store,
        verifier,
        () => new Date(),
        async () => false,
      ),
      service = new EnterpriseInvitations(access, verifier, vault, authorities, () => new Date()),
      receipt = await service.issue(context(f.customer), {
        meta: u2Meta(),
        enterpriseRef: f.enterpriseRef,
        contactRef: ref('RegisteredContact', contact),
        contactVersion: 1,
        departmentRef: null,
        siteRef: null,
        roleRefs: [],
        expectedMembershipRevision: null,
        reactivate: false,
      }),
      invitation = (await store.currentProtected('MembershipInvitation', receipt.targetRef!.id))!;
    return {
      invitationRef: receipt.targetRef!,
      evidenceRef: ref('VerificationEvidence', evidence),
      token: await vaultSourceBinding(store, vault, invitation, 'INVITATION_TOKEN'),
    };
  });
}
