# OMS 시장 신호와 고객군 가설

## 범위와 결론의 강도

상위 기준은 [개발 의도](../intent-capture/intent-statement.md)이며, [시장 조사 방향](market-research-questions.md)에 따라 기능 수보다 패턴을 비교했다. 구체적인 비교는 [패턴 분석](competitive-analysis.md)을 참조한다.

**현재 결론:** 공개 자료에서 제품이 다루는 문제와 확장 방향은 확인할 수 있다. 하지만 우리의 세부 고객군이 그 문제를 얼마나 자주 겪고, 얼마를 지불할지는 확인하지 못했다. 아래의 “시장 신호”는 제품 공급 측 관찰이며 시장 성장률·보급률·구매 의사의 증거가 아니다.

## 공개 자료에서 확인한 신호

| 신호 | 확인 사실 | 분석 | 검증하지 못한 것 |
|---|---|---|---|
| B2B 구매 조건을 제품 안에 반영 | Shopify는 회사별 구매 경험, 카탈로그·수량별 가격을 설명 [S07] [S30] | B2B에서는 거래 조건이 주문 흐름의 중요한 분기일 수 있음 | 모든 업종의 요구 수준·실제 이용률 |
| 주문 조정의 단위가 품목·이행 작업으로 세분됨 | Oracle의 라인별 과정, Shopify의 FulfillmentOrder, Medusa의 모듈 연결 [S32] [S08] [S11] | 혼합·부분 이행을 별도로 표현할 근거 | 이 구조가 우리 초기 고객에게 필요한 복잡도인지 |
| 물리 상품과 구독을 연결하는 사례가 존재 | Oracle은 물리 상품과 구독·보장 항목의 연동 예시를 제공 [S04] | 하드웨어·소프트웨어 사업에서 비교할 가치가 있는 패턴 | 우리 고객의 혼합 주문 빈도, 모든 라이선스 형태의 지원 여부 |
| 커머스 기능을 모듈로 확장하는 접근 | Medusa의 모듈·워크플로 및 디지털 상품 확장 예제 [S09] [S35] | 자체 제품을 만드는 팀에 재사용과 확장 경계가 중요 | 실제 개발기간 단축·운영비 절감 |
| 통합 ERP도 중요한 대안 | ERPNext는 수주·납품·청구·결제를 연결 [S33] | 고객에게 별도 OMS가 필요한지 ERP의 기존 능력과 비교해야 함 | 고객의 설치 버전·사용 중인 기능·커스터마이징 |
| 코드 공개와 제공 조건은 별도 확인이 필요 | 확인한 Medusa 저장소 고지는 일부 Enterprise 자료를 일반 라이선스 범위와 구분 [S14] [S15] | 코드의 공개 여부만으로 재사용 비용을 판단할 수 없음 | 우리 배포·판매 형태에서 필요한 계약 조건 |

**추세 해석의 한계:** 이 조사는 제품군의 현재 자료와 일부 과거 사례를 비교한 것이다. 동일한 표본을 시간별로 조사한 결과가 아니므로 “시장 전체가 특정 구조로 이동한다”는 결론을 내리지 않는다.

## B2B 하드웨어·소프트웨어 고객군 후보

다음은 첫 고객을 고르기 위한 **assumption**이다. 고객 인터뷰나 실제 주문 자료로 검증하기 전에는 타겟 확정이나 시장성이 입증된 세그먼트로 취급하지 않는다.

| 후보 | 조사할 주문 패턴 | 가능한 문제 가설 | 반증 신호 | 확인할 사람·자료 |
|---|---|---|---|---|
| IT 장비·소프트웨어 유통/리셀러 | 여러 공급사의 장비·이용권을 고객 주문으로 묶음 | 부분 납품과 키·권한 제공의 상태가 분리됨 | 혼합 판매가 드물거나 기존 업무 도구로 충분 | 영업 운영·주문 담당, 익명화한 주문/공급 요청 |
| 솔루션 공급사·시스템 통합 사업자 | 장비·소프트웨어를 계약·프로젝트별로 제공 | 납품·검수·사용 개시 시점의 불일치 | 핵심 문제가 주문보다 프로젝트 수행 관리 | 프로젝트 운영·재무·고객 지원, 검수/청구 사례 |
| 하드웨어와 소프트웨어를 함께 제공하는 제조사 | 장비 판매 이후 기능·이용 권한을 제공 | 시리얼과 사용 권한의 관계를 추적하기 어려움 | 권한 제공이 별도 주문 없이 자동으로 충분히 해결 | 제품 운영·서비스 담당, 장비·권한 변경 사례 |
| 단일 채널 중심 B2B 판매자 | 회사별 조건의 주문과 단순 출고 | 수작업 주문 접수·상태 문의 | Commerce 또는 ERP 기능만으로 해소 가능 | 판매 담당, 주문 처리·문의 내역 |

이 후보들은 승인된 상품 범위와 관찰한 패턴에서 도출한 분석이다. Parker 사례는 분산 조직의 조정 문제를 보여주지만 IT 리셀러의 수요를 직접 입증하지 않는다. Oracle의 혼합 주문 예시도 실제 고객 검증을 대체하지 않는다. [S02] [S04]

### 조사 우선순위 제안

**제안:** 첫 탐색에서는 장비·소프트웨어를 함께 판매하는 유통/리셀러와 솔루션 공급사의 주문 사례를 나란히 검토할 가치가 있다. 승인된 두 상품 타입과 연결되는 지점이 뚜렷하기 때문이다. 이것은 제품 타겟의 추천 확정이 아니라 인터뷰 대상을 좁히기 위한 가설이다.

반드시 함께 볼 비교군은 기존 ERP나 Commerce만으로 문제가 해결되는 판매자다. 별도 OMS가 없어도 충분한 사례를 확인해야 자체 서비스가 필요한 이유를 과장하지 않을 수 있다.

## 고객 조사에서 확보할 증거

아래는 후속 조사 **제안**이다. 개인정보나 영업 비밀은 제거한 기록을 사용하고, 실제 사용자에게 연락하는 것은 사용자의 별도 지시에 따른다.

| 질문 | 구체적으로 요청할 증거 | 판단 목적 |
|---|---|---|
| 주문 한 건은 어느 경로로 들어오는가 | 온라인·이메일·영업 입력 등 실제 접수 사례 | 구매 경험 문제인지 접수 통합 문제인지 구별 |
| 누가 어느 단계에서 다시 입력하는가 | 시스템 간 복사·확인 작업 | 중복 입력과 조정 비용 |
| 가장 최근에 문제가 생긴 주문은 무엇인가 | 정상 주문과 지연/부분 완료/취소 사례 | 이상적인 설명과 실제 흐름의 차이 |
| 두 상품 타입은 함께 움직이는가 | 혼합 주문, 공급 요청, 출고와 권한 제공 기록 | 두 이행 흐름의 의존성 |
| 담당자가 “완료”를 판단하는 근거는 무엇인가 | 납품·검수·활성화·청구·수금 기준 | 상태의 의미와 책임 분리 |
| 누가 구매를 결정하는가 | 사용자·운영 책임자·예산 승인자의 역할 | 사용자 편의와 구매 가치 구분 |
| 기존 도구에서 왜 해결하지 못하는가 | 현재 화면·제약·설정·연동 범위 | 새 제품 필요성의 반증 가능성 |

정량 지표는 먼저 기준값을 수집한다. 주문당 수작업 시간, 상태 확인 횟수, 부분 이행 비율, 예외 해결 시간 등을 **측정 후보**로 둘 수 있지만 지금 목표값이나 절감률을 약속하지 않는다.

## 시장 규모와 사업성

국가·업종·기업 규모·과금 모델이 미정이므로 TAM/SAM/SOM 수치를 제시하지 않는다. 일반적인 글로벌 OMS 시장 매출을 B2B 하드웨어·소프트웨어 OMS의 주소시장으로 그대로 사용할 근거가 없다.

추후 산정한다면 다음 자료가 필요하다.

- 후보 고객군의 명확한 정의와 확인 가능한 기업 수.
- 해당 주문 문제가 실제 존재하는 기업의 비율.
- 기존 솔루션 비용과 지불 의사, 도입 의사결정 주기.
- 고객당 연동·이관·지원 비용.
- 접근 가능한 판매 채널과 실제 전환 증거.

고객 수에 임의의 점유율을 곱한 숫자를 사실처럼 제시하지 않는다. 하향식 산업 통계와 실제 고객군을 기반으로 한 상향식 추정이 같은 대상을 설명하는지도 확인해야 한다.

## 기술·운영·보안 변화와 적용 한계

현재 확인할 수 있는 제약의 출발점은 다음과 같다. 이는 제품이 실제 사용할 공급자를 선정했다는 뜻이 아니다.

| 관찰 | 제품 관점의 의미 | 후속 단계에서 정할 것 |
|---|---|---|
| Stripe 문서는 이벤트 중복·순서 비보장을 설명 [S27] | 외부 결과가 늦거나 다시 도착하는 상황을 주문 운영에서 다뤄야 할 수 있음 | 사용하는 연동별 보장·복구·대조 정책 |
| 운송 상태는 운송사 정보를 기반으로 갱신 [S28] | 배송 상태가 항상 즉시·완전하게 들어온다고 가정할 수 없음 | 최신성 표시·수동 확인·지원 담당 |
| 라이선스에는 기간·장치·기능 등 다른 제약이 존재 [S34] | “소프트웨어 한 개”의 수량·완료 의미를 고객별로 확인해야 함 | 지원할 라이선스 사업 모델 |
| 제품 기능과 운영 제공 조건이 분리됨 [S14] [S15] [S29] | 자체 운영·상용 지원·호스팅·확장의 비용을 구분해야 함 | 실제 채택 후보의 조건 확인 |

**규제:** 판매 국가·데이터 위치·결제 처리 범위가 미정이라 특정 개인정보법, 세금 제도 또는 결제 보안 표준의 적용을 확정하지 않았다. 공식 적용 요건과 고객 계약을 확인하는 작업은 Feasibility의 후속 확인 대상으로 남긴다. 적용 여부를 모르는 규정을 확정된 요구사항으로 기재하지 않는다.

## 다음 의사결정을 위한 판단 기준

다음 질문에 근거가 생긴 후 세부 고객군과 MVP를 좁히는 것이 적절하다.

- 같은 문제가 여러 실제 고객 사례에서 반복되는가?
- 주문 조정의 문제인가, 기존 ERP·WMS·Commerce의 설정/활용 문제인가?
- 하드웨어와 소프트웨어를 함께 다루는 것이 실제로 가치가 있는가?
- 차별화 후보 H1–H3 중 고객이 시간·비용·오류로 설명할 수 있는 것은 무엇인가?
- 외부 시스템의 데이터와 실행 결과에 접근할 수 있는가?
- 작은 범위로도 고객이 인식하는 결과를 끝까지 제공할 수 있는가?

현재는 이 질문의 답을 만들어낼 제품 패턴과 조사 후보를 확보한 상태다. **시장 수요 검증 완료나 Inception 진입 준비 완료를 뜻하지 않는다.**

## Assumptions & Open Questions

- 네 고객군 후보와 조사 우선순위는 모두 assumption이다.
- 시장 규모·고객의 지불 의사·도입 기간·연동 비용은 미확인이다.
- 공개 문서에 나타난 기능의 존재와 실제 고객의 기능 사용률은 구별해야 한다.
- 국내외 시장 중 어디에 집중할지, 접근 가능한 현업 관계자가 있는지는 미정이다.
- 실제 주문 사례가 없으면 MVP 필수성과 차별화 주장은 계속 가설로 유지해야 한다.

## Sources

전체 출처와 한계: [출처 등록부](source-register.md).

[S02]: https://www.ibm.com/case-studies/parker-hannifin-corporation "IBM Parker Hannifin 고객 사례"
[S03]: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faiom/orchestration-processes.html "Oracle Orchestration Processes"
[S04]: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/faiom/overview-of-integrating-order-management-with-subscription-management.html "Oracle OM–Subscription Management 연동"
[S07]: https://help.shopify.com/en/manual/b2b "Shopify B2B"
[S08]: https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder "Shopify FulfillmentOrder"
[S09]: https://docs.medusajs.com/learn/introduction/architecture "Medusa Architecture"
[S11]: https://docs.medusajs.com/resources/commerce-modules/order/links-to-other-modules "Medusa Order 모듈 연결"
[S12]: https://docs.medusajs.com/resources/recipes/digital-products "Medusa Digital Products Recipe"
[S14]: https://github.com/medusajs/medusa/blob/044fbbb9f3bb749fdb52a862b542dc3982e7cba7/LICENSE "Medusa LICENSE"
[S15]: https://github.com/medusajs/medusa/blob/044fbbb9f3bb749fdb52a862b542dc3982e7cba7/ENTERPRISE-LICENSE.md "Medusa Enterprise Edition 고지"
[S20]: https://docs.frappe.io/erpnext/sales-order "ERPNext Sales Order"
[S26]: https://keygen.sh/docs/ "Keygen 라이선스 모델"
[S27]: https://docs.stripe.com/webhooks "Stripe Webhooks"
[S28]: https://docs.easypost.com/docs/trackers "EasyPost Tracker"
[S29]: https://frappe.io/erpnext/pricing "ERPNext 가격·제공 방식"
[S30]: https://help.shopify.com/en/manual/b2b/catalogs/index "Shopify B2B Catalogs"


[S32]: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fauom/monitor-order-fulfillment.html "Oracle Monitor Order Fulfillment"

[S33]: https://docs.frappe.io/erpnext/sales-invoice "ERPNext Sales Invoice"

[S34]: https://keygen.sh/docs/choosing-a-licensing-model/ "Keygen Choosing a Licensing Model"

[S35]: https://docs.medusajs.com/resources/recipes/digital-products/examples/standard "Medusa Digital Products Example"
