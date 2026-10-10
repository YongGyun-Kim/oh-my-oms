# OMS 구현·배포 단위 구성 계획

## 확인 근거와 후보 수 보정

[질문·통합 요약 확인](units-generation-questions.md)의 Q1 A·Q2 A·Q3 B·Q4 A·Q5 A·Q6 A와 Looks correct를 반영한 구성 계획이다. 후보6–9개는 상한이 아닌 [assumption] 추정이었다. 신원/접근·상품/계약/주문·대금·HW·SW·후속 조회/통지를 각각 검증하고 고객/직원 UI도 별도 작업 단위로 두면 **총10개**가 된다. UI를 합쳐9개로 두는 대안은 작업 수가 적지만 고객/직원 전용 흐름과 접점 검증이 한 단위에 모인다. 이 계획은10개를 제안하고 별도의 Approve Plan / Revise Plan에서 확인한다.

전체69 US·227 AC를 유지한다. 단위의 번호는 안정된 식별자이며 권장 구현 순서나 critical path가 아니다. 첫 최소 통합 단위의 형태만 기존 skeleton-on 결정에 맞춘다. 나머지 경제적 우선순위·Bolt 순서는 Delivery Planning에서 정한다.

## 단위 목록과 kind·배포 모델

| Unit ID | Directory | Kind | 배포 모델 | 상대 규모 | 책임 | 직접 의존 | 주 책임 US 수 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U1 | u1-integrated-foundation | service | shared | L | 최소 통합 실행 기반 | None | 3 |
| U2 | u2-identity-enterprise-access | library | embedded | L | 신원·복구·기업 접근 확장 | U1 | 8 |
| U3 | u3-commercial-ordering | library | embedded | L | 상품·계약·주문 판단 | U1, U2 | 12 |
| U4 | u4-financial-settlement | library | embedded | L | 대금·배분·환불 | U1, U2, U3 | 8 |
| U5 | u5-hardware-fulfillment | library | embedded | L | HW 공급·이행·회수 | U1, U2, U3, U4 | 8 |
| U6 | u6-software-lifecycle | library | embedded | XL | SW 권한·기간·갱신 | U1, U2, U3, U4 | 12 |
| U7 | u7-after-sales-inquiry-notices | library | embedded | L | 후속 판단·조합 조회·통지 | U1, U2, U3, U4, U5, U6 | 9 |
| U8 | u8-customer-ui | ui | standalone | L | 고객 PC UI | U1, U2, U3, U4, U5, U6, U7 | 2 |
| U9 | u9-staff-ui | ui | standalone | L | 직원 PC UI | U1, U2, U3, U4, U5, U6, U7 | 1 |
| U10 | u10-operational-assurance | service | standalone | L | 기술 운영 검증·공통 준비 | U1, U2, U3, U4, U5, U6, U7, U8, U9 | 6 |

- service: 배포되는 실행 코드. U1은 제품의 API/worker 실행 기반과 최소 UI 연결을 통합하며, U10은 기술 진단/검증 실행 코드와 운영 준비를 다룬다.
- library: 자체 독립 런타임이 없는 업무 모듈. U2–U7은 같은 업무 애플리케이션의 API/worker에 embedded되어 각 논리 컴포넌트의 원본/규칙을 유지한다.
- ui: 프론트엔드 표면. U8 고객·U9 직원은 별도 빌드/배포이며 공통 디자인/기초 조작 코드를 재사용한다.
- kind별 Construction 문서 범위를 적용하되 모듈에 필요한 권한·정확성·저장/복구 조건을 생략하지 않는다. library의 배포/확장 조건은 호스트의 NFR/Infrastructure와 연결한다. U10은 OperationalAssurance의 실행/엔티티·검증 규칙을 모델링할 service이며 단순 포장만 하는 packaging으로 축소하지 않는다.
- S/M/L/XL은 상대 [assumption]이며 개발 기간·인시·완료 사실이 아니다. 특히 SW의 시간/보상/유예·갱신은XL로 추정한다. 실제 복잡도에 따라 사용자의 단위 변경 절차로 다시 구성할 수 있다.

## 단위별 범위

### U1 최소 통합 실행 기반

- 논리 컴포넌트: IdentityRecovery, EnterpriseAccess, ProductCatalog, OrderAcceptance, WorkInquiry, NotificationDelivery, CustomerUi, StaffUi.
- 구현 범위: 필요한 신원/MFA·기업 승인/권한과 최소 상품 등록/조회·주문 접수/지속 기록·확인 대기/진행 조회를 실제 연결한다. API·worker 실행 기반과 고객/직원 UI의 최소 독립 빌드/배포 경로, 실행에 필요한 최소 기술 준비와 공통 계약/통합 접점을 포함한다. 후속 모듈이 없으면 공급/지급/제공을 미확인으로 유지한다.
- 주 책임 스토리: US1.1, US1.2, US3.3.

### U2 신원·복구·기업 접근 확장

- 논리 컴포넌트: IdentityRecovery, EnterpriseAccess.
- 구현 범위: MFA/복구·확인된 동일인, 기업/조직/소속·역할/행위별 범위·관리자 부재/재지정을 완성한다. U1 기본 경로를 확장하고 실제 UI 접점은 U8/U9와 연결한다.
- 주 책임 스토리: US1.3, US1.4, US1.5, US1.6, US1.7, US1.8, US1.9, US1.10.

### U3 상품·계약·주문 판단

- 논리 컴포넌트: ProductCatalog, CommercialAgreement, OrderAcceptance.
- 구현 범위: 공통 상품 조건·기업 예외·다른 사람 계약 승인·버전별 제안/동의, 구매 당시 조건 보존·타입별 다품목/선후불·전체 수락/확인 대기·제공 선택을 완성한다. 공급/대금 판단은 공통 계약을 통해 소유자 결과를 이용한다.
- 주 책임 스토리: US2.1, US2.3, US2.4, US2.5, US2.6, US2.7, US3.1, US3.2, US3.4, US3.5, US3.6, US7.5.

### U4 대금·배분·환불

- 논리 컴포넌트: FinancialSettlement.
- 구현 범위: 직원/외부 청구·지급·배분/정정·환불 실제 결과/한도·품목별 지급 조건·후불/연체·보상 중첩 요금 조정을 소유한다. 제공/보상/후속 허용 사실은 각 소유자의 계약으로 연결한다.
- 주 책임 스토리: US4.1, US4.2, US4.3, US4.4, US4.5, US4.6, US7.8, US8.6.

### U5 HW 공급·이행·회수

- 논리 컴포넌트: HardwareFulfillment.
- 구현 범위: HW 공급/납기 근거, 재고 예약·확보 정책·지급/전체·부분 조건·출고·합의 배송/인수·회수/잔량·미확인/충돌/실패 재처리를 소유한다. U3/U4와 실제 판단/결과 통합을 검증한다.
- 주 책임 스토리: US5.1, US5.2, US5.3, US5.4, US5.5, US5.6, US5.7, US8.11.

### U6 SW 권한·기간·갱신

- 논리 컴포넌트: SoftwareLifecycle.
- 구현 범위: 기업 수량의 영구/기간제 발급·실제 기간·기간 조정/별도 승인·수동/자동 갱신·계약 우선·새 동의·유예/보상·실제 회수를 소유한다. U3/U4와 지급/기간/요금 조정을 통합 검증한다.
- 주 책임 스토리: US6.1, US6.3, US6.4, US6.5, US6.6, US7.1, US7.2, US7.3, US7.4, US7.6, US7.7, US8.5.

### U7 후속 판단·조합 조회·통지

- 논리 컴포넌트: AfterSalesDecision, WorkInquiry, NotificationDelivery.
- 구현 범위: 전체 주문 변경/취소/반품·보류/계속 판단, 소유자별 실제 결과/원본 이력·남은 조치의 권한별 조합 조회, 최소 안내/통지 전달 결과를 완성한다. 각 업무의 원본 대조/정정·실제 환불/회수는 해당 소유자에게 둔다.
- 주 책임 스토리: US8.1, US8.2, US8.3, US8.4, US8.7, US8.8, US8.9, US8.10, US9.4.

### U8 고객 PC UI

- 논리 컴포넌트: CustomerUi.
- 구현 범위: 고객 C01–C09와 고객 인증/가입/복구의 전체 화면을 실제 API에 연결한다. 주문/계약 제안 동의·조직/역할/범위·대금/권한/후속 요청을 허용 정보로 표현하고 상태/오류/미확인·키보드/접근성을 검증한다.
- 주 책임 스토리: US2.2, US6.2.

### U9 직원 PC UI

- 논리 컴포넌트: StaffUi.
- 구현 범위: 직원 S01–S11과 인증/복구, 등록/판단/승인·대금/HW/SW·후속 처리를 실제 API에 연결한다. 사내망/승인 원격 PC·행위 권한·계약 다른 사람 승인/기간 동일인 별도 승인을 각각 표현한다.
- 주 책임 스토리: US8.12.

### U10 기술 운영 검증·공통 준비

- 논리 컴포넌트: OperationalAssurance.
- 구현 범위: 배포되는 진단/접수·결과 대조 실행 코드와 공통 CDK·검사/배포·관측/복구·국내 저장·가용성/사람 작업 증거를 연결한다. OMS 장애 중 복구 시도/실패 통지 경로를 검증한다. 상시 운영 웹 서비스·OMS 운영 대시보드를 추가하지 않고 실제 운영 도구/실행 위치는 후속 설계에서 정한다.
- 주 책임 스토리: US9.1, US9.2, US9.3, US9.5, US9.6, US9.7.


## 실행·데이터·개발 의존의 구별

제품의 배포 대상은 고객 UI, 직원 UI, 업무 웹/API, 별도 worker 역할로 구분한다. 업무 핵심은 모듈화된 단일 애플리케이션이며 API/worker가 같은 업무 모듈·계약을 재사용한다. 직원 접점의 망/PC·MFA/행위 권한은 서버/접속 경로에서 강제한다. 리포지토리 수·언어·DB·AWS 서비스·실제 저장/전달/배포 기술은 미선정이다.

U10의 기술 실행 코드는 실제 관측/배포/복구 주체와 조합하여 운영 경로에서 실행한다. 상시 운영 API나 별도 OMS 운영 UI를 요구하지 않는다. API/worker 장애 중 통지·복구 근거를 확보할 실행 경계는 NFR/Infrastructure/운영 설계에서 검증한다.

아래 의존은 **개발·검증에 필요한 선행 계약/구현**이다. Domain Design의 실제 사실 왕복을 단위 DAG에서 숨기거나 무순환이라고 바꿔 주장하지 않는다. 논리 데이터 소유자는14개 컴포넌트 그대로이며 같은 원본을 UI/다른 단위가 직접 변경하지 않는다.

- U1은 공통 호출/사실·권한·진행 조회 계약의 실행 기반과 최소 구현을 포함한다. U2–U7은 각 소유자의 업무 모듈을 확장하고 필요한 호스트/등록·통합 연결도 같은 단위에서 확인한다.
- 후속 구현이 없는 인터페이스는 미확인/미준비로 다루고 공급·지급·수락/제공 완료를 만들어내지 않는다. 계약 시험에 검증된 합성 입력/대역을 쓰는 것은 실제 제공자/상용 연동 실증이 아니다.
- U3의 전체 수락 판단은 HW/SW·대금 소유자의 계약에 의존하지만 구현 선행을 순환시키지 않는다. 현재 실제 근거가 없으면 전체 확인 대기이며, U5/U6이 실제 소유자와 연결할 때 U3/U4 통합을 검증한다.
- U4의 제공 완료·보상 기간·후속 허용 입력도 원본 소유자의 사실 계약을 통해 받는다. U5/U6/U7이 해당 실행을 연결할 때 실제 수량/기간/환불의 통합 대조를 검증한다.
- 컴포넌트 소유권과 작업 단위의 변경 범위는 다르다. U1 최소 구현을 후속 소유자 단위가 확장할 때 같은 논리 원본/이력·신원/권한을 유지한다. 공통 호스트·계약·UI 연결 변경은 해당 단위의 구현/검증 범위와 향후 source-manifest에 명시한다. 동시에 서로 다른 단위가 같은 파일을 임의 수정하도록 하지 않는다.
- 패키지 import·실제 API/메시지/저장·버전 호환·중복/역순·접수 보존·재처리는 다음 Contract/Functional/NFR Design에서 구체화한다. 전달 기술이나 정확히 한 번 전송 보장을 지금 채택하지 않는다.

## 의존 DAG와 독립 집합

| 단위 | 직접 의존 단위 |
| --- | --- |
| U1 | None |
| U2 | U1 |
| U3 | U1, U2 |
| U4 | U1, U2, U3 |
| U5 | U1, U2, U3, U4 |
| U6 | U1, U2, U3, U4 |
| U7 | U1, U2, U3, U4, U5, U6 |
| U8 | U1, U2, U3, U4, U5, U6, U7 |
| U9 | U1, U2, U3, U4, U5, U6, U7 |
| U10 | U1, U2, U3, U4, U5, U6, U7, U8, U9 |

DAG 검증:10개 단위·모든 참조 선언됨·자기 의존0·순환0. 첫 해석 가능한 루트는 U1이며 후속 단위 없이 최소 통합 동작을 실행한다. U5/HW와 U6/SW, U8/고객 UI와 U9/직원 UI는 각각 서로의 구현에 의존하지 않는 집합이다. 이는 구조상 병행 가능성이며 현재 직렬 Construction 설정을 변경하거나 새 인력을 가정하지 않는다. 권장 단일 실행 순서/critical path를 제시하지 않는다.

## 스토리 연결과 첫 단위 확인

69개 US는 위 목록에 주 책임 단위를 하나씩 지정한다. 각 스토리의 실제 도메인 원본/동작·UI·운영 협력 단위는 최종 story-map에 함께 적는다. 주 책임 지정만으로 화면/API/연동/운영 AC가 모두 구현·검증된 것으로 표시하지 않는다.

U1은 필요한 실제 신원/MFA·기업 승인/권한·상품 입력/조회·주문 접수/지속 기록·확인 대기/진행 조회와 독립 UI 접점의 최소 기능을 포함한다. 첫 성공 접수와 조회·재확인, 미확인 근거 표현·권한 거절을 실제 경로에서 확인한다. 공급/수금/발급의 미완료를 완료처럼 보이게 하지 않는다. 후속 Unit 없이도 실행되는 검증 경로를 Delivery Planning에서 구체화하고 실제 명령은 별도 사용자 확인으로 정한다.

## 기존 보완 의견과 구현 전 조건

- Domain Design R-01(Major, 사용자가 미해결 수용): 주문 보호 대상의 부서/사업장 문맥은 OrderAcceptance 소유다. U1의 주문/접근 Functional Design에서 근거 연결을 명시하여 첫 주문 코드 전에 확인하고, U2/U3/U4/U6/U7/U8/U9의 접근·대금·권한·후속/조회가 같은 문맥을 쓰도록 연결한다. 조직 변경의 상세 효력은 OQ4로 확인한다. 이전 components.md를 수정하거나 검토 의견이 해결됐다고 표시하지 않는다.
- Domain Design R-02(Minor, 사용자가 미해결 수용): 기존 참조5건은 U3(CommercialProposal→RenewalCycle, PurchaseTermsSnapshot→CommonOfferRevision, OrderChangeApplication→CustomerConsent), U4(FinancialEligibility→RenewalCycle), U5(HardwareFulfillmentCase→FinancialEligibility)와 대상 소유자 U6의 Contract/Functional Design에서 선언·대조한다. 이미 명명한 원본 참조와 실제 복제 값/외부 증거를 구별하고 인터페이스/스키마 구현 전에 확인한다.
- 기존 OQ1–OQ10·HB-01–HB-08의 계약/산식·세부 전이·실제 주체/연동·신원·국내 저장/보관·장애/측정·알림·도구·사업 인력은 각 관련 설계/구현/실거래 전에 근거를 확보한다. 현재 계획을 그 검증의 완료로 보지 않는다.

## 승인 후 작성할 문서

계획을 확인한 후 unit-of-work.md·unit-of-work-dependency.md·unit-of-work-story-map.md·traceability.json을 작성한다. 최종 의존 문서에는 동일한 단위/종류/의존의 fenced YAML과 작성 전 검증한 Mermaid·텍스트 대체를 넣는다. 이후 독립 검토·일반 검증·추가 원칙 확인·단계 승인을 진행한다.

## Assumptions & Open Questions

- [assumption]10개 단위의 경계/상대 규모와 공통 실행 기반 위의 확장이 실제 개발/운영에 적합하다. 1인 구조 목표·전체 기능·정확성·보안 목표를 줄이는 근거로 쓰지 않는다.
- [assumption] 첫 통합 단위의 실제 신원/기록/실행과 기본 통지/대조 경로를 확보할 수 있다. 공급자·수요·복구/가용성·국내 저장은 실증 전이다.
- 기존 두 보완 의견·OQ/HB는 위 구현 전 조건과 후속 담당 단위에 이어받는다.
- 후보6–9개를 실제10개로 보정했다. 실제 단위 수·kind·DAG는 이 계획의 별도 인간 확인 대상이다.

## Sources

- [확인한 질문/요약](units-generation-questions.md).
- [components](../domain-design/components.md), [decisions](../domain-design/decisions.md) —14개 원본 책임과 논리 관계.
- [requirements](../requirements-analysis/requirements.md), [stories](../user-stories/stories.md) —69 US·227 AC와 실행/접근/운영 조건.
- [team-practices](../practices-discovery/team-practices.md), [최신 UI 결정](../refined-mockups/refined-mockups-questions.md).
- [이전 단계 검토](../domain-design/reviews/review-01.md) — 수용된 미해결 의견의 근거. 이 계획이 이전 검토의 상태를 변경하지 않는다.

