# Inception → Construction 요소 추적 점검

**Verdict:** PASS — 현재 문서의 요소 연결/선행 구조 점검.
**Checked at:** 2026-10-06T13:30:15.511921+00:00
**Human phase approval at check time:** Pending — Delivery Planning 최종 승인은 별도 이력에서 확인한다.

## Scope and Interpretation

16개 FR·58개 세부 FR·14개 NFR의88개 추적 ID,69개 US·227개 AC의 원본 정의와 선언된 추적/대상·단위 관계를 실제로 읽어 대조했다. 아래 PASS는 문서 요소 연결이며 코드·227개 AC 실행·실제 계정/고객/외부 제공자·복구/보안·가용성 목표 통과가 아니다.

Bolt는 하나의 구현 단위를 설계·구현해 실행 결과로 확인하는 개발 묶음이다. [bolt-plan](../inception/delivery-planning/bolt-plan.md)은10개 Unit을10개 Bolt로 연결하며 구현 완료로 표시하지 않는다. Construction 진입은 이 점검과 별도 Delivery Planning 승인에 따른다. 단계 전환/상태 기록은 승인 처리에서 수행하며 이 파일 자체가 전환/승인 증거는 아니다.

## Checks and Results

| 검사 | 결과 | 실제 확인 범위 |
|---|---|---|
| Requirements 원본 ID | PASS | 16+58+14=88개, 사용자 스토리 upstream/coverage의 중복·누락 없음 |
| User Stories 추적 | PASS | 79 OK·9 Deferred; OK 대상 US 존재, Deferred 담당 단계/이유 존재 |
| 스토리·AC 정의 | PASS | 69개 US·227개 AC ID, 모든 AC의 상위 US 존재 |
| Domain Design 추적 | PASS | 69개 US 전부 실제 컴포넌트 이름에 OK 연결; 이름은14개 catalogue에서 확인 |
| Units Generation 추적 | PASS | 69개 US 각각 한 주 책임 Unit에 OK 연결; 단위 정의/Directory·story-map과 일치 |
| 주 책임 Unit 역방향 | PASS | 모든10개 Unit에 주 책임 US 존재;3/8/12/8/8/12/9/2/1/6개=69 |
| 개발 선행 구조 | PASS | 10개 고유 Unit·43개 직접 선행·순환0·현재 선언 순서가 위상 순서; U1만 루트 |
| 구현 전 확인 조건 | 인계 | 상위 Domain 의견·OQ/실제 도입·NFR 실행 검증은 아래 담당/차단 조건에 유지 |
| GAP·ORPHAN·잘못된 대상·누락 ID | 0 | 세 traceability.json의 선언된 행·원본/대상 및 계획 단위 대조 |

reverse 배열이 없는 기존 추적 문서는 원본/대상 유효성과 Unit별 주 책임 역방향을 별도로 대조했다. UI 표시/입력 책임과 거래 원본/조회 책임의 차이를 새 데이터 소유권으로 합치지 않는다. Contract Design은 별도 traceability.json을 만들지 않으며 formal contract/관계 선언을 보존한다.

## Requirements to Stories or Follow-up Stages

| 요구 ID | 원본 추적 상태 | 원본 대상 |
|---|---|---|
| FR1 | OK | US1.1, US1.2, US1.3, US1.10 |
| FR2 | OK | US1.4, US1.5 |
| FR3 | OK | US1.6, US2.6, US6.3, US6.4, US8.12 |
| FR4 | OK | US2.1, US2.2, US2.3, US3.5 |
| FR5 | OK | US3.1, US3.6 |
| FR6 | OK | US3.2, US3.3, US3.4 |
| FR7 | OK | US2.4, US2.5, US2.6, US2.7 |
| FR8 | OK | US4.1, US4.2, US4.3, US4.4, US4.5, US4.6, US5.5, US6.1 |
| FR9 | OK | US5.1, US5.2, US5.3, US5.4, US5.5, US5.6, US5.7 |
| FR10 | OK | US6.1, US6.2, US6.3, US6.4, US6.5, US6.6 |
| FR11 | OK | US7.1, US7.2, US7.3, US7.4, US7.5, US7.6, US7.7 |
| FR12 | OK | US7.8 |
| FR13 | OK | US8.1, US8.2, US8.3, US8.4, US8.5, US8.6, US8.10, US8.11 |
| FR14 | OK | US6.2, US8.8, US8.9, US8.12 |
| FR15 | OK | US5.7, US6.6, US8.7, US8.10, US9.4 |
| FR16 | OK | US1.7, US1.8, US1.9 |
| FR1.1 | OK | US1.1, US1.2 |
| FR1.2 | OK | US1.2, US1.3 |
| FR1.3 | OK | US1.10 |
| FR2.1 | OK | US1.5 |
| FR2.2 | OK | US1.4 |
| FR2.3 | OK | US1.5 |
| FR2.4 | OK | US1.4 |
| FR3.1 | OK | US1.6, US8.12 |
| FR3.2 | OK | US2.6 |
| FR3.3 | OK | US6.3, US6.4 |
| FR4.1 | OK | US2.1 |
| FR4.2 | OK | US2.2, US2.3 |
| FR4.3 | OK | US3.5 |
| FR5.1 | OK | US3.1 |
| FR5.2 | OK | US3.1 |
| FR5.3 | OK | US3.6 |
| FR5.4 | OK | US3.1 |
| FR6.1 | OK | US3.2 |
| FR6.2 | OK | US3.2, US3.3 |
| FR6.3 | OK | US3.4 |
| FR7.1 | OK | US2.4 |
| FR7.2 | OK | US2.5 |
| FR7.3 | OK | US2.6 |
| FR7.4 | OK | US2.7 |
| FR8.1 | OK | US4.1, US4.2 |
| FR8.2 | OK | US4.3, US4.4 |
| FR8.3 | OK | US5.5, US6.1 |
| FR8.4 | OK | US4.5 |
| FR8.5 | OK | US4.6 |
| FR9.1 | OK | US5.1, US5.2, US5.3, US5.7 |
| FR9.2 | OK | US5.3, US5.4 |
| FR9.3 | OK | US5.5 |
| FR9.4 | OK | US5.1, US5.2, US5.6 |
| FR10.1 | OK | US6.1, US6.2, US6.6 |
| FR10.2 | OK | US6.3 |
| FR10.3 | OK | US6.4 |
| FR10.4 | OK | US6.5 |
| FR11.1 | OK | US7.1, US7.2, US7.4 |
| FR11.2 | OK | US7.3, US7.4 |
| FR11.3 | OK | US7.4, US7.5 |
| FR11.4 | OK | US7.6 |
| FR11.5 | OK | US7.7 |
| FR12.1 | OK | US7.8 |
| FR12.2 | OK | US7.8 |
| FR12.3 | OK | US7.8 |
| FR13.1 | OK | US8.1, US8.2, US8.3 |
| FR13.2 | OK | US8.1, US8.2, US8.3, US8.10 |
| FR13.3 | OK | US8.4 |
| FR13.4 | OK | US8.5, US8.6, US8.11 |
| FR14.1 | OK | US6.2, US8.8, US8.12 |
| FR14.2 | OK | US8.9 |
| FR14.3 | OK | US8.9 |
| FR15.1 | OK | US5.7, US6.6 |
| FR15.2 | OK | US8.7 |
| FR15.3 | OK | US5.7, US6.6, US8.7, US8.10 |
| FR15.4 | OK | US8.10, US9.4 |
| FR16.1 | OK | US1.7 |
| FR16.2 | OK | US1.8, US1.9 |
| NFR1 | OK | US1.7, US8.12 |
| NFR2 | Deferred | observability-setup |
| NFR3 | Deferred | nfr-requirements |
| NFR4 | Deferred | nfr-design |
| NFR5 | Deferred | build-and-test |
| NFR6 | Deferred | performance-validation |
| NFR7 | Deferred | performance-validation |
| NFR8 | OK | US9.3 |
| NFR9 | OK | US9.2, US9.3, US9.7 |
| NFR10 | OK | US9.1 |
| NFR11 | OK | US9.5 |
| NFR12 | Deferred | refined-mockups |
| NFR13 | Deferred | build-and-test |
| NFR14 | Deferred | ci-pipeline |

## Deferred NFR Responsibilities

Deferred는 요구 제외나 실제 시험 완료가 아니라 이유가 있는 담당 단계 연결이다. 원본9건을 그대로 이어받으며 목표/관련 업무 검증을 각 단위와 전체 실행에 적용한다.

| NFR | 원본 담당 단계 | 원본 이관 이유 |
|---|---|---|
| NFR2 | observability-setup | US9.6이 관측 평가 결과를 정의한다. 업무별 측정 지점·주기·부분 장애 규칙과 연속 30일 실측 증거는 observability-setup에서 구체화하며 단기 장애 시험으로 대체하지 않는다. |
| NFR3 | nfr-requirements | 장애 범위·재난 제외·야간 지원과 30분 복구 검증 프로필을 구체화한다. US9.2는 업무 목표이며 실증 완료가 아니다. |
| NFR4 | nfr-design | 논리 오염·오삭제를 포함한 성공 접수 RPO 0과 RTO의 동시 달성 설계·증거를 확정한다. |
| NFR5 | build-and-test | 8개 정확성 영역의 통합·중복·동시 처리·장애 시험을 수행한다. 스토리별 기준 연결은 전체 시험 통과를 뜻하지 않는다. |
| NFR6 | performance-validation | 확정된 시험 위치·네트워크·요청 구성에서 p95와 기술 오류율을 검증한다. |
| NFR7 | performance-validation | 합성 데이터·정상/집중 부하·5분 회복 및 10분 유지 프로필을 시험한다. |
| NFR12 | refined-mockups | PC 우선 고객 모바일·직원 PC 전용과 한국어/KRW/한국 시간·접근성 및 미정 브라우저/해상도를 구체화한다. |
| NFR13 | build-and-test | test-after·Standard·80% 커버리지와 필수 검증 실패/누락 차단을 구현 증거로 확인한다. |
| NFR14 | ci-pipeline | 보안 검사 도구·대상·차단선·주기를 정해 필수 검사와 예외 기록을 파이프라인에 연결한다. |

**NFR12의 최신 해석:** 위 원본 이유에는 과거의 고객 PC 우선 모바일 표현이 남아 있다. [mockups](../inception/refined-mockups/mockups.md)의 명시적 변경과 질문 Q5에 따라 현재 고객/직원 모두 PC1280 CSS px 이상, 고객 모바일 지원 여부 유보·직원 모바일 제외를 적용한다. 지원 브라우저·WCAG2.2AA 목표/PC 확대·리플로우의 시안은 해당 단계에 있고 실제 구현/접근성·화면 성능은 U8/U9의 설계·Build and Test·Performance Validation에서 확인한다. 원본 traceability.json을 소급 변경하거나 모바일 구현 완료를 주장하지 않는다.

나머지8건의 관측/장애 범위·보존/복구·정확성·부하·커버리지·CI 보안 검증도 해당 후속 단계와 B01 기본 준비/B10 전체 증거에 연결한다. 모든 담당 단계는 현재 계획에 실제 존재한다.

## Stories to Components and Units

| US | Domain 원본 대상 | 주 책임 Unit | Directory | Bolt |
|---|---|---|---|---|
| US1.1 | EnterpriseAccess | U1 | u1-integrated-foundation | B01 |
| US1.2 | EnterpriseAccess | U1 | u1-integrated-foundation | B01 |
| US1.3 | EnterpriseAccess | U2 | u2-identity-enterprise-access | B02 |
| US1.4 | EnterpriseAccess | U2 | u2-identity-enterprise-access | B02 |
| US1.5 | EnterpriseAccess | U2 | u2-identity-enterprise-access | B02 |
| US1.6 | EnterpriseAccess | U2 | u2-identity-enterprise-access | B02 |
| US1.7 | IdentityRecovery | U2 | u2-identity-enterprise-access | B02 |
| US1.8 | IdentityRecovery | U2 | u2-identity-enterprise-access | B02 |
| US1.9 | IdentityRecovery | U2 | u2-identity-enterprise-access | B02 |
| US1.10 | EnterpriseAccess | U2 | u2-identity-enterprise-access | B02 |
| US2.1 | ProductCatalog | U3 | u3-commercial-ordering | B03 |
| US2.2 | WorkInquiry | U8 | u8-customer-ui | B08 |
| US2.3 | CommercialAgreement | U3 | u3-commercial-ordering | B03 |
| US2.4 | CommercialAgreement | U3 | u3-commercial-ordering | B03 |
| US2.5 | CommercialAgreement | U3 | u3-commercial-ordering | B03 |
| US2.6 | CommercialAgreement | U3 | u3-commercial-ordering | B03 |
| US2.7 | CommercialAgreement | U3 | u3-commercial-ordering | B03 |
| US3.1 | OrderAcceptance | U3 | u3-commercial-ordering | B03 |
| US3.2 | OrderAcceptance | U3 | u3-commercial-ordering | B03 |
| US3.3 | OrderAcceptance | U1 | u1-integrated-foundation | B01 |
| US3.4 | OrderAcceptance | U3 | u3-commercial-ordering | B03 |
| US3.5 | CommercialAgreement | U3 | u3-commercial-ordering | B03 |
| US3.6 | OrderAcceptance | U3 | u3-commercial-ordering | B03 |
| US4.1 | FinancialSettlement | U4 | u4-financial-settlement | B04 |
| US4.2 | FinancialSettlement | U4 | u4-financial-settlement | B04 |
| US4.3 | FinancialSettlement | U4 | u4-financial-settlement | B04 |
| US4.4 | FinancialSettlement | U4 | u4-financial-settlement | B04 |
| US4.5 | FinancialSettlement | U4 | u4-financial-settlement | B04 |
| US4.6 | FinancialSettlement | U4 | u4-financial-settlement | B04 |
| US5.1 | HardwareFulfillment | U5 | u5-hardware-fulfillment | B05 |
| US5.2 | HardwareFulfillment | U5 | u5-hardware-fulfillment | B05 |
| US5.3 | HardwareFulfillment | U5 | u5-hardware-fulfillment | B05 |
| US5.4 | HardwareFulfillment | U5 | u5-hardware-fulfillment | B05 |
| US5.5 | HardwareFulfillment | U5 | u5-hardware-fulfillment | B05 |
| US5.6 | HardwareFulfillment | U5 | u5-hardware-fulfillment | B05 |
| US5.7 | HardwareFulfillment | U5 | u5-hardware-fulfillment | B05 |
| US6.1 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US6.2 | WorkInquiry | U8 | u8-customer-ui | B08 |
| US6.3 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US6.4 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US6.5 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US6.6 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US7.1 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US7.2 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US7.3 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US7.4 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US7.5 | CommercialAgreement | U3 | u3-commercial-ordering | B03 |
| US7.6 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US7.7 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US7.8 | FinancialSettlement | U4 | u4-financial-settlement | B04 |
| US8.1 | AfterSalesDecision | U7 | u7-after-sales-inquiry-notices | B07 |
| US8.2 | AfterSalesDecision | U7 | u7-after-sales-inquiry-notices | B07 |
| US8.3 | AfterSalesDecision | U7 | u7-after-sales-inquiry-notices | B07 |
| US8.4 | AfterSalesDecision | U7 | u7-after-sales-inquiry-notices | B07 |
| US8.5 | SoftwareLifecycle | U6 | u6-software-lifecycle | B06 |
| US8.6 | FinancialSettlement | U4 | u4-financial-settlement | B04 |
| US8.7 | WorkInquiry | U7 | u7-after-sales-inquiry-notices | B07 |
| US8.8 | WorkInquiry | U7 | u7-after-sales-inquiry-notices | B07 |
| US8.9 | NotificationDelivery | U7 | u7-after-sales-inquiry-notices | B07 |
| US8.10 | AfterSalesDecision | U7 | u7-after-sales-inquiry-notices | B07 |
| US8.11 | HardwareFulfillment | U5 | u5-hardware-fulfillment | B05 |
| US8.12 | WorkInquiry | U9 | u9-staff-ui | B09 |
| US9.1 | OperationalAssurance | U10 | u10-operational-assurance | B10 |
| US9.2 | OperationalAssurance | U10 | u10-operational-assurance | B10 |
| US9.3 | OperationalAssurance | U10 | u10-operational-assurance | B10 |
| US9.4 | WorkInquiry | U7 | u7-after-sales-inquiry-notices | B07 |
| US9.5 | OperationalAssurance | U10 | u10-operational-assurance | B10 |
| US9.6 | OperationalAssurance | U10 | u10-operational-assurance | B10 |
| US9.7 | OperationalAssurance | U10 | u10-operational-assurance | B10 |

주 책임 Unit은 구현/완성 작업의 배정이며 거래 원본 소유자를 대체하지 않는다. 고객/직원 UI 단위의2개/1개 주 책임 US만으로 전체 표면 범위를 축소하지 않는다. [unit-of-work-story-map](../inception/units-generation/unit-of-work-story-map.md)의 협력 범위·실제 owner/UI/운영 연결로 전체 스토리/AC 완료를 판단한다. CustomerUi/StaffUi의 표면 책임은 [components](../inception/domain-design/components.md)와 최신 mockups에 있으며 거래 읽기/원본 책임은 표의 Domain 대상에 보존한다.

## Inherited Conditions Before Implementation or Live Use

| 인계 항목 | 담당 | 차단/확인 시점 |
|---|---|---|
| Domain Design R-01: 주문 보호 부서/사업장 문맥 | U1 최소 주문·U2 접근·U3 주문 및 관련 원본/조회/UI | U1 Functional Design·주문 코드 전에 실제 보호 문맥/원본 참조·권한 대조를 명시 |
| Domain Design R-02: 교차 참조5건 | U3 CommercialProposal/PurchaseTermsSnapshot/OrderChangeApplication, U4 FinancialEligibility, U5 HardwareFulfillmentCase 및 U6 RenewalCycle | 관련 Functional Design·인터페이스/스키마 코드 전에 원본/관계/버전·근거 확인 |
| OQ1/OQ2 금액/기간/달력·전이/한도 | 관련 U1–U7 업무 소유자와 사용자 | 해당 설계/제품 코드 전; 합성 예시를 기본 정책으로 채택하지 않음 |
| OQ3/OQ4 실제 원본/실행·신원/기업/망·승인 | 관련 소유자·사용자/개발자, 실제 업무 담당 미확인 | 관련 신뢰/업무 설계·코드/구현 약속, 실제 계정/실거래 전 |
| OQ5–OQ9 저장/복구/알림·입력/부하·검사/배포 | 관련 Unit NFR/Infrastructure·전체 품질/운영 책임 | 실제 도입/코드·데이터·운영 약속/실증 전 |
| OQ10/HB-01–HB-08 실제 고객/가치·사업 담당/다른 계약 승인자 | 사용자·실제 확인자·개발자 조정 | 실제 고객/데이터·계약 효력·상용 준비 판단 전 |
| 실제 OMS 검증 명령·skeleton 동작 승인 | 개발자 준비·사용자 승인 | 실제 명령은 최초 체크포인트 검증 전에 별도 승인, 실제 U1 실행 승인 뒤 다음 Unit |

이 조건은 인간이 수용한 미해결 설계/실제 준비와 후속 구현의 인계다. 추적 누락0과 별개이며 이번 구조 점검으로 이전 검토가 해결됐다고 표시하지 않는다. 해결할 설계/정책/준비가 필요한 코드/실거래 경로는 그 조건을 충족할 때까지 보류한다.

## Evidence Baseline

검사 시 읽은 문서/JSON의 SHA256이다. 구조 점검은 아래 원본 바이트를 기준으로 했고, 후속 내용 변경 시 해당 연결/조건을 다시 대조한다.

| 원본 | SHA256 |
|---|---|
| [inception/requirements-analysis/requirements.md](../inception/requirements-analysis/requirements.md) | 1b0e2efa49e869f0b5ead121df961637e317dd2c91b4c77bfd56d691c043747c |
| [inception/user-stories/stories.md](../inception/user-stories/stories.md) | 1fbfab16d523365df77331a3b8386ce2ac84e476e603007d691d38310d7c6a23 |
| [inception/refined-mockups/mockups.md](../inception/refined-mockups/mockups.md) | 832d0670a4b7a95d7a9b9cb89958553306873116edfd6bf900ed0cddcc7f2c31 |
| [inception/domain-design/components.md](../inception/domain-design/components.md) | 816ff9649e6b425242fc4d1d08040ef064adf01e8b60604f21311ef7c47fd1f9 |
| [inception/units-generation/unit-of-work.md](../inception/units-generation/unit-of-work.md) | ab193fe7a8b365afc9d05f9ab0499d29e765da38b45be22ff455533f82c98803 |
| [inception/units-generation/unit-of-work-dependency.md](../inception/units-generation/unit-of-work-dependency.md) | 791ef343784d59484aaffeb48288f36bb03d35761a8725b9145e89a234a4feeb |
| [inception/units-generation/unit-of-work-story-map.md](../inception/units-generation/unit-of-work-story-map.md) | eb4f3834c20fcbd5570df1693966075130638410a9102f87edac16c32d442921 |
| [inception/contract-design/contract-summary.md](../inception/contract-design/contract-summary.md) | 6132a2b53a832db100ea1af4d591cdba26fc7ae3b63e2732f301472723ff1a61 |
| [inception/practices-discovery/team-practices.md](../inception/practices-discovery/team-practices.md) | ad02c65b15b2bc085c59aa616a2a1652fdcd42f67d9f5a45b5408c2e57462a2f |
| [inception/user-stories/traceability.json](../inception/user-stories/traceability.json) | 02e98fc133807fe216334252f68edbef2b74553700aa0de52311fed85da73086 |
| [inception/domain-design/traceability.json](../inception/domain-design/traceability.json) | 3c7f21a2138b304b94fc80c4e11b70ddf5860a2b4dbe7f1adb35ae681bd43f57 |
| [inception/units-generation/traceability.json](../inception/units-generation/traceability.json) | 5e561e39c7ba95793a3a0e4d92fcfa469e10d711cb9e4a798a198e6f37779539 |
| [inception/delivery-planning/delivery-planning-questions.md](../inception/delivery-planning/delivery-planning-questions.md) | db72fe44e49444f179f3e2cc213b41982af4725b6930b2543dfdcdf854162cca |

## Sources and Limits

- 요구사항/스토리/도메인/단위의 세 원본 traceability.json을 직접 읽고 선언 ID·상태/대상·이유·일치/중복을 대조했다. Contract의 formal spec 실행·실제 시스템/외부 효과는 이 점검 범위가 아니다.
- [mockups](../inception/refined-mockups/mockups.md), [contract-summary](../inception/contract-design/contract-summary.md), [team-practices](../inception/practices-discovery/team-practices.md)와 최신 [확인된 답변](../inception/delivery-planning/delivery-planning-questions.md)의 범위/권한/정확성/실행 조건을 유지한다.
- NFR Deferred9건 및 실제 자료/사람/제공자·OQ/HB 조건은 인계된 미확정/미실증이다. 구현·227개 AC 통과·실고객 가치·한국 저장·RPO/RTO/가용성 목표 달성을 주장하지 않는다.
- 점검 시점은 Delivery Planning의 최종 승인 전이다. 최종 승인 뒤 인계된 첫 Unit의 해당 Functional Design부터 진행한다.
