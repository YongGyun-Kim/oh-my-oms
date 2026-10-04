# OMS 패턴 조사 출처 등록부

## 조사 범위와 증거 수준

열람일: 2026-10-04. 상위 기준은 [승인된 개발 의도](../intent-capture/intent-statement.md)와 [시장 조사 방향](market-research-questions.md)이다. 아래 자료는 제품·업무 패턴의 증거이며, 우리 고객의 수요·시장 점유율·도입 성과를 검증한 자료는 아니다. 직접 인터뷰·제품 실행·성능 시험·유료 데모는 수행하지 않았다.

- **확인 사실:** 공식 문서 또는 고정된 공개 소스에 나타난 동작·구조.
- **분석:** 여러 사례를 비교해 도출한 해석. 우리 제품의 설계 결정이 아니다.
- **assumption:** 실제 고객·계약·운영 환경을 확인해야 하는 가설.
- **제안:** 후속 조사나 범위 정의의 선택지. 승인된 요구사항이 아니다.

문서와 개발 브랜치는 다른 시점의 증거일 수 있다. Medusa와 OFBiz 소스는 아래 SHA에 한정한다. 정적 선언을 읽었으며 실행 경로 전체를 검증하지 않았다. 제품별 지원 범위는 버전·요금제·모듈·설정에 따라 달라질 수 있다.

## Sources

### S01 — IBM Sterling B2B 제품 자료

- 출처: [IBM Sterling B2B 제품 자료](https://www.ibm.com/downloads/documents/us-en/131cf879ed331f5f)
- 유형·시점: 공급사 제품 자료; 2025 표기
- 확인 범위·한계: 계약 주문·공급 할당·계정 단위 가시성. 홍보 성과 수치는 인용하지 않음.

### S02 — IBM Parker Hannifin 고객 사례

- 출처: [IBM Parker Hannifin 고객 사례](https://www.ibm.com/case-studies/parker-hannifin-corporation)
- 유형·시점: 공급사 고객 사례; 2016 회계연도 언급
- 확인 범위·한계: 분산 사업부·유통망 조정의 역사적 사례. 현재 시장 규모·성과의 증거로 사용하지 않음.

### S03 — Oracle Orchestration Processes

- 출처: [Oracle Orchestration Processes](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faiom/orchestration-processes.html)
- 유형·시점: 공식 문서; 25D
- 확인 범위·한계: 라인 이행 단계·의존성·상태 매핑·변경 관리.

### S04 — Oracle OM–Subscription Management 연동

- 출처: [Oracle OM–Subscription Management 연동](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/faiom/overview-of-integrating-order-management-with-subscription-management.html)
- 유형·시점: 공식 문서; 26A
- 확인 범위·한계: 물리 상품과 구독·보장 항목의 혼합 주문 예시. 모든 소프트웨어 라이선스 모델 지원을 뜻하지 않음.

### S05 — Oracle Order Manager 역할

- 출처: [Oracle Order Manager 역할](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/farom/Order_Manager_job_roles.html)
- 유형·시점: 공식 역할·권한 문서; 26B
- 확인 범위·한계: Order Entry Specialist 및 Order Manager의 업무·권한. 우리 제품의 사용자 확정 아님.

### S06 — Adobe Commerce Source algorithms and reservations

- 출처: [Adobe Commerce Source algorithms and reservations](https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/selection-reservations)
- 유형·시점: 공식 문서; 2026-08-20 수정 표기
- 확인 범위·한계: 판매 가능 재고·예약·출고 원천 선택. 배포 형태별 주석 확인 필요.

### S07 — Shopify B2B

- 출처: [Shopify B2B](https://help.shopify.com/en/manual/b2b)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: 회사 단위 구매 경험, 결제·배송 조건, 외부 ERP 연동. 전체 B2B 기능이 모든 요금제에 동일하다고 가정하지 않음.

### S08 — Shopify FulfillmentOrder

- 출처: [Shopify FulfillmentOrder](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder)
- 유형·시점: 공식 API 문서; latest 경로
- 확인 범위·한계: 이행 예정 업무와 실제 이행 결과의 구분. 실제 구현 시 API 버전 재확인 필요.

### S09 — Medusa Architecture

- 출처: [Medusa Architecture](https://docs.medusajs.com/learn/introduction/architecture)
- 유형·시점: 공식 문서; v2 계열, 페이지에 v2.21.2 표기
- 확인 범위·한계: HTTP–Workflow–Module–Data store 계층. 독립 OMS가 아닌 커머스 플랫폼.

### S10 — Medusa Order Concepts

- 출처: [Medusa Order Concepts](https://docs.medusajs.com/resources/commerce-modules/order/concepts)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: Order·OrderItem·LineItem·OrderSummary·OrderTransaction의 개념.

### S11 — Medusa Order 모듈 연결

- 출처: [Medusa Order 모듈 연결](https://docs.medusajs.com/resources/commerce-modules/order/links-to-other-modules)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: 주문과 이행·결제·고객 등 다른 모듈의 연결.

### S12 — Medusa Digital Products Recipe

- 출처: [Medusa Digital Products Recipe](https://docs.medusajs.com/resources/recipes/digital-products)
- 유형·시점: 공식 확장 예제; 열람 시점
- 확인 범위·한계: 커스텀 디지털 상품 모듈과 이행 제공자 패턴. 예제를 완성형 B2B 라이선스 관리 기능으로 취급하지 않음.

### S13 — Medusa Order 모델 소스

- 출처: [Medusa Order 모델 소스](https://github.com/medusajs/medusa/blob/044fbbb9f3bb749fdb52a862b542dc3982e7cba7/packages/modules/order/src/models/order.ts)
- 유형·시점: 공개 소스; develop SHA 고정
- 확인 범위·한계: 주문 version, status, items, summary, transactions 관계. 운영 릴리스 검증 아님.

### S14 — Medusa LICENSE

- 출처: [Medusa LICENSE](https://github.com/medusajs/medusa/blob/044fbbb9f3bb749fdb52a862b542dc3982e7cba7/LICENSE)
- 유형·시점: 공개 소스 고지; 동일 SHA
- 확인 범위·한계: MIT 본문과 Enterprise 자료 예외를 직접 확인. 저장소 전체가 동일 라이선스라는 추정을 배제.

### S15 — Medusa Enterprise Edition 고지

- 출처: [Medusa Enterprise Edition 고지](https://github.com/medusajs/medusa/blob/044fbbb9f3bb749fdb52a862b542dc3982e7cba7/ENTERPRISE-LICENSE.md)
- 유형·시점: 공급사 라이선스 고지; 동일 SHA
- 확인 범위·한계: 지정 Enterprise 자료의 별도 상용 계약 조건을 확인할 근거. 특정 이용 형태의 법적 결론을 내리지 않음.

### S16 — Apache OFBiz 공식 개요

- 출처: [Apache OFBiz 공식 개요](https://ofbiz.apache.org/)
- 유형·시점: 공식 프로젝트 문서; 열람 시점
- 확인 범위·한계: ERP·CRM·주문·창고·회계 등을 포함한 업무 애플리케이션 묶음.

### S17 — OFBiz 주문 도메인 모델

- 출처: [OFBiz 주문 도메인 모델](https://github.com/apache/ofbiz-framework/blob/a6bee739473261da9e4f7b70c9b4630ca9afecd3/applications/datamodel/entitydef/order-entitymodel.xml)
- 유형·시점: 공개 소스; trunk SHA 고정
- 확인 범위·한계: OrderHeader·OrderItem·출고 그룹·재고 예약·주문 역할·반품 관계를 직접 확인.

### S18 — OFBiz 주문 사용자 가이드

- 출처: [OFBiz 주문 사용자 가이드](https://github.com/apache/ofbiz-framework/blob/a6bee739473261da9e4f7b70c9b4630ca9afecd3/applications/order/src/docs/asciidoc/order.adoc)
- 유형·시점: 공식 문서 소스; 동일 SHA
- 확인 범위·한계: 수주·발주, CSR 대리 주문, 상태·결제 조건, 회계 연결.

### S19 — OFBiz 주문 컴포넌트 선언

- 출처: [OFBiz 주문 컴포넌트 선언](https://github.com/apache/ofbiz-framework/blob/a6bee739473261da9e4f7b70c9b4630ca9afecd3/applications/order/ofbiz-component.xml)
- 유형·시점: 공개 소스; 동일 SHA
- 확인 범위·한계: 컴포넌트별 데이터·서비스·웹 자원 등록을 확인하는 위치.

### S20 — ERPNext Sales Order

- 출처: [ERPNext Sales Order](https://docs.frappe.io/erpnext/sales-order)
- 유형·시점: 공식 문서; 본문 v17 언급
- 확인 범위·한계: 수주와 납품·청구 문서의 구분, 부분 이행·청구. 특정 설치 버전과 동일하다고 가정하지 않음.

### S21 — ERPNext Subscription

- 출처: [ERPNext Subscription](https://docs.frappe.io/erpnext/subscription)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: 주기적 청구서 생성. 소프트웨어 사용 권한 활성화와 동일 개념 아님.

### S22 — ERPNext Serial Number

- 출처: [ERPNext Serial Number](https://docs.frappe.io/erpnext/serial-no)
- 유형·시점: 공식 문서; v15 변경 주석 포함
- 확인 범위·한계: 시리얼별 위치·보증·재고 거래의 연결.

### S23 — Dynamics 365 Release to warehouse

- 출처: [Dynamics 365 Release to warehouse](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/release-to-warehouse-process)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: Shipment·Load·Wave·Work와 실제 창고 작업.

### S24 — Akeneo PIM 개요

- 출처: [Akeneo PIM 개요](https://www.akeneo.com/what-is-a-pim/)
- 유형·시점: 공급사 설명; 열람 시점
- 확인 범위·한계: 상품 정보 수집·보강·배포. 고객별 마스터 소유권의 유일한 정답으로 취급하지 않음.

### S25 — Salesforce Accounts and Contacts

- 출처: [Salesforce Accounts and Contacts](https://help.salesforce.com/s/articleView?id=sales.sales_core_manage_accounts_contacts.htm&language=en_US&type=5)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: 회사와 연락처 관리. OMS 내 고객 참조와 CRM의 관계를 비교하는 근거.

### S26 — Keygen 라이선스 모델

- 출처: [Keygen 라이선스 모델](https://keygen.sh/docs/)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: 영구·기간·동시사용·장치·기능별 라이선스의 차이. OMS 제품으로 분류하지 않음.

### S27 — Stripe Webhooks

- 출처: [Stripe Webhooks](https://docs.stripe.com/webhooks)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: 이벤트 순서 비보장·중복 수신·서명 검증. 다른 모든 제공자의 동작으로 일반화하지 않음.

### S28 — EasyPost Tracker

- 출처: [EasyPost Tracker](https://docs.easypost.com/docs/trackers)
- 유형·시점: 공식 API 문서; 열람 시점
- 확인 범위·한계: 운송사 추적 상태와 주문 전체 완료의 구분.

### S29 — ERPNext 가격·제공 방식

- 출처: [ERPNext 가격·제공 방식](https://frappe.io/erpnext/pricing)
- 유형·시점: 공식 가격 문서; 열람 시점
- 확인 범위·한계: 소프트웨어와 호스팅·구축·지원 비용의 구분. 최저 호스팅 가격을 OMS 총비용으로 사용하지 않음.

### S30 — Shopify B2B Catalogs

- 출처: [Shopify B2B Catalogs](https://help.shopify.com/en/manual/b2b/catalogs/index)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: 수량 규칙·수량별 가격·요금제별 카탈로그 조건.

### S31 — Medusa Workflow 설명

- 출처: [Medusa Workflow 설명](https://medusajs.com/framework)
- 유형·시점: 공급사 프레임워크 문서; 열람 시점
- 확인 범위·한계: 단계 재시도와 보상 함수 패턴. 외부 시스템 전체의 원자적 롤백 보장으로 읽지 않음.

### S32 — Oracle Monitor Order Fulfillment

- 출처: [Oracle Monitor Order Fulfillment](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fauom/monitor-order-fulfillment.html)
- 유형·시점: 공식 문서; 26B
- 확인 범위·한계: 라인별 이행 모니터링, 변경·예외와 실행 시스템 요청의 구분.

### S33 — ERPNext Sales Invoice

- 출처: [ERPNext Sales Invoice](https://docs.frappe.io/erpnext/sales-invoice)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: 수주·납품에서 청구 생성, 청구와 재고·회계 효과 및 수금의 구분.

### S34 — Keygen Choosing a Licensing Model

- 출처: [Keygen Choosing a Licensing Model](https://keygen.sh/docs/choosing-a-licensing-model/)
- 유형·시점: 공식 문서; 열람 시점
- 확인 범위·한계: 권한·장치·정책·사용자 개념과 라이선스 유형.

### S35 — Medusa Digital Products Example

- 출처: [Medusa Digital Products Example](https://docs.medusajs.com/resources/recipes/digital-products/examples/standard)
- 유형·시점: 공식 예제의 검색 수집 본문; 직접 열기 실패
- 확인 범위·한계: 커스텀 모듈·이행·알림의 예제 범위. 배포 실행은 검증하지 않음.

## 접근 제한과 제외한 자료

- IBM Docs의 OMS 개요·Order Hub는 검색에 노출된 공식 본문/요약을 예비 확인했으나 직접 열기는 403으로 실패했다. 핵심 결론은 접근 가능한 B2B 자료 S01과 사례 S02를 사용했고, 검색 요약만으로 사용자 유형을 확정하지 않았다.
- Stripe Entitlements 세부 변형 페이지는 열리지 않았다. 권한 관리 비교는 접근 가능한 Keygen 문서 S26과 Oracle 사례 S04를 사용했다.
- 커뮤니티 게시물과 검색 결과의 일반 블로그는 본 보고서의 사실 근거로 사용하지 않았다. 링크를 열어 기능을 찾지 못한 경우 미지원으로 단정하지 않았다.
- 자료에 보이는 홍보 ROI·시장 성장 수치와 오래된 고객사의 현재 규모는 검증하지 않았으며 채택하지 않았다.
