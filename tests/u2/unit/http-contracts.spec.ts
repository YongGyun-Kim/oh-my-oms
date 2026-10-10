import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import {
  assertU2ResourceInput,
  U2_API_ROUTES,
  u2RouteInput,
} from '../../../apps/api/src/u2-routes.js';
import { OperationRegistry, SchemaValidator, declareU2Operations } from '@oms/contracts';
describe('U2 HTTP 닫힌 profile/원래 target·유한 입력', () => {
  it('각 person route는 실제 version1 등록 계약에 매핑하고 SYSTEM operator route는 없다', () => {
    const registry = new OperationRegistry(new SchemaValidator());
    declareU2Operations(registry);
    for (const route of U2_API_ROUTES) {
      const op = registry.lookup(route.owner, route.operation, route.version);
      expect(op.targetKind).toBe(route.target);
      expect(op.audience).not.toEqual(['SYSTEM']);
      expect(op.kind).toBe(route.method === 'get' ? 'query' : 'command');
    }
    expect(new Set(U2_API_ROUTES.map((route) => route.method + ':' + route.path)).size).toBe(
      U2_API_ROUTES.length,
    );
  });
  it('제한 목적 query만 그 cookie/context를 쓰며 safeGET에 소비/변경 작업을 등록하지 않는다', () => {
    for (const route of U2_API_ROUTES.filter((route) => route.contextKind === 'PURPOSE'))
      expect(route.purpose).toMatch(/^(MFA_REENROLMENT|INVITATION_ACCEPTANCE)$/);
    expect(U2_API_ROUTES.filter((route) => route.public).map((route) => route.operation)).toEqual([
      'reobserveHandoff',
      'requestRecovery',
      'prepareSavedRecovery',
      'recoverSavedCode',
      'createPartyContext',
      'claimHandoff',
    ]);
  });
  it('정상 role100/predicate200/evidence20 경계를 그대로 허용한다', () =>
    expect(() =>
      assertU2ResourceInput({
        roleRefs: Array(100).fill('role'),
        predicates: Array(200).fill({ kind: 'ALL' }),
        meta: { evidenceRefs: Array(20).fill('evidence') },
      }),
    ).not.toThrow());
  it('64KiB/depth16/string4096/알려진 목록 상한은 초과 입력을 거절한다', () => {
    for (const input of [
      { roleRefs: Array(101).fill('role') },
      { predicates: Array(201).fill({}) },
      { meta: { evidenceRefs: Array(21).fill('evidence') } },
      { value: 'a'.repeat(4097) },
      { values: Array(20).fill('a'.repeat(4096)) },
    ])
      expect(() => assertU2ResourceInput(input)).toThrow();
    let deep: unknown = null;
    for (let i = 0; i < 17; i++) deep = { child: deep };
    expect(() => assertU2ResourceInput(deep)).toThrow();
  });
  it('prototype/비정규 JSON값은 parser/owner에 넘기지 않는다', () => {
    expect(() => assertU2ResourceInput(JSON.parse('{"__proto__":{"admin":true}}'))).toThrow();
    expect(() => assertU2ResourceInput({ number: NaN })).toThrow();
  });
  it('정확 caseRef/경로/header revision/key만 같은 원래 command다', () => {
    const route = U2_API_ROUTES.find((route) => route.operation === 'issueHandoff')!,
      source = { owner: 'IdentityRecovery', entity: 'RecoveryCase', id: 'case', revision: 2 },
      request = {
        method: 'POST',
        body: { meta: { clientRequestId: 'original' }, caseRef: source },
        headers: { 'idempotency-key': 'original' },
      } as unknown as Request;
    expect(u2RouteInput(route, request, { kind: 'RECORD', recordRef: source })).toEqual(
      request.body,
    );
    for (const changed of [
      { ...source, id: 'other' },
      { ...source, revision: 3 },
      { ...source, owner: 'EnterpriseAccess' },
    ])
      expect(() => u2RouteInput(route, request, { kind: 'RECORD', recordRef: changed })).toThrow();
    expect(() =>
      u2RouteInput(
        route,
        { ...request, headers: { 'idempotency-key': 'other' } } as unknown as Request,
        { kind: 'RECORD', recordRef: source },
      ),
    ).toThrow();
  });
  it('query는 허용 페이지 조건만 정규화하고 purpose 상태GET에 body/effect를 만들지 않는다', () => {
    const route = U2_API_ROUTES.find((route) => route.operation === 'readMemberships')!,
      request = { method: 'GET', query: {} } as unknown as Request;
    expect(
      u2RouteInput(route, request, {
        kind: 'ENTERPRISE',
        enterpriseRef: {
          owner: 'EnterpriseAccess',
          entity: 'Enterprise',
          id: 'enterprise',
          revision: 1,
        },
      }),
    ).toEqual({ cursor: null, pageSize: 25, filter: 'ALL' });
    expect(() =>
      u2RouteInput(route, { ...request, query: { sql: 'unregistered' } } as unknown as Request, {
        kind: 'NONE',
      }),
    ).toThrow();
  });
});
