## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-14T01:22:21Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | packages/core/src/catalog-conditions.ts > buildCommonOffer; packages/core/src/commercial-agreement.ts > currentTerms; packages/core/src/order-acceptance.ts > commercialReadiness | 기존 공통 비공개 상품의 기업 승인 공개 예외가 조기에 차단되던 결함은 해당 판단 경로에서 수정됐다. buildCommonOffer는 완성·유효성과 판매 상태를 공개 기본값에서 분리한다. currentTerms는 실제 OFFERABLE·정확한 원본·유효 구간을 확인한 뒤 기업 승인 조건을 합성하여 최종 VISIBILITY를 판단한다. resolve와 주문 제출/수락은 승인 원본·현재 권한/근거를 대조한다. U3CatalogQuery의 사적 commonPrice=null·resolvedPrice 반환, 생략 개정의 SUSPENDED 유지, 직원의 유효 원본 조회·명시 재판매 및 원래 스냅샷 보존도 확인했다. | 이 항목의 기존 필수 수정은 충족했다. 아래 R-02의 별도 목록 진입점은 함께 수정해야 한다. | New |
| R-02 | Critical | apps/api/src/application.ts > routes, lines 194–211; apps/api/src/operations.ts > WorkInquiry.listVisibleProducts binding, lines 212–216; packages/core/src/catalog-query.ts > CatalogQuery.list, lines 44–76 | U3 활성화 후에도 고객 GET /products가 기업별 공개 판정을 우회한다. U3_API_ROUTES에 GET /products가 없어 legacy route가 유지되고, CUSTOMER 허용 registry v2의 listVisibleProducts가 CatalogQuery.list를 호출한다. 이 함수는 product.read 범위 확인 후 상품을 페이지로 읽고 offer.visible만 검사하며 기업 승인 조건·Product.saleState를 확인하지 않는다. 따라서 공통 공개+해당 기업 승인 VISIBILITY=false 상품도 label·salesDescription·commonPrice·salesConditionRefs와 visible=true로 반환할 수 있다. 공통 공개+SUSPENDED도 동일 경로로 노출된다. 반대로 공통 비공개 상품이 페이지에 있으면 해당 기업의 승인 공개 예외가 있어도 전체 페이지가 503으로 중단된다. 상세 조회의 수정된 판정과 실제 목록의 정보 권한이 다르며 FR4.2, BR1.3, WF1.5–6 및 G17을 위반한다. | U3 활성화 시 실제 고객 목록과 등록된 in-process 목록을 현재 기업 승인 조건·판매 상태·현재 원본/권한 대조에 연결한다. 허용되지 않은 상품을 items·cursor·오류로 노출하지 않고, 공통 비공개+기업 허용 상품은 사적 공통 가격을 숨긴 채 기업 확정 가격으로 반환하도록 목록 응답 계약도 맞춘다. 실제 GET /products 및 registry 호출에 기업 허용/거부·타 기업·미승인·중지·혼합 페이지 회귀를 추가한다. 구형 경로가 동일 우회로로 남지 않아야 한다. | New |

> R-01 Reviewer note: Reviewer supplied prior ID R-01

### 결함 근거와 검토 범위

R-01은 보존된 이전 review-01.md의 실제 행을 이어받았다. 원래 두 함수의 조기 차단과 그 주문 경로를 재확인하여 해소로 판단했으며, 이번에 확인한 별도 목록 호출 경로는 R-02로 분리했다. 기존 빈 Findings 표를 근거로 R-01을 누락하지 않았다.

R-02의 호출 경로는 다음과 같이 소스로 확인했다.

- apps/api/src/routes.ts의 GET /products → WorkInquiry.listVisibleProducts는 apps/api/src/u3-routes.ts에 같은 method/path가 없어 application.ts의 legacy 필터를 통과한다. application.ts는 이 route의 version을 2로 선택한다.
- packages/contracts/schemas/operations-v2.json의 listVisibleProducts는 CUSTOMER와 STAFF를 허용하고 product.read·ReadRequest·ProductViewResultPage를 등록한다. businessOperations의 legacy 차단 목록은 상품 등록/개정과 주문 제출만 차단하며 목록 조회는 차단하지 않는다.
- apps/api/src/transport-input.ts는 GET의 scope·cursor·pageSize를 ReadRequest로 구성한다. 정상 현재 기업의 product.read 권한을 가진 고객이 사용할 수 있는 정식 경로다. 원래 c00-v2.json의 ProductView는 CatalogQuery.list가 만든 공통 가격 응답을 허용하며 별도 기업 공개 여부를 스키마로 검증하지 않는다.
- 수정된 buildCommonOffer는 완성된 공통 공개 상품의 saleState가 SUSPENDED여도 공통 기본값인 offer.visible을 true로 보존한다. 이 값의 새 의미를 legacy 목록은 여전히 최종 고객 공개 여부로 사용한다. 기업 승인 VISIBILITY=false 또한 이 목록의 어떤 분기에도 입력되지 않는다.

이는 소스·등록·입출력 계약을 연결한 정적 확인이다. 리뷰어가 새 HTTP/DB 재현 시험을 실행했다고 주장하지 않는다. 확인한 새 HTTP 회귀는 /products/:id/offer와 주문 경로를 검증하며, 해당 상세 경로의 성공으로 별도 GET /products 권한 경계를 입증할 수 없다.

검토는 지정된 단계 정의·Q&A·계획/시험 지침/요약·manifest/traceability와 전달된 U3 기능/보안 설계·공유 inception 계약 안에서 수행했다. a2d694f 이후 claimed 176개 경로의 변경 경계를 대조하고, 22946fb의 제품 수정과 회귀 및 상품/기업 조건/주문·원자 저장·권한·구형 경로 통합을 중점 추적했다. 전 파일의 모든 줄을 동일 깊이로 검증했다는 의미는 아니다. 형제 Unit construction 내용과 작성자 diary는 읽지 않았고 제품/산출물·엔진 상태를 수정하지 않았다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 읽기 전용 Python JSON/path 검사 및 scoped Git diff | manifest 176개, 고유 176개, 현재 누락 0; a2d694f 이후 제품/시험/설정 경계의 변경 176개와 일치, 미주장/불필요 주장 0 | 실제 차등 검토 범위를 확인했다. 전체 source inventory는 출력하지 않았다. |
| required-sections 상당의 Markdown 구조 검사 | plan H2 10개, unit-test-instructions 8개, code-summary 5개 | 세 산출물의 최소 구조를 충족한다. |
| traceability JSON/path 검사 | upstream/coverage 고유 104개 일치, OK 87·Deferred 17, OK target 누락 0 | 원래 Deferred AC 7개를 보존한다. 경로 존재는 운영 목표 달성 증명이 아니다. |
| 현재 CI check 보고서 확인 | run 38379574890의 project-current/u3/pilot/check.json: passed=true, completed=type/lint/format | 단계의 linter/type-check 근거는 실제 현재 CI 결과로 확인했다. 사용자 분담에 따라 리뷰어가 단순 검사를 재실행하지 않았다. |
| CI 실행 영수증·원문 hash·로컬 source bytes 대조 | U1/U2/U3의 source HEAD 480c978dfdd1f078a2ca30991ff2c1fd29a533cb, digest 5d602283f1025df7cdc694d17f8b21e68998cddfe058ae1ac46c0b4c4790274b 일치; 각 628개 source 로컬 hash 불일치 0; 각 Unit report observed=true·exitCode=0·expired=false·logFailed=false·artifact.fresh=true, 원문 hash 일치 | 수정 후 현재 소스에 대한 실행 증거다. 개별 필드가 없는 project 검사에 같은 값을 추정해 넣지 않았다. |
| 현재 CI 단위/통합/coverage 보고서 확인 | U1 571/168/739, U2 465/274/739, U3 332/181/513; 모두 success=true·fail/pending/todo=0. 세 coverage passed=true·completeScope=true·raw hash 일치 | coverage 재실행은 추가 고유 시험으로 합산하지 않았다. 통과한 시험 집합이 R-02의 누락 경로를 면제하지 않는다. |
| 전체 coverage/project 증거 확인 | 11955/14395=83.049670024314%, threshold=80, passed=true; project 완료 18개·Deferred 4개 | test-after/Standard·전체 작성 제품 분모와 하한을 유지한다. |
| 동일 image/보안/runtime 보고서 대조 | image/release/security/runtime의 image sha256:0e2fc1914a13faf9e9de8b8f8d77c1f6f769e856b840f7088eb8873517e4eaa9 일치, 보안 passed=true; actualTlsVerification=true·cleanupFailed=false·actualCognitoVerified=false·actualCompanyNetworkVerified=false·realActivationAllowed=false | 격리 검증과 실제 인증/회사망/운영 활성화는 구분한다. 운영 미등록이 파일럿 코드의 정보 권한 누락을 면제하지 않는다. |

### Summary

미해결 Critical 1개(R-02)로 NOT-READY다. R-01의 수정과 현재 CI 통과는 확인했지만, 실제 고객 목록에 남은 공개 조건 우회를 먼저 해소해야 한다. 기존 U2 Major, 실제 운영 원본 등록 및 7개 후속 AC는 해소·위험 수용으로 변경하지 않으며, 이 검토는 공식 PC 완료 검증·병합·실배포 또는 대량 부하/전체 DR 승인이 아니다.
