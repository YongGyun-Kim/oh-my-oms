import { randomUUID } from 'node:crypto';
import { ref, U3StaffAccess, StaffAccess } from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import { seedU2Enterprise } from '../../u2/fixtures/enterprise.js';

// Persisted synthetic MFA/authority sources exercise real U2 guards. They are
// not evidence of an actual customer's identity, ingress, or business agreement.
export async function seedU3CommandAuthority(store: ProtectedStore) {
  const fixture = await seedU2Enterprise(store);
  const meta = () => ({
    clientRequestId: randomUUID(),
    expectedRevision: null,
    reason: '합성 역할 저장 검증',
    evidenceRefs: [],
  });
  const registered = await new U3StaffAccess(store, fixture.now).defineRole(fixture.staff, {
    meta: meta(),
    label: 'U3 저장 경계 합성 역할',
    actions: ['product.register', 'product.revise', 'order.decide', 'contract.register'],
  });
  await new StaffAccess(store, fixture.now).grantRole(fixture.staff, {
    meta: meta(),
    accountRef: fixture.staff.actorAccountRef!,
    roleRef: registered.targetRef!,
    decision: 'GRANT',
  });
  const staffRole = (await store.read('StaffRole', registered.targetRef!.id))!;
  const staffGrant = (
    await store.list('StaffRoleGrant', {
      equals: {
        accountRef: { id: fixture.staff.principalId },
        roleRef: { id: registered.targetRef!.id },
        revokedAt: null,
      },
      limit: 2,
    })
  )[0]!;
  await store.execute(
    {
      principalId: 'synthetic-u3-authority',
      audience: 'SYSTEM',
      owner: 'EnterpriseAccess',
      operation: 'fixture-u3-authority',
      target: null,
      idempotencyKey: randomUUID(),
      input: { synthetic: true },
      correlationId: randomUUID(),
      epoch: await store.currentEpoch(),
    },
    async (tx) => {
      const scopeRefs = [];
      for (const action of ['order.submit', 'order.read', 'contract.change.request']) {
        const scope = {
          actionScopeId: randomUUID(),
          enterpriseRef: fixture.enterpriseRef,
          action,
          kind: 'ENTERPRISE_ALL',
          departmentRefs: [],
          siteRefs: [],
          revision: 1,
        };
        await tx.put('ActionScope', scope);
        scopeRefs.push(ref('ActionScope', scope));
      }
      const role = {
        roleId: randomUUID(),
        enterpriseRef: fixture.enterpriseRef,
        label: 'U3 합성 거래',
        actionScopeRefs: scopeRefs,
        revision: 1,
      };
      await tx.put('CustomerRole', role);
      await tx.put('CustomerRoleGrant', {
        grantId: randomUUID(),
        membershipRef: ref('EnterpriseMembership', fixture.member),
        roleRef: ref('CustomerRole', role),
        effectiveFrom: fixture.now().toISOString(),
        revokedAt: null,
        grantedBy: fixture.customer.actorAccountRef,
        revision: 1,
      });
    },
  );
  return { ...fixture, staffRole, staffGrant };
}
