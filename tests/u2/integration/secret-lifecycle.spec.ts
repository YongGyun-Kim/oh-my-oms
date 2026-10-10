import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { ProtectedStore, PurposeSecretVault, authorizeProtectedVault } from '@oms/persistence';
import type { VaultBinding, VaultPermit } from '@oms/persistence';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedU2RecoveryGraph } from '../fixtures/identity.js';
import { seedVerifiedRecoveryParty } from '../fixtures/identity.js';
describe('목적 vault 권한/expiry/회수·파기 suppression', () => {
  const sources = u2Sources(),
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend),
    key = randomBytes(32);
  const authorize = (
    binding: VaultBinding,
    permit: VaultPermit,
    action: 'CREATE' | 'READ' | 'DESTROY',
  ) => authorizeProtectedVault(store, binding, permit, action);
  const vault = new PurposeSecretVault(sources.vault, key, 'synthetic-vault-1', authorize);
  beforeAll(async () => {
    await initializeU2Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => {
    await resetU2Databases(sources.primaryAdmin, sources.journalAdmin);
    await sources.journalAdmin.query('DELETE FROM u2_vault.material');
  });
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  const fixture = async () => {
    const graph = await seedU2RecoveryGraph(store),
      r = graph.references.RecoveryHandoffGrant!;
    const binding: VaultBinding = {
      id: randomUUID(),
      purpose: 'HANDOFF',
      targetRef: r,
      accountRef: graph.references.Account!,
      audience: 'CUSTOMER',
      bindingGeneration: 1,
      sourceRevision: 1,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      keyVersion: 'synthetic-vault-1',
    };
    const permit: VaultPermit = {
      authorityRef: r,
      targetRef: r,
      purpose: 'HANDOFF',
      operation: 'identity.handoff.deliver',
      epoch: await store.currentEpoch(),
      deadlineAt: binding.expiresAt,
    };
    return { graph, binding, permit };
  };
  it('실제 분리 role/현재 보호 grant로만 원문을 제한 전달한다', async () => {
    const { binding, permit } = await fixture(),
      secret = randomBytes(12);
    await vault.create(secret, binding, permit);
    expect(await vault.read(binding, permit)).toEqual(secret);
  });
  it('journal append와 primary app role에는 암호 namespace 조회 권한이 없다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    await expect(
      sources.journalAppend.query('SELECT * FROM u2_vault.material'),
    ).rejects.toMatchObject({ driverError: { code: '42501' } });
    const current = await sources.primaryApp.query('SELECT current_user AS name');
    expect(current[0].name).toBe('u2_verify_app');
    const privilege = await sources.journalAdmin.query(
      "SELECT has_table_privilege('u2_verify_journal_append','u2_vault.material','SELECT') AS allowed",
    );
    expect(privilege[0].allowed).toBe(false);
  });
  it('원래 target/key/purpose/현재 permit을 바꿀 수 없다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    await expect(
      vault.read(binding, { ...permit, targetRef: { ...permit.targetRef, id: randomUUID() } }),
    ).rejects.toThrow();
    await expect(
      vault.read(binding, { ...permit, operation: 'owner-diagnostic' }),
    ).rejects.toThrow();
    await expect(vault.read({ ...binding, keyVersion: 'other' }, permit)).rejects.toThrow();
  });
  it('만료 정확 경계에서 read/create를 거절하고 TTL을 재발급하지 않는다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    const expired = new PurposeSecretVault(sources.vault, key, 'synthetic-vault-1', authorize, () =>
      Date.parse(binding.expiresAt),
    );
    await expect(expired.read(binding, permit)).rejects.toThrow();
    const before = new PurposeSecretVault(
      sources.vault,
      key,
      'synthetic-vault-1',
      authorize,
      () => Date.parse(binding.expiresAt) - 1,
    );
    expect(await before.read(binding, permit)).toHaveLength(12);
    const after = new PurposeSecretVault(
      sources.vault,
      key,
      'synthetic-vault-1',
      authorize,
      () => Date.parse(binding.expiresAt) + 1,
    );
    await expect(after.read(binding, permit)).rejects.toThrow();
    const issued = Date.now(),
      fixed = new PurposeSecretVault(
        sources.vault,
        key,
        'synthetic-vault-1',
        authorize,
        () => issued,
      );
    await expect(
      fixed.create(
        randomBytes(12),
        { ...binding, id: randomUUID(), expiresAt: new Date(issued + 300001).toISOString() },
        permit,
      ),
    ).rejects.toThrow();
  });
  it('같은 ID overwrite/upsert로 ciphertext와 nonce를 바꾸지 않는다', async () => {
    const { binding, permit } = await fixture(),
      secret = randomBytes(12);
    await vault.create(secret, binding, permit);
    await expect(vault.create(randomBytes(12), binding, permit)).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
    expect(await vault.read(binding, permit)).toEqual(secret);
  });
  it('보호된 파기 marker 없이 삭제할 수 없고 marker 후 raw backup도 다시 읽지 못한다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    const backup = await sources.journalAdmin.query('SELECT * FROM u2_vault.material WHERE id=$1', [
      binding.id,
    ]);
    await expect(vault.destroy(binding, permit)).rejects.toThrow('marker');
    await store.execute(
      {
        principalId: 'synthetic-vault-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'destroy-purpose-secret',
        target: binding.targetRef,
        idempotencyKey: randomUUID(),
        input: { vaultRef: binding.id },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put('SecurityTombstone', {
          tombstoneId: randomUUID(),
          revision: 1,
          targetRef: binding.targetRef,
          purpose: 'HANDOFF',
          reason: '소비/회수 합성 검증',
          destroyedAt: new Date().toISOString(),
          epoch: await store.currentEpoch(),
        });
      },
    );
    await vault.destroy(binding, permit);
    expect(
      await sources.journalAdmin.query('SELECT id FROM u2_vault.material WHERE id=$1', [
        binding.id,
      ]),
    ).toHaveLength(0);
    const b = backup[0];
    await sources.journalAdmin.query('INSERT INTO u2_vault.material VALUES($1,$2,$3,$4,$5,$6)', [
      b.id,
      b.binding,
      b.iv,
      b.tag,
      b.ciphertext,
      b.expires_at,
    ]);
    await expect(vault.read(binding, permit)).rejects.toThrow('전달할 수 없습니다');
  });
  it('원문 표식은 primary 후보/journal/outbox에 없다', async () => {
    const { binding, permit } = await fixture(),
      canary = 'SYNTHETIC-SECRET-CANARY-' + randomUUID();
    await vault.create(Buffer.from(canary), binding, permit);
    const primary = await sources.primaryApp.query(
        'SELECT payload_text FROM u1_recovery_candidate',
      ),
      journal = await sources.journalAppend.query('SELECT payload_text FROM u1_protected_entry');
    expect(JSON.stringify(primary)).not.toContain(canary);
    expect(JSON.stringify(journal)).not.toContain(canary);
    expect(await store.list('OutboxDelivery')).toHaveLength(0);
  });
  it('primary-only 파기 marker에서는 old 전달 허가로 fallback하지 않는다', async () => {
    const { binding, permit, graph } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    await sources.primaryAdmin.getRepository('SecurityTombstone').insert({
      ...graph.rows.SecurityTombstone!,
      tombstoneId: randomUUID(),
      targetRef: binding.targetRef,
    });
    await expect(vault.read(binding, permit)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
  });
  it('현재 epoch만 바꿔 만든 permit은 옛 보호 source/ciphertext를 다시 읽지 못한다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    const mocked = vi.spyOn(store, 'currentEpoch').mockResolvedValue('synthetic-new-epoch');
    try {
      await expect(
        vault.read(binding, { ...permit, epoch: 'synthetic-new-epoch' }),
      ).rejects.toMatchObject({ code: 'VAULT_EPOCH_FENCED' });
    } finally {
      mocked.mockRestore();
    }
  });
  it('원래 TTL 만료 자료는 정확 protected marker 뒤 실제 cipher 삭제하고 page 상한을 유지한다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    const expired = new PurposeSecretVault(sources.vault, key, 'synthetic-vault-1', authorize, () =>
      Date.parse(binding.expiresAt),
    );
    expect(await expired.sweepExpired(store, 1)).toMatchObject({
      scanned: 1,
      destroyed: 1,
      blocked: 0,
    });
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [binding.id]),
    ).toHaveLength(0);
    expect(
      (
        await store.list('SecurityTombstone', {
          equals: { targetRef: binding.targetRef, purpose: 'HANDOFF' },
        })
      ).some((row) => row.reason === 'ORIGINAL_PURPOSE_TTL_EXPIRED'),
    ).toBe(true);
    await expect(expired.sweepExpired(store, 101)).rejects.toMatchObject({
      code: 'VAULT_SWEEP_LIMIT',
    });
  });
  it('보호 source 없는 실제 암호 preparation도 만료 후 원래 Ref marker를 보호하고 파기한다', async () => {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    await f.handoffs.verifyParty(f.staff, f.verifyInput);
    const current = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      binding: VaultBinding = {
        id: randomUUID(),
        purpose: 'HANDOFF',
        targetRef: {
          owner: 'IdentityRecovery',
          entity: 'RecoveryHandoffGrant',
          id: randomUUID(),
          revision: 1,
        },
        accountRef: f.customer.actorAccountRef,
        audience: 'CUSTOMER',
        bindingGeneration: 1,
        sourceRevision: 1,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        keyVersion: 'synthetic-vault-1',
      };
    await vault.prepareHandoff(randomBytes(12), binding, {
      authorityRef: current.verificationRef as import('@oms/contracts').Ref,
      targetRef: binding.targetRef,
      purpose: 'HANDOFF',
      operation: 'identity.handoff.prepare',
      epoch: await store.currentEpoch(),
      deadlineAt: new Date(Date.now() + 10000).toISOString(),
    });
    expect(await store.currentProtected('RecoveryHandoffGrant', binding.targetRef.id)).toBeNull();
    const expired = new PurposeSecretVault(sources.vault, key, 'synthetic-vault-1', authorize, () =>
      Date.parse(binding.expiresAt),
    );
    expect(await expired.sweepExpired(store)).toMatchObject({ destroyed: 1, blocked: 0 });
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [binding.id]),
    ).toHaveLength(0);
    expect(
      (
        await store.list('SecurityTombstone', {
          equals: { targetRef: binding.targetRef, purpose: 'HANDOFF' },
        })
      ).some((row) => row.reason === 'EXPIRED_PREPARATION_WITHOUT_SOURCE'),
    ).toBe(true);
  });
  it('primary-only source/보호 marker 간극은 expired cipher를 삭제하지 않고 명시 blocked로 돌려준다', async () => {
    const { binding, permit, graph } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    await sources.primaryAdmin
      .getRepository('RecoveryHandoffGrant')
      .update(
        { grantId: binding.targetRef.id },
        { ...graph.rows.RecoveryHandoffGrant!, state: 'REVOKED', revision: 2 },
      );
    const expired = new PurposeSecretVault(sources.vault, key, 'synthetic-vault-1', authorize, () =>
        Date.parse(binding.expiresAt),
      ),
      result = await expired.sweepExpired(store);
    expect(result).toMatchObject({ destroyed: 0, blocked: 1 });
    expect(result.failures[0]?.code).toBe('CURRENT_AUTH_NOT_PROTECTED');
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [binding.id]),
    ).toHaveLength(1);
  });
  it('종료 marker 이후 실제 삭제 전 crash는 TTL 이전 재시작 sweep으로 원문 없이 파기한다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    await store.execute(
      {
        principalId: 'synthetic-terminal-control',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-terminal-before-delete',
        target: binding.targetRef,
        idempotencyKey: randomUUID(),
        input: { vaultRef: binding.id },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put('SecurityTombstone', {
          tombstoneId: randomUUID(),
          revision: 1,
          targetRef: binding.targetRef,
          purpose: binding.purpose,
          reason: 'CLAIMED',
          destroyedAt: new Date().toISOString(),
          epoch: await store.currentEpoch(),
        });
      },
    );
    const restarted = new PurposeSecretVault(sources.vault, key, 'synthetic-vault-1', authorize),
      read = vi.spyOn(restarted, 'read');
    expect(await restarted.sweepTerminal(store)).toMatchObject({
      scanned: 1,
      destroyed: 1,
      blocked: 0,
    });
    expect(read).not.toHaveBeenCalled();
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [binding.id]),
    ).toHaveLength(0);
    expect(await restarted.sweepTerminal(store)).toMatchObject({ scanned: 0, destroyed: 0 });
  });
  it('종료 marker 없는 아직 유효 자료는 sweep으로 새 종료/TTL을 만들거나 삭제하지 않는다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    expect(await vault.sweepTerminal(store)).toMatchObject({
      scanned: 1,
      destroyed: 0,
      blocked: 0,
    });
    expect(await vault.read(binding, permit)).toHaveLength(12);
    await expect(vault.sweepTerminal(store, 101)).rejects.toMatchObject({
      code: 'VAULT_SWEEP_LIMIT',
    });
  });
  it('종료 sweep에서도 current source의 raw-only 변경은 파기와 read를 차단한다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    await store.execute(
      {
        principalId: 'synthetic-terminal-eligible-negative',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-protected-terminal-before-raw-tamper',
        target: binding.targetRef,
        idempotencyKey: randomUUID(),
        input: { diagnostic: true },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        await tx.put('SecurityTombstone', {
          tombstoneId: randomUUID(),
          revision: 1,
          targetRef: binding.targetRef,
          purpose: binding.purpose,
          reason: 'REVOKED',
          destroyedAt: new Date().toISOString(),
          epoch: await store.currentEpoch(),
        });
      },
    );
    await sources.primaryAdmin
      .getRepository('RecoveryHandoffGrant')
      .update({ grantId: binding.targetRef.id }, { state: 'REVOKED', revision: 2 });
    const result = await vault.sweepTerminal(store);
    expect(result).toMatchObject({ scanned: 1, destroyed: 0, blocked: 1 });
    expect(result.failures[0]?.code).toBe('CURRENT_AUTH_NOT_PROTECTED');
    await expect(vault.read(binding, permit)).rejects.toMatchObject({
      code: 'CURRENT_AUTH_NOT_PROTECTED',
    });
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [binding.id]),
    ).toHaveLength(1);
  });
  it('보호 terminal marker가 없는 진행 자료는 파기 시도하지 않고 prefix 확정 뒤에만 현재 원본으로 파기한다', async () => {
    const { binding, permit } = await fixture();
    await vault.create(randomBytes(12), binding, permit);
    let armed = true,
      observed: Awaited<ReturnType<typeof vault.sweepTerminal>> | undefined;
    const guardedReads = vi.spyOn(store, 'currentProtected');
    const racing = new ProtectedStore(
      sources.primaryApp,
      sources.journalAppend,
      async (boundary) => {
        if (armed && boundary === 'PRIMARY_COMMITTED') {
          armed = false;
          observed = await vault.sweepTerminal(store);
          console.info(
            JSON.stringify({
              event: 'profile-terminal-sweep-boundary',
              phase: 'PRIMARY_COMMITTED_BEFORE_PREFIX',
              blocked: observed.blocked,
              destroyed: observed.destroyed,
              currentSourceNotProtected:
                observed.failures[0]?.code === 'CURRENT_AUTH_NOT_PROTECTED',
            }),
          );
        }
      },
    );
    await racing.execute(
      {
        principalId: 'synthetic-terminal-boundary',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'fixture-terminal-protected-boundary',
        target: binding.targetRef,
        idempotencyKey: randomUUID(),
        input: { diagnostic: true },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        const current = (await tx.get('RecoveryHandoffGrant', binding.targetRef.id))!;
        await tx.put('RecoveryHandoffGrant', { ...current, state: 'REVOKED', revision: 2 }, 1);
        await tx.put('SecurityTombstone', {
          tombstoneId: randomUUID(),
          revision: 1,
          targetRef: binding.targetRef,
          purpose: binding.purpose,
          reason: 'REVOKED',
          destroyedAt: new Date().toISOString(),
          epoch: await store.currentEpoch(),
        });
      },
    );
    try {
      expect(observed).toMatchObject({ scanned: 1, blocked: 0, destroyed: 0 });
      expect(guardedReads).not.toHaveBeenCalled();
    } finally {
      guardedReads.mockRestore();
    }
    expect(await vault.sweepTerminal(store)).toMatchObject({
      scanned: 1,
      blocked: 0,
      destroyed: 1,
    });
    expect(await vault.sweepTerminal(store)).toMatchObject({
      scanned: 0,
      blocked: 0,
      destroyed: 0,
    });
  });
});
