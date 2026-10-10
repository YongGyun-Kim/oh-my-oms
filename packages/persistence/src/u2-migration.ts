import type { DataSource } from 'typeorm';
import { migrateMaterialModels } from './migration.js';
import { fingerprint, requireCondition } from '@oms/contracts';
import type { ProtectedStore } from './protected-store.js';
import { currentSecurityMatches } from './security-state.js';
export const u2CodeSecurityStateId = (setId: string): string =>
  'code-security-' + fingerprint({ model: 'RecoveryCodeSet', id: setId });
export const u2SecurityStateId = (accountId: string) =>
  'u2-security-' + fingerprint(accountId).slice(0, 32);
export const u2EnterpriseFenceId = (enterpriseId: string) =>
  'u2-enterprise-' + fingerprint(enterpriseId).slice(0, 32);
export const U2_STAFF_FENCE_ID = 'u2-staff-authority';
export async function backfillU2SecurityState(store: ProtectedStore): Promise<number> {
  const deadline = new Date(Date.now() + 300000).toISOString();
  let count = 0,
    scanned = 0;
  for await (const account of store.scan('Account', {}, deadline)) {
    requireCondition(
      ++scanned <= 2000,
      503,
      'BACKFILL_BATCH_LIMIT',
      '분리된 유한 backfill batch가 필요합니다.',
    );
    const accountId = String(account.accountId),
      id = u2SecurityStateId(accountId);
    const current = await store.currentProtected('Account', accountId);
    const states = await store.list('AccountSecurityState', {
      equals: { accountRef: { id: accountId } },
      limit: 2,
    });
    requireCondition(
      states.length <= 1,
      503,
      'BACKFILL_SECURITY_CONFLICT',
      '계정의 단일 보안 원본이 필요합니다.',
    );
    if (states[0]) {
      await store.currentProtected('AccountSecurityState', String(states[0].securityStateId));
      continue;
    }
    requireCondition(current, 503, 'BACKFILL_SOURCE', '보호된 현재 구형 계정이 필요합니다.');
    await store.execute(
      {
        principalId: 'registered-u2-backfill',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'backfillAccountSecurityState',
        target: { accountId },
        idempotencyKey: id,
        input: { accountId, sourceRevision: current.revision },
        correlationId: id,
        epoch: await store.currentEpoch(),
      },
      async (tx) => {
        const raw = await tx.get('Account', accountId);
        requireCondition(
          currentSecurityMatches('Account', current, raw),
          409,
          'BACKFILL_SOURCE_REVISION',
          '현재 구형 원본이 변경됐습니다.',
        );
        await tx.put('AccountSecurityState', {
          securityStateId: id,
          accountRef: {
            owner: 'IdentityRecovery',
            entity: 'Account',
            id: accountId,
            revision: Number(current.revision),
          },
          securityGeneration: 1,
          epoch: await store.currentEpoch(),
          revision: 1,
        });
        // Admit only a currently protected legacy set at the newly allocated
        // U2 boundary. This does NOT invent its historical security generation.
        const sets = await tx.list(
          'RecoveryCodeSet',
          { accountRef: { id: accountId }, confirmed: true, invalidated: false },
          100,
        );
        requireCondition(
          sets.length < 100,
          503,
          'BACKFILL_CODE_LIMIT',
          '유한 현재 legacy 코드 집합 대조가 필요합니다.',
        );
        for (const set of sets) {
          const visible = await store.currentProtected('RecoveryCodeSet', String(set.setId)),
            binding = await store.currentProtected(
              'ProviderBinding',
              (set.bindingRef as import('@oms/contracts').Ref).id,
            );
          requireCondition(
            currentSecurityMatches('RecoveryCodeSet', visible, set),
            409,
            'BACKFILL_SOURCE_REVISION',
            '현재 구형 코드 집합의 보호를 대조하세요.',
          );
          if (
            current.active !== true ||
            !binding?.active ||
            (binding.accountRef as import('@oms/contracts').Ref).id !== accountId ||
            binding.removalState !== 'CLEAR' ||
            binding.generation !== set.generation ||
            binding.revision !== (set.bindingRef as import('@oms/contracts').Ref).revision ||
            !(set.verifiers as { used: boolean }[]).some((code) => code.used === false)
          )
            continue;
          const rawBinding = await tx.get('ProviderBinding', String(binding.bindingId));
          requireCondition(
            currentSecurityMatches('ProviderBinding', binding, rawBinding),
            409,
            'BACKFILL_SOURCE_REVISION',
            '현재 구형 연결의 보호를 대조하세요.',
          );
          await tx.put('RecoveryCodeSecurityState', {
            codeSecurityId: u2CodeSecurityStateId(String(set.setId)),
            revision: 1,
            codeSetRef: {
              owner: 'IdentityRecovery',
              entity: 'RecoveryCodeSet',
              id: set.setId,
              revision: set.revision,
            },
            bindingRef: set.bindingRef,
            securityStateRef: {
              owner: 'IdentityRecovery',
              entity: 'AccountSecurityState',
              id,
              revision: 1,
            },
            securityGeneration: 1,
            origin: 'CURRENT_LEGACY_ADMISSION',
            establishedAt: new Date().toISOString(),
            epoch: await store.currentEpoch(),
          });
        }
      },
    );
    count++;
  }
  return count;
}

export async function migrateU2Models(source: DataSource): Promise<void> {
  await migrateMaterialModels(source);
  await source.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS u2_active_binding ON u1_provider_binding("accountRefKey",audience) WHERE active=true;
    CREATE UNIQUE INDEX IF NOT EXISTS u2_membership_account_enterprise ON u1_enterprise_membership("accountRefKey","enterpriseRefKey");
    CREATE UNIQUE INDEX IF NOT EXISTS u2_customer_active_grant ON u1_customer_role_grant("membershipRefKey","roleRefKey") WHERE "revokedAt" IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS u2_staff_active_grant ON u1_staff_role_grant("accountRefKey","roleRefKey") WHERE "revokedAt" IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS u2_security_account ON u1_account_security_state("accountRefKey");
    CREATE UNIQUE INDEX IF NOT EXISTS u2_code_security_set ON u1_recovery_code_security_state("codeSetRefKey");
    CREATE UNIQUE INDEX IF NOT EXISTS u2_enterprise_fence ON u1_enterprise_access_fence("enterpriseRefKey");
    CREATE UNIQUE INDEX IF NOT EXISTS u2_claim_grant ON u1_claim_receipt("grantRefKey") WHERE "grantRefKey" IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS u2_active_handoff_case ON u1_recovery_handoff_grant("caseRefKey") WHERE state='ISSUED';
    CREATE UNIQUE INDEX IF NOT EXISTS u2_recovery_execution_account ON u1_identity_execution_slot("accountRefKey") WHERE state IN ('ACTIVE','UNKNOWN');
    CREATE UNIQUE INDEX IF NOT EXISTS u2_operation_identity ON u1_identity_operation_result("caseRefKey","operationId");
    CREATE INDEX IF NOT EXISTS u2_invitation_page ON u1_membership_invitation("enterpriseRefKey",state,"issuedAt","invitationId");
    CREATE INDEX IF NOT EXISTS u2_party_case ON u1_party_claim_context("caseRefKey",state);
    CREATE INDEX IF NOT EXISTS u2_grant_case_state ON u1_recovery_handoff_grant("caseRefKey",state);
  `);
}
