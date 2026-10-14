import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  PartyClaimContexts,
  PurposeVerifier,
  generatePurposeSecret,
  partySecretBinding,
  IdentityBrowser,
} from '@oms/core';
import type { Ref } from '@oms/contracts';
import { SyntheticModelStore } from '../fixtures/identity.js';
const r = (entity: string, id = entity, revision = 1): Ref => ({
    owner: 'IdentityRecovery',
    entity,
    id,
    revision,
  }),
  now = new Date('2026-10-09T00:00:00Z');
function fixture() {
  const source = new SyntheticModelStore(),
    v = new PurposeVerifier(randomBytes(32), 'fixture-key'),
    browser = generatePurposeSecret('PARTY_BROWSER'),
    secret = generatePurposeSecret('PARTY_CONTEXT'),
    row = {
      partyContextId: 'party',
      revision: 1,
      accountRef: r('Account'),
      caseRef: r('RecoveryCase'),
      audience: 'CUSTOMER',
      challengeId: 'new-party-challenge',
      bindingRef: r('ProviderBinding'),
      bindingGeneration: 1,
      securityGeneration: 1,
      keyVersion: 'fixture-key',
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 300000).toISOString(),
      state: 'VERIFIED',
      verificationRef: r('RecoveryVerification'),
      epoch: 'initial',
      secretVerifier: '',
      browserVerifier: '',
    };
  row.secretVerifier = v.digest(secret, partySecretBinding(row));
  row.browserVerifier = v.digest(browser, partySecretBinding(row, 'PARTY_BROWSER'));
  source.fixture('PartyClaimContext', row);
  return {
    source,
    v,
    browser,
    secret,
    row,
    service: new PartyClaimContexts(
      source.asStore(),
      v,
      () => now,
      async () => false,
    ),
  };
}
describe('확인 당사자의 별도 challenge/cookie 문맥', () => {
  it('정확한 secret와 서버 browser 문맥이 함께 있어야 한다', async () => {
    const f = fixture();
    await expect(
      IdentityBrowser.run({ current: f.browser }, () =>
        f.service.assert(
          r('PartyClaimContext', 'party'),
          f.secret,
          r('RecoveryCase'),
          'new-party-challenge',
        ),
      ),
    ).resolves.toMatchObject({ state: 'VERIFIED' });
  });
  it('다른 cookie에 code와 party secret를 옮겨도 권위를 만들지 않는다', async () => {
    const f = fixture();
    await expect(
      IdentityBrowser.run({ current: generatePurposeSecret('PARTY_BROWSER') }, () =>
        f.service.assert(
          r('PartyClaimContext', 'party'),
          f.secret,
          r('RecoveryCase'),
          'new-party-challenge',
        ),
      ),
    ).rejects.toMatchObject({ code: 'PARTY_CONTEXT_REQUIRED' });
  });
  it('secret 단독/다른 secret는 권위가 아니다', async () => {
    const f = fixture();
    await expect(
      f.service.assert(
        r('PartyClaimContext', 'party'),
        f.secret,
        r('RecoveryCase'),
        'new-party-challenge',
      ),
    ).rejects.toMatchObject({ code: 'BROWSER_BINDING_REQUIRED' });
    await expect(
      IdentityBrowser.run({ current: f.browser }, () =>
        f.service.assert(
          r('PartyClaimContext', 'party'),
          generatePurposeSecret('PARTY_CONTEXT'),
          r('RecoveryCase'),
          'new-party-challenge',
        ),
      ),
    ).rejects.toMatchObject({ code: 'PARTY_CONTEXT_REQUIRED' });
  });
  it('다른 원래 case/challenge/epoch를 거절한다', async () => {
    for (const change of ['case', 'challenge', 'epoch']) {
      const f = fixture();
      if (change === 'epoch') f.source.fixture('PartyClaimContext', { ...f.row, epoch: 'next' });
      await expect(
        IdentityBrowser.run({ current: f.browser }, () =>
          f.service.assert(
            r('PartyClaimContext', 'party'),
            f.secret,
            r('RecoveryCase', change === 'case' ? 'other' : 'RecoveryCase'),
            change === 'challenge' ? 'other' : 'new-party-challenge',
          ),
        ),
      ).rejects.toMatchObject({ code: 'PARTY_CONTEXT_REQUIRED' });
    }
  });
  it('익명 PENDING 및 회수 문맥을 확인 당사자로 자동 승격하지 않는다', async () => {
    for (const state of ['PENDING', 'REVOKED']) {
      const f = fixture();
      f.source.fixture('PartyClaimContext', { ...f.row, state });
      await expect(
        IdentityBrowser.run({ current: f.browser }, () =>
          f.service.assert(
            r('PartyClaimContext', 'party'),
            f.secret,
            r('RecoveryCase'),
            'new-party-challenge',
          ),
        ),
      ).rejects.toMatchObject({ code: 'PARTY_CONTEXT_REQUIRED' });
    }
  });
  it('만료 정각/미보호 개정은 오래된 secret로 fallback하지 않는다', async () => {
    for (const mode of ['expiry', 'raw']) {
      const f = fixture();
      f.source.fixture(
        'PartyClaimContext',
        { ...f.row, ...(mode === 'expiry' ? { expiresAt: now.toISOString() } : { revision: 2 }) },
        mode !== 'raw',
      );
      await expect(
        IdentityBrowser.run({ current: f.browser }, () =>
          f.service.assert(
            r('PartyClaimContext', 'party'),
            f.secret,
            r('RecoveryCase'),
            'new-party-challenge',
          ),
        ),
      ).rejects.toThrow();
    }
  });
  it('정당한 VERIFIED 전이의 개정 증가가 immutable secret binding을 바꾸지 않는다', async () => {
    const f = fixture();
    f.source.fixture('PartyClaimContext', { ...f.row, revision: 2 });
    await expect(
      IdentityBrowser.run({ current: f.browser }, () =>
        f.service.assert(
          r('PartyClaimContext', 'party', 2),
          f.secret,
          r('RecoveryCase'),
          'new-party-challenge',
        ),
      ),
    ).resolves.toMatchObject({ revision: 2 });
  });
  it('서버가 만든 challenge와 직원 사설 경계 없이 새 문맥을 만들지 않는다', async () => {
    const f = fixture(),
      context = {
        attemptId: 'server-attempt',
        audience: 'CUSTOMER' as const,
        correlationId: 'trace',
        deadlineAt: new Date(now.getTime() + 10000).toISOString(),
      },
      input = { caseRef: r('RecoveryCase'), challengeId: 'client-invented' };
    await expect(f.service.create(context, input)).rejects.toMatchObject({
      code: 'PARTY_CHALLENGE_REQUIRED',
    });
    await expect(
      f.service.create(
        { ...context, audience: 'STAFF' },
        { ...input, challengeId: context.attemptId },
      ),
    ).rejects.toMatchObject({ code: 'STAFF_INGRESS_REQUIRED' });
  });
});
