import { requireCondition } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import type { ProtectedStore, ProtectedTransaction } from '@oms/persistence';
export async function minimumNoticeSource(
  store: ProtectedStore,
  transaction: ProtectedTransaction,
  target: Ref,
): Promise<{ recipient: Ref; text: string; loginPath: string; scope: unknown }> {
  const sources: Record<string, { accountField: string; text: string; loginPath: string }> = {
    'OrderAcceptance:Order': {
      accountField: 'requesterAccountRef',
      text: '주문 진행을 확인해 주세요.',
      loginPath: '/orders',
    },
    'EnterpriseAccess:EnterpriseApplication': {
      accountField: 'applicantAccountRef',
      text: '기업 이용 신청 결과를 확인해 주세요.',
      loginPath: '/enterprise-applications',
    },
    'EnterpriseAccess:EnterpriseMembership': {
      accountField: 'accountRef',
      text: '기업 관리 지정 결과를 확인해 주세요.',
      loginPath: '/enterprises',
    },
    'IdentityRecovery:MfaEnrollment': {
      accountField: 'accountRef',
      text: '인증 보안 상태를 확인해 주세요.',
      loginPath: '/identity',
    },
    'IdentityRecovery:RecoveryCodeSet': {
      accountField: 'accountRef',
      text: '인증 보안 상태를 확인해 주세요.',
      loginPath: '/identity',
    },
    'IdentityRecovery:ProviderBinding': {
      accountField: 'accountRef',
      text: '인증 보안 상태를 확인해 주세요.',
      loginPath: '/identity',
    },
    'IdentityRecovery:RecoveryCase': {
      accountField: 'accountRef',
      text: '인증 복구 결과를 확인해 주세요.',
      loginPath: '/identity',
    },
  };
  const purpose = sources[target.owner + ':' + target.entity];
  requireCondition(
    purpose,
    503,
    'NOTICE_SOURCE_NOT_REGISTERED',
    '최소 통지의 원래 업무 목적이 등록되지 않았습니다.',
  );
  const original = await store.readRevision(target.entity, target.id, target.revision);
  const currentSource = await transaction.get(target.entity, target.id);
  requireCondition(
    original && currentSource,
    503,
    'NOTICE_SOURCE_NOT_REGISTERED',
    '통지의 보호된 원래 개정과 현재 업무 관계를 확인해야 합니다.',
  );
  const recipient = original[purpose.accountField] as Ref;
  requireCondition(
    recipient?.owner === 'IdentityRecovery' && recipient.entity === 'Account',
    503,
    'NOTICE_RECIPIENT_SOURCE',
    '원래 신청/주체/주문 수신 관계를 확인해야 합니다.',
  );
  requireCondition(
    (currentSource[purpose.accountField] as Ref)?.id === recipient.id,
    403,
    'NOTICE_RELATIONSHIP_CHANGED',
    '원래 수신자 관계가 변경되어 대조가 필요합니다.',
  );
  const visible = await store.currentProtected('Account', recipient.id);
  const raw = await transaction.get('Account', recipient.id);
  requireCondition(
    visible?.active && raw?.active && raw.revision === visible.revision,
    403,
    'NOTICE_RECIPIENT_INACTIVE',
    '현재 허용된 수신자만 최소 통지를 생성할 수 있습니다.',
  );
  // No company/price/basis/credential contents or action grants are projected.
  return {
    recipient,
    text:
      target.entity === 'EnterpriseMembership' && original.administrator === false
        ? '기업 소속 상태를 확인해 주세요.'
        : purpose.text,
    loginPath: purpose.loginPath,
    scope: original.targetScope ?? null,
  };
}
