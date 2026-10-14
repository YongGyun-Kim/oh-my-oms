import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ProtectedStore, restoreFromJournal, physicalData } from '@oms/persistence';
import type { FaultBoundary } from '@oms/persistence';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2RecoveryGraph } from '../fixtures/identity.js';
describe('U2 primary/journal/prefix 중단·복원 경계', () => {
  const sources = u2Sources(),
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  beforeAll(async () => {
    await initializeU2Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => resetU2Databases(sources.primaryAdmin, sources.journalAdmin));
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  for (const boundary of [
    'PRIMARY_COMMITTED',
    'JOURNAL_PROTECTED',
    'VISIBILITY_UPDATED',
  ] as FaultBoundary[])
    it(boundary + '에서 응답은 실패하고 원래 후보만 재대조한다', async () => {
      const graph = await seedU2RecoveryGraph(store),
        r = graph.references.AccountSecurityState!;
      let failed = false;
      const interrupted = new ProtectedStore(
        sources.primaryApp,
        sources.journalAppend,
        async (phase) => {
          if (phase === boundary && !failed) {
            failed = true;
            throw new Error('주입된 ' + boundary);
          }
        },
      );
      const request = {
        principalId: 'synthetic-u2',
        audience: 'SYSTEM' as const,
        owner: 'IdentityRecovery',
        operation: 'security-generation',
        target: r,
        idempotencyKey: randomUUID(),
        input: { revision: 2 },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      };
      let effects = 0;
      const write = async (tx: import('@oms/persistence').ProtectedTransaction) => {
        effects++;
        await tx.put(
          r.entity,
          { ...graph.rows.AccountSecurityState!, securityGeneration: 2, revision: 2 },
          1,
        );
      };
      await expect(interrupted.execute(request, write)).rejects.toThrow('주입된');
      if (boundary !== 'VISIBILITY_UPDATED')
        await expect(store.currentProtected(r.entity, r.id)).rejects.toMatchObject({
          code: 'CURRENT_AUTH_NOT_PROTECTED',
        });
      const result = await store.execute(request, write);
      expect(result.replay).toBe(true);
      expect(effects).toBe(1);
      expect((await store.currentProtected(r.entity, r.id))?.securityGeneration).toBe(2);
    });
  it('unprotected primary U2 행은 복원에서 제거하고 구형 stable account는 보존한다', async () => {
    const graph = await seedU2RecoveryGraph(store),
      extra = randomUUID();
    await sources.primaryAdmin
      .getRepository('SecurityTombstone')
      .insert(
        physicalData('SecurityTombstone', { ...graph.rows.SecurityTombstone!, tombstoneId: extra }),
      );
    const restored = await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect(restored.requiresSecurityConfirmation).toBe(true);
    expect(await store.read('SecurityTombstone', extra)).toBeNull();
    expect(await store.read('Account', graph.identity.account.accountId)).toEqual(
      graph.identity.account,
    );
    await expect(
      store.currentProtected('Account', graph.identity.account.accountId),
    ).rejects.toMatchObject({ code: 'RECOVERY_SECURITY_UNCONFIRMED' });
  });
  it('5실패/회수/UNKNOWN/파기 marker는 latest protected after-image 그대로다', async () => {
    const graph = await seedU2RecoveryGraph(store, 'EXHAUSTED');
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    for (const name of [
      'RecoveryHandoffGrant',
      'EnrollmentAuthority',
      'IdentityExecutionSlot',
      'IdentityOperationResult',
      'SecurityTombstone',
    ])
      expect(await store.read(name, graph.references[name]!.id)).toEqual(graph.rows[name]);
    expect(
      (await store.read('RecoveryHandoffGrant', graph.references.RecoveryHandoffGrant!.id))
        ?.attemptCount,
    ).toBe(5);
    expect(
      (await store.read('IdentityOperationResult', graph.references.IdentityOperationResult!.id))
        ?.knowledge,
    ).toBe('UNKNOWN');
  });
  it('단회 소비/receipt와 회수된 authority는 restore 뒤 부활하지 않는다', async () => {
    const graph = await seedU2RecoveryGraph(store),
      claimId = randomUUID(),
      grantRef = graph.references.RecoveryHandoffGrant!,
      claimRef = { ...grantRef, entity: 'ClaimReceipt', id: claimId, revision: 1 };
    const receipt = {
      claimReceiptId: claimId,
      requestRef: null,
      revision: 1,
      grantRef,
      caseRef: graph.references.RecoveryCase,
      partyContextRef: graph.references.PartyClaimContext,
      accountRef: graph.references.Account,
      authorityRef: graph.references.EnrollmentAuthority,
      consumedAt: new Date().toISOString(),
      epoch: await store.currentEpoch(),
    };
    await store.execute(
      {
        principalId: 'synthetic-u2',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-consumed-then-revoked',
        target: grantRef,
        idempotencyKey: randomUUID(),
        input: { claimId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put('ClaimReceipt', receipt);
        await tx.put(
          'RecoveryHandoffGrant',
          {
            ...graph.rows.RecoveryHandoffGrant!,
            state: 'CLAIMED',
            claimReceiptRef: claimRef,
            revision: 2,
          },
          1,
        );
      },
    );
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    expect((await store.read('RecoveryHandoffGrant', grantRef.id))?.state).toBe('CLAIMED');
    expect(await store.read('ClaimReceipt', claimId)).toEqual(receipt);
    expect(
      (await store.read('EnrollmentAuthority', graph.references.EnrollmentAuthority!.id))?.state,
    ).toBe('REVOKED');
  });
  it('snapshot 동안 실제 U1/U2 append role 모두 차단하고 fault 재개는 원래 grant만 복구한다', async () => {
    await seedU2RecoveryGraph(store);
    let inspected = false;
    await expect(
      restoreFromJournal(sources.primaryAdmin, sources.journalAdmin, async (entry) => {
        if (entry.phase === 'VERIFIED' && !inspected) {
          inspected = true;
          const roles = await sources.journalAdmin.query(
            "SELECT rolname,has_function_privilege(oid,'u1_append_entry(varchar,bigint,text,varchar,varchar,text)','EXECUTE') AS allowed FROM pg_roles WHERE rolname=ANY($1::text[])",
            [['u1_journal_append', 'u2_verify_journal_append']],
          );
          expect(roles).toHaveLength(2);
          expect(roles.every((role: { allowed: boolean }) => !role.allowed)).toBe(true);
          await expect(
            sources.journalAppend.query("SELECT u1_append_entry('initial',1,'{}','bad',NULL,'{}')"),
          ).rejects.toMatchObject({ driverError: { code: '42501' } });
          throw new Error('snapshot fault');
        }
      }),
    ).rejects.toThrow('snapshot fault');
    const blocked = await sources.primaryAdmin.query(
      'SELECT enabled,auth_ready FROM u1_recovery_control',
    );
    expect(blocked[0]).toEqual({ enabled: false, auth_ready: false });
    await restoreFromJournal(sources.primaryAdmin, sources.journalAdmin);
    const roles = await sources.journalAdmin.query(
      "SELECT rolname,has_function_privilege(oid,'u1_append_entry(varchar,bigint,text,varchar,varchar,text)','EXECUTE') AS allowed FROM pg_roles WHERE rolname=ANY($1::text[])",
      [['u1_journal_append', 'u2_verify_journal_append']],
    );
    expect(roles.every((role: { allowed: boolean }) => role.allowed)).toBe(true);
    const vault = await sources.journalAdmin.query(
      "SELECT has_schema_privilege('u2_verify_journal_append','u2_vault','USAGE') AS allowed",
    );
    expect(vault[0].allowed).toBe(false);
  });
});
