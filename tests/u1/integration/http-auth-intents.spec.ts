import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { HttpAuthIntents } from '@oms/persistence';
import { localSources } from '../fixtures/databases.js';
import { initializeDatabases } from '../fixtures/migrate.js';
import { resetSyntheticDatabases } from '../fixtures/reset.js';
const sources = localSources();
const key = randomBytes(32);
const browser = () => randomBytes(32).toString('base64url');
let first: HttpAuthIntents;
let second: HttpAuthIntents;
beforeAll(async () => {
  await initializeDatabases();
  for (const source of Object.values(sources)) await source.initialize();
});
beforeEach(async () => {
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
  first = new HttpAuthIntents(sources.primaryApp, key, 'CUSTOMER');
  second = new HttpAuthIntents(sources.primaryApp, key, 'CUSTOMER');
});
afterAll(async () => {
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
});
describe('공유 PG 인증 의도 응답 fence', () => {
  it('서로 다른 API replica와 재시작에서 동일 challenge/브라우저 의도를 확인한다', async () => {
    const b = browser();
    const intent = await first.start(b);
    await first.attach(intent, 'CHALLENGE', 'c1');
    expect(await second.challenge('c1', b)).toEqual(intent);
    await new HttpAuthIntents(sources.primaryApp, key, 'CUSTOMER').assertCurrent(intent);
  });
  it('새 로그인은 이전 challenge/완료응답을 supersede하며 새 의도만 현재다', async () => {
    const b = browser();
    const old = await first.start(b);
    await first.attach(old, 'CHALLENGE', 'old');
    const latest = await second.start(b);
    await expect(first.assertCurrent(old)).rejects.toMatchObject({
      code: 'AUTHENTICATION_SUPERSEDED',
    });
    await expect(first.challenge('old', b)).rejects.toMatchObject({
      code: 'AUTHENTICATION_SUPERSEDED',
    });
    await second.assertCurrent(latest);
  });
  it('password 회전 alias를 따라 같은 브라우저 계보에서 이전 완료를 거절한다', async () => {
    const b = browser();
    const next = browser();
    const old = await first.start(b);
    await first.attach(old, 'BROWSER', next);
    await first.attach(old, 'CHALLENGE', 'old');
    const current = await second.start(next);
    expect(current.root).toBe(old.root);
    await expect(first.assertCurrent(old)).rejects.toMatchObject({
      code: 'AUTHENTICATION_SUPERSEDED',
    });
  });
  it('다른 브라우저/대상/서명키는 challenge를 가져갈 수 없다', async () => {
    const b = browser();
    const old = await first.start(b);
    await first.attach(old, 'CHALLENGE', 'own');
    for (const [service, other] of [
      [second, browser()],
      [new HttpAuthIntents(sources.primaryApp, key, 'STAFF'), b],
      [new HttpAuthIntents(sources.primaryApp, randomBytes(32), 'CUSTOMER'), b],
    ] as const)
      await expect(service.challenge('own', other)).rejects.toMatchObject({
        code: 'CHALLENGE_BROWSER_MISMATCH',
      });
  });
  it('기한 만료/미등록 challenge와 root는 fail closed다', async () => {
    const b = browser();
    const old = await first.start(b);
    await first.attach(old, 'CHALLENGE', 'expired');
    await sources.primaryAdmin.query(
      "UPDATE u1_auth_intent SET expires_at=clock_timestamp()-interval '1 second'",
    );
    await expect(second.challenge('expired', b)).rejects.toMatchObject({
      code: 'CHALLENGE_BROWSER_MISMATCH',
    });
    await expect(second.assertCurrent(old)).rejects.toMatchObject({
      code: 'AUTHENTICATION_SUPERSEDED',
    });
  });
  it('늦은 alias 등록과 폐기된 root는 새 현재 의도를 덮어쓰지 못한다', async () => {
    const b = browser();
    const old = await first.start(b);
    const current = await second.start(b);
    await expect(first.attach(old, 'BROWSER', browser())).rejects.toMatchObject({
      code: 'AUTHENTICATION_SUPERSEDED',
    });
    await first.assertCurrent(current);
    await sources.primaryAdmin.query('DELETE FROM u1_auth_intent');
    await expect(first.assertCurrent(current)).rejects.toMatchObject({
      code: 'AUTHENTICATION_SUPERSEDED',
    });
  });
  it('유한 2000개 임시 메타자료 한도를 넘기지 않고 만료 자료를 먼저 제거한다', async () => {
    await sources.primaryAdmin.query(
      "INSERT INTO u1_auth_intent(id,kind,root,generation,expires_at) SELECT lpad(i::text,64,'0'),'ROOT',lpad(i::text,64,'0'),$1,clock_timestamp()+interval '8 hours' FROM generate_series(1,1999) i",
      [randomUUID()],
    );
    await expect(first.start(browser())).rejects.toMatchObject({ code: 'AUTH_INTENT_CAPACITY' });
    await sources.primaryAdmin.query(
      "UPDATE u1_auth_intent SET expires_at=clock_timestamp()-interval '1 second'",
    );
    const b = browser();
    const result = await first.start(b);
    await second.assertCurrent(result);
    expect(
      (await sources.primaryAdmin.query('SELECT count(*)::int AS count FROM u1_auth_intent'))[0]
        .count,
    ).toBe(2);
    await sources.primaryAdmin.query(
      "INSERT INTO u1_auth_intent(id,kind,root,generation,expires_at) SELECT lpad(i::text,64,'0'),'ROOT',lpad(i::text,64,'0'),$1,clock_timestamp()+interval '8 hours' FROM generate_series(1,1997) i",
      [randomUUID()],
    );
    await second.attach(result, 'SESSION', 'last-bounded-session');
    await first.assertSession('last-bounded-session', b);
    expect(
      (await sources.primaryAdmin.query('SELECT count(*)::int AS count FROM u1_auth_intent'))[0]
        .count,
    ).toBe(2000);
    await expect(first.attach(result, 'CHALLENGE', 'over-capacity')).rejects.toMatchObject({
      code: 'AUTH_INTENT_CAPACITY',
    });
    await second.assertSession('last-bounded-session', b);
  });
  it('이미 발행된 이전 세션 쿠키가 늦게 도착해도 같은 브라우저의 옛 세대로 인증하지 않는다', async () => {
    const b = browser();
    const independent = browser();
    const firstIntent = await first.start(b);
    const separate = await first.start(independent);
    await first.attach(firstIntent, 'SESSION', 'previous-token');
    await first.attach(separate, 'SESSION', 'independent-token');
    await first.assertSession('previous-token', b);
    const current = await second.start(b);
    await second.attach(current, 'SESSION', 'new-token');
    await expect(first.assertSession('previous-token', b)).rejects.toMatchObject({
      code: 'BROWSER_SESSION_SUPERSEDED',
    });
    await first.assertSession('new-token', b);
    await first.assertSession('independent-token', independent);
    await expect(first.assertSession('new-token', independent)).rejects.toMatchObject({
      code: 'BROWSER_SESSION_SUPERSEDED',
    });
  });
  it('잘못된 접점 키/대상은 생성 전에 거절한다', () => {
    expect(() => new HttpAuthIntents(sources.primaryApp, Buffer.alloc(1), 'CUSTOMER')).toThrow();
    expect(() => new HttpAuthIntents(sources.primaryApp, key, 'SYSTEM')).toThrow();
  });
});
