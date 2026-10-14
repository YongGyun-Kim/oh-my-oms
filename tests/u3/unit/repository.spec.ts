import { describe, expect, it, vi } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
import { U3Repository, U3_SOURCE_CONTRACT } from '@oms/persistence';
import type { ProtectedStore, WriteRequest } from '@oms/persistence';
import { fixtureRef } from '../fixtures/identity.js';
import { modernProduct } from '../fixtures/models.js';

const schema = new SchemaValidator();
const request = (): WriteRequest => ({
  principalId: 'actor',
  audience: 'STAFF',
  owner: 'ProductCatalog',
  operation: 'registerProduct',
  target: { kind: 'NONE' },
  idempotencyKey: 'key',
  input: { synthetic: true },
  correlationId: 'correlation',
  epoch: 'initial',
  sourceContract: U3_SOURCE_CONTRACT,
});
const store = () => ({
  schema,
  currentProtected: vi.fn().mockResolvedValue(modernProduct()),
  currentEpoch: vi.fn().mockResolvedValue('initial'),
  execute: vi.fn(),
  primary: { query: vi.fn().mockResolvedValue([]) },
});
describe('U3 저장 포트의 닫힌 원본/계약 경계', () => {
  it('실제 현재 Ref 개정에 해당하는 원본을 조회한다', async () => {
    const host = store(),
      repo = new U3Repository(host as unknown as ProtectedStore);
    expect(await repo.current(fixtureRef('ProductCatalog', 'Product', 'modern-product'))).toEqual(
      modernProduct(),
    );
    expect(host.currentProtected).toHaveBeenCalledWith('Product', 'modern-product');
  });
  it('잘못된 owner/entity 조합은 저장소 조회 전에 거절한다', async () => {
    const host = store(),
      repo = new U3Repository(host as unknown as ProtectedStore);
    await expect(repo.current(fixtureRef('OrderAcceptance', 'Product'))).rejects.toThrow();
    expect(host.currentProtected).not.toHaveBeenCalled();
  });
  it('없는 원본과 오래된 Ref는 최신 값을 대신 반환하지 않는다', async () => {
    const host = store(),
      repo = new U3Repository(host as unknown as ProtectedStore);
    await expect(
      repo.current(fixtureRef('ProductCatalog', 'Product', 'modern-product', 2)),
    ).rejects.toMatchObject({ code: 'STALE_U3_REFERENCE' });
    host.currentProtected.mockResolvedValue(null);
    await expect(repo.current(fixtureRef('ProductCatalog', 'Product'))).rejects.toMatchObject({
      code: 'STALE_U3_REFERENCE',
    });
  });
  it('미등록 Ref·추가 필드·소수 개정을 허용하지 않는다', async () => {
    const repo = new U3Repository(store() as unknown as ProtectedStore);
    for (const reference of [
      { ...fixtureRef('ProductCatalog', 'Product'), revision: 1.5 },
      { ...fixtureRef('ProductCatalog', 'Product'), extra: true },
      fixtureRef('ProductCatalog', 'NotRegistered'),
    ])
      await expect(repo.current(reference)).rejects.toThrow();
  });
  it.each([
    undefined,
    { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 2 },
    { profile: 'urn:oms:contract:common:2', registryVersion: 3 },
  ])('명시 U3 계약 %j가 없으면 보호 쓰기 호출 전에 거절한다', async (sourceContract) => {
    const host = store(),
      repo = new U3Repository(host as unknown as ProtectedStore);
    await expect(
      repo.mutate(
        { ...request(), sourceContract: sourceContract as WriteRequest['sourceContract'] },
        async () => {},
        async () => {},
      ),
    ).rejects.toThrow();
    expect(host.execute).not.toHaveBeenCalled();
  });
  it('다른 업무 소유자를 U3 요청으로 포장하지 않는다', async () => {
    const host = store(),
      repo = new U3Repository(host as unknown as ProtectedStore);
    await expect(
      repo.mutate(
        { ...request(), owner: 'HardwareFulfillment' },
        async () => {},
        async () => {},
      ),
    ).rejects.toMatchObject({ code: 'U3_OWNER' });
    expect(host.execute).not.toHaveBeenCalled();
  });
  it('원래 요청이 없으면 성공이나 실패 접수를 추정하지 않는다', async () => {
    const repo = new U3Repository(store() as unknown as ProtectedStore);
    expect(await repo.original(request())).toEqual({
      knowledge: 'UNKNOWN',
      requestId: null,
      reasonCode: 'NO_ORIGINAL',
    });
  });
});
