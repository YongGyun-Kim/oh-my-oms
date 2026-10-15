# U4 대금 처리 업무 규칙

## 목적과 범위

[확인한 답변](functional-design-questions.md)을 실행 가능한 업무 판단으로 구체화한다. 아래 YAML이 규칙의 단일 원본이다. 소유 엔티티·금액 기호는 [entities.md](entities.md), 순서·상태 전이는 [functional-spec.md](functional-spec.md)가 정의한다. 기술 제품·물리 저장 명령을 선택하는 문서가 아니다.

## Business Rules

```yaml
unit: u4-financial-settlement
rules:
  - id: BR4.1
    category: authorization
    applies_to: 모든 대금 조회·변경·결과 확인
    trigger: 명령·조회 및 비동기 반영 직전
    statement: 현재 신원·MFA·행위 및 모든 대상 범위를 확인한다.
    logic: IF 직원 등록이면 THEN 직원 허용 망과 현재 행위 권한을 검증한다. IF 고객 조회이면 THEN 별도 대금 조회 권한과 기업·조직 범위를 확인한다. 배분·정정은 원래 대상과 새 대상 모두 검증한다.
    violation: 거절 또는 확인 불가. 주문 조회 권한을 대금·증빙 권한으로 확대하지 않고 목록·상세·합계·오류·이력에 같은 범위를 적용한다.
    source: FR2, FR3, FR14.1, FR16, NFR1; Q&A 통합 확인
  - id: BR4.2
    category: validation
    applies_to: 모든 금액·참조·입력
    trigger: 등록·배분·정정·환불
    statement: KRW 정확한 정수 금액과 실제 소유자·대상·개정을 검증한다.
    logic: IF 금액이 미확인·음수·소수·다른 통화·표현 한계 초과 또는 참조가 다른 기업/주문/개정이면 THEN 확인/수정 전 반영하지 않는다. 입금·배분·청구·환불 요청의 효과 금액은 양수이며 잔액0은 명시적으로 계산한다.
    violation: 임의 반올림·0원 치환·참조 이름만으로 확인 금지. 입력한 내용을 유지하고 수정 가능한 사유를 반환한다.
    source: FR4.3, FR8, FR15; Q&A 통합 확인
  - id: BR4.3
    category: policy
    applies_to: AgreedPaymentPlan·Invoice
    trigger: 지급 계획 적용·청구 등록
    statement: 한 주문의 복수 청구는 승인된 지급 약정의 독립 지급분에 연결한다.
    logic: IF U3의 승인된 계획과 주문 총액·기업·개정·의무 금액/조건이 일치하면 THEN 그 지급분의 청구를 등록한다. 같은 obligationKey의 유효 청구 중복과 계획/청구의 초과 합계를 거절한다. 명칭은 자유 설명이며 고정 단계 유형으로 해석하지 않는다.
    violation: 계획 불완전/미승인/상충은 HOLD. 청구를 새로 만들거나 정정해 계약 금액·조건을 우회 변경하지 않는다.
    source: FR7, FR8.1; Q1, Q4
  - id: BR4.4
    category: policy
    applies_to: 직원 입금 확인
    trigger: PaymentEvidence 확정
    statement: 실제 입금 근거와 검증된 거래 식별이 있어야 지급 사실을 확정한다.
    logic: IF 직원이 원본 출처·실제 금액·거래 식별·시각·대상·확인 근거를 대조하면 THEN CONFIRMED 후보로 삼는다. IF 식별이 부족하거나 증빙이 상충하면 THEN REVIEW 또는 DISPUTED로 유지한다.
    violation: 청구 등록·고객의 송금 주장·문서 첨부·참조 존재만으로 지급액을 증가시키지 않는다. 대조 전 배분/제공 충족 불가.
    source: FR8.1, FR15.2; Q&A 네 안전장치
  - id: BR4.5
    category: constraint
    applies_to: PaymentIdentity
    trigger: 신규 입금 등록·식별 정정
    statement: 실제 입금의 원본 식별과 별칭을 전역 수취 원본 범위에서 한 번만 사용한다.
    logic: IF 같은 원본 거래가 기존 입금에 연결돼 있으면 THEN 새 입금 효과를 생성하지 않는다. 같은 요청/내용은 원래 결과를 재확인하고, 새 요청이나 다른 주문으로 등록한 경우에는 기존 거래 대조가 필요함을 반환한다. 다른 기업·입력 채널·식별 프로필 개정으로 등록해도 유일성 보호를 우회하지 못하며 개정 전후 정규 식별/별칭을 같은 원본에 연결한다.
    violation: 직원·주문·기업·요청 키를 바꾼 중복을 차단한다. 다른 기업의 거래 정보는 노출하지 않는다. 식별 불충분 상태에는 중복 방지 완료를 주장하지 않는다.
    source: FR8.1, FR15.1; Q&A 안전장치1
  - id: BR4.6
    category: constraint
    applies_to: OrderPaymentBinding·PaymentAllocation
    trigger: 입금 주문 연결·배분
    statement: 한 입금의 유효 연결 주문은 하나이며 같은 주문의 여러 청구에 수동 배분할 수 있다.
    logic: IF 이미 주문 A에 연결된 입금을 다른 주문 B에 배분하려 하면 THEN 거절한다. IF 같은 주문의 청구들이면 THEN 직원이 지정한 청구별 양의 금액을 검증하여 반영한다. 미연결 입금은 첫 배분과 같은 원자적 변경에서 한 주문에 연결한다.
    violation: 주문 간 분할 및 자동 우선순위 배분 금지. 청구 이름·기한만으로 자동 연결하지 않는다.
    source: FR8.2; Q2, Q5
  - id: BR4.7
    category: calculation
    applies_to: 입금·청구별 잔액
    trigger: 배분·취소·환불 반영
    statement: 입금 원금과 청구 금액을 중복 소비하지 않는다.
    logic: IF 입금별 유효 사용액·환불 확정액·환불 예약액 및 청구별 충족액이 functional-spec의 잔액 식을 만족하면 THEN 반영한다. IF 어떤 대상이라도 가용액을 초과하면 THEN 전체 명령을 거절한다. 미배분 잔액은 별도 보존한다.
    violation: 음수 잔액·일부만 성공·남는 금액 자동 분배를 허용하지 않는다.
    source: FR8.2, FR13.4; AC4.4.2, AC4.4.4
  - id: BR4.8
    category: constraint
    applies_to: 중복 식별·잔액·청구·환불 한도
    trigger: 서로 다른 유효 요청의 동시 실행
    statement: 검사와 기록을 하나의 원자적 변경으로 묶어 동시 소비를 막는다.
    logic: IF 두 요청이 같은 거래 식별·입금·청구·환불 원금을 사용하면 THEN 공통 원본을 기준으로 직렬 대조하고 기록 시점에 개정·한도를 다시 확인한다. DB의 유일성 제약 및 동시성 보호로 한 요청만 허용하거나 잔여액 안의 두 요청만 반영한다.
    violation: 애플리케이션 사전 조회만으로 보호했다고 보지 않는다. 충돌 요청은 거절·재확인으로 반환하며 기존 효과를 보존한다.
    source: FR15.1, FR15.3, NFR5; Q&A 안전장치3
  - id: BR4.9
    category: constraint
    applies_to: 모든 변경과 성공 접수
    trigger: 요청 재전송·응답 유실·저장 실패
    statement: 원래 요청과 실제 업무 식별을 별도로 보호하고 성공 확인 전 내구 기록을 확인한다.
    logic: IF 같은 요청 키와 같은 정규 내용이면 THEN 권한 재검증 후 원래 접수/결과를 반환한다. 같은 키 다른 내용은 충돌이다. 업무 원본·이력·후속 사실·요청 결과를 원자 기록하고 기존 별도 보호 저장 확인 후에만 성공 접수로 응답한다.
    violation: 실패/결과 불명을 성공이나 새 효과로 치환하지 않는다. 저장 후 응답 유실은 원래 키로 재조회한다.
    source: FR15.1, NFR4, NFR5
  - id: BR4.10
    category: policy
    applies_to: 입금·배분·청구 정정
    trigger: 오류 정정 요청
    statement: 원본 식별과 정정 관계를 보존하며 삭제·재등록으로 중복 보호를 해제하지 않는다.
    logic: IF 정정이면 THEN 원래 원본/개정·사유·전후·확인자를 보존하고 원래 효과를 정확히 한 번 상쇄한다. 같은 거래의 식별 별칭은 예약을 유지한다. 잘못된 주문 연결 변경은 기존 배분·환불 예약·진행 이행의 영향 대조 후 원자적으로 수행한다.
    violation: 이미 사용/환불된 원금을 새 가용액으로 만들지 않는다. 실제 이행을 되돌렸다고 표시하지 않고 영향받은 제공 조건을 재판단한다.
    source: FR8.1, FR8.2, FR15.4; Q&A 안전장치4
  - id: BR4.11
    category: policy
    applies_to: 혼합 지급의 PROVISION 판단
    trigger: 출고·활성화 전 대금 조건 조회
    statement: 계약상 제공 전 필수 지급분만 선행 지급 요건으로 판단한다.
    logic: IF 완전한 승인 계획의 제공 전 필수 의무가 모두 유효 배분으로 충족되고 관련 충돌/제한이 없으면 THEN 대금 조건을 ALLOW로 판단할 수 있다. 제공 후 지급분의 미도래 잔액은 그 자체로 선지급 미충족이 아니다. 청구 미발행으로 필수 의무를 숨기지 못한다.
    violation: 미확인 계획/필수 여부는 UNVERIFIED, 부족/충돌은 HOLD. 대금 ALLOW는 실제 출고/발급/전체 주문 완료가 아니다.
    source: FR8.3, FR7, FR5.3; Q4 B
  - id: BR4.12
    category: policy
    applies_to: SALE_ACCEPTANCE 판단
    trigger: U3 주문 전체 수락
    statement: 판매 수락과 실제 제공을 구별하여 청구/입금 순환 의존을 막는다.
    logic: IF 수락 목적이면 THEN 승인 계약의 대금 조건 확인과 현재 유효 제한을 대조하되 아직 생성되지 않은 청구/입금의 충족을 무조건 요구하지 않는다. U3가 필요한 다른 원본 근거는 계속 검증한다.
    violation: 목적 불명 또는 제공용 결과를 수락용으로 잘못 재사용하면 HOLD. 수락을 지급·출고 완료로 승격하지 않는다.
    source: FR6.1, FR6.3, FR8.3
  - id: BR4.13
    category: calculation
    applies_to: 제공 완료 기산 후불 청구
    trigger: 원본 제공 완료 또는 정정 확인
    statement: 합의한 실제 완료일에 한국 달력일수를 더하여 기한을 계산한다.
    logic: IF 실제 완료 근거와 그 기산일로 합의한 비음수 정수 N이 확인되면 THEN 완료 시점의 한국 날짜+N을 dueDate로 기록한다. 완료일은0일, 기한 날짜 전체를 허용하고 다음 한국 날짜부터 미지급 잔액의 지연 여부를 대조한다.
    violation: 미제공/미확인 수량의 기한 시작 금지. 영업일/휴일 이월·청구일 대체·조기 SW 설치일 대체 금지.
    source: FR8.4; Q3
  - id: BR4.14
    category: policy
    applies_to: 청구별 기타 지급 기한과 조건
    trigger: 계획·청구 조건 확인
    statement: 모든 청구를 실제 제공 완료일 기준으로 통일하지 않는다.
    logic: IF 계약이 확정 날짜 또는 다른 확인 사실을 기산으로 명시하면 THEN 그 정확한 약정과 근거를 보존한다. IF 계약 사건이 아직 확인되지 않았거나 지원하지 않는 달력이면 THEN 기한 미확인으로 관리하고 직원 확인을 요구한다. 자유 설명 문구를 자동 산식으로 해석하지 않는다.
    violation: 기산일·일수·조건을 임의 기본값으로 채우지 않는다.
    source: FR7.1, FR8.1, FR8.4; Q1, Q4
  - id: BR4.15
    category: constraint
    applies_to: 완료 사실·계획·기한의 개정
    trigger: 늦은 사실·중복·정정
    statement: 같은 제공 사실의 원래 식별과 증가 개정으로 기한을 재대조한다.
    logic: IF 같은 소유자/제공 건/품목과 동일 개정이면 THEN 효과를 추가하지 않는다. 낮은 개정은 최신 값을 덮지 않는다. 높은 확인 정정은 원래 기한·금액·근거와 연결하여 같은 합의 산식으로 재산출하고 제한 판단을 재확인한다.
    violation: 현재 계획과 다른 사실·버전 공백·수량 불일치는 대조 대기. 계약 변경이 필요한 경우 U3 승인 경로를 거치며 과거 이력을 소급 삭제하지 않는다.
    source: FR8.4, FR15.2, FR15.3; C20-E25, C20-E29
  - id: BR4.16
    category: policy
    applies_to: 대금 충돌·결과 불명
    trigger: 상충 근거 또는 확인 실패
    statement: 관련 추가 처리만 보류하고 권한 있는 직원의 근거 대조로 해소한다.
    logic: IF 입금/배분/환불/제공 근거가 상충하면 THEN 원래 값·출처·차이·영향 범위를 보존하고 의존하는 추가 이행/배분/환불을 보류한다. 해결 판단은 현재 원본 개정에 결합한다.
    violation: 최신 도착값 자동 우선·미확인=실패/미지급/연체 치환·무관 업무 전체 차단 금지.
    source: FR15.2, FR15.3; AC4.4.3, AC4.6.2
  - id: BR4.17
    category: policy
    applies_to: 후불 지연 후보와 수동 제한
    trigger: 지연 후보 확인·직원 제한/해제
    statement: 실제 미지급 잔액·확정 기한·계약 범위를 확인한 직원이 제한과 해제를 기록한다.
    logic: IF 근거와 현재 제한 정책이 확인되면 THEN 직원이 명시된 대상/행위 범위의 적용 또는 해제 판단을 기록한다. IF 불명확하면 THEN 확인 대기로 둔다. 첫 버전에서 자동 연체 제재 실행은 하지 않는다.
    violation: 지연 후보만으로 자동 회수·기존 이용 기간 단축·무관 거래 차단을 실행하지 않는다. 해제는 지급/정정의 현재 근거를 대조한다.
    source: FR8.5; AC4.6.1, AC4.6.2, AC4.6.3; 첫 배포 실행 계획
  - id: BR4.18
    category: policy
    applies_to: 환불 요청과 한도
    trigger: 직원 환불 건 생성
    statement: 승인된 후속 판단·실제 지급 원금·필요 회수 근거 안에서만 환불 금액을 예약한다.
    logic: IF U7 합의 한도·원래 주문/입금·계약상 필요한 U5/U6 회수 결과가 확인되면 THEN 기존 확정 환불과 모든 진행/미확인 예약을 뺀 가용 한도 안에서 예약한다. 같은 입금 원금에 대한 여러 사건의 한도를 합산한다.
    violation: 회수 필요 여부 미확인·원금/한도 부족은 HOLD. 요청을 실제 환불 완료로 표시하지 않는다.
    source: FR13.4; AC8.6.1, AC8.6.2, AC8.6.4
  - id: BR4.19
    category: constraint
    applies_to: 실제 환불 결과·부분 재처리
    trigger: 직원 결과 등록·재처리
    statement: 원래 금융 작업과 실제 환불 거래를 대조하여 성공분과 미확인 예약을 재사용하지 않는다.
    logic: IF 확인된 실제 결과이면 THEN 해당 예약 부분만 확정 환불로 옮긴다. 결과 불명은 예약 유지, 확실한 미실행/실패만 예약 해제 후 원인 해소·현재 권한/원금/공통 승인 한도·필요 회수 근거를 다시 확인해 실패분의 새 시도를 허용한다. IF 기존 확정 성공액이 있으면 THEN 실패분을 재예약해도 PARTIAL을 유지한다. IF 확정 성공액0·불명분 없음·활성 예약 없음인 FAILED에서 실패분을 재예약하면 THEN IN_PROGRESS로 전이한다. 새 현재 시도와 원래 부분/옛 실패 이력을 연결하며 재시도액은 목표액에 더하지 않는다. 동일 거래/작업 결과는 한 번만 반영한다.
    violation: 성공분 반복·동시 과다 예약·새 요청 키에 의한 중복 환불 금지. 승인 한도나 남은 금액이 바뀐 경우 먼저 대조한다.
    source: FR13.4, FR15.1, FR15.3; AC8.6.2, AC8.6.3, AC8.6.4
  - id: BR4.20
    category: policy
    applies_to: 보상 요금·기간·갱신
    trigger: 요금 정정·보상 요청
    statement: U4의 금액 정정은 승인된 합의에 따르며 SW 기간·갱신 일정을 바꾸지 않는다.
    logic: IF 보상 중첩 요금 산식·실제 기간·승인 금액이 후속에서 확인되면 THEN 원래 조정 식별로 중복 차감을 막는다. 첫 버전에서 자동 중첩 계산/자동 갱신은 실행하지 않는다. 독립 금전 보상 요청은 범위 밖으로 안내하되 취소/반품 환불을 유지한다.
    violation: 가짜0원·무승인 할인·기간 변경·독립 현금 보상 실행 금지.
    source: FR12.1, FR12.2, FR12.3; AC7.8.1, AC7.8.2, AC7.8.3
  - id: BR4.21
    category: constraint
    applies_to: 이력·후속 사실·조회
    trigger: 성공 변경·조회·통지
    statement: 원본 변경과 근거 이력·후속 사실을 함께 보존하며 현재 권한으로 조회한다.
    logic: IF 원본을 변경하면 THEN 행위자·확인한 사람·시각·사유·전후 개정·근거·원래 요청/정정 관계를 보존한다. 후속 통지는 최소 참조만 제공하며 발송/열람을 입금·동의·실제 제공으로 표시하지 않는다.
    violation: 이력 덮어쓰기·증빙/계좌 로그 유출·지급 사실을 U4 밖에서 임의 수정 금지.
    source: FR14, FR15.4, NFR4
  - id: BR4.22
    category: policy
    applies_to: 첫 배포 범위·계약 버전
    trigger: 미지원 요청·통합·배포 준비
    statement: 복수 청구·혼합 지급에 필요한 변경 계약을 기존 계약과 구분하고 미지원 자동화를 성공으로 가장하지 않는다.
    logic: IF v1 입력으로 새 계획/판단 목적/거래 식별을 전달할 수 없으면 THEN 변경 계약을 사용해야 한다. 구버전 신규 요청은 명시적 PREPAY/POSTPAY 의미만 보존하고 혼합으로 추정하지 않는다. 기존 데이터의 필수 조건이 미확인이면 대조 대기로 둔다.
    violation: 닫힌 스키마에 임의 필드 주입·기존 주문 일괄 변환·외부 수금/자동 배분/부분 제공 구현 완료 주장 금지.
    source: C00, C04, C05, C06, C16, C17, C20; Q1–Q5
  - id: BR4.23
    category: policy
    applies_to: 수동 갱신 회차의 청구·배분·대금 판단
    trigger: 수동 갱신 요청의 조건 확정·지급·실제 적용
    statement: 회차별 갱신 주문과 승인 약정을 명시적으로 연결하여 과거 지급 충족을 재사용하지 않는다.
    logic: IF U6의 확인된 수동 갱신 회차에 대해 U3가 별도 SW 갱신 주문을 생성/대조하면 THEN 해당 회차 하나와 원래 주문·권한을 그 주문에 결합한다. 동일 회차는 같은 주문을 재확인하며 새 청구를 중복 생성하지 않는다. 청구·배분·자격의 renewalCycleRefs는 모두 이 연결과 현재 회차 개정에 일치해야 한다.
    violation: 과거 주문의 지급액/ALLOW·다른 회차·회차 미확인으로 현재 갱신을 충족 처리하지 않는다. 미지급의 실제 연장은 합의된 현재 지급/유예 근거 없이 실행하지 않으며 U4가 기간을 변경하지 않는다.
    source: FR8.1, FR11, FR15.1, FR15.3; C00 renewalCycleRefs, C08; US7.1
  - id: BR4.24
    category: constraint
    applies_to: 환불 부분 결과와 완료 결과의 근거 정정
    trigger: 원래 작업의 추가 확인 또는 확인 결과의 높은 개정 정정
    statement: 부분별 확정·실패·불명·진행을 합산하고 같은 원래 작업의 결과 확인으로 상태를 갱신한다.
    logic: IF PARTIAL의 불명분이 원래 작업 조회에서 성공으로 확인되면 THEN 새 실행 없이 해당 부분의 예약을 확정 환불로 옮기고 상태를 재집계한다. IF 완료 결과의 근거가 정정되면 THEN RECONCILING에서 원래 작업/부분 식별과 개정을 대조하고 RA/RU·HA/HU·입금/청구 및 공통 승인 잔액의 차이를 하나의 변경으로 반영한다.
    violation: 새 작업으로 불명 해소·동일 부분 중복 확정·삭제 후 환불액 재사용 금지. 정정 근거 미확인 중 기존 소비 보호를 유지하며 명확한 미실행/실패 증거 전 예약을 해제하지 않는다.
    source: FR13.4, FR15.1, FR15.3, FR15.4; AC8.6.1, AC8.6.3, AC8.6.4
```

## 규칙 요약

| 규칙 | 판단 |
| --- | --- |
| BR4.1–BR4.2 | 현재 권한·대상·정확한 금액·근거 |
| BR4.3 | 주문당 복수 청구와 승인 약정의 금액 보존 |
| BR4.4–BR4.6 | 실제 입금 확인·전역 거래 중복·한 주문 연결 |
| BR4.7–BR4.10 | 잔액·동시 소비·재전송·정정 보호 |
| BR4.11–BR4.12 | 제공 전 필수 지급분과 판매 수락 목적 구별 |
| BR4.13–BR4.17 | 약정별 기한·정정·충돌·직원 제한/해제 |
| BR4.18–BR4.19 | 실제 환불·예약·부분 재처리·중복 한도 |
| BR4.20–BR4.22 | 보상 경계·이력·계약 호환·후속 범위 |
| BR4.23–BR4.24 | 수동 갱신 회차 대금 연결·환불 부분 확인과 완료 정정 |

## Sources

- [질문 답변](functional-design-questions.md) Q1–Q5·네 안전장치·통합 확인.
- [요구사항](../../../inception/requirements-analysis/requirements.md) FR7–FR8·FR12–FR16·NFR4–NFR5.
- [스토리](../../../inception/user-stories/stories.md) US4.1–US4.6·US7.8·US8.6.
- [계약](../../../inception/contract-design/contract-summary.md) C00·C04–C06·C16–C20·C22.
- [첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md) 수동 확인 우선, Q4 B의 혼합 지급 변경.

## Assumptions & Open Questions

- 실제 금융 원본의 식별 프로필과 증빙 운영 준비는 [entities.md](entities.md)의 출시 전 확인 항목이다. 불명확한 원본을 확인된 현금으로 사용하는 예외는 두지 않는다.
- 이 규칙은 업무 불변조건이며 해당 실패·동시성·복구 시험을 아직 실행하지 않았다.
