import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import { U2Authentication, U2PartyCookies } from '../../../apps/api/src/u2-authentication.js';
import type { PurposeCookieMaterial } from '../../../apps/api/src/u2-authentication.js';
import { ApiSecurity } from '../../../apps/api/src/security.js';
import { SyntheticModelStore } from '../fixtures/identity.js';
const reference = (entity: string): Ref => ({
  owner: 'IdentityRecovery',
  entity,
  id: 'synthetic-' + entity,
  revision: 1,
});
// Tests this transport cipher/opaque bridge, not actual core authentication.
// The PG HTTP suite separately exercises the real registered authority.
function fixture() {
  let time = Date.now();
  const now = () => new Date(time),
    source = new SyntheticModelStore(),
    browser = randomBytes(32).toString('base64url'),
    handle = randomBytes(32).toString('base64url'),
    key = randomBytes(32),
    cookieHeaders: string[] = [],
    expiresAt = new Date(time + 300000).toISOString(),
    authority = {
      authorityId: 'synthetic-EnrollmentAuthority',
      revision: 1,
      accountRef: reference('Account'),
      bindingRef: reference('ProviderBinding'),
      bindingGeneration: 1,
      securityGeneration: 2,
      audience: 'CUSTOMER',
      purpose: 'MFA_REENROLMENT',
      sourceRef: reference('RecoveryCase'),
      invitationRef: null,
      challengeId: 'synthetic-challenge',
      verificationRef: null,
      partyContextRef: null,
      expiresAt,
      epoch: 'initial',
      state: 'ACTIVE',
    };
  source.fixture('EnrollmentAuthority', authority);
  const security = new ApiSecurity({
    audience: 'CUSTOMER',
    origin: 'http://127.0.0.1:3300',
    cookieKey: key,
    localSynthetic: true,
    staffAdmission: async () => null,
  });
  let calls = 0;
  const identity = {
      authenticatePurpose: async (
        selected: Ref,
        candidate: string,
        purpose: string,
        correlationId: string,
      ) => {
        calls++;
        requireCondition(
          selected.id === authority.authorityId &&
            candidate === handle &&
            purpose === authority.purpose &&
            time < Date.parse(expiresAt),
          401,
          'SYNTHETIC_NATIVE_HANDLE',
          '정확 fixture handle만 bridge에 넣습니다.',
        );
        return {
          principalId: authority.accountRef.id,
          actorAccountRef: authority.accountRef,
          verifiedPersonRef: null,
          identityAssertionRef: selected,
          audience: 'CUSTOMER',
          accessEvaluationRef: null,
          executionPermitRef: null,
          correlationId,
          deadlineAt: new Date(time + 10000).toISOString(),
        } satisfies ServiceContext;
      },
    },
    service = new U2Authentication(source.asStore(), identity, security, now),
    response = {
      append: (_name: string, value: string) => {
        cookieHeaders.push(value);
      },
    } as unknown as Response,
    material: PurposeCookieMaterial = {
      version: 1,
      purpose: 'MFA_REENROLMENT',
      authorityRef: reference('EnrollmentAuthority'),
      handle,
      expiresAt,
    };
  return {
    service,
    source,
    security,
    response,
    browser,
    handle,
    key,
    material,
    cookieHeaders,
    identity,
    now,
    advance: () => {
      time = Date.parse(expiresAt);
    },
    calls: () => calls,
    request: (cookie: string) =>
      ({ headers: { cookie: service.cookie + '=' + cookie } }) as Request,
  };
}
describe('BFF 목적 cookie의 actual authority와 구별된 cipher/bridge', () => {
  it('목적·당사자 cookie는 원래16byte GCM tag만 허용하며 단축/확장/변조는 native 권위 호출 전에 거절한다', async () => {
    const f = fixture(),
      purpose = await f.service.establish(f.response, f.material, f.browser),
      party = new U2PartyCookies(f.security, f.now),
      material = {
        partyContextRef: reference('PartyClaimContext'),
        challengeId: 'original-challenge',
        partySecret: randomBytes(32).toString('base64url'),
        expiresAt: f.material.expiresAt,
      };
    party.establish(f.response, material, f.browser);
    const encodedParty = f.cookieHeaders.at(-1)!.split(';')[0]!.split('=')[1]!,
      partyRequest = (cookie: string) =>
        ({ headers: { cookie: party.cookie + '=' + cookie } }) as Request;
    expect(
      party.material(partyRequest(encodedParty), f.browser).partySecret === material.partySecret,
    ).toBe(true);
    expect(f.service.material(f.request(purpose), f.browser).handle === f.handle).toBe(true);
    for (const [encoded, decode] of [
      [purpose, (cookie: string) => f.service.material(f.request(cookie), f.browser)],
      [encodedParty, (cookie: string) => party.material(partyRequest(cookie), f.browser)],
    ] as const) {
      const [iv, cipher, original] = encoded.split('.');
      for (const length of [4, 8, 15, 17]) {
        const tag = Buffer.from(original!, 'base64url'),
          changed = Buffer.alloc(length);
        tag.copy(changed);
        expect(() => decode([iv, cipher, changed.toString('base64url')].join('.'))).toThrow();
      }
      const tampered = Buffer.from(original!, 'base64url');
      tampered[0] = tampered[0]! ^ 1;
      expect(() => decode([iv, cipher, tampered.toString('base64url')].join('.'))).toThrow();
    }
    expect(f.calls()).toBe(0);
  });
  it('현재 보호 결과의 handle은 암호 cookie에만 넣고 HttpOnly/Secure/Strict·원래5분을 유지한다', async () => {
    const f = fixture(),
      cookie = await f.service.establish(f.response, f.material, f.browser);
    expect(cookie).not.toContain(f.handle);
    expect(f.cookieHeaders[0]).toMatch(/Secure; HttpOnly; SameSite=Strict; Max-Age=300$/);
    expect(f.service.material(f.request(cookie), f.browser)).toEqual(f.material);
    expect(f.calls()).toBe(0);
  });
  it('다른 browser/origin/audience/key 및 tampered tag는 native call 전에 거절한다', async () => {
    const f = fixture(),
      cookie = await f.service.establish(f.response, f.material, f.browser);
    expect(() =>
      f.service.material(f.request(cookie), randomBytes(32).toString('base64url')),
    ).toThrow();
    expect(() => f.service.material(f.request(cookie.slice(0, -2) + 'aa'), f.browser)).toThrow();
    for (const changed of [{ origin: 'http://127.0.0.1:3301' }, { cookieKey: randomBytes(32) }]) {
      const security = new ApiSecurity({ ...f.security.configuration, ...changed }),
        other = new U2Authentication(f.source.asStore(), f.identity, security, f.now);
      expect(() => other.material(f.request(cookie), f.browser)).toThrow();
    }
    expect(f.calls()).toBe(0);
  });
  it('cookie 보유만으로 schema context를 만들지 않고 native handle 검증 뒤 exact 객체만 core로 넘긴다', async () => {
    const f = fixture(),
      cookie = await f.service.establish(f.response, f.material, f.browser),
      context = await f.service.authenticate(
        f.request(cookie),
        f.browser,
        'MFA_REENROLMENT',
        'trace',
        null,
      );
    expect(f.calls()).toBe(1);
    expect(f.service.resolve(context)).toMatchObject({
      principalId: 'synthetic-Account',
      identityAssertionRef: f.material.authorityRef,
    });
    expect(() => f.service.resolve({ ...context })).toThrow();
    context.securityGeneration = 999;
    expect(() => f.service.resolve(context)).toThrow();
  });
  it('다른 목적/정각 만료/primary-only authority 변경은 이전 cookie로 fallback하지 않는다', async () => {
    const f = fixture(),
      cookie = await f.service.establish(f.response, f.material, f.browser);
    await expect(
      f.service.authenticate(f.request(cookie), f.browser, 'INVITATION_ACCEPTANCE', 'trace', null),
    ).rejects.toThrow();
    f.advance();
    expect(() => f.service.material(f.request(cookie), f.browser)).toThrow();
    const g = fixture();
    g.source.fixture(
      'EnrollmentAuthority',
      {
        ...g.source.protectedRows.get('EnrollmentAuthority')!.values().next().value!,
        state: 'REVOKED',
        revision: 2,
      },
      false,
    );
    await expect(g.service.establish(g.response, g.material, g.browser)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
  });
  it('caller boolean/header/context 대신 current source 재검증을 응답 전에 다시 실행한다', async () => {
    const f = fixture(),
      cookie = await f.service.establish(f.response, f.material, f.browser),
      context = await f.service.authenticate(
        f.request(cookie),
        f.browser,
        'MFA_REENROLMENT',
        'trace',
        null,
      );
    await f.service.assertCurrent(context);
    expect(f.calls()).toBe(2);
    await expect(f.service.assertCurrent({ ...context })).rejects.toThrow();
  });
});
