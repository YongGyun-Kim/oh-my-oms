import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { ProtectedStore, backfillU2SecurityState } from '@oms/persistence';
import type { VaultBinding } from '@oms/persistence';
import type { Receipt, Ref, TargetScope } from '@oms/contracts';
import {
  ref,
  generatePurposeSecret,
  PrivateU2Delivery,
  EnterpriseInvitations,
  EnrollmentAuthorities,
  IdentityConsumer,
  U2Worker,
  EnterpriseOrganisation,
  StaffAccess,
  ProductCatalog,
  invitationBinding,
} from '@oms/core';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedVerifiedRecoveryParty, seedSyntheticAccount } from '../fixtures/identity.js';
import { u2Meta } from '../fixtures/enterprise.js';
import { u2HttpHost } from '../fixtures/http.js';
import { SyntheticHttpClient } from '../../u1/fixtures/http-client.js';
import { SyntheticQueue } from '../fixtures/queue.js';
import { StatefulRecoveryProvider } from '../fixtures/provider.js';
import {
  profileInvitationProbe,
  collectU2ProfileRecovery,
  collectU2ProfileStarts,
  profileRecoveryInput,
  profileReceiptResultMatches,
  profileCurrentScope,
  profileCurrentInvitation,
  profileValidateU2Receipt,
} from '../../../scripts/u2/performance.js';
import { writeFileSync } from 'node:fs';
describe('주 책임 수락 경계의 현재 HTTP 연결·전체 UI/실활성은 후속 검증', () => {
  const sources = u2Sources(),
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  let host: Awaited<ReturnType<typeof u2HttpHost>> | undefined;
  beforeAll(async () => {
    await initializeU2Databases();
    for (const s of Object.values(sources)) await s.initialize();
  });
  beforeEach(async () => resetU2Databases(sources.primaryAdmin, sources.journalAdmin));
  afterEach(async () => {
    await host?.app.close();
    host = undefined;
  });
  afterAll(async () => {
    for (const s of Object.values(sources)) if (s.isInitialized) await s.destroy();
  });
  async function setup() {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    host = await u2HttpHost(store, f);
    await host.client.authenticate(f.customer.principalId);
    const guestId = randomUUID(),
      guest = await seedSyntheticAccount(store, guestId, 'CUSTOMER'),
      recipient = new SyntheticHttpClient('http://127.0.0.1:34782');
    await recipient.authenticate(guestId);
    await backfillU2SecurityState(store);
    const contact = {
        contactId: randomUUID(),
        revision: 1,
        accountRef: null,
        address: 'recipient@example.invalid',
        state: 'VERIFIED',
        contactVersion: 1,
        verifiedAt: f.now().toISOString(),
      },
      policy = {
        policyId: randomUUID(),
        revision: 1,
        purpose: 'INVITATION_ACCEPTANCE',
        requiredSourceKinds: ['SYNTHETIC'],
        synthetic: true,
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        retentionSeconds: 300,
      },
      evidence = {
        evidenceId: randomUUID(),
        revision: 1,
        accountRef: ref('Account', guest.account),
        bindingRef: ref('ProviderBinding', guest.binding),
        policyRef: ref('VerificationPolicy', policy),
        purpose: 'INVITATION_ACCEPTANCE',
        sourceKind: 'SYNTHETIC',
        authorityRef: f.staff.actorAccountRef,
        observedAt: f.now().toISOString(),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        synthetic: true,
        state: 'CONFIRMED',
        contactRef: ref('RegisteredContact', contact),
        contactVersion: 1,
        enterpriseRef: null,
        caseRef: null,
        partyContextRef: null,
        challengeId: null,
      };
    await f.execute('fixture-http-invitation-contact', async (tx) => {
      await tx.put('RegisteredContact', contact);
      await tx.put('VerificationPolicy', policy);
      await tx.put('VerificationEvidence', evidence);
    });
    const input = {
        meta: u2Meta(),
        enterpriseRef: f.enterpriseRef,
        contactRef: ref('RegisteredContact', contact),
        contactVersion: 1,
        departmentRef: null,
        siteRef: null,
        roleRefs: [],
        expectedMembershipRevision: null,
        reactivate: false,
      },
      issued = await host.client.request<Receipt>(
        `/enterprises/${f.enterpriseRef.id}/membership-invitations`,
        input,
        {
          'Idempotency-Key': input.meta.clientRequestId,
          'X-Target-Revision': String(f.enterpriseRef.revision),
        },
      );
    expect(issued.response.status).toBe(202);
    expect(profileValidateU2Receipt(store.schema, issued.body) === issued.body).toBe(true);
    const source = (await store.currentProtected(
        'MembershipInvitation',
        issued.body.targetRef!.id,
      ))!,
      binding = (
        await sources.vault.query('SELECT binding FROM u2_vault.material WHERE id=$1', [
          source.vaultRef,
        ])
      )[0].binding as VaultBinding,
      bytes = await f.vault.read(binding, {
        authorityRef: issued.body.targetRef!,
        targetRef: issued.body.targetRef!,
        purpose: 'INVITATION_TOKEN',
        operation: 'enterprise.invitation.deliver',
        epoch: String(source.epoch),
        deadlineAt: new Date(Date.now() + 10000).toISOString(),
      }),
      response = bytes.toString();
    bytes.fill(0);
    return { f, ...host, guest, recipient, evidence, issued, input, source, response };
  }
  it('실제 역할 개정202의 U2 Ref는 부하 validator와 원래 보호 receipt/key/fingerprint를 함께 통과한다', async () => {
    const h = await setup(),
      role = (await store.list('CustomerRole'))[0]!,
      enterprise = (await store.currentProtected('Enterprise', h.f.enterpriseRef.id))!,
      enterpriseRef = ref('Enterprise', enterprise),
      roleRef = ref('CustomerRole', role),
      input = {
        meta: u2Meta(roleRef.revision),
        roleRef,
        label: '실제 부하 validator 역할 개정 회귀',
        predicates: ['product.read', 'order.submit', 'order.read'].map((action) => ({
          enterpriseRef,
          action,
          kind: 'ENTERPRISE_ALL',
          departmentSelector: { kind: 'ALL' },
          siteSelector: { kind: 'ALL' },
          sourcePolicyRevision: enterpriseRef.revision,
        })),
      },
      result = await h.client.request<Receipt>(`/customer-roles/${roleRef.id}/revisions`, input, {
        'Idempotency-Key': input.meta.clientRequestId,
        'X-Target-Revision': String(roleRef.revision),
      });
    expect(result.response.status).toBe(202);
    expect(profileValidateU2Receipt(store.schema, result.body) === result.body).toBe(true);
    const original = (await store.currentProtected('RequestReceipt', result.body.requestId))!;
    expect(profileReceiptResultMatches('reviseCustomerRole', result.body, original, input)).toBe(
      true,
    );
    expect(result.body.resultRefs.some((value) => value.entity === 'RoleRevisionState')).toBe(true);
    expect((await store.currentProtected('CustomerRole', roleRef.id))?.revision).toBe(
      roleRef.revision + 1,
    );
  });
  it('초대는 보호202·아직 소속 없음이며 본인 목적 교환→명시 수락 후에만 소속이 ACTIVE다', async () => {
    const h = await setup();
    const issueReceipt = (await store.currentProtected('RequestReceipt', h.issued.body.requestId))!;
    expect(h.issued.body.requestState).toBe('ACCEPTED');
    expect(issueReceipt.operation).toBe('issueMembershipInvitation');
    expect(issueReceipt.requestState).toBe('ACCEPTED');
    expect(issueReceipt.idempotencyKey).toBe(h.input.meta.clientRequestId);
    expect(
      profileReceiptResultMatches('inviteMembership', h.issued.body, issueReceipt, h.input),
    ).toBe(true);
    for (const changed of [
      { ...h.issued.body, requestState: 'RESULT_RECORDED' },
      { ...h.issued.body, requestId: randomUUID() },
      { ...h.issued.body, targetRef: { ...h.issued.body.targetRef!, id: randomUUID() } },
    ])
      expect(
        profileReceiptResultMatches('inviteMembership', changed as Receipt, issueReceipt, h.input),
      ).toBe(false);
    expect(
      profileReceiptResultMatches('unknownOperation', h.issued.body, issueReceipt, h.input),
    ).toBe(false);
    expect(
      profileReceiptResultMatches(
        'inviteMembership',
        h.issued.body,
        {
          ...issueReceipt,
          operation: 'acceptMembershipInvitation',
        },
        h.input,
      ),
    ).toBe(false);
    expect(
      profileReceiptResultMatches(
        'inviteMembership',
        h.issued.body,
        {
          ...issueReceipt,
          requestFingerprint: 'invalid',
        },
        h.input,
      ),
    ).toBe(false);
    const work = (
      await store.list('WorkItem', { equals: { requestId: h.issued.body.requestId }, limit: 2 })
    )[0]!;
    const originalWork = await store.currentProtected('WorkItem', String(work.workId));
    const fact = await store.currentProtected(
      'FactEnvelope',
      (originalWork!.sourceFactRef as Ref).id,
    );
    const outbox = (
      await store.list('OutboxDelivery', { equals: { workRef: { id: work.workId } }, limit: 2 })
    )[0]!;
    expect(originalWork?.state).toBe('PENDING'); // This fixture has not started a worker.
    expect(originalWork?.operationId).toBe('EnterpriseAccess.deliverInvitation');
    expect(fact?.causationRequestId).toBe(h.issued.body.requestId);
    expect(JSON.stringify(fact?.aggregateRef) === JSON.stringify(h.issued.body.targetRef)).toBe(
      true,
    );
    expect(outbox.consumer).toBe('u2-invitation-delivery');
    expect(outbox.epoch).toBe(originalWork?.epoch);
    expect(outbox.deadlineAt).toBe(originalWork?.deadlineAt);
    expect(
      Date.parse(String(originalWork?.deadlineAt)) - Date.parse(String(originalWork?.notBefore)),
    ).toBe(300000);
    expect(
      await store.list('EnterpriseMembership', {
        equals: { accountRef: { id: h.guest.account.accountId } },
      }),
    ).toHaveLength(0);
    const purpose = await h.recipient.request<{
      authorityRef: Ref;
      phase: string;
      handle?: string;
    }>(
      `/membership-invitations/${h.source.invitationId}/purpose-authorities`,
      {
        invitationRef: h.issued.body.targetRef,
        response: h.response,
        contactVerificationRef: ref('VerificationEvidence', h.evidence),
      },
      { 'X-Target-Revision': '1' },
    );
    expect(purpose.response.status).toBe(202);
    expect(purpose.body.phase).toBe('ENROLMENT_ONLY');
    expect(purpose.body.handle).toBeUndefined();
    await h.recipient.refreshCsrf();
    expect(
      (await h.recipient.request(`/membership-invitations/${h.source.invitationId}`)).response
        .status,
    ).toBe(200);
    const input = {
        meta: u2Meta(1),
        invitationRef: h.issued.body.targetRef!,
        response: h.response,
        contactVerificationRef: ref('VerificationEvidence', h.evidence),
      },
      accepted = await h.recipient.request<Receipt>(
        `/membership-invitations/${h.source.invitationId}/acceptances`,
        input,
        { 'Idempotency-Key': input.meta.clientRequestId, 'X-Target-Revision': '1' },
      );
    expect(accepted.response.status).toBe(202);
    expect(
      (
        await store.list('EnterpriseMembership', {
          equals: { accountRef: { id: h.guest.account.accountId } },
        })
      )[0]!.active,
    ).toBe(true);
    expect(
      (
        await h.recipient.request<{ state: string }>(
          `/membership-invitations/${h.source.invitationId}`,
        )
      ).body.state,
    ).toBe('ACCEPTED');
  });
  it('구성원 개정 뒤 부하 scope는 현재 보호 기업 Ref를 읽고 stale 초대는 그대로 거절된다', async () => {
    const h = await setup();
    const membership = await new EnterpriseOrganisation(h.f.access, h.f.now).membership(
      h.f.customer,
      h.f.enterpriseRef,
      {
        meta: u2Meta(),
        accountRef: ref('Account', h.guest.account),
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      },
    );
    const enterprise = (await store.currentProtected('Enterprise', h.f.enterpriseRef.id))!;
    const enterpriseRef = ref('Enterprise', enterprise);
    const prepared = {
      enterpriseRef,
      contextPolicyRef: enterpriseRef,
      organisationRevision: enterpriseRef.revision,
      departmentRef: null,
      siteRef: null,
    };
    const staff = new StaffAccess(store, h.f.now);
    const staffRole = await staff.defineRole(h.f.staff, {
      meta: u2Meta(),
      label: '합성 주문 회귀 상품 등록',
      actions: ['product.register'],
    });
    await staff.grantRole(h.f.staff, {
      meta: u2Meta(),
      accountRef: h.f.staff.actorAccountRef!,
      roleRef: staffRole.targetRef!,
      decision: 'GRANT',
    });
    const product = await new ProductCatalog(store, h.f.now).register(h.f.staff, {
      meta: u2Meta(),
      productType: 'HARDWARE',
      softwareTermKind: null,
      label: '합성 현재 상품',
      salesDescription: '외부 owner 미등록',
      commonPrice: { currency: 'KRW', value: '100' },
      salesConditionRefs: [],
    });
    const role = await h.f.access.defineCustomerRole(h.f.customer, enterpriseRef, {
      meta: u2Meta(),
      label: '명시 별도 주문',
      actionScopes: [
        {
          enterpriseRef,
          action: 'order.submit',
          kind: 'ENTERPRISE_ALL',
          departmentRefs: [],
          siteRefs: [],
        },
      ],
    });
    await h.f.access.grantCustomerRole(h.f.customer, enterpriseRef, {
      meta: u2Meta(),
      accountRef: h.f.customer.actorAccountRef!,
      roleRef: role.targetRef!,
      decision: 'GRANT',
    });
    const order = async (targetScope: TargetScope) => {
      const input = {
        meta: u2Meta(),
        targetScope,
        productType: 'HARDWARE',
        lines: Array.from({ length: 5 }, () => ({
          productRef: product.targetRef!,
          commonOfferRevisionRef: product.resultRefs.find(
            (r) => r.entity === 'CommonOfferRevision',
          )!,
          agreementRevisionRef: null,
          quantity: 1,
          paymentMode: 'PREPAY',
          requestedActivationDate: null,
        })),
        provisionChoice: 'FULL',
        partialConsentRef: null,
      };
      return h.client.request<Receipt & { type?: string }>('/orders', input, {
        'Idempotency-Key': input.meta.clientRequestId,
      });
    };
    expect((await order(prepared)).response.status).toBe(202);
    const issue = async (target: Ref) => {
      const input = { ...h.input, meta: u2Meta(), enterpriseRef: target };
      return h.client.request<Receipt & { type?: string }>(
        `/enterprises/${target.id}/membership-invitations`,
        input,
        {
          'Idempotency-Key': input.meta.clientRequestId,
          'X-Target-Revision': String(target.revision),
        },
      );
    };
    expect((await issue(enterpriseRef)).response.status).toBe(202);
    const member = membership.targetRef!;
    const input = {
      meta: u2Meta(member.revision),
      membershipRef: member,
      departmentRef: null,
      siteRef: null,
      active: true,
      administrator: false,
    };
    const updated = await h.client.request<Receipt>(`/memberships/${member.id}/revisions`, input, {
      'Idempotency-Key': input.meta.clientRequestId,
      'X-Target-Revision': String(member.revision),
    });
    expect(updated.response.status).toBe(202);
    const stale = await issue(enterpriseRef);
    expect(stale.response.status).toBe(404);
    expect(stale.body.type).toBe('urn:oms:problem:not_found');
    const staleOrder = await order(prepared);
    expect(staleOrder.response.status).toBe(409);
    expect(staleOrder.body.type).toBe('urn:oms:problem:organisation_revision');
    const current = await profileCurrentScope(store, prepared);
    const retried = await issue(current.enterpriseRef);
    console.log(
      JSON.stringify({
        diagnostic: 'membership-scope',
        beforeRevision: enterpriseRef.revision,
        currentRevision: current.enterpriseRef.revision,
        staleStatus: stale.response.status,
        staleCode: 'NOT_FOUND',
        freshStatus: retried.response.status,
        pathBodyHeaderMatch: true,
        usageEnabled: enterprise.usageEnabled === true,
      }),
    );
    expect(retried.response.status).toBe(202);
    expect(retried.body.requestState).toBe('ACCEPTED');
    const submitted = await order(current);
    expect(submitted.response.status).toBe(202);
    expect(submitted.body.requestState).toBe('REVIEW_REQUIRED');
    const orderReceipt = (await store.currentProtected(
      'RequestReceipt',
      submitted.body.requestId,
    ))!;
    expect(orderReceipt.owner).toBe('OrderAcceptance');
    expect(orderReceipt.operation).toBe('submitOrder');
    expect(orderReceipt.requestState).toBe('REVIEW_REQUIRED');
    console.log(
      JSON.stringify({
        diagnostic: 'order-scope',
        staleStatus: staleOrder.response.status,
        staleCode: 'ORGANISATION_REVISION',
        currentStatus: submitted.response.status,
        currentState: submitted.body.requestState,
        externalCompletion: false,
      }),
    );
    expect(current.organisationRevision).toBe(current.enterpriseRef.revision);
    expect(current.contextPolicyRef).toEqual(current.enterpriseRef);
    expect(prepared.enterpriseRef.revision).toBe(enterpriseRef.revision);
    h.response = '';
  });
  it('부하 owner의 실제 복구 payload가 공개PRE의200보호접수로 연결되고 업무 권위를 만들지 않는다', async () => {
    const h = await setup(),
      guest = new SyntheticHttpClient('http://127.0.0.1:34782');
    await guest.refreshCsrf();
    const before = (await store.list('RecoveryCase', { limit: 100 })).length;
    const rejected = await guest.request<{ type: string }>('/identity/recovery-requests', {
      loginIdentifier: h.f.customer.principalId + '@example.invalid',
      response: '합성 확인 전 접수',
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.body.type).toBe('urn:oms:problem:invalid_input');
    expect((await store.list('RecoveryCase', { limit: 100 })).length).toBe(before);
    const requested = await guest.request<Receipt>(
      '/identity/recovery-requests',
      profileRecoveryInput(h.f.customer.principalId + '@example.invalid', '합성 확인 전 접수'),
    );
    expect(requested.response.status).toBe(200);
    expect(requested.body.requestState).toBe('ACCEPTED');
    expect(requested.body.targetRef).toBeNull();
    expect(requested.body.resultRefs).toHaveLength(0);
    const receipt = await store.currentProtected('RequestReceipt', requested.body.requestId);
    expect(receipt?.owner).toBe('IdentityRecovery');
    expect(receipt?.operation).toBe('requestRecovery');
    expect(receipt?.requestState).toBe('ACCEPTED');
    expect(
      profileReceiptResultMatches(
        'requestRecovery',
        requested.body,
        receipt!,
        profileRecoveryInput(h.f.customer.principalId + '@example.invalid', '합성 확인 전 접수'),
      ),
    ).toBe(true);
    expect((await store.list('RecoveryCase', { limit: 100 })).length).toBe(before + 1);
    expect(guest.cookieSnapshot().some((c) => c.name === '__Host-oms-customer')).toBe(false);
    expect(await store.list('EnrollmentAuthority')).toHaveLength(0);
  });
  it('P10 실제 목적 probe는 원래 private queue/보호 send 뒤200조회와202수락을 구별하고 raw 자료를 파기한다', async () => {
    const h = await setup(),
      queue = new SyntheticQueue(),
      authorities = new EnrollmentAuthorities(
        store,
        h.f.verifier,
        h.f.now,
        async (proof) => proof === 'synthetic-private-ingress',
      );
    const invitationOwner = new EnterpriseInvitations(
      h.f.access,
      h.f.verifier,
      h.f.vault,
      authorities,
      h.f.now,
    );
    let privateResponse = '',
      delivered = false;
    const starts = new Map<string, { observedAt: string; delayMilliseconds: number }>();
    const delivery = new PrivateU2Delivery(
      store,
      h.f.vault,
      {
        profile: 'LOCAL_SYNTHETIC',
        send: async (envelope, bytes, budget) => {
          budget.check();
          const source = await store.currentProtected(
            'MembershipInvitation',
            envelope.targetRef.id,
          );
          if (envelope.routeRef.id !== h.evidence.contactRef.id || source?.state !== 'PENDING')
            throw Error('원래 local receiver/source가 다릅니다.');
          privateResponse = bytes.toString();
          delivered = true;
          const work = (await store.currentProtected('WorkItem', envelope.deliveryId))!;
          expect(work.state).toBe('PROCESSING');
          starts.set(envelope.deliveryId, {
            observedAt: h.f.now().toISOString(),
            delayMilliseconds: h.f.now().getTime() - Date.parse(String(work.notBefore)),
          });
          return {
            deliveryId: envelope.deliveryId,
            routeRef: envelope.routeRef,
            knowledge: 'KNOWN',
          };
        },
      },
      h.f.now,
      true,
      undefined,
      invitationOwner,
    );
    const worker = new U2Worker(
      store,
      queue,
      new IdentityConsumer(
        store,
        new StatefulRecoveryProvider(h.f.now),
        authorities,
        h.f.now,
        true,
        h.f.vault,
        h.f.verifier,
      ),
      h.f.now,
      true,
      { 'u2-invitation-delivery': delivery },
    );
    const result = await profileInvitationProbe({
      store,
      manager: h.client,
      recipient: h.recipient,
      recipientId: String(h.guest.account.accountId),
      enterpriseRef: h.f.enterpriseRef,
      contactRef: h.evidence.contactRef,
      receive: async (invitationRef) => {
        const work = (
          await store.list('WorkItem', {
            equals: {
              operationId: 'EnterpriseAccess.deliverInvitation',
              targetRef: { id: invitationRef.id },
            },
            limit: 2,
          })
        )[0]!;
        const outbox = (
          await store.list('OutboxDelivery', { equals: { workRef: { id: work.workId } }, limit: 2 })
        )[0]!;
        await worker.relayOne(String(outbox.outboxId));
        const message = (await queue.receive('u2-invitation-delivery'))[0]!;
        await worker.consume(message);
        expect(queue.acknowledgements.includes(message.id)).toBe(true);
        const code = privateResponse;
        privateResponse = '';
        return code;
      },
    });
    expect(delivered && result.actualProtectedMembership && result.passed).toBe(true);
    expect(result.actualNoticeDeliveryClaimed).toBe(false);
    expect(result.operations.map((row) => [row.operation, row.status])).toEqual([
      ['inviteMembership', 202],
      ['issueInvitationPurpose', 202],
      ['readOwnInvitation', 200],
      ['acceptMembershipInvitation', 202],
      ['readOwnInvitation', 200],
    ]);
    expect(privateResponse === '').toBe(true);
    const ackPath = '.reports/u2/selected/p10-invitation-probe-ack-' + randomUUID() + '.jsonl';
    writeFileSync(
      ackPath,
      result.acknowledgements
        .map((row) => JSON.stringify({ ...row, observedAt: h.f.now().toISOString() }))
        .join('\n') + '\n',
      { mode: 0o600 },
    );
    const phases = [
      {
        phase: 'NORMAL',
        from: new Date(h.f.now().getTime() - 1000).toISOString(),
        to: new Date(h.f.now().getTime() + 60000).toISOString(),
      },
    ];
    const measured = await collectU2ProfileRecovery(
      store,
      phases,
      starts,
      queue.acknowledgements,
      queue.messages,
      ackPath,
    );
    expect(measured.phases[0]).toMatchObject({
      passed: true,
      eligibleWork: 1,
      acknowledgedWork: 1,
      terminalWork: 1,
      missingWork: 0,
    });
    expect(measured.passed).toBe(false); // One short NORMAL fixture is not all three recovery phases.
    const currentService = { store, u2Starts: starts, broker: queue } as unknown as Parameters<
      typeof collectU2ProfileStarts
    >[0];
    const firstStart = await collectU2ProfileStarts(
      currentService,
      phases[0]!.from,
      phases[0]!.to,
      ackPath,
    );
    expect(firstStart).toMatchObject({ passed: true, samples: 1, missingOrUnconfirmed: 0 });
    const originalStart = [...starts.entries()][0]!;
    const originalWork = (await store.currentProtected('WorkItem', originalStart[0]))!;
    for (const fault of [
      'missing-start',
      'missing-message',
      'missing-ack',
      'before-due',
      'at-deadline',
    ]) {
      const changed = new Map(starts);
      if (fault === 'missing-start') changed.clear();
      if (fault === 'before-due')
        changed.set(originalStart[0], {
          observedAt: new Date(Date.parse(String(originalWork.notBefore)) - 1).toISOString(),
          delayMilliseconds: 0,
        });
      if (fault === 'at-deadline') {
        changed.set(originalStart[0], {
          observedAt: String(originalWork.deadlineAt),
          delayMilliseconds: 0,
        });
      }
      const tested = {
        store,
        u2Starts: changed,
        broker: {
          messages: fault === 'missing-message' ? [] : queue.messages,
          acknowledgements: fault === 'missing-ack' ? [] : queue.acknowledgements,
        },
      } as unknown as Parameters<typeof collectU2ProfileStarts>[0];
      const measuredFault = await collectU2ProfileStarts(
        tested,
        phases[0]!.from,
        phases[0]!.to,
        ackPath,
      );
      expect(measuredFault.passed, fault).toBe(false);
      expect(measuredFault.missingOrUnconfirmed).toBe(1);
      if (fault === 'missing-start')
        expect(measuredFault.unconfirmedReasons.FIRST_START_MISSING).toBe(1);
      else if (fault === 'missing-message' || fault === 'missing-ack') {
        expect(measuredFault.unconfirmedReasons.QUEUE_ACK_UNCONFIRMED).toBe(1);
        expect(measuredFault.startedSamples).toBe(1); // Start observation does not replace the original ACK gate.
      } else expect(measuredFault.unconfirmedReasons.START_TIME_INVALID).toBe(1);
    }
    for (const milliseconds of [10000, 10001]) {
      const boundary = new Map(starts);
      boundary.set(originalStart[0], {
        observedAt: new Date(
          Date.parse(String(originalWork.notBefore)) + milliseconds,
        ).toISOString(),
        delayMilliseconds: milliseconds,
      });
      const tested = { store, u2Starts: boundary, broker: queue } as unknown as Parameters<
        typeof collectU2ProfileStarts
      >[0];
      expect(
        (await collectU2ProfileStarts(tested, phases[0]!.from, phases[0]!.to, ackPath)).passed,
      ).toBe(milliseconds === 10000);
    }
    for (const [observedStarts, copies, ackIds] of [
      [new Map(), queue.messages, queue.acknowledgements],
      [starts, [], queue.acknowledgements],
      [starts, queue.messages, []],
      [starts, [...queue.messages, queue.messages[0]!], queue.acknowledgements],
    ] as const) {
      const rejected = await collectU2ProfileRecovery(
        store,
        phases,
        observedStarts,
        ackIds,
        copies,
        ackPath,
      );
      expect(rejected.phases[0]!.passed).toBe(false);
    }
  });
  it('일반 MFA cookie만으로 초대를 수락하지 않으며 다른 연락 근거/토큰은 새 목적 권위를 만들지 않는다', async () => {
    const h = await setup(),
      before = (await store.list('EnrollmentAuthority')).length,
      input = {
        meta: u2Meta(1),
        invitationRef: h.issued.body.targetRef!,
        response: h.response,
        contactVerificationRef: ref('VerificationEvidence', h.evidence),
      };
    expect(
      (
        await h.recipient.request(
          `/membership-invitations/${h.source.invitationId}/acceptances`,
          input,
          { 'Idempotency-Key': input.meta.clientRequestId, 'X-Target-Revision': '1' },
        )
      ).response.status,
    ).toBe(401);
    for (const changed of [
      { response: generatePurposeSecret('INVITATION_TOKEN') },
      { contactVerificationRef: { ...ref('VerificationEvidence', h.evidence), id: randomUUID() } },
    ])
      expect(
        (
          await h.recipient.request(
            `/membership-invitations/${h.source.invitationId}/purpose-authorities`,
            {
              invitationRef: h.issued.body.targetRef,
              response: h.response,
              contactVerificationRef: ref('VerificationEvidence', h.evidence),
              ...changed,
            },
            { 'X-Target-Revision': '1' },
          )
        ).response.status,
      ).toBe(403);
    expect(await store.list('EnrollmentAuthority')).toHaveLength(before);
  });
  it('resend는 원래7일 기한을 연장하지 않고 old token은 새 목적 교환을 허용하지 않는다', async () => {
    const h = await setup(),
      input = { meta: u2Meta(1), sourceRef: h.issued.body.targetRef! };
    const resend = await h.client.request<Receipt>(
      `/membership-invitations/${h.source.invitationId}/resends`,
      input,
      { 'Idempotency-Key': input.meta.clientRequestId, 'X-Target-Revision': '1' },
    );
    expect(resend.response.status).toBe(202);
    const current = (await store.currentProtected(
      'MembershipInvitation',
      String(h.source.invitationId),
    ))!;
    expect(current.expiresAt).toBe(h.source.expiresAt);
    expect(current.tokenGeneration).toBe(2);
    expect(
      (
        await h.recipient.request(
          `/membership-invitations/${h.source.invitationId}/purpose-authorities`,
          {
            invitationRef: ref('MembershipInvitation', current),
            response: h.response,
            contactVerificationRef: ref('VerificationEvidence', h.evidence),
          },
          { 'X-Target-Revision': '2' },
        )
      ).response.status,
    ).toBe(403);
    expect(await store.list('EnrollmentAuthority')).toHaveLength(0);
    const queue = new SyntheticQueue(),
      starts = new Map<string, { observedAt: string; delayMilliseconds: number }>();
    const authorities = new EnrollmentAuthorities(
      store,
      h.f.verifier,
      h.f.now,
      async (proof) => proof === 'synthetic-private-ingress',
    );
    const invitationOwner = new EnterpriseInvitations(
      h.f.access,
      h.f.verifier,
      h.f.vault,
      authorities,
      h.f.now,
    );
    expect(await profileCurrentInvitation(invitationOwner, resend.body.targetRef!)).toEqual(
      resend.body.targetRef,
    );
    let sends = 0;
    const delivery = new PrivateU2Delivery(
      store,
      h.f.vault,
      {
        profile: 'LOCAL_SYNTHETIC',
        send: async (envelope, bytes, budget) => {
          budget.check();
          const target = await invitationOwner.assertDelivery(envelope.targetRef);
          expect(
            h.f.verifier.matches(
              bytes.toString(),
              invitationBinding(target),
              String(target.tokenVerifier),
            ),
          ).toBe(true);
          const work = (await store.currentProtected('WorkItem', envelope.deliveryId))!;
          expect(work.state).toBe('PROCESSING');
          starts.set(envelope.deliveryId, {
            observedAt: h.f.now().toISOString(),
            delayMilliseconds: h.f.now().getTime() - Date.parse(String(work.notBefore)),
          });
          sends++;
          return {
            deliveryId: envelope.deliveryId,
            routeRef: envelope.routeRef,
            knowledge: 'KNOWN',
          };
        },
      },
      h.f.now,
      true,
      undefined,
      invitationOwner,
    );
    const worker = new U2Worker(
      store,
      queue,
      new IdentityConsumer(
        store,
        new StatefulRecoveryProvider(h.f.now),
        authorities,
        h.f.now,
        true,
        h.f.vault,
        h.f.verifier,
      ),
      h.f.now,
      true,
      { 'u2-invitation-delivery': delivery },
    );
    const work = (
      await store.list('WorkItem', { equals: { requestId: resend.body.requestId }, limit: 2 })
    )[0]!;
    const outbox = (
      await store.list('OutboxDelivery', { equals: { workRef: { id: work.workId } }, limit: 2 })
    )[0]!;
    await worker.relayOne(String(outbox.outboxId));
    const message = (await queue.receive('u2-invitation-delivery'))[0]!;
    await worker.consume(message);
    expect(sends).toBe(1);
    expect(queue.acknowledgements.includes(message.id)).toBe(true);
    expect((await store.currentProtected('WorkItem', String(work.workId)))?.state).toBe(
      'RESULT_RECORDED',
    );
    const ackPath = '.reports/u2/selected/p10-resend-ack-' + randomUUID() + '.jsonl';
    writeFileSync(
      ackPath,
      JSON.stringify({
        requestId: resend.body.requestId,
        operation: 'resendMembershipInvitation',
        observedAt: h.f.now().toISOString(),
      }) + '\n',
      { mode: 0o600 },
    );
    const service = { store, u2Starts: starts, broker: queue } as unknown as Parameters<
      typeof collectU2ProfileStarts
    >[0];
    expect(
      await collectU2ProfileStarts(
        service,
        new Date(Date.now() - 60000).toISOString(),
        new Date(Date.now() + 60000).toISOString(),
        ackPath,
      ),
    ).toMatchObject({ passed: true, samples: 1, missingOrUnconfirmed: 0 });
    await new EnterpriseOrganisation(h.f.access, h.f.now).membership(
      h.f.customer,
      h.f.enterpriseRef,
      {
        meta: u2Meta(),
        accountRef: ref('Account', h.guest.account),
        departmentRef: null,
        siteRef: null,
        active: true,
        administrator: false,
      },
    );
    const changed = { meta: u2Meta(2), sourceRef: ref('MembershipInvitation', current) };
    const staleResend = await h.client.request<Receipt>(
      `/membership-invitations/${h.source.invitationId}/resends`,
      changed,
      { 'Idempotency-Key': changed.meta.clientRequestId, 'X-Target-Revision': '2' },
    );
    expect(staleResend.response.status).toBe(202);
    await expect(invitationOwner.assertDelivery(staleResend.body.targetRef!)).rejects.toMatchObject(
      { code: 'RECONFIRMATION_REQUIRED' },
    );
    expect(
      (await profileCurrentInvitation(invitationOwner, staleResend.body.targetRef!)) === null,
    ).toBe(true);
    expect(await profileCurrentInvitation(invitationOwner, undefined)).toBeNull();
    await expect(
      profileCurrentInvitation(invitationOwner, {
        ...staleResend.body.targetRef!,
        id: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'PROFILE_INVITATION_CURRENT' });
    const stoppedWork = (
      await store.list('WorkItem', { equals: { requestId: staleResend.body.requestId }, limit: 2 })
    )[0]!;
    const stoppedOutbox = (
      await store.list('OutboxDelivery', {
        equals: { workRef: { id: stoppedWork.workId } },
        limit: 2,
      })
    )[0]!;
    await expect(worker.relayOne(String(stoppedOutbox.outboxId))).rejects.toMatchObject({
      code: 'RECONFIRMATION_REQUIRED',
    });
    expect((await store.currentProtected('WorkItem', String(stoppedWork.workId)))?.state).toBe(
      'PENDING',
    );
    expect(
      (await store.currentProtected('OutboxDelivery', String(stoppedOutbox.outboxId)))?.state,
    ).toBe('PENDING');
    const expiredNow = () => new Date(Date.parse(String(stoppedWork.deadlineAt)) + 1);
    const expiredWorker = new U2Worker(
      store,
      queue,
      new IdentityConsumer(
        store,
        new StatefulRecoveryProvider(expiredNow),
        authorities,
        expiredNow,
        true,
        h.f.vault,
        h.f.verifier,
      ),
      expiredNow,
      true,
      { 'u2-invitation-delivery': delivery },
    );
    await expiredWorker.relayBatch();
    const stopped = (await store.currentProtected('WorkItem', String(stoppedWork.workId)))!;
    expect(stopped.state).toBe('REVIEW_REQUIRED');
    expect(stopped.attempt).toBe(0);
    expect(sends).toBe(1);
    const currentScope = await profileCurrentScope(store, {
      enterpriseRef: h.f.enterpriseRef,
      contextPolicyRef: h.f.enterpriseRef,
      organisationRevision: h.f.enterpriseRef.revision,
      departmentRef: null,
      siteRef: null,
    });
    const freshInput = { ...h.input, meta: u2Meta(), enterpriseRef: currentScope.enterpriseRef };
    const fresh = await h.client.request<Receipt>(
      `/enterprises/${currentScope.enterpriseRef.id}/membership-invitations`,
      freshInput,
      {
        'Idempotency-Key': freshInput.meta.clientRequestId,
        'X-Target-Revision': String(currentScope.enterpriseRef.revision),
      },
    );
    expect(fresh.response.status).toBe(202);
    expect(fresh.body.targetRef!.id === staleResend.body.targetRef!.id).toBe(false);
    const freshReceipt = (await store.currentProtected('RequestReceipt', fresh.body.requestId))!;
    expect(
      profileReceiptResultMatches('inviteMembership', fresh.body, freshReceipt, freshInput),
    ).toBe(true);
    expect(
      profileReceiptResultMatches(
        'resendMembershipInvitation',
        fresh.body,
        freshReceipt,
        freshInput,
      ),
    ).toBe(false);
    const freshWork = (
      await store.list('WorkItem', { equals: { requestId: fresh.body.requestId }, limit: 2 })
    )[0]!;
    const freshOutbox = (
      await store.list('OutboxDelivery', {
        equals: { workRef: { id: freshWork.workId } },
        limit: 2,
      })
    )[0]!;
    await worker.relayOne(String(freshOutbox.outboxId));
    const freshMessage = (await queue.receive('u2-invitation-delivery'))[0]!;
    await worker.consume(freshMessage);
    expect(sends).toBe(2);
    expect(queue.acknowledgements.includes(freshMessage.id)).toBe(true);
    expect((await store.currentProtected('WorkItem', String(freshWork.workId)))?.state).toBe(
      'RESULT_RECORDED',
    );
    expect((await store.currentProtected('WorkItem', String(stoppedWork.workId)))?.state).toBe(
      'REVIEW_REQUIRED',
    );
    expect(
      (await store.currentProtected('MembershipInvitation', String(current.invitationId)))
        ?.expiresAt,
    ).toBe(h.source.expiresAt);
    console.log(
      JSON.stringify({
        diagnostic: 'resend-policy',
        samePolicyState: 'RESULT_RECORDED',
        queueAcknowledged: true,
        changedPolicyCode: 'RECONFIRMATION_REQUIRED',
        changedPolicyState: stopped.state,
        changedPolicyAttempt: stopped.attempt,
        additionalSend: false,
      }),
    );
    h.response = '';
  });
});
