import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { EncryptedChallenges } from '@oms/persistence';

function fixture(key = randomBytes(32)) {
  let row: { id: string; ciphertext: string; iv: string; tag: string } | undefined;
  const query = async (sql: string, values?: unknown[]) => {
    if (sql.includes('count(*)')) return [{ count: 0 }];
    if (sql.includes('INSERT INTO u1_auth_ephemeral')) {
      row = {
        id: String(values![0]),
        ciphertext: String(values![1]),
        iv: String(values![2]),
        tag: String(values![3]),
      };
      return [];
    }
    return row ? [row] : [];
  };
  const source = {
    query,
    transaction: async (work: (manager: { query: typeof query }) => Promise<void>) =>
      work({ query }),
  } as unknown as DataSource;
  return {
    challenges: new EncryptedChallenges<{ providerHandle: string }>(source, key),
    get row() {
      return row!;
    },
    source,
    key,
  };
}
describe('AES-256-GCM 인증 임시 저장의16byte tag·AAD·유한 원문', () => {
  it('현재 key/id의 암호문만 정상적으로 열고 원문을 저장하지 않는다', async () => {
    const f = fixture();
    await f.challenges.create('one', { providerHandle: 'sensitive-handle' }, new Date());
    expect(await f.challenges.inspect('one')).toEqual({ providerHandle: 'sensitive-handle' });
    expect(JSON.stringify(f.row)).not.toContain('sensitive-handle');
    expect(Buffer.from(f.row.tag, 'base64')).toHaveLength(16);
  });
  it('매 저장마다12byte nonce를 새로 생성한다', async () => {
    const f = fixture();
    await f.challenges.create('one', { providerHandle: 'x' }, new Date());
    const first = f.row.iv;
    await f.challenges.create('two', { providerHandle: 'x' }, new Date());
    expect(f.row.iv).not.toBe(first);
    expect(Buffer.from(f.row.iv, 'base64')).toHaveLength(12);
  });
  it('짧아진 인증 tag를 허용하지 않는다', async () => {
    const f = fixture();
    await f.challenges.create('one', { providerHandle: 'x' }, new Date());
    f.row.tag = Buffer.from(f.row.tag, 'base64').subarray(0, 12).toString('base64');
    await expect(f.challenges.inspect('one')).rejects.toThrow();
  });
  it('변조된 tag와 암호문을 정상 MFA 결과로 열지 않는다', async () => {
    for (const field of ['tag', 'ciphertext'] as const) {
      const f = fixture();
      await f.challenges.create('one', { providerHandle: 'x' }, new Date());
      const bytes = Buffer.from(f.row[field], 'base64');
      bytes[0] = bytes[0]! ^ 1;
      f.row[field] = bytes.toString('base64');
      await expect(f.challenges.inspect('one')).rejects.toThrow();
    }
  });
  it('다른 challenge id로 암호문을 옮겨도 AAD가 거절한다', async () => {
    const f = fixture();
    await f.challenges.create('one', { providerHandle: 'x' }, new Date());
    f.row.id = 'two';
    await expect(f.challenges.inspect('two')).rejects.toThrow();
  });
  it('다른 key 세대로 원래 암호문을 열지 않는다', async () => {
    const f = fixture();
    await f.challenges.create('one', { providerHandle: 'x' }, new Date());
    await expect(
      new EncryptedChallenges(f.source, randomBytes(32)).inspect('one'),
    ).rejects.toThrow();
  });
  it('32byte 아닌 key와64KiB 초과 provider 자료는 저장 전 거절한다', async () => {
    expect(() => fixture(Buffer.alloc(16))).toThrow();
    const f = fixture();
    await expect(
      f.challenges.create('one', { providerHandle: 'x'.repeat(65536) }, new Date()),
    ).rejects.toThrow();
    expect(f.row).toBeUndefined();
  });
});
