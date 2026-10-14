# U1 논리 엔티티 모델

## 범위와 읽는 방법

첫 통합 실행 기반의 논리 원본·값 객체·지속 작업 모델이다. 기술 독립적인 설계이며 물리 테이블/저장 제품/언어를 정하지 않는다. 30개 모델 중 거래 원본의 쓰기 권위는 기존 컴포넌트에 유지한다. U1Host는 접수·전달·대조를 소유하며 wire의 Receipt.owner를 호스트로 바꾸지 않는다. 신원/기업/상품/주문의 최초 구현은 U1에 있고 이후 U2/U3가 같은 원본을 확장한다. [S1–S5]

Ref의 owner/entity/id/revision은 원본 존재·기업·버전 확인의 입력이지 확인 사실 자체가 아니다. 논리 모델의 모든 종류를 C00.Ref.entity에 새 값으로 노출하는 것은 아니다. IdentityChallenge는 challengeId, IdentitySession은 보호된 세션 식별자, RequestReceipt는 requestId, WorkItem은 workId, FactEnvelope는 eventId로 해당 기존 계약에 매핑한다. ConsumerProcessingMark는 내부 기록이다. OwnerHistoryEntry는 실제 IdentityHistory/AccessHistory/CatalogHistory/OrderHistory 및 각 통지 이력으로 분리한다. [S4–S5]

NULL과 미확인은 다르다. TargetScope의 NULL은 당시 기업 정책이 명시한 조직 기준 미사용이다. 가격·계약/지급·기간·완료 기준이 미확인이면 해당 KnowledgeState와 누락 근거를 보존하며 NULL만으로 '적용 없음'이라 주장하지 않는다. 필수 wire 필드의 확인 값이 없는 기존 OrderView는 KNOWN으로 만들지 않고 functional-spec.md의 CE03 최소 검토 조회로 연결한다.

## Entity Model — Source of Truth

아래 YAML이 타입·속성·원본 연결의 기준이다. required는 논리 속성의 존재 여부이고 nullable은 값의 명시적 부재 허용 여부다. unique는 단일 식별자에 적용하며 복합 고유성은 constraints에서 선언한다. Enum·Ref·RefList의 허용 값/대상, 적용되는 최소값과 기본값은 해당 항목에 있다. 별도 최대값·기본값이 없는 항목은 임의 제품 제한을 뜻하지 않는다.

```yaml
version: '1.0'
unit: u1-integrated-foundation
scope: 논리 모델; 물리 테이블/언어/저장 서비스 선택 아님
types:
  Identifier:
    description: 빈 값 없는 안정 식별자; 내부 ID 형식·정규화는 후속 설계
    minimum_length: 1
  Revision:
    description: 소유자의 단조 증가 개정; 서로 다른 원본의 개정을 비교하지 않음
    logical_type: integer
    minimum: 1
  Instant:
    description: 순서/시점 판단 가능한 절대 시각; 한국어 화면은 한국 시각으로 표시
  LocalDate:
    description: 입력한 한국 기준 달력 날짜; 실제 기간/청구 기산은 해당 SW/대금 소유자 판단
  Ref:
    description: 원본 소유자·엔티티·안정 식별자·개정; 존재/기업/현재 유효성은 서버가 확인
  ExternalRef:
    description: 이 단위 밖의 원본 소유자 참조; Ref와 같은 논리 형식. 미등록을 실존 근거로 만들지 않음
  ProtectedReference:
    description: 비밀 자체가 아닌 제한된 참조; 세션 식별자·수단·제공자 correlation의 보호 방법은 NFR에서 확인
  EvidenceRefs:
    description: C00.Refs; 빈 목록은 필요한 증거 충족이 아니라 실제 근거 없음
    item_type: Ref
    minimum_items: 0
  DecisionBasis:
    description: 행위자/필요한 확인된 동일인·근거목록·대상개정·결정·시각·사유
  OrderingContextPolicy:
    description: Enterprise 안의 개정된 값 객체. contextPolicyRef는 EnterpriseAccess.Enterprise의 해당 개정을 가리킴
    fields:
      departmentUsage: UNSET | USED | NOT_USED
      siteUsage: UNSET | USED | NOT_USED
      setBy: Account Ref
      setAt: Instant
      reason: NonEmptyText
    defaults:
      departmentUsage: UNSET
      siteUsage: UNSET
    constraints:
    - 고객사의 organisation.manage 권한과 기업관리자 지정 상태를 확인해 명시적으로 설정
    - 개별 조직 개정/정책 변경 시 조직 평가 개정도 변경
    - 기존 주문의 원래 policy Ref/개정은 보존
  TargetScopeSnapshot:
    description: C00.TargetScope의 논리 형태
    fields:
      enterpriseRef: Enterprise Ref
      departmentRef: Department Ref 또는 명시적 NOT_USED의 NULL
      siteRef: BusinessSite Ref 또는 명시적 NOT_USED의 NULL
      contextPolicyRef: Enterprise Ref + 정책을 기록한 개정
      organisationRevision: EnterpriseAccess가 해당 기업 조직/정책 변경을 반영한 개정
    constraints:
    - 주문 전체에 하나의 문맥; 현재 요청자 소속에서 역추정 금지
    - NULL은 명시적 미사용이며 누락/UNSET/모르는 조직이 아님
  CapturedLineTerms:
    description: 제출 상품/판매 개정·제시 가격/조건·요청 지급모드/활성일·계약 개정과 항목별 KnowledgeState·근거. 입력의 요청 값은 합의 확인과 구별
    fields:
      sourceOfferRef: CommonOfferRevision Ref
      displayedPrice: Money 또는 UNKNOWN/CONFLICT로 값 없음
      requestedPaymentMode: PREPAY | POSTPAY
      requestedActivationDate: LocalDate 또는 적용하지 않는 NULL
      agreedPeriod: 확인된 원래 기간 또는 명시적 미확인
      paymentTermsRef: 확인된 조건 원본 또는 미확인
      completionBasisRef: 확인된 조건 원본 또는 미확인
      agreementRevisionRef: AgreementRevision Ref 또는 적용 없음/미확인 구분
      knowledge: 필드별 KnowledgeState
      evidenceRefs: EvidenceRefs
  LineAssessmentList:
    description: 각 OrderLine의 계약/공개·가격/수량/공급·납기 판단 배열. 상태·reasonKind·reasonCode·owner·basisRefs·observedRevision/시각 유지
    reasonKinds:
    - UNVERIFIED
    - SPECIAL_CONDITION
    - CONFLICT
    - TECHNICAL_FAILURE
    minimum_items: 1
  KnowledgeState:
    allowed_values:
    - KNOWN
    - UNKNOWN
    - CONFLICT
    - UNAVAILABLE
    description: KNOWN만 확인된 값; UNKNOWN과 미등록/전달 실패를 0원·미지급·완료로 바꾸지 않음
  Money:
    description: 'C00.Money: KRW와 정확한 비음수 십진 문자열. 가격 산식/정밀도/반올림·합계는 FD-OQ3에서 코드 전 확인'
  CustomerAction:
    allowed_values:
    - product.read
    - order.read
    - order.submit
    - payment.read
    - entitlement.read
    - renewal.request
    - autoRenewal.request
    - autoRenewal.cancel
    - order.change.request
    - order.cancel.request
    - order.return.request
    - organisation.manage
    - user.manage
    - role.manage
    - contract.change.request
  ScopeKind:
    allowed_values:
    - DEPARTMENT_SITE
    - SITE_ALL_DEPARTMENTS
    - DEPARTMENT_ALL_SITES
    - ENTERPRISE_ALL
  Audience:
    allowed_values:
    - CUSTOMER
    - STAFF
    - SYSTEM
  BusinessOwner:
    description: 기존 C00.Receipt.owner의 업무 소유자; 기술 호스트는 wire의 거래 원본 소유자로 가장하지 않음
  ReceiptState:
    allowed_values:
    - ACCEPTED
    - PROCESSING
    - RESULT_RECORDED
    - REVIEW_REQUIRED
    - TECHNICAL_FAILED
  RequestTarget:
    description: No/Record/Enterprise/Request/Challenge 대상의 해당 operation 문맥; C00의 InvocationTarget과 일치
  OptionalPurpose:
    description: 목적 제한 세션의 경우만 목적이 필수; 업무 세션은 제한 목적을 권한으로 사용하지 않음
  StaffActionList:
    description: functional-spec.md의 U1 직원 행위 레지스트리; 전체 확장은 U2 담당
  LoginPath:
    description: C00.loginPath의 내부 로그인 후 조회 경로; 허용된 target/audience만 열림
  SourceRevisionList:
    description: 원본별 owner/recordRef/개정/관측시각 배열
  ContactRefList:
    description: 권한/확인된 등록 연락 경로의 제한 참조
  CapturedLineTermsList:
    description: CapturedLineTerms의 품목별 배열
  RefList:
    description: attributes.references 또는 관계표가 정한 대상 Ref 배열
  NonEmptyText:
    logical_type: text
    minimum_length: 1
  Boolean:
    logical_type: boolean
  PositiveInteger:
    logical_type: integer
    minimum: 1
  NonNegativeInteger:
    logical_type: integer
    minimum: 0
entities:
- name: Account
  owner: IdentityRecovery
  description: 확인된 계정과 인증 주체 연결. 기업 승인·업무 권한과 별개다.
  attributes:
  - name: accountId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: loginIdentifier
    type: NonEmptyText
    required: true
    unique: false
  - name: displayName
    type: NonEmptyText
    required: true
    unique: false
  - name: contactAddress
    type: NonEmptyText
    required: true
    unique: false
  - name: active
    type: Boolean
    required: true
    unique: false
  - name: identityBasis
    type: EvidenceRefs
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 로그인 식별자의 정규화·동일성/실제 권위는 FD-OQ1에서 확인한다.
  - 공개 응답·로그에 인증 비밀을 포함하지 않는다.
  relationships: []
- name: VerifiedPersonLink
  owner: IdentityRecovery
  description: 계정들 사이 확인된 동일인 근거. 단순 이름·이메일 일치를 동일인 증거로 쓰지 않는다.
  attributes:
  - name: personLinkId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: accountRefs
    type: RefList
    required: true
    unique: false
    references: Account
    min_items: 1
  - name: evidenceRefs
    type: EvidenceRefs
    required: true
    unique: false
    min_items: 1
  - name: verifiedAt
    type: Instant
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 실제 확인 정책과 증거가 없으면 확인됨으로 기록하지 않는다.
  - 계약 자기 승인 방지의 동일인 판단은 후속 CommercialAgreement도 같은 원본을 사용한다.
  relationships:
  - field: accountRefs
    target: Account
    cardinality: 1..*
    direction: outbound
    description: 확인된 계정 연결
- name: MfaEnrollment
  owner: IdentityRecovery
  description: 주체에 귀속된 인증 수단의 등록 결과.
  attributes:
  - name: enrollmentId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: accountRef
    type: Ref
    required: true
    unique: false
    references: Account
  - name: state
    type: Enum
    required: true
    unique: false
    allowed_values:
    - PENDING
    - VERIFIED
    - INVALIDATED
  - name: protectedMethodRef
    type: ProtectedReference
    required: true
    unique: false
  - name: verificationEvidenceRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - MFA 성공은 유효한 등록 수단과 검증 결과를 모두 대조한다.
  - 수단의 비밀 값은 일반 업무 모델·이력·통지로 반환하지 않는다.
  relationships:
  - field: accountRef
    target: Account
    cardinality: '1'
    direction: outbound
    description: 등록 주체
- name: IdentityChallenge
  owner: IdentityRecovery
  description: 가입/로그인/MFA 등록의 목적 제한된 검증 시도. wire에는 challengeId를 사용한다.
  attributes:
  - name: challengeId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: subjectAccountRef
    type: Ref
    required: true
    unique: false
    references: Account
    nullable: true
  - name: audience
    type: Audience
    required: true
    unique: false
  - name: purpose
    type: Enum
    required: true
    unique: false
    allowed_values:
    - REGISTRATION
    - LOGIN
    - MFA_ENROLMENT
  - name: state
    type: Enum
    required: true
    unique: false
    allowed_values:
    - OPEN
    - SATISFIED
    - EXPIRED
    - INVALIDATED
  - name: deadlineAt
    type: Instant
    required: true
    unique: false
  - name: verificationBasisRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 목적·주체·audience·만료·미사용 상태가 일치할 때만 소비한다.
  - 반복 응답은 같은 만족 결과를 재확인하고 새 인증 효과를 만들지 않는다.
  - 실제 수단·유효 시간·요청 제한 값은 FD-OQ1의 NFR 조건이다.
  relationships:
  - field: subjectAccountRef
    target: Account
    cardinality: 0..1
    direction: outbound
    description: 검증 전 존재를 공개하지 않음
- name: IdentitySession
  owner: IdentityRecovery
  description: 서버의 제한/업무 세션 문맥. opaque 식별자로만 브라우저와 연결한다.
  attributes:
  - name: sessionId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: accountRef
    type: Ref
    required: true
    unique: false
    references: Account
  - name: audience
    type: Audience
    required: true
    unique: false
  - name: phase
    type: Enum
    required: true
    unique: false
    allowed_values:
    - PURPOSE_LIMITED
    - MFA_VERIFIED
    - INVALIDATED
  - name: purpose
    type: OptionalPurpose
    required: true
    unique: false
  - name: deadlineAt
    type: Instant
    required: true
    unique: false
  - name: mfaEnrollmentRef
    type: Ref
    required: true
    unique: false
    references: MfaEnrollment
    nullable: true
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 목적 제한 세션은 기업 업무·직원 승인을 수행할 수 없다.
  - MFA_VERIFIED라도 현재 활성 계정·기업·행위 권한을 별도 검증한다.
  - STAFF는 신뢰된 직원 망 근거와 audience가 필요하다.
  relationships:
  - field: accountRef
    target: Account
    cardinality: '1'
    direction: outbound
    description: 세션 주체
  - field: mfaEnrollmentRef
    target: MfaEnrollment
    cardinality: 0..1
    direction: outbound
    description: 업무 세션의 MFA 근거
- name: EnterpriseApplication
  owner: EnterpriseAccess
  description: 고객의 기업 이용 신청·확인 근거·직원 판단.
  attributes:
  - name: applicationId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: applicantAccountRef
    type: Ref
    required: true
    unique: false
    references: Account
  - name: legalName
    type: NonEmptyText
    required: true
    unique: false
  - name: designatedContact
    type: NonEmptyText
    required: true
    unique: false
  - name: registrationEvidenceRefs
    type: EvidenceRefs
    required: true
    unique: false
    min_items: 0
  - name: state
    type: Enum
    required: true
    unique: false
    allowed_values:
    - PENDING
    - APPROVED
    - DECLINED
    - UNVERIFIED
  - name: decisionBasis
    type: DecisionBasis
    required: true
    unique: false
    nullable: true
  - name: initialAdministratorRef
    type: Ref
    required: true
    unique: false
    references: EnterpriseMembership
    nullable: true
  - name: submittedAt
    type: Instant
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 기업 이름/연락처만으로 기업 또는 최초 관리자 관계를 확인하지 않는다.
  - 승인 필수 근거의 실제 정책은 FD-OQ2; 미확인은 PENDING/UNVERIFIED로 보존한다.
  - 신청자와 권한 있는 직원만 허용된 신청 결과를 조회한다.
  relationships:
  - field: applicantAccountRef
    target: Account
    cardinality: '1'
    direction: outbound
    description: 신청자의 확인된 계정
  - field: initialAdministratorRef
    target: EnterpriseMembership
    cardinality: 0..1
    direction: outbound
    description: 최초 관리자 지정 결과
- name: Enterprise
  owner: EnterpriseAccess
  description: 승인 상태와 주문 조직 정책을 소유하는 구매 기업.
  attributes:
  - name: enterpriseId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: applicationRef
    type: Ref
    required: true
    unique: false
    references: EnterpriseApplication
  - name: approvalState
    type: Enum
    required: true
    unique: false
    allowed_values:
    - PENDING
    - APPROVED
    - DECLINED
    - UNVERIFIED
  - name: usageEnabled
    type: Boolean
    required: true
    unique: false
  - name: orderingContextPolicy
    type: OrderingContextPolicy
    required: true
    unique: false
  - name: administratorCount
    type: NonNegativeInteger
    required: true
    unique: false
  - name: designatedNoticeContactRefs
    type: ContactRefList
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 기업 승인과 최초 관리자 지정은 서로 다른 권한·결과로 추적한다.
  - 관리자 0명은 경고·이력의 대상이며 다른 사용자의 권한·기업 이용을 자동 중지하지 않는다.
  - 조직 정책의 초기 값은 UNSET이며 이름/조직 수로 미사용을 추정하지 않는다.
  relationships:
  - field: applicationRef
    target: EnterpriseApplication
    cardinality: '1'
    direction: outbound
    description: 기업 이용 신청 원본
- name: Department
  owner: EnterpriseAccess
  description: 기업 내 부서의 안정 식별자와 현재 활성 상태.
  attributes:
  - name: departmentId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: enterpriseRef
    type: Ref
    required: true
    unique: false
    references: Enterprise
  - name: label
    type: NonEmptyText
    required: true
    unique: false
  - name: active
    type: Boolean
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 이름 변경/비활성화로 식별자나 과거 개정을 재사용·삭제하지 않는다.
  - 사용하지 않는 기준과 비활성화된 개별 부서는 다르다.
  relationships:
  - field: enterpriseRef
    target: Enterprise
    cardinality: '1'
    direction: outbound
    description: 소유 기업
- name: BusinessSite
  owner: EnterpriseAccess
  description: 기업 내 사업장의 안정 식별자와 현재 활성 상태.
  attributes:
  - name: siteId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: enterpriseRef
    type: Ref
    required: true
    unique: false
    references: Enterprise
  - name: label
    type: NonEmptyText
    required: true
    unique: false
  - name: active
    type: Boolean
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 이름 변경/비활성화로 식별자나 과거 개정을 재사용·삭제하지 않는다.
  - 다른 기업의 사업장을 같은 이름이라는 이유로 연결하지 않는다.
  relationships:
  - field: enterpriseRef
    target: Enterprise
    cardinality: '1'
    direction: outbound
    description: 소유 기업
- name: EnterpriseMembership
  owner: EnterpriseAccess
  description: 계정과 기업의 확인된 소속 및 관리자 지정.
  attributes:
  - name: membershipId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: accountRef
    type: Ref
    required: true
    unique: false
    references: Account
  - name: enterpriseRef
    type: Ref
    required: true
    unique: false
    references: Enterprise
  - name: departmentRef
    type: Ref
    required: true
    unique: false
    references: Department
    nullable: true
  - name: siteRef
    type: Ref
    required: true
    unique: false
    references: BusinessSite
    nullable: true
  - name: active
    type: Boolean
    required: true
    unique: false
  - name: administrator
    type: Boolean
    required: true
    unique: false
  - name: designationBasis
    type: DecisionBasis
    required: true
    unique: false
    nullable: true
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 관리자 지정은 기업/주체/관계 근거와 해당 지정 권한을 검증한다.
  - 소속 변경으로 과거 Order.targetScope나 기존 역할 범위를 자동 이동시키지 않는다.
  - 관리자 표지만으로 모든 주문/금융/SW 권한을 주지 않는다.
  relationships:
  - field: accountRef
    target: Account
    cardinality: '1'
    direction: outbound
    description: 확인된 계정
  - field: enterpriseRef
    target: Enterprise
    cardinality: '1'
    direction: outbound
    description: 활성 소속 기업
  - field: departmentRef
    target: Department
    cardinality: 0..1
    direction: outbound
    description: 현재 소속 부서
  - field: siteRef
    target: BusinessSite
    cardinality: 0..1
    direction: outbound
    description: 현재 소속 사업장
- name: CustomerRole
  owner: EnterpriseAccess
  description: 기업이 정의하는 행위별 접근 범위의 집합.
  attributes:
  - name: roleId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: enterpriseRef
    type: Ref
    required: true
    unique: false
    references: Enterprise
  - name: label
    type: NonEmptyText
    required: true
    unique: false
  - name: actionScopeRefs
    type: RefList
    required: true
    unique: false
    references: ActionScope
    min_items: 0
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 허용된 15개 고객 행위 레지스트리만 사용한다.
  - 기업 관리 권한과 거래 권한을 자동 묶지 않는다.
  relationships:
  - field: enterpriseRef
    target: Enterprise
    cardinality: '1'
    direction: outbound
    description: 역할의 기업 경계
  - field: actionScopeRefs
    target: ActionScope
    cardinality: 0..*
    direction: outbound
    description: 행위별 원본 범위
- name: ActionScope
  owner: EnterpriseAccess
  description: 한 행위의 명시적 범위. 별도 레코드가 DEPARTMENT_SITE의 별도 조합을 보존한다.
  attributes:
  - name: actionScopeId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: enterpriseRef
    type: Ref
    required: true
    unique: false
    references: Enterprise
  - name: action
    type: CustomerAction
    required: true
    unique: false
  - name: kind
    type: ScopeKind
    required: true
    unique: false
  - name: departmentRefs
    type: RefList
    required: true
    unique: false
    references: Department
    min_items: 0
  - name: siteRefs
    type: RefList
    required: true
    unique: false
    references: BusinessSite
    min_items: 0
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - kind별 참조 수/NULL 의미는 functional-spec.md의 범위 판정표를 따른다.
  - 개별 역할·행위의 완성된 범위만 합집합으로 평가하며 다른 레코드의 부서/사업장을 교차 결합하지 않는다.
  - 폐지된 조직을 과거 주문 조회용 범위로 유지할 수 있으나 신규 주문의 활성 조건을 면제하지 않는다.
  relationships:
  - field: enterpriseRef
    target: Enterprise
    cardinality: '1'
    direction: outbound
    description: 기업 경계
  - field: departmentRefs
    target: Department
    cardinality: 0..*
    direction: outbound
    description: 이 레코드의 부서 집합
  - field: siteRefs
    target: BusinessSite
    cardinality: 0..*
    direction: outbound
    description: 이 레코드의 사업장 집합
- name: CustomerRoleGrant
  owner: EnterpriseAccess
  description: 소속에 대한 역할 부여·회수 원본.
  attributes:
  - name: grantId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: membershipRef
    type: Ref
    required: true
    unique: false
    references: EnterpriseMembership
  - name: roleRef
    type: Ref
    required: true
    unique: false
    references: CustomerRole
  - name: effectiveFrom
    type: Instant
    required: true
    unique: false
  - name: revokedAt
    type: Instant
    required: true
    unique: false
    nullable: true
  - name: grantedBy
    type: Ref
    required: true
    unique: false
    references: Account
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 소속·역할·범위는 같은 기업이어야 한다.
  - 부여/회수와 조회·실행의 경합은 현재 권한 개정을 커밋 시점까지 대조한다.
  relationships:
  - field: membershipRef
    target: EnterpriseMembership
    cardinality: '1'
    direction: outbound
    description: 수신 소속
  - field: roleRef
    target: CustomerRole
    cardinality: '1'
    direction: outbound
    description: 같은 기업 역할
  - field: grantedBy
    target: Account
    cardinality: '1'
    direction: outbound
    description: 권한 있는 행위자
- name: StaffRole
  owner: EnterpriseAccess
  description: 내부 직원의 명시적 업무 행위 집합.
  attributes:
  - name: staffRoleId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: label
    type: NonEmptyText
    required: true
    unique: false
  - name: actions
    type: StaffActionList
    required: true
    unique: false
    min_items: 1
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 업무 등록·확인·관리자 지정·판단 정보 조회·권한 관리를 구별한다.
  - SYSTEM 전용 실행 권한을 직원 권한으로 생성하지 않는다.
  relationships: []
- name: StaffRoleGrant
  owner: EnterpriseAccess
  description: 내부 계정의 역할 부여·회수 원본.
  attributes:
  - name: staffGrantId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: accountRef
    type: Ref
    required: true
    unique: false
    references: Account
  - name: roleRef
    type: Ref
    required: true
    unique: false
    references: StaffRole
  - name: effectiveFrom
    type: Instant
    required: true
    unique: false
  - name: revokedAt
    type: Instant
    required: true
    unique: false
    nullable: true
  - name: grantedBy
    type: Ref
    required: true
    unique: false
    references: Account
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 직원이라는 사실만으로 모든 행위를 허용하지 않는다.
  - 초기 권한 관리자 확보·부여 권위는 FD-OQ2의 구현 선행 조건이다.
  relationships:
  - field: accountRef
    target: Account
    cardinality: '1'
    direction: outbound
    description: 직원 계정
  - field: roleRef
    target: StaffRole
    cardinality: '1'
    direction: outbound
    description: 직원 역할
  - field: grantedBy
    target: Account
    cardinality: '1'
    direction: outbound
    description: 부여 행위자
- name: Product
  owner: ProductCatalog
  description: 내부 직원이 등록한 판매 상품 원본.
  attributes:
  - name: productId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: productType
    type: Enum
    required: true
    unique: false
    allowed_values:
    - HARDWARE
    - SOFTWARE
  - name: softwareTermKind
    type: Enum
    required: true
    unique: false
    allowed_values:
    - PERPETUAL
    - TERM
    nullable: true
  - name: label
    type: NonEmptyText
    required: true
    unique: false
  - name: salesDescription
    type: NonEmptyText
    required: true
    unique: false
  - name: currentOfferRef
    type: Ref
    required: true
    unique: false
    references: CommonOfferRevision
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - HW의 softwareTermKind는 NULL; SW는 PERPETUAL/TERM이 필요하다.
  - 타입 변경으로 이미 제출된 주문의 상품 타입·원래 개정을 변경하지 않는다.
  relationships:
  - field: currentOfferRef
    target: CommonOfferRevision
    cardinality: '1'
    direction: outbound
    description: 현재 제시하는 판매 개정
- name: CommonOfferRevision
  owner: ProductCatalog
  description: 판매 당시 공통 공개·가격·조건의 불변 개정.
  attributes:
  - name: offerRevisionId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: productRef
    type: Ref
    required: true
    unique: false
    references: Product
  - name: visible
    type: Boolean
    required: true
    unique: false
  - name: commonPrice
    type: Money
    required: true
    unique: false
  - name: salesConditionRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: publishedAt
    type: Instant
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 개정은 새 원본으로 남기며 구매 스냅샷이 가리키는 개정을 덮어쓰지 않는다.
  - 공통 조건을 실제 기업별 예외 확인 결과로 가장하지 않는다.
  relationships:
  - field: productRef
    target: Product
    cardinality: '1'
    direction: outbound
    description: 판매 상품
- name: Order
  owner: OrderAcceptance
  description: 유효 고객 요청과 원래 대상 조직을 소유하는 주문.
  attributes:
  - name: orderId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: enterpriseRef
    type: Ref
    required: true
    unique: false
    references: Enterprise
  - name: requesterAccountRef
    type: Ref
    required: true
    unique: false
    references: Account
  - name: submissionRequestId
    type: Identifier
    required: true
    unique: true
  - name: targetScope
    type: TargetScopeSnapshot
    required: true
    unique: false
  - name: submittedAt
    type: Instant
    required: true
    unique: false
  - name: productType
    type: Enum
    required: true
    unique: false
    allowed_values:
    - HARDWARE
    - SOFTWARE
  - name: lineRefs
    type: RefList
    required: true
    unique: false
    references: OrderLine
    min_items: 1
  - name: purchaseTermsRef
    type: Ref
    required: true
    unique: false
    references: PurchaseTermsSnapshot
  - name: provisionChoiceRef
    type: Ref
    required: true
    unique: false
    references: ProvisionChoice
  - name: acceptanceRef
    type: Ref
    required: true
    unique: false
    references: AcceptanceDecision
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - targetScope는 최초 접수 문맥이며 소속/조직 정책 변경으로 덮어쓰지 않는다.
  - 주문 수락과 지급/실제 확보/배송/발급 완료는 별개다.
  - 모든 라인과 후속 참조는 이 주문의 동일 enterprise/targetScope로 접근을 검증한다.
  relationships:
  - field: enterpriseRef
    target: Enterprise
    cardinality: '1'
    direction: outbound
    description: 구매 기업
  - field: requesterAccountRef
    target: Account
    cardinality: '1'
    direction: outbound
    description: 접수 행위자
  - field: lineRefs
    target: OrderLine
    cardinality: 1..*
    direction: outbound
    description: 동일 타입 주문 품목
  - field: purchaseTermsRef
    target: PurchaseTermsSnapshot
    cardinality: '1'
    direction: outbound
    description: 구매 시점 원본 조건
  - field: provisionChoiceRef
    target: ProvisionChoice
    cardinality: '1'
    direction: outbound
    description: 일괄/부분 의사
  - field: acceptanceRef
    target: AcceptanceDecision
    cardinality: '1'
    direction: outbound
    description: 현재 전체 판단
  - field: targetScope.departmentRef
    target: Department
    cardinality: 0..1
    direction: outbound
    description: 원래 주문의 보호 대상 부서; 명시적 정책 미사용만 NULL
  - field: targetScope.siteRef
    target: BusinessSite
    cardinality: 0..1
    direction: outbound
    description: 원래 주문의 보호 대상 사업장; 명시적 정책 미사용만 NULL
  - field: targetScope.contextPolicyRef
    target: Enterprise
    cardinality: '1'
    direction: outbound
    description: 동일 기업의 당시 orderingContextPolicy를 보존한 Enterprise 개정
- name: OrderLine
  owner: OrderAcceptance
  description: 제출 수량·요청 조건 및 구매 시점 판매 개정 연결.
  attributes:
  - name: lineId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: orderRef
    type: Ref
    required: true
    unique: false
    references: Order
  - name: productRef
    type: Ref
    required: true
    unique: false
    references: Product
  - name: commonOfferRevisionRef
    type: Ref
    required: true
    unique: false
    references: CommonOfferRevision
  - name: quantity
    type: PositiveInteger
    required: true
    unique: false
    minimum: 1
  - name: requestedPaymentMode
    type: Enum
    required: true
    unique: false
    allowed_values:
    - PREPAY
    - POSTPAY
  - name: requestedActivationDate
    type: LocalDate
    required: true
    unique: false
    nullable: true
  - name: capturedTerms
    type: CapturedLineTerms
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 선택/요청 값과 확인된 판매 합의·실제 대금/제공을 구별한다.
  - 생성 시 타입·현재 공개/적용 개정·기업 관계와 수량을 검증한다.
  - 시험 50품목은 제품 상한이 아니다; 실제 한도는 FD-OQ4.
  relationships:
  - field: orderRef
    target: Order
    cardinality: '1'
    direction: outbound
    description: 대상 주문
  - field: productRef
    target: Product
    cardinality: '1'
    direction: outbound
    description: 실제 판매 상품
  - field: commonOfferRevisionRef
    target: CommonOfferRevision
    cardinality: '1'
    direction: outbound
    description: 제시한 판매 개정
- name: PurchaseTermsSnapshot
  owner: OrderAcceptance
  description: 원래 가격·조건과 지식 상태를 동결한 구매 스냅샷.
  attributes:
  - name: purchaseTermsId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: orderRef
    type: Ref
    required: true
    unique: false
    references: Order
  - name: catalogRevisionRefs
    type: RefList
    required: true
    unique: false
    references: CommonOfferRevision
    min_items: 1
  - name: agreementRevisionRef
    type: ExternalRef
    required: true
    unique: false
    references: CommercialAgreement.AgreementRevision
    nullable: true
  - name: capturedLines
    type: CapturedLineTermsList
    required: true
    unique: false
    min_items: 1
  - name: capturedAt
    type: Instant
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 요청과 확인 값·근거를 명시적으로 구분하고 미확인을 임의 조건/0원으로 채우지 않는다.
  - 원래 가격 변경은 새 제안/고객 동의 절차로만 진행한다; 전체 흐름은 U3 확장 책임.
  - Catalog 개정 원본 참조는 Domain R-02의 해당 참조를 명시적으로 보존한다.
  relationships:
  - field: orderRef
    target: Order
    cardinality: '1'
    direction: outbound
    description: 원래 주문
  - field: catalogRevisionRefs
    target: CommonOfferRevision
    cardinality: 1..*
    direction: outbound
    description: 가격·공개 원본 개정
- name: ProvisionChoice
  owner: OrderAcceptance
  description: 전체/부분 제공 의사와 조건 동의 연결.
  attributes:
  - name: provisionChoiceId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: orderRef
    type: Ref
    required: true
    unique: false
    references: Order
  - name: choice
    type: Enum
    required: true
    unique: false
    allowed_values:
    - FULL
    - PARTIAL
    default: FULL
  - name: consentRef
    type: ExternalRef
    required: true
    unique: false
    references: CommercialAgreement.CustomerConsent
    nullable: true
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - PARTIAL은 실제 유효한 동의·품목/수량/조건이 필요하다.
  - 동의 기능 미등록의 U1 시연은 FULL 경로를 사용하며 부분 제공 동의를 가짜로 만들지 않는다.
  relationships:
  - field: orderRef
    target: Order
    cardinality: '1'
    direction: outbound
    description: 주문 제공 의사
- name: AcceptanceDecision
  owner: OrderAcceptance
  description: 전체 주문 판단과 품목별 사유/확인 사실.
  attributes:
  - name: decisionId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: orderRef
    type: Ref
    required: true
    unique: false
    references: Order
  - name: acceptance
    type: Enum
    required: true
    unique: false
    allowed_values:
    - REVIEW_REQUIRED
    - ACCEPTED
    - DECLINED
    - UNVERIFIED
  - name: lineAssessments
    type: LineAssessmentList
    required: true
    unique: false
    min_items: 1
  - name: basisRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: evaluatedAt
    type: Instant
    required: true
    unique: false
  - name: assessedSourceRevisions
    type: SourceRevisionList
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - U1의 미등록 계약/공급/납기 모듈은 REVIEW_REQUIRED의 미확인 사유다.
  - 한 품목만 확인되어도 전체 ACCEPTED로 바꾸지 않는다.
  - 거절된 접근/입력에 대해 직원 판단으로 유효 주문을 생성하지 않는다.
  relationships:
  - field: orderRef
    target: Order
    cardinality: '1'
    direction: outbound
    description: 전체 판단 대상
- name: RequestReceipt
  owner: U1Host
  description: 원래 요청·principal/audience/operation/정규 입력과 지속 결과의 기술 연결. wire Receipt.owner는 실제 업무 소유자다.
  attributes:
  - name: requestId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: principalId
    type: Identifier
    required: true
    unique: false
  - name: audience
    type: Audience
    required: true
    unique: false
  - name: operation
    type: NonEmptyText
    required: true
    unique: false
  - name: targetIdentity
    type: RequestTarget
    required: true
    unique: false
  - name: requestFingerprint
    type: NonEmptyText
    required: true
    unique: false
  - name: idempotencyKey
    type: Identifier
    required: true
    unique: false
  - name: owner
    type: BusinessOwner
    required: true
    unique: false
  - name: targetScope
    type: TargetScopeSnapshot
    required: true
    unique: false
    nullable: true
  - name: requestState
    type: ReceiptState
    required: true
    unique: false
  - name: resultRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: acceptedAt
    type: Instant
    required: true
    unique: false
  - name: updatedAt
    type: Instant
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - principal/audience/operation/대상/키의 복합 식별자에 같은 내용만 재사용한다.
  - 키 충돌의 다른 내용은409; 조회 전에 현재 주체/행위/대상 권한을 대조한다.
  - 승인 전 기업 신청은 신청자 계정에 연결하며 거래 targetScope를 임의 생성하지 않는다.
  relationships: []
- name: WorkItem
  owner: U1Host
  description: 커밋된 작업 전달과 업무 소유자의 실행 허가·결과 대조.
  attributes:
  - name: workId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: requestId
    type: Identifier
    required: true
    unique: false
    references: RequestReceipt
  - name: owner
    type: BusinessOwner
    required: true
    unique: false
  - name: operationId
    type: NonEmptyText
    required: true
    unique: false
  - name: targetRef
    type: ExternalRef
    required: true
    unique: false
    nullable: true
  - name: sourceFactRef
    type: ExternalRef
    required: true
    unique: false
    nullable: true
  - name: executionPermitRef
    type: ExternalRef
    required: true
    unique: false
  - name: expectedRevision
    type: Revision
    required: true
    unique: false
    nullable: true
  - name: notBefore
    type: Instant
    required: true
    unique: false
  - name: deadlineAt
    type: Instant
    required: true
    unique: false
  - name: attempt
    type: NonNegativeInteger
    required: true
    unique: false
  - name: state
    type: Enum
    required: true
    unique: false
    allowed_values:
    - PENDING
    - PROCESSING
    - RESULT_RECORDED
    - REVIEW_REQUIRED
    - TECHNICAL_FAILED
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 작업·업무 변경·다음 사실 및 처리 표지를 필요한 같은 논리 커밋으로 연결한다.
  - 외부 결과 불명은 무조건 재실행하지 않는다.
  - 만료/권한 회수/타입·버전 불일치는 실행 전 재확인하고 조치 필요로 남긴다.
  relationships:
  - field: requestId
    target: RequestReceipt
    cardinality: '1'
    direction: outbound
    description: 원래 성공 접수
- name: FactEnvelope
  owner: U1Host
  description: 업무 소유자의 커밋된 사실 전달. 원본 사실 자체는 해당 소유자에 있다.
  attributes:
  - name: eventId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: sourceOwner
    type: BusinessOwner
    required: true
    unique: false
  - name: aggregateRef
    type: ExternalRef
    required: true
    unique: false
  - name: aggregateVersion
    type: Revision
    required: true
    unique: false
  - name: sourceFactRef
    type: ExternalRef
    required: true
    unique: false
  - name: targetScope
    type: TargetScopeSnapshot
    required: true
    unique: false
    nullable: true
  - name: causationRequestId
    type: Identifier
    required: true
    unique: false
    references: RequestReceipt
  - name: correlationId
    type: Identifier
    required: true
    unique: false
  - name: schemaVersion
    type: NonEmptyText
    required: true
    unique: false
  - name: supersedesFactRef
    type: ExternalRef
    required: true
    unique: false
    nullable: true
  - name: evidenceRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: occurredAt
    type: Instant
    required: true
    unique: false
  constraints:
  - 커밋 전 사실을 발행하지 않는다.
  - 원래 aggregateVersion과 정정 관계를 유지하며 뒤늦게 도착했다는 이유로 최신 값을 덮어쓰지 않는다.
  relationships:
  - field: causationRequestId
    target: RequestReceipt
    cardinality: '1'
    direction: outbound
    description: 원래 원인 접수
- name: ConsumerProcessingMark
  owner: U1Host
  description: 소비자별 이미 반영한 작업/사실과 효과의 원자 기록.
  attributes:
  - name: processingMarkId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: consumer
    type: NonEmptyText
    required: true
    unique: false
  - name: deliveryId
    type: Identifier
    required: true
    unique: false
  - name: deliveryKind
    type: Enum
    required: true
    unique: false
    allowed_values:
    - WORK
    - FACT
  - name: sourceVersion
    type: Revision
    required: true
    unique: false
  - name: effectRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: committedAt
    type: Instant
    required: true
    unique: false
  constraints:
  - consumer/deliveryKind/deliveryId는 고유하다.
  - 업무 효과·다음 작업/사실과 표지를 같은 논리 커밋으로 기록한다.
  relationships: []
- name: OwnerHistoryEntry
  owner: 각 업무 소유자
  description: IdentityHistory/AccessHistory/CatalogHistory/OrderHistory와 통지 이력의 공통 논리 형태. 공유 거래 원본이 아니다.
  attributes:
  - name: historyId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: owner
    type: BusinessOwner
    required: true
    unique: false
  - name: actorAccountRef
    type: ExternalRef
    required: true
    unique: false
    nullable: true
  - name: verifiedPersonRef
    type: ExternalRef
    required: true
    unique: false
    nullable: true
  - name: occurredAt
    type: Instant
    required: true
    unique: false
  - name: reason
    type: NonEmptyText
    required: true
    unique: false
  - name: beforeRef
    type: ExternalRef
    required: true
    unique: false
    nullable: true
  - name: afterRef
    type: ExternalRef
    required: true
    unique: false
    nullable: true
  - name: evidenceRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: requestId
    type: Identifier
    required: true
    unique: false
    references: RequestReceipt
  - name: resultRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: correctionOf
    type: ExternalRef
    required: true
    unique: false
    nullable: true
  - name: sourceRevision
    type: Revision
    required: true
    unique: false
  constraints:
  - 일반 업무 변경으로 과거 이력을 덮어쓰지 않는다.
  - 서로 다른 업무의 민감 값은 소유자/현재 권한에 따라 최소 투영한다.
  - 보관 종료/삭제·운영자 예외의 실제 정책은 FD-OQ5를 확인한다.
  relationships:
  - field: requestId
    target: RequestReceipt
    cardinality: '1'
    direction: outbound
    description: 변경 요청/기술 시도의 원래 접수
- name: NotificationIntent
  owner: NotificationDelivery
  description: 허용된 수신자에게 제공할 최소 안내와 로그인 후 조치.
  attributes:
  - name: notificationId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: sourceFactRef
    type: ExternalRef
    required: true
    unique: false
  - name: targetScope
    type: TargetScopeSnapshot
    required: true
    unique: false
    nullable: true
  - name: recipientAccountRefs
    type: RefList
    required: true
    unique: false
    references: Account
    min_items: 0
  - name: minimalText
    type: NonEmptyText
    required: true
    unique: false
  - name: loginPath
    type: LoginPath
    required: true
    unique: false
  - name: requiredActionRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: createdAt
    type: Instant
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 수신자·대상 행위 권한은 생성 시와 전송/열람 시 다시 확인한다.
  - 키·계약 상세·기업별 민감 금액을 이메일에 넣지 않는다.
  - 기업 승인/MFA 결과 통지의 수신자 문맥은 거래 주문 문맥과 구별한다.
  relationships:
  - field: recipientAccountRefs
    target: Account
    cardinality: 0..*
    direction: outbound
    description: 현재 허용된 수신자
- name: DeliveryAttempt
  owner: NotificationDelivery
  description: 최소 통지의 채널별 실제 시도·결과. 외부 시도와 원래 업무를 구별한다.
  attributes:
  - name: deliveryAttemptId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: notificationRef
    type: Ref
    required: true
    unique: false
    references: NotificationIntent
  - name: channel
    type: Enum
    required: true
    unique: false
    allowed_values:
    - IN_APP
    - EMAIL
  - name: providerCorrelation
    type: ProtectedReference
    required: true
    unique: false
    nullable: true
  - name: knowledge
    type: KnowledgeState
    required: true
    unique: false
  - name: evidenceRefs
    type: EvidenceRefs
    required: true
    unique: false
  - name: attemptedAt
    type: Instant
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 발송 요청 수락은 실제 전달·열람·업무 동의/완료가 아니다.
  - 제공자 미등록이면 UNKNOWN/UNAVAILABLE로 남기며 가짜 성공을 반환하지 않는다.
  relationships:
  - field: notificationRef
    target: NotificationIntent
    cardinality: '1'
    direction: outbound
    description: 최소 안내 원본
- name: NoticeReadReceipt
  owner: NotificationDelivery
  description: 현재 권한으로 확인한 화면 통지 열람 기록.
  attributes:
  - name: noticeReadId
    type: Identifier
    required: true
    unique: true
    min_length: 1
  - name: notificationRef
    type: Ref
    required: true
    unique: false
    references: NotificationIntent
  - name: readerAccountRef
    type: Ref
    required: true
    unique: false
    references: Account
  - name: readAt
    type: Instant
    required: true
    unique: false
  - name: revision
    type: Revision
    required: true
    unique: false
    minimum: 1
  constraints:
  - 열람 이력은 고객 동의·지급·상품 제공 완료를 대체하지 않는다.
  - 권한이 사라지면 기록된 열람 이력이 현재 내용 접근을 허용하지 않는다.
  relationships:
  - field: notificationRef
    target: NotificationIntent
    cardinality: '1'
    direction: outbound
    description: 열람 통지
  - field: readerAccountRef
    target: Account
    cardinality: '1'
    direction: outbound
    description: 현재 권한을 검증한 사용자
```

## Entity Summary

| 모델 | 원본/기술 소유자 | 역할 |
|---|---|---|
| Account | IdentityRecovery | 확인된 계정과 인증 주체 연결. 기업 승인·업무 권한과 별개다. |
| VerifiedPersonLink | IdentityRecovery | 계정들 사이 확인된 동일인 근거. 단순 이름·이메일 일치를 동일인 증거로 쓰지 않는다. |
| MfaEnrollment | IdentityRecovery | 주체에 귀속된 인증 수단의 등록 결과. |
| IdentityChallenge | IdentityRecovery | 가입/로그인/MFA 등록의 목적 제한된 검증 시도. wire에는 challengeId를 사용한다. |
| IdentitySession | IdentityRecovery | 서버의 제한/업무 세션 문맥. opaque 식별자로만 브라우저와 연결한다. |
| EnterpriseApplication | EnterpriseAccess | 고객의 기업 이용 신청·확인 근거·직원 판단. |
| Enterprise | EnterpriseAccess | 승인 상태와 주문 조직 정책을 소유하는 구매 기업. |
| Department | EnterpriseAccess | 기업 내 부서의 안정 식별자와 현재 활성 상태. |
| BusinessSite | EnterpriseAccess | 기업 내 사업장의 안정 식별자와 현재 활성 상태. |
| EnterpriseMembership | EnterpriseAccess | 계정과 기업의 확인된 소속 및 관리자 지정. |
| CustomerRole | EnterpriseAccess | 기업이 정의하는 행위별 접근 범위의 집합. |
| ActionScope | EnterpriseAccess | 한 행위의 명시적 범위. 별도 레코드가 DEPARTMENT_SITE의 별도 조합을 보존한다. |
| CustomerRoleGrant | EnterpriseAccess | 소속에 대한 역할 부여·회수 원본. |
| StaffRole | EnterpriseAccess | 내부 직원의 명시적 업무 행위 집합. |
| StaffRoleGrant | EnterpriseAccess | 내부 계정의 역할 부여·회수 원본. |
| Product | ProductCatalog | 내부 직원이 등록한 판매 상품 원본. |
| CommonOfferRevision | ProductCatalog | 판매 당시 공통 공개·가격·조건의 불변 개정. |
| Order | OrderAcceptance | 유효 고객 요청과 원래 대상 조직을 소유하는 주문. |
| OrderLine | OrderAcceptance | 제출 수량·요청 조건 및 구매 시점 판매 개정 연결. |
| PurchaseTermsSnapshot | OrderAcceptance | 원래 가격·조건과 지식 상태를 동결한 구매 스냅샷. |
| ProvisionChoice | OrderAcceptance | 전체/부분 제공 의사와 조건 동의 연결. |
| AcceptanceDecision | OrderAcceptance | 전체 주문 판단과 품목별 사유/확인 사실. |
| RequestReceipt | U1Host | 원래 요청·principal/audience/operation/정규 입력과 지속 결과의 기술 연결. wire Receipt.owner는 실제 업무 소유자다. |
| WorkItem | U1Host | 커밋된 작업 전달과 업무 소유자의 실행 허가·결과 대조. |
| FactEnvelope | U1Host | 업무 소유자의 커밋된 사실 전달. 원본 사실 자체는 해당 소유자에 있다. |
| ConsumerProcessingMark | U1Host | 소비자별 이미 반영한 작업/사실과 효과의 원자 기록. |
| OwnerHistoryEntry | 각 업무 소유자 | IdentityHistory/AccessHistory/CatalogHistory/OrderHistory와 통지 이력의 공통 논리 형태. 공유 거래 원본이 아니다. |
| NotificationIntent | NotificationDelivery | 허용된 수신자에게 제공할 최소 안내와 로그인 후 조치. |
| DeliveryAttempt | NotificationDelivery | 최소 통지의 채널별 실제 시도·결과. 외부 시도와 원래 업무를 구별한다. |
| NoticeReadReceipt | NotificationDelivery | 현재 권한으로 확인한 화면 통지 열람 기록. |

## Relationship Summary

아래는 YAML relationships의 파생 표다. 한 source 인스턴스가 가리키는 target 수이며, 이 표가 독립적인 참조/쓰기 권위를 추가하지 않는다. 외부 소유자 참조는 각 attribute.references와 타입 선언도 함께 적용한다.

| Source.field | Target | Cardinality | Direction |
|---|---|---|---|
| VerifiedPersonLink.accountRefs | Account | 1..* | outbound |
| MfaEnrollment.accountRef | Account | 1 | outbound |
| IdentityChallenge.subjectAccountRef | Account | 0..1 | outbound |
| IdentitySession.accountRef | Account | 1 | outbound |
| IdentitySession.mfaEnrollmentRef | MfaEnrollment | 0..1 | outbound |
| EnterpriseApplication.applicantAccountRef | Account | 1 | outbound |
| EnterpriseApplication.initialAdministratorRef | EnterpriseMembership | 0..1 | outbound |
| Enterprise.applicationRef | EnterpriseApplication | 1 | outbound |
| Department.enterpriseRef | Enterprise | 1 | outbound |
| BusinessSite.enterpriseRef | Enterprise | 1 | outbound |
| EnterpriseMembership.accountRef | Account | 1 | outbound |
| EnterpriseMembership.enterpriseRef | Enterprise | 1 | outbound |
| EnterpriseMembership.departmentRef | Department | 0..1 | outbound |
| EnterpriseMembership.siteRef | BusinessSite | 0..1 | outbound |
| CustomerRole.enterpriseRef | Enterprise | 1 | outbound |
| CustomerRole.actionScopeRefs | ActionScope | 0..* | outbound |
| ActionScope.enterpriseRef | Enterprise | 1 | outbound |
| ActionScope.departmentRefs | Department | 0..* | outbound |
| ActionScope.siteRefs | BusinessSite | 0..* | outbound |
| CustomerRoleGrant.membershipRef | EnterpriseMembership | 1 | outbound |
| CustomerRoleGrant.roleRef | CustomerRole | 1 | outbound |
| CustomerRoleGrant.grantedBy | Account | 1 | outbound |
| StaffRoleGrant.accountRef | Account | 1 | outbound |
| StaffRoleGrant.roleRef | StaffRole | 1 | outbound |
| StaffRoleGrant.grantedBy | Account | 1 | outbound |
| Product.currentOfferRef | CommonOfferRevision | 1 | outbound |
| CommonOfferRevision.productRef | Product | 1 | outbound |
| Order.enterpriseRef | Enterprise | 1 | outbound |
| Order.requesterAccountRef | Account | 1 | outbound |
| Order.lineRefs | OrderLine | 1..* | outbound |
| Order.purchaseTermsRef | PurchaseTermsSnapshot | 1 | outbound |
| Order.provisionChoiceRef | ProvisionChoice | 1 | outbound |
| Order.acceptanceRef | AcceptanceDecision | 1 | outbound |
| Order.targetScope.departmentRef | Department | 0..1 | outbound |
| Order.targetScope.siteRef | BusinessSite | 0..1 | outbound |
| Order.targetScope.contextPolicyRef | Enterprise | 1 | outbound |
| OrderLine.orderRef | Order | 1 | outbound |
| OrderLine.productRef | Product | 1 | outbound |
| OrderLine.commonOfferRevisionRef | CommonOfferRevision | 1 | outbound |
| PurchaseTermsSnapshot.orderRef | Order | 1 | outbound |
| PurchaseTermsSnapshot.catalogRevisionRefs | CommonOfferRevision | 1..* | outbound |
| ProvisionChoice.orderRef | Order | 1 | outbound |
| AcceptanceDecision.orderRef | Order | 1 | outbound |
| WorkItem.requestId | RequestReceipt | 1 | outbound |
| FactEnvelope.causationRequestId | RequestReceipt | 1 | outbound |
| OwnerHistoryEntry.requestId | RequestReceipt | 1 | outbound |
| NotificationIntent.recipientAccountRefs | Account | 0..* | outbound |
| DeliveryAttempt.notificationRef | NotificationIntent | 1 | outbound |
| NoticeReadReceipt.notificationRef | NotificationIntent | 1 | outbound |
| NoticeReadReceipt.readerAccountRef | Account | 1 | outbound |

## 원래 주문 문맥과 후속 원본 연결

- Order.targetScope.enterpriseRef/departmentRef/siteRef는 EnterpriseAccess.Enterprise/Department/BusinessSite의 실제 원본과 당시 개정에 연결된다. contextPolicyRef는 같은 Enterprise 원본의 orderingContextPolicy를 담은 개정을 가리킨다. organisationRevision은 정책/조직 평가의 일관된 개정이며 요청자의 소속 개정으로 대신하지 않는다. Q1/Q2를 적용하며 OrderAcceptance가 원래 스냅샷을 소유한다.
- OrderLine과 RequestReceipt의 거래 문맥, AcceptanceDecision·원래 Fact.targetScope, 후속 대금/HW/SW/후속 요청의 orderRef는 같은 Order 원본 문맥을 사용한다. 복제된 targetScope가 원본과 다르거나 원본을 대조할 수 없으면 권한을 확대하지 않고 거절/대조한다. 조회·변경·worker 실행의 효력은 현재 주체/행위 권한으로 검증한다.
- 조직 비활성화·관리자/역할/소속 변경 후에도 원래 식별자·개정은 과거 주문/이력의 근거로 보존한다. 신규 주문에는 현재 정책과 활성 조직을 검증한다. 물리 보관 종료·삭제는 FD-OQ5에서 확인하며 임의 연수를 선언하지 않는다.
- PurchaseTermsSnapshot.catalogRevisionRefs→ProductCatalog.CommonOfferRevision은 누락 없이 직접 선언했다. agreementRevisionRef→CommercialAgreement.AgreementRevision과 ProvisionChoice.consentRef→CommercialAgreement.CustomerConsent는 외부 원본 참조다. 아직 생성되지 않은 권한/동의/계약을 임의 참조로 채우지 않는다. 다른 Domain R-02 항목은 해당 U3/U4/U5/U6 확장의 설계/코드 선행 확인으로 유지한다. [S2·S4–S5]

## Assumptions & Open Questions

functional-spec.md의 FD-OQ1–FD-OQ6이 실제 접근·사업 확인 정책·가격/기간 산식·입력/조회 한도·보관/저장·전달/재시도 값을 구체화한다. 모델은 정해지지 않은 값을 비밀 기본값으로 채우지 않는다. 합성 fixture와 실제 고객·법적 계약·제공자 권위의 검증은 구별한다.

## Sources

- S1: [unit-of-work.md](../../../inception/units-generation/unit-of-work.md) — U1 범위·컴포넌트와 배포 역할.
- S2: [unit-of-work-story-map.md](../../../inception/units-generation/unit-of-work-story-map.md) — 주 책임/협력·원본 소유·이전 보완 의견.
- S3: [requirements.md](../../../inception/requirements-analysis/requirements.md) — FR1–FR6·FR14–FR16와 NFR1·NFR4–NFR5·NFR12, OQ1–OQ10.
- S4: [components.md](../../../inception/domain-design/components.md) — 신원/기업/상품/주문/조회/통지의 단일 소유자.
- S5: [contract-summary.md](../../../inception/contract-design/contract-summary.md) — C00–C03·C05·C10–C11·C13–C21·C25, G01–G23. 아래 CE01–CE04는 이 문서에 아직 없는 추가 경계 정의다.
- S6: [stories.md](../../../inception/user-stories/stories.md) — US1.1·US1.2·US3.3의 실제 9개 AC.
- S7: [functional-design-questions.md](functional-design-questions.md) — Q1·Q2 사용자 A 답변과 정확한 Looks correct 및 기록된 작성 권한.
- S8: [bolt-plan.md](../../../inception/delivery-planning/bolt-plan.md) — B01 시연·완료·보존·회사 경계 확인.
