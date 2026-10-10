# U2 신원·복구·기업 접근 규칙

## 범위와 출처

원본은 IdentityRecovery/EnterpriseAccess가 소유한다. [requirements.md](../../../inception/requirements-analysis/requirements.md)의 FR1/FR2/FR3/FR16과 변경·접수 보호 조건, [components.md](../../../inception/domain-design/components.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md), [단위 정의](../../../inception/units-generation/unit-of-work.md), [스토리 할당](../../../inception/units-generation/unit-of-work-story-map.md), [확인 답변](functional-design-questions.md)을 적용한다. U1의 현재 권한/원래 문맥은 [U1 기능 명세](../../u1-integrated-foundation/functional-design/functional-spec.md)와 [U1 보안 설계](../../u1-integrated-foundation/nfr-design/security-design.md)의 연결 조건을 유지한다.

## 규칙 원본 — YAML

```yaml
schema_version: 1
unit: u2-identity-enterprise-access
rules:
- id: BR1.1
  statement: "안정 계정·audience·등록된 외부 연결·실제 MFA와 업무 권한을 분리한다."
  category: "authorization"
  applies_to: ["Account","ProviderBinding","MfaEnrollment","IdentitySession"]
  trigger: "사람의 로그인 또는 업무 접근"
  logic: "IF 현재 활성 계정/연결·올바른 audience/목적·실제 MFA가 확인됨 THEN 해당 목적만 허용하고 현재 행위/범위는 별도로 평가한다."
  violation_behaviour: "password만, 미완료 등록, provider token/group/이메일·클라이언트 주장만으로 업무 접근을 허용하지 않는다."
  source: ["FR16.1","FR2.4","FR3.1","NFR1"]
- id: BR1.2
  statement: "세션/권한 회수의 효력은 현재 판정과 실제 실행 시점에 재검증한다."
  category: "authorization"
  applies_to: ["IdentitySession","Account","CustomerRoleGrant","StaffRoleGrant"]
  trigger: "조회/변경 실행·결과 투영·회수"
  logic: "IF 세션 만료/회수 또는 계정·인증 연결/권한 개정이 현재 근거와 다름 THEN 재평가한다. 회수 효력 이후 새 실행/commit/민감 결과를 허용하지 않는다."
  violation_behaviour: "진행 요청을 자동 성공/삭제/권한 복원으로 바꾸지 않는다. 이미 완료한 원래 결과는 남기고 이후 실행은 소유자의 보류/거절에 연결한다."
  source: ["FR1.2","FR3.1","FR16.2","NFR1","NFR5"]
- id: BR1.3
  statement: "계정 식별자와 확인된 실제 사람의 연결을 구별한다."
  category: "validation"
  applies_to: ["VerifiedPersonLink"]
  trigger: "동일인 조회/변경"
  logic: "IF 인정된 신원 확인 정책·출처·대상·확인자/시점·현재성이 모두 확인됨 THEN CONFIRMED 연결을 제공한다. 미확인/충돌은 그대로 보존한다."
  violation_behaviour: "이메일/표시명 일치로 합치거나 서로 다른 계정이라는 이유로 서로 다른 사람을 확인하지 않는다."
  source: ["FR3.2","FR7.3","FR16.2","NFR1"]
- id: BR1.4
  statement: "직원은 사설 승인 접점과 현재 MFA·직원 행위 권한을 모두 충족한다."
  category: "authorization"
  applies_to: ["Account","IdentitySession","StaffRoleGrant"]
  trigger: "직원 로그인/등록/복구/조회/실행"
  logic: "IF 검증된 현재 직원 접점·STAFF 신원·목적/MFA·행위 권한이 모두 확인됨 THEN 허용한다. 각 조건은 서로 대체하지 않는다."
  violation_behaviour: "공개 고객 경로·고객 token·위조 header·BFF IP·화면 폭으로 우회하지 못한다. 단말 등록/인증서는 회사 IT/보안 책임이다."
  source: ["FR3.1","FR16.1","NFR1"]
- id: BR2.1
  statement: "기업·조직 정책과 원래 주문 문맥을 보존한다."
  category: "validation"
  applies_to: ["Enterprise","Department","BusinessSite","EnterpriseMembership","ActionScope"]
  trigger: "조직 변경/소속 변경/신규 및 과거 업무 접근"
  logic: "IF 신규 주문 THEN 승인 기업과 USED 축의 활성 조직 및 NOT_USED 명시 상태를 확인한다. 과거 주문 THEN 당시 원래 기업/조직/미사용 축을 현재 해당 행위 권한과 대조한다."
  violation_behaviour: "UNSET/다른 기업 참조는 거절한다. 조직 폐지·소속 이동이 주문 재배정이나 과거 권한 자동 이전을 만들지 않는다."
  source: ["FR1.2","FR2.1","FR2.3","FR5.2"]
- id: BR2.2
  statement: "소속의 생성·변경·활성 상태와 관리자 표지는 관리 행위로 명시한다."
  category: "authorization"
  applies_to: ["EnterpriseMembership"]
  trigger: "담당자 소속/활성/관리자 변경"
  logic: "IF 현재 자기 기업의 user.manage 범위와 대상 개정이 맞음 THEN 소속 변경을 기록하고 현재 권한 개정/이력을 갱신한다. 역할 변경은 role.manage를 별도 확인한다."
  violation_behaviour: "타 기업 소속·STAFF 신원/역할을 변경하지 않는다. 비활성 소속은 거래 권한을 행사하지 못하며 계정의 다른 합법 소속/과거 이력을 삭제하지 않는다."
  source: ["FR1.2","FR1.3","FR2.4"]
- id: BR2.3
  statement: "관리 동작의 대상과 전체 부여 내용은 현재 관리 범위 안에 있어야 한다."
  category: "authorization"
  applies_to: ["CustomerRole","CustomerRoleGrant","MembershipInvitation","EnterpriseMembership"]
  trigger: "정의/초대/소속 변경/역할 부여"
  logic: "IF 모든 대상·소속·역할 scope가 같은 기업 및 현재 해당 관리 행위 범위에 포함됨 THEN 적용한다. 기존/새 소속과 역할 전체 내용의 양쪽을 확인한다."
  violation_behaviour: "관리자 역할 수정/자기 부여로 자신의 관리 범위 밖 권한을 만들지 않는다. 여러 범위 중 일부만 유효하면 전체 변경을 거절한다."
  source: ["FR1.2","FR2.2","FR2.3","FR2.4"]
- id: BR2.4
  statement: "초대는 원래 기업·연락 경로·예정 소속/역할 개정에 고정한다."
  category: "constraint"
  applies_to: ["MembershipInvitation"]
  trigger: "초대 생성/회수/재발송"
  logic: "IF 현재 user.manage 및 포함된 역할 부여에 필요한 role.manage 범위가 확인됨 THEN PENDING 초대와 최소 통지 의무를 기록한다. 초대한 내용·대상 소속 개정·기한을 보존한다."
  violation_behaviour: "초대 전달을 수락/활성화로 처리하지 않는다. 새 전달이 과거 회수·기한·토큰 세대를 되살리지 않는다."
  source: ["FR1.2","FR2.2","FR14.2","NFR1"]
- id: BR2.5
  statement: "본인의 연락 경로 확인·인증·MFA와 현재 초대 조건 후 수락한다."
  category: "authorization"
  applies_to: ["MembershipInvitation","IdentitySession"]
  trigger: "초대 수락"
  logic: "IF 지정 연락 경로를 확인한 본인 계정의 실제 MFA와 유효한 PENDING 초대가 있고 현재 기업·조직/역할 개정·초대한 관리자의 관련 권한이 확인됨 THEN 수락을 진행한다. 기존 기업 소속이 없어도 초대 수락 전용 문맥을 사용한다."
  violation_behaviour: "별도 관리자 재승인은 요구하지 않는다. 만료/회수/권한 회수/관련 내용 변경·다른 대상이면 거절 또는 재확인/재초대를 요구한다. 다른 초대/기업 정보는 노출하지 않는다."
  source: ["FR1.2","FR16.1","NFR1"]
- id: BR2.6
  statement: "초대 수락·소속 활성화·명시적 역할 부여는 하나의 보호된 논리 변경이다."
  category: "constraint"
  applies_to: ["MembershipInvitation","EnterpriseMembership","CustomerRoleGrant","AccessHistory"]
  trigger: "초대 수락 commit/재시도/회수 경합"
  logic: "IF 현재 원본·대상 개정·권한을 commit에서도 재검증해 수락할 수 있음 THEN 초대 수락과 소속/역할·이력/접수 보호를 함께 확정한다."
  violation_behaviour: "중간 활성 소속/반쪽 역할을 남기거나 수락된 초대 재실행으로 회수된 권한을 재부여하지 않는다. 같은 요청/입력은 원래 결과로 대조하고 다른 입력은 충돌로 거절한다."
  source: ["FR1.2","FR2.4","FR15.1","NFR3","NFR5"]
- id: BR3.1
  statement: "고객 역할은 계약에 등록된 15개 고객 행위를 각각 선택한다."
  category: "validation"
  applies_to: ["CustomerRole","ActionScope"]
  trigger: "역할 정의/개정"
  logic: "IF 모든 행위가 고객 허용 목록이며 각 scope가 유효함 THEN 역할로 저장한다. 빈 목록은 허용 권한 없음이다."
  violation_behaviour: "고정 세 역할을 강제하거나 조회/신청/실행/승인을 자동 묶지 않는다. 직원/SYSTEM 전용·미등록 행위/타 기업은 거절한다."
  source: ["FR2.2","FR2.4"]
- id: BR3.2
  statement: "역할 구성의 변경은 새 개정과 현재 유효 grant의 재평가를 만든다."
  category: "policy"
  applies_to: ["CustomerRole","StaffRole","CustomerRoleGrant","StaffRoleGrant"]
  trigger: "역할 개정/비활성화"
  logic: "IF 현재 역할 관리 권한·예상 역할 개정과 전체 새 구성이 유효함 THEN 새 개정/이력을 남기고 영향을 받는 소속/직원의 권한 개정을 함께 갱신한다."
  violation_behaviour: "변경 전 목록·캐시·초대 snapshot으로 새 권한을 자동 적용하지 않는다. 실효 grant는 현재 역할 개정을 쓰며 과거 결정 이력은 이전 개정을 보존한다."
  source: ["FR2.2","FR3.1","FR15.4","NFR1"]
- id: BR3.3
  statement: "관리 권한은 허용된 역할의 별도 부여 권한이며 업무 수행권과 구별한다."
  category: "authorization"
  applies_to: ["CustomerRoleGrant","StaffRoleGrant"]
  trigger: "타인 또는 자신에게 역할 부여"
  logic: "IF 현재 role.manage 또는 staff.role.manage와 허용 행위/대상 범위가 확인됨 THEN 직접 업무 권한이 없어도 명시적으로 역할을 부여하고 이력을 남긴다."
  violation_behaviour: "관리 권한만으로 업무를 실행하지 않는다. 자기 부여도 관리 범위 밖 권한·직원 전용/타 기업·SYSTEM 권한을 만들지 못한다."
  source: ["FR2.2","FR2.4","FR3.1"]
- id: BR3.4
  statement: "범위는 한 행위의 완성된 술어만 합집합한다."
  category: "calculation"
  applies_to: ["ActionScope","CustomerRoleGrant"]
  trigger: "행위 범위 평가"
  logic: "IF 요청 행위와 같은 행위의 유효 grant scope 중 하나가 원래 대상에 참임 THEN 해당 행위 범위 조건만 충족한다. DEPARTMENT_SITE는 부서/사업장 한 쌍, SITE_ALL_DEPARTMENTS는 한 사업장, DEPARTMENT_ALL_SITES는 한 부서, ENTERPRISE_ALL은 한 기업에 한정한다."
  violation_behaviour: "다른 행위/기업의 넓은 권한·쌍 사이의 곱집합·빈 배열/누락 wildcard로 확대하지 않는다. 미사용 축은 명시 정책과 닫힌 표현을 대조한다."
  source: ["FR2.1","FR2.2","FR2.3"]
- id: BR3.5
  statement: "조회·결과·이력·통지는 필요한 행위/원본 범위로 최소 투영한다."
  category: "authorization"
  applies_to: ["ActionScope","AccessHistory","IdentityHistory"]
  trigger: "읽기/목록/오류/통지"
  logic: "IF 해당 정보의 현재 조회 행위와 원래 기업/조직 범위를 충족함 THEN 허용 필드만 반환한다. 역할/사용자 관리 읽기는 거래 전체 읽기가 아니다."
  violation_behaviour: "목록 건수/대상 존재·내부 근거/금액/발급 값·오류/캐시·다른 기업 자료를 우회 노출하지 않는다. 통지 생성/전달이 업무 권한을 생성하지 않는다."
  source: ["FR2.4","FR14.1","FR14.3","NFR1"]
- id: BR3.6
  statement: "grant 회수/소속 비활성화와 실행 경합은 원본 개정으로 판정한다."
  category: "constraint"
  applies_to: ["CustomerRoleGrant","StaffRoleGrant","EnterpriseMembership"]
  trigger: "회수·접근·진행 요청의 실행/commit"
  logic: "IF 회수 변경이 먼저 유효해졌음 THEN 이후 해당 근거를 쓰는 실행/commit을 거절 또는 원래 작업의 확인 보류로 둔다. 실행이 먼저 확정된 경우 원래 결과/이력을 보존한다."
  violation_behaviour: "다른 유효 역할의 같은 행위 권한까지 자동 삭제하지 않는다. 회수 후 재시도/재조회로 이전 grant를 되살리지 않는다."
  source: ["FR1.2","FR3.1","FR15.1","NFR1","NFR5"]
- id: BR4.1
  statement: "직원 역할은 현재 등록된 직원 행위에만 별도로 부여한다."
  category: "authorization"
  applies_to: ["StaffRole","StaffRoleGrant"]
  trigger: "직원 역할 정의/부여/회수"
  logic: "IF STAFF 신원·MFA/승인 접점·staff.role.manage가 있고 대상 STAFF 및 등록된 직원 행위가 확인됨 THEN 명시적으로 부여/회수한다. 복수 역할은 같은 직원 행위만 합친다."
  violation_behaviour: "고객 관리자가 직원 역할을 관리하거나 직원 신분만으로 모든 업무/증거를 열지 못한다. 최초 신원 생성은 초기 업무 권한의 단독 근거가 아니다."
  source: ["FR3.1","FR2.4","FR16.1"]
- id: BR4.2
  statement: "계약 승인은 실제 다른 사람이며 SW 기간 승인 정책과 구별한다."
  category: "authorization"
  applies_to: ["VerifiedPersonLink","StaffRoleGrant"]
  trigger: "계약 등록/승인 또는 SW 기간 업무의 신원 근거 조회"
  logic: "IF 계약 등록자/승인자의 유효한 확인 사람 연결이 다름 THEN 계약 소유자가 별도 승인 조건을 평가한다. 같거나 관계 미확인이면 자기 승인/미확인으로 거절한다."
  violation_behaviour: "역할 합산/다른 계정/자기 부여로 동일인 계약 승인을 우회하지 못한다. SW 기간의 같은 사람 두 권한·별도 승인 허용은 해당 소유자가 평가한다."
  source: ["FR3.2","FR3.3","FR7.3"]
- id: BR5.1
  statement: "사전 복구는 유효한 password와 미사용 코드를 원자적으로 검증한다."
  category: "authorization"
  applies_to: ["RecoveryCodeSet","RecoveryCode","RecoveryCase"]
  trigger: "직접 복구 검증"
  logic: "IF password와 현재 발급 집합/계정·인증 연결 세대의 미사용 코드가 유효함 THEN 한 원래 RecoveryCase의 재등록 허가로 한 번 소비한다."
  violation_behaviour: "사용/재발급/회수/무효 연결의 코드는 거절한다. 정기 만료는 없고 코드 원문 재조회/메일 전달·무한 시도는 금지한다."
  source: ["FR16.2","NFR1","NFR5"]
- id: BR5.2
  statement: "복구 검증은 재등록 목적만 허용하고 권한을 상승시키지 않는다."
  category: "authorization"
  applies_to: ["RecoveryCase","IdentitySession"]
  trigger: "직접/담당자 복구 검증 후"
  logic: "IF 인정된 복구 근거가 확인됨 THEN 해당 계정·원래 연결·기한에 한정한 ENROLMENT_ONLY 상태를 제공한다."
  violation_behaviour: "password/코드/이메일/복구 완료 주장만으로 BUSINESS 세션·기업 관리자/직원 업무 권한을 부여하거나 영구 MFA 해제하지 않는다."
  source: ["FR16.2","FR2.4","NFR1"]
- id: BR5.3
  statement: "담당자 복구는 현재 복구 행위 권한과 확인된 대상 신원 근거가 필요하다."
  category: "authorization"
  applies_to: ["RecoveryVerification","RecoveryCase"]
  trigger: "staffVerifyRecovery"
  logic: "IF 현재 직원 MFA/접점·identity.recovery.verify 권한과 대상 계정/인증 연결·복구 목적에 맞는 인정된 확인 정책/출처·권위/시점의 근거가 있음 THEN 확인 결정을 남기고 제한 재등록을 허용한다."
  violation_behaviour: "근거 Ref 개수·이메일 일치·기업관리자 요청만으로 신원 확인/직원 복구 권한을 인정하지 않는다. 부족/충돌은 보류/거절하고 상세 증거를 무권한 사용자에게 노출하지 않는다."
  source: ["FR16.2","FR3.1","NFR1"]
- id: BR5.4
  statement: "외부 수단 변경의 미확인 실행은 같은 원본으로 대조한다."
  category: "constraint"
  applies_to: ["RecoveryCase","ProviderBinding","MfaEnrollment"]
  trigger: "수단 제거/재등록·늦은 결과·재시도"
  logic: "IF 옛 연결의 수단 제거가 종료/격리됐다는 실제 근거가 있음 THEN 새 수단 검증을 진행한다. 결과 불명 또는 늦은 옛 작업이 새 수단을 손상할 수 있으면 HOLD로 유지한다."
  violation_behaviour: "기한/실행 ID를 새로 만들어 불명 효과를 반복하지 않는다. 새 독립 외부 연결은 제공자 지원·동일인/원래 계정·안전한 전환 근거를 검증한 경우만 사용한다."
  source: ["FR16.2","FR15.1","FR15.3","NFR1","NFR5"]
- id: BR5.5
  statement: "복구 완료는 새 MFA·옛 수단/세션 무효화·새 코드 보관 확인·보호 이력/통지 의무로 판정한다."
  category: "constraint"
  applies_to: ["RecoveryCase","MfaEnrollment","RecoveryCodeSet","IdentityHistory"]
  trigger: "복구 완료 commit"
  logic: "IF 새 실제 MFA 및 이전 수단/코드/세션 무효화와 현재 연결/계정 세대·필수 새 코드 보관 확인이 충족되고 이력/접수 보호·E01 통지 의무가 지속 기록됨 THEN COMPLETED를 기록한다."
  violation_behaviour: "외부 변경 요청/통지 발송 수락을 실제 변경/당사자 전달 완료로 표시하지 않는다. 일반 접근 재개는 새 세션과 현재 기업/행위/범위를 다시 확인한다."
  source: ["FR16.2","FR14.2","FR15.4","NFR1","NFR3"]
- id: BR5.6
  statement: "담당자도 접근 불가하면 보호된 비공개 절차로 담당자 접근부터 복원한다."
  category: "policy"
  applies_to: ["EmergencyRecoveryCase","RecoveryCase"]
  trigger: "담당자 접근 불가·사전 수단 없음"
  logic: "IF 별도 운영 권위와 대상 신원·원래 연결·확인 정책·작업 사유/근거·원래 권한이 검증됨 THEN 비공개 절차로 담당자의 제한 재등록을 진행하고 새 MFA/이력을 확인한 뒤 일반 복구를 재개한다."
  violation_behaviour: "실제 권위/자격/지원/증거 미확인은 HOLD/실행 불가다. 공개 우회 endpoint·상시 공유 관리자·새 업무 권한·영구 MFA 해제를 만들지 않는다."
  source: ["FR16.2","FR3.1","NFR1","NFR9"]
- id: BR6.1
  statement: "마지막 지정 관리자 부재를 허용하고 경고·기록한다."
  category: "policy"
  applies_to: ["EnterpriseMembership","CustomerRoleGrant","AccessHistory"]
  trigger: "관리자 표지 회수·소속/계정 비활성화·관리 grant 변경"
  logic: "IF 같은 기업의 현재 변경 결과 지정된 활성 관리자 수가 0임 THEN 관리자 부재 경고/이력을 남기며 변경을 허용한다. 실효 관리 권한 부재도 별도로 표시한다."
  violation_behaviour: "최소 인원수만으로 변경을 차단하거나 기업 이용 중지·다른 담당자 권한 회수를 자동 발생시키지 않는다. 동시 회수 후 실제 결과를 다시 계산한다."
  source: ["FR1.3","FR1.2"]
- id: BR6.2
  statement: "관리자 재지정은 확인된 기업 위임·대상 신원과 별도 직원 권한으로 한다."
  category: "authorization"
  applies_to: ["AdministratorRestoration","EnterpriseMembership","CustomerRoleGrant"]
  trigger: "restoreAdministrator"
  logic: "IF 현재 직원 enterprise.administrator.restore 권한·MFA/접점과 해당 기업/대상자의 관리 위임 근거/개정이 확인됨 THEN 명시한 자기 기업 관리 역할·관리자 표지 및 이력을 보호된 변경으로 적용한다."
  violation_behaviour: "근거 미확인·타 기업/STAFF 대상·원래 개정 충돌은 적용하지 않는다. 거래 권한을 자동 추가하거나 기업 승인/최초 지정과 같은 행위로 몰래 합치지 않는다."
  source: ["FR1.3","FR1.2","FR2.4"]
- id: BR7.1
  statement: "모든 성공 변경은 원래 접수/입력·개정·결과·보호 기록으로 대조한다."
  category: "constraint"
  applies_to: ["RecoveryCase","MembershipInvitation","CustomerRoleGrant","StaffRoleGrant","AccessHistory"]
  trigger: "명령 접수/commit/재시도/복구"
  logic: "IF 같은 요청/원래 입력/대상/개정으로 이미 보호된 결과가 있음 THEN 현재 허용된 범위에서 원래 결과를 대조한다. 새 변경은 원본·이력·통지 의무와 보호 조건을 충족해야 성공 접수로 응답한다."
  violation_behaviour: "중복 효과·반쪽 보안 상태·미보호 성공 ACK·복구 후 회수 권한 부활을 금지한다. 기한 초과 작업과 원래 근거는 보존한다."
  source: ["FR15.1","FR15.4","NFR3","NFR4","NFR5"]
- id: BR7.2
  statement: "변경/확인/거절 이력은 최소 정보와 정정 연결을 보존한다."
  category: "policy"
  applies_to: ["IdentityHistory","AccessHistory"]
  trigger: "기록/조회/정정/통지"
  logic: "IF 원래 작업/행위자·대상/전후 개정·사유/근거·시점/실제 결과가 있음 THEN append-only 이력을 남긴다. 확인되지 않은 값은 미확인 상태를 유지한다."
  violation_behaviour: "비밀번호/TOTP/복구 코드/초대 token·provider token 원문을 이력/Outbox/통지에 넣지 않는다. 업무 이력과 관측 로그의 보관/파기는 실제 정책과 대조한다."
  source: ["FR15.4","FR14.3","FR16.2","NFR11"]
- id: BR7.3
  statement: "닫힌 원래 계약과 필요한 U2 확장을 구별한다."
  category: "validation"
  applies_to: ["IdentitySession","MembershipInvitation","CustomerRole","RecoveryCase"]
  trigger: "등록/전송/메시지 소비/계약 전환"
  logic: "IF operation·목적/target·payload/version과 실제 지원이 등록·검증됨 THEN 그 버전으로 수행한다. 새 수락/읽기/회수/비상 절차는 별도 계약으로 정의한다."
  violation_behaviour: "기존 additionalProperties:false/enum에 새 필드/목적을 밀어 넣거나 미등록 제공자/작업을 실제 가능으로 표시하지 않는다."
  source: ["FR15.3","FR16.2","NFR13"]
- id: BR7.4
  statement: "U2는 업무 원본과 PC UI가 따를 결과·행동 경계를 제공한다."
  category: "policy"
  applies_to: ["MembershipInvitation","RecoveryCase","AccessHistory"]
  trigger: "고객/직원 화면 입력·상태/결과 투영"
  logic: "IF 해당 목적/현재 권한에 맞는 결과가 있음 THEN 요청 접수/본인 확인/수락/실제 적용/통지 상태와 남은 조치를 구별해 제공한다. PC1280 이상·한국어 UI는 U8/U9가 연결한다."
  violation_behaviour: "모바일 제공이나 화면 폭을 보안 증거로 가정하지 않는다. 문서/합성 시험을 전체 UI·실운영 수락 통과로 표시하지 않는다."
  source: ["FR1.2","FR14.1","FR16.2","NFR1"]
- id: BR7.5
  statement: "업무 원본과 외부 관측·통지의 권위를 분리한다."
  category: "constraint"
  applies_to: ["RecoveryCase","IdentityHistory","AccessHistory"]
  trigger: "C21 결과·E01 소비/늦은/역순 결과"
  logic: "IF 원래 작업/계정·연결 세대·효과·출처·시점/개정이 일치하고 실제 결과가 검증됨 THEN 해당 사실만 기록하고 필요한 새 의무만 발행한다."
  violation_behaviour: "발송 수락/캐시/역순 메시지로 현재 권한/신원·복구 완료를 덮어쓰지 않는다. 연동이 미등록/미확인이면 UNCONFIRMED/HOLD이며 거래 소유자의 결과를 생성하지 않는다."
  source: ["FR15.1","FR15.2","FR15.3","FR14.2","FR16.2"]
```

## 규칙 요약 — 파생 뷰

| 규칙 | 의미 | 적용 대상 |
|---|---|---|
| BR1.1 | 안정 계정·audience·등록된 외부 연결·실제 MFA와 업무 권한을 분리한다. | Account, ProviderBinding, MfaEnrollment, IdentitySession |
| BR1.2 | 세션/권한 회수의 효력은 현재 판정과 실제 실행 시점에 재검증한다. | IdentitySession, Account, CustomerRoleGrant, StaffRoleGrant |
| BR1.3 | 계정 식별자와 확인된 실제 사람의 연결을 구별한다. | VerifiedPersonLink |
| BR1.4 | 직원은 사설 승인 접점과 현재 MFA·직원 행위 권한을 모두 충족한다. | Account, IdentitySession, StaffRoleGrant |
| BR2.1 | 기업·조직 정책과 원래 주문 문맥을 보존한다. | Enterprise, Department, BusinessSite, EnterpriseMembership, ActionScope |
| BR2.2 | 소속의 생성·변경·활성 상태와 관리자 표지는 관리 행위로 명시한다. | EnterpriseMembership |
| BR2.3 | 관리 동작의 대상과 전체 부여 내용은 현재 관리 범위 안에 있어야 한다. | CustomerRole, CustomerRoleGrant, MembershipInvitation, EnterpriseMembership |
| BR2.4 | 초대는 원래 기업·연락 경로·예정 소속/역할 개정에 고정한다. | MembershipInvitation |
| BR2.5 | 본인의 연락 경로 확인·인증·MFA와 현재 초대 조건 후 수락한다. | MembershipInvitation, IdentitySession |
| BR2.6 | 초대 수락·소속 활성화·명시적 역할 부여는 하나의 보호된 논리 변경이다. | MembershipInvitation, EnterpriseMembership, CustomerRoleGrant, AccessHistory |
| BR3.1 | 고객 역할은 계약에 등록된 15개 고객 행위를 각각 선택한다. | CustomerRole, ActionScope |
| BR3.2 | 역할 구성의 변경은 새 개정과 현재 유효 grant의 재평가를 만든다. | CustomerRole, StaffRole, CustomerRoleGrant, StaffRoleGrant |
| BR3.3 | 관리 권한은 허용된 역할의 별도 부여 권한이며 업무 수행권과 구별한다. | CustomerRoleGrant, StaffRoleGrant |
| BR3.4 | 범위는 한 행위의 완성된 술어만 합집합한다. | ActionScope, CustomerRoleGrant |
| BR3.5 | 조회·결과·이력·통지는 필요한 행위/원본 범위로 최소 투영한다. | ActionScope, AccessHistory, IdentityHistory |
| BR3.6 | grant 회수/소속 비활성화와 실행 경합은 원본 개정으로 판정한다. | CustomerRoleGrant, StaffRoleGrant, EnterpriseMembership |
| BR4.1 | 직원 역할은 현재 등록된 직원 행위에만 별도로 부여한다. | StaffRole, StaffRoleGrant |
| BR4.2 | 계약 승인은 실제 다른 사람이며 SW 기간 승인 정책과 구별한다. | VerifiedPersonLink, StaffRoleGrant |
| BR5.1 | 사전 복구는 유효한 password와 미사용 코드를 원자적으로 검증한다. | RecoveryCodeSet, RecoveryCode, RecoveryCase |
| BR5.2 | 복구 검증은 재등록 목적만 허용하고 권한을 상승시키지 않는다. | RecoveryCase, IdentitySession |
| BR5.3 | 담당자 복구는 현재 복구 행위 권한과 확인된 대상 신원 근거가 필요하다. | RecoveryVerification, RecoveryCase |
| BR5.4 | 외부 수단 변경의 미확인 실행은 같은 원본으로 대조한다. | RecoveryCase, ProviderBinding, MfaEnrollment |
| BR5.5 | 복구 완료는 새 MFA·옛 수단/세션 무효화·새 코드 보관 확인·보호 이력/통지 의무로 판정한다. | RecoveryCase, MfaEnrollment, RecoveryCodeSet, IdentityHistory |
| BR5.6 | 담당자도 접근 불가하면 보호된 비공개 절차로 담당자 접근부터 복원한다. | EmergencyRecoveryCase, RecoveryCase |
| BR6.1 | 마지막 지정 관리자 부재를 허용하고 경고·기록한다. | EnterpriseMembership, CustomerRoleGrant, AccessHistory |
| BR6.2 | 관리자 재지정은 확인된 기업 위임·대상 신원과 별도 직원 권한으로 한다. | AdministratorRestoration, EnterpriseMembership, CustomerRoleGrant |
| BR7.1 | 모든 성공 변경은 원래 접수/입력·개정·결과·보호 기록으로 대조한다. | RecoveryCase, MembershipInvitation, CustomerRoleGrant, StaffRoleGrant, AccessHistory |
| BR7.2 | 변경/확인/거절 이력은 최소 정보와 정정 연결을 보존한다. | IdentityHistory, AccessHistory |
| BR7.3 | 닫힌 원래 계약과 필요한 U2 확장을 구별한다. | IdentitySession, MembershipInvitation, CustomerRole, RecoveryCase |
| BR7.4 | U2는 업무 원본과 PC UI가 따를 결과·행동 경계를 제공한다. | MembershipInvitation, RecoveryCase, AccessHistory |
| BR7.5 | 업무 원본과 외부 관측·통지의 권위를 분리한다. | RecoveryCase, IdentityHistory, AccessHistory |

## 해석 경계

위 YAML이 규칙의 원본이다. IF/THEN의 확인은 클라이언트 bool/문자열이나 증거 Ref 존재만으로 충족하지 않는다. 실제 출처·대상·목적·현재 개정/권위·유효 시점을 대조한다. 등록된 합성 profile은 합성 시험에만 쓰며 실제 계정/회사망/기업/위임 확인을 대체하지 않는다. BR3.3의 관리자 자기 부여 허용은 승인한 Q2이며 BR4.2의 동일인 계약 자기 승인 금지를 바꾸지 않는다.

