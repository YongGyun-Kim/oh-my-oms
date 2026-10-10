// Reuse the pure synthetic identity seed with the caller's U2 ProtectedStore.
// This helper never selects or resets a database.
export { seedSyntheticAccount } from '../../u1/fixtures/identity.js';
import { randomUUID, randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { PurposeSecretVault, authorizeProtectedVault } from '@oms/persistence';
import {
  EmergencyRecoveries,
  EnrollmentAuthorities,
  RecoveryHandoffs,
  PartyClaimContexts,
  PurposeVerifier,
  IdentityBrowser,
  generatePurposeSecret,
  ref,
} from '@oms/core';
import { seedU2Enterprise, u2Meta } from './enterprise.js';
import type { ModelData, ProtectedStore } from '@oms/persistence';
import {
  U2_MODELS,
  modelDefinition,
  primaryAttribute,
  currentSecurityMatches,
} from '@oms/persistence';
import type { Ref } from '@oms/contracts';
import { SchemaValidator, requireCondition } from '@oms/contracts';
import { seedSyntheticAccount } from '../../u1/fixtures/identity.js';
export async function seedClaimedRecovery(
  store: ProtectedStore,
  vaultSource: DataSource,
  manualNow?: () => Date,
  beforeClaim?: () => void,
) {
  const f = await seedVerifiedRecoveryParty(store, vaultSource, 'LOCAL_SYNTHETIC', manualNow);
  await f.handoffs.verifyParty(f.staff, f.verifyInput);
  const source = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
    issued = await f.handoffs.issue(f.staff, {
      meta: u2Meta(2),
      caseRef: ref('RecoveryCase', source),
      verificationRef: source.verificationRef as Ref,
      partyContextRef: source.partyContextRef as Ref,
      deliveryRouteRef: ref('RegisteredContact', f.contact),
    }),
    grant = (await store.currentProtected('RecoveryHandoffGrant', issued.targetRef!.id))!,
    binding = (
      await vaultSource.query('SELECT binding FROM u2_vault.material WHERE id=$1', [grant.vaultRef])
    )[0].binding as import('@oms/persistence').VaultBinding,
    code = (
      await f.vault.read(binding, {
        authorityRef: issued.targetRef!,
        targetRef: issued.targetRef!,
        purpose: 'HANDOFF',
        operation: 'identity.handoff.deliver',
        epoch: String(grant.epoch),
        deadlineAt: new Date(f.now().getTime() + 10000).toISOString(),
      })
    ).toString(),
    claimed = await (async () => {
      beforeClaim?.();
      return IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
        f.handoffs.claim(
          {
            attemptId: f.created.challengeId,
            audience: 'CUSTOMER',
            correlationId: randomUUID(),
            deadlineAt: new Date(f.now().getTime() + 10000).toISOString(),
          },
          {
            meta: u2Meta(1),
            grantRef: issued.targetRef!,
            caseRef: ref('RecoveryCase', source),
            challengeId: f.created.challengeId,
            code,
            partySecret: f.created.partySecret,
          },
        ),
      );
    })(),
    authority = (await store.list('EnrollmentAuthority'))[0]!,
    authorities = new EnrollmentAuthorities(
      store,
      f.verifier,
      f.now,
      async (proof) => proof === 'synthetic-private-ingress',
    ),
    purpose = await authorities.authenticate(
      ref('EnrollmentAuthority', authority),
      claimed.handle,
      'MFA_REENROLMENT',
      randomUUID(),
    );
  return {
    ...f,
    authority,
    authorities,
    purpose,
    claimed,
    current: (await store.currentProtected('RecoveryCase', f.source.caseId))!,
  };
}

export async function seedVerifiedRecoveryParty(
  store: ProtectedStore,
  vaultSource: DataSource,
  registration: 'LOCAL_SYNTHETIC' | 'UNREGISTERED' = 'LOCAL_SYNTHETIC',
  manualNow?: () => Date,
  withOperator = false,
  secrets?: { verifier: Buffer; vault: Buffer },
) {
  const g = await seedU2Enterprise(store),
    clockNow = manualNow ?? g.now,
    verifier = new PurposeVerifier(secrets?.verifier ?? randomBytes(32), 'fixture-key');
  const vault = new PurposeSecretVault(
      vaultSource,
      secrets?.vault ?? randomBytes(32),
      'vault-key',
      async (b, p, a) => {
        await authorizeProtectedVault(store, b, p, a);
        if (
          b.purpose === 'HANDOFF' &&
          a !== 'DESTROY' &&
          p.operation !== 'identity.handoff.prepare'
        )
          await handoffs.assertDelivery(b.targetRef);
      },
      () => clockNow().getTime(),
    ),
    parties = new PartyClaimContexts(
      store,
      verifier,
      clockNow,
      async (proof) => proof === 'synthetic-private-ingress',
    );
  const operators = withOperator
    ? new EmergencyRecoveries(
        store,
        verifier,
        clockNow,
        registration,
        async (proof) => proof === 'separate-operator-ingress',
      )
    : undefined;
  const handoffs = new RecoveryHandoffs(
    store,
    verifier,
    vault,
    clockNow,
    registration,
    parties,
    async (proof) => proof === 'synthetic-private-ingress',
    operators,
  );
  const staffRole = (await store.list('StaffRole'))[0]!;
  await g.access.reviseStaffRole(g.staff, {
    meta: u2Meta(1),
    roleRef: ref('StaffRole', staffRole),
    label: '합성 복구 확인',
    actions: [...(staffRole.actions as string[]), 'identity.recovery.verify'],
  });
  const binding = (
      await store.list('ProviderBinding', {
        equals: { accountRef: { id: g.customer.principalId }, audience: 'CUSTOMER', active: true },
      })
    )[0]!,
    source = {
      caseId: randomUUID(),
      revision: 1,
      accountRef: g.customer.actorAccountRef,
      bindingRef: ref('ProviderBinding', binding),
      bindingGeneration: binding.generation,
      securityGeneration: 1,
      parentRef: null,
      previousBindingRef: null,
      previousSecurityGeneration: null,
      originalBindingRefs: [],
      originalFactorRefs: [],
      originalCodeSetRefs: [],
      originalSessionRefs: [],
      method: 'MANUAL',
      reason: '합성 확인 접수',
      createdAt: clockNow().toISOString(),
      deadlineAt: new Date(Date.now() + 300000).toISOString(),
      holdReason: 'AWAITING_VERIFICATION',
      verificationRef: null,
      partyContextRef: null,
      enrollmentAuthorityRef: null,
      originalOperationRefs: [],
      noticeRef: null,
      epoch: await store.currentEpoch(),
      state: 'REQUESTED',
    },
    contact = {
      contactId: randomUUID(),
      revision: 1,
      accountRef: g.customer.actorAccountRef,
      address: 'party@example.invalid',
      state: 'VERIFIED',
      contactVersion: 1,
      verifiedAt: clockNow().toISOString(),
    },
    policy = {
      policyId: randomUUID(),
      revision: 1,
      purpose: 'RECOVERY',
      requiredSourceKinds: ['SYNTHETIC'],
      synthetic: true,
      active: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      retentionSeconds: 300,
    };
  const execute = async (operation: string, callback: Parameters<ProtectedStore['execute']>[1]) =>
    store.execute(
      {
        principalId: 'synthetic-recovery-source-owner',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation,
        target: null,
        idempotencyKey: randomUUID(),
        input: { caseId: source.caseId },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      callback,
    );
  await execute('fixture-original-case', async (tx) => {
    await tx.put('RecoveryCase', source);
    await tx.put('RegisteredContact', contact);
    await tx.put('VerificationPolicy', policy);
  });
  const oldBrowser = generatePurposeSecret('PARTY_BROWSER'),
    browser = generatePurposeSecret('PARTY_BROWSER'),
    challengeId = randomUUID(),
    pre = {
      attemptId: challengeId,
      audience: 'CUSTOMER' as const,
      correlationId: randomUUID(),
      deadlineAt: new Date(Date.now() + 10000).toISOString(),
    },
    created = (await IdentityBrowser.run({ current: oldBrowser, next: browser }, () =>
      parties.create(pre, { caseRef: ref('RecoveryCase', source), challengeId }),
    )) as { partyContextRef: Ref; partySecret: string; challengeId: string; expiresAt: string };
  const evidence = {
    evidenceId: randomUUID(),
    revision: 1,
    accountRef: g.customer.actorAccountRef,
    bindingRef: ref('ProviderBinding', binding),
    policyRef: ref('VerificationPolicy', policy),
    purpose: 'RECOVERY',
    sourceKind: 'SYNTHETIC',
    authorityRef: g.staff.actorAccountRef,
    observedAt: clockNow().toISOString(),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    synthetic: true,
    state: 'CONFIRMED',
    contactRef: ref('RegisteredContact', contact),
    contactVersion: 1,
    enterpriseRef: null,
    caseRef: ref('RecoveryCase', source),
    partyContextRef: created.partyContextRef,
    challengeId,
  };
  await execute('fixture-party-observation', async (tx) =>
    tx.put('VerificationEvidence', evidence),
  );
  return {
    ...g,
    now: clockNow,
    verifier,
    parties,
    handoffs,
    operators,
    vault,
    source,
    contact,
    policy,
    evidence,
    created,
    browser,
    oldBrowser,
    execute,
    verifyInput: {
      meta: u2Meta(1),
      caseRef: ref('RecoveryCase', source),
      partyContextRef: created.partyContextRef,
      policyRef: ref('VerificationPolicy', policy),
      evidenceRefs: [ref('VerificationEvidence', evidence)],
      decision: 'CONFIRM' as const,
    },
  };
}

// A complete synthetic graph for persistence/reconstruction boundaries. It
// establishes no actual person policy, provider capability or business MFA.
export async function seedU2RecoveryGraph(store: ProtectedStore, grantState = 'ISSUED') {
  const identity = await seedSyntheticAccount(store, randomUUID(), 'CUSTOMER');
  const names = [
    'AccountSecurityState',
    'VerificationPolicy',
    'RegisteredContact',
    'RecoveryCase',
    'RecoveryVerification',
    'PartyClaimContext',
    'RecoveryHandoffGrant',
    'EnrollmentAuthority',
    'IdentityExecutionSlot',
    'IdentityOperationResult',
    'SecurityTombstone',
  ];
  const ids = Object.fromEntries(names.map((name) => [name, randomUUID()]));
  const references: Record<string, Ref> = {
    Account: {
      owner: 'IdentityRecovery',
      entity: 'Account',
      id: identity.account.accountId,
      revision: 1,
    },
    ProviderBinding: {
      owner: 'IdentityRecovery',
      entity: 'ProviderBinding',
      id: identity.binding.bindingId,
      revision: 1,
    },
  };
  for (const name of names)
    references[name] = { owner: 'IdentityRecovery', entity: name, id: ids[name]!, revision: 1 };
  const issued = Date.now(),
    now = new Date(issued).toISOString(),
    expires = new Date(issued + 300000).toISOString();
  const rows: Record<string, ModelData> = {};
  for (const name of names) {
    const model = U2_MODELS.find((model) => model.name === name)!;
    const row: ModelData = {};
    for (const attribute of model.attributes) {
      if (attribute.unique && attribute.type === 'Identifier') row[attribute.name] = ids[name];
      else if (attribute.nullable) row[attribute.name] = null;
      else if (attribute.type === 'Ref')
        row[attribute.name] = references[attribute.references ?? 'Account'];
      else if (attribute.type.endsWith('List') || attribute.type === 'EvidenceRefs')
        row[attribute.name] = [];
      else if (['Revision', 'PositiveInteger'].includes(attribute.type)) row[attribute.name] = 1;
      else if (attribute.type === 'NonNegativeInteger') row[attribute.name] = 0;
      else if (attribute.type === 'Boolean') row[attribute.name] = true;
      else if (attribute.type === 'Enum') row[attribute.name] = attribute.allowed_values![0];
      else if (attribute.type === 'Instant')
        row[attribute.name] =
          attribute.name.includes('expires') || attribute.name.includes('deadline') ? expires : now;
      else row[attribute.name] = 'synthetic-fixture';
    }
    row.revision = 1;
    if ('epoch' in row) row.epoch = await store.currentEpoch();
    rows[name] = row;
  }
  Object.assign(rows.RecoveryCase!, {
    method: 'MANUAL',
    state: 'HOLD',
    holdReason: 'SYNTHETIC_ONLY',
  });
  Object.assign(rows.VerificationPolicy!, {
    purpose: 'RECOVERY',
    requiredSourceKinds: ['SYNTHETIC'],
    retentionSeconds: 300,
  });
  Object.assign(rows.RegisteredContact!, { address: 'fixture@example.invalid', state: 'VERIFIED' });
  Object.assign(rows.PartyClaimContext!, {
    audience: 'CUSTOMER',
    state: 'VERIFIED',
    secretVerifier: 'a'.repeat(64),
    browserVerifier: 'a'.repeat(64),
    keyVersion: 'synthetic-key-1',
  });
  Object.assign(rows.RecoveryHandoffGrant!, {
    audience: 'CUSTOMER',
    purpose: 'MFA_REENROLMENT',
    codeVerifier: 'b'.repeat(64),
    keyVersion: 'synthetic-key-1',
    state: grantState,
    attemptCount: grantState === 'EXHAUSTED' ? 5 : 0,
  });
  Object.assign(rows.EnrollmentAuthority!, {
    audience: 'CUSTOMER',
    purpose: 'MFA_REENROLMENT',
    handleVerifier: 'c'.repeat(64),
    keyVersion: 'synthetic-key-1',
    state: 'REVOKED',
  });
  Object.assign(rows.IdentityExecutionSlot!, {
    state: 'UNKNOWN',
    originalOperationRef: references.IdentityOperationResult,
  });
  Object.assign(rows.IdentityOperationResult!, {
    knowledge: 'UNKNOWN',
    effect: 'UNCONFIRMED',
    terminal: false,
    inputDigest: 'd'.repeat(64),
  });
  Object.assign(rows.SecurityTombstone!, {
    targetRef: references.EnrollmentAuthority,
    purpose: 'ENROLLMENT_HANDLE',
  });
  await store.execute(
    {
      principalId: 'synthetic-u2-fixture',
      audience: 'SYSTEM',
      owner: 'IdentityRecovery',
      operation: 'seed-U2-graph',
      target: null,
      idempotencyKey: randomUUID(),
      input: { ids },
      correlationId: randomUUID(),
      epoch: await store.currentEpoch(),
    },
    async (tx) => {
      for (const name of names) await tx.put(name, rows[name]!);
    },
  );
  return { identity, rows, references };
}
// Read-side unit double with separate protected/raw after-images. It executes
// the real currentSecurityMatches rule; it is never a DB/activation proof.
export class SyntheticModelStore {
  readonly schema = new SchemaValidator();
  readonly protectedRows = new Map<string, Map<string, ModelData>>();
  readonly rawRows = new Map<string, Map<string, ModelData>>();
  private key(model: string, data: ModelData) {
    return String(data[primaryAttribute(modelDefinition(model)).name]);
  }
  fixture(model: string, data: ModelData, protectedImage = true) {
    for (const rows of protectedImage ? [this.protectedRows, this.rawRows] : [this.rawRows]) {
      const group = rows.get(model) ?? new Map();
      group.set(this.key(model, data), structuredClone(data));
      rows.set(model, group);
    }
  }
  private contains(value: unknown, expected: unknown): boolean {
    if (Array.isArray(expected))
      return (
        Array.isArray(value) &&
        expected.every((item) => value.some((candidate) => this.contains(candidate, item)))
      );
    if (expected && typeof expected === 'object')
      return (
        !!value &&
        typeof value === 'object' &&
        Object.entries(expected).every(([key, item]) =>
          this.contains((value as Record<string, unknown>)[key], item),
        )
      );
    return value === expected;
  }
  async currentEpoch() {
    return 'initial';
  }
  async currentProtected(model: string, id: string) {
    const p = this.protectedRows.get(model)?.get(id) ?? null,
      r = this.rawRows.get(model)?.get(id) ?? null;
    requireCondition(
      currentSecurityMatches(model, p, r),
      503,
      'CURRENT_AUTH_NOT_PROTECTED',
      '미보호 current fixture',
    );
    return p;
  }
  async readRevision(model: string, id: string, revision: number) {
    const row = this.protectedRows.get(model)?.get(id);
    return row?.revision === revision ? row : null;
  }
  async list(model: string, query: { equals?: Record<string, unknown>; limit?: number } = {}) {
    return [...(this.protectedRows.get(model)?.values() ?? [])]
      .filter((row) => this.contains(row, query.equals ?? {}))
      .slice(0, query.limit ?? 25);
  }
  async *scan(model: string, equals: Record<string, unknown>) {
    for (const row of await this.list(model, { equals, limit: 2000 })) yield row;
  }
  readonly primary = {
    query: async (sql: string, values: unknown[]) => {
      const model = sql.includes('u1_role_revision_state')
        ? 'RoleRevisionState'
        : sql.includes('u1_person_verification')
          ? 'PersonVerification'
          : 'VerifiedPersonLink';
      const field =
        model === 'RoleRevisionState'
          ? sql.includes('staffRoleRef')
            ? 'staffRoleRef'
            : 'roleRef'
          : model === 'PersonVerification'
            ? 'personLinkRef'
            : 'accountRefs';
      const expected = field === 'accountRefs' ? JSON.parse(String(values[0])) : { id: values[0] };
      return [...(this.rawRows.get(model)?.values() ?? [])]
        .filter((row) => this.contains(row[field], expected))
        .slice(0, 2)
        .map((row) => ({ id: this.key(model, row) }));
    },
  };
  asStore() {
    return this as unknown as ProtectedStore;
  }
}
