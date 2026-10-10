# OMS 사용자 스토리와 작업 단위 연결

## Coverage Semantics

69 US·227 AC를 유지하며 각 US에 주 구현/완성 책임 Unit과 Directory를 하나 지정한다. 협력 Unit은 도메인 원본·UI/연결/운영을 구현/검증한다. 주 책임 하나가 유일한 데이터 소유자를 뜻하지 않으며 원본은14개 컴포넌트에 있다. [S1–S4]

할당/단위 검증만으로 전체 화면/API/외부/운영 AC 완료를 표시하지 않는다. 해당 경로의 필수 협력·준비/증거가 확인돼야 전체 스토리를 완료한다. HW/SW 별도 주문·직원/고객 협력은 경로별로 적용하며 나열된 모든 단위가 한 요청의 선행 조건이라는 뜻이 아니다. 공통 실행 선행은 dependency에 있고 U1이 후속 모든 규칙을 대신 구현하지 않는다.

## Story to Unit Map

| Story ID | 업무 목표 | Primary Unit ID | Directory | 협력 Unit ID | 원본 요구/수락 기준 연결 |
| --- | --- | --- | --- | --- | --- |
| US1.1 | 기업 이용 신청 | U1 | u1-integrated-foundation | U2, U8, U9 | FR1.1 |
| US1.2 | 기업 확인과 최초 관리자 지정 | U1 | u1-integrated-foundation | U2, U8, U9 | FR1.1, FR1.2 |
| US1.3 | 고객 담당자와 소속 관리 | U2 | u2-identity-enterprise-access | U8, U9 | FR1.2 |
| US1.4 | 고객 역할 정의 | U2 | u2-identity-enterprise-access | U8, U9 | FR2.2, FR2.4 |
| US1.5 | 조직 범위에 맞는 업무 접근 | U2 | u2-identity-enterprise-access | U3, U4, U5, U6, U7, U8, U9 | FR2.1, FR2.3 |
| US1.6 | 내부 직원 역할 관리 | U2 | u2-identity-enterprise-access | U3, U4, U5, U6, U7, U8, U9 | FR3.1 |
| US1.7 | MFA를 거친 업무 접근 | U2 | u2-identity-enterprise-access | U1, U3, U4, U5, U6, U7, U8, U9 | FR16.1, NFR1 |
| US1.8 | 사전 수단으로 계정 복구 | U2 | u2-identity-enterprise-access | U1, U7, U8, U9 | FR16.2 |
| US1.9 | 담당자 확인 계정 복구 | U2 | u2-identity-enterprise-access | U1, U7, U8, U9 | FR16.2 |
| US1.10 | 관리자 부재와 재지정 | U2 | u2-identity-enterprise-access | U1, U7, U8, U9 | FR1.3 |
| US2.1 | 판매 상품 등록 | U3 | u3-commercial-ordering | U2, U7, U8, U9 | FR4.1 |
| US2.2 | 기업에 허용된 상품 확인 | U8 | u8-customer-ui | U2, U3, U7, U9 | FR4.2 |
| US2.3 | 기업별 공개·가격 예외 관리 | U3 | u3-commercial-ordering | U2, U7, U8, U9 | FR4.2 |
| US2.4 | 계약 조건 등록 | U3 | u3-commercial-ordering | U2, U7, U8, U9 | FR7.1 |
| US2.5 | 계약 조건 변경 요청 | U3 | u3-commercial-ordering | U2, U7, U8, U9 | FR7.2 |
| US2.6 | 다른 등록자의 계약 승인 | U3 | u3-commercial-ordering | U2, U7, U8, U9 | FR7.3, FR3.2 |
| US2.7 | 기업 계약 우선 적용 | U3 | u3-commercial-ordering | U2, U7, U8, U9 | FR7.4 |
| US3.1 | 같은 타입 다품목 주문 제출 | U3 | u3-commercial-ordering | U1, U2, U7, U8, U9 | FR5.1, FR5.2, FR5.4 |
| US3.2 | 조건 충족 주문의 자동 확정 | U3 | u3-commercial-ordering | U2, U4, U5, U6, U7, U8, U9 | FR6.1, FR6.2 |
| US3.3 | 확인 대기 이유 파악 | U1 | u1-integrated-foundation | U2, U3, U4, U5, U6, U7, U8, U9 | FR6.2 |
| US3.4 | 주문 전체 수락 판단 | U3 | u3-commercial-ordering | U2, U4, U5, U6, U7, U8, U9 | FR6.3 |
| US3.5 | 주문 가격 변경 제안 확인 | U3 | u3-commercial-ordering | U2, U7, U8, U9 | FR4.3 |
| US3.6 | 일괄·부분 제공 선택 | U3 | u3-commercial-ordering | U2, U4, U5, U6, U7, U8, U9 | FR5.3 |
| US4.1 | 직원 청구·지급 근거 등록 | U4 | u4-financial-settlement | U2, U3, U5, U6, U7, U8, U9 | FR8.1 |
| US4.2 | 외부 청구·지급 결과 수신 | U4 | u4-financial-settlement | U2, U3, U5, U6, U7, U8, U9 | FR8.1 |
| US4.3 | 명확한 지급 자동 배분 | U4 | u4-financial-settlement | U2, U3, U5, U6, U7, U8, U9 | FR8.2 |
| US4.4 | 미배분 지급 확인·정정 | U4 | u4-financial-settlement | U2, U3, U5, U6, U7, U8, U9 | FR8.2 |
| US4.5 | 제공 건별 후불 기한 확인 | U4 | u4-financial-settlement | U2, U3, U5, U6, U7, U8, U9 | FR8.4 |
| US4.6 | 계약상 연체 제한 관리 | U4 | u4-financial-settlement | U2, U3, U5, U6, U7, U8, U9 | FR8.5 |
| US5.1 | HW 결과의 직원 근거 등록 | U5 | u5-hardware-fulfillment | U2, U3, U4, U7, U8, U9 | FR9.1, FR9.4 |
| US5.2 | HW 외부 결과 연결 | U5 | u5-hardware-fulfillment | U2, U3, U4, U7, U8, U9 | FR9.1, FR9.4 |
| US5.3 | 정책에 따른 HW 확보 진행 | U5 | u5-hardware-fulfillment | U2, U3, U4, U7, U8, U9 | FR9.1, FR9.2 |
| US5.4 | 보유 재고 예약 관리 | U5 | u5-hardware-fulfillment | U2, U3, U4, U7, U8, U9 | FR9.2 |
| US5.5 | 지급·제공 조건을 지킨 출고 | U5 | u5-hardware-fulfillment | U2, U3, U4, U7, U8, U9 | FR9.3, FR8.3 |
| US5.6 | HW 제공 완료 확인 | U5 | u5-hardware-fulfillment | U2, U3, U4, U7, U8, U9 | FR9.4 |
| US5.7 | 실패한 HW 이행 재처리 | U5 | u5-hardware-fulfillment | U2, U3, U4, U7, U8, U9 | FR9.1, FR15.1, FR15.3 |
| US6.1 | 기업 SW 권한 발급 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR10.1, FR8.3 |
| US6.2 | 발급 결과와 기간 확인 | U8 | u8-customer-ui | U2, U3, U4, U6, U7, U9 | FR10.1, FR14.1 |
| US6.3 | 실제 이용 기간 조정 요청 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR10.2, FR3.3 |
| US6.4 | 실제 이용 기간 조정 승인 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR10.3, FR3.3 |
| US6.5 | SW 제공 완료와 후불 기산 확인 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR10.4 |
| US6.6 | 실패한 SW 발급 재처리 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR10.1, FR15.1, FR15.3 |
| US7.1 | 기간제 갱신 요청 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR11.1 |
| US7.2 | 권한별 자동 갱신 신청 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR11.1 |
| US7.3 | 자동 갱신 해제 요청 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR11.2 |
| US7.4 | 계약상 자동 갱신 실행 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR11.1, FR11.2, FR11.3 |
| US7.5 | 갱신 가격 변경 합의 | U3 | u3-commercial-ordering | U2, U4, U6, U7, U8, U9 | FR11.3 |
| US7.6 | 계약 유예의 임시 이용 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR11.4 |
| US7.7 | 유예 중 지급 후 갱신 정리 | U6 | u6-software-lifecycle | U2, U3, U4, U7, U8, U9 | FR11.5 |
| US7.8 | 보상 중첩 갱신 요금 조정 | U4 | u4-financial-settlement | U2, U3, U6, U7, U8, U9 | FR12.1, FR12.2, FR12.3 |
| US8.1 | 주문 전체 변경 요청 | U7 | u7-after-sales-inquiry-notices | U2, U3, U4, U5, U6, U8, U9 | FR13.1, FR13.2 |
| US8.2 | 주문 전체 취소 요청 | U7 | u7-after-sales-inquiry-notices | U2, U3, U4, U5, U6, U8, U9 | FR13.1, FR13.2 |
| US8.3 | 주문 전체 반품 요청 | U7 | u7-after-sales-inquiry-notices | U2, U3, U4, U5, U6, U8, U9 | FR13.1, FR13.2 |
| US8.4 | 검토 중 이행 보류 판단 | U7 | u7-after-sales-inquiry-notices | U2, U3, U4, U5, U6, U8, U9 | FR13.3 |
| US8.5 | 승인된 권한 회수 결과 추적 | U6 | u6-software-lifecycle | U2, U3, U4, U5, U7, U8, U9 | FR13.4 |
| US8.6 | 환불 요청·결과·잔액 추적 | U4 | u4-financial-settlement | U2, U3, U5, U6, U7, U8, U9 | FR13.4 |
| US8.7 | 상충·미확인 근거 대조 | U7 | u7-after-sales-inquiry-notices | U2, U3, U4, U5, U6, U8, U9 | FR15.2, FR15.3 |
| US8.8 | 주문 진행과 남은 조치 확인 | U7 | u7-after-sales-inquiry-notices | U2, U3, U4, U5, U6, U8, U9 | FR14.1 |
| US8.9 | 업무 알림 수신 | U7 | u7-after-sales-inquiry-notices | U2, U3, U4, U5, U6, U8, U9 | FR14.2, FR14.3 |
| US8.10 | 확인 필요한 후속 요청 판단 | U7 | u7-after-sales-inquiry-notices | U2, U3, U4, U5, U6, U8, U9 | FR13.2, FR15.3, FR15.4 |
| US8.11 | HW 회수 요청·결과·잔량 추적 | U5 | u5-hardware-fulfillment | U2, U3, U4, U6, U7, U8, U9 | FR13.4 |
| US8.12 | 직원의 업무 진행 조회 | U9 | u9-staff-ui | U2, U3, U4, U5, U6, U7, U8 | FR14.1, FR3.1, NFR1 |
| US9.1 | 자동 복구 시도·실패 알림 | U10 | u10-operational-assurance | U1, U2, U3, U4, U5, U6, U7, U8, U9 | NFR10 |
| US9.2 | 성공 접수 데이터 보존 복구 | U10 | u10-operational-assurance | U1, U2, U3, U4, U5, U6, U7, U8, U9 | NFR3, NFR4, NFR5, NFR9 |
| US9.3 | 계획 점검과 1인 배포 검증 | U10 | u10-operational-assurance | U1, U2, U3, U4, U5, U6, U7, U8, U9 | NFR8, NFR9 |
| US9.4 | 변경·승인·정정 이력 확인 | U7 | u7-after-sales-inquiry-notices | U1, U2, U3, U4, U5, U6, U9 | FR15.4 |
| US9.5 | 국내 데이터 저장 확인 | U10 | u10-operational-assurance | U1, U2, U3, U4, U5, U6, U7, U8, U9 | NFR11 |
| US9.6 | 핵심 업무별 가용성 평가 | U10 | u10-operational-assurance | U1, U2, U3, U4, U5, U6, U7, U8, U9 | NFR2 |
| US9.7 | 반복 기술 운영 부담 평가 | U10 | u10-operational-assurance | U1, U2, U3, U4, U5, U6, U7, U8, U9 | NFR9 |

## Unit Coverage Summary

| Unit ID | Directory | Kind | 주 책임 US | 협력/확장 범위 |
| --- | --- | --- | --- | --- |
| U1 | u1-integrated-foundation | service | US1.1, US1.2, US3.3 | 필요한 신원/MFA·기업 승인/권한과 최소 상품 등록/조회·주문 접수/지속 기록·확인 대기/진행 조회를 실제 연결한다. API·worker 실행 기반과 고객/직원 UI의 최소 독립 빌드/배포 경로, 실행에 필요한 최소 기술 준비와 공통 계약/통합 접점을 포함한다. 후속 모듈이 없으면 공급/지급/제공을 미확인으로 유지한다. |
| U2 | u2-identity-enterprise-access | library | US1.3, US1.4, US1.5, US1.6, US1.7, US1.8, US1.9, US1.10 | MFA/복구·확인된 동일인, 기업/조직/소속·역할/행위별 범위·관리자 부재/재지정을 완성한다. U1 기본 경로를 확장하고 실제 UI 접점은 U8/U9와 연결한다. |
| U3 | u3-commercial-ordering | library | US2.1, US2.3, US2.4, US2.5, US2.6, US2.7, US3.1, US3.2, US3.4, US3.5, US3.6, US7.5 | 공통 상품 조건·기업 예외·다른 사람 계약 승인·버전별 제안/동의, 구매 당시 조건 보존·타입별 다품목/선후불·전체 수락/확인 대기·제공 선택을 완성한다. 공급/대금 판단은 공통 계약을 통해 소유자 결과를 이용한다. |
| U4 | u4-financial-settlement | library | US4.1, US4.2, US4.3, US4.4, US4.5, US4.6, US7.8, US8.6 | 직원/외부 청구·지급·배분/정정·환불 실제 결과/한도·품목별 지급 조건·후불/연체·보상 중첩 요금 조정을 소유한다. 제공/보상/후속 허용 사실은 각 소유자의 계약으로 연결한다. |
| U5 | u5-hardware-fulfillment | library | US5.1, US5.2, US5.3, US5.4, US5.5, US5.6, US5.7, US8.11 | HW 공급/납기 근거, 재고 예약·확보 정책·지급/전체·부분 조건·출고·합의 배송/인수·회수/잔량·미확인/충돌/실패 재처리를 소유한다. U3/U4와 실제 판단/결과 통합을 검증한다. |
| U6 | u6-software-lifecycle | library | US6.1, US6.3, US6.4, US6.5, US6.6, US7.1, US7.2, US7.3, US7.4, US7.6, US7.7, US8.5 | 기업 수량의 영구/기간제 발급·실제 기간·기간 조정/별도 승인·수동/자동 갱신·계약 우선·새 동의·유예/보상·실제 회수를 소유한다. U3/U4와 지급/기간/요금 조정을 통합 검증한다. |
| U7 | u7-after-sales-inquiry-notices | library | US8.1, US8.2, US8.3, US8.4, US8.7, US8.8, US8.9, US8.10, US9.4 | 전체 주문 변경/취소/반품·보류/계속 판단, 소유자별 실제 결과/원본 이력·남은 조치의 권한별 조합 조회, 최소 안내/통지 전달 결과를 완성한다. 각 업무의 원본 대조/정정·실제 환불/회수는 해당 소유자에게 둔다. |
| U8 | u8-customer-ui | ui | US2.2, US6.2 | 고객 C01–C09와 고객 인증/가입/복구의 전체 화면을 실제 API에 연결한다. 주문/계약 제안 동의·조직/역할/범위·대금/권한/후속 요청을 허용 정보로 표현하고 상태/오류/미확인·키보드/접근성을 검증한다. |
| U9 | u9-staff-ui | ui | US8.12 | 직원 S01–S11과 인증/복구, 등록/판단/승인·대금/HW/SW·후속 처리를 실제 API에 연결한다. 사내망/승인 원격 PC·행위 권한·계약 다른 사람 승인/기간 동일인 별도 승인을 각각 표현한다. |
| U10 | u10-operational-assurance | service | US9.1, US9.2, US9.3, US9.5, US9.6, US9.7 | 배포되는 진단/접수·결과 대조 실행 코드와 공통 CDK·검사/배포·관측/복구·국내 저장·가용성/사람 작업 증거를 연결한다. OMS 장애 중 복구 시도/실패 통지 경로를 검증한다. 상시 운영 웹 서비스·OMS 운영 대시보드를 추가하지 않고 실제 운영 도구/실행 위치는 후속 설계에서 정한다. |

## 단위 내부 구현·검증 순서

아래는 Unit 안의 입력/근거→판단→실제 결과/조회·실패/경계 검증 순서다. Unit 간 실행 순서/Bolt 우선순위가 아니며 다른 대안 경로를 모두 강제하지 않는다. U1의 기초 경로를 해당 모듈이 실제로 확장/통합해 확인하고 협력 UI/원본/운영 검증은 각 행과 연결한다.

### U1 최소 통합 실행 기반

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US1.1, US1.2 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 2 | US3.3 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

후속 Unit 없이 실제 신원/MFA·기업 승인/권한·상품 입력/조회·주문 접수/지속 기록·확인 대기/진행 조회를 실행한다. 최소 통지·이력/대조·worker/실행 준비는 그 경로에 필요한 범위를 포함한다. 실제 계정/경로·데모·명령은 관련 설계와 Delivery Planning/구현 확인에서 정한다.

### U2 신원·복구·기업 접근 확장

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US1.3, US1.4, US1.6 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 2 | US1.5, US1.7 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 3 | US1.8, US1.9, US1.10 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

고객15행위/4범위·행위별 합집합, 내부 역할·관리자0 허용/경고·신원 복구/재등록을 검증한다. 인증 성공·계정/역할 관리를 모든 업무 권한으로 확대하지 않는다. 직원 복구/동일인 증거와 효력은 OQ4에서 확인한다.

### U3 상품·계약·주문 판단

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US2.1, US2.3, US2.4 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 2 | US2.5, US2.6, US2.7 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 3 | US3.1, US3.6 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 4 | US3.2, US3.4, US3.5 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 5 | US7.5 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

계약·전체 공급 가능성/납기 근거가 확인돼야 전체 자동 수락한다. 무효 기업/권한/타입/입력은 직원 판단으로 우회하지 않는다. 후속 공급/대금 근거가 없으면 전체 확인 대기다. 계약 등록자와 같은 사람의 다른 계정 승인도 금지한다.

### U4 대금·배분·환불

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US4.1, US4.2 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 2 | US4.3, US4.4 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 3 | US4.5, US4.6 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 4 | US7.8, US8.6 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

배분/환불의 중복/초과·확인 금액/합의 한도를 검증한다. 후불은 원본 제공 수량별 완료 근거로 기산하며 선결제 필요액에 후불을 합산하지 않는다. 공급/보상/허용 입력의 합성 계약 시험과 실제 주체 실증을 구별한다.

### U5 HW 공급·이행·회수

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US5.1, US5.2 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 2 | US5.3, US5.4 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 3 | US5.5, US5.6 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 4 | US5.7, US8.11 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

확보 네 정책·예약·지급·일괄/명시 부분 제공·합의 배송/인수 완료를 적용한다. 직원/외부 충돌·중복/초과·출고/취소 경합·늦은 결과·미확인 재실행을 대조한다. 실제 창고/운송/조달 전체의 권위를 소유하지 않는다.

### U6 SW 권한·기간·갱신

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US6.1, US6.5 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 2 | US6.3, US6.4, US6.6 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 3 | US7.1, US7.2, US7.3 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 4 | US7.4, US7.6, US7.7 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 5 | US8.5 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

기업 수량·영구/기간제·구매 당시/실제 기간을 구별한다. 기간 조정의 같은 사람 별도 승인을 계약 자기 승인 금지와 구별한다. 수동 갱신도 지급/유예·실제 적용/고객 결과까지 연결하고 기업 계약 우선·보상/유예/원래 일정·중첩 요금/새 동의를 유지한다.

### U7 후속 판단·조합 조회·통지

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US8.1, US8.2, US8.3 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 2 | US8.4, US8.10 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 3 | US8.7, US8.8 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 4 | US8.9, US9.4 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

고객 후속 요청은 전체 주문 단위다. 실제 부분 회수/환불/잔량은 원본 소유자에게 둔다. 조합 조회/통지는 중앙 실행 조정자가 아니며 요약/목록/알림/이력의 정보 권한을 유지한다.

### U8 고객 PC UI

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US2.2 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 2 | US6.2 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

고객 C01–C09·인증/가입/복구를 실제 API와 연결한다. U1 최소 UI를 확장하며 고객 요청/새 동의와 실제 적용 결과를 구별한다. 최신 PC/접근성 조건을 유지한다.

### U9 직원 PC UI

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US8.12 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

직원 S01–S11·인증/복구를 실제 API와 연결한다. 사내망/승인 원격 PC·행위 권한 및 계약 다른 사람 승인/기간 같은 사람 별도 승인을 구별한다. 직원 신분으로 모든 민감 근거를 열지 않는다.

### U10 기술 운영 검증·공통 준비

| 단위 내부 단계 | 주 책임 스토리 | 검증 관점 |
| --- | --- | --- |
| 1 | US9.1 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 2 | US9.2, US9.3 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 3 | US9.5 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |
| 4 | US9.6, US9.7 | 입력/권한·근거 → 판단/승인 → 실제 결과·미확인/실패·경계 연결 |

실행 코드와 공통 CDK·검사/배포·관측/복구·한국 저장·사람 작업 증거를 연결한다. 전송 요청을 수신/복구 성공으로 표시하지 않는다. 30일 관측·단기 장애 시험·목표/실제 달성을 구별한다.

## Cross Cutting and Integration Acceptance

- U2와 실행/조회 소유자·U8/U9가 신원/MFA·기업/행위별 범위·변경/복구를 함께 검증한다. UI 숨김으로 서버 권한을 대체하지 않는다.
- U3는 상품/기업 예외·계약/새 동의·구매 당시 조건, U4는 실제 금액, U5는 HW 수량, U6는 SW 기간/권한을 소유한다. 요청/승인/통지와 실제 적용/제공/회수/환불을 구별한다.
- U3 전체 수락/제공 선택은 U4/U5/U6의 확인 조건/원본을 함께 검증한다. 한 품목이라도 미확인/충돌/조회 실패면 전체 확인 대기다. 무효 기업/권한/타입/입력의 직원 우회는 금지한다.
- US7.1 수동 갱신은 U6 요청으로 끝나지 않고 U3 계약/새 동의·U4 지급/유예/요금과 실제 기간/고객 결과로 연결한다. US7.5 제안/동의는 U3, 회차/기간은 U6이며 계약 우선·보상/유예/원래 일정·중첩 요금을 구별한다.
- U7 후속 판단은 전체 주문 요청이다. US8.5 U6 실제 권한 회수, US8.6 U4 환불/잔액, US8.11 U5 HW 회수/잔량과 연결한다. 승인만으로 완료를 표시하지 않는다.
- US8.7의 원본 대조/정정은 U4/U5/U6 각 ReconciliationCase 소유자에게 있고 U7은 허용된 조합 조회/후속 연결을 맡는다. 의존 업무만 보류하고 무관 업무를 일괄 중단하지 않는다.
- US8.8·US8.12·US9.4의 진행/이력은 U7·U8/U9 및 원본 소유자와 연결한다. 요약/목록/알림/이력도 동일 정보 권한이며 숨김을0원/미지급/실패로 치환하지 않는다.
- US8.9 업무 통지 U7과 US9.1 운영 시도/실패 통지 U10은 실제 전달/근거를 구별한다. 고객 이메일은 최소 안내/로그인 링크이고 키/계약 상세를 제외한다. 전송·수신·동의/업무 완료를 구별한다.
- US9의 성공 접수/결과 대조·배포/저장/가용성/사람 작업은 U10이 실제 실행/운영 주체와 연결한다. 신규 운영 대시보드를 추가하지 않고 실제 증거를 요구한다.

## 이전 보완 의견의 담당과 구현 전 확인

| 근거 | 소유·담당 | 구현 전 확인 |
|---|---|---|
| Domain Design R-01:주문 보호 대상 부서/사업장 문맥 누락 | OrderAcceptance 소유. U1 최소 주문 Functional Design, U2 접근·U3 주문 완성 및 U4/U6/U7·U8/U9의 연결 조회 | U1 주문 코드 전에 보호 대상 문맥·Department/BusinessSite 원본 연결과 동일 문맥 사용 경로를 명시한다. 요청자 현재 소속으로 과거 주문 문맥을 추측하지 않는다. 조직 변경 효력은 OQ4로 별도 확인한다. |
| Domain Design R-02:교차 참조5건 누락 | U3 CommercialProposal→U6 RenewalCycle, U3 PurchaseTermsSnapshot→U3 CommonOfferRevision, U3 OrderChangeApplication→U3 CustomerConsent, U4 FinancialEligibility→U6 RenewalCycle, U5 HardwareFulfillmentCase→U4 FinancialEligibility | 관련 Contract/Functional Design에서 식별자·원본 소유자·관계/버전·복제 값/외부 근거를 선언/대조하고 인터페이스/스키마 코드 전에 확인한다. 같은 Unit 안에서도 서로 다른 컴포넌트의 원본 참조를 유지한다. |

이는 후속 책임/확인 조건이며 과거 검토의 해결 판정이 아니다. 검증되지 않은 대상 문맥·계약/동의/금액/수량/기간·공급/대금 결과를 자동 허용·성공으로 구현하지 않는다.

## Traceability and Verification

traceability.json은 동일69 US를 upstream_ids/coverage에 한 번씩 선언하고 이 표의 Primary Unit ID를 OK target으로 둔다. 모든 target은 Unit 정의/Directory·dependency에 존재하고 모든 Unit은 주 책임 스토리와 협력 범위가 있다. OK는 논리 할당/연결이며227 AC 통과·실제 계정/연동/데이터·운영/상용 준비가 아니다. AC별 규칙/API/시험은 관련 후속 단계에서 구체화한다.

## Assumptions & Open Questions

- A-UG1 [assumption]:10개 단위·상대 규모·공통 실행 기반 위 확장이 실제 개발/기술 운영에 적합하다. 인원 수로 기능을 축소하지 않고 변경/부하/복구·운영 부담을 검증한다.
- A-UG2 [assumption]:첫 실제 통합에 필요한 신원/기업 확인·지속 기록·실행/기본 통지·대조 경로를 확보할 수 있다. 후속 구현·제공자·실제 계정을 완료된 선행 조건으로 가정하지 않는다.
- A-UG3 [assumption]:공통 소유자 계약·모듈/호스트 연결·버전 대조로 무순환 개발 DAG와 실제 사실 왕복을 함께 구현할 수 있다. 실제 포트/패키지/저장/전달·동시 제어/실증은 후속 설계에서 확인한다.
- Domain Design의 두 수용된 미해결 의견은 아래 담당/구현 전 조건으로 이어받는다. 이 할당을 해결 판정이나 과거 원본 변경으로 보지 않는다.
- OQ1–OQ2:계약 필수 값/버전·금액/기간/달력/반올림 산식·보류/정지/정정/한도·전이/동시 처리. U3–U7의 관련 Contract/Functional Design과 코드 전에 확인한다.
- OQ3:실제 재고/예약 권위·최신성·확보/출고/배송/인수·청구/지급/환불 주체/접근권, SW 수량/발급/전달/적용/회수 근거. U3–U7이 관련 계약/구현 약속·실거래 전에 실증한다.
- OQ4:실제 기업/첫 관리자·계정/동일인·MFA/복구·직원 망/PC·세션/권한 효력. U1/U2와 관련 실행/승인/조회 소유자가 접근 설계·코드/실제 계정 처리 전에 확인한다.
- OQ5–OQ7:분류/보관·고객 데이터/포함 로그·백업/외부 제공자 한국 저장, 장애/물리 대재난 제외·논리 손상/오삭제·RTO/RPO·야간/측정, 실제 알림/수신/재알림·장애 중 경로. U1/U7/U10과 원본 소유자가 관련 NFR/Infra/운영·실데이터/상용 약속 전에 검증한다.
- OQ8–OQ9:입력 상한/필터·화면/비동기/부하 측정, 검사 도구/대상/차단선·실행/배포/복구 방법. 관련 단위/단계에서 확인하며 이미 결정한 PC/브라우저/접근성 방향을 재질문하지 않는다.
- OQ10·HB-01–HB-08:실제 고객/가치·연동/실데이터/운영 증거·비용/업무량/지원 및 등록자 외 계약 승인자 확보. 개발자1명을 모든 사업/승인 역할의 인원으로 가정하지 않는다.

## Sources

- S1: [components](../domain-design/components.md), [decisions](../domain-design/decisions.md) —14개 논리 코드 책임·단일 원본 소유·ADR와 의도적 사실 왕복.
- S2: [requirements](../requirements-analysis/requirements.md), [stories](../user-stories/stories.md) —69 US·227 AC, 전체 기능·접근·실제 결과·정확성/운영 목표와 OQ1–OQ10.
- S3: [이번 질문과 요약 확인](units-generation-questions.md) —Q1 A·Q2 A·Q3 B·Q4 A·Q5 A·Q6 A·Looks correct. 초기6–9개는 후보 추정이고10개 단위·kind·배포 모델·DAG는 별도 Approve Plan으로 확인했다.
- S4: [team-practices](../practices-discovery/team-practices.md), [최신 UI 결정](../refined-mockups/refined-mockups-questions.md), [mockups](../refined-mockups/mockups.md), [interaction-spec](../refined-mockups/interaction-spec.md) —최소 통합 동작·1인 구조/전체 기능·테스트/배포 원칙, PC1280 이상·고객 모바일 미정·직원 모바일 제외·권한 정보 투영.
- S5: [이전 Domain Design 검토](../domain-design/reviews/review-01.md) —조직 문맥 및 교차 참조5건의 근거. 사용자의 미해결 수용은 감사 기록에 있고 당시 원문을 소급 수정하지 않는다.

일반 OMS/외부 제품 기능을 새 요구로 도입하지 않는다. 단위/종류/배포 역할은 확인한 답변과 구성 계획의 설계 선택이며 실제 구현·계정/연동·운영 목표 달성의 증거가 아니다.

