import { randomUUID } from 'node:crypto';
import { fingerprint } from '@oms/contracts';
import { StaffAccess, U3StaffAccess, ref, UNREGISTERED_U3_EVIDENCE } from '@oms/core';
import type { U3EvidenceRegistration } from '@oms/core';
import type { ProtectedStore, ModelData } from '@oms/persistence';
import type { ServiceContext, Ref, U3AgreementRegistrationInput } from '@oms/contracts';
import { seedU3CommandAuthority } from './command-authority.js';
import { fixtureMeta } from './commercial.js';
import { catalogInput } from './catalog.js';
import { buildCommonOffer } from '../../../packages/core/src/catalog-conditions.js';
import { agreementRegistrationInput } from './agreement-input.js';

export const syntheticCommercialEvidence: U3EvidenceRegistration = {
  ...UNREGISTERED_U3_EVIDENCE,
  kind: 'LOCAL_SYNTHETIC',
  personPurpose: 'PERSON_IDENTITY',
  agreementPurpose: 'CONTRACT_AGREEMENT',
  sourceKinds: ['SYNTHETIC_A', 'SYNTHETIC_B'],
};
// 정책/모든 출처/확인자는 합성 원본이며 실제 사람 또는 고객 합의 증명이 아니다.
export async function seedAgreementAuthority(
  store: ProtectedStore,
  proofMode: 'LOCAL_SYNTHETIC' | 'MOCK_REGISTERED_OWNER' = 'LOCAL_SYNTHETIC',
) {
  const seller = await seedU3CommandAuthority(store),
    reviewer = await seedU3CommandAuthority(store);
  const meta = () => ({ ...fixtureMeta(), clientRequestId: randomUUID() });
  const role = await new U3StaffAccess(store, seller.now).defineRole(seller.staff, {
    meta: meta(),
    label: '합성 계약 승인/출처 확인',
    actions: ['contract.approve', 'identity.person.verify'],
  });
  for (const actor of [seller.staff, reviewer.staff])
    await new StaffAccess(store, seller.now).grantRole(seller.staff, {
      meta: meta(),
      accountRef: actor.actorAccountRef!,
      roleRef: role.targetRef!,
      decision: 'GRANT',
    });
  const policies: ModelData[] = [],
    evidences: ModelData[] = [],
    links: ModelData[] = [];
  const synthetic = proofMode === 'LOCAL_SYNTHETIC',
    sourceKinds = synthetic ? ['SYNTHETIC_A', 'SYNTHETIC_B'] : ['MOCK_A', 'MOCK_B'];
  const write = async (
    operation: string,
    callback: (tx: import('@oms/persistence').ProtectedTransaction) => Promise<void>,
  ) =>
    store.execute(
      {
        principalId: 'synthetic-commercial-proof',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation,
        target: null,
        idempotencyKey: randomUUID(),
        input: { synthetic: true },
        correlationId: randomUUID(),
        epoch: await store.currentEpoch(),
      },
      callback,
    );
  async function policy(purpose: string) {
    const value = {
      policyId: randomUUID(),
      revision: 1,
      purpose,
      requiredSourceKinds: sourceKinds,
      synthetic,
      active: true,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      retentionSeconds: 600,
    };
    policies.push(value);
    return value;
  }
  async function proof(account: ServiceContext, policy: ModelData, enterpriseRef: Ref | null) {
    const bindings = await store.list('ProviderBinding', {
      equals: { accountRef: { id: account.principalId }, audience: 'STAFF', active: true },
      limit: 2,
    });
    const proofs = sourceKinds.map((sourceKind) => ({
      evidenceId: randomUUID(),
      revision: 1,
      accountRef: account.actorAccountRef,
      bindingRef: ref('ProviderBinding', bindings[0]!),
      policyRef: ref('VerificationPolicy', policy),
      purpose: policy.purpose,
      sourceKind,
      authorityRef: seller.staff.actorAccountRef,
      observedAt: seller.now().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      synthetic,
      state: 'CONFIRMED',
      contactRef: null,
      contactVersion: null,
      enterpriseRef,
      caseRef: null,
      partyContextRef: null,
      challengeId: null,
    }));
    evidences.push(...proofs);
    return proofs;
  }
  const personPolicy = await policy(syntheticCommercialEvidence.personPurpose),
    agreementPolicy = await policy(syntheticCommercialEvidence.agreementPurpose);
  const personChecks: ModelData[] = [];
  const histories: ModelData[] = [];
  const people: ServiceContext[] = [];
  for (const actor of [seller.staff, reviewer.staff]) {
    const proofs = await proof(actor, personPolicy, null),
      historyRef: Ref = {
        owner: 'IdentityRecovery',
        entity: 'IdentityHistory',
        id: randomUUID(),
        revision: 1,
      },
      proofRefs = proofs.map((value) => ref('VerificationEvidence', value)),
      link = {
        personLinkId: randomUUID(),
        accountRefs: [actor.actorAccountRef],
        evidenceRefs: [historyRef],
        verifiedAt: seller.now().toISOString(),
        revision: 1,
      };
    links.push(link);
    const check = {
      personVerificationId: randomUUID(),
      revision: 1,
      personLinkRef: ref('VerifiedPersonLink', link),
      policyRef: ref('VerificationPolicy', personPolicy),
      evidenceRefs: proofRefs,
      verifiedBy: seller.staff.actorAccountRef,
      verifiedAt: seller.now().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      state: 'CONFIRMED',
    };
    personChecks.push(check);
    histories.push({
      historyId: historyRef.id,
      owner: 'IdentityRecovery',
      actorAccountRef: seller.staff.actorAccountRef,
      verifiedPersonRef: null,
      occurredAt: seller.now().toISOString(),
      reason: '합성 사람 근거 등록',
      beforeRef: null,
      afterRef: ref('VerifiedPersonLink', link),
      evidenceRefs: proofRefs,
      requestId: '',
      resultRefs: [ref('VerifiedPersonLink', link), ref('PersonVerification', check)],
      correctionOf: null,
      sourceRevision: 1,
    });
    people.push({ ...actor, verifiedPersonRef: ref('VerifiedPersonLink', link) });
  }
  const agreementProof = await proof(seller.staff, agreementPolicy, seller.enterpriseRef);
  const sourceKey = randomUUID(),
    correlationId = randomUUID(),
    proofInput = { synthetic: true };
  await store.execute(
    {
      principalId: seller.staff.principalId,
      audience: 'STAFF',
      owner: 'IdentityRecovery',
      operation: 'fixture-person-and-agreement-proofs',
      target: { kind: 'NONE' },
      idempotencyKey: sourceKey,
      input: proofInput,
      correlationId,
      epoch: await store.currentEpoch(),
    },
    async (tx, requestId) => {
      for (const value of policies) await tx.put('VerificationPolicy', value);
      for (const value of evidences) await tx.put('VerificationEvidence', value);
      for (const value of links) await tx.put('VerifiedPersonLink', value);
      for (const value of personChecks) await tx.put('PersonVerification', value);
      for (const value of histories) {
        value.requestId = requestId;
        await tx.put('IdentityHistory', value);
      }
      const occurredAt = seller.now().toISOString();
      await tx.put('RequestReceipt', {
        requestId,
        principalId: seller.staff.principalId,
        audience: 'STAFF',
        operation: 'fixture-person-and-agreement-proofs',
        targetIdentity: { kind: 'NONE' },
        requestFingerprint: fingerprint(proofInput),
        idempotencyKey: sourceKey,
        owner: 'IdentityRecovery',
        targetScope: null,
        requestState: 'RESULT_RECORDED',
        resultRefs: [
          ...links.map((value) => ref('VerifiedPersonLink', value)),
          ...personChecks.map((value) => ref('PersonVerification', value)),
          ...histories.map((value) => ref('IdentityHistory', value)),
        ],
        acceptedAt: occurredAt,
        updatedAt: occurredAt,
        revision: 1,
        correlationId,
      });
    },
  );
  const offerRef: Ref = {
      owner: 'ProductCatalog',
      entity: 'CommonOfferRevision',
      id: randomUUID(),
      revision: 1,
    },
    productRef: Ref = { owner: 'ProductCatalog', entity: 'Product', id: randomUUID(), revision: 1 },
    built = buildCommonOffer(store, catalogInput(offerRef), productRef, offerRef, seller.now());
  await store.execute(
    {
      principalId: 'synthetic-commercial-catalog',
      audience: 'SYSTEM',
      owner: 'ProductCatalog',
      operation: 'fixture-agreement-catalog',
      target: null,
      idempotencyKey: randomUUID(),
      input: { synthetic: true },
      correlationId: randomUUID(),
      epoch: await store.currentEpoch(),
      sourceContract: { profile: 'urn:oms:contract:u3-commercial:2', registryVersion: 3 },
    },
    async (tx) => {
      await tx.put('Product', built.product);
      await tx.put('CommonOfferRevision', built.offer!);
    },
  );
  const input = (): U3AgreementRegistrationInput =>
    agreementRegistrationInput(
      seller.enterpriseRef,
      productRef,
      offerRef,
      agreementProof.map((value) => ref('VerificationEvidence', value)),
    );
  return {
    seller,
    reviewer,
    registrant: people[0]!,
    approver: people[1]!,
    policies,
    evidences,
    links,
    personChecks,
    histories,
    agreementProof,
    input,
    productRef,
    offerRef,
    write,
  };
}
