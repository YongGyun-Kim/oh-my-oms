import { beforeEach, describe, expect, it } from 'vitest';
import { declareFoundationOperations, OperationRegistry, SchemaValidator } from '@oms/contracts';
import type { Invocation, Operation } from '@oms/contracts';

describe('registry/생산자/소비자 경계', () => {
  let schema: SchemaValidator;
  let registry: OperationRegistry;
  const operation: Operation = {
    owner: 'IdentityRecovery',
    name: 'startLogin',
    contract: 'C01',
    version: 2,
    audience: ['CUSTOMER'],
    action: null,
    kind: 'command',
    input: 'urn:oms:contract:common:2#/$defs/LoginInput',
    output: 'urn:oms:contract:common:2#/$defs/IdentityView',
    context: 'urn:oms:contract:common:2#/$defs/PreIdentityContext',
    targetKind: 'NONE',
  };
  const invocation: Invocation = {
    context: {
      attemptId: 'attempt-a',
      audience: 'CUSTOMER',
      correlationId: 'trace-a',
      deadlineAt: '2026-10-08T12:00:00Z',
    },
    target: { kind: 'NONE' },
    data: { loginIdentifier: 'synthetic-a' },
  };
  const result = {
    accountRef: null,
    challengeId: 'challenge-a',
    phase: 'CHALLENGE_REQUIRED',
    personLinkRef: null,
    resultRefs: [],
  };
  beforeEach(() => {
    schema = new SchemaValidator();
    registry = new OperationRegistry(schema);
    registry.declare(operation);
  });
  it('등록한 version/owner의 검증된 input/output만 연결한다', async () => {
    registry.bind('IdentityRecovery', 'startLogin', 2, async () => result);
    expect(await registry.invoke('IdentityRecovery', 'startLogin', 2, invocation)).toEqual(result);
  });
  it('handler 미등록은 성공 stub이 아니다', async () => {
    await expect(
      registry.invoke('IdentityRecovery', 'startLogin', 2, invocation),
    ).rejects.toMatchObject({ code: 'MODULE_NOT_REGISTERED' });
  });
  it('미등록 owner/version을 거절한다', () => {
    expect(() => registry.bind('EnterpriseAccess', 'startLogin', 2, async () => result)).toThrow();
    expect(() => registry.lookup('IdentityRecovery', 'startLogin', 1)).toThrow();
  });
  it('중복 작업 선언과 binding을 거절한다', () => {
    expect(() => registry.declare(operation)).toThrow();
    registry.bind('IdentityRecovery', 'startLogin', 2, async () => result);
    expect(() => registry.bind('IdentityRecovery', 'startLogin', 2, async () => result)).toThrow();
  });
  it('STAFF/잘못된 target/위조 context를 거절한다', async () => {
    registry.bind('IdentityRecovery', 'startLogin', 2, async () => result);
    await expect(
      registry.invoke('IdentityRecovery', 'startLogin', 2, {
        ...invocation,
        context: { ...invocation.context, audience: 'STAFF' },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      registry.invoke('IdentityRecovery', 'startLogin', 2, {
        ...invocation,
        target: { kind: 'REQUEST', requestId: 'request-a' },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      registry.invoke('IdentityRecovery', 'startLogin', 2, {
        ...invocation,
        context: { ...invocation.context, role: 'admin' },
      } as unknown as Invocation),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('미등록 producer output property를 기술실패로 반환한다', async () => {
    registry.bind('IdentityRecovery', 'startLogin', 2, async () => ({
      ...result,
      token: 'canary',
    }));
    await expect(
      registry.invoke('IdentityRecovery', 'startLogin', 2, invocation),
    ).rejects.toMatchObject({ code: 'INVALID_PRODUCER', status: 503 });
  });
  it('CE01–04가 실제 계약으로 선언되지만 자동 binding은 없다', async () => {
    const complete = new OperationRegistry(schema);
    declareFoundationOperations(complete);
    expect(complete.lookup('EnterpriseAccess', 'setOrderingContextPolicy').contract).toBe('CE01');
    expect(complete.lookup('EnterpriseAccess', 'designateInitialAdministrator').contract).toBe(
      'CE02',
    );
    expect(complete.lookup('OrderAcceptance', 'readReviewAssessment').contract).toBe('CE03');
    expect(complete.lookup('EnterpriseAccess', 'listApplications').contract).toBe('CE04');
    await expect(
      complete.invoke('EnterpriseAccess', 'listApplications', 2, invocation),
    ).rejects.toMatchObject({ code: 'MODULE_NOT_REGISTERED' });
  });
  it('등록된 worker wire도 원래 correlationId required를 유지한다', () => {
    expect(() => schema.validate('Work', {})).toThrow();
    expect(() =>
      schema.validateUri('urn:oms:contract:foundation:1#/$defs/RecoveryPayload', {
        schemaVersion: 1,
        epoch: 'epoch',
        commitOrder: 1,
        requestId: 'request-a',
        correlationId: 'trace-a',
        rows: [],
        previousDigest: null,
        contentDigest: 'a'.repeat(64),
      }),
    ).toThrow();
  });
});
