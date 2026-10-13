## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-13T07:26:40Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261004-feature/construction/u3-commercial-ordering/functional-design/entities.md:146 > Order attributes; functional-spec.md:83 > WF4 | Order는 enterpriseRef와 requesterAccountRef만 보존하고 부서·사업장·조직 문맥 정책·조직 개정을 보존하는 속성이나 관계가 없다. WF4의 조직 권한 확인만으로는 이후 조회·판단·대금·이행이 같은 보호 문맥을 사용할 수 없다. 공유 contract-summary.md:62의 G03은 과거 주문 문맥을 요청자의 현재 소속으로 추측하지 말도록 하며, 같은 파일:230–244의 TargetScope는 enterpriseRef/departmentRef/siteRef/contextPolicyRef/organisationRevision을 모두 필수로 규정한다. OrderInput.targetScope(:835,:850)와 OrderView.targetScope(:871,:896)도 필수다. 첫 배포 계획은 행위·조직 권한을 첫 배포 핵심으로 유지한다. | Order의 논리 모델에 기존 C00.TargetScope를 보존하는 필드를 명시하고, 제출 시 원본 기업·조직 및 정책을 검증하여 고정하는 순서와 이후 조회·수락·변경·후속 전달의 동일 문맥 사용을 정의한다. null의 허용 의미는 G03을 따르고 현재 요청자 소속으로 재구성하지 않는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261004-feature/construction/u3-commercial-ordering/functional-design/entities.md:178 > PurchaseTermsSnapshot.agreementRevisionRef and relationships:292; functional-spec.md:83 > WF4 | 최초 스냅샷은 공통 조건 개정들을 목록으로 보존하지만 기업 계약 개정은 단일 agreementRevisionRef와 명시적 many → 0..1 관계만 갖는다. 같은 HW 주문의 상품A와 상품B가 서로 다른 유효 기업 합의 개정을 사용하는 경우, 각 행·조건 항목과 모든 적용 개정을 고정할 명시적 모델이 없다. Q2(:33–38)는 서로 다른 상품·조건 항목 자체를 거절 사유로 삼지 않으며 BR3.2는 전체 입력행의 구매 당시 상품/계약 개정 보존을 요구한다. 공유 contract-summary.md:881–884의 OrderView.agreementRevisionRef도 단일 값이므로 공유 계약까지 같은 제한이 존재한다. 일반 Evidence/PurchasedTerms 참조에 추가 개정을 숨기는 방식과 그 해석은 정의되지 않았다. | 행·조건 항목별로 실제 적용한 기업 합의 개정을 모두 고정하는 논리 매핑과 관계를 정의한다. 스냅샷 및 C05.OrderView의 단일 참조 의미를 그 매핑과 일치시키거나 명시적 계약 수정 대상으로 연결한다. 서로 다른 상품의 합의를 최근 입력 하나로 축약하거나 다품목 주문을 근거 없이 제한하지 않는다. | Resolved (reviewer) |
| R-03 | Major | aidlc/spaces/default/intents/261004-feature/construction/u3-commercial-ordering/functional-design/entities.md:7 > logical types; :73, :88, :128, :175, :226, :241 > VersionedReference targets; functional-spec.md:174 > contract alignment | ProvisionTerms/RenewalTerms/RequestedCondition/ProposedCommercialTerms/CompletionBasis/AppliedTerms/OriginalReference의 7개 이름이 23회 참조되지만 엔티티·논리 타입 표 어디에도 정의되지 않는다. 또한 entities.md:12는 VersionedReference를 소유자·종류·식별자·개정을 가진 공통 TypedRef와 같다고 설명하지만 공유 contract-summary.md:109–225의 Ref는 owner별 entity enum을 닫고 있다. 예를 들어 ProductCatalog는 Product/CommonOfferRevision/CatalogHistory(:134–140), CommercialAgreement는 8개 소유 엔티티(:144–151), OrderAcceptance는 7개 소유 엔티티(:155–161)만 허용한다. PriceTerms, AppliedTerms, ProposedCommercialTerms 같은 값 객체 및 논리 외부 근거 이름을 직접 Ref.entity로 전송할 수 없으며 어느 허용 원본의 내용/하위 값으로 연결하는지 매핑이 없다. 독립 대조에서 이러한 직접 enum 대응이 없는 이름은 24개/53회다. 이는 값 객체를 별도 서비스로 만들라는 요구가 아니라 C03–C05에서 실제 참조·역참조 가능한 표현을 결정해야 하는 공백이다. | 7개 미정의 이름의 최소 논리 내용·소유·참조 의미를 정의한다. 모든 값 객체/논리 근거에 대해 인라인 보존 값인지, 기존 허용 원본의 정확한 개정 및 하위 내용인지 구분하고 C00.Ref·C03–C05 입출력과의 매핑을 명시한다. 새 원본 종류가 꼭 필요할 때만 공유 계약 변경으로 연결하며 구현 전 정합성 확인이라는 문장으로 결정을 미루지 않는다. | Resolved (reviewer) |
| R-04 | Major | aidlc/spaces/default/intents/261004-feature/construction/u3-commercial-ordering/functional-design/functional-spec.md:120 > WF7 steps 1, 5–7; entities.md:224 > OrderChangeApplication.afterSalesDecisionRef | WF7은 수락 전 주문의 직원 가격/총액 변경 제안과 고객 동의를 통한 U3 적용을 제공한다. 필요한 계약/후속 승인은 조건부이고 이미 ACCEPTED인 주문에만 후속 허용 판단을 특별히 요구하며, afterSalesDecisionRef도 optional이다. 그러나 공유 contract-summary.md:899–908의 ApplyOrderChangeInput은 afterSalesDecisionRef를 모든 호출에 필수로 요구하고 null 대안이 없다. C05.applyApprovedChange(:3515–3519)는 이 입력을 사용한다. REVIEW 주문의 동의된 가격 변경을 이 명령으로 실행하려면 어떤 U7 원본 판단을 받아야 하는지, 또는 어떤 기존 계약 경로를 사용할지 정의되지 않아 핵심 AC3.4.2/AC3.5.4의 실제 적용 경계를 구현자가 정해야 한다. | 수락 전 동의 가격 변경과 수락 후 고객 후속 변경 각각의 명령·허용 판단 조건을 정의한다. 기존 C05를 유지한다면 수락 전에도 요구되는 AfterSalesDecision 원본을 얻는 선행 호출과 검증을 명시한다. 수락 전 경로에 그 판단이 불필요한 설계라면 공유 ApplyOrderChangeInput의 조건부 입력/별도 경로를 명시적 계약 수정 대상으로 연결한다. 필수 Ref를 생략하거나 임의 판단 기록으로 채우지 않는다. | Resolved (reviewer) |

### 설계 정합성 판단

공개 예외와 판매 중지는 이미 다른 개념으로 설계되어 있다. `entities.md > Entity Model`은 Product.saleState와 CommonOfferRevision.publicVisibilityRuleRef, EnterpriseOfferException.visibilityTermsRef를 별도로 정의한다. `functional-spec.md > State Machines > Product`는 SUSPENDED를 판매 중지로 정의하고, `WF1` 5번과 `rules.md > BR1.3`은 공통 조건 위에 해당 기업의 유효 승인 예외를 합성하도록 명시한다. 이는 전달된 `inception/requirements-analysis/requirements.md > FR4.2` 및 `unit-of-work-story-map.md > US2.3`의 기업별 공개·가격 예외 요구와 일치한다. 공통 비공개를 판매 중지로 자동 치환하거나 기업 공개 예외를 제거하라는 규칙은 없다. 따라서 완전하고 유효한 판매 조건에서 공통 공개 기본값이 false라는 이유만으로 승인된 기업 공개 예외를 합성하기 전에 차단하는 구현은 이 설계에 맞지 않는다.

WF1–WF8, 29개 BR, 엔티티/상태를 대조했다. 다른 사람의 정확한 계약 개정 승인, 최초 구매 조건의 불변 보존, 모든 입력행·조건별 계약 개정의 합집합, 전체 직원 판단과 HOLD, 정확한 제안·동의·한 번의 적용, 수락 전/후 변경 분기는 서로 연결된다. 잘못된 입력·권한을 직원 검토로 우회하거나 미확인을 확정 금액/공급/지급으로 승격하는 설계는 발견하지 않았다.

공유 계약 C03/C04/C05와 원본 소유 경계를 확인했다. C00/C05 v2 변경 명세는 기존 v1을 보존하면서 다중 계약 개정과 두 changeKind의 의미를 별도로 정의한다. 값 객체를 허용되지 않은 Ref.entity로 보내지 않는 매핑이 있고, U7의 확인된 후속 판단을 U3가 역으로 실행 조정하지 않도록 WF7에 방향이 명시되어 있다. U4/U5/U6의 대금·공급·발급·실제 기간과 U3 수락/동의의 책임을 구분하며, 전달/조회 참조를 동기 재귀 또는 타 소유자 직접 변경 권한으로 취급하지 않는다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| Luna 읽기 전용 YAML 구조 검사 | entities/rules 각각 닫힌 YAML block 파싱 성공; 중복 키 없음; 필수 root/record 필드 충족; 고유 엔티티 18개·관계 16개·고유 BR 29개 | 단계의 데이터/규칙 원본 구조를 만족한다. |
| Luna 관계 참조 검사 | 내부 참조 해소; 외부 SoftwareLifecycle.RenewalCycle은 전달된 inception/domain-design/components.md에서 확인; 미해소 0 | 외부 소유 엔티티를 U3 내부 목록만으로 판단했던 최초 오탐을 제외했다. |
| Luna traceability 검사 | upstream/coverage 고유 AC 42개 일치; OK 35·Deferred 7; 모든 Deferred 사유 존재 | 문서에 보존된 첫 배포 범위와 후속 구분이 일치한다. |
| Luna BR 연결 재검사 | 복수 BR target을 개별 ID로 파싱하여 참조된 28개 모두 존재; 나머지 BR3.4는 reverse의 명시 N/A 사유로 설명; 미해소 target/고아 규칙 0 | target을 단일 문자열로 비교했던 최초 실패는 단계가 허용하는 복수 ID를 처리하지 않은 검사 오탐이었다. |
| 산출물·상위 범위 수동 교차 검토 | 네 produces 및 Q&A 존재/비어 있지 않음; YAML·워크플로·상태·규칙·추적 절 존재; 할당 12개 US와 AC의 story 접두어 일치 | 전달된 Unit/스토리 할당, 요구사항, 컴포넌트, 공유 계약으로 의미를 교차 확인했다. |
| 단계 linter/type-check 적용성 | TypeScript/JavaScript 실행 코드 또는 해당 언어 fenced snippet 없음 | 이 설계 단계의 코드형 센서 대상이 없어 제품 type/lint 실행으로 대체하지 않았다. |
| Luna 문서 Prettier --check | 고정 Node 22.23.3 실행 exit 1, 지정 설계 문서와 Q&A에 형식 경고 | 단계의 논리/YAML/참조 오류와 구별한다. 전달된 단계 정의는 이 문서들의 Prettier 정합성을 필수 수락 기준으로 지정하지 않았으므로 비차단 스타일 관측이며 문서를 수정하지 않았다. |
| 검토 전후 SHA-256 | 네 produces 모두 동일 | 검토 대상 bytes를 변경하지 않고 지정 review 파일만 작성했다. |

### Summary

Critical 0, Major 0, Minor 0으로 기능 설계는 구현을 이어갈 수 있다. 이 판정은 기존 Code Generation의 공개 예외 구현 결함을 해소하지 않으며, 기존 U2 신뢰 검증 미해결·실제 원본 미등록·운영 배포 보류도 그대로 유지한다.
