# U1 업무 규칙

## 범위와 소유권

유효 신청/승인·최초 관리자, 필요한 MFA/권한, 공통 상품·유효 주문 요청, 전체 검토 사유·접수/전달/조회 연결에 적용한다. 금융·HW·SW 전체 이행 규칙을 U1에서 구현 완료했다고 주장하지 않는다. 해당 공급자가 없으면 미확인과 원래 대상/남은 조치를 보존한다. [S1–S5·S8]

## Business Rules — Source of Truth

아래 YAML의 numbered rule이 원본이다. category는 validation/authorization/constraint/calculation/policy 중 하나다. 금액/기간 계산의 값·산식은 아직 확인이 필요하므로 구현 계산 규칙을 발명하지 않는다. source의 Q1/Q2는 이 단위의 실제 답변이고 FR/NFR은 승인된 상위 요구사항이다. 상태 전이와 순서는 functional-spec.md가 원본이다.

```yaml
unit: u1-integrated-foundation
version: '1.0'
rules:
- id: BR1.1
  statement: 기업 이용 신청의 확인 필드와 신청자 문맥을 지속 기록한다.
  category: validation
  applies_to:
  - EnterpriseApplication
  trigger: applyEnterprise
  logic: IF MFA를 충족한 활성 신청자이고 legalName·designatedContact·registrationEvidenceRefs의 계약 형식이 유효 THEN 원래 신청 ID와 PENDING/UNVERIFIED 상태·근거/이력을 같은 지속
    커밋으로 기록한다. 실제 확인 항목의 정책이 없으면 승인 가능으로 표시하지 않는다.
  violation_behaviour: 잘못된 입력은400, 비인증/미완료 MFA는401/403; 성공 접수 응답은 커밋 확인 후만 반환.
  source: FR1.1; NFR1; C02; AC1.1.1
- id: BR1.2
  statement: 미승인/이용 중지 기업의 주문을 접수하지 않는다.
  category: authorization
  applies_to:
  - Enterprise
  - Order
  trigger: submitOrder
  logic: IF 기업 승인과 이용 활성·사용자의 활성 소속을 확인할 수 없거나 충족하지 못함 THEN 주문 생성/작업 발행을 허용하지 않는다.
  violation_behaviour: 확인된 미승인/중지는403의 허용된 사유; 원본 조회 실패는503 등 기술 실패. 직원 대기 주문으로 우회하지 않음.
  source: FR1.1; FR5.2; AC1.1.2
- id: BR1.3
  statement: 다른 기업의 신청·접수·주문 식별자로 내용이나 존재를 노출하지 않는다.
  category: authorization
  applies_to:
  - EnterpriseApplication
  - RequestReceipt
  - 조회 목록
  trigger: 조회/재조회
  logic: IF 신청자 또는 해당 기업/판단 정보의 허용된 직원 권한이 없음 THEN 내용·수/존재·이력·민감 사유를 반환하지 않는다. 접수는 원래 principal/audience에 결합하고 현재 권한도 확인한다.
  violation_behaviour: 타 주체가 찍은 식별자는404 등 동일한 비노출 응답; 자기 요청의 알려진 권한 부족은403. 목록·오류로 우회 누출 금지.
  source: FR1.1; FR2.1; FR14.1; AC1.1.3; AC3.3.3
- id: BR2.1
  statement: 기업 승인은 정해진 검증 정책의 근거·현재 대상 개정과 직원 확인 권한을 필요로 한다.
  category: validation
  applies_to:
  - EnterpriseApplication
  - Enterprise
  trigger: approveEnterprise
  logic: IF 허용된 직원이고 실제 검증 정책의 모든 기업 확인 근거가 대상에 연결되며 유효하고 현재 개정 일치 THEN APPROVED 결과와 근거/행위자/이력을 기록한다. 부족한 근거는 미확인으로 남긴다.
  violation_behaviour: 증거 부족은422 등 검증 실패와 필요한 확인 항목; 승인으로 변경하지 않음. 개정 경합은409.
  source: FR1.1; FR15.4; AC1.2.1; AC1.2.2
- id: BR2.2
  statement: 최초 관리자는 지정 권한이 있는 직원이 확인된 계정·기업 관계를 대조해 지정한다.
  category: authorization
  applies_to:
  - EnterpriseMembership
  - EnterpriseApplication
  trigger: designateInitialAdministrator (CE02)
  logic: IF 직원에게 별도 최초 관리자 지정 권한이 있고 기업과 후보 계정·관계 근거 및 현재 개정이 확인됨 THEN 관리자 지정과 명시적 기업 관리 범위/역할 결과를 이력과 함께 기록한다. 기업 확인 권한만으로 지정하지 않는다.
  violation_behaviour: 미부여 행위는403; 미확인 관계는422/확인 필요. 후보 계정이나 role scope가 다른 기업이면 거절.
  source: FR1.2; FR2.4; FR3.1; AC1.2.1; AC1.2.3
- id: BR2.3
  statement: 관리자 지정·기업 승인과 개별 주문/대금/SW 권한을 자동 결합하지 않는다.
  category: authorization
  applies_to:
  - Membership
  - RoleGrant
  - StaffRoleGrant
  trigger: 권한 부여와 실행
  logic: IF 기업/계정/조직 관리 권한만 있음 THEN 그 관리 행위만 허용하고 거래 행위는 별도 실제 ActionScope/StaffRoleGrant로 판단한다. 최초 관리 권한도 명시적으로 기록한다.
  violation_behaviour: 미부여 거래 행동은403; 화면에 해당 행동/민감 section을 표시하지 않음.
  source: FR2.2; FR2.4; FR3.1; AC1.2.3
- id: BR2.4
  statement: 모든 업무 접점에 MFA·활성 주체·audience와 직원망을 검증한다.
  category: authorization
  applies_to:
  - IdentitySession
  - API
  - worker의 사용자 기원 실행
  trigger: 업무 조회/변경/worker 실행
  logic: IF 목적 제한 세션/만료·무효 수단·활성 미확인 OR STAFF의 승인된 접속망 근거 없음 THEN 업무 실행을 거절한다. SYSTEM 작업은 서비스 실행 허가를 별도로 검증한다.
  violation_behaviour: 401/403; 신뢰 원본 조회 실패는 기술 실패로 차단. 사내망 또는 PC 화면 폭으로 MFA를 대체하지 않음.
  source: FR16.1; FR5.2; NFR1
- id: BR3.1
  statement: 조직 기준 사용 여부는 고객사 관리자가 명시하며 기본은 UNSET이다.
  category: policy
  applies_to:
  - Enterprise.orderingContextPolicy
  trigger: setOrderingContextPolicy (CE01)
  logic: IF 기업관리자 지정과 organisation.manage의 현재 기업 범위가 확인되고 두 기준의 USED/NOT_USED를 명시함 THEN 정책·행위자·이유·개정/이력을 기록한다. 조직 수/이름이나 현재 소속에서 미사용을 추측하지 않는다.
  violation_behaviour: 미부여는403, 누락/잘못된 값은400, 오래된 개정은409; UNSET은 명시적 NOT_USED가 아님.
  source: FR2.1; FR2.4; FR15.4; Q1
- id: BR3.2
  statement: 신규 주문 문맥은 같은 기업의 현재 유효 정책·조직과 제출 범위를 만족해야 한다.
  category: validation
  applies_to:
  - Order.targetScope
  - Department
  - BusinessSite
  trigger: submitOrder
  logic: IF USED인 기준에 해당 기업의 활성 원본이 없거나 NOT_USED인데 값이 지정됐거나 정책이 UNSET THEN 제출 거절. 유효 시 서버가 원본으로 구성한 TargetScope와 클라이언트의 제안 문맥을 대조하고 당시 정책/조직 개정을
    보존한다.
  violation_behaviour: 누락/형식 불일치400, 미허용 대상403 또는 비노출404, 관측한 정책/조직이 바뀜409; 누락을 NULL로 보충하지 않음.
  source: FR2.1; FR5.2; Q1; C00.TargetScope
- id: BR3.3
  statement: 접수한 주문 조직은 요청자의 이후 소속/조직 정책 변경으로 바꾸지 않는다.
  category: constraint
  applies_to:
  - Order
  - RequestReceipt
  - 후속 업무 참조
  trigger: 소속/조직/역할 변경 및 과거 주문 조회
  logic: IF 현재 소속/조직이 변경됨 THEN 기존 Order.targetScope·원래 policy Ref/개정·주문/접수 ID를 유지한다. 후속 업무와 조회는 그 주문 원본 문맥으로 현재 권한을 검증한다.
  violation_behaviour: 과거 주문 자동 재분류/이관 금지; 일반 업무 변경으로 원래 문맥·이력을 덮어쓰는 시도 거절.
  source: FR2.1; FR15.4; Q2; Domain R-01
- id: BR3.4
  statement: 행위별 완성된 범위만 합집합으로 평가한다.
  category: authorization
  applies_to:
  - ActionScope
  - CustomerRoleGrant
  trigger: evaluateAccess
  logic: IF 활성/유효 역할들 중 같은 action의 한 scope라도 원래 targetScope를 포함 THEN 그 행위만 ALLOW. 다른 action 또는 서로 다른 scope의 부서/사업장 집합을 합쳐 새로운 조합을 만들지 않는다.
  violation_behaviour: 어떤 완성된 허용 scope도 없으면DENY; 신뢰 값 미확인은UNVERIFIED로 실행 차단.
  source: FR2.1; FR2.3; FR2.4; NFR1
- id: BR3.5
  statement: 폐지 조직 식별자와 기존 접근 범위를 보존하되 신규 주문 대상은 활성 조직만 허용한다.
  category: policy
  applies_to:
  - Department
  - BusinessSite
  - ActionScope
  - Order
  trigger: 조직 비활성화/역할 부여·회수/조회
  logic: IF 조직이 비활성화됨 THEN 과거 주문의 참조/개정은 보존하고 현재 명시적 역할 범위로 조회·변경 요청의 접근을 판단한다. 새 조직 권한은 옛 조직 권한이 아니며 신규 주문 활성 조건은 유지한다.
  violation_behaviour: 옛 조직 식별자 재사용/현재 소속에 따른 자동권한 이동 금지; 신규 주문의 비활성 대상은 거절.
  source: FR2.1; FR2.3; FR15.4; Q2
- id: BR3.6
  statement: 권한/조직/대상 버전을 응답 투영과 변경 커밋의 효력 시점까지 확인한다.
  category: constraint
  applies_to:
  - AccessHistory
  - 역할/소속
  - Order
  - worker
  trigger: 동시 권한 회수·조직 변경·업무 변경
  logic: IF 권한/대상 개정이 판단 이후 바뀜 THEN 커밋/반환 전 재평가하고 최신 권한/버전으로 실행 가능 여부를 결정한다. 이미 성공 접수한 원래 기록은 보존하며 미실행 작업은 허가/최신 조건을 재확인한다.
  violation_behaviour: 권한 소멸403, 버전 경합409, 대조 불명확 기술 실패/확인 대기. 이미 커밋된 사실은 무효 응답이라고 삭제하지 않음.
  source: FR5.2; FR15.1; FR15.3; NFR5
- id: BR3.7
  statement: 관리자 0명 상태를 경고·기록하며 다른 사용자의 업무를 자동 중지하지 않는다.
  category: policy
  applies_to:
  - Enterprise
  - EnterpriseMembership
  trigger: 관리자 부여/회수·비활성화
  logic: IF 마지막 관리자 권한이 회수됨 THEN 명시적 경고와 결과/이력을 남기되 인원 수만으로 회수 거절 또는 기업 전체 정지를 만들지 않는다. 이후 직원 재지정은 별도 확인 권한/근거가 필요하다.
  violation_behaviour: 관리자 부재 상태를 숨기지 않음; 최초/복원 지정으로 주문 권한을 자동 부여하지 않음.
  source: FR1.3; FR2.4
- id: BR4.1
  statement: 판매 상품은 해당 등록 권한을 가진 내부 직원만 등록한다.
  category: authorization
  applies_to:
  - Product
  - CommonOfferRevision
  trigger: registerProduct/reviseProduct
  logic: IF STAFF MFA/접속망/활성 계정/상품 등록 또는 수정 권한과 계약 입력이 유효 THEN HW/SW와 영구/기간제 구분·공통 조건을 지속 기록한다.
  violation_behaviour: 고객/외부 판매자의 등록403; HW에 SW 타입 값 또는 SW의 기간 유형 누락400; 현재 개정 불일치409.
  source: FR4.1; FR3.1; NFR1
- id: BR4.2
  statement: 기업 적용 가격·공개 예외가 미확인이면 공통 값을 확정 예외 결과로 가장하지 않는다.
  category: policy
  applies_to:
  - ProductView
  - CommonOfferRevision
  - PurchaseTermsSnapshot
  trigger: 상품 제시/주문 제출
  logic: IF 실제 확인된 공통/기업 예외가 있음 THEN 그 근거로 제시한다. 예외 판단 포트가 없거나 적용 조건 미확인이면 기업 적용 가격/거래 조건은UNKNOWN/CONFLICT로 표시하고 주문 전체 검토 사유로 보존한다. 공개되는 공통 가격은
    공통 가격임을 구별한다.
  violation_behaviour: 다른 기업 비공개 조건 누출 금지; 미확인 값을0원·예외 없음·확정 가격으로 반환하지 않음.
  source: FR4.2; FR6.2; C00.ProductView
- id: BR4.3
  statement: 제출 시 제시된 가격·판매/계약 개정·요청 조건을 원래 스냅샷으로 보존한다.
  category: constraint
  applies_to:
  - PurchaseTermsSnapshot
  - CommonOfferRevision
  trigger: submitOrder/상품 개정
  logic: IF 유효 제출 THEN 원래 개정/확인 값과 미확인 필드의 상태를 동결한다. 가격이 바뀌어도 기존 스냅샷을 덮어쓰지 않는다. 실제 변경 제안/새 동의는 U3의 별도 절차로 연결한다.
  violation_behaviour: 새 가격의 무단 소급 적용 거절; 원래 조건이 부족하면 해당 부분은 미확인으로 남김.
  source: FR4.3; FR15.4
- id: BR5.1
  statement: HW/SW는 별도 주문이고 같은 타입의 다품목·양수 수량만 접수한다.
  category: validation
  applies_to:
  - Order
  - OrderLine
  trigger: submitOrder
  logic: IF 라인≥1, 각 quantity가 양수 정수이며 모든 상품 타입=order.productType이고 원본/기업 관계·현재 공개/허용을 만족 THEN 접수한다. SW의 영구/기간제 조합은 같은SW 타입이다.
  violation_behaviour: 혼합/빈 주문·잘못된 수량/참조400/422; 타입 거절을 직원 검토로 우회하지 않음. 시험 50품목을 제품 상한으로 삼지 않음.
  source: FR5.1; FR5.2; NFR5
- id: BR5.2
  statement: FULL이 기본이며 PARTIAL은 실제 확인된 동의와 해당 조건을 필요로 한다.
  category: policy
  applies_to:
  - ProvisionChoice
  - Order
  trigger: 제공 선택/submitOrder
  logic: IF PARTIAL이면 실제 CustomerConsent의 기업/주문·품목/수량/지급/기간 조건과 현재 유효성을 검증한다. 확인 수단이 없으면 부분 제공을 확정하지 않는다. U1 기본 시연은FULL을 사용한다.
  violation_behaviour: 부분 동의 없음/미확인은 검증 실패 또는 확인 필요로 명시하며 가짜 동의 Ref를 생성하지 않음.
  source: FR5.3; FR5.4; FR15.1
- id: BR6.1
  statement: 미확인·특례·충돌·기술 실패를 품목/조건별 사유로 구별해 전체 검토 대기로 기록한다.
  category: policy
  applies_to:
  - AcceptanceDecision
  - LineAssessmentList
  trigger: 수락 판단/사유 조회
  logic: IF 하나라도 필수 조건의 확인 근거가 없거나 특례/충돌/조회 실패 THEN REVIEW_REQUIRED를 주문 전체에 기록한다. 각 line/condition에 reasonKind·reasonCode·원본 소유자/근거·관측 개정을 남긴다.
  violation_behaviour: 기술 실패를 단순 업무 검토와 합치거나 사유를 숨기지 않음; 근거 없음은 확인완료가 아님.
  source: FR6.2; FR14.1; AC3.3.1
- id: BR6.2
  statement: 일부 품목의 확인으로 주문 일부를 자동 판매 확정하지 않는다.
  category: constraint
  applies_to:
  - AcceptanceDecision
  - OrderLine
  trigger: 판단/재판단/조회
  logic: IF 일부 라인의 필수 판단이 미확인 THEN 전체 REVIEW_REQUIRED를 유지하고 미확인 품목을 모두 표현한다. 전체ACCEPTED는 계약·모든품목 공급/납기의 확인 근거와 최신 조건이 모두 있는 경우만 가능하다.
  violation_behaviour: 부분 자동 수락·미확인 잔량 은폐 금지; 수락을 실제 지급/확보/배송/발급 완료로 표시하지 않음.
  source: FR6.1; FR6.2; AC3.3.2
- id: BR6.3
  statement: 직원의 확인 대기 사유 조회도 현재 해당 판단 정보 권한을 요구한다.
  category: authorization
  applies_to:
  - AcceptanceDecision
  - WorkInquiry
  - RequestReceipt
  trigger: readReviewAssessment/readOrder/readReceipt
  logic: IF STAFF에게 해당 기업/주문의 판단 정보 조회 권한 없음 THEN 근거/내용/필요 조치를 반환하지 않는다. 주문 조회 권한이 다른 금융/발급 결과 읽기를 자동 허용하지 않는다.
  violation_behaviour: 403/비노출404; 목록·이력·진단으로 미허용 사유/기업 정보를 노출하지 않음.
  source: FR3.1; FR14.1; AC3.3.3
- id: BR6.4
  statement: U1은 실제 등록되지 않은 업무 기능의 가능/완료를 주장하지 않는다.
  category: policy
  applies_to:
  - BindingManifest
  - 최소 UI
  - 미확인 원본 읽기
  trigger: 호스트 구성/worker/조회
  logic: IF 계약/대금/HW/SW/후속 공급자 미등록 THEN 미등록/UNKNOWN과 남은 담당 소유자를 반환하고 해당 확정/부작용 작업을 실행하지 않는다. 등록된 최소 신원/기업/상품/주문/통지·읽기 경로는 실제 실행한다.
  violation_behaviour: 후속 패키지의 숨은import·고정성공·가짜 출고/발급·외부 제공자 성공 금지.
  source: FR6.2; FR14.1; unit-of-work U1
- id: BR7.1
  statement: 성공 접수는 요청·필요 원본/이력·작업/사실의 지속 커밋 확인 뒤 반환한다.
  category: constraint
  applies_to:
  - RequestReceipt
  - 각 원본
  - WorkItem
  - FactEnvelope
  trigger: 업무 변경/접수
  logic: IF 해당 논리 원자 경계가 확정 커밋됨 THEN ACCEPTED/RESULT_RECORDED 등 정확한 접수 상태를 반환한다. 커밋 실패/불명에는 성공 접수로 응답하지 않는다. 재시작 후 원래 ID로 저장 결과를 대조한다.
  violation_behaviour: 5xx/불명 접수 안내와 같은 ID 재확인; 메모리 응답만으로 성공 표시 금지.
  source: FR15.1; FR15.4; NFR4; NFR5; AC1.1.1; AC1.2.1
- id: BR7.2
  statement: 같은 원래 요청의 반복은 현재 권한으로 이전 결과를 반환하며 효과를 추가하지 않는다.
  category: constraint
  applies_to:
  - RequestReceipt
  - 원본 command
  trigger: 동일 키 재전송/응답 유실 후 재확인
  logic: IF principal/audience/operation/대상/키와 정규 입력이 동일 THEN 이전 접수·결과를 현재 권한으로 투영한다. 키는같고내용이다르면409; 같은내용의정당한새요청은새키로구별한다.
  violation_behaviour: 다른 내용 덮어쓰기·중복 신청/주문/권한 효과 금지. 권한 회수 후 성공 접수 재조회도 현재 접근을 면제하지 않음.
  source: FR15.1; FR15.3; C00/G06
- id: BR7.3
  statement: 기존 원본의 변경은 expectedRevision과 현재 개정을 대조한다.
  category: constraint
  applies_to:
  - 각 원본
  - OwnerHistoryEntry
  trigger: 수정/승인/작업 적용
  logic: IF 신규 생성이면 expectedRevision=NULL, 기존 대상 변경이면 해당 대상의 현재 개정 필요. 커밋 경합 시 기존 결과를 덮어쓰지 않고 재조회/재판단한다.
  violation_behaviour: 오래된/충돌 개정409; 생성과 수정 대상 불일치400/422.
  source: FR15.3; FR15.4; C00/G06
- id: BR7.4
  statement: 작업/사실의 반복 전달은 소비자별 처리 표지와 실제 효과를 원자적으로 기록해 중복 효과를 막는다.
  category: constraint
  applies_to:
  - WorkItem
  - FactEnvelope
  - ConsumerProcessingMark
  trigger: worker 전달/소비/재시작
  logic: IF 해당 소비자의 deliveryId가이미커밋됨 THEN 기존효과를대조하고다시반영하지않는다. 그렇지않으면권한/대상/버전확인뒤 효과+다음작업/사실+표지를같은커밋으로기록한다.
  violation_behaviour: 중간 장애로 효과 없이 처리 완료 표지만 남기거나 효과만 남기는 분리를 금지. 역순은 원본/정정 관계 대조로 연결.
  source: FR15.1; FR15.3; NFR5; C18
- id: BR7.5
  statement: 자동 재시도는 안전한 일시 기술 실패에만 제한하며 불명 외부 결과는 대조한다.
  category: policy
  applies_to:
  - WorkItem
  - DeliveryAttempt
  trigger: 기술 실패/timeout
  logic: IF 재실행의 중복 효과 방지가 검증되고 일시 기술 실패이며 횟수/기한 정책 안 THEN 같은업무ID로시도한다. 외부효과불명·입력/권한/충돌/기한만료는무조건재전송하지않는다.
  violation_behaviour: 원래 결과 재확인 또는 직원 조치 필요로 남김; 실제 값/제공자/재시도 한도는FD-OQ6에서 코드 전 확인.
  source: FR15.1; FR15.2; FR15.3; C00/G09
- id: BR7.6
  statement: 주요 변경/승인/정정의 원래 행위자·시각·사유·전후/근거·접수/결과를 보존한다.
  category: constraint
  applies_to:
  - 각 업무의 OwnerHistoryEntry
  trigger: 지속 변경/정정
  logic: IF 상태/정책/권한/조건 변경 THEN 해당 소유자의 이력과 원본 결과를 같은커밋으로연결한다. 정정은correctionOf와전후참조를남긴다.
  violation_behaviour: 일반업무권한으로과거이력덮어쓰기금지; 민감비밀은이력에복제하지않음. 보관/삭제정책은FD-OQ5 별도.
  source: FR15.4; NFR5
- id: BR8.1
  statement: 통지 수신/열람과 결과 조합 조회는 현재 대상/행위 권한에 맞춰 최소 투영한다.
  category: authorization
  applies_to:
  - NotificationIntent
  - InquiryView
  - 진단/이력
  trigger: 생성/전송/열람/조합 조회
  logic: IF 현재 수신/조회 권한이 허용하는 section/대상 THEN 그 원본의 확인 상태·시점과 최소 안내/로그인 링크를 표시한다. 금융/SW 등 미허용 section은 아예 제외한다.
  violation_behaviour: 키·계약 상세 이메일 누출·권한 없는 section/count 노출 금지; 링크도 현재 권한 확인.
  source: FR14.1; FR14.2; FR14.3; NFR1
- id: BR8.2
  statement: 통지의 발송 요청·실제 전달·열람·업무 결과는 서로 다른 사실이다.
  category: constraint
  applies_to:
  - DeliveryAttempt
  - NoticeReadReceipt
  trigger: 발송/수신/열람
  logic: IF 제공자 수락만 확인됨 THEN 해당 수락 근거만 기록한다. 실제 전달/열람은 해당 검증 결과로만표시하고 동의/지급/제공을 대신하지않는다. 미등록제공자는UNKNOWN/UNAVAILABLE이다.
  violation_behaviour: 가짜전달완료·열람기반계약동의·중복업무효과금지; 실패는 원래통지에 연결해확인한다.
  source: FR14.2; FR14.3; FR15.1
- id: BR8.3
  statement: 최소 UI는 PC·한국어·허용된 행동·입력/결과 구별과 접근성 조건을 유지한다.
  category: policy
  applies_to:
  - CustomerUi
  - StaffUi
  trigger: 화면 이동/제출/상태 갱신
  logic: IF 업무 화면을 제공 THEN 고객/직원PC1280 CSS px 이상, 한국어/KRW/한국시각을 기본으로 적용하고 상태/오류를키보드/라벨/초점과색상외문구로표현한다. 직원망통제는서버/네트워크에서검증한다.
  violation_behaviour: MFA/권한/확인대기를화면폭이나UI버튼숨김으로대체하지않음. 고객모바일미정/직원모바일제외·WCAG2.2AA는실제검증목표.
  source: NFR1; NFR12; refined-mockups Q5
- id: BR8.4
  statement: 진단/접수·결과 대조는 읽기 증거이며 거래 원본 쓰기 권위를 갖지 않는다.
  category: policy
  applies_to:
  - C19 진단
  - WorkInquiry
  trigger: 재시작/보존 대조
  logic: IF 원래 접수/원본/사실/대기작업을 대조 THEN 실제 확인한 범위/시점/제한을 기록하고 각 소유자의 권한으로 최소 조회한다. 일부증거누락을COMPLETE로표시하지않는다.
  violation_behaviour: 진단프로그램이자동으로주문/청구/발급원본을고치지않음; 손상/오삭제는실제복구시험과해당소유자정정절차필요.
  source: NFR4; NFR5; FR15.4; C19
- id: BR3.8
  statement: 고객 역할은 허용된 고객 행위와 같은 기업 원본의 명시적 범위만 저장·부여한다.
  category: validation
  applies_to:
  - CustomerRole
  - ActionScope
  - CustomerRoleGrant
  trigger: defineCustomerRole/grantCustomerRole
  logic: IF role.manage 및 부여/수신 소속·역할·조직 원본의 기업 관계와 현재 개정이 확인되고 15개 CustomerAction 및 scope kind별 참조/정확한 NULL 선택 조건을 만족 THEN 역할/부여·이력을 기록한다. 내부
    직원/SYSTEM 전용 행위·다른 기업 참조는 저장하지 않는다.
  violation_behaviour: 허용 목록 밖 행위/잘못된 범위는400/422, 미부여/타기업 변경은403 또는 비노출404, 개정 경합409. 다른 역할/행위의 넓은 범위를 가져와 보충하지 않음.
  source: FR2.1; FR2.2; FR2.3; FR2.4; AC1.4.3
```

## Rules Summary

YAML을 그대로 파생한 요약이다.

| Rule | Category | Statement |
|---|---|---|
| BR1.1 | validation | 기업 이용 신청의 확인 필드와 신청자 문맥을 지속 기록한다. |
| BR1.2 | authorization | 미승인/이용 중지 기업의 주문을 접수하지 않는다. |
| BR1.3 | authorization | 다른 기업의 신청·접수·주문 식별자로 내용이나 존재를 노출하지 않는다. |
| BR2.1 | validation | 기업 승인은 정해진 검증 정책의 근거·현재 대상 개정과 직원 확인 권한을 필요로 한다. |
| BR2.2 | authorization | 최초 관리자는 지정 권한이 있는 직원이 확인된 계정·기업 관계를 대조해 지정한다. |
| BR2.3 | authorization | 관리자 지정·기업 승인과 개별 주문/대금/SW 권한을 자동 결합하지 않는다. |
| BR2.4 | authorization | 모든 업무 접점에 MFA·활성 주체·audience와 직원망을 검증한다. |
| BR3.1 | policy | 조직 기준 사용 여부는 고객사 관리자가 명시하며 기본은 UNSET이다. |
| BR3.2 | validation | 신규 주문 문맥은 같은 기업의 현재 유효 정책·조직과 제출 범위를 만족해야 한다. |
| BR3.3 | constraint | 접수한 주문 조직은 요청자의 이후 소속/조직 정책 변경으로 바꾸지 않는다. |
| BR3.4 | authorization | 행위별 완성된 범위만 합집합으로 평가한다. |
| BR3.5 | policy | 폐지 조직 식별자와 기존 접근 범위를 보존하되 신규 주문 대상은 활성 조직만 허용한다. |
| BR3.6 | constraint | 권한/조직/대상 버전을 응답 투영과 변경 커밋의 효력 시점까지 확인한다. |
| BR3.7 | policy | 관리자 0명 상태를 경고·기록하며 다른 사용자의 업무를 자동 중지하지 않는다. |
| BR4.1 | authorization | 판매 상품은 해당 등록 권한을 가진 내부 직원만 등록한다. |
| BR4.2 | policy | 기업 적용 가격·공개 예외가 미확인이면 공통 값을 확정 예외 결과로 가장하지 않는다. |
| BR4.3 | constraint | 제출 시 제시된 가격·판매/계약 개정·요청 조건을 원래 스냅샷으로 보존한다. |
| BR5.1 | validation | HW/SW는 별도 주문이고 같은 타입의 다품목·양수 수량만 접수한다. |
| BR5.2 | policy | FULL이 기본이며 PARTIAL은 실제 확인된 동의와 해당 조건을 필요로 한다. |
| BR6.1 | policy | 미확인·특례·충돌·기술 실패를 품목/조건별 사유로 구별해 전체 검토 대기로 기록한다. |
| BR6.2 | constraint | 일부 품목의 확인으로 주문 일부를 자동 판매 확정하지 않는다. |
| BR6.3 | authorization | 직원의 확인 대기 사유 조회도 현재 해당 판단 정보 권한을 요구한다. |
| BR6.4 | policy | U1은 실제 등록되지 않은 업무 기능의 가능/완료를 주장하지 않는다. |
| BR7.1 | constraint | 성공 접수는 요청·필요 원본/이력·작업/사실의 지속 커밋 확인 뒤 반환한다. |
| BR7.2 | constraint | 같은 원래 요청의 반복은 현재 권한으로 이전 결과를 반환하며 효과를 추가하지 않는다. |
| BR7.3 | constraint | 기존 원본의 변경은 expectedRevision과 현재 개정을 대조한다. |
| BR7.4 | constraint | 작업/사실의 반복 전달은 소비자별 처리 표지와 실제 효과를 원자적으로 기록해 중복 효과를 막는다. |
| BR7.5 | policy | 자동 재시도는 안전한 일시 기술 실패에만 제한하며 불명 외부 결과는 대조한다. |
| BR7.6 | constraint | 주요 변경/승인/정정의 원래 행위자·시각·사유·전후/근거·접수/결과를 보존한다. |
| BR8.1 | authorization | 통지 수신/열람과 결과 조합 조회는 현재 대상/행위 권한에 맞춰 최소 투영한다. |
| BR8.2 | constraint | 통지의 발송 요청·실제 전달·열람·업무 결과는 서로 다른 사실이다. |
| BR8.3 | policy | 최소 UI는 PC·한국어·허용된 행동·입력/결과 구별과 접근성 조건을 유지한다. |
| BR8.4 | policy | 진단/접수·결과 대조는 읽기 증거이며 거래 원본 쓰기 권위를 갖지 않는다. |
| BR3.8 | validation | 고객 역할은 허용된 고객 행위와 같은 기업 원본의 명시적 범위만 저장·부여한다. |

## 적용·검증 경계

- 외부 호출·입력형식이 통과해도 현재 기업/행위/대상/버전·근거를 다시 확인한다. 신원 주체·UI가 전달한 권한을 신뢰하지 않는다. 보호 대상의 존재/권한이 미확인이면 허용으로 처리하지 않는다.
- BR3.1–BR3.6은 Order 원본의 고정 문맥과 현재 권한을 분리한다. DEPARTMENT_SITE·범위 합집합·명시적 NULL·폐지 조직 처리의 정밀 판정은 functional-spec.md의 범위 표와 동시 변경 절차를 적용한다.
- 성공 접수/재전송·worker 원자 처리의 물리적 보존·장애 범위와 실제 시간/횟수는 후속 NFR/Infrastructure에서 확인하고 코드/실증으로 검증한다. 문서의 규칙은 운영 달성 사실이 아니다.
- traceability.json은 U1 주 책임 3개 스토리의 9개 AC와 함께 공통/협력 대조 범위 52개 AC를 명시한다. 직접 기능 설계로 연결한 OK와 전체 소유 단위/후속 검증이 필요한 Deferred를 구분한다. OK는 기능 설계 규칙 연결이며 구현/AC 시험 통과가 아니다. 직접 배정 AC가 없는 규칙은 reverse의 N/A에서 U1 보조/교차 검증 책임과 FR/NFR 근거를 명시한다.

## Assumptions & Open Questions

확인되지 않은 실제 정책/제공자·입력/보관/세션·재시도 수치와 가격/기간 계산은 functional-spec.md의 FD-OQ1–FD-OQ6으로 유지한다. 각 코드를 작성하기 전에 필요한 정책을 확인하고 실제 자료/계정/연동을 사용하는 조건은 별도로 검증한다.

## Sources

- S1: [unit-of-work.md](../../../inception/units-generation/unit-of-work.md) — U1 범위·컴포넌트와 배포 역할.
- S2: [unit-of-work-story-map.md](../../../inception/units-generation/unit-of-work-story-map.md) — 주 책임/협력·원본 소유·이전 보완 의견.
- S3: [requirements.md](../../../inception/requirements-analysis/requirements.md) — FR1–FR6·FR14–FR16와 NFR1·NFR4–NFR5·NFR12, OQ1–OQ10.
- S4: [components.md](../../../inception/domain-design/components.md) — 신원/기업/상품/주문/조회/통지의 단일 소유자.
- S5: [contract-summary.md](../../../inception/contract-design/contract-summary.md) — C00–C03·C05·C10–C11·C13–C21·C25, G01–G23. 아래 CE01–CE04는 이 문서에 아직 없는 추가 경계 정의다.
- S6: [stories.md](../../../inception/user-stories/stories.md) — US1.1·US1.2·US3.3의 실제 9개 AC.
- S7: [functional-design-questions.md](functional-design-questions.md) — Q1·Q2 사용자 A 답변과 정확한 Looks correct 및 기록된 작성 권한.
- S8: [bolt-plan.md](../../../inception/delivery-planning/bolt-plan.md) — B01 시연·완료·보존·회사 경계 확인.
