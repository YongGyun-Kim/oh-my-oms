import { describe, expect, it } from 'vitest';
import {
  declareU3HostOperations,
  declareU3Operations,
  OperationRegistry,
  SchemaValidator,
  U3_PROFILE,
} from '@oms/contracts';
import { fixtureRef } from '../fixtures/identity.js';

describe('서버 등록 C01 grant·C18 현재 접수 소비자 계약', () => {
  const schema = new SchemaValidator(),
    registry = new OperationRegistry(schema);
  declareU3Operations(registry);
  declareU3HostOperations(registry);
  it('닫힌 새 역할/ScopeV2 참조의 접수와 probe를 연결하고 구형 출력은 재정의하지 않는다', () => {
    const role = fixtureRef('EnterpriseAccess', 'CustomerRole'),
      scope = fixtureRef('EnterpriseAccess', 'ScopeV2'),
      receipt = {
        requestId: 'request',
        requestState: 'RESULT_RECORDED',
        owner: 'EnterpriseAccess',
        targetRef: role,
        resultRefs: [role, scope],
        acceptedAt: '2026-10-12T00:00:00.000Z',
        updatedAt: '2026-10-12T00:00:00.000Z',
        statusRevision: 1,
        retryAfterMilliseconds: null,
      },
      probe = { disposition: 'RECEIPT', receipt, observedAt: receipt.updatedAt };
    expect(
      schema.validateUri(registry.lookup('WorkInquiry', 'readReceipt', 3).output, receipt),
    ).toEqual(receipt);
    expect(
      schema.validateUri(registry.lookup('WorkInquiry', 'probeOriginalReceipt', 3).output, probe),
    ).toEqual(probe);
    expect(() => schema.validate('Receipt', receipt)).toThrow();
    expect(() =>
      schema.validateUri('urn:oms:contract:foundation:1#/$defs/OriginalReceiptProbe', probe),
    ).toThrow();
    for (const invalid of [
      { ...probe, profile: U3_PROFILE },
      { ...probe, receipt: { ...receipt, resultRefs: [{ ...scope, owner: 'Unknown' }] } },
      { ...probe, receipt: { ...receipt, resultRefs: [{ ...scope, entity: 'Unknown' }] } },
      { ...probe, receipt: { ...receipt, modelVersion: 1 } },
    ])
      expect(() =>
        schema.validateUri(U3_PROFILE + '#/$defs/OriginalReceiptProbe', invalid),
      ).toThrow();
  });
  it('원래 접수 미확정 상태·입력 대상/권한 계약은 유한하게 유지한다', () => {
    const input = {
      meta: {
        clientRequestId: 'key',
        expectedRevision: null,
        reason: '합성 부여',
        evidenceRefs: [],
      },
      accountRef: fixtureRef('IdentityRecovery', 'Account'),
      roleRef: fixtureRef('EnterpriseAccess', 'StaffRole'),
      decision: 'GRANT',
    };
    expect(
      schema.validateUri(registry.lookup('EnterpriseAccess', 'grantStaffRole', 3).input, input),
    ).toEqual(input);
    expect(registry.lookup('EnterpriseAccess', 'grantCustomerRole', 3)).toMatchObject({
      targetKind: 'ENTERPRISE',
      action: 'role.manage',
    });
    expect(() => registry.lookup('WorkInquiry', 'readReceipt', 4)).toThrow();
    expect(() =>
      schema.validateUri(registry.lookup('WorkInquiry', 'readReceipt', 3).input, {
        requestId: 'request',
        version: 3,
      }),
    ).toThrow();
    const unknown = {
      disposition: 'UNCONFIRMED',
      clientRequestId: 'key',
      observedAt: '2026-10-12T00:00:00.000Z',
      safeReason: 'ORIGINAL_OUTCOME_RECONCILIATION_REQUIRED',
    };
    expect(schema.validateUri(U3_PROFILE + '#/$defs/OriginalReceiptProbe', unknown)).toEqual(
      unknown,
    );
  });
});
