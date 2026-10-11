import { randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import { ref } from '@oms/core';
import { currentSecurityMatches, U2_STAFF_FENCE_ID, type ProtectedStore } from '@oms/persistence';
import { syntheticBasis } from './enterprise.js';
// Q24's private minimum bootstrap is a fixture, never an application/public endpoint.
export async function seedMinimumStaffManager(
  store: ProtectedStore,
  accountId: string,
  now: Date,
): Promise<void> {
  const account = await store.read('Account', accountId);
  if (!account) throw new Error('합성 직원 계정 준비가 필요합니다.');
  const u2E2e = process.env.OMS_U1_DATABASE_PROFILE === 'e2e-isolated';
  const protectedAccount = u2E2e ? await store.currentProtected('Account', accountId) : null;
  if (u2E2e)
    requireCondition(
      protectedAccount?.audience === 'STAFF' &&
        currentSecurityMatches('Account', protectedAccount, account),
      503,
      'FIXTURE_STAFF_SOURCE',
      '현재 보호된 합성 직원 원본이 필요합니다.',
    );
  const key = randomUUID();
  await store.execute(
    {
      principalId: 'synthetic-bootstrap',
      audience: 'SYSTEM',
      owner: 'EnterpriseAccess',
      operation: 'initial-minimum-staff-role',
      target: { kind: 'NONE' },
      idempotencyKey: key,
      input: { accountId, action: 'staff.role.manage' },
      correlationId: key,
      epoch: await store.currentEpoch(),
    },
    async (transaction, requestId) => {
      const role = {
        staffRoleId: randomUUID(),
        label: '합성 최소 권한 준비',
        actions: ['staff.role.manage'],
        revision: 1,
      };
      const grant = {
        staffGrantId: randomUUID(),
        accountRef: ref('Account', account),
        roleRef: ref('StaffRole', role),
        effectiveFrom: now.toISOString(),
        revokedAt: null,
        grantedBy: ref('Account', account),
        revision: 1,
      };
      await transaction.put('StaffRole', role);
      await transaction.put('StaffRoleGrant', grant);
      if (u2E2e) {
        requireCondition(
          currentSecurityMatches(
            'Account',
            protectedAccount,
            await transaction.get('Account', accountId),
          ),
          409,
          'FIXTURE_STAFF_SOURCE_CHANGED',
          '합성 직원 원본이 변경됐습니다.',
        );
        const existing = await transaction.get('StaffAuthorityFence', U2_STAFF_FENCE_ID);
        const protectedFence = await store.currentProtected(
          'StaffAuthorityFence',
          U2_STAFF_FENCE_ID,
        );
        requireCondition(
          currentSecurityMatches('StaffAuthorityFence', protectedFence, existing),
          503,
          'FIXTURE_STAFF_FENCE_UNCONFIRMED',
          '기존 staff fence 보호를 확인하세요.',
        );
        if (!existing)
          await transaction.put('StaffAuthorityFence', {
            fenceId: U2_STAFF_FENCE_ID,
            authorityRevision: 1,
            revision: 1,
          });
      }
      await transaction.put('RequestReceipt', {
        requestId,
        principalId: 'synthetic-bootstrap',
        audience: 'SYSTEM',
        operation: 'initial-minimum-staff-role',
        targetIdentity: { kind: 'NONE' },
        requestFingerprint: 'synthetic-profile',
        idempotencyKey: key,
        owner: 'EnterpriseAccess',
        targetScope: null,
        requestState: 'RESULT_RECORDED',
        resultRefs: [ref('StaffRole', role), ref('StaffRoleGrant', grant)],
        acceptedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        revision: 1,
        correlationId: key,
      });
      await transaction.put('AccessHistory', {
        historyId: randomUUID(),
        owner: 'EnterpriseAccess',
        actorAccountRef: null,
        verifiedPersonRef: null,
        occurredAt: now.toISOString(),
        reason: 'Q24 합성 비공개 최초 최소 준비',
        beforeRef: null,
        afterRef: ref('StaffRoleGrant', grant),
        evidenceRefs: [syntheticBasis],
        requestId,
        resultRefs: [ref('StaffRoleGrant', grant)],
        correctionOf: null,
        sourceRevision: 1,
      });
    },
  );
}
