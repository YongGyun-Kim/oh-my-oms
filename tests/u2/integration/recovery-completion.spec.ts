import { randomUUID, randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { fingerprint } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import { ProtectedStore, u2CodeSecurityStateId } from '@oms/persistence';
import type { VaultBinding, ModelData } from '@oms/persistence';
import {
  RecoveryCompletions,
  EnrollmentAuthorities,
  IdentityBrowser,
  enqueueU2Work,
  identityResultDigest,
  identityProviderCircuitKey,
  ref,
  IdentityConsumer,
  IdentityRecovery,
  RecoveryFactorEnrollment,
  RecoveryPurposeCodes,
  RecoveryCodes,
  SavedCodeRecoveries,
} from '@oms/core';
import { initializeU2Databases, u2Sources } from '../fixtures/databases.js';
import { resetU2Databases } from '../fixtures/reset.js';
import { seedVerifiedRecoveryParty, seedClaimedRecovery } from '../fixtures/identity.js';
import { StatefulRecoveryProvider, syntheticPassword } from '../fixtures/provider.js';
import { u2Meta } from '../fixtures/enterprise.js';

describe('당사자 목적 권위에서만 확정하는 보호 복구 완료', () => {
  const sources = u2Sources(),
    store = new ProtectedStore(sources.primaryApp, sources.journalAppend);
  beforeAll(async () => {
    await initializeU2Databases();
    for (const source of Object.values(sources)) await source.initialize();
  });
  beforeEach(async () => resetU2Databases(sources.primaryAdmin, sources.journalAdmin));
  afterAll(async () => {
    for (const source of Object.values(sources)) if (source.isInitialized) await source.destroy();
  });
  async function fixture() {
    const f = await seedVerifiedRecoveryParty(store, sources.vault);
    await f.handoffs.verifyParty(f.staff, f.verifyInput);
    const verified = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      issued = await f.handoffs.issue(f.staff, {
        meta: u2Meta(2),
        caseRef: ref('RecoveryCase', verified),
        verificationRef: verified.verificationRef as Ref,
        partyContextRef: verified.partyContextRef as Ref,
        deliveryRouteRef: ref('RegisteredContact', f.contact),
      }),
      grant = (await store.currentProtected('RecoveryHandoffGrant', issued.targetRef!.id))!,
      material = (
        await sources.vault.query('SELECT binding FROM u2_vault.material WHERE id=$1', [
          grant.vaultRef,
        ])
      )[0].binding as VaultBinding,
      code = (
        await f.vault.read(material, {
          authorityRef: issued.targetRef!,
          targetRef: issued.targetRef!,
          purpose: 'HANDOFF',
          operation: 'identity.handoff.deliver',
          epoch: String(grant.epoch),
          deadlineAt: new Date(Date.now() + 10000).toISOString(),
        })
      ).toString(),
      claimed = await IdentityBrowser.run({ current: f.browser, next: f.browser }, () =>
        f.handoffs.claim(
          {
            attemptId: f.created.challengeId,
            audience: 'CUSTOMER',
            correlationId: randomUUID(),
            deadlineAt: new Date(Date.now() + 10000).toISOString(),
          },
          {
            meta: u2Meta(1),
            grantRef: issued.targetRef!,
            caseRef: ref('RecoveryCase', verified),
            challengeId: f.created.challengeId,
            code,
            partySecret: f.created.partySecret,
          },
        ),
      ),
      authority = (await store.list('EnrollmentAuthority'))[0]!,
      authorities = new EnrollmentAuthorities(store, f.verifier, f.now, async () => false),
      context = await authorities.authenticate(
        ref('EnrollmentAuthority', authority),
        claimed.handle,
        'MFA_REENROLMENT',
        randomUUID(),
      ),
      service = new RecoveryCompletions(store, authorities, f.now, 'LOCAL_SYNTHETIC'),
      original = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      security = (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]!,
      enrollment = {
        enrollmentId: randomUUID(),
        revision: 1,
        accountRef: f.customer.actorAccountRef,
        state: 'VERIFIED',
        protectedMethodRef: 'synthetic-new-totp-observed',
        verificationEvidenceRefs: [] as Ref[],
      },
      codes = {
        setId: randomUUID(),
        revision: 1,
        accountRef: f.customer.actorAccountRef,
        bindingRef: original.bindingRef,
        generation: original.bindingGeneration,
        confirmed: true,
        invalidated: false,
        verifiers: [{ digest: 'a'.repeat(64), used: false }],
      },
      mapping = {
        codeSecurityId: u2CodeSecurityStateId(codes.setId),
        revision: 1,
        codeSetRef: ref('RecoveryCodeSet', codes),
        bindingRef: codes.bindingRef,
        securityStateRef: ref('AccountSecurityState', security),
        securityGeneration: original.securityGeneration,
        origin: 'ISSUED_AT_SECURITY_GENERATION',
        establishedAt: f.now().toISOString(),
        epoch: original.epoch,
      },
      results: ModelData[] = [];
    let current: ModelData;
    // Protected synthetic producer observations exercise the owner commit gate;
    // they do not establish real provider capability or actual delivery.
    await f.execute('fixture-observed-local-completion', async (tx) => {
      const workRefs: Ref[] = [];
      for (const operation of [
        'IdentityRecovery.removeOriginalFactor',
        'IdentityRecovery.signOutOriginalSessions',
      ] as const) {
        const refs = await enqueueU2Work(
            tx,
            f.customer,
            issued.requestId,
            operation,
            ref('RecoveryCase', original),
            String(original.epoch),
            f.now(),
            String(authority.expiresAt),
          ),
          work = (await tx.get('WorkItem', refs.workRef.id))!;
        await tx.put('WorkItem', { ...work, state: 'RESULT_RECORDED', attempt: 1, revision: 2 }, 1);
        workRefs.push({ ...refs.workRef, revision: 2 });
        const bindingRef = (original.originalBindingRefs as Ref[])[0]!,
          result = {
            operationResultId: randomUUID(),
            revision: 1,
            caseRef: ref('RecoveryCase', original),
            bindingRef,
            operationId: refs.workRef.id,
            inputDigest: identityResultDigest(original, bindingRef, refs.workRef.id),
            providerRequestId: 'synthetic-observed-' + randomUUID(),
            knowledge: 'KNOWN',
            effect:
              operation === 'IdentityRecovery.removeOriginalFactor' ? 'REMOVED' : 'SIGNED_OUT',
            evidenceRefs: [ref('RecoveryCase', original)],
            terminal: true,
            observedAt: f.now().toISOString(),
            epoch: original.epoch,
          };
        await tx.put('IdentityOperationResult', result);
        results.push(result);
      }
      const factor = {
        operationResultId: randomUUID(),
        revision: 1,
        caseRef: ref('RecoveryCase', original),
        bindingRef: original.bindingRef,
        operationId: 'synthetic-factor-' + randomUUID(),
        inputDigest: '',
        providerRequestId: 'synthetic-observed-' + randomUUID(),
        knowledge: 'KNOWN',
        effect: 'FACTOR_VERIFIED',
        evidenceRefs: [ref('MfaEnrollment', enrollment)],
        terminal: true,
        observedAt: f.now().toISOString(),
        epoch: original.epoch,
      };
      factor.inputDigest = identityResultDigest(
        original,
        factor.bindingRef as Ref,
        factor.operationId,
      );
      const observationId = randomUUID(),
        observationRef: Ref = {
          owner: 'U1Host',
          entity: 'RequestReceipt',
          id: observationId,
          revision: 1,
        };
      enrollment.verificationEvidenceRefs = [observationRef];
      factor.evidenceRefs.push(observationRef);
      await tx.put('RequestReceipt', {
        requestId: observationId,
        principalId: f.customer.principalId,
        audience: 'CUSTOMER',
        operation: 'identity.recovery-factor-observed',
        targetIdentity: { kind: 'RECORD', recordRef: ref('RecoveryCase', original) },
        requestFingerprint: fingerprint({
          caseId: original.caseId,
          enrollmentId: enrollment.enrollmentId,
        }),
        idempotencyKey: observationId,
        owner: 'IdentityRecovery',
        targetScope: null,
        requestState: 'RESULT_RECORDED',
        resultRefs: [ref('MfaEnrollment', enrollment), ref('IdentityOperationResult', factor)],
        acceptedAt: f.now().toISOString(),
        updatedAt: f.now().toISOString(),
        revision: 1,
        correlationId: randomUUID(),
      });
      await tx.put('MfaEnrollment', enrollment);
      await tx.put('IdentityOperationResult', factor);
      results.push(factor);
      await tx.put('RecoveryCodeSet', codes);
      await tx.put('RecoveryCodeSecurityState', mapping);
      for (const old of original.originalFactorRefs as Ref[]) {
        const row = (await tx.get('MfaEnrollment', old.id))!;
        await tx.put(
          'MfaEnrollment',
          { ...row, state: 'INVALIDATED', revision: Number(row.revision) + 1 },
          Number(row.revision),
        );
      }
      current = {
        ...original,
        originalOperationRefs: workRefs,
        revision: Number(original.revision) + 1,
      };
      await tx.put('RecoveryCase', current, Number(original.revision));
    });
    const input = {
      meta: u2Meta(Number(current!.revision)),
      caseRef: ref('RecoveryCase', current!),
      enrollmentRef: ref('MfaEnrollment', enrollment),
      codeSetRef: ref('RecoveryCodeSet', codes),
      providerResultRefs: results.map((row) => ref('IdentityOperationResult', row)),
    };
    return {
      ...f,
      original,
      current: current!,
      authority,
      authorities,
      context,
      service,
      input,
      results,
      enrollment,
      codes,
      mapping,
    };
  }
  it('새 TOTP·옛 무효화·원래 효과·새 코드 ACK와 E01 의무가 한 보호 commit이며 업무 session/실전달은 만들지 않는다', async () => {
    const f = await fixture(),
      receipt = await f.service.complete(f.context, f.input),
      source = (await store.currentProtected('RecoveryCase', f.source.caseId))!;
    expect(source.state).toBe('COMPLETED');
    expect(source.noticeRef).not.toBeNull();
    expect(
      (await store.currentProtected('EnrollmentAuthority', String(f.authority.authorityId)))?.state,
    ).toBe('COMPLETED');
    expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('CLOSED');
    expect(
      (await store.list('IdentitySession')).filter((row) => row.phase === 'MFA_VERIFIED'),
    ).toHaveLength(2);
    expect(receipt.resultRefs.some((value) => value.entity === 'IdentityHistory')).toBe(true);
    expect(
      (
        await store.list('FactEnvelope', { equals: { sourceFactRef: { id: f.source.caseId } } })
      ).some((row) => (row.aggregateRef as Ref).revision === source.revision),
    ).toBe(true);
    expect(await store.list('NotificationIntent')).toHaveLength(0);
    expect((await f.service.complete(f.context, f.input)).requestId).toBe(receipt.requestId);
  });
  it('원래 직원/business MFA 문맥이나 위조 목적 Ref는 완료 권위가 아니다', async () => {
    const f = await fixture();
    await expect(f.service.complete(f.staff, f.input)).rejects.toMatchObject({
      code: 'PURPOSE_AUTHORITY_REQUIRED',
    });
    await expect(f.service.complete({ ...f.context }, f.input)).rejects.toMatchObject({
      code: 'PURPOSE_AUTHORITY_REQUIRED',
    });
  });
  it('통지요청/새 factor 하나만으로는 옛 제거·session 종료의 모든 원래 결과를 대신하지 않는다', async () => {
    const f = await fixture();
    await expect(
      f.service.complete(f.context, {
        ...f.input,
        providerResultRefs: [f.input.providerResultRefs[2]!],
      }),
    ).rejects.toMatchObject({ code: 'RECOVERY_COMPLETION_REQUIRED' });
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'ENROLMENT_ONLY',
    );
  });
  it('UNKNOWN/수락뿐/다른 binding/다른 input digest는 실제 원래 결과로 인정하지 않는다', async () => {
    const f = await fixture(),
      result = f.results[0]!;
    await f.execute('fixture-unknown-provider-result', async (tx) =>
      tx.put(
        'IdentityOperationResult',
        { ...result, knowledge: 'UNKNOWN', terminal: false, revision: 2 },
        1,
      ),
    );
    await expect(
      f.service.complete(f.context, {
        ...f.input,
        providerResultRefs: [
          ref('IdentityOperationResult', { ...result, revision: 2 }),
          ...f.input.providerResultRefs.slice(1),
        ],
      }),
    ).rejects.toMatchObject({ code: 'RECOVERY_PROVIDER_RESULT' });
  });
  it('새 코드 보관 미확인과 옛 살아 있는 MFA 원본은 완료를 막는다', async () => {
    const f = await fixture();
    await f.execute('fixture-codes-not-stored', async (tx) =>
      tx.put('RecoveryCodeSet', { ...f.codes, confirmed: false, revision: 2 }, 1),
    );
    await expect(
      f.service.complete(f.context, {
        ...f.input,
        codeSetRef: ref('RecoveryCodeSet', { ...f.codes, revision: 2 }),
      }),
    ).rejects.toMatchObject({ code: 'RECOVERY_COMPLETION_REQUIRED' });
  });
  it('불명 slot/현재 세대 변경/미보호 결과는 이전 관측으로 fallback하지 않는다', async () => {
    const f = await fixture(),
      slot = (await store.list('IdentityExecutionSlot'))[0]!;
    await f.execute('fixture-slot-unknown', async (tx) =>
      tx.put('IdentityExecutionSlot', { ...slot, state: 'UNKNOWN', revision: 2 }, 1),
    );
    await expect(f.service.complete(f.context, f.input)).rejects.toMatchObject({
      code: 'RECOVERY_EFFECT_UNKNOWN',
    });
  });
  it('실제 adapter 미등록은 합성 positive 근거가 있어도 실활성을 차단한다', async () => {
    const f = await fixture();
    await expect(
      new RecoveryCompletions(store, f.authorities, f.now, 'UNREGISTERED').complete(
        f.context,
        f.input,
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_COMPLETION_HOLD' });
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'ENROLMENT_ONLY',
    );
  });
  async function producer(
    activeStore = store,
    replacePassword = false,
    manualNow?: () => Date,
    beforeClaim?: () => void,
    factorClock?: () => Date,
  ) {
    const f = await seedClaimedRecovery(activeStore, sources.vault, manualNow, beforeClaim),
      factorTime = f.now().getTime(),
      // Only this fixture's TOTP calculation/verification share a stable step.
      // Core deadlines, current authority and provider observations keep f.now.
      // Explicit live-clock negative controls still reject an old-step code.
      factorNow = factorClock ?? (() => new Date(factorTime)),
      provider = new StatefulRecoveryProvider(f.now, factorNow),
      consumer = new IdentityConsumer(
        activeStore,
        provider,
        f.authorities,
        f.now,
        true,
        f.vault,
        f.verifier,
      );
    await consumer.prepare(f.purpose, {
      meta: u2Meta(Number(f.current.revision)),
      caseRef: ref('RecoveryCase', f.current),
    });
    const work = await store.list('WorkItem', {
      equals: { owner: 'IdentityRecovery', targetRef: { id: f.source.caseId } },
    });
    for (const row of work) await consumer.consume(String(row.workId));
    let current = (await store.currentProtected('RecoveryCase', f.source.caseId))!,
      selectedPassword = syntheticPassword;
    if (replacePassword) {
      selectedPassword = 'synthetic-party-replacement-' + randomUUID();
      await consumer.prepareFirstFactor(f.purpose, {
        meta: u2Meta(Number(current.revision)),
        caseRef: ref('RecoveryCase', current),
        password: selectedPassword,
      });
      const original = (
        await store.list('WorkItem', {
          equals: { operationId: 'IdentityRecovery.replaceFirstFactor' },
        })
      )[0]!;
      await consumer.consume(String(original.workId));
      work.push(original);
      current = (await store.currentProtected('RecoveryCase', f.source.caseId))!;
    }
    const runtimeKey = randomBytes(32),
      caseRef = ref('RecoveryCase', current),
      factors = new RecoveryFactorEnrollment(
        activeStore,
        provider,
        f.authorities,
        f.vault,
        f.now,
        true,
        f.verifier,
      ),
      codes = new RecoveryPurposeCodes(activeStore, factors, new RecoveryCodes(runtimeKey), f.now),
      identity = new IdentityRecovery(
        activeStore,
        provider,
        { synthetic: true, verifierKey: runtimeKey, now: f.now, staffIngress: async () => false },
        {
          parties: f.parties,
          handoffs: f.handoffs,
          authorities: f.authorities,
          recoveryFactors: factors,
          recoveryCodes: codes,
          savedCodes: new SavedCodeRecoveries(
            activeStore,
            f.verifier,
            f.vault,
            f.now,
            'LOCAL_SYNTHETIC',
          ),
        },
      ),
      binding = (await store.currentProtected('ProviderBinding', (current.bindingRef as Ref).id))!;
    if (replacePassword)
      await expect(
        identity.login(
          'CUSTOMER',
          String(binding.subject),
          syntheticPassword,
          'synthetic-u2-producer',
          null,
        ),
      ).rejects.toMatchObject({ code: 'AUTHENTICATION_DENIED' });
    const password = await identity.login(
      'CUSTOMER',
      String(binding.subject),
      selectedPassword,
      'synthetic-u2-producer',
      null,
    );
    return {
      ...f,
      factorNow,
      provider,
      consumer,
      factors,
      codes,
      identity,
      caseRef,
      work,
      password,
    };
  }
  for (const liveFactorClock of [false, true])
    it(
      liveFactorClock
        ? '경계 진단: 같은 proof/challenge라도 진행 TOTP 시계의 이전 step 코드는 실제 보호 경로에서 거절된다'
        : '경계 회귀: TOTP fixture 시계만 분리하고 업무 시각 전진·권위 정각 만료는 그대로 검증한다',
      async () => {
        let time = Date.now() + 1000,
          armed = false;
        const now = () => new Date(time),
          boundedStore = new ProtectedStore(
            sources.primaryApp,
            sources.journalAppend,
            async (at) => {
              if (armed && at === 'PRIMARY_COMMITTED') {
                armed = false;
                time++;
              }
            },
          ),
          f = await producer(
            boundedStore,
            false,
            now,
            undefined,
            liveFactorClock ? now : undefined,
          );
        // Seed with a current request deadline. Only then move the injected
        // business clock within its current step and reauthenticate the same
        // original handle; neither the authority nor its expiry is extended.
        time = Math.ceil(time / 30000) * 30000 - 1;
        f.purpose = await f.authorities.authenticate(
          ref('EnrollmentAuthority', f.authority),
          f.claimed.handle,
          'MFA_REENROLMENT',
          randomUUID(),
        );
        const prepared = await f.identity.beginRecoveryEnrollment(
            f.purpose,
            f.caseRef,
            f.password.challengeId!,
          ),
          target = f.provider.calls[0]!.target,
          response = f.provider.code(target),
          generationStep = Math.floor(f.factorNow().getTime() / 30000),
          original = f.provider.verifyFactor.bind(f.provider);
        const observations: {
          generationStep: number;
          verificationStep: number;
          businessStep: number;
          proofMatches: boolean;
          challengeMatches: boolean;
          currentCodeMatches: boolean;
        }[] = [];
        f.provider.verifyFactor = async (...args) => {
          const [selected, proof, challenge, code] = args,
            state = f.provider.subjects.get(selected.issuer + ':' + selected.subject),
            observation = {
              generationStep,
              verificationStep: Math.floor(f.factorNow().getTime() / 30000),
              businessStep: Math.floor(now().getTime() / 30000),
              proofMatches:
                proof.issuer === selected.issuer &&
                proof.subject === selected.subject &&
                proof.audience === selected.audience,
              challengeMatches: state?.challenge === challenge.toString(),
              currentCodeMatches: f.provider.code(selected) === code.toString(),
            };
          observations.push(observation);
          console.info(JSON.stringify({ event: 'recovery-factor-boundary', ...observation }));
          return original(...args);
        };
        armed = true;
        const result = f.identity.verifyRecoveryEnrollment(
          f.purpose,
          f.caseRef,
          prepared.enrollmentRef,
          response,
        );
        if (liveFactorClock) {
          await expect(result).rejects.toMatchObject({ code: 'SYNTHETIC_FACTOR' });
          expect(observations).toEqual([
            {
              generationStep,
              verificationStep: generationStep + 1,
              businessStep: generationStep + 1,
              proofMatches: true,
              challengeMatches: true,
              currentCodeMatches: false,
            },
          ]);
          expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
            'HOLD',
          );
          expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('UNKNOWN');
        } else {
          const verified = await result;
          expect(observations).toEqual([
            {
              generationStep,
              verificationStep: generationStep,
              businessStep: generationStep + 1,
              proofMatches: true,
              challengeMatches: true,
              currentCodeMatches: true,
            },
          ]);
          expect(
            (await store.currentProtected('MfaEnrollment', verified.enrollmentRef.id))?.state,
          ).toBe('VERIFIED');
          time = Date.parse(String(f.authority.expiresAt));
          await expect(f.factors.current(f.purpose, f.caseRef)).rejects.toMatchObject({
            code: 'PURPOSE_AUTHORITY_EXPIRED',
          });
        }
      },
    );
  it('실제 password challenge→새 합성 TOTP 확인→새 10코드 보관 ACK→완료의 전 경로를 연결하며 업무 권한을 만들지 않는다', async () => {
    const f = await producer(),
      prepared = await f.identity.beginRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        f.password.challengeId!,
      ),
      target = f.provider.calls[0]!.target,
      verified = await f.identity.verifyRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        prepared.enrollmentRef,
        f.provider.code(target),
      ),
      issued = await f.identity.issueRecoveryPurposeCodes(
        f.purpose,
        f.caseRef,
        verified.enrollmentRef,
      );
    expect(issued.codes).toHaveLength(10);
    expect(new Set(issued.codes).size).toBe(10);
    expect((await store.currentProtected('RecoveryCodeSet', issued.codeSetRef.id))?.confirmed).toBe(
      false,
    );
    const acknowledged = await f.identity.acknowledgeRecoveryPurposeCodes(
        f.purpose,
        f.caseRef,
        verified.enrollmentRef,
        issued.codeSetRef,
        true,
      ),
      originals = await Promise.all(
        f.work.map(async (work) =>
          ref(
            'IdentityOperationResult',
            (await store.currentProtected('IdentityOperationResult', String(work.workId)))!,
          ),
        ),
      ),
      completion = new RecoveryCompletions(store, f.authorities, f.now, 'LOCAL_SYNTHETIC');
    await completion.complete(f.purpose, {
      meta: u2Meta(f.caseRef.revision),
      caseRef: f.caseRef,
      enrollmentRef: verified.enrollmentRef,
      codeSetRef: acknowledged,
      providerResultRefs: [...originals, verified.providerResultRef],
    });
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'COMPLETED',
    );
    expect(
      (await store.list('IdentitySession')).filter((row) => row.phase === 'MFA_VERIFIED'),
    ).toHaveLength(2);
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [
        prepared.enrollmentRef.id,
      ]),
    ).toHaveLength(0);
  });
  it('타 당사자의 password challenge·복제 목적 문맥·저장 미확인은 새 수단/완료를 허용하지 않는다', async () => {
    const f = await producer();
    await expect(
      f.identity.beginRecoveryEnrollment({ ...f.purpose }, f.caseRef, f.password.challengeId!),
    ).rejects.toMatchObject({ code: 'PURPOSE_AUTHORITY_REQUIRED' });
    const prepared = await f.identity.beginRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        f.password.challengeId!,
      ),
      verified = await f.identity.verifyRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        prepared.enrollmentRef,
        f.provider.code(f.provider.calls[0]!.target),
      ),
      issued = await f.codes.issue(f.purpose, f.caseRef, verified.enrollmentRef);
    await expect(
      f.codes.acknowledge(f.purpose, f.caseRef, verified.enrollmentRef, issued.codeSetRef, false),
    ).rejects.toMatchObject({ code: 'CODE_STORAGE_ACK_REQUIRED' });
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'ENROLMENT_ONLY',
    );
  });
  it('실제 틀린 합성 TOTP와 같은 원래 challenge 재시도는 불명 mutation을 재전송하지 않는다', async () => {
    const f = await producer(),
      prepared = await f.identity.beginRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        f.password.challengeId!,
      ),
      correct = f.provider.code(f.provider.calls[0]!.target),
      wrong = correct === '000000' ? '000001' : '000000';
    await expect(
      f.identity.verifyRecoveryEnrollment(f.purpose, f.caseRef, prepared.enrollmentRef, wrong),
    ).rejects.toThrow();
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
    expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('UNKNOWN');
    await expect(
      f.identity.verifyRecoveryEnrollment(f.purpose, f.caseRef, prepared.enrollmentRef, correct),
    ).rejects.toThrow();
  });
  it('새 factor 관측 primary commit crash는 ACK 전 막고 prefix 복구 뒤 같은 원래 결과만 관측한다', async () => {
    let active = false,
      count = 0;
    const crashed = new ProtectedStore(
        sources.primaryApp,
        sources.journalAppend,
        async (boundary) => {
          if (active && boundary === 'PRIMARY_COMMITTED' && ++count === 2)
            throw Error('synthetic-factor-observation-crash');
        },
      ),
      f = await producer(crashed),
      prepared = await f.identity.beginRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        f.password.challengeId!,
      );
    active = true;
    await expect(
      f.identity.verifyRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        prepared.enrollmentRef,
        f.provider.code(f.provider.calls[0]!.target),
      ),
    ).rejects.toThrow('synthetic-factor-observation-crash');
    expect(
      f.provider.factorCalls.filter((call) => call.operation === 'VERIFY_NEW_FACTOR'),
    ).toHaveLength(1);
    expect((await store.read('MfaEnrollment', prepared.enrollmentRef.id))?.state).toBe('PENDING');
    await expect(
      store.currentProtected('MfaEnrollment', prepared.enrollmentRef.id),
    ).rejects.toMatchObject({ code: 'CURRENT_AUTH_NOT_PROTECTED' });
    await store.protectPending(await store.currentEpoch());
    expect((await store.currentProtected('MfaEnrollment', prepared.enrollmentRef.id))?.state).toBe(
      'VERIFIED',
    );
    await expect(
      f.identity.verifyRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        prepared.enrollmentRef,
        f.provider.code(f.provider.calls[0]!.target),
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_FACTOR_PENDING' });
    expect(
      f.provider.factorCalls.filter((call) => call.operation === 'VERIFY_NEW_FACTOR'),
    ).toHaveLength(1);
    expect(
      await store.list('RequestReceipt', {
        equals: { operation: 'identity.recovery-factor-observed' },
      }),
    ).toHaveLength(1);
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'ENROLMENT_ONLY',
    );
  });
  it('새 첫 password의 실제 변경은 옛 password 로그인 거절/새 challenge·새 MFA·코드 ACK 이후에만 완료한다', async () => {
    const f = await producer(store, true),
      prepared = await f.identity.beginRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        f.password.challengeId!,
      ),
      verified = await f.identity.verifyRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        prepared.enrollmentRef,
        f.provider.code(f.provider.calls[0]!.target),
      ),
      issued = await f.codes.issue(f.purpose, f.caseRef, verified.enrollmentRef),
      stored = await f.codes.acknowledge(
        f.purpose,
        f.caseRef,
        verified.enrollmentRef,
        issued.codeSetRef,
        true,
      ),
      originals = await Promise.all(
        f.work.map(async (work) =>
          ref(
            'IdentityOperationResult',
            (await store.currentProtected('IdentityOperationResult', String(work.workId)))!,
          ),
        ),
      );
    await new RecoveryCompletions(store, f.authorities, f.now, 'LOCAL_SYNTHETIC').complete(
      f.purpose,
      {
        meta: u2Meta(f.caseRef.revision),
        caseRef: f.caseRef,
        enrollmentRef: verified.enrollmentRef,
        codeSetRef: stored,
        providerResultRefs: [...originals, verified.providerResultRef],
      },
    );
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe(
      'COMPLETED',
    );
    expect(
      f.provider.calls.filter((call) => call.operation === 'REPLACE_FIRST_FACTOR'),
    ).toHaveLength(1);
  });
  it('공유 provider breaker가 열린 뒤에는 새 MFA SDK를 호출하지 않는다', async () => {
    const f = await producer(),
      binding = (await store.currentProtected(
        'ProviderBinding',
        (f.current.bindingRef as Ref).id,
      ))!,
      id = identityProviderCircuitKey(String(binding.issuer)),
      previous = (await store.currentProtected('EndpointCircuit', id))!;
    await f.execute('fixture-factor-provider-open', async (tx) =>
      tx.put(
        'EndpointCircuit',
        {
          ...previous,
          state: 'OPEN',
          failureCount: 5,
          openedAt: f.now().toISOString(),
          revision: Number(previous.revision) + 1,
        },
        Number(previous.revision),
      ),
    );
    await expect(
      f.identity.beginRecoveryEnrollment(f.purpose, f.caseRef, f.password.challengeId!),
    ).rejects.toMatchObject({ code: 'IDENTITY_PROVIDER_CIRCUIT' });
    expect(f.provider.factorCalls).toHaveLength(0);
  });
  it('완료 전에 발급/보관한 새 코드는 완료 후 실제 password와 함께 다음 단회 제한 복구에 사용할 수 있다', async () => {
    const f = await producer(),
      prepared = await f.identity.beginRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        f.password.challengeId!,
      ),
      verified = await f.identity.verifyRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        prepared.enrollmentRef,
        f.provider.code(f.provider.calls[0]!.target),
      ),
      issued = await f.codes.issue(f.purpose, f.caseRef, verified.enrollmentRef),
      stored = await f.codes.acknowledge(
        f.purpose,
        f.caseRef,
        verified.enrollmentRef,
        issued.codeSetRef,
        true,
      ),
      originals = await Promise.all(
        f.work.map(async (work) =>
          ref(
            'IdentityOperationResult',
            (await store.currentProtected('IdentityOperationResult', String(work.workId)))!,
          ),
        ),
      );
    await new RecoveryCompletions(store, f.authorities, f.now, 'LOCAL_SYNTHETIC').complete(
      f.purpose,
      {
        meta: u2Meta(f.caseRef.revision),
        caseRef: f.caseRef,
        enrollmentRef: verified.enrollmentRef,
        codeSetRef: stored,
        providerResultRefs: [...originals, verified.providerResultRef],
      },
    );
    const binding = (await store.currentProtected(
      'ProviderBinding',
      (f.current.bindingRef as Ref).id,
    ))!;
    await IdentityBrowser.run({ current: f.browser, next: f.browser }, async () => {
      const password = await f.identity.login(
          'CUSTOMER',
          String(binding.subject),
          syntheticPassword,
          'synthetic-u2-next-recovery',
          null,
        ),
        next = await f.identity.prepareSavedRecovery(password.challengeId!),
        claimed = await f.identity.recoverSavedCode(
          next,
          password.challengeId!,
          issued.codeSetRef.id,
          issued.codes[0]!,
          'synthetic-u2-next-recovery',
        );
      expect((claimed.outcome as { purpose: string }).purpose).toBe('MFA_REENROLMENT');
    });
    expect(
      (
        await store.list('AccountSecurityState', {
          equals: { accountRef: { id: f.customer.principalId } },
        })
      )[0]?.securityGeneration,
    ).toBe(3);
    expect(
      (await store.currentProtected('RecoveryCodeSet', issued.codeSetRef.id))?.invalidated,
    ).toBe(true);
  });
  it('발급 서비스와 직접 복구의 다른 verifier 키 조립은 source 변경 전에 차단한다', async () => {
    const f = await producer();
    expect(() => f.codes.assertVerifier(new RecoveryCodes(randomBytes(32)))).toThrow(
      '같은 현재 검증 키',
    );
  });
  it('늦은 유효 claim의 새 MFA는 원래 인계5분 후에도 별도 권위5분 안에서만 실행하고 그 정각에는 막힌다', async () => {
    let time = Date.now() + 1000;
    const now = () => new Date(time),
      f = await producer(store, false, now, () => {
        time += 240000;
      });
    time = Date.parse(String(f.source.deadlineAt)) + 1000;
    expect(time).toBeLessThan(Date.parse(String(f.authority.expiresAt)));
    const context = await f.authorities.authenticate(
        ref('EnrollmentAuthority', f.authority),
        f.claimed.handle,
        'MFA_REENROLMENT',
        randomUUID(),
      ),
      targets: string[] = [];
    const begin = f.provider.beginFactor.bind(f.provider);
    f.provider.beginFactor = async (target, ...rest) => {
      targets.push(target.deadlineAt);
      return begin(target, ...rest);
    };
    const prepared = await f.identity.beginRecoveryEnrollment(
      context,
      f.caseRef,
      f.password.challengeId!,
    );
    expect(targets).toEqual([f.authority.expiresAt]);
    expect(
      (
        await f.identity.verifyRecoveryEnrollment(
          context,
          f.caseRef,
          prepared.enrollmentRef,
          f.provider.code(f.provider.calls[0]!.target),
        )
      ).enrollmentRef.revision,
    ).toBe(2);
    time = Date.parse(String(f.authority.expiresAt));
    await expect(
      f.authorities.authenticate(
        ref('EnrollmentAuthority', f.authority),
        f.claimed.handle,
        'MFA_REENROLMENT',
        randomUUID(),
      ),
    ).rejects.toThrow();
    expect(f.provider.factorCalls).toHaveLength(2);
  });
  it('다른 원래 begin callback은 비공개 challenge/QR를 당사자에게 반환하지 않고 UNKNOWN으로 보존한다', async () => {
    const f = await producer(),
      original = f.provider.beginFactor.bind(f.provider);
    f.provider.beginFactor = async (...input) => {
      const result = await original(...input);
      return { ...result, observation: { ...result.observation, workId: 'other-original-work' } };
    };
    await expect(
      f.identity.beginRecoveryEnrollment(f.purpose, f.caseRef, f.password.challengeId!),
    ).rejects.toMatchObject({ code: 'RECOVERY_FACTOR_ORIGINAL_CHALLENGE' });
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
    expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('UNKNOWN');
  });
  it('미래 시각 새 factor callback은 현재 실제 확인으로 기록하지 않는다', async () => {
    const f = await producer(),
      prepared = await f.identity.beginRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        f.password.challengeId!,
      ),
      original = f.provider.verifyFactor.bind(f.provider);
    f.provider.verifyFactor = async (...input) => {
      const result = await original(...input);
      return {
        ...result,
        observation: {
          ...result.observation,
          observedAt: new Date(f.now().getTime() + 60000).toISOString(),
        },
      };
    };
    await expect(
      f.identity.verifyRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        prepared.enrollmentRef,
        f.provider.code(f.provider.calls[0]!.target),
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_FACTOR_UNKNOWN' });
    expect((await store.currentProtected('MfaEnrollment', prepared.enrollmentRef.id))?.state).toBe(
      'PENDING',
    );
    expect((await store.currentProtected('RecoveryCase', f.source.caseId))?.state).toBe('HOLD');
  });
  it('UNKNOWN HOLD의 원래 당사자는 제한 상태만 재관측하고 새 수단/완료 권위를 얻지 않는다', async () => {
    const f = await producer();
    f.provider.mode = 'FORGED';
    const begin = f.provider.verifyFactor.bind(f.provider),
      prepared = await f.identity.beginRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        f.password.challengeId!,
      );
    f.provider.verifyFactor = async (...input) => {
      const result = await begin(...input);
      return { ...result, observation: { ...result.observation, workId: 'different' } };
    };
    await expect(
      f.identity.verifyRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        prepared.enrollmentRef,
        f.provider.code(f.provider.calls[0]!.target),
      ),
    ).rejects.toThrow();
    const authority = (await store.currentProtected(
      'EnrollmentAuthority',
      String(f.authority.authorityId),
    ))!;
    await expect(
      f.identity.authenticatePurpose(
        ref('EnrollmentAuthority', authority),
        f.claimed.handle,
        'MFA_REENROLMENT',
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PURPOSE_AUTHORITY_EXPIRED' });
    const held = await f.identity.authenticatePurpose(
      ref('EnrollmentAuthority', authority),
      f.claimed.handle,
      'MFA_REENROLMENT',
      randomUUID(),
      null,
      true,
    );
    expect(await f.identity.readRecoveryStatus(held, f.caseRef)).toMatchObject({
      state: 'HOLD',
      knowledge: 'UNKNOWN',
      actualEffect: 'UNCONFIRMED',
      noticeDelivery: 'NOT_REQUESTED',
    });
    expect(
      await f.identity.readOwnClaimResult(
        held,
        (f.claimed.outcome as { claimReceiptRef: Ref }).claimReceiptRef,
      ),
    ).toMatchObject({ phase: 'ENROLMENT_ONLY', expiresAt: f.authority.expiresAt });
    await expect(
      f.identity.readRecoveryStatus(held, { ...f.caseRef, id: 'another-case' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(f.factors.current(held, f.caseRef)).rejects.toMatchObject({
      code: 'PURPOSE_AUTHORITY_EXPIRED',
    });
    await expect(f.identity.readRecoveryStatus({ ...held }, f.caseRef)).rejects.toMatchObject({
      code: 'PURPOSE_AUTHORITY_REQUIRED',
    });
  });
  it('같은 제한 권위의 두번째 새 수단 prepare는 SDK 전에 막고 UNKNOWN 결과는 challenge 자료만 보호 파기한다', async () => {
    const f = await producer(),
      prepared = await f.identity.beginRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        f.password.challengeId!,
      );
    await expect(
      f.identity.beginRecoveryEnrollment(f.purpose, f.caseRef, f.password.challengeId!),
    ).rejects.toMatchObject({ code: 'RECOVERY_FACTOR_ALREADY_STARTED' });
    expect(f.provider.factorCalls).toHaveLength(1);
    const correct = f.provider.code(f.provider.calls[0]!.target);
    await expect(
      f.identity.verifyRecoveryEnrollment(
        f.purpose,
        f.caseRef,
        prepared.enrollmentRef,
        correct === '000000' ? '000001' : '000000',
      ),
    ).rejects.toThrow();
    expect(
      await sources.vault.query('SELECT id FROM u2_vault.material WHERE id=$1', [
        prepared.enrollmentRef.id,
      ]),
    ).toHaveLength(0);
    expect(
      await store.list('SecurityTombstone', {
        equals: { targetRef: { id: f.authority.authorityId }, purpose: 'PROVIDER_CHALLENGE' },
      }),
    ).toHaveLength(1);
    expect((await store.list('IdentityExecutionSlot'))[0]?.state).toBe('UNKNOWN');
    expect(
      (await store.currentProtected('EnrollmentAuthority', String(f.authority.authorityId)))?.state,
    ).toBe('HOLD');
  });
});
