import { describe, expect, it } from 'vitest';
import { OriginalIntents } from '@oms/ui/original-intents';
function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
  };
}
const intent = () => ({
  owner: 'OrderAcceptance',
  operation: 'submitOrder',
  target: { kind: 'NONE' as const },
  clientRequestId: 'same-original-key',
  delivery: 'PREPARING' as const,
});
describe('현재브라우저세션원래요청참조·refresh·계정경계', () => {
  it('metadata는verified계정문맥전에는저장/노출하지않는다', () => {
    const repo = new OriginalIntents(storage);
    expect(repo.snapshot()).toBeNull();
    expect(() => repo.record(intent())).toThrow();
  });
  it('새로고침뒤전송불명key/target은동일하고원문입력·비밀은보관하지않는다', () => {
    const saved = storage();
    const first = new OriginalIntents(() => saved);
    first.activate('CUSTOMER', 'customer');
    first.record(intent());
    first.delivery('same-original-key', 'SENDING');
    const refreshed = new OriginalIntents(() => saved);
    refreshed.activate('CUSTOMER', 'customer');
    expect(refreshed.snapshot()).toEqual({ ...intent(), delivery: 'UNKNOWN' });
    expect(saved.getItem(saved.key(0)!)!).not.toContain('password');
  });
  it('계정전환/로그아웃본문에서는이전계정의참조를표시하지않는다', () => {
    const repo = new OriginalIntents(storage);
    repo.activate('CUSTOMER', 'a');
    repo.record(intent());
    repo.suspend();
    expect(repo.snapshot()).toBeNull();
    repo.activate('CUSTOMER', 'b');
    expect(repo.snapshot()).toBeNull();
  });
  it('같은계정의reauthentication만그계정의원래참조를복원한다', () => {
    const saved = storage();
    const repo = new OriginalIntents(() => saved);
    repo.activate('CUSTOMER', 'a');
    repo.record(intent());
    repo.suspend();
    repo.activate('STAFF', 'a');
    expect(repo.snapshot()).toBeNull();
    repo.activate('CUSTOMER', 'a');
    expect(repo.snapshot()?.clientRequestId).toBe('same-original-key');
  });
  it('확인된result/no-send제거는refresh후에도남지않는다', () => {
    const saved = storage();
    const repo = new OriginalIntents(() => saved);
    repo.activate('CUSTOMER', 'a');
    repo.record(intent());
    repo.resolve('same-original-key');
    const fresh = new OriginalIntents(() => saved);
    fresh.activate('CUSTOMER', 'a');
    expect(fresh.snapshot()).toBeNull();
  });
  it('전송상태snapshot은immutable하게바뀌며구독자에게알린다', () => {
    const repo = new OriginalIntents(storage);
    repo.activate('CUSTOMER', 'a');
    repo.record(intent());
    const before = repo.snapshot();
    let changed = 0;
    const close = repo.subscribe(() => changed++);
    repo.delivery('same-original-key', 'SENDING');
    expect(repo.snapshot()).not.toBe(before);
    expect(before?.delivery).toBe('PREPARING');
    expect(changed).toBe(1);
    close();
  });
  it('보관불능/과대/잘못된metadata는업무발송전에차단한다', () => {
    const repo = new OriginalIntents(() => undefined);
    repo.activate('CUSTOMER', 'a');
    expect(() => repo.record(intent())).toThrow();
    expect(repo.snapshot()).toBeNull();
    const saved = storage();
    saved.setItem('oms-u1-original:CUSTOMER:a', 'x'.repeat(65537));
    expect(() => new OriginalIntents(() => saved).activate('CUSTOMER', 'a')).toThrow();
  });
  it('browser참조buffer64는유한하며새사업주문한도로전용하지않는다', () => {
    const saved = storage();
    const repo = new OriginalIntents(() => saved);
    repo.activate('CUSTOMER', 'a');
    for (let i = 0; i < 64; i++) repo.record({ ...intent(), clientRequestId: 'key-' + i });
    expect(() => repo.record({ ...intent(), clientRequestId: 'next' })).toThrow();
    repo.resolve('key-0');
    expect(() => repo.record({ ...intent(), clientRequestId: 'next' })).not.toThrow();
  });
});
