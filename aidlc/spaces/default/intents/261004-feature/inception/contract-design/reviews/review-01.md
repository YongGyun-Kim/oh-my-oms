## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-06T08:33:15Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261004-feature/inception/contract-design/contract-summary.md > C00 ProductInput/OrganisationInput/ReadRequest/ServiceContext; C02 upsertOrganisation; C03 reviseProduct; C10 readReceipt; C16/C17 대상 경로 | HTTP의 대상 식별자를 소유자 호출로 전달할 형식이 빠졌다. C17 `POST /products/{id}/revisions`는 ProductInput을 C03 reviseProduct로 보내지만 ProductInput·CommandMeta·ServiceContext·Call 어느 곳에도 상품 대상 필드가 없다. 유효한 Call에 `targetRef` 또는 `productRef`를 추가하면 닫힌 스키마가 거절한다. 기업별 organisation-changes도 OrganisationInput에 기업/수정 조직 대상이 없다. 또한 두 HTTP `GET /requests/{id}`와 C10 readReceipt는 ReadRequest를 사용하지만 requestId가 없고 Receipt는 Ref의 허용 entity가 아니므로 원래 접수 ID를 표현할 수 없다. G17/G22의 서버 대상 구성·일치 검증 및 확인된 Q4의 원래 식별자 조회를 비명세 인자 없이 구현할 수 없다. | 상품 수정과 기업/조직 변경의 대상, 접수 조회의 requestId를 각각 적절한 입력 스키마 또는 명시적인 서버 호출 봉투에 선언한다. 경로에서 검증된 대상이 해당 포트 입력으로 어떻게 전달되는지 명세하고 대상 누락·경로/본문 불일치·같은 업무의 서로 다른 접수 조회 예시를 검증한다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261004-feature/inception/contract-design/contract-summary.md > C00 ApprovedTermsView.payment.postpayCompletionBasis; G12 | 기계 판독 완료 기준은 `HW_SHIPMENT`, `HW_CUSTOMER_ACCEPTANCE`, SW 기준만 허용한다. `HW_SHIPMENT`는 스키마를 통과하고 배송 완료를 나타내는 값은 없다. 상위 requirements.md의 FR9.4와 이 문서 G12는 배송 완료 또는 고객 인수를 기준으로 삼으며 출고와 배송 결과를 구별한다. 출고를 뜻하는 값을 배송 완료로 암묵 해석하면 제공 완료/후불 기산을 조기에 시작하거나 소비자마다 다르게 해석할 수 있다. | 배송 완료를 뜻하는 enum과 의미를 명시하고 G12·FR9.4와 일치시킨다. 출고만 확인된 상태, 배송 완료, 인수 기준의 배송 완료/인수 확인을 구별하는 완료·후불 기산 예시를 검증한다. | New |
| R-03 | Major | aidlc/spaces/default/intents/261004-feature/inception/contract-design/contract-summary.md > C00 Fact/HardwareView/SoftwareView; C20-E25/C20-E29; C07/C08 조회 계약 | FinancialSettlement에 제공 건별 후불 기산 자료를 전달할 계약이 불완전하다. E25/E29의 payload는 공통 Fact와 sourceOwner 제약뿐이며 실제 제공 건의 주문 품목·수량·완료일을 갖지 않는다. E25에서 참조만 있는 Fact는 유효하지만 completedQuantity/completedAt/orderLineRef를 추가하면 거절된다. G02/G08은 원본 역참조/최신 대조를 요구하지만 이 자료를 읽는 형식 조회 계약이 없다. C07/C08의 소비자에는 FinancialSettlement가 없고 HardwareView의 tranches에도 제공 건 ID/완료일이 없다. 따라서 FR8.4의 서로 다른 날 5개씩 제공한 건별 기한과 지연·정정 처리를 어느 경계에서 어떤 형태로 얻는지 구현자가 추측해야 한다. | E25/E29에 제공 건 ID·주문 품목·실제 수량·완료일·완료 기준/버전·정정 관계를 표현하는 구분된 payload를 정의하거나, 해당 참조로 이 자료와 최신 정정 상태를 읽는 소유자 조회 계약을 명시한다. FinancialSettlement의 호출 권한/소비 관계를 연결하고 서로 다른 날의 부분 제공·중복·늦은 완료/정정으로 기한을 대조한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-required-sections | PASS; H2 11개, findings 0 | 필수 구조 확인. |
| sensor-upstream-coverage | PASS; unreferenced 0 | 선언된 네 상위 산출물의 참조 확인. |
| 독립 YAML/JSON Schema/참조 검사 | PASS; YAML 44개, JSON Schema 문서 24개, 공통 정의 129개, 참조 2,492개 모두 해결 | 문법과 참조 경로는 유효하다. 대상/업무 자료의 의미 완전성은 보장하지 않는다. |
| openapi-spec-validator 0.9.0 | PASS; C16/C17 두 문서 | 공동 URN을 같은 스키마의 로컬 components로 해소한 메모리 복사본을 검사했다. |
| @asyncapi/parser | PASS; 18개 문서 생성, 오류/경고 0, 정보 18개 | 공동 스키마를 메모리에서 해소했다. 정보는 최신 버전 사용 권고이며 3.0.0 형식 실패가 아니다. |
| 독립 경계/추적 검사 | PASS; 포트 operation/Call 113개 일치, 계약 ID 44개 고유, DAG 43개·논리 관계 81개·US 69개 누락 없음 | 관계 목록과 형식 연결은 맞다. E25/E29의 실제 자료 전달 공백은 R-03으로 별도 확인했다. |
| JSON Schema 합성 대상/기준 검사 | 대상 없는 reviseProduct Call 허용; Call/data/context에 대상 추가 거절; ReadRequest의 requestId/Receipt Ref 거절; HW_SHIPMENT 허용·HW_DELIVERY 거절 | R-01/R-02의 입력 및 의미 불일치를 재현했다. |
| JSON Schema 합성 사실/공통 값 검사 | E25 참조 전용 Fact 허용·제공 수량/완료일/품목 추가 거절; 잘못된 소유자/entity Ref와 음수·숫자형·비KRW Money 거절 | R-03의 경계 공백 및 기존 기본 값 제약을 확인했다. |
| 로컬 링크/문자 검사 | PASS; 로컬 링크 11개 존재, NUL/U+FFFD 없음 | 문서 경로와 문자 손상 없음. |

### Summary

Critical 0건, Major 3건, Minor 0건으로 NOT-READY다. 소유권·권한·접수/완료 구분과 형식/추적은 정리돼 있지만 대상 전달과 제공 완료/후불 자료의 경계 계약은 승인 전에 판단할 보완 사항이다. 이번 단일 advisory 검토는 문서·합성 스키마만 확인했으며 실제 구현·외부 연동·정확성·SLO·국내 저장·복구 목표 달성을 확인한 것은 아니다.
