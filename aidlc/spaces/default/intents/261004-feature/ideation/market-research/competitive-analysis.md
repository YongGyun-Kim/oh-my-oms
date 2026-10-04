# B2B 하드웨어·소프트웨어 OMS 패턴 비교

## 목적과 읽는 방법

상위 기준은 [승인된 개발 의도](../intent-capture/intent-statement.md)와 [확인된 조사 방향](market-research-questions.md)이다. 타겟은 B2B, 상품 타입은 하드웨어·소프트웨어다. 이 문서는 기존 사례의 패턴을 설명하며 **우리 제품의 고객군, MVP, 기술 스택, 아키텍처를 확정하지 않는다.**

조사일은 2026-10-04다. 문서의 **확인 사실**은 공식 자료·공개 소스에 한정한다. **분석**은 사례 비교에서 도출한 해석이며, **assumption**은 고객 검증 전 가설이다. 출처의 버전·한계는 [출처 등록부](source-register.md)에 기록했다. 제품 실행이나 고객 인터뷰를 수행한 것으로 읽어서는 안 된다.

## 핵심 발견

**분석:** OMS를 이해할 때 먼저 나눌 것은 “무슨 버튼이 있는가”보다 **고객에게 약속한 주문, 그 약속을 이행하는 작업, 실제 물품·권한·돈의 움직임**이다. Oracle은 주문 라인을 여러 이행 시스템에 걸쳐 조정하고, Shopify는 이행 예정 단위와 완료된 작업을 구별한다. ERPNext에서도 수주 자체와 재고·회계 거래는 구별된다. [S03] [S08] [S20]

**분석:** 두 상품 타입을 지원한다는 사실이 창고·구독 청구·라이선스 검증을 모두 OMS 안에 구현한다는 뜻은 아니다. 제품별 실행 경계를 확인해야 한다. [S04] [S12] [S23] [S26]

## 네 범주와 대표 사례

네 범주는 상호 배타적인 시장 분류가 아니라 **비교 관점**이다. 예를 들어 Medusa는 오픈소스 기반 커머스 플랫폼이고 OFBiz는 주문관리를 포함한 ERP 묶음이다. 둘을 독립형 Enterprise OMS와 동급 완제품이라고 부르지 않는다. [S09] [S16]

| 범주 | 사례 | 관찰할 패턴 | 분류상의 주의 |
|---|---|---|---|
| 상용 Enterprise OMS | IBM Sterling | 계약 주문과 공급 할당, 분산 조직의 주문 조정 | 공급사 기능 설명과 고객 사례를 구분 [S01] [S02] |
| 상용 Enterprise OMS | Oracle Fusion Order Management | 주문 라인의 이행 과정과 외부 시스템 간 의존성 | Oracle 제품군과 연동된 예시의 범위 [S03] [S04] |
| Commerce Platform OMS | Shopify | B2B 구매 경험과 플랫폼 주문의 이행 관리 | 회사·카탈로그·요금제 조건과 외부 연동을 함께 봐야 함 [S07] [S30] |
| Commerce Platform OMS | Adobe Commerce | 판매 가능 재고·예약·출고 원천 선택 | 재고 예약 기능을 전체 WMS와 동일시하지 않음 [S06] |
| Open Source OMS 관점 | Medusa | 커머스 모듈의 분리와 워크플로 연결 | 커머스 기반 주문관리 사례; 디지털 상품은 확장 예제가 존재 [S09] [S12] |
| Open Source OMS 관점 | Apache OFBiz | 통합 업무 모델 안의 주문·출고 그룹·예약 | ERP 기반 주문관리 사례 [S16] [S17] |
| ERP | ERPNext | 수주·납품·청구·결제 문서의 연계 | 반복 청구와 실제 소프트웨어 권한 제공은 구분 [S20] [S21] |
| WMS | Dynamics 365 Warehouse Management | 출고 지시를 Shipment·Load·Wave·Work로 변환 | 창고 내 실행 작업을 관찰하는 사례 [S23] |

## 상용 Enterprise OMS: 어떤 업무와 사용자 문제를 다루는가

### E1. 분산된 실행을 고객의 주문 관점으로 묶는다

**확인 사실:** IBM의 Parker Hannifin 사례는 여러 사업부의 상품을 통합 구매 경험으로 제공하면서 주문 구성 요소를 각 사업부와 유통 파트너의 이행으로 연결한 사례다. 해당 자료는 오래된 도입 사례이며 현재의 시장 수요나 성과를 증명하지 않는다. [S02]

**분석:** 이 패턴의 문제는 단순 주문 입력보다 “한 고객의 약속이 여러 조직의 실행으로 흩어지는 것”이다. 같은 문제가 우리 고객에게 있는지는 별도 확인해야 한다. **assumption H1:** 여러 공급사·사업부를 가진 B2B 판매자가 통합 주문 가시성에 가치를 느낄 수 있다. [S02]

### E2. 주문 라인마다 이행 과정과 변경을 관리한다

**확인 사실:** Oracle의 이행 조정 과정은 단계·의존성·예상 상태·변경 처리 규칙을 다룬다. 물리 상품과 구독을 함께 판매하는 예시에서는 상품 출고와 후속 자산·구독 처리가 연결된다. [S03] [S04]

**분석:** 주문 접수 이후 변경·지연·부분 완료를 관리하는 것이 주요 패턴이다. 이행을 외부에 위임해도 전체 주문 진행을 설명할 책임은 남는다. 우리 제품에 동일한 조정 체계가 필요한지는 주문 사례로 검증해야 한다.

### E3. B2B 조건은 주문 실행에 영향을 준다

IBM은 계약 주문, 공급 할당, 계정 단위 가시성을 설명한다. Shopify도 회사별 구매 조건과 카탈로그를 다룬다. **분석:** B2B의 차이는 회사명 필드를 추가하는 데 그치지 않고, “누가 어떤 조건으로 구매하며 부족한 공급을 누구에게 배정하는가”에 나타날 수 있다. 계약·배정 규칙을 모든 B2B 고객의 필수 요구로 일반화하지 않는다. [S01] [S07] [S30]

### 사용자와 이해관계자

| 역할 | 자료에서 확인한 업무 또는 분석 | 우리 제품에서의 상태 |
|---|---|---|
| 주문 입력·영업 운영 담당 | Oracle의 Order Entry Specialist는 주문 생성·수정·반품 업무를 다룸 [S05] | 사용자 후보 |
| 주문 관리자 | Oracle의 주문 모니터링·보류 해제 등 권한 [S05] | 관리자와 승인자 분리는 미정 |
| 고객 서비스 담당 | OFBiz의 CSR은 고객 대신 주문하고 상태를 설명 [S18] | 사용자 후보 |
| 창고 실행 담당 | 피킹·적치 등 실제 창고 작업 [S23] | OMS 직접 사용자인지 WMS 사용자만인지 미정 |
| 기업 구매 담당·승인자 | **역할 가설:** 회사별 구매 조건을 사용하는 고객 측 관계자 [S07] | 실제 구매·승인 절차 인터뷰 필요 |
| 재무·소프트웨어 제공 담당 | **역할 가설:** 청구와 사용 권한 처리 결과에 책임을 지는 관계자 [S20] [S26] | 조직과 업무 소유권 미정 |

솔루션의 사용자, 도입 구매자, 예산 승인자는 같은 사람이 아닐 수 있다. 이 구분은 조사 질문이며, 현재 프로젝트에서 확인된 인물은 개발 의도를 승인하는 사용자뿐이다.

## Commerce Platform OMS: 어디까지 제공하는가

### C1. 구매 경험에서 주문관리로 이어진다

Shopify는 회사 단위 B2B 고객, 구매 조건과 관리 화면, 외부 ERP 연동을 설명한다. **분석:** 플랫폼 내 판매를 중심으로 주문을 관리하는 접근과 여러 독립 시스템의 주문을 통합 조정하는 접근을 구분해서 비교해야 한다. 플랫폼이 외부 주문을 처리할 수 없다고 단정하는 뜻은 아니다. [S07]

### C2. 상거래 플랫폼도 이행 단위를 별도로 둔다

Shopify의 FulfillmentOrder는 같은 위치에서 이행할 예정인 주문 품목 묶음을 나타내며, 실제 수행 결과인 Fulfillment와 구별된다. 문서에는 디지털 자산이 제공된 후 이행을 기록하는 예시도 있다. **분석:** “주문 한 건 = 배송 한 건”이라는 모델은 이 사례와 맞지 않는다. [S08]

Adobe Commerce는 판매 가능 수량, 예약과 출고 원천 추천을 제공한다. **분석:** 플랫폼 자체의 재고·이행 기능과 외부 OMS/WMS의 역할은 실제로 겹칠 수 있다. 제품 이름만으로 경계를 정하기보다 예약·차감·취소 시 누가 권위 있는 값을 바꾸는지 확인해야 한다. [S06]

### 경계를 판별할 질문

- 주문 접수 후 어느 시스템에서 변경·취소를 승인하는가?
- 다른 판매 채널의 주문도 같은 규칙과 운영 화면으로 관리할 수 있는가?
- 예약 수량과 실제 재고 이동의 책임자가 누구인가?
- 외부 창고·공급사가 지연되면 어디에서 탐지하고 다시 처리하는가?
- 소프트웨어 주문의 완료는 파일 전달, 키 발급, 사용 권한 활성화 중 무엇인가?

위 질문은 비교에서 도출한 **검증 제안**이며 기능 요구사항으로 채택한 것은 아니다.

## Open Source OMS 관점: 기존 아키텍처와 도메인 모델

### O1. Medusa — 분리된 도메인을 워크플로로 연결

**확인 사실:** 공식 문서는 HTTP 진입점 → Workflow → 도메인 Module → 데이터 저장 계층을 설명한다. 결제·이행 제공자를 통한 외부 연동도 모듈 경계에 놓인다. 이는 관찰한 Medusa의 구조이며 우리 제품의 기술 선택이 아니다. [S09]

| 관찰 대상 | 확인 내용 | 패턴 해석 |
|---|---|---|
| 주문 | Order와 품목·금액 요약·거래 개념 구분 [S10] | 상업적 주문과 금전 처리를 분리해 설명 |
| 모듈 연결 | 주문에서 이행·결제 모듈로 별도 연결 [S11] | 주문 객체가 실행 시스템 전체를 소유하지 않음 |
| 변경 기록 | 고정한 소스에 version·status와 품목·요약 관계가 존재 [S13] | 변경 가능한 주문의 버전 개념을 관찰할 수 있음 |
| 디지털 상품 | 별도 모듈 및 커스텀 이행 제공자 구현 예제 [S12] | “소프트웨어”를 배송 필드만으로 표현하지 않는 확장 지점 |
| 실패 처리 | 단계 재시도와 보상 함수를 설명 [S31] | 외부 작업 실패를 되돌리거나 조정하는 패턴; 전 시스템 원자적 롤백의 증거는 아님 |

단순 다운로드 예제만으로 영구 라이선스, 장치 활성화, 동시사용 제한, 갱신까지 완성되어 있다고 판단하지 않는다. 라이선스 관리에는 서로 다른 모델이 존재한다. [S12] [S26]

### O2. Apache OFBiz — 통합 업무 모델 안에서 주문을 분해

**확인 사실:** OFBiz는 주문뿐 아니라 회계·CRM·창고 등 업무 애플리케이션을 함께 제공한다. 주문 컴포넌트 선언과 공통 데이터 모델을 읽어 다음 관계를 확인했다. **분석:** 독립 서비스 조합보다 통합 업무 모델을 중심으로 이해할 수 있는 사례다. 실행·배포 구조의 최종 분류를 소스 선언만으로 확정하지 않는다. [S16] [S19]

| 소스의 도메인 개념 | 확인한 구분 | 관찰 의미 |
|---|---|---|
| OrderHeader / OrderItem | 주문과 품목 | 고객 약속을 품목 단위로 나눔 |
| OrderItemShipGroup / Assoc | 출고 그룹과 품목 연결 | 품목과 출고 묶음의 관계를 별도 표현 |
| OrderItemShipGrpInvRes | 품목·출고 그룹·재고 예약 | 실제 이행 자원과의 연결 |
| OrderRole / OrderStatus | 참여자 역할·상태 | 고객 ID와 단일 상태 필드보다 넓은 맥락 |
| OrderPaymentPreference | 결제 방법·선호 연결 | 주문 정보와 실제 결제 결과를 혼동하지 않아야 함 |
| ReturnHeader / ReturnItem | 반품과 원주문 품목 연결 | 반품을 원주문 삭제로 표현하지 않음 |

표의 확인 근거는 고정 SHA의 주문 모델이다. 관계 선언을 확인했을 뿐, 모든 업무 동작·트랜잭션 보장을 시험하지 않았다. [S17]

### 두 사례에서 배울 점과 복제하면 안 되는 것

**분석:** Medusa의 모듈 연결과 OFBiz의 통합 주문 업무는 주문·이행·금전 처리를 구분해 읽을 사례다. 기존 엔티티·프레임워크를 우리 설계로 그대로 가져올 근거는 없다. [S11] [S18]

## ERP / WMS와 OMS의 책임 경계

ERPNext는 수주에서 납품·청구·결제 문서로 이어지는 흐름을 설명한다. 수주 제출 자체가 재고 출고나 청구 회계 처리를 의미하지 않는다. Microsoft WMS 문서는 출고 지시 이후 Shipment·Load·Wave·Work가 만들어지고 창고 작업으로 이어지는 과정을 설명한다. [S20] [S23]

아래 표는 이 자료들과 인접 제품을 비교한 **경계 분석 초안**이다. 기업마다 ERP가 주문 조정까지 맡을 수 있으므로 고정된 시스템 배치나 필수 연동 목록으로 사용하지 않는다.

| 영역 | 관찰한 대표 책임 | OMS와 만나는 지점 | 확인할 경계 |
|---|---|---|---|
| OMS | 주문 약속·이행 조정·진행 가시성 [S03] | 주문 접수, 라인별 이행 요청과 결과 | 어떤 주문 상태의 최종 결정권을 갖는가 |
| ERP | 수주·납품·청구·결제 문서 연계 [S20] | 수주 전달, 청구 결과, 고객·상품 참조 | 수주와 청구의 원본, 정정 권한 |
| WMS | 피킹 등 창고 실행 [S23] | 출고 요청, 수량별 작업 결과 | 예약·실재고·출고 확정의 소유자 |
| PIM | 상품 정보 수집·보강·배포 [S24] | 주문 시 상품 정보 참조 | 최신 상품 정보와 주문 당시 값의 구분 |
| CRM | 회사·연락처 관리 [S25] | 구매 조직·담당자 참조 | 고객 식별·변경과 주문 담당자의 관계 |
| 결제 서비스 | 결제 관련 이벤트 통지 [S27] | 결과 수신·상태 대조 | 승인·결제·환불 결과를 누가 확정하는가 |
| 배송 서비스 | 운송사 추적 상태 [S28] | 운송 결과·배송 예외 수신 | 출고·배송·검수 완료를 구분하는가 |
| 라이선스/구독 시스템 | 사용 권한 모델·구독 처리 [S26] [S04] | 권한 제공·변경·종료 요청과 결과 | 주문 완료와 사용 권한 수명의 구분 |

**분석:** 상품·고객·재고의 “단일 원본”을 하나의 시스템에 모두 모아야 한다는 뜻은 아니다. 데이터 종류와 변경 권한별로 원본을 정하는 방식이 비교할 핵심이다. 같은 SKU나 고객이 여러 시스템에 보인다고 동일한 책임을 가진 것은 아니다.

## 주문 lifecycle: 공통 골격과 분기

아래는 앞의 사례를 합성한 **교육용 모델**이며, 확정 요구사항이 아니다. 금전 처리와 품목별 이행은 사업에 따라 다른 순서로 진행할 수 있다. [S03] [S20] [S26]

| 구간 | 업무상 질문 | 하드웨어 예 | 소프트웨어 예 |
|---|---|---|---|
| 상담·견적·조건 | 무엇을 어떤 조건으로 약속할 것인가 | 규격·수량·납기 | 상품·이용 기간·수량의 의미 |
| 주문 접수·확정 | 누가 주문했고 무엇을 수락했는가 | 품목별 납품 조건 | 권한 대상·조직·계약 조건 |
| 이행 계획 | 누가 언제 제공할 수 있는가 | 공급·예약·부분 출고 | 키·권한 발급 또는 외부 공급 요청 |
| 실행 요청 | 작업을 맡겼는가, 실제 끝났는가 | 창고·공급사에 출고 요청 | 제공 시스템에 권한 활성화 요청 |
| 제공 결과 | 일부 또는 전부 제공됐는가 | 출고·운송·도착 | 다운로드·키 전달·활성화 |
| 청구·수금 | 제공과 금전 처리가 일치하는가 | 부분 청구·후불 가능성 | 일회성·주기 청구 가능성 |
| 변경·취소·반품 | 이미 수행한 일을 어떻게 조정하는가 | 미출고 취소와 출고 후 반품 | 미발급 취소와 발급 후 회수 |
| 후속 관계 | 최초 주문 이후 무엇이 계속되는가 | 보증·교환 여부 | 갱신·만료·사용 권한 변경 여부 |

소프트웨어 칸은 가능한 시나리오의 구분이며 모두 우리 제품의 기능은 아니다. 영구·기간·장치 기반 라이선스의 차이는 공식 라이선스 모델에서 확인되지만, 우리가 어느 사업을 지원할지는 미정이다. [S26]

### 단일 주문 상태로 설명하기 어려운 예

**assumption EX-1 — 검증용 가상 사례:** 기업 고객이 하드웨어 10개와 소프트웨어 이용권 10개를 주문했다. 하드웨어는 8개만 도착했고, 소프트웨어는 10개가 제공됐으며 대금은 후불이다.

이때 “완료/미완료”만으로는 부족하다. 주문·품목 수량, 물리 이행, 권한 제공, 청구·수금을 서로 구분해 운영자가 설명할 수 있어야 한다는 **분석 가설**이 생긴다. 소프트웨어를 하드웨어 도착 후 활성화할지, 따로 먼저 제공할지는 계약에 따라 확인할 질문이다.

Oracle의 혼합 주문 사례는 이런 의존성이 존재할 수 있다는 근거이지 이 가상 사례의 확정 정책은 아니다. [S04]

### 예외와 역방향 흐름

| 사건 | 구분할 문제 | 관련 근거 |
|---|---|---|
| 부분 공급·부분 완료 | 미제공 잔량과 완료된 수량을 구분 | [S08] [S20] |
| 주문 변경 | 변경을 허용할 시점과 이미 시작한 작업의 조정 | [S03] |
| 취소 후 늦은 외부 결과 | 취소 의도와 실제 이행 상태의 불일치 처리 | 분석; 이벤트 순서·중복 사례 [S27] |
| 하드웨어 반품 | 원주문 품목·반품 요청·물류 결과의 연결 | [S17] |
| 소프트웨어 회수·만료 | 금전 환불과 사용 권한의 변화가 같은가 | 분석; 권한 모델 [S26] |
| 배송 실패 | 운송사의 실패 상태와 주문 재처리 판단의 구분 | [S28] |

## 공통 패턴과 사업별 패턴의 구분

| 관찰 패턴 | 근거 | 우리 제품에 대한 판단 |
|---|---|---|
| 주문과 품목을 구분 | [S10] [S17] | 공통 개념 후보; 상세 모델은 미정 |
| 이행 예정과 실제 결과를 구분 | [S03] [S08] | 주문 조정이 필요한지 확인할 기준 |
| 주문·납품·청구의 진행을 구분 | [S20] | 운영 가시성의 후보 패턴 |
| 주문 변경·반품을 추적 | [S03] [S17] | 어떤 예외가 실제로 빈번한지 조사 |
| 다거점 할당·최적화 | [S01] [S06] | 거점·공급망 복잡도가 있을 때의 조건부 후보 |
| 계약별 가격·구매 조건 | [S01] [S07] | 계약 중심 B2B 거래인지 확인 |
| 시리얼·보증 관리 | [S22] | 취급 하드웨어와 유지보수 사업에 따라 달라짐 |
| 갱신·사용량·장치 제한 | [S04] [S26] | 소프트웨어 사업 모델에 따라 달라짐 |

표는 MVP 체크리스트가 아니다. “공통으로 보임”과 “우리 첫 고객에게 반드시 필요함”은 다른 판단이다.

## 차별화 가설과 검증 방법

| 가설 | 기대하는 문제 해결 | 반증될 수 있는 경우 | 다음에 필요한 증거 |
|---|---|---|---|
| H1. 분산 주문 가시성 | 여러 공급자·시스템의 지연을 한 주문으로 설명 | 이미 ERP나 플랫폼에서 충분히 해결 | 실제 주문 추적 기록·중복 입력 사례 |
| H2. 하드웨어·소프트웨어 혼합 이행 | 물리 제공과 권한 제공의 불일치를 줄임 | 혼합 주문이 드물거나 독립 처리로 충분 | 혼합 주문·취소·환불 사례 |
| H3. 예외 처리 중심 운영 | 자동 처리에서 벗어난 주문의 담당·상태 파악 | 예외량이 낮고 수작업 비용이 작음 | 보류·오류 목록과 처리 시간 |

모두 **assumption**이며 아직 차별성이 검증되지 않았다. 단순히 두 상품 타입을 지원한다는 사실만으로 경쟁 우위를 주장하지 않는다.

## 요청한 10개 조사 항목의 연결

| 항목 | 이번 조사에서 마련한 근거 | 남은 결정 |
|---|---|---|
| 핵심 문제·OMS 유형 | 네 범주와 E1–E3/C1–C2 패턴 | 첫 고객의 가장 큰 문제 |
| 사용자·이해관계자 | 기존 제품의 역할과 사용자 후보 | 실사용자·구매자 인터뷰 |
| 주문 lifecycle | 공통 골격·분기·예외 모델 | 실제 정책과 완료 조건 |
| 기존 제품 차이 | 통합 조정·플랫폼·모듈·ERP 패턴 | 후보별 도입 적합성 검증 |
| 인접 시스템 경계 | 책임·인계 질문 표 | 고객 환경별 원본·변경 권한 |
| 공통/조건부 기능 | 패턴을 조건과 함께 분류 | MVP 필수성 |
| target customer/use case | [고객군 가설](market-trends.md) | 사용자 선택·고객 검증 |
| MVP 포함/제외 | [범위 결정에 필요한 증거](build-vs-buy.md) | 후속 Scope Definition에서 승인 |
| 기술·운영·보안 제약 | [제약 검토 목록](build-vs-buy.md) | Feasibility에서 구체화 |

## Assumptions & Open Questions

- H1–H3 및 가상 사례 EX-1은 실제 고객 검증 전 가설이다.
- B2B 내 고객 규모·업종·판매 국가·구매 역할·주문량은 미정이다.
- 하드웨어와 소프트웨어가 한 주문에 섞이는지, 두 타입을 별도 주문으로 처리해도 되는지 미정이다.
- 소프트웨어가 다운로드·영구 라이선스·기간제·구독·재판매 키 중 무엇인지 미정이다.
- OMS가 기존 ERP 위에 놓이는지, 고객에게 ERP가 없는지 미정이다.
- 실제 제품 실행, 성능, 장애 복구, 모든 버전·추가 모듈의 지원 여부는 검증하지 않았다.

## Sources

출처의 시점·한계: [출처 등록부](source-register.md).

[S01]: https://www.ibm.com/downloads/documents/us-en/131cf879ed331f5f "IBM Sterling B2B 제품 자료"
[S02]: https://www.ibm.com/case-studies/parker-hannifin-corporation "IBM Parker Hannifin 고객 사례"
[S03]: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faiom/orchestration-processes.html "Oracle Orchestration Processes"
[S04]: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/faiom/overview-of-integrating-order-management-with-subscription-management.html "Oracle OM–Subscription Management 연동"
[S05]: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/farom/Order_Manager_job_roles.html "Oracle Order Manager 역할"
[S06]: https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/selection-reservations "Adobe Commerce Source algorithms and reservations"
[S07]: https://help.shopify.com/en/manual/b2b "Shopify B2B"
[S08]: https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder "Shopify FulfillmentOrder"
[S09]: https://docs.medusajs.com/learn/introduction/architecture "Medusa Architecture"
[S10]: https://docs.medusajs.com/resources/commerce-modules/order/concepts "Medusa Order Concepts"
[S11]: https://docs.medusajs.com/resources/commerce-modules/order/links-to-other-modules "Medusa Order 모듈 연결"
[S12]: https://docs.medusajs.com/resources/recipes/digital-products "Medusa Digital Products Recipe"
[S13]: https://github.com/medusajs/medusa/blob/044fbbb9f3bb749fdb52a862b542dc3982e7cba7/packages/modules/order/src/models/order.ts "Medusa Order 모델 소스"
[S16]: https://ofbiz.apache.org/ "Apache OFBiz 공식 개요"
[S17]: https://github.com/apache/ofbiz-framework/blob/a6bee739473261da9e4f7b70c9b4630ca9afecd3/applications/datamodel/entitydef/order-entitymodel.xml "OFBiz 주문 도메인 모델"
[S18]: https://github.com/apache/ofbiz-framework/blob/a6bee739473261da9e4f7b70c9b4630ca9afecd3/applications/order/src/docs/asciidoc/order.adoc "OFBiz 주문 사용자 가이드"
[S19]: https://github.com/apache/ofbiz-framework/blob/a6bee739473261da9e4f7b70c9b4630ca9afecd3/applications/order/ofbiz-component.xml "OFBiz 주문 컴포넌트 선언"
[S20]: https://docs.frappe.io/erpnext/sales-order "ERPNext Sales Order"
[S21]: https://docs.frappe.io/erpnext/subscription "ERPNext Subscription"
[S22]: https://docs.frappe.io/erpnext/serial-no "ERPNext Serial Number"
[S23]: https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/release-to-warehouse-process "Dynamics 365 Release to warehouse"
[S24]: https://www.akeneo.com/what-is-a-pim/ "Akeneo PIM 개요"
[S25]: https://help.salesforce.com/s/articleView?id=sales.sales_core_manage_accounts_contacts.htm&language=en_US&type=5 "Salesforce Accounts and Contacts"
[S26]: https://keygen.sh/docs/ "Keygen 라이선스 모델"
[S27]: https://docs.stripe.com/webhooks "Stripe Webhooks"
[S28]: https://docs.easypost.com/docs/trackers "EasyPost Tracker"
[S30]: https://help.shopify.com/en/manual/b2b/catalogs/index "Shopify B2B Catalogs"
[S31]: https://medusajs.com/framework "Medusa Workflow 설명"
