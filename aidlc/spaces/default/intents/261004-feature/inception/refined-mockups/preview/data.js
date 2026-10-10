const OMS_DEMO = {
  "screens": [
    {
      "id": "C01",
      "title": "주문·갱신 현황",
      "kind": "customer",
      "goal": "허용 범위의 주문과 갱신에서 지금 필요한 행동을 찾는다.",
      "layout": "확인할 업무 → 판매·지급·제공 요약 → 최근 주문 표 → 기간제 갱신 목록",
      "rule": "다음 조치·관련 주문·권한 상세로 이동. 요청 대기와 실제 완료를 분리한다."
    },
    {
      "id": "C02",
      "title": "상품",
      "kind": "customer",
      "goal": "자기 기업에 허용된 판매 상품과 조건을 확인한다.",
      "layout": "HW/SW 타입 선택 → 목록·상세 → 공개/가격·이용형·공급 확인 근거",
      "rule": "같은 타입 주문 작성으로 이동. 고객에게 상품 등록 행동을 제공하지 않는다."
    },
    {
      "id": "C03",
      "title": "주문 작성",
      "kind": "customer",
      "goal": "같은 타입의 다품목 주문을 검토하고 제출한다.",
      "layout": "상품·수량 → 품목별 이용·지급 조건 및 일괄/부분 제공 → 전체 검토 → 접수 결과",
      "rule": "일괄 제공 기본값. HW/SW 혼합은 거절. SW 영구/기간제와 선후불 혼합은 품목별로 유지한다."
    },
    {
      "id": "C04",
      "title": "주문 상세",
      "kind": "customer",
      "goal": "판매 판단·청구·지급·제공과 남은 조치를 따로 확인한다.",
      "layout": "주문 제목·타입 → 세 상태 요약 → 청구/지급 별도 영역 → 수량별 진행 → 공개 이력",
      "rule": "가격 변경 동의·전체 주문 후속 요청·권한 상세 연결. 주문 조회만 있으면 대금·발급 결과를 노출하지 않는다."
    },
    {
      "id": "C05",
      "title": "사용 권한·갱신",
      "kind": "customer",
      "goal": "계약 기간과 실제 이용 기간, 발급과 갱신의 결과를 확인한다.",
      "layout": "기업·상품·수량·이용형 → 발급 → 계약/실제 기간 → 갱신 회차·합의·지급·적용 → 이력",
      "rule": "수동 갱신 요청·자동 갱신 신청/해제·가격 변경 동의. 영구형에는 기간제 갱신을 붙이지 않는다."
    },
    {
      "id": "C06",
      "title": "변경·취소·반품 요청",
      "kind": "customer",
      "goal": "주문 전체 요청과 판단·실제 후속 결과를 추적한다.",
      "layout": "전체 주문 대상 → 종류·사유 → 검토 → 접수/판단 → 회수·환불·잔량별 결과",
      "rule": "특정 품목만 요청하는 UI는 제공하지 않는다. 접수는 회수·환불 완료와 다르다."
    },
    {
      "id": "C07",
      "title": "담당자·조직",
      "kind": "customer",
      "goal": "자기 기업 사용자와 소속, 관리자 부재를 관리한다.",
      "layout": "현재 기업 → 담당자·활성 상태 표 → 부서/사업장 소속 → 초대·변경 → 이력",
      "rule": "마지막 관리자 회수는 경고 후 확정된 정책대로 처리. 다른 사용자를 자동 중단하지 않는다."
    },
    {
      "id": "C08",
      "title": "역할·업무 범위",
      "kind": "customer",
      "goal": "행위별로 허용할 업무와 부서/사업장 범위를 정의한다.",
      "layout": "역할 목록 → 행위 체크 → 행위별 범위 조합 → 유효 권한 검토 → 부여/회수 이력",
      "rule": "조회·제출·승인 자동 묶음 없음. 동일 행위의 합집합이며 행위 간 범위를 교차 확대하지 않는다."
    },
    {
      "id": "C09",
      "title": "기업 계약",
      "kind": "customer",
      "goal": "유효 계약과 변경 요청·동의 근거를 구별한다.",
      "layout": "허용 계약 목록 → 상품·유효 범위 → 기존 조건/변경 요청 비교 → 합의·승인·적용 이력",
      "rule": "고객 계약 변경 요청. 등록·열람·이메일 수신만으로 합의를 완료하지 않는다."
    },
    {
      "id": "S01",
      "title": "처리할 업무",
      "kind": "staff",
      "goal": "권한 있는 확인·지연·실패·미확인 업무를 찾는다.",
      "layout": "유형/이유 필터 → 업무 표(대상·단계·출처·남은 조치) → 해당 상세",
      "rule": "0건은 업무 없음. 조회 실패는 0건으로 표시하지 않는다. 일반 주문 조회 S07 경로를 유지한다."
    },
    {
      "id": "S02",
      "title": "판매 상품 관리",
      "kind": "staff",
      "goal": "내부 직원만 판매 상품과 기업별 예외를 관리한다.",
      "layout": "상품 목록 → HW/SW·이용형 필수 판매 정보 → 공통 조건/기업 예외 → 근거·적용 이력",
      "rule": "불완전 조건은 주문 가능한 조건으로 노출하지 않는다. 계약 조건 예외는 S08 승인 경로를 거친다."
    },
    {
      "id": "S03",
      "title": "주문 확인",
      "kind": "staff",
      "goal": "전체 주문 수락 판단에 필요한 조건과 근거를 확인한다.",
      "layout": "제출 가격 → 품목별 조건/공급/납기 근거 → 미확인·충돌·조회 실패 → 전체 수락 판단",
      "rule": "일부 품목만 자동 확정 금지. 가격 변경은 고객 새 동의. 오래된 판단은 재확인한다."
    },
    {
      "id": "S04",
      "title": "하드웨어 이행",
      "kind": "staff",
      "goal": "확보·예약·출고·제공 완료·회수를 수량별로 연결한다.",
      "layout": "주문/정책/지급 조건 → 품목별 요청·실제 결과·잔량 → 직원 근거/외부 출처 → 재처리·회수",
      "rule": "배송 완료/고객 인수 중 계약 기준을 사용. 실패 잔량만 재처리하며 미확인은 먼저 대조한다."
    },
    {
      "id": "S05",
      "title": "소프트웨어 제공",
      "kind": "staff",
      "goal": "기업 SW 발급·기간 승인·갱신과 실제 적용 결과를 관리한다.",
      "layout": "기업·상품·수량 → 발급 결과 → 계약/실제 기간 → 기간 요청/별도 승인 → 갱신 회차 → 실패 잔량",
      "rule": "기간 요청/승인 두 권한이면 동일인 별도 승인 가능. 발급 완료+합의 시작 도달이 제공 완료 조건이다."
    },
    {
      "id": "S06",
      "title": "변경·예외 처리",
      "kind": "staff",
      "goal": "후속 요청 판단과 실제 보류·회수·환불·정정을 구별한다.",
      "layout": "전체 요청 → 제공분/잔량 → 판단·근거 → 영향을 받는 추가 업무 → 결과/상충 대조",
      "rule": "미정·상충은 직원 판단. 보류 요청을 실제 정지로 표시하지 않는다. 관련 없는 업무는 일괄 중단하지 않는다."
    },
    {
      "id": "S07",
      "title": "전체 주문",
      "kind": "staff",
      "goal": "처리 업무 유무와 무관하게 권한 내 진행·완료 주문을 조회한다.",
      "layout": "기업/타입/상태 검색 → 주문 표 → 주문·이행·후속 요청 상세",
      "rule": "완료·정상 진행·잔량·미확인을 구분. 업무 대기 목록으로 일반 주문 조회를 대체하지 않는다."
    },
    {
      "id": "S08",
      "title": "계약 등록·승인",
      "kind": "staff",
      "goal": "합의 근거를 확인하고 등록자와 다른 사람이 조건 적용을 승인한다.",
      "layout": "계약/내용 버전 → 원래/제안 조건 → 근거·등록자 → 승인자 검토 → 유효 시점·실제 적용",
      "rule": "본인은 다른 계정/역할로도 자기 승인 불가. 다른 승인자 부재는 미승인 유지. 입력 자체는 고객 동의가 아니다."
    },
    {
      "id": "S09",
      "title": "청구·지급·배분",
      "kind": "staff",
      "goal": "지급 사실·미배분 잔액·제공 건별 후불·환불을 대조한다.",
      "layout": "청구와 지급 원장 → 출처/참조 → 미배분 잔액 → 배분 대상·금액 → 후불 기산·환불 결과",
      "rule": "명확한 참조·사전 규칙만 자동 배분. 중복/초과 배분 금지. 선결제액에는 후불액을 합산하지 않는다."
    },
    {
      "id": "S10",
      "title": "기업 이용 확인",
      "kind": "staff",
      "goal": "기업 신청, 최초 관리자와 관리자 재지정을 확인한다.",
      "layout": "신청/부재 기업 → 신원·기업 확인 근거 → 지정 대상 → 별도 필요한 권한 → 결과·이력",
      "rule": "기업 확인과 관리자 지정 권한을 구별. 근거 부족을 승인으로 처리하지 않는다."
    },
    {
      "id": "S11",
      "title": "내부 역할·계정 복구",
      "kind": "staff",
      "goal": "내부 행위 권한과 허용된 담당자 복구를 관리한다.",
      "layout": "직원/역할 → 행위별 부여·회수 → 복구 대상·확인 근거 → MFA 재설정 결과·알림·이력",
      "rule": "권한 관리자가 거래 전체 권한을 자동 보유하지 않는다. 이메일만으로 MFA를 해제하지 않는다."
    },
    {
      "id": "A01",
      "title": "로그인·추가 인증",
      "kind": "access",
      "goal": "고객/직원이 MFA와 접속 조건을 충족해 업무에 진입한다.",
      "layout": "로그인 → 추가 인증 → 허용 기업/업무 문맥 → 복귀 또는 확인 불가",
      "rule": "인증 제품·수단·세션 시간은 OQ4. 입력 붙여넣기를 막지 않는다. 직원은 별도 PC·접속 환경 조건이 필요하다."
    },
    {
      "id": "A02",
      "title": "기업 이용 신청",
      "kind": "access",
      "goal": "기업 이용 신청과 확인 대기 결과를 확인한다.",
      "layout": "확정된 신청 항목 → 내용 검토 → 신청 결과 → 직원 확인 대기",
      "rule": "미승인 신청자는 주문할 수 없다. 타 기업 신청 식별자로 내용을 조회하지 못한다."
    },
    {
      "id": "A03",
      "title": "계정 복구",
      "kind": "access",
      "goal": "사전 복구 수단 또는 담당자 본인 확인으로 MFA를 재설정한다.",
      "layout": "사전 수단 확인 → 재등록 → 이전 수단 무효화·이력·알림 → 로그인 복귀",
      "rule": "무효 수단이면 담당자 확인 경로. 비상 복구 절차는 OQ4 해소 전 실제 실행 가능하다고 표시하지 않는다."
    }
  ],
  "stories": [
    {
      "id": "US1.1",
      "title": "기업 이용 신청",
      "route": "A02",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US1.2",
      "title": "기업 확인과 최초 관리자 지정",
      "route": "S10",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US1.3",
      "title": "고객 담당자와 소속 관리",
      "route": "C07",
      "p": "P2",
      "readOnly": false
    },
    {
      "id": "US1.4",
      "title": "고객 역할 정의",
      "route": "C08",
      "p": "P2",
      "readOnly": false
    },
    {
      "id": "US1.5",
      "title": "조직 범위에 맞는 업무 접근",
      "route": "C08",
      "p": "P1",
      "readOnly": true
    },
    {
      "id": "US1.6",
      "title": "내부 직원 역할 관리",
      "route": "S11",
      "p": "P7",
      "readOnly": false
    },
    {
      "id": "US1.7",
      "title": "MFA를 거친 업무 접근",
      "route": "A01",
      "p": "P1",
      "readOnly": true
    },
    {
      "id": "US1.8",
      "title": "사전 수단으로 계정 복구",
      "route": "A03",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US1.9",
      "title": "담당자 확인 계정 복구",
      "route": "S11",
      "p": "P7",
      "readOnly": false
    },
    {
      "id": "US1.10",
      "title": "관리자 부재와 재지정",
      "route": "S10",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US2.1",
      "title": "판매 상품 등록",
      "route": "S02",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US2.2",
      "title": "기업에 허용된 상품 확인",
      "route": "C02",
      "p": "P1",
      "readOnly": true
    },
    {
      "id": "US2.3",
      "title": "기업별 공개·가격 예외 관리",
      "route": "S02",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US2.4",
      "title": "계약 조건 등록",
      "route": "S08",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US2.5",
      "title": "계약 조건 변경 요청",
      "route": "C09",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US2.6",
      "title": "다른 등록자의 계약 승인",
      "route": "S08",
      "p": "P6",
      "readOnly": false
    },
    {
      "id": "US2.7",
      "title": "기업 계약 우선 적용",
      "route": "S08",
      "p": "P3",
      "readOnly": true
    },
    {
      "id": "US3.1",
      "title": "같은 타입 다품목 주문 제출",
      "route": "C03",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US3.2",
      "title": "조건 충족 주문의 자동 확정",
      "route": "C04",
      "p": "P1",
      "readOnly": true
    },
    {
      "id": "US3.3",
      "title": "확인 대기 이유 파악",
      "route": "S03",
      "p": "P3",
      "readOnly": true
    },
    {
      "id": "US3.4",
      "title": "주문 전체 수락 판단",
      "route": "S03",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US3.5",
      "title": "주문 가격 변경 제안 확인",
      "route": "C04",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US3.6",
      "title": "일괄·부분 제공 선택",
      "route": "C03",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US4.1",
      "title": "직원 청구·지급 근거 등록",
      "route": "S09",
      "p": "P4",
      "readOnly": false
    },
    {
      "id": "US4.2",
      "title": "외부 청구·지급 결과 수신",
      "route": "S09",
      "p": "P4",
      "readOnly": false
    },
    {
      "id": "US4.3",
      "title": "명확한 지급 자동 배분",
      "route": "S09",
      "p": "P4",
      "readOnly": false
    },
    {
      "id": "US4.4",
      "title": "미배분 지급 확인·정정",
      "route": "S09",
      "p": "P4",
      "readOnly": false
    },
    {
      "id": "US4.5",
      "title": "제공 건별 후불 기한 확인",
      "route": "S09",
      "p": "P4",
      "readOnly": true
    },
    {
      "id": "US4.6",
      "title": "계약상 연체 제한 관리",
      "route": "S09",
      "p": "P4",
      "readOnly": false
    },
    {
      "id": "US5.1",
      "title": "HW 결과의 직원 근거 등록",
      "route": "S04",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US5.2",
      "title": "HW 외부 결과 연결",
      "route": "S04",
      "p": "P3",
      "readOnly": true
    },
    {
      "id": "US5.3",
      "title": "정책에 따른 HW 확보 진행",
      "route": "S04",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US5.4",
      "title": "보유 재고 예약 관리",
      "route": "S04",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US5.5",
      "title": "지급·제공 조건을 지킨 출고",
      "route": "S04",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US5.6",
      "title": "HW 제공 완료 확인",
      "route": "S04",
      "p": "P3",
      "readOnly": true
    },
    {
      "id": "US5.7",
      "title": "실패한 HW 이행 재처리",
      "route": "S04",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US6.1",
      "title": "기업 SW 권한 발급",
      "route": "S05",
      "p": "P5",
      "readOnly": false
    },
    {
      "id": "US6.2",
      "title": "발급 결과와 기간 확인",
      "route": "C05",
      "p": "P1",
      "readOnly": true
    },
    {
      "id": "US6.3",
      "title": "실제 이용 기간 조정 요청",
      "route": "S05",
      "p": "P5",
      "readOnly": false
    },
    {
      "id": "US6.4",
      "title": "실제 이용 기간 조정 승인",
      "route": "S05",
      "p": "P5",
      "readOnly": false
    },
    {
      "id": "US6.5",
      "title": "SW 제공 완료와 후불 기산 확인",
      "route": "S05",
      "p": "P5",
      "readOnly": true
    },
    {
      "id": "US6.6",
      "title": "실패한 SW 발급 재처리",
      "route": "S05",
      "p": "P5",
      "readOnly": false
    },
    {
      "id": "US7.1",
      "title": "기간제 갱신 요청",
      "route": "C05",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US7.2",
      "title": "권한별 자동 갱신 신청",
      "route": "C05",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US7.3",
      "title": "자동 갱신 해제 요청",
      "route": "C05",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US7.4",
      "title": "계약상 자동 갱신 실행",
      "route": "S05",
      "p": "P5",
      "readOnly": false
    },
    {
      "id": "US7.5",
      "title": "갱신 가격 변경 합의",
      "route": "C05",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US7.6",
      "title": "계약 유예의 임시 이용",
      "route": "S05",
      "p": "P5",
      "readOnly": false
    },
    {
      "id": "US7.7",
      "title": "유예 중 지급 후 갱신 정리",
      "route": "S05",
      "p": "P5",
      "readOnly": false
    },
    {
      "id": "US7.8",
      "title": "보상 중첩 갱신 요금 조정",
      "route": "S09",
      "p": "P4",
      "readOnly": false
    },
    {
      "id": "US8.1",
      "title": "주문 전체 변경 요청",
      "route": "C06",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US8.2",
      "title": "주문 전체 취소 요청",
      "route": "C06",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US8.3",
      "title": "주문 전체 반품 요청",
      "route": "C06",
      "p": "P1",
      "readOnly": false
    },
    {
      "id": "US8.4",
      "title": "검토 중 이행 보류 판단",
      "route": "S06",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US8.5",
      "title": "승인된 권한 회수 결과 추적",
      "route": "S06",
      "p": "P5",
      "readOnly": false
    },
    {
      "id": "US8.6",
      "title": "환불 요청·결과·잔액 추적",
      "route": "S09",
      "p": "P4",
      "readOnly": false
    },
    {
      "id": "US8.7",
      "title": "상충·미확인 근거 대조",
      "route": "S06",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US8.8",
      "title": "주문 진행과 남은 조치 확인",
      "route": "C04",
      "p": "P1",
      "readOnly": true
    },
    {
      "id": "US8.9",
      "title": "업무 알림 수신",
      "route": "C01",
      "p": "P1",
      "readOnly": true
    },
    {
      "id": "US8.10",
      "title": "확인 필요한 후속 요청 판단",
      "route": "S06",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US8.11",
      "title": "HW 회수 요청·결과·잔량 추적",
      "route": "S04",
      "p": "P3",
      "readOnly": false
    },
    {
      "id": "US8.12",
      "title": "직원의 업무 진행 조회",
      "route": "S07",
      "p": "P3",
      "readOnly": true
    },
    {
      "id": "US9.4",
      "title": "변경·승인·정정 이력 확인",
      "route": "S01",
      "p": "P3",
      "readOnly": true
    }
  ],
  "products": [
    {
      "id": "HW01",
      "name": "업무용 서버 A",
      "type": "HW",
      "form": "하드웨어",
      "price": 1200000,
      "payment": "선불",
      "term": "해당 없음"
    },
    {
      "id": "HW02",
      "name": "네트워크 장비 B",
      "type": "HW",
      "form": "하드웨어",
      "price": 300000,
      "payment": "후불",
      "term": "해당 없음"
    },
    {
      "id": "SW01",
      "name": "보안 소프트웨어 Standard",
      "type": "SW",
      "form": "기간제",
      "price": 180000,
      "payment": "선불",
      "term": "2026-12-01 ~ 2027-11-30"
    },
    {
      "id": "SW02",
      "name": "설계 소프트웨어 Basic",
      "type": "SW",
      "form": "영구",
      "price": 420000,
      "payment": "후불",
      "term": "영구 이용"
    }
  ]
};

