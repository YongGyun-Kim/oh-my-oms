import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { ExecutionBudget } from '@oms/contracts';
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import {
  CognitoRecoveryPort,
  recoveryCapabilities,
  assertRecoveryCapability,
  assertRecoveryObservation,
} from '@oms/integrations';
import type { RecoveryProviderTarget, RecoveryProviderObservation } from '@oms/core';
import { cognitoTotpSecretBytes } from '../../../packages/integrations/src/cognito-recovery.js';
import { StatefulRecoveryProvider } from '../fixtures/provider.js';
import { SyntheticClock } from '../fixtures/clock.js';
import { totp } from '../fixtures/pc.js';
// Only the pure PC code calculator is used here; browser hooks are not a unit runner.
vi.mock('@playwright/test', () => ({
  test: { afterEach: () => undefined },
  expect: () => {
    throw Error('단위 시험은 browser assertion을 호출하지 않습니다.');
  },
}));
const target: RecoveryProviderTarget = {
    approvedOperationId: 'approved-work',
    workId: 'work',
    caseRef: { owner: 'IdentityRecovery', entity: 'RecoveryCase', id: 'case', revision: 3 },
    accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: 'account', revision: 1 },
    bindingRef: {
      owner: 'IdentityRecovery',
      entity: 'ProviderBinding',
      id: 'binding',
      revision: 1,
    },
    issuer: 'synthetic-issuer',
    subject: 'synthetic-subject',
    audience: 'CUSTOMER',
    bindingGeneration: 1,
    securityGeneration: 2,
    epoch: 'initial',
    inputDigest: 'a'.repeat(64),
    deadlineAt: '2026-10-10T00:05:00Z',
  },
  known: RecoveryProviderObservation = {
    approvedOperationId: target.approvedOperationId,
    workId: target.workId,
    bindingRef: target.bindingRef,
    inputDigest: target.inputDigest,
    epoch: target.epoch,
    providerRequestId: 'synthetic-observed',
    knowledge: 'KNOWN',
    effect: 'REMOVED',
    terminal: true,
    evidenceRefs: [target.caseRef],
    observedAt: '2026-10-10T00:00:00Z',
  };
describe('등록 capability와 원래 제공자 관측의 닫힌 경계', () => {
  it('실제 PC 생성기와 strict 합성 provider는29.999초 동일step을 확인하고30.000초의 옛코드를 거절한다', async () => {
    const clock = new SyntheticClock(Date.parse('2026-10-10T00:00:29.999Z')),
      provider = new StatefulRecoveryProvider(clock.now),
      secret = Buffer.from('12345678901234567890'),
      proof = {
        issuer: target.issuer,
        subject: target.subject,
        audience: 'CUSTOMER' as const,
        evidenceRefs: [target.accountRef],
        providerHandle: 'synthetic-original-password',
        requiresEnrolment: false,
      };
    provider.subjects.set(proof.issuer + ':' + proof.subject, {
      removed: false,
      signedOut: false,
      passwordDigest: null,
      secret,
      challenge: null,
      verified: true,
    });
    try {
      const original = totp(secret, clock.now().getTime());
      expect((await provider.factor(proof, original)).verified).toBe(true);
      clock.advance(1);
      await expect(provider.factor(proof, original)).rejects.toMatchObject({ code: 'MFA_DENIED' });
      expect((await provider.factor(proof, totp(secret, clock.now().getTime()))).verified).toBe(
        true,
      );
    } finally {
      secret.fill(0);
    }
  });
  it('PC용 TOTP 시계만 주입해도 provider 관측은 별도 진행시계를 유지하고 strict step 거부는 남는다', async () => {
    const wall = new SyntheticClock(Date.parse('2026-10-10T00:00:29.999Z')),
      factor = new SyntheticClock(wall.now().getTime()),
      provider = new StatefulRecoveryProvider(wall.now, factor.now),
      secret = Buffer.from('12345678901234567890'),
      proof = {
        issuer: target.issuer,
        subject: target.subject,
        audience: 'CUSTOMER' as const,
        evidenceRefs: [target.accountRef],
        providerHandle: 'synthetic-original-password',
        requiresEnrolment: false,
      };
    provider.subjects.set(proof.issuer + ':' + proof.subject, {
      removed: false,
      signedOut: false,
      passwordDigest: null,
      secret,
      challenge: null,
      verified: true,
    });
    try {
      const original = totp(secret, factor.now().getTime());
      wall.advance(300001);
      expect((await provider.factor(proof, original)).verified).toBe(true);
      const observed = await provider.observeOriginal(target, new ExecutionBudget(5000));
      expect(observed.observedAt).toBe(wall.now().toISOString());
      expect(observed.knowledge).toBe('UNKNOWN');
      factor.advance(1);
      await expect(provider.factor(proof, original)).rejects.toMatchObject({ code: 'MFA_DENIED' });
      expect((await provider.factor(proof, totp(secret, factor.now().getTime()))).verified).toBe(
        true,
      );
    } finally {
      secret.fill(0);
    }
  });
  it('stateful local provider만 원래 종료/늦은 effect 격리 fixture를 등록하고 realActivation은 false다', () => {
    const caps = recoveryCapabilities('SYNTHETIC', 'LOCAL_SYNTHETIC');
    expect(caps).toMatchObject({
      sdkMaxAttempts: 1,
      subjectMutationLimit: 1,
      originalTermination: true,
      lateEffectIsolation: true,
      realActivation: false,
    });
    expect(() => assertRecoveryCapability(caps, 'REMOVE_ORIGINAL_FACTOR')).not.toThrow();
  });
  it('Cognito SDK method 지원 double은 실제 원래 종료 capability가 아니다', () =>
    expect(recoveryCapabilities('COGNITO', 'LOCAL_SDK_DOUBLE')).toMatchObject({
      originalTermination: false,
      lateEffectIsolation: false,
      realActivation: false,
    }));
  it('현재 실제 미등록 Cognito/향후 Keycloak을 local 성공으로 활성화하지 않는다', () => {
    for (const provider of ['COGNITO', 'KEYCLOAK'] as const)
      expect(() =>
        assertRecoveryCapability(
          recoveryCapabilities(provider, 'UNREGISTERED'),
          'REMOVE_ORIGINAL_FACTOR',
        ),
      ).toThrow();
  });
  it('provider/profile 혼합과 caller의 재시도/동시 mutation 확대는 실패다', () => {
    expect(() => recoveryCapabilities('COGNITO', 'LOCAL_SYNTHETIC')).toThrow();
    expect(() => recoveryCapabilities('KEYCLOAK', 'LOCAL_SDK_DOUBLE')).toThrow();
    for (const change of [
      { sdkMaxAttempts: 2 },
      { subjectMutationLimit: 2 },
      { realActivation: true },
    ])
      expect(() =>
        assertRecoveryCapability(
          { ...recoveryCapabilities('SYNTHETIC', 'LOCAL_SYNTHETIC'), ...change } as ReturnType<
            typeof recoveryCapabilities
          >,
          'REMOVE_ORIGINAL_FACTOR',
        ),
      ).toThrow();
  });
  it('원래 exact operation/work/binding/input/epoch의 terminal 근거만 KNOWN이다', () =>
    expect(() => assertRecoveryObservation(target, known)).not.toThrow());
  it('다른 원래 작업/target/input/세대 결과는 현재 성공을 대체하지 않는다', () => {
    for (const change of [
      { approvedOperationId: 'other' },
      { workId: 'other' },
      { bindingRef: { ...target.bindingRef, revision: 2 } },
      { inputDigest: 'b'.repeat(64) },
      { epoch: 'other' },
    ])
      expect(() => assertRecoveryObservation(target, { ...known, ...change })).toThrow();
  });
  it('수락/HTTP200/근거 없는 probe는 원래 effect 종료로 승격하지 않는다', () => {
    for (const change of [
      { terminal: false },
      { effect: 'UNCONFIRMED' as const },
      { evidenceRefs: [] },
      { providerRequestId: '' },
    ])
      expect(() => assertRecoveryObservation(target, { ...known, ...change })).toThrow();
  });
  it('UNKNOWN은 사실대로 유지하며 malformed 관측/초과 근거는 실패다', () => {
    expect(() =>
      assertRecoveryObservation(target, {
        ...known,
        knowledge: 'UNKNOWN',
        effect: 'UNCONFIRMED',
        terminal: false,
        evidenceRefs: [],
      }),
    ).not.toThrow();
    expect(() => assertRecoveryObservation(target, { ...known, observedAt: 'unknown' })).toThrow();
    expect(() =>
      assertRecoveryObservation(target, { ...known, evidenceRefs: Array(21).fill(target.caseRef) }),
    ).toThrow();
  });
});
describe('Cognito SDK double의 정확 pool/명령과 실제 unknown 인계', () => {
  const config = {
    region: 'ap-northeast-2' as const,
    pools: {
      CUSTOMER: {
        poolId: 'ap-northeast-2_syntheticCustomer',
        clientId: 'syntheticCustomer',
        clientSecret: null,
      },
      STAFF: {
        poolId: 'ap-northeast-2_syntheticStaff',
        clientId: 'syntheticStaff',
        clientSecret: null,
      },
    },
  };
  function fixture(failure?: string, prepared: Record<string, unknown> = {}) {
    const calls: { name: string; input: Record<string, unknown> }[] = [],
      client = {
        send: async (command: {
          constructor: { name: string };
          input: Record<string, unknown>;
        }) => {
          calls.push({ name: command.constructor.name, input: command.input });
          if (failure)
            throw Object.assign(Error('원문 없는 합성 SDK 오류'), {
              name: failure,
              $metadata: { requestId: 'synthetic-failed' },
            });
          return {
            $metadata: { requestId: 'synthetic-response', httpStatusCode: 200 },
            ...prepared,
          };
        },
      } as unknown as CognitoIdentityProviderClient,
      port = new CognitoRecoveryPort(config, client, 'LOCAL_SDK_DOUBLE'),
      selected = {
        ...target,
        issuer: 'https://cognito-idp.ap-northeast-2.amazonaws.com/' + config.pools.CUSTOMER.poolId,
        subject: 'synthetic-subject',
        deadlineAt: new Date(Date.now() + 30000).toISOString(),
      };
    return { calls, client, port, selected };
  }
  it('관리 제거/전체 signout은 원래 subject/pool에 각각 한 SDK 호출이며 응답 수락은 UNKNOWN이다', async () => {
    for (const operation of ['REMOVE_ORIGINAL_FACTOR', 'SIGN_OUT_ORIGINAL_SESSIONS'] as const) {
      const f = fixture(),
        result = await f.port.execute(operation, f.selected, null, new ExecutionBudget(5000));
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]?.name).toBe(
        operation === 'REMOVE_ORIGINAL_FACTOR'
          ? 'AdminDeleteSoftwareTokenCommand'
          : 'AdminUserGlobalSignOutCommand',
      );
      expect(f.calls[0]?.input).toEqual({
        UserPoolId: config.pools.CUSTOMER.poolId,
        Username: f.selected.subject,
      });
      expect(result).toMatchObject({
        knowledge: 'UNKNOWN',
        effect: 'UNCONFIRMED',
        terminal: false,
        evidenceRefs: [],
      });
    }
  });
  it('첫 수단은 당사자 새 비밀만 permanent 명령으로 보내고 현재 MFA/일반 session으로 승격하지 않는다', async () => {
    const f = fixture(),
      password = Buffer.from('synthetic-private-password'),
      result = await f.port.execute(
        'REPLACE_FIRST_FACTOR',
        f.selected,
        password,
        new ExecutionBudget(5000),
      );
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.name).toBe('AdminSetUserPasswordCommand');
    expect(f.calls[0]?.input.Permanent).toBe(true);
    expect(f.calls[0]?.input.Password === password.toString()).toBe(true);
    expect(result.terminal).toBe(false);
  });
  it('고객/직원 issuer나 이전/누락 target metadata를 섞으면 SDK 전에 거절한다', async () => {
    for (const changed of [
      { audience: 'STAFF' as const },
      { subject: '' },
      { inputDigest: 'bad' },
      { deadlineAt: new Date(0).toISOString() },
    ]) {
      const f = fixture();
      await expect(
        f.port.execute(
          'REMOVE_ORIGINAL_FACTOR',
          { ...f.selected, ...changed },
          null,
          new ExecutionBudget(5000),
        ),
      ).rejects.toThrow();
      expect(f.calls).toHaveLength(0);
    }
  });
  it('timeout/ResourceNotFound/unknown 오류는 no-effect/재시도 가능으로 추측하지 않는다', async () => {
    for (const name of ['TimeoutError', 'ResourceNotFoundException', 'Unexpected']) {
      const f = fixture(name),
        result = await f.port.execute(
          'REMOVE_ORIGINAL_FACTOR',
          f.selected,
          null,
          new ExecutionBudget(5000),
        );
      expect(result).toMatchObject({
        knowledge: 'UNKNOWN',
        terminal: false,
        effect: 'UNCONFIRMED',
      });
      expect(f.calls).toHaveLength(1);
    }
  });
  it('실제 미등록 profile과 실제 pool로 명명한 SDK double은 send 전 HOLD다', async () => {
    const f = fixture(),
      unregistered = new CognitoRecoveryPort(config, f.client);
    await expect(
      unregistered.execute('REMOVE_ORIGINAL_FACTOR', f.selected, null, new ExecutionBudget(5000)),
    ).rejects.toMatchObject({ code: 'RECOVERY_PROVIDER_HOLD' });
    expect(f.calls).toHaveLength(0);
    expect(
      () =>
        new CognitoRecoveryPort(
          {
            ...config,
            pools: {
              ...config.pools,
              CUSTOMER: { ...config.pools.CUSTOMER, poolId: 'ap-northeast-2_real' },
            },
          },
          f.client,
          'LOCAL_SDK_DOUBLE',
        ),
    ).toThrow();
  });
  it('관측 조회/현재 factor 없음 probe는 원래 호출 종료 SDK를 만들어내지 않는다', async () => {
    const f = fixture(),
      result = await f.port.observeOriginal(f.selected, new ExecutionBudget(5000));
    expect(result).toMatchObject({ knowledge: 'UNKNOWN', terminal: false });
    expect(f.calls).toHaveLength(0);
  });
  it('whitespace/초과/invalid UTF8 첫 비밀은 모델·SDK에 들어가지 않는다', async () => {
    for (const password of [Buffer.from('a b'), Buffer.alloc(257, 65), Buffer.from([0xff])]) {
      const f = fixture();
      await expect(
        f.port.execute('REPLACE_FIRST_FACTOR', f.selected, password, new ExecutionBudget(5000)),
      ).rejects.toThrow();
      expect(f.calls).toHaveLength(0);
    }
  });
  it('다른 대상 proof와 6자리 아닌 새 TOTP는 provider 준비/확인 전에 거절한다', async () => {
    const f = fixture(),
      proof = {
        issuer: f.selected.issuer,
        subject: 'other',
        audience: 'CUSTOMER' as const,
        evidenceRefs: [target.accountRef],
        providerHandle: '{}',
        requiresEnrolment: true,
      };
    await expect(
      f.port.beginFactor(f.selected, proof, new ExecutionBudget(5000)),
    ).rejects.toMatchObject({ code: 'RECOVERY_PROVIDER_PROOF' });
    await expect(
      f.port.verifyFactor(
        f.selected,
        { ...proof, subject: f.selected.subject },
        Buffer.from('{}'),
        Buffer.from('123'),
        new ExecutionBudget(5000),
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_FACTOR_FORMAT' });
    expect(f.calls).toHaveLength(0);
  });
  it('실제 pinned SDK 명령 double의 beginFactor는 같은 setup key/challenge를 정규화하고 UNKNOWN을 유지한다', async () => {
    const encoded = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      f = fixture(undefined, { SecretCode: encoded, Session: 'synthetic-followup-session' }),
      proof = {
        issuer: f.selected.issuer,
        subject: f.selected.subject,
        audience: 'CUSTOMER' as const,
        evidenceRefs: [target.accountRef],
        providerHandle: JSON.stringify({
          step: 'MFA_SETUP',
          username: f.selected.subject,
          session: 'synthetic-original-session',
        }),
        requiresEnrolment: true,
      };
    const result = await f.port.beginFactor(f.selected, proof, new ExecutionBudget(5000));
    expect(result.secret.equals(Buffer.from('12345678901234567890'))).toBe(true);
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(1n);
    const hash = createHmac('sha1', result.secret).update(counter).digest(),
      offset = hash.at(-1)! & 15;
    expect(
      String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0') === '287082',
    ).toBe(true);
    expect(
      JSON.parse(result.providerChallenge.toString()).session === 'synthetic-followup-session',
    ).toBe(true);
    expect(f.calls.map((c) => c.name)).toEqual(['AssociateSoftwareTokenCommand']);
    expect(result.observation).toMatchObject({
      knowledge: 'UNKNOWN',
      terminal: false,
      effect: 'UNCONFIRMED',
    });
    result.secret.fill(0);
    result.providerChallenge.fill(0);
    const invalid = fixture(undefined, {
      SecretCode: encoded + 'A',
      Session: 'synthetic-followup-session',
    });
    await expect(
      invalid.port.beginFactor(
        invalid.selected,
        { ...proof, issuer: invalid.selected.issuer },
        new ExecutionBudget(5000),
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_FACTOR_ENCODING' });
    expect(invalid.calls).toHaveLength(1);
  });
  it('Cognito setup key는 UTF8 문자열의 이중 Base32가 아닌 원래 TOTP key bytes다', () => {
    // RFC6238 공개 test vector; 실제 사용자 secret이 아니다.
    const encoded = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      expected = Buffer.from('12345678901234567890');
    expect(cognitoTotpSecretBytes(encoded).equals(expected)).toBe(true);
    expect(cognitoTotpSecretBytes(encoded).equals(Buffer.from(encoded))).toBe(false);
    for (const [suffix, n] of [
      ['AA', 1],
      ['AAAA', 2],
      ['AAAAA', 3],
      ['AAAAAAA', 4],
      ['AAAAAAAA', 5],
    ] as const)
      expect(
        cognitoTotpSecretBytes(encoded + suffix).equals(Buffer.concat([expected, Buffer.alloc(n)])),
      ).toBe(true);
    for (const wrong of [
      ' ' + encoded,
      encoded.toLowerCase(),
      encoded + '=',
      encoded.slice(0, 15),
      encoded + 'A',
      encoded + 'B',
      'A'.repeat(65537),
    ])
      expect(() => cognitoTotpSecretBytes(wrong)).toThrow(
        expect.objectContaining({ code: 'RECOVERY_FACTOR_ENCODING' }),
      );
  });
});
