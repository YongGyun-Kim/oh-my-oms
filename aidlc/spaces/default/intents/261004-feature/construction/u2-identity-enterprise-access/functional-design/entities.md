# U2 신원·복구·기업 접근 엔티티

## 범위와 출처

IdentityRecovery와 EnterpriseAccess의 논리 원본을 확장한다. 기존 안정 ID/원본/이력은 보존하고 새 필드·명령·상태의 물리 매핑은 후속 설계에서 명시한다. 실행 코드·저장 구현이나 실제 운영 준비 완료를 뜻하지 않는다.

근거: [unit-of-work.md](../../../inception/units-generation/unit-of-work.md), [unit-of-work-story-map.md](../../../inception/units-generation/unit-of-work-story-map.md), [requirements.md](../../../inception/requirements-analysis/requirements.md), [components.md](../../../inception/domain-design/components.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md), [확인한 질문](functional-design-questions.md). U1 연결 개념은 [U1 기능 명세](../../u1-integrated-foundation/functional-design/functional-spec.md)의 안정 ID·문맥·CE01/CE02를 보존한다.

## 엔티티 원본 — YAML

```yaml
schema_version: 1
unit: u2-identity-enterprise-access
logical_types:
  Identifier: "안정된 원본 식별자; 물리 형식은 NFR/구현에서 대조"
  Reference: "소유자/엔티티/ID/필요 개정에 연결된 원본 참조"
  Evidence: "출처·대상·목적·권위·관측/유효 시각·개정·확인 상태를 구분한 증거 참조; 비밀 원문 제외"
  RegisteredContact: "등록·검증된 연락 경로; 조회 권한에 따라 최소 투영"
  Operation: "원래 요청/작업/대상·제공자·효과·기한을 유지하는 실행 참조"
  Instant: "시각 비교 가능한 절대 시점; 업무 표시 시각과 구분"
entities:
- name: Account
  owner: IdentityRecovery
  description: "안정된 OMS 계정. 인증 제공자의 subject와 업무 권한을 구별한다."
  attributes:
  - {name: "accountId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "audience", type: "Enumeration", required: true, unique: false, allowed_values: ["CUSTOMER","STAFF"]}
  - {name: "authenticationState", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","DISABLED","RECOVERY_RESTRICTED"]}
  - {name: "mfaState", type: "Enumeration", required: true, unique: false, allowed_values: ["REQUIRED","ENROLMENT_PENDING","VERIFIED","RESET_PENDING"]}
  - {name: "registeredContactRefs", type: "List<Reference>", required: true, unique: false, references: "RegisteredContact", min_items: 0}
  - {name: "verifiedPersonRef", type: "Reference", required: false, unique: false, default: null, references: "VerifiedPersonLink"}
  - {name: "securityGeneration", type: "Integer", required: true, unique: false, min: 1}
  constraints:
  - "U1 Account.accountId를 보존한다. 여기서 Account의 논리 ID 표기는 accountId와 같은 안정 ID다."
  - "이메일·인증 제공자 그룹·화면 폭은 사람·기업 관계·MFA·업무 권한 근거가 아니다."
- name: ProviderBinding
  owner: IdentityRecovery
  description: "계정과 외부 신원의 검증된 연결 및 세대"
  attributes:
  - {name: "providerBindingId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "accountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "providerIssuer", type: "Text", required: true, unique: false, min_length: 1}
  - {name: "subject", type: "Text", required: true, unique: false, min_length: 1}
  - {name: "audience", type: "Enumeration", required: true, unique: false, allowed_values: ["CUSTOMER","STAFF"]}
  - {name: "generation", type: "Integer", required: true, unique: false, min: 1}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","QUARANTINED","REVOKED"]}
  - {name: "verificationEvidenceRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 1}
  constraints:
  - "활성 issuer/subject/audience 연결은 한 계정에만 연결한다."
  - "계정·audience별 활성 연결은 하나다. 변경은 확인된 전환 근거로만 한다."
  - "외부 token/credential 원문을 속성으로 복제하지 않는다."
- name: VerifiedPersonLink
  owner: IdentityRecovery
  description: "확인된 동일인의 계정 연결 근거"
  attributes:
  - {name: "verifiedPersonLinkId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "accountRefs", type: "List<Reference>", required: true, unique: false, references: "Account", min_items: 1}
  - {name: "verificationEvidenceRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 0}
  - {name: "verificationState", type: "Enumeration", required: true, unique: false, allowed_values: ["CONFIRMED","UNCONFIRMED","CONFLICT","REVOKED"]}
  - {name: "verifiedBy", type: "AuthorityReference", required: false, unique: false, default: null}
  - {name: "verifiedAt", type: "Instant", required: false, unique: false, default: null}
  - {name: "verificationPolicyRevision", type: "PolicyReference", required: false, unique: false, default: null}
  constraints:
  - "계정별 유효한 확인 연결은 하나다. 같은 사람의 여러 계정은 같은 유효 연결을 참조한다."
  - "이메일/표시명 일치나 서로 다른 accountId만으로 동일인/다른 사람을 확인하지 않는다."
  - "CONFIRMED/VERIFIED/APPLIED 전이는 실제 정책·확인 주체·필요 근거·현재성의 필수 값이 모두 확인될 때만 허용한다. 미확인은 빈 근거/null과 해당 미확인 상태로 보존한다."
- name: MfaEnrollment
  owner: IdentityRecovery
  description: "수단 등록의 실제 검증과 무효화"
  attributes:
  - {name: "mfaEnrollmentId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "accountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "bindingRef", type: "Reference", required: true, unique: false, references: "ProviderBinding"}
  - {name: "bindingGeneration", type: "Integer", required: true, unique: false, min: 1}
  - {name: "methodRef", type: "ProtectedMethodReference", required: true, unique: false}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["PENDING","VERIFIED","INVALIDATION_PENDING","INVALIDATED","UNKNOWN"]}
  - {name: "verificationEvidenceRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 0}
  - {name: "invalidatedAt", type: "Instant", required: false, unique: false, default: null}
  constraints:
  - "수단 비밀/응답 원문을 일반 업무 속성·이력에 저장하지 않는다."
  - "UNKNOWN 또는 미완료 등록은 업무 MFA 근거가 아니다."
- name: RecoveryCodeSet
  owner: IdentityRecovery
  description: "사전 복구 코드 발급 집합의 세대와 보관 확인"
  attributes:
  - {name: "recoveryCodeSetId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "accountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "bindingRef", type: "Reference", required: true, unique: false, references: "ProviderBinding"}
  - {name: "generation", type: "Integer", required: true, unique: false, min: 1}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["UNACKNOWLEDGED","ACTIVE","REVOKED"]}
  - {name: "storageAcknowledgedAt", type: "Instant", required: false, unique: false, default: null}
  - {name: "issuedAt", type: "Instant", required: true, unique: false}
  - {name: "revokedAt", type: "Instant", required: false, unique: false, default: null}
  constraints:
  - "정기 만료 없이 유지한다. 재발급/계정·인증 연결 무효화 시 이전 집합을 거절한다."
  - "원문은 발급 순간의 제한된 표시 이외 재조회·로그·메일에 넣지 않는다."
- name: RecoveryCode
  owner: IdentityRecovery
  description: "집합 내 코드의 보호된 검증 자료와 원자 사용 상태"
  attributes:
  - {name: "recoveryCodeId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "codeSetRef", type: "Reference", required: true, unique: false, references: "RecoveryCodeSet"}
  - {name: "protectedVerifierRef", type: "ProtectedVerifierReference", required: true, unique: false}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["UNUSED","CONSUMED","REVOKED"]}
  - {name: "consumedByRecoveryRef", type: "Reference", required: false, unique: false, default: null, references: "RecoveryCase"}
  - {name: "consumedAt", type: "Instant", required: false, unique: false, default: null}
  constraints:
  - "동일 코드는 한 RecoveryCase의 재등록 허가에 한 번만 소비한다."
  - "비가역 검증 자료와 비밀 보호 방식·유한 시도 한도는 NFR 설계/검증에서 고정한다."
- name: IdentitySession
  owner: IdentityRecovery
  description: "업무 또는 단일 제한 목적의 서버 신원 상태"
  attributes:
  - {name: "identitySessionId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "accountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "bindingRef", type: "Reference", required: true, unique: false, references: "ProviderBinding"}
  - {name: "securityGeneration", type: "Integer", required: true, unique: false, min: 1}
  - {name: "purpose", type: "Enumeration", required: true, unique: false, allowed_values: ["BUSINESS","MFA_ENROLMENT","RECOVERY_VERIFICATION","INVITATION_ACCEPTANCE"]}
  - {name: "mfaEvidenceRef", type: "EvidenceReference", required: false, unique: false, default: null}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","RESTRICTED","REVOKED","EXPIRED"]}
  - {name: "issuedAt", type: "Instant", required: true, unique: false}
  - {name: "expiresAt", type: "Instant", required: true, unique: false}
  - {name: "lastUserActivityAt", type: "Instant", required: true, unique: false}
  constraints:
  - "INVITATION_ACCEPTANCE는 이 설계의 목적 확장이며 기존 닫힌 LimitedIdentityContext에 자동 수용하지 않는다."
  - "현재 보안 세대·목적·MFA·만료·직원 접점을 대조한다. 제한 상태에 BUSINESS 목적을 겸하지 않는다."
  - "BUSINESS/INVITATION_ACCEPTANCE는 실제 MFA 근거가 필수다. 초기 등록/복구 검증 목적은 아직 없는 MFA 근거를 null로 두고 업무 접근을 거절한다."
- name: RecoveryCase
  owner: IdentityRecovery
  description: "원래 계정·인증 연결에 고정된 재등록 작업"
  attributes:
  - {name: "recoveryCaseId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "accountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "originalBindingRef", type: "Reference", required: true, unique: false, references: "ProviderBinding"}
  - {name: "originalSecurityGeneration", type: "Integer", required: true, unique: false, min: 1}
  - {name: "method", type: "Enumeration", required: true, unique: false, allowed_values: ["SAVED_CODE","STAFF_VERIFICATION","EMERGENCY"]}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["REQUESTED","VERIFICATION_PENDING","ENROLMENT_ONLY","EXTERNAL_PENDING","COMPLETED","HOLD","REJECTED","CANCELLED"]}
  - {name: "verificationRef", type: "Reference", required: false, unique: false, default: null, references: "RecoveryVerification"}
  - {name: "previousEnrollmentRef", type: "Reference", required: false, unique: false, default: null, references: "MfaEnrollment"}
  - {name: "newEnrollmentRef", type: "Reference", required: false, unique: false, default: null, references: "MfaEnrollment"}
  - {name: "originalProviderOperationRefs", type: "List<Reference>", required: true, unique: false, references: "Operation", min_items: 0}
  - {name: "requestRef", type: "RequestReference", required: true, unique: false}
  - {name: "deadlineAt", type: "Instant", required: true, unique: false}
  - {name: "noticeRef", type: "NoticeReference", required: false, unique: false, default: null}
  - {name: "actualResultRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 0}
  constraints:
  - "계정·원래 활성 연결 세대별 미종결 실행은 하나다. 재시도는 원래 요청/작업/기한을 이어간다."
  - "계정/연결 세대·새 수단 검증·옛 무효화가 확인되지 않으면 완료하지 않는다."
- name: RecoveryVerification
  owner: IdentityRecovery
  description: "복구 목적의 본인 확인 결정과 출처"
  attributes:
  - {name: "recoveryVerificationId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "recoveryCaseRef", type: "Reference", required: true, unique: false, references: "RecoveryCase"}
  - {name: "targetAccountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "operatorAuthorityRef", type: "AuthorityReference", required: false, unique: false, default: null}
  - {name: "verificationPolicyRevision", type: "PolicyReference", required: false, unique: false, default: null}
  - {name: "evidenceRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 0}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["CONFIRMED","UNCONFIRMED","CONFLICT","REJECTED"]}
  - {name: "verifiedAt", type: "Instant", required: false, unique: false, default: null}
  - {name: "reason", type: "Text", required: true, unique: false, min_length: 1}
  constraints:
  - "근거는 대상·인증 연결·목적·확인 주체·현재성에 연결돼야 한다. 근거 Ref가 있다는 사실만으로 CONFIRMED가 되지 않는다."
  - "실제 정책에서 인정한 출처/항목/권위를 확인하지 못하면 UNCONFIRMED다."
  - "CONFIRMED/VERIFIED/APPLIED 전이는 실제 정책·확인 주체·필요 근거·현재성의 필수 값이 모두 확인될 때만 허용한다. 미확인은 빈 근거/null과 해당 미확인 상태로 보존한다."
- name: EmergencyRecoveryCase
  owner: IdentityRecovery
  description: "OMS 접속 불가 담당자의 비공개 운영 복원 원본"
  attributes:
  - {name: "emergencyRecoveryCaseId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "targetAccountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "recoveryCaseRef", type: "Reference", required: true, unique: false, references: "RecoveryCase"}
  - {name: "operatorAuthorityRef", type: "AuthorityReference", required: false, unique: false, default: null}
  - {name: "verificationPolicyRevision", type: "PolicyReference", required: false, unique: false, default: null}
  - {name: "evidenceRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 0}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["OPEN","VERIFIED","EXTERNAL_PENDING","ENROLMENT_ONLY","COMPLETED","HOLD","CANCELLED"]}
  - {name: "reason", type: "Text", required: true, unique: false, min_length: 1}
  - {name: "requestRef", type: "RequestReference", required: true, unique: false}
  - {name: "deadlineAt", type: "Instant", required: true, unique: false}
  constraints:
  - "일반 고객 호출/역할의 EMERGENCY 문자열로 운영 권위를 생성하지 않는다."
  - "기존 계정과 허용된 권한을 복원하며 새 업무 권한을 자동 생성하지 않는다. 실제 운영 권위 미확인은 HOLD다."
  - "CONFIRMED/VERIFIED/APPLIED 전이는 실제 정책·확인 주체·필요 근거·현재성의 필수 값이 모두 확인될 때만 허용한다. 미확인은 빈 근거/null과 해당 미확인 상태로 보존한다."
- name: IdentityHistory
  owner: IdentityRecovery
  description: "신원·수단·복구·연결의 변경/실제 결과 이력"
  attributes:
  - {name: "identityHistoryId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "targetAccountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "actorAuthorityRef", type: "AuthorityReference", required: true, unique: false}
  - {name: "occurredAt", type: "Instant", required: true, unique: false}
  - {name: "reason", type: "Text", required: true, unique: false, min_length: 1}
  - {name: "beforeRef", type: "SnapshotReference", required: false, unique: false, default: null}
  - {name: "afterRef", type: "SnapshotReference", required: false, unique: false, default: null}
  - {name: "evidenceRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 0}
  - {name: "requestRef", type: "RequestReference", required: true, unique: false}
  - {name: "resultRef", type: "ResultReference", required: true, unique: false}
  - {name: "correctionOf", type: "Reference", required: false, unique: false, default: null, references: "IdentityHistory"}
  - {name: "sourceRevision", type: "Integer", required: true, unique: false, min: 1}
  constraints:
  - "append-only 원본 이력. 정정은 이전 기록을 지우지 않고 새 참조로 남긴다."
  - "코드/수단 비밀·provider token·비밀번호 원문을 기록하지 않는다."
- name: EnterpriseApplication
  owner: EnterpriseAccess
  description: "U1의 기업 신청·검증·승인 연결을 보존한다."
  attributes:
  - {name: "enterpriseApplicationId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "applicantAccountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "enterpriseDetailsRef", type: "EvidenceReference", required: true, unique: false}
  - {name: "verificationEvidenceRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 0}
  - {name: "staffDecisionRef", type: "DecisionReference", required: false, unique: false, default: null}
  - {name: "initialAdministratorRef", type: "Reference", required: false, unique: false, default: null, references: "EnterpriseMembership"}
  - {name: "result", type: "Enumeration", required: true, unique: false, allowed_values: ["PENDING","APPROVED","DECLINED","UNCONFIRMED"]}
  constraints:
  - "신원 등록/초대 수락만으로 기업 승인이나 최초 관리자 지정 결과를 바꾸지 않는다."
- name: Enterprise
  owner: EnterpriseAccess
  description: "기업 이용 상태와 주문 조직 문맥 정책"
  attributes:
  - {name: "enterpriseId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "applicationRef", type: "Reference", required: true, unique: false, references: "EnterpriseApplication"}
  - {name: "approvalRef", type: "DecisionReference", required: true, unique: false}
  - {name: "usageState", type: "Enumeration", required: true, unique: false, allowed_values: ["APPROVED","SUSPENDED"]}
  - {name: "departmentUsage", type: "Enumeration", required: true, unique: false, allowed_values: ["USED","NOT_USED","UNSET"]}
  - {name: "siteUsage", type: "Enumeration", required: true, unique: false, allowed_values: ["USED","NOT_USED","UNSET"]}
  - {name: "designatedNoticeContactRefs", type: "List<Reference>", required: true, unique: false, references: "RegisteredContact", min_items: 0}
  constraints:
  - "Enterprise의 revision은 조직/주문 문맥 정책 개정을 대표하며 원래 주문의 스냅샷을 덮어쓰지 않는다."
  - "UNSET은 신규 주문 허용값이 아니다. NOT_USED는 명시적으로 미사용한 축이다."
- name: Department
  owner: EnterpriseAccess
  description: "기업의 부서와 보존되는 과거 식별자"
  attributes:
  - {name: "departmentId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "enterpriseRef", type: "Reference", required: true, unique: false, references: "Enterprise"}
  - {name: "label", type: "Text", required: true, unique: false, min_length: 1}
  - {name: "activeState", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","INACTIVE"]}
  constraints:
  - "폐지는 비활성화로 기록하며 과거 주문/권한 문맥의 식별자는 보존한다."
- name: BusinessSite
  owner: EnterpriseAccess
  description: "기업의 사업장과 보존되는 과거 식별자"
  attributes:
  - {name: "businessSiteId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "enterpriseRef", type: "Reference", required: true, unique: false, references: "Enterprise"}
  - {name: "label", type: "Text", required: true, unique: false, min_length: 1}
  - {name: "activeState", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","INACTIVE"]}
  constraints:
  - "다른 기업의 조직 참조를 수용하지 않는다."
- name: EnterpriseMembership
  owner: EnterpriseAccess
  description: "계정의 한 기업 소속과 관리자 지정 표지"
  attributes:
  - {name: "enterpriseMembershipId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "accountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "enterpriseRef", type: "Reference", required: true, unique: false, references: "Enterprise"}
  - {name: "departmentRef", type: "Reference", required: false, unique: false, default: null, references: "Department"}
  - {name: "siteRef", type: "Reference", required: false, unique: false, default: null, references: "BusinessSite"}
  - {name: "activeState", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","INACTIVE"]}
  - {name: "administratorState", type: "Enumeration", required: true, unique: false, allowed_values: ["DESIGNATED","NONE"]}
  - {name: "authorisationRevision", type: "Integer", required: true, unique: false, min: 1}
  constraints:
  - "accountRef/enterpriseRef 조합의 소속 원본은 하나다."
  - "관리자 표지는 업무 접근의 단독 근거가 아니다. 행위별 명시 grant가 필요하다."
  - "소속 변경은 다른 기업의 소속이나 원래 주문의 조직을 변경하지 않는다."
- name: MembershipInvitation
  owner: EnterpriseAccess
  description: "기업·연락 경로·예정 소속/역할에 고정된 초대"
  attributes:
  - {name: "membershipInvitationId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "enterpriseRef", type: "Reference", required: true, unique: false, references: "Enterprise"}
  - {name: "inviterMembershipRef", type: "Reference", required: true, unique: false, references: "EnterpriseMembership"}
  - {name: "contactAddressRef", type: "RegisteredContactReference", required: true, unique: false}
  - {name: "departmentRef", type: "Reference", required: false, unique: false, default: null, references: "Department"}
  - {name: "siteRef", type: "Reference", required: false, unique: false, default: null, references: "BusinessSite"}
  - {name: "proposedRoleRevisions", type: "List<RoleRevisionReference>", required: true, unique: false, references: "CustomerRole", min_items: 0}
  - {name: "expectedMembershipRevision", type: "Integer", required: false, unique: false, default: null, min: 1}
  - {name: "orderingContextPolicyRevision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["PENDING","ACCEPTED","REVOKED","EXPIRED","RECONFIRMATION_REQUIRED"]}
  - {name: "protectedTokenVerifierRef", type: "ProtectedVerifierReference", required: true, unique: false}
  - {name: "expiresAt", type: "Instant", required: true, unique: false}
  - {name: "requestRef", type: "RequestReference", required: true, unique: false}
  - {name: "acceptedByAccountRef", type: "Reference", required: false, unique: false, default: null, references: "Account"}
  - {name: "acceptedMembershipRef", type: "Reference", required: false, unique: false, default: null, references: "EnterpriseMembership"}
  constraints:
  - "수락/회수는 한 원본에 원자적으로 경쟁한다. 수락된 초대는 재사용해 권한을 되살리지 않는다."
  - "초대에는 관리자 지정/업무 승인 효력을 자동 포함하지 않는다. 신규 담당자의 관리자 지정은 별도 관리 동작이다."
  - "실제 연락처·토큰 원문 노출·수명/재발송 설정은 NFR·통지 경계에서 검증한다."
- name: CustomerRole
  owner: EnterpriseAccess
  description: "기업별 고객 행위와 완성된 scope의 역할 개정"
  attributes:
  - {name: "customerRoleId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "enterpriseRef", type: "Reference", required: true, unique: false, references: "Enterprise"}
  - {name: "label", type: "Text", required: true, unique: false, min_length: 1}
  - {name: "actionScopeRefs", type: "List<Reference>", required: true, unique: false, references: "ActionScope", min_items: 0}
  - {name: "activeState", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","INACTIVE"]}
  constraints:
  - "구성 변경은 새 개정/이력이며 유효 grant의 현재 역할 판정과 대상의 권한 개정을 갱신한다."
  - "빈 actionScopeRefs는 허용 행위 없음이다."
- name: ActionScope
  owner: EnterpriseAccess
  description: "한 행위의 한 완성된 범위 술어"
  attributes:
  - {name: "actionScopeId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "enterpriseRef", type: "Reference", required: true, unique: false, references: "Enterprise"}
  - {name: "actionRef", type: "Enumeration", required: true, unique: false, allowed_values: ["product.read","order.read","order.submit","payment.read","entitlement.read","renewal.request","autoRenewal.request","autoRenewal.cancel","order.change.request","order.cancel.request","order.return.request","organisation.manage","user.manage","role.manage","contract.change.request"]}
  - {name: "kind", type: "Enumeration", required: true, unique: false, allowed_values: ["DEPARTMENT_SITE","SITE_ALL_DEPARTMENTS","DEPARTMENT_ALL_SITES","ENTERPRISE_ALL"]}
  - {name: "departmentSelector", type: "AxisSelector", required: true, unique: false, references: "Department", allowed_values: ["EXACT","NOT_USED","ALL"]}
  - {name: "siteSelector", type: "AxisSelector", required: true, unique: false, references: "BusinessSite", allowed_values: ["EXACT","NOT_USED","ALL"]}
  - {name: "departmentRefs", type: "List<Reference>", required: true, unique: false, references: "Department", min_items: 0}
  - {name: "siteRefs", type: "List<Reference>", required: true, unique: false, references: "BusinessSite", min_items: 0}
  constraints:
  - "DEPARTMENT_SITE는 부서 하나/사업장 하나의 완성된 쌍이다. 미사용 축은 명시 NOT_USED 문맥으로 표현하며 누락/빈 배열 wildcard와 구별한다."
  - "SITE_ALL_DEPARTMENTS는 사업장 하나에만, DEPARTMENT_ALL_SITES는 부서 하나에만 한정한다. ENTERPRISE_ALL만 두 축 전체를 명시한다."
  - "여러 쌍은 별도 scope 행으로 표현하며 부서 집합/사업장 집합의 암묵적 곱집합을 만들지 않는다. 실제 nullable 축 계약 확장은 CE-U2-04로 닫힌 의미를 정의한다."
  - "selector가 원본 의미다. EXACT은 한 원본 ref 필수, NOT_USED/ALL은 ref 금지다. departmentRefs/siteRefs는 기존 계약의 호환 파생 표현이며 등록된 손실 없는 변환 외에 범위를 결정하지 않는다."
- name: CustomerRoleGrant
  owner: EnterpriseAccess
  description: "소속에 부여한 역할의 현재 효력과 회수 이력"
  attributes:
  - {name: "customerRoleGrantId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "membershipRef", type: "Reference", required: true, unique: false, references: "EnterpriseMembership"}
  - {name: "roleRef", type: "Reference", required: true, unique: false, references: "CustomerRole"}
  - {name: "grantedBy", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","REVOKED"]}
  - {name: "effectiveRef", type: "DecisionReference", required: true, unique: false}
  - {name: "revocationRef", type: "DecisionReference", required: false, unique: false, default: null}
  constraints:
  - "소속·역할·scope의 기업은 같아야 한다. 동일 활성 membership/role grant의 중복 효과는 없다."
  - "부여한 역할의 현재 유효 개정을 사용하며 변경 전 판정 결과는 이력으로 보존한다."
- name: StaffRole
  owner: EnterpriseAccess
  description: "허용된 직원 행위 목록의 역할 개정"
  attributes:
  - {name: "staffRoleId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "label", type: "Text", required: true, unique: false, min_length: 1}
  - {name: "actionRefs", type: "List<ActionIdentifier>", required: true, unique: false, min_items: 1}
  - {name: "activeState", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","INACTIVE"]}
  constraints:
  - "서버의 등록된 직원 행위 목록만 허용한다. 미등록 문자열이나 SYSTEM 전용 행위는 역할 권한이 아니다."
- name: StaffRoleGrant
  owner: EnterpriseAccess
  description: "직원 계정에 부여한 역할의 효력"
  attributes:
  - {name: "staffRoleGrantId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "accountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "roleRef", type: "Reference", required: true, unique: false, references: "StaffRole"}
  - {name: "grantedBy", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["ACTIVE","REVOKED"]}
  - {name: "effectiveRef", type: "DecisionReference", required: true, unique: false}
  - {name: "revocationRef", type: "DecisionReference", required: false, unique: false, default: null}
  constraints:
  - "STAFF 계정에만 부여한다. 부여로 신원/직원 접점/MFA 조건을 대신하지 않는다."
- name: AdministratorRestoration
  owner: EnterpriseAccess
  description: "관리자 부재 기업의 확인된 재지정 결정"
  attributes:
  - {name: "administratorRestorationId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "enterpriseRef", type: "Reference", required: true, unique: false, references: "Enterprise"}
  - {name: "designeeAccountRef", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "decidedBy", type: "Reference", required: true, unique: false, references: "Account"}
  - {name: "verificationEvidenceRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 0}
  - {name: "verificationPolicyRevision", type: "PolicyReference", required: false, unique: false, default: null}
  - {name: "state", type: "Enumeration", required: true, unique: false, allowed_values: ["REQUESTED","VERIFIED","APPLIED","HOLD","REJECTED"]}
  - {name: "managementGrantRefs", type: "List<Reference>", required: true, unique: false, references: "CustomerRoleGrant", min_items: 0}
  - {name: "requestRef", type: "RequestReference", required: true, unique: false}
  constraints:
  - "기업의 관리 위임·대상 신원이 확인되기 전 지정/관리 grant를 적용하지 않는다."
  - "명시적인 관리 역할만 복원하며 주문/대금/발급 권한은 별도 부여다."
  - "CONFIRMED/VERIFIED/APPLIED 전이는 실제 정책·확인 주체·필요 근거·현재성의 필수 값이 모두 확인될 때만 허용한다. 미확인은 빈 근거/null과 해당 미확인 상태로 보존한다."
- name: AccessHistory
  owner: EnterpriseAccess
  description: "소속·역할·범위·관리자 지정과 접근 변경의 원본 이력"
  attributes:
  - {name: "accessHistoryId", type: "Identifier", required: true, unique: true, min_length: 1}
  - {name: "revision", type: "Integer", required: true, unique: false, min: 1}
  - {name: "actorAccountId", type: "Identifier", required: true, unique: false}
  - {name: "verifiedPersonRef", type: "Reference", required: false, unique: false, default: null, references: "VerifiedPersonLink"}
  - {name: "occurredAt", type: "Instant", required: true, unique: false}
  - {name: "reason", type: "Text", required: true, unique: false, min_length: 1}
  - {name: "beforeRef", type: "SnapshotReference", required: false, unique: false, default: null}
  - {name: "afterRef", type: "SnapshotReference", required: false, unique: false, default: null}
  - {name: "evidenceRefs", type: "List<Reference>", required: true, unique: false, references: "Evidence", min_items: 0}
  - {name: "requestRef", type: "RequestReference", required: true, unique: false}
  - {name: "resultRef", type: "ResultReference", required: true, unique: false}
  - {name: "correctionOf", type: "Reference", required: false, unique: false, default: null, references: "AccessHistory"}
  - {name: "sourceRevision", type: "Integer", required: true, unique: false, min: 1}
  constraints:
  - "append-only 이력과 안전한 거절 사유를 보존한다. 조회 권한이 없는 타 기업/민감 증거를 노출하지 않는다."
relationships:
- {from: "Account", to: "ProviderBinding", cardinality: "1 -> 0..*", direction: "from -> to", label: "외부 연결 이력; 계정/audience별 활성 연결 하나"}
- {from: "VerifiedPersonLink", to: "Account", cardinality: "0..1 -> 1..*", direction: "from -> to", label: "동일인 연결; 계정별 유효 확인 연결 최대 하나"}
- {from: "Account", to: "MfaEnrollment", cardinality: "1 -> 0..*", direction: "from -> to", label: "수단 세대와 이력"}
- {from: "Account", to: "IdentitySession", cardinality: "1 -> 0..*", direction: "from -> to", label: "업무 또는 제한 목적 상태"}
- {from: "Account", to: "RecoveryCodeSet", cardinality: "1 -> 0..*", direction: "from -> to", label: "발급 집합 세대"}
- {from: "RecoveryCodeSet", to: "RecoveryCode", cardinality: "1 -> 1..*", direction: "from -> to", label: "단회 소비"}
- {from: "Account", to: "RecoveryCase", cardinality: "1 -> 0..*", direction: "from -> to", label: "세대별 미종결 실행 최대 하나"}
- {from: "RecoveryCase", to: "RecoveryVerification", cardinality: "1 -> 0..*", direction: "from -> to", label: "확인 결정 개정"}
- {from: "RecoveryCase", to: "EmergencyRecoveryCase", cardinality: "1 -> 0..1", direction: "from -> to", label: "비공개 비상 경로"}
- {from: "Account", to: "IdentityHistory", cardinality: "1 -> 0..*", direction: "from -> to", label: "신원 변경 이력"}
- {from: "EnterpriseApplication", to: "Enterprise", cardinality: "1 -> 0..1", direction: "from -> to", label: "승인 기업"}
- {from: "Enterprise", to: "Department", cardinality: "1 -> 0..*", direction: "from -> to", label: "부서"}
- {from: "Enterprise", to: "BusinessSite", cardinality: "1 -> 0..*", direction: "from -> to", label: "사업장"}
- {from: "Account", to: "EnterpriseMembership", cardinality: "1 -> 0..*", direction: "from -> to", label: "기업별 소속"}
- {from: "Enterprise", to: "EnterpriseMembership", cardinality: "1 -> 0..*", direction: "from -> to", label: "소속 구성원"}
- {from: "Enterprise", to: "MembershipInvitation", cardinality: "1 -> 0..*", direction: "from -> to", label: "초대 원본"}
- {from: "MembershipInvitation", to: "EnterpriseMembership", cardinality: "1 -> 0..1", direction: "from -> to", label: "수락 결과"}
- {from: "Enterprise", to: "CustomerRole", cardinality: "1 -> 0..*", direction: "from -> to", label: "기업 역할"}
- {from: "CustomerRole", to: "ActionScope", cardinality: "1 -> 0..*", direction: "from -> to", label: "완성된 범위"}
- {from: "EnterpriseMembership", to: "CustomerRoleGrant", cardinality: "1 -> 0..*", direction: "from -> to", label: "현재 역할 부여"}
- {from: "CustomerRole", to: "CustomerRoleGrant", cardinality: "1 -> 0..*", direction: "from -> to", label: "부여 이력"}
- {from: "StaffRole", to: "StaffRoleGrant", cardinality: "1 -> 0..*", direction: "from -> to", label: "직원 부여 이력"}
- {from: "Account", to: "StaffRoleGrant", cardinality: "1 -> 0..*", direction: "from -> to", label: "직원 역할"}
- {from: "Enterprise", to: "AdministratorRestoration", cardinality: "1 -> 0..*", direction: "from -> to", label: "관리자 복원"}
- {from: "AdministratorRestoration", to: "CustomerRoleGrant", cardinality: "1 -> 0..*", direction: "from -> to", label: "명시적 관리 부여"}
```

## 관계와 변경 경계

- **Account**: 안정된 OMS 계정. 인증 제공자의 subject와 업무 권한을 구별한다.
- **ProviderBinding**: 계정과 외부 신원의 검증된 연결 및 세대
- **VerifiedPersonLink**: 확인된 동일인의 계정 연결 근거
- **MfaEnrollment**: 수단 등록의 실제 검증과 무효화
- **RecoveryCodeSet**: 사전 복구 코드 발급 집합의 세대와 보관 확인
- **RecoveryCode**: 집합 내 코드의 보호된 검증 자료와 원자 사용 상태
- **IdentitySession**: 업무 또는 단일 제한 목적의 서버 신원 상태
- **RecoveryCase**: 원래 계정·인증 연결에 고정된 재등록 작업
- **RecoveryVerification**: 복구 목적의 본인 확인 결정과 출처
- **EmergencyRecoveryCase**: OMS 접속 불가 담당자의 비공개 운영 복원 원본
- **IdentityHistory**: 신원·수단·복구·연결의 변경/실제 결과 이력
- **EnterpriseApplication**: U1의 기업 신청·검증·승인 연결을 보존한다.
- **Enterprise**: 기업 이용 상태와 주문 조직 문맥 정책
- **Department**: 기업의 부서와 보존되는 과거 식별자
- **BusinessSite**: 기업의 사업장과 보존되는 과거 식별자
- **EnterpriseMembership**: 계정의 한 기업 소속과 관리자 지정 표지
- **MembershipInvitation**: 기업·연락 경로·예정 소속/역할에 고정된 초대
- **CustomerRole**: 기업별 고객 행위와 완성된 scope의 역할 개정
- **ActionScope**: 한 행위의 한 완성된 범위 술어
- **CustomerRoleGrant**: 소속에 부여한 역할의 현재 효력과 회수 이력
- **StaffRole**: 허용된 직원 행위 목록의 역할 개정
- **StaffRoleGrant**: 직원 계정에 부여한 역할의 효력
- **AdministratorRestoration**: 관리자 부재 기업의 확인된 재지정 결정
- **AccessHistory**: 소속·역할·범위·관리자 지정과 접근 변경의 원본 이력

위 YAML이 엔티티/관계의 원본이다. functional-spec.md의 ER은 여기서 파생된다. Evidence/RegisteredContact/Operation 등은 논리 외부 참조 타입이며 새로운 거래 원본 테이블을 뜻하지 않는다. 선택 속성의 null은 명시적 부재다. UNCONFIRMED/UNKNOWN을 null이나 임의 Ref로 확인 완료처럼 바꾸지 않는다. 엔티티 ID의 일반 표기는 기존 Account.accountId·Enterprise.enterpriseId·BusinessSite.siteId 등의 안정 식별자에 매핑하며 새로운 ID로 원본을 갈아끼우지 않는다.

Invitation의 대상 소속이 없을 때 expectedMembershipRevision=null은 생성 의도이며 기존 소속의 재활성화는 원래 대상 개정과 명시적 관리 의도로 구별한다. ACTIVE 소속의 기존 조직/역할은 초대 수락으로 덮어쓰지 않는다. 원래 초대/소속 개정과 충돌하면 재확인을 요구한다.

관리자 지정 표지 수와 실제 관리 행위 가능 여부를 구별한다. 관리자가 지정되어 있어도 유효 관리 grant가 없으면 업무가 허용되지 않는다. 지정 관리자 0 및 실효 관리 권한 부재를 각각 경고·기록하며 다른 담당자의 권한이나 기업 이용 상태를 자동 변경하지 않는다.

