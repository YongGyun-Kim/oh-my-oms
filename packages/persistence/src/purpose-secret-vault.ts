import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { canonicalJson, requireCondition, SchemaValidator, OmsError } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import type { ProtectedStore } from './protected-store.js';
import { randomUUID } from 'node:crypto';

export interface VaultBinding {
  id: string;
  purpose:
    'HANDOFF' | 'INVITATION_TOKEN' | 'ENROLLMENT_HANDLE' | 'PROVIDER_CHALLENGE' | 'FIRST_FACTOR';
  targetRef: Ref;
  accountRef: Ref | null;
  audience: 'CUSTOMER' | 'STAFF';
  bindingGeneration: number | null;
  sourceRevision: number;
  expiresAt: string;
  keyVersion: string;
}
export interface VaultPermit {
  authorityRef: Ref;
  targetRef: Ref;
  purpose: VaultBinding['purpose'];
  operation: string;
  epoch: string;
  deadlineAt: string;
}
export interface SecretEnvelope {
  iv: string;
  tag: string;
  ciphertext: string;
}
const schema = new SchemaValidator();
function aad(binding: VaultBinding): Buffer {
  requireCondition(
    Object.keys(binding).sort().join(',') ===
      'accountRef,audience,bindingGeneration,expiresAt,id,keyVersion,purpose,sourceRevision,targetRef',
    503,
    'VAULT_BINDING',
    '암호 자료 결합이 다릅니다.',
  );
  for (const field of ['id', 'keyVersion'] as const) schema.validate('Id', binding[field]);
  if (binding.purpose !== 'INVITATION_TOKEN' || binding.bindingGeneration !== null)
    schema.validate('Revision', binding.bindingGeneration);
  schema.validate('Revision', binding.sourceRevision);
  schema.validate('Instant', binding.expiresAt);
  schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Ref', binding.targetRef);
  if (binding.accountRef !== null)
    schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Account', binding.accountRef);
  requireCondition(
    [
      'HANDOFF',
      'INVITATION_TOKEN',
      'ENROLLMENT_HANDLE',
      'PROVIDER_CHALLENGE',
      'FIRST_FACTOR',
    ].includes(binding.purpose) && ['CUSTOMER', 'STAFF'].includes(binding.audience),
    503,
    'VAULT_BINDING',
    '암호 자료 목적이 다릅니다.',
  );
  return Buffer.from('oms-u2-purpose-vault:1\0' + canonicalJson(binding));
}
export function sealPurposeEnvelope(
  secret: Buffer,
  binding: VaultBinding,
  key: Buffer,
): SecretEnvelope {
  requireCondition(
    key.length === 32 && secret.length > 0 && secret.length <= 65536,
    503,
    'VAULT_SIZE_KEY',
    '암호 자료 또는 키 범위를 확인하세요.',
  );
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  cipher.setAAD(aad(binding));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}
export function openPurposeEnvelope(
  envelope: SecretEnvelope,
  binding: VaultBinding,
  key: Buffer,
): Buffer {
  requireCondition(key.length === 32, 503, 'VAULT_SIZE_KEY', '암호 키 범위를 확인하세요.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'), {
      authTagLength: 16,
    });
    decipher.setAAD(aad(binding));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
  } catch {
    throw new OmsError(503, 'VAULT_INTEGRITY', '암호 자료 무결성을 확인해야 합니다.');
  }
}
// The callback is a server-owned current protected permit/tombstone lookup.
// A caller boolean/header or journal append privilege cannot establish it.
export class PurposeSecretVault {
  private readonly key: Buffer;
  private terminalCursor: string | null = null;
  constructor(
    private readonly source: DataSource,
    key: Buffer,
    readonly keyVersion: string,
    private readonly authorize: (
      binding: VaultBinding,
      permit: VaultPermit,
      action: 'CREATE' | 'READ' | 'DESTROY',
    ) => Promise<void>,
    private readonly now: () => number = Date.now,
  ) {
    requireCondition(key.length === 32, 503, 'VAULT_KEY', '별도 목적 암호 키가 필요합니다.');
    this.key = Buffer.from(key);
  }
  private async check(
    binding: VaultBinding,
    permit: VaultPermit,
    action: 'CREATE' | 'READ' | 'DESTROY',
  ) {
    aad(binding);
    if (action !== 'DESTROY')
      requireCondition(
        this.now() < Date.parse(binding.expiresAt),
        403,
        'VAULT_EXPIRED',
        '암호 자료가 만료됐습니다.',
      );
    requireCondition(
      binding.keyVersion === this.keyVersion &&
        canonicalJson(binding.targetRef) === canonicalJson(permit.targetRef) &&
        binding.purpose === permit.purpose &&
        this.now() < Date.parse(permit.deadlineAt),
      403,
      'VAULT_PERMIT',
      '현재 정확한 목적 허가가 필요합니다.',
    );
    await this.authorize(binding, permit, action);
  }
  async create(secret: Buffer, binding: VaultBinding, permit: VaultPermit): Promise<void> {
    await this.check(binding, permit, 'CREATE');
    const remaining = Date.parse(binding.expiresAt) - this.now(),
      max =
        binding.purpose === 'INVITATION_TOKEN'
          ? 86400000
          : binding.purpose === 'FIRST_FACTOR'
            ? 30000
            : 300000;
    requireCondition(
      remaining > 0 && remaining <= max,
      403,
      'VAULT_EXPIRY',
      '원래 암호 자료 수명이 필요합니다.',
    );
    const envelope = sealPurposeEnvelope(secret, binding, this.key);
    await this.source.transaction(async (manager) => {
      await manager.query(
        'SELECT singleton FROM u2_vault.capacity WHERE singleton=true FOR UPDATE',
      );
      const counts = await manager.query('SELECT count(*)::int AS count FROM u2_vault.material');
      requireCondition(counts[0].count < 1000, 503, 'VAULT_CAPACITY', '암호 자료 저장 상한입니다.');
      await manager.query(
        'INSERT INTO u2_vault.material(id,binding,iv,tag,ciphertext,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
        [binding.id, binding, envelope.iv, envelope.tag, envelope.ciphertext, binding.expiresAt],
      );
    });
  }
  async read(binding: VaultBinding, permit: VaultPermit): Promise<Buffer> {
    await this.check(binding, permit, 'READ');
    requireCondition(
      this.now() < Date.parse(binding.expiresAt),
      403,
      'VAULT_EXPIRED',
      '암호 자료가 만료됐습니다.',
    );
    const rows = await this.source.query(
      'SELECT binding,iv,tag,ciphertext FROM u2_vault.material WHERE id=$1 AND expires_at>clock_timestamp()',
      [binding.id],
    );
    requireCondition(
      rows.length === 1 && canonicalJson(rows[0].binding) === canonicalJson(binding),
      403,
      'VAULT_UNAVAILABLE',
      '원래 암호 자료를 확인해야 합니다.',
    );
    const value = openPurposeEnvelope(rows[0], binding, this.key);
    await this.check(binding, permit, 'READ');
    return value;
  }
  async prepareEnrollmentHandle(
    secret: Buffer,
    binding: VaultBinding,
    permit: VaultPermit,
  ): Promise<void> {
    aad(binding);
    requireCondition(
      binding.purpose === 'ENROLLMENT_HANDLE' &&
        permit.purpose === binding.purpose &&
        ['identity.enrollment.prepare-handle', 'identity.saved-code.prepare-handle'].includes(
          permit.operation,
        ) &&
        canonicalJson(permit.targetRef) === canonicalJson(binding.targetRef) &&
        binding.keyVersion === this.keyVersion &&
        this.now() < Date.parse(permit.deadlineAt) &&
        Date.parse(binding.expiresAt) > this.now() &&
        Date.parse(binding.expiresAt) - this.now() <= 300000,
      403,
      'VAULT_PREPARE_PERMIT',
      '현재 단회 claim의 암호 준비 허가가 필요합니다.',
    );
    await this.authorize(binding, permit, 'CREATE');
    const envelope = sealPurposeEnvelope(secret, binding, this.key);
    await this.source.transaction(async (manager) => {
      await manager.query(
        'SELECT singleton FROM u2_vault.capacity WHERE singleton=true FOR UPDATE',
      );
      const counts = await manager.query('SELECT count(*)::int AS count FROM u2_vault.material');
      requireCondition(counts[0].count < 1000, 503, 'VAULT_CAPACITY', '암호 자료 저장 상한입니다.');
      await manager.query(
        'INSERT INTO u2_vault.material(id,binding,iv,tag,ciphertext,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
        [binding.id, binding, envelope.iv, envelope.tag, envelope.ciphertext, binding.expiresAt],
      );
    });
    // This prepares encrypted bytes only. READ still requires the exact
    // protected EnrollmentAuthority; no handle/ACK exists before prefix.
  }
  async prepareHandoff(secret: Buffer, binding: VaultBinding, permit: VaultPermit): Promise<void> {
    aad(binding);
    requireCondition(
      binding.purpose === 'HANDOFF' &&
        permit.purpose === binding.purpose &&
        permit.operation === 'identity.handoff.prepare' &&
        canonicalJson(permit.targetRef) === canonicalJson(binding.targetRef) &&
        binding.keyVersion === this.keyVersion &&
        this.now() < Date.parse(permit.deadlineAt) &&
        Date.parse(binding.expiresAt) > this.now() &&
        Date.parse(binding.expiresAt) - this.now() <= 300000,
      403,
      'VAULT_PREPARE_PERMIT',
      '현재 인계 발급의 비공개 암호 준비 허가가 필요합니다.',
    );
    await this.authorize(binding, permit, 'CREATE');
    const envelope = sealPurposeEnvelope(secret, binding, this.key);
    await this.source.transaction(async (manager) => {
      await manager.query(
        'SELECT singleton FROM u2_vault.capacity WHERE singleton=true FOR UPDATE',
      );
      const counts = await manager.query('SELECT count(*)::int AS count FROM u2_vault.material');
      requireCondition(counts[0].count < 1000, 503, 'VAULT_CAPACITY', '암호 자료 저장 상한입니다.');
      await manager.query(
        'INSERT INTO u2_vault.material(id,binding,iv,tag,ciphertext,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
        [binding.id, binding, envelope.iv, envelope.tag, envelope.ciphertext, binding.expiresAt],
      );
    });
    // Only encrypted preparation exists before commit. No delivery is possible
    // without the exact protected grant and current source authorizer.
  }
  async prepareInvitation(
    secret: Buffer,
    binding: VaultBinding,
    permit: VaultPermit,
  ): Promise<void> {
    aad(binding);
    requireCondition(
      binding.purpose === 'INVITATION_TOKEN' &&
        permit.purpose === binding.purpose &&
        permit.operation === 'enterprise.invitation.prepare' &&
        canonicalJson(permit.targetRef) === canonicalJson(binding.targetRef) &&
        binding.keyVersion === this.keyVersion &&
        this.now() < Date.parse(permit.deadlineAt) &&
        Date.parse(binding.expiresAt) > this.now() &&
        Date.parse(binding.expiresAt) - this.now() <= 86400000,
      403,
      'VAULT_PREPARE_PERMIT',
      '현재 초대 발급/교체의 비공개 암호 준비 허가가 필요합니다.',
    );
    await this.authorize(binding, permit, 'CREATE');
    const envelope = sealPurposeEnvelope(secret, binding, this.key);
    await this.source.transaction(async (manager) => {
      await manager.query(
        'SELECT singleton FROM u2_vault.capacity WHERE singleton=true FOR UPDATE',
      );
      const counts = await manager.query('SELECT count(*)::int AS count FROM u2_vault.material');
      requireCondition(counts[0].count < 1000, 503, 'VAULT_CAPACITY', '암호 자료 저장 상한입니다.');
      await manager.query(
        'INSERT INTO u2_vault.material(id,binding,iv,tag,ciphertext,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
        [binding.id, binding, envelope.iv, envelope.tag, envelope.ciphertext, binding.expiresAt],
      );
    });
    // Encrypted preparation does not grant READ or invitation acceptance.
  }
  async destroy(binding: VaultBinding, permit: VaultPermit): Promise<void> {
    // The authorizer requires an already PROTECTED terminal/tombstone marker.
    await this.check(binding, permit, 'DESTROY');
    await this.source.query('DELETE FROM u2_vault.material WHERE id=$1', [binding.id]);
  }
  async sweepExpired(
    store: ProtectedStore,
    limit = 25,
  ): Promise<{
    scanned: number;
    destroyed: number;
    blocked: number;
    failures: { vaultRef: string; code: string }[];
  }> {
    requireCondition(
      Number.isInteger(limit) && limit >= 1 && limit <= 100,
      400,
      'VAULT_SWEEP_LIMIT',
      '유한 만료 자료 대조가 필요합니다.',
    );
    const rows = (await this.source.query(
      'SELECT id,binding FROM u2_vault.material WHERE expires_at<=$1 ORDER BY expires_at,id LIMIT $2',
      [new Date(this.now()).toISOString(), limit],
    )) as { id: string; binding: VaultBinding }[];
    let destroyed = 0,
      blocked = 0;
    const failures: { vaultRef: string; code: string }[] = [];
    for (const row of rows) {
      const binding = row.binding;
      try {
        aad(binding);
        requireCondition(
          row.id === binding.id &&
            binding.keyVersion === this.keyVersion &&
            this.now() >= Date.parse(binding.expiresAt),
          403,
          'VAULT_EXPIRED_BINDING',
          '원래 만료 자료 metadata를 대조하세요.',
        );
        const before = await store.currentProtected(binding.targetRef.entity, binding.targetRef.id),
          epoch = await store.currentEpoch();
        await store.execute(
          {
            principalId: 'u2-purpose-material-expiry',
            audience: 'SYSTEM',
            owner: binding.targetRef.owner,
            operation: 'expireOriginalPurposeMaterial',
            target: binding.targetRef,
            idempotencyKey: 'expire-' + binding.id,
            input: {
              vaultRef: binding.id,
              targetRef: binding.targetRef,
              purpose: binding.purpose,
              expiresAt: binding.expiresAt,
            },
            correlationId: binding.id,
            epoch,
          },
          async (tx, requestId) => {
            const current = await tx.get(binding.targetRef.entity, binding.targetRef.id);
            requireCondition(
              canonicalJson(current) === canonicalJson(before),
              409,
              'VAULT_SWEEP_SOURCE_CHANGED',
              '원래 자료의 현재 보호 source를 재대조하세요.',
            );
            await tx.put('SecurityTombstone', {
              tombstoneId: randomUUID(),
              revision: 1,
              targetRef: binding.targetRef,
              purpose: binding.purpose,
              reason: before
                ? 'ORIGINAL_PURPOSE_TTL_EXPIRED'
                : 'EXPIRED_PREPARATION_WITHOUT_SOURCE',
              destroyedAt: new Date(this.now()).toISOString(),
              epoch,
            });
            await tx.put('RequestReceipt', {
              requestId,
              principalId: 'u2-purpose-material-expiry',
              audience: 'SYSTEM',
              operation: 'expireOriginalPurposeMaterial',
              targetIdentity: { kind: 'RECORD', recordRef: binding.targetRef },
              requestFingerprint: fingerprintForExpiry(binding),
              idempotencyKey: 'expire-' + binding.id,
              owner: binding.targetRef.owner,
              targetScope: null,
              requestState: 'RESULT_RECORDED',
              resultRefs: [],
              acceptedAt: new Date(this.now()).toISOString(),
              updatedAt: new Date(this.now()).toISOString(),
              revision: 1,
              correlationId: binding.id,
            });
          },
        );
        const markers = await store.list('SecurityTombstone', {
          equals: { targetRef: binding.targetRef, purpose: binding.purpose },
          limit: 100,
        });
        requireCondition(
          markers.some(
            (marker) =>
              marker.reason === 'ORIGINAL_PURPOSE_TTL_EXPIRED' ||
              marker.reason === 'EXPIRED_PREPARATION_WITHOUT_SOURCE',
          ),
          503,
          'VAULT_SWEEP_MARKER',
          '현재 정확 자료의 보호 파기 marker가 필요합니다.',
        );
        for (const marker of markers)
          await store.currentProtected('SecurityTombstone', String(marker.tombstoneId));
        requireCondition(
          this.now() >= Date.parse(binding.expiresAt),
          403,
          'VAULT_SWEEP_CLOCK',
          '원래 만료를 대조하세요.',
        );
        await this.source.query('DELETE FROM u2_vault.material WHERE id=$1 AND binding=$2::jsonb', [
          binding.id,
          binding,
        ]);
        destroyed++;
      } catch (error) {
        blocked++;
        failures.push({
          vaultRef: row.id,
          code: error instanceof OmsError ? error.code : 'VAULT_SWEEP_UNCONFIRMED',
        });
      }
    }
    return { scanned: rows.length, destroyed, blocked, failures };
  }
  async sweepTerminal(
    store: ProtectedStore,
    limit = 25,
  ): Promise<{
    scanned: number;
    destroyed: number;
    blocked: number;
    failures: { vaultRef: string; code: string }[];
  }> {
    requireCondition(
      Number.isInteger(limit) && limit >= 1 && limit <= 100,
      400,
      'VAULT_SWEEP_LIMIT',
      '유한 종료 자료 대조가 필요합니다.',
    );
    const rows = (await this.source.query(
      'SELECT id,binding FROM u2_vault.material WHERE ($1::text IS NULL OR id>$1) ORDER BY id LIMIT $2',
      [this.terminalCursor, limit],
    )) as { id: string; binding: VaultBinding }[];
    let destroyed = 0,
      blocked = 0;
    const failures: { vaultRef: string; code: string }[] = [];
    for (const row of rows) {
      this.terminalCursor = row.id;
      try {
        aad(row.binding);
        requireCondition(
          row.id === row.binding.id,
          403,
          'VAULT_TERMINAL_BINDING',
          '원래 암호 자료 metadata를 대조하세요.',
        );
        // list() returns only immutable versions inside the protected prefix.
        // Without an eligible protected terminal marker there is no destruction
        // attempt, including while a legitimate source commit is still pending.
        const markers = await store.list('SecurityTombstone', {
          equals: { targetRef: row.binding.targetRef, purpose: row.binding.purpose },
          limit: 100,
        });
        if (!markers.length) continue;
        // Eligible material still requires the CURRENT protected source and all
        // marker checks. Raw-only/UNKNOWN sources cannot authorize destruction.
        await store.currentProtected(row.binding.targetRef.entity, row.binding.targetRef.id);
        for (const marker of markers)
          await store.currentProtected('SecurityTombstone', String(marker.tombstoneId));
        const operation = {
          HANDOFF: 'identity.handoff.deliver',
          INVITATION_TOKEN: 'enterprise.invitation.deliver',
          ENROLLMENT_HANDLE: 'identity.enrollment.handle',
          PROVIDER_CHALLENGE: 'identity.enrollment.challenge',
          FIRST_FACTOR: 'identity.first-factor.replace',
        }[row.binding.purpose];
        await this.destroy(row.binding, {
          authorityRef: row.binding.targetRef,
          targetRef: row.binding.targetRef,
          purpose: row.binding.purpose,
          operation,
          epoch: await store.currentEpoch(),
          deadlineAt: new Date(this.now() + 3000).toISOString(),
        });
        destroyed++;
      } catch (error) {
        blocked++;
        failures.push({
          vaultRef: row.id,
          code: error instanceof OmsError ? error.code : 'VAULT_TERMINAL_SWEEP_UNCONFIRMED',
        });
      }
    }
    if (rows.length < limit) this.terminalCursor = null;
    return { scanned: rows.length, destroyed, blocked, failures };
  }
}
function fingerprintForExpiry(binding: VaultBinding): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        purpose: binding.purpose,
        targetRef: binding.targetRef,
        id: binding.id,
        expiresAt: binding.expiresAt,
      }),
    )
    .digest('hex');
}
export async function migratePurposeVault(journalAdmin: DataSource): Promise<void> {
  await journalAdmin.transaction(async (manager) => {
    await manager.query('CREATE SCHEMA IF NOT EXISTS u2_vault AUTHORIZATION u1_owner');
    await manager.query('SET LOCAL ROLE u1_owner');
    await manager.query(`REVOKE ALL ON SCHEMA u2_vault FROM PUBLIC,u1_journal_append,u2_verify_journal_append;
      CREATE TABLE IF NOT EXISTS u2_vault.capacity(singleton boolean PRIMARY KEY CHECK(singleton));
      INSERT INTO u2_vault.capacity VALUES(true) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS u2_vault.material(id varchar(128) PRIMARY KEY,binding jsonb NOT NULL,iv varchar(24) NOT NULL,tag varchar(24) NOT NULL,ciphertext text NOT NULL CHECK(octet_length(ciphertext)<=90000),expires_at timestamptz NOT NULL);
      REVOKE ALL ON ALL TABLES IN SCHEMA u2_vault FROM PUBLIC,u1_journal_append,u2_verify_journal_append;
      GRANT USAGE ON SCHEMA u2_vault TO u2_verify_vault;
      GRANT SELECT,UPDATE ON u2_vault.capacity TO u2_verify_vault;
      GRANT SELECT,INSERT,DELETE ON u2_vault.material TO u2_verify_vault;`);
  });
}
