import { randomUUID } from 'node:crypto';
import { ref } from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import { syntheticBasis } from './enterprise.js';
// Q24's private minimum bootstrap is a fixture, never an application/public endpoint.
export async function seedMinimumStaffManager(
  store: ProtectedStore,
  accountId: string,
  now: Date,
): Promise<void> {
  const account = await store.read('Account', accountId);
  if (!account) throw new Error('합성 직원 계정 준비가 필요합니다.');
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
