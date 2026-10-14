## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-06T09:25:10Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261004-feature/inception/contract-design/contract-summary.md > C00 ProductInput/OrganisationInput/ReadRequest/ServiceContext; C02 upsertOrganisation; C03 reviseProduct; C10 readReceipt; C16/C17 대상 경로 | HTTP의 대상 식별자를 소유자 호출로 전달할 형식이 빠졌다. C17 `POST /products/{id}/revisions`는 ProductInput을 C03 reviseProduct로 보내지만 ProductInput·CommandMeta·ServiceContext·Call 어느 곳에도 상품 대상 필드가 없다. 유효한 Call에 `targetRef` 또는 `productRef`를 추가하면 닫힌 스키마가 거절한다. 기업별 organisation-changes도 OrganisationInput에 기업/수정 조직 대상이 없다. 또한 두 HTTP `GET /requests/{id}`와 C10 readReceipt는 ReadRequest를 사용하지만 requestId가 없고 Receipt는 Ref의 허용 entity가 아니므로 원래 접수 ID를 표현할 수 없다. G17/G22의 서버 대상 구성·일치 검증 및 확인된 Q4의 원래 식별자 조회를 비명세 인자 없이 구현할 수 없다. 수정 확인: C01–C12의 Call.target을 필수화하고 HTTP x-call-target 매핑을 선언했다. 상품 수정은 Product 대상, 기업 경로는 ENTERPRISE 대상이며 OrganisationInput의 CREATE/UPDATE·organisationRef·기대 버전 분기가 추가됐다. C10/두 HTTP 접수 조회는 ReceiptReadRequest.requestId 및 REQUEST target을 사용한다. 올바른 입력과 두 별도 접수 ID는 허용되고 대상 누락/다른 상품 entity/조직 UPDATE 대상 누락·잘못된 entityKind는 거절됐다. 경로·target·본문 ID 및 원본 기업 관계 일치 조건도 명시돼 있다. | 이번 계약 보완 완료. 선언된 경로/target/본문·원본 부모/기업·기대 버전 및 접수 principal/audience 일치 검증은 후속 서버 구현에서 실행 검증한다. | Resolved |
| R-02 | Major | aidlc/spaces/default/intents/261004-feature/inception/contract-design/contract-summary.md > C00 ApprovedTermsView.payment.postpayCompletionBasis; G12 | 기계 판독 완료 기준은 `HW_SHIPMENT`, `HW_CUSTOMER_ACCEPTANCE`, SW 기준만 허용한다. `HW_SHIPMENT`는 스키마를 통과하고 배송 완료를 나타내는 값은 없다. 상위 requirements.md의 FR9.4와 이 문서 G12는 배송 완료 또는 고객 인수를 기준으로 삼으며 출고와 배송 결과를 구별한다. 출고를 뜻하는 값을 배송 완료로 암묵 해석하면 제공 완료/후불 기산을 조기에 시작하거나 소비자마다 다르게 해석할 수 있다. 수정 확인: enum을 HW_DELIVERY로 변경하고 확인된 배송 완료와 출고를 구별했다. ProvisionTranche의 COMPLETED는 양수 수량·완료 시각·증거와 선택 기준의 배송 또는 인수 시각이 필요하다. 배송 기준은 인수를 추가 요구하지 않고 인수 기준은 배송만으로 완료하지 않는다. HW_DELIVERY 허용/HW_SHIPMENT 거절, 출고만 확인된 PENDING 허용, 완료 근거 시각 누락 거절을 확인했다. | 이번 계약 보완 완료. 배송/인수별 완료 시각 일치와 SW의 발급·결과 제공·합의 시작 중 최종 시각 의미는 후속 소유자 구현에서 실행 검증한다. | Resolved |
| R-03 | Major | aidlc/spaces/default/intents/261004-feature/inception/contract-design/contract-summary.md > C00 Fact/HardwareView/SoftwareView; C20-E25/C20-E29; C07/C08 조회 계약 | FinancialSettlement에 제공 건별 후불 기산 자료를 전달할 계약이 불완전하다. E25/E29의 payload는 공통 Fact와 sourceOwner 제약뿐이며 실제 제공 건의 주문 품목·수량·완료일을 갖지 않는다. E25에서 참조만 있는 Fact는 유효하지만 completedQuantity/completedAt/orderLineRef를 추가하면 거절된다. G02/G08은 원본 역참조/최신 대조를 요구하지만 이 자료를 읽는 형식 조회 계약이 없다. C07/C08의 소비자에는 FinancialSettlement가 없고 HardwareView의 tranches에도 제공 건 ID/완료일이 없다. 따라서 FR8.4의 서로 다른 날 5개씩 제공한 건별 기한과 지연·정정 처리를 어느 경계에서 어떤 형태로 얻는지 구현자가 추측해야 한다. 수정 확인: E25/E29는 ProvisionFinanceFact/ProvisionTranche로 제공 건 ID·품목·수량·완료일·구매 조건·원본 버전·정정 관계를 전달한다. C07/C08 readCompletionFact와 RC01/RC02는 FinancialSettlement의 해당 기업/주문/품목 대조만 허용하고 SW 민감 결과를 제외한다. 두 5개 제공 건과 같은 건의 3개 정정 입력은 유효하며 완료 배열/시각 누락·0개 완료·다른 소유자는 거절됐다. 재시도 시 안정 ID, 제공 건/aggregate 버전 구별, 중복/역순·공급자 미등록/공백 처리도 명시했다. | 이번 계약 보완 완료. 실제 커밋·중복/역순·정정 효과 및 제한된 읽기 권한은 관련 Unit 통합/복구 검증에서 확인한다. | Resolved |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-required-sections | PASS; H2 12개, findings 0 | 현재 수정 산출물의 필수 구조 확인. |
| sensor-upstream-coverage | PASS; unreferenced 0 | 선언된 네 상위 산출물의 참조 확인. |
| 독립 YAML/JSON Schema/참조 검사 | PASS; YAML 44개, JSON Schema 문서 24개, 공통 정의 140개, 참조 3,045개 해결 | 계약 ID 44개가 고유하며 수정된 대상/제공 건 정의의 문법과 참조도 유효하다. |
| 독립 소유자/HTTP 매핑 검사 | PASS; 소유자 Call 115개 입력·필수 target 일치, HTTP operation 90개 입력/조회·x-call-target 매핑 일치 | R-01의 형식 전달 경계를 실제 명세로 확인했다. 값 간 일치와 원본 부모 관계는 명시된 서버 의미 제약이다. |
| openapi-spec-validator 0.9.0 | PASS; C16/C17 두 문서 | 공동 URN을 같은 스키마의 로컬 components로 해소한 메모리 복사본을 검사했다. |
| @asyncapi/parser | PASS; 18개 문서, 오류/경고 0, 정보 18개 | 공동 스키마를 메모리에서 해소했다. 정보는 최신 버전 사용 권고이며 3.0.0 형식 실패가 아니다. |
| 독립 계약/상위 추적 검사 | PASS; DAG 43개, 논리 관계 81개, US 69개 누락 없음; RC01/RC02 두 읽기 관계 명시 | 새 읽기 연결은 U1 포트 서명과 U5/U6 등록으로 연결하며 U4의 구현 import/개발 DAG 역의존을 요구하지 않는다. |
| 독립 JSON Schema 합성 입력 검사 | PASS; 정상/거절 사례 31개 | 상품 target 누락/오타, 조직 CREATE/UPDATE, 별도 접수 ID, HW 배송/인수 근거, E25/E29 필수 제공 자료·소유자, 제한된 조회 입력을 검사했다. R-01–R-03의 수정 근거다. |
| 제공 건별 합성 달력 대조 | PASS; 5개씩 10-01/10-08 제공의 30일 기한은 10-31/11-07; 첫 건을 3개/10-03으로 정정하면 기한 11-02·총수량 8 | 선언된 검증용 달력 조건에서 자료가 각 건의 원래/정정 계산을 표현한다. 제품 지급 일수 선택이나 실제 금융 처리 시험이 아니다. |
| 의미 제약 독립 대조 | PASS; 경로/target/data 동일 대상, 조직 기업 소속, 배송/인수 완료 시각, SW 세 완료 조건의 최종 시각, 안정 trancheId와 개별/aggregate 버전 및 정정 관계 명시 | JSON Schema만으로 증명할 수 없는 값 간 관계를 문서 계약에서 확인했다. 실제 권한·날짜·중복/역순 검증의 실행 성공을 주장하지 않는다. |

### Summary

기존 R-01/R-02/R-03은 모두 Resolved이며 새 발견 사항은 없다. 미해결 Critical/Major/Minor 0건으로 READY다. 이번 단일 advisory 재검토는 현재 계약과 합성 입력의 독립 확인이며 실제 서버·외부 제공자·227개 AC·보안/정확성/SLO/복구 목표 달성 검증은 아니다.
