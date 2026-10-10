# OMS 논리 설계·결정 기록

## 적용 범위와 근거

다음12개 ADR은 components.md의 논리 책임·원본 소유·연결·의도적 순환과 가역성을 설명한다. Q1–Q7의 답변/제안은 별도 통합 요약 Looks correct로 확인됐다. 각 기록의 Proposed 상태는 본 단계의 상세 설계 문서 선택이며 구현/실증 승인 또는 실제 운영 적합성을 뜻하지 않는다. AWS/CDK 외 기술/배포·상세 스키마와 기존 OQ를 임의 확정하지 않는다. [S1–S5]

| ADR | 결정 |
| --- | --- |
| ADR-001 | 업무별 논리 책임 분해 |
| ADR-002 | 인증·복구와 기업 업무 접근 분리 |
| ADR-003 | 대금 책임에 환불 실제 결과 포함 |
| ADR-004 | SW 권한·실제 기간·갱신 회차의 단일 소유 |
| ADR-005 | 업무 결과에 반응하는 분산 연결 |
| ADR-006 | 외부 교환은 해당 업무 소유 |
| ADR-007 | 고객·직원 UI의 논리 책임 분리 |
| ADR-008 | 원본 소유·스냅샷·연동 근거와 정정 구별 |
| ADR-009 | 기업별 예외의 계약 원본 소유 |
| ADR-010 | 진행·이력 조합 조회와 전달 기록 분리 |
| ADR-011 | 확인된 사실의 의도적 왕복과 비재귀 호출 |
| ADR-012 | 기술 운영 스토리의 논리 검증 코드와 인프라 구별 |

## ADR-001: 업무별 논리 책임 분해

**Status:** Proposed

**Date:** 2026-10-06

### Context

주문 접수·수락, 계약 합의, 금액, HW 수량, SW 기간, 후속 판단은 서로 다른 규칙과 원본을 갖는다. 개발자1명은 기능 축소 제약이 아니다.

### Decision

ProductCatalog·CommercialAgreement·OrderAcceptance·FinancialSettlement·HardwareFulfillment·SoftwareLifecycle·AfterSalesDecision을 구별한다. Q1은 최초 명시 응답이 없어 제안으로 두었다가 별도 통합 요약 Looks correct에서 함께 확인했다.

### Consequences

다른 규칙을 독립 검토하고 단일 소유자를 찾기 쉽다. 컴포넌트 간 결과·권한·버전 연결 비용은 늘며 적합성/1인 부담은 아직 검증 전이다. 논리 컴포넌트 수는 배포 단위 수가 아니다.

### Alternatives Rejected

- 주문 접수와 후속 판단, HW/SW 제공을 각각 합치는 Q1 B: 연결 수는 줄지만 다른 규칙과 원본의 책임이 섞인다. 변경 비용을 비교한 뒤 필요하면 명시적으로 재구성할 수 있다.
- 모든 거래 규칙을 단일 업무 컴포넌트로 두기: 처음 호출 경계는 적지만 금액/수량/기간·승인의 소유권을 검토하기 어려워 채택하지 않는다.

### Security and Compliance

기업·행위별 권한을 책임 분해 때문에 완화하지 않는다. 외부 판매자 등록·범위 밖 업무를 추가하지 않는다.

### Operations and Reversibility

미확인·부분 결과와 남은 조치의 원본/담당을 각 업무에서 추적해야 한다. 배포/온콜 인력을 추가 확보한 것으로 보지 않는다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

Q1·요약 확인; requirements FR4–FR13; stories US2–US8; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-002: 인증·복구와 기업 업무 접근 분리

**Status:** Proposed

**Date:** 2026-10-06

### Context

MFA/신원 확인은 기업 이용 승인·소속·역할·범위와 다르며 복구로 업무 권한이 증가해서는 안 된다.

### Decision

IdentityRecovery는 신원·MFA·복구 원본을, EnterpriseAccess는 기업·조직·역할과 행위 범위를 소유한다. 서버측 접근 판단이 검증된 신원을 확인한다. 직원 대행 복구는 EnterpriseAccess에서 확인한 권한 근거를 IdentityRecovery에 전달한다.

### Consequences

인증 제공자 변화와 업무 역할 변화의 영향을 나눈다. 신원/계정 상태와 업무 권한의 효력·복구 증거를 함께 연결할 비용이 생긴다. 실제 세션/동일인/망·PC 방법은 OQ4다.

### Alternatives Rejected

- Q2 B 하나의 접근 관리 책임: 한곳 관리 장점이 있으나 인증 수단과 조직/권한 변경 결합이 커져 선택하지 않았다.
- 신원 제공자 역할만으로 업무 권한을 결정: 별도 조직 관리 코드는 줄지만 기업 승인·행위별 범위·다른 계약 승인자를 충분히 표현하지 못하므로 배제한다.

### Security and Compliance

모든 사용자 MFA, 고객 기업 경계, 직원 망/PC 조건, 복구 후 이전 수단 무효화·이력/통지를 유지한다. UI의 권한 주장을 신뢰하지 않는다.

### Operations and Reversibility

관리자0 허용/경고와 직원 근거 재지정, 타인 권한 유지, 계정 복구 실패/미확인 경로를 각각 검증한다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

Q2; requirements FR1–FR3·FR16·NFR1; stories US1; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-003: 대금 책임에 환불 실제 결과 포함

**Status:** Proposed

**Date:** 2026-10-06

### Context

기지급·배분·환불의 금액 보존과 정정은 같은 확인 금액에 의존한다. 환불 허용 판단과 실제 자금 결과는 다르다.

### Decision

FinancialSettlement가 청구·지급·배분·환불 대상/잔액·실제 결과/정정을 소유한다. AfterSalesDecision은 요청·허용/보류·합의 한도를 전달한다.

### Consequences

금액 중복/초과와 정정 근거를 한 책임에서 대조한다. 대금 책임의 업무 폭이 커지므로 계약 산식과 환불 실행 주체를 명시적으로 구분해야 한다.

### Alternatives Rejected

- Q3 B 별도 환불 실행/결과 책임: 독립 변경은 쉽지만 잔액·한도 대조와 연계 실패가 늘어 선택하지 않았다.
- AfterSalesDecision이 환불 금액/실제 결과까지 직접 변경: 판단 화면 연결은 짧지만 금액 원본이 둘로 나뉘어 중복·초과와 정정 검증이 어려워 배제한다.

### Security and Compliance

지급/환불 조회·실행 근거의 행위 권한을 각각 적용한다. 대금 민감 데이터는 주문 조회 권한만으로 노출하지 않는다.

### Operations and Reversibility

전송·승인만으로 자금 완료를 표시하지 않는다. 직원/외부 근거 충돌은 대금 소유자에서 대조하고 관련 추가 환불/이행만 보류한다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

Q3; requirements FR8·FR13.4·FR15; stories US4·US8.6; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-004: SW 권한·실제 기간·갱신 회차의 단일 소유

**Status:** Proposed

**Date:** 2026-10-06

### Context

조기 이용·보상 연장·계약 갱신 일정·유예·수동/자동 갱신이 동일 기업 권한의 실제 기간에 영향을 준다.

### Decision

SoftwareLifecycle이 발급·실제 기간·기간 조정·갱신 회차/실제 적용·회수를 소유한다. CommercialAgreement의 계약 우선/유효 동의를 적용하고 FinancialSettlement가 청구·지급·중첩 요금 조정을 소유한다.

### Consequences

같은 권한의 이중 연장·늦은 만료·보상 기간 누락을 함께 판단한다. 갱신 규칙이 복잡해져 기능 설계에서 전이·시간 경계·동시 처리 시험을 분명히 해야 한다.

### Alternatives Rejected

- Q4 B 별도 갱신 컴포넌트: 갱신 독립 변경은 쉽지만 회차·보상/유예·실제 기간 대조 연결이 늘어 선택하지 않았다.
- 계약 컴포넌트가 실제 기간도 소유: 계약 조회는 단순해지지만 구매 당시 조건과 실제 적용의 원본/승인 경계가 섞여 배제한다.

### Security and Compliance

기간 조정 요청/별도 승인 권한을 모두 확인하며 동일인 별도 승인 허용을 계약 자기 승인 금지와 혼동하지 않는다. 개별 사용자/장치 단속은 추가하지 않는다.

### Operations and Reversibility

수동 갱신도 요청으로 끝내지 않고 동일 회차의 지급/유예 조건·실제 기간 적용·고객 결과까지 연결한다. 영구권은 기간 갱신 대상으로 자동 넣지 않는다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

Q4; requirements FR10–FR12; stories US6·US7; refined-mockups interaction-spec; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-005: 업무 결과에 반응하는 분산 연결

**Status:** Proposed

**Date:** 2026-10-06

### Context

수락·지급·이행·후속 처리는 서로 의존하지만 사용자는 중앙 흐름 조정 책임을 두지 않는 Q5 B를 선택했다.

### Decision

각 업무 소유자가 확인된 입력 사실에 반응해 자기 판단/실행을 연결한다. 전체 흐름을 지휘하는 별도 조정 컴포넌트는 두지 않는다. WorkInquiry는 원본을 조회하여 진행/남은 조치를 합성하며 명령을 지휘하지 않는다.

### Consequences

각 업무 원본에 규칙/실행을 모은다. 전체 누락·미확인·정정의 연계를 각 소유자가 책임져야 하고 부분 결과/소비 지연의 추적 비용이 생긴다. event는 논리적인 결과 통지이며 브로커/저장/서비스 배포를 결정하지 않는다.

### Alternatives Rejected

- Q5 A 중앙 조정 책임: 전체 흐름 추적은 쉽지만 사용자 선택과 달라 채택하지 않는다.
- UI가 다음 업무를 차례로 호출: 별도 연결 코드가 적으나 브라우저 종료·권한 변경·응답 유실로 업무 누락이나 우회가 생겨 배제한다.

### Security and Compliance

시스템의 후속 행동도 원래 승인·기업·행위 범위를 보존하고 소유자가 현 조건을 재검증한다. 결과 수신만으로 필요한 고객 동의/별도 승인을 생략하지 않는다.

### Operations and Reversibility

요청 참조·원본 사실/버전·소비/대조·실제 결과·남은 조치를 각 소유자의 지속 기록에 연결한다. 장애 시 재전송/대조와 운영 조회가 가능해야 한다. 정확한 보존/재전송/동시 제어는 후속 설계에서 확정한다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

Q5 B; requirements FR14–FR15·NFR4–NFR5·NFR9; stories US8.7–US8.12·US9.2; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-006: 외부 교환은 해당 업무 소유

**Status:** Proposed

**Date:** 2026-10-06

### Context

지급·배송·발급의 의미와 완료/충돌 기준은 다르며 실제 제공자·제품·프로토콜은 미정이다. 별도 사내 시스템도 OMS 밖의 주체일 수 있다.

### Decision

FinancialExchange·HardwareExchange·SoftwareExchange 및 각각의 대조 케이스를 해당 업무 소유자에 둔다. 공통 통신/검증 코드는 재사용하되 공통 연동 컴포넌트에 모든 교환 기록을 옮기지 않는다.

### Consequences

교환과 정규화된 실제 결과를 같은 업무에서 대조한다. 공통 출처/참조·안전한 재처리 기록 형식은 맞춰야 하며 동일 결과의 중복 수신도 업무별로 검증한다.

### Alternatives Rejected

- Q6 B 공통 교환 소유자: 전체 교환 이력을 모으기 쉽지만 해당 업무 사실과 연결/대조 경계가 늘어 선택하지 않았다.
- 외부 제공자 마지막 값으로 OMS 원본을 덮어쓰기: 동기화는 짧지만 직원 근거·정정·역순/상충 결과를 잃고 실제 권위가 불명확해 배제한다.

### Security and Compliance

발신/출처·대상·참조의 신뢰를 확인하고 실제 접근권·민감 데이터 경로/국내 저장을 검증한다. 제공자 미확인을 적합 판정으로 바꾸지 않는다.

### Operations and Reversibility

확정 실패와 성공 여부 미확인을 구분한다. 먼저 원래 결과/현재 조건을 대조하고 성공 수량/금액을 제외한 허용된 재처리만 수행한다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

Q6·외부 연동 설명; requirements FR8.1·FR9.1·FR15·OQ3; stories US4.2·US5.2·US5.7·US6.6; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-007: 고객·직원 UI의 논리 책임 분리

**Status:** Proposed

**Date:** 2026-10-06

### Context

고객 구매/조직 관리와 직원 운영/승인은 흐름·밀도·접속 조건이 다르다.

### Decision

CustomerUi와 StaffUi의 논리 코드 책임을 구분한다. 공통 시각 토큰·기초 조작은 재사용하고 각 업무/신원/접근 소유자에게 조회·행동을 연결한다.

### Consequences

화면별 권한/행동을 독립 검토하기 쉽다. 공유 조작의 일관성을 관리해야 한다. 이 선택은 프론트엔드 프레임워크·저장소·별도 배포를 정하지 않는다.

### Alternatives Rejected

- Q7 B 하나의 UI 컴포넌트: 재사용은 쉽지만 고객/직원 전용 흐름의 경계 검사가 늘어 선택하지 않았다.
- 고객/직원별 규칙과 저장을 UI 안에 복제: 표시와 입력은 가까워지지만 서버측 권한/금액/기간 원본과 달라질 수 있어 배제한다.

### Security and Compliance

직원 사내망/승인 원격 PC·MFA는 서버/접속 경로에서 검증한다. 폭1280을 직원 PC 보안 근거로 사용하지 않는다. 숨김 표시만으로 접근 차단을 대체하지 않는다.

### Operations and Reversibility

고객·직원 PC1280 이상, 고객 모바일 유보·직원 모바일 제외, 최신 지원 브라우저/키보드·WCAG2.2AA 목표를 유지하며 실제 검증/인증 달성을 주장하지 않는다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

Q7; refined-mockups Q5·mockups·interaction-spec·design-system-mapping; requirements FR14·NFR1·NFR12 최신 해석; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-008: 원본 소유·스냅샷·연동 근거와 정정 구별

**Status:** Proposed

**Date:** 2026-10-06

### Context

계약 변경/현재 상품 가격과 구매 당시 조건, 요청/승인과 실제 결과, 복구 접수와 실제 거래 효과를 구별해야 한다.

### Decision

모든 엔티티는 한 컴포넌트가 소유한다. 주문 구매 당시 조건은 OrderAcceptance, 승인 계약/예외는 CommercialAgreement, 실제 금액/수량/기간은 각각 대금/HW/SW에 둔다. 타 책임은 원본 ID/근거 버전으로 참조하며 복제는 읽기 표현이다. 소유자별 주요 변화는 원본 연결 이력으로 보존하고 정정은 새 근거와 이전 기록을 연결한다.

### Consequences

쓰기 권위와 변경 영향이 분명해진다. 스냅샷/사실 참조의 유효성·저장 성공·대조가 추가로 필요하다. 스키마는 식별자/속성 이름/교차 참조까지만 정하며 타입/허용 값/관계 수는 후속 단계다.

### Alternatives Rejected

- 모든 컴포넌트가 공유 원본을 직접 변경: 초기 연결은 짧지만 이중 쓰기와 불변조건 소유가 흐려져 배제한다.
- 모든 과거 조회에 현재 계약/가격만 재계산: 복제량은 적지만 구매 당시 조건/합의와 보상 전후를 잃어 배제한다.

### Security and Compliance

조회/이력/복제에도 원본과 같은 기업·행위별 민감 정보 범위를 적용한다. 성공 접수/주요 변화에 필요한 보존 근거 없이 성공 응답을 표시하지 않는다.

### Operations and Reversibility

접수 결과 재확인·같은 요청 재시도·새로운 정당 요청·동시 잔액/수량 소비·역순 정정의 보존 조건을 Contract/Functional/NFR 단계에서 실증 가능하게 구체화한다. 특정 트랜잭션/저장 패턴은 선택하지 않는다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

requirements FR4.3·FR10.2·FR15·NFR4–NFR5; stories US3.5·US7.8·US9.2·US9.4; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-009: 기업별 예외의 계약 원본 소유

**Status:** Proposed

**Date:** 2026-10-06

### Context

공통 상품 공개/가격과 기업별 합의 예외가 동시에 존재한다. 예외를 두 책임이 수정하면 계약 승인과 현재 판매 조건이 어긋난다.

### Decision

ProductCatalog는 공통 조건만 소유하고 EnterpriseOfferException은 CommercialAgreement의 승인된 AgreementRevision과 연결한다. 유효 조회/주문 판단은 두 원본을 합성하고 PurchaseTermsSnapshot에 해당 근거를 보존한다.

### Consequences

기업 합의의 등록·승인·버전 근거를 한 책임에서 추적한다. 단순 상품 조회도 기업 예외/권한 합성이 필요하다. 공통 공개/가격의 구체 필드/산식은 OQ1이다.

### Alternatives Rejected

- 예외를 ProductCatalog에서 단독 소유: 상품 관리와 가깝지만 기업 계약 승인 근거의 연결/원본 구별이 늘어 채택하지 않는다.
- 계약과 상품에 예외를 각각 쓰고 맞추기: 각 화면 조회는 쉽지만 이중 권위/지연 충돌을 만들므로 배제한다.

### Security and Compliance

권한 없는 고객에게 공통 공개를 이유로 계약상 숨김 상품/가격을 노출하지 않는다. 예외 승인 근거·유효 범위를 원본에서 확인한다.

### Operations and Reversibility

공통 가격 변경은 기존 주문에 소급하지 않는다. 제안 대상/버전과 동의 결과를 확인한 새 거래 적용은 OrderAcceptance/SoftwareLifecycle 각 소유자가 수행한다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

Q1; requirements FR4·FR7; stories US2.2–US2.7·US3.5·US7.5; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-010: 진행·이력 조합 조회와 전달 기록 분리

**Status:** Proposed

**Date:** 2026-10-06

### Context

각 업무가 다음 업무를 연결해도 사용자에게 전체·품목/수량별 진행과 남은 조치·원본 근거를 설명해야 한다. 알림 발송은 업무 완료가 아니다.

### Decision

WorkInquiry는 소유자별 조회를 합성하고 원본 이력의 출처/시점/정정 관계를 제공한다. 별도 거래 상태나 중앙 흐름 원본을 만들지 않는다. NotificationDelivery만 통지 의도/전달 결과를 소유한다. 화면 임시 입력은 지속 도메인 엔티티로 분류하지 않는다.

### Consequences

원본에 따른 부분 진행/이력을 일관되게 보여준다. 조회 실패·출처별 시간 차이를 공개해야 하고 큰 조회의 성능/필터는 후속 설계가 필요하다. 알림은 각 업무 원본과 별도 실패/미확인일 수 있다.

### Alternatives Rejected

- 진행/이력을 각 UI에서 별도 합성: 코드 분리는 적지만 권한 필터·누락 판단이 달라져 채택하지 않는다.
- 조회 원본이 금액/수량/기간/보류 상태를 새 권위로 관리: 화면 반응은 쉽지만 Q5와 단일 소유권을 위반하므로 배제한다.

### Security and Compliance

주문 조회만 가진 사용자에게 지급/발급 사실을 목록·요약·알림·이력으로 누출하지 않는다. 이메일은 최소 안내/로그인 링크이고 발급 키·계약 상세를 제외한다.

### Operations and Reversibility

원본 결과 미확인·조회 실패·소비 지연을 구별하고 숨김을 0원/미지급/실패로 표현하지 않는다. 운영 알림은 장애 중 전달 가능 경로를 후속 설계에서 검증한다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

requirements FR14–FR15; stories US8.8–US8.9·US8.12·US9.4; refined-mockups 권한 정보 투영; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-011: 확인된 사실의 의도적 왕복과 비재귀 호출

**Status:** Proposed

**Date:** 2026-10-06

### Context

지급 조건이 HW/SW 이행을 바꾸고 실제 제공 완료가 후불/갱신 청구 근거를 바꾼다. 복구 통지는 등록된 신원 연락 경로를 조회한다. Q5 분산 연결을 완전한 무순환 그림으로만 그리면 이 관계를 숨기게 된다.

### Decision

전체 컴포넌트 그래프의 두 의도적 순환 묶음을 명시한다: FinancialSettlement↔HardwareFulfillment/SoftwareLifecycle, IdentityRecovery·EnterpriseAccess·NotificationDelivery. 동기 호출 부분 그래프는 무순환이다. 사실 통지(event) 경로가 같은 동기 호출 스택에서 소비자를 재진입시키지 않도록 하고 조회는 부작용 없이 끝낸다. 논리 통지의 실제 저장/전달 수단은 후속 설계다.

### Consequences

필요한 업무 왕복과 소비 책임이 드러난다. 사실 종류·연관 대상·원본 버전·요청/소비 기록을 명시하지 않으면 반복 효과/교착 위험이 있다. 단순 패키지 위상 정렬만으로 전체 의존을 구현할 수 없으므로 포트/의존 역전·실행 경계를 후속 Contract/Units 설계에서 구체화한다.

### Alternatives Rejected

- 중앙 흐름 조정자로 순환을 흡수: 추적은 쉬워지나 Q5 B 선택과 달라 채택하지 않는다.
- 브로커/공유 저장 뒤에 관계를 숨겨 그래프를 무순환으로 주장: 실제 소비 결합과 대조 책임을 빠뜨리므로 배제한다.

### Security and Compliance

같은 사실 재수신은 기존 소비/결과를 대조하고 새로운 승인/다른 업무 요청을 만들지 않는다. 오래된 근거가 최신 기간/금액을 덮어쓰지 않으며 권한/계약이 변하면 실행 소유자가 재검증한다.

### Operations and Reversibility

사실을 받은 것만으로 후속 효과를 성공 처리하지 않는다. 목적이 다른 새 사실만 발행하고 한 사실의 중복 소비/효과를 막으며, 미확인 대조/실패 재처리를 별도 허용 행동으로 기록한다. 전달 누락과 장애 복구의 성공 접수 보존은 반드시 검증한다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

Q5 B·Q6 A; requirements FR15·NFR4–NFR5; components.md 의존/사실 연결; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## ADR-012: 기술 운영 스토리의 논리 검증 코드와 인프라 구별

**Status:** Proposed

**Date:** 2026-10-06

### Context

US9.1–US9.7은 알림·복구/접수 대조·계획 점검·국내 저장·가용성·사람 작업의 실제 증거를 요구한다. Domain Design은 인프라를 컴포넌트로 만들지 않는다.

### Decision

OperationalAssurance를 진단/대조·증거 수집/평가의 코드 책임으로 둔다. 실제 관측·배포·복구·저장은 미선정 외부 의존이고 AWS/CDK 제약을 유지한다. 기존 O01 기술 운영 증거 접점에 연결하며 새 OMS 운영 대시보드를 추가하지 않는다.

### Consequences

US9의 검증 책임과 도메인 데이터 대조 경계가 드러난다. 실제 운영 도구로 충분한 부분과 직접 작성할 어댑터/검증 코드의 최소 범위는 후속 설계에서 정한다. 논리 매핑 OK는 SLO/복구/국내 저장 달성이나 운영 준비가 아니다.

### Alternatives Rejected

- AWS 서비스/DB/백업을 자체 도메인 컴포넌트로 선언: 경계가 빠르게 보이지만 이 단계의 코드/배포 구별과 미선정 제약을 위반해 배제한다.
- 기술 운영을 전부 문서로만 두고 코드 대조 접점 생략: 인프라 선택은 늦출 수 있지만 성공 접수/업무별 정확성의 진단 책임을 놓쳐 채택하지 않는다.

### Security and Compliance

운영 근거 조회도 별도 허용 범위에서 최소 데이터를 사용한다. 실제 고객 내용이 있는 로그/백업/외부 제공자 경로의 한국 저장 근거를 확인하며 운영 역할을 모든 판매 업무 권한으로 자동 확대하지 않는다.

### Operations and Reversibility

복구 시도 시작 알림과 실패 긴급 알림은 OMS 장애 중에도 전달 가능해야 한다. 공통 NotificationDelivery 재사용만으로 장애 독립성을 충족한 것으로 보지 않는다. 30일 가용성·장애 RTO/RPO·정상일/배포/사고 사람 작업은 각각 실측한다. 논리 책임은 후속 검증 근거와 사용자의 변경 결정에 따라 재구성할 수 있다. 소유권 이전은 기존 원본/이력·참조/권한의 연속성을 검증한 후 수행하며 조용히 이중 쓰기를 추가하지 않는다.

### References

requirements NFR2–NFR11·NFR13–NFR14; stories US9; team-practices; refined-mockups O01; [컴포넌트 원본](components.md), [질문·요약 확인](domain-design-questions.md).

## Assumptions & Open Questions

- A-DD1 [assumption]: 이 논리 분해와 데이터 형태가 실제 업무 변경 및 1인 개발·기술 운영에 적합하다. 인터페이스 수·결합·구현/운영 부담은 후속 구현·측정으로 검증한다. 범위 축소의 근거로 쓰지 않는다.
- A-DD2 [assumption]: 각 업무의 확인된 사실·소비/대조·실제 결과를 지속 기록으로 연결하여 중앙 조정자 없이 누락·중복·역순과 장애 복구를 관리할 수 있다. 저장/전달/동시 제어 방법·실증은 미완료다. sync/event는 논리 호출/통지 구분이며 네트워크·브로커·서비스 선택이 아니다.
- A-DD3 [assumption]: OperationalAssurance의 필요한 어댑터/대조 코드를 선정할 운영 도구와 조합할 수 있다. 자작 관측/배포/복구 제품 전체나 OMS 운영 대시보드를 추가한다는 뜻이 아니다. 장애 중 독립 알림·국내 저장·복구 시간·RPO와 운영 부담은 증거가 필요하다.
- OQ1·OQ2: 금액/기간·달력/반올림 산식, 계약 필수 값·유효성, 세부 전이·한도·보류/정지·동시 변경. 소유 컴포넌트의 Contract/Functional Design 확정·구현 전에 업무 근거와 시험을 확보한다. 기본값을 지어내지 않는다.
- OQ3: 실제 재고/예약 권위·최신성, 확보/출고/배송/인수/지급/환불 실행 주체·접근권, SW 수량 단위·발급/전달/적용·회수 증거. 관련 Contract/Functional Design 확정 및 실거래 전에 검증한다. 외부 의존 이름은 후보 제품 선정이 아니다.
- OQ4: 실제 계정/동일인·기업/첫 관리자·직원 복구 확인, 권한/세션 효력, 직원 망/PC 판단과 세부 직원 권한. IdentityRecovery·EnterpriseAccess 및 관련 승인 소유자가 실제 접근 설계/구현 전 근거를 확보한다.
- OQ5·OQ6: 보관/삭제·로그/백업·제공자 한국 저장, 장애·재난 제외 경계·논리 오염/오삭제·야간 지원·업무별 측정과 RTO/RPO 동시 달성. NFR/Infrastructure/운영 설계 및 실제 데이터·상용 약속 전에 실증한다. 오삭제를 임의 제외하지 않는다.
- OQ7: 이메일·메신저·수신자·지연/실패·재알림·실제 수신과 장애 중 대체 경로. NotificationDelivery와 운영 담당 역할이 Functional/Observability 및 통지 시험 전에 확정한다.
- OQ8·OQ9: 상세 검색/필터/입력 상한·성능/비동기 완료 측정·부하 구성, 검사 도구/차단선·실행 방법·포매터/린터·배포/복구 방법. 해당 후속 단계에서 확인한다. 최신 PC/브라우저/접근성 선택은 S5가 이미 보완한 부분이므로 재질문하지 않는다.
- OQ10·HB-01–HB-08: 실제 고객·사업 근거·비용·업무량·연동/실데이터/운영 증거와 실제 계약 등록자 외 승인자 확보. 개발자1명을 전체 사업 역할의 인원으로 간주하지 않는다. 소유권 설계는 이 조건 해소의 증거가 아니다.

## Sources

- S1: [requirements](../requirements-analysis/requirements.md) — FR1–FR16·NFR1–NFR14, 제외 범위, A1–A3·OQ1–OQ10. 수치/업무 정책의 원본이며 최신 화면 결정이 과거 모바일 문구만 대체한다.
- S2: [stories](../user-stories/stories.md) — 69 US·227 AC·8개 업무 관점, 요청/실제 결과·중복/동시/역순·권한·운영 검증 기준.
- S3: [team-practices](../practices-discovery/team-practices.md) — AWS/CDK 외 기술 유보, 1인 구조 목표·전체 범위 유지, test-after/Standard/80%·필수 보안/배포 확인.
- S4: [이번 책임 경계 질문과 별도 요약 확인](domain-design-questions.md) — Q1의 제안을 포함한 Looks correct 확인, Q2 A·Q3 A·Q4 A·Q5 B·Q6 A·Q7 A. Q1의 최초 명시 답변이 없었던 기록은 보존한다.
- S5: [최신 화면 질문](../refined-mockups/refined-mockups-questions.md), [mockups](../refined-mockups/mockups.md), [interaction-spec](../refined-mockups/interaction-spec.md), [design-system-mapping](../refined-mockups/design-system-mapping.md) — PC1280 이상·고객 모바일 미정·직원 모바일 제외, 권한 정보 투영·버전별 새 동의·조직/행위별 범위, O01 외부 기술 운영 증거 접점.

이 문서는 일반 OMS 기능 목록이나 외부 제품의 기능을 새 요구로 가져오지 않는다. 책임/엔티티 명칭과 코드 연결은 S1–S5를 실현하기 위한 설계 제안이다. 배포/스택/실제 제공자·수요·SLO 달성 사실은 여기서 확정하지 않는다.
