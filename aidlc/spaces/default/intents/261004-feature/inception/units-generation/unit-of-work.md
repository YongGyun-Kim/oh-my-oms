# OMS 작업 단위 정의

> **첫 배포 범위 변경 — 2026-10-11:** U1~U10의 원본 ID·소유·의존성과 전체 기능은 보존한다. 고객사10곳 이내 제한 파일럿에는 [확정 범위](../../release-planning/first-release-scope-proposal.md)의 필요한 부분을 제공하며 [Unit별 첫 배포 작업](../../release-planning/first-release-delivery-plan.md)을 따른다. 일부 제공을 원래 Unit 전체 완료로 표시하지 않는다. 실제 단계 상태·순서는 이 문서 편집으로 변경하지 않는다.

## 구성 근거와 범위

확인한6개 답변·별도 Looks correct·Approve Plan을 반영한10개 단위다. 초기6–9개는 후보 추정이었고 업무 확장과 고객/직원 UI·운영 검증을 각각 두어10개로 확인했다. 전체69 US·227 AC·14개 컴포넌트의 원본 소유를 유지한다. 구현/실증 완료·상용 준비를 뜻하지 않는다. [S1–S5]

## Unit Definitions

| Unit ID | Directory | Name | Kind | Deployment Model | Complexity | Depends On | Primary Stories |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U1 | u1-integrated-foundation | 최소 통합 실행 기반 | service | shared | L | None | 3 |
| U2 | u2-identity-enterprise-access | 신원·복구·기업 접근 확장 | library | embedded | L | U1 | 8 |
| U3 | u3-commercial-ordering | 상품·계약·주문 판단 | library | embedded | L | U1, U2 | 12 |
| U4 | u4-financial-settlement | 대금·배분·환불 | library | embedded | L | U1, U2, U3 | 8 |
| U5 | u5-hardware-fulfillment | HW 공급·이행·회수 | library | embedded | L | U1, U2, U3, U4 | 8 |
| U6 | u6-software-lifecycle | SW 권한·기간·갱신 | library | embedded | XL | U1, U2, U3, U4 | 12 |
| U7 | u7-after-sales-inquiry-notices | 후속 판단·조합 조회·통지 | library | embedded | L | U1, U2, U3, U4, U5, U6 | 9 |
| U8 | u8-customer-ui | 고객 PC UI | ui | standalone | L | U1, U2, U3, U4, U5, U6, U7 | 2 |
| U9 | u9-staff-ui | 직원 PC UI | ui | standalone | L | U1, U2, U3, U4, U5, U6, U7 | 1 |
| U10 | u10-operational-assurance | 기술 운영 검증·공통 준비 | service | standalone | L | U1, U2, U3, U4, U5, U6, U7, U8, U9 | 6 |

### kind와 설계 범위

service는 배포되는 실행 코드, library는 자체 독립 런타임 없는 재사용 모듈, ui는 프론트엔드 표면이다. U1/U10은 실행/엔티티/실패·NFR/배포 검증, U2–U7은 규칙/엔티티/계약·호스트 적용/검증, U8/U9는 실제 UI/API·접근성/권한·화면 성능/배포의 해당 문서를 포함한다. kind 때문에 정확성/보안/저장·복구 조건을 생략하지 않으며 library의 실행/확장 조건은 호스트 NFR/Infrastructure와 연결한다. U10은 실행/엔티티·검증 책임이 있어 service로 분류했다.

S/M/L/XL은 상대 [assumption]이다. 개발 기간/인시·완료 사실이 아니며 특히 SW 시간/보상/유예·갱신은XL로 추정한다. 실제 복잡도에 따라 사용자의 단위 변경 절차로 다시 구성할 수 있다.

### U1: 최소 통합 실행 기반

- **Directory:** u1-integrated-foundation
- **Kind / Deployment / Complexity:** service / shared / L
- **논리 컴포넌트/변경 접점:** IdentityRecovery, EnterpriseAccess, ProductCatalog, OrderAcceptance, WorkInquiry, NotificationDelivery, CustomerUi, StaffUi
- **책임과 결과:** 필요한 신원/MFA·기업 승인/권한과 최소 상품 등록/조회·주문 접수/지속 기록·확인 대기/진행 조회를 실제 연결한다. API·worker 실행 기반과 고객/직원 UI의 최소 독립 빌드/배포 경로, 실행에 필요한 최소 기술 준비와 공통 계약/통합 접점을 포함한다. 후속 모듈이 없으면 공급/지급/제공을 미확인으로 유지한다.
- **구현/검증 조건:** 후속 Unit 없이 실제 신원/MFA·기업 승인/권한·상품 입력/조회·주문 접수/지속 기록·확인 대기/진행 조회를 실행한다. 최소 통지·이력/대조·worker/실행 준비는 그 경로에 필요한 범위를 포함한다. 실제 계정/경로·데모·명령은 관련 설계와 Delivery Planning/구현 확인에서 정한다.
- **주 책임 스토리:** US1.1, US1.2, US3.3

### U2: 신원·복구·기업 접근 확장

- **Directory:** u2-identity-enterprise-access
- **Kind / Deployment / Complexity:** library / embedded / L
- **논리 컴포넌트/변경 접점:** IdentityRecovery, EnterpriseAccess
- **책임과 결과:** MFA/복구·확인된 동일인, 기업/조직/소속·역할/행위별 범위·관리자 부재/재지정을 완성한다. U1 기본 경로를 확장하고 실제 UI 접점은 U8/U9와 연결한다.
- **구현/검증 조건:** 고객15행위/4범위·행위별 합집합, 내부 역할·관리자0 허용/경고·신원 복구/재등록을 검증한다. 인증 성공·계정/역할 관리를 모든 업무 권한으로 확대하지 않는다. 직원 복구/동일인 증거와 효력은 OQ4에서 확인한다.
- **주 책임 스토리:** US1.3, US1.4, US1.5, US1.6, US1.7, US1.8, US1.9, US1.10

### U3: 상품·계약·주문 판단

- **Directory:** u3-commercial-ordering
- **Kind / Deployment / Complexity:** library / embedded / L
- **논리 컴포넌트/변경 접점:** ProductCatalog, CommercialAgreement, OrderAcceptance
- **책임과 결과:** 공통 상품 조건·기업 예외·다른 사람 계약 승인·버전별 제안/동의, 구매 당시 조건 보존·타입별 다품목/선후불·전체 수락/확인 대기·제공 선택을 완성한다. 공급/대금 판단은 공통 계약을 통해 소유자 결과를 이용한다.
- **구현/검증 조건:** 계약·전체 공급 가능성/납기 근거가 확인돼야 전체 자동 수락한다. 무효 기업/권한/타입/입력은 직원 판단으로 우회하지 않는다. 후속 공급/대금 근거가 없으면 전체 확인 대기다. 계약 등록자와 같은 사람의 다른 계정 승인도 금지한다.
- **주 책임 스토리:** US2.1, US2.3, US2.4, US2.5, US2.6, US2.7, US3.1, US3.2, US3.4, US3.5, US3.6, US7.5

### U4: 대금·배분·환불

- **Directory:** u4-financial-settlement
- **Kind / Deployment / Complexity:** library / embedded / L
- **논리 컴포넌트/변경 접점:** FinancialSettlement
- **책임과 결과:** 직원/외부 청구·지급·배분/정정·환불 실제 결과/한도·품목별 지급 조건·후불/연체·보상 중첩 요금 조정을 소유한다. 제공/보상/후속 허용 사실은 각 소유자의 계약으로 연결한다.
- **구현/검증 조건:** 배분/환불의 중복/초과·확인 금액/합의 한도를 검증한다. 후불은 원본 제공 수량별 완료 근거로 기산하며 선결제 필요액에 후불을 합산하지 않는다. 공급/보상/허용 입력의 합성 계약 시험과 실제 주체 실증을 구별한다.
- **주 책임 스토리:** US4.1, US4.2, US4.3, US4.4, US4.5, US4.6, US7.8, US8.6

### U5: HW 공급·이행·회수

- **Directory:** u5-hardware-fulfillment
- **Kind / Deployment / Complexity:** library / embedded / L
- **논리 컴포넌트/변경 접점:** HardwareFulfillment
- **책임과 결과:** HW 공급/납기 근거, 재고 예약·확보 정책·지급/전체·부분 조건·출고·합의 배송/인수·회수/잔량·미확인/충돌/실패 재처리를 소유한다. U3/U4와 실제 판단/결과 통합을 검증한다.
- **구현/검증 조건:** 확보 네 정책·예약·지급·일괄/명시 부분 제공·합의 배송/인수 완료를 적용한다. 직원/외부 충돌·중복/초과·출고/취소 경합·늦은 결과·미확인 재실행을 대조한다. 실제 창고/운송/조달 전체의 권위를 소유하지 않는다.
- **주 책임 스토리:** US5.1, US5.2, US5.3, US5.4, US5.5, US5.6, US5.7, US8.11

### U6: SW 권한·기간·갱신

- **Directory:** u6-software-lifecycle
- **Kind / Deployment / Complexity:** library / embedded / XL
- **논리 컴포넌트/변경 접점:** SoftwareLifecycle
- **책임과 결과:** 기업 수량의 영구/기간제 발급·실제 기간·기간 조정/별도 승인·수동/자동 갱신·계약 우선·새 동의·유예/보상·실제 회수를 소유한다. U3/U4와 지급/기간/요금 조정을 통합 검증한다.
- **구현/검증 조건:** 기업 수량·영구/기간제·구매 당시/실제 기간을 구별한다. 기간 조정의 같은 사람 별도 승인을 계약 자기 승인 금지와 구별한다. 수동 갱신도 지급/유예·실제 적용/고객 결과까지 연결하고 기업 계약 우선·보상/유예/원래 일정·중첩 요금/새 동의를 유지한다.
- **주 책임 스토리:** US6.1, US6.3, US6.4, US6.5, US6.6, US7.1, US7.2, US7.3, US7.4, US7.6, US7.7, US8.5

### U7: 후속 판단·조합 조회·통지

- **Directory:** u7-after-sales-inquiry-notices
- **Kind / Deployment / Complexity:** library / embedded / L
- **논리 컴포넌트/변경 접점:** AfterSalesDecision, WorkInquiry, NotificationDelivery
- **책임과 결과:** 전체 주문 변경/취소/반품·보류/계속 판단, 소유자별 실제 결과/원본 이력·남은 조치의 권한별 조합 조회, 최소 안내/통지 전달 결과를 완성한다. 각 업무의 원본 대조/정정·실제 환불/회수는 해당 소유자에게 둔다.
- **구현/검증 조건:** 고객 후속 요청은 전체 주문 단위다. 실제 부분 회수/환불/잔량은 원본 소유자에게 둔다. 조합 조회/통지는 중앙 실행 조정자가 아니며 요약/목록/알림/이력의 정보 권한을 유지한다.
- **주 책임 스토리:** US8.1, US8.2, US8.3, US8.4, US8.7, US8.8, US8.9, US8.10, US9.4

### U8: 고객 PC UI

- **Directory:** u8-customer-ui
- **Kind / Deployment / Complexity:** ui / standalone / L
- **논리 컴포넌트/변경 접점:** CustomerUi
- **책임과 결과:** 고객 C01–C09와 고객 인증/가입/복구의 전체 화면을 실제 API에 연결한다. 주문/계약 제안 동의·조직/역할/범위·대금/권한/후속 요청을 허용 정보로 표현하고 상태/오류/미확인·키보드/접근성을 검증한다.
- **구현/검증 조건:** 고객 C01–C09·인증/가입/복구를 실제 API와 연결한다. U1 최소 UI를 확장하며 고객 요청/새 동의와 실제 적용 결과를 구별한다. 최신 PC/접근성 조건을 유지한다.
- **주 책임 스토리:** US2.2, US6.2

### U9: 직원 PC UI

- **Directory:** u9-staff-ui
- **Kind / Deployment / Complexity:** ui / standalone / L
- **논리 컴포넌트/변경 접점:** StaffUi
- **책임과 결과:** 직원 S01–S11과 인증/복구, 등록/판단/승인·대금/HW/SW·후속 처리를 실제 API에 연결한다. 사내망/승인 원격 PC·행위 권한·계약 다른 사람 승인/기간 동일인 별도 승인을 각각 표현한다.
- **구현/검증 조건:** 직원 S01–S11·인증/복구를 실제 API와 연결한다. 사내망/승인 원격 PC·행위 권한 및 계약 다른 사람 승인/기간 같은 사람 별도 승인을 구별한다. 직원 신분으로 모든 민감 근거를 열지 않는다.
- **주 책임 스토리:** US8.12

### U10: 기술 운영 검증·공통 준비

- **Directory:** u10-operational-assurance
- **Kind / Deployment / Complexity:** service / standalone / L
- **논리 컴포넌트/변경 접점:** OperationalAssurance
- **책임과 결과:** 배포되는 진단/접수·결과 대조 실행 코드와 공통 CDK·검사/배포·관측/복구·국내 저장·가용성/사람 작업 증거를 연결한다. OMS 장애 중 복구 시도/실패 통지 경로를 검증한다. 상시 운영 웹 서비스·OMS 운영 대시보드를 추가하지 않고 실제 운영 도구/실행 위치는 후속 설계에서 정한다.
- **구현/검증 조건:** 실행 코드와 공통 CDK·검사/배포·관측/복구·한국 저장·사람 작업 증거를 연결한다. 전송 요청을 수신/복구 성공으로 표시하지 않는다. 30일 관측·단기 장애 시험·목표/실제 달성을 구별한다.
- **주 책임 스토리:** US9.1, US9.2, US9.3, US9.5, US9.6, US9.7

## Component Ownership and Change Boundaries

| Logical Component | 완성/확장 책임 Unit | 원본/변경 경계 |
| --- | --- | --- |
| IdentityRecovery | U2 | 원본 쓰기 소유자는 IdentityRecovery. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| EnterpriseAccess | U2 | 원본 쓰기 소유자는 EnterpriseAccess. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| ProductCatalog | U3 | 원본 쓰기 소유자는 ProductCatalog. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| CommercialAgreement | U3 | 원본 쓰기 소유자는 CommercialAgreement. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| OrderAcceptance | U3 | 원본 쓰기 소유자는 OrderAcceptance. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| FinancialSettlement | U4 | 원본 쓰기 소유자는 FinancialSettlement. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| HardwareFulfillment | U5 | 원본 쓰기 소유자는 HardwareFulfillment. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| SoftwareLifecycle | U6 | 원본 쓰기 소유자는 SoftwareLifecycle. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| AfterSalesDecision | U7 | 원본 쓰기 소유자는 AfterSalesDecision. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| WorkInquiry | U7 | 조회·조합 코드 변경 책임. 각 업무 소유자의 원본과 이력을 허용 범위에서 읽어 조합하며 거래 원본의 쓰기 권위는 해당 업무 컴포넌트에 있다. U1 최소 조회 연결을 확장한다. |
| NotificationDelivery | U7 | 원본 쓰기 소유자는 NotificationDelivery. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |
| CustomerUi | U8 | 고객 UI 표시·입력·조회/행동 연결 코드 변경 책임. 거래 원본 변경은 해당 업무 소유자의 인터페이스로 요청하고 쓰기 권위는 그 업무 컴포넌트에 있다. U1 최소 고객 UI를 확장한다. |
| StaffUi | U9 | 직원 UI 표시·입력·조회/행동 연결 코드 변경 책임. 거래 원본 변경은 해당 업무 소유자의 인터페이스로 요청하고 쓰기 권위는 그 업무 컴포넌트에 있다. U1 최소 직원 UI를 확장한다. |
| OperationalAssurance | U10 | 원본 쓰기 소유자는 OperationalAssurance. U1 최소 연결 뒤 같은 소유/계약/이력을 확장한다. |

U1 실행 호스트/통합 접점·최소 UI/업무 경로와 각 컴포넌트의 최종 확장 책임은 다르다. U1 최소 권한/상품/주문 규칙도 해당 논리 소유자 코드에 있다. 후속 Unit은 같은 원본의 규칙/스키마·연결/화면을 확장하며 다른 소유자의 원본을 직접 변경하지 않는다. 공통 계약/호스트·등록/구성 연결 변경도 해당 Unit의 구현/시험 범위와 향후 source-manifest에 명시한다. 실제 언어/파일 배치 뒤 변경 경계를 정하고 현재 직렬 Construction에서 겹친 변경을 조정한다. [S1·S3]

## 논리 소유와 실행·배포 역할

제품 실행/배포 대상은 고객 UI·직원 UI·업무 웹/API·별도 worker 역할이다. 업무 핵심은 모듈화된 단일 애플리케이션이고 U2–U7의 업무 모듈은 API/worker에서 재사용한다. 원본 쓰기는 해당 논리 소유자의 규칙/승인/권한 경계를 거치며 실행 역할이 나뉘어도 금액/수량/기간의 권위를 나누지 않는다. 웹/worker 버전·중복/동시/역순·접수 보존·실패 대조는 후속 설계/시험에서 확인한다.

U8 고객·U9 직원 UI는 각각 standalone 빌드/배포다. U1 최소 UI 접점을 확장하고 공통 시각 토큰/기초 조작은 재사용한다. 별도 빌드가 리포지토리 수·프레임워크/AWS 제품을 결정하지 않는다. 직원 사내망/승인 원격 PC·MFA/행위 권한은 서버/접속 경로에서 강제하며 화면 폭으로 보안을 판정하지 않는다. 고객/직원 PC1280 이상·고객 모바일 추후 결정·직원 모바일 제외, WCAG2.2AA 목표와 최신 UI 계약을 유지한다.

U10은 OperationalAssurance의 진단/성공 접수·결과/이력 대조·근거 평가를 실행할 코드와 공통 운영 준비를 다룬다. 실제 관측·배포·복구 도구/저장/알림 제공자는 인프라/외부 의존이다. 기술 실행 프로그램은 선택할 운영 경로에서 동작하며 상시 운영 API나 OMS 운영 대시보드를 추가하지 않는다. OMS 자체 장애 중 시도 시작·실패/수동 필요 알림 경로를 NFR/Infrastructure/운영 설계에서 검증한다. kind service는 실행 코드/엔티티/검증 모델을 요구하는 분류다.

AWS/CDK·한국어/KRW/한국 시각·국내 데이터/포함 로그/백업 저장·정확성/운영 목표와 test-after/Standard/80%·필수 보안/배포 확인을 유지한다. 언어·DB·AWS 서비스·실제 API/메시지/저장·실행/배포 전환은 미선정이다.

## Integrated First Unit

첫 DAG 루트 U1은 실제 UI→서버 권한/업무 처리→지속 주문 기록→확인 대기/진행 조회·원래 접수 결과 재확인 경로다. 인증/MFA·기업/직원 승인/권한·최소 상품 입력/조회 및 필요한 통지/이력·worker/최소 기술 준비가 포함된다. 후속 Unit을 먼저 구현해야만 실행되는 고립 계층/설계 문서로 만들지 않는다.

미구현 공급/대금/발급·실제 주체 미확인은 전체 확인 대기로 표시한다. 첫 작은 경로가 전체69개 스토리 완료는 아니다. 구체 데모·검증 명령/준비 조건은 Delivery Planning과 구현 확인에서 정하고 명령은 사용자 확인을 받는다. 첫 실제 동작과 후속 전체 기능·상용 준비를 구별한다. [S2–S4]

## 이전 보완 의견의 담당과 구현 전 확인

| 근거 | 소유·담당 | 구현 전 확인 |
|---|---|---|
| Domain Design R-01:주문 보호 대상 부서/사업장 문맥 누락 | OrderAcceptance 소유. U1 최소 주문 Functional Design, U2 접근·U3 주문 완성 및 U4/U6/U7·U8/U9의 연결 조회 | U1 주문 코드 전에 보호 대상 문맥·Department/BusinessSite 원본 연결과 동일 문맥 사용 경로를 명시한다. 요청자 현재 소속으로 과거 주문 문맥을 추측하지 않는다. 조직 변경 효력은 OQ4로 별도 확인한다. |
| Domain Design R-02:교차 참조5건 누락 | U3 CommercialProposal→U6 RenewalCycle, U3 PurchaseTermsSnapshot→U3 CommonOfferRevision, U3 OrderChangeApplication→U3 CustomerConsent, U4 FinancialEligibility→U6 RenewalCycle, U5 HardwareFulfillmentCase→U4 FinancialEligibility | 관련 Contract/Functional Design에서 식별자·원본 소유자·관계/버전·복제 값/외부 근거를 선언/대조하고 인터페이스/스키마 코드 전에 확인한다. 같은 Unit 안에서도 서로 다른 컴포넌트의 원본 참조를 유지한다. |

이는 후속 책임/확인 조건이며 과거 검토의 해결 판정이 아니다. 검증되지 않은 대상 문맥·계약/동의/금액/수량/기간·공급/대금 결과를 자동 허용·성공으로 구현하지 않는다.

## Handoff and Verification Responsibilities

Unit ID/Directory·kind·의존은 dependency의 fenced YAML과 같다. story-map은69 US의 주 책임/협력을 연결하며 traceability.json은 같은 행의 주 책임 Unit ID를 target으로 둔다. 업무 사실의 실제 왕복과 개발/계약 선행 DAG를 구별한다.

Contract Design은 소유자 조회/행동/사실·원본 참조/버전·권한·실패/미확인·접수 재확인/중복/역순·호스트/worker 호환을 정의한다. Functional Design은 전체 스키마/전이/산식/시간 경계·동시 처리·UI 행동을 구체화한다. NFR/Infra/CI/운영은 선택 기술·저장/전달/복구/관측·국내 위치·1인 부담/정확성/배포를 실증한다. Delivery Planning이 이 DAG로 실제 Bolt 우선순위·데모·명령을 확인한다. [S1–S4]

## Assumptions & Open Questions

- A-UG1 [assumption]:10개 단위·상대 규모·공통 실행 기반 위 확장이 실제 개발/기술 운영에 적합하다. 인원 수로 기능을 축소하지 않고 변경/부하/복구·운영 부담을 검증한다.
- A-UG2 [assumption]:첫 실제 통합에 필요한 신원/기업 확인·지속 기록·실행/기본 통지·대조 경로를 확보할 수 있다. 후속 구현·제공자·실제 계정을 완료된 선행 조건으로 가정하지 않는다.
- A-UG3 [assumption]:공통 소유자 계약·모듈/호스트 연결·버전 대조로 무순환 개발 DAG와 실제 사실 왕복을 함께 구현할 수 있다. 실제 포트/패키지/저장/전달·동시 제어/실증은 후속 설계에서 확인한다.
- Domain Design의 두 수용된 미해결 의견은 아래 담당/구현 전 조건으로 이어받는다. 이 할당을 해결 판정이나 과거 원본 변경으로 보지 않는다.
- OQ1–OQ2:계약 필수 값/버전·금액/기간/달력/반올림 산식·보류/정지/정정/한도·전이/동시 처리. U3–U7의 관련 Contract/Functional Design과 코드 전에 확인한다.
- OQ3:실제 재고/예약 권위·최신성·확보/출고/배송/인수·청구/지급/환불 주체/접근권, SW 수량/발급/전달/적용/회수 근거. U3–U7이 관련 계약/구현 약속·실거래 전에 실증한다.
- OQ4:실제 기업/첫 관리자·계정/동일인·MFA/복구·직원 망/PC·세션/권한 효력. U1/U2와 관련 실행/승인/조회 소유자가 접근 설계·코드/실제 계정 처리 전에 확인한다.
- OQ5–OQ7:분류/보관·고객 데이터/포함 로그·백업/외부 제공자 한국 저장, 장애/물리 대재난 제외·논리 손상/오삭제·RTO/RPO·야간/측정, 실제 알림/수신/재알림·장애 중 경로. U1/U7/U10과 원본 소유자가 관련 NFR/Infra/운영·실데이터/상용 약속 전에 검증한다.
- OQ8–OQ9:입력 상한/필터·화면/비동기/부하 측정, 검사 도구/대상/차단선·실행/배포/복구 방법. 관련 단위/단계에서 확인하며 이미 결정한 PC/브라우저/접근성 방향을 재질문하지 않는다.
- OQ10·HB-01–HB-08:실제 고객/가치·연동/실데이터/운영 증거·비용/업무량/지원 및 등록자 외 계약 승인자 확보. 개발자1명을 모든 사업/승인 역할의 인원으로 가정하지 않는다.

## Sources

- S1: [components](../domain-design/components.md), [decisions](../domain-design/decisions.md) —14개 논리 코드 책임·단일 원본 소유·ADR와 의도적 사실 왕복.
- S2: [requirements](../requirements-analysis/requirements.md), [stories](../user-stories/stories.md) —69 US·227 AC, 전체 기능·접근·실제 결과·정확성/운영 목표와 OQ1–OQ10.
- S3: [이번 질문과 요약 확인](units-generation-questions.md) —Q1 A·Q2 A·Q3 B·Q4 A·Q5 A·Q6 A·Looks correct. 초기6–9개는 후보 추정이고10개 단위·kind·배포 모델·DAG는 별도 Approve Plan으로 확인했다.
- S4: [team-practices](../practices-discovery/team-practices.md), [최신 UI 결정](../refined-mockups/refined-mockups-questions.md), [mockups](../refined-mockups/mockups.md), [interaction-spec](../refined-mockups/interaction-spec.md) —최소 통합 동작·1인 구조/전체 기능·테스트/배포 원칙, PC1280 이상·고객 모바일 미정·직원 모바일 제외·권한 정보 투영.
- S5: [이전 Domain Design 검토](../domain-design/reviews/review-01.md) —조직 문맥 및 교차 참조5건의 근거. 사용자의 미해결 수용은 감사 기록에 있고 당시 원문을 소급 수정하지 않는다.

일반 OMS/외부 제품 기능을 새 요구로 도입하지 않는다. 단위/종류/배포 역할은 확인한 답변과 구성 계획의 설계 선택이며 실제 구현·계정/연동·운영 목표 달성의 증거가 아니다.
