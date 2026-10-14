import { beforeEach, describe, it, expect } from 'vitest';
import type { ContainerClient } from '../../../scripts/u1/container-client.js';
import { containerBusinessFlow } from '../../../scripts/u1/container-flow.js';
const calls: {
  actor: string;
  path: string;
  input?: Record<string, unknown>;
  headers?: Record<string, string>;
}[] = [];
let mode: string;
const orders = new Map<string, string>();
let sequence = 0;
function client(actor: string) {
  return {
    authenticate: async (id: string) => {
      calls.push({ actor, path: 'authenticate:' + id });
      if (mode === 'auth') throw new Error('MFA unconfirmed');
    },
    request: async (
      path: string,
      input?: Record<string, unknown>,
      headers?: Record<string, string>,
    ) => {
      calls.push({ actor, path, input, headers });
      if (mode === 'command' && input) return { status: 403, body: {} };
      if (!input) {
        const original = path.slice('/requests/'.length);
        return { status: 200, body: { requestId: mode === 'original' ? 'changed' : original } };
      }
      const meta = input.meta as { clientRequestId: string };
      const type =
        path === '/products'
          ? 'Product'
          : path === '/orders'
            ? 'Order'
            : path.includes('staff-role')
              ? 'StaffRole'
              : path.includes('customer-roles')
                ? 'CustomerRole'
                : 'EnterpriseApplication';
      const owner =
        type === 'Product'
          ? 'ProductCatalog'
          : type === 'Order'
            ? 'OrderAcceptance'
            : 'EnterpriseAccess';
      let requestId = 'request-' + meta.clientRequestId;
      const existing = orders.get(meta.clientRequestId);
      if (path === '/orders') {
        if (existing && mode === 'duplicate') requestId = 'different';
        else requestId = existing ?? requestId;
        orders.set(meta.clientRequestId, requestId);
      }
      return {
        status: 202,
        body: {
          requestId,
          requestState:
            path === '/orders'
              ? mode === 'false-known'
                ? 'RESULT_RECORDED'
                : 'REVIEW_REQUIRED'
              : 'RESULT_RECORDED',
          owner,
          targetRef: { owner, entity: type, id: 'target-' + ++sequence, revision: 1 },
          resultRefs: [
            { owner: 'EnterpriseAccess', entity: 'Enterprise', id: 'enterprise', revision: 1 },
            { owner: 'ProductCatalog', entity: 'CommonOfferRevision', id: 'offer', revision: 1 },
          ],
        },
      };
    },
  } as unknown as ContainerClient;
}
beforeEach(() => {
  calls.length = 0;
  mode = 'normal';
  orders.clear();
  sequence = 0;
});
describe('4-role 업무 시연 최소 순서/원래키 검증(전송 포트 단위)', () => {
  it('별도 관리자 지정/명시 거래 권한 이후 HW와SW 주문을 분리한다', async () => {
    const result = await containerBusinessFlow(client('customer'), client('staff'));
    expect(result.orders.map((value) => value.productType)).toEqual(['HARDWARE', 'SOFTWARE']);
    const designation = calls.findIndex((call) =>
      call.path.endsWith('/initial-administrator-designations'),
    );
    const grant = calls.findIndex((call) => call.path.endsWith('/role-grant-changes'));
    const order = calls.findIndex((call) => call.path === '/orders');
    expect(designation).toBeLessThan(grant);
    expect(grant).toBeLessThan(order);
  });
  it('직원 권한은 별도 직원 MFA 뒤 내부 API로 등록한다', async () => {
    await containerBusinessFlow(client('customer'), client('staff'));
    expect(calls.find((call) => call.path === '/products')!.actor).toBe('staff');
    expect(calls.find((call) => call.path === '/staff-roles')!.actor).toBe('staff');
  });
  it('최초관리자 범위에 거래권한을 자동 확대하지 않는다', async () => {
    await containerBusinessFlow(client('customer'), client('staff'));
    const scopes = calls.find((call) => call.path.endsWith('/initial-administrator-designations'))!
      .input!.actionScopes as { action: string }[];
    expect(scopes.map((value) => value.action)).toEqual([
      'organisation.manage',
      'user.manage',
      'role.manage',
    ]);
  });
  it('각 주문은 동일 원래 key로 재대조하고 새 키를 만들지 않는다', async () => {
    await containerBusinessFlow(client('customer'), client('staff'));
    const submitted = calls.filter((call) => call.path === '/orders');
    expect(submitted).toHaveLength(4);
    expect(submitted[0]!.headers).toEqual(submitted[1]!.headers);
    expect(submitted[2]!.headers).toEqual(submitted[3]!.headers);
  });
  it('신원/command 거절은 이후 주문 성공으로 진행하지 않는다', async () => {
    for (const failure of ['auth', 'command']) {
      mode = failure;
      await expect(containerBusinessFlow(client('customer'), client('staff'))).rejects.toThrow();
      expect(calls.some((call) => call.path === '/orders')).toBe(false);
      calls.length = 0;
    }
  });
  it('미확인 공급을 RESULT_RECORDED success로 바꾼 응답은 거절한다', async () => {
    mode = 'false-known';
    await expect(containerBusinessFlow(client('customer'), client('staff'))).rejects.toThrow(
      '공급 성공',
    );
  });
  it('같은 원래 key에 새 접수ID가 나오면 중복 방지 실패다', async () => {
    mode = 'duplicate';
    await expect(containerBusinessFlow(client('customer'), client('staff'))).rejects.toThrow(
      '중복 접수',
    );
  });
  it('원래 receipt 조회가 다른 ID이면 보존 시연을 통과시키지 않는다', async () => {
    mode = 'original';
    await expect(containerBusinessFlow(client('customer'), client('staff'))).rejects.toThrow(
      '원래 ACK',
    );
  });
});
