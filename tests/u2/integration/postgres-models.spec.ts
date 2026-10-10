import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_MODELS, physicalData, tableName } from '@oms/persistence';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';

describe('U2 실제 PostgreSQL additive 모델/제약', () => {
  const sources = u2Sources();
  const account = () => ({
    accountId: randomUUID(),
    loginIdentifier: randomUUID(),
    displayName: '합성 U2',
    contactAddress: 'fixture@example.invalid',
    active: true,
    identityBasis: [],
    revision: 1,
  });
  beforeAll(async () => {
    await initializeU2Databases();
    await sources.primaryAdmin.initialize();
    await sources.primaryApp.initialize();
    await sources.journalAppend.initialize();
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  it('별도 두 DB와 PostgreSQL17.11 내구 설정을 확인한다', async () => {
    const p = await sources.primaryApp.query(
      "SELECT current_database() AS db,version() AS version,current_setting('fsync') AS fsync,current_setting('synchronous_commit') AS durable",
    );
    const j = await sources.journalAppend.query('SELECT current_database() AS db');
    expect(p[0]).toMatchObject({ db: 'oms_u2_verification', fsync: 'on', durable: 'on' });
    expect(p[0].version).toContain('17.11');
    expect(j[0].db).toBe('oms_u2_journal_verification');
    const limits = await sources.primaryApp.query(
      "SELECT current_setting('lock_timeout') AS lock,current_setting('statement_timeout') AS statement,current_setting('transaction_timeout') AS transaction",
    );
    expect(limits[0]).toEqual({ lock: '500ms', statement: '2s', transaction: '3s' });
    expect(
      sources.primaryAdmin.options.extra.max + sources.primaryApp.options.extra.max,
    ).toBeLessThanOrEqual(32);
    expect(
      sources.journalAdmin.options.extra.max +
        sources.journalAppend.options.extra.max +
        sources.vault.options.extra.max,
    ).toBeLessThanOrEqual(32);
  });
  it('전체 원본은 중복 모델/table 이름 없이 물리 등록한다', async () => {
    expect(new Set(ALL_MODELS.map((model) => model.name)).size).toBe(ALL_MODELS.length);
    for (const model of ALL_MODELS) {
      const rows = await sources.primaryAdmin.query('SELECT to_regclass($1) AS name', [
        tableName(model.name),
      ]);
      expect(rows[0].name).toBe(tableName(model.name));
    }
  });
  it('보안 세대 stable account FK와 숫자 변환을 저장한다', async () => {
    const a = account();
    await sources.primaryApp.getRepository('Account').insert(a);
    const row = {
      securityStateId: randomUUID(),
      accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: a.accountId, revision: 1 },
      securityGeneration: 2,
      epoch: 'initial',
      revision: 1,
    };
    await sources.primaryApp
      .getRepository('AccountSecurityState')
      .insert(physicalData('AccountSecurityState', row));
    expect(
      await sources.primaryApp
        .getRepository('AccountSecurityState')
        .findOneBy({ securityStateId: row.securityStateId }),
    ).toMatchObject(row);
    await expect(
      sources.primaryApp
        .getRepository('AccountSecurityState')
        .insert(physicalData('AccountSecurityState', { ...row, securityStateId: randomUUID() })),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
  });
  it('동일 account/audience에 active binding 하나만 허용한다', async () => {
    const a = account();
    await sources.primaryApp.getRepository('Account').insert(a);
    const row = {
      bindingId: randomUUID(),
      accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: a.accountId, revision: 1 },
      audience: 'CUSTOMER',
      issuer: 'synthetic:u2',
      subject: randomUUID(),
      generation: 1,
      authRevision: 1,
      active: true,
      removalState: 'CLEAR',
      revision: 1,
    };
    await sources.primaryApp
      .getRepository('ProviderBinding')
      .insert(physicalData('ProviderBinding', row));
    await expect(
      sources.primaryApp.getRepository('ProviderBinding').insert(
        physicalData('ProviderBinding', {
          ...row,
          bindingId: randomUUID(),
          subject: randomUUID(),
        }),
      ),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
  });
  it('없는 account와 잘못된 세대는 FK/CHECK에서 거절한다', async () => {
    const row = {
      securityStateId: randomUUID(),
      accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: randomUUID(), revision: 1 },
      securityGeneration: 1,
      epoch: 'initial',
      revision: 1,
    };
    await expect(
      sources.primaryApp
        .getRepository('AccountSecurityState')
        .insert(physicalData('AccountSecurityState', row)),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(
      sources.primaryApp
        .getRepository('AccountSecurityState')
        .insert(physicalData('AccountSecurityState', { ...row, securityGeneration: 0 })),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });
  it('동시 같은 account 보안 상태 insert는 정확히 한 효과다', async () => {
    const a = account();
    await sources.primaryApp.getRepository('Account').insert(a);
    const row = {
      accountRef: { owner: 'IdentityRecovery', entity: 'Account', id: a.accountId, revision: 1 },
      securityGeneration: 1,
      epoch: 'initial',
      revision: 1,
    };
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        sources.primaryApp
          .getRepository('AccountSecurityState')
          .insert(physicalData('AccountSecurityState', { ...row, securityStateId: randomUUID() })),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
  it('독립 U2 app/append 권한은 DDL과 owner 승격을 거절한다', async () => {
    for (const source of [sources.primaryApp, sources.journalAppend]) {
      await expect(source.query('CREATE TABLE u2_unapproved_probe(id text)')).rejects.toMatchObject(
        { driverError: { code: '42501' } },
      );
      await expect(source.query('SET ROLE u1_owner')).rejects.toMatchObject({
        driverError: { code: '42501' },
      });
    }
  });
});
