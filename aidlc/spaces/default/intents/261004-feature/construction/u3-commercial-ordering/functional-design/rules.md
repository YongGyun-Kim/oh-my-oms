# U3 상품·계약·주문 업무 규칙

## 목적과 범위

[확인한 Q&A](functional-design-questions.md)와 첫 배포 계획을 바탕으로 판단 규칙을 정의한다. 아래 YAML이 단일 원본이며 구현·시험 통과 주장이 아니다. 모든 규칙은 현재 행위/대상 권한과 원본 소유자의 확인 근거를 사용한다. 실제 연동이 확인되지 않은 상태를 synthetic 시험 결과로 대체하지 않는다.

## Business Rules

```yaml
unit: u3-commercial-ordering
rules:
  - id: BR1.1
    category: authorization
    applies_to: "ProductCatalog"
    trigger: "상품 등록/공통 조건 변경"
    statement: "권한 있는 내부 직원만 상품을 등록·수정한다."
    logic: "IF 현재 직원 신원·MFA·허용 망·대상 행위 권한이 확인되지 않으면 THEN 등록을 거절하고 고객/외부 판매자 경로를 허용하지 않는다."
    violation: "권한 거절; 데이터/유효 판매 조건을 생성하지 않는다."
    source: "FR4.1, FR3.1, FR3.2"
  - id: BR1.2
    category: validation
    applies_to: "Product"
    trigger: "판매 정보 등록/제시"
    statement: "HW·영구 SW·기간제 SW의 필수 판매 정보를 구별한다."
    logic: "IF 타입/이용형·판매 설명·공개/가격/지급/이용/완료 판단 정보가 필요한 범위에서 미확인이면 THEN 불완전 정보를 유효 판매 조건으로 노출하지 않는다."
    violation: "INCOMPLETE 또는 확인 필요; 임의 기본값 없음."
    source: "FR4.1"
  - id: BR1.3
    category: authorization
    applies_to: "기업별 상품/가격 조회"
    trigger: "조건 조회"
    statement: "현재 기업에 허용된 공통 조건과 승인 예외만 제시한다."
    logic: "IF 대상 기업·상품·조회 범위가 유효하면 THEN 공통 조건 위에 해당 기업의 유효한 승인 예외만 합성하고 타 기업의 조건/근거를 반환하지 않는다."
    violation: "비공개·확인 필요를 구분하고0원/공통값으로 대체하지 않는다."
    source: "FR4.2, FR3.1"
  - id: BR1.4
    category: validation
    applies_to: "PriceTerms"
    trigger: "단가 등록/제안/주문"
    statement: "첫 배포 KRW 단가는 비음수 원 단위 정수다."
    logic: "IF 원 미만 소수·다른 통화 또는 유효 금액 표현이 아니면 THEN 자동 반올림 없이 지원 밖/입력 오류로 안내한다."
    violation: "수정 경로 제공; 소수 단가 자동 변환 없음."
    source: "FR4.1, FR4.3; Q1"
  - id: BR2.1
    category: constraint
    applies_to: "AgreementRevision"
    trigger: "계약 등록"
    statement: "내용·합의 근거·기업/상품 대상·유효 구간·등록자를 정확한 개정에 고정한다."
    logic: "IF 필요한 값/근거/시점이 미확인이면 THEN 확인 필요로 보존하고 승인/적용을 막는다. 등록 행위 자체를 고객 계약 동의로 표시하지 않는다."
    violation: "REGISTERED/CONFIRMATION_REQUIRED; 유효 조건 변경 없음."
    source: "FR7.1"
  - id: BR2.2
    category: authorization
    applies_to: "ContractChangeRequest"
    trigger: "고객 변경 요청/조회"
    statement: "자기 기업의 대상 계약과 현재 변경 요청 권한을 확인한다."
    logic: "IF 권한/기업/대상 범위가 일치하면 THEN 요청과 내부 결과를 추적한다. 요청만으로 기존 조건을 변경하지 않는다."
    violation: "타 기업/권한 없는 요청 거절, 계약 내용 비노출."
    source: "FR7.2"
  - id: BR2.3
    category: authorization
    applies_to: "AgreementApproval"
    trigger: "계약 승인/가격 예외 적용"
    statement: "계약 등록자와 승인자는 검증된 서로 다른 사람이어야 한다."
    logic: "IF 동일인 또는 동일인 근거가 미확인/현재 권한 불충족이면 THEN 계정·역할이 달라도 승인/적용을 막는다. 다른 승인자 부재를 자동 승인/권한 확대로 해결하지 않는다."
    violation: "미승인과 다른 승인자 확인 필요; 동일인 미확인은 HOLD."
    source: "FR7.3, FR3.2"
  - id: BR2.4
    category: constraint
    applies_to: "AgreementRevision/Approval"
    trigger: "승인 확정/적용"
    statement: "확인한 정확한 대상 개정과 근거로만 승인하고 적용한다."
    logic: "IF 대상 내용·근거·적용 범위/유효 구간·등록자·현재 권한 판단이 변경/불명확하면 THEN 이전 승인으로 새 개정을 적용하지 않고 재확인·재승인한다."
    violation: "현재 조건 보존, 충돌/확인 필요 기록."
    source: "FR7.3"
  - id: BR2.5
    category: constraint
    applies_to: "계약/기업 예외 유효 구간"
    trigger: "승인/새 조건 적용"
    statement: "동일 기업·상품·조건 항목에서 상충하는 승인 조건의 유효 기간 중첩은 적용 차단한다."
    logic: "IF 같은 우선 단계의 다른 값이 겹치거나 경계가 불명확하면 THEN 충돌을 기록하고 해결한 개정을 재승인하기 전 적용하지 않는다. 공통 조건 위 기업 계약의 정상 우선 적용은 충돌이 아니다."
    violation: "기존 유효 조건·주문 스냅샷 보존; 최근 입력 우선 금지."
    source: "FR4.2, FR7.4; Q2"
  - id: BR2.6
    category: policy
    applies_to: "유효 기업 조건"
    trigger: "주문/갱신 조건 평가"
    statement: "기업 계약 조건을 우선하고 범위 밖 개별 예외는 새 합의가 필요하다."
    logic: "IF 유효한 기업 계약이 해당 항목을 규정하면 THEN 그 조건을 사용한다. 범위 밖 요청은 계약 변경/예외 합의의 승인 전 적용하지 않는다."
    violation: "허용 범위 밖/미확인 조건은 HOLD."
    source: "FR7.4"
  - id: BR2.7
    category: constraint
    applies_to: "계약/예외 변경 이력"
    trigger: "등록/승인/적용/정정"
    statement: "모든 변경을 원본·대상·행위자·시점·근거·전후 개정과 연결한다."
    logic: "IF 새 공통/기업 조건이 승인되면 THEN 신규 판단에서 그 유효 조건을 사용하되 기존 주문/실제 기간은 일괄 덮어쓰지 않는다."
    violation: "누락은 대조/정정 대상; 원본 덮어쓰기 금지."
    source: "FR4.3, FR7.3, FR7.4"
  - id: BR3.1
    category: validation
    applies_to: "주문 입력"
    trigger: "submitOrder"
    statement: "현재 승인 기업·권한과 동일 타입/유효 수량·1–100행·단일 지급 종류를 검증한다."
    logic: "IF HW/SW 혼합·기업/권한 문제·필수 값/TargetScope 누락·양의 정수가 아닌 수량·100행 초과 또는 첫 배포 지원 밖 혼합 지급이면 THEN 접수하지 않고 원인과 재제출/확인 경로를 구분한다. TargetScope의 기업·부서·사업장·조직정책·조직 개정을 원본 검증하여 고정하고 현재 요청자 소속으로 추측하지 않는다. SW 영구/기간제 혼합은 허용한다."
    violation: "직원 우회/자동 분할/절삭/지급 조건 치환 없음."
    source: "FR5.1, FR5.2, FR5.4; Q3"
  - id: BR3.2
    category: constraint
    applies_to: "PurchaseTermsSnapshot"
    trigger: "성공 접수"
    statement: "판매 당시 가격·조건·상품/계약 개정을 주문과 함께 불변 보존한다."
    logic: "IF 주문이 성공 접수되면 THEN 전체 입력행·최초 스냅샷·제공 선택·결과·TargetScope를 함께 보존한다. 입력행/조건 항목별 conditionBindings와 적용한 모든 기업 계약 개정의 합집합을 고정하고 다른 상품/항목의 합의를 단일 최신 개정으로 축약하지 않는다. 이후 공통 가격 변경으로 덮어쓰지 않는다."
    violation: "접수 결과가 불명확하면 미확인/재확인; 부분 스냅샷 성공 없음."
    source: "FR4.3, FR5.1"
  - id: BR3.3
    category: constraint
    applies_to: "모든 변경 요청"
    trigger: "재전송/결과 조회"
    statement: "같은 요청은 같은 결과를 추적하고 추가 업무 효과를 만들지 않는다."
    logic: "IF 호출자·기업·행위·동일 요청 식별과 내용이 같으면 THEN 원래 결과/현재 미확인을 반환한다. 같은 식별 다른 내용은 충돌로 거절한다. 응답 단절만으로 실패/완료를 단정하지 않는다."
    violation: "중복 주문/승인/동의/적용 없음; 권한 재검증 후 결과 조회."
    source: "FR5.2, NFR3"
  - id: BR3.4
    category: policy
    applies_to: "Order"
    trigger: "첫 배포 접수/판단"
    statement: "첫 배포의 유효 주문은 전체 직원 검토로 접수한다."
    logic: "IF 유효 주문을 접수하면 THEN REVIEW로 보존하고 자동 확정하지 않는다. 업무 확인 필요와 근거 조회 기술 실패 사유를 구분한다."
    violation: "일부 품목 선확정 없음. 자동 확정은 후속."
    source: "FR6.1, FR6.2, FR6.3; 첫 배포 계획"
  - id: BR3.5
    category: policy
    applies_to: "ProvisionChoice"
    trigger: "제출/제공 선택 조회"
    statement: "기본 제공 방식은 FULL이며 첫 배포는 일괄 제공만 실행한다."
    logic: "IF 별도 선택이 없으면 THEN FULL을 명시 기록한다. 지원 밖 PARTIAL 요청은 명시 확인/안내하며 FULL로 자동 치환하거나 일부 제공 허용으로 해석하지 않는다."
    violation: "변경 합의 없는 부분 제공 금지."
    source: "FR5.3"
  - id: BR3.6
    category: constraint
    applies_to: "일괄 제공 주문"
    trigger: "후속 이행 조건 전달"
    statement: "일괄 제공 주문에서 일부만 준비됐다는 이유로 부분 제공하지 않는다."
    logic: "IF 준비가 일부이고 유효한 고객 변경 합의가 없으면 THEN 전체 주문 조건을 보존하여 U5/U6에 일부 출고/발급 허용 사실을 보내지 않는다."
    violation: "부족/미확인은 전체 HOLD. 실제 제공 결과는 각 소유자 책임."
    source: "FR5.3, FR6.2"
  - id: BR3.7
    category: constraint
    applies_to: "AcceptanceDecision"
    trigger: "직원 전체 수락/거절"
    statement: "전체 품목의 현재 계약·공급·납기·대금 조건 근거로 판단한다."
    logic: "IF 현재 권한과 모든 필요한 대상별 근거가 확인되고 변경 동의 요건도 충족하면 THEN 주문 전체를 ACCEPT할 수 있다. REJECT에는 사유/근거를 기록하며 미확인/조회 실패는 HOLD로 남긴다."
    violation: "수락은 지급/확보/배송/발급 완료가 아니다; 결과·남은 조치 연결."
    source: "FR6.2, FR6.3"
  - id: BR3.8
    category: constraint
    applies_to: "주문/승인/변경 판단"
    trigger: "확정 직전 동시성 확인"
    statement: "읽은 대상·조건·근거 개정이 현재 판단 전제와 같아야 한다."
    logic: "IF 판단 중 주문·조건·근거·권한이 바뀌면 THEN 오래된 판단의 확정을 거절하고 충돌·재확인 경로를 남긴다. 제출 때 고정한 TargetScope와 현재 대상 정책/권한 효력을 대조하고 조직 재편을 기업 전체 범위로 확대하지 않는다. 확정 결과/이력/전달 사실은 함께 보존한다."
    violation: "최신 결과 덮어쓰기/수락-변경 경쟁의 이중 적용 없음."
    source: "FR6.3, FR7.3, NFR3"
  - id: BR4.1
    category: calculation
    applies_to: "OrderPriceBreakdown"
    trigger: "금액 계산/검증"
    statement: "원 단위 정수로 행 금액과 합계를 정확히 계산한다."
    logic: "IF 단가/수량이 확인되면 THEN 각 행 금액은 단가×수량, 상품금액은 행 금액의 합이다. 확정 가산 항목 합계를 더하고 별도 확정 할인 합계를 빼 최종 합계를 대조한다."
    violation: "반올림/근사 계산 금지; 음수 최종 합계와 표현 범위 부족은 오류/확인 필요이며 잘라 저장하지 않는다."
    source: "FR4.3, NFR3; Q1, Q4"
  - id: BR4.2
    category: constraint
    applies_to: "확정 추가 비용/세금/할인"
    trigger: "금액 입력/합계"
    statement: "포함 여부·적용 위치·금액·근거가 확인된 항목만 한 번 반영한다."
    logic: "IF 항목이 이미 단가/다른 항목에 포함되면 THEN 포함 근거를 보존하되 다시 가산/차감하지 않는다. 별도 추가/할인만 확정한 원 단위 금액을 한 번 반영한다."
    violation: "중복 합산/할인 반영을 차단하고 확인 필요 기록."
    source: "FR4.3; Q4"
  - id: BR4.3
    category: policy
    applies_to: "금액 확인 상태"
    trigger: "제시/접수/수락"
    statement: "미확인 금액·세금 포함 여부를0원/면제로 가정하지 않는다."
    logic: "IF 필요한 금액/포함 여부/근거가 미확인이면 THEN 확인 필요를 보존하고 확정 총액으로 수락하지 않는다. 적용 없음/확정0원도 직원의 명시 확인 근거가 필요하다."
    violation: "임의 세율/할인율/배송료/반올림 자동 산식 없음."
    source: "FR4.3, FR6.2; Q4"
  - id: BR4.4
    category: constraint
    applies_to: "CommercialProposal"
    trigger: "주문 가격/조건 변경 제안"
    statement: "구매 당시 조건과 변경 제안을 분리한다."
    logic: "IF 다른 가격/총액/조건이 필요하면 THEN 원래 조건과 정확한 새 제안 개정·대상·근거를 제시하고 기존 주문을 자동 교체하지 않는다."
    violation: "고객 동의 전 새 조건 수락/이행 금지."
    source: "FR4.3"
  - id: BR4.5
    category: authorization
    applies_to: "CustomerConsent"
    trigger: "고객 동의/거절"
    statement: "현재 자기 기업·대상 권한과 정확한 제안 개정에 응답을 연결한다."
    logic: "IF 제안이 현재 유효하고 원래/변경 조건·기업·대상·개정이 일치하면 THEN AGREE/DECLINE 근거를 보존한다. 오래된 제안·거절·미확인은 동의 완료가 아니다."
    violation: "새 제안 재확인; 알림/열람·직원 입력의 동의 대체 없음."
    source: "FR4.3, FR7.2, FR11.3"
  - id: BR4.6
    category: constraint
    applies_to: "OrderChangeApplication"
    trigger: "동의 후 조건 적용"
    statement: "동의와 필요한 승인·현재 대상 상태를 검증한 후 조건 변경을 한 번 적용한다."
    logic: "IF 정확한 동의/제안 개정·기업·고정 TargetScope·현재 주문 전제·필요 허용 근거가 모두 일치하면 THEN 현재 적용 조건과 변경 결과/이력을 함께 기록하고 수락 판단 근거를 재평가한다. REVIEW_PRICE_CHANGE는 REVIEW 주문만이며 후속 실행 효과가 없는 수락 전 조건 변경으로 U3가 검증한다. ACCEPTED_AFTERSALES_CHANGE는 ACCEPTED 주문과 확인된 U7 AfterSalesDecisionRecord가 필수다. 경로/필수 근거가 맞지 않으면 적용하지 않는다. 최초 구매 스냅샷은 보존한다."
    violation: "충돌/거절/미확인은 기존 적용 조건 유지; 실제 대금/제공 완료로 표시하지 않는다."
    source: "FR4.3, FR6.3, FR7.3"
  - id: BR5.1
    category: policy
    applies_to: "갱신 합의 평가"
    trigger: "수동 갱신 조건 조회"
    statement: "갱신 조건은 기업 계약 우선으로 평가한다."
    logic: "IF U6의 수동 갱신 대상 권한·회차가 확인되면 THEN 계약 범위의 가격/산정 근거를 평가하여 U6/U4에 전달한다. 자동 갱신 실행은 첫 배포에서 활성화하지 않는다."
    violation: "계약/가격/산정 미확인은 HOLD, 기존 실제 기간 덮어쓰기 없음."
    source: "FR7.4, FR11.3"
  - id: BR5.2
    category: constraint
    applies_to: "갱신 변경 제안"
    trigger: "합의 범위 밖 가격/조건"
    statement: "합의 범위 밖은 직원 확인과 고객 새 합의 없이는 확정하지 않는다."
    logic: "IF 새 가격/조건이 기업 계약 범위를 벗어나면 THEN 해당 권한·회차·원래/새 조건을 고정한 제안을 확인하고 유효한 새 동의 전 적용하지 않는다."
    violation: "임의 현재 상품 가격 채택/새 회차 생성 없음."
    source: "FR11.3, FR7.4"
  - id: BR5.3
    category: constraint
    applies_to: "갱신 동의 상태"
    trigger: "통지/진행 조회"
    statement: "알림 전송·열람을 갱신 동의로 취급하지 않는다."
    logic: "IF 동의 결과가 미확인이면 THEN 미확인과 재확인 경로만 제공하며 고객 동의/연장 완료로 표시하지 않는다."
    violation: "통지 성공의 업무 완료 승격 없음."
    source: "FR11.3"
  - id: BR5.4
    category: constraint
    applies_to: "갱신 CustomerConsent"
    trigger: "수동 갱신 제안 동의"
    statement: "갱신 동의를 U6의 정확한 권한·회차와 제안 개정에 결합한다."
    logic: "IF 현재 고객 권한·기업·권한/회차·제안/계약 조건이 일치하면 THEN 동의 근거를 기록하여 U6의 후속 판단에 전달한다. 실제 연장/지급 원본은 수정하지 않는다."
    violation: "대상/회차/개정 불일치 HOLD; 동의는 실제 기간 변경이 아니다."
    source: "FR11.3"
```

## 규칙 요약

| 규칙 | 판단 기준 | 근거 |
| --- | --- | --- |
| BR1.1 | 권한 있는 내부 직원만 상품을 등록·수정한다. | FR4.1, FR3.1, FR3.2 |
| BR1.2 | HW·영구 SW·기간제 SW의 필수 판매 정보를 구별한다. | FR4.1 |
| BR1.3 | 현재 기업에 허용된 공통 조건과 승인 예외만 제시한다. | FR4.2, FR3.1 |
| BR1.4 | 첫 배포 KRW 단가는 비음수 원 단위 정수다. | FR4.1, FR4.3; Q1 |
| BR2.1 | 내용·합의 근거·기업/상품 대상·유효 구간·등록자를 정확한 개정에 고정한다. | FR7.1 |
| BR2.2 | 자기 기업의 대상 계약과 현재 변경 요청 권한을 확인한다. | FR7.2 |
| BR2.3 | 계약 등록자와 승인자는 검증된 서로 다른 사람이어야 한다. | FR7.3, FR3.2 |
| BR2.4 | 확인한 정확한 대상 개정과 근거로만 승인하고 적용한다. | FR7.3 |
| BR2.5 | 동일 기업·상품·조건 항목에서 상충하는 승인 조건의 유효 기간 중첩은 적용 차단한다. | FR4.2, FR7.4; Q2 |
| BR2.6 | 기업 계약 조건을 우선하고 범위 밖 개별 예외는 새 합의가 필요하다. | FR7.4 |
| BR2.7 | 모든 변경을 원본·대상·행위자·시점·근거·전후 개정과 연결한다. | FR4.3, FR7.3, FR7.4 |
| BR3.1 | 현재 승인 기업·권한과 동일 타입/유효 수량·1–100행·단일 지급 종류를 검증한다. | FR5.1, FR5.2, FR5.4; Q3 |
| BR3.2 | 판매 당시 가격·조건·상품/계약 개정을 주문과 함께 불변 보존한다. | FR4.3, FR5.1 |
| BR3.3 | 같은 요청은 같은 결과를 추적하고 추가 업무 효과를 만들지 않는다. | FR5.2, NFR3 |
| BR3.4 | 첫 배포의 유효 주문은 전체 직원 검토로 접수한다. | FR6.1, FR6.2, FR6.3; 첫 배포 계획 |
| BR3.5 | 기본 제공 방식은 FULL이며 첫 배포는 일괄 제공만 실행한다. | FR5.3 |
| BR3.6 | 일괄 제공 주문에서 일부만 준비됐다는 이유로 부분 제공하지 않는다. | FR5.3, FR6.2 |
| BR3.7 | 전체 품목의 현재 계약·공급·납기·대금 조건 근거로 판단한다. | FR6.2, FR6.3 |
| BR3.8 | 읽은 대상·조건·근거 개정이 현재 판단 전제와 같아야 한다. | FR6.3, FR7.3, NFR3 |
| BR4.1 | 원 단위 정수로 행 금액과 합계를 정확히 계산한다. | FR4.3, NFR3; Q1, Q4 |
| BR4.2 | 포함 여부·적용 위치·금액·근거가 확인된 항목만 한 번 반영한다. | FR4.3; Q4 |
| BR4.3 | 미확인 금액·세금 포함 여부를0원/면제로 가정하지 않는다. | FR4.3, FR6.2; Q4 |
| BR4.4 | 구매 당시 조건과 변경 제안을 분리한다. | FR4.3 |
| BR4.5 | 현재 자기 기업·대상 권한과 정확한 제안 개정에 응답을 연결한다. | FR4.3, FR7.2, FR11.3 |
| BR4.6 | 동의와 필요한 승인·현재 대상 상태를 검증한 후 조건 변경을 한 번 적용한다. | FR4.3, FR6.3, FR7.3 |
| BR5.1 | 갱신 조건은 기업 계약 우선으로 평가한다. | FR7.4, FR11.3 |
| BR5.2 | 합의 범위 밖은 직원 확인과 고객 새 합의 없이는 확정하지 않는다. | FR11.3, FR7.4 |
| BR5.3 | 알림 전송·열람을 갱신 동의로 취급하지 않는다. | FR11.3 |
| BR5.4 | 갱신 동의를 U6의 정확한 권한·회차와 제안 개정에 결합한다. | FR11.3 |

## 적용 경계와 후속

BR3.4는 첫 배포의 직원 전체 판단을 정한다. 원래 자동 확정·혼합 지급·부분 제공·모바일·자동 갱신의 전체 AC는 [추적 표](traceability.json)에서 Deferred로 보존한다. 후속 기능의 참조/금지 규칙이 존재해도 실제 제공이 완료된 것은 아니다. 금액 규칙은 세율·법적 의무를 결정하지 않고 직원이 확인한 금액과 합의 근거를 검증한다.

등록자·승인자의 서로 다른 사람 확인은 U2의 현재 유효한 확인 결과에 의존한다. 기존 U2 동일인/필수 출처 검증의 미해결 문제 및 실제 신뢰 근거 미확인은 유지하며, U3가 더 약한 로컬 판정으로 우회하지 않는다. 실제 배포 준비 판단은 후속 검증과 별개다.

## Sources

- [요구사항](../../../inception/requirements-analysis/requirements.md): FR3–FR7·FR11.3·NFR3.
- [스토리](../../../inception/user-stories/stories.md): 할당한 12개 US·42개 AC.
- [첫 배포 계획](../../../release-planning/first-release-delivery-plan.md): 부분 적용과 후속 책임.
- [공통 계약](../../../inception/contract-design/contract-summary.md): C03/C04/C05·접수/결과·원본 참조.
- [확인한 Q&A](functional-design-questions.md): 단가·충돌·100입력행·금액 처리와 전체 확인.
