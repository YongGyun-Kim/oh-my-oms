# OMS 경계 계약 명세

## 범위와 명세 읽기

확인한6개 답변과 별도 Looks correct에 따른 제안 명세다.10개 Unit·14개 논리 책임·69 US/227 AC를 유지한다. 아래 44개 재사용 인터페이스/전달/외부 어댑터 계약이81개 상위 논리 관계와43개 개발 선행 후보를 연결하며, 제공 건 최신 대조의 추가 읽기 관계2개를 명시한다. 한 계약을 여러 소비자가 사용하는 경우 소비자를 함께 적고 별도 관계 표에서 각각 대조한다. 계약 수는 네트워크 서비스 수가 아니다. [S1–S4]

C00은 실제 공유 JSON Schema2020-12 원본이다. 다른 블록의 URN 참조는 이 문서에 함께 있는 $id 리소스에 연결한다. 스키마 묶음을 추출·등록해 참조를 해결하며 인터넷에 URN을 조회하지 않는다. OpenAPI3.1.0·AsyncAPI3.0.0은 사용 명세 버전이며 최신 버전/제품 도구 선택이라는 주장이 아니다. in-process 포트의 x-operations는 함수 이름·query/command·명시적 target/입력/결과 서명이다. Call은 context·target·operation·data를 모두 받으며 target과 data는 해당 operation의 서명과 일치해야 한다. 공통 스키마가 DB 공유 쓰기를 허용하지 않는다. [W1–W3]

## Contracts

| # | Provider Unit | Consumer | Mechanism | Owner |
|---|---|---|---|---|
|C00|U1|U2–U10|shared-schema|U1; 각 업무 필드는 원본 소유자|
|C01|U2|U10, U2, U3, U7|shared-schema / in-process|IdentityRecovery|
|C02|U2|U10, U3, U4, U5, U6, U7|shared-schema / in-process|EnterpriseAccess|
|C03|U3|U10, U3, U7|shared-schema / in-process|ProductCatalog|
|C04|U3|U10, U3, U4, U5, U6, U7|shared-schema / in-process|CommercialAgreement|
|C05|U3|U10, U7|shared-schema / in-process|OrderAcceptance|
|C06|U4|U10, U3, U7|shared-schema / in-process|FinancialSettlement|
|C07|U5|U4 FinancialSettlement, U10, U3, U7|shared-schema / in-process|HardwareFulfillment|
|C08|U6|U4 FinancialSettlement, U10, U3, U7|shared-schema / in-process|SoftwareLifecycle|
|C09|U7|U10, U7|shared-schema / in-process|AfterSalesDecision|
|C10|U7|External: 기술 실행 프로그램/운영 검증|shared-schema / in-process|WorkInquiry|
|C11|U7|U10|shared-schema / in-process|NotificationDelivery|
|C12|U10|External: 기술 실행 프로그램/운영 검증|shared-schema / in-process|OperationalAssurance|
|C13|U1|U2–U7/U10|shared-schema|U1 호스트; 등록 제공자는 각 업무 소유자|
|C14|U8|External: 고객 PC 브라우저|shared-schema / 정적 빌드 전달|CustomerUi|
|C15|U9|External: 사내망/승인 원격 PC 브라우저|shared-schema / 정적 빌드 전달|StaffUi|
|C16|U1 실행 호스트; U2–U7 원본 소유자|U8; External: CUSTOMER 브라우저|HTTPS JSON / OpenAPI|업무 의미: 각 소유자; 전송/공통: U1|
|C17|U1 실행 호스트; U2–U7 원본 소유자|U9; External: STAFF 브라우저|HTTPS JSON / OpenAPI|업무 의미: 각 소유자; 전송/공통: U1|
|C18|U1 API/worker 실행 역할|U1/U2–U7 worker 처리자|shared-schema / 지속 작업|작업 의미: 해당 업무; 전달 공통: U1|
|C19|U1–U7 각 원본 진단|U10|shared-schema / 읽기 진단|진단 원본: 각 업무; 평가: OperationalAssurance|
|C20-E01|U2|U7 NotificationDelivery|지속 사실 메시지 / AsyncAPI|IdentityRecovery|
|C20-E07|U3|U7 NotificationDelivery|지속 사실 메시지 / AsyncAPI|CommercialAgreement|
|C20-E14|U3|U4 FinancialSettlement|지속 사실 메시지 / AsyncAPI|OrderAcceptance|
|C20-E15|U3|U5 HardwareFulfillment|지속 사실 메시지 / AsyncAPI|OrderAcceptance|
|C20-E16|U3|U6 SoftwareLifecycle|지속 사실 메시지 / AsyncAPI|OrderAcceptance|
|C20-E17|U3|U7 NotificationDelivery|지속 사실 메시지 / AsyncAPI|OrderAcceptance|
|C20-E20|U4|U5 HardwareFulfillment|지속 사실 메시지 / AsyncAPI|FinancialSettlement|
|C20-E21|U4|U6 SoftwareLifecycle|지속 사실 메시지 / AsyncAPI|FinancialSettlement|
|C20-E22|U4|U7 NotificationDelivery|지속 사실 메시지 / AsyncAPI|FinancialSettlement|
|C20-E25|U5|U4 FinancialSettlement|지속 사실 메시지 / AsyncAPI|HardwareFulfillment|
|C20-E26|U5|U7 NotificationDelivery|지속 사실 메시지 / AsyncAPI|HardwareFulfillment|
|C20-E29|U6|U4 FinancialSettlement|지속 사실 메시지 / AsyncAPI|SoftwareLifecycle|
|C20-E30|U6|U7 NotificationDelivery|지속 사실 메시지 / AsyncAPI|SoftwareLifecycle|
|C20-E37|U7|U4 FinancialSettlement|지속 사실 메시지 / AsyncAPI|AfterSalesDecision|
|C20-E38|U7|U5 HardwareFulfillment|지속 사실 메시지 / AsyncAPI|AfterSalesDecision|
|C20-E39|U7|U6 SoftwareLifecycle|지속 사실 메시지 / AsyncAPI|AfterSalesDecision|
|C20-E40|U7|U7 NotificationDelivery|지속 사실 메시지 / AsyncAPI|AfterSalesDecision|
|C20-E62|U10|U7 NotificationDelivery|지속 사실 메시지 / AsyncAPI|OperationalAssurance|
|C21|U2|External: 미선정 신원/MFA/복구 주체|shared-schema / adapter port|IdentityRecovery|
|C22|U4|External: 미선정 청구/지급/환불 주체|shared-schema / adapter port|FinancialSettlement|
|C23|U5|External: 미선정 재고/확보/배송/회수 주체|shared-schema / adapter port|HardwareFulfillment|
|C24|U6|External: 우리 측 발급/전달/적용/회수 실행 수단|shared-schema / adapter port|SoftwareLifecycle|
|C25|U7|External: 미선정 이메일/업무 메신저|shared-schema / adapter port|NotificationDelivery|
|C26|U10|External: 미선정 관측/배포/복구/위치 검증 수단|shared-schema / adapter port|OperationalAssurance|

## 공통 의미와 불변 조건

- G01: 원본 소유자는 인증/복구·기업 접근·상품·계약·주문·대금·HW·SW·후속 판단·통지·운영 증거 각각의 컴포넌트다. U1은 초기 실제 구현과 공통 호스트/전송을 제공하고 각 확장 Unit이 같은 소유자의 규칙/인터페이스·호스트 등록을 확장한다. WorkInquiry·두 UI는 거래 원본 쓰기 권위를 갖지 않는다.
- G02: Ref는 owner/entity/id/revision을 함께 고정한다. 수신자는 원본 소유자와 entity의 조합 및 실제 존재/버전·기업 관계를 검증한다. 원본 payload/사실/승인 근거를 역참조할 때 서버 권한을 적용한다. 구매 당시 가격/조건은 purchaseTermsSnapshotRef에 동결하고 최신 가격/계약 개정을 소급 적용하지 않는다.
- G03: 주문의 TargetScope는 enterpriseRef·departmentRef·siteRef·contextPolicyRef·organisationRevision을 기록하고 대금/HW/SW/후속/조회에 같은 문맥을 연결한다. null 부서/사업장은 승인된 조직 문맥 정책에서 명시적으로 하위 보호 단위가 없는 경우만 허용하며 미확인/누락을 뜻하지 않는다. 필요한 보호 문맥이 없으면 제출 권한을 검증할 수 없어 거절한다. 요청자의 현재 소속에서 과거 주문의 문맥을 추측하지 않는다. 조직 재편/이동 효력은 OQ4의 구현 전 정책으로 확인한다.
- G04: ServiceContext는 서버가 만든 신원/접근/실행 근거다. HTTP 입력에 이 값을 받지 않으며 클라이언트의 계정·MFA·역할 주장으로 생성하지 않는다. 모든 조회/변경/접수 재조회에 현재 대상/행위 권한을 확인한다. 행위별 범위를 합집합으로 평가하며 다른 행위의 부서·사업장 범위를 교차 조합하지 않는다. 직원은 사내망/승인 원격 PC·MFA와 해당 업무 권한을 모두 만족해야 한다.
- G05: 계약 등록/승인에서는 확인된 동일인 원본으로 등록자와 승인자가 다른 사람인지 검증한다. 다른 계정으로 자기 승인도 금지한다. SW 기간 조정은 등록과 승인을 별도 행동으로 기록하며 동일인이 두 권한을 가진 경우 별도 승인할 수 있다. 공급자는 두 정책을 혼합하지 않는다.
- G06: Idempotency-Key와 meta.clientRequestId는 같아야 한다. 최초 호출의 principal/audience/operation/대상·정규화 입력에 키를 결합한다. 같은 키·같은 내용은 이전 접수/결과를 현재 권한으로 투영해 반환하고 다시 실행하지 않는다. 같은 키·다른 내용은409다. expectedRevision은 신규 생성에서 null, 기존 대상 변경에서 현재 원본 버전이어야 한다. 경합 또는 오래된 승인/제안은409이며 덮어쓰기/자동 동의로 바꾸지 않는다.
- G07: 202/Receipt.ACCEPTED는 검증된 요청·접수 결과와 필요한 작업/확정 사실이 지속 커밋된 후만 반환한다. 저장/커밋 여부 불명에서는 성공 접수로 답하지 않는다. timeout 뒤 같은 요청 식별자로 원래 결과를 대조한다. Receipt.RESULT_RECORDED는 그 행동의 원본 결과가 기록됐다는 뜻이며 거래 전체 완료·지급/출고/발급 성공은 해당 resultRefs의 확인 사실로 판단한다.
- G08: 업무 변경·생성할 작업/확정 사실과 소비자 처리 완료 표지를 논리 원자적 커밋으로 연결한다. 발행은 커밋된 사실만 대상으로 한다. 반복 전달을 인정하고 eventId/workId·소비자·원본 버전으로 중복 효과를 차단한다. 오래되거나 역순인 사실은 최신 원본/정정 관계를 대조하고 최신 상태를 되돌리지 않는다. 버전 간 공백·소유자 결과 불명은 대조/확인 대기로 유지한다. 물리 저장/전달 구현과 장애 범위별 보존 증거는 후속 NFR/Infrastructure의 구현 전 조건이다.
- G09: workId는 외부 시도 ID와 다르다. 여러 기술 시도는 같은 원래 operationId/idempotencyKey를 참조한다. 실제 부작용 여부가 불명인 외부 호출은 무조건 재전송하지 않고 원래 결과 확인/직원 대조로 연결한다. 기술 재시도는 안전성을 검증한 일시 실패만 deadline/횟수/대기 정책 안에서 허용한다. DB/브로커가 exactly-once 효과를 보장한다고 가정하지 않는다.
- G10: 고객 주문은 HW/SW를 분리하고 같은 타입의 다품목/수량을 허용한다. 계약과 모든 품목의 공급 가능성/납기가 확인돼야 전체 자동 수락한다. 공급 포트 없음·UNVERIFIED/CONFLICT·조회 실패는 전체 확인 대기다. 무효 기업/권한/타입/입력은 거절하며 직원 판단으로 우회하지 않는다. 수락은 지급/물리 확보/출고/발급 완료가 아니다.
- G11: FULL 제공이 기본이며 PARTIAL은 유효한 고객 동의와 품목·수량·지급/기간 조건이 필요하다. PREPAY/POSTPAY 혼합의 전체 선결제액은 선결제 품목만 대상으로 한다. 이미 제공된 양과 선결제 기준별 허용 양을 원본 소유자가 계산하고 과다 배분/환불/예약/출고/발급/회수를 금지한다.
- G12: HW 확보4정책과 배송 또는 고객 인수의 계약상 완료 기준을 지킨다. SW는 발급·고객이 확인 가능한 결과와 합의 시작일이 모두 충족돼야 제공 완료다. 조기 설치/시험은 후불 기산을 앞당기지 않고 지연 발급은 완료를 소급하지 않는다. 선후불 기산은 확인된 제공 건/수량의 원본 기준을 사용한다.
- G13: Money.value는 부동소수점 대신 정확한10진 문자열이다. 산식·반올림·허용 정밀도·계약 필수 값은 OQ1/OQ2에서 코드 전에 확정한다. Quantity는 정수이며 제출 수량은 양수다. 검사 부하의50품목을 제품 입력 상한으로 적용하지 않는다. Period의 날짜와 종료 경계 규칙은 합의된 ruleRef와 함께 보존한다. 날짜 순서/달력/경계/기간 산식은 Functional Design에서 확정해 검증한다.
- G14: SW 영구/기간제·구매 당시 기간/실제 기간·조정/승인·회차/유예/보상을 구별한다. 기업 계약이 개별 자동 갱신보다 우선한다. 보상은 기존 갱신 일정을 자동 이동시키지 않는다. 합의 범위 밖 가격은 새 제안 버전·고객 동의가 필요하다. 수동/자동 갱신 모두 지급/명시 유예·실제 적용을 확인하며 보상 중첩 요금은 합의 산식 또는 승인 금액으로 대조한다.
- G15: 고객 CHANGE/CANCEL/RETURN은 전체 주문 단위이며 고객 품목/수량 선택 기능을 추가하지 않는다. 내부 실제 부분 회수/환불/잔량은 HW/SW/대금 소유자에 있다. 후속 판단과 보류/계속은 합의 근거를 사용하고 없거나 충돌하면 직원 판단이다. 승인된 환불/회수 요청과 실제 완료를 별도 원본 결과로 연결한다.
- G16: ReadResult.KNOWN만 해당 data의 확인 값이다. UNKNOWN/CONFLICT/UNAVAILABLE을0원·미지급·실패·전체 완료로 바꾸지 않는다. InquiryView는 소유자별 확인 시점·출처를 유지하고 권한 없는 section은 아예 제외한다. 허용된 조회/행동을 UI에 반환해도 실행 소유자가 권한/최신 조건을 재검증한다.
- G17: 목록은 허용된 필터 결과의 items/nextCursor다. 제품·주문·통지 목록에서 미허용 자료의 수/존재·민감 금액/키를 요약/이력/오류로 누출하지 않는다. HTTP GET은 본문 없이 query/path를 사용한다. targetRef·scope 등은 서버가 id/현재권한/원본에서 구성하며 클라이언트가 주장한 범위로 바꾸지 않는다. pageSize·필터·입력/출력 상한·조회 갱신 주기는 OQ8의 구현 전 검증 항목이다.
- G18: 통지는 최소 내용/로그인 링크와 허용된 조치만 전달한다. 이메일에 라이선스 키/계약 상세를 넣지 않는다. 발송 요청/수락과 실제 전달/수신·업무 동의/완료를 구별한다. SYSTEM 자동 복구 시도 시작부터 개발자 메신저·이메일 알림, 실패/수동 필요 긴급 알림을 유지한다. 모든 개별 호출 재시도에 신규 알림을 추가하지 않는다. OMS 장애 중 독립 전송 경로는 C26/NFR/Infra/운영에서 검증한다.
- G19: 인증 계약은 등록/로그인/MFA/복구 목적의 제한된 challenge만 허용한다. public 또는 제한 세션으로 업무 권한을 얻지 못한다. MFA 등록/복구 검증은 필요한 경우 아직 MFA가 없는 목적 제한 세션으로만 진입하며 완료 전 기업 업무 세션으로 승격하지 않는다. 이메일만으로 MFA를 해제하지 않고 재등록 시 이전 수단 무효화·이력·통지를 지킨다.
- G20: 브라우저 전송 제안은 audience별 opaque session cookie와 변경의 CSRF token이다. cookie의 Secure/HttpOnly·적합한 SameSite, origin/CSRF 검증, 세션 발급/무효화·MFA 상태·대상 audience를 서버가 검증한다. 인증 제품·cookie domain/네트워크 제공 방식·기간/변경 효력은 OQ4/NFR의 구현 전 확인 대상이다. STAFF 접점은 공개 고객 진입 경로에서 접근 불가해야 하고 URL 접두어/화면 폭만으로 보안을 판정하지 않는다.
- G21: 외부 어댑터 입력/결과는 OMS가 구현할 논리 계약이다. 요청 허용/전송 성공만으로CONFIRMED를 만들지 않는다. 신뢰 주체/인증·중복/최신성·target/correlation/source 원본·증거가 검증된 결과만 업무 소유자가 확정한다. 인증 주체의 결과와 금융/HW/SW 결과의 세부 자료는 각 소유자별 모델로 확인하고 미선정 업체의 실제 요청 body/콜백을 추측하지 않는다.
- G22: 경로의 부모/대상 id와 body의 대상 Ref는 같은 원본 문맥이어야 한다. 입력 action/requestType은 해당 operation의 고정 값과 일치해야 하며 Call도 operation별 입력만 허용한다. StaffRole.actions는 허용된 직원 행위 레지스트리의 값만 받아 SYSTEM 전용/미확인 행위를 거절한다. 초대는 확인된 계정/가입이 연결되기 전 정식 활성 소속/권한으로 보지 않는다.
- G23: RFC9457의 type은 안정적인 문제 유형 식별자이며 OMS code와 의미가 일치해야 한다. body.status는 실제 HTTP 실패 상태와 일치한다. 공개 인증/복구 POST도 origin·목적/subject/challenge/state와 입력을 검증하고 존재 비노출·요청 한도/로그 비밀 제외를 적용한다. purpose-limited 세션을 업무 세션/직원 승인에 사용할 수 없다.

## Per-contract Specifications


### C00 — 공유 계약 값

공급: U1; 소비: U2–U10; 명세 의미 소유: U1; 각 업무 필드는 원본 소유자. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:common:1
title: OMS 경계 값·입력·허용 조회·접수/사실의 공유 스키마
$defs:
  Id: {type: string, minLength: 1}
  Revision: {type: integer, minimum: 1}
  Instant: {type: string, format: date-time}
  Date: {type: string, format: date}
  Quantity: {type: integer, minimum: 0}
  PositiveQuantity: {type: integer, minimum: 1}
  Money:
    type: object
    properties:
      currency: {const: KRW}
      value: {type: string, pattern: '^(0|[1-9][0-9]*)(\.[0-9]+)?$'}
    required: [currency, value]
    additionalProperties: false
  Ref:
    oneOf:
    - type: object
      properties:
        owner: {const: IdentityRecovery}
        entity:
          type: string
          enum: [Account, VerifiedPersonLink, MfaEnrollment, RecoveryCase, IdentityHistory]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: EnterpriseAccess}
        entity:
          type: string
          enum: [EnterpriseApplication, Enterprise, Department, BusinessSite, EnterpriseMembership, CustomerRole, CustomerRoleGrant, StaffRole, StaffRoleGrant,
            ActionScope, AccessHistory]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: ProductCatalog}
        entity:
          type: string
          enum: [Product, CommonOfferRevision, CatalogHistory]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: CommercialAgreement}
        entity:
          type: string
          enum: [EnterpriseContract, AgreementRevision, ContractChangeRequest, AgreementApproval, EnterpriseOfferException, CommercialProposal, CustomerConsent,
            AgreementHistory]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: OrderAcceptance}
        entity:
          type: string
          enum: [Order, OrderLine, PurchaseTermsSnapshot, ProvisionChoice, AcceptanceDecision, OrderChangeApplication, OrderHistory]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: FinancialSettlement}
        entity:
          type: string
          enum: [Invoice, PaymentEvidence, PaymentAllocation, FinancialEligibility, RefundCase, RenewalFeeAdjustment, FinancialExchange, FinancialReconciliationCase,
            FinancialHistory]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: HardwareFulfillment}
        entity:
          type: string
          enum: [HardwareSupplyAssessment, HardwareFulfillmentCase, StockReservation, ProcurementProgress, ShipmentTranche, HardwareReturn, HardwareExchange,
            HardwareReconciliationCase, HardwareHistory]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: SoftwareLifecycle}
        entity:
          type: string
          enum: [SoftwareSupplyAssessment, EnterpriseEntitlement, IssuanceAttempt, PeriodAdjustment, PeriodAdjustmentApproval, RenewalRequest, AutoRenewalAgreement,
            RenewalCycle, EntitlementRevocation, SoftwareExchange, SoftwareReconciliationCase, SoftwareHistory]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: AfterSalesDecision}
        entity:
          type: string
          enum: [AfterSalesRequest, AfterSalesDecisionRecord, AfterSalesHistory]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: NotificationDelivery}
        entity:
          type: string
          enum: [NotificationIntent, NotificationDeliveryAttempt]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
    - type: object
      properties:
        owner: {const: OperationalAssurance}
        entity:
          type: string
          enum: [OperationalEvidence, RecoveryVerification, MaintenanceEvidence, AvailabilityEvaluation, DataLocationEvidence, OperatingEffortEvidence]
        id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      required: [owner, entity, id, revision]
      additionalProperties: false
  Refs:
    type: array
    items: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    minItems: 0
  TargetScope:
    type: object
    properties:
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      departmentRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      siteRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      contextPolicyRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      organisationRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
    required: [enterpriseRef, departmentRef, siteRef, contextPolicyRef, organisationRevision]
    additionalProperties: false
  Period:
    type: object
    properties:
      startDate: {$ref: 'urn:oms:contract:common:1#/$defs/Date'}
      endDate: {$ref: 'urn:oms:contract:common:1#/$defs/Date'}
      timeZone: {const: Asia/Seoul}
      endRule:
        type: string
        enum: [INCLUSIVE_DATE, EXCLUSIVE_DATE]
      ruleRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    required: [startDate, endDate, timeZone, endRule, ruleRef]
    additionalProperties: false
  Evidence:
    type: object
    properties:
      evidenceRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      source:
        type: string
        enum: [STAFF, VERIFIED_ADAPTER, SYSTEM]
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      confirmation:
        type: string
        enum: [CONFIRMED, UNCONFIRMED, CONFLICT]
    required: [evidenceRef, source, observedAt, confirmation]
    additionalProperties: false
  ServiceContext:
    type: object
    properties:
      principalId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      actorAccountRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      verifiedPersonRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      identityAssertionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      audience:
        type: string
        enum: [CUSTOMER, STAFF, SYSTEM]
      accessEvaluationRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      executionPermitRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      correlationId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      deadlineAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [principalId, actorAccountRef, verifiedPersonRef, identityAssertionRef, audience, accessEvaluationRef, executionPermitRef, correlationId,
      deadlineAt]
    additionalProperties: false
  CommandMeta:
    type: object
    properties:
      clientRequestId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      expectedRevision:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
        - {type: 'null'}
      reason: {type: string, minLength: 1}
      evidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [clientRequestId, expectedRevision, reason, evidenceRefs]
    additionalProperties: false
  Receipt:
    type: object
    properties:
      requestId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      requestState:
        type: string
        enum: [ACCEPTED, PROCESSING, RESULT_RECORDED, REVIEW_REQUIRED, TECHNICAL_FAILED]
      owner:
        type: string
        enum: [IdentityRecovery, EnterpriseAccess, ProductCatalog, CommercialAgreement, OrderAcceptance, FinancialSettlement, HardwareFulfillment, SoftwareLifecycle,
          AfterSalesDecision, NotificationDelivery, OperationalAssurance]
      targetRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      resultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      acceptedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      updatedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      statusRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      retryAfterMilliseconds:
        anyOf:
        - {type: integer, minimum: 1}
        - {type: 'null'}
    required: [requestId, requestState, owner, targetRef, resultRefs, acceptedAt, updatedAt, statusRevision, retryAfterMilliseconds]
    additionalProperties: false
  Problem:
    type: object
    properties:
      type: {type: string, format: uri-reference}
      title: {type: string, minLength: 1}
      status: {type: integer, minimum: 400, maximum: 599}
      detail: {type: string, minLength: 1}
      instance: {type: string, format: uri-reference}
      code:
        type: string
        enum: [INVALID_INPUT, AUTHENTICATION_REQUIRED, MFA_REQUIRED, ACCESS_DENIED, NOT_FOUND, REVISION_CONFLICT, IDEMPOTENCY_CONFLICT, DEPENDENCY_UNAVAILABLE,
          RATE_LIMITED, TECHNICAL_FAILURE]
      traceId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      fieldErrors:
        type: array
        items:
          type: object
          properties:
            pointer: {type: string, minLength: 1}
            code: {type: string, minLength: 1}
          required: [pointer, code]
          additionalProperties: false
        minItems: 0
    required: [type, title, status, code, traceId]
  ReadRequest:
    type: object
    properties:
      targetRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      scope:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
        - {type: 'null'}
      cursor:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        - {type: 'null'}
      pageSize: {type: integer, minimum: 1}
      sourceRevision:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
        - {type: 'null'}
    required: [targetRef, scope, cursor, pageSize, sourceRevision]
    additionalProperties: false
  RecordQuery:
    type: object
    properties:
      targetRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    required: [targetRef]
    additionalProperties: false
  LoginInput:
    type: object
    properties:
      loginIdentifier: {type: string, minLength: 1}
    required: [loginIdentifier]
    additionalProperties: false
  RegistrationInput:
    type: object
    properties:
      loginIdentifier: {type: string, minLength: 1}
      contactAddress: {type: string, minLength: 1}
      displayName: {type: string, minLength: 1}
    required: [loginIdentifier, contactAddress, displayName]
    additionalProperties: false
  ChallengeInput:
    type: object
    properties:
      challengeId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      response: {type: string, minLength: 1, writeOnly: true}
    required: [challengeId, response]
    additionalProperties: false
  PreIdentityContext:
    type: object
    properties:
      attemptId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      audience:
        type: string
        enum: [CUSTOMER, STAFF]
      correlationId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      deadlineAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [attemptId, audience, correlationId, deadlineAt]
    additionalProperties: false
  LimitedIdentityContext:
    type: object
    properties:
      subjectAccountRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      challengeId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      purpose:
        type: string
        enum: [MFA_ENROLMENT, RECOVERY_VERIFICATION]
      verificationBasisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      audience:
        type: string
        enum: [CUSTOMER, STAFF]
      correlationId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      deadlineAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [subjectAccountRef, challengeId, purpose, verificationBasisRefs, audience, correlationId, deadlineAt]
    additionalProperties: false
  RecoveryInput:
    type: object
    properties:
      loginIdentifier: {type: string, minLength: 1}
      recoveryResponse: {type: string, minLength: 1, writeOnly: true}
    required: [loginIdentifier]
    additionalProperties: false
  IdentityView:
    type: object
    properties:
      accountRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      challengeId:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        - {type: 'null'}
      phase:
        type: string
        enum: [CHALLENGE_REQUIRED, MFA_REQUIRED, MFA_VERIFIED, RECOVERY_REVIEW, RECOVERY_RECORDED]
      personLinkRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      resultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [accountRef, challengeId, phase, personLinkRef, resultRefs]
    additionalProperties: false
  ActionScope:
    type: object
    properties:
      action:
        type: string
        enum: [product.read, order.read, order.submit, payment.read, entitlement.read, renewal.request, autoRenewal.request, autoRenewal.cancel, order.change.request,
          order.cancel.request, order.return.request, organisation.manage, user.manage, role.manage, contract.change.request]
      kind:
        type: string
        enum: [DEPARTMENT_SITE, SITE_ALL_DEPARTMENTS, DEPARTMENT_ALL_SITES, ENTERPRISE_ALL]
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      departmentRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      siteRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [action, kind, enterpriseRef, departmentRefs, siteRefs]
    additionalProperties: false
  EnterpriseInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      legalName: {type: string, minLength: 1}
      registrationEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      designatedContact: {type: string, minLength: 1}
    required: [meta, legalName, registrationEvidenceRefs, designatedContact]
    additionalProperties: false
  DecisionInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      targetRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      decision:
        type: string
        enum: [APPROVE, DECLINE]
      basisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, targetRef, decision, basisRefs]
    additionalProperties: false
  OrganisationInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      entityKind:
        type: string
        enum: [DEPARTMENT, BUSINESS_SITE]
      label: {type: string, minLength: 1}
      active: {type: boolean}
      changeKind:
        type: string
        enum: [CREATE, UPDATE]
      organisationRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
    required: [meta, entityKind, label, active, changeKind, organisationRef]
    additionalProperties: false
    allOf:
    - if:
        properties:
          changeKind: {const: CREATE}
      then:
        properties:
          organisationRef: {type: 'null'}
          meta:
            properties:
              expectedRevision: {type: 'null'}
    - if:
        properties:
          changeKind: {const: UPDATE}
      then:
        properties:
          organisationRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          meta:
            properties:
              expectedRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
    - if:
        properties:
          entityKind: {const: DEPARTMENT}
          changeKind: {const: UPDATE}
      then:
        properties:
          organisationRef:
            allOf:
            - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            - properties:
                owner: {const: EnterpriseAccess}
                entity: {const: Department}
    - if:
        properties:
          entityKind: {const: BUSINESS_SITE}
          changeKind: {const: UPDATE}
      then:
        properties:
          organisationRef:
            allOf:
            - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            - properties:
                owner: {const: EnterpriseAccess}
                entity: {const: BusinessSite}
  MembershipInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      accountRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      departmentRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      siteRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      active: {type: boolean}
      administrator: {type: boolean}
    required: [meta, accountRef, departmentRef, siteRef, active, administrator]
    additionalProperties: false
  RoleInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      label: {type: string, minLength: 1}
      actionScopes:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/ActionScope'}
        minItems: 0
    required: [meta, label, actionScopes]
    additionalProperties: false
  RoleGrantInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      accountRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      roleRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      decision:
        type: string
        enum: [GRANT, REVOKE]
    required: [meta, accountRef, roleRef, decision]
    additionalProperties: false
  StaffRoleInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      label: {type: string, minLength: 1}
      actions:
        type: array
        items: {type: string, minLength: 1}
        minItems: 1
    required: [meta, label, actions]
    additionalProperties: false
  AccessInput:
    type: object
    properties:
      identityAssertionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      principalId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      action: {type: string, minLength: 1}
      targetScope: {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
      targetRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      audience:
        type: string
        enum: [CUSTOMER, STAFF, SYSTEM]
    required: [identityAssertionRef, principalId, action, targetScope, targetRef, audience]
    additionalProperties: false
  AccessView:
    type: object
    properties:
      decision:
        type: string
        enum: [ALLOW, DENY, UNVERIFIED]
      evaluationRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      action: {type: string, minLength: 1}
      targetScope: {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
      evaluatedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      permissionRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
    required: [decision, evaluationRef, action, targetScope, evaluatedAt, permissionRevision]
    additionalProperties: false
  EnterpriseView:
    type: object
    properties:
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      approvalState:
        type: string
        enum: [PENDING, APPROVED, DECLINED, UNVERIFIED]
      organisationRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      membershipRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      roleRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      administratorCount: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
      scopeGrants:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/ActionScope'}
        minItems: 0
      departments:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/OrganisationView'}
        minItems: 0
      sites:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/OrganisationView'}
        minItems: 0
      memberships:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/MembershipView'}
        minItems: 0
      customerRoles:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/CustomerRoleView'}
        minItems: 0
    required: [enterpriseRef, approvalState, organisationRefs, membershipRefs, roleRefs, administratorCount, scopeGrants]
    additionalProperties: false
  ProductInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      productType:
        type: string
        enum: [HARDWARE, SOFTWARE]
      softwareTermKind:
        anyOf:
        - type: string
          enum: [PERPETUAL, TERM]
        - {type: 'null'}
      label: {type: string, minLength: 1}
      salesDescription: {type: string, minLength: 1}
      commonPrice: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
      salesConditionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, productType, softwareTermKind, label, salesDescription, commonPrice, salesConditionRefs]
    additionalProperties: false
  ProductView:
    type: object
    properties:
      productRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      commonOfferRevisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      productType:
        type: string
        enum: [HARDWARE, SOFTWARE]
      softwareTermKind:
        anyOf:
        - type: string
          enum: [PERPETUAL, TERM]
        - {type: 'null'}
      label: {type: string, minLength: 1}
      salesDescription: {type: string, minLength: 1}
      visible: {type: boolean}
      resolvedPrice:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
        - {type: 'null'}
      salesConditionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      priceKnowledge:
        type: string
        enum: [KNOWN, UNKNOWN, CONFLICT]
    required: [productRef, commonOfferRevisionRef, productType, softwareTermKind, label, salesDescription, visible, resolvedPrice, salesConditionRefs, priceKnowledge]
    additionalProperties: false
  AgreementInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      productRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      commercialTermsRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      provisionTermsRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      renewalTermsRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      agreementEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, enterpriseRef, productRefs, commercialTermsRef, provisionTermsRef, renewalTermsRef, agreementEvidenceRefs]
    additionalProperties: false
  ContractChangeInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      requestedTerms: {type: string, minLength: 1}
      agreementEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, enterpriseRef, requestedTerms, agreementEvidenceRefs]
    additionalProperties: false
  OfferExceptionInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      productRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      agreementRevisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      visibility: {type: boolean}
      price:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
        - {type: 'null'}
    required: [meta, enterpriseRef, productRef, agreementRevisionRef, visibility, price]
    additionalProperties: false
  ProposalInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      targetOrderRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      targetEntitlementRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      targetRenewalCycleRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      originalTermsRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      proposedTermsRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      agreementEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, targetOrderRef, targetEntitlementRef, targetRenewalCycleRef, originalTermsRef, proposedTermsRef, agreementEvidenceRefs]
    additionalProperties: false
  ConsentInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      proposalRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      proposalRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      decision:
        type: string
        enum: [ACCEPT, DECLINE]
    required: [meta, proposalRef, proposalRevision, decision]
    additionalProperties: false
  AgreementView:
    type: object
    properties:
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      approvedRevisionRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      offerExceptionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      commercialTermsRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      provisionTermsRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      renewalTermsRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      proposalRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      consentRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [enterpriseRef, approvedRevisionRef, offerExceptionRefs, commercialTermsRef, provisionTermsRef, renewalTermsRef, proposalRefs, consentRefs]
    additionalProperties: false
  OrderLineInput:
    type: object
    properties:
      productRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      commonOfferRevisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      agreementRevisionRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      quantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
      paymentMode:
        type: string
        enum: [PREPAY, POSTPAY]
      requestedActivationDate:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Date'}
        - {type: 'null'}
    required: [productRef, commonOfferRevisionRef, agreementRevisionRef, quantity, paymentMode, requestedActivationDate]
    additionalProperties: false
  OrderInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      targetScope: {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
      productType:
        type: string
        enum: [HARDWARE, SOFTWARE]
      lines:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/OrderLineInput'}
        minItems: 1
      provisionChoice:
        type: string
        enum: [FULL, PARTIAL]
      partialConsentRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
    required: [meta, targetScope, productType, lines, provisionChoice, partialConsentRef]
    additionalProperties: false
  OrderLineView:
    type: object
    properties:
      orderLineRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      productRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      quantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
      purchasePrice: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
      paymentTermsRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      agreedPeriod:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
        - {type: 'null'}
      completionBasisRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    required: [orderLineRef, productRef, quantity, purchasePrice, paymentTermsRef, agreedPeriod, completionBasisRef]
    additionalProperties: false
  OrderView:
    type: object
    properties:
      orderRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      targetScope: {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
      productType:
        type: string
        enum: [HARDWARE, SOFTWARE]
      lines:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/OrderLineView'}
        minItems: 1
      purchaseTermsSnapshotRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      commonOfferRevisionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      agreementRevisionRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      provisionChoice:
        type: string
        enum: [FULL, PARTIAL]
      consentRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      acceptance:
        type: string
        enum: [REVIEW_REQUIRED, ACCEPTED, DECLINED, UNVERIFIED]
      basisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [orderRef, targetScope, productType, lines, purchaseTermsSnapshotRef, commonOfferRevisionRefs, agreementRevisionRef, provisionChoice, consentRef,
      acceptance, basisRefs]
    additionalProperties: false
  ApplyOrderChangeInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      orderRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      afterSalesDecisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      customerConsentRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      newTermsRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    required: [meta, orderRef, afterSalesDecisionRef, customerConsentRef, newTermsRef]
    additionalProperties: false
  FinancialEvidenceInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      orderLineRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      renewalCycleRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      evidenceKind:
        type: string
        enum: [INVOICE, PAYMENT, REFUND_RESULT, CORRECTION]
      amount: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
      externalReference:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        - {type: 'null'}
      sourceEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      correctionOf:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
    required: [meta, enterpriseRef, orderLineRefs, renewalCycleRefs, evidenceKind, amount, externalReference, sourceEvidenceRefs, correctionOf]
    additionalProperties: false
  AllocationInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      paymentEvidenceRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      invoiceRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      orderLineRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      amount: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
      correctionOf:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
    required: [meta, paymentEvidenceRef, invoiceRef, orderLineRefs, amount, correctionOf]
    additionalProperties: false
  FinancialActionInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      targetRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      agreementRevisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      afterSalesDecisionRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      amount:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
        - {type: 'null'}
      basisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, targetRef, agreementRevisionRef, afterSalesDecisionRef, amount, basisRefs]
    additionalProperties: false
  FinancialView:
    type: object
    properties:
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      invoiceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      confirmedPaymentRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      allocationRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      refundCaseRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      eligibilityRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      confirmedAmount: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
      unallocatedAmount: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
      refundedAmount: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
      remainingRefundLimit:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
        - {type: 'null'}
      dueDateBasisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      restrictionBasisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      invoices:
        type: array
        items:
          type: object
          properties:
            invoiceRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            orderLineRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
            renewalCycleRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
            chargedAmount: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
            paidAmount: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
            dueDate:
              anyOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Date'}
              - {type: 'null'}
            dueDateBasisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
          required: [invoiceRef, orderLineRefs, renewalCycleRefs, chargedAmount, paidAmount, dueDate, dueDateBasisRefs]
          additionalProperties: false
        minItems: 0
    required: [enterpriseRef, invoiceRefs, confirmedPaymentRefs, allocationRefs, refundCaseRefs, eligibilityRefs, confirmedAmount, unallocatedAmount, refundedAmount,
      remainingRefundLimit, dueDateBasisRefs, restrictionBasisRefs, invoices]
    additionalProperties: false
  EligibilityInput:
    type: object
    properties:
      orderRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      lineRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      renewalCycleRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      agreementRevisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    required: [orderRef, lineRefs, renewalCycleRefs, agreementRevisionRef]
    additionalProperties: false
  EligibilityView:
    type: object
    properties:
      eligibilityRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      orderRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      lineRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      renewalCycleRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      agreementRevisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      decision:
        type: string
        enum: [ALLOW, HOLD, UNVERIFIED]
      allowedQuantities:
        type: array
        items:
          type: object
          properties:
            orderLineRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            quantity: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
          required: [orderLineRef, quantity]
          additionalProperties: false
        minItems: 0
      paymentBasisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      restrictionBasisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [eligibilityRef, orderRef, lineRefs, renewalCycleRefs, agreementRevisionRef, decision, allowedQuantities, paymentBasisRefs, restrictionBasisRefs]
    additionalProperties: false
  SupplyInput:
    type: object
    properties:
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      lines:
        type: array
        items:
          type: object
          properties:
            productRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            quantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
          required: [productRef, quantity]
          additionalProperties: false
        minItems: 1
      agreementRevisionRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
    required: [enterpriseRef, lines, agreementRevisionRef]
    additionalProperties: false
  SupplyView:
    type: object
    properties:
      assessmentRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      lines:
        type: array
        items:
          type: object
          properties:
            productRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            requestedQuantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
            assessment:
              type: string
              enum: [AVAILABLE, UNAVAILABLE, UNVERIFIED, CONFLICT]
            leadTimeDate:
              anyOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Date'}
              - {type: 'null'}
            evidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
            observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
          required: [productRef, requestedQuantity, assessment, leadTimeDate, evidenceRefs, observedAt]
          additionalProperties: false
        minItems: 1
    required: [assessmentRefs, lines]
    additionalProperties: false
  HardwareActionInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      hardwareCaseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      action:
        type: string
        enum: [SECURE, RESERVE, RELEASE, SHIP, CONFIRM_COMPLETION, RETURN, RECONCILE, RETRY]
      lineQuantities:
        type: array
        items:
          type: object
          properties:
            orderLineRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            quantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
          required: [orderLineRef, quantity]
          additionalProperties: false
        minItems: 1
      financialEligibilityRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      afterSalesDecisionRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      basisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, hardwareCaseRef, action, lineQuantities, financialEligibilityRef, afterSalesDecisionRef, basisRefs]
    additionalProperties: false
  HardwareView:
    type: object
    properties:
      hardwareCaseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      orderRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      financialEligibilityRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      procurementPolicy:
        type: string
        enum: [ACCEPT_PAY_SECURE, ACCEPT_SECURE_PAY_SHIP, RESERVE_BEFORE_PAY, DEPOSIT_SECURE]
      tranches:
        type: array
        items:
          type: object
          properties:
            orderLineRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            ordered: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
            reserved: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
            secured: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
            shipped: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
            completed: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
            returned: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
            completionBasisRef:
              anyOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - {type: 'null'}
          required: [orderLineRef, ordered, reserved, secured, shipped, completed, returned, completionBasisRef]
          additionalProperties: false
        minItems: 0
      resultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      remainingActionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      providedTranches:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionTranche'}
        minItems: 0
    required: [hardwareCaseRef, orderRef, financialEligibilityRef, procurementPolicy, tranches, resultRefs, remainingActionRefs]
    additionalProperties: false
  SoftwareActionInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      entitlementRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      action:
        type: string
        enum: [ISSUE, RENEW, AUTO_RENEW_APPLY, AUTO_RENEW_CANCEL, RECONCILE, RETRY, REVOKE]
      quantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
      agreementRevisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      financialEligibilityRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      afterSalesDecisionRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      proposalConsentRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      basisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, entitlementRef, action, quantity, agreementRevisionRef, financialEligibilityRef, afterSalesDecisionRef, proposalConsentRef, basisRefs]
    additionalProperties: false
  PeriodInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      entitlementRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      proposedPeriod: {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
      adjustmentKind:
        type: string
        enum: [EARLY_ACCESS, COMPENSATION, AGREED_CHANGE]
      agreementEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, entitlementRef, proposedPeriod, adjustmentKind, agreementEvidenceRefs]
    additionalProperties: false
  SoftwareView:
    type: object
    properties:
      entitlementRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      enterpriseRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      productRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      orderLineRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      quantity: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
      termKind:
        type: string
        enum: [PERPETUAL, TERM]
      purchasePeriod:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
        - {type: 'null'}
      actualPeriods:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
        minItems: 0
      issuanceResultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      deliveryResultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      completionBasisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      periodAdjustmentRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      renewalCycleRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      autoRenewalAgreementRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      revocationResultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      providedTranches:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionTranche'}
        minItems: 0
    required: [entitlementRef, enterpriseRef, productRef, orderLineRef, quantity, termKind, purchasePeriod, actualPeriods, issuanceResultRefs, deliveryResultRefs,
      completionBasisRefs, periodAdjustmentRefs, renewalCycleRefs, autoRenewalAgreementRef, revocationResultRefs]
    additionalProperties: false
  AfterSalesInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      orderRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      requestType:
        type: string
        enum: [CHANGE, CANCEL, RETURN]
      requestedTerms:
        anyOf:
        - {type: string, minLength: 1}
        - {type: 'null'}
      basisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, orderRef, requestType, requestedTerms, basisRefs]
    additionalProperties: false
  AfterSalesDecisionInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      afterSalesRequestRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      agreementRevisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      observedStateRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      decision:
        type: string
        enum: [ALLOW, DECLINE, REVIEW_REQUIRED]
      progressPolicy:
        type: string
        enum: [HOLD, CONTINUE, REVIEW_REQUIRED]
      allowedChangeRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      returnQuantityBasisRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      refundLimitRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      agreementEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, afterSalesRequestRef, agreementRevisionRef, observedStateRefs, decision, progressPolicy, allowedChangeRef, returnQuantityBasisRef,
      refundLimitRef, agreementEvidenceRefs]
    additionalProperties: false
  AfterSalesView:
    type: object
    properties:
      requestRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      orderRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      decisionRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      decision:
        type: string
        enum: [ALLOW, DECLINE, REVIEW_REQUIRED, UNVERIFIED]
      holdBasisRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      actualResultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      remainingActionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [requestRef, orderRef, decisionRef, decision, holdBasisRef, actualResultRefs, remainingActionRefs]
    additionalProperties: false
  NotificationView:
    type: object
    properties:
      notificationRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      minimalText: {type: string, minLength: 1}
      loginPath: {type: string, pattern: '^/[A-Za-z0-9/_-]*$'}
      createdAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      readAt:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        - {type: 'null'}
      requiredActionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [notificationRef, minimalText, loginPath, createdAt, readAt, requiredActionRefs]
    additionalProperties: false
  NoticeInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      notificationRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    required: [meta, notificationRef]
    additionalProperties: false
  HistoryView:
    type: object
    properties:
      historyRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      sourceFactRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      correctionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      items:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryItem'}
        minItems: 0
    required: [historyRefs, sourceFactRefs, correctionRefs, observedAt, items]
    additionalProperties: false
  IdentityViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  EnterpriseViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  ProductViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ProductView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  AgreementViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  OrderViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/OrderView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  FinancialViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  HardwareViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  SoftwareViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  AfterSalesViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  NotificationViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  InquiryView:
    type: object
    properties:
      targetScope: {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
      order: {$ref: 'urn:oms:contract:common:1#/$defs/OrderViewResult'}
      agreement: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResult'}
      financial: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialViewResult'}
      hardware: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareViewResult'}
      software: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareViewResult'}
      afterSales: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesViewResult'}
      history: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
      allowedActions:
        type: array
        items: {type: string, minLength: 1}
        minItems: 0
      retryAfterMilliseconds:
        anyOf:
        - {type: integer, minimum: 1}
        - {type: 'null'}
    required: [targetScope, order, allowedActions, retryAfterMilliseconds]
    additionalProperties: false
  InquiryViewResult:
    type: object
    properties:
      knowledge:
        type: string
        enum: [KNOWN, PARTIAL, UNAVAILABLE]
      data: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryView'}
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [knowledge, data, observedAt]
    additionalProperties: false
  DiagnosticInput:
    type: object
    properties:
      owner:
        type: string
        enum: [IdentityRecovery, EnterpriseAccess, ProductCatalog, CommercialAgreement, OrderAcceptance, FinancialSettlement, HardwareFulfillment, SoftwareLifecycle,
          AfterSalesDecision, NotificationDelivery, OperationalAssurance]
      requestRefs:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        minItems: 0
      factRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      from: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      to: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [owner, requestRefs, factRefs, from, to]
    additionalProperties: false
  DiagnosticView:
    type: object
    properties:
      owner: {type: string, minLength: 1}
      acknowledgedRequestRefs:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        minItems: 0
      storedReceiptRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      committedFactRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      pendingWorkRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      historyRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      correctionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      coverage:
        type: string
        enum: [COMPLETE, PARTIAL, UNAVAILABLE]
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      limitations:
        type: array
        items: {type: string, minLength: 1}
        minItems: 0
    required: [owner, acknowledgedRequestRefs, storedReceiptRefs, committedFactRefs, pendingWorkRefs, historyRefs, correctionRefs, coverage, observedAt,
      limitations]
    additionalProperties: false
  OperatingEvidenceInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      evidenceKind:
        type: string
        enum: [RECOVERY_ATTEMPT, RECOVERY_FAILURE, RECOVERY_VERIFICATION, MAINTENANCE, AVAILABILITY, DATA_LOCATION, HUMAN_EFFORT]
      sourceRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      measurementProfileRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      evidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      startedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      endedAt:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        - {type: 'null'}
      humanSeconds:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
        - {type: 'null'}
      automaticWaitSeconds:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
        - {type: 'null'}
      elapsedSeconds:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
        - {type: 'null'}
      verification:
        type: string
        enum: [VERIFIED, FAILED, UNVERIFIED]
    required: [meta, evidenceKind, sourceRef, measurementProfileRef, evidenceRefs, startedAt, endedAt, humanSeconds, automaticWaitSeconds, elapsedSeconds,
      verification]
    additionalProperties: false
  OperationalView:
    type: object
    properties:
      evidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      recoveryVerificationRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      availabilityEvaluationRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      dataLocationEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      operatingEffortRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      verification:
        type: string
        enum: [VERIFIED, FAILED, UNVERIFIED]
      limitations:
        type: array
        items: {type: string, minLength: 1}
        minItems: 0
    required: [evidenceRefs, recoveryVerificationRefs, availabilityEvaluationRefs, dataLocationEvidenceRefs, operatingEffortRefs, verification, limitations]
    additionalProperties: false
  Fact:
    type: object
    properties:
      eventId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      schemaVersion: {const: 1.0.0}
      sourceOwner:
        type: string
        enum: [IdentityRecovery, EnterpriseAccess, ProductCatalog, CommercialAgreement, OrderAcceptance, FinancialSettlement, HardwareFulfillment, SoftwareLifecycle,
          AfterSalesDecision, NotificationDelivery, OperationalAssurance]
      sourceFactRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      aggregateRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      aggregateVersion: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      targetScope:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
        - {type: 'null'}
      occurredAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      causationRequestId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      correlationId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      supersedesFactRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      evidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [eventId, schemaVersion, sourceOwner, sourceFactRef, aggregateRef, aggregateVersion, targetScope, occurredAt, causationRequestId, correlationId,
      supersedesFactRef, evidenceRefs]
    additionalProperties: false
  Work:
    type: object
    properties:
      workId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      requestId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      owner: {type: string, minLength: 1}
      operationId: {type: string, minLength: 1}
      targetRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      sourceFactRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      executionPermitRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      expectedRevision:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
        - {type: 'null'}
      notBefore: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      deadlineAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      attempt: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
      correlationId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
    required: [workId, requestId, owner, operationId, targetRef, sourceFactRef, executionPermitRef, expectedRevision, notBefore, deadlineAt, attempt, correlationId]
    additionalProperties: false
  ExternalRequest:
    type: object
    properties:
      operationId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      owner: {type: string, minLength: 1}
      targetRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      action: {type: string, minLength: 1}
      idempotencyKey: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      expectedRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      approvedBasisRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      deadlineAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [operationId, owner, targetRef, action, idempotencyKey, expectedRevision, approvedBasisRefs, deadlineAt]
    additionalProperties: false
  ExternalObservation:
    type: object
    properties:
      operationId: &id001 {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      owner: &id002 {type: string, minLength: 1}
      targetRef: &id003 {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      externalReference: &id004
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        - {type: 'null'}
      result: &id005
        type: string
        enum: [CONFIRMED, UNCONFIRMED, CONFLICT, TECHNICAL_FAILURE]
      evidenceRefs: &id006 {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      observedAt: &id007 {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      correctionOf: &id008
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
    required: [operationId, owner, targetRef, externalReference, result, evidenceRefs, observedAt, correctionOf]
    additionalProperties: false
  BuildManifest:
    type: object
    properties:
      audience:
        type: string
        enum: [CUSTOMER, STAFF]
      releaseId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      supportedContractVersions:
        type: array
        items: {type: string, minLength: 1}
        minItems: 1
      artifactDigest: {type: string, minLength: 1}
      minimumCssWidth: {const: 1280}
      language: {const: ko-KR}
      networkPolicyRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      smokeEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [audience, releaseId, supportedContractVersions, artifactDigest, minimumCssWidth, language, networkPolicyRef, smokeEvidenceRefs]
    additionalProperties: false
  Binding:
    type: object
    properties:
      owner: {type: string, minLength: 1}
      interfaceId: {type: string, minLength: 1}
      contractVersion: {type: string, minLength: 1}
      capabilities:
        type: array
        items: {type: string, minLength: 1}
        minItems: 0
      executionRole:
        type: string
        enum: [API, WORKER, OPERATIONS]
      bindingRef: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
    required: [owner, interfaceId, contractVersion, capabilities, executionRole, bindingRef]
    additionalProperties: false
  BindingManifest:
    type: object
    properties:
      releaseId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      bindings:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/Binding'}
        minItems: 0
      schemaDigests:
        type: array
        items:
          type: object
          properties:
            schemaId: {type: string, format: uri}
            digest: {type: string, minLength: 1}
          required: [schemaId, digest]
          additionalProperties: false
        minItems: 0
      verificationRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [releaseId, bindings, schemaDigests, verificationRefs]
    additionalProperties: false
  ProductViewResultPage:
    type: object
    properties:
      items:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/ProductViewResult'}
        minItems: 0
      nextCursor:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        - {type: 'null'}
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [items, nextCursor, observedAt]
    additionalProperties: false
  AgreementViewResultPage:
    type: object
    properties:
      items:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResult'}
        minItems: 0
      nextCursor:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        - {type: 'null'}
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [items, nextCursor, observedAt]
    additionalProperties: false
  InquiryViewResultPage:
    type: object
    properties:
      items:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResult'}
        minItems: 0
      nextCursor:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        - {type: 'null'}
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [items, nextCursor, observedAt]
    additionalProperties: false
  NotificationViewResultPage:
    type: object
    properties:
      items:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationViewResult'}
        minItems: 0
      nextCursor:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        - {type: 'null'}
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [items, nextCursor, observedAt]
    additionalProperties: false
  OrganisationView:
    type: object
    properties:
      recordRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      label: {type: string, minLength: 1}
      active: {type: boolean}
    required: [recordRef, label, active]
    additionalProperties: false
  MembershipView:
    type: object
    properties:
      membershipRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      accountRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      displayName: {type: string, minLength: 1}
      departmentRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      siteRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      active: {type: boolean}
      administrator: {type: boolean}
      grantRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      invitationState:
        type: string
        enum: [NONE, PENDING, ACCEPTED, UNVERIFIED]
    required: [membershipRef, accountRef, displayName, departmentRef, siteRef, active, administrator, grantRefs, invitationState]
    additionalProperties: false
  CustomerRoleView:
    type: object
    properties:
      roleRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      label: {type: string, minLength: 1}
      actionScopes:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/ActionScope'}
        minItems: 0
    required: [roleRef, label, actionScopes]
    additionalProperties: false
  StaffRoleView:
    type: object
    properties:
      roleRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      label: {type: string, minLength: 1}
      actions:
        type: array
        items: {type: string, minLength: 1}
        minItems: 0
      grants:
        type: array
        items:
          type: object
          properties:
            grantRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            accountRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            effective: {type: boolean}
          required: [grantRef, accountRef, effective]
          additionalProperties: false
        minItems: 0
    required: [roleRef, label, actions, grants]
    additionalProperties: false
  StaffRolePage:
    type: object
    properties:
      items:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRoleView'}
        minItems: 0
      nextCursor:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        - {type: 'null'}
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [items, nextCursor, observedAt]
    additionalProperties: false
  InvitationInput:
    type: object
    properties:
      meta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
      contactAddress: {type: string, minLength: 1}
      departmentRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      siteRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      roleRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [meta, contactAddress, departmentRef, siteRef, roleRefs]
    additionalProperties: false
  ProposalTerms:
    type: object
    properties:
      termsRecordRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      lines:
        type: array
        items:
          type: object
          properties:
            productRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            quantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
            price: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
            period:
              anyOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
              - {type: 'null'}
            conditionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
          required: [productRef, quantity, price, period, conditionRefs]
          additionalProperties: false
        minItems: 1
    required: [termsRecordRef, lines]
    additionalProperties: false
  ProposalView:
    type: object
    properties:
      proposalRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      proposalRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      targetOrderRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      targetEntitlementRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      targetRenewalCycleRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      originalTerms: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalTerms'}
      proposedTerms: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalTerms'}
      agreementEvidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      consentRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      state:
        type: string
        enum: [AWAITING_CONSENT, ACCEPTED, DECLINED, STALE, UNVERIFIED]
    required: [proposalRef, proposalRevision, targetOrderRef, targetEntitlementRef, targetRenewalCycleRef, originalTerms, proposedTerms, agreementEvidenceRefs,
      consentRefs, state]
    additionalProperties: false
  ProposalViewResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  HistoryItem:
    type: object
    properties:
      historyRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      actorAccountRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      verifiedPersonRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      occurredAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      reason: {type: string, minLength: 1}
      beforeRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      afterRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      evidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      requestId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      resultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      correctionOf:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      sourceRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
    required: [historyRef, actorAccountRef, verifiedPersonRef, occurredAt, reason, beforeRef, afterRef, evidenceRefs, requestId, resultRefs, correctionOf,
      sourceRevision]
    additionalProperties: false
  DeliveryView:
    type: object
    properties:
      entitlementRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      quantity: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
      issuanceState:
        type: string
        enum: [REQUESTED, CONFIRMED, UNVERIFIED, CONFLICT]
      issuanceResultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      deliveryResultRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      purchasePeriod:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
        - {type: 'null'}
      actualPeriods:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
        minItems: 0
      protectedResultPath:
        anyOf:
        - {type: string, pattern: '^/[A-Za-z0-9/_-]+$'}
        - {type: 'null'}
      resultAvailable: {type: boolean}
    required: [entitlementRef, quantity, issuanceState, issuanceResultRefs, deliveryResultRefs, purchasePeriod, actualPeriods, protectedResultPath, resultAvailable]
    additionalProperties: false
  ApprovedTermsView:
    type: object
    properties:
      agreementRevisionRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      productScopeRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      payment:
        type: object
        properties:
          allowedModes:
            type: array
            items:
              type: string
              enum: [PREPAY, POSTPAY]
            minItems: 1
          prepayBasis:
            anyOf:
            - type: string
              enum: [ENTIRE_ORDER, PROVIDED_QUANTITY]
            - {type: 'null'}
          postpayCompletionBasis:
            anyOf:
            - type: string
              enum: [HW_DELIVERY, HW_CUSTOMER_ACCEPTANCE, SW_ISSUANCE_AVAILABLE_AND_START]
            - {type: 'null'}
          dueCalendarRuleRef:
            anyOf:
            - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            - {type: 'null'}
          dueOffsetRuleRef:
            anyOf:
            - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            - {type: 'null'}
          restrictionRuleRef:
            anyOf:
            - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            - {type: 'null'}
        required: [allowedModes, prepayBasis, postpayCompletionBasis, dueCalendarRuleRef, dueOffsetRuleRef, restrictionRuleRef]
        additionalProperties: false
      fulfilment:
        type: object
        properties:
          provisionDefault: {const: FULL}
          partialRequiresConsent: {const: true}
          procurementPolicy:
            anyOf:
            - type: string
              enum: [ACCEPT_PAY_SECURE, ACCEPT_SECURE_PAY_SHIP, RESERVE_BEFORE_PAY, DEPOSIT_SECURE]
            - {type: 'null'}
          depositAmountRuleRef:
            anyOf:
            - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            - {type: 'null'}
          reservationExpiryRuleRef:
            anyOf:
            - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            - {type: 'null'}
        required: [provisionDefault, partialRequiresConsent, procurementPolicy, depositAmountRuleRef, reservationExpiryRuleRef]
        additionalProperties: false
      renewal:
        anyOf:
        - type: object
          properties:
            enterpriseContractPriority: {const: true}
            originalScheduleRuleRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            pricingRuleRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            outsidePricingRequiresConsent: {const: true}
            graceRuleRef:
              anyOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - {type: 'null'}
            compensationDoesNotShiftSchedule: {const: true}
            overlapFeeRuleRef:
              anyOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - {type: 'null'}
          required: [enterpriseContractPriority, originalScheduleRuleRef, pricingRuleRef, outsidePricingRequiresConsent, graceRuleRef, compensationDoesNotShiftSchedule,
            overlapFeeRuleRef]
          additionalProperties: false
        - {type: 'null'}
      afterSales:
        type: object
        properties:
          changeRuleRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          cancelRuleRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          returnRuleRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          pendingProgressPolicy:
            type: string
            enum: [HOLD, CONTINUE, STAFF_REVIEW]
          refundLimitRuleRef:
            anyOf:
            - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            - {type: 'null'}
        required: [changeRuleRef, cancelRuleRef, returnRuleRef, pendingProgressPolicy, refundLimitRuleRef]
        additionalProperties: false
    required: [agreementRevisionRef, productScopeRefs, payment, fulfilment, renewal, afterSales]
    additionalProperties: false
  ApprovedTermsResult:
    oneOf:
    - type: object
      properties:
        knowledge: {const: KNOWN}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ApprovedTermsView'}
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      required: [knowledge, data, sourceRefs, observedAt]
      additionalProperties: false
    - type: object
      properties:
        knowledge:
          type: string
          enum: [UNKNOWN, CONFLICT, UNAVAILABLE]
        sourceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
        observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        safeReasonCode: {type: string, minLength: 1}
      required: [knowledge, sourceRefs, observedAt, safeReasonCode]
      additionalProperties: false
  FinancialObservation:
    type: object
    properties:
      operationId: *id001
      owner: *id002
      targetRef: *id003
      externalReference: *id004
      result: *id005
      evidenceRefs: *id006
      observedAt: *id007
      correctionOf: *id008
      amount:
        anyOf:
        - &id009 {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
        - {type: 'null'}
      direction:
        anyOf:
        - &id010
          type: string
          enum: [PAYMENT_RECEIVED, INVOICE_ISSUED, REFUND_PAID, CORRECTION]
        - {type: 'null'}
      invoiceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      orderLineRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      renewalCycleRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [operationId, owner, targetRef, externalReference, result, evidenceRefs, observedAt, correctionOf, amount, direction, invoiceRefs, orderLineRefs,
      renewalCycleRefs]
    additionalProperties: false
    allOf:
    - if:
        properties:
          result: {const: CONFIRMED}
      then:
        properties:
          amount: *id009
          direction: *id010
  HardwareObservation:
    type: object
    properties:
      operationId: *id001
      owner: *id002
      targetRef: *id003
      externalReference: *id004
      result: *id005
      evidenceRefs: *id006
      observedAt: *id007
      correctionOf: *id008
      operationKind:
        anyOf:
        - &id011
          type: string
          enum: [RESERVATION, SECURED, SHIPPED, DELIVERED, CUSTOMER_ACCEPTED, RETURNED, CORRECTION]
        - {type: 'null'}
      lineQuantities:
        type: array
        items:
          type: object
          properties:
            orderLineRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            quantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
          required: [orderLineRef, quantity]
          additionalProperties: false
        minItems: 0
      actualOccurredAt:
        anyOf:
        - &id012
          anyOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
          - {type: 'null'}
        - {type: 'null'}
    required: [operationId, owner, targetRef, externalReference, result, evidenceRefs, observedAt, correctionOf, operationKind, lineQuantities, actualOccurredAt]
    additionalProperties: false
    allOf:
    - if:
        properties:
          result: {const: CONFIRMED}
      then:
        properties:
          operationKind: *id011
          actualOccurredAt: *id012
          lineQuantities: {minItems: 1}
  SoftwareObservation:
    type: object
    properties:
      operationId: *id001
      owner: *id002
      targetRef: *id003
      externalReference: *id004
      result: *id005
      evidenceRefs: *id006
      observedAt: *id007
      correctionOf: *id008
      operationKind:
        anyOf:
        - &id013
          type: string
          enum: [ISSUED, RESULT_AVAILABLE, PERIOD_APPLIED, REVOKED, CORRECTION]
        - {type: 'null'}
      entitlementRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      quantity:
        anyOf:
        - &id014 {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
        - {type: 'null'}
      actualPeriod:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
        - {type: 'null'}
      actualOccurredAt:
        anyOf:
        - &id015
          anyOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
          - {type: 'null'}
        - {type: 'null'}
      deliveryResultRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
    required: [operationId, owner, targetRef, externalReference, result, evidenceRefs, observedAt, correctionOf, operationKind, entitlementRef, quantity,
      actualPeriod, actualOccurredAt, deliveryResultRef]
    additionalProperties: false
    allOf:
    - if:
        properties:
          result: {const: CONFIRMED}
      then:
        properties:
          operationKind: *id013
          quantity: *id014
          actualOccurredAt: *id015
  hardwareSecureInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    - properties:
        action: {const: SECURE}
  hardwareReserveInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    - properties:
        action: {const: RESERVE}
  hardwareReleaseInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    - properties:
        action: {const: RELEASE}
  hardwareShipInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    - properties:
        action: {const: SHIP}
  hardwareConfirmCompletionInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    - properties:
        action: {const: CONFIRM_COMPLETION}
  hardwareReturnInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    - properties:
        action: {const: RETURN}
  hardwareReconcileInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    - properties:
        action: {const: RECONCILE}
  hardwareRetryInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    - properties:
        action: {const: RETRY}
  softwareIssueInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
    - properties:
        action: {const: ISSUE}
  softwareRenewInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
    - properties:
        action: {const: RENEW}
  softwareAutoRenewApplyInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
    - properties:
        action: {const: AUTO_RENEW_APPLY}
  softwareAutoRenewCancelInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
    - properties:
        action: {const: AUTO_RENEW_CANCEL}
  softwareReconcileInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
    - properties:
        action: {const: RECONCILE}
  softwareRetryInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
    - properties:
        action: {const: RETRY}
  softwareRevokeInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
    - properties:
        action: {const: REVOKE}
  requestChangeInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesInput'}
    - properties:
        requestType: {const: CHANGE}
  requestCancelInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesInput'}
    - properties:
        requestType: {const: CANCEL}
  requestReturnInput:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesInput'}
    - properties:
        requestType: {const: RETURN}
  NoInvocationTarget:
    type: object
    properties:
      kind: {const: NONE}
    required: [kind]
    additionalProperties: false
  RecordInvocationTarget:
    type: object
    properties:
      kind: {const: RECORD}
      recordRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    required: [kind, recordRef]
    additionalProperties: false
  EnterpriseInvocationTarget:
    type: object
    properties:
      kind: {const: ENTERPRISE}
      enterpriseRef:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - properties:
            owner: {const: EnterpriseAccess}
            entity: {const: Enterprise}
    required: [kind, enterpriseRef]
    additionalProperties: false
  ReceiptInvocationTarget:
    type: object
    properties:
      kind: {const: REQUEST}
      requestId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
    required: [kind, requestId]
    additionalProperties: false
  ChallengeInvocationTarget:
    type: object
    properties:
      kind: {const: CHALLENGE}
      challengeId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
    required: [kind, challengeId]
    additionalProperties: false
  InvocationTarget:
    oneOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
    - {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptInvocationTarget'}
    - {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInvocationTarget'}
  ReceiptReadRequest:
    type: object
    properties:
      requestId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
    required: [requestId]
    additionalProperties: false
  ProvisionTranche:
    type: object
    properties:
      trancheId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      trancheRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      orderRef:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - properties:
            owner: {const: OrderAcceptance}
            entity: {const: Order}
      orderLineRef:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - properties:
            owner: {const: OrderAcceptance}
            entity: {const: OrderLine}
      termsSnapshotRef:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - properties:
            owner: {const: OrderAcceptance}
            entity: {const: PurchaseTermsSnapshot}
      completionBasis:
        type: string
        enum: [HW_DELIVERY, HW_CUSTOMER_ACCEPTANCE, SW_ISSUANCE_AVAILABLE_AND_START]
      completionState:
        type: string
        enum: [PENDING, COMPLETED, REVERSED, UNKNOWN, CONFLICT]
      completedQuantity:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
        - {type: 'null'}
      completedAt:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        - {type: 'null'}
      hardwareDeliveredAt:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        - {type: 'null'}
      customerAcceptedAt:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        - {type: 'null'}
      softwareIssuedAt:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        - {type: 'null'}
      resultAvailableAt:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        - {type: 'null'}
      contractualStartAt:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        - {type: 'null'}
      sourceRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      correctionOf:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      correctedAt:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
        - {type: 'null'}
      evidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    required: [trancheId, trancheRef, orderRef, orderLineRef, termsSnapshotRef, completionBasis, completionState, completedQuantity, completedAt, hardwareDeliveredAt,
      customerAcceptedAt, softwareIssuedAt, resultAvailableAt, contractualStartAt, sourceRevision, correctionOf, correctedAt, evidenceRefs]
    additionalProperties: false
    allOf:
    - if:
        properties:
          completionState: {const: COMPLETED}
      then:
        properties:
          completedQuantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
          completedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
          evidenceRefs:
            type: array
            items: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
            minItems: 1
    - if:
        properties:
          completionState: {const: COMPLETED}
          completionBasis: {const: HW_DELIVERY}
      then:
        properties:
          hardwareDeliveredAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    - if:
        properties:
          completionState: {const: COMPLETED}
          completionBasis: {const: HW_CUSTOMER_ACCEPTANCE}
      then:
        properties:
          customerAcceptedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    - if:
        properties:
          completionState: {const: COMPLETED}
          completionBasis: {const: SW_ISSUANCE_AVAILABLE_AND_START}
      then:
        properties:
          softwareIssuedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
          resultAvailableAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
          contractualStartAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    - if:
        properties:
          completionState:
            enum: [PENDING, REVERSED]
      then:
        properties:
          completedQuantity: {const: 0}
          completedAt: {type: 'null'}
    - if:
        properties:
          completionState:
            enum: [UNKNOWN, CONFLICT]
      then:
        properties:
          completedQuantity: {type: 'null'}
          completedAt: {type: 'null'}
    - if:
        properties:
          completionState: {const: REVERSED}
      then:
        properties:
          correctionOf: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          correctedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
  ProvisionFinanceFact:
    type: object
    properties:
      eventId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      schemaVersion: {const: 1.0.0}
      sourceOwner:
        type: string
        enum: [IdentityRecovery, EnterpriseAccess, ProductCatalog, CommercialAgreement, OrderAcceptance, FinancialSettlement, HardwareFulfillment, SoftwareLifecycle,
          AfterSalesDecision, NotificationDelivery, OperationalAssurance]
      sourceFactRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      aggregateRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      aggregateVersion: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      targetScope:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
        - {type: 'null'}
      occurredAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
      causationRequestId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      correlationId: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      supersedesFactRef:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
        - {type: 'null'}
      evidenceRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      financialFactKind:
        type: string
        enum: [PROVISION_COMPLETION, PROVISION_CORRECTION, PROVISION_PROGRESS, OTHER_OWNED_RESULT]
      providedTranches:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionTranche'}
        minItems: 0
    required: [eventId, schemaVersion, sourceOwner, sourceFactRef, aggregateRef, aggregateVersion, targetScope, occurredAt, causationRequestId, correlationId,
      supersedesFactRef, evidenceRefs, financialFactKind, providedTranches]
    additionalProperties: false
    allOf:
    - if:
        properties:
          financialFactKind:
            enum: [PROVISION_COMPLETION, PROVISION_CORRECTION, PROVISION_PROGRESS]
      then:
        properties:
          providedTranches: {minItems: 1}
  CompletionFactQuery:
    type: object
    properties:
      sourceFactRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      aggregateRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      minimumSourceRevision:
        anyOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
        - {type: 'null'}
    required: [sourceFactRef, aggregateRef, minimumSourceRevision]
    additionalProperties: false
  CompletionFactView:
    type: object
    properties:
      requestedSourceFactRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      latestSourceFactRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      aggregateRef: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
      latestSourceRevision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
      providedTranches:
        type: array
        items: {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionTranche'}
        minItems: 0
      correctionRefs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
      coverage:
        type: string
        enum: [CURRENT, GAP, UNKNOWN, CONFLICT]
      observedAt: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    required: [requestedSourceFactRef, latestSourceFactRef, aggregateRef, latestSourceRevision, providedTranches, correctionRefs, coverage, observedAt]
    additionalProperties: false

```


### C01 — 계정 신원·MFA·복구와 확인된 동일인 연결

공급: U2; 소비: U10, U2, U3, U7; 명세 의미 소유: IdentityRecovery. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:identityrecovery:1
title: 계정 신원·MFA·복구와 확인된 동일인 연결
x-contract-id: C01
x-provider-component: IdentityRecovery
x-provider-unit: U2
x-consumers: [CommercialAgreement, EnterpriseAccess, NotificationDelivery, OperationalAssurance, WorkInquiry]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: registerAccount
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RegistrationInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.1]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: startLogin
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/LoginInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityView'}
  stories: [US1.7]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: completeChallenge
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityView'}
  stories: [US1.7]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInvocationTarget'}
- name: enrolMfa
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.7]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: requestRecovery
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecoveryInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.8, US1.9]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: verifyRecovery
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.8]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: IdentityRecovery}
              entity: {const: RecoveryCase}
- name: staffVerifyRecovery
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.9]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: IdentityRecovery}
              entity: {const: RecoveryCase}
- name: readIdentity
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityViewResult'}
  stories: [US1.7]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: verifiedPerson
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityViewResult'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/PreIdentityContext'}
        operation: {const: registerAccount}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RegistrationInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/PreIdentityContext'}
        operation: {const: startLogin}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/LoginInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/PreIdentityContext'}
        operation: {const: completeChallenge}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/LimitedIdentityContext'}
        operation: {const: enrolMfa}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/PreIdentityContext'}
        operation: {const: requestRecovery}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecoveryInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/LimitedIdentityContext'}
        operation: {const: verifyRecovery}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: IdentityRecovery}
                    entity: {const: RecoveryCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: staffVerifyRecovery}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: IdentityRecovery}
                    entity: {const: RecoveryCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readIdentity}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: verifiedPerson}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C02 — 기업 승인·조직·소속·고객/직원 역할과 행위별 범위

공급: U2; 소비: U10, U3, U4, U5, U6, U7; 명세 의미 소유: EnterpriseAccess. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:enterpriseaccess:1
title: 기업 승인·조직·소속·고객/직원 역할과 행위별 범위
x-contract-id: C02
x-provider-component: EnterpriseAccess
x-provider-unit: U2
x-consumers: [AfterSalesDecision, CommercialAgreement, FinancialSettlement, HardwareFulfillment, NotificationDelivery, OperationalAssurance, OrderAcceptance,
  ProductCatalog, SoftwareLifecycle, WorkInquiry]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: applyEnterprise
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.1]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: approveEnterprise
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.2]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: EnterpriseAccess}
              entity: {const: EnterpriseApplication}
- name: readEnterprise
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseViewResult'}
  stories: [US1.3, US1.5, US1.10]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
- name: upsertOrganisation
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/OrganisationInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.3]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
- name: upsertMembership
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/MembershipInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.3, US1.10]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
- name: defineCustomerRole
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RoleInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
- name: grantCustomerRole
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.4, US1.5, US1.10]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
- name: defineStaffRole
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRoleInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.6]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: grantStaffRole
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.6]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: restoreAdministrator
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.10]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
- name: inviteMembership
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/InvitationInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US1.3]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
- name: readStaffRoles
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRolePage'}
  stories: [US1.6]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: evaluateAccess
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/AccessInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/AccessView'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: applyEnterprise}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: approveEnterprise}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: EnterpriseAccess}
                    entity: {const: EnterpriseApplication}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readEnterprise}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: upsertOrganisation}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/OrganisationInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: upsertMembership}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/MembershipInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: defineCustomerRole}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RoleInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: grantCustomerRole}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: defineStaffRole}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRoleInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: grantStaffRole}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: restoreAdministrator}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: inviteMembership}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/InvitationInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readStaffRoles}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: evaluateAccess}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/AccessInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C03 — 판매 상품과 공통 공개·가격 조건

공급: U3; 소비: U10, U3, U7; 명세 의미 소유: ProductCatalog. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:productcatalog:1
title: 판매 상품과 공통 공개·가격 조건
x-contract-id: C03
x-provider-component: ProductCatalog
x-provider-unit: U3
x-consumers: [CommercialAgreement, OperationalAssurance, OrderAcceptance, WorkInquiry]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: registerProduct
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ProductInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US2.1]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: reviseProduct
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ProductInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US2.1]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: ProductCatalog}
              entity: {const: Product}
- name: readCommonOffer
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ProductViewResult'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: registerProduct}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ProductInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: reviseProduct}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ProductInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: ProductCatalog}
                    entity: {const: Product}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readCommonOffer}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C04 — 기업 계약·승인된 예외·거래 변경 제안과 동의

공급: U3; 소비: U10, U3, U4, U5, U6, U7; 명세 의미 소유: CommercialAgreement. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:commercialagreement:1
title: 기업 계약·승인된 예외·거래 변경 제안과 동의
x-contract-id: C04
x-provider-component: CommercialAgreement
x-provider-unit: U3
x-consumers: [AfterSalesDecision, FinancialSettlement, HardwareFulfillment, OperationalAssurance, OrderAcceptance, SoftwareLifecycle, WorkInquiry]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: registerAgreement
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US2.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: approveAgreement
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US2.6]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: CommercialAgreement}
              entity: {const: AgreementRevision}
- name: readAgreement
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResultPage'}
  stories: [US2.7]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
- name: requestContractChange
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ContractChangeInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US2.5]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: registerOfferException
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/OfferExceptionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US2.3]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: createProposal
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US3.5, US7.5]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readProposal
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalViewResult'}
  stories: [US3.5, US7.5]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: CommercialAgreement}
              entity: {const: CommercialProposal}
- name: recordConsent
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ConsentInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US3.5, US7.5]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: CommercialAgreement}
              entity: {const: CommercialProposal}
- name: effectiveAgreement
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResult'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readApprovedTerms
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ApprovedTermsResult'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: registerAgreement}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: approveAgreement}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: CommercialAgreement}
                    entity: {const: AgreementRevision}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readAgreement}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: requestContractChange}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ContractChangeInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: registerOfferException}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/OfferExceptionInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: createProposal}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readProposal}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: CommercialAgreement}
                    entity: {const: CommercialProposal}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: recordConsent}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ConsentInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: CommercialAgreement}
                    entity: {const: CommercialProposal}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: effectiveAgreement}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readApprovedTerms}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C05 — 주문 접수·구매 당시 조건과 주문 전체 수락 판단

공급: U3; 소비: U10, U7; 명세 의미 소유: OrderAcceptance. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:orderacceptance:1
title: 주문 접수·구매 당시 조건과 주문 전체 수락 판단
x-contract-id: C05
x-provider-component: OrderAcceptance
x-provider-unit: U3
x-consumers: [AfterSalesDecision, OperationalAssurance, WorkInquiry]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: submitOrder
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/OrderInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US3.1, US3.2, US3.6]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: decideOrder
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US3.4]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: OrderAcceptance}
              entity: {const: Order}
- name: readAcceptedOrder
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/OrderViewResult'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: applyApprovedChange
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ApplyOrderChangeInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: submitOrder}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/OrderInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: decideOrder}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: OrderAcceptance}
                    entity: {const: Order}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readAcceptedOrder}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: applyApprovedChange}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ApplyOrderChangeInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C06 — 청구·지급·배분·환불과 대금 조건 판단

공급: U4; 소비: U10, U3, U7; 명세 의미 소유: FinancialSettlement. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:financialsettlement:1
title: 청구·지급·배분·환불과 대금 조건 판단
x-contract-id: C06
x-provider-component: FinancialSettlement
x-provider-unit: U4
x-consumers: [AfterSalesDecision, OperationalAssurance, OrderAcceptance, WorkInquiry]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: registerFinancialEvidence
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialEvidenceInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US4.1, US4.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: allocatePayment
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/AllocationInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US4.3, US4.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: decideRestriction
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US4.6]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: requestRefund
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US8.6]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: adjustRenewalFee
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US7.8]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: assessEligibility
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/EligibilityInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/EligibilityView'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readFinancialFacts
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialViewResult'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: ingestVerifiedFinancialResult
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialObservation'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: registerFinancialEvidence}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialEvidenceInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: allocatePayment}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/AllocationInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: decideRestriction}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: requestRefund}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: adjustRenewalFee}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: assessEligibility}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/EligibilityInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readFinancialFacts}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: ingestVerifiedFinancialResult}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialObservation'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C07 — HW 공급 판단·예약·확보·출고·배송·회수

공급: U5; 소비: U10, U3, U7; 명세 의미 소유: HardwareFulfillment. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:hardwarefulfillment:1
title: HW 공급 판단·예약·확보·출고·배송·회수
x-contract-id: C07
x-provider-component: HardwareFulfillment
x-provider-unit: U5
x-consumers: [AfterSalesDecision, OperationalAssurance, OrderAcceptance, WorkInquiry, FinancialSettlement]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: hardwareSecure
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareSecureInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US5.3]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
              entity: {const: HardwareFulfillmentCase}
- name: hardwareReserve
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReserveInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US5.4]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
              entity: {const: HardwareFulfillmentCase}
- name: hardwareRelease
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReleaseInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US5.4]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
              entity: {const: HardwareFulfillmentCase}
- name: hardwareShip
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareShipInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US5.5]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
              entity: {const: HardwareFulfillmentCase}
- name: hardwareConfirmCompletion
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareConfirmCompletionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US5.6]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
              entity: {const: HardwareFulfillmentCase}
- name: hardwareReturn
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReturnInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US8.11]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
              entity: {const: HardwareFulfillmentCase}
- name: hardwareReconcile
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReconcileInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US5.1, US8.7]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
              entity: {const: HardwareFulfillmentCase}
- name: hardwareRetry
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareRetryInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US5.7]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
              entity: {const: HardwareFulfillmentCase}
- name: assessHardwareSupply
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyView'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readHardwareFacts
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareViewResult'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: ingestVerifiedHardwareResult
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareObservation'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readCompletionFact
  kind: query
  target: &id001 {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
  input: &id002
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/CompletionFactQuery'}
    - properties:
        sourceFactRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
        aggregateRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
  output:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/CompletionFactView'}
    - properties:
        requestedSourceFactRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
        latestSourceFactRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
        aggregateRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: HardwareFulfillment}
  stories: [US4.5, US6.5, US5.6, US8.7]
  purpose: finance.postpay.reconcile; 주문/품목/기업 범위와 검증된 실행 근거를 적용; 키/전달 내용은 반환하지 않음
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: hardwareSecure}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareSecureInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
                    entity: {const: HardwareFulfillmentCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: hardwareReserve}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReserveInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
                    entity: {const: HardwareFulfillmentCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: hardwareRelease}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReleaseInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
                    entity: {const: HardwareFulfillmentCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: hardwareShip}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareShipInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
                    entity: {const: HardwareFulfillmentCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: hardwareConfirmCompletion}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareConfirmCompletionInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
                    entity: {const: HardwareFulfillmentCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: hardwareReturn}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReturnInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
                    entity: {const: HardwareFulfillmentCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: hardwareReconcile}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReconcileInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
                    entity: {const: HardwareFulfillmentCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: hardwareRetry}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareRetryInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
                    entity: {const: HardwareFulfillmentCase}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: assessHardwareSupply}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readHardwareFacts}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: ingestVerifiedHardwareResult}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareObservation'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        target: *id001
        operation: {const: readCompletionFact}
        data: *id002
      required: [context, target, operation, data]
      additionalProperties: false
x-consumer-operations:
  FinancialSettlement: [readCompletionFact]

```


### C08 — 기업 SW 권한 발급·실제 기간·갱신·회수

공급: U6; 소비: U10, U3, U7; 명세 의미 소유: SoftwareLifecycle. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:softwarelifecycle:1
title: 기업 SW 권한 발급·실제 기간·갱신·회수
x-contract-id: C08
x-provider-component: SoftwareLifecycle
x-provider-unit: U6
x-consumers: [AfterSalesDecision, OperationalAssurance, OrderAcceptance, WorkInquiry, FinancialSettlement]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: softwareIssue
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/softwareIssueInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US6.1]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: EnterpriseEntitlement}
- name: softwareRenew
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRenewInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US7.1]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: EnterpriseEntitlement}
- name: softwareAutoRenewApply
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewApplyInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US7.2]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: EnterpriseEntitlement}
- name: softwareAutoRenewCancel
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewCancelInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US7.3]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: EnterpriseEntitlement}
- name: softwareReconcile
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/softwareReconcileInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US8.7]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: EnterpriseEntitlement}
- name: softwareRetry
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRetryInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US6.6]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: EnterpriseEntitlement}
- name: softwareRevoke
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRevokeInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US8.5]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: EnterpriseEntitlement}
- name: requestPeriodAdjustment
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/PeriodInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US6.3]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: EnterpriseEntitlement}
- name: approvePeriodAdjustment
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US6.4]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: PeriodAdjustment}
- name: readDeliveryResult
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DeliveryView'}
  stories: [US6.2]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
              entity: {const: EnterpriseEntitlement}
- name: assessSoftwareSupply
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyView'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readSoftwareFacts
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareViewResult'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: ingestVerifiedSoftwareResult
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareObservation'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: executeAgreedRenewal
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readCompletionFact
  kind: query
  target: &id001 {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
  input: &id002
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/CompletionFactQuery'}
    - properties:
        sourceFactRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
        aggregateRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
  output:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/CompletionFactView'}
    - properties:
        requestedSourceFactRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
        latestSourceFactRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
        aggregateRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: SoftwareLifecycle}
  stories: [US4.5, US6.5, US5.6, US8.7]
  purpose: finance.postpay.reconcile; 주문/품목/기업 범위와 검증된 실행 근거를 적용; 키/전달 내용은 반환하지 않음
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: softwareIssue}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/softwareIssueInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: EnterpriseEntitlement}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: softwareRenew}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRenewInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: EnterpriseEntitlement}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: softwareAutoRenewApply}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewApplyInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: EnterpriseEntitlement}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: softwareAutoRenewCancel}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewCancelInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: EnterpriseEntitlement}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: softwareReconcile}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/softwareReconcileInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: EnterpriseEntitlement}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: softwareRetry}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRetryInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: EnterpriseEntitlement}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: softwareRevoke}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRevokeInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: EnterpriseEntitlement}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: requestPeriodAdjustment}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/PeriodInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: EnterpriseEntitlement}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: approvePeriodAdjustment}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: PeriodAdjustment}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readDeliveryResult}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
                    entity: {const: EnterpriseEntitlement}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: assessSoftwareSupply}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readSoftwareFacts}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: ingestVerifiedSoftwareResult}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareObservation'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: executeAgreedRenewal}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        target: *id001
        operation: {const: readCompletionFact}
        data: *id002
      required: [context, target, operation, data]
      additionalProperties: false
x-consumer-operations:
  FinancialSettlement: [readCompletionFact]

```


### C09 — 주문 전체 변경·취소·반품의 허용·보류 판단

공급: U7; 소비: U10, U7; 명세 의미 소유: AfterSalesDecision. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:aftersalesdecision:1
title: 주문 전체 변경·취소·반품의 허용·보류 판단
x-contract-id: C09
x-provider-component: AfterSalesDecision
x-provider-unit: U7
x-consumers: [OperationalAssurance, WorkInquiry]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: requestChange
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/requestChangeInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US8.1]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: OrderAcceptance}
              entity: {const: Order}
- name: requestCancel
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/requestCancelInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US8.2]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: OrderAcceptance}
              entity: {const: Order}
- name: requestReturn
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/requestReturnInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US8.3]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: OrderAcceptance}
              entity: {const: Order}
- name: decideAfterSales
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesDecisionInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US8.4, US8.10]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: AfterSalesDecision}
              entity: {const: AfterSalesRequest}
- name: readAfterSalesFacts
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesViewResult'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: requestChange}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/requestChangeInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: OrderAcceptance}
                    entity: {const: Order}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: requestCancel}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/requestCancelInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: OrderAcceptance}
                    entity: {const: Order}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: requestReturn}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/requestReturnInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: OrderAcceptance}
                    entity: {const: Order}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: decideAfterSales}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesDecisionInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: AfterSalesDecision}
                    entity: {const: AfterSalesRequest}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readAfterSalesFacts}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C10 — 권한에 맞는 진행·남은 조치·이력의 조합 조회

공급: U7; 소비: External: 기술 실행 프로그램/운영 검증; 명세 의미 소유: WorkInquiry. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:workinquiry:1
title: 권한에 맞는 진행·남은 조치·이력의 조합 조회
x-contract-id: C10
x-provider-component: WorkInquiry
x-provider-unit: U7
x-consumers: []
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: listVisibleProducts
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ProductViewResultPage'}
  stories: [US2.2]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOrders
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResultPage'}
  stories: [US3.3, US8.8, US8.12]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOrder
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResult'}
  stories: [US3.3, US8.8, US8.12]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: OrderAcceptance}
              entity: {const: Order}
- name: readReceipt
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US3.3, US8.8, US8.12]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptInvocationTarget'}
- name: readFinancial
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialViewResult'}
  stories: [US4.5, US4.6, US8.6]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: OrderAcceptance}
              entity: {const: Order}
- name: readHardware
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareViewResult'}
  stories: [US5.6, US8.11]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: OrderAcceptance}
              entity: {const: Order}
- name: readSoftware
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareViewResult'}
  stories: [US6.2, US6.5, US7.6, US7.7]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: OrderAcceptance}
              entity: {const: Order}
- name: readHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: OrderAcceptance}
              entity: {const: Order}
- name: readRecordHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: listVisibleProducts}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOrders}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOrder}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: OrderAcceptance}
                    entity: {const: Order}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readReceipt}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptReadRequest'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readFinancial}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: OrderAcceptance}
                    entity: {const: Order}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readHardware}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: OrderAcceptance}
                    entity: {const: Order}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readSoftware}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: OrderAcceptance}
                    entity: {const: Order}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: OrderAcceptance}
                    entity: {const: Order}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readRecordHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C11 — 업무·복구·점검 통지의 대상 검증과 전달 추적

공급: U7; 소비: U10; 명세 의미 소유: NotificationDelivery. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:notificationdelivery:1
title: 업무·복구·점검 통지의 대상 검증과 전달 추적
x-contract-id: C11
x-provider-component: NotificationDelivery
x-provider-unit: U7
x-consumers: [OperationalAssurance]
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: readNotices
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationViewResultPage'}
  stories: [US8.9]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: recordNoticeRead
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/NoticeInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: [US8.9]
  target:
    allOf:
    - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    - properties:
        recordRef:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
          - properties:
              owner: {const: NotificationDelivery}
              entity: {const: NotificationIntent}
- name: ingestDeliveryObservation
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readNotices}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: recordNoticeRead}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/NoticeInput'}
        target:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
          - properties:
              recordRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: NotificationDelivery}
                    entity: {const: NotificationIntent}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: ingestDeliveryObservation}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C12 — 기술 운영 검증·측정·복구 대조를 위한 코드 책임

공급: U10; 소비: External: 기술 실행 프로그램/운영 검증; 명세 의미 소유: OperationalAssurance. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:operationalassurance:1
title: 기술 운영 검증·측정·복구 대조를 위한 코드 책임
x-contract-id: C12
x-provider-component: OperationalAssurance
x-provider-unit: U10
x-consumers: []
x-mechanism: in-process typed port; API/worker 중 해당 실행 호스트에서 사용
x-errors: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
x-operations:
- name: recordOperatingEvidence
  kind: command
  input: {$ref: 'urn:oms:contract:common:1#/$defs/OperatingEvidenceInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOperatingEvidence
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/OperationalView'}
  stories: []
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerDiagnostics
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
  stories: [US9.2, US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
- name: readOwnerHistory
  kind: query
  input: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
  stories: [US9.4]
  target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
$defs:
  Call:
    oneOf:
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: recordOperatingEvidence}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/OperatingEvidenceInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOperatingEvidence}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerDiagnostics}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false
    - type: object
      properties:
        context: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
        operation: {const: readOwnerHistory}
        data: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
        target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      required: [context, operation, data, target]
      additionalProperties: false

```


### C13 — 호스트/worker 등록·가용 기능

공급: U1; 소비: U2–U7/U10; 명세 의미 소유: U1 호스트; 등록 제공자는 각 업무 소유자. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:binding:1
x-contract-id: C13
x-operations:
- name: registerBindings
  input: {$ref: 'urn:oms:contract:common:1#/$defs/BindingManifest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/BindingManifest'}
$ref: urn:oms:contract:common:1#/$defs/BindingManifest

```


### C14 — CUSTOMER UI 빌드/호환 명세

공급: U8; 소비: External: 고객 PC 브라우저; 명세 의미 소유: CustomerUi. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:customer-build:1
x-contract-id: C14
allOf:
- {$ref: 'urn:oms:contract:common:1#/$defs/BuildManifest'}
- properties:
    audience: {const: CUSTOMER}

```


### C15 — STAFF UI 빌드/호환 명세

공급: U9; 소비: External: 사내망/승인 원격 PC 브라우저; 명세 의미 소유: StaffUi. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:staff-build:1
x-contract-id: C15
allOf:
- {$ref: 'urn:oms:contract:common:1#/$defs/BuildManifest'}
- properties:
    audience: {const: STAFF}

```


### C16 — CUSTOMER 화면의 HTTP 계약

공급: U1 실행 호스트; U2–U7 원본 소유자; 소비: U8; External: CUSTOMER 브라우저; 명세 의미 소유: 업무 의미: 각 소유자; 전송/공통: U1. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
openapi: 3.1.0
info: {title: OMS CUSTOMER HTTP 계약, version: 1.0.0}
servers:
- {url: /customer-api/v1}
x-contract-id: C16
x-runtime-host: U1 업무 API; 원본 명세 의미는 U2–U7 소유자
security:
- Session: []
paths:
  /registration-requests:
    post:
      operationId: customer_registerAccount
      summary: registerAccount
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.1]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/RegistrationInput'}
      security: []
      x-limited-purpose-only: true
      x-origin-check-required: true
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /identity/challenges:
    post:
      operationId: customer_startLogin
      summary: startLogin
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityView'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/LoginInput'}
      security: []
      x-limited-purpose-only: true
      x-origin-check-required: true
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /identity/challenges/{id}/responses:
    post:
      operationId: customer_completeChallenge
      summary: completeChallenge
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityView'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
      security: []
      x-limited-purpose-only: true
      x-origin-check-required: true
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /identity/mfa-enrolments:
    post:
      operationId: customer_enrolMfa
      summary: enrolMfa
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
      security:
      - LimitedPurposeSession: []
        Csrf: []
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /recovery-cases:
    post:
      operationId: customer_requestRecovery
      summary: requestRecovery
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.8, US1.9]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/RecoveryInput'}
      security: []
      x-limited-purpose-only: true
      x-origin-check-required: true
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /recovery-cases/{id}/verifications:
    post:
      operationId: customer_verifyRecovery
      summary: verifyRecovery
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.8]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
      security:
      - LimitedPurposeSession: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: IdentityRecovery}
                  entity: {const: RecoveryCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /identity:
    get:
      operationId: customer_readIdentity
      summary: readIdentity
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprise-applications:
    post:
      operationId: customer_applyEnterprise
      summary: applyEnterprise
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.1]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}:
    get:
      operationId: customer_readEnterprise
      summary: readEnterprise
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.3, US1.5, US1.10]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}/organisation-changes:
    post:
      operationId: customer_upsertOrganisation
      summary: upsertOrganisation
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.3]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/OrganisationInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}/membership-changes:
    post:
      operationId: customer_upsertMembership
      summary: upsertMembership
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.3, US1.10]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/MembershipInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}/customer-roles:
    post:
      operationId: customer_defineCustomerRole
      summary: defineCustomerRole
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/RoleInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}/role-grant-changes:
    post:
      operationId: customer_grantCustomerRole
      summary: grantCustomerRole
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.4, US1.5, US1.10]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /products:
    get:
      operationId: customer_listVisibleProducts
      summary: listVisibleProducts
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US2.2]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/ProductViewResultPage'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}/agreements:
    get:
      operationId: customer_readAgreement
      summary: readAgreement
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US2.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResultPage'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /contract-change-requests:
    post:
      operationId: customer_requestContractChange
      summary: requestContractChange
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US2.5]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ContractChangeInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /commercial-proposals/{id}:
    get:
      operationId: customer_readProposal
      summary: readProposal
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US3.5, US7.5]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: CommercialAgreement}
                  entity: {const: CommercialProposal}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /commercial-proposals/{id}/consents:
    post:
      operationId: customer_recordConsent
      summary: recordConsent
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US3.5, US7.5]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ConsentInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: CommercialAgreement}
                  entity: {const: CommercialProposal}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders:
    post:
      operationId: customer_submitOrder
      summary: submitOrder
      x-owner-component: OrderAcceptance
      x-owner-unit: U3
      x-stories: [US3.1, US3.2, US3.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/OrderInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
    get:
      operationId: customer_readOrders
      summary: readOrders
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US3.3, US8.8, US8.12]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResultPage'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}:
    get:
      operationId: customer_readOrder
      summary: readOrder
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US3.3, US8.8, US8.12]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /requests/{id}:
    get:
      operationId: customer_readReceipt
      summary: readReceipt
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US3.3, US8.8, US8.12]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/financial-results:
    get:
      operationId: customer_readFinancial
      summary: readFinancial
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US4.5, US4.6, US8.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/hardware-results:
    get:
      operationId: customer_readHardware
      summary: readHardware
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US5.6, US8.11]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/renew-requests:
    post:
      operationId: customer_softwareRenew
      summary: softwareRenew
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US7.1]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRenewInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/auto-renew-apply-requests:
    post:
      operationId: customer_softwareAutoRenewApply
      summary: softwareAutoRenewApply
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US7.2]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewApplyInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/auto-renew-cancel-requests:
    post:
      operationId: customer_softwareAutoRenewCancel
      summary: softwareAutoRenewCancel
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US7.3]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewCancelInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/software-results:
    get:
      operationId: customer_readSoftware
      summary: readSoftware
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US6.2, US6.5, US7.6, US7.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/change-requests:
    post:
      operationId: customer_requestChange
      summary: requestChange
      x-owner-component: AfterSalesDecision
      x-owner-unit: U7
      x-stories: [US8.1]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/requestChangeInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/cancel-requests:
    post:
      operationId: customer_requestCancel
      summary: requestCancel
      x-owner-component: AfterSalesDecision
      x-owner-unit: U7
      x-stories: [US8.2]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/requestCancelInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/return-requests:
    post:
      operationId: customer_requestReturn
      summary: requestReturn
      x-owner-component: AfterSalesDecision
      x-owner-unit: U7
      x-stories: [US8.3]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/requestReturnInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/history:
    get:
      operationId: customer_readHistory
      summary: readHistory
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US9.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /notifications:
    get:
      operationId: customer_readNotices
      summary: readNotices
      x-owner-component: NotificationDelivery
      x-owner-unit: U7
      x-stories: [US8.9]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationViewResultPage'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /notifications/{id}/read-receipts:
    post:
      operationId: customer_recordNoticeRead
      summary: recordNoticeRead
      x-owner-component: NotificationDelivery
      x-owner-unit: U7
      x-stories: [US8.9]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/NoticeInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: NotificationDelivery}
                  entity: {const: NotificationIntent}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}/membership-invitations:
    post:
      operationId: customer_inviteMembership
      summary: inviteMembership
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.3]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/InvitationInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/delivery-results:
    get:
      operationId: customer_readDeliveryResult
      summary: readDeliveryResult
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US6.2]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/DeliveryView'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
components:
  securitySchemes:
    Session:
      type: apiKey
      in: cookie
      name: oms_customer_session
      description: MFA 검증·audience/기업/현재 권한의 서버 검증 필요; 세션 공급자/수명은 OQ4
    Csrf: {type: apiKey, in: header, name: X-CSRF-Token}
    LimitedPurposeSession:
      type: apiKey
      in: cookie
      name: oms_customer_identity
      description: 검증된 subject/challenge/MFA등록 또는 복구 목적에 한정; 기업 업무/직원 승인은 허용하지 않음
  schemas:
    Id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
    Revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
    Instant: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    Date: {$ref: 'urn:oms:contract:common:1#/$defs/Date'}
    Quantity: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
    PositiveQuantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
    Money: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
    Ref: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    Refs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    TargetScope: {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
    Period: {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
    Evidence: {$ref: 'urn:oms:contract:common:1#/$defs/Evidence'}
    ServiceContext: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
    CommandMeta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
    Receipt: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
    Problem: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    ReadRequest: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
    RecordQuery: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
    LoginInput: {$ref: 'urn:oms:contract:common:1#/$defs/LoginInput'}
    RegistrationInput: {$ref: 'urn:oms:contract:common:1#/$defs/RegistrationInput'}
    ChallengeInput: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
    PreIdentityContext: {$ref: 'urn:oms:contract:common:1#/$defs/PreIdentityContext'}
    LimitedIdentityContext: {$ref: 'urn:oms:contract:common:1#/$defs/LimitedIdentityContext'}
    RecoveryInput: {$ref: 'urn:oms:contract:common:1#/$defs/RecoveryInput'}
    IdentityView: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityView'}
    ActionScope: {$ref: 'urn:oms:contract:common:1#/$defs/ActionScope'}
    EnterpriseInput: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInput'}
    DecisionInput: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
    OrganisationInput: {$ref: 'urn:oms:contract:common:1#/$defs/OrganisationInput'}
    MembershipInput: {$ref: 'urn:oms:contract:common:1#/$defs/MembershipInput'}
    RoleInput: {$ref: 'urn:oms:contract:common:1#/$defs/RoleInput'}
    RoleGrantInput: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
    StaffRoleInput: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRoleInput'}
    AccessInput: {$ref: 'urn:oms:contract:common:1#/$defs/AccessInput'}
    AccessView: {$ref: 'urn:oms:contract:common:1#/$defs/AccessView'}
    EnterpriseView: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseView'}
    ProductInput: {$ref: 'urn:oms:contract:common:1#/$defs/ProductInput'}
    ProductView: {$ref: 'urn:oms:contract:common:1#/$defs/ProductView'}
    AgreementInput: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementInput'}
    ContractChangeInput: {$ref: 'urn:oms:contract:common:1#/$defs/ContractChangeInput'}
    OfferExceptionInput: {$ref: 'urn:oms:contract:common:1#/$defs/OfferExceptionInput'}
    ProposalInput: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalInput'}
    ConsentInput: {$ref: 'urn:oms:contract:common:1#/$defs/ConsentInput'}
    AgreementView: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementView'}
    OrderLineInput: {$ref: 'urn:oms:contract:common:1#/$defs/OrderLineInput'}
    OrderInput: {$ref: 'urn:oms:contract:common:1#/$defs/OrderInput'}
    OrderLineView: {$ref: 'urn:oms:contract:common:1#/$defs/OrderLineView'}
    OrderView: {$ref: 'urn:oms:contract:common:1#/$defs/OrderView'}
    ApplyOrderChangeInput: {$ref: 'urn:oms:contract:common:1#/$defs/ApplyOrderChangeInput'}
    FinancialEvidenceInput: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialEvidenceInput'}
    AllocationInput: {$ref: 'urn:oms:contract:common:1#/$defs/AllocationInput'}
    FinancialActionInput: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
    FinancialView: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialView'}
    EligibilityInput: {$ref: 'urn:oms:contract:common:1#/$defs/EligibilityInput'}
    EligibilityView: {$ref: 'urn:oms:contract:common:1#/$defs/EligibilityView'}
    SupplyInput: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyInput'}
    SupplyView: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyView'}
    HardwareActionInput: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    HardwareView: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareView'}
    SoftwareActionInput: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
    PeriodInput: {$ref: 'urn:oms:contract:common:1#/$defs/PeriodInput'}
    SoftwareView: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareView'}
    AfterSalesInput: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesInput'}
    AfterSalesDecisionInput: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesDecisionInput'}
    AfterSalesView: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesView'}
    NotificationView: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationView'}
    NoticeInput: {$ref: 'urn:oms:contract:common:1#/$defs/NoticeInput'}
    HistoryView: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
    IdentityViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityViewResult'}
    EnterpriseViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseViewResult'}
    ProductViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/ProductViewResult'}
    AgreementViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResult'}
    OrderViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/OrderViewResult'}
    FinancialViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialViewResult'}
    HardwareViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareViewResult'}
    SoftwareViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareViewResult'}
    AfterSalesViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesViewResult'}
    NotificationViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationViewResult'}
    InquiryView: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryView'}
    InquiryViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResult'}
    DiagnosticInput: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
    DiagnosticView: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
    OperatingEvidenceInput: {$ref: 'urn:oms:contract:common:1#/$defs/OperatingEvidenceInput'}
    OperationalView: {$ref: 'urn:oms:contract:common:1#/$defs/OperationalView'}
    Fact: {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
    Work: {$ref: 'urn:oms:contract:common:1#/$defs/Work'}
    ExternalRequest: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
    ExternalObservation: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
    BuildManifest: {$ref: 'urn:oms:contract:common:1#/$defs/BuildManifest'}
    Binding: {$ref: 'urn:oms:contract:common:1#/$defs/Binding'}
    BindingManifest: {$ref: 'urn:oms:contract:common:1#/$defs/BindingManifest'}
    ProductViewResultPage: {$ref: 'urn:oms:contract:common:1#/$defs/ProductViewResultPage'}
    AgreementViewResultPage: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResultPage'}
    InquiryViewResultPage: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResultPage'}
    NotificationViewResultPage: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationViewResultPage'}
    OrganisationView: {$ref: 'urn:oms:contract:common:1#/$defs/OrganisationView'}
    MembershipView: {$ref: 'urn:oms:contract:common:1#/$defs/MembershipView'}
    CustomerRoleView: {$ref: 'urn:oms:contract:common:1#/$defs/CustomerRoleView'}
    StaffRoleView: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRoleView'}
    StaffRolePage: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRolePage'}
    InvitationInput: {$ref: 'urn:oms:contract:common:1#/$defs/InvitationInput'}
    ProposalTerms: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalTerms'}
    ProposalView: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalView'}
    ProposalViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalViewResult'}
    HistoryItem: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryItem'}
    DeliveryView: {$ref: 'urn:oms:contract:common:1#/$defs/DeliveryView'}
    ApprovedTermsView: {$ref: 'urn:oms:contract:common:1#/$defs/ApprovedTermsView'}
    ApprovedTermsResult: {$ref: 'urn:oms:contract:common:1#/$defs/ApprovedTermsResult'}
    FinancialObservation: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialObservation'}
    HardwareObservation: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareObservation'}
    SoftwareObservation: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareObservation'}
    hardwareSecureInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareSecureInput'}
    hardwareReserveInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReserveInput'}
    hardwareReleaseInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReleaseInput'}
    hardwareShipInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareShipInput'}
    hardwareConfirmCompletionInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareConfirmCompletionInput'}
    hardwareReturnInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReturnInput'}
    hardwareReconcileInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReconcileInput'}
    hardwareRetryInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareRetryInput'}
    softwareIssueInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareIssueInput'}
    softwareRenewInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRenewInput'}
    softwareAutoRenewApplyInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewApplyInput'}
    softwareAutoRenewCancelInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewCancelInput'}
    softwareReconcileInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareReconcileInput'}
    softwareRetryInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRetryInput'}
    softwareRevokeInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRevokeInput'}
    requestChangeInput: {$ref: 'urn:oms:contract:common:1#/$defs/requestChangeInput'}
    requestCancelInput: {$ref: 'urn:oms:contract:common:1#/$defs/requestCancelInput'}
    requestReturnInput: {$ref: 'urn:oms:contract:common:1#/$defs/requestReturnInput'}
    NoInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
    RecordInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    EnterpriseInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
    ReceiptInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptInvocationTarget'}
    ChallengeInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInvocationTarget'}
    InvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/InvocationTarget'}
    ReceiptReadRequest: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptReadRequest'}
    ProvisionTranche: {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionTranche'}
    ProvisionFinanceFact: {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionFinanceFact'}
    CompletionFactQuery: {$ref: 'urn:oms:contract:common:1#/$defs/CompletionFactQuery'}
    CompletionFactView: {$ref: 'urn:oms:contract:common:1#/$defs/CompletionFactView'}
  responses:
    Error400:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error401:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error403:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error404:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error409:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error429:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error503:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}

```


### C17 — STAFF 화면의 HTTP 계약

공급: U1 실행 호스트; U2–U7 원본 소유자; 소비: U9; External: STAFF 브라우저; 명세 의미 소유: 업무 의미: 각 소유자; 전송/공통: U1. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
openapi: 3.1.0
info: {title: OMS STAFF HTTP 계약, version: 1.0.0}
servers:
- {url: /staff-api/v1}
x-contract-id: C17
x-runtime-host: U1 업무 API; 원본 명세 의미는 U2–U7 소유자
security:
- Session: []
paths:
  /identity/challenges:
    post:
      operationId: staff_startLogin
      summary: startLogin
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityView'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/LoginInput'}
      security: []
      x-limited-purpose-only: true
      x-origin-check-required: true
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /identity/challenges/{id}/responses:
    post:
      operationId: staff_completeChallenge
      summary: completeChallenge
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityView'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
      security: []
      x-limited-purpose-only: true
      x-origin-check-required: true
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /identity/mfa-enrolments:
    post:
      operationId: staff_enrolMfa
      summary: enrolMfa
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
      security:
      - LimitedPurposeSession: []
        Csrf: []
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /recovery-cases:
    post:
      operationId: staff_requestRecovery
      summary: requestRecovery
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.8, US1.9]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/RecoveryInput'}
      security: []
      x-limited-purpose-only: true
      x-origin-check-required: true
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /recovery-cases/{id}/verifications:
    post:
      operationId: staff_verifyRecovery
      summary: verifyRecovery
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.8]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
          headers:
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
            Set-Cookie:
              schema: {type: string}
              description: 서버 검증한 단계에 맞는 purpose-limited 또는 MFA 업무 세션; 쿠키 자체가 권한/MFA 증거 아님
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
      security:
      - LimitedPurposeSession: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: IdentityRecovery}
                  entity: {const: RecoveryCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /recovery-cases/{id}/staff-verifications:
    post:
      operationId: staff_staffVerifyRecovery
      summary: staffVerifyRecovery
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.9]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: IdentityRecovery}
                  entity: {const: RecoveryCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /identity:
    get:
      operationId: staff_readIdentity
      summary: readIdentity
      x-owner-component: IdentityRecovery
      x-owner-unit: U2
      x-stories: [US1.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprise-applications/{id}/decisions:
    post:
      operationId: staff_approveEnterprise
      summary: approveEnterprise
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.2]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: EnterpriseAccess}
                  entity: {const: EnterpriseApplication}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}:
    get:
      operationId: staff_readEnterprise
      summary: readEnterprise
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.3, US1.5, US1.10]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /staff-roles:
    post:
      operationId: staff_defineStaffRole
      summary: defineStaffRole
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRoleInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
    get:
      operationId: staff_readStaffRoles
      summary: readStaffRoles
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRolePage'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /staff-role-grant-changes:
    post:
      operationId: staff_grantStaffRole
      summary: grantStaffRole
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}/administrator-restorations:
    post:
      operationId: staff_restoreAdministrator
      summary: restoreAdministrator
      x-owner-component: EnterpriseAccess
      x-owner-unit: U2
      x-stories: [US1.10]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /products:
    post:
      operationId: staff_registerProduct
      summary: registerProduct
      x-owner-component: ProductCatalog
      x-owner-unit: U3
      x-stories: [US2.1]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ProductInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
    get:
      operationId: staff_listVisibleProducts
      summary: listVisibleProducts
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US2.2]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/ProductViewResultPage'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /products/{id}/revisions:
    post:
      operationId: staff_reviseProduct
      summary: reviseProduct
      x-owner-component: ProductCatalog
      x-owner-unit: U3
      x-stories: [US2.1]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ProductInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: ProductCatalog}
                  entity: {const: Product}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /agreement-revisions:
    post:
      operationId: staff_registerAgreement
      summary: registerAgreement
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US2.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /agreement-revisions/{id}/decisions:
    post:
      operationId: staff_approveAgreement
      summary: approveAgreement
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US2.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: CommercialAgreement}
                  entity: {const: AgreementRevision}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprises/{id}/agreements:
    get:
      operationId: staff_readAgreement
      summary: readAgreement
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US2.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResultPage'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /enterprise-offer-exceptions:
    post:
      operationId: staff_registerOfferException
      summary: registerOfferException
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US2.3]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/OfferExceptionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /commercial-proposals:
    post:
      operationId: staff_createProposal
      summary: createProposal
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US3.5, US7.5]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /commercial-proposals/{id}:
    get:
      operationId: staff_readProposal
      summary: readProposal
      x-owner-component: CommercialAgreement
      x-owner-unit: U3
      x-stories: [US3.5, US7.5]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: CommercialAgreement}
                  entity: {const: CommercialProposal}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/acceptance-decisions:
    post:
      operationId: staff_decideOrder
      summary: decideOrder
      x-owner-component: OrderAcceptance
      x-owner-unit: U3
      x-stories: [US3.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders:
    get:
      operationId: staff_readOrders
      summary: readOrders
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US3.3, US8.8, US8.12]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResultPage'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}:
    get:
      operationId: staff_readOrder
      summary: readOrder
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US3.3, US8.8, US8.12]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /requests/{id}:
    get:
      operationId: staff_readReceipt
      summary: readReceipt
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US3.3, US8.8, US8.12]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /financial-evidence:
    post:
      operationId: staff_registerFinancialEvidence
      summary: registerFinancialEvidence
      x-owner-component: FinancialSettlement
      x-owner-unit: U4
      x-stories: [US4.1, US4.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialEvidenceInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /payment-allocations:
    post:
      operationId: staff_allocatePayment
      summary: allocatePayment
      x-owner-component: FinancialSettlement
      x-owner-unit: U4
      x-stories: [US4.3, US4.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/AllocationInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /financial-restriction-decisions:
    post:
      operationId: staff_decideRestriction
      summary: decideRestriction
      x-owner-component: FinancialSettlement
      x-owner-unit: U4
      x-stories: [US4.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /refund-cases:
    post:
      operationId: staff_requestRefund
      summary: requestRefund
      x-owner-component: FinancialSettlement
      x-owner-unit: U4
      x-stories: [US8.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /renewal-fee-adjustments:
    post:
      operationId: staff_adjustRenewalFee
      summary: adjustRenewalFee
      x-owner-component: FinancialSettlement
      x-owner-unit: U4
      x-stories: [US7.8]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/financial-results:
    get:
      operationId: staff_readFinancial
      summary: readFinancial
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US4.5, US4.6, US8.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /hardware-cases/{id}/secure-requests:
    post:
      operationId: staff_hardwareSecure
      summary: hardwareSecure
      x-owner-component: HardwareFulfillment
      x-owner-unit: U5
      x-stories: [US5.3]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareSecureInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: HardwareFulfillment}
                  entity: {const: HardwareFulfillmentCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /hardware-cases/{id}/reserve-requests:
    post:
      operationId: staff_hardwareReserve
      summary: hardwareReserve
      x-owner-component: HardwareFulfillment
      x-owner-unit: U5
      x-stories: [US5.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReserveInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: HardwareFulfillment}
                  entity: {const: HardwareFulfillmentCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /hardware-cases/{id}/release-requests:
    post:
      operationId: staff_hardwareRelease
      summary: hardwareRelease
      x-owner-component: HardwareFulfillment
      x-owner-unit: U5
      x-stories: [US5.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReleaseInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: HardwareFulfillment}
                  entity: {const: HardwareFulfillmentCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /hardware-cases/{id}/ship-requests:
    post:
      operationId: staff_hardwareShip
      summary: hardwareShip
      x-owner-component: HardwareFulfillment
      x-owner-unit: U5
      x-stories: [US5.5]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareShipInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: HardwareFulfillment}
                  entity: {const: HardwareFulfillmentCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /hardware-cases/{id}/confirm-completion-requests:
    post:
      operationId: staff_hardwareConfirmCompletion
      summary: hardwareConfirmCompletion
      x-owner-component: HardwareFulfillment
      x-owner-unit: U5
      x-stories: [US5.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareConfirmCompletionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: HardwareFulfillment}
                  entity: {const: HardwareFulfillmentCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /hardware-cases/{id}/return-requests:
    post:
      operationId: staff_hardwareReturn
      summary: hardwareReturn
      x-owner-component: HardwareFulfillment
      x-owner-unit: U5
      x-stories: [US8.11]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReturnInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: HardwareFulfillment}
                  entity: {const: HardwareFulfillmentCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /hardware-cases/{id}/reconcile-requests:
    post:
      operationId: staff_hardwareReconcile
      summary: hardwareReconcile
      x-owner-component: HardwareFulfillment
      x-owner-unit: U5
      x-stories: [US5.1, US8.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReconcileInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: HardwareFulfillment}
                  entity: {const: HardwareFulfillmentCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /hardware-cases/{id}/retry-requests:
    post:
      operationId: staff_hardwareRetry
      summary: hardwareRetry
      x-owner-component: HardwareFulfillment
      x-owner-unit: U5
      x-stories: [US5.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareRetryInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: HardwareFulfillment}
                  entity: {const: HardwareFulfillmentCase}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/hardware-results:
    get:
      operationId: staff_readHardware
      summary: readHardware
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US5.6, US8.11]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/issue-requests:
    post:
      operationId: staff_softwareIssue
      summary: softwareIssue
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US6.1]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/softwareIssueInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/reconcile-requests:
    post:
      operationId: staff_softwareReconcile
      summary: softwareReconcile
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US8.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/softwareReconcileInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/retry-requests:
    post:
      operationId: staff_softwareRetry
      summary: softwareRetry
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US6.6]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRetryInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/revoke-requests:
    post:
      operationId: staff_softwareRevoke
      summary: softwareRevoke
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US8.5]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRevokeInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/period-adjustments:
    post:
      operationId: staff_requestPeriodAdjustment
      summary: requestPeriodAdjustment
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US6.3]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/PeriodInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /period-adjustments/{id}/decisions:
    post:
      operationId: staff_approvePeriodAdjustment
      summary: approvePeriodAdjustment
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US6.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: PeriodAdjustment}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/software-results:
    get:
      operationId: staff_readSoftware
      summary: readSoftware
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US6.2, US6.5, US7.6, US7.7]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareViewResult'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /after-sales-requests/{id}/decisions:
    post:
      operationId: staff_decideAfterSales
      summary: decideAfterSales
      x-owner-component: AfterSalesDecision
      x-owner-unit: U7
      x-stories: [US8.4, US8.10]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesDecisionInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: AfterSalesDecision}
                  entity: {const: AfterSalesRequest}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /orders/{id}/history:
    get:
      operationId: staff_readHistory
      summary: readHistory
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US9.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: OrderAcceptance}
                  entity: {const: Order}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /notifications:
    get:
      operationId: staff_readNotices
      summary: readNotices
      x-owner-component: NotificationDelivery
      x-owner-unit: U7
      x-stories: [US8.9]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationViewResultPage'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /notifications/{id}/read-receipts:
    post:
      operationId: staff_recordNoticeRead
      summary: recordNoticeRead
      x-owner-component: NotificationDelivery
      x-owner-unit: U7
      x-stories: [US8.9]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        '202':
          description: 지속 기록된 접수; 실제 자금/출고/발급 성공은 resultRefs의 확인 사실로 별도 판단
          headers:
            Location:
              schema: {type: string}
              description: 현재 audience의 /requests/{requestId}
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: 'urn:oms:contract:common:1#/$defs/NoticeInput'}
      security:
      - Session: []
        Csrf: []
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: Idempotency-Key
        in: header
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
        description: meta.clientRequestId와 같아야 함
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: NotificationDelivery}
                  entity: {const: NotificationIntent}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /records/{owner}/{entity}/{id}/history:
    get:
      operationId: staff_readRecordHistory
      summary: readRecordHistory
      x-owner-component: WorkInquiry
      x-owner-unit: U7
      x-stories: [US9.4]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      - name: owner
        in: path
        required: true
        schema: {type: string, minLength: 1}
      - name: entity
        in: path
        required: true
        schema: {type: string, minLength: 1}
      x-call-target: {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
  /entitlements/{id}/delivery-results:
    get:
      operationId: staff_readDeliveryResult
      summary: readDeliveryResult
      x-owner-component: SoftwareLifecycle
      x-owner-unit: U6
      x-stories: [US6.2]
      responses:
        '200':
          description: 허용된 조회/그 요청의 결과; 전체 거래 완료를 뜻하지 않음
          content:
            application/json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/DeliveryView'}
        '400': {$ref: '#/components/responses/Error400'}
        '401': {$ref: '#/components/responses/Error401'}
        '403': {$ref: '#/components/responses/Error403'}
        '404': {$ref: '#/components/responses/Error404'}
        '409': {$ref: '#/components/responses/Error409'}
        '429': {$ref: '#/components/responses/Error429'}
        '503': {$ref: '#/components/responses/Error503'}
        default:
          description: 그 밖의 기술 실패도 실제4xx/5xx와 안전한 Problem Details를 일치; 정상 확인 대기는 정상 업무 결과
          content:
            application/problem+json:
              schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
      x-query-contract: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
      parameters:
      - name: id
        in: path
        required: true
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: cursor
        in: query
        required: false
        schema: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
      - name: pageSize
        in: query
        required: false
        schema: {type: integer, minimum: 1}
      x-call-target:
        allOf:
        - {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
        - properties:
            recordRef:
              allOf:
              - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
              - properties:
                  owner: {const: SoftwareLifecycle}
                  entity: {const: EnterpriseEntitlement}
      x-target-binding: 서버가 경로/원본·현재 권한을 검증해 Call.target을 구성; 본문의 동일 대상 Ref/ID가 있으면 일치해야 함
components:
  securitySchemes:
    Session:
      type: apiKey
      in: cookie
      name: oms_staff_session
      description: MFA 검증·audience/기업/현재 권한의 서버 검증 필요; 세션 공급자/수명은 OQ4
    Csrf: {type: apiKey, in: header, name: X-CSRF-Token}
    LimitedPurposeSession:
      type: apiKey
      in: cookie
      name: oms_staff_identity
      description: 검증된 subject/challenge/MFA등록 또는 복구 목적에 한정; 기업 업무/직원 승인은 허용하지 않음
  schemas:
    Id: {$ref: 'urn:oms:contract:common:1#/$defs/Id'}
    Revision: {$ref: 'urn:oms:contract:common:1#/$defs/Revision'}
    Instant: {$ref: 'urn:oms:contract:common:1#/$defs/Instant'}
    Date: {$ref: 'urn:oms:contract:common:1#/$defs/Date'}
    Quantity: {$ref: 'urn:oms:contract:common:1#/$defs/Quantity'}
    PositiveQuantity: {$ref: 'urn:oms:contract:common:1#/$defs/PositiveQuantity'}
    Money: {$ref: 'urn:oms:contract:common:1#/$defs/Money'}
    Ref: {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
    Refs: {$ref: 'urn:oms:contract:common:1#/$defs/Refs'}
    TargetScope: {$ref: 'urn:oms:contract:common:1#/$defs/TargetScope'}
    Period: {$ref: 'urn:oms:contract:common:1#/$defs/Period'}
    Evidence: {$ref: 'urn:oms:contract:common:1#/$defs/Evidence'}
    ServiceContext: {$ref: 'urn:oms:contract:common:1#/$defs/ServiceContext'}
    CommandMeta: {$ref: 'urn:oms:contract:common:1#/$defs/CommandMeta'}
    Receipt: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
    Problem: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    ReadRequest: {$ref: 'urn:oms:contract:common:1#/$defs/ReadRequest'}
    RecordQuery: {$ref: 'urn:oms:contract:common:1#/$defs/RecordQuery'}
    LoginInput: {$ref: 'urn:oms:contract:common:1#/$defs/LoginInput'}
    RegistrationInput: {$ref: 'urn:oms:contract:common:1#/$defs/RegistrationInput'}
    ChallengeInput: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInput'}
    PreIdentityContext: {$ref: 'urn:oms:contract:common:1#/$defs/PreIdentityContext'}
    LimitedIdentityContext: {$ref: 'urn:oms:contract:common:1#/$defs/LimitedIdentityContext'}
    RecoveryInput: {$ref: 'urn:oms:contract:common:1#/$defs/RecoveryInput'}
    IdentityView: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityView'}
    ActionScope: {$ref: 'urn:oms:contract:common:1#/$defs/ActionScope'}
    EnterpriseInput: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInput'}
    DecisionInput: {$ref: 'urn:oms:contract:common:1#/$defs/DecisionInput'}
    OrganisationInput: {$ref: 'urn:oms:contract:common:1#/$defs/OrganisationInput'}
    MembershipInput: {$ref: 'urn:oms:contract:common:1#/$defs/MembershipInput'}
    RoleInput: {$ref: 'urn:oms:contract:common:1#/$defs/RoleInput'}
    RoleGrantInput: {$ref: 'urn:oms:contract:common:1#/$defs/RoleGrantInput'}
    StaffRoleInput: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRoleInput'}
    AccessInput: {$ref: 'urn:oms:contract:common:1#/$defs/AccessInput'}
    AccessView: {$ref: 'urn:oms:contract:common:1#/$defs/AccessView'}
    EnterpriseView: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseView'}
    ProductInput: {$ref: 'urn:oms:contract:common:1#/$defs/ProductInput'}
    ProductView: {$ref: 'urn:oms:contract:common:1#/$defs/ProductView'}
    AgreementInput: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementInput'}
    ContractChangeInput: {$ref: 'urn:oms:contract:common:1#/$defs/ContractChangeInput'}
    OfferExceptionInput: {$ref: 'urn:oms:contract:common:1#/$defs/OfferExceptionInput'}
    ProposalInput: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalInput'}
    ConsentInput: {$ref: 'urn:oms:contract:common:1#/$defs/ConsentInput'}
    AgreementView: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementView'}
    OrderLineInput: {$ref: 'urn:oms:contract:common:1#/$defs/OrderLineInput'}
    OrderInput: {$ref: 'urn:oms:contract:common:1#/$defs/OrderInput'}
    OrderLineView: {$ref: 'urn:oms:contract:common:1#/$defs/OrderLineView'}
    OrderView: {$ref: 'urn:oms:contract:common:1#/$defs/OrderView'}
    ApplyOrderChangeInput: {$ref: 'urn:oms:contract:common:1#/$defs/ApplyOrderChangeInput'}
    FinancialEvidenceInput: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialEvidenceInput'}
    AllocationInput: {$ref: 'urn:oms:contract:common:1#/$defs/AllocationInput'}
    FinancialActionInput: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialActionInput'}
    FinancialView: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialView'}
    EligibilityInput: {$ref: 'urn:oms:contract:common:1#/$defs/EligibilityInput'}
    EligibilityView: {$ref: 'urn:oms:contract:common:1#/$defs/EligibilityView'}
    SupplyInput: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyInput'}
    SupplyView: {$ref: 'urn:oms:contract:common:1#/$defs/SupplyView'}
    HardwareActionInput: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareActionInput'}
    HardwareView: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareView'}
    SoftwareActionInput: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareActionInput'}
    PeriodInput: {$ref: 'urn:oms:contract:common:1#/$defs/PeriodInput'}
    SoftwareView: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareView'}
    AfterSalesInput: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesInput'}
    AfterSalesDecisionInput: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesDecisionInput'}
    AfterSalesView: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesView'}
    NotificationView: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationView'}
    NoticeInput: {$ref: 'urn:oms:contract:common:1#/$defs/NoticeInput'}
    HistoryView: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryView'}
    IdentityViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/IdentityViewResult'}
    EnterpriseViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseViewResult'}
    ProductViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/ProductViewResult'}
    AgreementViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResult'}
    OrderViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/OrderViewResult'}
    FinancialViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialViewResult'}
    HardwareViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareViewResult'}
    SoftwareViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareViewResult'}
    AfterSalesViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/AfterSalesViewResult'}
    NotificationViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationViewResult'}
    InquiryView: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryView'}
    InquiryViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResult'}
    DiagnosticInput: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
    DiagnosticView: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
    OperatingEvidenceInput: {$ref: 'urn:oms:contract:common:1#/$defs/OperatingEvidenceInput'}
    OperationalView: {$ref: 'urn:oms:contract:common:1#/$defs/OperationalView'}
    Fact: {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
    Work: {$ref: 'urn:oms:contract:common:1#/$defs/Work'}
    ExternalRequest: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
    ExternalObservation: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
    BuildManifest: {$ref: 'urn:oms:contract:common:1#/$defs/BuildManifest'}
    Binding: {$ref: 'urn:oms:contract:common:1#/$defs/Binding'}
    BindingManifest: {$ref: 'urn:oms:contract:common:1#/$defs/BindingManifest'}
    ProductViewResultPage: {$ref: 'urn:oms:contract:common:1#/$defs/ProductViewResultPage'}
    AgreementViewResultPage: {$ref: 'urn:oms:contract:common:1#/$defs/AgreementViewResultPage'}
    InquiryViewResultPage: {$ref: 'urn:oms:contract:common:1#/$defs/InquiryViewResultPage'}
    NotificationViewResultPage: {$ref: 'urn:oms:contract:common:1#/$defs/NotificationViewResultPage'}
    OrganisationView: {$ref: 'urn:oms:contract:common:1#/$defs/OrganisationView'}
    MembershipView: {$ref: 'urn:oms:contract:common:1#/$defs/MembershipView'}
    CustomerRoleView: {$ref: 'urn:oms:contract:common:1#/$defs/CustomerRoleView'}
    StaffRoleView: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRoleView'}
    StaffRolePage: {$ref: 'urn:oms:contract:common:1#/$defs/StaffRolePage'}
    InvitationInput: {$ref: 'urn:oms:contract:common:1#/$defs/InvitationInput'}
    ProposalTerms: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalTerms'}
    ProposalView: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalView'}
    ProposalViewResult: {$ref: 'urn:oms:contract:common:1#/$defs/ProposalViewResult'}
    HistoryItem: {$ref: 'urn:oms:contract:common:1#/$defs/HistoryItem'}
    DeliveryView: {$ref: 'urn:oms:contract:common:1#/$defs/DeliveryView'}
    ApprovedTermsView: {$ref: 'urn:oms:contract:common:1#/$defs/ApprovedTermsView'}
    ApprovedTermsResult: {$ref: 'urn:oms:contract:common:1#/$defs/ApprovedTermsResult'}
    FinancialObservation: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialObservation'}
    HardwareObservation: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareObservation'}
    SoftwareObservation: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareObservation'}
    hardwareSecureInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareSecureInput'}
    hardwareReserveInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReserveInput'}
    hardwareReleaseInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReleaseInput'}
    hardwareShipInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareShipInput'}
    hardwareConfirmCompletionInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareConfirmCompletionInput'}
    hardwareReturnInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReturnInput'}
    hardwareReconcileInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareReconcileInput'}
    hardwareRetryInput: {$ref: 'urn:oms:contract:common:1#/$defs/hardwareRetryInput'}
    softwareIssueInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareIssueInput'}
    softwareRenewInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRenewInput'}
    softwareAutoRenewApplyInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewApplyInput'}
    softwareAutoRenewCancelInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareAutoRenewCancelInput'}
    softwareReconcileInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareReconcileInput'}
    softwareRetryInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRetryInput'}
    softwareRevokeInput: {$ref: 'urn:oms:contract:common:1#/$defs/softwareRevokeInput'}
    requestChangeInput: {$ref: 'urn:oms:contract:common:1#/$defs/requestChangeInput'}
    requestCancelInput: {$ref: 'urn:oms:contract:common:1#/$defs/requestCancelInput'}
    requestReturnInput: {$ref: 'urn:oms:contract:common:1#/$defs/requestReturnInput'}
    NoInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/NoInvocationTarget'}
    RecordInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/RecordInvocationTarget'}
    EnterpriseInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/EnterpriseInvocationTarget'}
    ReceiptInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptInvocationTarget'}
    ChallengeInvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/ChallengeInvocationTarget'}
    InvocationTarget: {$ref: 'urn:oms:contract:common:1#/$defs/InvocationTarget'}
    ReceiptReadRequest: {$ref: 'urn:oms:contract:common:1#/$defs/ReceiptReadRequest'}
    ProvisionTranche: {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionTranche'}
    ProvisionFinanceFact: {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionFinanceFact'}
    CompletionFactQuery: {$ref: 'urn:oms:contract:common:1#/$defs/CompletionFactQuery'}
    CompletionFactView: {$ref: 'urn:oms:contract:common:1#/$defs/CompletionFactView'}
  responses:
    Error400:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error401:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error403:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error404:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error409:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error429:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}
    Error503:
      description: 실패 의미/비노출 정책은 공통 오류 표 참조
      content:
        application/problem+json:
          schema: {$ref: 'urn:oms:contract:common:1#/$defs/Problem'}

```


### C18 — worker 작업 전달/재확인

공급: U1 API/worker 실행 역할; 소비: U1/U2–U7 worker 처리자; 명세 의미 소유: 작업 의미: 해당 업무; 전달 공통: U1. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:work:1
x-contract-id: C18
$ref: urn:oms:contract:common:1#/$defs/Work
x-result: {$ref: 'urn:oms:contract:common:1#/$defs/Receipt'}
x-delivery: committed-only; repeated delivery permitted; consumed effect + processed workId + next facts/work atomically committed

```


### C19 — 성공 접수/복구·이력 대조

공급: U1–U7 각 원본 진단; 소비: U10; 명세 의미 소유: 진단 원본: 각 업무; 평가: OperationalAssurance. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:diagnostics:1
x-contract-id: C19
x-input: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticInput'}
x-output: {$ref: 'urn:oms:contract:common:1#/$defs/DiagnosticView'}
x-write-authority: '없음: 읽기 증거로 원본을 변경하지 않음'

```


### C20-E01 — MFA 복구/재등록 결과의 통지 근거 전달

공급: U2; 소비: U7 NotificationDelivery; 명세 의미 소유: IdentityRecovery. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: MFA 복구/재등록 결과의 통지 근거 전달, version: 1.0.0}
id: urn:oms:contract:fact:e01:1
x-contract-id: C20-E01
defaultContentType: application/json
channels:
  committedFact:
    address: IdentityRecovery.NotificationDelivery.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: IdentityRecovery
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: NotificationDelivery
components:
  messages:
    fact:
      name: E01
      title: MFA 복구/재등록 결과의 통지 근거 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: IdentityRecovery}
            x-source-fact-owner-must-match: IdentityRecovery
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E07 — 제안·계약 판단의 고객 조치 통지 근거 전달

공급: U3; 소비: U7 NotificationDelivery; 명세 의미 소유: CommercialAgreement. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 제안·계약 판단의 고객 조치 통지 근거 전달, version: 1.0.0}
id: urn:oms:contract:fact:e07:1
x-contract-id: C20-E07
defaultContentType: application/json
channels:
  committedFact:
    address: CommercialAgreement.NotificationDelivery.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: CommercialAgreement
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: NotificationDelivery
components:
  messages:
    fact:
      name: E07
      title: 제안·계약 판단의 고객 조치 통지 근거 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: CommercialAgreement}
            x-source-fact-owner-must-match: CommercialAgreement
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E14 — 확인된 주문 수락/조건 변경·제공 선택 사실 전달

공급: U3; 소비: U4 FinancialSettlement; 명세 의미 소유: OrderAcceptance. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 확인된 주문 수락/조건 변경·제공 선택 사실 전달, version: 1.0.0}
id: urn:oms:contract:fact:e14:1
x-contract-id: C20-E14
defaultContentType: application/json
channels:
  committedFact:
    address: OrderAcceptance.FinancialSettlement.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: OrderAcceptance
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: FinancialSettlement
components:
  messages:
    fact:
      name: E14
      title: 확인된 주문 수락/조건 변경·제공 선택 사실 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: OrderAcceptance}
            x-source-fact-owner-must-match: OrderAcceptance
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E15 — 확인된 주문 수락/조건 변경·제공 선택 사실 전달

공급: U3; 소비: U5 HardwareFulfillment; 명세 의미 소유: OrderAcceptance. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 확인된 주문 수락/조건 변경·제공 선택 사실 전달, version: 1.0.0}
id: urn:oms:contract:fact:e15:1
x-contract-id: C20-E15
defaultContentType: application/json
channels:
  committedFact:
    address: OrderAcceptance.HardwareFulfillment.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: OrderAcceptance
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: HardwareFulfillment
components:
  messages:
    fact:
      name: E15
      title: 확인된 주문 수락/조건 변경·제공 선택 사실 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: OrderAcceptance}
            x-source-fact-owner-must-match: OrderAcceptance
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E16 — 확인된 주문 수락/조건 변경·제공 선택 사실 전달

공급: U3; 소비: U6 SoftwareLifecycle; 명세 의미 소유: OrderAcceptance. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 확인된 주문 수락/조건 변경·제공 선택 사실 전달, version: 1.0.0}
id: urn:oms:contract:fact:e16:1
x-contract-id: C20-E16
defaultContentType: application/json
channels:
  committedFact:
    address: OrderAcceptance.SoftwareLifecycle.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: OrderAcceptance
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: SoftwareLifecycle
components:
  messages:
    fact:
      name: E16
      title: 확인된 주문 수락/조건 변경·제공 선택 사실 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: OrderAcceptance}
            x-source-fact-owner-must-match: OrderAcceptance
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E17 — 주문 수락/거절·확인 필요 통지 근거 전달

공급: U3; 소비: U7 NotificationDelivery; 명세 의미 소유: OrderAcceptance. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 주문 수락/거절·확인 필요 통지 근거 전달, version: 1.0.0}
id: urn:oms:contract:fact:e17:1
x-contract-id: C20-E17
defaultContentType: application/json
channels:
  committedFact:
    address: OrderAcceptance.NotificationDelivery.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: OrderAcceptance
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: NotificationDelivery
components:
  messages:
    fact:
      name: E17
      title: 주문 수락/거절·확인 필요 통지 근거 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: OrderAcceptance}
            x-source-fact-owner-must-match: OrderAcceptance
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E20 — 확인된 지급 조건·제한·대금 충돌/정정 사실 전달

공급: U4; 소비: U5 HardwareFulfillment; 명세 의미 소유: FinancialSettlement. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 확인된 지급 조건·제한·대금 충돌/정정 사실 전달, version: 1.0.0}
id: urn:oms:contract:fact:e20:1
x-contract-id: C20-E20
defaultContentType: application/json
channels:
  committedFact:
    address: FinancialSettlement.HardwareFulfillment.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: FinancialSettlement
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: HardwareFulfillment
components:
  messages:
    fact:
      name: E20
      title: 확인된 지급 조건·제한·대금 충돌/정정 사실 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: FinancialSettlement}
            x-source-fact-owner-must-match: FinancialSettlement
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E21 — 지급/유예·요금 조정·대금 충돌/정정 사실 전달

공급: U4; 소비: U6 SoftwareLifecycle; 명세 의미 소유: FinancialSettlement. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 지급/유예·요금 조정·대금 충돌/정정 사실 전달, version: 1.0.0}
id: urn:oms:contract:fact:e21:1
x-contract-id: C20-E21
defaultContentType: application/json
channels:
  committedFact:
    address: FinancialSettlement.SoftwareLifecycle.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: FinancialSettlement
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: SoftwareLifecycle
components:
  messages:
    fact:
      name: E21
      title: 지급/유예·요금 조정·대금 충돌/정정 사실 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: FinancialSettlement}
            x-source-fact-owner-must-match: FinancialSettlement
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E22 — 지급 확인·대금 조치 필요 통지 근거 전달

공급: U4; 소비: U7 NotificationDelivery; 명세 의미 소유: FinancialSettlement. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 지급 확인·대금 조치 필요 통지 근거 전달, version: 1.0.0}
id: urn:oms:contract:fact:e22:1
x-contract-id: C20-E22
defaultContentType: application/json
channels:
  committedFact:
    address: FinancialSettlement.NotificationDelivery.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: FinancialSettlement
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: NotificationDelivery
components:
  messages:
    fact:
      name: E22
      title: 지급 확인·대금 조치 필요 통지 근거 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: FinancialSettlement}
            x-source-fact-owner-must-match: FinancialSettlement
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E25 — 수량별 실제 제공/회수·이행 충돌/정정 사실 전달

공급: U5; 소비: U4 FinancialSettlement; 명세 의미 소유: HardwareFulfillment. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 수량별 실제 제공/회수·이행 충돌/정정 사실 전달, version: 1.0.0}
id: urn:oms:contract:fact:e25:1
x-contract-id: C20-E25
defaultContentType: application/json
channels:
  committedFact:
    address: HardwareFulfillment.FinancialSettlement.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: HardwareFulfillment
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: FinancialSettlement
components:
  messages:
    fact:
      name: E25
      title: 수량별 실제 제공/회수·이행 충돌/정정 사실 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionFinanceFact'}
          - properties:
              sourceOwner: {const: HardwareFulfillment}
              sourceFactRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
              aggregateRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: HardwareFulfillment}
              providedTranches:
                items:
                  allOf:
                  - {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionTranche'}
                  - properties:
                      trancheRef:
                        allOf:
                        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                        - properties:
                            owner: {const: HardwareFulfillment}
                      completionBasis:
                        type: string
                        enum: [HW_DELIVERY, HW_CUSTOMER_ACCEPTANCE]
            x-source-fact-owner-must-match: HardwareFulfillment
          x-read-back-contract: C07.readCompletionFact
          x-quantity-date-basis: 각 trancheRef/orderLineRef/completedQuantity/completedAt/termsSnapshotRef/sourceRevision/correctionOf로 제공 건별 후불 기산
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E26 — 출고/제공·지연/미확인·고객 조치 통지 근거 전달

공급: U5; 소비: U7 NotificationDelivery; 명세 의미 소유: HardwareFulfillment. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 출고/제공·지연/미확인·고객 조치 통지 근거 전달, version: 1.0.0}
id: urn:oms:contract:fact:e26:1
x-contract-id: C20-E26
defaultContentType: application/json
channels:
  committedFact:
    address: HardwareFulfillment.NotificationDelivery.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: HardwareFulfillment
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: NotificationDelivery
components:
  messages:
    fact:
      name: E26
      title: 출고/제공·지연/미확인·고객 조치 통지 근거 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: HardwareFulfillment}
            x-source-fact-owner-must-match: HardwareFulfillment
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E29 — 갱신 청구 판단 입력·실제 제공/회수·보상 기간/정정 사실 전달

공급: U6; 소비: U4 FinancialSettlement; 명세 의미 소유: SoftwareLifecycle. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 갱신 청구 판단 입력·실제 제공/회수·보상 기간/정정 사실 전달, version: 1.0.0}
id: urn:oms:contract:fact:e29:1
x-contract-id: C20-E29
defaultContentType: application/json
channels:
  committedFact:
    address: SoftwareLifecycle.FinancialSettlement.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: SoftwareLifecycle
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: FinancialSettlement
components:
  messages:
    fact:
      name: E29
      title: 갱신 청구 판단 입력·실제 제공/회수·보상 기간/정정 사실 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionFinanceFact'}
          - properties:
              sourceOwner: {const: SoftwareLifecycle}
              sourceFactRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
              aggregateRef:
                allOf:
                - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                - properties:
                    owner: {const: SoftwareLifecycle}
              providedTranches:
                items:
                  allOf:
                  - {$ref: 'urn:oms:contract:common:1#/$defs/ProvisionTranche'}
                  - properties:
                      trancheRef:
                        allOf:
                        - {$ref: 'urn:oms:contract:common:1#/$defs/Ref'}
                        - properties:
                            owner: {const: SoftwareLifecycle}
                      completionBasis:
                        type: string
                        enum: [SW_ISSUANCE_AVAILABLE_AND_START]
            x-source-fact-owner-must-match: SoftwareLifecycle
          x-read-back-contract: C08.readCompletionFact
          x-quantity-date-basis: 각 trancheRef/orderLineRef/completedQuantity/completedAt/termsSnapshotRef/sourceRevision/correctionOf로 제공 건별 후불 기산
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E30 — 발급/갱신/만료 예정·동의/고객 조치 통지 근거 전달

공급: U6; 소비: U7 NotificationDelivery; 명세 의미 소유: SoftwareLifecycle. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 발급/갱신/만료 예정·동의/고객 조치 통지 근거 전달, version: 1.0.0}
id: urn:oms:contract:fact:e30:1
x-contract-id: C20-E30
defaultContentType: application/json
channels:
  committedFact:
    address: SoftwareLifecycle.NotificationDelivery.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: SoftwareLifecycle
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: NotificationDelivery
components:
  messages:
    fact:
      name: E30
      title: 발급/갱신/만료 예정·동의/고객 조치 통지 근거 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: SoftwareLifecycle}
            x-source-fact-owner-must-match: SoftwareLifecycle
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E37 — 허용된 환불 대상·합의 한도·보류 판단 전달

공급: U7; 소비: U4 FinancialSettlement; 명세 의미 소유: AfterSalesDecision. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 허용된 환불 대상·합의 한도·보류 판단 전달, version: 1.0.0}
id: urn:oms:contract:fact:e37:1
x-contract-id: C20-E37
defaultContentType: application/json
channels:
  committedFact:
    address: AfterSalesDecision.FinancialSettlement.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: AfterSalesDecision
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: FinancialSettlement
components:
  messages:
    fact:
      name: E37
      title: 허용된 환불 대상·합의 한도·보류 판단 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: AfterSalesDecision}
            x-source-fact-owner-must-match: AfterSalesDecision
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E38 — 허용된 보류/계속·취소/회수 대상 판단 전달

공급: U7; 소비: U5 HardwareFulfillment; 명세 의미 소유: AfterSalesDecision. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 허용된 보류/계속·취소/회수 대상 판단 전달, version: 1.0.0}
id: urn:oms:contract:fact:e38:1
x-contract-id: C20-E38
defaultContentType: application/json
channels:
  committedFact:
    address: AfterSalesDecision.HardwareFulfillment.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: AfterSalesDecision
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: HardwareFulfillment
components:
  messages:
    fact:
      name: E38
      title: 허용된 보류/계속·취소/회수 대상 판단 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: AfterSalesDecision}
            x-source-fact-owner-must-match: AfterSalesDecision
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E39 — 허용된 보류/계속·권한 회수 대상 판단 전달

공급: U7; 소비: U6 SoftwareLifecycle; 명세 의미 소유: AfterSalesDecision. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 허용된 보류/계속·권한 회수 대상 판단 전달, version: 1.0.0}
id: urn:oms:contract:fact:e39:1
x-contract-id: C20-E39
defaultContentType: application/json
channels:
  committedFact:
    address: AfterSalesDecision.SoftwareLifecycle.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: AfterSalesDecision
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: SoftwareLifecycle
components:
  messages:
    fact:
      name: E39
      title: 허용된 보류/계속·권한 회수 대상 판단 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: AfterSalesDecision}
            x-source-fact-owner-must-match: AfterSalesDecision
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E40 — 후속 판단·고객 조치 필요 통지 근거 전달

공급: U7; 소비: U7 NotificationDelivery; 명세 의미 소유: AfterSalesDecision. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 후속 판단·고객 조치 필요 통지 근거 전달, version: 1.0.0}
id: urn:oms:contract:fact:e40:1
x-contract-id: C20-E40
defaultContentType: application/json
channels:
  committedFact:
    address: AfterSalesDecision.NotificationDelivery.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: AfterSalesDecision
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: NotificationDelivery
components:
  messages:
    fact:
      name: E40
      title: 후속 판단·고객 조치 필요 통지 근거 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: AfterSalesDecision}
            x-source-fact-owner-must-match: AfterSalesDecision
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C20-E62 — 복구 시도/실패·점검/지연 통지 근거 전달

공급: U10; 소비: U7 NotificationDelivery; 명세 의미 소유: OperationalAssurance. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
asyncapi: 3.0.0
info: {title: 복구 시도/실패·점검/지연 통지 근거 전달, version: 1.0.0}
id: urn:oms:contract:fact:e62:1
x-contract-id: C20-E62
defaultContentType: application/json
channels:
  committedFact:
    address: OperationalAssurance.NotificationDelivery.facts.v1
    description: 논리 주소; AWS 서비스/브로커 바인딩 미선정
    messages:
      fact: {$ref: '#/components/messages/fact'}
operations:
  publishFact:
    action: send
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: OperationalAssurance
  consumeFact:
    action: receive
    channel: {$ref: '#/channels/committedFact'}
    x-execution-owner: NotificationDelivery
components:
  messages:
    fact:
      name: E62
      title: 복구 시도/실패·점검/지연 통지 근거 전달
      payload:
        schemaFormat: application/schema+json;version=draft-2020-12
        schema:
          allOf:
          - {$ref: 'urn:oms:contract:common:1#/$defs/Fact'}
          - properties:
              sourceOwner: {const: OperationalAssurance}
            x-source-fact-owner-must-match: OperationalAssurance
      correlationId: {location: $message.payload#/correlationId}
x-consumer-rule: 검증된 원본 사실/버전으로 해당 소비자만 판단; 반복/역순은 최신 원본 대조; 새 사실을 생성한 경우만 다음 의무 발행

```


### C21 — IdentityRecovery 외부 실행/결과 어댑터

공급: U2; 소비: External: 미선정 신원/MFA/복구 주체; 명세 의미 소유: IdentityRecovery. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:adapter:identityrecovery:1
x-contract-id: C21
x-owner: IdentityRecovery
x-outside-boundary: 'External: 미선정 신원/MFA/복구 주체'
x-mechanism: OMS가 구현할 adapter port; 업체별 전송 프로토콜/주소/인증은 확보 전 미정
x-operations:
- name: requestApprovedOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
- name: observeOriginalOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
x-stories: [US1.7, US1.8, US1.9]
x-guard: 실제 주체 지원/증거가 없으면 UNCONFIRMED; requestApprovedOperation은 실제 업체 기능을 추가 약속하지 않음

```


### C22 — FinancialSettlement 외부 실행/결과 어댑터

공급: U4; 소비: External: 미선정 청구/지급/환불 주체; 명세 의미 소유: FinancialSettlement. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:adapter:financialsettlement:1
x-contract-id: C22
x-owner: FinancialSettlement
x-outside-boundary: 'External: 미선정 청구/지급/환불 주체'
x-mechanism: OMS가 구현할 adapter port; 업체별 전송 프로토콜/주소/인증은 확보 전 미정
x-operations:
- name: requestApprovedOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialObservation'}
- name: observeOriginalOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/FinancialObservation'}
x-stories: [US4.2, US8.6]
x-guard: 실제 주체 지원/증거가 없으면 UNCONFIRMED; requestApprovedOperation은 실제 업체 기능을 추가 약속하지 않음

```


### C23 — HardwareFulfillment 외부 실행/결과 어댑터

공급: U5; 소비: External: 미선정 재고/확보/배송/회수 주체; 명세 의미 소유: HardwareFulfillment. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:adapter:hardwarefulfillment:1
x-contract-id: C23
x-owner: HardwareFulfillment
x-outside-boundary: 'External: 미선정 재고/확보/배송/회수 주체'
x-mechanism: OMS가 구현할 adapter port; 업체별 전송 프로토콜/주소/인증은 확보 전 미정
x-operations:
- name: requestApprovedOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareObservation'}
- name: observeOriginalOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/HardwareObservation'}
x-stories: [US5.2, US8.11]
x-guard: 실제 주체 지원/증거가 없으면 UNCONFIRMED; requestApprovedOperation은 실제 업체 기능을 추가 약속하지 않음

```


### C24 — SoftwareLifecycle 외부 실행/결과 어댑터

공급: U6; 소비: External: 우리 측 발급/전달/적용/회수 실행 수단; 명세 의미 소유: SoftwareLifecycle. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:adapter:softwarelifecycle:1
x-contract-id: C24
x-owner: SoftwareLifecycle
x-outside-boundary: 'External: 우리 측 발급/전달/적용/회수 실행 수단'
x-mechanism: OMS가 구현할 adapter port; 업체별 전송 프로토콜/주소/인증은 확보 전 미정
x-operations:
- name: requestApprovedOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareObservation'}
- name: observeOriginalOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/SoftwareObservation'}
x-stories: [US6.1, US6.5, US8.5]
x-guard: 실제 주체 지원/증거가 없으면 UNCONFIRMED; requestApprovedOperation은 실제 업체 기능을 추가 약속하지 않음

```


### C25 — NotificationDelivery 외부 실행/결과 어댑터

공급: U7; 소비: External: 미선정 이메일/업무 메신저; 명세 의미 소유: NotificationDelivery. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:adapter:notificationdelivery:1
x-contract-id: C25
x-owner: NotificationDelivery
x-outside-boundary: 'External: 미선정 이메일/업무 메신저'
x-mechanism: OMS가 구현할 adapter port; 업체별 전송 프로토콜/주소/인증은 확보 전 미정
x-operations:
- name: requestApprovedOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
- name: observeOriginalOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
x-stories: [US8.9, US9.1]
x-guard: 실제 주체 지원/증거가 없으면 UNCONFIRMED; requestApprovedOperation은 실제 업체 기능을 추가 약속하지 않음

```


### C26 — OperationalAssurance 외부 실행/결과 어댑터

공급: U10; 소비: External: 미선정 관측/배포/복구/위치 검증 수단; 명세 의미 소유: OperationalAssurance. 공통 불변 조건과 아래 경계 서명을 함께 적용한다.

```yaml
$schema: https://json-schema.org/draft/2020-12/schema
$id: urn:oms:contract:adapter:operationalassurance:1
x-contract-id: C26
x-owner: OperationalAssurance
x-outside-boundary: 'External: 미선정 관측/배포/복구/위치 검증 수단'
x-mechanism: OMS가 구현할 adapter port; 업체별 전송 프로토콜/주소/인증은 확보 전 미정
x-operations:
- name: requestApprovedOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
- name: observeOriginalOperation
  input: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalRequest'}
  output: {$ref: 'urn:oms:contract:common:1#/$defs/ExternalObservation'}
x-stories: [US9.1, US9.2, US9.3, US9.5, US9.6, US9.7]
x-guard: 실제 주체 지원/증거가 없으면 UNCONFIRMED; requestApprovedOperation은 실제 업체 기능을 추가 약속하지 않음

```


## 경로 대상과 제공 건별 기산

### 서버 경로 대상의 명시적 전달

- C16/C17의 x-call-target을 서버가 검증해 C01–C12 Call.target으로 전달한다. UI 본문에 검증된 서버 Context/target을 넣어 권한을 주장할 수 없다. target 없는 호출은 스키마가 거절한다. id가 없는 신규/목록 호출은 kind NONE을 명시한다.
- 상품 수정의 target은 RECORD·ProductCatalog/Product이며 경로 product id의 원본과 버전을 보존한다. 입력의 expectedRevision은 이 원본과 대조한다. 권한을 평가했다는 이유로 target id를 호출 인자에서 생략하지 않는다.
- 기업 경로의 target은 ENTERPRISE·EnterpriseAccess/Enterprise다. 조직 변경은 OrganisationInput.changeKind CREATE 또는 UPDATE와 organisationRef를 함께 전달한다. CREATE는 organisationRef/expectedRevision이 null, UPDATE는 해당 Department/BusinessSite 원본과 현재 revision이 필요하다. 조직 원본이 경로 기업에 속하고 entityKind와 일치하는지 서버가 확인한다.
- 접수 조회는 kind REQUEST의 requestId와 ReceiptReadRequest.requestId를 모두 선언한다. 둘은 검증한 /requests/{id}와 같아야 한다. 접수 ID를 거래 entity의 Ref나 주문 ID로 대체하지 않는다. 같은 주문에 연결된 서로 다른 요청은 서로 다른 Receipt를 반환하며 현재 권한/원래 principal/audience를 검증한다.
- 목적 제한 인증의 challenge 경로는 kind CHALLENGE/challengeId, 나머지 기록 경로는 RECORD/recordRef를 사용한다. 이력의 owner/entity/id도 같은 검증된 recordRef로 전달한다. 본문에 대상 Ref/ID가 있으면 경로 target과 일치하고 실제 부모/기업 관계와 버전을 확인한다. path 값과 body 값을 따로 믿거나 숨은 비명세 인자를 추가하지 않는다.

### 배송·인수·SW 완료 자료의 의미

- HW_DELIVERY는 확인된 배송 완료다. completedAt은 hardwareDeliveredAt과 같고 별도 인수를 자동 요구하지 않는다. 출고만 확인됐으면 PENDING이며 completedQuantity0/completedAt null이다.
- HW_CUSTOMER_ACCEPTANCE는 확인된 고객 인수다. completedAt은 customerAcceptedAt과 같다. 배송 정보만으로 완료하지 않는다. 인수 증거 자체가 물리 수령 근거일 수 있으므로 별도 배송 증빙과 인수를 일률적으로 둘 다 요구하지 않는다.
- SW_ISSUANCE_AVAILABLE_AND_START의 completedAt은 검증된 softwareIssuedAt·resultAvailableAt·contractualStartAt 중 가장 늦은 시각이다. 조기 시험/보상으로 바뀐 실제 기간 시작을 계약 기산 시각으로 대체하지 않는다. 발급 지연을 과거 시작일로 소급 완료하지 않는다. 설치/정상 사용 확인을 공통 필수 조건으로 추가하지 않는다.
- ProvisionTranche는 안정적인 실제 제공 건 trancheId·근거 원본 trancheRef·주문·품목·구매 당시 termsSnapshotRef·실제 완료 수량/시각·완료 기준·원본 버전·정정 관계를 함께 가진다. 서로 다른 날 제공한 수량은 각각 다른 trancheId를 가진다. trancheRef는 소유자의 ShipmentTranche/IssuanceAttempt/RenewalCycle 등 근거 원본이며 한 원본에서 여러 제공 건이 생겨도 각 trancheId를 보존한다. 기술 재시도는 같은 실제 제공 건을 새 trancheId로 만들지 않는다. COMPLETED에 수량/시각/필수 완료 근거가 없으면 스키마 및 소유자 의미 검증이 거절한다. UNKNOWN/CONFLICT는 수량/시각 null이며 미확인 값을0이나 완료로 바꾸지 않는다.
- E25/E29는 ProvisionFinanceFact의 제공 건 배열을 전달한다. 기존 회수/갱신 청구/보상/충돌 등 다른 사실은 OTHER_OWNED_RESULT와 기존 sourceFactRef로 구별해 유지한다. OTHER_OWNED_RESULT만으로 새 제공 완료를 만들지 않는다. 제공 완료/정정/진행 사실에는 제공 건 배열이 반드시 있어야 한다.
- 참조/버전 공백이나 늦은 정정은 HardwareFulfillment 또는 SoftwareLifecycle의 readCompletionFact(sourceFactRef, aggregateRef, minimumSourceRevision)로 최신 제공 건/정정 상태를 대조한다. minimumSourceRevision/latestSourceRevision은 지정한 aggregateRef의 버전이며 개별 제공 건 sourceRevision과 혼합 비교하지 않는다. View.aggregateRef의 id/owner는 조회 대상과 같고 revision은 latestSourceRevision과 같아야 한다. FinancialSettlement만 finance.postpay.reconcile 목적·검증된 SYSTEM 실행 근거 또는 권한 있는 직원의 대금 행위 근거로 호출하며 해당 기업/주문/품목 범위만 받는다. licence key/전달 내용·전체 SW 원본을 열지 않는다.
- 이 두 읽기 연결은 기존81개 Domain 관계에 더해 이번 데이터 대조를 위해 명시한 계약 관계다. U4는 U1에 선언된 포트 서명만 사용하며 U5/U6 구현을 import하지 않는다. U5/U6에서 등록/실제 통합을 검증한다. 공급자 미등록·UNKNOWN/GAP/CONFLICT에서는 후불 기산/확정을 추측하지 않고 해당 의존 조치만 대조/대기로 둔다.
- Finance는 (제공 소유자, trancheId, orderLineRef.id)와 sourceRevision/sourceFactRef로 동일 건의 중복·순서를 대조한다. sourceRevision은 같은 trancheId 안의 단조 증가 버전이며 aggregateRef의 버전이나 근거 기록 trancheRef.revision과 무조건 같다고 가정하지 않는다. 반복 eventId/같은 제공 건 버전은 새 청구 효과를 만들지 않는다. 늦은 더 낮은 버전은 최신 완료를 되돌리지 않는다. 더 높은 정정은 같은 trancheId의 원래 건/청구와 연결하고 승인된 달력/정정 정책대로 다시 대조한다. 실제 회수/반품만으로 해당 완료 건을 REVERSED로 만드는 정책은 추가하지 않는다.
- completedAt의 한국 날짜와 그 제공 건에 고정한 구매/합의 달력 규칙으로 후불 기한을 산정한다. 청구일·소비한 날짜·새 계약 개정일로 대체하지 않는다. 회수는 이미 완료된 제공을 자동으로 미제공으로 바꾸는 명령이 아니며 후속 판단/환불 정책과 실제 결과를 별도로 연결한다.

| 추가 계약 관계 | 공급자 | 소비자 | 명세/접근 범위 |
|---|---|---|---|
| RC01 | C07 HardwareFulfillment.readCompletionFact | U4 FinancialSettlement | sourceFactRef에 연결된 해당 주문/품목의 제공 건·최신 정정만 읽기 |
| RC02 | C08 SoftwareLifecycle.readCompletionFact | U4 FinancialSettlement | 동일 범위의 SW 제공 건/기산 자료만 읽기, 발급 민감 결과 제외 |

### 합성 경계 예시의 전제

대상/완료 의미 검증은 위 구조와 아래 예시로 수행한다. 일부 제공 예시는 유효한 고객 부분 제공 동의가 있고, 합성 계약이 달력30일을 선택한 경우다. 달력30일은 검증용 조건이며 모든 제품의 지급 조건/달력·반올림·정정 정책을 선택하는 요구사항이 아니다. OQ1/OQ2와 실제 소유자/인프라 구현 검증은 유지한다.

| 합성 사례 | 입력/근거 | 기대 결과와 검증 방식 |
|---|---|---|
| 상품 수정 대상 | Call.target RECORD/Product product-1, 기대 버전1 | 올바른 호출은 스키마 통과; target 누락/다른 entity는 스키마 거절; 다른 경로 id/기대 버전/null 수정 버전은 선언된 매핑 조건에서 거절 |
| 조직 생성/수정 | 기업 enterprise-1, CREATE/null 또는 UPDATE/Department department-1 | 생성과 수정 스키마 구분; UPDATE의 대상 누락 거절; 부서 원본이 다른 기업이면 부모 관계 검증에서 거절 |
| 같은 주문의 다른 접수 | /requests/request-A 및 /requests/request-B, target와 ReceiptReadRequest 모두 각각 동일 ID | 같은 주문 targetRef라도 서로 다른 requestId/Receipt 조회; path/target/data ID 불일치는 매핑 조건에서 거절 |
| HW 출고만 확인 | 배송/인수 증거 없음, PENDING·완료 수량0/시각 null | 후불 기산하지 않음; 완료 상태로 바꾸되 배송 근거가 없으면 스키마 거절 |
| HW 배송 기준 | 제공A:5개, 2026-10-01 배송 완료, 별도 인수 없음 | HW_DELIVERY로 완료 가능; 합성 달력30일의 기한2026-10-31 |
| HW 인수 기준 | 배송 확인만 있다가 2026-10-02 고객 인수 확인 | 배송만으로 미완료; 인수 후 완료; 배송과 인수를 일률적 두 필수 증거로 요구하지 않음 |
| 다른 날 부분 제공 | 제공A:5개/10-01, 제공B:5개/10-08, 서로 다른 trancheId | 두 제공 건의 합성 기한10-31/11-07·총수량10을 구별; 청구일로 바꾸지 않음 |
| 반복·늦은 정정 | 제공A v1 반복, 이어 v2로 실제3개/10-03 정정, 마지막에 v1이 늦게 도착 | 반복 효과 추가 없음; 같은 trancheId의 v2와 원래 정정 관계 유지; 합성 기한11-02, 현재 총수량8; 낮은 버전 재적용 없음 |
| SW 조기 발급 | 11-20 발급/결과 제공, 합의 시작2026-12-01 한국 시각 | 시작 전 완료 판정 거절; 시작 후 합의 시작 시각으로 완료, 조기 시험 시각으로 기산하지 않음 |
| SW 늦은 발급 | 합의 시작12-01, 실제 발급/결과 제공12-05 | 12-05에 완료; 12-01로 소급하는 값은 선언된 완료 의미 검증에서 거절 |
| 제공 수량/시각 누락 | E25/E29의 완료 메시지에서 제공 배열/완료일 누락 또는 다른 소유자 근거 | 스키마 거절; 참조와 최신 버전은 소유자 readCompletionFact의 제한된 읽기로 대조 |

## 원본 연결과 이전 검토 의견

| 관계 | 계약의 선언 | 구현 전 대조 |
|---|---|---|
|Order → Department/BusinessSite|C00.TargetScope / C05.OrderView·OrderInput|EnterpriseAccess 원본과 같은 기업·조직 개정/정책; U1 Functional Design에서 NULL 의미/필수 문맥을 확정|
|CommercialProposal → RenewalCycle|C00.ProposalInput.targetRenewalCycleRef|SoftwareLifecycle 소유/회차·제안 버전·대상 일치|
|PurchaseTermsSnapshot → CommonOfferRevision|C00.OrderView.commonOfferRevisionRefs / OrderLineInput.commonOfferRevisionRef|ProductCatalog 소유·구매 당시 버전/스냅샷|
|OrderChangeApplication → CustomerConsent|C00.ApplyOrderChangeInput.customerConsentRef|CommercialAgreement 소유·제안/동의·변경 대상/버전|
|FinancialEligibility → RenewalCycle|C00.EligibilityInput/View.renewalCycleRefs|SoftwareLifecycle 소유·기업/회차/지급/유예 조건|
|HardwareFulfillmentCase → FinancialEligibility|C00.HardwareActionInput/View.financialEligibilityRef|FinancialSettlement 소유·대상 품목/수량·유효 원본 버전|

위 선언은 현재 계약의 후속 구체화다. 과거 Domain Design R-01/R-02의 판정/원본을 소급 수정하지 않는다. 실제 스키마·대상 문맥/버전·참조 제약과 동시성은 관련 Unit의 Functional Design 및 코드 전에 대조한다. 특히 G03의 문맥 미확정을 사용자 현재 소속이나 기업 전체 범위로 자동 대체하지 않는다. [S1·S2]

## 관계와 스토리 추적

### 개발 선행43개 후보

| 의존 Unit | 선행 Unit | 계약/검증 접점 |
|---|---|---|
|U2|U1|C00, C13, C18|
|U3|U1|C00, C13, C18|
|U3|U2|C01, C02|
|U4|U1|C00, C13, C18|
|U4|U2|C01, C02|
|U4|U3|C03, C04, C05|
|U5|U1|C00, C13, C18|
|U5|U2|C01, C02|
|U5|U3|C03, C04, C05|
|U5|U4|C06|
|U6|U1|C00, C13, C18|
|U6|U2|C01, C02|
|U6|U3|C03, C04, C05|
|U6|U4|C06|
|U7|U1|C00, C13, C18|
|U7|U2|C01, C02|
|U7|U3|C03, C04, C05|
|U7|U4|C06|
|U7|U5|C07|
|U7|U6|C08|
|U8|U1|C00, C13, C18|
|U8|U2|C01, C02, C16|
|U8|U3|C03, C04, C05, C16|
|U8|U4|C06, C16|
|U8|U5|C07, C16|
|U8|U6|C08, C16|
|U8|U7|C09, C10, C11, C16|
|U9|U1|C00, C13, C18|
|U9|U2|C01, C02, C17|
|U9|U3|C03, C04, C05, C17|
|U9|U4|C06, C17|
|U9|U5|C07, C17|
|U9|U6|C08, C17|
|U9|U7|C09, C10, C11, C17|
|U10|U1|C00, C13, C18|
|U10|U2|C01, C02, C19|
|U10|U3|C03, C04, C05, C19|
|U10|U4|C06, C19|
|U10|U5|C07, C19|
|U10|U6|C08, C19|
|U10|U7|C09, C10, C11, C19|
|U10|U8|C14, C16|
|U10|U9|C15, C17|

각 행은 구현 선행 계약/호스트 확장·진단/빌드 검증의 대조다. 새 네트워크 연결을43개 생성하지 않는다. 미래 모듈을 U1에 import하지 않고 C13에 실제 제공자만 등록한다. 미등록 공급은 UNAVAILABLE/확인 대기이며 U1의 최소 실제 인증/MFA·기업 승인·상품·접수/조회 경로는 후속 Unit 없이 구현/실행해야 한다.

### 논리 관계81개

| Domain Edge | 공급자 → 소비자 | 계약 | 의미 |
|---|---|---|
|E01|IdentityRecovery → NotificationDelivery|C20-E01|MFA 복구/재등록 결과의 통지 근거 전달|
|E02|IdentityRecovery → EnterpriseAccess|C01|신원·MFA/계정 상태 확인 및 직원 권한 확인 후 복구 실행 연결|
|E03|EnterpriseAccess → ProductCatalog|C02|직원 상품 등록·공통 조건 변경 권한 확인|
|E04|EnterpriseAccess → CommercialAgreement|C02|기업·계약 등록/승인·고객 동의의 행위 범위 확인|
|E05|IdentityRecovery → CommercialAgreement|C01|계약 등록자/승인자의 확인된 동일인 근거 조회|
|E06|ProductCatalog → CommercialAgreement|C03|대상 상품·공통 조건 원본 확인|
|E07|CommercialAgreement → NotificationDelivery|C20-E07|제안·계약 판단의 고객 조치 통지 근거 전달|
|E08|EnterpriseAccess → OrderAcceptance|C02|기업 이용 승인·조직/주문 제출·판단 권한 확인|
|E09|ProductCatalog → OrderAcceptance|C03|판매 상품 타입·공통 조건 조회|
|E10|CommercialAgreement → OrderAcceptance|C04|기업 예외·계약·제안 버전/동의 조회|
|E11|FinancialSettlement → OrderAcceptance|C06|확인된 계약 연체 제한·대금 판단 근거 조회|
|E12|HardwareFulfillment → OrderAcceptance|C07|HW 전체 품목 공급 가능성·납기 근거 조회|
|E13|SoftwareLifecycle → OrderAcceptance|C08|SW 전체 품목 발급 가능성·납기 근거 조회|
|E14|OrderAcceptance → FinancialSettlement|C20-E14|확인된 주문 수락/조건 변경·제공 선택 사실 전달|
|E15|OrderAcceptance → HardwareFulfillment|C20-E15|확인된 주문 수락/조건 변경·제공 선택 사실 전달|
|E16|OrderAcceptance → SoftwareLifecycle|C20-E16|확인된 주문 수락/조건 변경·제공 선택 사실 전달|
|E17|OrderAcceptance → NotificationDelivery|C20-E17|주문 수락/거절·확인 필요 통지 근거 전달|
|E18|EnterpriseAccess → FinancialSettlement|C02|대금 조회·등록·배분·정정/환불 행위 범위 확인|
|E19|CommercialAgreement → FinancialSettlement|C04|확정 지급·후불·연체·갱신 요금/합의 근거 조회|
|E20|FinancialSettlement → HardwareFulfillment|C20-E20|확인된 지급 조건·제한·대금 충돌/정정 사실 전달|
|E21|FinancialSettlement → SoftwareLifecycle|C20-E21|지급/유예·요금 조정·대금 충돌/정정 사실 전달|
|E22|FinancialSettlement → NotificationDelivery|C20-E22|지급 확인·대금 조치 필요 통지 근거 전달|
|E23|EnterpriseAccess → HardwareFulfillment|C02|HW 입력·확보/출고/회수·재처리 행위 범위 확인|
|E24|CommercialAgreement → HardwareFulfillment|C04|공급·지급/제공·배송/인수 완료·보류 합의 조회|
|E25|HardwareFulfillment → FinancialSettlement|C20-E25|수량별 실제 제공/회수·이행 충돌/정정 사실 전달|
|E26|HardwareFulfillment → NotificationDelivery|C20-E26|출고/제공·지연/미확인·고객 조치 통지 근거 전달|
|E27|EnterpriseAccess → SoftwareLifecycle|C02|발급/갱신/회수·기간 요청/별도 승인 권한 확인|
|E28|CommercialAgreement → SoftwareLifecycle|C04|기업 계약 우선·합의 기간/유예·제안/동의 버전 조회|
|E29|SoftwareLifecycle → FinancialSettlement|C20-E29|갱신 청구 판단 입력·실제 제공/회수·보상 기간/정정 사실 전달|
|E30|SoftwareLifecycle → NotificationDelivery|C20-E30|발급/갱신/만료 예정·동의/고객 조치 통지 근거 전달|
|E31|EnterpriseAccess → AfterSalesDecision|C02|후속 요청/판단·보류 행위 범위 확인|
|E32|CommercialAgreement → AfterSalesDecision|C04|변경/취소/반품 허용·보류 정책/합의 근거 조회|
|E33|OrderAcceptance → AfterSalesDecision|C05|전체 주문 현재 조건 조회·허용 변경의 적용 요청|
|E34|FinancialSettlement → AfterSalesDecision|C06|실제 지급/배분·환불 가능 근거 조회|
|E35|HardwareFulfillment → AfterSalesDecision|C07|실제 출고/회수·진행 중 작업 근거 조회|
|E36|SoftwareLifecycle → AfterSalesDecision|C08|실제 발급/기간/회수 근거 조회|
|E37|AfterSalesDecision → FinancialSettlement|C20-E37|허용된 환불 대상·합의 한도·보류 판단 전달|
|E38|AfterSalesDecision → HardwareFulfillment|C20-E38|허용된 보류/계속·취소/회수 대상 판단 전달|
|E39|AfterSalesDecision → SoftwareLifecycle|C20-E39|허용된 보류/계속·권한 회수 대상 판단 전달|
|E40|AfterSalesDecision → NotificationDelivery|C20-E40|후속 판단·고객 조치 필요 통지 근거 전달|
|E41|EnterpriseAccess → WorkInquiry|C02|허용된 원본·이력·확인 시점/남은 조치의 조합 조회|
|E42|IdentityRecovery → WorkInquiry|C01|허용된 원본·이력·확인 시점/남은 조치의 조합 조회|
|E43|ProductCatalog → WorkInquiry|C03|허용된 원본·이력·확인 시점/남은 조치의 조합 조회|
|E44|CommercialAgreement → WorkInquiry|C04|허용된 원본·이력·확인 시점/남은 조치의 조합 조회|
|E45|OrderAcceptance → WorkInquiry|C05|허용된 원본·이력·확인 시점/남은 조치의 조합 조회|
|E46|FinancialSettlement → WorkInquiry|C06|허용된 원본·이력·확인 시점/남은 조치의 조합 조회|
|E47|HardwareFulfillment → WorkInquiry|C07|허용된 원본·이력·확인 시점/남은 조치의 조합 조회|
|E48|SoftwareLifecycle → WorkInquiry|C08|허용된 원본·이력·확인 시점/남은 조치의 조합 조회|
|E49|AfterSalesDecision → WorkInquiry|C09|허용된 원본·이력·확인 시점/남은 조치의 조합 조회|
|E50|EnterpriseAccess → NotificationDelivery|C02|수신자·기업/행위별 정보 권한 확인|
|E51|IdentityRecovery → NotificationDelivery|C01|등록된 수신 경로 조회|
|E52|IdentityRecovery → OperationalAssurance|C01|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E53|EnterpriseAccess → OperationalAssurance|C02|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E54|ProductCatalog → OperationalAssurance|C03|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E55|CommercialAgreement → OperationalAssurance|C04|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E56|OrderAcceptance → OperationalAssurance|C05|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E57|FinancialSettlement → OperationalAssurance|C06|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E58|HardwareFulfillment → OperationalAssurance|C07|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E59|SoftwareLifecycle → OperationalAssurance|C08|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E60|AfterSalesDecision → OperationalAssurance|C09|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E61|NotificationDelivery → OperationalAssurance|C11|권한 있는 운영 검증의 진단·접수/결과/이력 대조 근거 조회|
|E62|OperationalAssurance → NotificationDelivery|C20-E62|복구 시도/실패·점검/지연 통지 근거 전달|
|E63|IdentityRecovery → CustomerUi|C16|고객에게 허용된 조회/행동·결과를 연결|
|E64|EnterpriseAccess → CustomerUi|C16|고객에게 허용된 조회/행동·결과를 연결|
|E65|CommercialAgreement → CustomerUi|C16|고객에게 허용된 조회/행동·결과를 연결|
|E66|OrderAcceptance → CustomerUi|C16|고객에게 허용된 조회/행동·결과를 연결|
|E67|SoftwareLifecycle → CustomerUi|C16|고객에게 허용된 조회/행동·결과를 연결|
|E68|AfterSalesDecision → CustomerUi|C16|고객에게 허용된 조회/행동·결과를 연결|
|E69|WorkInquiry → CustomerUi|C16|고객에게 허용된 조회/행동·결과를 연결|
|E70|NotificationDelivery → CustomerUi|C16|고객에게 허용된 조회/행동·결과를 연결|
|E71|IdentityRecovery → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E72|EnterpriseAccess → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E73|ProductCatalog → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E74|CommercialAgreement → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E75|OrderAcceptance → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E76|FinancialSettlement → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E77|HardwareFulfillment → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E78|SoftwareLifecycle → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E79|AfterSalesDecision → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E80|WorkInquiry → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|
|E81|NotificationDelivery → StaffUi|C17|직원에게 부여된 조회/행동·판단/실제 결과를 연결|

신원/접근/통지 및 대금/HW/SW의 의도적 사실 왕복은 유지한다. 동기 포트로 업무 재귀를 만들지 않으며 새로운 확정 원본/버전이 생겼을 때만 필요한 다음 의무를 기록한다. 중앙 업무 조정자·UI/조회 원본이나 별도 업무별 네트워크 서비스를 추가하지 않는다. [S2]

###69개 스토리

| Story | 업무 | 주 구현 Unit | 계약 접점 |
|---|---|---|
|US1.1|기업 이용 신청|U1|C01, C02, C16|
|US1.2|기업 확인과 최초 관리자 지정|U1|C02, C17|
|US1.3|고객 담당자와 소속 관리|U2|C02, C16, C17|
|US1.4|고객 역할 정의|U2|C02, C16|
|US1.5|조직 범위에 맞는 업무 접근|U2|C02, C16, C17|
|US1.6|내부 직원 역할 관리|U2|C02, C17|
|US1.7|MFA를 거친 업무 접근|U2|C01, C16, C17, C21|
|US1.8|사전 수단으로 계정 복구|U2|C01, C16, C17, C21|
|US1.9|담당자 확인 계정 복구|U2|C01, C16, C17, C21|
|US1.10|관리자 부재와 재지정|U2|C02, C16, C17|
|US2.1|판매 상품 등록|U3|C03, C17|
|US2.2|기업에 허용된 상품 확인|U8|C10, C16, C17|
|US2.3|기업별 공개·가격 예외 관리|U3|C04, C17|
|US2.4|계약 조건 등록|U3|C04, C17|
|US2.5|계약 조건 변경 요청|U3|C04, C16|
|US2.6|다른 등록자의 계약 승인|U3|C04, C17|
|US2.7|기업 계약 우선 적용|U3|C04, C16, C17|
|US3.1|같은 타입 다품목 주문 제출|U3|C05, C16|
|US3.2|조건 충족 주문의 자동 확정|U3|C05, C16, C18|
|US3.3|확인 대기 이유 파악|U1|C10, C16, C17|
|US3.4|주문 전체 수락 판단|U3|C05, C17|
|US3.5|주문 가격 변경 제안 확인|U3|C04, C16, C17|
|US3.6|일괄·부분 제공 선택|U3|C05, C16|
|US4.1|직원 청구·지급 근거 등록|U4|C06, C17|
|US4.2|외부 청구·지급 결과 수신|U4|C22|
|US4.3|명확한 지급 자동 배분|U4|C06, C17, C18|
|US4.4|미배분 지급 확인·정정|U4|C06, C17|
|US4.5|제공 건별 후불 기한 확인|U4|C06, C10, C16, C17, C18|
|US4.6|계약상 연체 제한 관리|U4|C06, C10, C16, C17, C18|
|US5.1|HW 결과의 직원 근거 등록|U5|C07, C17|
|US5.2|HW 외부 결과 연결|U5|C23|
|US5.3|정책에 따른 HW 확보 진행|U5|C07, C17, C18|
|US5.4|보유 재고 예약 관리|U5|C07, C17|
|US5.5|지급·제공 조건을 지킨 출고|U5|C07, C17, C18|
|US5.6|HW 제공 완료 확인|U5|C07, C10, C16, C17, C18|
|US5.7|실패한 HW 이행 재처리|U5|C07, C17|
|US6.1|기업 SW 권한 발급|U6|C08, C17, C24|
|US6.2|발급 결과와 기간 확인|U8|C08, C10, C16, C17|
|US6.3|실제 이용 기간 조정 요청|U6|C08, C17|
|US6.4|실제 이용 기간 조정 승인|U6|C08, C17|
|US6.5|SW 제공 완료와 후불 기산 확인|U6|C10, C16, C17, C18, C24|
|US6.6|실패한 SW 발급 재처리|U6|C08, C17|
|US7.1|기간제 갱신 요청|U6|C08, C16|
|US7.2|권한별 자동 갱신 신청|U6|C08, C16|
|US7.3|자동 갱신 해제 요청|U6|C08, C16|
|US7.4|계약상 자동 갱신 실행|U6|C08, C18|
|US7.5|갱신 가격 변경 합의|U3|C04, C16, C17|
|US7.6|계약 유예의 임시 이용|U6|C08, C10, C16, C17, C18|
|US7.7|유예 중 지급 후 갱신 정리|U6|C08, C10, C16, C17, C18|
|US7.8|보상 중첩 갱신 요금 조정|U4|C06, C17, C18|
|US8.1|주문 전체 변경 요청|U7|C09, C16|
|US8.2|주문 전체 취소 요청|U7|C09, C16|
|US8.3|주문 전체 반품 요청|U7|C09, C16|
|US8.4|검토 중 이행 보류 판단|U7|C09, C17, C18|
|US8.5|승인된 권한 회수 결과 추적|U6|C08, C17, C24|
|US8.6|환불 요청·결과·잔액 추적|U4|C06, C10, C16, C17, C22|
|US8.7|상충·미확인 근거 대조|U7|C07, C08, C17, C18|
|US8.8|주문 진행과 남은 조치 확인|U7|C10, C16, C17|
|US8.9|업무 알림 수신|U7|C11, C16, C17, C25|
|US8.10|확인 필요한 후속 요청 판단|U7|C09, C17|
|US8.11|HW 회수 요청·결과·잔량 추적|U5|C07, C10, C16, C17, C23|
|US8.12|직원의 업무 진행 조회|U9|C10, C16, C17|
|US9.1|자동 복구 시도·실패 알림|U10|C12, C18, C19, C25, C26|
|US9.2|성공 접수 데이터 보존 복구|U10|C12, C19, C26|
|US9.3|계획 점검과 1인 배포 검증|U10|C12, C19, C26|
|US9.4|변경·승인·정정 이력 확인|U7|C10, C16, C17|
|US9.5|국내 데이터 저장 확인|U10|C12, C19, C26|
|US9.6|핵심 업무별 가용성 평가|U10|C12, C19, C26|
|US9.7|반복 기술 운영 부담 평가|U10|C12, C19, C26|

계약 연결은 구현/227개 AC 통과를 뜻하지 않는다. 후속 Functional Design/검증에서 각각의 정상·오류·경계·중복/동시/역순·배포/복구/보안 조건을 실제 경로로 확인한다.

## Contract Ownership Rules

- 업무 공급자가 입력/결과·사실·에러 의미의 명세를 소유한다. U1은 공통 스키마/호스트·HTTP 전송/작업 전달의 변경 책임을 맡고 각 확장 Unit은 소유자 의미와 등록/소비 통합을 함께 바꾼다. C14/C15는 해당 UI, C26의 실제 운영 도구는 외부 주체이며 증거 평가 코드는 OperationalAssurance다.
- wire 계약은1.0.0으로 시작한다. 허용된 추가 필드는 기존 소비자가 무시하고 추가 필수 입력·타입/단위·선택 값·업무 의미 변화는 호환 변경으로 간주하지 않는다. 기존 확정 입력/핵심 필수 의미의 오타는 closed input schema로 거절하고 무시하지 않는다. 수신자의 unknown response field 정책과 closed producer 검증을 구별한다.
- 호환 불가 변경은 새 version/schema/channel을 병행하고 UI/API/worker 호환·대기 메시지/접수/원본 참조·복구/되돌림을 검사한다. 현재 세션/소비자·대기 데이터와 복구 조건을 확인해 이전 버전을 종료한다. 큐/원본/접수 기록을 버전 전환 때문에 삭제하지 않는다.
- 실제 명세/구현을 바꾸기 전에 공급자와 영향 소비자 계약/합성 시험을 함께 갱신한다. 개발자 본인이 리뷰/필수 검사·승인을 수행한다는 기존 방식이며 추가 인력을 확보했다고 가정하지 않는다. 합성 계약 통과와 실제 업체·인프라 통과를 구별한다.

### 변경 방식 선택의 근거와 대안

| 선택 | 근거/영향 | 대안1 | 대안2 | 보안·운영 확인 |
|---|---|---|---|---|
|리소스 중심 HTTP|조회와 접수/판단 원본을 구별; 주소/버전 규약을 유지해야 함|작업 호출 API: 가능하지만 리소스/이력 경계가 덜 직접적|GraphQL: 조회 유연성 대신 별도 스키마/필드 권한·비용 제어 증가|서버 권한·CSRF·비노출; 형식만으로 안전성 보장하지 않음|
|원자 기록+미전달 전달|누락 의무를 명시적으로 재처리; 저장/consumer 중복 표지 필요|원본/이력 주기 대조: 재구성/공백 근거를 별도 입증|저장 후 비지속 전달만: 중간 종료 시 의무 유실 위험으로 채택하지 않음|원자성/중복/역순·재난 범위 실제 검증; 민감 payload 최소|
|단계적 호환 전환|별도 UI/API/worker와 대기 데이터를 유지; 구/신 호환 비용|승인 점검 일괄 교체: 점검/구버전 접수 조건 추가|호환 검사 없이 공급자만 교체: 소비/복구 위험|전환/되돌림 중 승인·접수·원본 보존; 무중단 달성을 주장하지 않음|
|진행 조회/갱신|같은 식별자로 재방문·복구; 조회 부하/최신성 검증 필요|SSE/stream: 연결·재연결 검증 추가|장시간 동기 대기: 외부 지연과 timeout/부하 결합|현재 권한·section 비노출; p95/갱신 부하 실증|
|제한된 안전 재시도|기술 일시 실패와 업무 불명을 구분; 대조/정책 필요|명시적 재시도만: 반복 운영 부담|무조건 재전송: 실제 부작용 중복 위험|같은 키/결과 대조·deadline; 복구 시도부터 기존 알림|
|Problem Details|표준 오류에 OMS 코드를 명시; code/HTTP 의미를 일치|자체 공통 JSON: 같은 검증/유지 필요|HTTP200으로 오류도 통일: 관측/전송 의미를 흐림|안전한 detail/traceId·기업 존재 비노출|
|opaque cookie+CSRF 제안|브라우저별 서버 세션/목적을 분리; CSRF와 domain 정책 필요|Bearer token 헤더: 브라우저 저장/갱신·누출 대응 별도|자체 JWT 기반 권한 고정: 즉시 권한/세션 변화 대조 추가|MFA/현재 권한·목적/audience 검증; 실제 제품/수명/망 OQ4|

## 실패·시간·운영 계약

| 결과 | HTTP/포트 의미 | 반복/후속 조치 |
|---|---|---|
|잘못된 입력/타입/필수 참조|400 INVALID_INPUT|수정 전 반복 금지; 업무 확인 대기로 우회 금지|
|인증/MFA 불충족|401 AUTHENTICATION_REQUIRED/MFA_REQUIRED|제한 목적 인증/복구; 업무 실행 금지|
|행위/기업/직원 접속 정책 거절|403 ACCESS_DENIED 또는 존재 비노출404|같은 입력 자동 반복 금지|
|원본 없음/비노출|404 NOT_FOUND|허용 범위에서만 원본 확인; 존재 추론 방지|
|원본/제안 버전·키 내용 충돌|409 REVISION_CONFLICT/IDEMPOTENCY_CONFLICT|최신 허용 정보 대조·필요한 새 동의; 덮어쓰기 금지|
|호출 한도|429 RATE_LIMITED|안전한 조회/동일 작업만 서버 안내+총 deadline 안에서|
|현재 공급자 미준비/일시 장애|503 DEPENDENCY_UNAVAILABLE|조회/단순 호출은 UNAVAILABLE; 이미 지속 접수된 주문의 후속 불명은 확인 대기로 보존|
|기술 실패|5xx TECHNICAL_FAILURE|커밋/부작용 여부 대조; blind resend 금지|
|지속 접수|202 + Location/Receipt|같은 ID로 제한된 진행 조회; 실제 거래 효과 완료와 구별|
|확인된 입력이나 결과 충돌|업무 UNKNOWN/CONFLICT/REVIEW_REQUIRED|영향받는 추가 출고/발급/환불만 보류; 전 업무/기존 권한 자동 중단 아님|

모든 포트는 총 deadline을 전달하고 timeout/취소를 처리한다. 외부 timeout 뒤 성공/실패를 지어내지 않는다. 개별 timeout/횟수/지수 대기·소진 후 대조/알림·상한·보관/중복키 수명은 후속 관련 Unit NFR/실제 제공자 계약의 구현 전 차단 항목이다. 접수 결과/원본 이력과 중복 보호를 성급하게 삭제해 같은 업무를 재실행하지 않는다. 권한이 바뀐 재조회에서 원래 결과는 보존하되 현재 허용 정보만 반환한다.

기존 부하 조건의 p95 조회1초/변경2초(결과 또는 추적 가능 접수), 기술 오류≤0.1%·정확성0위반 목표를 유지한다. 동기 외부 호출 시간은 측정에 포함하고 긴 처리는 지속 접수와 별도 실제 결과로 연결한다. 외부 모든 작업이2초 안에 완료된다는 계약은 아니다. 전체 원인/계획 점검 포함 연속30일99.9%, 대표 장애30분 복구·정의할 재난 경계의 성공 접수 RPO0, 점검/배포/정상 운영의 사람 작업 목표를 각각 검증한다. 단기 시험과30일 실제 관측·자동 대기·전체 경과·누적 미해결을 구별한다. 한국 저장은 원본·포함 로그/백업·외부 데이터 경로까지 실제 증거로 검증한다. [S3]

## Assumptions & Open Questions

- A-CD1 [assumption]: 위 포트/형식·원자 전달·호환 경계가1인 개발/기술 운영 가능 구조와 정확성/운영 목표에 적합하다. 선택된 설계 방향이며 아직 실제 기술/복구/부하·인력·비용으로 입증되지 않았다.
- A-CD2 [assumption]: 실제 신원·업무/데이터/알림 경로가 이 계약의 신뢰/국내 저장·원자성/대조 조건을 충족할 수 있다. 외부 업체와 실제 접근/증거가 없으며 브로커/DB·서비스 제품은 미선정이다.
| Contract | Question | Blocks |
|---|---|---|
|C00/C01/C02/C05/C16/C17|OQ4: 세션/동일인·기업/첫 관리자·직원 PC/망 증거, 조직 NULL/변경 효력·실행 권한의 신뢰/만료|U1/U2 및 해당 승인/조회 코드·실제 계정|
|C00/C03–C09|OQ1/OQ2: 필수 계약 값·버전/종료 경계·금액 정밀도/반올림·기산/달력·제한/한도·승인/동시 전이|각 업무 Functional Design 및 해당 코드/실거래|
|C18/C20-*|OQ6/OQ9: 원자 커밋·전달/중복 표지·순서 공백·키/로그 보관·버전 migration·논리 손상/오삭제 포함 장애 경계/RPO0|U1 및 각 owner NFR/Infra·코드/보존 약속|
|C21–C25|OQ3/OQ4/OQ5/OQ7: 실제 제공자별 원본 권위·정확한 프로토콜/주소·인증·latest/중복/재확인·결과/수신/국내 저장|실제 어댑터 구현/도입·실데이터/실거래|
|C12/C19/C26|OQ5–OQ9: 독립 복구 시도/실패 알림·실제 관측/backup/restore·한국 위치·30일 SLO·사람 작업/도구/차단선|U10 및 실운영/상용 약속|
|C16/C17/C18/각 포트|OQ8/OQ9: 페이지/필터·입출력 상한·timeout/총 deadline·재시도/조회 주기·배포/보관 세부|해당 Unit NFR·코드/필수 검사|
|전 계약|OQ10/HB-01–HB-08: 실제 고객/가치·합의/수요/지원·등록자 외 계약 승인자·비용/업무량·실제 연동/운영 증거|실제 사업/상용 준비 판단|

알려진 미확정 실제 제공자·NFR/상태·산식 값은 위 차단 시점까지 확인한다. 명세를 확보하지 못한 업체의 API를 만들어 넣지 않고 형식 계약/합성 시험만으로 실거래·보존·가용성 목표를 통과 처리하지 않는다.

## 형식·추적 검증과 한계

- YAML44개 블록을 다시 파싱하고 각 $id·URN/로컬 $ref를 등록·해결했다. 공유 JSON Schema2020-12 문서24개·공통 정의140개의 문법/참조를 검사했다.
- OpenAPI3.1 문서2개를 openapi-spec-validator0.9.0으로 검사했다. 공동 URN은 같은 의미의 스키마로 해소한 검증 복사본을 사용한다. GET 본문 없음·경로 변수 선언·오류 기본 응답·MFA 등록/복구의 제한 세션 분기도 대조했다.
- AsyncAPI3.0 문서18개를 @asyncapi/parser로 검사했고 오류0·경고0이었다. 논리 주소만 명세하며 실제 브로커/전송 프로토콜을 선택하지 않는다.
- 소유자/엔티티 불일치 Ref, 숫자형/음수/비KRW 금액, 0개 주문 수량, 잘못된 시각, CommandMeta에 클라이언트 역할을 넣은 입력을 거절하는 합성 스키마 예시를 확인했다. 금액을 알 수 없는 UNCONFIRMED 관측은 null로 표현 가능하고, 같은 관측을 확정 근거 없이 CONFIRMED로 바꾸면 거절했다.
-44개 계약 ID·43개 DAG 후보·81개 논리 관계·69개 스토리의 누락/잘못된 참조를 대조했다. 로컬 자료 링크와 NUL/U+FFFD 등 문자 문제도 검사했다.
-115개 소유자 Call의 target 선언과90개 HTTP operation의 서버 매핑을 대조했다. 경로/본문·원본 부모·날짜 상호 관계는 스키마만으로 증명되지 않으므로 위 선언된 의미/매핑 조건의 합성 예시로 별도 확인했다. 실제 서버 구현 검증은 후속 단계에서 수행한다.
- 위 결과는 문서/스키마의 구조와 합성 입력 검증이다. 실행 권한·동시성/실제 부작용·외부 제공자·저장/전달/복구·227개 AC·SLO/국내 저장/1인 부담의 실제 통과가 아니다. OQ/HB와 관련 후속 설계·실증 차단 항목을 유지한다.

## Sources

- S1: [단위 정의](../units-generation/unit-of-work.md), [의존 DAG](../units-generation/unit-of-work-dependency.md), [단위 스토리 배정](../units-generation/unit-of-work-story-map.md).
- S2: [컴포넌트](../domain-design/components.md), [결정](../domain-design/decisions.md), [Domain Design 검토](../domain-design/reviews/review-01.md).
- S3: [요구사항](../requirements-analysis/requirements.md), [스토리/AC](../user-stories/stories.md), [최신 UI 계약](../refined-mockups/interaction-spec.md).
- S4: [이번 질문과 요약 확인](contract-design-questions.md) — Q1–Q6 A; 별도 Looks correct. 6개 답변은 설계 선택이며 실제 달성 증거가 아니다.
- S5: active-space org/team/project/inception 규칙과 [team practices](../practices-discovery/team-practices.md) — 테스트/배포·1인 구조/전체 범위·AWS/CDK.
- W1: [OpenAPI3.1.0](https://spec.openapis.org/oas/v3.1.0) — HTTP 명세 구조. 2026-10-06 조회.
- W2: [AsyncAPI3.0.0](https://www.asyncapi.com/docs/reference/specification/v3.0.0) — 프로토콜을 미선정한 논리 메시지 명세 구조. 2026-10-06 조회.
- W3: [JSON Schema2020-12](https://json-schema.org/draft/2020-12/json-schema-core) — $id/참조와 공유 데이터 검증 형식. 2026-10-06 조회.
- W4: [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) — 원자 기록/전달·중복 처리 고려. 예시 AWS 제품/DB를 도입하지 않는다. 2026-10-06 조회.
- W5: [RFC9110](https://datatracker.ietf.org/doc/html/rfc9110), [RFC9457](https://www.rfc-editor.org/rfc/rfc9457.html) — HTTP 응답/재시도와 Problem Details. OMS 업무/권한/정확성의 실증은 별도다. 2026-10-06 조회.
- W6: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) — 쿠키/서버 세션·CSRF/Origin 방어 고려. 본 OMS의 audience/목적 분리는 이를 적용한 설계 제안이며 실제 구성/효력의 실증은 별도다. 2026-10-06 조회.
