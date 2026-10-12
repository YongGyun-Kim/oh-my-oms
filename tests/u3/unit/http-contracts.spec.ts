import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import {
  declareU3HostOperations,
  declareU3Operations,
  OperationRegistry,
  SchemaValidator,
} from '@oms/contracts';
import {
  U3_API_ROUTES,
  matchU3Route,
  u3BodyLimit,
  u3RouteInput,
  u3RouteTarget,
} from '../../../apps/api/src/u3-routes.js';
import { u3RuntimeRequested } from '../../../apps/api/src/u3-runtime.js';
import { fixtureRef, fixtureScope } from '../fixtures/identity.js';

// 경로 변환기가 읽는 필드만 갖춘 대역이다. 실제 Express/parser 동작은 HTTP 통합에서 검사한다.
const requestFixture = (fields: Partial<Request>): Request => fields as Request;

describe('서버 고정 U3 HTTP 경로·개정·유한 입력 계약', () => {
  const schema = new SchemaValidator(),
    registry = new OperationRegistry(schema);
  declareU3Operations(registry);
  declareU3HostOperations(registry);
  it('31개 업무/역할과 별도 grant·C18 5개를 중복 없이 실제 등록 계약에 연결한다', () => {
    expect(U3_API_ROUTES).toHaveLength(36);
    expect(new Set(U3_API_ROUTES.map((route) => route.method + ':' + route.path)).size).toBe(36);
    for (const route of U3_API_ROUTES) {
      const declaration = registry.lookup(route.owner, route.operation, 3);
      expect(declaration.targetKind).toBe(route.target);
      expect(matchU3Route(route.method.toUpperCase(), route.path.replace(':id', 'actual-id'))).toBe(
        route,
      );
    }
    expect(matchU3Route('GET', '/requests/original')!.operation).toBe('lookupOriginalReceipt');
    expect(matchU3Route('GET', '/requests/original-probe')!.operation).toBe('probeOriginalReceipt');
    expect(matchU3Route('POST', '/unregistered')).toBeUndefined();
  });
  it('오직 주문 제출/조건 적용 경로가1MiB이고 나머지는64KiB다', () => {
    for (const route of U3_API_ROUTES)
      expect(u3BodyLimit(route)).toBe(
        route.owner === 'OrderAcceptance' &&
          ['submitOrder', 'applyApprovedChange'].includes(route.operation)
          ? 1048576
          : 65536,
      );
    expect(u3BodyLimit(undefined)).toBe(65536);
    expect(matchU3Route('POST', '/orders')!.operation).toBe('submitOrder');
  });
  it('현재 조회의 명시 개정과 경로/입력 참조가 일치하며 클라이언트 버전·다른 필드는 거절한다', () => {
    const route = matchU3Route('GET', '/orders/order-id')!,
      reference = fixtureRef('OrderAcceptance', 'Order', 'order-id', 2),
      data = { targetRef: reference, targetScope: fixtureScope() },
      request = requestFixture({
        method: 'GET',
        params: { id: reference.id },
        headers: { 'x-target-revision': '2' },
        query: { query: JSON.stringify(data) },
      });
    const target = u3RouteTarget(route, request);
    expect(target).toEqual({ kind: 'NONE' });
    expect(
      schema.validateUri(
        registry.lookup(route.owner, route.operation, 3).input,
        u3RouteInput(route, request, target),
      ),
    ).toEqual(data);
    expect(() => u3RouteTarget(route, requestFixture({ ...request, headers: {} }))).toThrow();
    expect(() =>
      u3RouteInput(
        route,
        requestFixture({ ...request, headers: { 'x-target-revision': '1' } }),
        target,
      ),
    ).toThrow();
    expect(() =>
      u3RouteInput(
        route,
        requestFixture({ ...request, query: { query: JSON.stringify(data), version: '2' } }),
        target,
      ),
    ).toThrow();
    expect(() =>
      u3RouteInput(route, requestFixture({ ...request, query: { query: '[' } }), target),
    ).toThrow();
    expect(() =>
      u3RouteInput(
        route,
        requestFixture({ ...request, query: { query: ' '.repeat(8193) } }),
        target,
      ),
    ).toThrow();
    expect(() =>
      schema.validateUri(registry.lookup(route.owner, route.operation, 3).input, {
        ...data,
        profile: 'client',
      }),
    ).toThrow();
  });
  it('운영 미등록 host를 명시 선택하고 부분 구성·합성/KNOWN 운영 등록 주장은 거절한다', () => {
    expect(u3RuntimeRequested({ NODE_ENV: 'test' })).toBe(false);
    expect(u3RuntimeRequested({ NODE_ENV: 'test', OMS_U3_RUNTIME_PROFILE: 'UNREGISTERED' })).toBe(
      true,
    );
    for (const environment of [
      { OMS_U3_RUNTIME_PROFILE: 'LOCAL_SYNTHETIC' },
      { OMS_U3_RUNTIME_PROFILE: 'REGISTERED_OWNER' },
      { OMS_U3_RUNTIME_PROFILE: '' },
      { OMS_U3_EVIDENCE: 'KNOWN' },
    ])
      expect(() => u3RuntimeRequested({ NODE_ENV: 'test', ...environment })).toThrow();
  });
});
