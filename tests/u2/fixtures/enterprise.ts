export { SyntheticEnterpriseVerification, syntheticBasis } from '../../u1/fixtures/enterprise.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { CommandMeta } from '@oms/contracts';
import { EnterpriseAccess, IdentityRecovery, ref } from '@oms/core';
import { U2_STAFF_FENCE_ID, backfillU2SecurityState, u2EnterpriseFenceId } from '@oms/persistence';
import type { ProtectedStore } from '@oms/persistence';
import {
  seedSyntheticAccount,
  SyntheticIdentityProvider,
  syntheticPassword,
  syntheticFactor,
} from '../../u1/fixtures/identity.js';
import { SyntheticEnterpriseVerification, syntheticBasis } from '../../u1/fixtures/enterprise.js';
export const u2Meta = (expectedRevision: number | null = null): CommandMeta => ({
  clientRequestId: randomUUID(),
  expectedRevision,
  reason: '합성 검증 변경',
  evidenceRefs: [syntheticBasis],
});
export async function loginU2SyntheticAccount(
  identity: IdentityRecovery,
  id: string,
  audience: 'CUSTOMER' | 'STAFF' = 'CUSTOMER',
) {
  const proof = audience === 'STAFF' ? 'synthetic-private-ingress' : null,
    challenge = await identity.login(
      audience,
      id + '@example.invalid',
      syntheticPassword,
      'synthetic-u2-peer',
      proof,
    );
  await identity.verifyFactor(
    challenge.challengeId!,
    syntheticFactor,
    'synthetic-u2-peer',
    proof,
    true,
  );
  const codes = await identity.issueRecoveryCodes(challenge.challengeId!, proof),
    completed = await identity.acknowledgeRecoveryCodes(
      challenge.challengeId!,
      codes.setId,
      true,
      proof,
    );
  return identity.authenticate(completed.sessionToken!, audience, randomUUID(), proof);
}
export async function seedU2Enterprise(store: ProtectedStore) {
  const now = () => new Date(),
    customerId = randomUUID(),
    staffId = randomUUID();
  await seedSyntheticAccount(store, customerId, 'CUSTOMER');
  await seedSyntheticAccount(store, staffId, 'STAFF');
  const ingress = 'synthetic-private-ingress',
    identity = new IdentityRecovery(store, new SyntheticIdentityProvider(), {
      synthetic: true,
      verifierKey: randomBytes(32),
      now,
      staffIngress: async (proof) => proof === ingress,
    });
  const login = async (id: string, audience: 'CUSTOMER' | 'STAFF') => {
    const proof = audience === 'STAFF' ? ingress : null;
    const challenge = await identity.login(
      audience,
      id + '@example.invalid',
      syntheticPassword,
      'synthetic-u2-peer',
      proof,
    );
    await identity.verifyFactor(
      challenge.challengeId!,
      syntheticFactor,
      'synthetic-u2-peer',
      proof,
      true,
    );
    const codes = await identity.issueRecoveryCodes(challenge.challengeId!, proof);
    const completed = await identity.acknowledgeRecoveryCodes(
      challenge.challengeId!,
      codes.setId,
      true,
      proof,
    );
    return identity.authenticate(completed.sessionToken!, audience, randomUUID(), proof);
  };
  const customer = await login(customerId, 'CUSTOMER'),
    staff = await login(staffId, 'STAFF');
  await store.execute(
    {
      principalId: 'synthetic-private-bootstrap',
      audience: 'SYSTEM',
      owner: 'EnterpriseAccess',
      operation: 'fixture-staff-bootstrap',
      target: null,
      idempotencyKey: randomUUID(),
      input: { staffId },
      correlationId: randomUUID(),
      epoch: await store.currentEpoch(),
    },
    async (tx) => {
      const role = {
        staffRoleId: randomUUID(),
        label: '합성 bootstrap',
        actions: [
          'enterprise.approve',
          'enterprise.initial-administrator.designate',
          'staff.role.manage',
        ],
        revision: 1,
      };
      await tx.put('StaffRole', role);
      await tx.put('StaffRoleGrant', {
        staffGrantId: randomUUID(),
        accountRef: staff.actorAccountRef,
        roleRef: ref('StaffRole', role),
        effectiveFrom: now().toISOString(),
        revokedAt: null,
        grantedBy: staff.actorAccountRef,
        revision: 1,
      });
      await tx.put('StaffAuthorityFence', {
        fenceId: U2_STAFF_FENCE_ID,
        authorityRevision: 1,
        revision: 1,
      });
    },
  );
  const access = new EnterpriseAccess(store, new SyntheticEnterpriseVerification(), now, true);
  const application = await access.apply(customer, {
    meta: u2Meta(),
    legalName: '합성 U2 기업',
    designatedContact: 'enterprise@example.invalid',
    registrationEvidenceRefs: [syntheticBasis],
  });
  const approved = await access.approve(staff, {
    meta: u2Meta(1),
    targetRef: application.targetRef!,
    decision: 'APPROVE',
    basisRefs: [syntheticBasis],
  });
  const enterpriseRef = approved.resultRefs.find((source) => source.entity === 'Enterprise')!;
  await access.designate(staff, enterpriseRef, {
    meta: u2Meta(1),
    accountRef: customer.actorAccountRef!,
    basisRefs: [syntheticBasis],
    label: '명시 관리',
    actionScopes: ['organisation.manage', 'user.manage', 'role.manage'].map((action) => ({
      enterpriseRef,
      action,
      kind: 'ENTERPRISE_ALL',
      departmentRefs: [],
      siteRefs: [],
    })),
  });
  let enterprise = (await store.read('Enterprise', enterpriseRef.id))!;
  await access.setOrderingPolicy(customer, ref('Enterprise', enterprise), {
    meta: u2Meta(Number(enterprise.revision)),
    departmentUsage: 'NOT_USED',
    siteUsage: 'NOT_USED',
  });
  enterprise = (await store.read('Enterprise', enterpriseRef.id))!;
  await backfillU2SecurityState(store);
  const fenceId = u2EnterpriseFenceId(enterpriseRef.id);
  await store.execute(
    {
      principalId: 'synthetic-u2-backfill',
      audience: 'SYSTEM',
      owner: 'EnterpriseAccess',
      operation: 'fixture-enterprise-fence',
      target: enterpriseRef,
      idempotencyKey: randomUUID(),
      input: { fenceId },
      correlationId: randomUUID(),
      epoch: await store.currentEpoch(),
    },
    async (tx) =>
      tx.put('EnterpriseAccessFence', {
        fenceId,
        enterpriseRef: ref('Enterprise', enterprise),
        accessRevision: 1,
        revision: 1,
      }),
  );
  const member = (
    await store.list('EnterpriseMembership', {
      equals: { accountRef: { id: customerId }, enterpriseRef: { id: enterpriseRef.id } },
    })
  )[0]!;
  return {
    identity,
    customer,
    staff,
    access,
    enterprise,
    enterpriseRef: ref('Enterprise', enterprise),
    member,
    fenceId,
    now,
  };
}
