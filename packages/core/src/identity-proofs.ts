import type { ServiceContext } from '@oms/contracts';
import { ExecutionBudget, fingerprint, requireCondition } from '@oms/contracts';
import type { ProtectedTransaction } from '@oms/persistence';
import { createHmac, randomUUID } from 'node:crypto';
import type { FactorProof, PasswordProof } from './identity-provider.js';
import type { IdentityInternal } from './identity-state.js';
import { enqueueMinimumNotice } from './pending-notification.js';
import { ref } from './references.js';
export function sessionId(host: IdentityInternal, token: string): string {
  return createHmac('sha256', host.runtime.verifierKey)
    .update('session:' + token)
    .digest('hex');
}
export async function recordProviderProof(
  host: IdentityInternal,
  proof: PasswordProof | FactorProof,
): Promise<void> {
  if (host.provider.kind === 'SYNTHETIC') return;
  const evidence = proof.verification;
  requireCondition(
    evidence &&
      evidence.provider === host.provider.kind &&
      evidence.issuer === proof.issuer &&
      evidence.subject === proof.subject &&
      evidence.audience === proof.audience &&
      evidence.outcome === 'VERIFIED' &&
      proof.evidenceRefs.some(
        (value) =>
          value.owner === 'IdentityRecovery' &&
          value.entity === 'ProviderVerificationEvidence' &&
          value.id === evidence.evidenceId,
      ),
    503,
    'PROVIDER_EVIDENCE_REQUIRED',
    '실제 제공자 검증 관측 원본이 필요합니다.',
  );
  await host.mutate(
    evidence.evidenceId,
    { evidenceId: evidence.evidenceId },
    async (transaction) => {
      await transaction.put('ProviderVerificationEvidence', { ...evidence, revision: 1 });
    },
  );
}
export async function mutate(
  host: IdentityInternal,
  key: string,
  input: unknown,
  operation: (transaction: ProtectedTransaction, requestId: string) => Promise<void>,
): Promise<void> {
  await host.store.execute(
    {
      principalId: 'identity-host',
      audience: 'SYSTEM',
      owner: 'IdentityRecovery',
      operation: 'identity-state',
      target: null,
      idempotencyKey: key,
      input,
      correlationId: key,
      epoch: await host.store.currentEpoch(),
    },
    async (transaction, requestId) => {
      await operation(transaction, requestId);
      const affected = transaction.rows().map((row) => ref(row.model, row.data));
      const actor =
        transaction
          .rows()
          .map((row) => row.data.accountRef)
          .find((value) => value !== undefined) ?? null;
      const now = host.runtime.now().toISOString();
      await transaction.put('RequestReceipt', {
        requestId,
        principalId: 'identity-host',
        audience: 'SYSTEM',
        operation: 'identity-state',
        targetIdentity: { kind: 'NONE' },
        requestFingerprint: fingerprint(input),
        idempotencyKey: key,
        owner: 'IdentityRecovery',
        targetScope: null,
        requestState: 'RESULT_RECORDED',
        resultRefs: affected,
        acceptedAt: now,
        updatedAt: now,
        revision: 1,
        correlationId: key,
      });
      await transaction.put('IdentityHistory', {
        historyId: randomUUID(),
        owner: 'IdentityRecovery',
        actorAccountRef: actor,
        verifiedPersonRef: null,
        occurredAt: host.runtime.now().toISOString(),
        reason: '인증 소유자의 검증된 상태 변경',
        beforeRef: null,
        afterRef: affected[0] ?? null,
        evidenceRefs: [],
        requestId,
        resultRefs: affected,
        correctionOf: null,
        sourceRevision: 1,
      });
      const securityChange = transaction
        .rows()
        .find(
          (row) =>
            ['MfaEnrollment', 'ProviderBinding'].includes(row.model) ||
            (row.model === 'RecoveryCodeSet' && row.data.confirmed === true),
        );
      if (securityChange) {
        const source = ref(securityChange.model, securityChange.data);
        const context: ServiceContext = {
          principalId: 'identity-host',
          actorAccountRef: securityChange.data.accountRef as ServiceContext['actorAccountRef'],
          verifiedPersonRef: null,
          identityAssertionRef: source,
          audience: 'SYSTEM',
          accessEvaluationRef: null,
          executionPermitRef: null,
          correlationId: key,
          deadlineAt:
            ExecutionBudget.current()?.deadlineAt ??
            new Date(host.runtime.now().getTime() + 10000).toISOString(),
        };
        await enqueueMinimumNotice(
          transaction,
          context,
          requestId,
          source,
          null,
          await host.store.currentEpoch(),
          host.runtime.now(),
        );
      }
    },
  );
}
