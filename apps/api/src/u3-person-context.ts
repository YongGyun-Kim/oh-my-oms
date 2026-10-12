import { canonicalJson, requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext } from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';
import { ref } from '@oms/core';

// 현재 보호된 원본의 포인터만 결합한다. 사람/목적/기업/모든 근거의 신뢰는 U3 결정 경계가 다시 검증한다.
export async function u3PersonContext(
  store: ProtectedStore,
  context: ServiceContext,
  now: () => Date,
  personPurpose: string,
): Promise<ServiceContext> {
  if (!personPurpose || context.audience !== 'STAFF') return context;
  const actor = context.actorAccountRef;
  requireCondition(
    actor && actor.id === context.principalId,
    401,
    'TRUSTED_IDENTITY_REQUIRED',
    '현재 실제 계정 문맥이 필요합니다.',
  );
  const visible = await store.list('VerifiedPersonLink', {
      equals: { accountRefs: [{ id: actor.id }] },
      limit: 2,
    }),
    raw = await store.primary.query(
      'SELECT "personLinkId" AS id FROM u1_verified_person_link WHERE "accountRefs" @> $1::jsonb LIMIT 2',
      [JSON.stringify([{ id: actor.id }])],
    );
  requireCondition(
    raw.length === visible.length &&
      raw.every((row: { id: string }) => visible.some((record) => record.personLinkId === row.id)),
    503,
    'CURRENT_PERSON_NOT_PROTECTED',
    '현재 사람 연결의 보호가 필요합니다.',
  );
  if (visible.length === 0) return { ...context, verifiedPersonRef: null };
  requireCondition(
    visible.length === 1,
    503,
    'U3_PERSON_LINK_AMBIGUOUS',
    '현재 사람 연결이 하나로 확인되어야 합니다.',
  );
  const link = await store.currentProtected('VerifiedPersonLink', String(visible[0]!.personLinkId));
  requireCondition(
    link &&
      (link.accountRefs as Ref[]).some(
        (reference) => canonicalJson(reference) === canonicalJson(actor),
      ),
    503,
    'U3_PERSON_ACCOUNT_CHANGED',
    '정확한 현재 계정 개정의 사람 연결이 필요합니다.',
  );
  const checks = await store.list('PersonVerification', {
      equals: { personLinkRef: { id: link.personLinkId } },
      limit: 2,
    }),
    rawChecks = await store.primary.query(
      'SELECT "personVerificationId" AS id FROM u1_person_verification WHERE "personLinkRef"->>\'id\'=$1 LIMIT 2',
      [link.personLinkId],
    );
  requireCondition(
    rawChecks.length === checks.length &&
      rawChecks.every((row: { id: string }) =>
        checks.some((check) => check.personVerificationId === row.id),
      ) &&
      checks.length === 1,
    503,
    'U3_PERSON_CHECK_UNCONFIRMED',
    '현재 사람 확인 원본의 보호가 필요합니다.',
  );
  const check = await store.currentProtected(
      'PersonVerification',
      String(checks[0]!.personVerificationId),
    ),
    policy = check
      ? await store.currentProtected('VerificationPolicy', (check.policyRef as Ref).id)
      : null;
  requireCondition(
    check &&
      policy &&
      canonicalJson(check.personLinkRef) === canonicalJson(ref('VerifiedPersonLink', link)) &&
      check.state === 'CONFIRMED' &&
      Date.parse(String(check.expiresAt)) > now().getTime() &&
      canonicalJson(ref('VerificationPolicy', policy)) === canonicalJson(check.policyRef) &&
      policy.active &&
      policy.purpose === personPurpose &&
      Date.parse(String(policy.expiresAt)) > now().getTime(),
    503,
    'U3_PERSON_CHECK_UNCONFIRMED',
    '현재 목적·정확 개정의 사람 확인 포인터가 필요합니다.',
  );
  return { ...context, verifiedPersonRef: ref('VerifiedPersonLink', link) };
}
