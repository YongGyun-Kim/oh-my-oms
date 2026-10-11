import { describe, expect, it, vi } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import { recoverySecurityChangeAllowed, U3_SOURCE_CONTRACT } from '@oms/persistence';
import type {
  ModelData,
  ProtectedStore,
  ProtectedTransaction,
  WriteRequest,
} from '@oms/persistence';
import { writeRecoveredSecurityTransition } from '../../../packages/persistence/src/recovery-security-write.js';

const schema = new SchemaValidator();
const old = {
  roleStateId: 'role-state',
  roleRef: null,
  staffRoleRef: { owner: 'EnterpriseAccess', entity: 'StaffRole', id: 'role', revision: 1 },
  active: true,
  scopeRefs: [],
  actions: ['product.register'],
  revision: 1,
};
const modern = { ...old, modelVersion: 2, sourceContract: U3_SOURCE_CONTRACT };
function host() {
  const put = vi.fn().mockResolvedValue(undefined);
  const execute = vi.fn(
    async (
      _request: WriteRequest,
      callback: (tx: ProtectedTransaction, requestId: string) => Promise<void>,
    ) => {
      await callback({ put } as unknown as ProtectedTransaction, 'recovery-request');
      return { requestId: 'recovery-request', commitOrder: 1, replay: false };
    },
  );
  return { schema, execute, put };
}
const transition = (store: ProtectedStore, previous: ModelData, current: ModelData) =>
  writeRecoveredSecurityTransition(store, {
    epoch: 'initial',
    checkId: 'synthetic-check',
    model: 'RoleRevisionState',
    id: 'role-state',
    previous,
    current,
    evidenceId: 'synthetic-owner-proof',
  });
describe('현재 owner 확인 복구 전이의 실제 모델/계약 보존', () => {
  it('model2 취소는 검증 SourceContract를 request와 Receipt에 그대로 보존한다', async () => {
    const store = host();
    await transition(store as unknown as ProtectedStore, modern, {
      ...modern,
      active: false,
      revision: 2,
    });
    expect(store.execute.mock.calls[0]![0].sourceContract).toEqual(U3_SOURCE_CONTRACT);
    expect(store.put.mock.calls.find(([model]) => model === 'RequestReceipt')![1]).toMatchObject({
      sourceContract: U3_SOURCE_CONTRACT,
    });
    expect(store.put.mock.calls.find(([model]) => model === 'RoleRevisionState')![1]).toMatchObject(
      { modelVersion: 2, sourceContract: U3_SOURCE_CONTRACT, active: false },
    );
  });
  it('legacy model1은 SourceContract나 새 marker를 추정하여 추가하지 않는다', async () => {
    const store = host();
    await transition(store as unknown as ProtectedStore, old, {
      ...old,
      active: false,
      revision: 2,
    });
    expect(store.execute.mock.calls[0]![0]).not.toHaveProperty('sourceContract');
    expect(
      store.put.mock.calls.find(([model]) => model === 'RequestReceipt')![1],
    ).not.toHaveProperty('sourceContract');
    expect(store.put.mock.calls[0]![1]).not.toHaveProperty('modelVersion');
  });
  it('model2→1 downgrade와 model1→2 자동 upgrade는 쓰기 호출 전에 거절한다', async () => {
    const store = host();
    await expect(
      transition(store as unknown as ProtectedStore, modern, {
        ...old,
        active: false,
        revision: 2,
      }),
    ).rejects.toMatchObject({ code: 'RECOVERY_MODEL_VERSION' });
    await expect(
      transition(store as unknown as ProtectedStore, old, {
        ...modern,
        active: false,
        revision: 2,
      }),
    ).rejects.toMatchObject({ code: 'RECOVERY_MODEL_VERSION' });
    expect(store.execute).not.toHaveBeenCalled();
  });
  it.each([null, undefined, { ...U3_SOURCE_CONTRACT, registryVersion: 2 }])(
    'current2의 누락/위조 profile %j은 새 보호 전이가 아니다',
    async (sourceContract) => {
      const store = host();
      await expect(
        transition(store as unknown as ProtectedStore, modern, {
          ...modern,
          sourceContract,
          active: false,
          revision: 2,
        }),
      ).rejects.toThrow();
      expect(store.execute).not.toHaveBeenCalled();
    },
  );
  it('권한 확대·재활성·version/profile 교체는 기존 policy에서 계속 차단한다', () => {
    expect(
      recoverySecurityChangeAllowed('RoleRevisionState', modern, {
        ...modern,
        active: false,
        revision: 2,
      }),
    ).toBe(true);
    for (const current of [
      { ...modern, actions: ['product.register', 'contract.approve'], revision: 2 },
      { ...old, active: false, revision: 2 },
      { ...modern, sourceContract: { ...U3_SOURCE_CONTRACT, registryVersion: 2 }, revision: 2 },
    ])
      expect(recoverySecurityChangeAllowed('RoleRevisionState', modern, current)).toBe(false);
    expect(
      recoverySecurityChangeAllowed('RoleRevisionState', { ...modern, active: false }, modern),
    ).toBe(false);
  });
});
