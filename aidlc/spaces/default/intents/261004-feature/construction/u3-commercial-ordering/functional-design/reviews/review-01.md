## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-11T08:05:23Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261004-feature/construction/u3-commercial-ordering/functional-design/entities.md:146 > Order attributes; functional-spec.md:83 > WF4 | Order는 enterpriseRef와 requesterAccountRef만 보존하고 부서·사업장·조직 문맥 정책·조직 개정을 보존하는 속성이나 관계가 없다. WF4의 조직 권한 확인만으로는 이후 조회·판단·대금·이행이 같은 보호 문맥을 사용할 수 없다. 공유 contract-summary.md:62의 G03은 과거 주문 문맥을 요청자의 현재 소속으로 추측하지 말도록 하며, 같은 파일:230–244의 TargetScope는 enterpriseRef/departmentRef/siteRef/contextPolicyRef/organisationRevision을 모두 필수로 규정한다. OrderInput.targetScope(:835,:850)와 OrderView.targetScope(:871,:896)도 필수다. 첫 배포 계획은 행위·조직 권한을 첫 배포 핵심으로 유지한다. | Order의 논리 모델에 기존 C00.TargetScope를 보존하는 필드를 명시하고, 제출 시 원본 기업·조직 및 정책을 검증하여 고정하는 순서와 이후 조회·수락·변경·후속 전달의 동일 문맥 사용을 정의한다. null의 허용 의미는 G03을 따르고 현재 요청자 소속으로 재구성하지 않는다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261004-feature/construction/u3-commercial-ordering/functional-design/entities.md:178 > PurchaseTermsSnapshot.agreementRevisionRef and relationships:292; functional-spec.md:83 > WF4 | 최초 스냅샷은 공통 조건 개정들을 목록으로 보존하지만 기업 계약 개정은 단일 agreementRevisionRef와 명시적 many → 0..1 관계만 갖는다. 같은 HW 주문의 상품A와 상품B가 서로 다른 유효 기업 합의 개정을 사용하는 경우, 각 행·조건 항목과 모든 적용 개정을 고정할 명시적 모델이 없다. Q2(:33–38)는 서로 다른 상품·조건 항목 자체를 거절 사유로 삼지 않으며 BR3.2는 전체 입력행의 구매 당시 상품/계약 개정 보존을 요구한다. 공유 contract-summary.md:881–884의 OrderView.agreementRevisionRef도 단일 값이므로 공유 계약까지 같은 제한이 존재한다. 일반 Evidence/PurchasedTerms 참조에 추가 개정을 숨기는 방식과 그 해석은 정의되지 않았다. | 행·조건 항목별로 실제 적용한 기업 합의 개정을 모두 고정하는 논리 매핑과 관계를 정의한다. 스냅샷 및 C05.OrderView의 단일 참조 의미를 그 매핑과 일치시키거나 명시적 계약 수정 대상으로 연결한다. 서로 다른 상품의 합의를 최근 입력 하나로 축약하거나 다품목 주문을 근거 없이 제한하지 않는다. | New |
| R-03 | Major | aidlc/spaces/default/intents/261004-feature/construction/u3-commercial-ordering/functional-design/entities.md:7 > logical types; :73, :88, :128, :175, :226, :241 > VersionedReference targets; functional-spec.md:174 > contract alignment | ProvisionTerms/RenewalTerms/RequestedCondition/ProposedCommercialTerms/CompletionBasis/AppliedTerms/OriginalReference의 7개 이름이 23회 참조되지만 엔티티·논리 타입 표 어디에도 정의되지 않는다. 또한 entities.md:12는 VersionedReference를 소유자·종류·식별자·개정을 가진 공통 TypedRef와 같다고 설명하지만 공유 contract-summary.md:109–225의 Ref는 owner별 entity enum을 닫고 있다. 예를 들어 ProductCatalog는 Product/CommonOfferRevision/CatalogHistory(:134–140), CommercialAgreement는 8개 소유 엔티티(:144–151), OrderAcceptance는 7개 소유 엔티티(:155–161)만 허용한다. PriceTerms, AppliedTerms, ProposedCommercialTerms 같은 값 객체 및 논리 외부 근거 이름을 직접 Ref.entity로 전송할 수 없으며 어느 허용 원본의 내용/하위 값으로 연결하는지 매핑이 없다. 독립 대조에서 이러한 직접 enum 대응이 없는 이름은 24개/53회다. 이는 값 객체를 별도 서비스로 만들라는 요구가 아니라 C03–C05에서 실제 참조·역참조 가능한 표현을 결정해야 하는 공백이다. | 7개 미정의 이름의 최소 논리 내용·소유·참조 의미를 정의한다. 모든 값 객체/논리 근거에 대해 인라인 보존 값인지, 기존 허용 원본의 정확한 개정 및 하위 내용인지 구분하고 C00.Ref·C03–C05 입출력과의 매핑을 명시한다. 새 원본 종류가 꼭 필요할 때만 공유 계약 변경으로 연결하며 구현 전 정합성 확인이라는 문장으로 결정을 미루지 않는다. | New |
| R-04 | Major | aidlc/spaces/default/intents/261004-feature/construction/u3-commercial-ordering/functional-design/functional-spec.md:120 > WF7 steps 1, 5–7; entities.md:224 > OrderChangeApplication.afterSalesDecisionRef | WF7은 수락 전 주문의 직원 가격/총액 변경 제안과 고객 동의를 통한 U3 적용을 제공한다. 필요한 계약/후속 승인은 조건부이고 이미 ACCEPTED인 주문에만 후속 허용 판단을 특별히 요구하며, afterSalesDecisionRef도 optional이다. 그러나 공유 contract-summary.md:899–908의 ApplyOrderChangeInput은 afterSalesDecisionRef를 모든 호출에 필수로 요구하고 null 대안이 없다. C05.applyApprovedChange(:3515–3519)는 이 입력을 사용한다. REVIEW 주문의 동의된 가격 변경을 이 명령으로 실행하려면 어떤 U7 원본 판단을 받아야 하는지, 또는 어떤 기존 계약 경로를 사용할지 정의되지 않아 핵심 AC3.4.2/AC3.5.4의 실제 적용 경계를 구현자가 정해야 한다. | 수락 전 동의 가격 변경과 수락 후 고객 후속 변경 각각의 명령·허용 판단 조건을 정의한다. 기존 C05를 유지한다면 수락 전에도 요구되는 AfterSalesDecision 원본을 얻는 선행 호출과 검증을 명시한다. 수락 전 경로에 그 판단이 불필요한 설계라면 공유 ApplyOrderChangeInput의 조건부 입력/별도 경로를 명시적 계약 수정 대상으로 연결한다. 필수 Ref를 생략하거나 임의 판단 기록으로 채우지 않는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| Python 3 + PyYAML 6.0.3 / JSON parser, 지정 U3 파일만 읽기 | PASS: entities/rules YAML 및 traceability JSON 파싱; 엔티티 18/18 고유, BR 29/29 고유 | 문서 구조 파싱과 식별자 고유성을 확인했다. 모델의 의미적 완전성 판정과 별개다. |
| 원본 stories.md의 지정 12개 US와 traceability.json 독립 집합 대조 | PASS: upstream 및 coverage가 정확히 42개 AC와 일치; OK 35, Deferred 7; 존재하지 않는 OK BR target 0, 설명 없는 orphan 0 | 원래 AC와 후속 기준을 보존했다. OK는 설계 연결이며 구현·시험 통과가 아니다. |
| 엔티티 내부 참조·타입 표 및 C00.Ref enum 독립 대조 | FAIL: 미분류 이름 7개/23회; 직접 허용 enum 대응과 설명된 매핑이 없는 논리 참조 이름 24개/53회 | R-03의 근거다. enum 대조만으로 값 객체 자체를 금지하지 않으며 실제 참조 표현의 정의가 필요하다. |
| Order / PurchaseTermsSnapshot YAML 속성·관계 대조 | FAIL: Order의 TargetScope 관련 속성 0; 기업 계약 개정은 단일 optional Ref와 0..1 관계 | R-01과 R-02의 명시적 모델 공백을 확인했다. |
| C03/C04/C05 operation names 및 C00.ApplyOrderChangeInput 대조 | operation names 존재 확인; 변경 입력의 afterSalesDecisionRef는 필수 | 존재하는 명령 이름과 입출력 경계의 사용 가능성은 다르며 R-04를 확인했다. |
| 지정 문서의 로컬 링크·문자·행동 섹션 검사 | PASS: 로컬 링크 31개 모두 존재, 검사한 4개 산출물의 Unicode replacement character 0, Domain Model/Business Rules/Workflows/State Machines/Integration Points/Error Handling and Concurrency/Business Scenarios 섹션 존재 | 읽기 전용 구조 확인이며 native required-sections/upstream-coverage sensor 결과를 대신 주장하지 않는다. |
| linter / type-check 적용 여부 검사 | N/A: U3 Markdown에 TS/JS 코드 fence 0; 제품 코드 생성 없음 | 앱 테스트·부하 시험·광범위 타입/린트 실행은 이 기능 설계 리뷰의 근거가 아니다. |
| PATH aidlc 확인 및 native 도움말 | /Users/gyun/.local/bin/aidlc 존재; aidlc engine help는 exit 1, launcher pin policy drift for route top-help | 우회 실행하지 않았다. stage에는 별도 validation_tools 없이 5개 sensor imports가 있으며 native 센서 완료/통과를 주장하지 않는다. 정식 sensor 실행과 receipt는 invoking orchestrator 소관이다. |

### Summary

원 단위 계산·중복 금액 방지·다른 사람 승인·동의와 실제 적용 구분·전체 직원 판단 및 원래 AC 보존은 명시되어 있다. 그러나 조직 보호 문맥과 다품목 합의의 보존 모델, 참조 표현, 수락 전 변경 명령의 공유 계약 경계에서 4개 Major가 확인되어 NOT-READY다. 실제 연동·기존 U2 미해결 문제·운영 배포 준비는 이 리뷰가 해결하거나 승인하지 않는다.
