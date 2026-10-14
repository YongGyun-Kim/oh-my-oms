import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IdentityBrowser } from '@oms/core';
const token = () => randomBytes(32).toString('base64url');
describe('서버 인증 접점의 원래 브라우저 결합', () => {
  it('운영 문맥이 없으면 합성 결합으로 대체하지 않는다', () => {
    expect(() => IdentityBrowser.current(false)).toThrow();
  });
  it('명시적 합성 profile의 직접 owner 시험은 격리된 결합을 쓴다', () => {
    expect(IdentityBrowser.current(true)).toBe('explicit-local-synthetic-binding');
  });
  it('유효한 서버 결합은 현재 단계에서 유지한다', async () => {
    const current = token();
    await IdentityBrowser.run({ current }, async () => {
      expect(IdentityBrowser.current(false)).toBe(current);
    });
  });
  it('password 뒤 다음 결합은 별도 값으로 회전한다', async () => {
    const current = token();
    const next = token();
    await IdentityBrowser.run({ current, next }, async () => {
      expect(IdentityBrowser.next(false)).toBe(next);
      expect(IdentityBrowser.current(false)).toBe(current);
    });
  });
  it('동시 서버 요청의 서로 다른 결합을 섞지 않는다', async () => {
    const values = [token(), token()];
    const results = await Promise.all(
      values.map((current) =>
        IdentityBrowser.run({ current }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return IdentityBrowser.current(false);
        }),
      ),
    );
    expect(results).toEqual(values);
  });
  it('실패 뒤 이전 요청 결합이 후속 요청으로 남지 않는다', async () => {
    await expect(
      IdentityBrowser.run({ current: token() }, async () => {
        throw new Error('request failure');
      }),
    ).rejects.toThrow();
    expect(() => IdentityBrowser.current(false)).toThrow();
  });
  it('임의 client 문자열은 서버 결합으로 수락하지 않는다', () => {
    expect(() => IdentityBrowser.run({ current: 'principal:admin' }, async () => null)).toThrow();
  });
  it('잘못된 회전 값도 거절한다', () => {
    expect(() =>
      IdentityBrowser.run({ current: token(), next: 'wrong' }, async () => null),
    ).toThrow();
  });
});
