# OMS 개발 묶음 계획

> **첫 배포 범위 변경 — 2026-10-11:** 아래 전체 제품 계획을 보존하고 고객사10곳 이내 제한 파일럿의 배포 대상·완료 조건에는 [확정 범위](../../release-planning/first-release-scope-proposal.md)와 [첫 배포 실행 계획](../../release-planning/first-release-delivery-plan.md)을 적용한다. U3~U10의 필요한 부분을 먼저 연결하고 대량 부하·재해 실증·고급 자동화는 후속으로 남긴다. 기존 DAG·단계 상태·원본 검증 판정은 변경하지 않는다.

## 목적과 확정 범위

Bolt는 하나의 구현 단위를 해당 설계·코드 구현으로 완성하고 실행 결과를 확인하는 개발 묶음이다. 확인된 Q1–Q5와 Looks correct에 따라 10개 Unit을 10개 Bolt로 계획한다. 모든 69개 스토리·227개 AC와 기능/NFR을 유지한다. 단위 완료는 해당 코드 범위의 검증이며, 협력 단위·실제 제공자·전체 화면·운영 증거가 필요한 스토리의 전체 완료와 구별한다. [S1–S10]

## Implementation Sequence

| 순서 | Bolt | Unit | Directory | 업무 결과 | 직접 선행 Unit | 주 책임 US 수 |
|---|---|---|---|---|---|---|
| 1 | B01 | U1 | u1-integrated-foundation | 최소 통합 실행 기반 | 없음 | 3 |
| 2 | B02 | U2 | u2-identity-enterprise-access | 신원·복구·기업 접근 확장 | U1 | 8 |
| 3 | B03 | U3 | u3-commercial-ordering | 상품·계약·주문 판단 | U1, U2 | 12 |
| 4 | B04 | U4 | u4-financial-settlement | 대금·배분·환불 | U1, U2, U3 | 8 |
| 5 | B05 | U5 | u5-hardware-fulfillment | HW 공급·이행·회수 | U1, U2, U3, U4 | 8 |
| 6 | B06 | U6 | u6-software-lifecycle | SW 권한·기간·갱신 | U1, U2, U3, U4 | 12 |
| 7 | B07 | U7 | u7-after-sales-inquiry-notices | 후속 판단·조합 조회·통지 | U1, U2, U3, U4, U5, U6 | 9 |
| 8 | B08 | U8 | u8-customer-ui | 고객 PC UI | U1, U2, U3, U4, U5, U6, U7 | 2 |
| 9 | B09 | U9 | u9-staff-ui | 직원 PC UI | U1, U2, U3, U4, U5, U6, U7 | 1 |
| 10 | B10 | U10 | u10-operational-assurance | 기술 운영 검증·공통 준비 | U1, U2, U3, U4, U5, U6, U7, U8, U9 | 6 |

위 순서는 현재 DAG의 선언 순서에 맞는 유효한 위상 순서다. HW/SW와 고객/직원 UI 사이에 가짜 의존을 추가하지 않는다. 실제 Construction은 unit-of-work-dependency와 기록된 단위별 순차 설정을 사용한다. 계획 파일만 바꾸어 실행 순서가 바뀌었다고 주장하지 않으며 첫/후속 실행 Unit을 이 계획과 대조한다. 순서의 경제적 이유와 대안은 [risk-and-sequencing-rationale](risk-and-sequencing-rationale.md)에 있다. 선행 미완료/준비 부족은 [external-dependency-map](external-dependency-map.md)과 연결한다.

## Common Definition of Done

- 해당 Unit의 설계·미정 업무 정책·권한/target·상태/산식·NFR/인프라 조건을 관련 코드 전에 구체화하고, 적용되는 설계 단계와 Code Generation 및 실행 검증을 완료한다. 설계 문서 검토만으로 실제 동작 완료를 표시하지 않는다.
- test-after·Standard를 유지한다. 직접 작성한 테스트 가능한 제품 코드 전체(미실행 파일 포함)의 라인 커버리지 80% 하한과 해당 정상·실패·권한·중복/역순·동시·복구/호환 검증을 수행한다. 전체 스토리의 남은 협력 검증을 추적한다.
- 비밀/SAST/의존성/CDK·생성 인프라/격리 실행 보안 검사를 적용 대상·도구·차단 기준과 함께 확인한다. 필수 검사 실패·누락·보고서 부재는 해당 병합/배포를 보류한다. U1의 최초 병합/검증 환경 적용에도 필요한 최소 검사/자동 실행 준비를 포함한다. 뒤의 CI Pipeline 단계는 전체 코드의 종합 연결을 완성한다.
- logical owner를 통해서만 원본을 변경한다. 경로/target/data·기업/부모·기대 버전, 현재 권한·접수 principal/audience, 실제 완료 근거·정정 버전을 서버에서 검사한다. UI 버튼 감춤이나 JSON Schema 통과를 이 실행 검증으로 대체하지 않는다.
- 원자 기록·대기 작업/사실·안정 식별자·결과 대조·제한된 재시도와 버전 호환을 검증한다. 후속 Unit은 U1의 계약/등록 접점을 사용하고 앞선 Unit에 미구현 후속 패키지를 import하지 않는다.
- 해당 실제 제공자/계정/네트워크·업무 담당자 준비가 없으면 계약/합성 시험의 범위를 표시하고 실제 어댑터/실거래 완료를 보류한다. 허용된 직원 근거 경로도 권위·증거·권한 확인이 필요하다.
- 코드 변경/공통 등록·호스트 변경의 소유와 검증 결과를 Construction 기록에 남긴다. main 기준의 짧은 브랜치·squash·staging 자동 배포·production 별도 확인을 유지한다. 문서 승인이나 Unit 체크포인트를 운영 배포 승인으로 확대하지 않는다.

## Walking Skeleton and Verification

첫 통합 버전(walking skeleton)은 U1만으로 필요한 UI→신원/MFA/기업·권한→상품/접수→지속 기록/확인 대기/재조회가 실제로 연결되는 가장 작은 실행 결과다. U1은 후속 Unit에 선행하며 공급/대금/발급 미확인은 그대로 대기로 표시한다.

- 첫 시연은 아래 B01의 합성 고객사 2개·타입별 주문·재조회·재시작/기업 분리로 확인한다. 두 기업·상품 수와 시험 금액/날짜는 fixture이며 제품 상한/기본값이나 실제 고객 검증이 아니다.
- 신원/MFA·직원 접속 경로/권한·지속 보존/복구·실행/기본 통지 조건은 U1의 해당 설계와 코드 전에 확인한다. 실제 계정/권위가 없는 업무 검증은 합성 조건으로 표시한다. 완료를 주장할 경로의 최소 준비가 없으면 첫 동작 승인을 보류하고 그 준비를 해결한다.
- 현재 OMS 제품 검증 명령은 미정이다. 실제 통합 검사 스크립트가 준비된 뒤 최초 체크포인트의 검증 전에 전체 명령을 별도로 제시·승인받고 실행한다. 명령 필드는 비워 두며 프레임워크 검사나 가짜 명령을 기록하지 않는다.
- 실제 통합 검증과 사용자 skeleton 승인 뒤에 이후 자동 진행/체크포인트 검토를 선택한다. 현재 자동 진행 권한은 없다. 단위별 순차 진행·한 세션 작업 소유를 유지한다.
- 공통 Build and Test·CI Pipeline은 현재 작업 순서에서 완료된 Unit을 대상으로 종합 수행한다. 그 전의 Unit 실행 검증·필수 검사·검토와 첫 통합 승인도 각각 수행한다.

## Bolt Definitions

### B01 — 최소 통합 실행 기반

- **Unit:** U1 / u1-integrated-foundation
- **Walking skeleton:** true
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US1.1, US1.2, US3.3 (3개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** 다른 Unit 선행 없음; 첫 실행 경로의 준비 조건 확인; ED01, ED02, ED03, ED04, ED10, ED11, ED12, ED13, ED14, ED15, ED16. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C00–C03, C05, C10–C19 및 첫 경로의 등록/읽기 포트.
- **Definition of Done:** 공통 완료 기준과 함께 실제 MFA·기업 승인·직원/고객 권한과 상품 입력/조회·HW/SW 별도 접수·지속 기록·확인 대기·같은 접수 ID 조회를 연결한다. 최소 고객/직원 UI·API·worker·통지/이력과 실행 준비가 후속 Unit 없이 동작한다. 다른 고객사 접근, 미승인/MFA 미완료·상품 타입 위반, 같은 요청의 중복 접수, 재시작 후 재조회·미전달 작업 대조를 검사한다. 보호 대상 부서/사업장 문맥을 U1 Functional Design에서 확정하고 주문 코드 전에 같은 문맥으로 권한을 검사한다.
- **Confidence hypothesis:** 공통 실행 기반만으로 실제 안전한 접수·보존·재조회가 가능하고, 공급/대금/발급 근거가 없을 때 확인 대기를 유지할 수 있다.
- **Expected demo:** 합성 고객사 2개를 준비하고 필요한 신원/MFA·기업/권한 준비를 거친다. 내부 직원 상품 등록 → 각 고객의 HW/SW 별도 주문 → 확인 대기 → 원래 접수 ID 재조회 → API/worker 프로세스 재시작 후 같은 기록/결과 대조 → 타 고객사 읽기/행동 거절. 사업 값은 합성이지만 실행 코드·MFA·서버 권한·지속 기록을 화면 모사로 대체하지 않는다.
- **Integration/remaining evidence:** C18의 업무 변경·대기 작업/사실 원자 기록, C16/C17의 서버 target 구성·requestId/현재 권한 대조, C13–C15 실행/빌드 등록을 확인한다. 미등록 후속 공급자에는 미확인/의존 준비 부족을 반환한다. 실제 검증 명령과 그 장애 범위는 최초 체크포인트의 검증 전에 별도 승인받는다.

### B02 — 신원·복구·기업 접근 확장

- **Unit:** U2 / u2-identity-enterprise-access
- **Walking skeleton:** false
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US1.3, US1.4, US1.5, US1.6, US1.7, US1.8, US1.9, US1.10 (8개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** U1; ED02, ED03, ED04, ED14. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C01, C02, C16, C17, C21.
- **Definition of Done:** 공통 완료 기준과 함께 고객 15행위·4범위·행위별 합집합, 조직/소속/역할 변경, 내부 역할, 관리자 0명 경고/복구, 사전 및 담당자 확인 MFA 복구를 완성한다. 관리 권한을 모든 업무 권한으로 확대하지 않고 현재 세션/대기 작업의 변경 효력을 확인한다. 이전 인증 수단 무효화·동일인 참조와 복구 이력/통지를 검증한다.
- **Confidence hypothesis:** 권한 변화와 신원 복구 뒤에도 기업·조직·행위 경계가 화면/API/worker/조회에서 일관된다.
- **Expected demo:** 조직별 조회/실행 권한 부여 → 미부여 행위 거절 → 조직/역할 변경 후 접근 재평가 → 마지막 관리자 비활성화와 직원 재지정 → MFA 복구·재등록 후 옛 수단 거절.
- **Integration/remaining evidence:** U1 경로를 실제로 확장하고 U3–U7의 실행/조회가 소비할 인증/권한 계약을 고정한다. 전체 고객/직원 화면과 통지는 B07–B09에서 다시 대조한다.

### B03 — 상품·계약·주문 판단

- **Unit:** U3 / u3-commercial-ordering
- **Walking skeleton:** false
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US2.1, US2.3, US2.4, US2.5, US2.6, US2.7, US3.1, US3.2, US3.4, US3.5, US3.6, US7.5 (12개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** U1, U2; ED01, ED03, ED05, ED06, ED07, ED08, ED09, ED18. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C02–C05, C16, C17, C00의 승인된 구매 조건.
- **Definition of Done:** 공통 완료 기준과 함께 내부 직원 전용 등록, 공통 조건/기업 예외, 계약 등록·다른 사람 승인·근거·변경 이력, 기업 계약 우선, 주문 당시 조건 보존과 변경 제안/새 동의를 구현한다. 같은 타입 다품목·일괄/명시 부분 제공과 전체 수락/확인 대기를 검증한다. 한 품목의 미확인·충돌·조회 실패는 전체 확인 대기이며 무효 기업/권한/타입/입력은 거절한다. 승인자가 없는 계약은 미승인이다.
- **Confidence hypothesis:** 판매 수락이 확인된 전체 조건에만 의존하며, 상품/계약 변경이나 같은 사람의 다른 계정으로 구매 조건/승인을 우회할 수 없다.
- **Expected demo:** 기업 예외 가격 등록·다른 사람 승인 → 다품목 주문 → 한 품목의 공급 근거 미확인으로 전체 대기 → 조건/납기 근거가 확인된 수락 → 기존 주문 가격 보존과 변경 제안 거절/동의. 초기 공급/대금 입력은 표시된 계약 fixture로 검사한다.
- **Integration/remaining evidence:** 앞선 Unit에서 후속 구현을 import하지 않는다. U1 포트의 합성 소비 시험을 수행하고 B04–B06에서 실제 등록된 대금/HW/SW 공급자와 수락·부분 제공 판단을 다시 검증한다. 합성 수락은 실제 재고/제공 약속의 증거가 아니다.

### B04 — 대금·배분·환불

- **Unit:** U4 / u4-financial-settlement
- **Walking skeleton:** false
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US4.1, US4.2, US4.3, US4.4, US4.5, US4.6, US7.8, US8.6 (8개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** U1, U2, U3; ED01, ED05, ED07, ED08, ED09, ED14. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C06, C07/C08 readCompletionFact, C20-E25/C20-E29, C22, RC01/RC02.
- **Definition of Done:** 공통 완료 기준과 함께 직원/외부 청구·지급 근거, 명확한 배분·미배분/정정, 환불 요청/실제 결과/잔액, 선후불 품목 조건·한도·연체 제한을 구현한다. 중복/초과 효과 0, 제공 건 ID·품목·수량·완료일·원본/정정 버전별 기산, 불명 결과 대조와 관련 업무만 보류를 검사한다. SW 보상 중첩 금액 조정은 확인된 산식/합의 근거만 적용한다.
- **Confidence hypothesis:** 금액과 제공 건별 기간 계산을 중복·역순·정정·응답 미확인 중에도 일관되게 유지할 수 있다.
- **Expected demo:** 확인된 지급 배분 → 같은 결과 재수신 → 미배분/상충 근거 보류 → 서로 다른 날 제공된 두 건의 후불 기한 → 한 건의 수량/날짜 정정과 늦은 이전 버전 무효 → 환불 응답 미확인/재대조. HW 배송/인수와 SW 세 완료 조건의 계약 fixture를 함께 사용한다.
- **Integration/remaining evidence:** U5/U6 실제 구현 대신 U1에 선언한 최소 읽기 포트와 합성 계약으로 선행 개발한다. 실제 HW/SW 제공자 등록·공백/최신 대조·정정 효과는 B05/B06에서 반드시 다시 검증한다. readCompletionFact는 기업/주문/품목에 제한하며 SW 키를 받지 않는다.

### B05 — HW 공급·이행·회수

- **Unit:** U5 / u5-hardware-fulfillment
- **Walking skeleton:** false
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US5.1, US5.2, US5.3, US5.4, US5.5, US5.6, US5.7, US8.11 (8개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** U1, U2, U3, U4; ED01, ED05, ED06, ED07, ED08. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C07, C23, C20-E25, C06과 C05의 판단/대조 계약.
- **Definition of Done:** 공통 완료 기준과 함께 업무별 직원/외부 근거, 실제 재고/예약 권위, 네 확보 정책·지급/일괄/부분 조건, 출고·배송/인수와 회수/잔량·재처리를 완성한다. 출고만으로 완료하지 않으며 선택한 배송 완료 또는 고객 인수 기준을 따른다. 출고/취소 경합·과수량·중복/늦은 결과·직원/외부 충돌을 대조한다.
- **Confidence hypothesis:** 실제 HW 제공 수량과 날짜가 대금/후불 조건으로 전달되고, 미확인/실패 재처리에서도 성공분을 다시 실행하지 않는다.
- **Expected demo:** 직원 근거 또는 검증된 이행 경로로 확보 → 지급 조건에 맞춘 출고 → 배송만 완료한 경우와 고객 인수 기준을 구별 → 나눠 제공한 건별 대금 기산 → 정정/중복·남은 수량 재처리·회수 결과 확인.
- **Integration/remaining evidence:** U3 수락/선결제 판단·U4 후불/환불과 실제 호스트 등록으로 연결한다. 선택한 실제 실행 주체·직원 근거의 권위/접근 조건을 확인하지 못한 경로는 실증/실거래 준비 완료로 표시하지 않는다. WMS·실제 운송 전체는 범위 밖이다.

### B06 — SW 권한·기간·갱신

- **Unit:** U6 / u6-software-lifecycle
- **Walking skeleton:** false
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US6.1, US6.3, US6.4, US6.5, US6.6, US7.1, US7.2, US7.3, US7.4, US7.6, US7.7, US8.5 (12개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** U1, U2, U3, U4; ED01, ED08, ED09, ED14, ED18. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C08, C24, C20-E29, C04/C06/C09의 갱신·보상·후속 계약.
- **Definition of Done:** 공통 완료 기준과 함께 우리 측 기업 수량의 영구/기간제 권한 발급·결과 제공, 구매 당시/실제 기간, 조기 이용·보상 연장 요청/별도 승인, 수동/사전 합의 자동 갱신·기업 계약 우선·새 가격 동의·유예·회수를 완성한다. 같은 사람의 기간 요청/별도 승인 허용과 계약 자기 승인 금지를 구별한다. 실제 완료는 발급·결과 제공·합의 시작의 최종 시각으로 결정하며 조기 시험은 기산을 앞당기지 않고 늦은 발급은 소급 완료하지 않는다.
- **Confidence hypothesis:** 수량·기간·갱신·보상·지급이 구매 당시 근거와 실제 결과에 맞게 연결되며 재시도/정정으로 중복 권한·기간·요금을 만들지 않는다.
- **Expected demo:** 기간제 발급 → 계약 시작 전 조기 이용과 실제 기간 확인 → 별도 승인된 보상 연장 → 기업 계약 우선 갱신·가격 변경 동의 → 미지급 유예/유예 중 지급 → 보상 중첩 요금 조정 → 실제 권한 회수와 잔량 확인.
- **Integration/remaining evidence:** U3 계약/동의·U4 제공 건 기산/갱신 요금·U1 worker 등록을 실제 연결한다. 고객에게 결과가 제공된 근거를 검사하고 관련 API 시험을 B08/B09 전체 화면에서 다시 확인한다. 제품 실행 시 권한 강제·개별 사용자/장치 배정은 추가하지 않는다.

### B07 — 후속 판단·조합 조회·통지

- **Unit:** U7 / u7-after-sales-inquiry-notices
- **Walking skeleton:** false
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US8.1, US8.2, US8.3, US8.4, US8.7, US8.8, US8.9, US8.10, US9.4 (9개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** U1, U2, U3, U4, U5, U6; ED01, ED07, ED08, ED09, ED10, ED14. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C09–C11, C25, 관련 소유자 조회/행동/사실 계약.
- **Definition of Done:** 공통 완료 기준과 함께 고객 주문 전체 변경·취소·반품, 계약별 보류/계속 판단, 소유자별 실제 부분 회수/환불/잔량, 미확인·충돌/원본 정정, 진행/이력·남은 조치의 권한별 조합 조회와 최소 통지를 완성한다. 요청/승인/통지와 실제 적용/환불/회수를 구별한다. 민감 섹션 숨김을 0원·실패·미지급으로 바꾸지 않는다.
- **Confidence hypothesis:** 여러 소유자의 늦은/부분 결과를 중앙 원본이나 실행 조정자 없이 고객/직원의 허용된 진행 정보로 구성할 수 있다.
- **Expected demo:** 전체 반품 신청 → 합의에 따른 관련 이행 보류 → 일부 실제 회수·환불 결과 → 잔량/남은 조치·정정 이력 조회 → 서로 다른 권한의 조회 → 로그인 링크만 포함한 최소 이메일과 인앱 통지.
- **Integration/remaining evidence:** U3–U6의 실제 owner 결과/읽기 범위와 알림 전달 결과를 연결한다. 고객 부분 변경/취소/반품 신청이나 독립 현금 보상을 추가하지 않는다. 발송 요청·전달·수신·업무 완료를 별도로 기록한다.

### B08 — 고객 PC UI

- **Unit:** U8 / u8-customer-ui
- **Walking skeleton:** false
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US2.2, US6.2 (2개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** U1, U2, U3, U4, U5, U6, U7; ED02, ED03, ED04, ED10, ED14, ED16, ED17. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C14, C16 및 U2–U7의 업무 계약.
- **Definition of Done:** 공통 완료 기준과 함께 고객 C01–C09와 고객 인증/가입/복구를 실제 API로 연결하고 U1 최소 UI를 확장한다. 주문·새 동의·대금·권한/기간·갱신·후속 요청·조직/역할의 허용 정보와 오류/대기/미확인을 표현한다. PC 1280 CSS px 이상·최신/직전 안정 브라우저·한국어/KRW/한국 시각·WCAG 2.2 AA 목표의 해당 검증을 수행한다.
- **Confidence hypothesis:** 고객이 구매/권한 관리의 전체 흐름을 실제 API 상태와 맞게 수행하고 미확인·미부여 정보를 오해하지 않는다.
- **Expected demo:** 등록된 실제 owner를 사용하는 고객 주문 → 대금/제공 결과 확인 → 수동 갱신과 조건 변경 동의 → 기간/후속 요청 조회 → 고객 관리자 역할/범위 조정 → 키보드·확대/리플로우·브라우저 확인.
- **Integration/remaining evidence:** 전체 69개 스토리·227개 AC 중 고객 표면의 모든 연결을 S3의 interaction-spec/screen-traceability와 대조한다. 주 책임 US 2개가 화면 검증 전체 범위를 뜻하지 않는다. 직원의 전체 상호작용은 B09에서 확인하고 고객 모바일 지원은 미정으로 유지한다.

### B09 — 직원 PC UI

- **Unit:** U9 / u9-staff-ui
- **Walking skeleton:** false
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US8.12 (1개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** U1, U2, U3, U4, U5, U6, U7; ED02, ED03, ED04, ED07, ED08, ED09, ED14, ED16, ED18. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C15, C17 및 U2–U7의 업무 계약.
- **Definition of Done:** 공통 완료 기준과 함께 직원 S01–S11과 인증/복구를 실제 API로 연결한다. 상품/기업/계약·주문 판단·대금/HW/SW·후속 처리·이력의 전체 직원 조작, 기업/조직 target·기대 버전·별도 승인과 미확인을 검증한다. 사내망/승인 원격 PC·MFA·현재 행위 권한은 서버/접속 경로에서 강제하고 직원 모바일은 제외한다.
- **Confidence hypothesis:** 직원이 여러 역할을 맡아도 실제 원본 권한·동일인 승인 경계를 지키며 처리/조회/정정할 수 있다.
- **Expected demo:** 직원 등록·다른 사람 계약 승인 → 실제 지급/HW/SW 근거 등록·대조 → 기간 조정의 동일인 별도 승인 → 주문/환불/회수·이력 조회 → 같은 사람의 다른 계정 계약 승인 및 허용 망 밖 접근 거절.
- **Integration/remaining evidence:** 고객 요청과 직원 처리의 왕복을 B08과 함께 검증하고 두 UI의 독립 빌드/배포·호환을 검사한다. 주 책임 US 1개로 직원 화면 범위를 축소하지 않는다. 실제 다른 계약 승인자의 확보는 ED18에서 별도 확인한다.

### B10 — 기술 운영 검증·공통 준비

- **Unit:** U10 / u10-operational-assurance
- **Walking skeleton:** false
- **Owner:** 개발자(실제 기술 책임) / aidlc-developer-agent(구현), 단계별 설계·품질 역할은 team-allocation을 따른다.
- **Primary stories:** US9.1, US9.2, US9.3, US9.5, US9.6, US9.7 (6개). S7의 협력 범위와 관련 AC도 검증한다.
- **Prerequisites:** U1, U2, U3, U4, U5, U6, U7, U8, U9; ED10, ED11, ED12, ED13, ED14, ED15, ED16, ED17, ED18. 실제 확보 상태/소요 시간은 미정이다.
- **Contracts:** C12, C19, C26 및 전체 owner의 접수/결과·배포 호환 계약.
- **Definition of Done:** 공통 완료 기준과 함께 기술 진단/성공 접수·결과 대조 실행 코드, 공통 CDK·필수 검사/배포·독립 관측/알림·backup/restore·국내 저장·사람 작업 증거를 전체 흐름에 연결한다. 정의한 장애 범위에서 성공 접수 RPO 0·30분 복구와 8개 정확성 기준의 실제 시험, 계획 점검/배포·부하·정기 재검토를 준비/검증한다. 전체 가용성 99.9%의 연속 30일 측정은 실제 운영 관측의 별도 증거다.
- **Confidence hypothesis:** 전체 단위가 연결된 상태에서 보존·복구·배포·관측·1인 기술 운영 목표를 시험하고 실제 측정할 수 있다.
- **Expected demo:** 선택한 대표 장애 → 자동 복구 시도 시작 알림 → 실패/수동 필요 알림 → 성공 접수/원본/대기 작업/업무 효과 대조를 포함한 복구 → 배포 전후 핵심 동작·국내 저장 증거·사람 작업 시간 확인.
- **Integration/remaining evidence:** U1부터 적용한 기본 보존/권한/실행 준비를 전체 범위로 대조한다. 최종 공통 Build and Test·CI Pipeline에서 커버리지·AC·보안/호환/복구 검사를 종합한다. 실제 운영 환경 구성·배포·알림/가용성/성능 검증은 해당 Operation 단계의 증거로 완료한다. 상시 운영 API·새 OMS 운영 대시보드를 추가하지 않는다.

## Handoff and Success Criteria

계획상 모든 단위의 주 책임 US는 3/8/12/8/8/12/9/2/1/6개로 합계69개다. S7의 협력 범위·원본 책임은 보존한다. UI 두 단위의 주 책임 수만으로 전체 화면 범위를 줄이지 않으며 최소 UI는 U1부터 있다.

Construction 결과의 완료는 실제 설계/코드·테스트/필수 검사·전체 AC·UI/API/worker/소유자 통합 및 원본/금액/수량/기간 대조 증거로 판단한다. 운영 준비는 해당 Operation 단계의 실제 제공자·배포/망·복구/알림·한국 저장·부하·관측/사람 작업 증거로 판단한다. 연속30일 전체 가용성99.9%·RTO30분·정의한 성공 접수RPO0·8개 정확성 기본선·1인 기술 운영 목표는 유지하며, 무중단 배포·RTO10분·영어(미국)는 후속 목표다.

[Inception 추적 점검](../../verification/phase-check-inception.md)의 구조 통과와 Delivery Planning 승인 후 해당 Construction으로 인계한다. 승인 전에는 Construction을 시작하지 않는다. 날짜/비용/실사용 인력·수요/서비스 목표 달성을 확정한 계획이 아니다.

## Assumptions & Open Questions

- A-DP1 [assumption]: 단위별 작은 실행 결과와 정성 위험 검증이 1인 개발/기술 운영 구조에 적합하다. 실제 반복 작업·통합 실패/재작업·운영 부담으로 검증한다.
- A-DP2 [assumption]: 현재 선언 순서의 HW→SW, 고객→직원 UI가 위험을 차례로 확인하는 데 적합하다. 사용자 응답은 위험 초점을 정한 것이며 HW/SW 시장 가치의 서열을 확인한 것이 아니다. 실제 새 근거가 생기면 계획과 실제 DAG/실행 영향을 함께 검토한다.
- 상대 규모 L/XL은 S5의 추정이며 실제 기간/투입 시간은 미정이다. 모든 ED의 외부 실제 담당/접근/확보 시간과 OQ1–OQ10/HB-01–HB-08은 해당 차단 시점까지 확인한다.
- Domain Design의 수용된 미해결 의견은 U1 주문 보호 문맥 및 소유자별 교차 참조 확인으로 이어받는다. 이번 계획을 과거 검토의 해결 판정으로 쓰지 않는다.
- 검증 명령·실제 기술/제공자·필수 검사 도구/차단선은 후속 해당 설계/구현과 실제 실행 전에 확인한다.

## Sources

- S1: [requirements](../requirements-analysis/requirements.md) — 16개 기능 영역·58개 세부 기능·14개 NFR, 제외 범위와 OQ1–OQ10.
- S2: [stories](../user-stories/stories.md) — 69개 사용자 스토리·227개 수락 기준, 모두 첫 제품 포함.
- S3: [mockups](../refined-mockups/mockups.md) — 고객/직원 PC·화면·상태·권한·접근성 경계.
- S4: [components](../domain-design/components.md) — 14개 논리 책임·원본 소유와 외부 의존.
- S5: [unit-of-work](../units-generation/unit-of-work.md) — 10개 구현 단위·종류·첫 통합 실행 범위·구현 전 확인.
- S6: [unit-of-work-dependency](../units-generation/unit-of-work-dependency.md) — 43개 개발 선행 관계와 독립 집합.
- S7: [unit-of-work-story-map](../units-generation/unit-of-work-story-map.md) — 스토리별 주 책임과 협력·전체 통합 완료 조건.
- S8: [contract-summary](../contract-design/contract-summary.md) — 44개 재사용 계약, 81개 상위 관계와 추가 대조 읽기 2개, 대상 전달·원자 기록·제공/정정/호환 경계.
- S9: [team-practices](../practices-discovery/team-practices.md) — 1인 개발/기술 운영 목표·최소 통합 동작·test-after/Standard/80%·필수 검사와 배포 관행.
- S10: [확인된 답변](delivery-planning-questions.md) — Q1–Q5 모두 A, 별도 Looks correct. 이 문서는 계획이며 구현/운영 달성의 증거가 아니다.

