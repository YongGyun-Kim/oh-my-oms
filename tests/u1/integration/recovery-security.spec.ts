import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityRecovery } from '@oms/core';
import { ProtectedStore, reconcileRecoveredSecurity, restoreFromJournal } from '@oms/persistence';
import type { CurrentSecurityAuthority, ModelData } from '@oms/persistence';
import { initializeDatabases } from '../fixtures/migrate.js';
import { localSources } from '../fixtures/databases.js';
import { resetSyntheticDatabases } from '../fixtures/reset.js';
import {
  seedSyntheticAccount,
  SyntheticIdentityProvider,
  syntheticPassword,
  syntheticFactor,
} from '../fixtures/identity.js';
import { seedMinimumStaffManager } from '../fixtures/staff-bootstrap.js';
import {
  captureSyntheticSecuritySnapshot,
  SyntheticCurrentSecurityOracle,
} from '../fixtures/recovery-security-oracle.js';
const sources = localSources();
let store: ProtectedStore;
let identity: IdentityRecovery;
let verifier: Buffer;
beforeAll(async () => {
  await initializeDatabases();
  for (const source of Object.values(sources)) await source.initialize();
});
beforeEach(async () => {
  await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
  store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  verifier = randomBytes(32);
  identity = new IdentityRecovery(store, new SyntheticIdentityProvider(), {
    synthetic: true,
    verifierKey: verifier,
    now: () => new Date(),
    staffIngress: async () => false,
  });
  await seedSyntheticAccount(store, 'person', 'CUSTOMER');
});
afterAll(async () => {
  for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
});
async function login() {
  const start = await identity.login(
    'CUSTOMER',
    'person@example.invalid',
    syntheticPassword,
    randomUUID(),
    null,
  );
  const factor = await identity.verifyFactor(
    start.challengeId!,
    syntheticFactor,
    randomUUID(),
    null,
  );
  if (factor.phase === 'MFA_VERIFIED') return factor.sessionToken!;
  const codes = await identity.issueRecoveryCodes(start.challengeId!, null);
  return (await identity.acknowledgeRecoveryCodes(start.challengeId!, codes.setId, true, null))
    .sessionToken!;
}
const status = async () =>
  (
    await sources.primaryAdmin.query(
      'SELECT auth_ready FROM u1_recovery_control WHERE singleton=true',
    )
  )[0].auth_ready;
async function restore(oracle?: SyntheticCurrentSecurityOracle) {
  const actual =
    oracle ??
    new SyntheticCurrentSecurityOracle(await captureSyntheticSecuritySnapshot(sources.primaryApp));
  const faultAt = new Date().toISOString();
  const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
  return { oracle: actual, faultAt, report };
}
describe('별도 현재 owner 대조→새epoch 인증 재개·회수/원래session 보호', () => {
  it('camelCase 보안 원본은25개페이지 이후에도 누락·중복 없이 독립 snapshot에 담긴다', async () => {
    for (let index = 0; index < 30; index++) {
      const id = 'paged-staff-' + String(index).padStart(2, '0');
      await seedSyntheticAccount(store, id, 'STAFF');
      await seedMinimumStaffManager(store, id, new Date());
    }
    const snapshot = await captureSyntheticSecuritySnapshot(sources.primaryApp);
    for (const model of ['Account', 'ProviderBinding', 'VerifiedPersonLink']) {
      const keys = Object.keys(snapshot.rows).filter((key) => key.startsWith(model + '/'));
      expect(keys).toHaveLength(31);
      expect(new Set(keys).size).toBe(31);
    }
    for (const model of ['StaffRole', 'StaffRoleGrant'])
      expect(Object.keys(snapshot.rows).filter((key) => key.startsWith(model + '/'))).toHaveLength(
        30,
      );
    expect(snapshot.rows['Account/paged-staff-29']?.accountId).toBe('paged-staff-29');
    expect(snapshot.rows['ProviderBinding/paged-staff-29-binding']?.accountRef).toMatchObject({
      id: 'paged-staff-29',
    });
  });
  it('미보호직원grant회수는원래grant/역할을유지한채최신owner대조로다시회수한다', async () => {
    await seedSyntheticAccount(store, 'staff', 'STAFF');
    await seedMinimumStaffManager(store, 'staff', new Date());
    const grant = (await store.list('StaffRoleGrant', { limit: 1 }))[0]!;
    await sources.primaryAdmin.query(
      'UPDATE u1_staff_role_grant SET "revokedAt"=now(),revision=revision+1 WHERE "staffGrantId"=$1',
      [grant.staffGrantId],
    );
    const result = await restore();
    expect((await store.read('StaffRoleGrant', String(grant.staffGrantId)))?.revokedAt).toBeNull();
    await reconcileRecoveredSecurity(
      sources.primaryAdmin,
      store,
      result.oracle,
      true,
      result.report.epoch,
      result.faultAt,
    );
    expect(
      (await store.currentProtected('StaffRoleGrant', String(grant.staffGrantId)))?.revokedAt,
    ).not.toBeNull();
    expect((await store.read('StaffRoleGrant', String(grant.staffGrantId)))?.roleRef).toEqual(
      grant.roleRef,
    );
  });
  it('인증재대조primary뒤종료도같은원래candidate를보호하고새전이를반복하지않는다', async () => {
    await sources.primaryAdmin.query(
      'UPDATE u1_account SET active=false,revision=revision+1 WHERE "accountId"=$1',
      ['person'],
    );
    const result = await restore();
    const failed = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'PRIMARY_COMMITTED')
          throw new Error('synthetic interrupted security protection');
      },
    );
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        failed,
        result.oracle,
        true,
        result.report.epoch,
        result.faultAt,
      ),
    ).rejects.toThrow('interrupted');
    expect(await status()).toBe(false);
    const original = (
      await sources.primaryAdmin.query(
        'SELECT "requestId" FROM u1_request_receipt WHERE operation=$1',
        ['reconcileRecoveredSecurity'],
      )
    )[0].requestId;
    await reconcileRecoveredSecurity(
      sources.primaryAdmin,
      store,
      result.oracle,
      true,
      result.report.epoch,
      result.faultAt,
    );
    expect((await store.read('RequestReceipt', original))?.requestId).toBe(original);
    expect(
      await store.list('IdentityHistory', {
        equals: { reason: '복구 뒤 등록된 현재 owner의 독립 보안 원본 대조' },
      }),
    ).toHaveLength(1);
    expect((await store.currentProtected('Account', 'person'))?.active).toBe(false);
  });

  it('복원만으로auth재개하지않고전수oracle대조후freshMFA만허용한다', async () => {
    const old = await login(),
      result = await restore();
    expect(await status()).toBe(false);
    await expect(identity.authenticate(old, 'CUSTOMER', 'original', null)).rejects.toThrow();
    const proof = await reconcileRecoveredSecurity(
      sources.primaryAdmin,
      store,
      result.oracle,
      true,
      result.report.epoch,
      result.faultAt,
    );
    expect(proof).toMatchObject({ authenticationReconciled: true, realEnvironmentVerified: false });
    expect(proof.records).toBeGreaterThan(0);
    expect(await status()).toBe(true);
    await expect(identity.authenticate(old, 'CUSTOMER', 'original', null)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    const current = await login();
    expect((await identity.authenticate(current, 'CUSTOMER', 'new', null)).principalId).toBe(
      'person',
    );
  });
  it('미보호현재account회수는독립oracle원본으로복원후차단에반영한다', async () => {
    const old = await login();
    await sources.primaryAdmin.query(
      'UPDATE u1_account SET active=false,revision=revision+1 WHERE "accountId"=$1',
      ['person'],
    );
    const oracle = new SyntheticCurrentSecurityOracle(
      await captureSyntheticSecuritySnapshot(sources.primaryApp),
    );
    const result = await restore(oracle);
    expect((await store.read('Account', 'person'))?.active).toBe(true);
    await reconcileRecoveredSecurity(
      sources.primaryAdmin,
      store,
      oracle,
      true,
      result.report.epoch,
      result.faultAt,
    );
    expect((await store.currentProtected('Account', 'person'))?.active).toBe(false);
    await expect(identity.authenticate(old, 'CUSTOMER', 'old', null)).rejects.toThrow();
    await expect(login()).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    expect(
      await store.list('IdentityHistory', {
        equals: { reason: '복구 뒤 등록된 현재 owner의 독립 보안 원본 대조' },
      }),
    ).toHaveLength(1);
  });
  it('미등록/합성운영authority와일반appcredential은재개를허용하지않는다', async () => {
    const result = await restore();
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        store,
        {
          kind: 'UNREGISTERED',
          begin: result.oracle.begin.bind(result.oracle),
          observe: result.oracle.observe.bind(result.oracle),
          seal: result.oracle.seal.bind(result.oracle),
        } as CurrentSecurityAuthority,
        true,
        result.report.epoch,
        result.faultAt,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_SOURCE_UNREGISTERED' });
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        store,
        result.oracle,
        false,
        result.report.epoch,
        result.faultAt,
      ),
    ).rejects.toThrow();
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryApp,
        store,
        result.oracle,
        true,
        result.report.epoch,
        result.faultAt,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_AUTHORITY_ROLE' });
    expect(await status()).toBe(false);
  });
  it('현재UNKNOWN/owner 불일치/미등록자료필드는복구성공으로승격하지않는다', async () => {
    for (const change of [
      { knowledge: 'UNKNOWN', currentData: null, sourceRevision: null },
      { sourceOwner: 'EnterpriseAccess' },
      { extra: true },
    ]) {
      await resetSyntheticDatabases(sources.primaryAdmin, sources.journalAdmin);
      await seedSyntheticAccount(store, 'person', 'CUSTOMER');
      const result = await restore();
      const original = result.oracle.observe.bind(result.oracle);
      vi.spyOn(result.oracle, 'observe').mockImplementation(
        async (...args) => ({ ...(await original(...args)), ...change }) as never,
      );
      await expect(
        reconcileRecoveredSecurity(
          sources.primaryAdmin,
          store,
          result.oracle,
          true,
          result.report.epoch,
          result.faultAt,
        ),
      ).rejects.toThrow();
      expect(await status()).toBe(false);
    }
  });
  it('source봉인실패/누락새원본은전수대조완료가아니다', async () => {
    const result = await restore();
    const original = result.oracle.seal.bind(result.oracle);
    vi.spyOn(result.oracle, 'seal').mockImplementation(async (...args) => ({
      ...(await original(...args)),
      complete: false,
    }));
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        store,
        result.oracle,
        true,
        result.report.epoch,
        result.faultAt,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_INCOMPLETE' });
    expect(await status()).toBe(false);
  });
  it('현재source를복구로활성화/관리권한확대하거나revisiongap으로덮지않는다', async () => {
    const account = (await store.read('Account', 'person'))!;
    await store.execute(
      {
        principalId: 'synthetic-security-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'deactivateAccount',
        target: { id: 'person' },
        idempotencyKey: randomUUID(),
        input: { active: false },
        correlationId: 'original-deactivation',
        epoch: await store.currentEpoch(),
      },
      (transaction) => transaction.put('Account', { ...account, active: false, revision: 2 }, 1),
    );
    const result = await restore();
    result.oracle.update('Account', 'person', {
      ...result.oracle.snapshot.rows['Account/person'],
      active: true,
      revision: 3,
    } as ModelData);
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        store,
        result.oracle,
        true,
        result.report.epoch,
        result.faultAt,
      ),
    ).rejects.toThrow();
    expect(await status()).toBe(false);
  });
  it('봉인후미보호변경은final재대조에서auth를닫아두며원본을지우지않는다', async () => {
    const result = await restore();
    const original = result.oracle.seal.bind(result.oracle);
    vi.spyOn(result.oracle, 'seal').mockImplementation(async (...args) => {
      const seal = await original(...args);
      await sources.primaryAdmin.query(
        'UPDATE u1_account SET active=false,revision=revision+1 WHERE "accountId"=$1',
        ['person'],
      );
      return seal;
    });
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        store,
        result.oracle,
        true,
        result.report.epoch,
        result.faultAt,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_CHANGED' });
    expect(await status()).toBe(false);
    expect((await store.read('Account', 'person'))?.active).toBe(true);
  });
  it('잘못된새epoch/기한지난원래t0/시점변조는새인증권위를만들지않는다', async () => {
    const result = await restore();
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        store,
        result.oracle,
        true,
        'old-epoch',
        result.faultAt,
      ),
    ).rejects.toThrow();
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        store,
        result.oracle,
        true,
        result.report.epoch,
        new Date(Date.now() - 31 * 60000).toISOString(),
      ),
    ).rejects.toThrow();
    vi.spyOn(result.oracle, 'begin').mockResolvedValue({
      checkId: 'old',
      asOf: new Date(Date.now() - 60000).toISOString(),
    });
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        store,
        result.oracle,
        true,
        result.report.epoch,
        result.faultAt,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_FRESHNESS' });
    expect(await status()).toBe(false);
  });
});
