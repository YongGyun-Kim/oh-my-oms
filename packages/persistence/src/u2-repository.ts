import { canonicalJson, fingerprint, requireCondition } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import type { ProtectedStore, WriteRequest, CommitResult } from './protected-store.js';
import type { ProtectedTransaction } from './protected-transaction.js';
import type { ModelData } from './model-catalog.js';
import { validateU2RecoveryImage } from './u2-recovery-payload.js';
import type { VaultBinding, VaultPermit } from './purpose-secret-vault.js';
export async function authorizeProtectedVault(
  store: ProtectedStore,
  binding: VaultBinding,
  permit: VaultPermit,
  action: 'CREATE' | 'READ' | 'DESTROY',
): Promise<void> {
  if (
    binding.purpose === 'INVITATION_TOKEN' &&
    action === 'CREATE' &&
    permit.operation === 'enterprise.invitation.prepare'
  ) {
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/MembershipInvitation',
      binding.targetRef,
    );
    requireCondition(
      permit.authorityRef.owner === 'EnterpriseAccess' &&
        ['Enterprise', 'MembershipInvitation'].includes(permit.authorityRef.entity) &&
        permit.epoch === (await store.currentEpoch()) &&
        Date.now() < Date.parse(permit.deadlineAt),
      403,
      'VAULT_PREPARE_SOURCE',
      '현재 초대 발급/교체 원본이 필요합니다.',
    );
    const authority = await store.currentProtected(
        permit.authorityRef.entity,
        permit.authorityRef.id,
      ),
      target = await store.currentProtected('MembershipInvitation', binding.targetRef.id);
    requireCondition(
      authority && authority.revision === permit.authorityRef.revision,
      403,
      'VAULT_PREPARE_SOURCE',
      '현재 보호 준비 근거 개정이 필요합니다.',
    );
    if (permit.authorityRef.entity === 'Enterprise')
      requireCondition(
        authority.usageEnabled &&
          authority.approvalState === 'APPROVED' &&
          !target &&
          binding.sourceRevision === 1,
        403,
        'VAULT_PREPARE_SOURCE',
        '현재 승인 기업의 신규 암호 준비만 허용합니다.',
      );
    else
      requireCondition(
        target &&
          target.invitationId === authority.invitationId &&
          target.revision === authority.revision &&
          target.state === 'PENDING' &&
          target.epoch === permit.epoch &&
          binding.sourceRevision === Number(target.revision) + 1 &&
          Date.now() < Date.parse(String(target.expiresAt)) &&
          Date.parse(binding.expiresAt) <= Date.parse(String(target.expiresAt)),
        403,
        'VAULT_PREPARE_SOURCE',
        '원래 미만료 초대의 단일 새 개정 암호 준비만 허용합니다.',
      );
    return;
  }
  if (
    binding.purpose === 'ENROLLMENT_HANDLE' &&
    action === 'CREATE' &&
    permit.operation === 'identity.saved-code.prepare-handle'
  ) {
    store.schema.validate('Ref', permit.authorityRef);
    requireCondition(
      permit.authorityRef.owner === 'IdentityRecovery' &&
        permit.authorityRef.entity === 'RecoveryCodeSet',
      403,
      'VAULT_PREPARE_SOURCE',
      '현재 직접 복구 코드 집합 원본이 필요합니다.',
    );
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/EnrollmentAuthority',
      binding.targetRef,
    );
    const source = await store.currentProtected('RecoveryCodeSet', permit.authorityRef.id),
      provider =
        source && (await store.currentProtected('ProviderBinding', (source.bindingRef as Ref).id));
    requireCondition(
      source &&
        provider &&
        source.revision === permit.authorityRef.revision &&
        source.confirmed === true &&
        source.invalidated === false &&
        provider.active &&
        canonicalJson(source.accountRef) === canonicalJson(binding.accountRef) &&
        provider.audience === binding.audience &&
        source.generation === binding.bindingGeneration &&
        provider.generation === binding.bindingGeneration &&
        permit.epoch === (await store.currentEpoch()) &&
        Date.now() < Date.parse(permit.deadlineAt),
      403,
      'VAULT_PREPARE_SOURCE',
      '현재 실제 password/code 소비의 암호 준비 원본이 필요합니다.',
    );
    const target = await store.currentProtected('EnrollmentAuthority', binding.targetRef.id);
    requireCondition(
      target === null,
      403,
      'VAULT_PREPARE_CONFLICT',
      '기존 제한 권위 암호 자료를 덮어쓰지 않습니다.',
    );
    return;
  }
  if (
    binding.purpose === 'HANDOFF' &&
    action === 'CREATE' &&
    permit.operation === 'identity.handoff.prepare'
  ) {
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/RecoveryVerification',
      permit.authorityRef,
    );
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/RecoveryHandoffGrant',
      binding.targetRef,
    );
    const verification = await store.currentProtected(
        'RecoveryVerification',
        permit.authorityRef.id,
      ),
      source =
        verification &&
        (await store.currentProtected('RecoveryCase', (verification.caseRef as Ref).id));
    requireCondition(
      verification &&
        source &&
        verification.revision === permit.authorityRef.revision &&
        verification.state === 'CONFIRMED' &&
        source.revision === (verification.caseRef as Ref).revision &&
        source.state === 'VERIFYING' &&
        (source.verificationRef as Ref).id === verification.verificationId &&
        source.epoch === permit.epoch &&
        permit.epoch === (await store.currentEpoch()) &&
        canonicalJson(source.accountRef) === canonicalJson(binding.accountRef) &&
        source.bindingGeneration === binding.bindingGeneration &&
        Date.parse(binding.expiresAt) <= Date.parse(String(verification.expiresAt)) &&
        Date.now() < Date.parse(permit.deadlineAt),
      403,
      'VAULT_PREPARE_SOURCE',
      '현재 실제 확인 인계의 암호 준비 원본이 필요합니다.',
    );
    const target = await store.currentProtected('RecoveryHandoffGrant', binding.targetRef.id);
    requireCondition(
      target === null,
      403,
      'VAULT_PREPARE_CONFLICT',
      '기존 인계 암호 자료를 덮어쓰지 않습니다.',
    );
    return;
  }
  if (
    binding.purpose === 'ENROLLMENT_HANDLE' &&
    action === 'CREATE' &&
    permit.operation === 'identity.enrollment.prepare-handle'
  ) {
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/RecoveryHandoffGrant',
      permit.authorityRef,
    );
    store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/EnrollmentAuthority',
      binding.targetRef,
    );
    const source = await store.currentProtected('RecoveryHandoffGrant', permit.authorityRef.id);
    requireCondition(
      source &&
        source.revision === permit.authorityRef.revision &&
        source.state === 'ISSUED' &&
        Number(source.attemptCount) < 5 &&
        source.epoch === permit.epoch &&
        permit.epoch === (await store.currentEpoch()) &&
        canonicalJson(source.accountRef) === canonicalJson(binding.accountRef) &&
        source.audience === binding.audience &&
        source.bindingGeneration === binding.bindingGeneration &&
        Date.now() < Date.parse(String(source.expiresAt)) &&
        Date.now() < Date.parse(permit.deadlineAt),
      403,
      'VAULT_PREPARE_SOURCE',
      '현재 단회 claim의 비공개 암호 준비 원본이 필요합니다.',
    );
    const target = await store.currentProtected('EnrollmentAuthority', binding.targetRef.id);
    requireCondition(
      target === null,
      403,
      'VAULT_PREPARE_CONFLICT',
      '기존 제한 권위의 암호 자료를 덮어쓰지 않습니다.',
    );
    return;
  }
  const mapping = {
    HANDOFF: {
      entity: 'RecoveryHandoffGrant',
      operation: 'identity.handoff.deliver',
      active: 'ISSUED',
    },
    INVITATION_TOKEN: {
      entity: 'MembershipInvitation',
      operation: 'enterprise.invitation.deliver',
      active: 'PENDING',
    },
    PROVIDER_CHALLENGE: {
      entity: 'EnrollmentAuthority',
      operation: 'identity.enrollment.challenge',
      active: 'ACTIVE',
    },
    ENROLLMENT_HANDLE: {
      entity: 'EnrollmentAuthority',
      operation: 'identity.enrollment.handle',
      active: 'ACTIVE',
    },
    FIRST_FACTOR: {
      entity: 'EnrollmentAuthority',
      operation: 'identity.first-factor.replace',
      active: 'ACTIVE',
    },
  }[binding.purpose];
  requireCondition(
    mapping &&
      binding.targetRef.entity === mapping.entity &&
      permit.operation === mapping.operation &&
      canonicalJson(permit.authorityRef) === canonicalJson(binding.targetRef) &&
      permit.epoch === (await store.currentEpoch()),
    403,
    'VAULT_CURRENT_PERMIT',
    '등록된 현재 목적 허가가 필요합니다.',
  );
  const target = await store.currentProtected(mapping.entity, binding.targetRef.id);
  requireCondition(
    target &&
      (action === 'DESTROY'
        ? Number(target.revision) >= binding.sourceRevision
        : target.revision === binding.sourceRevision),
    403,
    'VAULT_CURRENT_PERMIT',
    '현재 원래 허가 개정이 필요합니다.',
  );
  requireCondition(
    action === 'DESTROY' || target.epoch === permit.epoch,
    403,
    'VAULT_EPOCH_FENCED',
    '복원 전 목적 자료는 현재 epoch 허가로 다시 읽거나 발급하지 않습니다.',
  );
  if (binding.purpose !== 'INVITATION_TOKEN')
    requireCondition(
      canonicalJson(target.accountRef) === canonicalJson(binding.accountRef) &&
        target.audience === binding.audience &&
        target.bindingGeneration === binding.bindingGeneration &&
        Date.parse(binding.expiresAt) <= Date.parse(String(target.expiresAt)),
      403,
      'VAULT_CURRENT_BINDING',
      '현재 계정/연결/목적 수명이 필요합니다.',
    );
  else
    requireCondition(
      binding.audience === 'CUSTOMER' &&
        binding.accountRef === null &&
        binding.bindingGeneration === null &&
        Date.parse(binding.expiresAt) <= Date.parse(String(target.expiresAt)),
      403,
      'VAULT_CURRENT_BINDING',
      '원래 초대 전달 결합이 필요합니다.',
    );
  const rows = await store.primary.query(
    'SELECT "tombstoneId" AS id FROM u1_security_tombstone WHERE "targetRef"->>\'id\'=$1 AND "targetRef"->>\'entity\'=$2 ORDER BY "tombstoneId" LIMIT 101',
    [binding.targetRef.id, binding.targetRef.entity],
  );
  requireCondition(
    rows.length <= 100,
    503,
    'VAULT_TOMBSTONE_LIMIT',
    '유한 파기 대조가 필요합니다.',
  );
  for (const row of rows) await store.currentProtected('SecurityTombstone', row.id);
  const protectedRows = await store.list('SecurityTombstone', {
    equals: { targetRef: { id: binding.targetRef.id, entity: binding.targetRef.entity } },
    limit: 100,
  });
  requireCondition(
    protectedRows.length === rows.length,
    503,
    'VAULT_TOMBSTONE_GAP',
    '현재 파기 marker의 보호가 미확인입니다.',
  );
  const matchingMarkers = protectedRows.filter(
    (row) =>
      (row.targetRef as Ref).revision === binding.sourceRevision && row.purpose === binding.purpose,
  );
  if (action === 'DESTROY')
    requireCondition(
      matchingMarkers.length > 0,
      403,
      'VAULT_TOMBSTONE',
      '보호된 원래 세대 파기 marker가 필요합니다.',
    );
  else
    requireCondition(
      (target.state === mapping.active ||
        (binding.purpose === 'ENROLLMENT_HANDLE' && target.state === 'HOLD')) &&
        matchingMarkers.length === 0,
      403,
      'VAULT_REVOKED',
      '소비/회수 자료는 전달할 수 없습니다.',
    );
}

export class U2Repository {
  constructor(readonly store: ProtectedStore) {}
  async current(ref: Ref): Promise<ModelData> {
    this.store.schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Ref', ref);
    const row = await this.store.currentProtected(ref.entity, ref.id);
    requireCondition(
      row && row.revision === ref.revision,
      409,
      'STALE_U2_AUTHORITY',
      '현재 원본 개정이 다릅니다.',
    );
    return row;
  }
  async mutate(
    request: WriteRequest,
    revalidate: (transaction: ProtectedTransaction) => Promise<void>,
    operation: (transaction: ProtectedTransaction, requestId: string) => Promise<void>,
  ): Promise<CommitResult> {
    // Only the canonical fingerprint is retained by idempotency; raw inputs
    // never become reconstruction rows or diagnostics.
    return this.store.execute(
      { ...request, input: { canonicalInputDigest: fingerprint(request.input) } },
      async (transaction, requestId) => {
        await revalidate(transaction);
        await operation(transaction, requestId);
        await revalidate(transaction);
        for (const row of transaction.rows()) validateU2RecoveryImage(row.model, row.data);
      },
    );
  }
  async assertCurrent(transaction: ProtectedTransaction, ref: Ref): Promise<ModelData> {
    const visible = await this.current(ref),
      raw = await transaction.get(ref.entity, ref.id);
    requireCondition(
      raw && canonicalJson(raw) === canonicalJson(visible),
      503,
      'CURRENT_U2_NOT_PROTECTED',
      '현재 원본의 보호를 확인해야 합니다.',
    );
    return raw;
  }
}
