# OMS 시장 조사 방향

## Prior Context

- 상위 문서: [승인된 개발 의도](../intent-capture/intent-statement.md).
- 답변 근거: [개발 의도 단계의 사용자 답변](../intent-capture/intent-capture-questions.md).
- B2B 타겟, 하드웨어·소프트웨어 두 상품 타입은 확정했다. 세부 고객군·사용자·책임 경계·MVP는 조사 후 결정한다.
- 기존에 선택한 Guide me 방식과 이 대화에서의 결과 검토를 이어간다. 아래 기존 답변은 다시 질문하지 않는다.

## Q1. 어떤 문제와 업무 흐름을 조사해야 하나요?

A. 비즈니스 문제·OMS 유형·사용 시나리오·실제 사용자·주문 lifecycle·인접 시스템 경계를 조사한다.
B. 아직 정하지 않았다. (Not yet defined)
X. Other (please specify)

[Answer]: 기존 사용자 요청을 이어받음: "OMS가 해결하는 핵심 비즈니스 문제", "주요 OMS 유형과 사용 시나리오", "실제 사용자와 이해관계자", "주문의 전체 lifecycle", "OMS와 ERP, WMS, PIM, CRM, 결제, 배송 시스템의 책임 경계". 근거: intent-capture Q1.

## Q2. 대상 고객과 상품 범위는 어디까지인가요?

A. B2B 타겟이며 하드웨어와 소프트웨어 두 상품 타입을 다룬다. 세부 고객군과 use case는 조사 후 정한다.
B. 아직 정하지 않았다. (Not yet defined)
X. Other (please specify)

[Answer]: 기존 사용자 원문: "해당 OMS는 B2B 타겟으로 한다\nOMS에서 다루는 상품 타입은 하드웨어, 소프트웨어 두 타입으로 한다". 세부 고객군과 use case는 미정으로 유지한다. 근거: intent-capture Q2·Q9 및 확인된 요약.

## Q3. 기존 제품에서 무엇을 비교하고, 우리 제품의 기능은 어떻게 결정하나요?

A. 상용·오픈소스 OMS의 주요 기능과 차이를 조사하고, 기본 기능·사업별 기능을 구분한 뒤 MVP 포함·제외 범위를 정한다.
B. 아직 정하지 않았다. (Not yet defined)
X. Other (please specify)

[Answer]: 기존 사용자 요청을 이어받음: "기존 상용/오픈소스 OMS의 주요 기능과 차이", "기본적으로 필요한 기능과 특정 사업에서만 필요한 기능의 구분", "MVP에서 반드시 포함할 것과 제외할 것". 일반적인 기능 목록을 바로 요구사항으로 가정하지 않는다. 근거: intent-capture Q1·Q8.

후속 지시: 이번 단계 Q5에서 사용자가 "기능 목록보다 패턴에 대해서 조사하자"로 비교 방식을 구체화했다. 기능 수를 나열하기보다 업무·사용자·도메인·책임 경계의 패턴을 분석한다.

## Q4. 시장 변화와 제약을 어떤 원칙으로 다루나요?

A. 기술적·운영적·보안적 제약을 조사하고, 확인되지 않은 주장은 assumption으로 표시한다. 기술 스택과 아키텍처는 선결정하지 않는다.
B. 아직 정하지 않았다. (Not yet defined)
X. Other (please specify)

[Answer]: 기존 사용자 요청을 이어받음: "주요 기술적·운영적·보안적 제약", "확인되지 않은 내용은 사실로 가정하지 말고 assumption으로 명시해라.", "기술 스택과 아키텍처부터 결정하지 마라". 근거: intent-capture Q1. 특정 법규의 적용 여부나 시장 추세는 이번 조사에서 근거를 확인할 대상이다.

## Q5. 어떤 범주와 관점으로 기존 솔루션의 패턴을 조사할까요?

제품 개발 목표는 유지한다. 비교 범위를 넓히는 것은 구매나 기술 채택을 확정하는 결정이 아니다.

A. 사용자가 지정한 네 범주에서 업무·사용자·공통 기능, 주문관리 범위, 기존 아키텍처·도메인 모델·기능 경계, ERP·WMS 책임 분리를 조사한다.
B. 기능 목록 중심으로 비교한다.
C. 아직 정하지 않았다. (Not yet defined)
X. Other (please specify)

[Answer]: 사용자 원문:

기능 목록보다 패턴에 대해서 조사하자
상용 Enterprise OMS
        │
        ├─ 어떤 업무를 해결하는가
        ├─ 어떤 사용자 대상인가
        └─ 어떤 기능이 공통인가


Commerce Platform OMS
        │
        └─ 어디까지 주문 관리를 제공하는가


Open Source OMS
        │
        ├─ Architecture
        ├─ Domain model
        └─ Feature boundary


ERP / WMS
        │
        └─ OMS와 책임이 어떻게 갈리는가

## Q6. 대상 국가·시장 규모·일정·예산에 확정된 조건이 있나요?

A. 확정된 조건 없음. 세부 시장과 목표 규모는 조사 후 판단한다.
B. 확정된 조건을 직접 설명한다.
C. 아직 확인하지 못했다. (Not yet defined)
X. Other (please specify)

[Answer]: 기존 사용자 답변: "확정된 조건 없음". 세부 고객군과 제품의 정량적 성공 지표도 아직 미정이다. 근거: intent-capture Q3·Q4 및 확인된 요약. 시장 규모의 수치를 임의로 목표로 정하지 않는다.

## Preliminary Sources

아래는 2026-10-04에 확인한 예비 자료다. 비교 제품의 채택이나 최종 조사 결론은 아니다. 공급사 자료의 기능 설명을 시장 수요 또는 도입 성과의 독립 검증으로 취급하지 않는다.

- [IBM Sterling OMS 제품 개요](https://www.ibm.com/docs/en/order-management?topic=overview-sterling-order-management-system-product)
- [Oracle Order Management와 Subscription Management의 연동](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/faiom/overview-of-integrating-order-management-with-subscription-management.html)
- [ERPNext Sales Order](https://docs.frappe.io/erpnext/sales-order)
- [ERPNext Subscription](https://docs.frappe.io/erpnext/subscription)
- [ERPNext Serial Number](https://docs.frappe.io/erpnext/serial-no)
- [Apache OFBiz 공식 프로젝트](https://ofbiz.apache.org/)
- [Keygen 라이선스 관리 문서](https://keygen.sh/docs/)
- [Medusa의 아키텍처](https://docs.medusajs.com/learn/introduction/architecture)
- [Medusa의 주문·재고·이행 모듈 구분](https://medusajs.com/modules)
- [Adobe Commerce의 출고 원천 선택과 재고 예약](https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/selection-reservations)
- [Salesforce Order Summary의 주문 lifecycle 범위](https://trailhead.salesforce.com/content/learn/modules/om-salesforce-order-management/om-use-order-summaries)

## Research Method Proposals

- 조사 제안: 네 범주별 대표 사례의 업무·도메인·책임 분리 패턴을 분석한다. 독립 OMS, Commerce 플랫폼의 주문관리, ERP 내 주문관리를 동일한 종류의 완제품으로 취급하지 않고 확인된 성격을 표시한다.
- 조사 제안: 기존 오픈소스 사례의 Architecture·Domain model·Feature boundary를 분석하되, 우리 제품의 기술 스택이나 아키텍처 결정으로 전환하지 않는다.
- 조사 제안: 제품별 공개 문서에서 지원 범위·추가 모듈·연동 의존성을 구분한다. 문서에서 찾지 못한 기능은 미지원으로 단정하지 않고 미확인으로 표시한다.
- 조사 제안: 공개 가격·과금 단위가 확인될 때만 기록한다. 견적이 필요한 가격과 검증되지 않은 비용·시장 규모는 미확인으로 남긴다.
- 조사 제안: 공개 자료로 확인한 제품 기능, 분석자의 해석, 실제 고객 인터뷰가 필요한 가설을 구분한다. 공개 사례는 직접 수행한 고객 인터뷰로 표현하지 않는다.

## Consolidated Summary Confirmation

- 확정 전제: B2B 타겟이며 하드웨어·소프트웨어 두 상품 타입을 다룬다. 세부 고객군·use case·MVP는 아직 결정하지 않는다.
- 상용 Enterprise OMS: 해결하는 업무, 대상 사용자, 업무 맥락에서의 공통 기능을 조사한다.
- Commerce Platform OMS: 플랫폼이 주문관리를 어디까지 제공하고 어디서 외부 시스템에 맡기는지 조사한다.
- Open Source OMS: 기존 사례의 Architecture, Domain model, Feature boundary를 조사한다. 오픈소스 커머스나 ERP 기반 주문관리 사례는 독립 OMS와 구별해서 표시한다.
- ERP / WMS: OMS와 책임이 어떻게 갈리는지, 중복되거나 인계되는 업무가 무엇인지 조사한다.
- 공통 분석 관점: 사용자와 주문 lifecycle, 주문·재고·결제·배송·소프트웨어 제공의 책임 경계, 공통 패턴과 사업별 차이를 연결한다. 각 패턴의 하드웨어·소프트웨어 적용 여부는 근거로 확인한다.
- 산출물: competitive-analysis.md에 네 범주별 패턴·도메인·경계와 차별화 가설, market-trends.md에 변화 근거·고객군 후보·검증할 가설, build-vs-buy.md에 자체 개발·기존 기반 활용·연동의 책임과 비용 요인을 정리한다. 구매나 기술 채택은 이 단계에서 확정하지 않는다.
- 근거 원칙: 공식 문서·공개 소스·공식 사례를 우선 확인한다. 사실, 분석자의 해석, assumption을 구분하고 미확인 사항을 명시한다. 공급사 기능 설명만으로 실제 고객 수요를 검증했다고 주장하지 않는다.
- 진행 원칙: 기술 스택·우리 제품의 아키텍처를 선결정하지 않는다. 시장 조사 결과는 이후 제약 검토와 범위 정의의 근거로 사용하고, 충분한 Ideation 근거를 확보한 뒤 사용자 승인으로 Inception에 진입한다.

이 조사 방향대로 시장 조사 문서를 작성해도 될까요?

- Looks correct
- Request changes

[Answer]: Looks correct
