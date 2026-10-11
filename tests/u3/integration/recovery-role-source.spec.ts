import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Authorization, U3StaffAccess } from '@oms/core';
import { U3_PROFILE } from '@oms/contracts';
import {
  decodePayload,
  ProtectedStore,
  reconcileRecoveredSecurity,
  restoreFromJournal,
  U3_SOURCE_CONTRACT,
} from '@oms/persistence';
import type { ModelData } from '@oms/persistence';
import {
  captureSyntheticSecuritySnapshot,
  SyntheticCurrentSecurityOracle,
} from '../../u1/fixtures/recovery-security-oracle.js';
import { initializeU3Databases, resetU3Databases, u3Sources } from '../fixtures/databases.js';
import { seedU3CommandAuthority } from '../fixtures/command-authority.js';
import { assertProtectedCandidate } from '../fixtures/protected-candidate.js';

// Small disposable data replay + owner reconciliation only, not a disaster,
// AWS deployment, operational identity proof, or the full DR target.
describe('model2 직원 행위의 짧은 보호 재연·현재 owner 취소', () => {
  const sources = u3Sources();
  let store: ProtectedStore, fixture: Awaited<ReturnType<typeof seedU3CommandAuthority>>;
  beforeAll(async () => {
    await initializeU3Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU3Databases(sources.primaryAdmin, sources.journalAdmin);
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
    fixture = await seedU3CommandAuthority(store);
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  async function prepare() {
    const created = await new U3StaffAccess(store, fixture.now).defineRole(fixture.staff, {
      meta: {
        clientRequestId: randomUUID(),
        expectedRevision: null,
        reason: '합성 복구 지원 역할',
        evidenceRefs: [],
      },
      label: '고정 단일 행위',
      actions: ['product.register'],
    });
    const original = (await new Authorization(store, fixture.now).currentRoleState(
      'StaffRole',
      created.targetRef!.id,
    ))!;
    // Simulate the independent owner's known, unprotected restrictive change.
    await sources.primaryAdmin
      .getRepository('RoleRevisionState')
      .update({ roleStateId: original.roleStateId }, { active: false, revision: 2 });
    const snapshot = await captureSyntheticSecuritySnapshot(sources.primaryAdmin);
    expect(snapshot.rows['RoleRevisionState/' + original.roleStateId]).toMatchObject({
      modelVersion: 2,
      sourceContract: U3_SOURCE_CONTRACT,
      active: false,
      revision: 2,
    });
    const legacyRole = Object.entries(snapshot.rows).find(
      ([key, row]) => key.startsWith('StaffRole/') && row.modelVersion === undefined,
    )![1];
    expect(legacyRole).not.toHaveProperty('modelVersion');
    expect(legacyRole).not.toHaveProperty('sourceContract');
    const oracle = new SyntheticCurrentSecurityOracle(snapshot, U3_PROFILE),
      faultAt = new Date().toISOString();
    const report = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(await store.read('RoleRevisionState', String(original.roleStateId))).toMatchObject({
      modelVersion: 2,
      sourceContract: U3_SOURCE_CONTRACT,
      active: true,
      revision: 1,
    });
    return { original, oracle, faultAt, report };
  }
  const ready = async () =>
    (
      await sources.primaryAdmin.query(
        'SELECT auth_ready FROM u1_recovery_control WHERE singleton=true',
      )
    )[0].auth_ready;
  it('현재 owner의 취소만 반영하며 실제 row2/payload2/Receipt SourceContract를 보존한다', async () => {
    const f = await prepare();
    expect(await ready()).toBe(false);
    const result = await reconcileRecoveredSecurity(
      sources.primaryAdmin,
      store,
      f.oracle,
      true,
      f.report.epoch,
      f.faultAt,
    );
    expect(result).toMatchObject({ changes: 1, realEnvironmentVerified: false });
    expect(
      await store.currentProtected('RoleRevisionState', String(f.original.roleStateId)),
    ).toMatchObject({
      modelVersion: 2,
      sourceContract: U3_SOURCE_CONTRACT,
      active: false,
      revision: 2,
    });
    const receipts = await store.list('RequestReceipt', {
      equals: { operation: 'reconcileRecoveredSecurity' },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.sourceContract).toEqual(U3_SOURCE_CONTRACT);
    const body = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      String(receipts[0]!.requestId),
      store.schema,
    );
    expect(body.schemaVersion).toBe(2);
    expect(body.rows.find((row) => row.model === 'RoleRevisionState')).toMatchObject({
      schemaVersion: 2,
      data: { modelVersion: 2, active: false },
    });
    expect(await ready()).toBe(true);
  });
  it('primary commit 뒤 중단은 같은 원래 candidate를 재보호하고 취소/Receipt를 중복하지 않는다', async () => {
    const f = await prepare();
    const interrupted = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (boundary === 'PRIMARY_COMMITTED') throw Error('synthetic-role-protection-loss');
      },
    );
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        interrupted,
        f.oracle,
        true,
        f.report.epoch,
        f.faultAt,
      ),
    ).rejects.toThrow('synthetic-role-protection-loss');
    expect(await ready()).toBe(false);
    const original = (
      await sources.primaryAdmin.query(
        'SELECT request_id,payload_text FROM u1_recovery_candidate WHERE epoch=$1 ORDER BY commit_order DESC LIMIT 1',
        [f.report.epoch],
      )
    )[0];
    expect(decodePayload(original.payload_text, store.schema).schemaVersion).toBe(2);
    const result = await reconcileRecoveredSecurity(
      sources.primaryAdmin,
      store,
      f.oracle,
      true,
      f.report.epoch,
      f.faultAt,
    );
    expect(result.changes).toBe(0);
    const receipts = await store.list('RequestReceipt', {
      equals: { operation: 'reconcileRecoveredSecurity' },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.requestId).toBe(original.request_id);
    const body = await assertProtectedCandidate(
      sources.primaryAdmin,
      sources.journalAdmin,
      original.request_id,
      store.schema,
    );
    expect(body.contentDigest).toBe(
      decodePayload(original.payload_text, store.schema).contentDigest,
    );
    expect((await store.read('RoleRevisionState', String(f.original.roleStateId)))?.revision).toBe(
      2,
    );
  });
  it('검증 가능한 legacy 모양이어도 model2→1 downgrade는 owner 복구 확인으로 승인하지 않는다', async () => {
    const f = await prepare(),
      legacy: ModelData = { ...f.original, active: false, revision: 2 };
    delete legacy.modelVersion;
    delete legacy.sourceContract;
    f.oracle.update('RoleRevisionState', String(f.original.roleStateId), legacy);
    await expect(
      reconcileRecoveredSecurity(
        sources.primaryAdmin,
        store,
        f.oracle,
        true,
        f.report.epoch,
        f.faultAt,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_AUTHORITY_EXPANSION' });
    expect(await ready()).toBe(false);
    expect(await store.read('RoleRevisionState', String(f.original.roleStateId))).toMatchObject({
      modelVersion: 2,
      sourceContract: U3_SOURCE_CONTRACT,
      active: true,
      revision: 1,
    });
    expect(
      await store.list('RequestReceipt', { equals: { operation: 'reconcileRecoveredSecurity' } }),
    ).toHaveLength(0);
  });
});
