# 자체 개발·기존 기반 활용·연동의 판단 틀

## 목적과 전제

[승인된 개발 의도](../intent-capture/intent-statement.md)는 B2B 하드웨어·소프트웨어 OMS를 새 서비스로 개발하는 것이다. 이 목표를 유지하면서 [패턴 조사](competitive-analysis.md)와 [고객군 가설](market-trends.md)을 바탕으로 무엇을 직접 책임지고 무엇을 활용할지 비교한다.

이 문서는 구매·프레임워크·배포 구조의 선택서가 아니다. 고객과 상세 주문 정책이 아직 미정이므로 점수를 임의로 매겨 승자를 정하지 않는다. 기존 OSS의 구조 분석과 우리 제품의 아키텍처 결정은 별개다.

## 네 가지 접근의 비교

아래는 관찰한 제품 패턴에서 도출한 **분석**이다. 실제 기간·비용·적합성은 검증 전이다.

| 접근 | 활용할 수 있는 패턴 | 우리 팀에 남는 책임 | 적합성을 확인할 조건 | 주요 위험 |
|---|---|---|---|---|
| 독립 서비스로 직접 개발 | 고객에게 필요한 주문 조정과 예외 업무에 집중 | 도메인 정책·연동·운영·복구·보안 전반 | 기존 제품과 다른 반복 문제를 증명할 수 있는가 | 범위가 ERP·WMS·청구로 무제한 확대 |
| OSS 커머스/주문 기반 확장 | 주문·품목·이행·결제 연결을 활용 [S10] [S11] | B2B 정책, 디지털 제공 방식, 업그레이드 호환, 운영 | 지원되는 기능과 확장 예제의 차이를 확인했는가 | 예제를 완제품으로 오인; 기능별 제공 조건 누락 |
| ERP 기반 주문 흐름 확장 | 수주·납품·청구 문서 연계 [S33] | 고객별 정책·외부 연동·제품화와 운영 | 고객이 통합 ERP를 사용하거나 도입하려는가 | 고객마다 커스터마이징이 달라 제품 운영 부담 증가 |
| 상용 OMS/전문 서비스 연동 | 이미 제공되는 조정·권한·배송 기능을 연결 [S32] [S34] [S28] | 통합 경험·업무 경계·오류 대응·고객 지원 | 계약·연동 접근권·제공 범위가 새 서비스의 목표와 맞는가 | 외부 제공자의 정책·요금·장애에 대한 의존 |

상용 OMS를 비교한다고 새 서비스 개발을 취소하는 것은 아니다. 한편 상용 OMS를 고객별로 설정해 공급하는 사업과 자체 소프트웨어 제품을 판매하는 사업은 책임과 경제성이 다르므로 혼동하지 않는다.

## 기능을 가져오기 전에 확인할 경계

| 판단 단위 | 직접 책임질 수 있는 영역의 후보 | 기존 시스템에 맡길 수 있는 영역의 후보 | 고객 사례로 확인할 질문 |
|---|---|---|---|
| 주문 접수·수락 | 주문 확인, 계약된 항목과 진행 상태 | Commerce·영업 도구의 주문 생성 | 새 OMS가 없어도 접수가 이미 충분한가 |
| 이행 조정 | 라인별 진행·보류·변경 판단 | 창고·공급자·권한 제공자의 실제 실행 | 다중 실행 결과를 조정해야 하는가 |
| 하드웨어 | 고객 주문과 출고 결과의 연결 | 실재고·피킹·패킹·운송 | WMS가 있는가, 공급사 직송인가 |
| 소프트웨어 | 주문과 제공 요청·결과의 연결 | 라이선스 검증·장치 활성화·구독 과금 | 우리가 발급하는가, 타 공급자의 결과를 받는가 |
| 돈 | 주문과 결제·청구 결과의 대조 | 결제 처리·회계 원장 | 선결제/후불/부분 청구의 실제 정책 |
| 고객·상품 | 주문에 필요한 참조와 당시 정보 | CRM·PIM·ERP의 관리 기능 | 원본과 수정 권한이 어디에 있는가 |

이 표는 **경계 후보**다. 예컨대 고객에게 ERP가 없으면 ERP 연동을 전제할 수 없고, 소프트웨어가 단순 파일이면 장치 라이선스 기능을 요구할 근거가 없다. 자료상의 비교 근거는 OMS 조정, ERP 거래 문서, WMS 실행과 라이선스 모델의 구분이다. [S32] [S33] [S23] [S34]

## OSS 활용 시 확인한 사실

- **Medusa:** 고정된 개발 브랜치의 LICENSE는 일반 MIT 범위와 Enterprise 자료 예외를 명시한다. “저장소 전체가 MIT이므로 모든 기능을 같은 조건으로 활용 가능”이라고 가정하지 않는다. 특정 이용 방식의 허용 여부는 실제 사용할 자료·버전·계약을 확인해야 한다. [S14] [S15]
- **Medusa 디지털 상품:** 공식 자료는 커스텀 모듈·이행 제공자로 구현하는 방법을 설명한다. 이를 그대로 B2B 라이선스 수명 전체를 제공하는 기본 기능으로 계산하지 않는다. [S35]
- **OFBiz:** 주문은 회계·재고·CRM 등과 함께 있는 업무 애플리케이션의 일부다. 일부 모델을 읽었다고 독립 OMS로 분리하는 비용이 작다고 가정할 수 없다. [S16] [S17] [S18]
- **ERPNext:** 공식 가격 설명도 호스팅과 구축을 비용 요소로 구분한다. 소프트웨어 사용료와 고객 온보딩·이관·확장·지원 비용은 같은 항목이 아니다. [S29]

운영 검증 없이 공개 소스의 정적 구조만으로 성능·보안·확장성·무중단 업그레이드를 보장하지 않는다.

## 비용을 비교할 방법

현재는 고객 수·트래픽·연동 수·가용성 목표·구축 범위·계약이 없으므로 견적이나 우열을 산정하지 않는다. 아래는 **산정 틀 제안**이다.

```text
검토 기간의 총비용 =
  초기 개발 또는 도입 비용
  + 데이터 이관과 연동 비용
  + 라이선스 또는 사용량 비용
  + 호스팅과 운영 비용
  + 업그레이드와 고객 지원 비용
  + 장애 복구 및 공급자 변경에 필요한 비용
```

| 비용 축 | 입력받아야 할 근거 | 흔한 과소평가 |
|---|---|---|
| 자체 개발 | 검증된 업무 범위·팀 역량·유지보수 책임 | 정상 흐름만 구현하는 비용 |
| OSS 기반 | 확장 범위·기능별 제공 조건·지원 방식 | 공개 소스이면 운영비도 없다는 가정 |
| 상용 연동 | 계약·과금 단위·추가 모듈·지원 조건 | 기본 가격을 전체 구축비로 사용 |
| 고객별 연동 | 시스템 종류·접근권·데이터 품질·테스트 환경 | 고객 수만 늘고 연동 비용은 늘지 않는다는 가정 |
| 운영 | 장애 대응자·복구 절차·고객 응대 범위 | 상태 조회만 있으면 운영이 끝난다는 가정 |

공개된 최저 호스팅 가격을 생산 환경의 OMS 비용으로 인용하지 않았다. 기능 목록보다 해결할 업무·운영 책임의 차이를 먼저 비교해야 한다. [S29]

## 첫 MVP를 정하기 전에 비교할 세 가지 업무 범위

아래는 **검증용 범위 후보**이며 확정 요구사항이나 출시 약속이 아니다. 하드웨어·소프트웨어 두 타입이라는 승인 범위는 유지한다.

| 후보 | 중심 가치 가설 | 먼저 확인할 시나리오 | 확대를 보류할 영역의 예 |
|---|---|---|---|
| 주문 가시성·예외 관리 | 흩어진 이행 상태를 설명하고 담당자가 처리 | 주문 접수, 외부 결과, 부분 완료, 보류·재처리 | 직접 창고 작업·완전한 회계·고급 할당 최적화 |
| 혼합 이행 조정 | 두 상품 타입의 제공 시점과 완료를 조정 | 물리 제공과 권한 제공의 성공·실패·취소 | 모든 구독·사용량 과금·모든 라이선스 모델 |
| B2B 주문 접수·조건 적용 | 회사별 주문 조건과 운영 전달을 일관되게 처리 | 주문 확인, 조건 확인, 실행 시스템 인계 | 고객에게 필요 없는 다거점·국제 거래 기능 |

“보류할 영역의 예”는 현재 확정된 제외 범위가 아니다. 실제 고객이 해당 영역을 핵심 문제로 제시하면 다시 평가한다. 첫 고객이 기존 Commerce/ERP에서 이미 충분히 해결하고 있다면 별도 OMS의 범위를 줄이거나 제품 가설을 재검토할 수 있다.

### 범위 선택을 위해 필요한 입증

- 정상 주문뿐 아니라 지연·부분 완료·변경·취소의 실제 사례가 있다.
- 두 상품 타입에서 각각 무엇을 “제공 완료”로 인정하는지 설명할 수 있다.
- 각 상태와 데이터의 원본·수정 권한이 식별되어 있다.
- 고객이 새 서비스의 결과와 기존 방식의 차이를 설명할 수 있다.
- 연동·자료 접근·운영 담당자를 확보할 수 있다.
- 사용자 승인으로 하나의 고객군·use case와 포함/제외 범위를 정한다.

## Feasibility로 넘길 주요 제약

아래는 조사로 드러난 **검토 항목**이다. 구체적인 시스템 설계나 수치 목표는 아직 정하지 않는다.

| 영역 | 확인한 사실 또는 위험 가설 | 제품 영향 | 후속 확인 |
|---|---|---|---|
| 외부 상태 정합성 | Stripe는 이벤트 순서를 보장하지 않고 중복 수신을 설명 [S27] | 같은 결과의 중복 처리·누락·늦은 결과 가능성 | 선택한 연동별 대조·복구 책임 |
| 부분 이행과 변경 | 기존 제품은 이행 단위·주문 변경을 별도 취급 [S32] [S08] | 취소 요청과 이미 실행된 작업이 충돌할 수 있음 | 취소 가능 시점·잔량·정정 정책 |
| 가용 재고 | 판매 예약과 물리 재고 처리는 구분됨 [S06] [S33] | 어떤 수량을 약속할 수 있는지 불명확할 수 있음 | 재고 원본·갱신 주기·예약 권한 |
| 소프트웨어 권한 | 기간·장치·기능 제한 등 모델이 다름 [S34] | 판매 수량·제공·회수의 의미가 달라짐 | 지원 상품 형태·공급자 권한 |
| 운영 가시성 | 운송 상태는 외부 갱신을 받음 [S28] | 지연·오류를 누가 판단할지 필요 | 담당자·수동 조치·고객 설명 방식 |
| 사용자 권한 | 기존 OMS는 생성·변경·모니터링 등 권한을 구분 [S05] | 가격·취소·환불·권한 회수의 오조작 위험 | 실제 역할·승인·기록 범위 |
| 연동 보안 | Stripe 문서는 webhook 서명 검증을 안내 [S27] | 위조 결과와 키 노출을 다룰 필요 | 공급자별 인증·접근 통제·비밀 관리 |
| 기업 간 데이터 분리 | **assumption:** 여러 고객사를 서비스할 경우 격리 필요 | 타사 주문·가격·권한 노출 위험 | 고객별 제공·운영 모델; 멀티테넌트 구조 선결정 아님 |
| 데이터 보존·규제 | 국가·개인정보·결제 취급 범위 미정 | 적용 의무를 지금 확정할 수 없음 | 고객 계약·판매 국가·데이터 흐름 |
| 운영 제공 조건 | 기능·지원·호스팅·계약 범위가 서로 다름 [S14] [S15] [S29] | 배포·재판매·운영 비용 변화 | 채택할 후보와 버전별 조건 |

## 현재 결정과 미결정

**유지하는 결정:** B2B, 하드웨어·소프트웨어, 패턴 중심 조사, 근거와 assumption 구분, 사용자 승인 후 Inception 진입.

**아직 결정하지 않은 것:** 첫 고객군과 use case, MVP, 독립 OMS/ERP 확장/OSS 기반 여부, 주문 원본의 소유자, 라이선스·구독 지원 범위, 기술 스택과 아키텍처, 연동 제공자, 배포·운영 모델.

다음 단계에서는 기술을 선택하기보다 위 제약 중 어떤 것이 실제 고객 시나리오에 적용되는지 검토한다. 최종 제품 범위는 후속 Scope Definition과 Ideation 승인 과정에서 결정한다.

## Assumptions & Open Questions

- 새 서비스의 차별성이 주문 가시성, 혼합 이행, B2B 접수 중 어디에 있는지 미확인이다.
- 고객별 시스템 접근권과 테스트 환경을 확보할 수 있는지 미확인이다.
- 고객사가 기존 ERP/WMS/라이선스 제공자를 보유하는지 미정이다.
- 여러 고객사를 하나의 운영 환경에서 서비스할지는 미정이다.
- TCO의 모든 수치 입력, 실제 계약 조건, 적용 규정은 미확인이다.

## Sources

전체 출처와 한계: [출처 등록부](source-register.md).

[S03]: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faiom/orchestration-processes.html "Oracle Orchestration Processes"
[S05]: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/farom/Order_Manager_job_roles.html "Oracle Order Manager 역할"
[S06]: https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/selection-reservations "Adobe Commerce Source algorithms and reservations"
[S08]: https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder "Shopify FulfillmentOrder"
[S10]: https://docs.medusajs.com/resources/commerce-modules/order/concepts "Medusa Order Concepts"
[S11]: https://docs.medusajs.com/resources/commerce-modules/order/links-to-other-modules "Medusa Order 모듈 연결"
[S12]: https://docs.medusajs.com/resources/recipes/digital-products "Medusa Digital Products Recipe"
[S14]: https://github.com/medusajs/medusa/blob/044fbbb9f3bb749fdb52a862b542dc3982e7cba7/LICENSE "Medusa LICENSE"
[S15]: https://github.com/medusajs/medusa/blob/044fbbb9f3bb749fdb52a862b542dc3982e7cba7/ENTERPRISE-LICENSE.md "Medusa Enterprise Edition 고지"
[S16]: https://ofbiz.apache.org/ "Apache OFBiz 공식 개요"
[S17]: https://github.com/apache/ofbiz-framework/blob/a6bee739473261da9e4f7b70c9b4630ca9afecd3/applications/datamodel/entitydef/order-entitymodel.xml "OFBiz 주문 도메인 모델"
[S18]: https://github.com/apache/ofbiz-framework/blob/a6bee739473261da9e4f7b70c9b4630ca9afecd3/applications/order/src/docs/asciidoc/order.adoc "OFBiz 주문 사용자 가이드"
[S20]: https://docs.frappe.io/erpnext/sales-order "ERPNext Sales Order"
[S23]: https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/release-to-warehouse-process "Dynamics 365 Release to warehouse"
[S26]: https://keygen.sh/docs/ "Keygen 라이선스 모델"
[S27]: https://docs.stripe.com/webhooks "Stripe Webhooks"
[S28]: https://docs.easypost.com/docs/trackers "EasyPost Tracker"
[S29]: https://frappe.io/erpnext/pricing "ERPNext 가격·제공 방식"


[S32]: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fauom/monitor-order-fulfillment.html "Oracle Monitor Order Fulfillment"

[S33]: https://docs.frappe.io/erpnext/sales-invoice "ERPNext Sales Invoice"

[S34]: https://keygen.sh/docs/choosing-a-licensing-model/ "Keygen Choosing a Licensing Model"

[S35]: https://docs.medusajs.com/resources/recipes/digital-products/examples/standard "Medusa Digital Products Example"
